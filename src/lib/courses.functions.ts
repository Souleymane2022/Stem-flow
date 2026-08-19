import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CATEGORIES } from "@/lib/categories";

type Input = {
  playlistUrl: string;
  category: string;
  difficulty: string;
};

type PlaylistItem = {
  snippet?: {
    title?: string;
    description?: string;
    resourceId?: { videoId?: string };
    thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
  };
  contentDetails?: { videoId?: string };
};

/** Accepte une URL complète, une URL courte, ou l'identifiant seul. */
export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{12,}$/.test(trimmed) && !trimmed.includes("/")) return trimmed;
  const match = trimmed.match(/[?&]list=([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

/** « PT1H2M10S » -> 3730. Les durées de l'API YouTube sont au format ISO 8601. */
export function parseIsoDuration(value: string | undefined): number {
  if (!value) return 0;
  const m = value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const error = body["error"] as { message?: string } | undefined;
    throw new Error(error?.message ?? `YouTube a répondu ${response.status}`);
  }
  return body;
}

/**
 * Importe une playlist YouTube sous forme de cours.
 *
 * Les cours ne sont pas insérables depuis le navigateur : la table n'accorde
 * que SELECT à `authenticated`. L'écriture passe donc par cette fonction,
 * seule à disposer de la clé de service — la liste des leçons vient ainsi
 * toujours de YouTube, jamais d'un client.
 */
export const importYoutubePlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    const playlistId = extractPlaylistId(input?.playlistUrl ?? "");
    if (!playlistId) throw new Error("Lien de playlist YouTube invalide");
    const category = CATEGORIES.includes(input.category as (typeof CATEGORIES)[number])
      ? input.category
      : CATEGORIES[0];
    const difficulty = ["debutant", "intermediaire", "avance"].includes(input.difficulty)
      ? input.difficulty
      : "debutant";
    return { playlistId, category, difficulty };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env["YOUTUBE_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "Clé YOUTUBE_API_KEY manquante : ajoute-la dans les variables d'environnement.",
      );
    }

    const { data: existing } = await supabaseAdmin
      .from("courses")
      .select("id")
      .eq("youtube_playlist_id", data.playlistId)
      .maybeSingle();
    if (existing) return { ok: true, courseId: existing.id, imported: 0, alreadyExisted: true };

    // Titre et description de la playlist
    const meta = await fetchJson(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${data.playlistId}&key=${apiKey}`,
    );
    const playlist = (
      meta["items"] as { snippet?: { title?: string; description?: string } }[]
    )?.[0];
    if (!playlist) throw new Error("Playlist introuvable ou privée");

    // Les vidéos, paginées par 50.
    const items: PlaylistItem[] = [];
    let pageToken = "";
    for (let page = 0; page < 4; page += 1) {
      const body = await fetchJson(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails` +
          `&maxResults=50&playlistId=${data.playlistId}&key=${apiKey}` +
          (pageToken ? `&pageToken=${pageToken}` : ""),
      );
      items.push(...((body["items"] as PlaylistItem[]) ?? []));
      pageToken = (body["nextPageToken"] as string) ?? "";
      if (!pageToken) break;
    }

    const lessons = items
      .map((item) => ({
        videoId: item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? "",
        title: item.snippet?.title ?? "",
        description: item.snippet?.description ?? null,
      }))
      // Une vidéo supprimée ou privée reste dans la playlist sous ce titre.
      .filter((l) => l.videoId && l.title && !/^(Deleted|Private) video$/i.test(l.title));

    if (lessons.length < 2)
      throw new Error("Cette playlist ne contient pas assez de vidéos lisibles");

    // Durées réelles, nécessaires au calcul de progression.
    const durations = new Map<string, number>();
    for (let i = 0; i < lessons.length; i += 50) {
      const ids = lessons
        .slice(i, i + 50)
        .map((l) => l.videoId)
        .join(",");
      const body = await fetchJson(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${apiKey}`,
      );
      for (const v of (body["items"] as {
        id?: string;
        contentDetails?: { duration?: string };
      }[]) ?? []) {
        if (v.id) durations.set(v.id, parseIsoDuration(v.contentDetails?.duration));
      }
    }

    const { data: course, error: courseError } = await supabaseAdmin
      .from("courses")
      .insert({
        title: playlist.snippet?.title ?? "Cours importé",
        description: playlist.snippet?.description ?? null,
        category: data.category,
        difficulty: data.difficulty,
        youtube_playlist_id: data.playlistId,
        thumbnail_url: `https://i.ytimg.com/vi/${lessons[0]!.videoId}/hqdefault.jpg`,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (courseError || !course)
      throw new Error(courseError?.message ?? "Création du cours impossible");

    const { error: lessonsError } = await supabaseAdmin.from("course_lessons").insert(
      lessons.map((l, index) => ({
        course_id: course.id,
        video_id: l.videoId,
        title: l.title.slice(0, 200),
        description: l.description?.slice(0, 2000) ?? null,
        duration_seconds: durations.get(l.videoId) ?? 0,
        sort_order: index,
      })),
    );
    if (lessonsError) {
      await supabaseAdmin.from("courses").delete().eq("id", course.id);
      throw new Error(lessonsError.message);
    }

    return { ok: true, courseId: course.id, imported: lessons.length, alreadyExisted: false };
  });

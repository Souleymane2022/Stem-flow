import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CATEGORIES } from "@/lib/categories";

type Input = {
  playlistUrl: string;
  category: string;
  difficulty: string;
  /** Nombre de leçons à publier aussi dans le fil, en partant du début. */
  feedCount?: number;
};

/** Au-delà, une seule playlist noierait le fil sous ses propres vidéos. */
const MAX_FEED_COUNT = 10;

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
    const feedCount = Math.min(Math.max(Math.trunc(input.feedCount ?? 0), 0), MAX_FEED_COUNT);
    return { playlistId, category, difficulty, feedCount };
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
    if (existing)
      return { ok: true, courseId: existing.id, imported: 0, published: 0, alreadyExisted: true };

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

    // Une même vidéo peut figurer plusieurs fois dans une playlist. La table
    // impose UNIQUE (course_id, video_id) : sans ce dédoublonnage, l'insertion
    // entière échouait sur « duplicate key value ». On garde la première
    // occurrence, qui fixe l'ordre de la leçon.
    const seen = new Set<string>();
    const lessons = items
      .map((item) => ({
        videoId: item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? "",
        title: item.snippet?.title ?? "",
        description: item.snippet?.description ?? null,
      }))
      // Une vidéo supprimée ou privée reste dans la playlist sous ce titre.
      .filter((l) => l.videoId && l.title && !/^(Deleted|Private) video$/i.test(l.title))
      .filter((l) => {
        if (seen.has(l.videoId)) return false;
        seen.add(l.videoId);
        return true;
      });

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

    const { data: inserted, error: lessonsError } = await supabaseAdmin
      .from("course_lessons")
      .insert(
        lessons.map((l, index) => ({
          course_id: course.id,
          video_id: l.videoId,
          title: l.title.slice(0, 200),
          description: l.description?.slice(0, 2000) ?? null,
          duration_seconds: durations.get(l.videoId) ?? 0,
          sort_order: index,
        })),
      )
      .select("id,video_id,title,description,sort_order");
    if (lessonsError) {
      await supabaseAdmin.from("courses").delete().eq("id", course.id);
      throw new Error(lessonsError.message);
    }

    // Quelques leçons rejoignent le fil, sinon la playlist reste invisible pour
    // qui ne va jamais dans l'onglet Cours. La ligne du fil garde le lien vers
    // la leçon : le visionnage compte alors dans la progression du cours.
    let published = 0;
    if (data.feedCount > 0 && inserted?.length) {
      const { data: author } = await supabaseAdmin
        .from("profiles")
        .select("username")
        .eq("id", context.userId)
        .maybeSingle();

      const chosen = [...inserted]
        .sort((a, b) => a.sort_order - b.sort_order)
        .slice(0, data.feedCount);

      const { error: feedError } = await supabaseAdmin.from("contents").insert(
        chosen.map((lesson) => ({
          content_type: "video",
          title: lesson.title,
          description: (lesson.description ?? "").slice(0, 500) || null,
          video_url: `https://www.youtube.com/watch?v=${lesson.video_id}`,
          video_id: lesson.video_id,
          category: data.category,
          difficulty: data.difficulty,
          xp_reward: 15,
          author_id: context.userId,
          author_name: author?.username ?? "stemflow",
          source_course_id: course.id,
          source_lesson_id: lesson.id,
        })),
      );
      // Un échec ici ne doit pas perdre le cours : il est importé, seule la
      // mise en avant a manqué, et chaque leçon reste publiable à la main.
      if (feedError) console.error("[cours] publication dans le fil impossible", feedError);
      else published = chosen.length;
    }

    return {
      ok: true,
      courseId: course.id,
      imported: lessons.length,
      published,
      alreadyExisted: false,
    };
  });

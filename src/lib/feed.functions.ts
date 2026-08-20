import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "@/lib/admin.server";
import { CATEGORIES } from "@/lib/categories";
import { extractYouTubeId } from "@/utils/youtube";

type Input = {
  /** Une adresse ou un identifiant par ligne. */
  urls: string;
  category: string;
  difficulty: string;
};

/** L'API YouTube n'accepte que 50 identifiants par appel. */
const BATCH = 50;
/** Garde-fou : au-delà, c'est un collage accidentel, pas une sélection. */
const MAX_VIDEOS = 50;

type VideoItem = {
  id?: string;
  snippet?: { title?: string; description?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
};

/**
 * Ajoute des vidéos YouTube au fil, sans passer par un cours.
 *
 * La page « Publier » sert aux membres : elle demande un titre écrit à la
 * main et récompense l'auteur en XP. Ici l'intention est autre — garnir le
 * catalogue — donc les titres viennent de YouTube, plusieurs adresses passent
 * d'un coup, et les vidéos qui ne peuvent pas être lues dans le fil sont
 * écartées avant insertion plutôt que de finir en « vidéo introuvable ».
 */
export const addVideosToFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    const ids: string[] = [];
    for (const line of (input?.urls ?? "").split(/[\s,]+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Une adresse complète, ou l'identifiant seul tel qu'on le recopie.
      const id = extractYouTubeId(trimmed) ?? (/^[\w-]{11}$/.test(trimmed) ? trimmed : null);
      if (id && !ids.includes(id)) ids.push(id);
    }
    if (ids.length === 0) throw new Error("Aucun lien YouTube reconnu.");
    if (ids.length > MAX_VIDEOS) throw new Error(`${MAX_VIDEOS} vidéos au maximum par envoi.`);

    const category = CATEGORIES.includes(input.category as (typeof CATEGORIES)[number])
      ? input.category
      : CATEGORIES[0];
    const difficulty = ["debutant", "intermediaire", "avance"].includes(input.difficulty)
      ? input.difficulty
      : "debutant";
    return { ids, category, difficulty };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);

    const apiKey = process.env["YOUTUBE_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "Clé YOUTUBE_API_KEY manquante : ajoute-la dans les variables d'environnement.",
      );
    }

    // Déjà dans le fil : on ne republie pas.
    const { data: known } = await supabaseAdmin
      .from("contents")
      .select("video_id")
      .in("video_id", data.ids);
    const already = new Set((known ?? []).map((row) => row.video_id));
    const wanted = data.ids.filter((id) => !already.has(id));

    const found = new Map<string, VideoItem>();
    for (let i = 0; i < wanted.length; i += BATCH) {
      const chunk = wanted.slice(i, i + BATCH).join(",");
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${chunk}&key=${apiKey}`,
      );
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const error = body["error"] as { message?: string } | undefined;
        throw new Error(error?.message ?? `YouTube a répondu ${response.status}`);
      }
      for (const item of (body["items"] as VideoItem[]) ?? []) {
        if (item.id) found.set(item.id, item);
      }
    }

    // Une vidéo non intégrable s'ouvre sur « lecture impossible » dans le fil :
    // mieux vaut la refuser tout de suite et le dire.
    const playable = wanted.filter((id) => {
      const item = found.get(id);
      return Boolean(item?.snippet?.title) && item?.status?.embeddable !== false;
    });

    let added = 0;
    if (playable.length > 0) {
      const { data: author } = await supabaseAdmin
        .from("profiles")
        .select("username")
        .eq("id", context.userId)
        .maybeSingle();

      const { error: insertError } = await supabaseAdmin.from("contents").insert(
        playable.map((id) => ({
          content_type: "video",
          title: (found.get(id)?.snippet?.title ?? "Vidéo STEM").slice(0, 200),
          description: (found.get(id)?.snippet?.description ?? "").slice(0, 500) || null,
          video_url: `https://www.youtube.com/watch?v=${id}`,
          video_id: id,
          category: data.category,
          difficulty: data.difficulty,
          xp_reward: 10,
          author_id: context.userId,
          author_name: author?.username ?? "stemflow",
        })),
      );
      if (insertError) throw new Error(insertError.message);
      added = playable.length;
    }

    return {
      ok: true,
      added,
      duplicates: data.ids.length - wanted.length,
      rejected: wanted.length - playable.length,
    };
  });

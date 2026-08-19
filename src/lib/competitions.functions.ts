import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Input = {
  competitionId: string;
};

type GeneratedQuestion = {
  question: string;
  options: string[];
  correct_option_index: number;
  explanation: string;
};

/** Schéma imposé à l'IA, partagé par les deux fournisseurs. */
const QUESTIONS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          correct_option_index: { type: "integer", minimum: 0, maximum: 3 },
          explanation: { type: "string" },
        },
        required: ["question", "options", "correct_option_index", "explanation"],
      },
    },
  },
  required: ["questions"],
} as const;

const SYSTEM_PROMPT = "Tu es un professeur de STEM francophone.";

/**
 * Interroge le fournisseur d'IA configuré et renvoie le JSON brut des questions.
 *
 * Deux fournisseurs sont acceptés, dans cet ordre :
 *   LOVABLE_API_KEY — la passerelle d'origine, liée à un projet Lovable ;
 *   GEMINI_API_KEY  — l'API Google directement, que n'importe qui peut obtenir.
 * Sans ce second chemin, un projet détaché de Lovable n'aurait aucun moyen de
 * générer des questions.
 */
async function askForQuestions(prompt: string): Promise<string> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const geminiKey = process.env["GEMINI_API_KEY"];

  if (lovableKey) {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT} Tu réponds uniquement via l'outil fourni.` },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_questions",
              description: "Renvoie les questions du quiz",
              parameters: { ...QUESTIONS_SCHEMA, additionalProperties: false },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_questions" } },
      }),
    });

    if (response.status === 429) throw new Error("Trop de demandes, réessaie dans un instant");
    if (response.status === 402) throw new Error("Crédits IA épuisés");
    if (!response.ok) throw new Error(`Génération impossible (${response.status})`);

    const payload = (await response.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const args = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Réponse IA invalide");
    return args;
  }

  if (geminiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          // Le mode JSON dispense d'un appel d'outil : la réponse suit
          // directement le schéma demandé.
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: QUESTIONS_SCHEMA,
          },
        }),
      },
    );

    if (response.status === 429) throw new Error("Trop de demandes, réessaie dans un instant");
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? `Génération impossible (${response.status})`);
    }

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Réponse IA invalide");
    return text;
  }

  throw new Error(
    "Aucune clé IA configurée : renseigne GEMINI_API_KEY (ou LOVABLE_API_KEY) dans les variables d'environnement.",
  );
}

/**
 * Génère les questions d'une compétition.
 *
 * Quand le défi est adossé à un cours, l'IA ne travaille plus sur un simple
 * intitulé mais sur le programme réel du cours — en priorité les leçons que
 * l'hôte a terminées, pour n'interroger que ce qu'il a effectivement vu.
 * Seul l'hôte peut lancer la génération (RLS + vérification explicite).
 */
export const generateCompetitionQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!input || typeof input.competitionId !== "string" || input.competitionId.length < 10) {
      throw new Error("competitionId invalide");
    }
    return { competitionId: input.competitionId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: comp, error: compError } = await supabase
      .from("competitions")
      .select("id, host_id, topic, category, difficulty, question_count, source_course_id")
      .eq("id", data.competitionId)
      .maybeSingle();

    if (compError) throw new Error(compError.message);
    if (!comp) throw new Error("Compétition introuvable");
    if (comp.host_id !== userId) throw new Error("Seul l'hôte peut générer les questions");

    const { count: existing } = await supabase
      .from("competition_questions")
      .select("id", { count: "exact", head: true })
      .eq("competition_id", comp.id);
    if ((existing ?? 0) > 0) return { ok: true, count: existing ?? 0 };

    const total = Math.min(Math.max(comp.question_count ?? 5, 3), 12);

    // Matière du défi : le programme du cours source, restreint aux leçons
    // terminées quand il y en a assez. Sans progression enregistrée, on retombe
    // sur le cours entier plutôt que de refuser la génération.
    let material = "";
    if (comp.source_course_id) {
      const { data: lessons } = await supabase
        .from("course_lessons")
        .select("id, title, description, sort_order")
        .eq("course_id", comp.source_course_id)
        .order("sort_order");

      const all = lessons ?? [];
      if (all.length > 0) {
        const { data: seen } = await supabase
          .from("lesson_progress")
          .select("lesson_id")
          .eq("user_id", userId)
          .eq("completed", true)
          .in(
            "lesson_id",
            all.map((l) => l.id),
          );

        const watched = new Set((seen ?? []).map((r) => r.lesson_id));
        const done = all.filter((l) => watched.has(l.id));
        const used = done.length >= 2 ? done : all;

        material = used
          .slice(0, 25)
          .map((l, i) => {
            const desc = (l.description ?? "").replace(/\s+/g, " ").slice(0, 350);
            return `${i + 1}. ${l.title}${desc ? ` — ${desc}` : ""}`;
          })
          .join("\n");
      }
    }

    const consignes = [
      `Crée exactement ${total} questions de quiz à choix multiple, en français.`,
      `Domaine : ${comp.category}. Niveau : ${comp.difficulty}.`,
      `Chaque question a exactement 4 options, une seule bonne réponse,`,
      `et une explication courte (1 à 2 phrases) pédagogique.`,
      `Les questions doivent être variées, précises et adaptées à des jeunes apprenants africains.`,
    ].join(" ");

    const prompt = material
      ? [
          `Voici le programme d'un cours vidéo, leçon par leçon :`,
          material,
          ``,
          consignes,
          `Les questions doivent porter uniquement sur les notions couvertes par ces leçons,`,
          `et rester compréhensibles pour quelqu'un qui vient de les regarder.`,
          `Répartis-les sur l'ensemble du programme plutôt que sur une seule leçon.`,
        ].join("\n")
      : `${consignes} Sujet : "${comp.topic}".`;

    const args = await askForQuestions(prompt);

    let parsed: { questions?: GeneratedQuestion[] };
    try {
      parsed = JSON.parse(args) as { questions?: GeneratedQuestion[] };
    } catch {
      throw new Error("Réponse IA illisible");
    }

    const questions = (parsed.questions ?? [])
      .filter(
        (q) =>
          q && typeof q.question === "string" && Array.isArray(q.options) && q.options.length === 4,
      )
      .slice(0, total)
      .map((q, index) => ({
        competition_id: comp.id,
        question: q.question,
        options: q.options,
        correct_option_index: Math.min(Math.max(Number(q.correct_option_index) || 0, 0), 3),
        explanation: q.explanation ?? null,
        sort_order: index,
      }));

    if (questions.length < 3) throw new Error("Pas assez de questions générées");

    const { error: insertError } = await supabase.from("competition_questions").insert(questions);
    if (insertError) throw new Error(insertError.message);

    await supabase
      .from("competitions")
      .update({ question_count: questions.length })
      .eq("id", comp.id);

    return { ok: true, count: questions.length };
  });

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

/**
 * Génère les questions d'une compétition à partir de la notion choisie par l'hôte.
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
      .select("id, host_id, topic, category, difficulty, question_count")
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
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Clé IA manquante");

    const prompt = [
      `Crée exactement ${total} questions de quiz à choix multiple, en français,`,
      `sur la notion suivante : "${comp.topic}".`,
      `Domaine : ${comp.category}. Niveau : ${comp.difficulty}.`,
      `Chaque question a exactement 4 options, une seule bonne réponse,`,
      `et une explication courte (1 à 2 phrases) pédagogique.`,
      `Les questions doivent être variées, précises et adaptées à des jeunes apprenants africains.`,
    ].join(" ");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu es un professeur de STEM francophone. Tu réponds uniquement via l'outil fourni." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_questions",
              description: "Renvoie les questions du quiz",
              parameters: {
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
                      additionalProperties: false,
                    },
                  },
                },
                required: ["questions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_questions" } },
      }),
    });

    if (response.status === 429) throw new Error("Trop de demandes, réessaie dans un instant");
    if (response.status === 402) throw new Error("Crédits IA épuisés");
    if (!response.ok) throw new Error("Génération impossible pour le moment");

    const payload = (await response.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const args = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Réponse IA invalide");

    let parsed: { questions?: GeneratedQuestion[] };
    try {
      parsed = JSON.parse(args) as { questions?: GeneratedQuestion[] };
    } catch {
      throw new Error("Réponse IA illisible");
    }

    const questions = (parsed.questions ?? [])
      .filter((q) => q && typeof q.question === "string" && Array.isArray(q.options) && q.options.length === 4)
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

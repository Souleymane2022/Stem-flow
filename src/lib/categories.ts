export const CATEGORIES = ["Science", "Technologie", "Ingénierie", "Mathématiques"] as const;
export type Category = (typeof CATEGORIES)[number];

type CategoryMeta = {
  label: Category;
  emoji: string;
  /** Tailwind token name mapped in styles.css */
  token: "science" | "tech" | "engineering" | "maths";
  text: string;
  bg: string;
  border: string;
  ring: string;
  gradient: string;
};

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  Science: {
    label: "Science",
    emoji: "🔬",
    token: "science",
    text: "text-science",
    bg: "bg-science/15",
    border: "border-science/40",
    ring: "ring-science",
    gradient: "from-science/35 via-science/10 to-transparent",
  },
  Technologie: {
    label: "Technologie",
    emoji: "💻",
    token: "tech",
    text: "text-tech",
    bg: "bg-tech/15",
    border: "border-tech/40",
    ring: "ring-tech",
    gradient: "from-tech/35 via-tech/10 to-transparent",
  },
  Ingénierie: {
    label: "Ingénierie",
    emoji: "⚙️",
    token: "engineering",
    text: "text-engineering",
    bg: "bg-engineering/15",
    border: "border-engineering/40",
    ring: "ring-engineering",
    gradient: "from-engineering/35 via-engineering/10 to-transparent",
  },
  Mathématiques: {
    label: "Mathématiques",
    emoji: "➗",
    token: "maths",
    text: "text-maths",
    bg: "bg-maths/15",
    border: "border-maths/40",
    ring: "ring-maths",
    gradient: "from-maths/35 via-maths/10 to-transparent",
  },
};

export function categoryMeta(category?: string | null): CategoryMeta {
  return CATEGORY_META[(category as Category) ?? "Science"] ?? CATEGORY_META.Science;
}

export const DIFFICULTIES = [
  { value: "debutant", label: "Débutant" },
  { value: "intermediaire", label: "Intermédiaire" },
  { value: "avance", label: "Avancé" },
] as const;

export function difficultyLabel(value?: string | null) {
  return DIFFICULTIES.find((d) => d.value === value)?.label ?? "Débutant";
}

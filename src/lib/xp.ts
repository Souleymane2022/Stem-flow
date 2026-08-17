export type LevelName = "curieux" | "explorateur" | "analyste" | "challenger" | "mentor";

export type Level = {
  name: LevelName;
  label: string;
  minXp: number;
  icon: string;
  token: "science" | "tech" | "engineering" | "maths";
};

export const LEVELS: Level[] = [
  { name: "curieux", label: "Curieux", minXp: 0, icon: "✨", token: "science" },
  { name: "explorateur", label: "Explorateur", minXp: 500, icon: "🧭", token: "tech" },
  { name: "analyste", label: "Analyste", minXp: 2000, icon: "📊", token: "engineering" },
  { name: "challenger", label: "Challenger", minXp: 5000, icon: "⚔️", token: "maths" },
  { name: "mentor", label: "Mentor", minXp: 10000, icon: "👑", token: "engineering" },
];

export const getLevel = (xp: number): Level =>
  [...LEVELS].reverse().find((l) => xp >= l.minXp) ?? LEVELS[0]!;

export const getNextLevel = (xp: number): Level | null =>
  LEVELS.find((l) => l.minXp > xp) ?? null;

export function levelProgress(xp: number) {
  const current = getLevel(xp);
  const next = getNextLevel(xp);
  if (!next) return { current, next, percent: 100, remaining: 0 };
  const span = next.minXp - current.minXp;
  const percent = Math.min(100, Math.round(((xp - current.minXp) / span) * 100));
  return { current, next, percent, remaining: next.minXp - xp };
}

export const XP_REWARDS = {
  watchVideo: 10,
  like: 2,
  comment: 5,
  quizPass: 20,
  quizPerfect: 10,
  dailyStreak: 15,
  publish: 30,
} as const;

export const levelTextClass: Record<Level["token"], string> = {
  science: "text-science",
  tech: "text-tech",
  engineering: "text-engineering",
  maths: "text-maths",
};

export const levelBgClass: Record<Level["token"], string> = {
  science: "bg-science/15 text-science border-science/40",
  tech: "bg-tech/15 text-tech border-tech/40",
  engineering: "bg-engineering/15 text-engineering border-engineering/40",
  maths: "bg-maths/15 text-maths border-maths/40",
};

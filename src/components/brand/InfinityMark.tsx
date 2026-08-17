import { useEffect, useState } from "react";

type Props = {
  className?: string;
  glow?: boolean;
};

export function InfinityMark({ className = "h-8 w-8", glow = false }: Props) {
  return (
    <svg viewBox="0 0 100 56" className={`${className} ${glow ? "animate-glow" : ""}`} aria-hidden="true">
      <defs>
        <linearGradient id="stemflow-infinity" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00E5A0" />
          <stop offset="100%" stopColor="#0A84FF" />
        </linearGradient>
      </defs>
      <path
        d="M28 28c0-9 6.5-16 14.5-16 6 0 10 3.6 14.5 10.5C61.5 29.4 65.5 33 71.5 33 78 33 82 29 82 24s-4-9-10.5-9c-6 0-10 3.6-14.5 10.5C52.5 32.4 48.5 36 42.5 36 34.5 36 28 29 28 20"
        fill="none"
        stroke="url(#stemflow-infinity)"
        strokeWidth="7"
        strokeLinecap="round"
        transform="translate(-5 6) scale(1.05)"
      />
    </svg>
  );
}

export function InfinityGlyph({ className = "" }: { className?: string }) {
  return (
    <span className={`text-gradient-brand font-black leading-none ${className}`} aria-hidden="true">
      ∞
    </span>
  );
}

export function Wordmark({ animated = false }: { animated?: boolean }) {
  const letters = "STEMFLOW".split("");
  const [shown, setShown] = useState(animated ? 0 : letters.length);

  useEffect(() => {
    if (!animated) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= letters.length) clearInterval(id);
    }, 60);
    return () => clearInterval(id);
  }, [animated, letters.length]);

  return (
    <span className="flex text-3xl font-black tracking-[-0.04em]">
      {letters.map((letter, i) => (
        <span
          key={`${letter}-${i}`}
          className="transition-all duration-300"
          style={{
            opacity: i < shown ? 1 : 0,
            transform: i < shown ? "translateY(0)" : "translateY(6px)",
          }}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

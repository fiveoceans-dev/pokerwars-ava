"use client";

import { useEffect, useState } from "react";

interface AnimatedTitleProps {
  text: string;
  delay?: number; // seconds between letters
  interval?: number; // seconds between animation repeats
}

export default function AnimatedTitle({
  text,
  delay = 0.05,
  interval = 10,
}: AnimatedTitleProps) {
  const [iteration, setIteration] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIteration((i) => i + 1), interval * 1000);
    return () => clearInterval(id);
  }, [interval]);

  return (
    <h1 className="text-2xl md:text-3xl font-bold text-left leading-tight whitespace-nowrap">
      {text.split("").map((ch, i) => (
        <span
          key={`${iteration}-${i}`}
          className="inline-block animate-flip will-change-transform"
          style={{ animationDelay: `${i * delay}s` }}
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
    </h1>
  );
}

// src/components/Card.tsx
import Image from "next/image";
import clsx from "clsx";
import type { Card as TCard } from "../game-engine"; // type-only ✔
import cardBackDefault from "../assets/svg-cards/card-back.svg";
// import cardPokerBoots from '../assets/svg-cards/card-pokerboots.svg';

/* ─────────── import all face SVGs at build-time ───────────
   Using Webpack's `require.context` so this works in a Next.js environment.
*/
function importAll(r: any) {
  const images: Record<string, string> = {};
  r.keys().forEach((key: string) => {
    images[`../assets/svg-cards/${key.replace("./", "")}`] = r(key)
      .default as string;
  });
  return images;
}

const faceSvgs = importAll(
  // import all files matching "*_of_*.svg" in the svg-cards folder
  (require as any).context("../assets/svg-cards", false, /_of_.*\.svg$/),
);

/* Helper: convert rank/suit symbols → filename stem */
const rankMap: Record<string, string> = {
  A: "ace",
  K: "king",
  Q: "queen",
  J: "jack",
  T: "10",
  "9": "9",
  "8": "8",
  "7": "7",
  "6": "6",
  "5": "5",
  "4": "4",
  "3": "3",
  "2": "2",
};
const suitMap: Record<string, string> = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};
function faceKey(card: TCard) {
  return `../assets/svg-cards/${rankMap[card.rank]}_of_${suitMap[card.suit]}.svg`;
}

interface Props {
  card: TCard | null; // null while face-down
  hidden?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

export default function Card({
  card,
  hidden,
  size = "md",
  className: extraClass,
}: Props) {
  const className = clsx(
    "rounded-md shadow-sm",
    {
      "w-12 h-18": size === "xs",
      "w-16 h-24": size === "sm",
      "w-20 h-28": size === "md",
      "w-24 h-32": size === "lg",
    },
    extraClass,
  );

  /* choose back or face */
  const src =
    hidden || !card
      ? cardBackDefault
      : (faceSvgs[faceKey(card)] ?? cardBackDefault); // fallback to back if missing

  const alt =
    hidden || !card
      ? "Card back"
      : `${card.rank} of ${suitMap[card.suit] ?? card.suit}`;

  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      draggable={false}
      width={80}
      height={120}
    />
  );
}

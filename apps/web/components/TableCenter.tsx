import clsx from "clsx";
import Card from "./Card";
import { PotDisplayBubbles } from "./PotDisplayBubbles";
import type { Card as TCard } from "../game-engine";
import { hashIdToCard } from "../game-engine";

interface TableCenterProps {
  community: (number | null)[];
  street: number;
  currentRoundBetting: number;
  totalPot: number;
  isMobile: boolean;
}

export default function TableCenter({
  community,
  street,
  currentRoundBetting,
  totalPot,
  isMobile,
}: TableCenterProps) {
  const visibleCommunity = community.filter((c): c is number => c !== null);
  const showCommunity = street >= 1 && visibleCommunity.length > 0;

  // Responsive Card Sizing
  // Mobile: 'sm' (64px wide) -> 5 cards = 320px + gaps
  // Desktop: 'md' (80px wide) -> 5 cards = 400px + gaps
  const cardSize = isMobile ? "sm" : "md";
  const gapSize = isMobile ? "gap-1" : "gap-2";
  const containerPadding = isMobile ? "p-2" : "p-3";

  return (
    <div 
      className={clsx(
        "absolute top-[15%] left-1/2 -translate-x-1/2 w-full flex flex-col items-center gap-4 z-10 pointer-events-none"
      )}
    >
      {/* Background Title */}
      <div className="relative pointer-events-auto">
        <PotDisplayBubbles
          currentRoundBetting={currentRoundBetting}
          totalPot={totalPot}
          isMobile={isMobile}
        />
      </div>

      {/* Community Cards */}
      {showCommunity && (
        <div 
          className={`flex items-center ${gapSize} ${containerPadding} transition-all animate-in fade-in zoom-in-95 duration-300 pointer-events-auto`}
        >
          {visibleCommunity.map((code, i) => (
            <Card key={i} card={hashIdToCard(code)} size={cardSize} />
          ))}
        </div>
      )}
    </div>
  );
}
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
  const showCommunity = street >= 1;

  // Responsive Card Sizing
  const cardSize = isMobile ? "sm" : "md";
  const gapSize = isMobile ? "gap-1" : "gap-2";
  const containerPadding = isMobile ? "p-2" : "p-3";

  // Map size to pixel dimensions for the placeholder slots
  const slotDimensions = {
    sm: "w-16 h-24", // matches Card.tsx 'sm'
    md: "w-20 h-28", // matches Card.tsx 'md'
  }[cardSize];

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

      {/* Community Cards - Fixed 5-slot layout */}
      {showCommunity && (
        <div 
          className={`flex items-center ${gapSize} ${containerPadding} transition-all pointer-events-auto`}
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const code = community[i];
            return (
              <div key={i} className={clsx(slotDimensions, "rounded-md flex-shrink-0")}>
                {code !== null && code !== undefined ? (
                  <Card 
                    card={hashIdToCard(code)} 
                    size={cardSize} 
                    className="animate-in fade-in zoom-in-95 duration-300 shadow-xl"
                  />
                ) : (
                  // Placeholder for undealt cards to maintain fixed positions
                  <div className="w-full h-full border border-white/5 rounded-md" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
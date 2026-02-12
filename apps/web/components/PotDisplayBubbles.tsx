import React from "react";

interface PotDisplayBubblesProps {
  currentRoundBetting: number; // sum of streetCommitted for this street (includes blinds/antes preflop)
  totalPot: number; // sum of previous streets' pots (closed rounds only)
  isMobile?: boolean;
}

export function PotDisplayBubbles({
  currentRoundBetting,
  totalPot,
  isMobile = false,
}: PotDisplayBubblesProps) {
  const previousRoundsPot = Math.max(0, totalPot);
  // IMPORTANT: During betting, Pot shows only closed streets (previousRoundsPot)
  // Current round commitments are displayed separately below the cards.
  const pot = previousRoundsPot;
  const showPot = previousRoundsPot > 0;
  const showCurrentRound = currentRoundBetting > 0;

  if (!showPot && !showCurrentRound) {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[40px]">
      {/* Pot (total) above the community cards */}
      {showPot && (
        <div className="text-white text-sm font-bold tracking-tight opacity-90">
          Pot: ${pot.toLocaleString()}
        </div>
      )}

      {/* Separator line when both are present */}
      {showPot && showCurrentRound && (
        <div className="w-12 h-[1px] bg-white/20 my-1.5" />
      )}

      {/* Current round bet amount (no label) */}
      {showCurrentRound && (
        <div className="text-[#fbbf24] text-sm font-black font-mono animate-in fade-in slide-in-from-bottom-1 duration-300">
          ${currentRoundBetting.toLocaleString()}
        </div>
      )}
    </div>
  );
}

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
    <>
      {/* Pot (total) above the community cards, fixed position */}
      {showPot && (
        <div
          className="absolute left-1/2 z-10"
          style={{ left: '50%', top: 'calc(50% - 44px)', transform: 'translate(-50%, 0)' }}
        >
          <div className="text-white text-sm font-semibold">Pot: ${pot}</div>
        </div>
      )}

      {/* Current round bet amount (no label), same style, below pot */}
      {showCurrentRound && (
        <div
          className="absolute left-1/2 z-10"
          style={{ left: '50%', top: 'calc(50% + 32px)', transform: 'translate(-50%, 0)' }}
        >
          <div className="text-white text-sm font-semibold">${currentRoundBetting}</div>
        </div>
      )}
    </>
  );
}

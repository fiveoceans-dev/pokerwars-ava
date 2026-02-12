import React from "react";
import clsx from "clsx";

interface PotDisplayBubblesProps {
  currentRoundBetting: number; // sum of streetCommitted for this street (includes blinds/antes preflop)
  totalPot: number; // sum of previous streets' pots (closed rounds only)
  isMobile?: boolean;
  tableType?: "cash" | "stt" | "mtt";
}

export function PotDisplayBubbles({
  currentRoundBetting,
  totalPot,
  isMobile = false,
  tableType = "cash",
}: PotDisplayBubblesProps) {
  const previousRoundsPot = Math.max(0, totalPot);
  const pot = previousRoundsPot;
  const showPot = previousRoundsPot > 0;
  const showCurrentRound = currentRoundBetting > 0;
  const currencySymbol = tableType === "cash" ? "$" : "";

  return (
    <div className="flex flex-col items-center justify-center h-[60px] pointer-events-none">
      {/* Pot (total) above the community cards */}
      <div className="h-5 flex items-center justify-center">
        <div 
          className={clsx(
            "text-white text-sm font-bold tracking-tight opacity-90 transition-opacity duration-300",
            showPot ? "opacity-90" : "opacity-0"
          )}
        >
          Pot: {currencySymbol}{pot.toLocaleString()}
        </div>
      </div>

      {/* Separator line - always takes space to maintain vertical center */}
      <div className="h-4 flex items-center justify-center">
        <div 
          className={clsx(
            "w-12 h-[1px] bg-white/20 transition-opacity duration-300",
            showPot && showCurrentRound ? "opacity-100" : "opacity-0"
          )} 
        />
      </div>

      {/* Current round bet amount */}
      <div className="h-5 flex items-center justify-center">
        <div 
          className={clsx(
            "text-[#fbbf24] text-sm font-black font-mono transition-all duration-300",
            showCurrentRound ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
          )}
        >
          {currencySymbol}{currentRoundBetting.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

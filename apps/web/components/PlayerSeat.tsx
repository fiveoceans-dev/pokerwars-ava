// src/components/PlayerSeat.tsx

import clsx from "clsx";
import Card from "./Card";
import type { Card as TCard, SeatUIState } from "../game-engine";
import { GlowEffect } from "./GlowEffect";
import type { SeatState } from "../stores/seatStore";

interface PlayerSeatProps {
  seat?: SeatState;
  status?: SeatUIState;
  hand?: [TCard, TCard] | "encrypted" | null;
  isDealer?: boolean;
  isActive?: boolean;
  revealCards?: boolean;
  cardSize?: "xs" | "sm" | "md" | "lg";
  dealerOffset?: { x: number; y: number };
  isWinner?: boolean;
  actionLabel?: string;
}

export default function PlayerSeat({
  seat,
  status = "active",
  hand = null,
  isDealer = false,
  isActive = false,
  revealCards = false,
  cardSize = "sm",
  dealerOffset = { x: 0, y: -20 },
  isWinner = false,
  actionLabel,
}: PlayerSeatProps) {
  const hasEncryptedCards = hand === "encrypted";
  const [hole1, hole2]: [TCard | null, TCard | null] = hasEncryptedCards
    ? [null, null]
    : Array.isArray(hand)
      ? hand
      : [null, null];
  return (
    <div
      className={clsx(
        "relative w-24 h-10",
        status === "folded" && "opacity-60",
        status === "empty" && "opacity-50",
      )}
    >
      {hand && hand !== null && (
        <div
          className="absolute w-full flex justify-center gap-1"
          style={{ bottom: "-31px" }} // aligns 3px above badge top (fixed)
        >
          <Card
            card={hole1}
            hidden={!revealCards || hasEncryptedCards}
            size={cardSize}
          />
          <Card
            card={hole2}
            hidden={!revealCards || hasEncryptedCards}
            size={cardSize}
          />
        </div>
      )}

      <div
        className={clsx("relative w-full h-full", isActive && "animate-pulse")}
      >
        {isDealer && (
          <span
            className="absolute left-1/2 top-1/2 w-12 h-12 rounded-full bg-white text-black text-sm font-bold flex items-center justify-center"
            style={{
              transform: `translate(-50%, -50%) translate(${dealerOffset.x}px, ${dealerOffset.y}px)`,
            }}
          >
            D
          </span>
        )}

        <GlowEffect isActive={isWinner}>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="sr-only">{seat?.name || seat?.playerId}</span>
          </div>
        </GlowEffect>
      </div>
    </div>
  );
}

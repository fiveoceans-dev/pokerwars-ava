import clsx from "clsx";
import { useGameStore } from "../hooks/useGameStore";
import type { SeatUIState } from "../game-engine";
import type { SeatState } from "../stores/seatStore";
import { shortAddress } from "../utils/address";
import { formatNumber } from "../utils/format";

interface PlayerSeatProps {
  seat?: SeatState;
  chips?: number;
  playerId?: string | null;
  status?: SeatUIState;
  isDealer?: boolean;
  isActive?: boolean;
  isWinner?: boolean;
  actionLabel?: string;
  onClick?: () => void;
}

export default function PlayerSeat({
  seat,
  chips,
  playerId,
  status = "active",
  isDealer = false,
  isActive = false,
  isWinner = false,
  actionLabel,
  onClick,
}: PlayerSeatProps) {
  const tableType = useGameStore((state) => state.tableType);
  const isPlaceholderAddress = (addr: string) =>
    addr.toLowerCase() === "white" || /^0x0{40}$/.test(addr);
  
  const finalPlayerId = playerId || seat?.playerId;
  const displayName = seat?.name?.trim()
    ? seat.name
    : finalPlayerId && !isPlaceholderAddress(finalPlayerId)
      ? shortAddress(finalPlayerId)
      : "Empty";

  const stack = chips !== undefined ? chips : (seat?.chips !== undefined ? seat.chips : 0);
  const hasSeat = !!seat || !!finalPlayerId;

  const isFolded = status === "folded";
  const isSittingOut = status === "sittingOut";
  const dim = isFolded || isSittingOut;

  // Determine Glow Color and Intensity
  const glowClass = isWinner
    ? "shadow-[0_0_20px_rgba(251,191,36,0.6)] border-[#fbbf24]/50" // Gold
    : isActive
      ? "shadow-[0_0_15px_rgba(59,130,246,0.5)] border-blue-500/50" // Blue
      : hasSeat
        ? "border-white/10" // Default Occupied
        : "border-white/20 border-dashed"; // Empty

  // Determine Avatar Content based on Action
  const getAvatarContent = () => {
    if (!actionLabel) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#2a2d36] text-white/20">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </div>
      );
    }

    const label = actionLabel.toUpperCase();
    let bgClass = "bg-slate-700";
    let text = label;

    if (label.includes("FOLD")) {
      bgClass = "bg-rose-500";
      text = "FOLD";
    } else if (label.includes("CHECK")) {
      bgClass = "bg-emerald-500";
      text = "CHECK";
    } else if (label.includes("CALL")) {
      bgClass = "bg-blue-500";
      text = "CALL";
    } else if (label.includes("BET")) {
      bgClass = "bg-amber-500";
      text = "BET";
    } else if (label.includes("RAISE")) {
      bgClass = "bg-indigo-500";
      text = "RAISE";
    } else if (label.includes("ALLIN")) {
      bgClass = "bg-orange-500";
      text = "ALL-IN";
    } else if (label.includes("WIN")) {
      bgClass = "bg-yellow-400";
      text = "WIN";
    }

    return (
      <div className={clsx("w-full h-full flex items-center justify-center text-[9px] font-black tracking-tighter text-white uppercase shadow-inner", bgClass)}>
        {text}
      </div>
    );
  };

  return (
    <div
      className={clsx(
        "relative flex items-center justify-center transition-all duration-200 w-[140px] h-[50px]",
        dim ? "opacity-50 grayscale" : "opacity-100",
        isActive && "scale-105"
      )}
      onClick={onClick}
    >
      {/* Dealer Button - Floating Top Right */}
      {isDealer && (
        <div className="absolute -top-2 -right-2 z-30 shadow-md">
          <div className="w-5 h-5 rounded-full bg-white border-2 border-gray-300 text-black text-[10px] font-bold flex items-center justify-center">
            D
          </div>
        </div>
      )}

      {/* Main Seat Badge Capsule */}
      <div
        className={clsx(
          "relative w-full h-full rounded-full border overflow-hidden transition-all duration-300",
          "flex items-center backdrop-blur-md shadow-lg",
          hasSeat ? "bg-[#1a1d26]/95" : "bg-white/5 cursor-pointer hover:bg-white/10 justify-center",
          glowClass
        )}
      >
        {hasSeat ? (
          /* --- OCCUPIED STATE --- */
          <>
            {/* Action/Indicator Area - Left (Full Height) */}
            <div className="w-[44px] h-full bg-[#2a2d36] flex-shrink-0 overflow-hidden border-r border-white/5">
               {getAvatarContent()}
            </div>

            {/* Info Stack - Right (Two Rows) */}
            <div className="flex flex-col min-w-0 flex-1 px-2.5 py-1 justify-center">
              {/* Row 1: Nickname */}
              <div className="text-[11px] font-bold truncate tracking-tight text-white/90 mb-0.5">
                {displayName}
              </div>
              {/* Row 2: Stack */}
              <div className="text-[10px] font-mono font-black text-[#fbbf24] tabular-nums">
                {tableType === "cash" ? "$" : ""}{formatNumber(stack) || "0"}
              </div>
            </div>
          </>
        ) : (
          /* --- EMPTY STATE --- */
          <div className="text-sm font-bold text-white/60 uppercase tracking-widest">
            Join
          </div>
        )}
      </div>
    </div>
  );
}
"use client";

import { useState } from "react";
import { useGameStore } from "../hooks/useGameStore";
import useIsMobile from "../hooks/useIsMobile";
import { captureAndDownloadScreen } from "../utils/screenCapture";
import { formatNumber } from "~~/utils/format";

interface Props {
  isPlayerTurn: boolean;
  currentBet: number;
  playerCommitted: number;
  playerChips: number;
  minRaise?: number;
  isMobile?: boolean;
  className?: string;
}

export default function PlayerActionButtons({
  isPlayerTurn,
  currentBet,
  playerCommitted,
  playerChips,
  minRaise,
  isMobile: propIsMobile,
  className,
}: Props) {
  const { playerAction, connectionState, bigBlind, leaveSeat } = useGameStore();
  const effectiveMinRaise = minRaise ?? bigBlind;
  const [raiseAmount, setRaiseAmount] = useState(effectiveMinRaise);
  const [isActionPending, setIsActionPending] = useState(false);
  const hookIsMobile = useIsMobile();
  const isMobile = propIsMobile ?? hookIsMobile;

  // Always render container to preserve space - content visibility controlled below
  const toCall = Math.max(0, currentBet - playerCommitted);
  const canCheck = toCall === 0;
  // A player can CALL if there is a bet AND they have chips (short call becomes all-in).
  const canCall = toCall > 0 && playerChips > 0;
  // A player can RAISE if they have more chips than required just to CALL.
  const canRaise = playerChips > toCall && playerChips >= toCall + effectiveMinRaise;
  const maxRaise = Math.max(0, playerChips - toCall);

  const handleAction = async (action: string, amount?: number) => {
    if (isActionPending) return;

    setIsActionPending(true);
    try {
      await playerAction({ type: action as any, amount });
      console.log(`✅ Player action: ${action}${amount ? ` (${amount})` : ""}`);
    } catch (error) {
      console.error(`❌ Action failed: ${action}`, error);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleRaiseAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || effectiveMinRaise;
    setRaiseAmount(Math.max(effectiveMinRaise, Math.min(value, maxRaise)));
  };

  const showActions = isPlayerTurn && connectionState !== "disconnected";

  const handleScreenCapture = async () => {
    try {
      await captureAndDownloadScreen();
    } catch (error) {
      console.error("Failed to capture screen:", error);
    }
  };

  const [isLeaving, setIsLeaving] = useState(false);
  const handleLeave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    try {
      await leaveSeat();
    } catch (e) {
      console.error("Failed to leave table:", e);
    } finally {
      setIsLeaving(false);
    }
  };

  // Show-cards UI state
  const {
    street,
    phase,
    playerIds,
    playerStates,
    cardsRevealed,
    currentWalletId,
    recentWinners,
    revealCards,
    autoRevealAtShowdown,
    setAutoRevealAtShowdown,
    showCards,
    muckCards,
  } = useGameStore();

  const safePlayerIds = Array.isArray(playerIds)
    ? playerIds
    : Array(9).fill(null);
  const safePlayerStates = Array.isArray(playerStates)
    ? playerStates
    : Array(9).fill("empty");
  const safeCardsRevealed = Array.isArray(cardsRevealed)
    ? cardsRevealed
    : Array(9).fill(false);

  const walletSeat = currentWalletId
    ? safePlayerIds.findIndex(
        (id) => id?.toLowerCase() === currentWalletId.toLowerCase(),
      )
    : -1;
  // Professional poker card reveal logic
  const isShowdown = phase === "showdown";
  const isValidPhase = ["showdown", "payout"].includes(phase || "");
  const hasValidSeat = walletSeat >= 0;
  const notFolded =
    safePlayerStates[walletSeat] !== "folded" &&
    safePlayerStates[walletSeat] !== "empty";
  const hasCards = hasValidSeat && notFolded;
  const isWinner = recentWinners.has(walletSeat);

  // Show Muck/Show buttons during showdown when player has cards
  // Winners MUST reveal; Losers can choose to Muck (if not already revealed)
  const canRevealCards =
    isValidPhase && hasCards && !safeCardsRevealed[walletSeat];
  const canMuckCards =
    isValidPhase && hasCards && !safeCardsRevealed[walletSeat] && !isWinner;

  // Legacy show cards button (keep existing logic for compatibility)
  const canShowCards =
    street === 4 && hasCards && !safeCardsRevealed[walletSeat];

  const hasAnythingToShow = showActions;

  if (!hasAnythingToShow) return null;

  const btnMinWidth = isMobile ? "60px" : "70px";

  return (
    <div
      className={`${isMobile ? "w-full" : "w-auto"} max-w-[420px] h-full flex flex-col justify-between ${
        isMobile ? "text-[10px] min-h-[100px]" : "text-xs min-h-[80px]"
      } overflow-hidden ${className ?? ""}`}
    >
      {/* Row 1 - Action Buttons (Fixed positions) */}
      <div className="flex flex-wrap mb-2 justify-center gap-1">
        {/* Fold - Position 1 */}
        <div className="flex justify-center" style={{ minWidth: btnMinWidth }}>
          {showActions ? (
            <button
              onClick={() => handleAction("FOLD")}
              disabled={isActionPending}
              className={`h-8 px-2 rounded font-semibold text-xs text-white flex items-center justify-center w-full ${
                isActionPending ? "bg-rose-500/50 cursor-not-allowed" : "bg-rose-500 hover:bg-rose-400"
              }`}
            >
              Fold
            </button>
          ) : (
            <div className="h-8 px-2 opacity-0 pointer-events-none w-full flex items-center justify-center">
              Fold
            </div>
          )}
        </div>

        {/* Check - Position 2 */}
        <div className="flex justify-center" style={{ minWidth: btnMinWidth }}>
          {showActions && canCheck ? (
            <button
              onClick={() => handleAction("CHECK")}
              disabled={isActionPending}
              className={`h-8 px-2 rounded font-semibold text-xs text-white flex items-center justify-center w-full ${
                isActionPending
                  ? "bg-emerald-500/50 cursor-not-allowed"
                  : "bg-emerald-500 hover:bg-emerald-400"
              }`}
            >
              Check
            </button>
          ) : (
            <div className="h-8 px-2 opacity-0 pointer-events-none w-full flex items-center justify-center">
              Check
            </div>
          )}
        </div>

        {/* Call - Position 3 */}
        <div className="flex justify-center" style={{ minWidth: btnMinWidth }}>
          {showActions && canCall ? (
            <button
              onClick={() => handleAction("CALL")}
              disabled={isActionPending}
              className={`h-8 px-2 rounded font-semibold text-xs text-white flex items-center justify-center w-full ${
                isActionPending
                  ? "bg-blue-500/50 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-400"
              }`}
            >
              Call {toCall > 0 ? formatNumber(toCall) : ""}
            </button>
          ) : (
            <div className="h-8 px-2 opacity-0 pointer-events-none w-full flex items-center justify-center">
              Call
            </div>
          )}
        </div>

        {/* Bet - Position 4 */}
        <div className="flex justify-center" style={{ minWidth: btnMinWidth }}>
          {showActions && canRaise && toCall === 0 ? (
            <button
              onClick={() => handleAction("BET", raiseAmount)}
              disabled={isActionPending}
              className={`h-8 px-2 rounded font-semibold text-xs text-white flex items-center justify-center w-full ${
                isActionPending
                  ? "bg-amber-500/50 cursor-not-allowed"
                  : "bg-amber-500 hover:bg-amber-400"
              }`}
            >
              Bet {formatNumber(raiseAmount)}
            </button>
          ) : (
            <div className="h-8 px-2 opacity-0 pointer-events-none w-full flex items-center justify-center">
              Bet
            </div>
          )}
        </div>

        {/* Raise - Position 5 */}
        <div className="flex justify-center" style={{ minWidth: btnMinWidth }}>
          {showActions && canRaise && toCall > 0 ? (
            <button
              onClick={() => handleAction("RAISE", raiseAmount)}
              disabled={isActionPending}
              className={`h-8 px-2 rounded font-semibold text-xs text-white flex items-center justify-center w-full ${
                isActionPending
                  ? "bg-indigo-500/50 cursor-not-allowed"
                  : "bg-indigo-500 hover:bg-indigo-400"
              }`}
            >
              Raise {formatNumber(toCall + raiseAmount)}
            </button>
          ) : (
            <div className="h-8 px-2 opacity-0 pointer-events-none w-full flex items-center justify-center">
              Raise
            </div>
          )}
        </div>

        {/* All-in - Position 6 */}
        <div className="flex justify-center" style={{ minWidth: btnMinWidth }}>
          {showActions && playerChips > 0 ? (
            <button
              onClick={() => handleAction("ALLIN")}
              disabled={isActionPending}
              className={`h-8 px-2 rounded font-semibold text-xs text-white flex items-center justify-center w-full ${
                isActionPending
                  ? "bg-orange-500/50 cursor-not-allowed"
                  : "bg-orange-500 hover:bg-orange-400"
              }`}
            >
              All-in {formatNumber(playerChips + playerCommitted)}
            </button>
          ) : (
            <div className="h-8 px-2 opacity-0 pointer-events-none w-full flex items-center justify-center">
              All-in
            </div>
          )}
        </div>
      </div>

      {/* Row 2 - Quick Bet Buttons */}
      <div className="flex items-center justify-end gap-1 mb-2" style={{ minHeight: "32px" }}>
        {/* Quick Bet Buttons - Right Side */}
        {showActions && canRaise && maxRaise > effectiveMinRaise ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setRaiseAmount(Math.min(effectiveMinRaise * 2, maxRaise))
              }
              className="min-w-[50px] h-8 px-2 rounded font-semibold text-[#0a1124] bg-[var(--brand-accent)] hover:bg-[#eec42b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs flex items-center justify-center"
              disabled={effectiveMinRaise * 2 > maxRaise}
            >
              2BB
            </button>
            <button
              onClick={() =>
                setRaiseAmount(Math.min(effectiveMinRaise * 3, maxRaise))
              }
              className="min-w-[50px] h-8 px-2 rounded font-semibold text-[#0a1124] bg-[var(--brand-accent)] hover:bg-[#eec42b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs flex items-center justify-center"
              disabled={effectiveMinRaise * 3 > maxRaise}
            >
              3BB
            </button>
          </div>
        ) : (
          <div className="opacity-0 pointer-events-none flex items-center gap-1">
            <div className="min-w-[50px] h-8 px-2 text-xs flex items-center justify-center">
              2BB
            </div>
            <div className="min-w-[50px] h-8 px-2 text-xs flex items-center justify-center">
              3BB
            </div>
          </div>
        )}
      </div>

      {/* Row 3 - Betting Controls (Full width) */}
      <div
        className={`w-full flex items-center ${isMobile ? "gap-0.5" : "gap-1"}`}
        style={{ minHeight: "32px" }}
      >
        {showActions && canRaise && maxRaise > effectiveMinRaise ? (
          <>
            {/* Minus Button */}
            <button
              onClick={() => {
                const newAmount = Math.max(
                  raiseAmount - effectiveMinRaise,
                  effectiveMinRaise,
                );
                setRaiseAmount(newAmount);
              }}
              disabled={raiseAmount <= effectiveMinRaise}
              className="w-8 h-8 flex items-center justify-center rounded font-semibold text-[#0a1124] bg-[var(--brand-accent)] hover:bg-[#6ccf9b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              -
            </button>

            {/* Betting Slider - Full width */}
            <input
              type="range"
              min={effectiveMinRaise}
              max={maxRaise}
              value={raiseAmount}
              onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
              className="flex-1 h-4 rounded-md appearance-none cursor-pointer slider"
            />

            {/* Plus Button */}
            <button
              onClick={() => {
                const newAmount = Math.min(
                  raiseAmount + effectiveMinRaise,
                  maxRaise,
                );
                setRaiseAmount(newAmount);
              }}
              disabled={raiseAmount >= maxRaise}
              className="w-8 h-8 flex items-center justify-center rounded font-semibold text-[#0a1124] bg-[var(--brand-accent)] hover:bg-[#6ccf9b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              +
            </button>

            {/* Bet Amount Input */}
            <input
              type="number"
              min={effectiveMinRaise}
              max={maxRaise}
              value={raiseAmount}
              onChange={handleRaiseAmountChange}
              className={`${isMobile ? "w-12" : "w-16"} h-8 px-1 bg-transparent text-white rounded text-center transition-colors text-xs flex-shrink-0 border border-white/10`}
            />
          </>
        ) : (
          <div
            className={`opacity-0 pointer-events-none flex items-center ${isMobile ? "gap-0.5" : "gap-1"} w-full`}
          >
            <div className="w-8 h-8">-</div>
            <div className="flex-1 h-2">slider</div>
            <div className="w-8 h-8">+</div>
            <div className={`${isMobile ? "w-12" : "w-16"} h-8 px-1`}>
              input
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        /* Custom range slider styling with centered thumb */
        .slider {
          -webkit-appearance: none;
          appearance: none;
          height: 8px; /* match track height */
          background: rgba(255, 255, 255, 0.25);
          border-radius: 6px;
          outline: none;
        }
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          background: #fbbf24; /* amber-400 */
          border: 2px solid rgba(0, 0, 0, 0.6);
          border-radius: 9999px;
          margin-top: -4px; /* center the thumb on 8px track */
        }
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: #fbbf24;
          border: 2px solid rgba(0, 0, 0, 0.6);
          border-radius: 9999px;
        }
        .slider::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 6px;
        }
        .slider::-moz-range-track {
          height: 8px;
          border-radius: 6px;
        }
      `}</style>
    </div>
  );
}

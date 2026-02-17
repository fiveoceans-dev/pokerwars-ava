"use client";

import { useEffect, useState } from "react";
import { PlayPageStyles } from "./PlayPageStyles";
import Table from "./Table";
import DealerWindow from "./DealerWindow";
import ChatWindow from "./ChatWindow";
import PlayerActionButtons from "./PlayerActionButtons";
import { useTableViewModel } from "../hooks/useTableViewModel";
import { useGameStore } from "../hooks/useGameStore";
import { usePlayViewModel } from "../hooks/usePlayViewModel";
import useIsMobile from "../hooks/useIsMobile";
import useGameEvents from "../hooks/useGameEvents";
import { captureAndDownloadScreen } from "../utils/screenCapture";
import { 
  Modal, 
  ModalLabel, 
  ModalHeader, 
  ModalRule, 
  ModalFooter, 
  ModalContent 
} from "~~/components/ui/Modal";

interface PlayTableContainerProps {
  tableId: string | null;
}

export default function PlayTableContainer({ tableId }: PlayTableContainerProps) {
  const isMobile = useIsMobile();
  const { 
    joinTable, 
    playerBets, 
    currentTurn, 
    chips, 
    playerStates, 
    playerIds,
    cardsRevealed,
    recentWinners,
    minRaise,
    sitOut,
    sitIn,
    leaveSeat,
    playerAction,
    currentWalletId,
    autoRevealAtShowdown,
    setAutoRevealAtShowdown,
    showCards,
    muckCards,
    phase,
    showCardsIntent,
    setShowCardsIntent,
    tableType
  } = useGameStore();
  const { baseW, baseH, walletSeatIdx } = useTableViewModel();
  const { timer } = usePlayViewModel();
  const [layoutReady, setLayoutReady] = useState(false);
  const [tableScale, setTableScale] = useState(1);
  const [isActionPending, setIsActionPending] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);

  useGameEvents();

  // Derived show-cards state
  const safePlayerIds = Array.isArray(playerIds) ? playerIds : Array(9).fill(null);
  const safePlayerStates = Array.isArray(playerStates) ? playerStates : Array(9).fill("empty");
  const safeCardsRevealed = Array.isArray(cardsRevealed) ? cardsRevealed : Array(9).fill(false);

  const walletSeat = currentWalletId
    ? safePlayerIds.findIndex((id) => id?.toLowerCase() === currentWalletId.toLowerCase())
    : -1;

  const isValidPhase = ["showdown", "payout"].includes(phase || "");
  const hasValidSeat = walletSeat >= 0;
  const notFolded = safePlayerStates[walletSeat] !== "folded" && safePlayerStates[walletSeat] !== "empty";
  const hasCards = hasValidSeat && notFolded;
  const isWinner = recentWinners.has(walletSeat);

  const canRevealCards = isValidPhase && hasCards && !safeCardsRevealed[walletSeat];
  const canMuckCards = isValidPhase && hasCards && !safeCardsRevealed[walletSeat] && !isWinner;

  useEffect(() => {
    if (tableId) {
      joinTable(tableId);
    } else {
      joinTable("cash-3a1b");
    }
  }, [tableId, joinTable]);

  useEffect(() => {
    const calculateLayout = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const paddingV = 0;
      const paddingH = 0;
      const availableWidth = viewportWidth - paddingH;
      const availableHeight = viewportHeight - paddingV;

      const scaleByWidth = availableWidth / baseW;
      const scaleByHeight = availableHeight / baseH;
      const optimalScale = Math.min(scaleByWidth, scaleByHeight, 1);
      const minScale = isMobile ? 0.38 : 0.5;
      const finalScale = isMobile ? Math.max(optimalScale * 0.85, minScale) : Math.max(optimalScale, minScale);
      
      setTableScale((prev) => {
        if (Math.abs(prev - finalScale) < 0.001) return prev;
        return finalScale;
      });
      setLayoutReady(true);
    };

    calculateLayout();
    window.addEventListener("resize", calculateLayout);
    return () => window.removeEventListener("resize", calculateLayout);
  }, [baseW, baseH, isMobile]);

  // Derived state for controls
  const isMyTurn = currentTurn !== null && currentTurn === walletSeatIdx;
  const isSittingOut = walletSeatIdx >= 0 && playerStates[walletSeatIdx] === "sittingOut";
  const myChips = walletSeatIdx >= 0 ? chips[walletSeatIdx] : 0;
  const myCommitted = walletSeatIdx >= 0 ? playerBets[walletSeatIdx] : 0;
  // Filter out null/undefined bets before calculating max
  const validBets = playerBets.filter((b) => typeof b === 'number');
  const currentBet = validBets.length > 0 ? Math.max(...validBets) : 0;

  const handleSitOutToggle = async () => {
    if (walletSeatIdx < 0 || isActionPending) return;
    setIsActionPending(true);
    try {
      if (isSittingOut) await sitIn();
      else await sitOut();
    } finally {
      setIsActionPending(false);
    }
  };

  const executeLeave = async () => {
    setIsActionPending(true);
    try {
      if (isMyTurn) {
        try { await playerAction({ type: "FOLD" }); } catch {}
      }
      await leaveSeat();
    } finally {
      setIsActionPending(false);
      setShowLeaveWarning(false);
    }
  };

  const handleLeaveTable = async () => {
    if (walletSeatIdx < 0 || isActionPending) return;
    
    // For tournaments, show warning modal first
    if (tableType === "stt" || tableType === "mtt") {
      setShowLeaveWarning(true);
    } else {
      await executeLeave();
    }
  };

  const handleScreenCapture = async () => {
    try {
      await captureAndDownloadScreen();
    } catch (error) {
      console.error("Failed to capture screen:", error);
    }
  };

  const handleShowCardsToggle = () => {
    const newIntent = !showCardsIntent;
    setShowCardsIntent(newIntent);
    
    // If we're already in showdown/payout and turning it ON, trigger immediate reveal
    if (newIntent && isValidPhase && hasCards && !safeCardsRevealed[walletSeat]) {
      void showCards();
    }
  };

  return (
    <div
      className="play-page-container"
      data-layout={isMobile ? "mobile" : "desktop"}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh" }}
    >
      <div
        className="table-container"
        role="main"
        style={{
          position: "absolute",
          width: `${baseW}px`,
          height: `${baseH}px`,
          left: "50%", top: "50%",
          transform: `translate(-50%, -50%) scale(${tableScale})`,
          transformOrigin: "center center",
          opacity: layoutReady ? 1 : 0,
          transition: "opacity 0.2s ease, transform 0.3s ease",
        }}
      >
        <Table timer={timer} />
      </div>

      {/* Leave Warning Modal */}
      {showLeaveWarning && (
        <Modal 
          modalId="leave-warning-modal" 
          open={true} 
          onClose={() => setShowLeaveWarning(false)}
        >
          <ModalContent>
            <ModalLabel>Warning</ModalLabel>
            <ModalHeader 
              title="Leaving Table" 
              subtitle="Tournament Registration"
            />
            <ModalRule />
            <div className="space-y-4 py-2">
              <p className="text-sm text-white/80 leading-relaxed">
                Leaving the table does <span className="text-white font-bold underline">not</span> unregister you from the tournament.
              </p>
              <p className="text-xs text-white/60 leading-relaxed">
                You will continue to post blinds while away. Rejoin may not be guaranteed if the tournament state advances or tables are balanced.
              </p>
            </div>
            <ModalFooter>
              <button 
                className="tbtn-secondary" 
                onClick={() => setShowLeaveWarning(false)}
                disabled={isActionPending}
              >
                Stay
              </button>
              <button 
                className="tbtn" 
                onClick={executeLeave}
                disabled={isActionPending}
              >
                {isActionPending ? "Leaving..." : "Leave Table"}
              </button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {/* Top Right Navigation & Controls */}
      <div className="absolute top-[60px] left-0 right-0 z-50 pointer-events-none">
        <div className="content-wrap flex justify-end">
          <div className="flex items-center gap-2 pointer-events-auto">
            {walletSeatIdx >= 0 && (
              <>
                <button 
                  onClick={handleSitOutToggle}
                  disabled={isActionPending}
                  className={`tbtn text-[10px] px-2 h-7 flex items-center justify-center min-w-[70px] ${isSittingOut ? "bg-amber-600/20 border-amber-600/50 text-amber-400" : ""}`}
                >
                  {isSittingOut ? "Sit In" : "Sit Out"}
                </button>
                <button 
                  onClick={handleLeaveTable}
                  disabled={isActionPending}
                  className="tbtn text-[10px] px-2 h-7 flex items-center justify-center text-rose-400 border-rose-400/30 hover:bg-rose-400/10"
                >
                  Leave
                </button>
              </>
            )}
            <button 
              onClick={() => window.history.back()}
              className="tbtn text-[10px] px-3 h-7 flex items-center justify-center text-white/60 hover:text-white"
            >
              Back
            </button>
          </div>
        </div>
      </div>

      {/* Dealer Messages (Chat) - Bottom Left */}
      <div 
        className={`absolute bottom-0 left-0 ${isMobile ? "w-40 h-24 m-2" : "w-64 h-32 m-4"} overflow-hidden z-50`}
      >
        <DealerWindow isMobile={isMobile} />
      </div>

                  {/* Bottom Right Controls (Social & Info) */}

                  <div 

                    className={`absolute bottom-0 right-0 z-50 flex items-end gap-3 ${isMobile ? "m-2" : "m-4"}`}

                  >

                    {/* Social/Utility Column - Standard Scale */}

                    <div className="flex flex-col gap-2 items-stretch mb-1 min-w-[110px]">

                      {/* SHOW CARDS */}

                      {hasCards && !safeCardsRevealed[walletSeat] ? (

                        <button

                          onClick={handleShowCardsToggle}

                          className="tbtn tbtn-tight font-black border border-white/5 bg-black/40 text-white/50 transition-colors flex items-center justify-between gap-3"

                        >

                          <span>SHOW CARDS</span>

                          <div 

                            className={`w-1.5 h-1.5 rounded-sm transition-all flex-shrink-0 ${

                              showCardsIntent 

                                ? "bg-[var(--brand-accent)] shadow-[0_0_8px_rgba(251,191,36,0.6)]" 

                                : "bg-white/5 border border-white/10"

                            }`} 

                          />

                        </button>

                      ) : (

                        <div className="h-6 invisible" />

                      )}

            

                      {/* MUCK CARDS */}

                      {canMuckCards && (

                        <button

                          onClick={() => muckCards()}

                          className="tbtn tbtn-tight font-bold bg-white/5 text-white/40 hover:bg-white/10"

                        >

                          MUCK CARDS

                        </button>

                      )}

                      

                      {/* AUTO-SHOW */}

                      <button

                        onClick={() => setAutoRevealAtShowdown(!autoRevealAtShowdown)}

                        className="tbtn tbtn-tight font-black border border-white/5 bg-black/40 text-white/50 transition-colors flex items-center justify-between gap-3"

                      >

                        <span>AUTO-SHOW</span>

                        <div 

                          className={`w-1.5 h-1.5 rounded-sm transition-all flex-shrink-0 ${

                            autoRevealAtShowdown 

                              ? "bg-[var(--brand-accent)] shadow-[0_0_8px_rgba(251,191,36,0.6)]" 

                              : "bg-white/5 border border-white/10"

                            }`} 

                        />

                      </button>

            

                      {/* SCREENSHOT */}

                      <button

                        onClick={handleScreenCapture}

                        className="tbtn tbtn-tight font-bold bg-white/5 border border-white/5 text-white/40 hover:bg-white/10 hover:text-white/70"

                      >

                        SCREENSHOT

                      </button>

                    </div>

            

                    {/* Chat Component */}

                    <div className={isMobile ? "w-40 h-24" : "w-64 h-32"}>

                      <ChatWindow />

                    </div>

                  </div>
      {/* Player Actions - Bottom Center */}
      {walletSeatIdx >= 0 && (
        <div 
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-auto z-50 pointer-events-none"
          style={{ paddingBottom: isMobile ? '10px' : '20px' }}
        >
          <div className="pointer-events-auto">
            <PlayerActionButtons
              isPlayerTurn={isMyTurn && !isSittingOut}
              currentBet={currentBet}
              playerCommitted={myCommitted}
              playerChips={myChips}
              minRaise={minRaise}
              isMobile={isMobile}
              className="bg-black/60 backdrop-blur-xl p-2 rounded-xl border border-white/10 shadow-2xl"
            />
          </div>
        </div>
      )}

      <PlayPageStyles />
    </div>
  );
}

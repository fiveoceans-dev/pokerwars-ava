"use client";

// Play poker interface with wallet connect

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Table from "../../components/Table";
import AnimatedTitle from "../../components/AnimatedTitle";
import DealerWindow from "../../components/DealerWindow";
import PlayerActionButtons from "../../components/PlayerActionButtons";
import { useGameStore } from "../../hooks/useGameStore";
import { useWalletGameSync } from "../../hooks/useWalletGameSync";
import { useTableViewModel } from "../../hooks/useTableViewModel";
import { usePlayViewModel } from "../../hooks/usePlayViewModel";
import useIsMobile from "../../hooks/useIsMobile";
import useGameEvents from "../../hooks/useGameEvents";

// TODO: display connected address and handle signature (Action Plan 1.3)

function PlayPageInner() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("table");
  const {
    joinTable,
    leaveSeat,
    sitOut,
    sitIn,
    playerAction,
    connectionState,
    playerStates,
    currentWalletId,
    currentTurn,
    chips,
    playerBets,
    minRaise,
  } = useGameStore();
  const { isConnected, address } = useWalletGameSync();
  const { walletSeatIdx, baseW, baseH } = useTableViewModel();
  const [isLeaving, setIsLeaving] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const isMobile = useIsMobile();
  const [tableScale, setTableScale] = useState(1);
  const [uiScale, setUiScale] = useState(1);

  useGameEvents();

  // Check if current player is sitting out based on game state
  const mySeatIndex = walletSeatIdx;
  const isSittingOut =
    mySeatIndex >= 0 && playerStates[mySeatIndex] === "sittingOut";
  const isSeated = mySeatIndex >= 0;

  // Calculate action button props
  const isMyTurn = currentTurn !== null && currentTurn === mySeatIndex;
  const myChips = mySeatIndex >= 0 ? chips[mySeatIndex] : 0;
  const myCommitted = mySeatIndex >= 0 ? playerBets[mySeatIndex] : 0;
  const currentBet = Math.max(...playerBets.filter((bet) => bet !== null));

  const { timer } = usePlayViewModel();

  useEffect(() => {
    if (tableId) {
      joinTable(tableId);
    } else {
      // Default table for backward compatibility
      joinTable("demo");
    }
  }, [tableId, joinTable]);

  // Calculate optimal table scale to fit viewport with controls
  useEffect(() => {
    const calculateLayout = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Fixed dimensions
      const HEADER_HEIGHT = 48; // Game header height
      const CONTROL_PANEL_HEIGHT = isMobile ? 180 : 120; // Control panel space
      const PADDING_VERTICAL = isMobile ? 20 : 40; // Top/bottom padding
      const PADDING_HORIZONTAL = isMobile ? 16 : 32; // Left/right padding
      const CARD_SPACE_TOP = isMobile ? 60 : 80; // Extra space for cards above table

      // Available space for table
      const availableWidth = viewportWidth - PADDING_HORIZONTAL;
      const availableHeight =
        viewportHeight -
        HEADER_HEIGHT -
        CONTROL_PANEL_HEIGHT -
        PADDING_VERTICAL -
        CARD_SPACE_TOP;

      // Calculate scale based on available space
      const scaleByWidth = availableWidth / baseW;
      const scaleByHeight = availableHeight / baseH;
      const optimalScale = Math.min(scaleByWidth, scaleByHeight, 1); // Never scale above 1

      // Set minimum scale for usability - make mobile 10% smaller
      const minScale = isMobile ? 0.36 : 0.5;
      const mobileReduction = isMobile ? 0.9 : 1;
      const finalScale = Math.max(optimalScale * mobileReduction, minScale);

      setTableScale(finalScale);
      setUiScale(Math.max(0.7, Math.min(1, finalScale))); // Keep controls readable
    };

    calculateLayout();
    window.addEventListener("resize", calculateLayout);
    return () => window.removeEventListener("resize", calculateLayout);
  }, [baseW, baseH, isMobile]);

  const handleLeaveTable = useCallback(async () => {
    if (isLeaving) return;

    setIsLeaving(true);

    try {
      // Auto-fold if in hand (following existing pattern)
      if (isMyTurn) {
        try {
          await playerAction({ type: "FOLD" });
          console.log("✅ Auto-folded before leaving");
        } catch (error) {
          console.log(
            "ℹ️ Could not auto-fold (expected if not in turn):",
            error,
          );
        }
      }

      await leaveSeat();
      console.log("✅ Successfully left table");
    } catch (error) {
      console.error("❌ Failed to leave table:", error);
      // Show error to user but don't prevent leaving in future
    } finally {
      setIsLeaving(false);
    }
  }, [walletSeatIdx, isLeaving, isMyTurn, playerAction, leaveSeat]);

  const handleLeaveClick = () => {
    handleLeaveTable();
  };

  const handleSitOutToggle = useCallback(async () => {
    if (walletSeatIdx < 0 || isActionPending) return;

    setIsActionPending(true);

    try {
      if (isSittingOut) {
        await sitIn();
        console.log("✅ Successfully sat in");
      } else {
        await sitOut();
        console.log("✅ Successfully sat out");
      }
      // Don't manually toggle state - let the server response update it
    } catch (error) {
      console.error("❌ Failed to toggle sit out:", error);
      // Could add toast notification here in future
    } finally {
      setIsActionPending(false);
    }
  }, [walletSeatIdx, isSittingOut, sitIn, sitOut, isActionPending]);

  return (
    <div
      className="play-page-container"
      style={{
        backgroundColor: "#05070d",
        backgroundImage:
          "radial-gradient(circle at 20% 20%, rgba(37, 99, 235, 0.18), transparent 30%), radial-gradient(circle at 80% 0%, rgba(56, 189, 248, 0.18), transparent 26%), linear-gradient(135deg, #05070d 0%, #0b1224 50%, #05070d 100%)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Game Header */}
      <div className="game-header">
        <AnimatedTitle text="" />
        {isSeated && (
          <div className="header-actions">
            <button
              onClick={handleSitOutToggle}
              disabled={connectionState === "disconnected" || isActionPending}
              className={`action-btn ${
                connectionState === "disconnected" || isActionPending
                  ? "disabled"
                  : isSittingOut
                    ? "sit-in"
                    : "sit-out"
              }`}
              title={
                isSittingOut ? "Return to active play" : "Sit out next hand"
              }
            >
              {isActionPending
                ? isSittingOut
                  ? "Sitting in…"
                  : "Sitting out…"
                : isSittingOut
                  ? "Sit In"
                  : "Sit Out"}
            </button>

            <button
              onClick={handleLeaveClick}
              disabled={isLeaving}
              className={`action-btn leave ${
                isLeaving
                  ? "disabled"
                  : ""
              }`}
              title="Leave this table (auto-folds if your turn)"
            >
              {isLeaving ? "Leaving…" : "Leave Table"}
            </button>
          </div>
        )}
      </div>

      {/* Table Area - Centered with padding for cards */}
      <div className="table-area">
        <div
          className="table-container"
          style={{
            width: `${baseW}px`,
            height: `${baseH}px`,
            transform: `scale(${tableScale})`,
            transformOrigin: "center center",
          }}
        >
          <Table timer={timer} />
        </div>
      </div>

      {/* Control Panel - Fixed at bottom */}
      <div className="control-panel">
        <div
          className="control-panel-inner"
          style={{
            transform: `scale(${uiScale})`,
            transformOrigin: "center top",
          }}
        >
          <div className="control-sections">
            <div className="control-dealer">
              <DealerWindow isMobile={isMobile} />
            </div>

            <div className="control-actions">
              {walletSeatIdx >= 0 && (
                <PlayerActionButtons
                  isPlayerTurn={isMyTurn && !isSittingOut}
                  currentBet={currentBet}
                  playerCommitted={myCommitted}
                  playerChips={myChips}
                  minRaise={minRaise}
                  isMobile={isMobile}
                />
              )}
            </div>

            <div className="control-chat">
              <div className="chat-card">
                <input
                  type="text"
                  placeholder="Type message..."
                  className="chat-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.value = "";
                    }
                  }}
                />
                <div className="chat-messages">
                  <div className="text-gray-400 italic text-xs">
                    No messages yet...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        /* Main container using CSS Grid for perfect viewport fit */
        .play-page-container {
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          display: grid;
          grid-template-rows: auto minmax(0, 4fr) minmax(0, 1fr);
          grid-template-areas:
            "header"
            "table"
            "controls";
          color: white;
          background-color: #1a202c;
        }

        /* Game Header */
        .game-header {
          grid-area: header;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          height: 48px;
          z-index: 10;
        }

        .header-actions {
          display: flex;
          gap: 8px;
        }

        .action-btn {
          padding: 4px 8px;
          font-size: 10px;
          border: 1px solid #6b7280;
          border-radius: 50px;
          background: rgba(0, 0, 0, 0.3);
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          font-weight: 500;
        }

        .action-btn.sit-in:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .action-btn.sit-out:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .action-btn.leave:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .action-btn.disabled {
          background: #6b7280;
          border-color: #6b7280;
          color: #d1d5db;
          cursor: not-allowed;
          opacity: 0.5;
        }

        /* Table Area - Centered with space for cards */
        .table-area {
          grid-area: table;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: ${isMobile ? "60px 16px 20px" : "80px 32px 20px"};
          overflow: visible;
          position: relative;
          width: 100%;
          max-width: 100vw;
        }

        .table-container {
          position: relative;
          transition: transform 0.3s ease;
          width: 100%;
          max-width: 100%;
          display: flex;
          justify-content: center;
        }

        /* Control Panel - Fixed at bottom */
        .control-panel {
          grid-area: controls;
          padding: ${isMobile ? "8px" : "12px"};
          z-index: 15;
          overflow: hidden;
          display: flex;
          justify-content: center;
          align-items: stretch;
          height: 100%;
          width: 100%;
          max-width: 100vw;
        }

        .control-panel-inner {
          max-width: 100%;
          margin: 0 auto;
          transition: transform 0.3s ease;
          width: 100%;
          height: 100%;
        }

        .control-sections {
          display: grid;
          gap: 12px;
          align-items: stretch;
          grid-template-columns: ${isMobile ? "1fr 1fr" : "1fr 2fr 1fr"};
          grid-template-areas: ${isMobile
            ? '"actions actions" "dealer chat"'
            : '"dealer actions chat"'};
          height: 100%;
        }

        .control-dealer {
          grid-area: dealer;
          min-height: ${isMobile ? "50px" : "60px"};
          padding: 5px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          height: ${isMobile ? "auto" : "100%"};
        }

        .control-actions {
          grid-area: actions;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: ${isMobile ? "150px" : "120px"};
          height: ${isMobile ? "auto" : "100%"};
          max-width: 600px;
          margin: 0 auto;
          background: transparent;
          border: none;
        }

        .control-chat {
          grid-area: chat;
          min-height: ${isMobile ? "50px" : "60px"};
          height: ${isMobile ? "auto" : "100%"};
        }

        .chat-card {
          padding: 5px;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .chat-input {
          width: 100%;
          padding: 8px 12px;
          font-size: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.3);
          color: white;
          outline: none;
          transition: border-color 0.2s ease;
        }

        .chat-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .chat-input:focus {
          border-color: rgba(255, 255, 255, 0.4);
        }

        .chat-messages {
          flex: 1;
          font-size: 11px;
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 40px;
        }

        /* Responsive breakpoints */
        @media (max-width: 768px) {
          .table-area {
            padding: 40px 8px 16px;
          }

          .control-panel {
            padding: 5px;
          }

          .control-sections {
            gap: 8px;
          }

          .control-actions {
            min-height: 150px;
            background: transparent;
            border: none;
          }
        }

        /* Short screens - maintain 80/20 ratio but ensure minimum control panel */
        @media (max-height: 600px) {
          .play-page-container {
            grid-template-rows: auto minmax(0, 3fr) minmax(120px, 1fr);
          }

          .table-area {
            padding: 40px 16px 16px;
          }

          .control-panel {
            padding: 8px;
          }
        }

        /* Very short screens */
        @media (max-height: 480px) {
          .play-page-container {
            grid-template-rows: auto minmax(0, 2fr) minmax(100px, 1fr);
          }

          .table-area {
            padding: 20px 8px 8px;
          }

          .control-dealer {
            height: 40px !important;
          }

          .control-chat {
            height: 40px !important;
          }
        }

        /* Very narrow screens */
        @media (max-width: 480px) {
          .control-sections {
            gap: 6px;
          }

          .control-dealer,
          .control-actions,
          .control-chat {
            padding: 0;
            background: transparent;
            border: none;
          }

          .control-actions {
            min-height: 160px;
            background: transparent;
            border: none;
          }

          .control-dealer {
            min-height: 45px;
          }

          .control-chat {
            min-height: 45px;
          }

          .chat-card {
            padding: 5px;
          }
        }

        @media (max-height: 600px) {
          .table-area {
            padding: 20px 8px 8px;
          }

          .control-dealer,
          .control-chat {
            min-height: 32px;
          }

          /* Keep betting controls inside the card even on short screens */
          .control-actions {
            min-height: 100px;
            background: transparent;
            border: none;
          }
        }

        /* Very small screens */
        @media (max-width: 480px) {
          .game-header {
            padding: 8px 12px;
            height: 40px;
          }

          .action-btn {
            padding: 4px 8px;
            font-size: 11px;
          }
        }
      `}</style>
      <style jsx global>{`
        html,
        body,
        #__next,
        main {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }

        /* Prevent any scrolling on the play page */
        body.play-page {
          overflow: hidden !important;
        }
      `}</style>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <PlayPageInner />
    </Suspense>
  );
}

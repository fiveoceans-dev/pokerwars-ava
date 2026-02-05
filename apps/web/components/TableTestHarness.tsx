"use client";

import { useEffect } from "react";
import { useGameStore } from "~~/hooks/useGameStore";
import { seatStore } from "~~/stores/seatStore";

type TableTestHarnessProps = {
  maxPlayers: 6 | 9;
  tableId: string;
};

const SAMPLE_IDS = [
  "0xA11ce00000000000000000000000000000000001",
  "0xB0b0000000000000000000000000000000000002",
  "0xC4rl000000000000000000000000000000000003",
  "0xD0ra000000000000000000000000000000000004",
  "0xEvan000000000000000000000000000000000005",
  "0xFaye000000000000000000000000000000000006",
  "0xGina000000000000000000000000000000000007",
  "0xHank000000000000000000000000000000000008",
  "0xIris000000000000000000000000000000000009",
];

const SAMPLE_NAMES = [
  "Alice",
  "Bob",
  "Carl",
  "Dora",
  "Evan",
  "Faye",
  "Gina",
  "Hank",
  "Iris",
];

export function TableTestHarness({ maxPlayers, tableId }: TableTestHarnessProps) {
  useEffect(() => {
    const seatsToFill = maxPlayers;
    const playerIds = Array(9).fill(null) as (string | null)[];
    const players = Array(9).fill(null) as (string | null)[];
    const playerHands = Array(9).fill(null) as ([number, number] | "encrypted" | null)[];
    const playerStates = Array(9).fill("empty") as any[];
    const chips = Array(9).fill(0) as number[];
    const bets = Array(9).fill(0) as number[];
    const cardsRevealed = Array(9).fill(false);
    const lastActionLabels = Array(9).fill(null) as (string | null)[];

    seatStore.getState().reset();

    for (let i = 0; i < seatsToFill; i += 1) {
      playerIds[i] = SAMPLE_IDS[i];
      players[i] = SAMPLE_NAMES[i];
      chips[i] = 12000 - i * 900;
      playerStates[i] = "active";
      seatStore.getState().assignSeat(i, { playerId: SAMPLE_IDS[i], name: SAMPLE_NAMES[i] });
    }

    // Variety
    playerStates[1] = "folded";
    lastActionLabels[1] = "Fold";
    playerStates[2] = "allin";
    lastActionLabels[2] = "All In";
    playerStates[4] = "active";
    lastActionLabels[4] = "Call";
    playerStates[5] = "active";
    lastActionLabels[5] = "Raise";

    // Bets and blinds (all seated players)
    for (let i = 0; i < seatsToFill; i += 1) {
      bets[i] = 100 + i * 50;
    }
    bets[0] = 100; // SB
    bets[1] = 200; // BB
    bets[2] = 500; // All-in highlight

    // Sample hands (all players)
    for (let i = 0; i < seatsToFill; i += 1) {
      playerHands[i] = [(i * 7) % 52, (i * 7 + 13) % 52];
      cardsRevealed[i] = true;
    }

    const tableSeats = new Map<string, number>();
    tableSeats.set(tableId, 3);

    const dealerIndex = maxPlayers === 6 ? 4 : 6;

    useGameStore.setState({
      tableId,
      tableMaxPlayers: maxPlayers,
      currentWalletId: SAMPLE_IDS[3],
      players,
      playerIds,
      playerHands,
      playerStates,
      chips,
      playerBets: bets,
      dealerIndex,
      currentTurn: 3,
      minRaise: 200,
      smallBlind: 100,
      bigBlind: 200,
      pot: 4600,
      community: [3, 18, 27, 40, 51],
      street: 1,
      phase: "flop" as any,
      cardsRevealed,
      lastActionLabels,
      timer: 18,
      tableSeats,
      connectionState: "connected",
      connectionError: null,
    });
  }, [maxPlayers, tableId]);

  return null;
}

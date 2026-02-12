import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGameStore } from "../useGameStore";
import { ServerEvent } from "@hyper-poker/engine/network/networking";

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  readyState = 1; // OPEN

  constructor(public url: string) {}
}

global.WebSocket = MockWebSocket as any;

describe("useGameStore", () => {
  beforeEach(() => {
    useGameStore.setState({
      balances: { coins: 0, tickets: { ticket_x: 0, ticket_y: 0, ticket_z: 0 } },
      activeStatus: { cashActive: false, cashTableIds: [], sngActive: false, mttActive: false },
      chips: Array(9).fill(0),
      players: Array(9).fill(null),
    });
  });

  it("should update balances on BALANCE_UPDATE event", () => {
    const { result } = renderHook(() => useGameStore());
    
    // Simulate WebSocket connection and message
    const socket = result.current.socket as unknown as MockWebSocket;
    
    // If socket isn't ready yet in test env, manually trigger state
    // But useGameStore creates socket on mount. 
    // We can simulate receiving a message via the onmessage handler if we can access the socket instance
    // The store exposes the socket.
    
    expect(socket).toBeDefined();

    const event: ServerEvent = {
      tableId: "",
      type: "BALANCE_UPDATE",
      playerId: "player-1",
      coins: "1000",
      tickets: { ticket_x: "5", ticket_y: "2", ticket_z: "0" },
    };

    act(() => {
      socket.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
    });

    expect(result.current.balances.coins).toBe(1000);
    expect(result.current.balances.tickets.ticket_x).toBe(5);
    expect(result.current.balances.tickets.ticket_y).toBe(2);
  });

  it("should update status on USER_STATUS_UPDATE event", () => {
    const { result } = renderHook(() => useGameStore());
    const socket = result.current.socket as unknown as MockWebSocket;

    const event: ServerEvent = {
      tableId: "",
      type: "USER_STATUS_UPDATE",
      playerId: "player-1",
      cashActive: true,
      cashTableIds: ["table-1"],
      sngActive: false,
      mttActive: true,
    };

    act(() => {
      socket.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
    });

    expect(result.current.activeStatus.cashActive).toBe(true);
    expect(result.current.activeStatus.mttActive).toBe(true);
    expect(result.current.activeStatus.cashTableIds).toContain("table-1");
  });

  it("should apply TABLE_SNAPSHOT correctly", () => {
    const { result } = renderHook(() => useGameStore());
    const socket = result.current.socket as unknown as MockWebSocket;

    const snapshot = {
      id: "table-1",
      phase: "preflop",
      seats: [
        { pid: "p1", chips: 500, status: "active", nickname: "Player 1" },
        { pid: "p2", chips: 1000, status: "active", nickname: "Player 2" },
      ],
      pot: 150,
      communityCards: [],
    };

    const event: ServerEvent = {
      tableId: "table-1",
      type: "TABLE_SNAPSHOT",
      table: snapshot as any,
      maxPlayers: 9
    };

    act(() => {
      socket.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
    });

    expect(result.current.players[0]).toBe("Player 1");
    expect(result.current.chips[0]).toBe(500);
    expect(result.current.chips[1]).toBe(1000);
    expect(result.current.pot).toBe(150);
  });
});

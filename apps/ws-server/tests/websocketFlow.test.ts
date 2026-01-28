// @vitest-environment jsdom
import { EventEmitter } from "events";
import { describe, it, expect } from "vitest";
import { GameEngine, type ServerEvent } from "../../game-engine";
import { SessionManager, type Session } from "../src/sessionManager";

class MockSocket extends EventEmitter {
  public sent: ServerEvent[] = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
}

describe("websocket session flow", () => {
  it("handles attach, seating, action, disconnect/reconnect and timeout", async () => {
    const sessions = new SessionManager(50); // 50ms grace period
    const engine = new GameEngine("table1");
    const seatMap = new Map<string, number>();
    const clients: MockSocket[] = [];

    function broadcast(tableId: string, event: any) {
      const msg = JSON.stringify({ tableId, ...event });
      for (const ws of clients) {
        const session = sessions.get(ws as any);
        if (session?.roomId === tableId) {
          ws.send(msg);
        }
      }
    }

    // create two clients and attach
    const wsA = new MockSocket();
    const wsB = new MockSocket();
    clients.push(wsA, wsB);
    const sessionA = sessions.attach(wsA as any, "userA")!;
    const sessionB = sessions.attach(wsB as any, "userB")!;
    sessionA.roomId = "table1";
    sessionB.roomId = "table1";

    // seat both players
    engine.addPlayer({ id: "userA", nickname: "UserA", seat: 0, chips: 100 });
    seatMap.set("userA", 0);
    broadcast("table1", { type: "PLAYER_JOINED", seat: 0, playerId: "userA" });

    engine.addPlayer({ id: "userB", nickname: "UserB", seat: 1, chips: 100 });
    seatMap.set("userB", 1);
    broadcast("table1", { type: "PLAYER_JOINED", seat: 1, playerId: "userB" });

    engine.startHand();
    broadcast("table1", { type: "HAND_START" });
    broadcast("table1", { type: "TABLE_SNAPSHOT", table: engine.getState() });

    expect(engine.getState().players).toHaveLength(2);
    expect(wsB.sent.filter((e) => e.type === "PLAYER_JOINED").length).toBe(2);

    // player A takes an action
    const acting =
      engine.getState().players[engine.getState().currentTurnIndex].id;
    engine.handleAction(acting, { type: "call" });
    broadcast("table1", {
      type: "PLAYER_ACTION_APPLIED",
      playerId: acting,
      action: "CALL",
    });
    expect(wsB.sent.some((e) => e.type === "PLAYER_ACTION_APPLIED")).toBe(true);

    // player A disconnects
    sessions.handleDisconnect(sessionA, (s: Session) => {
      const seatIndex = seatMap.get("userA")!;
      broadcast("table1", {
        type: "PLAYER_DISCONNECTED",
        seat: seatIndex,
        playerId: "userA",
      });
      s.timeout = setTimeout(() => {
        seatMap.delete("userA");
        const idx = engine
          .getState()
          .players.findIndex((p) => p.id === "userA");
        if (idx !== -1) engine.getState().players.splice(idx, 1);
        broadcast("table1", {
          type: "PLAYER_LEFT",
          seat: seatIndex,
          playerId: "userA",
        });
        broadcast("table1", {
          type: "TABLE_SNAPSHOT",
          table: engine.getState(),
        });
        sessions.expire(s);
      }, sessions.getDisconnectGraceMs);
    });
    expect(wsB.sent.some((e) => e.type === "PLAYER_DISCONNECTED")).toBe(true);

    // reconnect within grace period
    const wsA2 = new MockSocket();
    clients.push(wsA2);
    const existing = sessions.getByUserId("userA")!;
    sessions.handleReconnect(existing);
    sessions.replaceSocket(existing, wsA2 as any);
    broadcast("table1", {
      type: "PLAYER_REJOINED",
      seat: seatMap.get("userA")!,
      playerId: "userA",
    });
    wsA2.send(
      JSON.stringify({
        tableId: "table1",
        type: "TABLE_SNAPSHOT",
        table: engine.getState(),
      }),
    );

    await new Promise((r) => setTimeout(r, sessions.getDisconnectGraceMs + 20));
    expect(engine.getState().players.some((p) => p.id === "userA")).toBe(true);
    expect(wsB.sent.some((e) => e.type === "PLAYER_REJOINED")).toBe(true);

    // disconnect again and allow timeout
    sessions.handleDisconnect(existing, (s: Session) => {
      const seatIndex = seatMap.get("userA")!;
      broadcast("table1", {
        type: "PLAYER_DISCONNECTED",
        seat: seatIndex,
        playerId: "userA",
      });
      s.timeout = setTimeout(() => {
        seatMap.delete("userA");
        const idx = engine
          .getState()
          .players.findIndex((p) => p.id === "userA");
        if (idx !== -1) engine.getState().players.splice(idx, 1);
        broadcast("table1", {
          type: "PLAYER_LEFT",
          seat: seatIndex,
          playerId: "userA",
        });
        broadcast("table1", {
          type: "TABLE_SNAPSHOT",
          table: engine.getState(),
        });
        sessions.expire(s);
      }, sessions.getDisconnectGraceMs);
    });

    await new Promise((r) => setTimeout(r, sessions.getDisconnectGraceMs + 20));
    expect(engine.getState().players.some((p) => p.id === "userA")).toBe(false);
    expect(wsB.sent.some((e) => e.type === "PLAYER_LEFT")).toBe(true);
  });
});

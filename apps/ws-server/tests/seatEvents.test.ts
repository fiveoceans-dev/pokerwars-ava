import { describe, expect, it } from "vitest";
import { WebSocketFSMBridge } from "../src/pokerWebSocketServer";
import { SessionManager } from "../src/sessionManager";

// Ensure seat events are emitted alongside snapshots

describe("seat event emission", () => {
  it("emits PLAYER_JOINED and PLAYER_LEFT with snapshots", async () => {
    const sessions = new SessionManager(50);
    const bridge = new WebSocketFSMBridge(sessions);
    const broadcasts: any[] = [];
    bridge.on("broadcast", (_table, evt) => broadcasts.push(evt));

    const engine = bridge.getEngine("table1");

    await engine.dispatch({
      t: "PlayerJoin",
      seat: 0,
      pid: "p1",
      chips: 100,
      nickname: "P1",
    } as any);
    await new Promise((r) => setTimeout(r, 0));

    const joinEvent = broadcasts.find((e) => e.type === "PLAYER_JOINED");
    expect(joinEvent).toBeDefined();
    expect(joinEvent.seat).toBe(0);
    expect(joinEvent.playerId).toBe("p1");
    expect(broadcasts.some((e) => e.type === "TABLE_SNAPSHOT")).toBe(true);

    broadcasts.length = 0;

    await engine.dispatch({ t: "PlayerLeave", seat: 0, pid: "p1" } as any);
    await new Promise((r) => setTimeout(r, 0));

    const leaveEvent = broadcasts.find((e) => e.type === "PLAYER_LEFT");
    expect(leaveEvent).toBeDefined();
    expect(leaveEvent.seat).toBe(0);
    expect(leaveEvent.playerId).toBe("p1");
    expect(broadcasts.some((e) => e.type === "TABLE_SNAPSHOT")).toBe(true);
  });
});

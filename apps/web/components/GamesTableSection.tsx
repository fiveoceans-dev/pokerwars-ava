"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LobbyTable } from "~~/game-engine";
import { resolveWebSocketUrl } from "~~/utils/ws-url";

export default function GamesTableSection() {
  const [tables, setTables] = useState<LobbyTable[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.WebSocket) return;
    const wsUrl = resolveWebSocketUrl();
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ cmdId: Date.now().toString(), type: "LIST_TABLES" }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "TABLE_LIST") {
          setTables(msg.tables);
        }
      } catch (error) {
        console.error("Failed to parse table list", error);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl">Live Tables</h2>
        <span className="text-[11px] uppercase tracking-[0.4em] text-white/50">Cash</span>
      </div>
      <div className="rule" aria-hidden="true" />
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-white/60 uppercase text-[11px] tracking-[0.14em]">
            <tr>
              <th className="px-2 py-2 text-left">Table</th>
              <th className="px-2 py-2 text-left">Game</th>
              <th className="px-2 py-2 text-center">Players</th>
              <th className="px-2 py-2 text-center">Buy-in</th>
              <th className="px-2 py-2 text-center">Blinds</th>
              <th className="px-2 py-2 text-center">Prize</th>
              <th className="px-2 py-2 text-center">Join</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.id} className="border-b border-white/10">
                <td className="px-2 py-2">{t.name}</td>
                <td className="px-2 py-2">{t.gameType}</td>
                <td className="px-2 py-2 text-center">
                  {t.playerCount}/{t.maxPlayers}
                </td>
                <td className="px-2 py-2 text-center">
                  {t.buyIn ? `${t.buyIn.min}-${t.buyIn.max} chips` : "—"}
                </td>
                <td className="px-2 py-2 text-center">
                  ${t.smallBlind}/{t.bigBlind}
                </td>
                <td className="px-2 py-2 text-center">
                  {t.prizePool ? `${t.prizePool}` : "—"}
                </td>
                <td className="px-2 py-2 text-center">
                  <Link href={`/play?table=${t.id}`} className="tbtn text-xs font-semibold">
                    Join
                  </Link>
                </td>
              </tr>
            ))}
            {tables.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-sm text-white/60" colSpan={7}>
                  No tables available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

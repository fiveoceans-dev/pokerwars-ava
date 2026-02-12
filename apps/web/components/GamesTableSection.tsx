"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LobbyTable } from "~~/game-engine";
import { resolveWebSocketUrl } from "~~/utils/ws-url";
import { useActiveStatus } from "~~/hooks/useActiveStatus";

export default function GamesTableSection() {
  const [tables, setTables] = useState<LobbyTable[]>([]);
  const activeStatus = useActiveStatus();
  const activeCashTables = useMemo(
    () => new Set(activeStatus.cashTableIds || []),
    [activeStatus.cashTableIds],
  );
  const visibleTables = useMemo(() => {
    const cash = tables.filter((t) => !/^mtt-|^stt-/i.test(t.id));
    if (activeCashTables.size === 0) return cash;
    return [...cash].sort((a, b) => {
      if (activeCashTables.has(a.id)) return -1;
      if (activeCashTables.has(b.id)) return 1;
      return 0;
    });
  }, [tables, activeCashTables]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.WebSocket) return;
    const wsUrl = resolveWebSocketUrl();
    if (!wsUrl) return;
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
            {visibleTables.map((t) => {
              const isActive = activeCashTables.has(t.id);
              return (
              <tr key={t.id} className={`border-b border-white/10 ${isActive ? "bg-white/5" : ""}`}>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <span>{t.name}</span>
                    {isActive ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.7)]"
                        aria-label="active table"
                      />
                    ) : null}
                  </div>
                </td>
                <td className="px-2 py-2">{t.gameType}</td>
                <td className="px-2 py-2 text-center">
                  {t.playerCount}/{t.maxPlayers}
                </td>
                <td className="px-2 py-2 text-center">
                  {t.buyIn
                    ? `${Math.round(t.buyIn.min / t.bigBlind)}-${Math.round(
                        t.buyIn.max / t.bigBlind,
                      )} BB`
                    : "—"}
                </td>
                <td className="px-2 py-2 text-center">
                  {t.smallBlind}/{t.bigBlind}
                </td>
                <td className="px-2 py-2 text-center">
                  {t.prizePool ? `${t.prizePool}` : "—"}
                </td>
                <td className="px-2 py-2 text-center">
                  <Link
                    href={`/${t.id}`}
                    className="tbtn text-xs font-semibold"
                  >
                    Join
                  </Link>
                </td>
              </tr>
              );
            })}
            {visibleTables.length === 0 ? (
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

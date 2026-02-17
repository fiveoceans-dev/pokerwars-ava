"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LobbyTable } from "~~/game-engine";
import { resolveWebSocketUrl } from "~~/utils/ws-url";
import { useActiveStatus } from "~~/hooks/useActiveStatus";
import { useGameStore } from "~~/hooks/useGameStore";

export default function GamesTableSection() {
  const router = useRouter();
  const [tables, setTables] = useState<LobbyTable[]>([]);
  const [sort, setSort] = useState<{ key: "name" | "players" | "blinds" | "prize"; dir: "asc" | "desc" } | null>(null);
  const activeStatus = useActiveStatus();
  const socket = useGameStore((s) => s.socket);
  
  const activeCashTables = useMemo(
    () => new Set(activeStatus.cashTableIds || []),
    [activeStatus.cashTableIds],
  );

  const toggleSort = (key: "name" | "players" | "blinds" | "prize") => {
    setSort(prev => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  };

  const openTable = (clickedTableId: string) => {
    // Requirement: "open a table where users is sittted or a random table"
    if (activeStatus.cashTableIds && activeStatus.cashTableIds.length > 0) {
      // If we are seated at the clicked table, go there
      if (activeStatus.cashTableIds.includes(clickedTableId)) {
        router.push(`/${clickedTableId}`);
      } else {
        // If seated elsewhere, prefer the first active table
        router.push(`/${activeStatus.cashTableIds[0]}`);
      }
    } else {
      // Not playing, go to clicked table
      router.push(`/${clickedTableId}`);
    }
  };

  const visibleTables = useMemo(() => {
    const cash = tables.filter((t) => !/^mtt-|^stt-/i.test(t.id));
    
    return [...cash].sort((a, b) => {
      // 1. Always prioritize active (seated) tables
      const aActive = activeCashTables.has(a.id);
      const bActive = activeCashTables.has(b.id);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      // 2. Apply manual sort if selected
      if (sort) {
        const { key, dir } = sort;
        const factor = dir === "asc" ? 1 : -1;
        if (key === "name") return factor * a.name.localeCompare(b.name);
        if (key === "players") return factor * (a.playerCount - b.playerCount);
        if (key === "blinds") return factor * (a.bigBlind - b.bigBlind);
        if (key === "prize") return factor * ((a.prizePool || 0) - (b.prizePool || 0));
      }

      // 3. Default sort: Stakes (BB) ASC, then most players DESC
      if (a.bigBlind !== b.bigBlind) return a.bigBlind - b.bigBlind;
      return b.playerCount - a.playerCount;
    });
  }, [tables, activeCashTables, sort]);

  useEffect(() => {
    if (!socket) return;

    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "TABLE_LIST") {
          setTables(msg.tables);
        }
      } catch (error) {
        console.error("Failed to parse table list", error);
      }
    };

    // Request initial list
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ cmdId: Date.now().toString(), type: "LIST_TABLES" }));
    }

    socket.addEventListener("message", handler);
    return () => socket.removeEventListener("message", handler);
  }, [socket]);

  const headerClass = "px-2 py-2 text-left cursor-pointer select-none hover:text-white transition-colors uppercase text-[11px] tracking-[0.14em]";

  return (
    <section className="space-y-3">
      <div className="rule" aria-hidden="true" />
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className={headerClass} onClick={() => toggleSort("name")}>Table</th>
              <th className="px-2 py-2 text-left uppercase text-[11px] tracking-[0.14em]">Game</th>
              <th className={`${headerClass} text-center`} onClick={() => toggleSort("players")}>Players</th>
              <th className="px-2 py-2 text-center uppercase text-[11px] tracking-[0.14em]">Buy-in</th>
              <th className={`${headerClass} text-center`} onClick={() => toggleSort("blinds")}>Blinds</th>
              <th className={`${headerClass} text-center`} onClick={() => toggleSort("prize")}>Prize</th>
              <th className="px-2 py-2 text-center uppercase text-[11px] tracking-[0.14em]">Join</th>
            </tr>
          </thead>
          <tbody>
            {visibleTables.map((t) => {
              const isActive = activeCashTables.has(t.id);
              return (
              <tr 
                key={t.id} 
                className={`border-b border-white/10 hover:bg-white/5 cursor-pointer transition-colors ${isActive ? "bg-white/5" : ""}`}
                onClick={() => openTable(t.id)}
              >
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <span className={isActive ? "font-bold text-white" : ""}>{t.name}</span>
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
                <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
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

"use client";

import { useMemo } from "react";
import { useWallet } from "~~/components/providers/WalletProvider";
import { useGameStore } from "~~/hooks/useGameStore";
import { useBalances } from "~~/hooks/useBalances";

export function DebugPanel() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "1";
  const { status, address } = useWallet();
  const { connectionState, tableId, currentWalletId } = useGameStore();
  const { balances, hydrated, walletForBalance } = useBalances();

  const lines = useMemo(
    () => [
      `wallet=${address ?? "—"} (${status})`,
      `ws=${connectionState}`,
      `table=${tableId ?? "—"}`,
      `currentWalletId=${currentWalletId ?? "—"}`,
      `walletForBalance=${walletForBalance ?? "—"}`,
      `balances=${hydrated ? `${balances.coins} | X:${balances.tickets.ticket_x} Y:${balances.tickets.ticket_y} Z:${balances.tickets.ticket_z}` : "—"}`,
    ],
    [address, status, connectionState, tableId, currentWalletId, walletForBalance, hydrated, balances],
  );

  if (!enabled) return null;

  return (
    <div className="fixed bottom-3 right-3 z-50 max-w-[320px] rounded border border-white/10 bg-black/80 px-3 py-2 text-[11px] text-white/80">
      <div className="text-[10px] uppercase tracking-[0.3em] text-white/50 mb-1">Debug</div>
      <div className="space-y-1">
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
}

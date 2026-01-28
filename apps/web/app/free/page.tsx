"use client";

import { useEffect, useMemo, useState } from "react";
import { notifySuccess } from "~~/utils/notifications";
import { useBalances } from "~~/hooks/useBalances";

export default function FreePage() {
  const {
    balances,
    hydrated,
    claimFreeCoins,
    lastClaimAt,
    freeClaimAmount,
    freeClaimCooldownMs,
  } = useBalances();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remainingMs = useMemo(() => {
    if (!lastClaimAt) return 0;
    const nextAt = lastClaimAt + freeClaimCooldownMs;
    return Math.max(0, nextAt - now);
  }, [lastClaimAt, freeClaimCooldownMs, now]);

  const canClaim = hydrated && remainingMs === 0;

  const handleClaim = async () => {
    const result = await claimFreeCoins();
    if (result.ok) {
      notifySuccess(`+${freeClaimAmount} coins added`);
    }
  };

  const countdownLabel = () => {
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const buttonLabel = !hydrated
    ? "Loading…"
    : canClaim
      ? `Claim ${freeClaimAmount} coins`
      : `Available in ${countdownLabel()}`;

  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl md:text-3xl">Free</h1>
          <span className="text-[11px] uppercase tracking-[0.4em] text-white/50">
            Get Free Coins
          </span>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-lg text-white">Claim free coins</p>
            <p className="text-sm text-white/70">
              Receive {freeClaimAmount} coins every 5 minutes.
            </p>
            <p className="text-xs text-white/50 mt-2">
              Balance: {hydrated ? balances.coins : "—"} coins
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 text-xs text-white/50">
            <button type="button" className="tbtn" onClick={handleClaim}>
              {buttonLabel}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

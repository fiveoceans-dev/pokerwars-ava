"use client";

import { useState } from "react";
import { 
  Modal, 
  ModalLabel, 
  ModalContent,
  ModalFooter
} from "~~/components/ui/Modal";
import { notifyError } from "~~/utils/notifications";
import { useBalances } from "~~/hooks/useBalances";
import { formatNumber } from "~~/utils/format";
import { useWallet } from "~~/components/providers/WalletProvider";


export default function FreePage() {
  const {
    balances,
    hydrated,
    claimFreeCoins,
    freeClaimAmount,
    refreshBalances,
  } = useBalances();
  const { status, isAuthenticated, ensureAuth } = useWallet();
  const [showCongrats, setShowCongrats] = useState(false);
  const isWalletConnecting = status === "connecting";
  const isWalletConnected = status === "connected";

  const handleClaim = async () => {
    if (!isWalletConnected) {
      window.dispatchEvent(new Event("open-wallet-connect"));
      return;
    }
    if (!isAuthenticated) {
      const ok = await ensureAuth();
      if (!ok) {
        notifyError("Wallet not authenticated");
        return;
      }
    }
    const result = await claimFreeCoins();
    if (result.ok) {
      await refreshBalances();
      setShowCongrats(true);
    } else if (result.error) {
      notifyError(result.error);
    }
  };

  const buttonLabel = !hydrated ? "Loading…" : "Claim Coins";

  const buttonDisabled = !hydrated || isWalletConnecting;

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
              Receive {formatNumber(freeClaimAmount)} coins every 10 hours.
            </p>
            <p className="text-xs text-white/50 mt-2">
              Balance: {hydrated ? formatNumber(balances.coins) : "—"} coins
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="tbtn"
              onClick={handleClaim}
              disabled={buttonDisabled}
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </div>
      <Modal
        modalId="claim-coins-modal"
        open={showCongrats}
        onClose={() => setShowCongrats(false)}
      >
        <ModalContent>
          <ModalLabel>Congrats</ModalLabel>
          <p className="text-sm text-white/70">
            {formatNumber(freeClaimAmount)} coins sent to your wallet.
          </p>
          <ModalFooter>
            <button type="button" className="tbtn" onClick={() => setShowCongrats(false)}>
              Close
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </main>
  );
}

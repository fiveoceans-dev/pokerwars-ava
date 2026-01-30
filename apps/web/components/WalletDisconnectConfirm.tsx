"use client";

import { useEffect, useState } from "react";
import GenericModal from "~~/components/ui/GenericModal";
import { useWallet } from "~~/components/providers/WalletProvider";

export function WalletDisconnectConfirm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { disconnect } = useWallet();

  return (
    <GenericModal
      modalId="disconnect-confirm"
      open={open}
      onClose={onClose}
      className="bg-black text-white border border-white/10"
    >
      <div className="space-y-3 text-sm text-white/80">
        <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">Confirm</div>
        <p>Disconnect wallet?</p>
        <div className="flex justify-end gap-2 text-xs">
          <button className="tbtn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="tbtn"
            onClick={() => {
              onClose();
              disconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      </div>
    </GenericModal>
  );
}

export function WalletDisconnectConfirmHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-wallet-disconnect", handler);
    return () => window.removeEventListener("open-wallet-disconnect", handler);
  }, []);

  return <WalletDisconnectConfirm open={open} onClose={() => setOpen(false)} />;
}

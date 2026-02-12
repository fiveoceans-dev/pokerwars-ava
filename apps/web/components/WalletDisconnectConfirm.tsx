"use client";

import { useEffect, useState } from "react";
import { 
  Modal, 
  ModalLabel, 
  ModalFooter, 
  ModalContent 
} from "~~/components/ui/Modal";
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
    <Modal
      modalId="disconnect-confirm"
      open={open}
      onClose={onClose}
    >
      <ModalContent>
        <ModalLabel>Confirm</ModalLabel>
        <p>Disconnect wallet?</p>
        <ModalFooter>
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
        </ModalFooter>
      </ModalContent>
    </Modal>
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

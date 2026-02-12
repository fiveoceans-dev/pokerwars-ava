import { useState } from "react";
import Button from "./Button";
import GenericModal from "./GenericModal";

export function WalletModal(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  return (
    <div>
      <Button onClick={() => setOpen(true)}>
        {connected ? "Wallet" : "Connect Wallet"}
      </Button>
      <GenericModal
        modalId="legacy-wallet-modal"
        open={open}
        onClose={() => setOpen(false)}
        className="w-80"
      >
        <div className="space-y-4">
          {connected ? (
            <div className="space-y-4">
              <p className="text-white">0x1234...abcd</p>
              <Button onClick={() => setConnected(false)} className="w-full">
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-white">Connect your wallet</p>
              <Button onClick={() => setConnected(true)} className="w-full">
                Connect
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        </div>
      </GenericModal>
    </div>
  );
}

export default WalletModal;

import { useState } from "react";
import Button from "./Button";

export function WalletModal(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  return (
    <div>
      <Button onClick={() => setOpen(true)}>
        {connected ? "Wallet" : "Connect Wallet"}
      </Button>
      {open && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
          <div className="bg-primary p-6 rounded-md w-80">
            {connected ? (
              <div className="space-y-4">
                <p>0x1234...abcd</p>
                <Button onClick={() => setConnected(false)}>Disconnect</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p>Connect your wallet</p>
                <Button onClick={() => setConnected(true)}>Connect</Button>
              </div>
            )}
            <Button
              variant="ghost"
              className="mt-4 w-full"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default WalletModal;

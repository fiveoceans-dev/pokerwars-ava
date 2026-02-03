"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { formatWalletLabel, useWallet } from "~~/components/providers/WalletProvider";
import { readPublicEnv } from "~~/utils/public-env";

const WalletConnectDialog = dynamic(
  () => import("~~/components/wallet/WalletConnectDialog").then((m) => m.WalletConnectDialog),
  { ssr: false },
);

export function WalletConnectButton({ showButton = true }: { showButton?: boolean }) {
  const { address, status } = useWallet();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuContainer, setMenuContainer] = useState<HTMLDivElement | null>(null);
  const isConfigured = typeof process !== "undefined"
    ? Boolean(readPublicEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID") || process.env.WALLETCONNECT_PROJECT_ID)
    : true;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const handler = () => {
      setMenuOpen(false);
      setIsDialogOpen(true);
    };
    window.addEventListener("open-wallet-connect", handler);
    return () => window.removeEventListener("open-wallet-connect", handler);
  }, []);

  // Close the menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (!menuContainer) return;
      if (event.target instanceof Node && menuContainer.contains(event.target)) {
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen, menuContainer]);

  const isConnected = status === "connected" && !!address;
  const isConnecting = status === "connecting";

  // Avoid hydration mismatch: only show connected label once mounted on client
  const label = isMounted && isConnected ? formatWalletLabel(address) : "Connect Wallet";
  const showMenu = isMounted && isConnected;

  const handleButtonClick = () => {
    if (isConnecting) return;
    if (!showMenu) {
      setIsDialogOpen(true);
      return;
    }
    setMenuOpen(true);
  };

  return (
    <>
      {showButton ? (
        <div
          className="relative"
          ref={setMenuContainer}
        >
          <button
            type="button"
            className={`tbtn tbtn-tight nav-btn ${isConnecting ? "opacity-60" : ""}`}
            onClick={handleButtonClick}
            onMouseEnter={() => setIsDialogOpen(false)}
            onBlur={(e) => {
              if (!menuContainer?.contains(e.relatedTarget as Node)) {
                setMenuOpen(false);
              }
            }}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            disabled={isConnecting}
            aria-disabled={!isConfigured}
          >
            {isConnecting ? "Confirm…" : label}
          </button>
          {showMenu && menuOpen ? (
            <div className="wallet-menu pointer-events-auto text-xs">
              <Link
                href="/account"
                className="tbtn tbtn-tight nav-btn wallet-menu-item"
                onClick={() => setMenuOpen(false)}
                tabIndex={0}
              >
                Account
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  window.dispatchEvent(new Event("open-wallet-disconnect"));
                }}
                className="tbtn tbtn-tight nav-btn wallet-menu-item"
                tabIndex={0}
              >
                Disconnect
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <WalletConnectDialog
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </>
  );
}

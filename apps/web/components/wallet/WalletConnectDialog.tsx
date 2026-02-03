"use client";

import { useMemo, useState } from "react";
import GenericModal from "~~/components/ui/GenericModal";
import { useWallet } from "~~/components/providers/WalletProvider";
import { notifyError, notifySuccess } from "~~/utils/notifications";
import {
  AVAILABLE_NETWORKS,
  type NetworkConfig,
  type SupportedNetworkId,
} from "~~/config/networks";
import { useConnect } from "wagmi";

interface WalletConnectDialogProps {
  open: boolean;
  onClose: () => void;
}

const storageKeysToClear = ["walletAddress", "sessionId"];

function clearWalletStorage(): void {
  if (typeof window === "undefined") return;
  storageKeysToClear.forEach((key) => window.localStorage.removeItem(key));
  Object.keys(window.localStorage).forEach((key) => {
    if (key.includes("wallet") || key.includes("session") || key.includes("connect")) {
      window.localStorage.removeItem(key);
    }
  });
}

const NETWORK_ORDER: SupportedNetworkId[] = [
  "hyperliquid-mainnet",
  "hyperliquid-testnet",
];

const WALLET_BADGE_STYLE =
  "text-[var(--brand-accent)] text-xs font-semibold";

export function WalletConnectDialog({ open, onClose }: WalletConnectDialogProps) {

  const {
    connectDemo,
    disconnect,
    isDemo,
    status,
    address,
    network,
    networkId,
    setNetwork,
  } = useWallet();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();

  const networkConfigured = Boolean(network.chainId && network.rpcUrls.length);

  const networksForSelect = useMemo<NetworkConfig[]>(() => {
    const ordered = NETWORK_ORDER.map((id) =>
      AVAILABLE_NETWORKS.find((item) => item.id === id),
    ).filter((item): item is NetworkConfig => Boolean(item));

    if (!ordered.some((item) => item.id === networkId)) {
      const fallback = AVAILABLE_NETWORKS.find((item) => item.id === networkId);
      if (fallback) ordered.push(fallback);
    }

    return ordered;
  }, [networkId]);

  const installedWallets = useMemo(() => {
    return connectors.map((connector) => ({
      id: connector.id,
      label: connector.name,
      ready: connector.ready ?? true,
      connector,
    }));
  }, [connectors]);

  if (!open) {
    return null;
  }

  const closeModal = () => {
    onClose();
  };

  const handleConnect = async (connector: (typeof connectors)[number]) => {
    try {
      await connectAsync({ connector });
      closeModal();
    } catch (err) {
      console.error("Wallet connect failed", err);
      notifyError(err instanceof Error ? err.message : "Failed to connect wallet");
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      closeModal();
    } catch (err) {
      console.error("Wallet disconnect failed", err);
      notifyError(err instanceof Error ? err.message : "Failed to disconnect wallet");
    }
  };

  const handleDemoPlayer = async () => {
    clearWalletStorage();
    try {
      await connectDemo();
      closeModal();
    } catch (err) {
      console.error("Demo connect failed", err);
      notifyError(err instanceof Error ? err.message : "Failed to create demo player");
    }
  };

  const buttonBase =
    "tbtn flex w-full items-center gap-2 px-0 py-1 text-sm font-semibold text-white/80 hover:text-[var(--brand-accent)]";

  const demoIcon = (
    <span className="text-[var(--brand-accent)] text-xs font-semibold">
      DP
    </span>
  );

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      notifySuccess("Address copied", {
        icon: "📋",
        duration: 1500,
        style: { borderColor: "#1f2937", color: "#f9fafb", background: "#0b0f1c" },
      });
    } catch (err) {
      console.error("Copy address failed", err);
    }
  };

  return (
    <GenericModal
      modalId="connect-modal"
      open={open}
      onClose={closeModal}
      className="bg-black text-white border border-white/10 connect-modal"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xl text-white">Connect</h3>
        <button
          type="button"
          onClick={closeModal}
          className="tbtn text-xs"
          aria-label="Close connect dialog"
        >
          Close
        </button>
      </div>
      <p className="mt-2 text-sm text-white/70">
        Connect a wallet or explore instantly as a demo player.
      </p>

      <div className="mt-4 space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-white/60" htmlFor="network-select">
            Network
          </label>
          <div className="inputline">
            <span className="prompt">&gt;</span>
            <select
              id="network-select"
              value={networkId}
              onChange={(event) => setNetwork(event.target.value as SupportedNetworkId)}
              className="w-full bg-transparent px-0 py-1 text-sm font-semibold text-white focus:outline-none"
            >
            {networksForSelect.map((item) => {
              const configured = Boolean(item.chainId && item.rpcUrls.length);
              return (
                <option key={item.id} value={item.id} disabled={!configured}>
                  {item.label} {item.isTestnet ? "(Testnet)" : ""}
                  {!configured ? " – Configure RPC" : ""}
                </option>
              );
            })}
            </select>
          </div>
          {!networkConfigured ? (
            <p className="text-xs text-white/60">
              &#9828; &#9825; &#9831; &#9826;
            </p>
          ) : null}
        </div>

        {status === "connected" && address ? (
          <div className="flex items-center justify-between border-b border-white/10 py-2 text-xs font-semibold text-white/80">
            <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
            <button type="button" onClick={copyAddress} className="tbtn text-[11px]">
              Copy
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
            Wallets
          </p>

          <button type="button" onClick={handleDemoPlayer} className={buttonBase}>
            {demoIcon}
            <div className="flex flex-1 flex-col text-left leading-tight">
              <span>Demo Player</span>
              <span className="text-[11px] font-normal text-white/60">
                Instant practice seat
              </span>
            </div>
          </button>

          {installedWallets.length === 0 ? (
            <p className="text-xs text-white/60">
              No browser wallets detected. Install MetaMask, Coinbase Wallet, or another EVM wallet to continue.
            </p>
          ) : (
            installedWallets.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                onClick={() => networkConfigured && wallet.ready && handleConnect(wallet.connector)}
                className={`${buttonBase} ${!networkConfigured || isConnecting || !wallet.ready ? "opacity-50" : ""}`}
                disabled={!networkConfigured || isConnecting || !wallet.ready}
              >
                <span className={WALLET_BADGE_STYLE}>{wallet.label.slice(0, 1).toUpperCase()}</span>
                <div className="flex flex-1 flex-col text-left leading-tight">
                  <span>{wallet.label}</span>
                  <span className="text-[11px] font-normal text-white/60">
                    {isConnecting ? "Connecting…" : wallet.ready ? "Installed" : "Unavailable"}
                  </span>
                </div>
              </button>
            ))
          )}

          {!networkConfigured && installedWallets.length > 0 ? (
            <p className="text-xs text-white/60">
              Configure RPC settings for this network to enable wallet connections.
            </p>
          ) : null}

          {/* Additional install prompts intentionally hidden for minimalist flow */}
        </div>

        {status === "connected" && !isDemo ? (
          <button
            type="button"
            onClick={handleDisconnect}
            className="tbtn text-sm"
          >
            Disconnect {network.shortLabel ? `(${network.shortLabel})` : ""}
          </button>
        ) : null}

        <button
          type="button"
          onClick={async () => {
            clearWalletStorage();
            await disconnect();
            closeModal();
          }}
          className="tbtn text-sm"
        >
          Log Out
        </button>
      </div>
    </GenericModal>
  );
}

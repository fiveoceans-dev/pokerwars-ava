"use client";

import { useEffect, useMemo, useState } from "react";
import GenericModal from "~~/components/ui/GenericModal";
import { useWallet } from "~~/components/providers/WalletProvider";
import { notifyError, notifySuccess } from "~~/utils/notifications";
import {
  AVAILABLE_NETWORKS,
  type NetworkConfig,
  type SupportedNetworkId,
} from "~~/config/networks";

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

const RECOMMENDED_WALLETS = ["metamask", "coinbase", "walletconnect"] as const;

const WALLET_BADGE_STYLE =
  "text-[var(--brand-accent)] text-xs font-semibold";

type KnownWallet = {
  id: string;
  label: string;
  check: (provider: any) => boolean;
  installUrl: string;
};

type WalletOption = KnownWallet & { installed: boolean };

type EIP6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: any;
};

export function WalletConnectDialog({ open, onClose }: WalletConnectDialogProps) {

  const {
    connect,
    connectDemo,
    disconnect,
    isDemo,
    status,
    address,
    network,
    networkId,
    setNetwork,
  } = useWallet();

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

  const detectedWallets = useMemo(() => {
    const collectedProviders: any[] = [];
    let ethereum: any;
    if (typeof window !== "undefined") {
      ethereum = (window as any).ethereum;
      if (ethereum?.providers?.length) {
        collectedProviders.push(...ethereum.providers);
      } else if (ethereum) {
        collectedProviders.push(ethereum);
      }
    }

    const knownWallets: KnownWallet[] = [
      {
        id: "metamask",
        label: "MetaMask",
        check: (provider: any) => provider?.isMetaMask,
        installUrl: "https://metamask.io/download/",
      },
      {
        id: "coinbase",
        label: "Coinbase Wallet",
        check: (provider: any) => provider?.isCoinbaseWallet,
        installUrl: "https://www.coinbase.com/wallet",
      },
      {
        id: "brave",
        label: "Brave Wallet",
        check: (provider: any) => provider?.isBraveWallet,
        installUrl: "https://brave.com/wallet/",
      },
      {
        id: "rabby",
        label: "Rabby Wallet",
        check: (provider: any) => provider?.isRabby,
        installUrl: "https://rabby.io",
      },
      {
        id: "frame",
        label: "Frame",
        check: (provider: any) => provider?.isFrame,
        installUrl: "https://frame.sh",
      },
      {
        id: "zerion",
        label: "Zerion Wallet",
        check: (provider: any) => provider?.isZerion,
        installUrl: "https://zerion.io/wallet",
      },
      {
        id: "okx",
        label: "OKX Wallet",
        check: (provider: any) => provider?.isOkxWallet,
        installUrl: "https://www.okx.com/web3",
      },
      {
        id: "walletconnect",
        label: "WalletConnect",
        check: (provider: any) => provider?.isWalletConnect,
        installUrl: "https://walletconnect.com/",
      },
    ];

    const detectedIds = new Set<string>();
    const fallbackInstalled: WalletOption[] = [];
    collectedProviders.forEach((provider) => {
      let matched = false;
      knownWallets.forEach((wallet) => {
        if (!detectedIds.has(wallet.id) && wallet.check(provider)) {
          detectedIds.add(wallet.id);
          matched = true;
        }
      });
      if (!matched) {
        const label =
          typeof provider?.name === "string" && provider.name.trim().length > 0
            ? provider.name.trim()
            : "EVM Wallet";
        const fallbackId = `detected-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        if (!fallbackInstalled.some((wallet) => wallet.id === fallbackId)) {
          fallbackInstalled.push({
            id: fallbackId,
            label,
            check: () => true,
            installUrl: "https://metamask.io/download/",
            installed: true,
          });
        }
      }
    });

    const installed = knownWallets
      .filter((wallet) => detectedIds.has(wallet.id))
      .map((wallet) => ({ ...wallet, installed: true }));

    if (installed.length === 0 && ethereum) {
      installed.push({
        id: "browser",
        label: "Browser Wallet",
        check: () => true,
        installUrl: "https://metamask.io/download/",
        installed: true,
      });
    }

    fallbackInstalled.forEach((fallback) => {
      if (!installed.some((wallet) => wallet.id === fallback.id)) {
        installed.push(fallback);
      }
    });

    const prioritizedInstalled = [...installed].sort((a, b) => {
      const rank = (id: string) => {
        const idx = RECOMMENDED_WALLETS.indexOf(id as typeof RECOMMENDED_WALLETS[number]);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
      };
      return rank(a.id) - rank(b.id);
    });

    return { installed: prioritizedInstalled };
  }, [open, status, networkId]);

  const [eipProviders, setEipProviders] = useState<EIP6963ProviderDetail[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !open) return;

    const providersMap = new Map<string, EIP6963ProviderDetail>();
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail;
      if (!detail?.info?.uuid) return;
      if (providersMap.has(detail.info.uuid)) return;
      providersMap.set(detail.info.uuid, detail);
      setEipProviders(Array.from(providersMap.values()));
    };

    window.addEventListener("eip6963:announceProvider", handler as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", handler as EventListener);
  }, [open]);

  // Merge EIP-6963 providers into the installed list to ensure all injected wallets show up.
  const installedWallets = useMemo(() => {
    const fromDetect = detectedWallets.installed;
    const merged = [...fromDetect];
    eipProviders.forEach((providerDetail) => {
      const label = providerDetail.info?.name || "Injected Wallet";
      const id = `eip6963-${providerDetail.info?.uuid ?? label}`;
      if (!merged.some((wallet) => wallet.id === id)) {
        merged.push({
          id,
          label,
          check: () => true,
          installUrl: "https://walletconnect.com/",
          installed: true,
        });
      }
    });
    // Always surface WalletConnect even if not detected to catch mobile/QR flows.
    if (!merged.some((wallet) => wallet.id === "walletconnect")) {
      merged.push({
        id: "walletconnect",
        label: "WalletConnect",
        check: () => true,
        installUrl: "https://walletconnect.com/",
        installed: true,
      });
    }
    return merged;
  }, [detectedWallets.installed, eipProviders]);

  if (!open) {
    return null;
  }

  const closeModal = () => {
    onClose();
  };

  const handleConnect = async () => {
    try {
      await connect();
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
      className="bg-black text-white border border-white/10"
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
                onClick={() => networkConfigured && handleConnect()}
                className={`${buttonBase} ${!networkConfigured ? "opacity-50" : ""}`}
                disabled={!networkConfigured}
              >
                <span className={WALLET_BADGE_STYLE}>{wallet.label.slice(0, 1).toUpperCase()}</span>
                <div className="flex flex-1 flex-col text-left leading-tight">
                  <span>{wallet.label}</span>
                  <span className="text-[11px] font-normal text-white/60">Installed</span>
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

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount, useDisconnect, useSwitchChain, useChainId } from "wagmi";
import {
  AVAILABLE_NETWORKS,
  DEFAULT_NETWORK_ID,
  getNetworkConfig,
  type NetworkConfig,
  type SupportedNetworkId,
} from "~~/config/networks";
import { ensureAppKitReady, isWalletConnectConfigured } from "~~/config/wagmi";
import { shortAddress } from "~~/utils/address";

const STORAGE_KEYS = {
  mode: "wallet:last-mode",
  demoAddress: "wallet:demo-address",
  network: "wallet:last-network",
} as const;

const DEMO_PREFIX = "0xdemo";

export type WalletStatus = "disconnected" | "connecting" | "connected";
export type WalletMode = "wallet" | "demo" | null;

export type WalletContextValue = {
  address?: string;
  chainId?: number;
  status: WalletStatus;
  error: string | null;
  network: NetworkConfig;
  networkId: SupportedNetworkId;
  availableNetworks: NetworkConfig[];
  setNetwork: (id: SupportedNetworkId) => Promise<void>;
  mode: WalletMode;
  isDemo: boolean;
  connect: () => Promise<void>;
  connectDemo: () => Promise<void>;
  disconnect: () => Promise<void>;
  resetError: () => void;
  formatAddress: (addr?: string) => string;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

function persist(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  if (value === null) {
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, value);
  }
}

function restoreDemoAddress(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(STORAGE_KEYS.demoAddress) ?? undefined;
}

function generateDemoAddress(): string {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(20);
    window.crypto.getRandomValues(bytes);
    return (
      DEMO_PREFIX +
      Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    ).slice(0, 42);
  }
  let random = "";
  for (let i = 0; i < 40; i += 1) {
    random += Math.floor(Math.random() * 16).toString(16);
  }
  return `${DEMO_PREFIX}${random}`.slice(0, 42);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address: wagmiAddress, status: wagmiStatus, isConnected } = useAccount();
  const connectedChainId = useChainId();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const appKit = typeof window !== "undefined" ? ensureAppKitReady() : null;
  const open = useCallback(async () => {
    if (!appKit) {
      setError("Wallet connect unavailable. Missing project ID?");
      return;
    }
    try {
      await appKit.open();
    } catch (err) {
      console.error("Wallet connect failed", err);
      setError("Wallet connect failed. Check network and project ID.");
    }
  }, [appKit]);

  const [mode, setMode] = useState<WalletMode>(() => {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem(STORAGE_KEYS.mode);
    return stored === "wallet" || stored === "demo" ? stored : null;
  });
  const [demoAddress, setDemoAddress] = useState<string | undefined>(() => restoreDemoAddress());
  const [error, setError] = useState<string | null>(null);
  const [networkId, setNetworkId] = useState<SupportedNetworkId>(() => {
    if (typeof window === "undefined") return DEFAULT_NETWORK_ID;
    const stored = window.localStorage.getItem(STORAGE_KEYS.network) as SupportedNetworkId | null;
    return stored ?? DEFAULT_NETWORK_ID;
  });

  const availableNetworks = useMemo(() => AVAILABLE_NETWORKS, []);
  const activeNetwork = useMemo(() => {
    try {
      return getNetworkConfig(networkId);
    } catch (err) {
      console.warn("Unsupported network id", networkId, err);
      return getNetworkConfig(DEFAULT_NETWORK_ID);
    }
  }, [networkId]);

  const resetError = useCallback(() => setError(null), []);

  // Synchronise wagmi connection mode
  useEffect(() => {
    if (isConnected && wagmiAddress) {
      if (mode !== "wallet") {
        setMode("wallet");
        persist(STORAGE_KEYS.mode, "wallet");
      }
      if (demoAddress) {
        setDemoAddress(undefined);
        persist(STORAGE_KEYS.demoAddress, null);
      }
    } else if (mode === "wallet") {
      setMode(null);
      persist(STORAGE_KEYS.mode, null);
    }
  }, [demoAddress, isConnected, mode, wagmiAddress]);

  const status: WalletStatus = useMemo(() => {
    if (mode === "demo" && demoAddress) return "connected";
    if (wagmiStatus === "connecting") return "connecting";
    if (isConnected) return "connected";
    return "disconnected";
  }, [demoAddress, isConnected, mode, wagmiStatus]);

  const address = mode === "demo" ? demoAddress : wagmiAddress || undefined;
  const chainId = mode === "demo" ? activeNetwork.chainId : connectedChainId;

  const connect = useCallback(async () => {
    resetError();
    if (!isWalletConnectConfigured) {
      setError("Wallet connect unavailable: set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.");
      return;
    }
    try {
      await open({ view: "Connect" });
    } catch (err) {
      console.error("Open Web3Modal failed", err);
      if (err instanceof Error) setError(err.message);
      throw err;
    }
  }, [open, resetError]);

  const connectDemo = useCallback(async () => {
    resetError();
    const generated = generateDemoAddress();
    setDemoAddress(generated);
    persist(STORAGE_KEYS.demoAddress, generated);
    setMode("demo");
    persist(STORAGE_KEYS.mode, "demo");
  }, [resetError]);

  const disconnect = useCallback(async () => {
    try {
      if (isConnected && disconnectAsync) {
        await disconnectAsync();
      }
    } catch (err) {
      console.error("Wallet disconnect failed", err);
      if (err instanceof Error) setError(err.message);
      throw err;
    } finally {
      setMode(null);
      persist(STORAGE_KEYS.mode, null);
      setDemoAddress(undefined);
      persist(STORAGE_KEYS.demoAddress, null);
    }
  }, [disconnectAsync, isConnected]);

  const ensureSwitchChain = useCallback(
    async (targetNetwork: NetworkConfig) => {
      if (!targetNetwork.chainId) return;
      if (!isConnected || mode !== "wallet") return;
      if (connectedChainId === targetNetwork.chainId) return;

      if (!switchChainAsync) {
        console.warn("switchChainAsync not available");
        return;
      }

      await switchChainAsync({ chainId: targetNetwork.chainId });
    },
    [connectedChainId, isConnected, mode, switchChainAsync],
  );

  const setNetwork = useCallback(
    async (id: SupportedNetworkId) => {
      setNetworkId(id);
      persist(STORAGE_KEYS.network, id);
      try {
        const cfg = getNetworkConfig(id);
        if (!cfg.chainId || !cfg.rpcUrls.length) {
          throw new Error(`${cfg.label} is missing chain configuration`);
        }
        await ensureSwitchChain(cfg);
      } catch (err) {
        console.error("Failed to switch chain", err);
        if (err instanceof Error) setError(err.message);
      }
    },
    [ensureSwitchChain],
  );

  const formatAddress = useCallback((addr?: string) => shortAddress(addr), []);

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      chainId,
      status,
      error,
      network: activeNetwork,
      networkId,
      availableNetworks,
      setNetwork,
      mode,
      isDemo: mode === "demo",
      connect,
      connectDemo,
      disconnect,
      resetError,
      formatAddress,
    }),
    [
      address,
      chainId,
      status,
      error,
      activeNetwork,
      networkId,
      availableNetworks,
      setNetwork,
      mode,
      connect,
      connectDemo,
      disconnect,
      resetError,
      formatAddress,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}

export function formatWalletLabel(address?: string) {
  return shortAddress(address);
}

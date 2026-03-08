import { createAppKit, type AppKit } from "@reown/appkit";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain, http, type Chain } from "viem";
import { createConfig, cookieStorage, createStorage } from "wagmi";
import { readPublicEnv } from "~~/utils/public-env";

export const walletConnectProjectId =
  readPublicEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID") ||
  process.env.WALLETCONNECT_PROJECT_ID ||
  "";

export const isWalletConnectConfigured =
  !!walletConnectProjectId && walletConnectProjectId !== "demo-placeholder-project-id";

const metadata = {
  name: "PokerWars",
  description: "PokerWars tournaments on Avalanche & Hyperliquid",
  url: (() => {
    const raw = readPublicEnv("NEXT_PUBLIC_APP_URL") || "http://localhost:8090";
    const candidates = raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const preferred = candidates[0] || "http://localhost:8090";
    try {
      return new URL(preferred).origin;
    } catch {
      console.warn(`⚠️ Invalid NEXT_PUBLIC_APP_URL: "${raw}". Falling back to http://localhost:8090`);
      return "http://localhost:8090";
    }
  })(),
  icons: ["https://avatars.githubusercontent.com/u/37784886?s=200&v=4"],
};

const readChainEnv = (primary: string, fallback?: string | string[]): string => {
  const fallbackList = Array.isArray(fallback) ? fallback : fallback ? [fallback] : [];
  const keys = [primary, ...fallbackList];
  for (const key of keys) {
    const value = readPublicEnv(key);
    if (value) return value;
  }
  return "";
};

function buildChain(options: {
  envPrefix: string;
  fallbackEnvPrefixes?: string[];
  defaults: {
    chainId: number;
    chainName: string;
    currencyName: string;
    currencySymbol: string;
    rpcUrl: string;
    explorerUrl?: string;
  };
}): Chain | null {
  const chainIdRaw =
    readChainEnv(
      `NEXT_PUBLIC_${options.envPrefix}_CHAIN_ID`,
      options.fallbackEnvPrefixes?.map((prefix) => `NEXT_PUBLIC_${prefix}_CHAIN_ID`),
    ) || `${options.defaults.chainId}`;

  const rpcUrl =
    readChainEnv(
      `NEXT_PUBLIC_${options.envPrefix}_RPC_URL`,
      options.fallbackEnvPrefixes?.map((prefix) => `NEXT_PUBLIC_${prefix}_RPC_URL`),
    ) || options.defaults.rpcUrl;

  if (!rpcUrl) return null;

  const chainId = Number.parseInt(chainIdRaw, 10);
  if (Number.isNaN(chainId) || chainId <= 0) return null;
  const chainName =
    readChainEnv(
      `NEXT_PUBLIC_${options.envPrefix}_CHAIN_NAME`,
      options.fallbackEnvPrefixes?.map((prefix) => `NEXT_PUBLIC_${prefix}_CHAIN_NAME`),
    ) || options.defaults.chainName;
  const currencyName =
    readChainEnv(
      `NEXT_PUBLIC_${options.envPrefix}_CURRENCY_NAME`,
      options.fallbackEnvPrefixes?.map((prefix) => `NEXT_PUBLIC_${prefix}_CURRENCY_NAME`),
    ) || options.defaults.currencyName;
  const currencySymbol =
    readChainEnv(
      `NEXT_PUBLIC_${options.envPrefix}_CURRENCY_SYMBOL`,
      options.fallbackEnvPrefixes?.map((prefix) => `NEXT_PUBLIC_${prefix}_CURRENCY_SYMBOL`),
    ) || options.defaults.currencySymbol;
  const currencyDecimals = Number.parseInt(
    readChainEnv(
      `NEXT_PUBLIC_${options.envPrefix}_CURRENCY_DECIMALS`,
      options.fallbackEnvPrefixes?.map((prefix) => `NEXT_PUBLIC_${prefix}_CURRENCY_DECIMALS`),
    ) || "18",
    10,
  );
  const explorer =
    readChainEnv(
      `NEXT_PUBLIC_${options.envPrefix}_EXPLORER_URL`,
      options.fallbackEnvPrefixes?.map((prefix) => `NEXT_PUBLIC_${prefix}_EXPLORER_URL`),
    ) || options.defaults.explorerUrl;

  return defineChain({
    id: Number.isNaN(chainId) ? options.defaults.chainId : chainId,
    name: chainName,
    network: options.envPrefix.toLowerCase().replace(/_/g, "-"),
    nativeCurrency: {
      name: currencyName,
      symbol: currencySymbol,
      decimals: Number.isNaN(currencyDecimals) ? 18 : currencyDecimals,
    },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
    blockExplorers: explorer
      ? {
          default: {
            name: `${chainName} Explorer`,
            url: explorer,
          },
        }
      : undefined,
  });
}

const avalancheMainnet = buildChain({
  envPrefix: "AVALANCHE",
  defaults: {
    chainId: 43114,
    chainName: "Avalanche C-Chain",
    currencyName: "Avalanche",
    currencySymbol: "AVAX",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    explorerUrl: "https://snowtrace.io",
  },
});

const avalancheTestnet = buildChain({
  envPrefix: "AVALANCHE_TESTNET",
  defaults: {
    chainId: 43113,
    chainName: "Avalanche Fuji",
    currencyName: "Avalanche Fuji",
    currencySymbol: "AVAX",
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    explorerUrl: "https://testnet.snowtrace.io",
  },
});

const hyperliquidMainnet = buildChain({
  envPrefix: "HYPERLIQUID",
  defaults: {
    chainId: Number.parseInt(readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID") || "0", 10),
    chainName: "Hyperliquid",
    currencyName: "HYPE",
    currencySymbol: "HYPE",
    rpcUrl: readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_RPC_URL"),
    explorerUrl: readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_EXPLORER_URL") || undefined,
  },
});

const hyperliquidTestnet = buildChain({
  envPrefix: "HYPERLIQUID_TESTNET",
  defaults: {
    chainId: Number.parseInt(readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_ID") || "0", 10),
    chainName: "Hyperliquid Testnet",
    currencyName: "HYPE",
    currencySymbol: "tHYPE",
    rpcUrl: readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_TESTNET_RPC_URL"),
    explorerUrl: readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_TESTNET_EXPLORER_URL") || undefined,
  },
});

const configuredChains = [
  avalancheMainnet,
  avalancheTestnet,
  hyperliquidMainnet,
  hyperliquidTestnet,
].filter((chain): chain is Chain => Boolean(chain));

const uniqueById = <T extends Chain>(chains: T[]): T[] => {
  const seen = new Set<number>();
  return chains.filter((chain) => {
    if (seen.has(chain.id)) return false;
    seen.add(chain.id);
    return true;
  });
};

// Provide a safe fallback for local dev to avoid crashing when envs are missing
const fallbackChain: Chain = defineChain({
  id: 1337,
  name: "Avalanche Local (stub)",
  network: "avalanche-local",
  nativeCurrency: {
    name: "AVAX",
    symbol: "AVAX",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["http://localhost:8545"] },
    public: { http: ["http://localhost:8545"] },
  },
});

if (configuredChains.length === 0) {
  console.warn(
    "No wallet chains configured. Set NEXT_PUBLIC_AVALANCHE_* / NEXT_PUBLIC_AVALANCHE_TESTNET_* or NEXT_PUBLIC_HYPERLIQUID_* / NEXT_PUBLIC_HYPERLIQUID_TESTNET_* env vars (Avalanche defaults are prefilled).",
  );
}

const baseChains = configuredChains.length > 0 ? configuredChains : [fallbackChain];
const dedupedChains = uniqueById(baseChains);
export const wagmiChains = dedupedChains as [Chain, ...Chain[]];
export const wagmiDefaultChain = dedupedChains[0];

const transports = Object.fromEntries(
  wagmiChains.map((chain) => [chain.id, http()]),
);

const wagmiAdapter = new WagmiAdapter({
  projectId: walletConnectProjectId,
  networks: wagmiChains,
  ssr: true,
  transports,
  multiInjectedProviderDiscovery: true,
});
export const wagmiConfig = wagmiAdapter.wagmiConfig ?? createConfig({
  chains: wagmiChains,
  transports,
  ssr: true,
  multiInjectedProviderDiscovery: true,
  storage: createStorage({ storage: cookieStorage }),
});
export const web3ModalThemeVariables = {
  "--w3m-accent": "rgb(133 232 168)",
} as const;

type Web3ModalGlobalState = {
  __hyperPokerWeb3ModalReady__?: boolean;
  __hyperPokerAppKit__?: AppKit | null;
};

const globalScope = globalThis as typeof globalThis & Web3ModalGlobalState;

export function ensureAppKitReady(): AppKit | null {
  if (typeof window === "undefined") return;
  if (!isWalletConnectConfigured) {
    console.warn("WalletConnect project ID missing; AppKit disabled.");
    return null;
  }
  if (globalScope.__hyperPokerWeb3ModalReady__ && globalScope.__hyperPokerAppKit__) {
    return globalScope.__hyperPokerAppKit__;
  }
  const appKit = createAppKit({
    adapters: [wagmiAdapter] as any,
    projectId: walletConnectProjectId,
    networks: wagmiChains,
    metadata,
    themeVariables: web3ModalThemeVariables,
    features: {
      analytics: false,
      onramp: false,
    },
  });
  globalScope.__hyperPokerAppKit__ = appKit;
  globalScope.__hyperPokerWeb3ModalReady__ = true;
  return appKit;
}

// Initialize AppKit eagerly on client load to prevent hook errors
if (typeof window !== "undefined") {
  ensureAppKitReady();
}

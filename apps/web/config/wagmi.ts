import { createAppKit, type AppKit } from "@reown/appkit";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain, http, type Chain } from "viem";
import { mainnet } from "viem/chains";
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
  description: "PokerWars tournaments on Hyperliquid",
  url: readPublicEnv("NEXT_PUBLIC_APP_URL") || "http://localhost:8090",
  icons: ["https://avatars.githubusercontent.com/u/37784886?s=200&v=4"],
};

function buildHyperliquidChain(
  envPrefix: "HYPERLIQUID" | "HYPERLIQUID_TESTNET",
  defaults: {
    name: string;
    symbol: string;
  },
): Chain | null {
  const chainIdRaw = readPublicEnv(`NEXT_PUBLIC_${envPrefix}_CHAIN_ID`);
  const rpcUrl = readPublicEnv(`NEXT_PUBLIC_${envPrefix}_RPC_URL`);
  if (!chainIdRaw || !rpcUrl) return null;

  const chainId = Number.parseInt(chainIdRaw, 10);
  if (Number.isNaN(chainId)) return null;

  const chainName =
    readPublicEnv(`NEXT_PUBLIC_${envPrefix}_CHAIN_NAME`) || defaults.name;
  const currencyName =
    readPublicEnv(`NEXT_PUBLIC_${envPrefix}_CURRENCY_NAME`) || defaults.name;
  const currencySymbol =
    readPublicEnv(`NEXT_PUBLIC_${envPrefix}_CURRENCY_SYMBOL`) || defaults.symbol;
  const currencyDecimals = Number.parseInt(
    readPublicEnv(`NEXT_PUBLIC_${envPrefix}_CURRENCY_DECIMALS`) || "18",
    10,
  );
  const explorer = readPublicEnv(`NEXT_PUBLIC_${envPrefix}_EXPLORER_URL`);

  return defineChain({
    id: chainId,
    name: chainName,
    network: envPrefix.toLowerCase().replace(/_/g, "-"),
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

const hyperliquidMainnet = buildHyperliquidChain("HYPERLIQUID", {
  name: "Hyperliquid",
  symbol: "HYPE",
});
const hyperliquidTestnet = buildHyperliquidChain("HYPERLIQUID_TESTNET", {
  name: "Hyperliquid Testnet",
  symbol: "tHYPE",
});

const configuredChains = [hyperliquidMainnet, hyperliquidTestnet].filter(
  (chain): chain is Chain => Boolean(chain),
);

// Provide a safe fallback for local dev to avoid crashing when envs are missing
const fallbackChain: Chain = defineChain({
  id: 1337,
  name: "Hyperliquid Local (stub)",
  network: "hyperliquid-local",
  nativeCurrency: {
    name: "HYPE",
    symbol: "HYPE",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["http://localhost:8545"] },
    public: { http: ["http://localhost:8545"] },
  },
});

if (configuredChains.length === 0) {
  console.warn(
    "Hyperliquid chains are missing. Set NEXT_PUBLIC_HYPERLIQUID_* and NEXT_PUBLIC_HYPERLIQUID_TESTNET_* env vars.",
  );
}

const baseChains = configuredChains.length > 0 ? configuredChains : [fallbackChain];
const uniqueBase = baseChains.filter((chain) => chain.id !== mainnet.id);
export const wagmiChains = [mainnet, ...uniqueBase] as [Chain, ...Chain[]];
export const wagmiDefaultChain = mainnet;

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

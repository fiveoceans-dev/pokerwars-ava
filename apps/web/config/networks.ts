import { readPublicEnv, readPublicEnvOptional } from "~~/utils/public-env";

export type SupportedNetworkId = "hyperliquid-mainnet" | "hyperliquid-testnet";

export type NetworkKind = "evm";

export interface NetworkConfig {
  id: SupportedNetworkId;
  label: string;
  shortLabel: string;
  kind: NetworkKind;
  chainId?: number;
  chainName?: string;
  rpcUrls: string[];
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrls?: string[];
  isTestnet?: boolean;
  description?: string;
}

const parseChainId = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseDecimals = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const cleanUrls = (values: (string | undefined)[]): string[] =>
  values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

const NETWORKS: NetworkConfig[] = [
  {
    id: "hyperliquid-mainnet",
    label: "Hyperliquid Mainnet",
    shortLabel: "Hyperliquid",
    kind: "evm",
    description: "Hyperliquid production network for PokerWars tables.",
    chainId: parseChainId(readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID")),
    chainName: readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_CHAIN_NAME") || "Hyperliquid",
    rpcUrls: cleanUrls([readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_RPC_URL")]),
    nativeCurrency: {
      name: readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_CURRENCY_NAME") || "HYPE",
      symbol: readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_CURRENCY_SYMBOL") || "HYPE",
      decimals: parseDecimals(readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_CURRENCY_DECIMALS"), 18),
    },
    blockExplorerUrls: cleanUrls([readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_EXPLORER_URL")]),
  },
  {
    id: "hyperliquid-testnet",
    label: "Hyperliquid Testnet",
    shortLabel: "Hyperliquid Test",
    kind: "evm",
    description: "Hyperliquid testnet for staging and QA.",
    chainId: parseChainId(readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_ID")),
    chainName: readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_NAME") || "Hyperliquid Testnet",
    rpcUrls: cleanUrls([readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_TESTNET_RPC_URL")]),
    nativeCurrency: {
      name: readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_NAME") || "HYPE",
      symbol: readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_SYMBOL") || "tHYPE",
      decimals: parseDecimals(readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_DECIMALS"), 18),
    },
    blockExplorerUrls: cleanUrls([readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_TESTNET_EXPLORER_URL")]),
    isTestnet: true,
  },
];

export const AVAILABLE_NETWORKS: NetworkConfig[] = NETWORKS;

export const PRIMARY_NETWORKS: NetworkConfig[] = NETWORKS.filter(
  (network) => !network.isTestnet,
);

const DEFAULT_NETWORK_FALLBACK: SupportedNetworkId = "hyperliquid-mainnet";

export const DEFAULT_NETWORK_ID: SupportedNetworkId = (
  readPublicEnvOptional("NEXT_PUBLIC_DEFAULT_NETWORK") as SupportedNetworkId | undefined
) ?? DEFAULT_NETWORK_FALLBACK;

export function getNetworkConfig(id: SupportedNetworkId): NetworkConfig {
  const network = NETWORKS.find((item) => item.id === id);
  if (!network) {
    throw new Error(`Unsupported network id: ${id}`);
  }
  return network;
}

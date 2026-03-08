import { readPublicEnv, readPublicEnvOptional } from "~~/utils/public-env";

export type SupportedNetworkId =
  | "avalanche-mainnet"
  | "avalanche-testnet"
  | "hyperliquid-mainnet"
  | "hyperliquid-testnet";

const SUPPORTED_NETWORK_IDS: SupportedNetworkId[] = [
  "avalanche-mainnet",
  "avalanche-testnet",
  "hyperliquid-mainnet",
  "hyperliquid-testnet",
];

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

type ChainEnvPrefixes = {
  primary: string;
  alternates?: string[];
};

const readChainEnv = (
  prefixes: ChainEnvPrefixes,
  suffix: string,
): string | undefined => {
  const candidates = [prefixes.primary, ...(prefixes.alternates ?? [])];
  for (const prefix of candidates) {
    const value = readPublicEnv(`NEXT_PUBLIC_${prefix}_${suffix}`);
    if (value) return value;
  }
  return undefined;
};

const buildNetworkConfig = (options: {
  id: SupportedNetworkId;
  label: string;
  shortLabel: string;
  description: string;
  kind: NetworkKind;
  isTestnet?: boolean;
  envPrefixes: ChainEnvPrefixes;
  defaults: {
    chainId?: number;
    chainName: string;
    rpcUrl?: string;
    currencyName: string;
    currencySymbol: string;
    currencyDecimals: number;
    explorerUrl?: string;
  };
}): NetworkConfig => {
  const chainId = parseChainId(
    readChainEnv(options.envPrefixes, "CHAIN_ID"),
  ) ?? options.defaults.chainId;
  const chainName =
    readChainEnv(options.envPrefixes, "CHAIN_NAME") || options.defaults.chainName;
  const rpcUrls = cleanUrls([
    readChainEnv(options.envPrefixes, "RPC_URL") || options.defaults.rpcUrl,
  ]);
  const currencyName =
    readChainEnv(options.envPrefixes, "CURRENCY_NAME") ||
    options.defaults.currencyName;
  const currencySymbol =
    readChainEnv(options.envPrefixes, "CURRENCY_SYMBOL") ||
    options.defaults.currencySymbol;
  const currencyDecimals = parseDecimals(
    readChainEnv(options.envPrefixes, "CURRENCY_DECIMALS"),
    options.defaults.currencyDecimals,
  );
  const explorerUrls = cleanUrls([
    readChainEnv(options.envPrefixes, "EXPLORER_URL") || options.defaults.explorerUrl,
  ]);

  return {
    id: options.id,
    label: options.label,
    shortLabel: options.shortLabel,
    kind: options.kind,
    description: options.description,
    chainId,
    chainName,
    rpcUrls,
    nativeCurrency: {
      name: currencyName,
      symbol: currencySymbol,
      decimals: currencyDecimals,
    },
    blockExplorerUrls: explorerUrls,
    isTestnet: options.isTestnet,
  };
};

const NETWORKS: NetworkConfig[] = [
  buildNetworkConfig({
    id: "avalanche-mainnet",
    label: "Avalanche C-Chain",
    shortLabel: "Avalanche",
    kind: "evm",
    description: "Avalanche mainnet (C-Chain) is the default PokerWars network.",
    envPrefixes: { primary: "AVALANCHE" },
    defaults: {
      chainId: 43114,
      chainName: "Avalanche C-Chain",
      rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
      currencyName: "Avalanche",
      currencySymbol: "AVAX",
      currencyDecimals: 18,
      explorerUrl: "https://snowtrace.io",
    },
  }),
  buildNetworkConfig({
    id: "avalanche-testnet",
    label: "Avalanche Fuji",
    shortLabel: "Fuji Test",
    kind: "evm",
    description: "Avalanche Fuji testnet for staging and QA.",
    isTestnet: true,
    envPrefixes: { primary: "AVALANCHE_TESTNET" },
    defaults: {
      chainId: 43113,
      chainName: "Avalanche Fuji",
      rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
      currencyName: "Avalanche Fuji",
      currencySymbol: "AVAX",
      currencyDecimals: 18,
      explorerUrl: "https://testnet.snowtrace.io",
    },
  }),
  buildNetworkConfig({
    id: "hyperliquid-mainnet",
    label: "Hyperliquid Mainnet",
    shortLabel: "Hyperliquid",
    kind: "evm",
    description: "Hyperliquid mainnet (legacy) remains supported.",
    envPrefixes: { primary: "HYPERLIQUID" },
    defaults: {
      chainId: undefined,
      chainName: "Hyperliquid",
      rpcUrl: undefined,
      currencyName: "HYPE",
      currencySymbol: "HYPE",
      currencyDecimals: 18,
      explorerUrl: undefined,
    },
  }),
  buildNetworkConfig({
    id: "hyperliquid-testnet",
    label: "Hyperliquid Testnet",
    shortLabel: "Hyperliquid Test",
    kind: "evm",
    description: "Hyperliquid testnet remains available for legacy tables.",
    isTestnet: true,
    envPrefixes: { primary: "HYPERLIQUID_TESTNET" },
    defaults: {
      chainId: undefined,
      chainName: "Hyperliquid Testnet",
      rpcUrl: undefined,
      currencyName: "HYPE",
      currencySymbol: "tHYPE",
      currencyDecimals: 18,
      explorerUrl: undefined,
    },
  }),
];

export const AVAILABLE_NETWORKS: NetworkConfig[] = NETWORKS;

export const PRIMARY_NETWORKS: NetworkConfig[] = NETWORKS.filter(
  (network) => !network.isTestnet,
);

const DEFAULT_NETWORK_FALLBACK: SupportedNetworkId = "avalanche-mainnet";

export const DEFAULT_NETWORK_ID: SupportedNetworkId = (() => {
  const envDefault = readPublicEnvOptional("NEXT_PUBLIC_DEFAULT_NETWORK");
  if (envDefault && SUPPORTED_NETWORK_IDS.includes(envDefault as SupportedNetworkId)) {
    return envDefault as SupportedNetworkId;
  }
  const primary = PRIMARY_NETWORKS[0]?.id;
  if (primary) return primary;
  return DEFAULT_NETWORK_FALLBACK;
})();

export function getNetworkConfig(id: SupportedNetworkId): NetworkConfig {
  const network = NETWORKS.find((item) => item.id === id);
  if (!network) {
    throw new Error(`Unsupported network id: ${id}`);
  }
  return network;
}

export const isSupportedNetworkId = (value: unknown): value is SupportedNetworkId =>
  SUPPORTED_NETWORK_IDS.includes(value as SupportedNetworkId);

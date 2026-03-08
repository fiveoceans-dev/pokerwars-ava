import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "~~/styles/globals.css";
import { Header } from "~~/components/Header";
import { Footer } from "~~/components/Footer";
import { AppProviders } from "~~/components/AppProviders";
import { getWebEnv } from "~~/config/env";

export async function generateMetadata(): Promise<Metadata> {
  const webEnv = getWebEnv();
  const metadataBase = (() => {
    try {
      return new URL(webEnv.appUrl || "http://localhost:8090");
    } catch {
      return new URL("http://localhost:8090");
    }
  })();

  return {
    title: webEnv.appName,
    description: webEnv.appDescription,
    metadataBase,
    icons: ["/favicon.ico"],
    openGraph: {
      title: webEnv.appName,
      description: webEnv.appDescription,
      siteName: webEnv.appName,
      url: metadataBase?.href,
      images: ["/logo.png", "/pokernfts.png"].filter(Boolean),
    },
    twitter: {
      card: "summary_large_image",
      title: webEnv.appName,
      description: webEnv.appDescription,
      images: ["/logo.png"],
    },
  };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const App = ({ children }: { children: React.ReactNode }) => {
  const webEnv = getWebEnv();
  const avalancheChainId =
    process.env.NEXT_PUBLIC_AVALANCHE_CHAIN_ID ??
    "";
  const avalancheChainName =
    process.env.NEXT_PUBLIC_AVALANCHE_CHAIN_NAME ??
    "";
  const avalancheRpcUrl =
    process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL ??
    "";
  const avalancheExplorerUrl =
    process.env.NEXT_PUBLIC_AVALANCHE_EXPLORER_URL ??
    "";
  const avalancheCurrencyName =
    process.env.NEXT_PUBLIC_AVALANCHE_CURRENCY_NAME ??
    "";
  const avalancheCurrencySymbol =
    process.env.NEXT_PUBLIC_AVALANCHE_CURRENCY_SYMBOL ??
    "";
  const avalancheCurrencyDecimals =
    process.env.NEXT_PUBLIC_AVALANCHE_CURRENCY_DECIMALS ??
    "";

  const avalancheTestnetChainId =
    process.env.NEXT_PUBLIC_AVALANCHE_TESTNET_CHAIN_ID ?? "";
  const avalancheTestnetChainName =
    process.env.NEXT_PUBLIC_AVALANCHE_TESTNET_CHAIN_NAME ?? "";
  const avalancheTestnetRpcUrl =
    process.env.NEXT_PUBLIC_AVALANCHE_TESTNET_RPC_URL ?? "";
  const avalancheTestnetExplorerUrl =
    process.env.NEXT_PUBLIC_AVALANCHE_TESTNET_EXPLORER_URL ?? "";
  const avalancheTestnetCurrencyName =
    process.env.NEXT_PUBLIC_AVALANCHE_TESTNET_CURRENCY_NAME ?? "";
  const avalancheTestnetCurrencySymbol =
    process.env.NEXT_PUBLIC_AVALANCHE_TESTNET_CURRENCY_SYMBOL ?? "";
  const avalancheTestnetCurrencyDecimals =
    process.env.NEXT_PUBLIC_AVALANCHE_TESTNET_CURRENCY_DECIMALS ?? "";
  const avalancheTestnetFaucetUrl =
    process.env.NEXT_PUBLIC_AVALANCHE_TESTNET_FAUCET_URL ?? "";

  const hyperliquidChainId = process.env.NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID ?? "";
  const hyperliquidChainName = process.env.NEXT_PUBLIC_HYPERLIQUID_CHAIN_NAME ?? "";
  const hyperliquidRpcUrl = process.env.NEXT_PUBLIC_HYPERLIQUID_RPC_URL ?? "";
  const hyperliquidExplorerUrl = process.env.NEXT_PUBLIC_HYPERLIQUID_EXPLORER_URL ?? "";
  const hyperliquidCurrencyName = process.env.NEXT_PUBLIC_HYPERLIQUID_CURRENCY_NAME ?? "";
  const hyperliquidCurrencySymbol = process.env.NEXT_PUBLIC_HYPERLIQUID_CURRENCY_SYMBOL ?? "";
  const hyperliquidCurrencyDecimals =
    process.env.NEXT_PUBLIC_HYPERLIQUID_CURRENCY_DECIMALS ?? "";
  const hyperliquidTestnetChainId =
    process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_ID ?? "";
  const hyperliquidTestnetChainName =
    process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_NAME ?? "";
  const hyperliquidTestnetRpcUrl =
    process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_RPC_URL ?? "";
  const hyperliquidTestnetExplorerUrl =
    process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_EXPLORER_URL ?? "";
  const hyperliquidTestnetCurrencyName =
    process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_NAME ?? "";
  const hyperliquidTestnetCurrencySymbol =
    process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_SYMBOL ?? "";
  const hyperliquidTestnetCurrencyDecimals =
    process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_DECIMALS ?? "";
  const hyperliquidTestnetFaucetUrl =
    process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_FAUCET_URL ?? "";

  const runtimePublicEnv: Record<string, string> = {
    NEXT_PUBLIC_APP_URL: webEnv.appUrl ?? "",
    NEXT_PUBLIC_WS_URL: webEnv.wsUrl,
    NEXT_PUBLIC_API_URL: webEnv.apiUrl,
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: webEnv.walletConnectProjectId ?? "",
    NEXT_PUBLIC_DEFAULT_NETWORK: process.env.NEXT_PUBLIC_DEFAULT_NETWORK ?? "",
    NEXT_PUBLIC_AVALANCHE_CHAIN_ID: avalancheChainId,
    NEXT_PUBLIC_AVALANCHE_CHAIN_NAME: avalancheChainName,
    NEXT_PUBLIC_AVALANCHE_RPC_URL: avalancheRpcUrl,
    NEXT_PUBLIC_AVALANCHE_EXPLORER_URL: avalancheExplorerUrl,
    NEXT_PUBLIC_AVALANCHE_CURRENCY_NAME: avalancheCurrencyName,
    NEXT_PUBLIC_AVALANCHE_CURRENCY_SYMBOL: avalancheCurrencySymbol,
    NEXT_PUBLIC_AVALANCHE_CURRENCY_DECIMALS: avalancheCurrencyDecimals,
    NEXT_PUBLIC_AVALANCHE_TESTNET_CHAIN_ID: avalancheTestnetChainId,
    NEXT_PUBLIC_AVALANCHE_TESTNET_CHAIN_NAME: avalancheTestnetChainName,
    NEXT_PUBLIC_AVALANCHE_TESTNET_RPC_URL: avalancheTestnetRpcUrl,
    NEXT_PUBLIC_AVALANCHE_TESTNET_EXPLORER_URL: avalancheTestnetExplorerUrl,
    NEXT_PUBLIC_AVALANCHE_TESTNET_CURRENCY_NAME: avalancheTestnetCurrencyName,
    NEXT_PUBLIC_AVALANCHE_TESTNET_CURRENCY_SYMBOL: avalancheTestnetCurrencySymbol,
    NEXT_PUBLIC_AVALANCHE_TESTNET_CURRENCY_DECIMALS: avalancheTestnetCurrencyDecimals,
    NEXT_PUBLIC_AVALANCHE_TESTNET_FAUCET_URL: avalancheTestnetFaucetUrl,
    NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID: hyperliquidChainId,
    NEXT_PUBLIC_HYPERLIQUID_CHAIN_NAME: hyperliquidChainName,
    NEXT_PUBLIC_HYPERLIQUID_RPC_URL: hyperliquidRpcUrl,
    NEXT_PUBLIC_HYPERLIQUID_EXPLORER_URL: hyperliquidExplorerUrl,
    NEXT_PUBLIC_HYPERLIQUID_CURRENCY_NAME: hyperliquidCurrencyName,
    NEXT_PUBLIC_HYPERLIQUID_CURRENCY_SYMBOL: hyperliquidCurrencySymbol,
    NEXT_PUBLIC_HYPERLIQUID_CURRENCY_DECIMALS: hyperliquidCurrencyDecimals,
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_ID: hyperliquidTestnetChainId,
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_NAME: hyperliquidTestnetChainName,
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_RPC_URL: hyperliquidTestnetRpcUrl,
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_EXPLORER_URL: hyperliquidTestnetExplorerUrl,
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_NAME: hyperliquidTestnetCurrencyName,
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_SYMBOL: hyperliquidTestnetCurrencySymbol,
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_DECIMALS: hyperliquidTestnetCurrencyDecimals,
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_FAUCET_URL: hyperliquidTestnetFaucetUrl,
    NEXT_PUBLIC_ENABLE_DEBUG_PANEL: process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL ?? "",
  };
  const runtimePublicEnvScript = Object.entries(runtimePublicEnv)
    .map(([key, value]) => `window.__${key} = ${JSON.stringify(value)};`)
    .join("");

  return (
    <html suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="flex flex-col min-h-screen"
      >
        <Script
          id="runtime-public-env"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: runtimePublicEnvScript,
          }}
        />
        <AppProviders>
          <div className="flex relative flex-col min-h-screen">
            <Header />
            <main className="relative flex flex-col flex-1">{children}</main>
            <Footer />
          </div>
        </AppProviders>
      </body>
    </html>
  );
};

export default App;

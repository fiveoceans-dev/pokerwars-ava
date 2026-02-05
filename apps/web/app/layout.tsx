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
      return webEnv.appUrl ? new URL(webEnv.appUrl) : undefined;
    } catch {
      return undefined;
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
  const runtimePublicEnv: Record<string, string> = {
    NEXT_PUBLIC_APP_URL: webEnv.appUrl ?? "",
    NEXT_PUBLIC_WS_URL: webEnv.wsUrl,
    NEXT_PUBLIC_API_URL: webEnv.apiUrl,
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: webEnv.walletConnectProjectId ?? "",
    NEXT_PUBLIC_DEFAULT_NETWORK: process.env.NEXT_PUBLIC_DEFAULT_NETWORK ?? "",
    NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID: process.env.NEXT_PUBLIC_HYPERLIQUID_CHAIN_ID ?? "",
    NEXT_PUBLIC_HYPERLIQUID_CHAIN_NAME: process.env.NEXT_PUBLIC_HYPERLIQUID_CHAIN_NAME ?? "",
    NEXT_PUBLIC_HYPERLIQUID_RPC_URL: process.env.NEXT_PUBLIC_HYPERLIQUID_RPC_URL ?? "",
    NEXT_PUBLIC_HYPERLIQUID_EXPLORER_URL: process.env.NEXT_PUBLIC_HYPERLIQUID_EXPLORER_URL ?? "",
    NEXT_PUBLIC_HYPERLIQUID_CURRENCY_NAME: process.env.NEXT_PUBLIC_HYPERLIQUID_CURRENCY_NAME ?? "",
    NEXT_PUBLIC_HYPERLIQUID_CURRENCY_SYMBOL: process.env.NEXT_PUBLIC_HYPERLIQUID_CURRENCY_SYMBOL ?? "",
    NEXT_PUBLIC_HYPERLIQUID_CURRENCY_DECIMALS: process.env.NEXT_PUBLIC_HYPERLIQUID_CURRENCY_DECIMALS ?? "",
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_ID: process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_ID ?? "",
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_NAME: process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_CHAIN_NAME ?? "",
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_RPC_URL: process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_RPC_URL ?? "",
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_EXPLORER_URL: process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_EXPLORER_URL ?? "",
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_NAME: process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_NAME ?? "",
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_SYMBOL: process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_SYMBOL ?? "",
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_DECIMALS: process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_CURRENCY_DECIMALS ?? "",
    NEXT_PUBLIC_HYPERLIQUID_TESTNET_FAUCET_URL: process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_FAUCET_URL ?? "",
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

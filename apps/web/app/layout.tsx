import type { Metadata, Viewport } from "next";
import "~~/styles/globals.css";
import { Header } from "~~/components/Header";
import { Footer } from "~~/components/Footer";
import { AppProviders } from "~~/components/AppProviders";
import { getWebEnv } from "~~/config/env";

const webEnv = getWebEnv();
const APP_NAME = webEnv.appName;
const APP_DESCRIPTION = webEnv.appDescription;
const metadataBase = (() => {
  try {
    return webEnv.appUrl ? new URL(webEnv.appUrl) : undefined;
  } catch {
    return undefined;
  }
})();

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  metadataBase,
  icons: ["/favicon.svg", "/favicon.ico"],
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    url: metadataBase?.href,
    images: ["/logo.png", "/pokernfts.png"].filter(Boolean),
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: ["/logo.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const runtimeWsUrl = webEnv.wsUrl;

const App = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="flex flex-col min-h-screen"
      >
        <script suppressHydrationWarning src="/runtime-env.js" />
        {runtimeWsUrl ? (
          <script
            suppressHydrationWarning
            dangerouslySetInnerHTML={{
              __html: `window.__NEXT_PUBLIC_WS_URL = ${JSON.stringify(runtimeWsUrl)};`,
            }}
          />
        ) : null}
        <AppProviders>
          <div className="flex relative flex-col min-h-screen">
            <Header />
            <main className="relative flex flex-col flex-1 pt-16">{children}</main>
            <Footer />
          </div>
        </AppProviders>
      </body>
    </html>
  );
};

export default App;

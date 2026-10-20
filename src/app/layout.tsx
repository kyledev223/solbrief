import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { APP_NAME, SITE } from "@/config/site";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { SessionProvider } from "@/components/session";
import { Ticker, TickerFallback } from "@/components/Ticker";
import { WalletProviders } from "@/components/WalletProviders";
import "./globals.css";

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${APP_NAME} — daily Solana ecosystem brief`, template: `%s · ${APP_NAME}` },
  description: SITE.description,
  openGraph: { title: APP_NAME, description: SITE.tagline, siteName: APP_NAME, type: "website" },
  twitter: { card: "summary_large_image", title: APP_NAME, description: SITE.tagline },
};

export const viewport: Viewport = {
  themeColor: "#07070c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${mono.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded focus:bg-panel focus:px-3 focus:py-2">
          Skip to content
        </a>
        <WalletProviders>
          <SessionProvider>
            <Nav />
            <Suspense fallback={<TickerFallback />}>
              <Ticker />
            </Suspense>
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer />
          </SessionProvider>
        </WalletProviders>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://investment-tracker.timothy-chu.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(new URL(siteUrl).origin),
  title: "Investment Tracker",
  description: "A private, mobile-first ledger for crypto buys, sells, holdings, and weighted-average gains.",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: `${basePath}/investment-icon-192-v2.png`,
    apple: `${basePath}/investment-icon-192-v2.png`,
  },
  openGraph: {
    title: "Investment Tracker",
    description: "Know every move. See every gain.",
    type: "website",
    images: [{ url: `${basePath}/og.png`, width: 1536, height: 1024, alt: "Investment Tracker" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Investment Tracker",
    description: "Know every move. See every gain.",
    images: [`${basePath}/og.png`],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#101a16",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

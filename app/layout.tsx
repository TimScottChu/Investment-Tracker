import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: "Investment Tracker",
    description: "A private, mobile-first ledger for crypto buys, sells, holdings, and weighted-average gains.",
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
    openGraph: {
      title: "Investment Tracker",
      description: "Know every move. See every gain.",
      type: "website",
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Investment Tracker" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Investment Tracker",
      description: "Know every move. See every gain.",
      images: ["/og.png"],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#101a16",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Pub Bottle Shop",
  description:
    "See what's on the shelf and reserve bottles for pickup at the pub.",
  applicationName: "Bottle Shop",
  manifest: "/bottleshop/manifest.webmanifest?v=1",
  appleWebApp: {
    capable: true,
    title: "Bottle Shop",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png?v=10", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png?v=10", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png?v=10",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  viewportFit: "cover",
};

export default function BottleShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

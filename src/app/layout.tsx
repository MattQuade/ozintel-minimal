import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OzIntel Alert System',
  description: 'OzIntel - Emergency Alert System',
  applicationName: 'OzIntel',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'OzIntel',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/ozintel-icon.png', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/ozintel-icon.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}

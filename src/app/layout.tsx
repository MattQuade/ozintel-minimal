import type { Metadata, Viewport } from 'next';
import './globals.css';
import VoiceHandsfreeDock from '@/components/VoiceHandsfreeDock';

export const metadata: Metadata = {
  title: 'OzIntel Alert System',
  description: 'OzIntel - Emergency Alert System',
  applicationName: 'OzIntel',
  // Cache-bust so Android Chrome / Samsung Internet pick up new home-screen icons
  manifest: '/manifest.webmanifest?v=2',
  appleWebApp: {
    capable: true,
    title: 'OzIntel',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png?v=2', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png?v=2', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/icons/icon-192.png?v=2'],
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
        <VoiceHandsfreeDock />
      </body>
    </html>
  );
}

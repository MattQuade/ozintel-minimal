import type { Metadata } from 'next';
import './globals.css';
import TopNav from '../../components/TopNav';

export const metadata: Metadata = {
  title: 'Grok Pub Accounting',
  description: 'ozintel - Pub Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <TopNav />
        
        <main className="pt-16 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
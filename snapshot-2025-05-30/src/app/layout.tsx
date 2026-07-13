import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '../components/Sidebar';

export const metadata: Metadata = {
  title: 'Grok Pub Accounting',
  description: 'Pub Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 overflow-hidden">
        <div className="flex h-screen">
          {/* Fixed Sidebar */}
          <Sidebar />
          
          {/* Main Content Area */}
          <main className="flex-1 overflow-auto ml-72">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
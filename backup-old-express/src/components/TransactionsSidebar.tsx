'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function TransactionsSidebar({ activeCategory, setActiveCategory }: any) {
  const pathname = usePathname();

  return (
    <div className="w-72 bg-gray-900 text-white h-screen fixed flex flex-col">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          🍺 Grok Pub Accounting
        </h1>
      </div>

      <nav className="flex-1 p-4">
        <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-800 mb-1">
          🏠 Dashboard
        </Link>
        <Link href="/transactions" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 mb-1">
          📋 Transactions
        </Link>
        <Link href="/rules" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-800 mb-1">
          ⚙️ Bank Rules
        </Link>
      </nav>
    </div>
  );
}
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Plus, Search, Bell, User, ChevronDown } from 'lucide-react';

const navItems = [
  { label: 'Dashboard', href: '/', submenu: [] },
  { label: 'Accounting', href: '/journal', submenu: [
      { label: 'Journal', href: '/journal' },
      { label: 'Chart of Accounts', href: '/coa' },
    ] 
  },
  { label: 'Bank', href: '/bank/accounts', submenu: [
      { label: 'Bank Accounts', href: '/bank/accounts' },
      { label: 'Import CSV', href: '/transactions/import' },
    ] 
  },
  { label: 'Sales', href: '/sales', submenu: [] },
  { label: 'Purchases', href: '/purchases', submenu: [] },
  { label: 'Reports', href: '/reports', submenu: [] },
  { label: 'Employees', href: '/employees', submenu: [] },
];

export default function TopNav() {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-screen-2xl mx-auto px-6">
        <div className="h-16 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="text-4xl">🍺</div>
            <div className="font-bold text-2xl tracking-tight">Grok Pub</div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1 text-sm font-medium">
            {navItems.map((item) => {
              const isActive = pathname === item.href || 
                              (item.href !== '/' && pathname.startsWith(item.href + '/'));

              return (
                <div 
                  key={`nav-${item.label}`} 
                  className="relative group"
                  onMouseEnter={() => setOpenMenu(item.label)}
                  onMouseLeave={() => setOpenMenu(null)}
                >
                  <Link
                    href={item.href}
                    className={`flex items-center gap-1 px-6 py-5 min-w-[110px] justify-center border-b-2 transition-all ${
                      isActive 
                        ? 'border-blue-600 text-gray-900' 
                        : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                    }`}
                  >
                    {item.label}
                    {item.submenu.length > 0 && <ChevronDown className="w-4 h-4" />}
                  </Link>

                  {item.submenu.length > 0 && (
                    <div className="absolute left-0 top-[64px] w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 
                      opacity-0 invisible pointer-events-none 
                      group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto">
                      {item.submenu.map((sub, idx) => (
                        <Link
                          key={`sub-${item.label}-${idx}`}
                          href={sub.href}
                          className="block px-6 py-3 text-sm hover:bg-gray-100"
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <Search className="w-5 h-5 text-gray-600" />
            </button>

            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
              <Plus className="w-4 h-4" />
              New
            </button>

            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <Bell className="w-5 h-5 text-gray-600" />
            </button>

            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-blue-200">
              <User className="w-5 h-5 text-gray-600" />
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

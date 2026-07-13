'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Plus, Search, Bell, User, ChevronDown } from 'lucide-react';

const navItems = [
  { label: 'Dashboard', href: '/', submenu: null },
  {
    label: 'Accounting',
    href: '/accounting',
    submenu: [
      { label: 'Journal', href: '/journal' },
      { label: 'Chart of Accounts', href: '/coa' },
      { label: 'Trial Balance', href: '/trial-balance' },
      { label: 'Ledger', href: '/ledger' },
      { label: 'Recurring Entries', href: '/recurring' },
    ]
  },
  {
    label: 'Bank',
    href: '/bank',
    submenu: [
      { label: 'Bank Accounts', href: '/bank/accounts' },
      { label: 'Reconciliations', href: '/transactions/import' },
      { label: 'Statements', href: '/bank/statements' },
      { label: 'Transfers', href: '/bank/transfers' },
    ]
  },
  {
    label: 'Sales',
    href: '/sales',
    submenu: [
      { label: 'Invoices', href: '/sales/invoices' },
      { label: 'Customers', href: '/sales/customers' },
      { label: 'Quotes', href: '/sales/quotes' },
      { label: 'Receipts', href: '/sales/receipts' },
    ]
  },
  {
    label: 'Purchases',
    href: '/purchases',
    submenu: [
      { label: 'Bills', href: '/purchases/bills' },
      { label: 'Suppliers', href: '/purchases/suppliers' },
      { label: 'Purchase Orders', href: '/purchases/orders' },
    ]
  },
  {
    label: 'Reports',
    href: '/reports',
    submenu: [
      { label: 'Profit & Loss', href: '/reports' },
      { label: 'Balance Sheet', href: '/reports/balance-sheet' },
      { label: 'Cash Flow', href: '/reports/cashflow' },
      { label: 'GST/BAS', href: '/reports' },
      { label: 'Aged Debtors', href: '/reports/aged-debtors' },
    ]
  },
  {
    label: 'Employees',
    href: '/employees',
    submenu: null
  },
];

export default function TopNav() {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-screen-2xl mx-auto px-6">
        <div className="h-14 flex items-center justify-between">
          
          {/* Logo - GROK PUB ONLY */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-600 rounded flex items-center justify-center text-white font-bold text-2xl">
              🍺
            </div>
            <div className="font-semibold text-xl tracking-tight text-gray-900">
              Grok Pub
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1 text-sm font-medium">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <div 
                  key={item.label}
                  className="relative group"
                  onMouseEnter={() => setOpenMenu(item.label)}
                  onMouseLeave={() => setOpenMenu(null)}
                >
                  <Link
                    href={item.href}
                    className={`flex items-center gap-1 px-5 py-4 transition-colors hover:text-gray-900 border-b-2 ${
                      isActive 
                        ? 'border-blue-600 text-gray-900' 
                        : 'border-transparent text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {item.label}
                    {item.submenu && <ChevronDown className="w-4 h-4" />}
                  </Link>

                  {/* Dropdown */}
                  {item.submenu && (
                    <div className={`absolute left-0 top-[52px] w-56 bg-white rounded-md shadow-xl border border-gray-200 py-1 z-50 
                      ${openMenu === item.label ? 'block' : 'hidden group-hover:block'}`}>
                      {item.submenu.map((sub) => (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className="block px-5 py-2.5 text-sm hover:bg-gray-100 text-gray-700"
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

          {/* Right side buttons */}
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <Search className="w-5 h-5 text-gray-600" />
            </button>

            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all">
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
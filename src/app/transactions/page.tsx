'use client';

import Link from 'next/link';

const quickActions = [
  { 
    title: "Import Bank Statement", 
    href: "/transactions/import", 
    icon: "📥", 
    color: "bg-blue-600",
    desc: "ANZ CSV → Auto classify"
  },
  { 
    title: "Sales & Revenue", 
    href: "/transactions/sales", 
    icon: "💰", 
    color: "bg-green-600",
    desc: "Daily bar & bottle shop"
  },
  { 
    title: "Expenses & Purchases", 
    href: "/transactions/expenses", 
    icon: "📤", 
    color: "bg-orange-600",
    desc: "Suppliers & overheads"
  },
  { 
    title: "General Journal", 
    href: "/transactions/journal", 
    icon: "📝", 
    color: "bg-purple-600",
    desc: "Manual adjustments"
  },
  { 
    title: "Manage Bank Rules", 
    href: "/transactions/rules", 
    icon: "⚙️", 
    color: "bg-gray-700",
    desc: "Auto-coding rules"
  },
];

export default function TransactionsPage() {
  return (
    <div className="p-10">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-4xl font-bold">📋 Transactions</h1>
          <p className="text-gray-600 mt-2">Wagga Wagga Hotel • Single Entity</p>
        </div>
        <div className="text-sm text-gray-500">
          Last import: 3 days ago • 371 transactions classified
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {quickActions.map((action, index) => (
          <Link
            key={index}
            href={action.href}
            className={`${action.color} text-white p-7 rounded-3xl hover:scale-105 transition-all duration-200 shadow-lg group h-full flex flex-col`}
          >
            <div className="text-5xl mb-5 group-hover:scale-110 transition-transform">
              {action.icon}
            </div>
            <h3 className="text-2xl font-semibold mb-2">{action.title}</h3>
            <p className="opacity-90 text-sm mt-auto">{action.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
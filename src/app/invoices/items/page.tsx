'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';

type Item = {
  id: string;
  name: string;
  unitPrice: number;
  accountCode: string;
  accountName: string;
  hasGST: boolean;
  tracked: boolean;
  quantityOnHand: number;
};

type CoaOption = { code: string; name: string; type: string };

const empty = {
  name: '',
  unitPrice: '',
  accountCode: '',
  tracked: false,
  quantityOnHand: '',
  hasGST: true,
};

export default function InvoiceItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [coa, setCoa] = useState<CoaOption[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const [itemRes, coaRes] = await Promise.all([
      fetch('/api/invoice-items', { cache: 'no-store' }),
      fetch('/api/coa', { cache: 'no-store' }),
    ]);
    const itemData = await itemRes.json().catch(() => ({}));
    const coaData = await coaRes.json().catch(() => []);
    setItems(Array.isArray(itemData.items) ? itemData.items : []);
    const accounts = Array.isArray(coaData) ? coaData : [];
    setCoa(accounts.filter((account: CoaOption) => account.type === 'Revenue'));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const save = async () => {
    setError('');
    const account = coa.find((entry) => entry.code === form.accountCode);
    const res = await fetch('/api/invoice-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId || undefined,
        name: form.name,
        unitPrice: Number(form.unitPrice) || 0,
        accountCode: form.accountCode,
        accountName: account?.name || '',
        hasGST: form.hasGST,
        tracked: form.tracked,
        quantityOnHand: form.tracked ? Number(form.quantityOnHand) || 0 : 0,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      setError(data.error || 'Could not save the item');
      return;
    }
    setForm(empty);
    setEditingId(null);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this item from the list?')) return;
    await fetch('/api/invoice-items', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  return (
    <AccountingGate section="Invoices" backHref="/invoices" backLabel="← Invoices">
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">Invoice items</h1>
            <p className="text-slate-500 mt-1">
              Add these onto an invoice. Quantity on hand moves only when the item is tracked.
            </p>
          </div>
          <Link href="/invoices" className="text-sm text-slate-600 hover:underline">
            Back to invoices
          </Link>
        </div>

        <div className="bg-white border rounded-2xl p-5 mb-6 grid gap-3 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name"
            className="border rounded-xl px-3 py-2"
          />
          <input
            value={form.unitPrice}
            onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
            placeholder="Price (GST inclusive)"
            className="border rounded-xl px-3 py-2"
          />
          <select
            value={form.accountCode}
            onChange={(e) => setForm({ ...form, accountCode: e.target.value })}
            className="border rounded-xl px-3 py-2"
          >
            <option value="">Account</option>
            {coa.map((account) => (
              <option key={account.code} value={account.code}>
                {account.code} — {account.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.tracked}
              onChange={(e) => setForm({ ...form, tracked: e.target.checked })}
            />
            Track quantity on hand
          </label>
          {form.tracked ? (
            <input
              value={form.quantityOnHand}
              onChange={(e) => setForm({ ...form, quantityOnHand: e.target.value })}
              placeholder="Quantity on hand"
              className="border rounded-xl px-3 py-2"
            />
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.hasGST}
              onChange={(e) => setForm({ ...form, hasGST: e.target.checked })}
            />
            Price includes GST
          </label>
          <div className="md:col-span-2 flex gap-3">
            <button
              type="button"
              onClick={() => void save()}
              className="bg-orange-600 text-white rounded-xl px-4 py-2"
            >
              {editingId ? 'Update item' : 'Add item'}
            </button>
            {error ? <p className="text-red-600 text-sm self-center">{error}</p> : null}
          </div>
        </div>

        <table className="w-full text-sm bg-white border rounded-2xl overflow-hidden">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-right p-3">Price</th>
              <th className="text-left p-3">Account</th>
              <th className="text-right p-3">On hand</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3">{item.name}</td>
                <td className="p-3 text-right">${item.unitPrice.toFixed(2)}</td>
                <td className="p-3">{item.accountCode}</td>
                <td className="p-3 text-right">
                  {item.tracked ? item.quantityOnHand : '—'}
                </td>
                <td className="p-3 text-right space-x-3">
                  <button
                    type="button"
                    className="text-blue-700"
                    onClick={() => {
                      setEditingId(item.id);
                      setForm({
                        name: item.name,
                        unitPrice: String(item.unitPrice),
                        accountCode: item.accountCode,
                        tracked: item.tracked,
                        quantityOnHand: String(item.quantityOnHand || ''),
                        hasGST: item.hasGST,
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() => void remove(item.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  No items yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AccountingGate>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AccountingGate from '@/components/AccountingGate';

type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  billingAddress: string;
  abn: string;
  notes: string;
};

const emptyForm: Omit<Customer, 'id'> = {
  name: '',
  email: '',
  phone: '',
  billingAddress: '',
  abn: '',
  notes: '',
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/customers');
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      setStatus('Failed to load customers');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (c: Customer) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      email: c.email,
      phone: c.phone,
      billingAddress: c.billingAddress,
      abn: c.abn,
      notes: c.notes,
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setStatus('Name is required');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      resetForm();
      await load();
      setStatus('Saved');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this customer?')) return;
    try {
      const res = await fetch('/api/customers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Delete failed');
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <AccountingGate section="Customers" backHref="/accounting" backLabel="← Back to Accounting">
      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
            <p className="text-slate-500 mt-1">Contacts for invoicing</p>
          </div>
          <Link
            href="/invoices"
            className="text-sm font-medium text-orange-700 hover:underline"
          >
            Go to Invoices →
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit customer' : 'New customer'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-600 mb-1">Name *</label>
              <input
                className="w-full border border-slate-300 rounded-xl px-3 py-2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Email</label>
              <input
                type="email"
                className="w-full border border-slate-300 rounded-xl px-3 py-2"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Phone</label>
              <input
                className="w-full border border-slate-300 rounded-xl px-3 py-2"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">ABN</label>
              <input
                className="w-full border border-slate-300 rounded-xl px-3 py-2"
                value={form.abn}
                onChange={(e) => setForm({ ...form, abn: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-600 mb-1">Billing address</label>
              <textarea
                className="w-full border border-slate-300 rounded-xl px-3 py-2"
                rows={2}
                value={form.billingAddress}
                onChange={(e) =>
                  setForm({ ...form, billingAddress: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-600 mb-1">Notes</label>
              <textarea
                className="w-full border border-slate-300 rounded-xl px-3 py-2"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="bg-orange-600 hover:bg-orange-700 text-white font-medium px-5 py-2 rounded-xl disabled:opacity-50"
            >
              {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-5 py-2 rounded-xl"
              >
                Cancel
              </button>
            )}
            {status && <span className="text-sm text-slate-500 self-center">{status}</span>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Phone</th>
                <th className="text-left p-3 font-medium">ABN</th>
                <th className="p-3 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    No customers yet
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-slate-600">{c.email || '—'}</td>
                  <td className="p-3 text-slate-600">{c.phone || '—'}</td>
                  <td className="p-3 text-slate-600">{c.abn || '—'}</td>
                  <td className="p-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="text-orange-700 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AccountingGate>
  );
}

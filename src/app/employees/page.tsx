'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate, toIsoDateInput } from '@/lib/accounting/dates';
import { SUPER_GUARANTEE_PERCENT } from '@/lib/payroll/constants';

type EmploymentStatus = 'full-time' | 'part-time' | 'casual' | 'terminated';
type PayBasis = 'salary' | 'hourly';
type ResidencyStatus = 'resident' | 'foreign';
type TaxScaleType = 'standard' | 'working_holiday_maker' | 'no_tfn';
type PayFrequency = 'weekly' | 'fortnightly';
type PayRunStatus = 'draft' | 'posted' | 'stp_submitted';

type Employee = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  preferredName: string;
  email: string;
  phone: string;
  addressStreet: string;
  addressSuburb: string;
  addressState: string;
  addressPostcode: string;
  dateOfBirth: string;
  startDate: string;
  employmentStatus: EmploymentStatus;
  position: string;
  department: string;
  classification: string;
  tfn: string;
  residencyStatus: ResidencyStatus;
  taxFreeThreshold: boolean;
  taxScaleType: TaxScaleType;
  payBasis: PayBasis;
  payFrequency: PayFrequency;
  ordinaryRate: number;
  standardHoursPerWeek: number;
  bankAccountName: string;
  bsb: string;
  accountNumber: string;
  superFundName: string;
  superUsi: string;
  superAbn: string;
  superMemberNumber: string;
  sgPercent: number;
  leaveAnnualHours: number;
  leaveSickHours: number;
  notes: string;
};

type PayRunLine = {
  employeeId: string;
  employeeName: string;
  ordinaryEarnings: number;
  allowances: number;
  overtime: number;
  gross: number;
  ote: number;
  paygWithheld: number;
  superAmount: number;
  net: number;
  hours: number;
  ordinaryRate: number;
};

type PayRun = {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  frequency: PayFrequency;
  status: PayRunStatus;
  employeeIds: string[];
  lines: PayRunLine[];
  totals: {
    gross: number;
    paygWithheld: number;
    superAmount: number;
    net: number;
    employeeCount: number;
  };
  ledgerEntryIds: string[];
  journalRef?: string;
  postedAt?: string;
  notes: string;
};

const emptyEmployeeForm: Omit<Employee, 'id'> = {
  legalFirstName: '',
  legalLastName: '',
  preferredName: '',
  email: '',
  phone: '',
  addressStreet: '',
  addressSuburb: '',
  addressState: 'NSW',
  addressPostcode: '',
  dateOfBirth: '',
  startDate: '',
  employmentStatus: 'full-time',
  position: '',
  department: '',
  classification: '',
  tfn: '',
  residencyStatus: 'resident',
  taxFreeThreshold: true,
  taxScaleType: 'standard',
  payBasis: 'salary',
  payFrequency: 'weekly',
  ordinaryRate: 0,
  standardHoursPerWeek: 38,
  bankAccountName: '',
  bsb: '',
  accountNumber: '',
  superFundName: '',
  superUsi: '',
  superAbn: '',
  superMemberNumber: '',
  sgPercent: SUPER_GUARANTEE_PERCENT,
  leaveAnnualHours: 0,
  leaveSickHours: 0,
  notes: '',
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
  });
}

function maskTfn(tfn: string) {
  const digits = String(tfn || '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.length <= 3) return '***';
  return `***${digits.slice(-3)}`;
}

function displayName(e: Employee) {
  return (
    e.preferredName?.trim() ||
    `${e.legalFirstName} ${e.legalLastName}`.trim() ||
    e.id
  );
}

function statusLabel(s: PayRunStatus) {
  if (s === 'draft') return 'Draft';
  if (s === 'posted') return 'Posted';
  return 'STP ready (not lodged)';
}

function statusClass(s: PayRunStatus) {
  if (s === 'draft') return 'bg-yellow-100 text-yellow-800';
  if (s === 'posted') return 'bg-green-100 text-green-800';
  return 'bg-slate-100 text-slate-700';
}

function weekDefaults() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return {
    periodStart: toIsoDateInput(start),
    periodEnd: toIsoDateInput(end),
    paymentDate: toIsoDateInput(end),
    frequency: 'weekly' as PayFrequency,
  };
}

export default function EmployeesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'employees' | 'payruns' | 'payslips'>(
    'employees'
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payRuns, setPayRuns] = useState<PayRun[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyEmployeeForm);
  const [saving, setSaving] = useState(false);

  const [showPayRunModal, setShowPayRunModal] = useState(false);
  const [payForm, setPayForm] = useState(weekDefaults);
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [empRes, runRes] = await Promise.all([
        fetch('/api/employees'),
        fetch('/api/payruns'),
      ]);
      const empData = await empRes.json();
      const runData = await runRes.json();
      setEmployees(Array.isArray(empData) ? empData : []);
      setPayRuns(Array.isArray(runData) ? runData : []);
    } catch {
      setStatus('Failed to load employment data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.employmentStatus !== 'terminated'),
    [employees]
  );

  const payslipRows = useMemo(() => {
    const rows: Array<{
      key: string;
      payRunId: string;
      payRunNumber: string;
      employeeId: string;
      employeeName: string;
      paymentDate: string;
      gross: number;
      net: number;
      status: PayRunStatus;
    }> = [];
    for (const run of payRuns) {
      for (const line of run.lines) {
        rows.push({
          key: `${run.id}-${line.employeeId}`,
          payRunId: run.id,
          payRunNumber: run.number,
          employeeId: line.employeeId,
          employeeName: line.employeeName,
          paymentDate: run.paymentDate,
          gross: line.gross,
          net: line.net,
          status: run.status,
        });
      }
    }
    return rows;
  }, [payRuns]);

  const openEmployeeModal = (emp?: Employee) => {
    if (emp) {
      setEditingId(emp.id);
      const { id: _id, ...rest } = emp;
      setForm({ ...emptyEmployeeForm, ...rest });
    } else {
      setEditingId(null);
      setForm({ ...emptyEmployeeForm });
    }
    setShowEmployeeModal(true);
  };

  const saveEmployee = async () => {
    if (!form.legalFirstName.trim() || !form.legalLastName.trim()) {
      setStatus('Legal first and last name are required');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setShowEmployeeModal(false);
      await load();
      setStatus('Employee saved');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteEmployee = async (id: string) => {
    if (!confirm('Delete this employee?')) return;
    try {
      const res = await fetch('/api/employees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Delete failed');
      await load();
      setStatus('Employee deleted');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const openPayRunModal = () => {
    setPayForm(weekDefaults());
    setSelectedEmpIds(activeEmployees.map((e) => e.id));
    setShowPayRunModal(true);
  };

  const createPayRun = async () => {
    if (!selectedEmpIds.length) {
      setStatus('Select at least one employee');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/payruns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payForm,
          employeeIds: selectedEmpIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Create failed');
      setShowPayRunModal(false);
      setStatus(`Pay run ${data.payRun.number} created (draft)`);
      router.push(`/employees/payruns/${data.payRun.id}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const postPayRun = async (id: string) => {
    if (
      !confirm(
        'Post this pay run to the ledger? This creates wages, PAYG and super journals and cannot be undone in MVP.'
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/payruns/${id}/post`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Post failed');
      await load();
      setStatus(`Pay run ${data.payRun.number} posted to ledger`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Post failed');
    } finally {
      setSaving(false);
    }
  };

  const markStpReady = async (id: string) => {
    try {
      const res = await fetch(`/api/payruns/${id}/stp-ready`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
      await load();
      setStatus('Marked STP-ready (lodgement not implemented yet)');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    }
  };

  const deletePayRun = async (id: string) => {
    if (!confirm('Delete this draft pay run?')) return;
    try {
      const res = await fetch('/api/payruns', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Delete failed');
      if (selectedRunId === id) setSelectedRunId(null);
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const field = (label: string, children: ReactNode) => (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );

  const inputCls = 'w-full border rounded-xl px-4 py-3';

  return (
    <AccountingGate section="Employees">
      <div className="p-10 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">Employment</h1>
            <p className="text-gray-600">
              {employees.length} employees · payroll posts to ledger on finalise
            </p>
          </div>
          <div className="flex gap-3">
            {activeTab === 'payruns' ? (
              <button
                type="button"
                onClick={openPayRunModal}
                className="bg-blue-600 text-white px-6 py-3 rounded-2xl hover:bg-blue-700"
              >
                + Create Pay Run
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openEmployeeModal()}
                className="bg-blue-600 text-white px-6 py-3 rounded-2xl hover:bg-blue-700"
              >
                + Add Employee
              </button>
            )}
          </div>
        </div>

        {status && (
          <div className="mb-6 rounded-2xl bg-slate-50 border px-4 py-3 text-sm text-slate-700">
            {status}
          </div>
        )}

        <div className="flex gap-2 mb-8 border-b pb-1">
          {(
            [
              ['employees', 'Employees'],
              ['payruns', 'Pay Runs'],
              ['payslips', 'Payslips'],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-8 py-3 rounded-t-2xl font-medium transition-all ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center py-20 text-gray-500">Loading…</p>
        ) : null}

        {!loading && activeTab === 'employees' && (
          <div className="bg-white rounded-3xl shadow overflow-hidden">
            {employees.length === 0 ? (
              <p className="text-center py-20 text-gray-500">
                No employees yet. Add employment records to run payroll.
              </p>
            ) : (
              employees.map((emp) => (
                <div
                  key={emp.id}
                  className="p-6 border-b flex flex-wrap justify-between items-center gap-4 hover:bg-gray-50"
                >
                  <div>
                    <h2 className="text-xl font-semibold">{displayName(emp)}</h2>
                    <p className="text-gray-600">
                      {emp.position || 'No position'} · {emp.employmentStatus}
                      {emp.payBasis === 'salary'
                        ? ` · ${money(emp.ordinaryRate)}/yr`
                        : ` · ${money(emp.ordinaryRate)}/hr`}
                    </p>
                    <p className="text-sm text-gray-500">
                      {emp.email || 'No email'} · TFN {maskTfn(emp.tfn)} · SG{' '}
                      {emp.sgPercent}%
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => openEmployeeModal(emp)}
                      className="px-5 py-2 border rounded-xl hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEmployee(emp.id)}
                      className="px-5 py-2 border border-red-300 text-red-600 rounded-xl hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!loading && activeTab === 'payruns' && (
          <div className="bg-white rounded-3xl shadow p-6">
            <h2 className="text-2xl font-semibold mb-2">Pay runs</h2>
            <p className="text-sm text-slate-500 mb-4">
              Open a draft to edit each employee&apos;s payslip for the period,
              then post when ready.
            </p>
            {payRuns.length === 0 ? (
              <p className="text-center py-12 text-gray-500">
                No pay runs yet. Create a weekly or fortnightly run.
              </p>
            ) : (
              <div className="space-y-3">
                {payRuns.map((run) => (
                  <Link
                    key={run.id}
                    href={`/employees/payruns/${run.id}`}
                    className="block border rounded-2xl p-4 hover:bg-gray-50"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <p className="font-semibold">
                          {run.number} · {run.frequency}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatAuDate(run.periodStart)} –{' '}
                          {formatAuDate(run.periodEnd)}
                        </p>
                        <p className="text-sm text-gray-500">
                          Pay {formatAuDate(run.paymentDate)} ·{' '}
                          {run.totals.employeeCount} employees
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{money(run.totals.gross)}</p>
                        <span
                          className={`inline-block mt-1 px-3 py-1 rounded-full text-xs ${statusClass(
                            run.status
                          )}`}
                        >
                          {statusLabel(run.status)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === 'payslips' && (
          <div className="bg-white rounded-3xl shadow overflow-hidden">
            {payslipRows.length === 0 ? (
              <p className="text-center py-20 text-gray-500">
                Payslips appear after you create a pay run.
              </p>
            ) : (
              payslipRows.map((row) => (
                <div
                  key={row.key}
                  className="p-5 border-b flex flex-wrap justify-between items-center gap-3 hover:bg-gray-50"
                >
                  <div>
                    <p className="font-semibold">{row.employeeName}</p>
                    <p className="text-sm text-gray-500">
                      {row.payRunNumber} · Pay {formatAuDate(row.paymentDate)} ·{' '}
                      {statusLabel(row.status)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <p>Gross {money(row.gross)}</p>
                      <p className="text-gray-500">Net {money(row.net)}</p>
                    </div>
                    <Link
                      href={`/employees/payruns/${row.payRunId}/payslip/${row.employeeId}`}
                      className="px-5 py-2 border rounded-xl hover:bg-white"
                    >
                      Open payslip
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {showEmployeeModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-auto">
              <div className="p-8">
                <h2 className="text-3xl font-bold mb-6">
                  {editingId ? 'Edit Employee' : 'Add Employee'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                  <div className="space-y-4">
                    <h3 className="font-semibold">Personal</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {field(
                        'Legal first name *',
                        <input
                          className={inputCls}
                          value={form.legalFirstName}
                          onChange={(e) =>
                            setForm({ ...form, legalFirstName: e.target.value })
                          }
                        />
                      )}
                      {field(
                        'Legal last name *',
                        <input
                          className={inputCls}
                          value={form.legalLastName}
                          onChange={(e) =>
                            setForm({ ...form, legalLastName: e.target.value })
                          }
                        />
                      )}
                    </div>
                    {field(
                      'Preferred name',
                      <input
                        className={inputCls}
                        value={form.preferredName}
                        onChange={(e) =>
                          setForm({ ...form, preferredName: e.target.value })
                        }
                      />
                    )}
                    {field(
                      'Email',
                      <input
                        type="email"
                        className={inputCls}
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    )}
                    {field(
                      'Phone',
                      <input
                        className={inputCls}
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      {field(
                        'Date of birth',
                        <input
                          type="date"
                          className={inputCls}
                          value={toIsoDateInput(form.dateOfBirth)}
                          onChange={(e) =>
                            setForm({ ...form, dateOfBirth: e.target.value })
                          }
                        />
                      )}
                      {field(
                        'Start date',
                        <input
                          type="date"
                          className={inputCls}
                          value={toIsoDateInput(form.startDate)}
                          onChange={(e) =>
                            setForm({ ...form, startDate: e.target.value })
                          }
                        />
                      )}
                    </div>
                    {field(
                      'Street address',
                      <input
                        className={inputCls}
                        value={form.addressStreet}
                        onChange={(e) =>
                          setForm({ ...form, addressStreet: e.target.value })
                        }
                      />
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      {field(
                        'Suburb',
                        <input
                          className={inputCls}
                          value={form.addressSuburb}
                          onChange={(e) =>
                            setForm({ ...form, addressSuburb: e.target.value })
                          }
                        />
                      )}
                      {field(
                        'State',
                        <input
                          className={inputCls}
                          value={form.addressState}
                          onChange={(e) =>
                            setForm({ ...form, addressState: e.target.value })
                          }
                        />
                      )}
                      {field(
                        'Postcode',
                        <input
                          className={inputCls}
                          value={form.addressPostcode}
                          onChange={(e) =>
                            setForm({ ...form, addressPostcode: e.target.value })
                          }
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold">Employment</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {field(
                        'Status',
                        <select
                          className={inputCls}
                          value={form.employmentStatus}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              employmentStatus: e.target.value as EmploymentStatus,
                            })
                          }
                        >
                          <option value="full-time">Full-time</option>
                          <option value="part-time">Part-time</option>
                          <option value="casual">Casual</option>
                          <option value="terminated">Terminated</option>
                        </select>
                      )}
                      {field(
                        'Pay frequency',
                        <select
                          className={inputCls}
                          value={form.payFrequency}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              payFrequency: e.target.value as PayFrequency,
                            })
                          }
                        >
                          <option value="weekly">Weekly</option>
                          <option value="fortnightly">Fortnightly</option>
                        </select>
                      )}
                    </div>
                    {field(
                      'Position',
                      <input
                        className={inputCls}
                        value={form.position}
                        onChange={(e) => setForm({ ...form, position: e.target.value })}
                      />
                    )}
                    {field(
                      'Department',
                      <input
                        className={inputCls}
                        value={form.department}
                        onChange={(e) =>
                          setForm({ ...form, department: e.target.value })
                        }
                      />
                    )}
                    {field(
                      'Classification (optional)',
                      <input
                        className={inputCls}
                        value={form.classification}
                        onChange={(e) =>
                          setForm({ ...form, classification: e.target.value })
                        }
                        placeholder="Award classification"
                      />
                    )}

                    <h3 className="font-semibold pt-2">Pay template</h3>
                    <p className="text-xs text-slate-500 -mt-2">
                      Default hours and rate used when a pay run is created for
                      this employee.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {field(
                        'Pay basis',
                        <select
                          className={inputCls}
                          value={form.payBasis}
                          onChange={(e) =>
                            setForm({ ...form, payBasis: e.target.value as PayBasis })
                          }
                        >
                          <option value="salary">Salary (annual)</option>
                          <option value="hourly">Hourly</option>
                        </select>
                      )}
                      {field(
                        form.payBasis === 'salary' ? 'Annual salary' : 'Hourly rate',
                        <input
                          type="number"
                          className={inputCls}
                          value={form.ordinaryRate || ''}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              ordinaryRate: Number(e.target.value) || 0,
                            })
                          }
                        />
                      )}
                    </div>
                    {field(
                      'Ordinary hours / week',
                      <input
                        type="number"
                        className={inputCls}
                        value={form.standardHoursPerWeek || ''}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            standardHoursPerWeek: Number(e.target.value) || 0,
                          })
                        }
                      />
                    )}

                    <h3 className="font-semibold pt-2">Tax</h3>
                    {field(
                      'TFN (stored locally — masked in lists)',
                      <input
                        className={inputCls}
                        value={form.tfn}
                        onChange={(e) => setForm({ ...form, tfn: e.target.value })}
                        autoComplete="off"
                      />
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      {field(
                        'Residency',
                        <select
                          className={inputCls}
                          value={form.residencyStatus}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              residencyStatus: e.target.value as ResidencyStatus,
                            })
                          }
                        >
                          <option value="resident">Australian resident</option>
                          <option value="foreign">Foreign resident</option>
                        </select>
                      )}
                      {field(
                        'Tax scale',
                        <select
                          className={inputCls}
                          value={form.taxScaleType}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              taxScaleType: e.target.value as TaxScaleType,
                            })
                          }
                        >
                          <option value="standard">Standard</option>
                          <option value="working_holiday_maker">
                            Working holiday maker
                          </option>
                          <option value="no_tfn">No TFN</option>
                        </select>
                      )}
                    </div>
                    {field(
                      'Tax-free threshold',
                      <select
                        className={inputCls}
                        value={form.taxFreeThreshold ? 'yes' : 'no'}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            taxFreeThreshold: e.target.value === 'yes',
                          })
                        }
                      >
                        <option value="yes">Claimed</option>
                        <option value="no">Not claimed</option>
                      </select>
                    )}

                    <h3 className="font-semibold pt-2">Leave balances (hours)</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {field(
                        'Annual leave',
                        <input
                          type="number"
                          className={inputCls}
                          value={form.leaveAnnualHours || ''}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              leaveAnnualHours: Number(e.target.value) || 0,
                            })
                          }
                        />
                      )}
                      {field(
                        'Personal / sick leave',
                        <input
                          type="number"
                          className={inputCls}
                          value={form.leaveSickHours || ''}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              leaveSickHours: Number(e.target.value) || 0,
                            })
                          }
                        />
                      )}
                    </div>

                    <h3 className="font-semibold pt-2">Bank</h3>
                    {field(
                      'Account name',
                      <input
                        className={inputCls}
                        value={form.bankAccountName}
                        onChange={(e) =>
                          setForm({ ...form, bankAccountName: e.target.value })
                        }
                      />
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      {field(
                        'BSB',
                        <input
                          className={inputCls}
                          value={form.bsb}
                          onChange={(e) => setForm({ ...form, bsb: e.target.value })}
                        />
                      )}
                      {field(
                        'Account number',
                        <input
                          className={inputCls}
                          value={form.accountNumber}
                          onChange={(e) =>
                            setForm({ ...form, accountNumber: e.target.value })
                          }
                        />
                      )}
                    </div>

                    <h3 className="font-semibold pt-2">Superannuation</h3>
                    {field(
                      'Fund name',
                      <input
                        className={inputCls}
                        value={form.superFundName}
                        onChange={(e) =>
                          setForm({ ...form, superFundName: e.target.value })
                        }
                      />
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      {field(
                        'USI',
                        <input
                          className={inputCls}
                          value={form.superUsi}
                          onChange={(e) =>
                            setForm({ ...form, superUsi: e.target.value })
                          }
                        />
                      )}
                      {field(
                        'Fund ABN',
                        <input
                          className={inputCls}
                          value={form.superAbn}
                          onChange={(e) =>
                            setForm({ ...form, superAbn: e.target.value })
                          }
                        />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {field(
                        'Member number',
                        <input
                          className={inputCls}
                          value={form.superMemberNumber}
                          onChange={(e) =>
                            setForm({ ...form, superMemberNumber: e.target.value })
                          }
                        />
                      )}
                      {field(
                        'SG %',
                        <input
                          type="number"
                          className={inputCls}
                          value={form.sgPercent || ''}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              sgPercent: Number(e.target.value) || 0,
                            })
                          }
                        />
                      )}
                    </div>

                    <h3 className="font-semibold pt-2">Notes</h3>
                    <textarea
                      className={inputCls}
                      rows={3}
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Internal notes"
                    />
                  </div>
                </div>

                <div className="flex gap-4 mt-10">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveEmployee}
                    className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Employee'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEmployeeModal(false)}
                    className="flex-1 border py-4 rounded-2xl font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showPayRunModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 w-full max-w-lg max-h-[90vh] overflow-auto">
              <h2 className="text-2xl font-bold mb-6">Create Pay Run</h2>
              <div className="space-y-4">
                {field(
                  'Frequency',
                  <select
                    className={inputCls}
                    value={payForm.frequency}
                    onChange={(e) =>
                      setPayForm({
                        ...payForm,
                        frequency: e.target.value as PayFrequency,
                      })
                    }
                  >
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                  </select>
                )}
                {field(
                  'Period start',
                  <input
                    type="date"
                    className={inputCls}
                    value={payForm.periodStart}
                    onChange={(e) =>
                      setPayForm({ ...payForm, periodStart: e.target.value })
                    }
                  />
                )}
                {field(
                  'Period end',
                  <input
                    type="date"
                    className={inputCls}
                    value={payForm.periodEnd}
                    onChange={(e) =>
                      setPayForm({ ...payForm, periodEnd: e.target.value })
                    }
                  />
                )}
                {field(
                  'Payment date',
                  <input
                    type="date"
                    className={inputCls}
                    value={payForm.paymentDate}
                    onChange={(e) =>
                      setPayForm({ ...payForm, paymentDate: e.target.value })
                    }
                  />
                )}
                <div>
                  <p className="text-sm text-gray-600 mb-2">Employees</p>
                  <div className="max-h-48 overflow-auto border rounded-xl p-3 space-y-2">
                    {activeEmployees.length === 0 ? (
                      <p className="text-sm text-gray-500">No active employees</p>
                    ) : (
                      activeEmployees.map((emp) => (
                        <label key={emp.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedEmpIds.includes(emp.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEmpIds([...selectedEmpIds, emp.id]);
                              } else {
                                setSelectedEmpIds(
                                  selectedEmpIds.filter((id) => id !== emp.id)
                                );
                              }
                            }}
                          />
                          {displayName(emp)}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={createPayRun}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-semibold mt-6 disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create draft pay run'}
              </button>
              <button
                type="button"
                onClick={() => setShowPayRunModal(false)}
                className="w-full border py-4 rounded-2xl mt-3"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </AccountingGate>
  );
}

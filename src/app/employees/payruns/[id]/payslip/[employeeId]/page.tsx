'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AccountingGate from '@/components/AccountingGate';
import { formatAuDate } from '@/lib/accounting/dates';

type PayslipPayload = {
  payRun: {
    id: string;
    number: string;
    periodStart: string;
    periodEnd: string;
    paymentDate: string;
    frequency: string;
    status: string;
  };
  line: {
    employeeId: string;
    employeeName: string;
    employmentStatus?: string;
    ordinaryEarnings: number;
    ordinaryRate?: number;
    allowances: number;
    overtime: number;
    overtimeHours?: number;
    saturdayHours?: number;
    saturdayEarnings?: number;
    sundayHours?: number;
    sundayEarnings?: number;
    gross: number;
    paygWithheld: number;
    superAmount: number;
    net: number;
    hours: number;
    ote: number;
  };
  employee: {
    legalFirstName: string;
    legalLastName: string;
    preferredName: string;
    email: string;
    addressStreet: string;
    addressSuburb: string;
    addressState: string;
    addressPostcode: string;
    bankAccountName: string;
    bsb: string;
    accountNumber: string;
    superFundName: string;
    superMemberNumber: string;
    tfn: string;
    position: string;
  } | null;
  ytd: {
    gross: number;
    paygWithheld: number;
    superAmount: number;
    net: number;
  };
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
  });
}

export default function PayslipPage() {
  const params = useParams();
  const payRunId = String(params?.id || '');
  const employeeId = String(params?.employeeId || '');
  const [data, setData] = useState<PayslipPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!payRunId || !employeeId) return;
    fetch(`/api/payruns/${payRunId}/payslip/${employeeId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load');
        setData(json);
      })
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [payRunId, employeeId]);

  return (
    <AccountingGate section="Employees">
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex flex-wrap justify-between gap-3 mb-6 print:hidden">
          <Link href="/employees" className="text-blue-600 hover:underline">
            ← Back to Employment
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-blue-600 text-white px-5 py-2 rounded-xl hover:bg-blue-700"
          >
            Print / PDF
          </button>
        </div>

        {loading ? (
          <p className="text-center py-16 text-gray-500">Loading payslip…</p>
        ) : error ? (
          <div className="bg-red-50 text-red-700 rounded-2xl p-6">{error}</div>
        ) : data ? (
          <div className="bg-white rounded-3xl shadow p-10 print:shadow-none print:rounded-none">
            <div className="flex justify-between gap-4 border-b pb-6 mb-6">
              <div>
                <p className="text-sm text-gray-500">Payslip</p>
                <h1 className="text-3xl font-bold">
                  {data.employee
                    ? data.employee.preferredName ||
                      `${data.employee.legalFirstName} ${data.employee.legalLastName}`
                    : data.line.employeeName}
                </h1>
                {data.employee?.position && (
                  <p className="text-gray-600">{data.employee.position}</p>
                )}
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">{data.payRun.number}</p>
                <p>
                  Period {formatAuDate(data.payRun.periodStart)} –{' '}
                  {formatAuDate(data.payRun.periodEnd)}
                </p>
                <p>Payment {formatAuDate(data.payRun.paymentDate)}</p>
                <p className="capitalize">{data.payRun.frequency}</p>
              </div>
            </div>

            {data.employee && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-8">
                <div>
                  <p className="text-gray-500">Address</p>
                  <p>
                    {[
                      data.employee.addressStreet,
                      data.employee.addressSuburb,
                      data.employee.addressState,
                      data.employee.addressPostcode,
                    ]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </p>
                  <p className="mt-2 text-gray-500">TFN</p>
                  <p>{data.employee.tfn || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Bank</p>
                  <p>{data.employee.bankAccountName || '—'}</p>
                  <p>
                    {[data.employee.bsb, data.employee.accountNumber]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                  <p className="mt-2 text-gray-500">Super</p>
                  <p>{data.employee.superFundName || '—'}</p>
                  <p>{data.employee.superMemberNumber || ''}</p>
                </div>
              </div>
            )}

            <table className="w-full text-sm mb-8">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2">Earnings</th>
                  <th className="py-2 text-right">This pay</th>
                  <th className="py-2 text-right">YTD</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3">
                    Ordinary
                    {data.line.hours > 0
                      ? ` (${data.line.hours}h weekday)`
                      : ''}
                  </td>
                  <td className="py-3 text-right">
                    {money(data.line.ordinaryEarnings)}
                  </td>
                  <td className="py-3 text-right text-gray-400">—</td>
                </tr>
                {(Number(data.line.saturdayEarnings) || 0) > 0 && (
                  <tr className="border-b">
                    <td className="py-3">
                      Saturday
                      {(Number(data.line.saturdayHours) || 0) > 0
                        ? ` (${data.line.saturdayHours}h)`
                        : ''}
                    </td>
                    <td className="py-3 text-right">
                      {money(data.line.saturdayEarnings || 0)}
                    </td>
                    <td className="py-3 text-right text-gray-400">—</td>
                  </tr>
                )}
                {(Number(data.line.sundayEarnings) || 0) > 0 && (
                  <tr className="border-b">
                    <td className="py-3">
                      Sunday
                      {(Number(data.line.sundayHours) || 0) > 0
                        ? ` (${data.line.sundayHours}h)`
                        : ''}
                    </td>
                    <td className="py-3 text-right">
                      {money(data.line.sundayEarnings || 0)}
                    </td>
                    <td className="py-3 text-right text-gray-400">—</td>
                  </tr>
                )}
                {data.line.allowances > 0 && (
                  <tr className="border-b">
                    <td className="py-3">Allowances</td>
                    <td className="py-3 text-right">{money(data.line.allowances)}</td>
                    <td className="py-3 text-right text-gray-400">—</td>
                  </tr>
                )}
                {data.line.overtime > 0 && (
                  <tr className="border-b">
                    <td className="py-3">
                      Overtime
                      {(Number(data.line.overtimeHours) || 0) > 0
                        ? ` (${data.line.overtimeHours}h)`
                        : ''}
                    </td>
                    <td className="py-3 text-right">{money(data.line.overtime)}</td>
                    <td className="py-3 text-right text-gray-400">—</td>
                  </tr>
                )}
                <tr className="border-b font-medium">
                  <td className="py-3">Gross</td>
                  <td className="py-3 text-right">{money(data.line.gross)}</td>
                  <td className="py-3 text-right">{money(data.ytd.gross)}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3">PAYG withheld</td>
                  <td className="py-3 text-right">{money(data.line.paygWithheld)}</td>
                  <td className="py-3 text-right">{money(data.ytd.paygWithheld)}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-3">
                    Super (SG on OTE {money(data.line.ote)})
                  </td>
                  <td className="py-3 text-right">{money(data.line.superAmount)}</td>
                  <td className="py-3 text-right">{money(data.ytd.superAmount)}</td>
                </tr>
                <tr className="font-bold text-lg">
                  <td className="py-4">Net pay</td>
                  <td className="py-4 text-right">{money(data.line.net)}</td>
                  <td className="py-4 text-right">{money(data.ytd.net)}</td>
                </tr>
              </tbody>
            </table>

            <p className="text-xs text-gray-400">
              Weekend and overtime rows use Hospitality Industry (General) Award
              (MA000009) multipliers for NSW. Employer super is not deducted from
              net pay. PAYG uses ATO Schedule 1 formula approximation (LI 2026/18).
              STP lodgement is not included on this payslip.
            </p>
          </div>
        ) : null}
      </div>
    </AccountingGate>
  );
}

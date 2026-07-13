'use client';

export default function ChartOfAccounts() {
  return (
    <div className="p-10">
      <div className="max-w-5xl">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          📊 Chart of Accounts
        </h1>
        <p className="text-gray-600 mb-8">Double-entry ledger structure for Grok Pub</p>

        <div className="bg-white rounded-3xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-4 text-left font-medium">Code</th>
                <th className="px-6 py-4 text-left font-medium">Account Name</th>
                <th className="px-6 py-4 text-left font-medium">Group</th>
                <th className="px-6 py-4 text-left font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono text-sm">1000</td>
                <td className="px-6 py-4">Cash at Bank</td>
                <td className="px-6 py-4 text-blue-600">Assets</td>
                <td className="px-6 py-4 text-sm text-gray-500">Current Asset</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono text-sm">1100</td>
                <td className="px-6 py-4">Accounts Receivable</td>
                <td className="px-6 py-4 text-blue-600">Assets</td>
                <td className="px-6 py-4 text-sm text-gray-500">Current Asset</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono text-sm">2000</td>
                <td className="px-6 py-4">Accounts Payable</td>
                <td className="px-6 py-4 text-orange-600">Liabilities</td>
                <td className="px-6 py-4 text-sm text-gray-500">Current Liability</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono text-sm">4000</td>
                <td className="px-6 py-4">Sales Revenue - Drinks</td>
                <td className="px-6 py-4 text-green-600">Revenue</td>
                <td className="px-6 py-4 text-sm text-gray-500">Income</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-8 p-6 bg-amber-50 rounded-2xl text-amber-800 text-center">
          ✅ COA Page is now working • Full editor coming next
        </div>
      </div>
    </div>
  );
}
'use client';

export default function BalanceSheet() {
  return (
    <div className="p-10">
      <h1 className="text-4xl font-bold mb-8">Balance Sheet</h1>
      <p className="text-gray-500 mb-10">As at 31 May 2026</p>

      <div className="bg-white rounded-3xl shadow p-10">
        <div className="grid grid-cols-2 gap-16">
          <div>
            <h3 className="font-semibold text-xl mb-6 text-blue-700">Assets</h3>
            <div className="space-y-4">
              <div className="flex justify-between"><span>Cash at Bank</span><span className="font-medium">$87,450</span></div>
              <div className="flex justify-between"><span>Accounts Receivable</span><span className="font-medium">$12,300</span></div>
              <div className="flex justify-between"><span>Inventory</span><span className="font-medium">$28,900</span></div>
              <div className="flex justify-between border-t pt-4 font-bold"><span>Total Assets</span><span>$128,650</span></div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-xl mb-6 text-orange-700">Liabilities & Equity</h3>
            <div className="space-y-4">
              <div className="flex justify-between"><span>Accounts Payable</span><span className="font-medium">$18,200</span></div>
              <div className="flex justify-between"><span>Loans</span><span className="font-medium">$45,000</span></div>
              <div className="flex justify-between"><span>Equity</span><span className="font-medium">$65,450</span></div>
              <div className="flex justify-between border-t pt-4 font-bold"><span>Total Liabilities & Equity</span><span>$128,650</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
'use client';

export default function ProfitLoss() {
  return (
    <div className="p-10">
      <h1 className="text-4xl font-bold mb-8">Profit & Loss Statement</h1>
      
      <div className="bg-white rounded-3xl shadow p-10">
        <div className="flex justify-between mb-10">
          <div>
            <p className="text-gray-500">Financial Year 2025/26</p>
            <p className="text-2xl font-semibold">1 July 2025 – 30 June 2026</p>
          </div>
          <div className="text-right">
            <p className="text-green-600 text-4xl font-bold">$248,750</p>
            <p className="text-sm text-gray-500">Net Profit YTD</p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h3 className="font-semibold text-lg mb-4 text-green-700">Revenue</h3>
            <div className="pl-6 space-y-3">
              <div className="flex justify-between"><span>Bar Sales</span><span className="font-medium">$142,300</span></div>
              <div className="flex justify-between"><span>Bottle Shop</span><span className="font-medium">$68,450</span></div>
              <div className="flex justify-between"><span>Wholesale Draught</span><span className="font-medium">$31,200</span></div>
              <div className="flex justify-between border-t pt-3 font-semibold"><span>Total Revenue</span><span>$248,750</span></div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-4 text-red-700">Expenses</h3>
            <div className="pl-6 space-y-3 text-sm">
              <div className="flex justify-between"><span>Cost of Goods Sold</span><span>$98,400</span></div>
              <div className="flex justify-between"><span>Wages</span><span>$52,300</span></div>
              <div className="flex justify-between"><span>Utilities & Rent</span><span>$28,750</span></div>
              <div className="flex justify-between font-semibold border-t pt-3"><span>Total Expenses</span><span>$192,300</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
'use client';

export default function Dashboard() {
  return (
    <div className="p-10">
      <h1 className="text-5xl font-bold text-green-600 mb-8 flex items-center gap-4">
        🍺 Grok Pub Accounting
      </h1>
      
      <p className="text-xl text-gray-600 mb-10">Wagga Wagga Hotel • Live Accounting System</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-3xl shadow">
          <h3 className="text-lg font-semibold text-gray-500">Today's Sales</h3>
          <p className="text-5xl font-bold text-green-600 mt-4">$0.00</p>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow">
          <h3 className="text-lg font-semibold text-gray-500">Cash on Hand</h3>
          <p className="text-5xl font-bold text-amber-600 mt-4">$0.00</p>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow">
          <h3 className="text-lg font-semibold text-gray-500">Open Tabs</h3>
          <p className="text-5xl font-bold text-purple-600 mt-4">0</p>
        </div>
      </div>

      <div className="mt-12 text-center text-gray-500">
        Ready for Transactions, Reports, and Chart of Accounts
      </div>
    </div>
  );
}
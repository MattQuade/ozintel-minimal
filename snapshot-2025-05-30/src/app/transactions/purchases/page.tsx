'use client';

export default function Expenses() {
  return (
    <div className="p-10">
      <div className="max-w-5xl">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          📤 Expenses
        </h1>
        <p className="text-gray-600 mb-10">Petty cash, wages, utilities, repairs &amp; maintenance</p>

        <div className="bg-white rounded-3xl shadow p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-semibold">Recent Expenses</h2>
            <button 
              onClick={() => alert('New Expense form coming soon')}
              className="bg-rose-600 text-white px-6 py-3 rounded-2xl hover:bg-rose-700 transition"
            >
              + New Expense
            </button>
          </div>

          <div className="text-center py-20 text-gray-400 text-6xl">
            💸 Expense List + Entry Form Coming Next
          </div>
        </div>
      </div>
    </div>
  );
}
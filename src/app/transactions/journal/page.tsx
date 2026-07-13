'use client';

export default function GeneralJournal() {
  return (
    <div className="p-10 max-w-7xl mx-auto">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-4xl font-bold">Journal Entries</h1>
          <p className="text-gray-600 mt-1">Double-entry bookkeeping records</p>
        </div>
        <button className="bg-blue-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-blue-700 transition">
          <span className="text-xl">+</span> New Entry
        </button>
      </div>

      {/* Search */}
      <div className="mb-8">
        <input 
          type="text" 
          placeholder="Search by reference, memo or date..." 
          className="w-full border border-gray-300 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Period Selector */}
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500 mb-3">PERIOD (AUS FINANCIAL YEAR)</p>
        <div className="flex flex-wrap gap-3">
          {["Full Year FY25/26", "Q1 Jul-Sep 2025", "Q2 Oct-Dec 2025", "Q3 Jan-Mar 2026", "Q4 Apr-Jun 2026"].map((period, i) => (
            <button 
              key={i}
              className={`px-6 py-3 rounded-2xl text-sm font-medium transition-all ${i === 4 ? 'bg-blue-600 text-white' : 'bg-white border hover:bg-gray-50'}`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white rounded-3xl p-8 shadow">
          <p className="text-sm text-gray-500">GST Collected</p>
          <p className="text-4xl font-bold text-red-600 mt-3">$0.00</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow">
          <p className="text-sm text-gray-500">GST Paid (claimable)</p>
          <p className="text-4xl font-bold text-green-600 mt-3">$0.00</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow">
          <p className="text-sm text-gray-500">Net GST Owing</p>
          <p className="text-4xl font-bold text-amber-600 mt-3">$0.00</p>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-8 shadow">
          <p className="text-sm text-gray-500">PAYG Withholding Owing</p>
          <p className="text-4xl font-bold text-purple-600 mt-3">$152.00</p>
        </div>

        <div className="bg-red-50 rounded-3xl p-8 shadow border border-red-100">
          <p className="text-sm text-red-600">Total ATO Obligations</p>
          <p className="text-4xl font-bold text-red-600 mt-3">$152.00</p>
        </div>
      </div>

      <div className="mt-12 text-center text-gray-400">
        Recent journal entries will appear here • New Entry button above
      </div>
    </div>
  );
}
'use client';

export default function GeneralJournal() {
  return (
    <div className="p-10">
      <div className="max-w-5xl">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          📖 General Journal
        </h1>
        <p className="text-gray-600 mb-10">Manual adjusting entries • Corrections • Accruals</p>

        <div className="bg-white rounded-3xl shadow p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-semibold">Journal Entries</h2>
            <button 
              onClick={() => alert('New Journal Entry form coming soon')}
              className="bg-indigo-600 text-white px-6 py-3 rounded-2xl hover:bg-indigo-700 transition"
            >
              + New Journal Entry
            </button>
          </div>

          <div className="text-center py-20 text-gray-400 text-6xl">
            📝 Double-Entry Journal Builder Coming Next
          </div>
        </div>
      </div>
    </div>
  );
}
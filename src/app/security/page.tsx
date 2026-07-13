'use client';

export default function SecurityPage() {
  return (
    <div className="p-8 max-w-screen-2xl mx-auto">
      <h1 className="text-4xl font-bold mb-8">Security &amp; Safety Alerts</h1>
      <div className="bg-white rounded-3xl p-12 text-center">
        <div className="text-6xl mb-6">🛡️</div>
        <h2 className="text-2xl font-semibold mb-4">Personal Safety Alert System</h2>
        <p className="text-gray-600 mb-8 max-w-md mx-auto">
          Emergency alert system with red SOS and green safe arrival buttons.<br />
          Full functionality coming in next update.
        </p>
        <div className="inline-flex gap-4">
          <button className="bg-red-600 text-white px-10 py-4 rounded-2xl text-xl font-medium hover:bg-red-700">
            🚨 SOS Emergency Alert
          </button>
          <button className="bg-green-600 text-white px-10 py-4 rounded-2xl text-xl font-medium hover:bg-green-700">
            ✅ Safe Arrival
          </button>
        </div>
      </div>
    </div>
  );
}
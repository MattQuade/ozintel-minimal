'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface AlertRecord {
  id: string;
  type: 'red' | 'green';
  time: string;
  message: string;
  location?: string;
}

export default function AlertHistory() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);

  useEffect(() => {
    // Load from localStorage (simple in-memory persistence)
    const saved = localStorage.getItem('safetyAlerts');
    if (saved) setAlerts(JSON.parse(saved));
  }, []);

  const clearHistory = () => {
    if (confirm('Clear all alert history?')) {
      localStorage.removeItem('safetyAlerts');
      setAlerts([]);
    }
  };

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-bold">🛡️ Alert History</h1>
        <div className="flex gap-4">
          <Link href="/security" className="text-blue-600 hover:text-blue-700">← Back to Security</Link>
          <button onClick={clearHistory} className="text-red-600 hover:text-red-700">Clear History</button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-white rounded-3xl p-20 text-center">
          <p className="text-2xl text-gray-400">No alerts recorded yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-4 text-left">Time</th>
                <th className="px-6 py-4 text-left">Type</th>
                <th className="px-6 py-4 text-left">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {alerts.map((alert, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-5">{alert.time}</td>
                  <td className="px-6 py-5">
                    <span className={`px-4 py-1 rounded-full text-sm font-medium ${
                      alert.type === 'red' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {alert.type === 'red' ? '🚨 DISTRESS' : '✅ SAFE'}
                    </span>
                  </td>
                  <td className="px-6 py-5">{alert.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SecuritySettings() {
  const [contact1, setContact1] = useState({
    name: '',
    phone: '',
  });

  const [contact2, setContact2] = useState({
    name: '',
    phone: '',
  });

  useEffect(() => {
    const saved1 = localStorage.getItem('emergencyContact1');
    const saved2 = localStorage.getItem('emergencyContact2');
    if (saved1) setContact1(JSON.parse(saved1));
    if (saved2) setContact2(JSON.parse(saved2));
  }, []);

  const saveContacts = () => {
    localStorage.setItem('emergencyContact1', JSON.stringify(contact1));
    localStorage.setItem('emergencyContact2', JSON.stringify(contact2));
    alert('✅ Emergency contacts saved successfully!');
  };

  return (
    <div className="p-10 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-bold">⚙️ Safety Alert Settings</h1>
        <Link href="/security" className="text-blue-600 hover:text-blue-700">← Back to Security</Link>
      </div>

      <div className="bg-white rounded-3xl shadow p-10 space-y-12">
        {/* Contact 1 */}
        <div>
          <h2 className="text-2xl font-semibold mb-6">Emergency Contact 1 (Required)</h2>
          <input 
            type="text" 
            placeholder="Full Name (e.g. Emily Lam)" 
            value={contact1.name}
            onChange={(e) => setContact1({...contact1, name: e.target.value})}
            className="w-full border border-gray-300 rounded-xl px-5 py-4 mb-4 text-lg"
          />
          <input 
            type="tel" 
            placeholder="Phone Number (+61455447513)" 
            value={contact1.phone}
            onChange={(e) => setContact1({...contact1, phone: e.target.value})}
            className="w-full border border-gray-300 rounded-xl px-5 py-4 text-lg"
          />
        </div>

        {/* Contact 2 */}
        <div>
          <h2 className="text-2xl font-semibold mb-6">Emergency Contact 2 (Optional)</h2>
          <input 
            type="text" 
            placeholder="Full Name (e.g. Automne Quade)" 
            value={contact2.name}
            onChange={(e) => setContact2({...contact2, name: e.target.value})}
            className="w-full border border-gray-300 rounded-xl px-5 py-4 mb-4 text-lg"
          />
          <input 
            type="tel" 
            placeholder="Phone Number (+61493456384)" 
            value={contact2.phone}
            onChange={(e) => setContact2({...contact2, phone: e.target.value})}
            className="w-full border border-gray-300 rounded-xl px-5 py-4 text-lg"
          />
        </div>

        <button 
          onClick={saveContacts}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-2xl text-xl font-semibold"
        >
          Save Emergency Contacts
        </button>
      </div>
    </div>
  );
}
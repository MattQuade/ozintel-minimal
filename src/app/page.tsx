'use client';

import { useState, useEffect } from 'react';

type Contact = {
  name: string;
  phone: string;
};

// Always point directly to the live Render backend API
const API_BASE = "https://ozintel-backend.onrender.com";

export default function HomePage() {
  const [safeContacts, setSafeContacts] = useState<Contact[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<Contact[]>([]);
  
  const [safePhone, setSafePhone] = useState<string>('');
  const [safeName, setSafeName] = useState<string>('');
  const [emergencyPhone, setEmergencyPhone] = useState<string>('');
  const [emergencyName, setEmergencyName] = useState<string>('');
  
  const [status, setStatus] = useState<string>('');
  const [smsCount, setSmsCount] = useState<number>(0);

  useEffect(() => {
    try {
      const loadedSafe = JSON.parse(localStorage.getItem('ozintel_safe_contacts') || '[]');
      const loadedEmergency = JSON.parse(localStorage.getItem('ozintel_emergency_contacts') || '[]');
      setSafeContacts(loadedSafe);
      setEmergencyContacts(loadedEmergency);
    } catch (e) {
      console.error("Error loading contacts from storage", e);
    }
  }, []);

  function saveContacts(safe: Contact[], emergency: Contact[]) {
    setSafeContacts(safe);
    setEmergencyContacts(emergency);
    try {
      localStorage.setItem('ozintel_safe_contacts', JSON.stringify(safe));
      localStorage.setItem('ozintel_emergency_contacts', JSON.stringify(emergency));
    } catch (e) {
      console.error("Error saving contacts to storage", e);
    }
  }

  function addSafeContact() {
    const phone = safePhone.trim();
    const name = safeName.trim();
    if (!phone || !name || phone === '+61412345678') {
      alert("Please enter a valid phone number and name for the safe contact.");
      return;
    }
    const updated = [...safeContacts, { name, phone }];
    saveContacts(updated, emergencyContacts);
    setSafePhone('');
    setSafeName('');
  }

  function removeSafeContact(index: number) {
    const updated = safeContacts.filter((_, i) => i !== index);
    saveContacts(updated, emergencyContacts);
  }

  function addEmergencyContact() {
    const phone = emergencyPhone.trim();
    const name = emergencyName.trim();
    if (!phone || !name || phone === '+61412345678') {
      alert("Please enter a valid phone number and name for the emergency contact.");
      return;
    }
    const updated = [...emergencyContacts, { name, phone }];
    saveContacts(safeContacts, updated);
    setEmergencyPhone('');
    setEmergencyName('');
  }

  function removeEmergencyContact(index: number) {
    const updated = emergencyContacts.filter((_, i) => i !== index);
    saveContacts(safeContacts, updated);
  }

  async function sendSMSViaMessageMedia(recipientPhone: string, messageBody: string): Promise<boolean> {
    console.log("Dispatching SMS to backend:", `${API_BASE}/api/send-sms`);
    console.log("Payload:", { phone: recipientPhone, message: messageBody });

    try {
      const response = await fetch(`${API_BASE}/api/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: recipientPhone, message: messageBody })
      });

      console.log("Response status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend error response:", errorText);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Network error connecting to SMS API:", error);
      return false;
    }
  }

  async function sendSafeArrival() {
    if (safeContacts.length === 0) {
      alert("No safe arrival contacts configured. Please add one first.");
      return;
    }

    setStatus("Sending Safe Arrival alert via MessageMedia...");
    let successCount = 0;
    const message = "OzIntel Alert: I have arrived safely.";

    for (const contact of safeContacts) {
      const sent = await sendSMSViaMessageMedia(contact.phone, message);
      if (sent) successCount++;
    }

    if (successCount > 0) {
      setStatus("✅ Safe arrival alert sent successfully!");
      alert(`Safe arrival alert successfully dispatched to ${successCount} contact(s)!`);
      setSmsCount(prev => prev + 1);
    } else {
      setStatus("Failed to send SMS.");
      alert("Failed to send SMS through the server backend. Check your MessageMedia configuration.");
    }
  }

  async function sendEmergencyAlert() {
    if (emergencyContacts.length === 0) {
      alert("No emergency contacts configured. Please add one first.");
      return;
    }

    setStatus("Dispatching Emergency alert...");

    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        executeEmergencyDispatch(`🚨 EMERGENCY! I need help. Location: https://maps.google.com/?q=${lat},${lon}`);
      }, () => {
        executeEmergencyDispatch("🚨 EMERGENCY! I need immediate assistance.");
      });
    } else {
      executeEmergencyDispatch("🚨 EMERGENCY! I need immediate assistance.");
    }
  }

  async function executeEmergencyDispatch(message: string) {
    let successCount = 0;
    for (const contact of emergencyContacts) {
      const sent = await sendSMSViaMessageMedia(contact.phone, message);
      if (sent) successCount++;
    }

    if (successCount > 0) {
      setStatus("🚨 Emergency alert dispatched!");
      alert(`🚨 Emergency alert sent to ${successCount} contact(s)!`);
      setSmsCount(prev => prev + 1);
    } else {
      setStatus("Failed to dispatch emergency SMS.");
      alert("Failed to dispatch emergency SMS through the server backend.");
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui', background: '#0f172a', color: 'white', textAlign: 'center', padding: '20px', minHeight: '100vh' }}>
      <h1 style={{ color: '#22d3ee' }}>🛡️ OzIntel</h1>
      <p>Alert System</p>

      <button onClick={sendSafeArrival} style={{ padding: '20px', fontSize: '1.3rem', margin: '15px', border: 'none', borderRadius: '12px', width: '90%', maxWidth: '400px', cursor: 'pointer', background: '#22c55e', color: 'white' }}>
        ✅ SAFE ARRIVAL
      </button>
      <br />
      <button onClick={sendEmergencyAlert} style={{ padding: '20px', fontSize: '1.3rem', margin: '15px', border: 'none', borderRadius: '12px', width: '90%', maxWidth: '400px', cursor: 'pointer', background: '#ef4444', color: 'white' }}>
        🚨 SEND HELP
      </button>

      <p style={{ margin: '20px', fontSize: '1.1rem', minHeight: '40px', color: '#22c55e' }}>{status}</p>

      <div style={{ background: '#1e2937', padding: '12px 20px', borderRadius: '10px', margin: '15px auto', maxWidth: '300px', fontSize: '1.1rem', color: '#cbd5e1' }}>
        SMS Sent this month: <strong style={{ color: '#22c55e', fontSize: '1.3rem' }}>{smsCount}</strong>
      </div>

      <div style={{ margin: '30px 0', borderTop: '1px solid #334155', paddingTop: '20px' }}>
        <h2>Safe Arrival Contacts</h2>
        {safeContacts.map((contact, index) => (
          <div key={index} style={{ background: '#334155', padding: '12px', margin: '10px auto', borderRadius: '8px', maxWidth: '400px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{contact.name} ({contact.phone})</span>
            <button onClick={() => removeSafeContact(index)} style={{ background: '#dc3545', color: 'white', padding: '6px 12px', fontSize: '0.9rem', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Remove</button>
          </div>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '15px' }}>
          <input type="tel" placeholder="+61412345678" value={safePhone} onChange={e => setSafePhone(e.target.value)} style={{ width: '90%', maxWidth: '400px', padding: '16px 14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }} />
          <input type="text" placeholder="Name" value={safeName} onChange={e => setSafeName(e.target.value)} style={{ width: '90%', maxWidth: '400px', padding: '16px 14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }} />
          <button onClick={addSafeContact} style={{ padding: '12px 20px', fontSize: '1rem', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Add Safe</button>
        </div>
      </div>

      <div style={{ margin: '30px 0', borderTop: '1px solid #334155', paddingTop: '20px' }}>
        <h2>Emergency Contacts</h2>
        {emergencyContacts.map((contact, index) => (
          <div key={index} style={{ background: '#334155', padding: '12px', margin: '10px auto', borderRadius: '8px', maxWidth: '400px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{contact.name} ({contact.phone})</span>
            <button onClick={() => removeEmergencyContact(index)} style={{ background: '#dc3545', color: 'white', padding: '6px 12px', fontSize: '0.9rem', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Remove</button>
          </div>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '15px' }}>
          <input type="tel" placeholder="+61412345678" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} style={{ width: '90%', maxWidth: '400px', padding: '16px 14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }} />
          <input type="text" placeholder="Name" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} style={{ width: '90%', maxWidth: '400px', padding: '16px 14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }} />
          <button onClick={addEmergencyContact} style={{ padding: '12px 20px', fontSize: '1rem', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Add Emergency</button>
        </div>
      </div>
    </div>
  );
}

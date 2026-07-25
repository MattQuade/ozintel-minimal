'use client';

import { useState, useEffect } from 'react';

type Contact = {
  name: string;
  phone: string;
};

type UserProfile = {
  name: string;
  email: string;
  phone: string;
  status: 'pending' | 'approved';
  smsCount: number;
  permissions: {
    accounting: boolean;
    pubOps: boolean;
    forestryOps: boolean;
  };
};

const API_BASE = "";

export default function HomePage() {
  const [safeContacts, setSafeContacts] = useState<Contact[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<Contact[]>([]);
  
  const [safePhone, setSafePhone] = useState<string>('');
  const [safeName, setSafeName] = useState<string>('');
  const [emergencyPhone, setEmergencyPhone] = useState<string>('');
  const [emergencyName, setEmergencyName] = useState<string>('');
  
  const [status, setStatus] = useState<string>('');
  const [smsCount, setSmsCount] = useState<number>(0);

  // Sign-Up & User Profile States
  const [showSignUp, setShowSignUp] = useState<boolean>(false);
  const [signUpName, setSignUpName] = useState<string>('');
  const [signUpEmail, setSignUpEmail] = useState<string>('');
  const [signUpPhone, setSignUpPhone] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Admin Panel States
  const [showAdminLogin, setShowAdminLogin] = useState<boolean>(false);
  const [adminEmailInput, setAdminEmailInput] = useState<string>('');
  const [adminPassInput, setAdminPassInput] = useState<string>('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedEditUser, setSelectedEditUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    try {
      const storedSafe = localStorage.getItem('ozintel_safe_contacts');
      const storedEmergency = localStorage.getItem('ozintel_emergency_contacts');
      const storedUser = localStorage.getItem('ozintel_current_user');
      const storedAllUsers = localStorage.getItem('ozintel_all_users');
      const adminAuth = localStorage.getItem('ozintel_admin_auth');

      if (storedSafe) setSafeContacts(JSON.parse(storedSafe));
      if (storedEmergency) setEmergencyContacts(JSON.parse(storedEmergency));
      if (storedUser) setCurrentUser(JSON.parse(storedUser));
      if (storedAllUsers) setAllUsers(JSON.parse(storedAllUsers));
      if (adminAuth === 'true') setIsAdminAuthenticated(true);
    } catch (e) {
      console.error("Storage load error:", e);
    }
  }, []);

  // Real-time synchronization interval so users auto-update when approved without refreshing
  useEffect(() => {
    const syncInterval = setInterval(() => {
      try {
        const storedAllUsers = localStorage.getItem('ozintel_all_users');
        const storedUser = localStorage.getItem('ozintel_current_user');
        
        if (storedAllUsers && storedUser) {
          const parsedAll: UserProfile[] = JSON.parse(storedAllUsers);
          const activeUser: UserProfile = JSON.parse(storedUser);
          
          const matched = parsedAll.find(u => u.email === activeUser.email);
          if (matched && matched.status !== activeUser.status) {
            setCurrentUser(matched);
            localStorage.setItem('ozintel_current_user', JSON.stringify(matched));
            setStatus("✅ Your account has been approved by admin!");
          }
        }
      } catch (err) {
        console.error("Sync error:", err);
      }
    }, 3000);

    return () => clearInterval(syncInterval);
  }, []);

  const saveContacts = (updatedSafe: Contact[], updatedEmergency: Contact[]) => {
    setSafeContacts(updatedSafe);
    setEmergencyContacts(updatedEmergency);
    try {
      localStorage.setItem('ozintel_safe_contacts', JSON.stringify(updatedSafe));
      localStorage.setItem('ozintel_emergency_contacts', JSON.stringify(updatedEmergency));
    } catch (e) {
      console.error("Storage save error:", e);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpName.trim() || !signUpEmail.trim() || !signUpPhone.trim()) {
      alert("Please fill in all sign-up fields.");
      return;
    }

    const newUser: UserProfile = {
      name: signUpName.trim(),
      email: signUpEmail.trim(),
      phone: signUpPhone.trim(),
      status: 'pending',
      smsCount: 0,
      permissions: { accounting: false, pubOps: false, forestryOps: false }
    };

    // Merge with existing users
    const existingUsers = allUsers.some(u => u.email.toLowerCase() === newUser.email.toLowerCase())
      ? allUsers.map(u => u.email.toLowerCase() === newUser.email.toLowerCase() ? newUser : u)
      : [...allUsers, newUser];

    setAllUsers(existingUsers);
    setCurrentUser(newUser);

    try {
      localStorage.setItem('ozintel_current_user', JSON.stringify(newUser));
      localStorage.setItem('ozintel_all_users', JSON.stringify(existingUsers));
    } catch (err) {
      console.error("Error saving user profile:", err);
    }

    // Send SMS notification to Admin
    try {
      await fetch(`${API_BASE}/api/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: '+61416619600',
          message: `OzIntel: New signup request from ${newUser.name} (${newUser.email} / ${newUser.phone}). Please approve in Admin Panel.`
        })
      });
    } catch (err) {
      console.error("Failed to send admin SMS:", err);
    }

    setShowSignUp(false);
    setSignUpName('');
    setSignUpEmail('');
    setSignUpPhone('');
    setStatus("✅ Registration submitted! Pending admin approval.");
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminEmailInput.trim().toLowerCase() === 'mattquade2000@gmail.com' && adminPassInput === 'Woodlands2050!') {
      setIsAdminAuthenticated(true);
      localStorage.setItem('ozintel_admin_auth', 'true');
      setShowAdminLogin(false);
      setStatus("🔓 Admin panel unlocked successfully.");
    } else {
      alert("Invalid admin credentials.");
    }
  };

  const approveUser = (email: string) => {
    const updated = allUsers.map(u => u.email === email ? { ...u, status: 'approved' as const } : u);
    setAllUsers(updated);
    localStorage.setItem('ozintel_all_users', JSON.stringify(updated));
    if (currentUser && currentUser.email === email) {
      const updatedCurrent = { ...currentUser, status: 'approved' as const };
      setCurrentUser(updatedCurrent);
      localStorage.setItem('ozintel_current_user', JSON.stringify(updatedCurrent));
    }
  };

  const deleteUser = (email: string) => {
    const updated = allUsers.filter(u => u.email !== email);
    setAllUsers(updated);
    localStorage.setItem('ozintel_all_users', JSON.stringify(updated));
    if (currentUser && currentUser.email === email) {
      setCurrentUser(null);
      localStorage.removeItem('ozintel_current_user');
    }
  };

  const updatePermissions = (email: string, key: 'accounting' | 'pubOps' | 'forestryOps', val: boolean) => {
    const updated = allUsers.map(u => {
      if (u.email === email) {
        return { ...u, permissions: { ...u.permissions, [key]: val } };
      }
      return u;
    });
    setAllUsers(updated);
    localStorage.setItem('ozintel_all_users', JSON.stringify(updated));
    if (currentUser && currentUser.email === email) {
      const updatedCurrent = { ...currentUser, permissions: { ...currentUser.permissions, [key]: val } };
      setCurrentUser(updatedCurrent);
      localStorage.setItem('ozintel_current_user', JSON.stringify(updatedCurrent));
    }
  };

  const addSafeContact = () => {
    if (!safePhone.trim() || !safeName.trim()) return;
    const updated = [...safeContacts, { name: safeName.trim(), phone: safePhone.trim() }];
    saveContacts(updated, emergencyContacts);
    setSafePhone('');
    setSafeName('');
  };

  const removeSafeContact = (index: number) => {
    const updated = safeContacts.filter((_, i) => i !== index);
    saveContacts(updated, emergencyContacts);
  };

  const addEmergencyContact = () => {
    if (!emergencyPhone.trim() || !emergencyName.trim()) return;
    const updated = [...emergencyContacts, { name: emergencyName.trim(), phone: emergencyPhone.trim() }];
    saveContacts(safeContacts, updated);
    setEmergencyPhone('');
    setEmergencyName('');
  };

  const removeEmergencyContact = (index: number) => {
    const updated = emergencyContacts.filter((_, i) => i !== index);
    saveContacts(safeContacts, updated);
  };

  const sendSMSViaMessageMedia = async (recipientPhone: string, messageBody: string, alertType: string): Promise<boolean> => {
    try {
      let locationData = null;
      try {
        locationData = await new Promise((resolve) => {
          if (typeof window !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 8000 }
            );
          } else {
            resolve(null);
          }
        });
      } catch (geoErr) {
        console.warn("Geolocation fetch failed:", geoErr);
      }

      const res = await fetch(`${API_BASE}/api/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: recipientPhone,
          message: messageBody,
          userName: currentUser ? currentUser.name : 'Unknown User',
          alertType: alertType,
          location: locationData
        })
      });
      
      return res.ok;
    } catch (err) {
      console.error("-> Fetch exception caught:", err);
      return false;
    }
  };

  const sendSafeArrival = async () => {
    if (safeContacts.length === 0) {
      alert("No safe arrival contacts configured.");
      return;
    }

    setStatus("Sending Safe Arrival alert...");
    let sentCount = 0;

    for (const contact of safeContacts) {
      const success = await sendSMSViaMessageMedia(contact.phone, "I have arrived safely.", "SAFE ARRIVAL");
      if (success) sentCount++;
    }

    if (sentCount > 0) {
      setStatus("✅ Safe arrival alert sent successfully!");
      const newCount = smsCount + 1;
      setSmsCount(newCount);
      localStorage.setItem('ozintel_sms_count', newCount.toString());

      if (currentUser) {
        const updatedUser = { ...currentUser, smsCount: currentUser.smsCount + 1 };
        setCurrentUser(updatedUser);
        localStorage.setItem('ozintel_current_user', JSON.stringify(updatedUser));
        const updatedAll = allUsers.map(u => u.email === updatedUser.email ? updatedUser : u);
        setAllUsers(updatedAll);
        localStorage.setItem('ozintel_all_users', JSON.stringify(updatedAll));
      }
    } else {
      setStatus("Failed to send SMS.");
      alert("Failed to send SMS through server backend.");
    }
  };

  const sendEmergencyAlert = async () => {
    if (emergencyContacts.length === 0) {
      alert("No emergency contacts configured.");
      return;
    }

    setStatus("Dispatching Emergency alert...");
    let sentCount = 0;

    for (const contact of emergencyContacts) {
      const success = await sendSMSViaMessageMedia(contact.phone, "I need immediate assistance!", "EMERGENCY");
      if (success) sentCount++;
    }

    if (sentCount > 0) {
      setStatus("🚨 Emergency alert dispatched!");
      const newCount = smsCount + 1;
      setSmsCount(newCount);
      localStorage.setItem('ozintel_sms_count', newCount.toString());

      if (currentUser) {
        const updatedUser = { ...currentUser, smsCount: currentUser.smsCount + 1 };
        setCurrentUser(updatedUser);
        localStorage.setItem('ozintel_current_user', JSON.stringify(updatedUser));
        const updatedAll = allUsers.map(u => u.email === updatedUser.email ? updatedUser : u);
        setAllUsers(updatedAll);
        localStorage.setItem('ozintel_all_users', JSON.stringify(updatedAll));
      }
    } else {
      setStatus("Failed to dispatch emergency SMS.");
      alert("Failed to dispatch emergency SMS.");
    }
  };

  const pendingUsers = allUsers.filter(u => u.status === 'pending');
  const approvedUsersList = allUsers.filter(u => u.status === 'approved');

  return (
    <div style={{ fontFamily: 'system-ui', background: '#0f172a', color: 'white', textAlign: 'center', padding: '20px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px' }}>
        <button onClick={() => setShowAdminLogin(!showAdminLogin)} style={{ background: '#334155', color: '#cbd5e1', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
          {isAdminAuthenticated ? '🔒 Admin Active' : 'Admin Login'}
        </button>
      </div>

      <h1 style={{ color: '#22d3ee', margin: '5px 0' }}>🛡️ OzIntel</h1>
      <p style={{ color: '#94a3b8', marginTop: 0 }}>Alert System</p>

      {/* Admin Login Modal / Section */}
      {showAdminLogin && !isAdminAuthenticated && (
        <form onSubmit={handleAdminLogin} style={{ background: '#1e2937', padding: '20px', borderRadius: '12px', margin: '15px auto', maxWidth: '400px', border: '1px solid #334155' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#f59e0b' }}>Admin Authentication</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input 
              type="email" 
              placeholder="Admin Email" 
              value={adminEmailInput} 
              onChange={e => setAdminEmailInput(e.target.value)} 
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: 'white' }} 
            />
            <input 
              type="password" 
              placeholder="Admin Password" 
              value={adminPassInput} 
              onChange={e => setAdminPassInput(e.target.value)} 
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: 'white' }} 
            />
            <button type="submit" style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              Login as Admin
            </button>
          </div>
        </form>
      )}

      {/* Admin Dashboard Panel */}
      {isAdminAuthenticated && (
        <div style={{ background: '#1e2937', border: '2px solid #f59e0b', padding: '20px', borderRadius: '12px', margin: '20px auto', maxWidth: '600px', textAlign: 'left' }}>
          <h2 style={{ color: '#f59e0b', marginTop: 0 }}>🛡️ Admin Control Panel</h2>
          
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ borderBottom: '1px solid #334155', paddingBottom: '6px' }}>Pending Approval ({pendingUsers.length})</h3>
            {pendingUsers.length === 0 ? <p style={{ color: '#94a3b8' }}>No pending user sign-ups.</p> : pendingUsers.map((u, i) => (
              <div key={i} style={{ background: '#334155', padding: '10px', borderRadius: '6px', margin: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{u.name}</strong> ({u.email})<br />
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{u.phone} | SMS Sent: {u.smsCount}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => approveUser(u.email)} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Approve</button>
                  <button onClick={() => deleteUser(u.email)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>

          <div>
            <h3 style={{ borderBottom: '1px solid #334155', paddingBottom: '6px' }}>Approved Users ({approvedUsersList.length})</h3>
            {approvedUsersList.length === 0 ? <p style={{ color: '#94a3b8' }}>No approved users yet.</p> : approvedUsersList.map((u, i) => (
              <div key={i} style={{ background: '#334155', padding: '10px', borderRadius: '6px', margin: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{u.name}</strong> ({u.email})<br />
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{u.phone} | <strong>SMS Sent this month: {u.smsCount}</strong></span>
                  </div>
                  <button onClick={() => setSelectedEditUser(selectedEditUser?.email === u.email ? null : u)} style={{ background: '#0ea5e9', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                    {selectedEditUser?.email === u.email ? 'Close Edit' : 'Edit'}
                  </button>
                </div>

                {/* Edit Permissions Drawer */}
                {selectedEditUser?.email === u.email && (
                  <div style={{ marginTop: '10px', padding: '10px', background: '#0f172a', borderRadius: '6px', border: '1px solid #475569' }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#38bdf8' }}>Component Permissions:</p>
                    <label style={{ display: 'block', margin: '4px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={u.permissions.accounting} onChange={e => updatePermissions(u.email, 'accounting', e.target.checked)} /> Accounting
                    </label>
                    <label style={{ display: 'block', margin: '4px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={u.permissions.pubOps} onChange={e => updatePermissions(u.email, 'pubOps', e.target.checked)} /> Pub Ops
                    </label>
                    <label style={{ display: 'block', margin: '4px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={u.permissions.forestryOps} onChange={e => updatePermissions(u.email, 'forestryOps', e.target.checked)} /> Forestry Ops
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Alert Action Buttons */}
      <button onClick={sendSafeArrival} style={{ padding: '20px', fontSize: '1.3rem', margin: '15px', border: 'none', borderRadius: '12px', width: '90%', maxWidth: '400px', cursor: 'pointer', background: '#22c55e', color: 'white', fontWeight: 'bold' }}>
        ✅ SAFE ARRIVAL
      </button>
      <br />
      <button onClick={sendEmergencyAlert} style={{ padding: '20px', fontSize: '1.3rem', margin: '15px', border: 'none', borderRadius: '12px', width: '90%', maxWidth: '400px', cursor: 'pointer', background: '#ef4444', color: 'white', fontWeight: 'bold' }}>
        🚨 SEND HELP
      </button>
      <br />
      
      {/* Sign-Up Button underneath SEND HELP */}
      <button onClick={() => setShowSignUp(!showSignUp)} style={{ padding: '16px', fontSize: '1.1rem', margin: '10px 15px 25px 15px', border: '2px solid #0ea5e9', borderRadius: '12px', width: '90%', maxWidth: '400px', cursor: 'pointer', background: 'transparent', color: '#0ea5e9', fontWeight: 'bold' }}>
        {showSignUp ? 'Close Sign Up' : 'Sign Up'}
      </button>

      {/* Sign-Up Form Modal / Section */}
      {showSignUp && (
        <form onSubmit={handleSignUpSubmit} style={{ background: '#1e2937', padding: '20px', borderRadius: '12px', margin: '0 auto 25px auto', maxWidth: '400px', border: '1px solid #334155' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#38bdf8' }}>New User Registration</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Full Name" 
              value={signUpName} 
              onChange={e => setSignUpName(e.target.value)} 
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #475569', background: '#0f172a', color: 'white' }} 
            />
            <input 
              type="email" 
              placeholder="Email Address" 
              value={signUpEmail} 
              onChange={e => setSignUpEmail(e.target.value)} 
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #475569', background: '#0f172a', color: 'white' }} 
            />
            <input 
              type="tel" 
              placeholder="+61412345678" 
              value={signUpPhone} 
              onChange={e => setSignUpPhone(e.target.value)} 
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #475569', background: '#0f172a', color: 'white' }} 
            />
            <button type="submit" style={{ padding: '12px 20px', width: '100%', fontSize: '1rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              Submit Registration
            </button>
          </div>
        </form>
      )}

      {/* Approval Status Notification on Home Screen */}
      {currentUser && (
        <div style={{ background: currentUser.status === 'approved' ? '#14532d' : '#78350f', border: `1px solid ${currentUser.status === 'approved' ? '#22c55e' : '#f59e0b'}`, padding: '12px 20px', borderRadius: '10px', margin: '15px auto', maxWidth: '400px' }}>
          <p style={{ margin: 0, fontSize: '1rem' }}>
            Account: <strong>{currentUser.name}</strong> ({currentUser.email})<br />
            Status: <strong style={{ color: currentUser.status === 'approved' ? '#4ade80' : '#fbbf24' }}>
              {currentUser.status === 'approved' ? '✅ Approved' : '⏳ Pending Admin Approval'}
            </strong>
          </p>
        </div>
      )}

      <p style={{ margin: '15px', fontSize: '1.1rem', minHeight: '30px', color: '#22c55e' }}>{status}</p>

      {/* SMS Counter */}
      <div style={{ background: '#1e2937', padding: '12px 20px', borderRadius: '10px', margin: '15px auto', maxWidth: '300px', fontSize: '1.1rem', color: '#cbd5e1' }}>
        SMS Sent this month: <strong style={{ color: '#22c55e', fontSize: '1.3rem' }}>{currentUser ? currentUser.smsCount : smsCount}</strong>
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
          <input type="tel" placeholder="+61412345678" value={safePhone} onChange={e => setSafePhone(e.target.value)} style={{ width: '90%', maxWidth: '400px', padding: '14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }} />
          <input type="text" placeholder="Name" value={safeName} onChange={e => setSafeName(e.target.value)} style={{ width: '90%', maxWidth: '400px', padding: '14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }} />
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
          <input type="tel" placeholder="+61412345678" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} style={{ width: '90%', maxWidth: '400px', padding: '14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }} />
          <input type="text" placeholder="Name" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} style={{ width: '90%', maxWidth: '400px', padding: '14px', borderRadius: '8px', border: '1px solid #475569', background: '#1e2937', color: 'white' }} />
          <button onClick={addEmergencyContact} style={{ padding: '12px 20px', fontSize: '1rem', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Add Emergency</button>
        </div>
      </div>

      {/* Operational Buttons below Emergency Contacts (Same size as Safe Arrival & Send Help) */}
      <div style={{ margin: '40px 0 20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
        <button 
          onClick={() => alert("Accounting Panel: Pending Approval")} 
          style={{ padding: '20px', fontSize: '1.3rem', border: 'none', borderRadius: '12px', width: '90%', maxWidth: '400px', cursor: 'pointer', background: '#f97316', color: 'white', fontWeight: 'bold' }}
        >
          Accounting - Pending Approval
        </button>
        <button 
          onClick={() => alert("OPS Panel: Pending Approval")} 
          style={{ padding: '20px', fontSize: '1.3rem', border: 'none', borderRadius: '12px', width: '90%', maxWidth: '400px', cursor: 'pointer', background: '#3b82f6', color: 'white', fontWeight: 'bold' }}
        >
          OPS - Pending Approval
        </button>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';

interface User {
  name: string;
  email: string;
  phone: string;
  role: string;
  permissions: {
    accounting: boolean;
    pubOps: boolean;
    forestryOps: boolean;
  };
}

interface SafeContact {
  name: string;
  phone: string;
}

export default function HomePage() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'accounting' | 'pubOps' | 'forestryOps'>('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('+614');
  const [regRole, setRegRole] = useState('Staff');
  const [regPassword, setRegPassword] = useState('');

  const [safeContacts, setSafeContacts] = useState<SafeContact[]>([]);
  const [safeName, setSafeName] = useState('');
  const [safePhone, setSafePhone] = useState('+614');

  useEffect(() => {
    const savedUsers = localStorage.getItem('ozintel_all_users');
    if (savedUsers) {
      try {
        setAllUsers(JSON.parse(savedUsers));
      } catch (e) {
        console.error(e);
      }
    }

    const savedCurrent = localStorage.getItem('ozintel_current_user');
    if (savedCurrent) {
      try {
        setCurrentUser(JSON.parse(savedCurrent));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // ======================
  // Registration with Pending + Admin SMS
  // ======================
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail.trim() || !regName.trim()) return;

    const newUser: User = {
      name: regName.trim(),
      email: regEmail.trim(),
      phone: regPhone.trim(),
      role: 'Pending',
      permissions: {
        accounting: false,
        pubOps: false,
        forestryOps: false,
      }
    };

    const updatedUsers = [...allUsers.filter(u => u.email !== newUser.email), newUser];
    setAllUsers(updatedUsers);
    localStorage.setItem('ozintel_all_users', JSON.stringify(updatedUsers));

    // Send SMS to Admin
    try {
      await fetch('https://ozintel-backend.onrender.com/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: '+61416619600', // ← Change this to your real admin number if needed
          message: `OzIntel: New signup request from ${newUser.name} (${newUser.email} / ${newUser.phone}). Please approve in Admin Panel.`
        })
      });
    } catch (err) {
      console.error('Failed to send admin SMS:', err);
    }

    // Reset form
    setRegName('');
    setRegEmail('');
    setRegPhone('+614');
    setRegPassword('');
    setShowRegisterModal(false);

    alert('Sign-up request submitted successfully. Waiting for admin approval.');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('ozintel_current_user');
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

  const approveUser = (email: string) => {
    const updated = allUsers.map(u => {
      if (u.email === email) {
        return { ...u, role: 'Staff' };
      }
      return u;
    });
    setAllUsers(updated);
    localStorage.setItem('ozintel_all_users', JSON.stringify(updated));
  };

  const addSafeContact = () => {
    if (!safePhone.trim() || !safeName.trim()) return;
    const updated = [...safeContacts, { name: safeName.trim(), phone: safePhone.trim() }];
    setSafeContacts(updated);
    setSafeName('');
    setSafePhone('+614');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '10px 0 20px 0' }}>
          <div style={{ fontSize: '3rem', lineHeight: '1', marginBottom: '8px' }}>🛡️</div>
          <h1 style={{ color: '#22d3ee', fontSize: '2rem', fontWeight: 'bold', margin: '0 0 4px 0' }}>OzIntel</h1>
          <p style={{ color: '#94a3b8', fontSize: '1rem', margin: '0' }}>Alert System</p>
        </div>

        {/* User Session Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '12px 20px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #334155' }}>
          <div>
            {currentUser ? (
              <span>
                Signed in as: <strong style={{ color: '#38bdf8' }}>{currentUser.name}</strong> ({currentUser.role})
              </span>
            ) : (
              <span style={{ color: '#94a3b8' }}>No active user session. Please sign up or log in.</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {currentUser ? (
              <button 
                onClick={handleLogout}
                style={{ padding: '6px 14px', background: '#dc2626', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
              >
                Log Out
              </button>
            ) : (
              <button 
                onClick={() => setShowRegisterModal(true)}
                style={{ padding: '6px 14px', background: '#2563eb', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
              >
                Sign Up / Register
              </button>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '32px', flexWrap: 'wrap' }}>
          <button onClick={() => setCurrentView('dashboard')} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: currentView === 'dashboard' ? '#2563eb' : '#334155', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Dashboard</button>
          <button onClick={() => setCurrentView('accounting')} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: currentView === 'accounting' ? '#d97706' : '#334155', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Accounting Ops</button>
          <button onClick={() => setCurrentView('pubOps')} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: currentView === 'pubOps' ? '#2563eb' : '#334155', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Pub Ops</button>
          <button onClick={() => setCurrentView('forestryOps')} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: currentView === 'forestryOps' ? '#059669' : '#334155', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Forestry Ops</button>
        </div>

        {/* Main Content */}
        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px' }}>
          {currentView === 'dashboard' && (
            <div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>System Dashboard</h2>
              <p style={{ color: '#94a3b8', marginBottom: '24px' }}>Welcome to the OzIntel modular framework.</p>
              
              {/* Emergency Contacts */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '12px', color: '#38bdf8' }}>Emergency Contacts</h3>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <input type="text" placeholder="Contact Name" value={safeName} onChange={(e) => setSafeName(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff' }} />
                  <input type="text" placeholder="Phone (+614...)" value={safePhone} onChange={(e) => setSafePhone(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff' }} />
                  <button onClick={addSafeContact} style={{ padding: '8px 16px', background: '#2563eb', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Add Contact</button>
                </div>
                
                {safeContacts.length === 0 ? (
                  <p style={{ color: '#64748b', fontStyle: 'italic' }}>No safe contacts added yet.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {safeContacts.map((c, i) => (
                      <li key={i} style={{ padding: '8px 12px', background: '#0f172a', marginBottom: '6px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', border: '1px solid #334155' }}>
                        <span>{c.name}</span>
                        <span style={{ color: '#38bdf8' }}>{c.phone}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* User Directory */}
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '12px', color: '#38bdf8' }}>User Directory & Permissions</h3>
                {allUsers.length === 0 ? (
                  <p style={{ color: '#64748b', fontStyle: 'italic' }}>No registered users found.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #475569', color: '#94a3b8' }}>
                          <th style={{ padding: '10px' }}>Name</th>
                          <th style={{ padding: '10px' }}>Email</th>
                          <th style={{ padding: '10px' }}>Phone</th>
                          <th style={{ padding: '10px' }}>Role</th>
                          <th style={{ padding: '10px' }}>Accounting</th>
                          <th style={{ padding: '10px' }}>Pub Ops</th>
                          <th style={{ padding: '10px' }}>Forestry</th>
                          <th style={{ padding: '10px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers.map((u) => (
                          <tr key={u.email} style={{ borderBottom: '1px solid #334155' }}>
                            <td style={{ padding: '10px', fontWeight: '500' }}>{u.name}</td>
                            <td style={{ padding: '10px', color: '#94a3b8' }}>{u.email}</td>
                            <td style={{ padding: '10px', color: '#94a3b8' }}>{u.phone || 'N/A'}</td>
                            <td style={{ padding: '10px' }}>
                              <span style={{ color: u.role === 'Pending' ? '#fbbf24' : '#fff' }}>{u.role}</span>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <input type="checkbox" checked={u.permissions.accounting} onChange={(e) => updatePermissions(u.email, 'accounting', e.target.checked)} />
                            </td>
                            <td style={{ padding: '10px' }}>
                              <input type="checkbox" checked={u.permissions.pubOps} onChange={(e) => updatePermissions(u.email, 'pubOps', e.target.checked)} />
                            </td>
                            <td style={{ padding: '10px' }}>
                              <input type="checkbox" checked={u.permissions.forestryOps} onChange={(e) => updatePermissions(u.email, 'forestryOps', e.target.checked)} />
                            </td>
                            <td style={{ padding: '10px', display: 'flex', gap: '6px' }}>
                              {u.role === 'Pending' && (
                                <button onClick={() => approveUser(u.email)} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                  Approve
                                </button>
                              )}
                              <button onClick={() => deleteUser(u.email)} style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentView === 'accounting' && (
            <div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: '#d97706' }}>Accounting Operations</h2>
              <p style={{ color: '#94a3b8' }}>Manage ledgers, accounts, and financial reports securely.</p>
            </div>
          )}

          {currentView === 'pubOps' && (
            <div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: '#38bdf8' }}>Pub Operations</h2>
              <p style={{ color: '#94a3b8' }}>Monitor venue activity, inventory, and staff rosters.</p>
            </div>
          )}

          {currentView === 'forestryOps' && (
            <div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: '#34d399' }}>Forestry Operations</h2>
              <p style={{ color: '#94a3b8' }}>Track field logs, safety check-ins, and remote alerts.</p>
            </div>
          )}
        </div>

        {/* Registration Modal */}
        {showRegisterModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#1e293b', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '450px', border: '1px solid #475569' }}>
              <h3 style={{ fontSize: '1.3rem', marginBottom: '20px', color: '#22d3ee' }}>User Sign Up Form</h3>
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', color: '#94a3b8' }}>Full Name</label>
                  <input type="text" placeholder="John Doe" value={regName} onChange={(e) => setRegName(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', color: '#94a3b8' }}>Email Address</label>
                  <input type="email" placeholder="john@example.com" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', color: '#94a3b8' }}>Phone Number</label>
                  <input type="text" placeholder="+614..." value={regPhone} onChange={(e) => setRegPhone(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', color: '#94a3b8' }}>Role</label>
                  <select value={regRole} onChange={(e) => setRegRole(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', boxSizing: 'border-box' }}>
                    <option value="Staff">Staff</option>
                    <option value="Manager">Manager</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', color: '#94a3b8' }}>Password</label>
                  <input type="password" placeholder="••••••••" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" onClick={() => setShowRegisterModal(false)} style={{ padding: '8px 16px', background: '#334155', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ padding: '8px 16px', background: '#2563eb', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Complete Sign Up</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

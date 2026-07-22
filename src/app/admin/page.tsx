'use client';

import { useState, useEffect } from 'react';

type User = {
  email: string;
  name: string;
  phone: string;
  status: string;
  permissions: string[];
  smsThisMonth: number;
};

export default function AdminPage() {
  const ADMIN_PASSWORD = "Woodlands2050!";
  const [authorized, setAuthorized] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    const inputPass = prompt("Enter Admin Password:") || "";
    if (inputPass === ADMIN_PASSWORD) {
      setAuthorized(true);
      loadUsers();
    }
  }, []);

  function loadUsers() {
    const stored = JSON.parse(localStorage.getItem('ozintel_users') || '[]');
    setUsers(stored);
  }

  function saveUsers(updatedUsers: User[]) {
    setUsers(updatedUsers);
    localStorage.setItem('ozintel_users', JSON.stringify(updatedUsers));
  }

  function editUser(i: number) {
    const perms = prompt("Enter permissions (comma separated, e.g. accounting,pub,forestry):", users[i].permissions.join(','));
    if (perms !== null) {
      const updated = [...users];
      updated[i].permissions = perms.split(',').map(p => p.trim()).filter(p => p);
      saveUsers(updated);
    }
  }

  function approveUser(i: number) {
    const updated = [...users];
    updated[i].status = "approved";
    if (updated[i].permissions.length === 0) {
      updated[i].permissions = ["accounting", "pub", "forestry"];
    }
    saveUsers(updated);
  }

  function blockUser(i: number) {
    const updated = [...users];
    updated[i].status = "blocked";
    saveUsers(updated);
  }

  function deleteUser(i: number) {
    if (confirm(`Delete ${users[i].name}?`)) {
      const updated = users.filter((_, index) => index !==قات index);
      saveUsers(updated);
    }
  }

  function addNewUser() {
    if (!newEmail.trim()) return alert("Email is required");
    if (users.find(u => u.email === newEmail.trim())) return alert("User already exists");

    const updated = [
      ...users,
      {
        email: newEmail.trim(),
        name: newName.trim() || "New User",
        phone: newPhone.trim() || "Unknown",
        status: "pending",
        permissions: [],
        smsThisMonth: 0
      }
    ];

    saveUsers(updated);
    setNewEmail('');
    setNewName('');
    setNewPhone('');
  }

  if (!authorized) {
    return (
      <div style={{ textAlign: 'center', color: 'red', fontSize: '1.4rem', marginTop: '120px', fontFamily: 'Arial, sans-serif' }}>
        <h2>Access Denied</h2>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px', background: '#f4f6f9', minHeight: '100vh' }}>
      <h1 style={{ textAlign: 'center', color: '#1a3c5e' }}>Admin Panel - User Management (Matt Quade)</h1>
      <p style={{ textAlign: 'center', color: '#555' }}>SMS usage resets on the 1st of each month</p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', background: 'white', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr>
            <th style={{ padding: '12px', textAlign: 'left', background: '#1a3c5e', color: 'white' }}>Email</th>
            <th style={{ padding: '12px', textAlign: 'left', background: '#1a3c5e', color: 'white' }}>Name</th>
            <th style={{ padding: '12px', textAlign: 'left', background: '#1a3c5e', color: 'white' }}>Phone</th>
            <th style={{ padding: '12px', textAlign: 'left', background: '#1a3c5e', color: 'white' }}>Status</th>
            <th style={{ padding: '12px', textAlign: 'left', background: '#1a3c5e', color: 'white' }}>Permissions</th>
            <th style={{ padding: '12px', textAlign: 'left', background: '#1a3c5e', color: 'white' }}>SMS This Month</th>
            <th style={{ padding: '12px', textAlign: 'left', background: '#1a3c5e', color: 'white' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, i) => (
            <tr key={user.email} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '12px' }}>{user.email}</td>
              <td style={{ padding: '12px' }}>{user.name}</td>
              <td style={{ padding: '12px' }}>{user.phone}</td>
              <td style={{ padding: '12px' }}><strong>{user.status}</strong></td>
              <td style={{ padding: '12px' }}>{user.permissions.join(', ') || 'None'}</td>
              <td style={{ padding: '12px', fontWeight: 'bold', color: '#d32f2f' }}>{user.smsThisMonth || 0}</td>
              <td style={{ padding: '12px' }}>
                <button onClick={() => editUser(i)} style={{ background: '#007bff', color: 'white', padding: '8px 12px', margin: '3px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Edit</button>
                <button onClick={() => approveUser(i)} style={{ background: '#28a745', color: 'white', padding: '8px 12px', margin: '3px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Approve</button>
                <button onClick={() => blockUser(i)} style={{ background: '#dc3545', color: 'white', padding: '8px 12px', margin: '3px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Block</button>
                <button onClick={() => deleteUser(i)} style={{ background: '#6c757d', color: 'white', padding: '8px 12px', margin: '3px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: '30px', padding: '15px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        <h3>Add New User Manually</h3>
        <input 
          type="text" 
          placeholder="Email" 
          value={newEmail} 
          onChange={e => setNewEmail(e.target.value)} 
          style={{ width: '220px', padding: '8px', marginRight: '8px' }} 
        />
        <input 
          type="text" 
          placeholder="Name" 
          value={newName} 
          onChange={e => setNewName(e.target.value)} 
          style={{ width: '180px', padding: '8px', marginRight: '8px' }} 
        />
        <input 
          type="text" 
          placeholder="Phone" 
          value={newPhone} 
          onChange={e => setNewPhone(e.target.value)} 
          style={{ width: '150px', padding: '8px', marginRight: '8px' }} 
        />
        <button onClick={addNewUser} style={{ background: '#007bff', color: 'white', padding: '8px 12px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Add User</button>
      </div>
    </div>
  );
}

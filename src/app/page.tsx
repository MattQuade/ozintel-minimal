'use client';

import React, { useState } from 'react';

export default function HomePage() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'accounting' | 'pubOps' | 'forestryOps'>('dashboard');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header Section */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ color: '#22d3ee', fontSize: '2.5rem', fontWeight: 'bold', margin: '5px 0' }}>🛡️ OzIntel</h1>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem', margin: '0' }}>Alert System</p>
        </div>

        {/* Navigation Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '32px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setCurrentView('dashboard')}
            style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: currentView === 'dashboard' ? '#2563eb' : '#334155', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setCurrentView('accounting')}
            style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: currentView === 'accounting' ? '#d97706' : '#334155', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
          >
            Accounting Ops
          </button>
          <button 
            onClick={() => setCurrentView('pubOps')}
            style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: currentView === 'pubOps' ? '#2563eb' : '#334155', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
          >
            Pub Ops
          </button>
          <button 
            onClick={() => setCurrentView('forestryOps')}
            style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: currentView === 'forestryOps' ? '#059669' : '#334155', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
          >
            Forestry Ops
          </button>
        </div>

        {/* Main Content Area */}
        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
          {currentView === 'dashboard' && (
            <div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: '#f1f5f9' }}>System Dashboard</h2>
              <p style={{ color: '#94a3b8', marginBottom: '24px' }}>Welcome to the OzIntel modular framework. Select an operation mode above.</p>
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

      </div>
    </div>
  );
}

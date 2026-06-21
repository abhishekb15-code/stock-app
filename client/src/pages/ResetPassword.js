import React, { useState } from 'react';
import axios from 'axios';
import { Activity, KeyRound } from 'lucide-react';

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError] = useState('');
  const [done, setDone]   = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8)     return setError('Password must be at least 8 characters');
    if (password !== confirm)    return setError('Passwords do not match');
    setLoading(true);
    try {
      await axios.post('/api/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => { window.location.href = '/'; }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reset password.');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-900, #0a0e14)', padding: 20 }}>
      <div className="card" style={{ width: 380, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
          <Activity size={24} color="var(--blue)" strokeWidth={2.5} />
          <span style={{ fontWeight: 800, fontSize: 19 }}>Stock Intel</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 22, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <KeyRound size={14} /> Choose a new password
        </div>

        {!token && <div style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center' }}>Missing reset token. Please use the link from your email.</div>}
        {done ? (
          <div style={{ background: '#052e16', border: '1px solid #166534', color: '#4ade80', borderRadius: 8, padding: '12px 16px', fontSize: 13, textAlign: 'center' }}>
            ✓ Password updated! Signing you in…
          </div>
        ) : token && (
          <form onSubmit={submit}>
            {error && <div style={{ background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#f87171', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 14 }}>{error}</div>}
            <input className="input" type="password" placeholder="New password (min 8 characters)" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
            <input className="input" type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 16 }} />
            <button className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <a href="/" style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>← Back to sign in</a>
        </div>
      </div>
    </div>
  );
}

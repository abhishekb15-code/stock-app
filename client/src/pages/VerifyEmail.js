import React, { useState } from 'react';
import axios from 'axios';
import { MailCheck, RefreshCw, LogOut } from 'lucide-react';

export default function VerifyEmail({ email }) {
  const justVerified = new URLSearchParams(window.location.search).get('verified') === '1';
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  const resend = async () => {
    setSending(true); setMsg('');
    try { await axios.post('/api/auth/resend-verification'); setMsg('Verification email sent — check your inbox.'); }
    catch (e) { setMsg(e.response?.data?.error || 'Could not resend right now.'); }
    finally { setSending(false); }
  };
  const logout = async () => { try { await axios.post('/api/auth/logout'); } catch {} window.location.href = '/'; };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-900, #0a0e14)', padding: 20 }}>
      <div className="card" style={{ width: 400, padding: 36, textAlign: 'center' }}>
        <MailCheck size={40} color="var(--blue)" style={{ marginBottom: 14 }} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>Verify your email</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 22 }}>
          We sent a verification link to <b style={{ color: 'var(--text-primary)' }}>{email}</b>.
          Click it to activate your account, then come back here.
        </div>
        {justVerified && (
          <div style={{ background: '#052e16', border: '1px solid #166534', color: '#4ade80', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            ✓ Email verified! Loading your dashboard…
          </div>
        )}
        {msg && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{msg}</div>}

        <button className="btn btn-primary" onClick={() => window.location.reload()} style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}>
          <RefreshCw size={14} /> I've verified — continue
        </button>
        <button className="btn btn-ghost" onClick={resend} disabled={sending} style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}>
          {sending ? 'Sending…' : 'Resend verification email'}
        </button>
        <button className="btn btn-ghost" onClick={logout} style={{ width: '100%', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </div>
  );
}

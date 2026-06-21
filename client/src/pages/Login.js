import React, { useState } from 'react';
import axios from 'axios';
import { Activity, ShieldCheck } from 'lucide-react';

const ERRORS = {
  not_allowed:   (email) => `${email || 'That account'} isn't permitted to sign in.`,
  unverified:    () => 'Your Google email is not verified.',
  invalid_state: () => 'Login session expired — please try again.',
  failed:        () => 'Google sign-in failed — please try again.',
};

export default function Login({ googleEnabled }) {
  const params = new URLSearchParams(window.location.search);
  const errKey = params.get('auth_error');
  const oauthErr = errKey && (ERRORS[errKey] ? ERRORS[errKey](params.get('email')) : 'Sign-in error — please try again.');

  const [mode, setMode]   = useState('login');   // 'login' | 'register' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]   = useState('');
  const [error, setError] = useState('');
  const [info, setInfo]   = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    try {
      if (mode === 'forgot') {
        await axios.post('/api/auth/forgot-password', { email });
        setInfo('If an account exists for that email, a password-reset link is on its way.');
        setLoading(false);
        return;
      }
      const url = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      await axios.post(url, { email, password, name });
      window.location.href = '/';   // reload → App re-checks /api/auth/me → app
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong — please try again.');
      setLoading(false);
    }
  };

  const tabStyle = (active) => ({
    flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center',
    background: 'none', border: 'none', color: active ? 'var(--blue)' : 'var(--text-muted)',
    borderBottom: `2px solid ${active ? 'var(--blue)' : 'transparent'}`,
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-900, #0a0e14)', padding: 20 }}>
      <div className="card" style={{ width: 380, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
          <Activity size={26} color="var(--blue)" strokeWidth={2.5} />
          <span style={{ fontWeight: 800, fontSize: 20 }}>Stock Intel</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, textAlign: 'center' }}>Portfolio Intelligence Dashboard</div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          <button style={tabStyle(mode === 'login')}    onClick={() => { setMode('login'); setError(''); }}>Sign In</button>
          <button style={tabStyle(mode === 'register')} onClick={() => { setMode('register'); setError(''); }}>Create Account</button>
        </div>

        {(error || oauthErr) && (
          <div style={{ background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#f87171', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 16 }}>
            {error || oauthErr}
          </div>
        )}
        {info && (
          <div style={{ background: '#052e16', border: '1px solid #166534', color: '#4ade80', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 16 }}>
            {info}
          </div>
        )}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <input className="input" placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
          )}
          <input className="input" type="email" placeholder="Email (any provider)" value={email} onChange={e => setEmail(e.target.value)} required
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
          {mode !== 'forgot' && (
            <input className="input" type="password" placeholder={mode === 'register' ? 'Password (min 8 characters)' : 'Password'} value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 16 }} />
          )}
          <button className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: mode === 'forgot' ? 6 : 0 }}>
            {loading ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12 }}>
          {mode === 'login' && (
            <button onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Forgot password?</button>
          )}
          {mode === 'forgot' && (
            <button onClick={() => { setMode('login'); setError(''); setInfo(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>← Back to sign in</button>
          )}
        </div>

        {googleEnabled && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0', color: 'var(--text-muted)', fontSize: 11 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} /> OR <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <a href="/api/auth/google"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
                background: '#fff', color: '#1f1f1f', fontWeight: 600, fontSize: 14, padding: '11px 16px', borderRadius: 8, textDecoration: 'none' }}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Sign in with Google
            </a>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: 'var(--text-muted)', marginTop: 20 }}>
          <ShieldCheck size={14} color="var(--green)" /> Your portfolio is private to your account
        </div>
      </div>
    </div>
  );
}

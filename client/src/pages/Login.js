import React from 'react';
import { Activity, ShieldCheck } from 'lucide-react';

const ERRORS = {
  not_allowed:   (email) => `${email || 'That account'} isn't on the access list for this app.`,
  unverified:    () => 'Your Google email is not verified.',
  invalid_state: () => 'Login session expired — please try again.',
  failed:        () => 'Sign-in failed — please try again.',
};

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const errKey = params.get('auth_error');
  const email  = params.get('email');
  const errMsg = errKey && (ERRORS[errKey] ? ERRORS[errKey](email) : 'Sign-in error — please try again.');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-900, #0a0e14)', padding: 20 }}>
      <div className="card" style={{ width: 380, padding: 36, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <Activity size={26} color="var(--blue)" strokeWidth={2.5} />
          <span style={{ fontWeight: 800, fontSize: 20 }}>Stock Intel</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>Portfolio Intelligence Dashboard</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
          <ShieldCheck size={15} color="var(--green)" /> Private — authorized accounts only
        </div>

        {errMsg && (
          <div style={{ background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#f87171', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 18 }}>
            {errMsg}
          </div>
        )}

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

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 22, lineHeight: 1.5 }}>
          Access is restricted to approved email addresses. Contact the owner to be added.
        </div>
      </div>
    </div>
  );
}

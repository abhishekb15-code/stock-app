import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { UserCircle, Check, Mail, Phone, ShieldCheck, Sparkles, BadgeCheck } from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

function Row({ icon: Icon, label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <Icon size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
      <div style={{ fontSize: 12, color: 'var(--text-muted)', width: 130, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, fontSize: 14, color: 'var(--text-primary)' }}>{children}</div>
    </div>
  );
}

export default function Profile() {
  const [p, setP] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/api/profile').then(r => { setP(r.data); setName(r.data.name || ''); setPhone(r.data.phone || ''); }).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    try {
      const { data } = await axios.put('/api/profile', { name, phone });
      setP(prev => ({ ...prev, ...data }));
      setMsg('Profile updated');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save changes');
    } finally { setSaving(false); }
  };

  if (!p) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60, gap: 6 }}>
      <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
    </div>
  );

  const dirty = name !== (p.name || '') || phone !== (p.phone || '');

  return (
    <div className="fade-in" style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <UserCircle size={22} color="var(--blue)" /> My Profile
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>Manage your account details.</p>

      {/* Header card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, marginBottom: 18 }}>
        {p.picture
          ? <img src={p.picture} alt="" referrerPolicy="no-referrer" style={{ width: 56, height: 56, borderRadius: '50%' }} />
          : <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>{(p.name || p.email || '?')[0].toUpperCase()}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{p.name || p.email.split('@')[0]}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.email}</div>
        </div>
        {p.billingEnabled && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 8,
            color: p.plan === 'pro' ? 'var(--blue)' : 'var(--text-secondary)', background: p.plan === 'pro' ? 'var(--blue-dim)' : 'var(--bg-600)', border: `1px solid ${p.plan === 'pro' ? 'var(--blue)' : 'var(--border)'}` }}>
            <Sparkles size={12} /> {p.plan === 'pro' ? 'PRO' : 'FREE'}
          </span>
        )}
      </div>

      {/* Editable form */}
      <form onSubmit={save} className="card" style={{ padding: 24, marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Edit details</div>

        <label className="label">Full name</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: 16 }} />

        <label className="label">Mobile number</label>
        <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +91 98765 43210"
          style={{ width: '100%', boxSizing: 'border-box' }} />

        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 14 }}>{error}</div>}
        {msg && <div style={{ color: 'var(--green)', fontSize: 13, marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Check size={14} /> {msg}</div>}

        <button className="btn btn-primary" disabled={saving || !dirty} style={{ marginTop: 18, justifyContent: 'center' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      {/* Account info */}
      <div className="card" style={{ padding: '8px 24px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 4px' }}>Account</div>
        <Row icon={Mail} label="Email">{p.email}</Row>
        <Row icon={Phone} label="Mobile">{p.phone || <span style={{ color: 'var(--text-muted)' }}>Not added</span>}</Row>
        <Row icon={BadgeCheck} label="Email status">
          {p.emailVerified
            ? <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><ShieldCheck size={14} /> Verified</span>
            : <span style={{ color: 'var(--amber)' }}>Unverified</span>}
        </Row>
        <Row icon={UserCircle} label="Sign-in method">{p.provider === 'google' ? 'Google' : 'Email & password'}</Row>
        <Row icon={Sparkles} label="Plan">{p.billingEnabled ? (p.plan === 'pro' ? 'Pro' : 'Free') : 'All features'}</Row>
        <Row icon={Check} label="Member since">{fmtDate(p.createdAt)}</Row>
      </div>
    </div>
  );
}

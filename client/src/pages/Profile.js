import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { UserCircle, Check, Mail, Phone, ShieldCheck, Sparkles, BadgeCheck, Camera, Lock, Bell, Download, Trash2 } from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

// Center-crop + resize an image file to a small square JPEG data URL.
function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

function Row({ icon: Icon, label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <Icon size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
      <div style={{ fontSize: 12, color: 'var(--text-muted)', width: 130, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, fontSize: 14, color: 'var(--text-primary)' }}>{children}</div>
    </div>
  );
}
const SectionTitle = ({ icon: Icon, children }) => (
  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
    {Icon && <Icon size={13} />}{children}
  </div>
);

export default function Profile() {
  const [p, setP] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  // change password
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [conf, setConf] = useState('');
  const [pwMsg, setPwMsg] = useState(''); const [pwErr, setPwErr] = useState(''); const [pwBusy, setPwBusy] = useState(false);

  // data controls (export / delete)
  const [delBusy, setDelBusy] = useState(false); const [delErr, setDelErr] = useState('');

  const exportData = () => { window.location.href = '/api/profile/export'; };

  const deleteAccount = async () => {
    setDelErr('');
    let password;
    if (p.hasPassword) {
      password = window.prompt('This permanently deletes your account and all data. Enter your password to confirm:');
      if (password == null) return;
    } else if (!window.confirm('This permanently deletes your account and all your data. This cannot be undone. Continue?')) {
      return;
    }
    setDelBusy(true);
    try {
      await axios.delete('/api/profile/account', { data: { password } });
      window.location.href = '/';   // session cleared server-side → back to login
    } catch (err) {
      setDelErr(err.response?.data?.error || 'Could not delete your account.');
      setDelBusy(false);
    }
  };

  // preferences
  const [digest, setDigest] = useState(false);

  const reload = () => axios.get('/api/profile').then(r => {
    setP(r.data); setName(r.data.name || ''); setPhone(r.data.phone || ''); setDigest(!!(r.data.prefs && r.data.prefs.dailyDigest));
  });
  useEffect(() => { reload().catch(() => {}); }, []);

  const saveProfile = async (e) => {
    e.preventDefault(); setSaving(true); setMsg(''); setError('');
    try { const { data } = await axios.put('/api/profile', { name, phone }); setP(prev => ({ ...prev, ...data })); setMsg('Profile updated'); setTimeout(() => setMsg(''), 3000); }
    catch (err) { setError(err.response?.data?.error || 'Could not save changes'); }
    finally { setSaving(false); }
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setPhotoBusy(true); setError('');
    try {
      const dataUrl = await resizeImage(file);
      const { data } = await axios.put('/api/profile', { picture: dataUrl });
      setP(prev => ({ ...prev, picture: data.picture }));
    } catch (err) { setError(err.response?.data?.error || 'Could not upload photo'); }
    finally { setPhotoBusy(false); }
  };
  const removePhoto = async () => {
    setPhotoBusy(true);
    try { const { data } = await axios.put('/api/profile', { picture: null }); setP(prev => ({ ...prev, picture: data.picture })); }
    catch {} finally { setPhotoBusy(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault(); setPwMsg(''); setPwErr('');
    if (nw.length < 8)  return setPwErr('New password must be at least 8 characters');
    if (nw !== conf)    return setPwErr('New passwords do not match');
    setPwBusy(true);
    try { await axios.post('/api/profile/change-password', { currentPassword: cur, newPassword: nw }); setPwMsg('Password changed'); setCur(''); setNw(''); setConf(''); setTimeout(() => setPwMsg(''), 3000); }
    catch (err) { setPwErr(err.response?.data?.error || 'Could not change password'); }
    finally { setPwBusy(false); }
  };

  const toggleDigest = async () => {
    const next = !digest; setDigest(next);
    try { await axios.put('/api/profile/preferences', { dailyDigest: next }); }
    catch { setDigest(!next); }
  };

  if (!p) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60, gap: 6 }}>
      <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
    </div>
  );

  const dirty = name !== (p.name || '') || phone !== (p.phone || '');
  const avatar = p.picture
    ? <img src={p.picture} alt="" referrerPolicy="no-referrer" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
    : <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800 }}>{(p.name || p.email || '?')[0].toUpperCase()}</div>;

  return (
    <div className="fade-in" style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <UserCircle size={22} color="var(--blue)" /> My Profile
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>Manage your account details and preferences.</p>

      {/* Header card with photo */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 18, padding: 20, marginBottom: 18 }}>
        <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
          {avatar}
          <button onClick={() => fileRef.current?.click()} disabled={photoBusy} title="Change photo"
            style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: '50%', background: 'var(--blue)', border: '2px solid var(--bg-700, #0f1b2d)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Camera size={13} />
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhoto} style={{ display: 'none' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{p.name || p.email.split('@')[0]}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.email}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => fileRef.current?.click()} disabled={photoBusy}
              style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 12, padding: 0 }}>
              {photoBusy ? 'Uploading…' : 'Upload photo'}
            </button>
            {p.picture && <button onClick={removePhoto} disabled={photoBusy} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0 }}>Remove</button>}
          </div>
        </div>
        {p.billingEnabled && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 8,
            color: p.plan === 'pro' ? 'var(--blue)' : 'var(--text-secondary)', background: p.plan === 'pro' ? 'var(--blue-dim)' : 'var(--bg-600)', border: `1px solid ${p.plan === 'pro' ? 'var(--blue)' : 'var(--border)'}` }}>
            <Sparkles size={12} /> {p.plan === 'pro' ? 'PRO' : 'FREE'}
          </span>
        )}
      </div>

      {/* Edit details */}
      <form onSubmit={saveProfile} className="card" style={{ padding: 24, marginBottom: 18 }}>
        <SectionTitle>Edit details</SectionTitle>
        <label className="label">Full name</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 16 }} />
        <label className="label">Mobile number</label>
        <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +91 98765 43210" style={{ width: '100%', boxSizing: 'border-box' }} />
        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 14 }}>{error}</div>}
        {msg && <div style={{ color: 'var(--green)', fontSize: 13, marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Check size={14} /> {msg}</div>}
        <button className="btn btn-primary" disabled={saving || !dirty} style={{ marginTop: 18, justifyContent: 'center' }}>{saving ? 'Saving…' : 'Save changes'}</button>
      </form>

      {/* Notifications */}
      <div className="card" style={{ padding: 24, marginBottom: 18 }}>
        <SectionTitle icon={Bell}>Notifications</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Daily portfolio email digest</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>A morning summary of your holdings, P&L and signals (7 AM, weekdays).</div>
          </div>
          <button onClick={toggleDigest} role="switch" aria-checked={digest}
            style={{ flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .15s',
              background: digest ? 'var(--blue)' : 'var(--bg-600)' }}>
            <span style={{ position: 'absolute', top: 2, left: digest ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
          </button>
        </div>
        {!p.emailVerified && digest && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 10 }}>Verify your email to receive the digest.</div>}
      </div>

      {/* Change password */}
      {p.hasPassword ? (
        <form onSubmit={changePassword} className="card" style={{ padding: 24, marginBottom: 18 }}>
          <SectionTitle icon={Lock}>Change password</SectionTitle>
          <input className="input" type="password" placeholder="Current password" value={cur} onChange={e => setCur(e.target.value)} required style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
          <input className="input" type="password" placeholder="New password (min 8 characters)" value={nw} onChange={e => setNw(e.target.value)} required style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
          <input className="input" type="password" placeholder="Confirm new password" value={conf} onChange={e => setConf(e.target.value)} required style={{ width: '100%', boxSizing: 'border-box' }} />
          {pwErr && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 14 }}>{pwErr}</div>}
          {pwMsg && <div style={{ color: 'var(--green)', fontSize: 13, marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Check size={14} /> {pwMsg}</div>}
          <button className="btn btn-primary" disabled={pwBusy} style={{ marginTop: 18, justifyContent: 'center' }}>{pwBusy ? 'Updating…' : 'Update password'}</button>
        </form>
      ) : (
        <div className="card" style={{ padding: 24, marginBottom: 18 }}>
          <SectionTitle icon={Lock}>Password</SectionTitle>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>You sign in with Google, so there’s no password to manage here.</div>
        </div>
      )}

      {/* Account info */}
      <div className="card" style={{ padding: '8px 24px 16px' }}>
        <div style={{ height: 8 }} />
        <SectionTitle>Account</SectionTitle>
        <Row icon={Mail} label="Email">{p.email}</Row>
        <Row icon={Phone} label="Mobile">{p.phone || <span style={{ color: 'var(--text-muted)' }}>Not added</span>}</Row>
        <Row icon={BadgeCheck} label="Email status">
          {p.emailVerified ? <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><ShieldCheck size={14} /> Verified</span> : <span style={{ color: 'var(--amber)' }}>Unverified</span>}
        </Row>
        <Row icon={UserCircle} label="Sign-in method">{p.provider === 'google' ? 'Google' : 'Email & password'}</Row>
        <Row icon={Sparkles} label="Plan">{p.billingEnabled ? (p.plan === 'pro' ? 'Pro' : 'Free') : 'All features'}</Row>
        <Row icon={Check} label="Member since">{fmtDate(p.createdAt)}</Row>
      </div>

      {/* Privacy & data controls (DPDP rights) */}
      <div className="card" style={{ padding: 24, marginTop: 18 }}>
        <SectionTitle icon={ShieldCheck}>Privacy &amp; data</SectionTitle>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Download everything we hold about you (profile, holdings, watchlist, trades).</div>
          <button className="btn btn-ghost" onClick={exportData} style={{ fontSize: 13 }}><Download size={14} /> Download my data</button>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <b style={{ color: 'var(--red)' }}>Delete account.</b> Permanently erases your account and all data. This cannot be undone.
          </div>
          <button className="btn btn-danger" onClick={deleteAccount} disabled={delBusy} style={{ fontSize: 13 }}>
            <Trash2 size={14} /> {delBusy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
        {delErr && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{delErr}</div>}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Briefcase, TrendingUp, Fish, Search, Mail, Activity, Star, Crown, LogOut, Sparkles, MessageSquare } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../AuthContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/chat', icon: MessageSquare, label: 'AI Analyst' },
  { to: '/portfolio', icon: Briefcase, label: 'Portfolio' },
  { to: '/watchlist', icon: Star, label: 'Watchlist' },
  { to: '/whales', icon: Fish, label: 'Whale Signals' },
  { to: '/investors', icon: Crown, label: 'Ace Investors' },
];

export default function Sidebar({ user, isMobile = false, open = false, onClose }) {
  const { plan, billingEnabled } = useAuth();
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/stock/${search.trim().toUpperCase()}`);
      setSearch('');
    }
  };

  const logout = async () => {
    try { await axios.post('/api/auth/logout'); } catch {}
    window.location.href = '/';
  };

  const triggerEmail = async () => {
    setSending(true);
    setEmailMsg('');
    try {
      const res = await axios.post('/api/email/trigger');
      setEmailMsg(res.data.mode === 'email' ? '✅ Email sent!' : '✅ Logged to console');
    } catch {
      setEmailMsg('❌ Failed');
    } finally {
      setSending(false);
      setTimeout(() => setEmailMsg(''), 4000);
    }
  };

  const activeStyle = {
    background: 'var(--bg-600)',
    color: 'var(--text-primary)',
    borderLeft: '2px solid var(--blue)',
  };

  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0, bottom: 0, width: 220,
      background: 'var(--bg-800)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '20px 0',
      zIndex: isMobile ? 250 : 100,
      transform: isMobile && !open ? 'translateX(-100%)' : 'translateX(0)',
      transition: 'transform 0.22s ease',
      boxShadow: isMobile && open ? '2px 0 24px #000a' : 'none',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={22} color="var(--blue)" strokeWidth={2.5} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.2 }}>Stock Intel</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>PORTFOLIO ANALYZER</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 16px 20px' }}>
        <form onSubmit={handleSearch} style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: 30, fontSize: 12, height: 34 }}
            placeholder="Search ticker..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </form>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 20px 8px', letterSpacing: '1px', fontWeight: 600 }}>MENU</div>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 20px',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: 13, fontWeight: 500,
              borderLeft: '2px solid transparent',
              transition: 'all 0.15s',
              ...(isActive ? activeStyle : {}),
            })}>
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Plan / upgrade */}
      {billingEnabled && (
        <div style={{ padding: '0 16px 12px' }}>
          {plan === 'pro' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--blue)', background: 'var(--blue-dim)', border: '1px solid var(--blue)', borderRadius: 8, padding: '7px 10px' }}>
              <Sparkles size={13} /> PRO
            </div>
          ) : (
            <NavLink to="/pricing" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--blue)', borderRadius: 8, padding: '9px 10px', textDecoration: 'none' }}>
              <Sparkles size={14} /> Upgrade to Pro
            </NavLink>
          )}
        </div>
      )}

      {/* Digest trigger + account */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
          title="Runs the portfolio analysis digest now. If Gmail is configured it sends an email; otherwise it logs the report on the server."
          onClick={triggerEmail} disabled={sending}>
          <Mail size={14} />
          {sending ? 'Running...' : 'Send Digest'}
        </button>
        {emailMsg && <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 8 }}>{emailMsg}</div>}

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div onClick={() => navigate('/profile')} title="View profile"
              style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'pointer' }}>
              {user.picture
                ? <img src={user.picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} referrerPolicy="no-referrer" />
                : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{(user.name || user.email || '?')[0].toUpperCase()}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name || user.email}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>View profile</div>
              </div>
            </div>
            <button onClick={logout} title="Sign out" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

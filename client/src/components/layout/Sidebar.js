import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Briefcase, TrendingUp, Fish, Search, Mail, Activity } from 'lucide-react';
import axios from 'axios';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portfolio', icon: Briefcase, label: 'Portfolio' },
  { to: '/whales', icon: Fish, label: 'Whale Signals' },
];

export default function Sidebar() {
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
      zIndex: 100,
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

      {/* Digest trigger */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
          title="Runs the portfolio analysis digest now. If Gmail is configured it sends an email; otherwise it logs the report on the server."
          onClick={triggerEmail} disabled={sending}>
          <Mail size={14} />
          {sending ? 'Running...' : 'Send Digest'}
        </button>
        {emailMsg && <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 8 }}>{emailMsg}</div>}
      </div>
    </aside>
  );
}

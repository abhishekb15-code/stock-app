import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Crown, RefreshCw, Users, PieChart as PieIcon, TrendingUp, Plus, Minus, X, ArrowUpRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#a855f7', '#64748b'];

const CHANGE_STYLE = {
  new:     { label: 'NEW',     color: '#4ade80', bg: '#052e16' },
  added:   { label: 'ADDED',   color: '#38bdf8', bg: '#082f49' },
  reduced: { label: 'TRIMMED', color: '#fbbf24', bg: '#1c1500' },
  hold:    { label: '',        color: 'var(--text-muted)', bg: 'transparent' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function ChangeTag({ change }) {
  if (!change || change.type === 'hold') return null;
  const s = CHANGE_STYLE[change.type];
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}55`, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
      {s.label}{change.type === 'added' || change.type === 'reduced' ? ` ${change.sharesPct > 0 ? '+' : ''}${change.sharesPct}%` : ''}
    </span>
  );
}

function SectionHeader({ icon: Icon, children, sub }) {
  return (
    <div style={{ marginTop: 28, marginBottom: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        {Icon && <Icon size={16} color="var(--blue)" />}{children}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function SuperInvestors() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = () => {
    setLoading(true);
    axios.get('/api/superinvestors')
      .then(r => { setData(r.data); setSelected(r.data.investors.find(i => !i.error)?.key || null); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="fade-in">
      <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}><Crown size={20} color="var(--blue)" /> Ace Investors</h1>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60, gap: 6 }}>
        <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
      </div>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Pulling latest 13F filings from SEC EDGAR…</div>
    </div>
  );

  if (!data) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Could not load investor data.</div>;

  const inv = data.investors.find(i => i.key === selected);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Crown size={20} color="var(--blue)" /> Ace Investors
        </h1>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        Where the world's top value investors are putting their money — from US SEC 13F filings (US-listed holdings, reported quarterly).
      </p>

      {/* Investor selector */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        {data.investors.map(i => (
          <button key={i.key} onClick={() => setSelected(i.key)} disabled={i.error}
            style={{
              textAlign: 'left', cursor: i.error ? 'not-allowed' : 'pointer', minWidth: 150,
              background: selected === i.key ? 'var(--bg-600)' : 'var(--bg-800)',
              border: `1px solid ${selected === i.key ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 14px', opacity: i.error ? 0.5 : 1,
            }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{i.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{i.fund}</div>
            {!i.error && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {i.totalValueFmt} · {i.holdingsCount} pos {i.stale && <span style={{ color: 'var(--amber)' }}>· dated</span>}
            </div>}
          </button>
        ))}
      </div>

      {/* Selected investor detail */}
      {inv && !inv.error && (
        <>
          <SectionHeader icon={TrendingUp}
            sub={`Latest 13F as of ${fmtDate(inv.reportDate)}${inv.stale ? ' — this manager has not filed a recent 13F; positions may be outdated' : ''} · vs ${fmtDate(inv.prevReportDate)}`}>
            {inv.name} — {inv.fund}
          </SectionHeader>

          {/* Moves */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 8 }}>
            <MovesCard title="New Buys" icon={Plus} color="#4ade80" items={inv.moves.new} field="issuer" />
            <MovesCard title="Added To" icon={ArrowUpRight} color="#38bdf8" items={inv.moves.added} field="issuer" extra={h => `${h.change.sharesPct > 0 ? '+' : ''}${h.change.sharesPct}%`} />
            <MovesCard title="Trimmed" icon={Minus} color="#fbbf24" items={inv.moves.reduced} field="issuer" extra={h => `${h.change.sharesPct}%`} />
            <MovesCard title="Sold Out" icon={X} color="#f87171" items={inv.moves.exited} field="issuer" />
          </div>

          {/* Top holdings */}
          <SectionHeader>Top Holdings</SectionHeader>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead><tr><th>#</th><th>Company</th><th>Sector</th><th>% of Portfolio</th><th>Value</th><th>Change</th></tr></thead>
              <tbody>
                {inv.topHoldings.map((h, idx) => (
                  <tr key={h.cusip || idx}>
                    <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{h.issuer}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.sector}</td>
                    <td className="mono">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, maxWidth: 90, height: 6, background: 'var(--bg-600)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, h.pct)}%`, height: '100%', background: 'var(--blue)' }} />
                        </div>
                        {h.pct}%
                      </div>
                    </td>
                    <td className="mono">{h.valueFmt}</td>
                    <td><ChangeTag change={h.change} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Consensus */}
      <SectionHeader icon={Users} sub="Stocks held by the most tracked investors at once — cluster conviction.">
        Consensus Picks
      </SectionHeader>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table" style={{ width: '100%' }}>
          <thead><tr><th>Company</th><th>Sector</th><th># Investors</th><th>Held By</th><th>Combined Value</th></tr></thead>
          <tbody>
            {data.consensus.map((c, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{c.issuer}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.sector}</td>
                <td><span style={{ background: 'var(--blue-dim)', color: 'var(--blue)', borderRadius: 5, padding: '2px 8px', fontWeight: 700, fontSize: 12 }}>{c.count}</span></td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.holders.map(h => h.name).join(', ')}</td>
                <td className="mono">{c.totalValueFmt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sector breakdown */}
      <SectionHeader icon={PieIcon} sub="Aggregate capital concentration across all tracked investors.">
        Where Smart Money Sits — by Sector
      </SectionHeader>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'center' }}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data.sectors.filter(s => s.pct > 0)} dataKey="value" nameKey="sector" cx="50%" cy="50%" outerRadius={85} innerRadius={48} paddingAngle={2}>
              {data.sectors.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v, n, p) => [`${p.payload.pct}% (${p.payload.valueFmt})`, p.payload.sector]}
              contentStyle={{ background: 'var(--bg-600)', border: '1px solid var(--border)', borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
        <div>
          {data.sectors.filter(s => s.pct > 0).map((s, i) => (
            <div key={s.sector} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                {s.sector}
              </span>
              <span className="mono">{s.pct}% · {s.valueFmt}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 20, textAlign: 'center' }}>
        Source: US SEC Form 13F-HR filings via EDGAR · long US-listed equity positions only · updated each quarter (~45-day lag).
      </div>
    </div>
  );
}

function MovesCard({ title, icon: Icon, color, items, field, extra }) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icon size={13} /> {title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({items?.length || 0})</span>
      </div>
      {(!items || items.length === 0) ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</div>
      ) : items.map((h, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--text-secondary)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h[field]}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color, flexShrink: 0, marginLeft: 8 }}>{extra ? extra(h) : (h.valueFmt || '')}</span>
        </div>
      ))}
    </div>
  );
}

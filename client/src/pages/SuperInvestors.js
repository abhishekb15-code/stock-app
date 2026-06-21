import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Crown, RefreshCw, Users, PieChart as PieIcon, TrendingUp, Plus, Minus, X, ArrowUpRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useLocked } from '../AuthContext';
import UpgradeNotice from '../components/UpgradeNotice';

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#a855f7', '#64748b'];

const CHANGE_STYLE = {
  new:     { label: 'NEW',     color: '#4ade80', bg: '#052e16' },
  added:   { label: 'ADDED',   color: '#38bdf8', bg: '#082f49' },
  reduced: { label: 'TRIMMED', color: '#fbbf24', bg: '#1c1500' },
  hold:    { label: '',        color: 'var(--text-muted)', bg: 'transparent' },
};

const money = (v) => v != null ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';

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

function MovesCard({ title, icon: Icon, color, items, extra }) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icon size={13} /> {title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({items?.length || 0})</span>
      </div>
      {(!items || items.length === 0) ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</div>
      ) : items.map((h, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--text-secondary)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.issuer}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color, flexShrink: 0, marginLeft: 8 }}>{extra ? extra(h) : (h.valueFmt || '')}</span>
        </div>
      ))}
    </div>
  );
}

export default function SuperInvestors() {
  const [market, setMarket] = useState('us');
  const [byMarket, setByMarket] = useState({});         // { us: data, india: data }
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();
  const locked = useLocked();

  const load = (m, force) => {
    setLoading(true);
    const url = m === 'india' ? '/api/indian-investors' : '/api/superinvestors';
    axios.get(url + (force ? '?refresh=1' : ''))
      .then(r => {
        setByMarket(prev => ({ ...prev, [m]: r.data }));
        setSelected(r.data.investors.find(i => !i.error)?.key || null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (locked) { setLoading(false); return; }
    if (byMarket[market]) { setSelected(byMarket[market].investors.find(i => !i.error)?.key || null); setLoading(false); }
    else load(market);
  }, [market]); // eslint-disable-line

  const data = byMarket[market];
  const india = market === 'india';
  const inv = data?.investors.find(i => i.key === selected);

  const Toggle = () => (
    <div style={{ display: 'inline-flex', background: 'var(--bg-800)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
      {[['us', '🇺🇸 US (13F)'], ['india', '🇮🇳 India']].map(([k, label]) => (
        <button key={k} onClick={() => setMarket(k)}
          style={{ border: 'none', cursor: 'pointer', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700,
            background: market === k ? 'var(--blue)' : 'transparent', color: market === k ? 'white' : 'var(--text-secondary)' }}>
          {label}
        </button>
      ))}
    </div>
  );

  if (locked) return (
    <div className="fade-in">
      <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Crown size={20} color="var(--blue)" /> Ace Investors
      </h1>
      <UpgradeNotice feature="Ace Investors" />
    </div>
  );

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Crown size={20} color="var(--blue)" /> Ace Investors
        </h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Toggle />
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => load(market, true)}><RefreshCw size={13} /> Refresh</button>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        {india
          ? 'Notable Indian investors’ holdings, compiled from public BSE/NSE quarterly shareholding disclosures — with live prices.'
          : 'Where the world’s top value investors are putting their money — from US SEC 13F filings (US-listed holdings, reported quarterly).'}
      </p>

      {loading || !data ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60, gap: 6 }}>
            <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
          </div>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {india ? 'Loading holdings and live prices…' : 'Pulling latest 13F filings from SEC EDGAR…'}
          </div>
        </>
      ) : (
        <>
          {/* Investor selector */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            {data.investors.map(i => (
              <button key={i.key} onClick={() => setSelected(i.key)} disabled={i.error}
                style={{
                  textAlign: 'left', cursor: i.error ? 'not-allowed' : 'pointer', minWidth: 150, maxWidth: 210,
                  background: selected === i.key ? 'var(--bg-600)' : 'var(--bg-800)',
                  border: `1px solid ${selected === i.key ? 'var(--blue)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '10px 14px', opacity: i.error ? 0.5 : 1,
                }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{i.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{i.fund}</div>
                {!i.error && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                    {india ? `${i.holdingsCount} holdings` : `${i.totalValueFmt} · ${i.holdingsCount} pos`}
                    {!india && i.stale && <span style={{ color: 'var(--amber)' }}> · dated</span>}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Selected investor detail */}
          {inv && !inv.error && (india ? (
            <>
              <SectionHeader icon={TrendingUp} sub={inv.note}>{inv.name} — {inv.fund}</SectionHeader>
              {inv.holdings.length === 0 ? (
                <div className="card" style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                  No individually-tracked holdings for this investor (limited public &gt;1% disclosures).
                </div>
              ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead><tr><th>Company</th><th>Ticker</th><th>Sector</th><th>Price</th><th>Today</th></tr></thead>
                  <tbody>
                    {inv.holdings.map((h, idx) => (
                      <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => navigate(`/stock/${h.ticker}`)}>
                        <td style={{ fontWeight: 600 }}>{h.company}</td>
                        <td style={{ color: 'var(--blue)' }}>{h.displayTicker}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.sector}</td>
                        <td className="mono">{money(h.price)}</td>
                        <td className={`mono ${h.changePercent >= 0 ? 'pos' : 'neg'}`}>
                          {h.changePercent != null ? `${h.changePercent >= 0 ? '+' : ''}${h.changePercent}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </>
          ) : (
            <>
              <SectionHeader icon={TrendingUp}
                sub={`Latest 13F as of ${fmtDate(inv.reportDate)}${inv.stale ? ' — manager has not filed a recent 13F; positions may be outdated' : ''} · vs ${fmtDate(inv.prevReportDate)}`}>
                {inv.name} — {inv.fund}
              </SectionHeader>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 8 }}>
                <MovesCard title="New Buys" icon={Plus} color="#4ade80" items={inv.moves.new} />
                <MovesCard title="Added To" icon={ArrowUpRight} color="#38bdf8" items={inv.moves.added} extra={h => `${h.change.sharesPct > 0 ? '+' : ''}${h.change.sharesPct}%`} />
                <MovesCard title="Trimmed" icon={Minus} color="#fbbf24" items={inv.moves.reduced} extra={h => `${h.change.sharesPct}%`} />
                <MovesCard title="Sold Out" icon={X} color="#f87171" items={inv.moves.exited} />
              </div>
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
          ))}

          {/* Consensus */}
          <SectionHeader icon={Users} sub="Stocks held by the most tracked investors at once — cluster conviction.">
            Consensus Picks
          </SectionHeader>
          {data.consensus.length === 0 ? (
            <div className="card" style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
              No overlapping names across the tracked investors this period.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead><tr><th>Company</th><th>Sector</th><th># Investors</th><th>Held By</th>{!india && <th>Combined Value</th>}</tr></thead>
                <tbody>
                  {data.consensus.map((c, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{c.issuer || c.company}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.sector}</td>
                      <td><span style={{ background: 'var(--blue-dim)', color: 'var(--blue)', borderRadius: 5, padding: '2px 8px', fontWeight: 700, fontSize: 12 }}>{c.count}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.holders.map(h => h.name || h).join(', ')}</td>
                      {!india && <td className="mono">{c.totalValueFmt}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Sector breakdown */}
          <SectionHeader icon={PieIcon} sub={india ? 'Spread of holdings across sectors (by number of positions).' : 'Aggregate capital concentration across all tracked investors.'}>
            Where Smart Money Sits — by Sector
          </SectionHeader>
          <div className="card" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.sectors.filter(s => s.pct > 0)} dataKey={india ? 'count' : 'value'} nameKey="sector" cx="50%" cy="50%" outerRadius={85} innerRadius={48} paddingAngle={2}>
                  {data.sectors.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n, p) => [india ? `${p.payload.pct}% (${p.payload.count} holdings)` : `${p.payload.pct}% (${p.payload.valueFmt})`, p.payload.sector]}
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
                  <span className="mono">{s.pct}%{india ? ` · ${s.count}` : ` · ${s.valueFmt}`}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 20, textAlign: 'center' }}>
            {india
              ? `Holdings compiled from public BSE/NSE shareholding disclosures (${data.asOf}); a representative snapshot, not a complete or real-time portfolio. Prices are live.`
              : 'Source: US SEC Form 13F-HR filings via EDGAR · long US-listed equity positions only · updated each quarter (~45-day lag).'}
          </div>
        </>
      )}
    </div>
  );
}

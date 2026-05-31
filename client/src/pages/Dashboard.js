import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { TrendingUp, TrendingDown, DollarSign, PieChart, RefreshCw, AlertCircle } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#a855f7'];
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = (v) => `${v >= 0 ? '+' : '-'}${money(Math.abs(v))}`;

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 160 }}>
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color: color || 'var(--text-primary)', fontSize: 24, marginTop: 4 }}>{value}</div>
      {sub && <div className="metric-sub" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function RecommendationBadge({ rec }) {
  if (!rec) return <span className="badge" style={{ background: '#ffffff11', color: 'var(--text-muted)' }}>—</span>;
  return <span className={`badge badge-${rec.recommendation}`}>{rec.recommendation.toUpperCase()}</span>;
}

export default function Dashboard() {
  const [portfolio, setPortfolio] = useState(null);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveMode, setLiveMode] = useState(true);
  const navigate = useNavigate();

  const fetchData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      axios.get('/api/portfolio').catch(e => ({ data: null, error: e })),
      axios.get('/api/recommendations').catch(() => ({ data: { recommendations: [] } })),
    ]).then(([p, r]) => {
      if (p.data) {
        setPortfolio(p.data);
        // Check if live prices are available
        const hasLive = p.data.holdings?.some(h => h.livePrice);
        setLiveMode(hasLive);
      } else {
        setError('Could not load portfolio. Make sure the server is running.');
      }
      setRecs(r.data?.recommendations || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 6 }}>
      <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
    </div>
  );

  if (error || !portfolio) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 16 }}>
      <AlertCircle size={40} color="var(--red)" />
      <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 16 }}>{error || 'Failed to load portfolio'}</div>
      <button className="btn btn-primary" onClick={fetchData}>Retry</button>
    </div>
  );

  const { summary, holdings, sectorAllocation } = portfolio;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Dashboard</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
            {!liveMode && <span style={{ marginLeft: 10, color: '#f59e0b', fontSize: 11 }}>⚠️ Showing cost prices — live NSE data unavailable</span>}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={fetchData} style={{ fontSize: 12 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Summary metrics */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <MetricCard label="Total Value" value={money(summary.totalValue)} sub={`${summary.holdingCount} positions`} />
        <MetricCard label="Total P&L" value={signedMoney(summary.totalPnl)}
          sub={`${summary.totalPnlPercent >= 0 ? '+' : ''}${summary.totalPnlPercent}% all time`}
          color={summary.totalPnl >= 0 ? 'var(--green)' : 'var(--red)'} />
        <MetricCard label="Today's P&L" value={signedMoney(summary.dailyPnl)} sub="Market hours"
          color={summary.dailyPnl >= 0 ? 'var(--green)' : 'var(--red)'} />
        <MetricCard label="Portfolio Cost" value={money(summary.totalCost)} sub="Total invested" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, marginBottom: 24 }}>
        {/* Holdings table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Holdings ({holdings.length})</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => navigate('/portfolio')}>View All</button>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Ticker</th><th>Buy</th><th>Current</th><th>P&L</th><th>RSI</th><th>Signal</th></tr>
              </thead>
              <tbody>
                {(holdings || []).map(h => {
                  const rec = recs.find(r => r.ticker === h.ticker);
                  return (
                    <tr key={h.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/stock/${h.ticker}`)}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{h.displayTicker || h.ticker}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.shares} shares</div>
                      </td>
                      <td className="mono">{money(h.avgBuyPrice)}</td>
                      <td className="mono">
                        {money(h.currentPrice)}
                        {!h.livePrice && <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 3 }}>est</span>}
                      </td>
                      <td className={`mono ${h.pnl >= 0 ? 'pos' : 'neg'}`}>{signedMoney(h.pnl)}</td>
                      <td className="mono">{h.technical?.rsi?.value?.toFixed(1) || '—'}</td>
                      <td><RecommendationBadge rec={rec} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sector allocation */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Sector Allocation</div>
          {sectorAllocation && sectorAllocation.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <RechartsPie>
                  <Pie data={sectorAllocation} dataKey="value" nameKey="sector" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                    {sectorAllocation.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [money(v), 'Value']}
                    contentStyle={{ background: 'var(--bg-600)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
                  <Legend formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{v}</span>} />
                </RechartsPie>
              </ResponsiveContainer>
              <div style={{ marginTop: 12 }}>
                {sectorAllocation.map((s, i) => (
                  <div key={s.sector} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block' }} />
                      {s.sector}
                    </span>
                    <span className="mono" style={{ color: 'var(--text-primary)' }}>{s.percent}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No sector data</div>
          )}
        </div>
      </div>
    </div>
  );
}

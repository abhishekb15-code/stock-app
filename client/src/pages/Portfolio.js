import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, Trash2, Download, X, ExternalLink, Upload, AlertCircle, RefreshCw } from 'lucide-react';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = (v) => `${v >= 0 ? '+' : '-'}${money(Math.abs(v))}`;

function AddModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ ticker: '', shares: '', avgBuyPrice: '', purchaseDate: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await axios.post('/api/portfolio', form);
      onAdd(res.data); onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add holding');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div className="card" style={{ width: 440, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Add Holding</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { label: 'NSE Symbol', key: 'ticker', placeholder: 'RELIANCE' },
              { label: 'Shares', key: 'shares', placeholder: '10', type: 'number' },
              { label: 'Buy Price (₹)', key: 'avgBuyPrice', placeholder: '2850.00', type: 'number' },
              { label: 'Purchase Date', key: 'purchaseDate', type: 'date' },
            ].map(({ label, key, placeholder, type = 'text' }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input className="input" type={type} placeholder={placeholder}
                  value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  required={key !== 'purchaseDate'} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <label className="label">Notes (optional)</label>
            <input className="input" placeholder="Long term hold..." value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}>
              {loading ? 'Adding...' : 'Add Holding'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Portfolio() {
  const [portfolio, setPortfolio] = useState(null);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveMode, setLiveMode] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true); setError(null);
    Promise.all([
      axios.get('/api/portfolio').catch(e => ({ data: null, _err: e })),
      axios.get('/api/recommendations').catch(() => ({ data: { recommendations: [] } })),
    ]).then(([p, r]) => {
      if (p.data) {
        setPortfolio(p.data);
        setLiveMode(p.data.holdings?.some(h => h.livePrice) ?? false);
      } else {
        setError(p._err?.response?.data?.error || 'Failed to load portfolio. Is the server running?');
      }
      setRecs(r.data?.recommendations || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this holding?')) return;
    await axios.delete(`/api/portfolio/${id}`);
    load();
  };

  const exportCSV = () => {
    if (!portfolio) return;
    const headers = ['Ticker','Shares','Buy Price','Current Price','Total Value','P&L','P&L %','RSI','MACD','Signal'];
    const rows = portfolio.holdings.map(h => {
      const rec = recs.find(r => r.ticker === h.ticker);
      return [h.displayTicker||h.ticker, h.shares, h.avgBuyPrice, h.currentPrice, h.totalValue, h.pnl, `${h.pnlPercent}%`, h.technical?.rsi?.value?.toFixed(1)||'', h.technical?.macd?.histogram?.toFixed(3)||'', rec?.recommendation||'N/A'];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `portfolio_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let holdings;
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text);
        holdings = Array.isArray(parsed) ? parsed : parsed.holdings;
      } else {
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s_-]/g, ''));
        holdings = lines.slice(1).map(line => {
          const vals = line.split(',');
          const row = Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim()]));
          return { ticker: row.ticker||row.symbol, shares: row.shares||row.quantity||row.qty, avgBuyPrice: row.avgbuyprice||row.buyprice||row.averageprice, notes: row.notes };
        });
      }
      if (!Array.isArray(holdings) || holdings.length === 0) throw new Error('No holdings found in file');
      if (!window.confirm(`Import ${holdings.length} holdings? This will replace your current portfolio.`)) return;
      await axios.post('/api/portfolio/import', { holdings, mode: 'replace' });
      load();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally { event.target.value = ''; }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 6 }}>
      <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
    </div>
  );

  if (error || !portfolio) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 16 }}>
      <AlertCircle size={40} color="var(--red)" />
      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{error || 'Failed to load portfolio'}</div>
      <button className="btn btn-primary" onClick={load}>Retry</button>
    </div>
  );

  const { summary, holdings } = portfolio;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Portfolio</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {holdings.length} positions · Total: {money(summary.totalValue)}
            {!liveMode && <span style={{ marginLeft: 10, color: '#f59e0b', fontSize: 11 }}>⚠️ Live prices unavailable — showing cost basis</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={load}><RefreshCw size={13} /> Refresh</button>
          <input ref={fileInputRef} type="file" accept=".csv,.json" onChange={handleImport} style={{ display: 'none' }} />
          <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Import CSV/JSON</button>
          <button className="btn btn-ghost" onClick={exportCSV}><Download size={14} /> Export CSV</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={14} /> Add Holding</button>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total P&L', value: signedMoney(summary.totalPnl), color: summary.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Return', value: `${summary.totalPnlPercent >= 0 ? '+' : ''}${summary.totalPnlPercent}%`, color: summary.totalPnlPercent >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: "Today's P&L", value: signedMoney(summary.dailyPnl), color: summary.dailyPnl >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Total Invested', value: money(summary.totalCost) },
        ].map(m => (
          <div key={m.label} className="card" style={{ flex: 1, minWidth: 160, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: m.color || 'var(--text-primary)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th><th>Shares</th><th>Buy Price</th><th>Current Price</th>
                <th>Value</th><th>P&L</th><th>P&L %</th><th>RSI</th><th>MACD</th><th>Signal</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map(h => {
                const rec = recs.find(r => r.ticker === h.ticker);
                return (
                  <tr key={h.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{h.displayTicker || h.ticker}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.sector || 'EQUITY'}</div>
                    </td>
                    <td className="mono">{h.shares.toLocaleString('en-IN')}</td>
                    <td className="mono">{money(h.avgBuyPrice)}</td>
                    <td className="mono">
                      <div>{money(h.currentPrice)}{!h.livePrice && <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 3 }}>est</span>}</div>
                      {h.livePrice && <div style={{ fontSize: 11, color: h.dailyChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {h.dailyChange >= 0 ? '+' : ''}{h.dailyChangePercent?.toFixed(2)}%
                      </div>}
                    </td>
                    <td className="mono">{money(h.totalValue)}</td>
                    <td className={`mono ${h.pnl >= 0 ? 'pos' : 'neg'}`}>{signedMoney(h.pnl)}</td>
                    <td className={`mono ${h.pnlPercent >= 0 ? 'pos' : 'neg'}`}>{h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent?.toFixed(2)}%</td>
                    <td className="mono">{h.technical?.rsi?.value?.toFixed(1) || '—'}</td>
                    <td className={`mono ${(h.technical?.macd?.histogram || 0) >= 0 ? 'pos' : 'neg'}`}>{h.technical?.macd?.histogram?.toFixed(3) || '—'}</td>
                    <td>{rec ? <span className={`badge badge-${rec.recommendation}`}>{rec.recommendation.toUpperCase()}</span> : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => navigate(`/stock/${h.ticker}`)}>
                          <ExternalLink size={11} /> Analyze
                        </button>
                        <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => handleDelete(h.id)}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <AddModal onClose={() => setShowModal(false)} onAdd={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

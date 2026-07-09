import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, Trash2, Download, X, ExternalLink, Upload, AlertCircle, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { money, signedMoney, curSymbol } from '../currency';

function HoldingModal({ onClose, onSave, holding }) {
  const isEdit = !!holding;
  const [form, setForm] = useState(() => isEdit
    ? { ticker: holding.displayTicker || holding.ticker, shares: String(holding.shares ?? ''), avgBuyPrice: String(holding.avgBuyPrice ?? ''), purchaseDate: holding.purchaseDate || '', notes: holding.notes || '' }
    : { ticker: '', shares: '', avgBuyPrice: '', purchaseDate: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const set = (key) => (e) => { setError(''); setForm(p => ({ ...p, [key]: e.target.value })); };

  const handleSubmit = async () => {
    if (!form.ticker.trim())                                      return setError('Ticker symbol is required');
    if (!form.shares || isNaN(+form.shares) || +form.shares <= 0) return setError('Enter a valid number of shares');
    if (!form.avgBuyPrice || isNaN(+form.avgBuyPrice) || +form.avgBuyPrice <= 0) return setError('Enter a valid buy price');

    setLoading(true); setError('');
    try {
      if (isEdit) {
        await axios.put(`/api/portfolio/${holding.id}`, {
          shares:       +form.shares,
          avgBuyPrice:  +form.avgBuyPrice,
          purchaseDate: form.purchaseDate || holding.purchaseDate,
          notes:        form.notes,
        });
      } else {
        await axios.post('/api/portfolio', {
          ticker:       form.ticker.trim().toUpperCase(),
          shares:       +form.shares,
          avgBuyPrice:  +form.avgBuyPrice,
          purchaseDate: form.purchaseDate || new Date().toISOString().split('T')[0],
          notes:        form.notes,
        });
      }
      onClose();
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${isEdit ? 'save' : 'add'}. Is the server running?`);
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div className="card" style={{ width: 460, padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)' }}>{isEdit ? `Edit ${form.ticker}` : 'Add Holding'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 22 }}>×</button>
        </div>

        {isEdit && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, marginTop: -8 }}>
            Update your quantity and average buy price after buying more or selling part of the position.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label className="label">Symbol (NSE, BSE, or global) *</label>
            <input className="input" placeholder="e.g. RELIANCE, 504132, AAPL, VOD.L" value={form.ticker} onChange={set('ticker')} readOnly={isEdit}
              style={{ width: '100%', boxSizing: 'border-box', textTransform: 'uppercase', opacity: isEdit ? 0.6 : 1, cursor: isEdit ? 'not-allowed' : 'text' }} />
          </div>
          <div>
            <label className="label">Shares *</label>
            <input className="input" type="number" min="1" step="1" placeholder="100" value={form.shares} onChange={set('shares')} autoFocus={isEdit} style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label className="label">Avg Buy Price *</label>
            <input className="input" type="number" min="0" step="0.01" placeholder="2850.00" value={form.avgBuyPrice} onChange={set('avgBuyPrice')} style={{ width: '100%', boxSizing: 'border-box' }} />
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>In the stock's own currency (₹ for NSE/BSE, $ for US, etc.)</div>
          </div>
          <div>
            <label className="label">Purchase Date</label>
            <input className="input" type="date" value={form.purchaseDate} onChange={set('purchaseDate')} style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" placeholder="Long term hold..." value={form.notes} onChange={set('notes')} style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#2d0a0a', border: '1px solid #7f1d1d', borderRadius: 6, color: '#f87171', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={handleSubmit} disabled={loading} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', opacity: loading ? 0.7 : 1 }}>
            {loading ? (isEdit ? '⏳ Saving...' : '⏳ Adding...') : (isEdit ? '✓ Save Changes' : '✓ Add Holding')}
          </button>
          <button onClick={onClose} className="btn btn-ghost" disabled={loading}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Buy more / Sell / Edit — auto-computes the new weighted-average cost and keeps history.
function TradeModal({ holding, onClose, onSave }) {
  const [mode, setMode] = useState('buy');   // buy | sell | edit
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [eShares, setEShares] = useState(String(holding.shares));
  const [ePrice, setEPrice]   = useState(String(holding.avgBuyPrice));
  const [eNotes, setENotes]   = useState(holding.notes || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => { axios.get(`/api/portfolio/${holding.id}/transactions`).then(r => setHistory(r.data.transactions || [])).catch(() => {}); }, [holding.id]);

  const cur = holding.currency || 'INR';
  const q = +qty, p = +price, valid = q > 0 && p > 0;
  let preview = null;
  if (mode === 'buy' && valid) {
    const newQty = holding.shares + q;
    preview = { newQty, newAvg: (holding.shares * holding.avgBuyPrice + q * p) / newQty, cost: q * p };
  } else if (mode === 'sell' && valid) {
    const newQty = holding.shares - q;
    preview = { newQty, realized: (p - holding.avgBuyPrice) * q, proceeds: q * p, closes: newQty <= 0, over: q > holding.shares };
  }

  const submitTrade = async () => {
    if (!valid) return setError('Enter a valid quantity and price');
    if (mode === 'sell' && q > holding.shares) return setError(`You only hold ${holding.shares.toLocaleString('en-IN')} shares`);
    setLoading(true); setError('');
    try { await axios.post(`/api/portfolio/${holding.id}/transaction`, { type: mode, shares: q, price: p, date }); onClose(); onSave(); }
    catch (err) { setError(err.response?.data?.error || 'Failed — is the server running?'); setLoading(false); }
  };
  const submitEdit = async () => {
    if (!(+eShares > 0) || !(+ePrice > 0)) return setError('Enter valid shares and price');
    setLoading(true); setError('');
    try { await axios.put(`/api/portfolio/${holding.id}`, { shares: +eShares, avgBuyPrice: +ePrice, notes: eNotes }); onClose(); onSave(); }
    catch (err) { setError(err.response?.data?.error || 'Failed'); setLoading(false); }
  };

  const tab = (m, label) => (
    <button onClick={() => { setMode(m); setError(''); }} key={m}
      style={{ flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', borderRadius: 7,
        background: mode === m ? 'var(--blue)' : 'transparent', color: mode === m ? '#fff' : 'var(--text-secondary)' }}>{label}</button>
  );

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ width: 480, maxHeight: '90vh', overflowY: 'auto', padding: 26 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 17 }}>{holding.displayTicker || holding.ticker}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 22 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Holding {holding.shares.toLocaleString('en-IN')} shares · avg cost {money(holding.avgBuyPrice, cur)}
        </div>

        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-800)', border: '1px solid var(--border)', borderRadius: 9, padding: 4, marginBottom: 18 }}>
          {tab('buy', 'Buy more')}{tab('sell', 'Sell')}{tab('edit', 'Edit')}
        </div>

        {mode !== 'edit' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label className="label">Quantity *</label>
                <input className="input" type="number" min="1" step="1" placeholder="50" value={qty} onChange={e => { setError(''); setQty(e.target.value); }} autoFocus style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label className="label">{mode === 'buy' ? 'Buy' : 'Sell'} price ({curSymbol(cur).trim()}) *</label>
                <input className="input" type="number" min="0" step="0.01" placeholder="1400.00" value={price} onChange={e => { setError(''); setPrice(e.target.value); }} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="label">Date</label>
                <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>

            {preview && (
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-800)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
                {mode === 'buy' ? (
                  <>
                    <Line label="Amount invested" value={money(preview.cost, cur)} />
                    <Line label="New quantity" value={`${preview.newQty.toLocaleString('en-IN')} shares`} />
                    <Line label="New avg cost" value={money(preview.newAvg, cur)} strong />
                  </>
                ) : preview.over ? (
                  <div style={{ color: 'var(--red)' }}>You only hold {holding.shares.toLocaleString('en-IN')} shares.</div>
                ) : (
                  <>
                    <Line label="Proceeds" value={money(preview.proceeds, cur)} />
                    <Line label="Realized P&L" value={`${preview.realized >= 0 ? '+' : '-'}${money(Math.abs(preview.realized), cur)}`} color={preview.realized >= 0 ? 'var(--green)' : 'var(--red)'} strong />
                    <Line label="Remaining" value={preview.closes ? 'Position closed' : `${preview.newQty.toLocaleString('en-IN')} shares`} />
                  </>
                )}
              </div>
            )}

            {error && <div style={{ marginTop: 14, color: 'var(--red)', fontSize: 13 }}>⚠️ {error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={submitTrade} disabled={loading} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {loading ? 'Saving…' : mode === 'buy' ? 'Record buy' : 'Record sell'}
              </button>
              <button onClick={onClose} className="btn btn-ghost" disabled={loading}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Manually correct the quantity or average cost.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label className="label">Shares *</label>
                <input className="input" type="number" value={eShares} onChange={e => { setError(''); setEShares(e.target.value); }} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label className="label">Avg buy price ({curSymbol(cur).trim()}) *</label>
                <input className="input" type="number" step="0.01" value={ePrice} onChange={e => { setError(''); setEPrice(e.target.value); }} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="label">Notes</label>
                <input className="input" value={eNotes} onChange={e => setENotes(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>
            {error && <div style={{ marginTop: 14, color: 'var(--red)', fontSize: 13 }}>⚠️ {error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={submitEdit} disabled={loading} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{loading ? 'Saving…' : 'Save changes'}</button>
              <button onClick={onClose} className="btn btn-ghost" disabled={loading}>Cancel</button>
            </div>
          </>
        )}

        {history.length > 0 && (
          <div style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Trade history</div>
            {history.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 0' }}>
                <span>
                  <span style={{ fontWeight: 700, color: t.type === 'buy' ? 'var(--green)' : 'var(--red)' }}>{t.type.toUpperCase()}</span>
                  <span style={{ color: 'var(--text-secondary)' }}> {t.shares.toLocaleString('en-IN')} @ {money(t.price, cur)}</span>
                </span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {t.realized != null ? <span style={{ color: t.realized >= 0 ? 'var(--green)' : 'var(--red)' }}>{t.realized >= 0 ? '+' : '-'}{money(Math.abs(t.realized), cur)}</span> : (t.date || '')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const Line = ({ label, value, color, strong }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: strong ? 800 : 500, color: color || 'var(--text-primary)' }}>{value}</span>
  </div>
);

export default function Portfolio() {
  const [portfolio, setPortfolio] = useState(null);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveMode, setLiveMode] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [tradeHolding, setTradeHolding] = useState(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true); setError(null);
    // Portfolio loads fast and renders the table immediately.
    axios.get('/api/portfolio').then(p => {
      setPortfolio(p.data);
      setLiveMode(p.data.holdings?.some(h => h.livePrice) ?? false);
    }).catch(e => {
      setError(e?.response?.data?.error || 'Failed to load portfolio. Is the server running?');
    }).finally(() => setLoading(false));
    // Signals come from the same engine as the Report tab; loaded separately so
    // the slower fundamental scan doesn't block the table.
    axios.get('/api/recommendations').then(r => setRecs(r.data?.recommendations || [])).catch(() => setRecs([]));
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
  const byCur = portfolio.summaryByCurrency?.length ? portfolio.summaryByCurrency : [summary];
  const multiCur = byCur.length > 1;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Portfolio</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {holdings.length} positions · {byCur.map(s => money(s.totalValue, s.currency)).join(' · ')}
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

      {/* Summary bar — one row per currency (₹/$/… never mixed) */}
      {byCur.map((s) => (
        <div key={s.currency} style={{ marginBottom: 12 }}>
          {multiCur && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '2px 2px 8px' }}>{s.currency} holdings · {s.holdingCount} position{s.holdingCount !== 1 ? 's' : ''}</div>}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Value', value: money(s.totalValue, s.currency) },
          { label: 'Total P&L', value: signedMoney(s.totalPnl, s.currency), color: s.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Return', value: `${s.totalPnlPercent >= 0 ? '+' : ''}${s.totalPnlPercent}%`, color: s.totalPnlPercent >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: "Today's P&L", value: signedMoney(s.dailyPnl, s.currency), color: s.dailyPnl >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Total Invested', value: money(s.totalCost, s.currency) },
        ].map(m => (
          <div key={m.label} className="card" style={{ flex: 1, minWidth: 150, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: m.color || 'var(--text-primary)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{m.value}</div>
          </div>
        ))}
          </div>
        </div>
      ))}

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
                    <td className="mono">{money(h.avgBuyPrice, h.currency)}</td>
                    <td className="mono">
                      <div>{money(h.currentPrice, h.currency)}{!h.livePrice && <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 3 }}>est</span>}</div>
                      {h.livePrice && <div style={{ fontSize: 11, color: h.dailyChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {h.dailyChange >= 0 ? '+' : ''}{h.dailyChangePercent?.toFixed(2)}%
                      </div>}
                    </td>
                    <td className="mono">{money(h.totalValue, h.currency)}</td>
                    <td className={`mono ${h.pnl >= 0 ? 'pos' : 'neg'}`}>{signedMoney(h.pnl, h.currency)}</td>
                    <td className={`mono ${h.pnlPercent >= 0 ? 'pos' : 'neg'}`}>{h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent?.toFixed(2)}%</td>
                    <td className="mono">{h.technical?.rsi?.value?.toFixed(1) || '—'}</td>
                    <td className={`mono ${(h.technical?.macd?.histogram || 0) >= 0 ? 'pos' : 'neg'}`}>{h.technical?.macd?.histogram?.toFixed(3) || '—'}</td>
                    <td>
                      {rec ? (
                        <div style={{ position: 'relative' }} className="rec-cell">
                          <span className={`badge badge-${rec.recommendation}`}>{rec.action || rec.recommendation.toUpperCase()}</span>
                          {rec.reasons?.length > 0 && (
                            <div className="rec-tooltip">
                              <div style={{ fontWeight:700, marginBottom:6, color:'var(--text-primary)' }}>Why {rec.action || rec.recommendation.toUpperCase()}?</div>
                              {rec.reasons.map((r,i) => (
                                <div key={i} style={{ display:'flex', gap:6, alignItems:'flex-start', marginBottom:4 }}>
                                  <span style={{ color: r.type==='bullish'?'var(--green)':r.type==='bearish'?'var(--red)':'var(--amber)', flexShrink:0, fontSize:10 }}>
                                    {r.type==='bullish'?'▲':r.type==='bearish'?'▼':'◆'}
                                  </span>
                                  <span style={{ color:'var(--text-secondary)', fontSize:11 }}>{r.text}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => navigate(`/stock/${h.ticker}`)}>
                          <ExternalLink size={11} /> Analyze
                        </button>
                        <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }} title="Buy more / Sell / Edit" onClick={() => setTradeHolding(h)}>
                          <ArrowLeftRight size={11} /> Trade
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

      {showModal && <HoldingModal onClose={() => setShowModal(false)} onSave={load} />}
      {tradeHolding && <TradeModal holding={tradeHolding} onClose={() => setTradeHolding(null)} onSave={load} />}
    </div>
  );
}

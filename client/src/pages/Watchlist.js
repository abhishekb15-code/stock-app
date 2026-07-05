import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, Trash2, RefreshCw, Star, ArrowUpRight, ArrowDownRight, Target } from 'lucide-react';

const money = (v) => v != null ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const pct   = (v) => v != null ? `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '—';

function VolumeBadge({ sig }) {
  if (!sig) return null;
  const accum = sig.direction === 'accumulation';
  const c = accum ? 'var(--green)' : 'var(--red)';
  const Icon = accum ? ArrowUpRight : ArrowDownRight;
  return (
    <span title={`${sig.multiplier}× 20-day avg volume — ${sig.direction}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: c, border: `1px solid ${c}66`,
        borderRadius: 5, padding: '2px 6px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
      <Icon size={11} /> {sig.multiplier}×
    </span>
  );
}

export default function Watchlist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ticker, setTicker] = useState('');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    axios.get('/api/watchlist').then(r => setItems(r.data.items || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!ticker.trim()) return;
    setAdding(true); setErr('');
    try {
      await axios.post('/api/watchlist', {
        ticker: ticker.trim().toUpperCase(),
        targetPrice: target ? Number(target) : null,
        note: note.trim(),
      });
      setTicker(''); setTarget(''); setNote('');
      load();
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not add ticker');
    } finally { setAdding(false); }
  };

  const remove = async (id) => {
    await axios.delete(`/api/watchlist/${id}`);
    setItems(items.filter(i => i.id !== id));
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Star size={20} color="var(--blue)" /> Watchlist
        </h1>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        Target stocks you're tracking — live price, distance to your target, and unusual-volume flags.
      </p>

      {/* Add form */}
      <form onSubmit={add} className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: 16, marginBottom: 20 }}>
        <div style={{ flex: '1 1 160px' }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ticker (NSE or BSE)</label>
          <input className="input" placeholder="e.g. DMART, RELIANCE.BO, 504132" value={ticker} onChange={e => setTicker(e.target.value)} />
        </div>
        <div style={{ flex: '0 1 130px' }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Target price (₹)</label>
          <input className="input" type="number" placeholder="optional" value={target} onChange={e => setTarget(e.target.value)} />
        </div>
        <div style={{ flex: '1 1 180px' }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Note</label>
          <input className="input" placeholder="optional" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={adding} style={{ height: 38 }}>
          <Plus size={14} /> {adding ? 'Adding…' : 'Add'}
        </button>
      </form>
      {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{err}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40, gap: 6 }}>
          <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
        </div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Your watchlist is empty. Add a ticker above to start tracking it.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Ticker</th><th>Price</th><th>Change</th><th>Target</th><th>To Target</th><th>52W Range</th><th>Volume</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/stock/${i.ticker}`)}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{i.displayTicker}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{i.note || i.name}</div>
                  </td>
                  <td className="mono">{money(i.price)}</td>
                  <td className={`mono ${i.changePercent >= 0 ? 'pos' : 'neg'}`}>{pct(i.changePercent)}</td>
                  <td className="mono">{i.targetPrice ? money(i.targetPrice) : '—'}</td>
                  <td className="mono" style={{ color: i.toTargetPercent > 0 ? 'var(--green)' : i.toTargetPercent < 0 ? 'var(--red)' : undefined }}>
                    {i.toTargetPercent != null ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Target size={11} />{pct(i.toTargetPercent)}</span> : '—'}
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {i.fiftyTwoWeekLow ? `${money(i.fiftyTwoWeekLow)} – ${money(i.fiftyTwoWeekHigh)}` : '—'}
                  </td>
                  <td><VolumeBadge sig={i.volumeSignal} /></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', color: 'var(--red)' }} onClick={() => remove(i.id)} title="Remove">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

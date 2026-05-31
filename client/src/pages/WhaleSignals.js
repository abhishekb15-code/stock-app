import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Fish, Building2, BarChart2, Activity, TrendingDown, ExternalLink } from 'lucide-react';

const SIGNAL_TYPES = [
  { key: '', label: 'All Signals', icon: Fish },
  { key: 'institutional', label: 'Institutional', icon: Building2 },
  { key: 'analyst', label: 'Analyst Targets', icon: BarChart2 },
  { key: 'volume_spike', label: 'Volume Spikes', icon: Activity },
  { key: 'momentum', label: 'Momentum', icon: TrendingDown },
];

const TYPE_ICONS = { institutional: Building2, analyst: BarChart2, volume_spike: Activity, momentum: TrendingDown };
const TYPE_LABELS = { institutional: 'Institutional', analyst: 'Analyst Target', volume_spike: 'Volume Spike', momentum: 'Momentum' };

export default function WhaleSignals() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const url = filter ? `/api/whales?type=${filter}` : '/api/whales';
    axios.get(url).then(r => setSignals(r.data.signals || [])).finally(() => setLoading(false));
  }, [filter]);

  const groupedByDate = signals.reduce((acc, s) => {
    acc[s.signalDate] = acc[s.signalDate] || [];
    acc[s.signalDate].push(s);
    return acc;
  }, {});

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Whale & Institutional Signals</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Live NSE signals from portfolio volume spikes, institutional ownership, analyst targets, and momentum.</p>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {SIGNAL_TYPES.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => { setFilter(key); setLoading(true); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 8, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              background: filter === key ? 'var(--blue)' : 'var(--bg-700)',
              borderColor: filter === key ? 'var(--blue)' : 'var(--border-bright)',
              color: filter === key ? 'white' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading signals...</div>}

      {!loading && Object.keys(groupedByDate).length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No signals found for this filter.
        </div>
      )}

      {!loading && Object.entries(groupedByDate)
        .sort(([a], [b]) => new Date(b) - new Date(a))
        .map(([date, daySignals]) => (
          <div key={date} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {daySignals.map(signal => {
                const Icon = TYPE_ICONS[signal.signalType] || Fish;
                return (
                  <div key={signal.id} className="card" style={{ padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{ background: 'var(--bg-600)', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={18} color="var(--blue)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontWeight: 800, fontSize: 16, cursor: 'pointer', color: 'var(--blue)' }}
                            onClick={() => navigate(`/stock/${signal.ticker}`)}>{signal.displayTicker || signal.ticker}</span>
                          <span className={`badge badge-${signal.signalType}`}>{TYPE_LABELS[signal.signalType]}</span>
                          {signal.institutionName && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>by {signal.institutionName}</span>}
                        </div>
                        {signal.source && (
                          <a href={signal.source} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none' }}
                            onClick={e => e.stopPropagation()}>
                            <ExternalLink size={11} /> Source
                          </a>
                        )}
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {Object.entries(signal.detail).map(([k, v]) => (
                          <div key={k} style={{ background: 'var(--bg-800)', borderRadius: 6, padding: '6px 12px', fontSize: 12 }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 2, textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1').trim()}</div>
                            <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{String(v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}

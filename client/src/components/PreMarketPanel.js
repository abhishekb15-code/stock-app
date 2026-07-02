import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Sunrise, TrendingUp, TrendingDown, Minus, Sparkles, Flame } from 'lucide-react';

const pct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
const pctColor = (v) => (v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text-secondary)');

const VERDICT = {
  bullish: { color: 'var(--green)', bg: 'var(--green-dim)', Icon: TrendingUp,  label: 'Bulls in control' },
  bearish: { color: 'var(--red)',   bg: 'var(--red-dim)',   Icon: TrendingDown, label: 'Bears in control' },
  neutral: { color: '#f59e0b',      bg: '#f59e0b22',        Icon: Minus,        label: 'Sideways / mixed' },
};

const PHASE_LABEL = { 'pre-open': 'Pre-market', open: 'Market open — live', closed: 'After hours' };

export default function PreMarketPanel() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/premarket').then(r => setData(r.data)).catch(() => setFailed(true));
  }, []);

  if (failed) return null;   // never break the dashboard over this panel

  if (!data) return (
    <div className="card" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px' }}>
      <Sunrise size={16} color="var(--blue)" />
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Reading market direction…</span>
      <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
    </div>
  );

  const v = VERDICT[data.verdict.direction] || VERDICT.neutral;
  const { Icon } = v;
  const b = data.breadth;
  const hotSectors  = data.sectors.slice(0, 3);
  const coldSectors = data.sectors.slice(-2).reverse();

  return (
    <div className="card" style={{ marginBottom: 24, padding: 0, overflow: 'hidden' }}>
      {/* Verdict banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: v.bg, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sunrise size={18} color={v.color} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: v.color, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Icon size={16} /> {v.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {PHASE_LABEL[data.phase] || data.phase} · cue score {data.verdict.score > 0 ? '+' : ''}{data.verdict.score}
              {' · '}
              <b style={{ color: v.color }}>
                {data.verdict.buyersVsSellers === 'balanced' ? 'buyers ≈ sellers' : `${data.verdict.buyersVsSellers} heavy`}
              </b>
              {data.breadthIsPreviousSession && ' (prev session breadth)'}
            </div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-secondary)', textAlign: 'right' }}>
          {b.advances} advancing · {b.declines} declining <span style={{ color: 'var(--text-muted)' }}>(of {b.scanned})</span>
          <br />up-volume share {b.upVolumePct}%
        </div>
      </div>

      {/* AI narrative */}
      {data.aiNarrative && (
        <div style={{ display: 'flex', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-800)' }}>
          <Sparkles size={14} color="var(--blue)" style={{ flexShrink: 0, marginTop: 3 }} />
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>{data.aiNarrative}</div>
        </div>
      )}

      {/* Global cues strip */}
      <div style={{ display: 'flex', gap: 18, padding: '10px 20px', overflowX: 'auto', borderBottom: '1px solid var(--border)' }}>
        {data.cues.filter(c => c.ok).map(c => (
          <div key={c.id} style={{ whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.3px' }}>{c.label}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: pctColor(c.changePercent) }}>{pct(c.changePercent)}</div>
          </div>
        ))}
      </div>

      {/* Sectors + movers + your stocks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 0 }}>
        <Cell title="Sector heat">
          {hotSectors.map(s => <Row key={s.sector} left={s.sector} right={pct(s.avgChange)} rightColor={pctColor(s.avgChange)} />)}
          <div style={{ borderTop: '1px dashed var(--border)', margin: '6px 0' }} />
          {coldSectors.map(s => <Row key={s.sector} left={s.sector} right={pct(s.avgChange)} rightColor={pctColor(s.avgChange)} />)}
        </Cell>

        <Cell title="Movers">
          {data.gainers.slice(0, 3).map(g => (
            <Row key={g.ticker} left={g.displayTicker} right={pct(g.changePercent)} rightColor="var(--green)"
              onClick={() => navigate(`/stock/${g.displayTicker}`)} />
          ))}
          {data.losers.slice(0, 3).map(l => (
            <Row key={l.ticker} left={l.displayTicker} right={pct(l.changePercent)} rightColor="var(--red)"
              onClick={() => navigate(`/stock/${l.displayTicker}`)} />
          ))}
        </Cell>

        <Cell title={<span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Flame size={12} color="#f59e0b" /> Big-money volume</span>}>
          {data.volumeSpikes.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No unusual volume yet</div>}
          {data.volumeSpikes.slice(0, 5).map(s => (
            <Row key={s.ticker} left={s.ticker}
              right={`${s.multiplier}× ${s.direction === 'accumulation' ? 'buying' : 'selling'}`}
              rightColor={s.direction === 'accumulation' ? 'var(--green)' : 'var(--red)'}
              onClick={() => navigate(`/stock/${s.ticker}`)} />
          ))}
        </Cell>

        {data.yourStocks.length > 0 && (
          <Cell title="Your stocks moving">
            {data.yourStocks.slice(0, 5).map(s => (
              <Row key={s.ticker} left={`${s.ticker}${s.held ? '' : ' ☆'}`} right={pct(s.changePercent)}
                rightColor={pctColor(s.changePercent)}
                onClick={() => navigate(`/stock/${s.ticker}`)} />
            ))}
          </Cell>
        )}
      </div>
    </div>
  );
}

function Cell({ title, children }) {
  return (
    <div style={{ padding: '12px 20px', borderRight: '1px solid var(--border)', borderTop: '1px solid var(--border)', marginTop: -1 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ left, right, rightColor, onClick }) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', fontSize: 12.5, cursor: onClick ? 'pointer' : 'default' }}>
      <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</span>
      <span style={{ fontWeight: 600, color: rightColor, whiteSpace: 'nowrap' }}>{right}</span>
    </div>
  );
}

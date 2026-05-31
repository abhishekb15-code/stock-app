import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, TrendingUp, TrendingDown, BarChart2, Brain } from 'lucide-react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area
} from 'recharts';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-600)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span>{p.name}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

function InfoRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: color || 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

export default function StockDeepDive() {
  const { ticker } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeRange, setActiveRange] = useState('3M');

  useEffect(() => {
    setLoading(true);
    axios.get(`/api/stock/${ticker}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 6 }}>
      <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
    </div>
  );

  if (!data) return <div style={{ color: 'var(--red)', padding: 40 }}>Failed to load {ticker}</div>;

  const { technical, fundamentals, valuation, chartData, name, price, change, changePercent, developments } = data;
  const isPos = change >= 0;
  const titleTicker = data.displayTicker || ticker;

  // Filter chart data by range
  const rangeMap = { '1M': 22, '3M': 66, '6M': 132, '1Y': 252 };
  const displayData = chartData.slice(-(rangeMap[activeRange] || 66));

  const valuationColor = { 'Undervalued': 'var(--green)', 'Overvalued': 'var(--red)', 'Fairly Valued': 'var(--amber)' }[valuation?.score] || 'var(--text-secondary)';

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-ghost" style={{ fontSize: 12, marginBottom: 16 }} onClick={() => navigate(-1)}>
          <ArrowLeft size={13} /> Back
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800 }}>{titleTicker}</h1>
              <span style={{ background: 'var(--bg-600)', padding: '3px 10px', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>{data.sector}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>{name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{money(price)}</div>
            <div style={{ fontSize: 15, color: isPos ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>
              {isPos ? '+' : ''}{change?.toFixed(2)} ({isPos ? '+' : ''}{changePercent?.toFixed(2)}%)
            </div>
          </div>
        </div>
      </div>

      {/* Key signals row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'RSI (14)', value: technical.rsi.value.toFixed(1), sub: technical.rsi.signal, color: technical.rsi.signal === 'Overbought' ? 'var(--red)' : technical.rsi.signal === 'Oversold' ? 'var(--green)' : 'var(--amber)' },
          { label: 'Trend', value: technical.trend, sub: `EMA50: ${money(technical.ema.ema50)}`, color: technical.trend === 'Bullish' ? 'var(--green)' : 'var(--red)' },
          { label: 'MACD Signal', value: technical.macd.histogram > 0 ? 'Bullish' : 'Bearish', sub: `Hist: ${technical.macd.histogram.toFixed(3)}`, color: technical.macd.histogram > 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'SMA20', value: money(technical.sma?.sma20), sub: `SMA50: ${money(technical.sma?.sma50)}`, color: 'var(--blue)' },
          { label: 'Bollinger', value: money(technical.bollingerBands?.middle), sub: `${money(technical.bollingerBands?.lower)} - ${money(technical.bollingerBands?.upper)}`, color: 'var(--amber)' },
          { label: 'Support', value: money(technical.support), sub: 'Key level', color: 'var(--blue)' },
          { label: 'Resistance', value: money(technical.resistance), sub: 'Key level', color: 'var(--amber)' },
          { label: 'Valuation', value: valuation?.score, sub: `Fair: ${money(valuation?.fairValue)}`, color: valuationColor },
        ].map(s => (
          <div key={s.label} className="card" style={{ flex: 1, minWidth: 120, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color, margin: '4px 0 2px', fontFamily: 'var(--font-mono)' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Price Chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><BarChart2 size={16} /> Price & Moving Averages</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['1M', '3M', '6M', '1Y'].map(r => (
              <button key={r} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11, background: activeRange === r ? 'var(--bg-500)' : 'transparent', color: activeRange === r ? 'var(--text-primary)' : 'var(--text-muted)' }}
                onClick={() => setActiveRange(r)}>{r}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={displayData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${v}`} domain={['auto', 'auto']} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="close" fill="var(--blue)" fillOpacity={0.06} stroke="var(--blue)" strokeWidth={1.5} dot={false} name="Price" />
            <Line type="monotone" dataKey="ema20" stroke="#10b981" strokeWidth={1} dot={false} name="EMA 20" strokeDasharray="4 2" />
            <Line type="monotone" dataKey="ema50" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="EMA 50" />
            <Line type="monotone" dataKey="ema200" stroke="#ef4444" strokeWidth={1.5} dot={false} name="EMA 200" strokeDasharray="6 3" />
            <Line type="monotone" dataKey="sma20" stroke="#06b6d4" strokeWidth={1} dot={false} name="SMA 20" />
            <Line type="monotone" dataKey="sma50" stroke="#8b5cf6" strokeWidth={1} dot={false} name="SMA 50" />
            <Line type="monotone" dataKey="bollingerUpper" stroke="#94a3b8" strokeWidth={1} dot={false} name="BB Upper" strokeDasharray="2 3" />
            <Line type="monotone" dataKey="bollingerLower" stroke="#94a3b8" strokeWidth={1} dot={false} name="BB Lower" strokeDasharray="2 3" />
            <ReferenceLine y={technical.support} stroke="var(--blue)" strokeDasharray="4 4" strokeOpacity={0.5} />
            <ReferenceLine y={technical.resistance} stroke="var(--amber)" strokeDasharray="4 4" strokeOpacity={0.5} />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
          {[['var(--blue)', 'Price'], ['#10b981', 'EMA 20'], ['#f59e0b', 'EMA 50'], ['#ef4444', 'EMA 200'], ['#06b6d4', 'SMA 20'], ['#8b5cf6', 'SMA 50'], ['#94a3b8', 'Bollinger']].map(([c, l]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <span style={{ width: 16, height: 2, background: c, display: 'inline-block', borderRadius: 1 }} />{l}
            </span>
          ))}
        </div>
      </div>

      {/* RSI + MACD */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>RSI (14)</div>
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={displayData.filter(d => d.rsi)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} ticks={[30, 50, 70]} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={70} stroke="var(--red)" strokeDasharray="3 3" strokeOpacity={0.6} />
              <ReferenceLine y={30} stroke="var(--green)" strokeDasharray="3 3" strokeOpacity={0.6} />
              <Line type="monotone" dataKey="rsi" stroke="var(--purple)" strokeWidth={1.5} dot={false} name="RSI" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Volume</div>
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1e6).toFixed(0)}M`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="volume" fill="var(--blue)" fillOpacity={0.5} name="Volume" radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fundamentals + AI Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Fundamental Metrics</div>
          {fundamentals && Object.entries({
            'P/E Ratio': fundamentals.peRatio + 'x',
            'P/B Ratio': fundamentals.pbRatio + 'x',
            'EPS': '$' + fundamentals.eps,
            'Revenue Growth': fundamentals.revenueGrowth + '%',
            'Profit Margin': fundamentals.profitMargin + '%',
            'ROE': fundamentals.roe + '%',
            'Debt/Equity': fundamentals.debtToEquity,
            'Free Cash Flow': fundamentals.freeCashFlow,
            'Beta': fundamentals.beta,
            'Dividend Yield': fundamentals.dividendYield + '%',
          }).map(([k, v]) => <InfoRow key={k} label={k} value={v} />)}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Valuation Analysis</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, background: 'var(--bg-800)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Current Price</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{money(valuation?.currentPrice)}</div>
              </div>
              <div style={{ flex: 1, background: 'var(--bg-800)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fair Value</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: valuationColor, marginTop: 2 }}>{money(valuation?.fairValue)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={`badge badge-${valuation?.score === 'Undervalued' ? 'buy' : valuation?.score === 'Overvalued' ? 'sell' : 'hold'}`}>{valuation?.score}</span>
              <span style={{ fontSize: 13, color: valuation?.upside > 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {valuation?.upside > 0 ? '+' : ''}{valuation?.upside}% upside
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.7 }}>{valuation?.reasoning}</p>
          </div>
          <div className="card" style={{ borderLeft: '3px solid var(--blue)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
              <Brain size={15} color="var(--blue)" /> AI Analysis
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              {titleTicker} is currently trading at {money(price)}, {isPos ? 'up' : 'down'} {Math.abs(changePercent)?.toFixed(2)}% today.
              Technical indicators show {technical.trend.toLowerCase()} momentum with RSI at {technical.rsi.value.toFixed(0)} ({technical.rsi.signal}).
              The stock is {valuation?.score?.toLowerCase()} based on Yahoo Finance valuation data with {valuation?.upside > 0 ? `${valuation.upside}% upside` : `${Math.abs(valuation?.upside)}% downside`} to fair value of {money(valuation?.fairValue)}.
              Key technical levels: support at {money(technical.support)}, resistance at {money(technical.resistance)}, and Bollinger Bands from {money(technical.bollingerBands?.lower)} to {money(technical.bollingerBands?.upper)}.
            </p>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Latest Company & Industry Developments</div>
            {developments?.summary && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
                {developments.summary}
              </p>
            )}
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {(developments?.significantDevelopments || []).slice(0, 4).map(item => (
                <a key={`${item.title}-${item.date}`} href={item.link || `https://finance.yahoo.com/quote/${data.ticker}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ textDecoration: 'none', color: 'var(--text-primary)', background: 'var(--bg-800)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>{item.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    {item.publisher} · {item.date ? new Date(item.date).toLocaleDateString('en-IN') : 'Recent'}
                  </div>
                </a>
              ))}
              {(!developments?.significantDevelopments || developments.significantDevelopments.length === 0) && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No recent Yahoo Finance significant developments found for this symbol.</div>
              )}
            </div>
            <InfoRow label="Industry" value={developments?.industry || 'Unknown'} />
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 10 }}>
              {developments?.industrySummary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

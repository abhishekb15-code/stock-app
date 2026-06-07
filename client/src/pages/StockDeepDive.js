import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, Download,
         BarChart2, BookOpen, DollarSign, Users, Globe, FileText } from 'lucide-react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart, BarChart
} from 'recharts';

// ── Helpers ────────────────────────────────────────────────────────────────────
const money  = (v) => v != null ? `₹${Number(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
const pct    = (v) => v != null ? `${Number(v).toFixed(2)}%` : '—';
const fmt    = (v) => v != null ? Number(v).toLocaleString('en-IN') : '—';
const crore  = (v) => v != null ? `₹${(v/1e7).toFixed(1)} Cr` : '—';
const color  = (v) => v >= 0 ? 'var(--green)' : 'var(--red)';

const TABS = [
  { id:'overview',     label:'Overview',        icon: BarChart2  },
  { id:'earnings',     label:'Earnings',        icon: TrendingUp },
  { id:'financials',   label:'Financials',      icon: DollarSign },
  { id:'competitive',  label:'Competitive',     icon: Users      },
  { id:'sector',       label:'Sector',          icon: Globe      },
  { id:'report',       label:'Report',          icon: FileText   },
];

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color: c, wide }) {
  return (
    <div className="card" style={{ padding:'16px 20px', flex: wide ? 2 : 1, minWidth: 130 }}>
      <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:800, color: c||'var(--text-primary)', fontFamily:'var(--font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function Signal({ type, msg }) {
  const cfg = {
    bullish: { bg:'#052e16', border:'#166534', color:'#4ade80', icon:'▲' },
    bearish: { bg:'#2d0a0a', border:'#7f1d1d', color:'#f87171', icon:'▼' },
    caution: { bg:'#1c1500', border:'#78350f', color:'#fbbf24', icon:'◆' },
  }[type] || { bg:'#0f172a', border:'#1e293b', color:'#94a3b8', icon:'•' };
  return (
    <div style={{ background:cfg.bg, border:`1px solid ${cfg.border}`, borderRadius:6, padding:'8px 12px', display:'flex', gap:8, alignItems:'flex-start', marginBottom:6 }}>
      <span style={{ color:cfg.color, fontSize:11, marginTop:1, flexShrink:0 }}>{cfg.icon}</span>
      <span style={{ color:cfg.color, fontSize:12 }}>{msg}</span>
    </div>
  );
}

function SectionHeader({ children }) {
  return <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'2px', marginBottom:14, marginTop:24, paddingBottom:6, borderBottom:'1px solid var(--border)' }}>{children}</div>;
}

function DataTable({ headers, rows, highlight }) {
  return (
    <div style={{ overflowX:'auto', marginBottom:16 }}>
      <table className="data-table" style={{ width:'100%' }}>
        <thead>
          <tr>{headers.map(h => <th key={h} style={{ whiteSpace:'nowrap' }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: row._highlight ? 'var(--blue-dim)' : undefined }}>
              {row.cells.map((cell, j) => (
                <td key={j} className={j>0?'mono':''} style={{ color: cell?.color || 'var(--text-primary)', fontWeight: row._highlight&&j===0 ? 700:undefined, whiteSpace:'nowrap' }}>
                  {cell?.value ?? cell ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecommBadge({ action }) {
  const cfg = {
    'BUY MORE':{ bg:'#052e16', color:'#4ade80', border:'#166534' },
    'HOLD':    { bg:'#1c1500', color:'#fbbf24', border:'#78350f' },
    'TRIM':    { bg:'#1a1060', color:'#a78bfa', border:'#4c1d95' },
    'SELL':    { bg:'#2d0a0a', color:'#f87171', border:'#7f1d1d' },
  }[action] || { bg:'#0f172a', color:'#64748b', border:'#1e293b' };
  return (
    <span style={{ background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`, padding:'4px 12px', borderRadius:4, fontSize:12, fontWeight:800, fontFamily:'var(--font-mono)' }}>
      {action}
    </span>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--bg-600)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
      <div style={{ color:'var(--text-muted)', marginBottom:6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color:p.color||'var(--text-primary)', display:'flex', justifyContent:'space-between', gap:16 }}>
          <span>{p.name}</span><span style={{ fontFamily:'var(--font-mono)' }}>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Tab: Overview ──────────────────────────────────────────────────────────────
function OverviewTab({ stockData, holding }) {
  const { technical, fundamental } = stockData;
  const t = technical?.technical;
  const f = fundamental?.fundamentals;
  const v = fundamental?.valuation;
  const [range, setRange] = useState('3M');
  const rangeMap = { '1M':22, '3M':66, '6M':132, '1Y':252 };
  const chartData = (technical?.chartData || []).slice(-(rangeMap[range]||66));
  const isPos = (technical?.change||0) >= 0;

  return (
    <div>
      {/* Price header */}
      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:20 }}>
        <StatCard label="Current Price" value={money(technical?.price)} sub={`${isPos?'+':''}${pct(technical?.changePercent)} today`} color={isPos?'var(--green)':'var(--red)'} />
        {holding && <StatCard label="Your P&L" value={money((technical?.price - holding.avgBuyPrice)*holding.shares)} sub={`${pct(((technical?.price-holding.avgBuyPrice)/holding.avgBuyPrice)*100)} return`} color={color((technical?.price||holding.avgBuyPrice)-holding.avgBuyPrice)} />}
        <StatCard label="Fair Value" value={money(v?.fairValue)} sub={v?.score} color={{ 'Undervalued':'var(--green)', 'Overvalued':'var(--red)', 'Fairly Valued':'var(--amber)' }[v?.score]} />
        <StatCard label="Upside" value={v?.upside != null ? `${v.upside>0?'+':''}${pct(v.upside)}` : '—'} sub="Analyst target" color={v?.upside>0?'var(--green)':'var(--red)'} />
      </div>

      {/* Price chart */}
      <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:20 }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:600, fontSize:14 }}>Price Chart</span>
          <div style={{ display:'flex', gap:6 }}>
            {['1M','3M','6M','1Y'].map(r => (
              <button key={r} onClick={()=>setRange(r)} className={`btn btn-ghost`}
                style={{ padding:'4px 10px', fontSize:11, background: range===r?'var(--blue)':'transparent', color: range===r?'white':undefined }}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding:'16px', height:280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} />
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} tickFormatter={v=>`₹${v}`} domain={['auto','auto']} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="close" name="Price" stroke="#3b82f6" fill="#3b82f633" strokeWidth={2} dot={false} />
              {t?.ema?.ema20 && <Line type="monotone" dataKey="ema20" name="EMA20" stroke="#f59e0b" strokeWidth={1} dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Technical + Fundamental side by side */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        <div className="card">
          <SectionHeader>Technical Indicators</SectionHeader>
          {t ? <>
            <InfoRow label="RSI (14)" value={t.rsi?.value?.toFixed(1)||'—'} color={t.rsi?.value<30?'var(--green)':t.rsi?.value>70?'var(--red)':undefined} />
            <InfoRow label="RSI Signal" value={t.rsi?.signal||'—'} />
            <InfoRow label="MACD" value={t.macd?.macd?.toFixed(3)||'—'} color={t.macd?.macd>0?'var(--green)':'var(--red)'} />
            <InfoRow label="MACD Signal" value={t.macd?.signal?.toFixed(3)||'—'} />
            <InfoRow label="EMA 20" value={money(t.ema?.ema20)} />
            <InfoRow label="EMA 50" value={money(t.ema?.ema50)} />
            <InfoRow label="EMA 200" value={money(t.ema?.ema200)} />
            <InfoRow label="Trend" value={t.trend?.toUpperCase()||'—'} color={t.trend==='bullish'?'var(--green)':t.trend==='bearish'?'var(--red)':undefined} />
          </> : <div style={{ color:'var(--text-muted)', fontSize:13 }}>Technical data unavailable</div>}
        </div>
        <div className="card">
          <SectionHeader>Fundamentals</SectionHeader>
          {f ? <>
            <InfoRow label="P/E Ratio" value={f.peRatio||'—'} />
            <InfoRow label="P/B Ratio" value={f.pbRatio||'—'} />
            <InfoRow label="EPS (TTM)" value={f.eps != null ? `₹${f.eps}`:''||'—'} />
            <InfoRow label="ROE" value={pct(f.roe)} color={f.roe>15?'var(--green)':f.roe<8?'var(--red)':undefined} />
            <InfoRow label="Revenue Growth" value={pct(f.revenueGrowth)} color={f.revenueGrowth>0?'var(--green)':'var(--red)'} />
            <InfoRow label="Net Margin" value={pct(f.profitMargin)} color={f.profitMargin>10?'var(--green)':f.profitMargin<3?'var(--red)':undefined} />
            <InfoRow label="Debt/Equity" value={f.debtToEquity||'—'} color={f.debtToEquity>150?'var(--red)':f.debtToEquity<50?'var(--green)':undefined} />
            <InfoRow label="Market Cap" value={f.marketCap||'—'} />
          </> : <div style={{ color:'var(--text-muted)', fontSize:13 }}>Fundamental data unavailable</div>}
        </div>
      </div>

      {/* Valuation reasoning */}
      {v?.reasoning && (
        <div style={{ background:'var(--bg-800)', border:'1px solid var(--border)', borderRadius:8, padding:'14px 18px', fontSize:13, color:'var(--text-secondary)', marginBottom:16 }}>
          💡 {v.reasoning}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, color: c }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
      <span style={{ color:'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight:600, color:c||'var(--text-primary)', fontFamily:'var(--font-mono)' }}>{value||'—'}</span>
    </div>
  );
}

// ── Tab: Earnings ──────────────────────────────────────────────────────────────
function EarningsTab({ earnings }) {
  if (!earnings || earnings.dataQuality === 'unavailable') {
    return <div style={{ color:'var(--text-muted)', padding:40, textAlign:'center' }}>Earnings data unavailable for this stock</div>;
  }
  const { metrics, margins, annualStatements, quarterlyStatements, epsHistory, signals } = earnings;

  return (
    <div>
      {/* Key metrics */}
      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:20 }}>
        <StatCard label="Revenue Growth YoY" value={pct(metrics?.revenueGrowthYoY)} color={metrics?.revenueGrowthYoY>0?'var(--green)':'var(--red)'} />
        <StatCard label="Earnings Growth" value={pct(metrics?.earningsGrowth)} color={metrics?.earningsGrowth>0?'var(--green)':'var(--red)'} />
        <StatCard label="Net Margin" value={pct(metrics?.netMarginTTM)} color={metrics?.netMarginTTM>10?'var(--green)':metrics?.netMarginTTM<3?'var(--red)':undefined} />
        <StatCard label="Trailing EPS" value={metrics?.trailingEPS != null ? `₹${metrics.trailingEPS}` : '—'} />
      </div>

      {/* Signals */}
      {signals?.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <SectionHeader>Earnings Signals</SectionHeader>
          {signals.map((s,i) => <Signal key={i} {...s} />)}
        </div>
      )}

      {/* Margin trends chart */}
      {margins?.length > 0 && (
        <>
          <SectionHeader>Margin Trends</SectionHeader>
          <div className="card" style={{ padding:16, height:220, marginBottom:20 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...margins].reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" tick={{ fill:'var(--text-muted)', fontSize:10 }} />
                <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} tickFormatter={v=>`${v}%`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="grossMargin"     name="Gross Margin %"     fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="operatingMargin" name="Operating Margin %"  fill="#10b981" radius={[4,4,0,0]} />
                <Bar dataKey="netMargin"       name="Net Margin %"        fill="#8b5cf6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Annual statements */}
      {annualStatements?.length > 0 && (
        <>
          <SectionHeader>Annual Income Statement</SectionHeader>
          <DataTable
            headers={['Year','Revenue','Gross Profit','Op. Income','Net Income','EPS']}
            rows={annualStatements.map(s=>({ cells:[
              s.date,
              { value: s.revenue ? crore(s.revenue) : '—' },
              { value: s.grossProfit ? crore(s.grossProfit) : '—' },
              { value: s.operatingIncome ? crore(s.operatingIncome) : '—', color: s.operatingIncome>0?'var(--green)':'var(--red)' },
              { value: s.netIncome ? crore(s.netIncome) : '—', color: s.netIncome>0?'var(--green)':'var(--red)' },
              { value: s.eps != null ? `₹${s.eps}` : '—' },
            ]}))}
          />
        </>
      )}

      {/* EPS surprise history */}
      {epsHistory?.length > 0 && (
        <>
          <SectionHeader>EPS Surprise History</SectionHeader>
          <DataTable
            headers={['Quarter','Actual EPS','Estimate EPS','Surprise %']}
            rows={epsHistory.map(h=>({ cells:[
              h.date,
              { value: h.epsActual != null ? `₹${h.epsActual}` : '—' },
              { value: h.epsEstimate != null ? `₹${h.epsEstimate}` : '—' },
              { value: h.surprise != null ? `${h.surprise>0?'+':''}${h.surprise.toFixed(1)}%` : '—', color: h.surprise>0?'var(--green)':'var(--red)' },
            ]}))}
          />
        </>
      )}
    </div>
  );
}

// ── Tab: Financials ────────────────────────────────────────────────────────────
function FinancialsTab({ statements }) {
  if (!statements || statements.dataQuality === 'unavailable') {
    return <div style={{ color:'var(--text-muted)', padding:40, textAlign:'center' }}>Financial data unavailable for this stock</div>;
  }
  const { ratios, balanceSheet, cashflow, signals } = statements;

  return (
    <div>
      {/* Key ratios */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <StatCard label="ROE" value={pct(ratios?.roe)} color={ratios?.roe>20?'var(--green)':ratios?.roe<8?'var(--red)':undefined} />
        <StatCard label="ROA" value={pct(ratios?.roa)} />
        <StatCard label="D/E Ratio" value={ratios?.debtToEquity??'—'} color={ratios?.debtToEquity>150?'var(--red)':ratios?.debtToEquity<50?'var(--green)':undefined} />
        <StatCard label="Current Ratio" value={ratios?.currentRatio??'—'} color={ratios?.currentRatio>2?'var(--green)':ratios?.currentRatio<1?'var(--red)':undefined} />
        <StatCard label="P/B Ratio" value={ratios?.priceToBook??'—'} />
        <StatCard label="P/S Ratio" value={ratios?.priceToSales??'—'} />
        <StatCard label="EV/EBITDA" value={ratios?.evToEbitda??'—'} />
        <StatCard label="FCF Yield" value={pct(ratios?.freeCashFlowYield)} color={ratios?.freeCashFlowYield>5?'var(--green)':undefined} />
      </div>

      {/* Signals */}
      {signals?.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <SectionHeader>Financial Health Signals</SectionHeader>
          {signals.map((s,i) => <Signal key={i} {...s} />)}
        </div>
      )}

      {/* Balance sheet */}
      {balanceSheet?.length > 0 && (
        <>
          <SectionHeader>Balance Sheet</SectionHeader>
          <DataTable
            headers={['Year','Total Assets','Total Liabilities','Equity','Cash','Current Ratio']}
            rows={balanceSheet.map(s=>({ cells:[
              s.year,
              { value: s.totalAssets ? crore(s.totalAssets) : '—' },
              { value: s.totalLiabilities ? crore(s.totalLiabilities) : '—' },
              { value: s.equity ? crore(s.equity) : '—', color: s.equity>0?'var(--green)':'var(--red)' },
              { value: s.cash ? crore(s.cash) : '—' },
              { value: s.currentRatio?.toFixed(2) ?? '—', color: s.currentRatio>2?'var(--green)':s.currentRatio<1?'var(--red)':undefined },
            ]}))}
          />
        </>
      )}

      {/* Cash flow */}
      {cashflow?.length > 0 && (
        <>
          <SectionHeader>Cash Flow Statement</SectionHeader>
          <DataTable
            headers={['Year','Operating CF','Capital Expenditure','Free Cash Flow','Dividends']}
            rows={cashflow.map(s=>({ cells:[
              s.year,
              { value: s.operatingCF ? crore(s.operatingCF) : '—', color: s.operatingCF>0?'var(--green)':'var(--red)' },
              { value: s.capEx ? crore(s.capEx) : '—', color:'var(--text-muted)' },
              { value: s.freeCashFlow ? crore(s.freeCashFlow) : '—', color: s.freeCashFlow>0?'var(--green)':'var(--red)' },
              { value: s.dividendsPaid ? crore(Math.abs(s.dividendsPaid)) : '—' },
            ]}))}
          />
        </>
      )}
    </div>
  );
}

// ── Tab: Competitive ───────────────────────────────────────────────────────────
function CompetitiveTab({ competitive, ticker }) {
  if (!competitive) return <div style={{ color:'var(--text-muted)', padding:40, textAlign:'center' }}>Loading competitive analysis...</div>;
  const { comparison, rankings, summary, sector } = competitive;

  return (
    <div>
      <div style={{ background:'var(--bg-800)', border:'1px solid var(--border)', borderRadius:8, padding:'14px 18px', fontSize:13, color:'var(--text-secondary)', marginBottom:20 }}>
        📊 {summary}
      </div>

      {/* Rankings */}
      <SectionHeader>Rankings vs Peers in {sector}</SectionHeader>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 }}>
        {Object.entries(rankings).map(([metric, rank]) => (
          <div key={metric} className="card" style={{ padding:'12px 16px', textAlign:'center', minWidth:100 }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:4 }}>{metric.replace(/([A-Z])/g,' $1').trim()}</div>
            <div style={{ fontSize:18, fontWeight:800, color: rank.startsWith('1/')?'var(--green)':'var(--text-primary)' }}>{rank}</div>
          </div>
        ))}
      </div>

      {/* Peer comparison table */}
      <SectionHeader>Peer Comparison</SectionHeader>
      <DataTable
        headers={['Ticker','Name','Price','P/E','P/B','ROE','Rev Growth','Net Margin','Upside']}
        rows={(comparison||[]).map(c=>({ _highlight: c.isTarget, cells:[
          { value: c.ticker, color: c.isTarget?'var(--blue)':undefined },
          { value: c.name?.length > 18 ? c.name.slice(0,18)+'…' : c.name },
          { value: c.price ? money(c.price) : '—' },
          { value: c.pe?.toFixed(1) ?? '—', color: c.pe < 15 ? 'var(--green)' : c.pe > 40 ? 'var(--red)' : undefined },
          { value: c.pb?.toFixed(1) ?? '—' },
          { value: c.roe ? pct(c.roe) : '—', color: c.roe>20?'var(--green)':c.roe<8?'var(--red)':undefined },
          { value: c.revenueGrowth ? pct(c.revenueGrowth) : '—', color: c.revenueGrowth>0?'var(--green)':'var(--red)' },
          { value: c.netMargin ? pct(c.netMargin) : '—' },
          { value: c.upside != null ? `${c.upside>0?'+':''}${c.upside.toFixed(1)}%` : '—', color: c.upside>0?'var(--green)':'var(--red)' },
        ]}))}
      />
    </div>
  );
}

// ── Tab: Sector ────────────────────────────────────────────────────────────────
function SectorTab({ sector: sectorData, sectorName }) {
  if (!sectorData) return <div style={{ color:'var(--text-muted)', padding:40, textAlign:'center' }}>Loading sector data...</div>;
  const { peers, momentum } = sectorData;

  return (
    <div>
      {/* Momentum summary */}
      {momentum && (
        <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:20 }}>
          <StatCard label="Sector" value={sectorName||'—'} wide />
          <StatCard label="Advancing" value={momentum.advancing} color="var(--green)" />
          <StatCard label="Declining" value={momentum.declining} color="var(--red)" />
          <StatCard label="Breadth" value={pct(momentum.breadth)} color={momentum.signal==='bullish'?'var(--green)':'var(--red)'} sub={momentum.signal} />
        </div>
      )}

      {/* Peers table */}
      <SectionHeader>Sector Peers Performance</SectionHeader>
      <DataTable
        headers={['Ticker','Name','Price','Change %','P/E','Mkt Cap','52W High','52W Low']}
        rows={(peers||[]).map(p=>({ cells:[
          { value: p.ticker, color:'var(--blue)' },
          { value: p.name?.length > 20 ? p.name.slice(0,20)+'…' : p.name },
          { value: p.price ? money(p.price) : '—' },
          { value: p.change != null ? `${p.change>0?'+':''}${p.change.toFixed(2)}%` : '—', color: p.change>=0?'var(--green)':'var(--red)' },
          { value: p.pe?.toFixed(1) ?? '—' },
          { value: p.marketCap ? crore(p.marketCap) : '—' },
          { value: p.weekHigh52 ? money(p.weekHigh52) : '—' },
          { value: p.weekLow52 ? money(p.weekLow52) : '—' },
        ]}))}
      />
    </div>
  );
}

// ── Tab: Report (Portfolio) ────────────────────────────────────────────────────
function ReportTab({ report, ticker }) {
  if (!report) return <div style={{ color:'var(--text-muted)', padding:40, textAlign:'center' }}>Loading portfolio report...</div>;
  const { holdings, summary, buckets, portfolioActions } = report;
  const thisHolding = holdings?.find(h => h.ticker.replace('.NS','').replace('.BO','') === ticker?.replace('.NS','').replace('.BO',''));

  return (
    <div>
      {/* This stock's recommendation */}
      {thisHolding && (
        <div className="card" style={{ padding:24, marginBottom:20, border:`2px solid ${
          thisHolding.recommendation?.action==='BUY MORE'?'#166534':
          thisHolding.recommendation?.action==='SELL'?'#7f1d1d':'var(--border)'}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:18, fontWeight:800 }}>{thisHolding.displayTicker}</div>
              <div style={{ color:'var(--text-muted)', fontSize:12 }}>{thisHolding.name}</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <RecommBadge action={thisHolding.recommendation?.action} />
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>Score: {thisHolding.recommendation?.score}/100</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            <StatCard label="Stop Loss" value={money(thisHolding.recommendation?.stopLoss)} color="var(--red)" />
            <StatCard label="Take Profit" value={money(thisHolding.recommendation?.takeProfit)} color="var(--green)" />
            <StatCard label="P/E" value={thisHolding.keyMetrics?.pe??'—'} />
            <StatCard label="ROE" value={pct(thisHolding.keyMetrics?.roe)} />
          </div>
          {thisHolding.earningsSignals?.length > 0 && (
            <div style={{ marginTop:16 }}>
              {thisHolding.earningsSignals.map((s,i) => <Signal key={i} {...s} />)}
            </div>
          )}
        </div>
      )}

      {/* Portfolio actions */}
      {portfolioActions?.length > 0 && (
        <>
          <SectionHeader>Portfolio Actions</SectionHeader>
          <div style={{ marginBottom:20 }}>
            {portfolioActions.map((a,i) => (
              <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'10px 14px', background:'var(--bg-800)', border:'1px solid var(--border)', borderRadius:6, marginBottom:8 }}>
                <span style={{ fontSize:14 }}>{a.type==='warning'?'⚠️':a.type==='opportunity'?'💡':a.type==='risk'?'🔴':'✅'}</span>
                <span style={{ fontSize:13, color:'var(--text-secondary)' }}>{a.msg}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* All holdings recommendation table */}
      <SectionHeader>All Holdings — Recommendation Summary</SectionHeader>
      <DataTable
        headers={['Stock','Action','Score','P&L %','P/E','ROE','Stop Loss','Target']}
        rows={(holdings||[]).map(h => ({
          _highlight: h.ticker === thisHolding?.ticker,
          cells:[
            { value: h.displayTicker, color: h.ticker===thisHolding?.ticker?'var(--blue)':undefined },
            { value: h.recommendation?.action, color:
                h.recommendation?.action==='BUY MORE'?'var(--green)':
                h.recommendation?.action==='SELL'?'var(--red)':
                h.recommendation?.action==='TRIM'?'#a78bfa':'var(--amber)' },
            { value: `${h.recommendation?.score||0}/100` },
            { value: h.pnlPct != null ? `${h.pnlPct>0?'+':''}${h.pnlPct?.toFixed(1)}%` : '—', color: h.pnlPct>=0?'var(--green)':'var(--red)' },
            { value: h.keyMetrics?.pe?.toFixed(1) ?? '—' },
            { value: h.keyMetrics?.roe ? pct(h.keyMetrics.roe) : '—' },
            { value: money(h.recommendation?.stopLoss), color:'var(--red)' },
            { value: money(h.recommendation?.takeProfit), color:'var(--green)' },
          ]
        }))}
      />
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function StockDeepDive() {
  const { ticker }   = useParams();
  const navigate     = useNavigate();
  const [tab, setTab] = useState('overview');

  // State for each module
  const [stockData,   setStockData]   = useState(null);
  const [earnings,    setEarnings]    = useState(null);
  const [financials,  setFinancials]  = useState(null);
  const [competitive, setCompetitive] = useState(null);
  const [sectorData,  setSectorData]  = useState(null);
  const [report,      setReport]      = useState(null);
  const [loading,     setLoading]     = useState({});
  const [holding,     setHolding]     = useState(null);

  const setLoad = (key, val) => setLoading(p => ({ ...p, [key]: val }));

  // Load overview (fast — existing endpoint)
  useEffect(() => {
    setLoading({ overview: true });
    Promise.all([
      axios.get(`/api/stock/${ticker}`),
      axios.get('/api/portfolio'),
    ]).then(([stock, portfolio]) => {
      setStockData({ technical: stock.data, fundamental: { fundamentals: stock.data.fundamentals, valuation: stock.data.valuation, sector: stock.data.sector } });
      const h = portfolio.data.holdings?.find(h => h.ticker === ticker || h.ticker.replace('.NS','').replace('.BO','') === ticker.replace('.NS','').replace('.BO',''));
      setHolding(h);
    }).catch(e => console.error(e))
      .finally(() => setLoad('overview', false));
  }, [ticker]);

  // Lazy-load each tab on first visit
  const loadTab = useCallback(async (t) => {
    setTab(t);
    if (t === 'earnings' && !earnings) {
      setLoad('earnings', true);
      try { setEarnings((await axios.get(`/api/analysis/earnings/${ticker}`)).data); }
      catch { setEarnings({ dataQuality: 'unavailable' }); }
      finally { setLoad('earnings', false); }
    }
    if (t === 'financials' && !financials) {
      setLoad('financials', true);
      try { setFinancials((await axios.get(`/api/analysis/financials/${ticker}`)).data); }
      catch { setFinancials({ dataQuality: 'unavailable' }); }
      finally { setLoad('financials', false); }
    }
    if (t === 'competitive' && !competitive) {
      setLoad('competitive', true);
      try { setCompetitive((await axios.get(`/api/analysis/competitive/${ticker}`)).data); }
      catch { setCompetitive(null); }
      finally { setLoad('competitive', false); }
    }
    if (t === 'sector' && !sectorData) {
      setLoad('sector', true);
      const sec = stockData?.fundamental?.sector || stockData?.technical?.sector;
      if (sec) {
        try { setSectorData((await axios.get(`/api/analysis/sector/${encodeURIComponent(sec)}`)).data); }
        catch { setSectorData(null); }
      }
      setLoad('sector', false);
    }
    if (t === 'report' && !report) {
      setLoad('report', true);
      try { setReport((await axios.get('/api/analysis/report')).data); }
      catch { setReport(null); }
      finally { setLoad('report', false); }
    }
  }, [ticker, earnings, financials, competitive, sectorData, report, stockData]);

  const displayTicker = ticker.replace('.NS','').replace('.BO','');
  const isLoading = loading[tab];

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <button className="btn btn-ghost" style={{ fontSize:12, marginBottom:14 }} onClick={() => navigate(-1)}>
          <ArrowLeft size={13} /> Back
        </button>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <h1 style={{ fontSize:26, fontWeight:800 }}>{displayTicker}</h1>
              {stockData?.technical?.sector && (
                <span style={{ background:'var(--bg-600)', padding:'3px 10px', borderRadius:5, fontSize:11, color:'var(--text-muted)' }}>
                  {stockData.technical.sector}
                </span>
              )}
            </div>
            <div style={{ color:'var(--text-secondary)', fontSize:13, marginTop:2 }}>
              {stockData?.technical?.name || displayTicker}
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => { setStockData(null); setLoad('overview',true); loadTab('overview'); }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--border)', marginBottom:24, overflowX:'auto' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => loadTab(t.id)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 16px', fontSize:13, fontWeight:600,
                background:'none', border:'none', cursor:'pointer', whiteSpace:'nowrap',
                color: tab===t.id ? 'var(--blue)' : 'var(--text-muted)',
                borderBottom: tab===t.id ? '2px solid var(--blue)' : '2px solid transparent',
                marginBottom:-1 }}>
              <Icon size={13} /> {t.label}
              {loading[t.id] && <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--blue)', animation:'pulse 1s infinite', display:'inline-block' }} />}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ minHeight:400 }}>
        {isLoading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, gap:6 }}>
            <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
          </div>
        ) : (
          <>
            {tab === 'overview'    && <OverviewTab    stockData={stockData || {}} holding={holding} />}
            {tab === 'earnings'    && <EarningsTab    earnings={earnings} />}
            {tab === 'financials'  && <FinancialsTab  statements={financials} />}
            {tab === 'competitive' && <CompetitiveTab competitive={competitive} ticker={displayTicker} />}
            {tab === 'sector'      && <SectorTab      sector={sectorData} sectorName={stockData?.technical?.sector} />}
            {tab === 'report'      && <ReportTab      report={report} ticker={displayTicker} />}
          </>
        )}
      </div>
    </div>
  );
}

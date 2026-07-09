/**
 * analysisEngine.js — All data via Twelve Data (marketDataService.js)
 * No Yahoo Finance. Works on Render.
 */

const mds = require('./marketDataService');
const { getStockAnalysis, getFundamentals, normalizeSymbol, resolveSymbol, round } = require('./indianMarketData');

// Resolve a user/URL ticker to the market that has a live quote (NSE→BSE→global).
// Falls back to the Indian default if nothing resolves, so downstream modules
// degrade to their normal "unavailable" state instead of throwing.
async function toSymbol(ticker) {
  try { return await resolveSymbol(ticker); }
  catch { return normalizeSymbol(ticker); }
}
const isIndian = (sym) => sym.endsWith('.NS') || sym.endsWith('.BO');

const SECTOR_PEERS = {
  'Energy':             ['RELIANCE.NS','ONGC.NS','BPCL.NS','IOC.NS'],
  'Basic Materials':    ['JSWSTEEL.NS','TATASTEEL.NS','HINDALCO.NS','SAIL.NS'],
  'Industrials':        ['LT.NS','SIEMENS.NS','ABB.NS','BEL.NS'],
  'Consumer Cyclical':  ['MARUTI.NS','TATAMOTORS.NS','BAJAJ-AUTO.NS'],
  'Consumer Defensive': ['HINDUNILVR.NS','ITC.NS','NESTLEIND.NS'],
  'Healthcare':         ['SUNPHARMA.NS','DRREDDY.NS','CIPLA.NS','DIVISLAB.NS'],
  'Financial Services': ['HDFCBANK.NS','ICICIBANK.NS','KOTAKBANK.NS','SBIN.NS'],
  'Technology':         ['TCS.NS','INFY.NS','WIPRO.NS','HCLTECH.NS'],
  'Utilities':          ['POWERGRID.NS','NTPC.NS','TATAPOWER.NS'],
  'Real Estate':        ['DLF.NS','GODREJPROP.NS'],
  'Communication Services':['BHARTIARTL.NS'],
};

// Reference peers for global (US-listed) stocks — used when the analyzed symbol
// is not NSE/BSE so a US stock is benchmarked against US peers, not Indian ones.
const US_SECTOR_PEERS = {
  'Energy':                 ['XOM','CVX','COP','SLB'],
  'Basic Materials':        ['LIN','SHW','FCX','NEM'],
  'Industrials':            ['CAT','HON','GE','BA'],
  'Consumer Cyclical':      ['AMZN','TSLA','HD','NKE'],
  'Consumer Defensive':     ['PG','KO','PEP','WMT'],
  'Healthcare':             ['JNJ','UNH','LLY','PFE'],
  'Financial Services':     ['JPM','BAC','V','GS'],
  'Technology':             ['AAPL','MSFT','NVDA','GOOGL','META'],
  'Utilities':              ['NEE','DUK','SO'],
  'Real Estate':            ['PLD','AMT','SPG'],
  'Communication Services': ['GOOGL','META','NFLX','DIS'],
};

// Peer set for a symbol: Indian peers for .NS/.BO, US peers otherwise.
function peersFor(sym, sector) {
  const map = isIndian(sym) ? SECTOR_PEERS : US_SECTOR_PEERS;
  return map[sector] || [];
}

const crore = (v) => v && Number.isFinite(v) ? `₹${(v/1e7).toFixed(1)} Cr` : '—';

// ── Module 1: Earnings Analysis ────────────────────────────────────────────────
async function earningsAnalysis(ticker) {
  const sym     = await toSymbol(ticker);
  const display = sym.replace('.NS','').replace('.BO','');
  let result    = { ticker:sym, displayTicker:display, module:'earnings_analysis', dataQuality:'unavailable' };

  try {
    const [earningsData, incomeData, fundData] = await Promise.allSettled([
      mds.getEarnings(sym),
      mds.getIncomeStatement(sym),
      mds.getFundamentalsData(sym),
    ]);

    const earnings = earningsData.status==='fulfilled' ? earningsData.value : [];
    const income   = incomeData.status==='fulfilled'   ? incomeData.value   : { annual:[], quarterly:[] };
    const fund     = fundData.status==='fulfilled'     ? fundData.value     : {};

    // EPS history with surprise
    const epsHistory = earnings.map(e => ({
      date:        e.date,
      epsActual:   e.epsActual,
      epsEstimate: e.epsEstimate,
      surprise:    e.surprise,
    }));

    // Annual income statements (s.date is already a fiscal year number)
    const annualStatements = income.annual.map(s => ({
      date:            s.date,
      revenue:         s.revenue,
      grossProfit:     s.grossProfit,
      operatingIncome: s.operatingIncome,
      netIncome:       s.netIncome,
      eps:             s.eps,
    }));

    // Margins from annual data
    const margins = annualStatements.map(s => ({
      year:           s.date,
      grossMargin:    s.revenue && s.grossProfit     ? round((s.grossProfit/s.revenue)*100,2)     : null,
      operatingMargin:s.revenue && s.operatingIncome ? round((s.operatingIncome/s.revenue)*100,2) : null,
      netMargin:      s.revenue && s.netIncome       ? round((s.netIncome/s.revenue)*100,2)       : null,
    }));

    // Revenue growth
    let revenueGrowth = null;
    if (annualStatements.length >= 2 && annualStatements[0].revenue && annualStatements[1].revenue) {
      revenueGrowth = round(((annualStatements[0].revenue-annualStatements[1].revenue)/Math.abs(annualStatements[1].revenue))*100,2);
    }

    // Generate signals
    const signals = [];
    if (revenueGrowth > 15) signals.push({type:'bullish', msg:`Revenue grew ${revenueGrowth.toFixed(1)}% YoY — strong momentum`});
    if (revenueGrowth < 0)  signals.push({type:'bearish', msg:`Revenue declined ${Math.abs(revenueGrowth).toFixed(1)}% YoY`});
    const withSurprise = epsHistory.filter(e=>e.surprise!=null);
    const beats = withSurprise.filter(e=>e.surprise>0).length;
    if (withSurprise.length > 0) {
      const rate = (beats/withSurprise.length)*100;
      if (rate>=75) signals.push({type:'bullish', msg:`Beat EPS estimates ${beats}/${withSurprise.length} quarters (${rate.toFixed(0)}%)`});
      if (rate<50)  signals.push({type:'bearish', msg:`Missed EPS ${withSurprise.length-beats}/${withSurprise.length} quarters`});
    }
    if (fund.netMargin > 15) signals.push({type:'bullish', msg:`Net margin ${fund.netMargin.toFixed(1)}% — strong profitability`});
    if (fund.netMargin > 0 && fund.netMargin < 3) signals.push({type:'caution', msg:`Net margin ${fund.netMargin.toFixed(1)}% — thin`});

    result = {
      ...result,
      annualStatements:    annualStatements.slice(0,4),
      quarterlyStatements: income.quarterly.slice(0,8),
      epsHistory:          epsHistory.slice(0,8),
      margins:             margins.slice(0,4),
      metrics: {
        revenueGrowthYoY:   revenueGrowth,
        earningsGrowth:     fund.revenueGrowth,
        grossMarginTTM:     fund.grossMargin,
        operatingMarginTTM: fund.operatingMargin,
        netMarginTTM:       fund.netMargin,
        trailingEPS:        fund.eps,
        pegRatio:           null,
      },
      signals,
      dataQuality: annualStatements.length>0 ? 'good' : epsHistory.length>0 ? 'limited' : 'unavailable',
    };
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

// ── Module 2: Financial Statements ─────────────────────────────────────────────
async function financialStatements(ticker) {
  const sym     = await toSymbol(ticker);
  const display = sym.replace('.NS','').replace('.BO','');
  let result    = { ticker:sym, displayTicker:display, module:'financial_statements', dataQuality:'unavailable' };

  try {
    const [bsData, cfData, fundData] = await Promise.allSettled([
      mds.getBalanceSheet(sym),
      mds.getCashFlow(sym),
      mds.getFundamentalsData(sym),
    ]);

    const bs   = bsData.status==='fulfilled'   ? bsData.value   : [];
    const cf   = cfData.status==='fulfilled'   ? cfData.value   : [];
    const fund = fundData.status==='fulfilled' ? fundData.value : {};

    const ratios = {
      debtToEquity:     fund.debtToEquity,
      currentRatio:     fund.currentRatio,
      quickRatio:       null,
      roe:              fund.roe,
      roa:              fund.roa,
      freeCashFlowYield:null,
      evToEbitda:       fund.evEbitda,
      priceToBook:      fund.pbRatio,
      priceToSales:     fund.psRatio,
    };

    const signals = [];
    if (ratios.currentRatio > 2)     signals.push({type:'bullish', msg:`Current ratio ${ratios.currentRatio} — strong liquidity`});
    if (ratios.currentRatio < 1 && ratios.currentRatio) signals.push({type:'bearish', msg:`Current ratio ${ratios.currentRatio} — liquidity concern`});
    if (ratios.roe > 20)             signals.push({type:'bullish', msg:`ROE ${ratios.roe}% — excellent returns on equity`});
    if (ratios.roe < 8 && ratios.roe)signals.push({type:'caution', msg:`ROE ${ratios.roe}% — below average`});
    if (ratios.debtToEquity > 150)   signals.push({type:'bearish', msg:`D/E ${ratios.debtToEquity} — highly leveraged`});
    if (ratios.debtToEquity < 30 && ratios.debtToEquity!=null) signals.push({type:'bullish', msg:`D/E ${ratios.debtToEquity} — conservative balance sheet`});
    const positiveFCF = cf.filter(c=>c.freeCashFlow>0).length;
    if (positiveFCF===cf.length && cf.length>0) signals.push({type:'bullish', msg:`Positive free cash flow for ${cf.length} consecutive years`});

    result = { ...result, balanceSheet:bs, cashflow:cf, ratios, signals, dataQuality: bs.length>0?'good':'limited' };
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

// ── Module 3: Sector Overview ──────────────────────────────────────────────────
// market: 'india' (default) or 'global' — picks which reference peer set to show.
async function sectorOverview(sector, market = 'india') {
  const peers  = (market === 'global' ? US_SECTOR_PEERS : SECTOR_PEERS)[sector] || [];
  const result = { sector, market, module:'sector_overview', peers:[] };

  try {
    const prices = await mds.getBatchPrices(peers);
    result.peers = peers
      .filter(p => prices[p])
      .map(p => ({ ticker: p.replace('.NS','').replace('.BO',''), price: prices[p] }));
  } catch { /* empty */ }

  // Get individual quotes for more detail
  const detailed = await Promise.allSettled(
    peers.slice(0,5).map(p => mds.getQuote(p))
  );
  result.peers = detailed
    .map((r,i) => r.status==='fulfilled' ? {
      ticker:    peers[i].replace('.NS','').replace('.BO',''),
      name:      r.value.name,
      price:     round(r.value.price,2),
      change:    round(r.value.changePercent,2),
      volume:    r.value.volume,
      weekHigh52:r.value.fiftyTwoWeekHigh,
      weekLow52: r.value.fiftyTwoWeekLow,
    } : null)
    .filter(Boolean);

  const advancing = result.peers.filter(p=>p.change>0).length;
  result.momentum = result.peers.length > 0 ? {
    advancing, declining: result.peers.length-advancing,
    breadth: round((advancing/result.peers.length)*100,1),
    signal: advancing > result.peers.length/2 ? 'bullish' : 'bearish',
  } : null;

  return result;
}

// ── Module 4: Competitive Analysis ─────────────────────────────────────────────
async function competitiveAnalysis(ticker) {
  const sym    = await toSymbol(ticker);
  const fund   = await getFundamentals(sym).catch(()=>null);
  const sector = fund?.sector || 'Technology';
  // Benchmark against peers from the stock's own market (US stock → US peers).
  const peers  = peersFor(sym, sector).filter(p=>p!==sym).slice(0,4);

  const allFunds = await Promise.allSettled(
    [sym, ...peers].map(t => getFundamentals(t))
  );

  const comparison = allFunds.map((r,i) => {
    const t = [sym,...peers][i];
    const f = r.status==='fulfilled' ? r.value : null;
    return {
      ticker:       t.replace('.NS','').replace('.BO',''),
      name:         f?.name || t,
      price:        f?.valuation?.currentPrice,
      pe:           f?.fundamentals?.peRatio,
      pb:           f?.fundamentals?.pbRatio,
      roe:          f?.fundamentals?.roe,
      revenueGrowth:f?.fundamentals?.revenueGrowth,
      netMargin:    f?.fundamentals?.profitMargin,
      debtToEquity: f?.fundamentals?.debtToEquity,
      upside:       f?.valuation?.upside,
      isTarget:     t===sym,
    };
  });

  const rankings = {};
  ['pe','pb','roe','revenueGrowth','netMargin'].forEach(m => {
    const sorted = comparison.filter(c=>c[m]!=null).sort((a,b)=>
      ['pe','pb','debtToEquity'].includes(m) ? a[m]-b[m] : b[m]-a[m]);
    const rank = sorted.findIndex(c=>c.isTarget)+1;
    rankings[m] = rank>0 ? `${rank}/${sorted.length}` : 'N/A';
  });

  const target   = comparison.find(c=>c.isTarget);
  const peerData = comparison.filter(c=>!c.isTarget && c.pe);
  const peerPEAvg = peerData.length ? peerData.reduce((s,p)=>s+(p.pe||0),0)/peerData.length : null;
  const peerROEAvg= peerData.filter(p=>p.roe).length ? peerData.filter(p=>p.roe).reduce((s,p)=>s+p.roe,0)/peerData.filter(p=>p.roe).length : null;

  const summaryLines = [];
  if (target?.pe && peerPEAvg) {
    if (target.pe < peerPEAvg*0.8) summaryLines.push(`P/E discount vs peers (${round(target.pe,1)}x vs ${round(peerPEAvg,1)}x avg)`);
    else if (target.pe > peerPEAvg*1.2) summaryLines.push(`P/E premium vs peers (${round(target.pe,1)}x vs ${round(peerPEAvg,1)}x avg)`);
    else summaryLines.push(`P/E in line with peers (${round(target.pe,1)}x vs ${round(peerPEAvg,1)}x avg)`);
  }
  if (target?.roe && peerROEAvg) {
    summaryLines.push(`ROE ${round(target.roe,1)}% vs peer avg ${round(peerROEAvg,1)}%`);
  }

  return {
    ticker:sym, displayTicker:sym.replace('.NS','').replace('.BO',''),
    sector, module:'competitive_analysis',
    comparison, rankings,
    summary: summaryLines.join('. ') || 'Peer comparison data loading.',
  };
}

// ── Module 5: Full single-stock ────────────────────────────────────────────────
async function fullStockAnalysis(ticker) {
  const sym = await toSymbol(ticker);
  const [technical, fundamental, earnings, statements] = await Promise.allSettled([
    getStockAnalysis(sym),
    getFundamentals(sym),
    earningsAnalysis(sym),
    financialStatements(sym),
  ]);
  return {
    ticker: sym,
    technical:   technical.status==='fulfilled'  ? technical.value  : null,
    fundamental: fundamental.status==='fulfilled' ? fundamental.value: null,
    earnings:    earnings.status==='fulfilled'    ? earnings.value   : null,
    statements:  statements.status==='fulfilled'  ? statements.value : null,
    generatedAt: new Date().toISOString(),
  };
}

// ── Module 6: Portfolio Client Report ──────────────────────────────────────────

// Run an async fn over items with bounded concurrency (keeps the report fast
// without hammering Yahoo — avoids the all-24-holdings timeout).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      try { out[idx] = await fn(items[idx], idx); }
      catch { out[idx] = null; }
    }
  });
  await Promise.all(workers);
  return out;
}

// 5-min cache so re-opening the Report tab is instant.
let _reportCache = { key: null, ts: 0, data: null };
const REPORT_TTL = 5 * 60 * 1000;

async function clientReport(holdings) {
  const cacheKey = holdings.map(h => `${h.ticker}:${h.shares}:${h.avgBuyPrice}`).join('|');
  if (_reportCache.data && _reportCache.key === cacheKey && (Date.now() - _reportCache.ts) < REPORT_TTL) {
    return _reportCache.data;
  }

  // One batched price fetch for all holdings (shared cache), then fundamentals
  // with bounded concurrency. No per-holding OHLCV — scoring uses fundamentals,
  // valuation and P&L, which keeps the request well under the timeout.
  const priceMap = await mds.getCachedBatchPrices(holdings.map(h => h.ticker)).catch(() => ({}));
  const funds    = await mapLimit(holdings, 6, h => getFundamentals(h.ticker));

  const results = holdings.map((h, idx) => {
    const f = funds[idx];
    const currentPrice = priceMap[h.ticker] || f?.valuation?.currentPrice || h.avgBuyPrice;
    const pnl          = (currentPrice - h.avgBuyPrice) * h.shares;
    const pnlPct       = ((currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100;
    const score        = scoreHolding(null, f, null, pnlPct);
    const recommendation = scoreToRecommendation(score, pnlPct, f);

    return {
      ticker: h.ticker, displayTicker: h.ticker.replace('.NS','').replace('.BO',''),
      name:   f?.name || h.notes || h.ticker,
      sector: f?.sector || 'Unknown',
      shares: h.shares, avgBuyPrice: h.avgBuyPrice,
      currentPrice: round(currentPrice,2), pnl: round(pnl,2), pnlPct: round(pnlPct,2),
      totalValue: round(currentPrice * h.shares, 2),
      score, recommendation,
      keyMetrics: {
        pe:           f?.fundamentals?.peRatio,
        roe:          f?.fundamentals?.roe,
        revenueGrowth:f?.fundamentals?.revenueGrowth,
        netMargin:    f?.fundamentals?.profitMargin,
        debtToEquity: f?.fundamentals?.debtToEquity,
        upside:       f?.valuation?.upside,
      },
      earningsSignals: [],
      dataAvailable:   !!f,
    };
  });

  const totalValue = results.reduce((s,r)=>s+(r.totalValue||0),0);
  const totalCost  = holdings.reduce((s,h)=>s+h.avgBuyPrice*h.shares,0);
  const totalPnl   = totalValue-totalCost;

  const sectorAlloc = {};
  results.forEach(r=>{ sectorAlloc[r.sector]=(sectorAlloc[r.sector]||0)+(r.totalValue||0); });

  const portfolioActions = [];
  Object.entries(sectorAlloc).forEach(([sec,val])=>{
    const p=(val/totalValue)*100;
    if(p>35) portfolioActions.push({type:'warning',msg:`${sec} is ${round(p,1)}% of portfolio — high concentration`});
  });
  const oversold = results.filter(r=>r.keyMetrics?.rsi<30);
  if(oversold.length) portfolioActions.push({type:'opportunity',msg:`${oversold.map(r=>r.displayTicker).join(', ')} oversold (RSI<30) — potential entry`});
  const highDebt = results.filter(r=>r.keyMetrics?.debtToEquity>150);
  if(highDebt.length) portfolioActions.push({type:'risk',msg:`${highDebt.map(r=>r.displayTicker).join(', ')} — high leverage`});
  const sellCount = results.filter(r=>r.recommendation?.bucket==='sell').length;
  if(sellCount) portfolioActions.push({type:'action',msg:`${sellCount} position(s) flagged SELL — review and redeploy`});

  const report = {
    module:'client_report', generatedAt:new Date().toISOString(),
    holdings: results,
    summary:{
      totalValue:round(totalValue,2), totalCost:round(totalCost,2),
      totalPnl:round(totalPnl,2),
      totalPnlPct:totalCost?round((totalPnl/totalCost)*100,2):0,
      holdingCount:holdings.length,
      sectorAllocation:Object.entries(sectorAlloc)
        .map(([sector,value])=>({sector,value:round(value,2),pct:totalValue?round((value/totalValue)*100,1):0}))
        .sort((a,b)=>b.value-a.value),
    },
    buckets:{
      continue:results.filter(r=>r.recommendation?.bucket==='continue'),
      monitor: results.filter(r=>r.recommendation?.bucket==='monitor'),
      sell:    results.filter(r=>r.recommendation?.bucket==='sell'),
    },
    portfolioActions,
  };

  _reportCache = { key: cacheKey, ts: Date.now(), data: report };
  return report;
}

function scoreHolding(t,f,e,pnlPct) {
  let score=50;
  if(t?.technical){
    const tech=t.technical;
    if(tech.trend==='Bullish') score+=10; else score-=8;
    if(tech.rsi?.value<30)    score+=8;
    if(tech.rsi?.value>70)    score-=5;
    if(tech.macd?.histogram>0)score+=5; else score-=5;
  }
  if(f?.fundamentals){
    const fd=f.fundamentals;
    if(fd.roe>20)           score+=8;
    if(fd.roe>15)           score+=4;
    if(fd.revenueGrowth>15) score+=6;
    if(fd.revenueGrowth<0)  score-=8;
    if(fd.debtToEquity<50)  score+=5;
    if(fd.debtToEquity>150) score-=8;
    if(fd.profitMargin>15)  score+=5;
    if(fd.profitMargin<3)   score-=5;
  }
  if(f?.valuation){
    if(f.valuation.upside>20)  score+=8;
    else if(f.valuation.upside>10) score+=4;
    else if(f.valuation.upside<-15) score-=8;
  }
  if(e?.signals) e.signals.forEach(s=>{
    if(s.type==='bullish') score+=4;
    if(s.type==='bearish') score-=4;
    if(s.type==='caution') score-=2;
  });
  return Math.min(100,Math.max(0,Math.round(score)));
}

function scoreToRecommendation(score, pnlPct, f) {
  const upside = f?.valuation?.upside;
  const price  = f?.valuation?.currentPrice;
  let action='HOLD', bucket='monitor';
  if(score>=70&&upside>10)    {action='BUY MORE';bucket='continue';}
  else if(score>=60)          {action='HOLD';    bucket='continue';}
  else if(score>=45)          {action='HOLD';    bucket='monitor'; }
  else if(score<35||pnlPct<-40){action='SELL';  bucket='sell';    }
  else                        {action='TRIM';    bucket='monitor'; }

  const reasons=[];
  if(score>=70)    reasons.push({type:'bullish',text:`Strong score ${score}/100 — multiple positive signals`});
  if(score<35)     reasons.push({type:'bearish',text:`Weak score ${score}/100 — multiple risk factors`});
  if(upside>15)    reasons.push({type:'bullish',text:`${round(upside,1)}% upside to analyst target`});
  if(upside<-10)   reasons.push({type:'bearish',text:`${Math.abs(round(upside,1))}% above analyst target`});
  if(pnlPct<-30)   reasons.push({type:'bearish',text:`Down ${Math.abs(round(pnlPct,1))}% — review thesis`});
  if(pnlPct>30)    reasons.push({type:'bullish',text:`Up ${round(pnlPct,1)}% — consider partial profit`});
  if(reasons.length===0) reasons.push({type:'neutral',text:`Balanced risk/reward at current levels`});

  return {
    action, bucket, score, reasons,
    stopLoss:   price ? round(price*0.85,2) : null,
    takeProfit: price && upside>0 ? round(price*(1+upside/100),2) : price ? round(price*1.20,2) : null,
  };
}

module.exports = { earningsAnalysis, financialStatements, sectorOverview, competitiveAnalysis, fullStockAnalysis, clientReport };

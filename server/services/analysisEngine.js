/**
 * analysisEngine.js — Uses yahooFetch.js (direct HTTP, no cookies)
 * Works on Render and all cloud servers.
 */

const { fetchQuote, fetchQuoteSummary, fetchBatchQuotes } = require('./yahooFetch');
const { getStockAnalysis, getFundamentals, normalizeSymbol, round } = require('./indianMarketData');

const safe = (v) => {
  const raw = v?.raw ?? v;
  return Number.isFinite(Number(raw)) ? Number(raw) : null;
};

const SECTOR_PEERS = {
  'Energy':             ['RELIANCE.NS','ONGC.NS','BPCL.NS','IOC.NS'],
  'Basic Materials':    ['JSWSTEEL.NS','TATASTEEL.NS','HINDALCO.NS','SAIL.NS'],
  'Industrials':        ['LT.NS','SIEMENS.NS','ABB.NS','BEL.NS'],
  'Consumer Cyclical':  ['MARUTI.NS','TATAMOTORS.NS','BAJAJ-AUTO.NS','M&M.NS'],
  'Consumer Defensive': ['HINDUNILVR.NS','ITC.NS','NESTLEIND.NS','DABUR.NS'],
  'Healthcare':         ['SUNPHARMA.NS','DRREDDY.NS','CIPLA.NS','DIVISLAB.NS'],
  'Financial Services': ['HDFCBANK.NS','ICICIBANK.NS','KOTAKBANK.NS','SBIN.NS'],
  'Technology':         ['TCS.NS','INFY.NS','WIPRO.NS','HCLTECH.NS'],
  'Utilities':          ['POWERGRID.NS','NTPC.NS','TATAPOWER.NS'],
  'Real Estate':        ['DLF.NS','GODREJPROP.NS','BRIGADE.NS'],
  'Communication Services':['BHARTIARTL.NS'],
};

// ── Module 1: Earnings Analysis ────────────────────────────────────────────────
async function earningsAnalysis(ticker) {
  const sym = normalizeSymbol(ticker);
  const display = sym.replace('.NS','').replace('.BO','');
  let result = { ticker: sym, displayTicker: display, module: 'earnings_analysis', dataQuality: 'unavailable' };

  try {
    const summary = await fetchQuoteSummary(sym,
      'incomeStatementHistory,incomeStatementHistoryQuarterly,earningsHistory,earningsTrend,financialData,defaultKeyStatistics'
    );

    const annualIS = (summary.incomeStatementHistory?.incomeStatementHistory || []).map(s => ({
      date:            new Date(s.endDate?.raw ? s.endDate.raw*1000 : s.endDate).getFullYear(),
      revenue:         safe(s.totalRevenue),
      grossProfit:     safe(s.grossProfit),
      operatingIncome: safe(s.operatingIncome),
      netIncome:       safe(s.netIncome),
      ebitda:          safe(s.ebitda),
      eps:             safe(s.basicEps ?? s.dilutedEps),
    })).filter(s => s.date).slice(0,4);

    const quarterlyIS = (summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || []).map(s => ({
      date:      new Date(s.endDate?.raw ? s.endDate.raw*1000 : s.endDate)
                  .toLocaleString('default',{month:'short',year:'2-digit'}),
      revenue:   safe(s.totalRevenue),
      netIncome: safe(s.netIncome),
      eps:       safe(s.basicEps ?? s.dilutedEps),
    })).filter(s => s.date).slice(0,8);

    const epsHistory = (summary.earningsHistory?.history || []).map(h => ({
      date:        new Date(h.quarter?.raw ? h.quarter.raw*1000 : h.quarter)
                    .toLocaleDateString('en-IN',{month:'short',year:'2-digit'}),
      epsActual:   safe(h.epsActual),
      epsEstimate: safe(h.epsEstimate),
      surprise:    safe(h.surprisePercent),
    })).filter(h => h.date).slice(0,8);

    const fd = summary.financialData || {};
    const ks = summary.defaultKeyStatistics || {};

    let revenueGrowth = null;
    if (annualIS.length >= 2) {
      const [a, b] = annualIS;
      revenueGrowth = b.revenue ? round(((a.revenue-b.revenue)/Math.abs(b.revenue))*100,2) : null;
    }

    const margins = annualIS.map(s => ({
      year:           s.date,
      grossMargin:    s.revenue ? round((s.grossProfit/s.revenue)*100,2) : null,
      operatingMargin:s.revenue ? round((s.operatingIncome/s.revenue)*100,2) : null,
      netMargin:      s.revenue ? round((s.netIncome/s.revenue)*100,2) : null,
    }));

    const signals = [];
    if (revenueGrowth > 15)  signals.push({type:'bullish', msg:`Revenue grew ${revenueGrowth.toFixed(1)}% YoY`});
    if (revenueGrowth < 0)   signals.push({type:'bearish', msg:`Revenue declined ${Math.abs(revenueGrowth).toFixed(1)}% YoY`});
    const beats = epsHistory.filter(h=>h.surprise>0).length;
    if (epsHistory.length > 0) {
      const beatRate = (beats/epsHistory.length)*100;
      if (beatRate>=75) signals.push({type:'bullish', msg:`Beat EPS estimates ${beats}/${epsHistory.length} quarters`});
      if (beatRate<50)  signals.push({type:'bearish', msg:`Missed EPS estimates ${epsHistory.length-beats}/${epsHistory.length} quarters`});
    }
    if (safe(fd.profitMargins)*100 > 15) signals.push({type:'bullish', msg:`Net margin ${(safe(fd.profitMargins)*100).toFixed(1)}% — strong profitability`});
    if (safe(fd.profitMargins)*100 < 3)  signals.push({type:'caution', msg:`Net margin ${(safe(fd.profitMargins)*100).toFixed(1)}% — thin margin`});

    result = {
      ...result,
      annualStatements:    annualIS,
      quarterlyStatements: quarterlyIS,
      epsHistory,
      margins,
      metrics: {
        revenueGrowthYoY:   revenueGrowth,
        earningsGrowth:     safe(fd.earningsGrowth) != null ? round(safe(fd.earningsGrowth)*100,2) : null,
        grossMarginTTM:     safe(fd.grossMargins)   != null ? round(safe(fd.grossMargins)*100,2)   : null,
        operatingMarginTTM: safe(fd.operatingMargins)!=null ? round(safe(fd.operatingMargins)*100,2): null,
        netMarginTTM:       safe(fd.profitMargins)  != null ? round(safe(fd.profitMargins)*100,2)  : null,
        trailingEPS:        safe(ks.trailingEps),
        forwardEPS:         safe(ks.forwardEps),
        pegRatio:           safe(ks.pegRatio),
      },
      signals,
      dataQuality: annualIS.length > 0 ? 'good' : 'limited',
    };
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

// ── Module 2: Financial Statements ─────────────────────────────────────────────
async function financialStatements(ticker) {
  const sym = normalizeSymbol(ticker);
  const display = sym.replace('.NS','').replace('.BO','');
  let result = { ticker: sym, displayTicker: display, module: 'financial_statements', dataQuality: 'unavailable' };

  try {
    const summary = await fetchQuoteSummary(sym,
      'balanceSheetHistory,cashflowStatementHistory,financialData,defaultKeyStatistics'
    );

    const bs = (summary.balanceSheetHistory?.balanceSheetStatements || []).map(s => ({
      year:             new Date(s.endDate?.raw ? s.endDate.raw*1000 : s.endDate).getFullYear(),
      totalAssets:      safe(s.totalAssets),
      totalLiabilities: safe(s.totalLiab),
      equity:           safe(s.totalStockholderEquity),
      cash:             safe(s.cash),
      totalDebt:        safe(s.shortLongTermDebt ?? s.longTermDebt),
      currentRatio:     safe(s.totalCurrentAssets) && safe(s.totalCurrentLiabilities)
                          ? round(safe(s.totalCurrentAssets)/safe(s.totalCurrentLiabilities),2) : null,
    })).filter(s=>s.year).slice(0,4);

    const cf = (summary.cashflowStatementHistory?.cashflowStatements || []).map(s => ({
      year:          new Date(s.endDate?.raw ? s.endDate.raw*1000 : s.endDate).getFullYear(),
      operatingCF:   safe(s.totalCashFromOperatingActivities),
      capEx:         safe(s.capitalExpenditures),
      freeCashFlow:  safe(s.totalCashFromOperatingActivities) != null
                      ? safe(s.totalCashFromOperatingActivities) + (safe(s.capitalExpenditures)||0) : null,
      dividendsPaid: safe(s.dividendsPaid),
    })).filter(s=>s.year).slice(0,4);

    const fd = summary.financialData || {};
    const ks = summary.defaultKeyStatistics || {};

    const ratios = {
      debtToEquity:     safe(fd.debtToEquity),
      currentRatio:     safe(fd.currentRatio),
      quickRatio:       safe(fd.quickRatio),
      roe:              safe(fd.returnOnEquity)!=null ? round(safe(fd.returnOnEquity)*100,2) : null,
      roa:              safe(fd.returnOnAssets)!=null ? round(safe(fd.returnOnAssets)*100,2) : null,
      freeCashFlowYield:safe(fd.freeCashflow) && safe(ks.enterpriseValue)
                          ? round((safe(fd.freeCashflow)/safe(ks.enterpriseValue))*100,2) : null,
      evToEbitda:       safe(ks.enterpriseToEbitda),
      priceToBook:      safe(ks.priceToBook),
      priceToSales:     safe(ks.priceToSalesTrailing12Months),
    };

    const signals = [];
    if (ratios.currentRatio > 2)   signals.push({type:'bullish', msg:`Current ratio ${ratios.currentRatio} — strong liquidity`});
    if (ratios.currentRatio < 1)   signals.push({type:'bearish', msg:`Current ratio ${ratios.currentRatio} — liquidity concern`});
    if (ratios.roe > 20)           signals.push({type:'bullish', msg:`ROE ${ratios.roe}% — efficient capital allocation`});
    if (ratios.roe < 8 && ratios.roe != null) signals.push({type:'caution', msg:`ROE ${ratios.roe}% — below average returns`});
    if (ratios.debtToEquity > 150) signals.push({type:'bearish', msg:`D/E ${ratios.debtToEquity} — high leverage`});
    if (ratios.debtToEquity < 30 && ratios.debtToEquity != null) signals.push({type:'bullish', msg:`D/E ${ratios.debtToEquity} — conservative balance sheet`});

    result = { ...result, balanceSheet:bs, cashflow:cf, ratios, signals, dataQuality: bs.length>0?'good':'limited' };
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

// ── Module 3: Sector Overview ──────────────────────────────────────────────────
async function sectorOverview(sector) {
  const peers  = SECTOR_PEERS[sector] || [];
  const result = { sector, module:'sector_overview', peers:[] };

  try {
    const quotes = await fetchBatchQuotes(peers);
    for (const peer of peers) {
      const q = quotes[peer];
      if (q?.price) {
        result.peers.push({
          ticker:      peer.replace('.NS','').replace('.BO',''),
          name:        q.name,
          price:       round(q.price,2),
          change:      round(q.changePercent,2),
          marketCap:   q.marketCap,
          volume:      q.volume,
        });
      }
    }
  } catch { /* return empty peers */ }

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
  const sym  = normalizeSymbol(ticker);
  const fund = await getFundamentals(sym).catch(()=>null);
  const sector = fund?.sector || 'Technology';
  const peers  = (SECTOR_PEERS[sector]||[]).filter(p=>p!==sym).slice(0,4);

  const allTickers = [sym, ...peers];
  const quotes = await fetchBatchQuotes(allTickers).catch(()=>({}));

  const comparison = await Promise.all(allTickers.map(async t => {
    const f = t===sym ? fund : await getFundamentals(t).catch(()=>null);
    const q = quotes[t];
    return {
      ticker:       t.replace('.NS','').replace('.BO',''),
      name:         f?.name || q?.name || t,
      price:        f?.valuation?.currentPrice ?? q?.price,
      pe:           f?.fundamentals?.peRatio,
      pb:           f?.fundamentals?.pbRatio,
      roe:          f?.fundamentals?.roe,
      revenueGrowth:f?.fundamentals?.revenueGrowth,
      netMargin:    f?.fundamentals?.profitMargin,
      debtToEquity: f?.fundamentals?.debtToEquity,
      upside:       f?.valuation?.upside,
      marketCap:    q?.marketCap,
      isTarget:     t===sym,
    };
  }));

  const target   = comparison.find(c=>c.isTarget);
  const peerData = comparison.filter(c=>!c.isTarget);

  const rankings = {};
  ['pe','pb','roe','revenueGrowth','netMargin'].forEach(m => {
    const sorted = comparison.filter(c=>c[m]!=null).sort((a,b)=>
      ['pe','pb','debtToEquity'].includes(m) ? a[m]-b[m] : b[m]-a[m]);
    const rank = sorted.findIndex(c=>c.isTarget)+1;
    rankings[m] = rank>0 ? `${rank}/${sorted.length}` : 'N/A';
  });

  // Build competitive summary text
  const summaryLines = [];
  if (target?.pe && peerData.length) {
    const avg = peerData.filter(p=>p.pe).reduce((s,p)=>s+p.pe,0) / peerData.filter(p=>p.pe).length;
    if (target.pe < avg*0.8) summaryLines.push(`Trading at P/E discount vs peers (${round(target.pe,1)}x vs ${round(avg,1)}x avg)`);
    else if (target.pe > avg*1.2) summaryLines.push(`Trading at P/E premium vs peers (${round(target.pe,1)}x vs ${round(avg,1)}x avg)`);
  }
  if (target?.roe && peerData.length) {
    const avg = peerData.filter(p=>p.roe).reduce((s,p)=>s+p.roe,0) / peerData.filter(p=>p.roe).length;
    summaryLines.push(`ROE ${round(target.roe,1)}% vs peer avg ${round(avg,1)}%`);
  }

  return {
    ticker: sym, displayTicker: sym.replace('.NS','').replace('.BO',''),
    sector, module:'competitive_analysis',
    comparison, rankings,
    summary: summaryLines.join('. ') || 'Peer comparison data partially available.',
  };
}

// ── Module 5: Full single-stock analysis ───────────────────────────────────────
async function fullStockAnalysis(ticker) {
  const sym = normalizeSymbol(ticker);
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
async function clientReport(holdings) {
  const results = await Promise.all(holdings.map(async h => {
    try {
      const [tech, fund, earn] = await Promise.allSettled([
        getStockAnalysis(h.ticker),
        getFundamentals(h.ticker),
        earningsAnalysis(h.ticker),
      ]);
      const t = tech.status==='fulfilled'  ? tech.value  : null;
      const f = fund.status==='fulfilled'  ? fund.value  : null;
      const e = earn.status==='fulfilled'  ? earn.value  : null;

      const currentPrice = t?.price ?? h.avgBuyPrice;
      const pnl          = (currentPrice - h.avgBuyPrice) * h.shares;
      const pnlPct       = ((currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100;
      const score        = scoreHolding(t, f, e, pnlPct);
      const recommendation = scoreToRecommendation(score, pnlPct, f);

      return {
        ticker: h.ticker, displayTicker: h.ticker.replace('.NS','').replace('.BO',''),
        name:   f?.name || h.notes || h.ticker,
        sector: f?.sector || 'Unknown',
        shares: h.shares, avgBuyPrice: h.avgBuyPrice,
        currentPrice, pnl: round(pnl,2), pnlPct: round(pnlPct,2),
        totalValue: round(currentPrice*h.shares,2),
        score, recommendation,
        keyMetrics: {
          pe:           f?.fundamentals?.peRatio,
          roe:          f?.fundamentals?.roe,
          revenueGrowth:f?.fundamentals?.revenueGrowth,
          netMargin:    f?.fundamentals?.profitMargin,
          debtToEquity: f?.fundamentals?.debtToEquity,
          upside:       f?.valuation?.upside,
          rsi:          t?.technical?.rsi?.value,
          macdSignal:   t?.technical?.macd?.histogram > 0 ? 'bullish' : 'bearish',
        },
        earningsSignals: e?.signals || [],
      };
    } catch (err) {
      return {
        ticker: h.ticker, displayTicker: h.ticker.replace('.NS','').replace('.BO',''),
        error: err.message, recommendation:{ action:'HOLD', bucket:'monitor', reasons:[], score:50 },
        pnlPct: round(((h.avgBuyPrice-h.avgBuyPrice)/h.avgBuyPrice)*100,2),
        keyMetrics:{},
      };
    }
  }));

  const totalValue = results.reduce((s,r)=>s+(r.totalValue||0),0);
  const totalCost  = holdings.reduce((s,h)=>s+h.avgBuyPrice*h.shares,0);
  const totalPnl   = totalValue - totalCost;

  const sectorAlloc = {};
  results.forEach(r=>{ sectorAlloc[r.sector]=(sectorAlloc[r.sector]||0)+(r.totalValue||0); });

  const portfolioActions = [];
  Object.entries(sectorAlloc).forEach(([sec,val])=>{
    const p = (val/totalValue)*100;
    if (p>35) portfolioActions.push({type:'warning', msg:`${sec} is ${round(p,1)}% of portfolio — high concentration`});
  });
  const oversold = results.filter(r=>r.keyMetrics?.rsi<30 && r.recommendation?.action!=='SELL');
  if (oversold.length) portfolioActions.push({type:'opportunity', msg:`${oversold.map(r=>r.displayTicker).join(', ')} oversold (RSI<30)`});
  const highDebt = results.filter(r=>r.keyMetrics?.debtToEquity>150);
  if (highDebt.length) portfolioActions.push({type:'risk', msg:`${highDebt.map(r=>r.displayTicker).join(', ')} carry high debt`});

  return {
    module:'client_report', generatedAt: new Date().toISOString(),
    holdings: results,
    summary: {
      totalValue: round(totalValue,2), totalCost: round(totalCost,2),
      totalPnl: round(totalPnl,2),
      totalPnlPct: round((totalPnl/totalCost)*100,2),
      holdingCount: holdings.length,
      sectorAllocation: Object.entries(sectorAlloc)
        .map(([sector,value])=>({ sector, value:round(value,2), pct:round((value/totalValue)*100,1) }))
        .sort((a,b)=>b.value-a.value),
    },
    buckets: {
      continue: results.filter(r=>r.recommendation?.bucket==='continue'),
      monitor:  results.filter(r=>r.recommendation?.bucket==='monitor'),
      sell:     results.filter(r=>r.recommendation?.bucket==='sell'),
    },
    portfolioActions,
  };
}

function scoreHolding(t, f, e, pnlPct) {
  let score = 50;
  if (t?.technical) {
    const tech = t.technical;
    if (tech.trend==='Bullish')  score+=10; else score-=8;
    if (tech.rsi?.value<30)      score+=8;
    if (tech.rsi?.value>70)      score-=5;
    if (tech.macd?.histogram>0)  score+=5; else score-=5;
  }
  if (f?.fundamentals) {
    const fd = f.fundamentals;
    if (fd.roe>20)           score+=8;
    if (fd.roe>15)           score+=4;
    if (fd.revenueGrowth>15) score+=6;
    if (fd.revenueGrowth<0)  score-=8;
    if (fd.debtToEquity<50)  score+=5;
    if (fd.debtToEquity>150) score-=8;
    if (fd.profitMargin>15)  score+=5;
    if (fd.profitMargin<3)   score-=5;
  }
  if (f?.valuation) {
    if (f.valuation.upside>20)   score+=8;
    else if (f.valuation.upside>10) score+=4;
    else if (f.valuation.upside<-15) score-=8;
  }
  if (e?.signals) {
    e.signals.forEach(s=>{
      if (s.type==='bullish') score+=4;
      if (s.type==='bearish') score-=4;
      if (s.type==='caution') score-=2;
    });
  }
  return Math.min(100, Math.max(0, Math.round(score)));
}

function scoreToRecommendation(score, pnlPct, f) {
  const upside = f?.valuation?.upside;
  const price  = f?.valuation?.currentPrice;

  let action='HOLD', bucket='monitor';
  if (score>=70 && upside>10)    { action='BUY MORE'; bucket='continue'; }
  else if (score>=60)            { action='HOLD';     bucket='continue'; }
  else if (score>=45)            { action='HOLD';     bucket='monitor';  }
  else if (score<35||pnlPct<-40) { action='SELL';    bucket='sell';     }
  else                           { action='TRIM';     bucket='monitor';  }

  // Build recommendation reasons
  const reasons = [];
  if (score>=70)     reasons.push({type:'bullish', text:`Strong composite score (${score}/100) across technical and fundamental factors`});
  if (score<35)      reasons.push({type:'bearish', text:`Weak composite score (${score}/100) — multiple risk factors present`});
  if (upside>15)     reasons.push({type:'bullish', text:`${upside.toFixed(1)}% upside to analyst target price`});
  if (upside<-10)    reasons.push({type:'bearish', text:`Trading ${Math.abs(upside).toFixed(1)}% above analyst target — limited upside`});
  if (pnlPct<-30)    reasons.push({type:'bearish', text:`Position down ${Math.abs(pnlPct).toFixed(1)}% — review thesis`});
  if (pnlPct>30)     reasons.push({type:'bullish', text:`Position up ${pnlPct.toFixed(1)}% — consider taking partial profits`});

  return {
    action, bucket, score,
    reasons,
    stopLoss:   price ? round(price*0.85, 2) : null,   // 15% below current
    takeProfit: upside>0 && price ? round(price*(1+upside/100),2) : price ? round(price*1.20,2) : null,
  };
}

module.exports = { earningsAnalysis, financialStatements, sectorOverview, competitiveAnalysis, fullStockAnalysis, clientReport };

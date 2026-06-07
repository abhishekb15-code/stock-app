/**
 * analysisEngine.js
 * Comprehensive analysis engine covering:
 *   1. Earnings Analysis      — EPS, revenue, surprises, guidance
 *   2. Financial Statements   — P&L, balance sheet, cash flow ratios
 *   3. Technical Analysis     — RSI, MACD, EMA, Bollinger, trend signals
 *   4. Sector Overview        — sector momentum, breadth, rotation
 *   5. Competitive Analysis   — peer comparison, valuation vs peers
 *   6. Client Report          — portfolio-wide recommendation + scoring
 */

const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const { getStockAnalysis, getFundamentals, normalizeSymbol, round } = require('./indianMarketData');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = (v) => v != null ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';
const pct   = (v) => v != null ? `${Number(v).toFixed(2)}%` : 'N/A';
const safe  = (v, d = null) => (v != null && !isNaN(v)) ? v : d;

// NSE sector peers map — top 3 peers per sector for competitive analysis
const SECTOR_PEERS = {
  'Energy':                ['RELIANCE.NS', 'ONGC.NS', 'BPCL.NS', 'IOC.NS'],
  'Basic Materials':       ['JSWSTEEL.NS', 'TATASTEEL.NS', 'HINDALCO.NS', 'SAIL.NS'],
  'Industrials':           ['LT.NS', 'SIEMENS.NS', 'ABB.NS', 'BEL.NS'],
  'Consumer Cyclical':     ['MARUTI.NS', 'TATAMOTORS.NS', 'M&M.NS', 'BAJAJ-AUTO.NS'],
  'Consumer Defensive':    ['HINDUNILVR.NS', 'ITC.NS', 'NESTLEIND.NS', 'DABUR.NS'],
  'Healthcare':            ['SUNPHARMA.NS', 'DRREDDY.NS', 'CIPLA.NS', 'DIVISLAB.NS'],
  'Financial Services':    ['HDFCBANK.NS', 'ICICIBANK.NS', 'KOTAKBANK.NS', 'SBIN.NS'],
  'Technology':            ['TCS.NS', 'INFY.NS', 'WIPRO.NS', 'HCLTECH.NS'],
  'Utilities':             ['POWERGRID.NS', 'NTPC.NS', 'TATAPOWER.NS'],
  'Real Estate':           ['DLF.NS', 'GODREJPROP.NS', 'BRIGADE.NS'],
  'Communication Services':['BHARTIARTL.NS', 'IDEA.NS'],
};

// ─── Module 1: Earnings Analysis ──────────────────────────────────────────────

async function earningsAnalysis(ticker) {
  const sym = normalizeSymbol(ticker);
  let result = { ticker: sym, displayTicker: sym.replace('.NS','').replace('.BO',''), module: 'earnings_analysis' };

  try {
    const summary = await yf.quoteSummary(sym, {
      modules: ['incomeStatementHistory', 'incomeStatementHistoryQuarterly',
                'earningsHistory', 'earningsTrend', 'financialData', 'defaultKeyStatistics'],
    });

    // Annual income statements
    const annualIS = (summary.incomeStatementHistory?.incomeStatementHistory || []).map(s => ({
      date:            s.endDate ? new Date(s.endDate).getFullYear() : null,
      revenue:         safe(s.totalRevenue),
      grossProfit:     safe(s.grossProfit),
      operatingIncome: safe(s.operatingIncome),
      netIncome:       safe(s.netIncome),
      ebitda:          safe(s.ebitda),
      eps:             safe(s.basicEps || s.dilutedEps),
    })).filter(s => s.date);

    // Quarterly
    const quarterlyIS = (summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || []).map(s => ({
      date:       s.endDate ? `${new Date(s.endDate).toLocaleString('default',{month:'short'})} ${new Date(s.endDate).getFullYear()}` : null,
      revenue:    safe(s.totalRevenue),
      netIncome:  safe(s.netIncome),
      eps:        safe(s.basicEps || s.dilutedEps),
    })).filter(s => s.date);

    // EPS trend & surprises
    const epsTrend = (summary.earningsTrend?.trend || []).map(t => ({
      period:          t.period,
      epsEstimate:     safe(t.earningsEstimate?.avg),
      revenueEstimate: safe(t.revenueEstimate?.avg),
      growth:          safe(t.growth),
    }));

    const epsHistory = (summary.earningsHistory?.history || []).map(h => ({
      date:       h.quarter ? new Date(h.quarter).toLocaleDateString('en-IN', { month:'short', year:'2-digit' }) : null,
      epsActual:  safe(h.epsActual),
      epsEstimate:safe(h.epsEstimate),
      surprise:   safe(h.surprisePercent),
    })).filter(h => h.date);

    // Revenue growth YoY
    let revenueGrowth = null;
    if (annualIS.length >= 2) {
      const [latest, prev] = annualIS;
      revenueGrowth = prev.revenue ? round(((latest.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100, 2) : null;
    }

    // Margin trends
    const margins = annualIS.map(s => ({
      year:          s.date,
      grossMargin:   s.revenue ? round((s.grossProfit / s.revenue) * 100, 2) : null,
      operatingMargin: s.revenue ? round((s.operatingIncome / s.revenue) * 100, 2) : null,
      netMargin:     s.revenue ? round((s.netIncome / s.revenue) * 100, 2) : null,
    }));

    const fd = summary.financialData || {};
    const ks = summary.defaultKeyStatistics || {};

    result = {
      ...result,
      annualStatements:   annualIS.slice(0, 4),
      quarterlyStatements: quarterlyIS.slice(0, 8),
      epsHistory:         epsHistory.slice(0, 8),
      epsTrend,
      margins:            margins.slice(0, 4),
      metrics: {
        revenueGrowthYoY:    revenueGrowth,
        revenueGrowthQoQ:    safe(fd.revenueGrowth ? fd.revenueGrowth * 100 : null),
        earningsGrowth:      safe(fd.earningsGrowth ? fd.earningsGrowth * 100 : null),
        grossMarginTTM:      safe(fd.grossMargins ? fd.grossMargins * 100 : null),
        operatingMarginTTM:  safe(fd.operatingMargins ? fd.operatingMargins * 100 : null),
        netMarginTTM:        safe(fd.profitMargins ? fd.profitMargins * 100 : null),
        trailingEPS:         safe(ks.trailingEps),
        forwardEPS:          safe(ks.forwardEps),
        pegRatio:            safe(ks.pegRatio),
      },
      signals: deriveEarningsSignals(annualIS, epsHistory, fd),
      dataQuality: annualIS.length > 0 ? 'good' : 'limited',
    };
  } catch (err) {
    result.error = err.message;
    result.dataQuality = 'unavailable';
  }
  return result;
}

function deriveEarningsSignals(annualIS, epsHistory, fd) {
  const signals = [];
  if (annualIS.length >= 2) {
    const growth = annualIS[0].revenue && annualIS[1].revenue
      ? ((annualIS[0].revenue - annualIS[1].revenue) / Math.abs(annualIS[1].revenue)) * 100 : null;
    if (growth > 15)  signals.push({ type: 'bullish', msg: `Revenue grew ${round(growth,1)}% YoY — strong top-line momentum` });
    if (growth < 0)   signals.push({ type: 'bearish', msg: `Revenue declined ${round(Math.abs(growth),1)}% YoY — top-line pressure` });
  }
  const beats = epsHistory.filter(h => h.surprise > 0).length;
  const total  = epsHistory.length;
  if (total > 0) {
    const beatRate = (beats / total) * 100;
    if (beatRate >= 75) signals.push({ type: 'bullish', msg: `Beat EPS estimates ${beats}/${total} quarters (${round(beatRate,0)}% beat rate)` });
    if (beatRate < 50)  signals.push({ type: 'bearish', msg: `Missed EPS estimates ${total - beats}/${total} quarters` });
  }
  if (fd.earningsGrowth > 0.2) signals.push({ type: 'bullish', msg: `Earnings growth ${round(fd.earningsGrowth*100,1)}% — strong profitability trend` });
  if (fd.profitMargins > 0.15) signals.push({ type: 'bullish', msg: `Net margin ${round(fd.profitMargins*100,1)}% — above-average profitability` });
  if (fd.profitMargins < 0.03) signals.push({ type: 'caution', msg: `Net margin ${round(fd.profitMargins*100,1)}% — thin margin of safety` });
  return signals;
}

// ─── Module 2: Financial Statements ───────────────────────────────────────────

async function financialStatements(ticker) {
  const sym = normalizeSymbol(ticker);
  let result = { ticker: sym, displayTicker: sym.replace('.NS','').replace('.BO',''), module: 'financial_statements' };

  try {
    const summary = await yf.quoteSummary(sym, {
      modules: ['balanceSheetHistory', 'cashflowStatementHistory',
                'incomeStatementHistory', 'financialData', 'defaultKeyStatistics'],
    });

    const bs = (summary.balanceSheetHistory?.balanceSheetStatements || []).map(s => ({
      year:             s.endDate ? new Date(s.endDate).getFullYear() : null,
      totalAssets:      safe(s.totalAssets),
      totalLiabilities: safe(s.totalLiab),
      equity:           safe(s.totalStockholderEquity),
      cash:             safe(s.cash),
      totalDebt:        safe(s.shortLongTermDebt || s.longTermDebt),
      currentRatio:     safe(s.totalCurrentAssets) && safe(s.totalCurrentLiabilities)
                          ? round(s.totalCurrentAssets / s.totalCurrentLiabilities, 2) : null,
    })).filter(s => s.year).slice(0, 4);

    const cf = (summary.cashflowStatementHistory?.cashflowStatements || []).map(s => ({
      year:             s.endDate ? new Date(s.endDate).getFullYear() : null,
      operatingCF:      safe(s.totalCashFromOperatingActivities),
      capEx:            safe(s.capitalExpenditures),
      freeCashFlow:     safe(s.totalCashFromOperatingActivities) && safe(s.capitalExpenditures)
                          ? (s.totalCashFromOperatingActivities + (s.capitalExpenditures || 0)) : null,
      dividendsPaid:    safe(s.dividendsPaid),
    })).filter(s => s.year).slice(0, 4);

    const fd = summary.financialData || {};
    const ks = summary.defaultKeyStatistics || {};

    const ratios = {
      debtToEquity:     safe(fd.debtToEquity),
      currentRatio:     safe(fd.currentRatio),
      quickRatio:       safe(fd.quickRatio),
      roe:              fd.returnOnEquity ? round(fd.returnOnEquity * 100, 2) : null,
      roa:              fd.returnOnAssets ? round(fd.returnOnAssets * 100, 2) : null,
      freeCashFlowYield: fd.freeCashflow && ks.enterpriseValue
                          ? round((fd.freeCashflow / ks.enterpriseValue) * 100, 2) : null,
      evToEbitda:       safe(ks.enterpriseToEbitda),
      priceToBook:      safe(ks.priceToBook),
      priceToSales:     safe(ks.priceToSalesTrailing12Months),
    };

    result = {
      ...result,
      balanceSheet:  bs,
      cashflow:      cf,
      ratios,
      signals:       deriveFinancialSignals(ratios, cf),
      dataQuality:   bs.length > 0 ? 'good' : 'limited',
    };
  } catch (err) {
    result.error = err.message;
    result.dataQuality = 'unavailable';
  }
  return result;
}

function deriveFinancialSignals(ratios, cf) {
  const signals = [];
  if (ratios.currentRatio > 2)     signals.push({ type: 'bullish', msg: `Current ratio ${ratios.currentRatio} — strong short-term liquidity` });
  if (ratios.currentRatio < 1)     signals.push({ type: 'bearish', msg: `Current ratio ${ratios.currentRatio} — liquidity concern` });
  if (ratios.roe > 20)             signals.push({ type: 'bullish', msg: `ROE ${ratios.roe}% — efficient capital allocation` });
  if (ratios.roe < 8)              signals.push({ type: 'caution', msg: `ROE ${ratios.roe}% — below-average returns` });
  if (ratios.debtToEquity > 150)   signals.push({ type: 'bearish', msg: `D/E ${ratios.debtToEquity} — high leverage risk` });
  if (ratios.debtToEquity < 30)    signals.push({ type: 'bullish', msg: `D/E ${ratios.debtToEquity} — conservative balance sheet` });
  const fcfPositive = cf.filter(c => c.freeCashFlow > 0).length;
  if (fcfPositive === cf.length && cf.length > 0)
    signals.push({ type: 'bullish', msg: `Positive free cash flow for ${cf.length} consecutive years` });
  return signals;
}

// ─── Module 3: Sector Overview ────────────────────────────────────────────────

async function sectorOverview(sector) {
  const peers = SECTOR_PEERS[sector] || [];
  const result = { sector, module: 'sector_overview', peers: [] };

  for (const peer of peers.slice(0, 5)) {
    try {
      const q = await yf.quote(peer);
      result.peers.push({
        ticker:        peer.replace('.NS','').replace('.BO',''),
        name:          q.longName || q.shortName,
        price:         round(q.regularMarketPrice, 2),
        change:        round(q.regularMarketChangePercent, 2),
        marketCap:     q.marketCap,
        pe:            round(q.trailingPE, 2),
        volume:        q.regularMarketVolume,
        weekHigh52:    round(q.fiftyTwoWeekHigh, 2),
        weekLow52:     round(q.fiftyTwoWeekLow, 2),
      });
    } catch { /* skip unavailable peer */ }
  }

  // Sector momentum: % of peers above 50-day MA
  const advancing = result.peers.filter(p => p.change > 0).length;
  result.momentum = result.peers.length > 0
    ? { advancing, declining: result.peers.length - advancing,
        breadth: round((advancing / result.peers.length) * 100, 1),
        signal: advancing > result.peers.length / 2 ? 'bullish' : 'bearish' }
    : null;

  return result;
}

// ─── Module 4: Competitive Analysis ───────────────────────────────────────────

async function competitiveAnalysis(ticker) {
  const sym  = normalizeSymbol(ticker);
  const fund = await getFundamentals(sym).catch(() => null);
  const sector = fund?.sector || 'Technology';
  const peers  = (SECTOR_PEERS[sector] || []).filter(p => p !== sym).slice(0, 4);

  const stockData = [{ ticker: sym, ...fund }];
  for (const peer of peers) {
    try {
      const pFund = await getFundamentals(peer);
      stockData.push({ ticker: peer, ...pFund });
    } catch { /* skip */ }
  }

  // Build comparison table
  const comparison = stockData.map(s => ({
    ticker:       s.ticker?.replace('.NS','').replace('.BO',''),
    name:         s.name,
    price:        s.valuation?.currentPrice,
    pe:           s.fundamentals?.peRatio,
    pb:           s.fundamentals?.pbRatio,
    roe:          s.fundamentals?.roe,
    revenueGrowth:s.fundamentals?.revenueGrowth,
    netMargin:    s.fundamentals?.profitMargin,
    debtToEquity: s.fundamentals?.debtToEquity,
    upside:       s.valuation?.upside,
    marketCap:    s.fundamentals?.marketCap,
    isTarget:     s.ticker === sym,
  }));

  // Rank target vs peers on key metrics
  const target = comparison.find(c => c.isTarget);
  const peerData = comparison.filter(c => !c.isTarget);

  const rankings = {};
  ['pe','pb','roe','revenueGrowth','netMargin'].forEach(metric => {
    const vals = comparison.filter(c => c[metric] != null).sort((a,b) => {
      // Lower is better for PE/PB, higher is better for ROE/growth/margin
      return ['pe','pb','debtToEquity'].includes(metric) ? a[metric] - b[metric] : b[metric] - a[metric];
    });
    const rank = vals.findIndex(c => c.isTarget) + 1;
    rankings[metric] = rank > 0 ? `${rank}/${vals.length}` : 'N/A';
  });

  return {
    ticker:      sym,
    displayTicker: sym.replace('.NS','').replace('.BO',''),
    sector,
    module:      'competitive_analysis',
    comparison,
    rankings,
    summary:     buildCompetitiveSummary(target, peerData, rankings),
  };
}

function buildCompetitiveSummary(target, peers, rankings) {
  if (!target) return 'Insufficient data for competitive analysis.';
  const lines = [];
  if (target.pe && peers.length) {
    const peerPEAvg = peers.filter(p => p.pe).reduce((s,p) => s+p.pe, 0) / peers.filter(p=>p.pe).length;
    if (target.pe < peerPEAvg * 0.8) lines.push(`Trading at P/E discount vs peers (${round(target.pe,1)}x vs ${round(peerPEAvg,1)}x avg)`);
    if (target.pe > peerPEAvg * 1.2) lines.push(`Trading at P/E premium vs peers (${round(target.pe,1)}x vs ${round(peerPEAvg,1)}x avg)`);
  }
  if (target.roe && peers.length) {
    const peerROEAvg = peers.filter(p => p.roe).reduce((s,p) => s+p.roe, 0) / peers.filter(p=>p.roe).length;
    if (target.roe > peerROEAvg) lines.push(`ROE ${round(target.roe,1)}% above peer average (${round(peerROEAvg,1)}%)`);
    else lines.push(`ROE ${round(target.roe,1)}% below peer average (${round(peerROEAvg,1)}%)`);
  }
  return lines.join('. ') || 'Peer comparison data partially available.';
}

// ─── Module 5: Full Stock Analysis (Technical + Fundamental) ──────────────────

async function fullStockAnalysis(ticker) {
  const sym = normalizeSymbol(ticker);
  const [technical, fundamental, earnings, statements] = await Promise.allSettled([
    getStockAnalysis(sym),
    getFundamentals(sym),
    earningsAnalysis(sym),
    financialStatements(sym),
  ]);

  return {
    ticker:      sym,
    technical:   technical.status === 'fulfilled' ? technical.value : null,
    fundamental: fundamental.status === 'fulfilled' ? fundamental.value : null,
    earnings:    earnings.status === 'fulfilled' ? earnings.value : null,
    statements:  statements.status === 'fulfilled' ? statements.value : null,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Module 6: Portfolio-wide Client Report ────────────────────────────────────

async function clientReport(holdings) {
  const results = [];

  for (const h of holdings) {
    try {
      const [tech, fund, earn] = await Promise.allSettled([
        getStockAnalysis(h.ticker),
        getFundamentals(h.ticker),
        earningsAnalysis(h.ticker),
      ]);

      const t = tech.status === 'fulfilled' ? tech.value : null;
      const f = fund.status === 'fulfilled' ? fund.value : null;
      const e = earn.status === 'fulfilled' ? earn.value : null;

      const currentPrice = t?.price || h.avgBuyPrice;
      const pnl          = (currentPrice - h.avgBuyPrice) * h.shares;
      const pnlPct       = ((currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100;

      // Score 0-100 across 5 dimensions
      const score = scoreHolding(t, f, e, pnlPct);
      const recommendation = scoreToRecommendation(score, pnlPct, f);

      results.push({
        ticker:        h.ticker,
        displayTicker: h.ticker.replace('.NS','').replace('.BO',''),
        name:          f?.name || h.name || h.ticker,
        sector:        f?.sector || 'Unknown',
        shares:        h.shares,
        avgBuyPrice:   h.avgBuyPrice,
        currentPrice,
        pnl:           round(pnl, 2),
        pnlPct:        round(pnlPct, 2),
        totalValue:    round(currentPrice * h.shares, 2),
        score,
        recommendation,
        technical:     t?.technical || null,
        fundamentals:  f?.fundamentals || null,
        valuation:     f?.valuation || null,
        earningsSignals: e?.signals || [],
        keyMetrics: {
          pe:           f?.fundamentals?.peRatio,
          roe:          f?.fundamentals?.roe,
          revenueGrowth:f?.fundamentals?.revenueGrowth,
          netMargin:    f?.fundamentals?.profitMargin,
          debtToEquity: f?.fundamentals?.debtToEquity,
          upside:       f?.valuation?.upside,
          rsi:          t?.technical?.rsi?.value,
          macdSignal:   t?.technical?.macd?.signal,
        },
      });
    } catch (err) {
      results.push({
        ticker: h.ticker, displayTicker: h.ticker.replace('.NS','').replace('.BO',''),
        error: err.message, recommendation: { action: 'HOLD', bucket: 'monitor' },
      });
    }
  }

  // Portfolio summary
  const totalValue    = results.reduce((s,r) => s + (r.totalValue || 0), 0);
  const totalCost     = holdings.reduce((s,h) => s + h.avgBuyPrice * h.shares, 0);
  const totalPnl      = totalValue - totalCost;
  const sectorAlloc   = {};
  results.forEach(r => {
    sectorAlloc[r.sector] = (sectorAlloc[r.sector] || 0) + (r.totalValue || 0);
  });

  const buckets = {
    continue: results.filter(r => r.recommendation?.bucket === 'continue'),
    monitor:  results.filter(r => r.recommendation?.bucket === 'monitor'),
    sell:     results.filter(r => r.recommendation?.bucket === 'sell'),
  };

  return {
    module:     'client_report',
    generatedAt: new Date().toISOString(),
    holdings:   results,
    summary: {
      totalValue:    round(totalValue, 2),
      totalCost:     round(totalCost, 2),
      totalPnl:      round(totalPnl, 2),
      totalPnlPct:   round((totalPnl / totalCost) * 100, 2),
      holdingCount:  holdings.length,
      sectorAllocation: Object.entries(sectorAlloc).map(([sector, value]) => ({
        sector, value: round(value, 2),
        pct: round((value / totalValue) * 100, 1),
      })).sort((a,b) => b.value - a.value),
    },
    buckets,
    portfolioActions: generatePortfolioActions(results, sectorAlloc, totalValue),
  };
}

function scoreHolding(technical, fundamental, earnings, pnlPct) {
  let score = 50; // baseline

  // Technical signals (±20)
  if (technical?.technical) {
    const t = technical.technical;
    if (t.trend === 'bullish')  score += 10;
    if (t.trend === 'bearish')  score -= 10;
    if (t.rsi?.value < 30)      score += 8;  // oversold = opportunity
    if (t.rsi?.value > 70)      score -= 5;  // overbought
    if (t.macd?.histogram > 0)  score += 5;
    if (t.macd?.histogram < 0)  score -= 5;
  }

  // Fundamental signals (±25)
  if (fundamental?.fundamentals) {
    const f = fundamental.fundamentals;
    if (f.roe > 20)             score += 8;
    if (f.roe > 15)             score += 4;
    if (f.revenueGrowth > 15)   score += 6;
    if (f.revenueGrowth < 0)    score -= 8;
    if (f.debtToEquity < 50)    score += 5;
    if (f.debtToEquity > 150)   score -= 8;
    if (f.profitMargin > 15)    score += 5;
    if (f.profitMargin < 3)     score -= 5;
  }

  // Valuation (±10)
  if (fundamental?.valuation) {
    const v = fundamental.valuation;
    if (v.upside > 20)  score += 8;
    if (v.upside > 10)  score += 4;
    if (v.upside < -15) score -= 8;
  }

  // Earnings momentum (±15)
  if (earnings?.signals) {
    earnings.signals.forEach(s => {
      if (s.type === 'bullish') score += 5;
      if (s.type === 'bearish') score -= 5;
      if (s.type === 'caution') score -= 3;
    });
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

function scoreToRecommendation(score, pnlPct, fundamental) {
  let action = 'HOLD', bucket = 'monitor';
  const upside = fundamental?.valuation?.upside;

  if (score >= 70 && upside > 10)      { action = 'BUY MORE';  bucket = 'continue'; }
  else if (score >= 60)                { action = 'HOLD';       bucket = 'continue'; }
  else if (score >= 45)                { action = 'HOLD';       bucket = 'monitor';  }
  else if (score < 35 || pnlPct < -40) { action = 'SELL';      bucket = 'sell';     }
  else                                 { action = 'TRIM';       bucket = 'monitor';  }

  const stopLoss   = round(fundamental?.valuation?.currentPrice * 0.85, 2); // 15% below current
  const takeProfit = upside > 0
    ? round(fundamental?.valuation?.currentPrice * (1 + upside / 100), 2)
    : round(fundamental?.valuation?.currentPrice * 1.20, 2); // default 20% target

  return { action, bucket, score, stopLoss, takeProfit };
}

function generatePortfolioActions(results, sectorAlloc, totalValue) {
  const actions = [];

  // Concentration risk
  Object.entries(sectorAlloc).forEach(([sector, val]) => {
    const pct = (val / totalValue) * 100;
    if (pct > 40) actions.push({ type: 'warning', msg: `${sector} is ${round(pct,1)}% of portfolio — consider reducing concentration` });
  });

  // Oversold opportunities
  const oversold = results.filter(r => r.keyMetrics?.rsi < 30 && r.recommendation?.action !== 'SELL');
  if (oversold.length > 0) actions.push({ type: 'opportunity', msg: `${oversold.map(r=>r.displayTicker).join(', ')} are oversold (RSI<30) — potential entry points` });

  // High D/E warning
  const highDebt = results.filter(r => r.keyMetrics?.debtToEquity > 150);
  if (highDebt.length > 0) actions.push({ type: 'risk', msg: `${highDebt.map(r=>r.displayTicker).join(', ')} carry high debt — monitor cash flows` });

  // Cash drag
  const sellCount = results.filter(r => r.recommendation?.bucket === 'sell').length;
  if (sellCount > 0) actions.push({ type: 'action', msg: `${sellCount} position(s) flagged for exit — redeploy proceeds into BUY MORE candidates` });

  return actions;
}

module.exports = {
  earningsAnalysis,
  financialStatements,
  sectorOverview,
  competitiveAnalysis,
  fullStockAnalysis,
  clientReport,
};

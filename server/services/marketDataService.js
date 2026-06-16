/**
 * marketDataService.js
 * Single data service using Twelve Data API + Alpha Vantage fallback.
 * Both work on Render free tier. Yahoo Finance is NOT used (blocked on cloud).
 *
 * Required env vars:
 *   TWELVE_DATA_API_KEY  — free at twelvedata.com (800 calls/day)
 */

const https = require('https');

const TD_KEY = () => process.env.TWELVE_DATA_API_KEY || '';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'StockIntelligence/1.0', 'Accept': 'application/json' },
      timeout: 15000,
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function r(v, d = 2) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round(Number(v) * Math.pow(10, d)) / Math.pow(10, d);
}

// ── Twelve Data helpers ────────────────────────────────────────────────────────

function tdSymbol(ticker) {
  // Convert RELIANCE.NS -> RELIANCE:NSE, 504132.BO -> 504132:BSE
  if (ticker.endsWith('.BO')) return `${ticker.replace('.BO','')}:BSE`;
  return `${ticker.replace('.NS','')}:NSE`;
}

async function tdGet(endpoint, params = {}) {
  const key = TD_KEY();
  if (!key) throw new Error('TWELVE_DATA_API_KEY not configured');
  const qs = Object.entries({ ...params, apikey: key })
    .map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const url = `https://api.twelvedata.com/${endpoint}?${qs}`;
  const res = await httpGet(url);
  if (res.status !== 200) throw new Error(`Twelve Data HTTP ${res.status}`);
  const data = JSON.parse(res.body);
  if (data.status === 'error') throw new Error(data.message || 'Twelve Data error');
  return data;
}

// ── Core functions ─────────────────────────────────────────────────────────────

/**
 * Get real-time quote for a single ticker
 */
async function getQuote(ticker) {
  const sym = tdSymbol(ticker);
  const data = await tdGet('quote', { symbol: sym });

  const price     = parseFloat(data.close);
  const prevClose = parseFloat(data.previous_close || data.close);
  const change    = parseFloat(data.change || 0);
  const changePct = parseFloat(data.percent_change || 0);

  return {
    ticker,
    displayTicker: ticker.replace('.NS','').replace('.BO',''),
    name:          data.name || ticker,
    exchange:      data.exchange || 'NSE',
    price:         r(price),
    previousClose: r(prevClose),
    change:        r(change),
    changePercent: r(changePct),
    volume:        parseInt(data.volume) || null,
    fiftyTwoWeekHigh: r(parseFloat(data['52_week']['high'])),
    fiftyTwoWeekLow:  r(parseFloat(data['52_week']['low'])),
  };
}

/**
 * Batch get prices for multiple tickers (efficient — 1 API call per 8 symbols)
 */
async function getBatchPrices(tickers) {
  if (!tickers.length) return {};
  const symbols = tickers.map(tdSymbol).join(',');
  const data    = await tdGet('price', { symbol: symbols });

  const result = {};
  if (data.price != null) {
    // Single symbol returned as { price: "123.45" }
    result[tickers[0]] = parseFloat(data.price);
  } else {
    // Multiple symbols: { "RELIANCE:NSE": { price: "2850.00" }, ... }
    for (const [key, val] of Object.entries(data)) {
      const tick = tickers.find(t => tdSymbol(t) === key || t.replace('.NS','').replace('.BO','') === key.split(':')[0]);
      if (tick && val.price && !val.code) result[tick] = parseFloat(val.price);
    }
  }
  return result;
}

/**
 * Get OHLCV time series (historical data for charts + technical indicators)
 */
async function getTimeSeries(ticker, outputsize = 300) {
  const sym  = tdSymbol(ticker);
  const data = await tdGet('time_series', { symbol: sym, interval: '1day', outputsize });

  const values = data.values || [];
  return values.reverse().map(v => ({
    date:   v.datetime,
    open:   r(parseFloat(v.open)),
    high:   r(parseFloat(v.high)),
    low:    r(parseFloat(v.low)),
    close:  r(parseFloat(v.close)),
    volume: parseInt(v.volume) || 0,
  })).filter(v => v.close > 0);
}

/**
 * Get fundamentals / statistics for a stock
 */
async function getFundamentalsData(ticker) {
  const sym = tdSymbol(ticker);
  const [stats, profile] = await Promise.allSettled([
    tdGet('statistics', { symbol: sym }),
    tdGet('profile', { symbol: sym }),
  ]);

  const s = stats.status === 'fulfilled' ? stats.value : {};
  const p = profile.status === 'fulfilled' ? profile.value : {};

  const valu = s.valuations_metrics || {};
  const fin  = s.financials          || {};
  const inc  = fin.income_statement  || {};
  const bal  = fin.balance_sheet     || {};
  const cf   = fin.cash_flow         || {};
  const stk  = s.stock               || {};

  return {
    name:     p.name    || ticker,
    sector:   p.sector  || 'Unknown',
    industry: p.industry|| 'Unknown',
    website:  p.website || null,
    description: p.description || null,
    employees: p.employees || null,
    peRatio:        r(parseFloat(valu.trailing_pe   || 0)) || null,
    pbRatio:        r(parseFloat(valu.price_to_book || 0)) || null,
    psRatio:        r(parseFloat(valu.price_to_sales_ttm || 0)) || null,
    evEbitda:       r(parseFloat(valu.enterprise_to_ebitda || 0)) || null,
    eps:            r(parseFloat(stk.trailing_eps || 0)) || null,
    revenueGrowth:  r(parseFloat(inc.quarterly_revenue_growth || 0) * 100) || null,
    grossMargin:    r(parseFloat(fin.gross_margin || 0) * 100) || null,
    operatingMargin:r(parseFloat(fin.operating_margin || 0) * 100) || null,
    netMargin:      r(parseFloat(fin.profit_margin || 0) * 100) || null,
    roe:            r(parseFloat(fin.return_on_equity || 0) * 100) || null,
    roa:            r(parseFloat(fin.return_on_assets || 0) * 100) || null,
    debtToEquity:   r(parseFloat(bal.total_debt_to_equity || 0)) || null,
    currentRatio:   r(parseFloat(bal.current_ratio || 0)) || null,
    freeCashFlow:   parseFloat(cf.free_cashflow || 0) || null,
    marketCap:      parseFloat(stk.market_capitalization || 0) || null,
    beta:           r(parseFloat(stk.beta || 0)) || null,
    dividendYield:  r(parseFloat(stk.dividend_yield || 0) * 100) || null,
    targetPrice:    r(parseFloat(stk.one_year_target || 0)) || null,
  };
}

/**
 * Get earnings data
 */
async function getEarnings(ticker) {
  const sym = tdSymbol(ticker);
  try {
    const data = await tdGet('earnings', { symbol: sym, outputsize: 8 });
    return (data.earnings || []).map(e => ({
      date:        e.date,
      period:      e.period,
      epsActual:   r(parseFloat(e.eps_actual  || 0)),
      epsEstimate: r(parseFloat(e.eps_estimate || 0)),
      surprise:    r(parseFloat(e.surprise_pct || 0)),
      revenueActual:   parseFloat(e.revenue_actual   || 0) || null,
      revenueEstimate: parseFloat(e.revenue_estimate || 0) || null,
    }));
  } catch {
    return [];
  }
}

/**
 * Get income statement
 */
async function getIncomeStatement(ticker) {
  const sym = tdSymbol(ticker);
  try {
    const [annual, quarterly] = await Promise.allSettled([
      tdGet('income_statement', { symbol: sym, period: 'annual',    outputsize: 4 }),
      tdGet('income_statement', { symbol: sym, period: 'quarterly', outputsize: 8 }),
    ]);
    const mapIS = (items) => (items || []).map(i => ({
      date:            i.fiscal_date || i.date,
      revenue:         parseFloat(i.revenue || 0) || null,
      grossProfit:     parseFloat(i.gross_profit || 0) || null,
      operatingIncome: parseFloat(i.operating_income || 0) || null,
      netIncome:       parseFloat(i.net_income || 0) || null,
      ebitda:          parseFloat(i.ebitda || 0) || null,
      eps:             r(parseFloat(i.eps_diluted || i.eps || 0)),
    }));
    return {
      annual:    annual.status    === 'fulfilled' ? mapIS(annual.value?.income_statement)    : [],
      quarterly: quarterly.status === 'fulfilled' ? mapIS(quarterly.value?.income_statement) : [],
    };
  } catch {
    return { annual: [], quarterly: [] };
  }
}

/**
 * Get balance sheet
 */
async function getBalanceSheet(ticker) {
  const sym = tdSymbol(ticker);
  try {
    const data = await tdGet('balance_sheet', { symbol: sym, period: 'annual', outputsize: 4 });
    return (data.balance_sheet || []).map(b => ({
      date:             b.fiscal_date || b.date,
      totalAssets:      parseFloat(b.total_assets || 0) || null,
      totalLiabilities: parseFloat(b.total_liabilities || 0) || null,
      equity:           parseFloat(b.total_equity || 0) || null,
      cash:             parseFloat(b.cash_and_equivalents || 0) || null,
      totalDebt:        parseFloat(b.total_debt || 0) || null,
      currentRatio:     r(parseFloat(b.current_ratio || 0)) || null,
    }));
  } catch {
    return [];
  }
}

/**
 * Get cash flow statement
 */
async function getCashFlow(ticker) {
  const sym = tdSymbol(ticker);
  try {
    const data = await tdGet('cash_flow', { symbol: sym, period: 'annual', outputsize: 4 });
    return (data.cash_flow || []).map(c => ({
      date:          c.fiscal_date || c.date,
      operatingCF:   parseFloat(c.net_cash_from_operating_activities || 0) || null,
      capEx:         parseFloat(c.capital_expenditures || 0) || null,
      freeCashFlow:  parseFloat(c.free_cash_flow || 0) || null,
      dividendsPaid: parseFloat(c.dividends_paid || 0) || null,
    }));
  } catch {
    return [];
  }
}

/**
 * Get sector peers batch quote
 */
async function getPeerQuotes(peerTickers) {
  try {
    const prices = await getBatchPrices(peerTickers);
    return peerTickers.map(t => ({
      ticker:   t.replace('.NS','').replace('.BO',''),
      fullTicker: t,
      price:    prices[t] || null,
    })).filter(p => p.price);
  } catch {
    return [];
  }
}

module.exports = {
  getQuote, getBatchPrices, getTimeSeries,
  getFundamentalsData, getEarnings,
  getIncomeStatement, getBalanceSheet, getCashFlow,
  getPeerQuotes, tdSymbol, r,
};

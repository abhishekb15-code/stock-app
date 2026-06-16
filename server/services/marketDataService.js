/**
 * marketDataService.js
 * Multi-source price fetcher — tries sources in order until one works:
 *   1. NSE India official API (free, no auth needed)
 *   2. Stooq.com (free, no auth, works on all servers)
 *   3. Twelve Data (fallback, needs API key)
 *
 * All sources work on Render free tier.
 */

const https = require('https');
const http  = require('http');

const TD_KEY = () => process.env.TWELVE_DATA_API_KEY || '9a336f4794a244bead51fcd1edba7160';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...opts.headers,
      },
      timeout: 15000,
    }, res => {
      // Follow redirects
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        return httpGet(res.headers.location, opts).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function r(v, d = 2) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round(Number(v) * Math.pow(10, d)) / Math.pow(10, d);
}

function tdSymbol(ticker) {
  if (ticker.endsWith('.BO')) return `${ticker.replace('.BO','')}:BSE`;
  return `${ticker.replace('.NS','')}:NSE`;
}

// ── Source 1: Stooq.com ───────────────────────────────────────────────────────
// Free, no auth, works on all servers, returns CSV
async function fetchStooqPrice(ticker) {
  // Stooq symbol: RELIANCE.NS -> RELIANCE.NS (same), 504132.BO -> 504132.BO
  const sym = ticker.toLowerCase();
  const url = `https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlcv&h&e=csv`;
  const res = await httpGet(url);
  if (res.status !== 200) throw new Error(`Stooq HTTP ${res.status}`);
  const lines = res.body.trim().split('\n');
  if (lines.length < 2) throw new Error('No data from Stooq');
  const vals = lines[1].split(',');
  // CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
  const close = parseFloat(vals[6]);
  if (!close || !Number.isFinite(close)) throw new Error(`Invalid price from Stooq: ${vals[6]}`);
  return { price: close, source: 'Stooq' };
}

// ── Source 2: NSE India API ───────────────────────────────────────────────────
async function fetchNSEPrice(symbol) {
  // symbol should be like RELIANCE (no .NS)
  const url = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`;
  const res = await httpGet(url, {
    headers: {
      'Referer':    'https://www.nseindia.com',
      'Connection': 'keep-alive',
    }
  });
  if (res.status !== 200) throw new Error(`NSE HTTP ${res.status}`);
  const data  = JSON.parse(res.body);
  const price = data?.priceInfo?.lastPrice || data?.priceInfo?.closePrice;
  if (!price) throw new Error('No price from NSE');
  return { price: parseFloat(price), source: 'NSE' };
}

// ── Source 3: Twelve Data ─────────────────────────────────────────────────────
async function fetchTwelveDataBatch(tickers) {
  const key = TD_KEY();
  if (!key) throw new Error('No Twelve Data key');
  const symbols = tickers.map(tdSymbol).join(',');
  const url     = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbols)}&apikey=${key}`;
  const res     = await httpGet(url);
  if (res.status !== 200) throw new Error(`Twelve Data HTTP ${res.status}`);
  const data    = JSON.parse(res.body);
  if (data.status === 'error') throw new Error(data.message);

  const result = {};
  if (data.price != null) {
    result[tickers[0]] = parseFloat(data.price);
  } else {
    for (const [key, val] of Object.entries(data)) {
      if (!val?.price || val.code) continue;
      const base    = key.split(':')[0];
      const matched = tickers.find(t => t.replace('.NS','').replace('.BO','') === base);
      if (matched) result[matched] = parseFloat(val.price);
    }
  }
  return result;
}

// ── Source 4: Yahoo Finance v7 (sometimes works) ─────────────────────────────
async function fetchYahooBatch(tickers) {
  const symbols = tickers.join(',');
  const url     = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice`;
  const res     = await httpGet(url);
  if (res.status !== 200) throw new Error(`Yahoo HTTP ${res.status}`);
  const quotes  = JSON.parse(res.body)?.quoteResponse?.result || [];
  const result  = {};
  quotes.forEach(q => {
    if (q.regularMarketPrice) result[q.symbol] = q.regularMarketPrice;
  });
  return result;
}

// ── Main batch price fetcher — tries all sources ───────────────────────────────
async function getBatchPrices(tickers) {
  if (!tickers.length) return {};

  console.log(`💹 Fetching prices for ${tickers.length} stocks...`);

  // Try Twelve Data first (batch, fast)
  try {
    const BATCH = 8;
    const result = {};
    for (let i = 0; i < tickers.length; i += BATCH) {
      const batch = tickers.slice(i, i + BATCH);
      const prices = await fetchTwelveDataBatch(batch);
      Object.assign(result, prices);
      if (i + BATCH < tickers.length) await sleep(2000);
    }
    if (Object.keys(result).length > 0) {
      console.log(`✅ Twelve Data: ${Object.keys(result).length}/${tickers.length} prices`);
      return result;
    }
  } catch (err) {
    console.warn(`⚠️  Twelve Data failed: ${err.message}`);
  }

  // Try Yahoo Finance batch
  try {
    const result = await fetchYahooBatch(tickers);
    if (Object.keys(result).length > 0) {
      console.log(`✅ Yahoo Finance: ${Object.keys(result).length}/${tickers.length} prices`);
      return result;
    }
  } catch (err) {
    console.warn(`⚠️  Yahoo batch failed: ${err.message}`);
  }

  // Try Stooq one-by-one (slower but reliable)
  console.log('🔄 Trying Stooq per-stock...');
  const result = {};
  for (const ticker of tickers) {
    try {
      const { price } = await fetchStooqPrice(ticker);
      result[ticker] = price;
    } catch { /* skip */ }
    await sleep(200); // small delay
  }
  if (Object.keys(result).length > 0) {
    console.log(`✅ Stooq: ${Object.keys(result).length}/${tickers.length} prices`);
    return result;
  }

  console.warn('❌ All price sources failed');
  return {};
}

// ── Single quote ──────────────────────────────────────────────────────────────
async function getQuote(ticker) {
  const prices = await getBatchPrices([ticker]);
  const price  = prices[ticker];
  if (!price) throw new Error(`No price available for ${ticker}`);
  return {
    ticker,
    displayTicker: ticker.replace('.NS','').replace('.BO',''),
    name:    ticker.replace('.NS','').replace('.BO',''),
    exchange:'NSE',
    price:   r(price),
    previousClose: r(price),
    change:        0,
    changePercent: 0,
    volume:  null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow:  null,
  };
}

// ── Time series (Stooq CSV — works everywhere) ────────────────────────────────
async function getTimeSeries(ticker, outputsize = 300) {
  try {
    const sym = ticker.toLowerCase();
    const url = `https://stooq.com/q/d/l/?s=${sym}&i=d`;
    const res = await httpGet(url);
    if (res.status !== 200) throw new Error(`Stooq HTTP ${res.status}`);
    const lines = res.body.trim().split('\n').filter(Boolean);
    if (lines.length < 2) throw new Error('No historical data');
    // CSV: Date,Open,High,Low,Close,Volume
    return lines.slice(1).slice(-outputsize).map(line => {
      const [date, open, high, low, close, volume] = line.split(',');
      return {
        date, open: r(+open), high: r(+high), low: r(+low),
        close: r(+close), volume: parseInt(volume)||0,
      };
    }).filter(v => v.close > 0);
  } catch (err) {
    console.warn(`getTimeSeries failed for ${ticker}: ${err.message}`);
    return [];
  }
}

// ── Fundamentals (Twelve Data) ────────────────────────────────────────────────
async function getFundamentalsData(ticker) {
  const key = TD_KEY();
  const sym = tdSymbol(ticker);
  const pf  = (v) => { const n = parseFloat(v||0); return Number.isFinite(n)&&n!==0 ? n : null; };

  try {
    const url = `https://api.twelvedata.com/statistics?symbol=${encodeURIComponent(sym)}&apikey=${key}`;
    const res = await httpGet(url);
    if (res.status !== 200) throw new Error(`Twelve Data stats HTTP ${res.status}`);
    const s    = JSON.parse(res.body);
    if (s.status === 'error') throw new Error(s.message);

    const valu = s.valuations_metrics || {};
    const fin  = s.financials          || {};
    const inc  = fin.income_statement  || {};
    const bal  = fin.balance_sheet     || {};
    const cf   = fin.cash_flow         || {};
    const stk  = s.stock               || {};

    // Also get profile
    let name = ticker, sector = 'Unknown', industry = 'Unknown', description = null;
    try {
      const purl = `https://api.twelvedata.com/profile?symbol=${encodeURIComponent(sym)}&apikey=${key}`;
      const pres = await httpGet(purl);
      if (pres.status === 200) {
        const p = JSON.parse(pres.body);
        name = p.name || name; sector = p.sector || sector;
        industry = p.industry || industry; description = p.description || null;
      }
    } catch { /* use defaults */ }

    return {
      name, sector, industry, description,
      peRatio:        r(pf(valu.trailing_pe)),
      pbRatio:        r(pf(valu.price_to_book)),
      psRatio:        r(pf(valu.price_to_sales_ttm)),
      evEbitda:       r(pf(valu.enterprise_to_ebitda)),
      eps:            r(pf(stk.trailing_eps)),
      revenueGrowth:  r(pf(inc.quarterly_revenue_growth) * 100),
      grossMargin:    r(pf(fin.gross_margin) * 100),
      operatingMargin:r(pf(fin.operating_margin) * 100),
      netMargin:      r(pf(fin.profit_margin) * 100),
      roe:            r(pf(fin.return_on_equity) * 100),
      roa:            r(pf(fin.return_on_assets) * 100),
      debtToEquity:   r(pf(bal.total_debt_to_equity)),
      currentRatio:   r(pf(bal.current_ratio)),
      freeCashFlow:   pf(cf.free_cashflow),
      marketCap:      pf(stk.market_capitalization),
      beta:           r(pf(stk.beta)),
      dividendYield:  r(pf(stk.dividend_yield) * 100),
      targetPrice:    r(pf(stk.one_year_target)),
    };
  } catch (err) {
    console.warn(`getFundamentalsData failed for ${ticker}: ${err.message}`);
    return { name: ticker.replace('.NS','').replace('.BO',''), sector:'Unknown', industry:'Unknown' };
  }
}

async function getEarnings(ticker) {
  try {
    const key = TD_KEY();
    const url = `https://api.twelvedata.com/earnings?symbol=${encodeURIComponent(tdSymbol(ticker))}&outputsize=8&apikey=${key}`;
    const res = await httpGet(url);
    if (res.status !== 200) return [];
    const data = JSON.parse(res.body);
    return (data.earnings || []).map(e => ({
      date: e.date, period: e.period,
      epsActual: r(parseFloat(e.eps_actual||0)), epsEstimate: r(parseFloat(e.eps_estimate||0)),
      surprise: r(parseFloat(e.surprise_pct||0)),
    }));
  } catch { return []; }
}

async function getIncomeStatement(ticker) {
  const key = TD_KEY();
  const sym = tdSymbol(ticker);
  const mapIS = items => (items||[]).map(i => ({
    date: i.fiscal_date||i.date,
    revenue: parseFloat(i.revenue||0)||null, grossProfit: parseFloat(i.gross_profit||0)||null,
    operatingIncome: parseFloat(i.operating_income||0)||null, netIncome: parseFloat(i.net_income||0)||null,
    eps: r(parseFloat(i.eps_diluted||i.eps||0)),
  }));
  const [a,q] = await Promise.allSettled([
    httpGet(`https://api.twelvedata.com/income_statement?symbol=${encodeURIComponent(sym)}&period=annual&outputsize=4&apikey=${key}`).then(r=>JSON.parse(r.body)),
    httpGet(`https://api.twelvedata.com/income_statement?symbol=${encodeURIComponent(sym)}&period=quarterly&outputsize=8&apikey=${key}`).then(r=>JSON.parse(r.body)),
  ]);
  return {
    annual:    a.status==='fulfilled' ? mapIS(a.value?.income_statement) : [],
    quarterly: q.status==='fulfilled' ? mapIS(q.value?.income_statement) : [],
  };
}

async function getBalanceSheet(ticker) {
  try {
    const key = TD_KEY();
    const url = `https://api.twelvedata.com/balance_sheet?symbol=${encodeURIComponent(tdSymbol(ticker))}&period=annual&outputsize=4&apikey=${key}`;
    const res = await httpGet(url);
    const data = JSON.parse(res.body);
    return (data.balance_sheet||[]).map(b => ({
      date: b.fiscal_date||b.date,
      totalAssets: parseFloat(b.total_assets||0)||null,
      totalLiabilities: parseFloat(b.total_liabilities||0)||null,
      equity: parseFloat(b.total_equity||0)||null,
      cash: parseFloat(b.cash_and_equivalents||0)||null,
      currentRatio: r(parseFloat(b.current_ratio||0))||null,
    }));
  } catch { return []; }
}

async function getCashFlow(ticker) {
  try {
    const key = TD_KEY();
    const url = `https://api.twelvedata.com/cash_flow?symbol=${encodeURIComponent(tdSymbol(ticker))}&period=annual&outputsize=4&apikey=${key}`;
    const res = await httpGet(url);
    const data = JSON.parse(res.body);
    return (data.cash_flow||[]).map(c => ({
      date: c.fiscal_date||c.date,
      operatingCF: parseFloat(c.net_cash_from_operating_activities||0)||null,
      capEx: parseFloat(c.capital_expenditures||0)||null,
      freeCashFlow: parseFloat(c.free_cash_flow||0)||null,
      dividendsPaid: parseFloat(c.dividends_paid||0)||null,
    }));
  } catch { return []; }
}

// ── Price cache (5 min TTL) ───────────────────────────────────────────────────
const priceCache = { data: {}, ts: 0 };
const CACHE_TTL  = 5 * 60 * 1000;

async function getCachedBatchPrices(tickers) {
  const age = Date.now() - priceCache.ts;
  if (age < CACHE_TTL && Object.keys(priceCache.data).length > 0) {
    console.log(`📦 Cache hit (${Math.round(age/1000)}s old)`);
    return priceCache.data;
  }
  const fresh = await getBatchPrices(tickers);
  if (Object.keys(fresh).length > 0) {
    priceCache.data = fresh;
    priceCache.ts   = Date.now();
  }
  return fresh;
}

module.exports = {
  getBatchPrices, getCachedBatchPrices, getQuote, getTimeSeries,
  getFundamentalsData, getEarnings, getIncomeStatement, getBalanceSheet, getCashFlow,
  tdSymbol, r,
};

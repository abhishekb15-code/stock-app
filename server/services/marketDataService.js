/**
 * marketDataService.js
 * Twelve Data API — free plan limits:
 *   - 8 symbols per batch request
 *   - 8 API calls per minute
 *   - 800 calls per day
 */

const https = require('https');

// API key — set TWELVE_DATA_API_KEY env var in Render, fallback to hardcoded
const TD_KEY = () => process.env.TWELVE_DATA_API_KEY || '9a336f4794a244bead51fcd1edba7160';
const BATCH_SIZE = 8;   // free plan max symbols per request
const BATCH_DELAY = 8000; // 8 seconds between batches (stay under 8 req/min)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'StockIntelligence/1.0', 'Accept': 'application/json' },
      timeout: 20000,
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function r(v, d = 2) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round(Number(v) * Math.pow(10, d)) / Math.pow(10, d);
}

// Convert RELIANCE.NS -> RELIANCE:NSE, 504132.BO -> 504132:BSE
function tdSymbol(ticker) {
  if (ticker.endsWith('.BO')) return `${ticker.replace('.BO','')}:BSE`;
  return `${ticker.replace('.NS','')}:NSE`;
}

async function tdGet(endpoint, params = {}) {
  const key = TD_KEY();
  if (!key) throw new Error('TWELVE_DATA_API_KEY not set');
  const qs  = Object.entries({ ...params, apikey: key })
    .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const url = `https://api.twelvedata.com/${endpoint}?${qs}`;
  const res = await httpGet(url);
  if (res.status !== 200) throw new Error(`Twelve Data HTTP ${res.status}`);
  const data = JSON.parse(res.body);
  if (data.status === 'error') throw new Error(data.message || 'Twelve Data error');
  return data;
}

/**
 * Batch fetch prices — splits into groups of 8 (free plan limit)
 * Returns { 'RELIANCE.NS': 2850.45, 'OIL.NS': 482.30, ... }
 */
async function getBatchPrices(tickers) {
  if (!tickers.length) return {};
  const result = {};

  // Split into batches of 8
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch   = tickers.slice(i, i + BATCH_SIZE);
    const symbols = batch.map(tdSymbol).join(',');

    try {
      const data = await tdGet('price', { symbol: symbols });

      if (data.price != null) {
        // Single symbol response: { price: "123.45" }
        result[batch[0]] = parseFloat(data.price);
      } else {
        // Multi symbol response: { "RELIANCE:NSE": { price: "2850" }, ... }
        for (const [key, val] of Object.entries(data)) {
          if (!val || val.code || !val.price) continue;
          // Match back to original ticker
          const baseSym = key.split(':')[0];
          const matched = batch.find(t =>
            t.replace('.NS','').replace('.BO','') === baseSym
          );
          if (matched) result[matched] = parseFloat(val.price);
        }
      }
    } catch (err) {
      console.warn(`⚠️  Batch ${i/BATCH_SIZE + 1} failed: ${err.message}`);
    }

    // Wait between batches to respect rate limit (skip delay after last batch)
    if (i + BATCH_SIZE < tickers.length) {
      await sleep(BATCH_DELAY);
    }
  }

  return result;
}

/**
 * Single quote with full details
 */
async function getQuote(ticker) {
  const sym  = tdSymbol(ticker);
  const data = await tdGet('quote', { symbol: sym });
  const price     = parseFloat(data.close || data.price || 0);
  const prevClose = parseFloat(data.previous_close || price);
  return {
    ticker,
    displayTicker: ticker.replace('.NS','').replace('.BO',''),
    name:          data.name || ticker,
    exchange:      data.exchange || 'NSE',
    price:         r(price),
    previousClose: r(prevClose),
    change:        r(price - prevClose),
    changePercent: r(((price - prevClose) / prevClose) * 100),
    volume:        parseInt(data.volume) || null,
    fiftyTwoWeekHigh: data['52_week'] ? r(parseFloat(data['52_week'].high)) : null,
    fiftyTwoWeekLow:  data['52_week'] ? r(parseFloat(data['52_week'].low))  : null,
  };
}

/**
 * OHLCV time series for charts and technical indicators
 */
async function getTimeSeries(ticker, outputsize = 300) {
  const data   = await tdGet('time_series', { symbol: tdSymbol(ticker), interval: '1day', outputsize });
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
 * Fundamentals / statistics
 */
async function getFundamentalsData(ticker) {
  const sym = tdSymbol(ticker);
  const [statsRes, profileRes] = await Promise.allSettled([
    tdGet('statistics', { symbol: sym }),
    tdGet('profile',    { symbol: sym }),
  ]);

  const s = statsRes.status   === 'fulfilled' ? statsRes.value   : {};
  const p = profileRes.status === 'fulfilled' ? profileRes.value : {};

  const valu = s.valuations_metrics || {};
  const fin  = s.financials         || {};
  const inc  = fin.income_statement || {};
  const bal  = fin.balance_sheet    || {};
  const cf   = fin.cash_flow        || {};
  const stk  = s.stock              || {};

  const pf = (v) => { const n = parseFloat(v || 0); return Number.isFinite(n) && n !== 0 ? n : null; };

  return {
    name:           p.name     || ticker,
    sector:         p.sector   || 'Unknown',
    industry:       p.industry || 'Unknown',
    website:        p.website  || null,
    description:    p.description || null,
    peRatio:        r(pf(valu.trailing_pe)),
    pbRatio:        r(pf(valu.price_to_book)),
    psRatio:        r(pf(valu.price_to_sales_ttm)),
    evEbitda:       r(pf(valu.enterprise_to_ebitda)),
    eps:            r(pf(stk.trailing_eps)),
    revenueGrowth:  r(pf(inc.quarterly_revenue_growth) * 100),
    grossMargin:    r(pf(fin.gross_margin)      * 100),
    operatingMargin:r(pf(fin.operating_margin)  * 100),
    netMargin:      r(pf(fin.profit_margin)     * 100),
    roe:            r(pf(fin.return_on_equity)  * 100),
    roa:            r(pf(fin.return_on_assets)  * 100),
    debtToEquity:   r(pf(bal.total_debt_to_equity)),
    currentRatio:   r(pf(bal.current_ratio)),
    freeCashFlow:   pf(cf.free_cashflow),
    marketCap:      pf(stk.market_capitalization),
    beta:           r(pf(stk.beta)),
    dividendYield:  r(pf(stk.dividend_yield) * 100),
    targetPrice:    r(pf(stk.one_year_target)),
  };
}

/**
 * Earnings history
 */
async function getEarnings(ticker) {
  try {
    const data = await tdGet('earnings', { symbol: tdSymbol(ticker), outputsize: 8 });
    return (data.earnings || []).map(e => ({
      date:            e.date,
      period:          e.period,
      epsActual:       r(parseFloat(e.eps_actual   || 0)),
      epsEstimate:     r(parseFloat(e.eps_estimate  || 0)),
      surprise:        r(parseFloat(e.surprise_pct  || 0)),
      revenueActual:   parseFloat(e.revenue_actual   || 0) || null,
      revenueEstimate: parseFloat(e.revenue_estimate || 0) || null,
    }));
  } catch { return []; }
}

/**
 * Income statement (annual + quarterly)
 */
async function getIncomeStatement(ticker) {
  const sym = tdSymbol(ticker);
  const [annualRes, quarterlyRes] = await Promise.allSettled([
    tdGet('income_statement', { symbol: sym, period: 'annual',    outputsize: 4 }),
    tdGet('income_statement', { symbol: sym, period: 'quarterly', outputsize: 8 }),
  ]);
  const mapIS = items => (items || []).map(i => ({
    date:            i.fiscal_date || i.date,
    revenue:         parseFloat(i.revenue         || 0) || null,
    grossProfit:     parseFloat(i.gross_profit     || 0) || null,
    operatingIncome: parseFloat(i.operating_income || 0) || null,
    netIncome:       parseFloat(i.net_income       || 0) || null,
    ebitda:          parseFloat(i.ebitda           || 0) || null,
    eps:             r(parseFloat(i.eps_diluted || i.eps || 0)),
  }));
  return {
    annual:    annualRes.status    === 'fulfilled' ? mapIS(annualRes.value?.income_statement)    : [],
    quarterly: quarterlyRes.status === 'fulfilled' ? mapIS(quarterlyRes.value?.income_statement) : [],
  };
}

/**
 * Balance sheet
 */
async function getBalanceSheet(ticker) {
  try {
    const data = await tdGet('balance_sheet', { symbol: tdSymbol(ticker), period: 'annual', outputsize: 4 });
    return (data.balance_sheet || []).map(b => ({
      date:             b.fiscal_date || b.date,
      totalAssets:      parseFloat(b.total_assets      || 0) || null,
      totalLiabilities: parseFloat(b.total_liabilities || 0) || null,
      equity:           parseFloat(b.total_equity      || 0) || null,
      cash:             parseFloat(b.cash_and_equivalents || 0) || null,
      totalDebt:        parseFloat(b.total_debt        || 0) || null,
      currentRatio:     r(parseFloat(b.current_ratio   || 0)) || null,
    }));
  } catch { return []; }
}

/**
 * Cash flow statement
 */
async function getCashFlow(ticker) {
  try {
    const data = await tdGet('cash_flow', { symbol: tdSymbol(ticker), period: 'annual', outputsize: 4 });
    return (data.cash_flow || []).map(c => ({
      date:          c.fiscal_date || c.date,
      operatingCF:   parseFloat(c.net_cash_from_operating_activities || 0) || null,
      capEx:         parseFloat(c.capital_expenditures               || 0) || null,
      freeCashFlow:  parseFloat(c.free_cash_flow                     || 0) || null,
      dividendsPaid: parseFloat(c.dividends_paid                     || 0) || null,
    }));
  } catch { return []; }
}

module.exports = {
  getBatchPrices, getQuote, getTimeSeries,
  getFundamentalsData, getEarnings,
  getIncomeStatement, getBalanceSheet, getCashFlow,
  tdSymbol, r,
};

// ── Simple in-memory price cache (5 min TTL) ──────────────────────────────────
const priceCache = { data: {}, ts: 0 };
const CACHE_TTL  = 5 * 60 * 1000; // 5 minutes

async function getCachedBatchPrices(tickers) {
  const now = Date.now();
  const age = now - priceCache.ts;

  // Return cache if fresh
  if (age < CACHE_TTL && Object.keys(priceCache.data).length > 0) {
    console.log(`📦 Using cached prices (${Math.round(age/1000)}s old)`);
    return priceCache.data;
  }

  // Fetch fresh prices
  console.log('🔄 Fetching fresh prices from Twelve Data...');
  const fresh = await getBatchPrices(tickers);

  if (Object.keys(fresh).length > 0) {
    priceCache.data = fresh;
    priceCache.ts   = now;
    console.log(`✅ Cached ${Object.keys(fresh).length} prices`);
  }
  return fresh;
}

module.exports.getCachedBatchPrices = getCachedBatchPrices;

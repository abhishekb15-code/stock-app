/**
 * marketDataService.js
 *
 * Yahoo Finance data layer that works on cloud hosts (Render) where the
 * authenticated v10/v7 endpoints are blocked.
 *
 *  - Prices + OHLCV      → v8 chart endpoint        (no crumb, works everywhere)
 *  - Financial statements → ws/fundamentals-timeseries (no crumb, works everywhere)
 *  - Sector / industry / analyst target → v10 quoteSummary (needs crumb — BEST EFFORT
 *    only; gracefully degrades to a static sector map when the crumb is unavailable,
 *    e.g. on Render's datacenter IPs).
 *
 * A single per-ticker quote cache is shared by the Portfolio batch path and the
 * single-stock (StockDeepDive) path so prices are always consistent across pages.
 */

const https = require('https');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function r(v, d = 2) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round(Number(v) * Math.pow(10, d)) / Math.pow(10, d);
}

// ── Ticker corrections ─────────────────────────────────────────────────────────
const TICKER_MAP = {
  'WEBSOL.NS':   'WEBELSOLAR.NS',   // NSE renamed
  'WEBELSOL.NS': 'WEBELSOLAR.NS',
};
function correctTicker(ticker) {
  return TICKER_MAP[ticker.toUpperCase()] || ticker;
}

function tdSymbol(ticker) {
  if (ticker.endsWith('.BO')) return `${ticker.replace('.BO','')}:BSE`;
  return `${ticker.replace('.NS','')}:NSE`;
}

// ── Static sector map ──────────────────────────────────────────────────────────
// assetProfile (sector/industry) needs a crumb and is blocked on Render, so we
// resolve sector from this map first. Covers the portfolio + the reference peers
// used by the competitive / sector tabs. Falls back to a best-effort crumb lookup,
// then 'Unknown'.
const TICKER_SECTOR = {
  // Portfolio holdings
  'OIL.NS':'Energy', 'STEELCAS.NS':'Industrials', 'NATCOPHARM.NS':'Healthcare',
  'RISHABH.NS':'Industrials', 'PTC.NS':'Utilities', 'JGCHEM.NS':'Basic Materials',
  'IREDA.NS':'Financial Services', 'GMDCLTD.NS':'Basic Materials', 'MSTCLTD.NS':'Industrials',
  'UJJIVANSFB.NS':'Financial Services', 'AEROENTER.NS':'Industrials', 'HUDCO.NS':'Financial Services',
  'GNA.NS':'Consumer Cyclical', 'UNIMECH.NS':'Industrials', 'LIKHITHA.NS':'Industrials',
  'IRCON.NS':'Industrials', 'PROTEAN.NS':'Technology', 'VIKASLIFE.NS':'Basic Materials',
  'UTKARSHBNK.NS':'Financial Services', 'WEBELSOLAR.NS':'Industrials',
  // Reference large-caps (peers)
  'RELIANCE.NS':'Energy', 'ONGC.NS':'Energy', 'BPCL.NS':'Energy', 'IOC.NS':'Energy',
  'TCS.NS':'Technology', 'INFY.NS':'Technology', 'WIPRO.NS':'Technology', 'HCLTECH.NS':'Technology',
  'HDFCBANK.NS':'Financial Services', 'ICICIBANK.NS':'Financial Services',
  'KOTAKBANK.NS':'Financial Services', 'SBIN.NS':'Financial Services',
  'JSWSTEEL.NS':'Basic Materials', 'TATASTEEL.NS':'Basic Materials',
  'HINDALCO.NS':'Basic Materials', 'SAIL.NS':'Basic Materials',
  'LT.NS':'Industrials', 'SIEMENS.NS':'Industrials', 'ABB.NS':'Industrials', 'BEL.NS':'Industrials',
  'SUNPHARMA.NS':'Healthcare', 'DRREDDY.NS':'Healthcare', 'CIPLA.NS':'Healthcare', 'DIVISLAB.NS':'Healthcare',
  'POWERGRID.NS':'Utilities', 'NTPC.NS':'Utilities', 'TATAPOWER.NS':'Utilities',
};
function sectorFor(ticker) {
  return TICKER_SECTOR[correctTicker(ticker).toUpperCase()] || null;
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
function httpGet(url, headers = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin':          'https://finance.yahoo.com',
        'Referer':         'https://finance.yahoo.com/',
        ...headers,
      },
      timeout,
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location)
        return httpGet(res.headers.location, headers, timeout).then(resolve).catch(reject);
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── Crumb management (v10 quoteSummary — BEST EFFORT, may be blocked on cloud) ──
let _crumb = null, _cookie = null, _crumbTs = 0;
let _crumbBlockedUntil = 0;                 // backoff after a failure (avoids slow retries)
let _crumbInflight = null;                  // shared promise so concurrent callers don't stampede
const CRUMB_TTL = 30 * 60 * 1000;           // 30 min
const CRUMB_BLOCK_TTL = 10 * 60 * 1000;     // don't retry a failing crumb for 10 min

function getCrumb() {
  if (_crumb && _cookie && (Date.now() - _crumbTs) < CRUMB_TTL)
    return Promise.resolve({ crumb: _crumb, cookie: _cookie });
  if (Date.now() < _crumbBlockedUntil)
    return Promise.reject(new Error('Yahoo crumb temporarily unavailable (backoff)'));
  if (_crumbInflight) return _crumbInflight;
  _crumbInflight = _acquireCrumb().finally(() => { _crumbInflight = null; });
  return _crumbInflight;
}

async function _acquireCrumb() {
  try {
    // Get a session cookie (fc.yahoo.com works locally; finance.yahoo.com is a fallback)
    let setCookie = (await httpGet('https://fc.yahoo.com', {}, 6000)).headers['set-cookie'] || [];
    if (!setCookie.length)
      setCookie = (await httpGet('https://finance.yahoo.com', {}, 6000)).headers['set-cookie'] || [];
    _cookie = setCookie.map(c => c.split(';')[0]).join('; ');

    for (const host of ['query1', 'query2']) {
      const cr = await httpGet(`https://${host}.finance.yahoo.com/v1/test/getcrumb`, { 'Cookie': _cookie }, 6000);
      if (cr.status === 200 && cr.body && cr.body !== 'null' && !cr.body.includes('<')) {
        _crumb = cr.body.trim();
        _crumbTs = Date.now();
        return { crumb: _crumb, cookie: _cookie };
      }
    }
    throw new Error('crumb endpoint returned no token');
  } catch (err) {
    _crumbBlockedUntil = Date.now() + CRUMB_BLOCK_TTL;
    throw new Error(`Could not obtain Yahoo crumb: ${err.message}`);
  }
}

async function fetchQuoteSummary(ticker, modules) {
  const t = correctTicker(ticker);
  const { crumb, cookie } = await getCrumb();
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(t)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
  const res = await httpGet(url, { 'Cookie': cookie });
  if (res.status === 401 || res.status === 403) {
    _crumb = null; _crumbBlockedUntil = Date.now() + CRUMB_BLOCK_TTL; // crumb rejected — back off
    throw new Error(`Yahoo v10 HTTP ${res.status} for ${t}`);
  }
  if (res.status !== 200) throw new Error(`Yahoo v10 HTTP ${res.status} for ${t}`);
  const data = JSON.parse(res.body);
  if (data?.quoteSummary?.error) throw new Error(data.quoteSummary.error.description);
  return data?.quoteSummary?.result?.[0] || {};
}

// ── Yahoo v8 chart (price + meta, no crumb) ───────────────────────────────────
async function fetchYahooChart(ticker) {
  const t   = correctTicker(ticker);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=1d&range=2d`;
  const res = await httpGet(url);
  if (res.status !== 200) throw new Error(`Yahoo v8 HTTP ${res.status} for ${t}`);
  const data   = JSON.parse(res.body);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${t}: ${JSON.stringify(data?.chart?.error)}`);
  const meta  = result.meta;
  const price = meta.regularMarketPrice;
  if (!price) throw new Error(`No price for ${t}`);
  const prev  = meta.chartPreviousClose || meta.previousClose || price;
  return {
    price, previousClose: prev,
    change:        r(price - prev),
    changePercent: r(((price - prev) / prev) * 100),
    volume:        meta.regularMarketVolume || null,
    name:          meta.longName || meta.shortName || t,
    currency:      meta.currency || 'INR',
    exchange:      meta.exchangeName || 'NSE',
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || null,
    fiftyTwoWeekLow:  meta.fiftyTwoWeekLow  || null,
  };
}

// ── Fundamentals timeseries (no crumb — works on Render) ──────────────────────
async function fetchFundamentalsTS(ticker, types) {
  const t    = correctTicker(ticker);
  const now  = Math.floor(Date.now() / 1000);
  const past = now - 6 * 365 * 86400;
  const url  = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(t)}`
             + `?symbol=${encodeURIComponent(t)}&type=${types.join(',')}&period1=${past}&period2=${now}&merge=false`;
  const res = await httpGet(url);
  if (res.status !== 200) throw new Error(`timeseries HTTP ${res.status} for ${t}`);
  const data = JSON.parse(res.body);
  const out  = {};
  for (const row of (data?.timeseries?.result || [])) {
    const type = row.meta?.type?.[0];
    if (!type) continue;
    out[type] = (row[type] || [])
      .filter(Boolean)
      .map(v => ({ date: v.asOfDate, value: r(v.reportedValue?.raw, 4) }))
      .filter(p => p.date && p.value != null)
      .sort((a, b) => b.date.localeCompare(a.date));   // most recent first
  }
  return out;
}
const tsLatest = (ts, type) => ts[type]?.[0]?.value ?? null;
const tsPrior  = (ts, type) => ts[type]?.[1]?.value ?? null;
const tsSum    = (ts, type, n) => {
  const a = (ts[type] || []).slice(0, n).map(p => p.value).filter(v => v != null);
  return a.length === n ? a.reduce((x, y) => x + y, 0) : null;
};

// Merge several timeseries types into a date-keyed list (newest first).
function mergeSeries(ts, fieldMap) {
  const byDate = {};
  for (const [out, type] of Object.entries(fieldMap)) {
    for (const pt of (ts[type] || [])) {
      (byDate[pt.date] ||= {})[out] = pt.value;
    }
  }
  return Object.entries(byDate)
    .map(([date, obj]) => ({ year: new Date(date).getFullYear(), ...obj }))
    .sort((a, b) => b.year - a.year);
}

// ── Shared per-ticker quote cache ─────────────────────────────────────────────
const quoteCache = new Map();           // ticker -> { data, ts }
const QUOTE_TTL  = 5 * 60 * 1000;       // 5 min

async function getQuoteRaw(ticker) {
  const key = correctTicker(ticker);
  const c   = quoteCache.get(key);
  if (c && (Date.now() - c.ts) < QUOTE_TTL) return c.data;
  const q = await fetchYahooChart(ticker);
  quoteCache.set(key, { data: q, ts: Date.now() });
  return q;
}
function cachedPrice(ticker) {
  const c = quoteCache.get(correctTicker(ticker));
  return c && (Date.now() - c.ts) < QUOTE_TTL ? c.data.price : null;
}

// ── Batch prices (shares the quote cache) ─────────────────────────────────────
async function getBatchPrices(tickers) {
  if (!tickers.length) return {};
  const result = {};
  const BATCH = 5, DELAY = 300;
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const needNetwork = batch.some(t => cachedPrice(t) == null);
    const results = await Promise.allSettled(batch.map(t => getQuoteRaw(t)));
    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') result[batch[idx]] = res.value.price;
      else console.warn(`⚠️  ${batch[idx]}: ${res.reason?.message}`);
    });
    if (needNetwork && i + BATCH < tickers.length) await sleep(DELAY);
  }
  return result;
}

async function getCachedBatchPrices(tickers) {
  return getBatchPrices(tickers);   // per-ticker cache inside getQuoteRaw handles freshness
}

// Like getBatchPrices but returns the full quote (price, previousClose, change,
// changePercent, …) per ticker — needed for daily P&L.
async function getCachedBatchQuotes(tickers) {
  if (!tickers.length) return {};
  const result = {};
  const BATCH = 5, DELAY = 300;
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const needNetwork = batch.some(t => cachedPrice(t) == null);
    const res = await Promise.allSettled(batch.map(t => getQuoteRaw(t)));
    res.forEach((r, idx) => { if (r.status === 'fulfilled') result[batch[idx]] = r.value; });
    if (needNetwork && i + BATCH < tickers.length) await sleep(DELAY);
  }
  return result;
}

// ── Single quote ───────────────────────────────────────────────────────────────
async function getQuote(ticker) {
  const q = await getQuoteRaw(ticker);
  return {
    ticker, displayTicker: ticker.replace('.NS','').replace('.BO',''),
    name: q.name, exchange: q.exchange,
    price: r(q.price), previousClose: r(q.previousClose),
    change: q.change, changePercent: q.changePercent,
    volume: q.volume, currency: q.currency || 'INR',
    fiftyTwoWeekHigh: r(q.fiftyTwoWeekHigh),
    fiftyTwoWeekLow:  r(q.fiftyTwoWeekLow),
  };
}

// ── Historical OHLCV (v8) ──────────────────────────────────────────────────────
async function getTimeSeries(ticker, outputsize = 300) {
  const t       = correctTicker(ticker);
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - (outputsize * 86400);
  const url     = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=1d&period1=${period1}&period2=${period2}`;
  const res     = await httpGet(url);
  if (res.status !== 200) throw new Error(`History HTTP ${res.status} for ${t}`);
  const data   = JSON.parse(res.body);
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const ts    = result.timestamp || [];
  const ohlcv = result.indicators?.quote?.[0] || {};
  return ts.map((tt, i) => ({
    date:   new Date(tt * 1000).toISOString().split('T')[0],
    open:   r(ohlcv.open?.[i]),   high:   r(ohlcv.high?.[i]),
    low:    r(ohlcv.low?.[i]),    close:  r(ohlcv.close?.[i]),
    volume: ohlcv.volume?.[i] || 0,
  })).filter(v => v.close > 0);
}

// ── Best-effort sector/target enrichment via crumb (skipped if blocked) ───────
async function enrichFromQuoteSummary(ticker) {
  if (Date.now() < _crumbBlockedUntil) return {};
  try {
    const s   = await fetchQuoteSummary(ticker, 'assetProfile,financialData,defaultKeyStatistics,summaryDetail');
    const safe = (v) => { const raw = v?.raw ?? v; return Number.isFinite(Number(raw)) ? Number(raw) : null; };
    const pro = s.assetProfile || {}, fd = s.financialData || {}, ks = s.defaultKeyStatistics || {}, sd = s.summaryDetail || {};
    return {
      sector:        pro.sector || null,
      industry:      pro.industry || null,
      website:       pro.website || null,
      description:   pro.longBusinessSummary || null,
      targetPrice:   safe(fd.targetMeanPrice),
      beta:          safe(ks.beta),
      dividendYield: safe(sd.dividendYield) != null ? r(safe(sd.dividendYield) * 100) : null,
      evEbitda:      safe(ks.enterpriseToEbitda),
    };
  } catch { return {}; }
}

// ── Fundamentals (timeseries-derived, with best-effort crumb enrichment) ──────
async function getFundamentalsData(ticker) {
  const display = correctTicker(ticker).replace('.NS','').replace('.BO','');
  const TYPES = [
    'annualTotalRevenue','annualGrossProfit','annualOperatingIncome','annualNetIncome',
    'annualDilutedEPS','annualBasicEPS','annualStockholdersEquity','annualTotalAssets',
    'annualTotalDebt','annualCurrentAssets','annualCurrentLiabilities','annualOrdinarySharesNumber',
    'quarterlyTotalRevenue','quarterlyNetIncome','quarterlyDilutedEPS','quarterlyGrossProfit',
  ];

  let ts = {};
  try { ts = await fetchFundamentalsTS(ticker, TYPES); }
  catch (err) { console.warn(`Fundamentals TS failed for ${ticker}: ${err.message}`); }

  const [price, enrich] = await Promise.all([
    getQuoteRaw(ticker).then(q => q.price).catch(() => cachedPrice(ticker)),
    enrichFromQuoteSummary(ticker),
  ]);

  const revenue   = tsLatest(ts, 'annualTotalRevenue');
  const revPrev   = tsPrior(ts, 'annualTotalRevenue');
  const netIncome = tsLatest(ts, 'annualNetIncome');
  const grossProf = tsLatest(ts, 'annualGrossProfit');
  const opIncome  = tsLatest(ts, 'annualOperatingIncome');
  const equity    = tsLatest(ts, 'annualStockholdersEquity');
  const assets    = tsLatest(ts, 'annualTotalAssets');
  const totalDebt = tsLatest(ts, 'annualTotalDebt');
  const curAssets = tsLatest(ts, 'annualCurrentAssets');
  const curLiab   = tsLatest(ts, 'annualCurrentLiabilities');
  const shares    = tsLatest(ts, 'annualOrdinarySharesNumber');

  // Trailing EPS / margins from last 4 quarters when available, else annual
  const ttmEps    = tsSum(ts, 'quarterlyDilutedEPS', 4) ?? tsLatest(ts, 'annualDilutedEPS') ?? tsLatest(ts, 'annualBasicEPS');
  const ttmNet    = tsSum(ts, 'quarterlyNetIncome', 4) ?? netIncome;
  const ttmRev    = tsSum(ts, 'quarterlyTotalRevenue', 4) ?? revenue;

  const marketCap = price && shares ? price * shares : null;

  const pct = (num, den) => (num != null && den) ? r((num / den) * 100) : null;

  const data = {
    name:            display,
    sector:          enrich.sector || sectorFor(ticker) || 'Unknown',
    industry:        enrich.industry || 'Unknown',
    description:     enrich.description || null,
    website:         enrich.website || null,
    peRatio:         price != null && ttmEps ? r(price / ttmEps) : null,
    pbRatio:         marketCap && equity  ? r(marketCap / equity)  : null,
    psRatio:         marketCap && ttmRev  ? r(marketCap / ttmRev)  : null,
    evEbitda:        enrich.evEbitda ?? null,
    eps:             r(ttmEps),
    revenueGrowth:   (revenue != null && revPrev) ? r(((revenue - revPrev) / Math.abs(revPrev)) * 100) : null,
    grossMargin:     pct(grossProf, revenue),
    operatingMargin: pct(opIncome, revenue),
    netMargin:       pct(ttmNet, ttmRev),
    roe:             pct(netIncome, equity),
    roa:             pct(netIncome, assets),
    debtToEquity:    (totalDebt != null && equity) ? r((totalDebt / equity) * 100) : null,
    currentRatio:    (curAssets != null && curLiab) ? r(curAssets / curLiab) : null,
    freeCashFlow:    null,
    marketCap:       marketCap,
    beta:            enrich.beta ?? null,
    dividendYield:   enrich.dividendYield ?? null,
    targetPrice:     enrich.targetPrice ?? null,
  };
  return data;
}

// ── Earnings (crumb earningsHistory → fallback to quarterly EPS actuals) ──────
async function getEarnings(ticker) {
  const safe = (v) => { const raw = v?.raw ?? v; return Number.isFinite(Number(raw)) ? Number(raw) : null; };
  if (Date.now() >= _crumbBlockedUntil) {
    try {
      const s = await fetchQuoteSummary(ticker, 'earningsHistory');
      const hist = (s.earningsHistory?.history || []).map(h => ({
        date:        h.quarter?.fmt || new Date((h.quarter?.raw || 0) * 1000).toISOString().split('T')[0],
        epsActual:   r(safe(h.epsActual)),
        epsEstimate: r(safe(h.epsEstimate)),
        surprise:    safe(h.surprisePercent) != null ? r(safe(h.surprisePercent) * 100) : null,
      })).filter(h => h.date && h.epsActual != null);
      if (hist.length) return hist;
    } catch { /* fall through */ }
  }
  // Fallback: quarterly diluted EPS actuals (no estimate/surprise available)
  try {
    const ts = await fetchFundamentalsTS(ticker, ['quarterlyDilutedEPS']);
    return (ts.quarterlyDilutedEPS || []).slice(0, 8).map(p => ({
      date: p.date, epsActual: r(p.value), epsEstimate: null, surprise: null,
    }));
  } catch { return []; }
}

// ── Income statement (timeseries) ─────────────────────────────────────────────
async function getIncomeStatement(ticker) {
  try {
    const annual = ['annualTotalRevenue','annualGrossProfit','annualOperatingIncome','annualNetIncome','annualDilutedEPS','annualBasicEPS'];
    const quart  = annual.map(t => t.replace('annual', 'quarterly'));
    const ts = await fetchFundamentalsTS(ticker, [...annual, ...quart]);
    const map = (prefix) => mergeSeries(ts, {
      revenue:         `${prefix}TotalRevenue`,
      grossProfit:     `${prefix}GrossProfit`,
      operatingIncome: `${prefix}OperatingIncome`,
      netIncome:       `${prefix}NetIncome`,
      eps:             `${prefix}DilutedEPS`,
      epsBasic:        `${prefix}BasicEPS`,
    }).map(s => ({
      date: s.year, revenue: s.revenue, grossProfit: s.grossProfit,
      operatingIncome: s.operatingIncome, netIncome: s.netIncome,
      eps: r(s.eps ?? s.epsBasic),
    }));
    return { annual: map('annual'), quarterly: map('quarterly') };
  } catch { return { annual: [], quarterly: [] }; }
}

// ── Balance sheet (timeseries) ────────────────────────────────────────────────
async function getBalanceSheet(ticker) {
  try {
    const ts = await fetchFundamentalsTS(ticker, [
      'annualTotalAssets','annualTotalLiabilitiesNetMinorityInterest','annualStockholdersEquity',
      'annualCashAndCashEquivalents','annualCurrentAssets','annualCurrentLiabilities',
    ]);
    return mergeSeries(ts, {
      totalAssets:      'annualTotalAssets',
      totalLiabilities: 'annualTotalLiabilitiesNetMinorityInterest',
      equity:           'annualStockholdersEquity',
      cash:             'annualCashAndCashEquivalents',
      curAssets:        'annualCurrentAssets',
      curLiab:          'annualCurrentLiabilities',
    }).map(s => ({
      year: s.year, totalAssets: s.totalAssets, totalLiabilities: s.totalLiabilities,
      equity: s.equity, cash: s.cash,
      currentRatio: (s.curAssets != null && s.curLiab) ? r(s.curAssets / s.curLiab) : null,
    }));
  } catch { return []; }
}

// ── Cash flow (timeseries) ────────────────────────────────────────────────────
async function getCashFlow(ticker) {
  try {
    const ts = await fetchFundamentalsTS(ticker, [
      'annualOperatingCashFlow','annualCapitalExpenditure','annualFreeCashFlow','annualCashDividendsPaid',
    ]);
    return mergeSeries(ts, {
      operatingCF:   'annualOperatingCashFlow',
      capEx:         'annualCapitalExpenditure',
      freeCashFlow:  'annualFreeCashFlow',
      dividendsPaid: 'annualCashDividendsPaid',
    }).map(s => ({
      year: s.year, operatingCF: s.operatingCF, capEx: s.capEx,
      freeCashFlow: s.freeCashFlow != null ? s.freeCashFlow
                    : (s.operatingCF != null ? s.operatingCF + (s.capEx || 0) : null),
      dividendsPaid: s.dividendsPaid,
    }));
  } catch { return []; }
}

module.exports = {
  getBatchPrices, getCachedBatchPrices, getCachedBatchQuotes, getQuote, getTimeSeries,
  getFundamentalsData, getEarnings, getIncomeStatement, getBalanceSheet, getCashFlow,
  correctTicker, tdSymbol, sectorFor, r,
};

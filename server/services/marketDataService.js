/**
 * marketDataService.js
 * Yahoo Finance v8 for prices (no crumb needed)
 * Yahoo Finance v10 for fundamentals (needs crumb — fetched automatically)
 */

const https = require('https');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function r(v, d = 2) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round(Number(v) * Math.pow(10, d)) / Math.pow(10, d);
}

// ── Ticker corrections ─────────────────────────────────────────────────────────
const TICKER_MAP = {
  'WEBSOL.NS':     'WEBELSOLAR.NS',   // NSE renamed
  'WEBELSOL.NS':   'WEBELSOLAR.NS',
};
function correctTicker(ticker) {
  return TICKER_MAP[ticker.toUpperCase()] || ticker;
}

function tdSymbol(ticker) {
  if (ticker.endsWith('.BO')) return `${ticker.replace('.BO','')}:BSE`;
  return `${ticker.replace('.NS','')}:NSE`;
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':          'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin':          'https://finance.yahoo.com',
        'Referer':         'https://finance.yahoo.com/',
        ...headers,
      },
      timeout: 15000,
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location)
        return httpGet(res.headers.location, headers).then(resolve).catch(reject);
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── Crumb management (needed for v10 quoteSummary) ─────────────────────────────
let _crumb  = null;
let _cookie = null;
let _crumbTs = 0;
const CRUMB_TTL = 30 * 60 * 1000; // 30 minutes

async function getCrumb() {
  if (_crumb && _cookie && (Date.now() - _crumbTs) < CRUMB_TTL) {
    return { crumb: _crumb, cookie: _cookie };
  }

  // Step 1: Get cookies from Yahoo Finance
  const cookieRes = await httpGet('https://fc.yahoo.com', {});
  const setCookie = cookieRes.headers['set-cookie'] || [];
  _cookie = setCookie.map(c => c.split(';')[0]).join('; ');

  // Step 2: Get crumb
  const crumbRes = await httpGet('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    'Cookie': _cookie,
  });

  if (crumbRes.status === 200 && crumbRes.body && crumbRes.body !== 'null') {
    _crumb  = crumbRes.body.trim();
    _crumbTs = Date.now();
    console.log('✅ Yahoo crumb obtained');
    return { crumb: _crumb, cookie: _cookie };
  }

  // Fallback: try alternate crumb endpoint
  const altRes = await httpGet('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    'Cookie': _cookie,
  });
  if (altRes.status === 200 && altRes.body && altRes.body !== 'null') {
    _crumb  = altRes.body.trim();
    _crumbTs = Date.now();
    console.log('✅ Yahoo crumb obtained (alt)');
    return { crumb: _crumb, cookie: _cookie };
  }

  throw new Error('Could not obtain Yahoo crumb');
}

// ── Yahoo v8 chart (no crumb needed — price + history) ────────────────────────
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

// ── Yahoo v10 quoteSummary (needs crumb) ──────────────────────────────────────
async function fetchQuoteSummary(ticker, modules) {
  const t = correctTicker(ticker);
  const { crumb, cookie } = await getCrumb();
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(t)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
  const res = await httpGet(url, { 'Cookie': cookie });
  if (res.status !== 200) throw new Error(`Yahoo v10 HTTP ${res.status} for ${t}`);
  const data = JSON.parse(res.body);
  if (data?.quoteSummary?.error) throw new Error(data.quoteSummary.error.description);
  return data?.quoteSummary?.result?.[0] || {};
}

// ── Batch prices (Yahoo v8 — no crumb) ───────────────────────────────────────
async function getBatchPrices(tickers) {
  if (!tickers.length) return {};
  console.log(`💹 Fetching ${tickers.length} prices...`);
  const result = {};
  const BATCH  = 5;
  const DELAY  = 300;

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch   = tickers.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(t => fetchYahooChart(t)));
    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        result[batch[idx]] = res.value.price;
      } else {
        console.warn(`⚠️  ${batch[idx]}: ${res.reason?.message}`);
      }
    });
    if (i + BATCH < tickers.length) await sleep(DELAY);
  }
  console.log(`✅ Got ${Object.keys(result).length}/${tickers.length} prices`);
  return result;
}

// ── Single quote ──────────────────────────────────────────────────────────────
async function getQuote(ticker) {
  const q = await fetchYahooChart(ticker);
  const t = correctTicker(ticker);
  return {
    ticker, displayTicker: ticker.replace('.NS','').replace('.BO',''),
    name: q.name, exchange: q.exchange,
    price: r(q.price), previousClose: r(q.previousClose),
    change: q.change, changePercent: q.changePercent,
    volume: q.volume,
    fiftyTwoWeekHigh: r(q.fiftyTwoWeekHigh),
    fiftyTwoWeekLow:  r(q.fiftyTwoWeekLow),
  };
}

// ── Historical OHLCV ──────────────────────────────────────────────────────────
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
  return ts.map((t, i) => ({
    date:   new Date(t * 1000).toISOString().split('T')[0],
    open:   r(ohlcv.open?.[i]),   high:   r(ohlcv.high?.[i]),
    low:    r(ohlcv.low?.[i]),    close:  r(ohlcv.close?.[i]),
    volume: ohlcv.volume?.[i] || 0,
  })).filter(v => v.close > 0);
}

// ── Fundamentals (v10 with crumb) ─────────────────────────────────────────────
async function getFundamentalsData(ticker) {
  const safe = (v) => { const raw=v?.raw??v; return Number.isFinite(Number(raw))?Number(raw):null; };
  try {
    const s   = await fetchQuoteSummary(ticker, 'summaryDetail,defaultKeyStatistics,financialData,assetProfile');
    const sd  = s.summaryDetail          || {};
    const ks  = s.defaultKeyStatistics   || {};
    const fd  = s.financialData          || {};
    const pro = s.assetProfile           || {};
    return {
      name:           pro.longName || pro.shortName || ticker,
      sector:         pro.sector   || 'Unknown',
      industry:       pro.industry || 'Unknown',
      description:    pro.longBusinessSummary || null,
      website:        pro.website  || null,
      peRatio:        r(safe(sd.trailingPE) ?? safe(ks.trailingPE)),
      pbRatio:        r(safe(ks.priceToBook)),
      psRatio:        r(safe(ks.priceToSalesTrailing12Months)),
      evEbitda:       r(safe(ks.enterpriseToEbitda)),
      eps:            r(safe(ks.trailingEps)),
      revenueGrowth:  safe(fd.revenueGrowth)    != null ? r(safe(fd.revenueGrowth)*100)    : null,
      grossMargin:    safe(fd.grossMargins)      != null ? r(safe(fd.grossMargins)*100)     : null,
      operatingMargin:safe(fd.operatingMargins)  != null ? r(safe(fd.operatingMargins)*100) : null,
      netMargin:      safe(fd.profitMargins)     != null ? r(safe(fd.profitMargins)*100)    : null,
      roe:            safe(fd.returnOnEquity)    != null ? r(safe(fd.returnOnEquity)*100)   : null,
      roa:            safe(fd.returnOnAssets)    != null ? r(safe(fd.returnOnAssets)*100)   : null,
      debtToEquity:   r(safe(fd.debtToEquity)),
      currentRatio:   r(safe(fd.currentRatio)),
      freeCashFlow:   safe(fd.freeCashflow),
      marketCap:      safe(ks.enterpriseValue) || safe(sd.marketCap),
      beta:           r(safe(ks.beta)),
      dividendYield:  safe(sd.dividendYield) != null ? r(safe(sd.dividendYield)*100) : null,
      targetPrice:    r(safe(fd.targetMeanPrice)),
    };
  } catch (err) {
    console.warn(`Fundamentals failed for ${ticker}: ${err.message}`);
    return { name: ticker.replace('.NS','').replace('.BO',''), sector:'Unknown', industry:'Unknown' };
  }
}

// ── Earnings (v10 with crumb) ─────────────────────────────────────────────────
async function getEarnings(ticker) {
  const safe = (v) => { const raw=v?.raw??v; return Number.isFinite(Number(raw))?Number(raw):null; };
  try {
    const s = await fetchQuoteSummary(ticker, 'earningsHistory,earningsTrend');
    return (s.earningsHistory?.history || []).map(h => ({
      date:        h.quarter?.fmt || new Date((h.quarter?.raw||0)*1000).toISOString().split('T')[0],
      epsActual:   r(safe(h.epsActual)),
      epsEstimate: r(safe(h.epsEstimate)),
      surprise:    r(safe(h.surprisePercent)),
    })).filter(h => h.date);
  } catch { return []; }
}

// ── Income statement (v10 with crumb) ─────────────────────────────────────────
async function getIncomeStatement(ticker) {
  const safe = (v) => { const raw=v?.raw??v; return Number.isFinite(Number(raw))?Number(raw):null; };
  try {
    const s    = await fetchQuoteSummary(ticker, 'incomeStatementHistory,incomeStatementHistoryQuarterly');
    const mapIS = items => (items||[]).map(i => ({
      date:            new Date((i.endDate?.raw||0)*1000).getFullYear(),
      revenue:         safe(i.totalRevenue),    grossProfit:     safe(i.grossProfit),
      operatingIncome: safe(i.operatingIncome), netIncome:       safe(i.netIncome),
      eps:             r(safe(i.basicEps ?? i.dilutedEps)),
    })).filter(i => i.date);
    return {
      annual:    mapIS(s.incomeStatementHistory?.incomeStatementHistory),
      quarterly: mapIS(s.incomeStatementHistoryQuarterly?.incomeStatementHistory),
    };
  } catch { return { annual:[], quarterly:[] }; }
}

// ── Balance sheet (v10 with crumb) ────────────────────────────────────────────
async function getBalanceSheet(ticker) {
  const safe = (v) => { const raw=v?.raw??v; return Number.isFinite(Number(raw))?Number(raw):null; };
  try {
    const s = await fetchQuoteSummary(ticker, 'balanceSheetHistory');
    return (s.balanceSheetHistory?.balanceSheetStatements || []).map(b => ({
      date:             new Date((b.endDate?.raw||0)*1000).getFullYear(),
      totalAssets:      safe(b.totalAssets),    totalLiabilities: safe(b.totalLiab),
      equity:           safe(b.totalStockholderEquity), cash: safe(b.cash),
      currentRatio:     safe(b.totalCurrentAssets) && safe(b.totalCurrentLiabilities)
                          ? r(safe(b.totalCurrentAssets)/safe(b.totalCurrentLiabilities)) : null,
    })).filter(b => b.date);
  } catch { return []; }
}

// ── Cash flow (v10 with crumb) ────────────────────────────────────────────────
async function getCashFlow(ticker) {
  const safe = (v) => { const raw=v?.raw??v; return Number.isFinite(Number(raw))?Number(raw):null; };
  try {
    const s = await fetchQuoteSummary(ticker, 'cashflowStatementHistory');
    return (s.cashflowStatementHistory?.cashflowStatements || []).map(c => ({
      date:          new Date((c.endDate?.raw||0)*1000).getFullYear(),
      operatingCF:   safe(c.totalCashFromOperatingActivities),
      capEx:         safe(c.capitalExpenditures),
      freeCashFlow:  safe(c.totalCashFromOperatingActivities) != null
                      ? safe(c.totalCashFromOperatingActivities) + (safe(c.capitalExpenditures)||0) : null,
      dividendsPaid: safe(c.dividendsPaid),
    })).filter(c => c.date);
  } catch { return []; }
}

// ── Price cache (5 min TTL) ───────────────────────────────────────────────────
const priceCache = { data:{}, ts:0 };
const CACHE_TTL  = 5 * 60 * 1000;

async function getCachedBatchPrices(tickers) {
  const age = Date.now() - priceCache.ts;
  if (age < CACHE_TTL && Object.keys(priceCache.data).length > 0) {
    console.log(`📦 Cache hit (${Math.round(age/1000)}s old)`);
    return priceCache.data;
  }
  const fresh = await getBatchPrices(tickers);
  if (Object.keys(fresh).length > 0) { priceCache.data = fresh; priceCache.ts = Date.now(); }
  return fresh;
}

module.exports = {
  getBatchPrices, getCachedBatchPrices, getQuote, getTimeSeries,
  getFundamentalsData, getEarnings, getIncomeStatement, getBalanceSheet, getCashFlow,
  correctTicker, tdSymbol, r,
};

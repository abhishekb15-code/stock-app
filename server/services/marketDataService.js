/**
 * marketDataService.js
 * Uses Yahoo Finance v8 chart API — confirmed working on Render.
 * No API key needed. Free. No rate limits.
 */

const https = require('https');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function r(v, d = 2) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round(Number(v) * Math.pow(10, d)) / Math.pow(10, d);
}

function tdSymbol(ticker) {
  if (ticker.endsWith('.BO')) return `${ticker.replace('.BO','')}:BSE`;
  return `${ticker.replace('.NS','')}:NSE`;
}

function httpGet(url, headers = {}) {
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
      timeout: 15000,
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location)
        return httpGet(res.headers.location, headers).then(resolve).catch(reject);
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Fetch single ticker via Yahoo v8 chart (confirmed working on Render)
async function fetchYahooChart(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d&includePrePost=false`;
  const res = await httpGet(url);
  if (res.status !== 200) throw new Error(`Yahoo v8 HTTP ${res.status} for ${ticker}`);
  const data   = JSON.parse(res.body);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${ticker}`);
  const meta      = result.meta;
  const price     = meta.regularMarketPrice;
  if (!price || !Number.isFinite(price)) throw new Error(`Invalid price for ${ticker}`);
  const prevClose = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPreviousClose || price;
  return {
    price,
    previousClose: prevClose,
    change:        r(price - prevClose),
    changePercent: r(((price - prevClose) / prevClose) * 100),
    volume:        meta.regularMarketVolume || null,
    name:          meta.longName || meta.shortName || ticker,
    currency:      meta.currency || 'INR',
    exchange:      meta.exchangeName || 'NSE',
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || null,
    fiftyTwoWeekLow:  meta.fiftyTwoWeekLow  || null,
  };
}

// Batch fetch all prices — parallel with small delay to avoid throttling
async function getBatchPrices(tickers) {
  if (!tickers.length) return {};
  console.log(`💹 Fetching ${tickers.length} prices via Yahoo Finance v8...`);

  const result  = {};
  const BATCH   = 5;  // parallel requests per batch
  const DELAY   = 300; // ms between batches

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
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

// Single quote with full details
async function getQuote(ticker) {
  const q = await fetchYahooChart(ticker);
  return {
    ticker,
    displayTicker: ticker.replace('.NS','').replace('.BO',''),
    name:          q.name,
    exchange:      q.exchange,
    price:         r(q.price),
    previousClose: r(q.previousClose),
    change:        q.change,
    changePercent: q.changePercent,
    volume:        q.volume,
    fiftyTwoWeekHigh: r(q.fiftyTwoWeekHigh),
    fiftyTwoWeekLow:  r(q.fiftyTwoWeekLow),
  };
}

// Historical OHLCV via Yahoo v8 (same endpoint, longer range)
async function getTimeSeries(ticker, outputsize = 300) {
  const days    = outputsize;
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - (days * 86400);
  const url     = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${period1}&period2=${period2}`;
  const res     = await httpGet(url);
  if (res.status !== 200) throw new Error(`Yahoo v8 history HTTP ${res.status}`);
  const data   = JSON.parse(res.body);
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const ts   = result.timestamp || [];
  const ohlcv = result.indicators?.quote?.[0] || {};
  return ts.map((t, i) => ({
    date:   new Date(t * 1000).toISOString().split('T')[0],
    open:   r(ohlcv.open?.[i]),
    high:   r(ohlcv.high?.[i]),
    low:    r(ohlcv.low?.[i]),
    close:  r(ohlcv.close?.[i]),
    volume: ohlcv.volume?.[i] || 0,
  })).filter(v => v.close > 0);
}

// Fundamentals via Yahoo v10 quoteSummary
async function getFundamentalsData(ticker) {
  const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile';
  const url     = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
  try {
    const res  = await httpGet(url);
    if (res.status !== 200) throw new Error(`Yahoo v10 HTTP ${res.status}`);
    const data = JSON.parse(res.body);
    const s    = data?.quoteSummary?.result?.[0] || {};

    const sd  = s.summaryDetail          || {};
    const ks  = s.defaultKeyStatistics   || {};
    const fd  = s.financialData          || {};
    const pro = s.assetProfile           || {};

    const safe = (v) => {
      const raw = v?.raw ?? v;
      return Number.isFinite(Number(raw)) ? Number(raw) : null;
    };

    const targetPrice = safe(fd.targetMeanPrice);
    return {
      name:           pro.longName || pro.shortName || ticker,
      sector:         pro.sector   || 'Unknown',
      industry:       pro.industry || 'Unknown',
      description:    pro.longBusinessSummary || null,
      website:        pro.website || null,
      peRatio:        r(safe(sd.trailingPE) ?? safe(ks.trailingPE)),
      pbRatio:        r(safe(ks.priceToBook)),
      psRatio:        r(safe(ks.priceToSalesTrailing12Months)),
      evEbitda:       r(safe(ks.enterpriseToEbitda)),
      eps:            r(safe(ks.trailingEps)),
      revenueGrowth:  safe(fd.revenueGrowth)   != null ? r(safe(fd.revenueGrowth)*100)   : null,
      grossMargin:    safe(fd.grossMargins)     != null ? r(safe(fd.grossMargins)*100)    : null,
      operatingMargin:safe(fd.operatingMargins) != null ? r(safe(fd.operatingMargins)*100): null,
      netMargin:      safe(fd.profitMargins)    != null ? r(safe(fd.profitMargins)*100)   : null,
      roe:            safe(fd.returnOnEquity)   != null ? r(safe(fd.returnOnEquity)*100)  : null,
      roa:            safe(fd.returnOnAssets)   != null ? r(safe(fd.returnOnAssets)*100)  : null,
      debtToEquity:   r(safe(fd.debtToEquity)),
      currentRatio:   r(safe(fd.currentRatio)),
      freeCashFlow:   safe(fd.freeCashflow),
      marketCap:      safe(ks.enterpriseValue) || safe(sd.marketCap),
      beta:           r(safe(ks.beta)),
      dividendYield:  safe(sd.dividendYield) != null ? r(safe(sd.dividendYield)*100) : null,
      targetPrice:    r(targetPrice),
    };
  } catch (err) {
    console.warn(`Fundamentals failed for ${ticker}: ${err.message}`);
    return { name: ticker.replace('.NS','').replace('.BO',''), sector:'Unknown', industry:'Unknown' };
  }
}

// Earnings via Yahoo quoteSummary
async function getEarnings(ticker) {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=earningsHistory,earningsTrend`;
    const res = await httpGet(url);
    if (res.status !== 200) return [];
    const s   = JSON.parse(res.body)?.quoteSummary?.result?.[0] || {};
    const safe = (v) => { const raw=v?.raw??v; return Number.isFinite(Number(raw))?Number(raw):null; };
    return (s.earningsHistory?.history || []).map(h => ({
      date:        h.quarter?.fmt || new Date((h.quarter?.raw||0)*1000).toISOString().split('T')[0],
      epsActual:   r(safe(h.epsActual)),
      epsEstimate: r(safe(h.epsEstimate)),
      surprise:    r(safe(h.surprisePercent)),
    })).filter(h => h.date);
  } catch { return []; }
}

// Income statement via Yahoo
async function getIncomeStatement(ticker) {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=incomeStatementHistory,incomeStatementHistoryQuarterly`;
    const res = await httpGet(url);
    if (res.status !== 200) return { annual:[], quarterly:[] };
    const s    = JSON.parse(res.body)?.quoteSummary?.result?.[0] || {};
    const safe = (v) => { const raw=v?.raw??v; return Number.isFinite(Number(raw))?Number(raw):null; };
    const mapIS = items => (items||[]).map(i => ({
      date:            new Date((i.endDate?.raw||0)*1000).getFullYear(),
      revenue:         safe(i.totalRevenue),
      grossProfit:     safe(i.grossProfit),
      operatingIncome: safe(i.operatingIncome),
      netIncome:       safe(i.netIncome),
      eps:             r(safe(i.basicEps ?? i.dilutedEps)),
    })).filter(i => i.date);
    return {
      annual:    mapIS(s.incomeStatementHistory?.incomeStatementHistory),
      quarterly: mapIS(s.incomeStatementHistoryQuarterly?.incomeStatementHistory),
    };
  } catch { return { annual:[], quarterly:[] }; }
}

// Balance sheet via Yahoo
async function getBalanceSheet(ticker) {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=balanceSheetHistory`;
    const res = await httpGet(url);
    if (res.status !== 200) return [];
    const s    = JSON.parse(res.body)?.quoteSummary?.result?.[0] || {};
    const safe = (v) => { const raw=v?.raw??v; return Number.isFinite(Number(raw))?Number(raw):null; };
    return (s.balanceSheetHistory?.balanceSheetStatements || []).map(b => ({
      date:             new Date((b.endDate?.raw||0)*1000).getFullYear(),
      totalAssets:      safe(b.totalAssets),
      totalLiabilities: safe(b.totalLiab),
      equity:           safe(b.totalStockholderEquity),
      cash:             safe(b.cash),
      currentRatio:     safe(b.totalCurrentAssets) && safe(b.totalCurrentLiabilities)
                          ? r(safe(b.totalCurrentAssets)/safe(b.totalCurrentLiabilities)) : null,
    })).filter(b => b.date);
  } catch { return []; }
}

// Cash flow via Yahoo
async function getCashFlow(ticker) {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=cashflowStatementHistory`;
    const res = await httpGet(url);
    if (res.status !== 200) return [];
    const s    = JSON.parse(res.body)?.quoteSummary?.result?.[0] || {};
    const safe = (v) => { const raw=v?.raw??v; return Number.isFinite(Number(raw))?Number(raw):null; };
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

// Price cache (5 min TTL)
const priceCache = { data:{}, ts:0 };
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

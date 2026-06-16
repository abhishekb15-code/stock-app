/**
 * yahooFetch.js
 * Direct HTTP fetcher for Yahoo Finance APIs — no cookies, no crumb needed.
 * Works on Render, GitHub Actions, and any cloud server.
 */

const https = require('https');

function httpGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://finance.yahoo.com',
        'Referer': 'https://finance.yahoo.com/',
        ...extraHeaders,
      },
      timeout: 15000,
    }, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return httpGet(res.headers.location, extraHeaders).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/**
 * Fetch real-time quote for a ticker
 * Returns: { price, previousClose, change, changePercent, volume, marketCap, name, sector }
 */
async function fetchQuote(ticker) {
  // Try v8 chart endpoint (no cookie needed)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d&includePrePost=false`;
  const res = await httpGet(url);

  if (res.status !== 200) throw new Error(`Yahoo Finance returned HTTP ${res.status} for ${ticker}`);

  const data = JSON.parse(res.body);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data returned for ${ticker}`);

  const meta = result.meta;
  const price = meta.regularMarketPrice;
  if (!price || !Number.isFinite(price)) throw new Error(`No valid price for ${ticker}`);

  const previousClose = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPreviousClose || price;
  const change        = price - previousClose;
  const changePercent = (change / previousClose) * 100;

  return {
    ticker,
    price,
    previousClose,
    change:        Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    volume:        meta.regularMarketVolume || null,
    marketCap:     meta.marketCap || null,
    name:          meta.longName || meta.shortName || ticker,
    currency:      meta.currency || 'INR',
    exchange:      meta.exchangeName || meta.fullExchangeName || 'NSE',
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || null,
    fiftyTwoWeekLow:  meta.fiftyTwoWeekLow  || null,
  };
}

/**
 * Fetch OHLCV historical data
 * Returns array of { date, open, high, low, close, volume }
 */
async function fetchHistorical(ticker, days = 430) {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - (days * 86400);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${period1}&period2=${period2}`;

  const res = await httpGet(url);
  if (res.status !== 200) throw new Error(`Historical fetch failed for ${ticker}: HTTP ${res.status}`);

  const data   = JSON.parse(res.body);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No historical data for ${ticker}`);

  const timestamps = result.timestamp || [];
  const ohlcv      = result.indicators?.quote?.[0] || {};

  return timestamps.map((ts, i) => ({
    date:   new Date(ts * 1000).toISOString().split('T')[0],
    open:   Math.round((ohlcv.open?.[i]  || 0) * 100) / 100,
    high:   Math.round((ohlcv.high?.[i]  || 0) * 100) / 100,
    low:    Math.round((ohlcv.low?.[i]   || 0) * 100) / 100,
    close:  Math.round((ohlcv.close?.[i] || 0) * 100) / 100,
    volume: ohlcv.volume?.[i] || 0,
  })).filter(r => r.close > 0);
}

/**
 * Fetch fundamentals via v10 quoteSummary (no cookie needed on Render)
 * modules: comma-separated list
 */
async function fetchQuoteSummary(ticker, modules) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&corsDomain=finance.yahoo.com`;
  const res = await httpGet(url);
  if (res.status !== 200) throw new Error(`quoteSummary failed for ${ticker}: HTTP ${res.status}`);
  const data = JSON.parse(res.body);
  if (data?.quoteSummary?.error) throw new Error(data.quoteSummary.error.description || 'quoteSummary error');
  return data?.quoteSummary?.result?.[0] || {};
}

/**
 * Batch fetch prices for multiple tickers (uses v7 spark endpoint — very fast)
 */
async function fetchBatchQuotes(tickers) {
  const symbols = tickers.join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,shortName,longName`;
  const res = await httpGet(url);
  if (res.status !== 200) return {};

  const quotes  = JSON.parse(res.body)?.quoteResponse?.result || [];
  const result  = {};
  quotes.forEach(q => {
    result[q.symbol] = {
      price:         q.regularMarketPrice,
      change:        q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
      volume:        q.regularMarketVolume,
      marketCap:     q.marketCap,
      name:          q.longName || q.shortName,
    };
  });
  return result;
}

module.exports = { fetchQuote, fetchHistorical, fetchQuoteSummary, fetchBatchQuotes };

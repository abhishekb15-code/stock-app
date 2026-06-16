/**
 * indianMarketData.js
 * Uses yahooFetch.js (direct HTTP) instead of yahoo-finance2 npm package.
 * Works on Render, GitHub Actions, and any cloud server without cookie issues.
 */

const { fetchQuote, fetchHistorical, fetchQuoteSummary } = require('./yahooFetch');

const DEFAULT_EXCHANGE_SUFFIX = '.NS';

// ── Symbol helpers ─────────────────────────────────────────────────────────────

function normalizeSymbol(input) {
  if (!input || typeof input !== 'string') throw new Error('A stock symbol is required');
  const symbol = input.trim().toUpperCase().replace(/\s+/g, '');
  if (!symbol) throw new Error('A stock symbol is required');
  if (symbol.startsWith('^') || symbol.endsWith('.NS') || symbol.endsWith('.BO')) return symbol;
  return `${symbol}${DEFAULT_EXCHANGE_SUFFIX}`;
}

function displaySymbol(symbol) {
  return normalizeSymbol(symbol).replace(DEFAULT_EXCHANGE_SUFFIX, '');
}

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * Math.pow(10, digits)) / Math.pow(10, digits);
}

function compactCurrency(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `₹${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `₹${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e7)  return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5)  return `₹${(value / 1e5).toFixed(2)} L`;
  return `₹${value.toFixed(2)}`;
}

// ── Technical indicator calculations ──────────────────────────────────────────

function calcSMA(values, period) {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function calcEMA(values, period) {
  const k = 2 / (period + 1);
  const ema = new Array(values.length).fill(null);
  let startIdx = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i] != null) { startIdx = i; break; }
  }
  if (startIdx === -1 || startIdx + period > values.length) return ema;
  let sum = 0;
  for (let i = startIdx; i < startIdx + period; i++) sum += values[i];
  ema[startIdx + period - 1] = sum / period;
  for (let i = startIdx + period; i < values.length; i++) {
    ema[i] = values[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calcRSI(values, period = 14) {
  const rsi = new Array(values.length).fill(null);
  if (values.length < period + 1) return rsi;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function calcMACD(values, fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMA(values, fast);
  const emaSlow = calcEMA(values, slow);
  const macdLine = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null);
  const signalLine = calcEMA(macdLine.map(v => v ?? 0), signal);
  const histogram  = macdLine.map((v, i) =>
    v != null && signalLine[i] != null ? v - signalLine[i] : null);
  return { macdLine, signal: signalLine, histogram };
}

function calcBollingerBands(values, period = 20, mult = 2) {
  const sma   = calcSMA(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean  = sma[i];
    const std   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    upper[i] = mean + mult * std;
    lower[i] = mean - mult * std;
  }
  return { upper, middle: sma, lower };
}

function lastNumber(arr) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null && Number.isFinite(arr[i])) return arr[i];
  }
  return null;
}

// ── Core data functions ────────────────────────────────────────────────────────

async function getQuote(input) {
  const symbol = normalizeSymbol(input);
  const q = await fetchQuote(symbol);
  return {
    ticker:        symbol,
    displayTicker: displaySymbol(symbol),
    yahooSymbol:   symbol,
    name:          q.name,
    sector:        'Unknown',
    exchange:      q.exchange || 'NSE',
    currency:      q.currency || 'INR',
    price:         round(q.price),
    previousClose: round(q.previousClose),
    change:        round(q.change),
    changePercent: round(q.changePercent),
    volume:        q.volume || null,
    marketCap:     q.marketCap || null,
  };
}

async function getAssetProfile(input) {
  try {
    const symbol  = normalizeSymbol(input);
    const summary = await fetchQuoteSummary(symbol, 'assetProfile');
    return summary.assetProfile || {};
  } catch {
    return {};
  }
}

async function getHistorical(input) {
  const symbol = normalizeSymbol(input);
  const rows   = await fetchHistorical(symbol, 430);
  return rows.filter(r => Number.isFinite(r.close) && r.close > 0)
             .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function getStockAnalysis(input) {
  const quote = await getQuote(input);
  const ohlcv = await getHistorical(quote.ticker);

  if (ohlcv.length < 30) {
    throw new Error(`Not enough historical data for ${quote.ticker} (got ${ohlcv.length} days)`);
  }

  const closes = ohlcv.map(d => d.close);
  const highs  = ohlcv.map(d => d.high).filter(Number.isFinite);
  const lows   = ohlcv.map(d => d.low).filter(Number.isFinite);

  const ema20    = calcEMA(closes, 20);
  const ema50    = calcEMA(closes, 50);
  const ema200   = calcEMA(closes, 200);
  const sma20    = calcSMA(closes, 20);
  const sma50    = calcSMA(closes, 50);
  const rsi      = calcRSI(closes, 14);
  const macd     = calcMACD(closes);
  const boll     = calcBollingerBands(closes, 20);

  const currentPrice = quote.price || closes[closes.length - 1];
  const lastRSI      = lastNumber(rsi);
  const lastEma50    = lastNumber(ema50);
  const trendSignal  = currentPrice >= (lastEma50 || currentPrice) ? 'Bullish' : 'Bearish';
  const rsiSignal    = lastRSI > 70 ? 'Overbought' : lastRSI < 30 ? 'Oversold' : 'Neutral';

  // Try to get sector from profile
  let sector = 'Unknown';
  try {
    const profile = await getAssetProfile(quote.ticker);
    sector = profile.sector || 'Unknown';
  } catch { /* use Unknown */ }

  return {
    ticker:        quote.ticker,
    displayTicker: quote.displayTicker,
    yahooSymbol:   quote.yahooSymbol,
    name:          quote.name,
    sector,
    exchange:      quote.exchange,
    currency:      quote.currency,
    price:         round(currentPrice),
    change:        quote.change,
    changePercent: quote.changePercent,
    technical: {
      rsi:    { value: round(lastRSI, 2), signal: rsiSignal },
      macd: {
        value:     round(lastNumber(macd.macdLine), 3),
        signal:    round(lastNumber(macd.signal), 3),
        histogram: round(lastNumber(macd.histogram), 3),
        macd:      round(lastNumber(macd.macdLine), 3),
      },
      ema: {
        ema20:  round(lastNumber(ema20)),
        ema50:  round(lastNumber(ema50)),
        ema200: round(lastNumber(ema200)),
      },
      sma: {
        sma20: round(lastNumber(sma20)),
        sma50: round(lastNumber(sma50)),
      },
      bollingerBands: {
        upper:  round(lastNumber(boll.upper)),
        middle: round(lastNumber(boll.middle)),
        lower:  round(lastNumber(boll.lower)),
      },
      trend:      trendSignal,
      support:    round(Math.min(...lows.slice(-60))),
      resistance: round(Math.max(...highs.slice(-60))),
    },
    chartData: ohlcv.map((day, i) => ({
      ...day,
      ema20:          round(ema20[i]),
      ema50:          round(ema50[i]),
      ema200:         round(ema200[i]),
      sma20:          round(sma20[i]),
      sma50:          round(sma50[i]),
      rsi:            round(rsi[i]),
      macd:           round(macd.macdLine[i], 3),
      macdSignal:     round(macd.signal[i], 3),
      macdHistogram:  round(macd.histogram[i], 3),
      bollingerUpper: round(boll.upper[i]),
      bollingerMiddle:round(boll.middle[i]),
      bollingerLower: round(boll.lower[i]),
    })),
  };
}

async function getFundamentals(input) {
  const quote = await getQuote(input);
  let summaryData = {};

  try {
    summaryData = await fetchQuoteSummary(
      quote.ticker,
      'summaryDetail,defaultKeyStatistics,financialData,assetProfile'
    );
  } catch (err) {
    console.warn(`Fundamentals fetch warning for ${quote.ticker}: ${err.message}`);
  }

  const sd  = summaryData.summaryDetail      || {};
  const ks  = summaryData.defaultKeyStatistics || {};
  const fd  = summaryData.financialData      || {};
  const pro = summaryData.assetProfile       || {};

  const targetMeanPrice = fd.targetMeanPrice?.raw ?? fd.targetMeanPrice;
  const fairValue = Number.isFinite(Number(targetMeanPrice)) ? Number(targetMeanPrice) : quote.price;
  const upside    = quote.price ? ((fairValue - quote.price) / quote.price) * 100 : 0;
  const valuationScore = upside > 10 ? 'Undervalued' : upside < -10 ? 'Overvalued' : 'Fairly Valued';

  const safe = (v) => {
    const raw = v?.raw ?? v;
    return Number.isFinite(Number(raw)) ? Number(raw) : null;
  };

  return {
    ticker:        quote.ticker,
    displayTicker: quote.displayTicker,
    name:          quote.name,
    sector:        pro.sector || quote.sector || 'Unknown',
    industry:      pro.industry || pro.industryDisp || 'Unknown',
    fundamentals: {
      peRatio:       round(safe(sd.trailingPE) ?? safe(ks.trailingPE), 2),
      pbRatio:       round(safe(ks.priceToBook), 2),
      eps:           round(safe(ks.trailingEps), 2),
      revenueGrowth: round(safe(fd.revenueGrowth) != null ? safe(fd.revenueGrowth) * 100 : null, 2),
      debtToEquity:  round(safe(fd.debtToEquity), 2),
      profitMargin:  round(safe(fd.profitMargins) != null ? safe(fd.profitMargins) * 100 : null, 2),
      roe:           round(safe(fd.returnOnEquity) != null ? safe(fd.returnOnEquity) * 100 : null, 2),
      freeCashFlow:  compactCurrency(safe(fd.freeCashflow)),
      beta:          round(safe(ks.beta), 2),
      dividendYield: round(safe(sd.dividendYield) != null ? safe(sd.dividendYield) * 100 : null, 2),
      marketCap:     compactCurrency(quote.marketCap),
    },
    valuation: {
      currentPrice: quote.price,
      fairValue:    round(fairValue),
      upside:       round(upside, 1),
      score:        valuationScore,
      reasoning: Number.isFinite(Number(targetMeanPrice))
        ? `Analyst consensus target ₹${round(fairValue)} implies ${round(upside, 1)}% ${upside >= 0 ? 'upside' : 'downside'} from current price.`
        : 'No analyst target available. Fair value shown as current live price.',
    },
  };
}

async function getDevelopments(input) {
  const quote   = await getQuote(input);
  const profile = await getAssetProfile(quote.ticker);

  const summary = profile.longBusinessSummary
    ? profile.longBusinessSummary.split('. ').slice(0, 2).join('. ') + '.'
    : `${quote.name} is listed on ${quote.exchange}.`;

  return {
    ticker:                  quote.ticker,
    displayTicker:           quote.displayTicker,
    company:                 quote.name,
    sector:                  profile.sector || quote.sector || 'Unknown',
    industry:                profile.industry || 'Unknown',
    website:                 profile.website || null,
    summary,
    significantDevelopments: [],
    industrySummary:         `${profile.industry || 'The sector'} is part of the ${profile.sector || 'broader market'}. Monitor policy, commodity prices, and earnings for sector-wide signals.`,
    lastUpdated:             new Date().toISOString(),
  };
}

function getPortfolioHoldings() {
  // Fallback only — real holdings come from db.js seed
  return [
    { id:'1', ticker:'RELIANCE.NS', shares:10,  avgBuyPrice:2850, purchaseDate:'2024-06-15', notes:'' },
    { id:'2', ticker:'TCS.NS',      shares:5,   avgBuyPrice:3900, purchaseDate:'2024-07-10', notes:'' },
    { id:'3', ticker:'INFY.NS',     shares:12,  avgBuyPrice:1450, purchaseDate:'2024-08-05', notes:'' },
    { id:'4', ticker:'HDFCBANK.NS', shares:15,  avgBuyPrice:1600, purchaseDate:'2024-09-12', notes:'' },
  ];
}

function getWhaleSignals() { return []; }

function generateRecommendation(ticker, technical, fundamentals) {
  const rsi           = technical?.rsi?.value || 50;
  const trend         = technical?.trend || 'Neutral';
  const valuation     = fundamentals?.valuation?.score || 'Fairly Valued';
  const upside        = fundamentals?.valuation?.upside || 0;
  const macdHist      = technical?.macd?.histogram || 0;
  const currentPrice  = fundamentals?.valuation?.currentPrice || 0;
  const ema200        = technical?.ema?.ema200 || currentPrice;
  const aboveEma200   = currentPrice >= ema200;

  const reasons = [];
  let score = 0;

  // Trend
  if (trend === 'Bullish') { score += 2; reasons.push({ type:'bullish', text:`Price is in a bullish trend (above EMA50)` }); }
  else { score -= 1; reasons.push({ type:'bearish', text:`Price is in a bearish trend (below EMA50)` }); }

  // EMA200
  if (aboveEma200) { score += 1; reasons.push({ type:'bullish', text:`Trading above 200-day EMA — long-term uptrend intact` }); }
  else { score -= 1; reasons.push({ type:'bearish', text:`Below 200-day EMA — long-term downtrend` }); }

  // MACD
  if (macdHist > 0) { score += 1; reasons.push({ type:'bullish', text:`MACD histogram positive — bullish momentum` }); }
  else { score -= 1; reasons.push({ type:'bearish', text:`MACD histogram negative — bearish momentum` }); }

  // RSI
  if (rsi < 35)      { score += 1; reasons.push({ type:'bullish', text:`RSI ${round(rsi,0)} — oversold, potential reversal opportunity` }); }
  else if (rsi > 70) { score -= 2; reasons.push({ type:'bearish', text:`RSI ${round(rsi,0)} — overbought, risk of pullback` }); }
  else               { reasons.push({ type:'neutral', text:`RSI ${round(rsi,0)} — neutral zone` }); }

  // Valuation
  if (valuation === 'Undervalued') { score += 2; reasons.push({ type:'bullish', text:`${upside > 0 ? upside.toFixed(1)+'%' : ''} upside to analyst target — undervalued` }); }
  else if (valuation === 'Overvalued') { score -= 2; reasons.push({ type:'bearish', text:`Trading above analyst target — overvalued by ${Math.abs(upside).toFixed(1)}%` }); }
  else { reasons.push({ type:'neutral', text:`Fairly valued near analyst target price` }); }

  let recommendation = 'hold';
  if (score >= 4) recommendation = 'buy';
  else if (score <= -2) recommendation = 'sell';

  const display = displaySymbol(ticker);
  return {
    ticker:            normalizeSymbol(ticker),
    displayTicker:     display,
    recommendation,
    confidence:        round(Math.min(0.95, Math.max(0.5, 0.55 + Math.abs(score) * 0.07)), 2),
    reasons,
    technicalSummary:  `RSI: ${round(rsi,0)} (${technical?.rsi?.signal}), Trend: ${trend}, MACD: ${macdHist > 0 ? 'Positive' : 'Negative'}`,
    fundamentalSummary:`${valuation} | Fair Value: ₹${fundamentals?.valuation?.fairValue} | Upside: ${round(upside,1)}%`,
    aiSummary:         `${display}: ${trend.toLowerCase()} trend, RSI ${round(rsi,0)}, ${valuation.toLowerCase()} vs analyst target. ${reasons[0]?.text || ''}`,
  };
}

module.exports = {
  normalizeSymbol, displaySymbol, round, compactCurrency,
  getQuote, getAssetProfile, getHistorical,
  getStockAnalysis, getFundamentals, getDevelopments,
  getPortfolioHoldings, getWhaleSignals, generateRecommendation,
};

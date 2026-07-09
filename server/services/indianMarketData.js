/**
 * indianMarketData.js — uses Twelve Data via marketDataService.js
 * All Yahoo Finance calls removed. Works on Render + GitHub Actions.
 */

const mds = require('./marketDataService');

const DEFAULT_EXCHANGE_SUFFIX = '.NS';

function normalizeSymbol(input) {
  if (!input || typeof input !== 'string') throw new Error('A stock symbol is required');
  const symbol = input.trim().toUpperCase().replace(/\s+/g, '');
  if (!symbol) throw new Error('A stock symbol is required');
  if (symbol.startsWith('^') || symbol.endsWith('.NS') || symbol.endsWith('.BO')) return symbol;
  // Pure-numeric input is a BSE scrip code (e.g. 504132) → BSE, not NSE.
  if (/^\d+$/.test(symbol)) return `${symbol}.BO`;
  return `${symbol}${DEFAULT_EXCHANGE_SUFFIX}`;
}

// Trim/upper a symbol WITHOUT forcing an exchange suffix. Used to store a
// symbol that has already been resolved (so a bare US ticker like AAPL is
// stored as-is instead of being turned into AAPL.NS).
function cleanSymbol(input) {
  if (!input || typeof input !== 'string') throw new Error('A stock symbol is required');
  const s = input.trim().toUpperCase().replace(/\s+/g, '');
  if (!s) throw new Error('A stock symbol is required');
  return s;
}

// Resolve a user-typed symbol to the market that actually has a live quote.
// - explicit suffix (.NS/.BO/.L/.DE/…) or index (^) → used as-is
// - numeric BSE scrip code → BSE
// - plain symbol → try NSE, then BSE, then bare (US / global)
// Returns the working Yahoo symbol, or throws if none has it.
async function resolveSymbol(input) {
  const raw = cleanSymbol(input);

  let candidates;
  if (raw.startsWith('^') || raw.includes('.')) candidates = [raw];        // already exchange-qualified
  else if (/^\d+$/.test(raw)) candidates = [`${raw}.BO`, `${raw}.NS`];     // numeric → BSE
  else candidates = [`${raw}.NS`, `${raw}.BO`, raw];                       // Indian first, then US/global bare

  for (const sym of candidates) {
    try {
      const q = await mds.getQuote(sym);
      if (q && Number.isFinite(q.price) && q.price > 0) return sym;
    } catch { /* try next */ }
  }
  throw new Error(`No quote found for ${raw} on NSE, BSE, or global markets`);
}

function displaySymbol(symbol) {
  return normalizeSymbol(symbol).replace(DEFAULT_EXCHANGE_SUFFIX, '');
}

function round(value, digits = 2) {
  return mds.r(value, digits);
}

function compactCurrency(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `₹${(value/1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `₹${(value/1e9).toFixed(2)}B`;
  if (abs >= 1e7)  return `₹${(value/1e7).toFixed(2)} Cr`;
  if (abs >= 1e5)  return `₹${(value/1e5).toFixed(2)} L`;
  return `₹${value.toFixed(2)}`;
}

// ── Technical indicators ───────────────────────────────────────────────────────

function calcEMA(values, period) {
  const k = 2 / (period + 1);
  const ema = new Array(values.length).fill(null);
  let start = values.findIndex(v => v != null);
  if (start === -1 || start + period > values.length) return ema;
  let sum = 0;
  for (let i = start; i < start + period; i++) sum += values[i];
  ema[start + period - 1] = sum / period;
  for (let i = start + period; i < values.length; i++)
    ema[i] = values[i] * k + ema[i-1] * (1-k);
  return ema;
}

function calcSMA(values, period) {
  return values.map((_,i) => {
    if (i < period-1) return null;
    return values.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period;
  });
}

function calcRSI(values, period = 14) {
  const rsi = new Array(values.length).fill(null);
  if (values.length < period+1) return rsi;
  let gains=0, losses=0;
  for (let i=1;i<=period;i++) {
    const d=values[i]-values[i-1];
    if(d>0) gains+=d; else losses-=d;
  }
  let ag=gains/period, al=losses/period;
  rsi[period] = al===0 ? 100 : 100-100/(1+ag/al);
  for (let i=period+1;i<values.length;i++) {
    const d=values[i]-values[i-1];
    ag=(ag*(period-1)+Math.max(d,0))/period;
    al=(al*(period-1)+Math.max(-d,0))/period;
    rsi[i] = al===0 ? 100 : 100-100/(1+ag/al);
  }
  return rsi;
}

function calcMACD(values, fast=12, slow=26, signal=9) {
  const emaFast = calcEMA(values, fast);
  const emaSlow = calcEMA(values, slow);
  const macdLine = values.map((_,i) =>
    emaFast[i]!=null && emaSlow[i]!=null ? emaFast[i]-emaSlow[i] : null);
  const signalLine = calcEMA(macdLine.map(v=>v??0), signal);
  const histogram  = macdLine.map((v,i) =>
    v!=null && signalLine[i]!=null ? v-signalLine[i] : null);
  return { macdLine, signal: signalLine, histogram };
}

function calcBollingerBands(values, period=20, mult=2) {
  const sma=calcSMA(values,period);
  const upper=new Array(values.length).fill(null);
  const lower=new Array(values.length).fill(null);
  for (let i=period-1;i<values.length;i++) {
    const slice=values.slice(i-period+1,i+1);
    const std=Math.sqrt(slice.reduce((s,v)=>s+(v-sma[i])**2,0)/period);
    upper[i]=sma[i]+mult*std; lower[i]=sma[i]-mult*std;
  }
  return {upper,middle:sma,lower};
}

function last(arr) {
  if (!arr) return null;
  for (let i=arr.length-1;i>=0;i--)
    if (arr[i]!=null && Number.isFinite(arr[i])) return arr[i];
  return null;
}

// ── Exported functions ─────────────────────────────────────────────────────────

async function getQuote(input) {
  const symbol = await resolveSymbol(input);
  const q = await mds.getQuote(symbol);
  return {
    ticker:        symbol,
    displayTicker: displaySymbol(symbol),
    yahooSymbol:   symbol,
    name:          q.name,
    sector:        'Unknown',
    exchange:      q.exchange || 'NSE',
    currency:      q.currency || 'INR',
    price:         q.price,
    previousClose: q.previousClose,
    change:        q.change,
    changePercent: q.changePercent,
    volume:        q.volume,
    marketCap:     null,
  };
}

async function getAssetProfile(input) {
  const symbol = await resolveSymbol(input);
  try {
    const f = await mds.getFundamentalsData(symbol);
    return {
      sector:               f.sector,
      industry:             f.industry,
      website:              f.website,
      longBusinessSummary:  f.description,
    };
  } catch {
    return {};
  }
}

async function getStockAnalysis(input) {
  const symbol = await resolveSymbol(input);

  const [quoteResult, ohlcvResult, fundResult] = await Promise.allSettled([
    mds.getQuote(symbol),
    mds.getTimeSeries(symbol, 300),
    mds.getFundamentalsData(symbol),
  ]);

  if (quoteResult.status === 'rejected') throw new Error(`Quote failed: ${quoteResult.reason.message}`);

  const q    = quoteResult.value;
  const ohlcv = ohlcvResult.status === 'fulfilled' ? ohlcvResult.value : [];
  const fund  = fundResult.status  === 'fulfilled' ? fundResult.value  : {};

  const closes = ohlcv.map(d=>d.close);
  const highs  = ohlcv.map(d=>d.high).filter(Number.isFinite);
  const lows   = ohlcv.map(d=>d.low).filter(Number.isFinite);

  const ema20  = calcEMA(closes, 20);
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const sma20  = calcSMA(closes, 20);
  const sma50  = calcSMA(closes, 50);
  const rsi    = calcRSI(closes, 14);
  const macd   = calcMACD(closes);
  const boll   = calcBollingerBands(closes, 20);

  const currentPrice = q.price || closes[closes.length-1] || 0;
  const lastRSI      = last(rsi);
  const lastEma50    = last(ema50);
  const trendSignal  = currentPrice >= (lastEma50||currentPrice) ? 'Bullish' : 'Bearish';
  const rsiSignal    = lastRSI>70 ? 'Overbought' : lastRSI<30 ? 'Oversold' : 'Neutral';

  return {
    ticker:        symbol,
    displayTicker: displaySymbol(symbol),
    yahooSymbol:   symbol,
    name:          q.name || fund.name || symbol,
    sector:        fund.sector || 'Unknown',
    exchange:      q.exchange || 'NSE',
    currency:      q.currency || 'INR',
    price:         round(currentPrice),
    change:        q.change,
    changePercent: q.changePercent,
    technical: {
      rsi:    { value: round(lastRSI,2), signal: rsiSignal },
      macd: {
        value:     round(last(macd.macdLine),3),
        signal:    round(last(macd.signal),3),
        histogram: round(last(macd.histogram),3),
        macd:      round(last(macd.macdLine),3),
      },
      ema: { ema20:round(last(ema20)), ema50:round(last(ema50)), ema200:round(last(ema200)) },
      sma: { sma20:round(last(sma20)), sma50:round(last(sma50)) },
      bollingerBands: { upper:round(last(boll.upper)), middle:round(last(boll.middle)), lower:round(last(boll.lower)) },
      trend:      trendSignal,
      support:    lows.length  ? round(Math.min(...lows.slice(-60)))  : null,
      resistance: highs.length ? round(Math.max(...highs.slice(-60))) : null,
    },
    chartData: ohlcv.map((day,i) => ({
      ...day,
      ema20:round(ema20[i]), ema50:round(ema50[i]), ema200:round(ema200[i]),
      sma20:round(sma20[i]), sma50:round(sma50[i]),
      rsi:round(rsi[i]),
      macd:round(macd.macdLine[i],3), macdSignal:round(macd.signal[i],3), macdHistogram:round(macd.histogram[i],3),
      bollingerUpper:round(boll.upper[i]), bollingerMiddle:round(boll.middle[i]), bollingerLower:round(boll.lower[i]),
    })),
  };
}

async function getFundamentals(input) {
  const symbol = await resolveSymbol(input);
  const [quoteRes, fundRes] = await Promise.allSettled([
    mds.getQuote(symbol),
    mds.getFundamentalsData(symbol),
  ]);

  const q = quoteRes.status==='fulfilled' ? quoteRes.value : { price:0, name:symbol };
  const f = fundRes.status==='fulfilled'  ? fundRes.value  : {};

  const targetPrice = f.targetPrice;
  const fairValue   = targetPrice && targetPrice>0 ? targetPrice : q.price;
  const upside      = q.price ? ((fairValue-q.price)/q.price)*100 : 0;
  const valScore    = upside>10 ? 'Undervalued' : upside<-10 ? 'Overvalued' : 'Fairly Valued';

  return {
    ticker:        symbol,
    displayTicker: displaySymbol(symbol),
    name:          q.name || f.name || symbol,
    sector:        f.sector   || 'Unknown',
    industry:      f.industry || 'Unknown',
    fundamentals: {
      peRatio:       f.peRatio,
      pbRatio:       f.pbRatio,
      eps:           f.eps,
      revenueGrowth: f.revenueGrowth,
      debtToEquity:  f.debtToEquity,
      profitMargin:  f.netMargin,
      roe:           f.roe,
      freeCashFlow:  compactCurrency(f.freeCashFlow),
      beta:          f.beta,
      dividendYield: f.dividendYield,
      marketCap:     f.marketCap ? compactCurrency(f.marketCap) : 'N/A',
    },
    valuation: {
      currentPrice: q.price,
      fairValue:    round(fairValue),
      upside:       round(upside,1),
      score:        valScore,
      reasoning: targetPrice && targetPrice>0
        ? `Analyst target ₹${round(fairValue)} implies ${round(upside,1)}% ${upside>=0?'upside':'downside'} from current price.`
        : 'No analyst target available from data provider.',
    },
  };
}

async function getDevelopments(input) {
  const symbol  = await resolveSymbol(input);
  const [q, profile] = await Promise.allSettled([getQuote(symbol), getAssetProfile(symbol)]);
  const quote   = q.status==='fulfilled' ? q.value : { name:symbol, exchange:'NSE', sector:'Unknown' };
  const prof    = profile.status==='fulfilled' ? profile.value : {};

  return {
    ticker:                  symbol,
    displayTicker:           displaySymbol(symbol),
    company:                 quote.name,
    sector:                  prof.sector   || 'Unknown',
    industry:                prof.industry || 'Unknown',
    website:                 prof.website  || null,
    summary:                 prof.longBusinessSummary || `${quote.name} is listed on NSE.`,
    significantDevelopments: [],
    industrySummary:         `Monitor sector trends, regulatory changes, and earnings for signals.`,
    lastUpdated:             new Date().toISOString(),
  };
}

function getPortfolioHoldings() {
  return [
    { id:'1', ticker:'RELIANCE.NS', shares:10,  avgBuyPrice:2850, purchaseDate:'2024-06-15', notes:'' },
    { id:'2', ticker:'TCS.NS',      shares:5,   avgBuyPrice:3900, purchaseDate:'2024-07-10', notes:'' },
    { id:'3', ticker:'INFY.NS',     shares:12,  avgBuyPrice:1450, purchaseDate:'2024-08-05', notes:'' },
    { id:'4', ticker:'HDFCBANK.NS', shares:15,  avgBuyPrice:1600, purchaseDate:'2024-09-12', notes:'' },
  ];
}

function getWhaleSignals() { return []; }

function generateRecommendation(ticker, technical, fundamentals) {
  const rsi        = technical?.rsi?.value || 50;
  const trend      = technical?.trend || 'Neutral';
  const valuation  = fundamentals?.valuation?.score || 'Fairly Valued';
  const upside     = fundamentals?.valuation?.upside || 0;
  const macdHist   = technical?.macd?.histogram || 0;
  const price      = fundamentals?.valuation?.currentPrice || 0;
  const ema200     = technical?.ema?.ema200 || price;
  const aboveEma200 = price >= ema200;

  const reasons = [];
  let score = 0;

  if (trend==='Bullish') { score+=2; reasons.push({type:'bullish', text:'Price above EMA50 — bullish trend confirmed'}); }
  else                   { score-=1; reasons.push({type:'bearish', text:'Price below EMA50 — bearish trend'}); }

  if (aboveEma200) { score+=1; reasons.push({type:'bullish', text:'Above 200-day EMA — long-term uptrend intact'}); }
  else             { score-=1; reasons.push({type:'bearish', text:'Below 200-day EMA — long-term downtrend'}); }

  if (macdHist>0) { score+=1; reasons.push({type:'bullish', text:`MACD histogram +${round(macdHist,3)} — bullish momentum`}); }
  else            { score-=1; reasons.push({type:'bearish', text:`MACD histogram ${round(macdHist,3)} — bearish momentum`}); }

  if (rsi<35)      { score+=1; reasons.push({type:'bullish', text:`RSI ${round(rsi,0)} — oversold, potential buy zone`}); }
  else if (rsi>70) { score-=2; reasons.push({type:'bearish', text:`RSI ${round(rsi,0)} — overbought, pullback risk`}); }
  else             { reasons.push({type:'neutral',  text:`RSI ${round(rsi,0)} — neutral zone`}); }

  if (valuation==='Undervalued')  { score+=2; reasons.push({type:'bullish', text:`${round(upside,1)}% upside to analyst target — undervalued`}); }
  else if (valuation==='Overvalued') { score-=2; reasons.push({type:'bearish', text:`${Math.abs(round(upside,1))}% above analyst target — overvalued`}); }
  else                             { reasons.push({type:'neutral',  text:'Fairly valued near analyst consensus'}); }

  let recommendation = 'hold';
  if (score>=4)  recommendation = 'buy';
  if (score<=-2) recommendation = 'sell';

  return {
    ticker:             normalizeSymbol(ticker),
    displayTicker:      displaySymbol(ticker),
    recommendation,
    confidence:         round(Math.min(0.95, Math.max(0.5, 0.55+Math.abs(score)*0.07)),2),
    reasons,
    technicalSummary:   `RSI:${round(rsi,0)} Trend:${trend} MACD:${macdHist>0?'+':'-'}`,
    fundamentalSummary: `${valuation} | Target:₹${fundamentals?.valuation?.fairValue} | Upside:${round(upside,1)}%`,
    aiSummary:          `${displaySymbol(ticker)}: ${trend} trend, RSI ${round(rsi,0)}, ${valuation}. ${reasons[0]?.text||''}`,
  };
}

module.exports = {
  normalizeSymbol, resolveSymbol, cleanSymbol, displaySymbol, round, compactCurrency,
  getQuote, getAssetProfile, getStockAnalysis, getFundamentals,
  getDevelopments, getPortfolioHoldings, getWhaleSignals, generateRecommendation,
};

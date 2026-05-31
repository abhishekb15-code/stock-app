const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const DEFAULT_EXCHANGE_SUFFIX = '.NS';

function normalizeSymbol(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('A stock symbol is required');
  }

  const symbol = input.trim().toUpperCase().replace(/\s+/g, '');
  if (!symbol) throw new Error('A stock symbol is required');
  if (symbol.startsWith('^') || symbol.endsWith('.NS') || symbol.endsWith('.BO')) return symbol;
  return `${symbol}${DEFAULT_EXCHANGE_SUFFIX}`;
}

function displaySymbol(symbol) {
  return normalizeSymbol(symbol).replace(DEFAULT_EXCHANGE_SUFFIX, '');
}

function round(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return +Number(value).toFixed(digits);
}

function compactCurrency(value) {
  if (!Number.isFinite(Number(value))) return 'N/A';
  const abs = Math.abs(Number(value));
  if (abs >= 1e12) return `₹${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `₹${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(2)}Cr`;
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function calcSMA(values, period) {
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const slice = values.slice(index - period + 1, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

function calcEMA(values, period) {
  const ema = new Array(values.length).fill(null);
  if (values.length < period) return ema;

  const multiplier = 2 / (period + 1);
  const firstAverage = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  ema[period - 1] = firstAverage;

  for (let i = period; i < values.length; i += 1) {
    ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }

  return ema;
}

function calcRSI(values, period = 14) {
  const rsi = new Array(values.length).fill(null);
  if (values.length <= period) return rsi;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    gains += Math.max(diff, 0);
    losses += Math.max(-diff, 0);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    avgGain = ((avgGain * (period - 1)) + Math.max(diff, 0)) / period;
    avgLoss = ((avgLoss * (period - 1)) + Math.max(-diff, 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }

  return rsi;
}

function emaForSparse(values, period) {
  const result = new Array(values.length).fill(null);
  const valid = values
    .map((value, index) => ({ value, index }))
    .filter(item => Number.isFinite(item.value));

  if (valid.length < period) return result;

  const multiplier = 2 / (period + 1);
  let ema = valid.slice(0, period).reduce((sum, item) => sum + item.value, 0) / period;
  result[valid[period - 1].index] = ema;

  for (let i = period; i < valid.length; i += 1) {
    ema = (valid[i].value - ema) * multiplier + ema;
    result[valid[i].index] = ema;
  }

  return result;
}

function calcMACD(values) {
  const ema12 = calcEMA(values, 12);
  const ema26 = calcEMA(values, 26);
  const macdLine = values.map((_, index) => (
    ema12[index] === null || ema26[index] === null ? null : ema12[index] - ema26[index]
  ));
  const signal = emaForSparse(macdLine, 9);
  const histogram = macdLine.map((value, index) => (
    value === null || signal[index] === null ? null : value - signal[index]
  ));

  return { macdLine, signal, histogram };
}

function calcBollingerBands(values, period = 20, stdDevMultiplier = 2) {
  const middle = calcSMA(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);

  values.forEach((_, index) => {
    if (index < period - 1) return;
    const slice = values.slice(index - period + 1, index + 1);
    const mean = middle[index];
    const variance = slice.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    upper[index] = mean + stdDev * stdDevMultiplier;
    lower[index] = mean - stdDev * stdDevMultiplier;
  });

  return { upper, middle, lower };
}

function lastNumber(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return null;
}

async function getQuote(input) {
  const symbol = normalizeSymbol(input);
  const quote = await yahooFinance.quote(symbol);
  const currentPrice = quote.regularMarketPrice || quote.postMarketPrice || quote.preMarketPrice;

  if (!Number.isFinite(Number(currentPrice))) {
    throw new Error(`No live price returned for ${symbol}`);
  }

  const previousClose = quote.regularMarketPreviousClose || quote.previousClose || currentPrice;
  const change = quote.regularMarketChange ?? (currentPrice - previousClose);
  const changePercent = quote.regularMarketChangePercent ?? ((change / previousClose) * 100);

  return {
    ticker: symbol,
    displayTicker: displaySymbol(symbol),
    yahooSymbol: symbol,
    name: quote.longName || quote.shortName || symbol,
    sector: quote.sector || quote.quoteType || 'Unknown',
    exchange: quote.fullExchangeName || quote.exchange || 'NSE',
    currency: quote.currency || 'INR',
    price: round(currentPrice),
    previousClose: round(previousClose),
    change: round(change),
    changePercent: round(changePercent),
    volume: quote.regularMarketVolume || quote.volume || null,
    marketCap: quote.marketCap || null,
  };
}

async function getAssetProfile(input) {
  try {
    const symbol = normalizeSymbol(input);
    const summary = await yahooFinance.quoteSummary(symbol, { modules: ['assetProfile'] });
    return summary.assetProfile || {};
  } catch (err) {
    return {};
  }
}

async function getHistorical(input) {
  const symbol = normalizeSymbol(input);
  const period1 = new Date();
  period1.setDate(period1.getDate() - 430);

  const result = await yahooFinance.chart(symbol, {
    period1,
    period2: new Date(),
    interval: '1d',
  });

  return result.quotes
    .filter(row => Number.isFinite(Number(row.close)))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(row => ({
      date: row.date.toISOString().split('T')[0],
      open: round(row.open),
      high: round(row.high),
      low: round(row.low),
      close: round(row.close),
      volume: row.volume || 0,
    }));
}

async function getStockAnalysis(input) {
  const quote = await getQuote(input);
  const ohlcv = await getHistorical(quote.ticker);

  if (ohlcv.length < 50) {
    throw new Error(`Not enough historical data returned for ${quote.ticker}`);
  }

  const closes = ohlcv.map(day => day.close);
  const highs = ohlcv.map(day => day.high).filter(Number.isFinite);
  const lows = ohlcv.map(day => day.low).filter(Number.isFinite);
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const rsi = calcRSI(closes, 14);
  const macd = calcMACD(closes);
  const bollinger = calcBollingerBands(closes, 20);

  const currentPrice = quote.price || closes[closes.length - 1];
  const lastRSI = lastNumber(rsi);
  const lastEma50 = lastNumber(ema50);
  const trendSignal = currentPrice >= lastEma50 ? 'Bullish' : 'Bearish';
  const rsiSignal = lastRSI > 70 ? 'Overbought' : lastRSI < 30 ? 'Oversold' : 'Neutral';

  return {
    ticker: quote.ticker,
    displayTicker: quote.displayTicker,
    yahooSymbol: quote.yahooSymbol,
    name: quote.name,
    sector: quote.sector,
    exchange: quote.exchange,
    currency: quote.currency,
    price: round(currentPrice),
    change: quote.change,
    changePercent: quote.changePercent,
    technical: {
      rsi: { value: round(lastRSI, 2), signal: rsiSignal },
      macd: {
        value: round(lastNumber(macd.macdLine), 3),
        signal: round(lastNumber(macd.signal), 3),
        histogram: round(lastNumber(macd.histogram), 3),
      },
      ema: {
        ema20: round(lastNumber(ema20)),
        ema50: round(lastNumber(ema50)),
        ema200: round(lastNumber(ema200)),
      },
      sma: {
        sma20: round(lastNumber(sma20)),
        sma50: round(lastNumber(sma50)),
      },
      bollingerBands: {
        upper: round(lastNumber(bollinger.upper)),
        middle: round(lastNumber(bollinger.middle)),
        lower: round(lastNumber(bollinger.lower)),
      },
      trend: trendSignal,
      support: round(Math.min(...lows.slice(-60))),
      resistance: round(Math.max(...highs.slice(-60))),
    },
    chartData: ohlcv.map((day, index) => ({
      ...day,
      ema20: round(ema20[index]),
      ema50: round(ema50[index]),
      ema200: round(ema200[index]),
      sma20: round(sma20[index]),
      sma50: round(sma50[index]),
      rsi: round(rsi[index]),
      macd: round(macd.macdLine[index], 3),
      macdSignal: round(macd.signal[index], 3),
      macdHistogram: round(macd.histogram[index], 3),
      bollingerUpper: round(bollinger.upper[index]),
      bollingerMiddle: round(bollinger.middle[index]),
      bollingerLower: round(bollinger.lower[index]),
    })),
  };
}

async function getFundamentals(input) {
  const quote = await getQuote(input);
  let summary = {};

  try {
    summary = await yahooFinance.quoteSummary(quote.ticker, {
      modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'price', 'assetProfile'],
    });
  } catch (err) {
    summary = {};
  }

  const summaryDetail = summary.summaryDetail || {};
  const keyStats = summary.defaultKeyStatistics || {};
  const financialData = summary.financialData || {};
  const profile = summary.assetProfile || {};
  const targetMeanPrice = financialData.targetMeanPrice;
  const fairValue = Number.isFinite(Number(targetMeanPrice)) ? targetMeanPrice : quote.price;
  const upside = quote.price ? ((fairValue - quote.price) / quote.price) * 100 : 0;

  let valuationScore = 'Fairly Valued';
  if (upside > 10) valuationScore = 'Undervalued';
  if (upside < -10) valuationScore = 'Overvalued';

  return {
    ticker: quote.ticker,
    displayTicker: quote.displayTicker,
    name: quote.name,
    sector: profile.sector || quote.sector,
    industry: profile.industry || profile.industryDisp || 'Unknown',
    fundamentals: {
      peRatio: round(summaryDetail.trailingPE ?? keyStats.trailingPE, 2),
      pbRatio: round(keyStats.priceToBook, 2),
      eps: round(keyStats.trailingEps, 2),
      revenueGrowth: round(financialData.revenueGrowth ? financialData.revenueGrowth * 100 : null, 2),
      debtToEquity: round(financialData.debtToEquity, 2),
      profitMargin: round(financialData.profitMargins ? financialData.profitMargins * 100 : null, 2),
      roe: round(financialData.returnOnEquity ? financialData.returnOnEquity * 100 : null, 2),
      freeCashFlow: compactCurrency(financialData.freeCashflow),
      beta: round(keyStats.beta, 2),
      dividendYield: round(summaryDetail.dividendYield ? summaryDetail.dividendYield * 100 : null, 2),
      marketCap: compactCurrency(quote.marketCap),
    },
    valuation: {
      currentPrice: quote.price,
      fairValue: round(fairValue),
      upside: round(upside, 1),
      score: valuationScore,
      reasoning: Number.isFinite(Number(targetMeanPrice))
        ? `Yahoo Finance analyst target mean price implies ${round(upside, 1)}% ${upside >= 0 ? 'upside' : 'downside'} from the current NSE price.`
        : 'Yahoo Finance does not currently provide an analyst target for this NSE symbol, so fair value is shown as the current live price.',
    },
  };
}

async function getDevelopments(input) {
  const quote = await getQuote(input);
  const [profile, insightsResult] = await Promise.all([
    getAssetProfile(quote.ticker),
    yahooFinance.insights(quote.ticker).catch(() => null),
  ]);

  const significant = (insightsResult?.sigDevs || []).map(item => ({
    title: item.headline,
    date: item.date,
    publisher: 'Yahoo Finance Insights',
    link: item.link || null,
    type: 'company',
  }));

  const summary = profile.longBusinessSummary
    ? profile.longBusinessSummary.split('. ').slice(0, 2).join('. ') + '.'
    : `${quote.name} is listed on ${quote.exchange}.`;

  return {
    ticker: quote.ticker,
    displayTicker: quote.displayTicker,
    company: quote.name,
    sector: profile.sector || quote.sector || 'Unknown',
    industry: profile.industry || profile.industryDisp || 'Unknown',
    website: profile.website || null,
    summary,
    significantDevelopments: significant,
    industrySummary: `${profile.industry || profile.industryDisp || 'The company industry'} sits in the ${profile.sector || quote.sector || 'broader market'} space. Watch crude/input prices, regulatory policy, interest rates, demand trends, and earnings commentary for industry-wide impact.`,
    lastUpdated: new Date().toISOString(),
  };
}

function getPortfolioHoldings() {
  return [
    { id: '1', ticker: 'RELIANCE.NS', shares: 10, avgBuyPrice: 2850, purchaseDate: '2024-06-15', notes: 'NSE default holding' },
    { id: '2', ticker: 'TCS.NS', shares: 5, avgBuyPrice: 3900, purchaseDate: '2024-07-10', notes: 'IT services' },
    { id: '3', ticker: 'INFY.NS', shares: 12, avgBuyPrice: 1450, purchaseDate: '2024-08-05', notes: '' },
    { id: '4', ticker: 'HDFCBANK.NS', shares: 15, avgBuyPrice: 1600, purchaseDate: '2024-09-12', notes: 'Banking' },
  ];
}

function getWhaleSignals() {
  return [];
}

function generateRecommendation(ticker, technical, fundamentals) {
  const rsi = technical.rsi.value || 50;
  const trend = technical.trend;
  const valuation = fundamentals.valuation.score;
  const upside = fundamentals.valuation.upside || 0;
  const macdHistogram = technical.macd.histogram || 0;
  const priceAboveEma200 = fundamentals.valuation.currentPrice >= (technical.ema.ema200 || fundamentals.valuation.currentPrice);

  let score = 0;
  if (trend === 'Bullish') score += 2;
  if (priceAboveEma200) score += 1;
  if (macdHistogram > 0) score += 1;
  if (rsi < 35) score += 1;
  if (rsi > 70) score -= 2;
  if (valuation === 'Undervalued') score += 2;
  if (valuation === 'Overvalued') score -= 2;
  if (upside > 15) score += 1;
  if (upside < -15) score -= 1;

  let recommendation = 'hold';
  if (score >= 4) recommendation = 'buy';
  if (score <= -2) recommendation = 'sell';

  const confidence = Math.min(0.95, Math.max(0.5, 0.55 + Math.abs(score) * 0.07));
  const display = displaySymbol(ticker);

  return {
    ticker: normalizeSymbol(ticker),
    displayTicker: display,
    recommendation,
    confidence: round(confidence, 2),
    technicalSummary: `RSI: ${round(rsi, 0)} (${technical.rsi.signal}), Trend: ${trend}, MACD: ${macdHistogram > 0 ? 'Positive' : 'Negative'}`,
    fundamentalSummary: `${valuation} | Fair Value: ₹${fundamentals.valuation.fairValue} | Upside: ${upside}%`,
    aiSummary: `${display} has ${trend.toLowerCase()} price action with RSI at ${round(rsi, 0)} and MACD histogram ${macdHistogram > 0 ? 'above' : 'below'} zero. Valuation is ${valuation.toLowerCase()} based on Yahoo Finance target data when available.`,
  };
}

module.exports = {
  normalizeSymbol,
  displaySymbol,
  getQuote,
  getAssetProfile,
  getStockAnalysis,
  getFundamentals,
  getDevelopments,
  getPortfolioHoldings,
  getWhaleSignals,
  generateRecommendation,
};

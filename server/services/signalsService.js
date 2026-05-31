const { getStockAnalysis, getFundamentals, normalizeSymbol, displaySymbol } = require('./indianMarketData');

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

async function getMarketSignalsForHolding(holding) {
  const ticker = normalizeSymbol(holding.ticker);
  const [analysis, fundamentals] = await Promise.all([
    getStockAnalysis(ticker),
    getFundamentals(ticker),
  ]);

  const signals = [];
  const chart = analysis.chartData || [];
  const last = chart[chart.length - 1] || {};
  const prior = chart.slice(-21, -1);
  const avgVolume = avg(prior.map(day => day.volume).filter(Number.isFinite));
  const volumeMultiplier = avgVolume ? last.volume / avgVolume : 0;
  const display = displaySymbol(ticker);

  if (volumeMultiplier >= 1.5) {
    signals.push({
      id: `${ticker}-volume-${last.date}`,
      ticker,
      displayTicker: display,
      signalType: 'volume_spike',
      institutionName: null,
      signalDate: last.date || today(),
      detail: {
        volume: Number(last.volume || 0).toLocaleString('en-IN'),
        avgVolume: Math.round(avgVolume).toLocaleString('en-IN'),
        multiplier: `${volumeMultiplier.toFixed(1)}x`,
        priceMove: `${analysis.changePercent >= 0 ? '+' : ''}${analysis.changePercent}%`,
      },
      source: `https://finance.yahoo.com/quote/${ticker}`,
    });
  }

  const valuation = fundamentals.valuation || {};
  if (Number.isFinite(valuation.upside) && Math.abs(valuation.upside) >= 15) {
    signals.push({
      id: `${ticker}-analyst-${today()}`,
      ticker,
      displayTicker: display,
      signalType: 'analyst',
      institutionName: 'Yahoo Finance analyst consensus',
      signalDate: today(),
      detail: {
        targetPrice: `₹${valuation.fairValue}`,
        currentPrice: `₹${valuation.currentPrice}`,
        impliedMove: `${valuation.upside >= 0 ? '+' : ''}${valuation.upside}%`,
        rating: valuation.score,
      },
      source: `https://finance.yahoo.com/quote/${ticker}/analysis`,
    });
  }

  if (analysis.technical.macd.histogram > 0 && analysis.technical.trend === 'Bullish') {
    signals.push({
      id: `${ticker}-momentum-${today()}`,
      ticker,
      displayTicker: display,
      signalType: 'momentum',
      institutionName: null,
      signalDate: today(),
      detail: {
        trend: analysis.technical.trend,
        macdHistogram: analysis.technical.macd.histogram,
        rsi: analysis.technical.rsi.value,
        ema50: `₹${analysis.technical.ema.ema50}`,
      },
      source: `https://finance.yahoo.com/quote/${ticker}/chart`,
    });
  }

  try {
    const YahooFinance = require('yahoo-finance2').default;
    const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    const ownership = await yahooFinance.quoteSummary(ticker, { modules: ['majorHoldersBreakdown'] });
    const breakdown = ownership.majorHoldersBreakdown || {};
    if (Number.isFinite(breakdown.institutionsPercentHeld)) {
      signals.push({
        id: `${ticker}-institutional-${today()}`,
        ticker,
        displayTicker: display,
        signalType: 'institutional',
        institutionName: 'Reported institutional ownership',
        signalDate: today(),
        detail: {
          institutionsHeld: `${(breakdown.institutionsPercentHeld * 100).toFixed(1)}%`,
          floatHeld: breakdown.institutionsFloatPercentHeld ? `${(breakdown.institutionsFloatPercentHeld * 100).toFixed(1)}%` : 'N/A',
          institutionCount: breakdown.institutionsCount || 'N/A',
        },
        source: `https://finance.yahoo.com/quote/${ticker}/holders`,
      });
    }
  } catch (err) {
    // Some NSE symbols do not expose holder modules; technical/analyst signals still work.
  }

  return signals;
}

async function getSignalsForPortfolio(holdings) {
  const batches = await Promise.all(holdings.map(holding => getMarketSignalsForHolding(holding).catch(() => [])));
  return batches.flat().sort((a, b) => new Date(b.signalDate) - new Date(a.signalDate));
}

module.exports = { getSignalsForPortfolio };

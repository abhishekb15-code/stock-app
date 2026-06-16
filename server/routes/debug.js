const express = require('express');
const router  = express.Router();
const https   = require('https');
const mds     = require('../services/marketDataService');

function testUrl(name, url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/', ...headers },
      timeout: 10000,
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let preview = data.substring(0, 120);
        try {
          const j = JSON.parse(data);
          const price = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (price) preview = `PRICE: ${price}`;
          if (j?.chart?.error)     preview = `ERROR: ${JSON.stringify(j.chart.error)}`;
          if (j?.timeseries?.result) preview = `TIMESERIES OK: ${j.timeseries.result.length} series`;
        } catch {}
        resolve({ name, status: res.statusCode, works: res.statusCode === 200, preview });
      });
    });
    req.on('error', e => resolve({ name, status: 0, works: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ name, status: 0, works: false, error: 'timeout' }); });
  });
}

// Raw endpoint reachability (what works from this host's IP)
router.get('/', async (req, res) => {
  const now = Math.floor(Date.now() / 1000), past = now - 5 * 365 * 86400;
  const tests = await Promise.all([
    testUrl('v8 price RELIANCE.NS',  'https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=2d'),
    testUrl('v8 price WEBELSOLAR.NS', 'https://query1.finance.yahoo.com/v8/finance/chart/WEBELSOLAR.NS?interval=1d&range=2d'),
    testUrl('v8 price 504132.BO',     'https://query1.finance.yahoo.com/v8/finance/chart/504132.BO?interval=1d&range=2d'),
    // The no-crumb fundamentals path used by Earnings/Financials tabs
    testUrl('fundamentals-timeseries (statements)',
      `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/RELIANCE.NS?symbol=RELIANCE.NS&type=annualTotalRevenue,annualNetIncome&period1=${past}&period2=${now}`),
    // The crumb path (best-effort enrichment only — sector/target)
    testUrl('v10 quoteSummary (crumb-gated)',
      'https://query2.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS?modules=assetProfile'),
  ]);
  res.json({ serverTime: new Date().toISOString(), rawEndpoints: tests });
});

// End-to-end: exercise the real service layer (what the analysis tabs actually return)
router.get('/service/:ticker', async (req, res) => {
  const { normalizeSymbol } = require('../services/indianMarketData');
  const ticker = normalizeSymbol(req.params.ticker || 'RELIANCE');
  const out = {};
  const safe = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = { error: e.message }; } };
  await Promise.all([
    safe('fundamentals', async () => {
      const f = await mds.getFundamentalsData(ticker);
      return { sector: f.sector, pe: f.peRatio, pb: f.pbRatio, eps: f.eps, roe: f.roe, netMargin: f.netMargin, revenueGrowth: f.revenueGrowth, debtToEquity: f.debtToEquity, targetPrice: f.targetPrice };
    }),
    safe('incomeStatement', async () => { const i = await mds.getIncomeStatement(ticker); return { annual: i.annual.length, quarterly: i.quarterly.length, latest: i.annual[0] }; }),
    safe('balanceSheet',    async () => { const b = await mds.getBalanceSheet(ticker);    return { years: b.length, latest: b[0] }; }),
    safe('cashflow',        async () => { const c = await mds.getCashFlow(ticker);        return { years: c.length, latest: c[0] }; }),
    safe('earnings',        async () => { const e = await mds.getEarnings(ticker);        return { quarters: e.length, latest: e[0] }; }),
  ]);
  res.json({ ticker, serverTime: new Date().toISOString(), service: out });
});

module.exports = router;

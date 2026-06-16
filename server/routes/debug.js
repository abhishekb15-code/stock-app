const express = require('express');
const router  = express.Router();
const https   = require('https');

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
        let preview = data.substring(0, 150);
        // Try to extract price if Yahoo chart
        try {
          const j = JSON.parse(data);
          const price = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (price) preview = `PRICE: ${price}`;
          const err = j?.chart?.error;
          if (err) preview = `ERROR: ${JSON.stringify(err)}`;
        } catch {}
        resolve({ name, status: res.statusCode, works: res.statusCode === 200, preview });
      });
    });
    req.on('error', e => resolve({ name, status: 0, works: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ name, status: 0, works: false, error: 'timeout' }); });
  });
}

router.get('/', async (req, res) => {
  const tests = await Promise.all([
    // Price tests
    testUrl('RELIANCE.NS price',   'https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=2d'),
    testUrl('WEBSOL.NS price',     'https://query1.finance.yahoo.com/v8/finance/chart/WEBSOL.NS?interval=1d&range=2d'),
    testUrl('WEBELSOLAR.NS price', 'https://query1.finance.yahoo.com/v8/finance/chart/WEBELSOLAR.NS?interval=1d&range=2d'),
    testUrl('504132.BO price',     'https://query1.finance.yahoo.com/v8/finance/chart/504132.BO?interval=1d&range=2d'),
    // Fundamentals & analysis tabs
    testUrl('RELIANCE quoteSummary (financials)',
      'https://query2.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS?modules=financialData,defaultKeyStatistics'),
    testUrl('RELIANCE incomeStatement (earnings tab)',
      'https://query2.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS?modules=incomeStatementHistory'),
    testUrl('RELIANCE balanceSheet',
      'https://query2.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS?modules=balanceSheetHistory'),
    testUrl('RELIANCE cashflow',
      'https://query2.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS?modules=cashflowStatementHistory'),
    testUrl('RELIANCE earningsHistory',
      'https://query2.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS?modules=earningsHistory'),
    testUrl('RELIANCE assetProfile (sector/industry)',
      'https://query2.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS?modules=assetProfile'),
  ]);

  res.json({ serverTime: new Date().toISOString(), results: tests });
});

module.exports = router;

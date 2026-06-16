const express = require('express');
const router  = express.Router();
const https   = require('https');

function testUrl(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', ...headers },
      timeout: 8000,
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data.substring(0,200) }));
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
  });
}

router.get('/', async (req, res) => {
  const key = process.env.TWELVE_DATA_API_KEY || '9a336f4794a244bead51fcd1edba7160';
  const tests = await Promise.all([
    testUrl(`https://api.twelvedata.com/price?symbol=RELIANCE:NSE&apikey=${key}`)
      .then(r => ({ name: 'Twelve Data', ...r })),
    testUrl('https://stooq.com/q/l/?s=reliance.ns&f=sd2t2ohlcv&h&e=csv')
      .then(r => ({ name: 'Stooq', ...r })),
    testUrl('https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=2d')
      .then(r => ({ name: 'Yahoo Finance v8', ...r })),
    testUrl('https://query2.finance.yahoo.com/v7/finance/quote?symbols=RELIANCE.NS')
      .then(r => ({ name: 'Yahoo Finance v7', ...r })),
    testUrl('https://financialmodelingprep.com/api/v3/quote/RELIANCE.NS?apikey=demo')
      .then(r => ({ name: 'FMP', ...r })),
  ]);
  res.json({
    serverTime: new Date().toISOString(),
    env: { hasKey: !!process.env.TWELVE_DATA_API_KEY },
    results: tests.map(t => ({
      source: t.name,
      status: t.status,
      works:  t.status === 200,
      preview:t.body?.substring(0,100),
      error:  t.error,
    })),
  });
});

module.exports = router;

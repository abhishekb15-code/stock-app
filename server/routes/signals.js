const express = require('express');
const router  = express.Router();
const db      = require('../models/db');
const { scanVolume } = require('../services/volumeService');

// 5-min cache per scope (volume scans hit the chart API for every ticker)
const cache = new Map();
const TTL = 5 * 60 * 1000;

function tickersForScope(scope) {
  const port  = db.portfolio.findAll().map(h => h.ticker);
  const watch = db.watchlist.findAll().map(w => w.ticker);
  if (scope === 'portfolio') return port;
  if (scope === 'watchlist') return watch;
  return [...new Set([...port, ...watch])];   // 'all' (default)
}

// GET /api/signals/volume?scope=portfolio|watchlist|all&all=1
router.get('/volume', async (req, res) => {
  try {
    const scope = req.query.scope || 'all';
    const onlySpikes = req.query.all !== '1';
    const tickers = tickersForScope(scope);

    const key = `${scope}:${onlySpikes}`;
    const hit = cache.get(key);
    if (hit && (Date.now() - hit.ts) < TTL) return res.json(hit.data);

    const signals = await scanVolume(tickers, { onlySpikes });
    const data = {
      scope, scanned: tickers.length,
      accumulation: signals.filter(s => s.direction === 'accumulation').length,
      distribution: signals.filter(s => s.direction === 'distribution').length,
      signals,
      generatedAt: new Date().toISOString(),
    };
    cache.set(key, { ts: Date.now(), data });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

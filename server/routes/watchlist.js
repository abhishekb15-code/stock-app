const express = require('express');
const router  = express.Router();
const store   = require('../services/store');
const auth    = require('../services/authService');
const mds     = require('../services/marketDataService');
const { getVolumeSignal, mapLimit } = require('../services/volumeService');
const { normalizeSymbol, displaySymbol, round } = require('../services/indianMarketData');

// Enrich a watchlist item with live price, daily change and a volume signal.
async function enrich(item) {
  const [quoteRes, volRes] = await Promise.allSettled([
    mds.getQuote(item.ticker),
    getVolumeSignal(item.ticker),
  ]);
  const q   = quoteRes.status === 'fulfilled' ? quoteRes.value : null;
  const vol = volRes.status === 'fulfilled' ? volRes.value : null;
  const price = q?.price ?? null;
  const toTarget = (item.targetPrice && price) ? round(((item.targetPrice - price) / price) * 100, 1) : null;

  return {
    ...item,
    displayTicker: displaySymbol(item.ticker),
    name:          q?.name || item.note || displaySymbol(item.ticker),
    price,
    change:        q?.change ?? null,
    changePercent: q?.changePercent ?? null,
    fiftyTwoWeekHigh: q?.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow:  q?.fiftyTwoWeekLow ?? null,
    toTargetPercent: toTarget,
    volumeSignal:  vol && vol.spike ? { multiplier: vol.multiplier, direction: vol.direction, intensity: vol.intensity } : null,
    live:          !!price,
  };
}

// GET /api/watchlist
router.get('/', async (req, res) => {
  try {
    const items = await store.getWatchlist(auth.currentEmail(req));
    const enriched = await mapLimit(items, 6, enrich);
    res.json({ items: enriched.filter(Boolean), count: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/watchlist  { ticker, note?, targetPrice? }
router.post('/', async (req, res) => {
  try {
    const { ticker, note, targetPrice } = req.body;
    if (!ticker) return res.status(400).json({ error: 'ticker is required' });
    // Validate the ticker resolves to a real quote before adding
    const sym = normalizeSymbol(ticker);
    try { await mds.getQuote(sym); }
    catch { return res.status(404).json({ error: `Could not find a quote for ${displaySymbol(sym)}` }); }

    const item = await store.addWatch(auth.currentEmail(req), { ticker: sym, note, targetPrice });
    res.status(201).json(await enrich(item));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/watchlist/:id  { note?, targetPrice? }
router.put('/:id', async (req, res) => {
  try {
    const updated = await store.updateWatch(auth.currentEmail(req), req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Watchlist item not found' });
    res.json(await enrich(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/watchlist/:id
router.delete('/:id', async (req, res) => {
  try {
    const ok = await store.deleteWatch(auth.currentEmail(req), req.params.id);
    if (!ok) return res.status(404).json({ error: 'Watchlist item not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router  = express.Router();
const db      = require('../models/db');
const { normalizeSymbol, round } = require('../services/indianMarketData');
const mds = require('../services/marketDataService');

// Batch-enrich all holdings with ONE price API call instead of 24
async function enrichAllHoldings(rawHoldings) {
  if (!rawHoldings.length) return [];

  // Step 1: Batch fetch all prices in ONE API call
  const tickers   = rawHoldings.map(h => h.ticker);
  let priceMap    = {};
  let liveSuccess = false;

  try {
    priceMap    = await mds.getCachedBatchPrices(tickers);
    liveSuccess = Object.keys(priceMap).length > 0;
  } catch (err) {
    console.warn(`⚠️  Batch price fetch failed: ${err.message}`);
  }

  // Step 2: Enrich each holding using batch prices (no extra API calls)
  return rawHoldings.map(h => {
    const livePrice  = priceMap[h.ticker];
    const currentPrice = livePrice && livePrice > 0 ? livePrice : h.avgBuyPrice;
    const totalValue   = currentPrice * h.shares;
    const totalCost    = h.avgBuyPrice * h.shares;
    const pnl          = totalValue - totalCost;
    const pnlPercent   = ((currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100;

    return {
      ...h,
      displayTicker:      h.ticker.replace('.NS','').replace('.BO',''),
      yahooSymbol:        h.ticker,
      currentPrice:       round(currentPrice),
      dailyChange:        0,
      dailyChangePercent: 0,
      totalValue:         round(totalValue),
      totalCost:          round(totalCost),
      pnl:                round(pnl),
      pnlPercent:         round(pnlPercent),
      sector:             'Equity',
      name:               h.notes || h.ticker.replace('.NS','').replace('.BO',''),
      technical:          null,
      livePrice:          !!livePrice,
    };
  });
}

// GET /api/portfolio
router.get('/', async (req, res) => {
  try {
    const raw      = db.portfolio.findAll();
    const holdings = await enrichAllHoldings(raw);

    const totalValue = holdings.reduce((s,h) => s + h.totalValue, 0);
    const totalCost  = holdings.reduce((s,h) => s + h.totalCost,  0);
    const totalPnl   = totalValue - totalCost;
    const dailyPnl   = 0;

    const sectors = {};
    holdings.forEach(h => { sectors[h.sector] = (sectors[h.sector]||0) + h.totalValue; });
    const sectorAllocation = Object.entries(sectors).map(([sector, value]) => ({
      sector, value: round(value), percent: totalValue ? round((value/totalValue)*100,1) : 0,
    }));

    res.json({
      holdings,
      summary: {
        totalValue:      round(totalValue),
        totalCost:       round(totalCost),
        totalPnl:        round(totalPnl),
        totalPnlPercent: totalCost ? round((totalPnl/totalCost)*100) : 0,
        dailyPnl:        round(dailyPnl),
        holdingCount:    holdings.length,
      },
      sectorAllocation,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/portfolio
router.post('/', async (req, res) => {
  try {
    const { ticker, shares, avgBuyPrice, purchaseDate, notes } = req.body;
    if (!ticker || !shares || !avgBuyPrice)
      return res.status(400).json({ error: 'ticker, shares, and avgBuyPrice are required' });

    const holding = db.portfolio.create({
      ticker: normalizeSymbol(ticker),
      shares: +shares, avgBuyPrice: +avgBuyPrice,
      purchaseDate: purchaseDate || new Date().toISOString().split('T')[0],
      notes: notes || '',
    });

    // Enrich just this one holding
    const [enriched] = await enrichAllHoldings([holding]);
    res.status(201).json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/portfolio/import
router.post('/import', async (req, res) => {
  try {
    const { holdings, mode } = req.body;
    if (!Array.isArray(holdings) || !holdings.length)
      return res.status(400).json({ error: 'holdings must be a non-empty array' });
    const saved    = db.portfolio.importMany(holdings, mode === 'append' ? 'append' : 'replace');
    const enriched = await enrichAllHoldings(saved);
    res.status(201).json({ imported: holdings.length, saved: enriched.length, holdings: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/portfolio/:id
router.delete('/:id', (req, res) => {
  try {
    const deleted = db.portfolio.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Holding not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/portfolio/:id
router.put('/:id', async (req, res) => {
  try {
    const updated = db.portfolio.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Holding not found' });
    const [enriched] = await enrichAllHoldings([updated]);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

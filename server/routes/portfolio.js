const express = require('express');
const router  = express.Router();
const store   = require('../services/store');
const auth    = require('../services/authService');
const { round } = require('../services/indianMarketData');
const mds = require('../services/marketDataService');

// Batch-enrich all holdings with ONE price API call instead of 24
async function enrichAllHoldings(rawHoldings) {
  if (!rawHoldings.length) return [];

  // Step 1: Batch fetch full quotes (price + previous close) in ONE pass
  const tickers   = rawHoldings.map(h => h.ticker);
  let quoteMap    = {};

  try {
    quoteMap = await mds.getCachedBatchQuotes(tickers);
  } catch (err) {
    console.warn(`⚠️  Batch quote fetch failed: ${err.message}`);
  }

  // Step 2: Enrich each holding using batch quotes (no extra API calls)
  return rawHoldings.map(h => {
    const q            = quoteMap[h.ticker];
    const livePrice    = q && q.price > 0;
    const currentPrice = livePrice ? q.price : h.avgBuyPrice;
    const prevClose    = livePrice ? (q.previousClose || currentPrice) : currentPrice;
    const totalValue   = currentPrice * h.shares;
    const totalCost    = h.avgBuyPrice * h.shares;
    const pnl          = totalValue - totalCost;
    const pnlPercent   = ((currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100;
    const dailyChange  = livePrice ? (currentPrice - prevClose) : 0;   // per-share

    return {
      ...h,
      displayTicker:      h.ticker.replace('.NS','').replace('.BO',''),
      yahooSymbol:        h.ticker,
      currentPrice:       round(currentPrice),
      dailyChange:        round(dailyChange),
      dailyChangePercent: livePrice && prevClose ? round((dailyChange / prevClose) * 100) : 0,
      dailyPnl:           round(dailyChange * h.shares),
      totalValue:         round(totalValue),
      totalCost:          round(totalCost),
      pnl:                round(pnl),
      pnlPercent:         round(pnlPercent),
      sector:             'Equity',
      name:               h.notes || h.ticker.replace('.NS','').replace('.BO',''),
      technical:          null,
      livePrice,
    };
  });
}

// GET /api/portfolio
router.get('/', async (req, res) => {
  try {
    const raw      = await store.getHoldings(auth.currentEmail(req));
    const holdings = await enrichAllHoldings(raw);

    const totalValue = holdings.reduce((s,h) => s + h.totalValue, 0);
    const totalCost  = holdings.reduce((s,h) => s + h.totalCost,  0);
    const totalPnl   = totalValue - totalCost;
    const dailyPnl   = holdings.reduce((s,h) => s + (h.dailyPnl || 0), 0);

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
        dailyPnlPercent: (totalValue - dailyPnl) ? round((dailyPnl/(totalValue - dailyPnl))*100) : 0,
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

    const holding = await store.addHolding(auth.currentEmail(req), {
      ticker, shares: +shares, avgBuyPrice: +avgBuyPrice,
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
    const saved    = await store.importHoldings(auth.currentEmail(req), holdings, mode === 'append' ? 'append' : 'replace');
    const enriched = await enrichAllHoldings(saved);
    res.status(201).json({ imported: holdings.length, saved: enriched.length, holdings: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/portfolio/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await store.deleteHolding(auth.currentEmail(req), req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Holding not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/portfolio/:id
router.put('/:id', async (req, res) => {
  try {
    const updated = await store.updateHolding(auth.currentEmail(req), req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Holding not found' });
    const [enriched] = await enrichAllHoldings([updated]);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolio/:id/transactions — trade history for a holding
router.get('/:id/transactions', async (req, res) => {
  try {
    const email = auth.currentEmail(req);
    const h = (await store.getHoldings(email)).find(x => x.id === req.params.id);
    if (!h) return res.status(404).json({ error: 'Holding not found' });
    res.json({ transactions: await store.getTransactions(email, h.ticker) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/portfolio/:id/transaction — record a BUY or SELL and re-derive the position
// Buy  → weighted-average cost; Sell → realized P&L, cost basis per share unchanged.
router.post('/:id/transaction', async (req, res) => {
  try {
    const email = auth.currentEmail(req);
    const h = (await store.getHoldings(email)).find(x => x.id === req.params.id);
    if (!h) return res.status(404).json({ error: 'Holding not found' });

    const type  = req.body.type;
    const qty   = Number(req.body.shares);
    const price = Number(req.body.price);
    const date  = req.body.date || new Date().toISOString().split('T')[0];
    if (!['buy', 'sell'].includes(type))      return res.status(400).json({ error: 'type must be buy or sell' });
    if (!(qty > 0))                            return res.status(400).json({ error: 'Enter a valid quantity' });
    if (!(price > 0))                          return res.status(400).json({ error: 'Enter a valid price' });

    let realized = null, updated, closed = false;
    if (type === 'buy') {
      const newShares = h.shares + qty;
      const newAvg    = (h.shares * h.avgBuyPrice + qty * price) / newShares;
      updated = await store.updateHolding(email, h.id, { shares: newShares, avgBuyPrice: round(newAvg) });
    } else {
      if (qty > h.shares) return res.status(400).json({ error: `You only hold ${h.shares} shares` });
      realized = round((price - h.avgBuyPrice) * qty);
      const newShares = h.shares - qty;
      if (newShares <= 0) { await store.deleteHolding(email, h.id); closed = true; }
      else updated = await store.updateHolding(email, h.id, { shares: newShares });   // avg cost unchanged
    }

    await store.addTransaction(email, { holdingId: h.id, ticker: h.ticker, type, shares: qty, price, realized, date });
    const [enriched] = updated ? await enrichAllHoldings([updated]) : [null];
    res.json({ holding: enriched, closed, realized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

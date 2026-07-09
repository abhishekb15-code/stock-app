const express = require('express');
const router  = express.Router();
const store   = require('../services/store');
const auth    = require('../services/authService');
const indian = require('../services/indianMarketData');
const { round } = indian;
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
      currency:           (q && q.currency) || 'INR',
      sector:             'Equity',
      name:               h.notes || h.ticker.replace('.NS','').replace('.BO',''),
      technical:          null,
      livePrice,
    };
  });
}

// Totals grouped by currency (₹ and $ holdings are never mixed into one number).
function summarize(holdings) {
  const by = {};
  holdings.forEach(h => {
    const c = h.currency || 'INR';
    const b = by[c] || (by[c] = { currency: c, totalValue: 0, totalCost: 0, dailyPnl: 0, holdingCount: 0 });
    b.totalValue += h.totalValue; b.totalCost += h.totalCost; b.dailyPnl += (h.dailyPnl || 0); b.holdingCount++;
  });
  return Object.values(by).map(b => ({
    currency:        b.currency,
    totalValue:      round(b.totalValue),
    totalCost:       round(b.totalCost),
    totalPnl:        round(b.totalValue - b.totalCost),
    totalPnlPercent: b.totalCost ? round(((b.totalValue - b.totalCost) / b.totalCost) * 100) : 0,
    dailyPnl:        round(b.dailyPnl),
    dailyPnlPercent: (b.totalValue - b.dailyPnl) ? round((b.dailyPnl / (b.totalValue - b.dailyPnl)) * 100) : 0,
    holdingCount:    b.holdingCount,
  })).sort((a, b) => b.holdingCount - a.holdingCount);
}

// GET /api/portfolio
router.get('/', async (req, res) => {
  try {
    const raw      = await store.getHoldings(auth.currentEmail(req));
    const holdings = await enrichAllHoldings(raw);

    const summaryByCurrency = summarize(holdings);
    // Primary = the currency with the most holdings (INR for a typical user);
    // kept as `summary` for backward compatibility with existing UI.
    const primary = summaryByCurrency[0] || { currency: 'INR', totalValue: 0, totalCost: 0, totalPnl: 0, totalPnlPercent: 0, dailyPnl: 0, dailyPnlPercent: 0, holdingCount: 0 };

    // Sector split within the primary currency only (mixing currencies is meaningless).
    const sectors = {};
    holdings.filter(h => (h.currency || 'INR') === primary.currency)
      .forEach(h => { sectors[h.sector] = (sectors[h.sector] || 0) + h.totalValue; });
    const sectorAllocation = Object.entries(sectors).map(([sector, value]) => ({
      sector, value: round(value), percent: primary.totalValue ? round((value / primary.totalValue) * 100, 1) : 0,
    }));

    res.json({
      holdings,
      summary: { ...primary },
      summaryByCurrency,
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

    // Resolve to the exchange (NSE/BSE) that has a live quote. If Yahoo is
    // unreachable, fall back to the normalized symbol so a real holding is
    // never blocked by a data outage.
    let resolved;
    try { resolved = await indian.resolveSymbol(ticker); }
    catch { resolved = indian.normalizeSymbol(ticker); }

    const holding = await store.addHolding(auth.currentEmail(req), {
      ticker: resolved, shares: +shares, avgBuyPrice: +avgBuyPrice,
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

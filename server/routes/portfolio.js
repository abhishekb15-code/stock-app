const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { getStockAnalysis, normalizeSymbol } = require('../services/indianMarketData');

async function enrichHolding(holding) {
  const stock = await getStockAnalysis(holding.ticker);
  const currentPrice = stock.price;
  const totalValue = currentPrice * holding.shares;
  const totalCost = holding.avgBuyPrice * holding.shares;
  const pnl = totalValue - totalCost;
  const pnlPercent = ((currentPrice - holding.avgBuyPrice) / holding.avgBuyPrice) * 100;
  return {
    ...holding,
    ticker: stock.ticker,
    displayTicker: stock.displayTicker,
    yahooSymbol: stock.yahooSymbol,
    currentPrice,
    dailyChange: stock.change,
    dailyChangePercent: stock.changePercent,
    totalValue: +totalValue.toFixed(2),
    totalCost: +totalCost.toFixed(2),
    pnl: +pnl.toFixed(2),
    pnlPercent: +pnlPercent.toFixed(2),
    sector: stock.sector || 'Unknown',
    name: stock.name || holding.ticker,
    technical: stock.technical,
  };
}

// GET /api/portfolio
router.get('/', async (req, res) => {
  try {
    const holdings = await Promise.all(db.portfolio.findAll().map(enrichHolding));
    const totalValue = holdings.reduce((s, h) => s + h.totalValue, 0);
    const totalCost = holdings.reduce((s, h) => s + h.totalCost, 0);
    const totalPnl = totalValue - totalCost;
    const dailyPnl = holdings.reduce((s, h) => s + h.dailyChange * h.shares, 0);

    // Sector allocation
    const sectors = {};
    holdings.forEach(h => {
      sectors[h.sector] = (sectors[h.sector] || 0) + h.totalValue;
    });
    const sectorAllocation = Object.entries(sectors).map(([sector, value]) => ({
      sector, value: +value.toFixed(2), percent: totalValue ? +((value / totalValue) * 100).toFixed(1) : 0,
    }));

    res.json({ holdings, summary: { totalValue: +totalValue.toFixed(2), totalCost: +totalCost.toFixed(2), totalPnl: +totalPnl.toFixed(2), totalPnlPercent: totalCost ? +((totalPnl / totalCost) * 100).toFixed(2) : 0, dailyPnl: +dailyPnl.toFixed(2), holdingCount: holdings.length }, sectorAllocation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/portfolio
router.post('/', async (req, res) => {
  try {
    const { ticker, shares, avgBuyPrice, purchaseDate, notes } = req.body;
    if (!ticker || !shares || !avgBuyPrice) return res.status(400).json({ error: 'ticker, shares, and avgBuyPrice are required' });
    const holding = db.portfolio.create({ ticker: normalizeSymbol(ticker), shares: +shares, avgBuyPrice: +avgBuyPrice, purchaseDate: purchaseDate || new Date().toISOString().split('T')[0], notes: notes || '' });
    res.status(201).json(await enrichHolding(holding));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/portfolio/:id
router.delete('/:id', (req, res) => {
  try {
    const deleted = db.portfolio.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Holding not found' });
    res.json({ success: true, message: 'Holding removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/portfolio/:id
router.put('/:id', async (req, res) => {
  try {
    const updated = db.portfolio.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Holding not found' });
    res.json(await enrichHolding(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

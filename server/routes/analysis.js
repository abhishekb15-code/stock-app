const express = require('express');
const router  = express.Router();
const store   = require('../services/store');
const auth    = require('../services/authService');
const {
  earningsAnalysis,
  financialStatements,
  sectorOverview,
  competitiveAnalysis,
  fullStockAnalysis,
  clientReport,
} = require('../services/analysisEngine');

// GET /api/analysis/stock/:ticker — full single-stock analysis (all modules)
router.get('/stock/:ticker', async (req, res) => {
  try {
    const result = await fullStockAnalysis(req.params.ticker);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analysis/earnings/:ticker
router.get('/earnings/:ticker', async (req, res) => {
  try {
    res.json(await earningsAnalysis(req.params.ticker));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analysis/financials/:ticker
router.get('/financials/:ticker', async (req, res) => {
  try {
    res.json(await financialStatements(req.params.ticker));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analysis/competitive/:ticker
router.get('/competitive/:ticker', async (req, res) => {
  try {
    res.json(await competitiveAnalysis(req.params.ticker));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analysis/sector/:sector
router.get('/sector/:sector', async (req, res) => {
  try {
    res.json(await sectorOverview(decodeURIComponent(req.params.sector), req.query.market === 'global' ? 'global' : 'india'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analysis/report — full portfolio client report
router.get('/report', async (req, res) => {
  try {
    const holdings = await store.getHoldings(auth.currentEmail(req));
    if (!holdings.length) return res.status(400).json({ error: 'No holdings in portfolio' });
    const report = await clientReport(holdings);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { getStockAnalysis, getFundamentals, getDevelopments } = require('../services/indianMarketData');

// GET /api/stock/:ticker — full technical + fundamental analysis
router.get('/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const [technical, fundamental, developments] = await Promise.all([
      getStockAnalysis(ticker),
      getFundamentals(ticker),
      getDevelopments(ticker),
    ]);
    res.json({ ...technical, ...fundamental, developments, lastUpdated: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock/:ticker/technical
router.get('/:ticker/technical', async (req, res) => {
  try {
    const data = await getStockAnalysis(req.params.ticker.toUpperCase());
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock/:ticker/fundamental
router.get('/:ticker/fundamental', async (req, res) => {
  try {
    const data = await getFundamentals(req.params.ticker.toUpperCase());
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock/:ticker/developments
router.get('/:ticker/developments', async (req, res) => {
  try {
    const data = await getDevelopments(req.params.ticker.toUpperCase());
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

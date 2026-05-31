const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { getStockAnalysis, getFundamentals, generateRecommendation } = require('../services/indianMarketData');

// GET /api/recommendations — returns today's recommendations for all portfolio stocks
router.get('/', async (req, res) => {
  try {
    db.recommendations.clear();
    const holdings = db.portfolio.findAll();
    for (const h of holdings) {
      const technical = await getStockAnalysis(h.ticker);
      const fundamental = await getFundamentals(h.ticker);
      const rec = generateRecommendation(h.ticker, technical.technical, fundamental);
      db.recommendations.upsert(rec);
    }

    const recs = db.recommendations.findAll();
    res.json({ recommendations: recs, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

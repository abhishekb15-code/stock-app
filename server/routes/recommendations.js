const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { getStockAnalysis, getFundamentals, generateRecommendation } = require('../services/indianMarketData');

// GET /api/recommendations — returns recommendations for all portfolio holdings
// Falls back gracefully if Yahoo Finance is unavailable
router.get('/', async (req, res) => {
  try {
    const holdings = db.portfolio.findAll();
    if (holdings.length === 0) return res.json({ recommendations: [], generatedAt: new Date().toISOString() });

    db.recommendations.clear();
    const results = await Promise.allSettled(
      holdings.map(async (h) => {
        try {
          const [technical, fundamental] = await Promise.all([
            getStockAnalysis(h.ticker),
            getFundamentals(h.ticker),
          ]);
          const rec = generateRecommendation(h.ticker, technical.technical, fundamental);
          db.recommendations.upsert(rec);
          return rec;
        } catch (err) {
          console.warn(`⚠️  Recommendation skipped for ${h.ticker}: ${err.message}`);
          // Return a neutral hold recommendation so UI still shows something
          const fallback = {
            ticker: h.ticker,
            recommendation: 'hold',
            confidence: 0,
            reasons: ['Live data unavailable'],
            score: 50,
          };
          db.recommendations.upsert(fallback);
          return fallback;
        }
      })
    );

    const recs = db.recommendations.findAll();
    res.json({ recommendations: recs, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

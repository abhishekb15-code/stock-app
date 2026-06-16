const express = require('express');
const router  = express.Router();
const db      = require('../models/db');
const { round } = require('../services/indianMarketData');
const { clientReport } = require('../services/analysisEngine');

// Map the report's action vocabulary to a badge key used by the UI.
const ACTION_KEY = { 'BUY MORE': 'buy', 'HOLD': 'hold', 'TRIM': 'trim', 'SELL': 'sell' };

// Recommendations are the SAME engine as the Report tab (analysisEngine.clientReport),
// so the Portfolio "Signal" and the Report "Action" always agree for a given stock.
// clientReport is cached (5 min), so this is cheap after the first call.
router.get('/', async (req, res) => {
  try {
    const holdings = db.portfolio.findAll();
    if (!holdings.length) return res.json({ recommendations: [], generatedAt: new Date().toISOString() });

    const report = await clientReport(holdings);

    const recs = report.holdings.map(h => {
      const rec   = h.recommendation || {};
      const score = rec.score ?? 50;
      return {
        ticker:         h.ticker,
        displayTicker:  h.displayTicker,
        recommendation: ACTION_KEY[rec.action] || 'hold',   // badge class key
        action:         rec.action || 'HOLD',               // full label
        score,
        confidence:     round(Math.min(0.95, Math.max(0.5, 0.5 + Math.abs(score - 50) / 100)), 2),
        reasons:        rec.reasons || [],
        currentPrice:   round(h.currentPrice),
        pnlPct:         round(h.pnlPct, 2),
        stopLoss:       rec.stopLoss ?? null,
        takeProfit:     rec.takeProfit ?? null,
        livePrice:      h.dataAvailable !== false,
      };
    });

    db.recommendations.clear();
    recs.forEach(r => db.recommendations.upsert(r));

    res.json({ recommendations: recs, generatedAt: report.generatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

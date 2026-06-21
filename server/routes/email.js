const express = require('express');
const router = express.Router();
const db = require('../models/db');
const store = require('../services/store');
const auth = require('../services/authService');
const { getStockAnalysis, getFundamentals, generateRecommendation } = require('../services/indianMarketData');
const { sendDailyDigest } = require('../services/emailService');
const { getSignalsForPortfolio } = require('../services/signalsService');

// Defaults to the owner's portfolio (used by the scheduled cron); the manual
// trigger passes the signed-in user's email.
async function runFullAnalysis(email = store.OWNER_EMAIL) {
  const holdings = await store.getHoldings(email);

  const enrichedHoldings = [];
  const recommendations = [];

  for (const holding of holdings) {
    const technical = await getStockAnalysis(holding.ticker);
    const fundamental = await getFundamentals(holding.ticker);
    const rec = generateRecommendation(holding.ticker, technical.technical, fundamental);
    recommendations.push(rec);

    const currentPrice = technical.price;
    enrichedHoldings.push({
      ...holding,
      currentPrice,
      dailyChange: technical.change,
      dailyChangePercent: technical.changePercent,
      totalValue: currentPrice * holding.shares,
      pnl: (currentPrice - holding.avgBuyPrice) * holding.shares,
      name: technical.name,
    });
  }

  const whaleSignals = [...await getSignalsForPortfolio(holdings), ...db.whales.findAll()];
  return { holdings: enrichedHoldings, recommendations, whaleSignals };
}

// POST /api/email/trigger — manually trigger email digest
router.post('/trigger', async (req, res) => {
  try {
    console.log('📊 Running full portfolio analysis...');
    const { holdings, recommendations, whaleSignals } = await runFullAnalysis(auth.currentEmail(req));
    const result = await sendDailyDigest({ holdings, recommendations, whaleSignals });
    res.json({ success: true, ...result, holdingsAnalyzed: holdings.length, whaleSignals: whaleSignals.length });
  } catch (err) {
    console.error('Email trigger error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, runFullAnalysis };

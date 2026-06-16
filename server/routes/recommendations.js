const express = require('express');
const router  = express.Router();
const db      = require('../models/db');
const mds     = require('../services/marketDataService');
const { normalizeSymbol, displaySymbol, round } = require('../services/indianMarketData');

// Generate simple rule-based recommendations from batch price data only
// No per-stock API calls — uses only data already fetched in batch
router.get('/', async (req, res) => {
  try {
    const holdings = db.portfolio.findAll();
    if (!holdings.length) return res.json({ recommendations: [], generatedAt: new Date().toISOString() });

    // One batch price call for all holdings
    const tickers  = holdings.map(h => h.ticker);
    let priceMap   = {};
    try {
      priceMap = await mds.getBatchPrices(tickers);
    } catch (err) {
      console.warn('Batch price fetch failed for recommendations:', err.message);
    }

    const recs = holdings.map(h => {
      const currentPrice = priceMap[h.ticker] || h.avgBuyPrice;
      const pnlPct       = ((currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100;
      const livePrice    = !!priceMap[h.ticker];

      // Simple rule-based recommendation from P&L only (no extra API calls)
      const reasons = [];
      let action = 'HOLD';

      if (pnlPct > 50) {
        action = 'TRIM';
        reasons.push({ type:'bullish', text:`Up ${round(pnlPct,1)}% — consider booking partial profits` });
      } else if (pnlPct > 20) {
        action = 'HOLD';
        reasons.push({ type:'bullish', text:`Up ${round(pnlPct,1)}% — strong performer, hold position` });
      } else if (pnlPct > 0) {
        action = 'HOLD';
        reasons.push({ type:'neutral', text:`Up ${round(pnlPct,1)}% — in profit, monitor for continuation` });
      } else if (pnlPct > -20) {
        action = 'HOLD';
        reasons.push({ type:'neutral', text:`Down ${Math.abs(round(pnlPct,1))}% — within acceptable range` });
      } else if (pnlPct > -40) {
        action = 'HOLD';
        reasons.push({ type:'caution', text:`Down ${Math.abs(round(pnlPct,1))}% — review original thesis` });
      } else {
        action = 'SELL';
        reasons.push({ type:'bearish', text:`Down ${Math.abs(round(pnlPct,1))}% — significant loss, review position` });
      }

      if (!livePrice) {
        reasons.push({ type:'neutral', text:'Live price unavailable — add TWELVE_DATA_API_KEY for full analysis' });
      }

      return {
        ticker:        h.ticker,
        displayTicker: h.ticker.replace('.NS','').replace('.BO',''),
        recommendation: action.toLowerCase().replace(' ','_'),
        confidence:    livePrice ? 0.7 : 0.4,
        reasons,
        currentPrice:  round(currentPrice),
        pnlPct:        round(pnlPct,2),
        livePrice,
      };
    });

    db.recommendations.clear();
    recs.forEach(r => db.recommendations.upsert(r));

    res.json({ recommendations: recs, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

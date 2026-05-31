const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { normalizeSymbol } = require('../services/indianMarketData');
const { getSignalsForPortfolio } = require('../services/signalsService');

// GET /api/whales?type=institutional|analyst|volume_spike|momentum
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    const manualSignals = db.whales.findAll();
    const generatedSignals = await getSignalsForPortfolio(db.portfolio.findAll());
    const allSignals = [...generatedSignals, ...manualSignals];
    const signals = type ? allSignals.filter(s => s.signalType === type) : allSignals;
    res.json({ signals, count: signals.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whales — manually add a signal
router.post('/', (req, res) => {
  try {
    const { ticker, signalType, institutionName, detail, source } = req.body;
    if (!ticker || !signalType) return res.status(400).json({ error: 'ticker and signalType are required' });
    const signal = db.whales.create({ ticker: normalizeSymbol(ticker), signalType, institutionName: institutionName || null, signalDate: new Date().toISOString().split('T')[0], detail: detail || {}, source: source || '' });
    res.status(201).json(signal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

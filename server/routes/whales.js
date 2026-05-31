const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { normalizeSymbol } = require('../services/indianMarketData');

// GET /api/whales?type=13f|options|volume_spike|dark_pool
router.get('/', (req, res) => {
  try {
    const { type } = req.query;
    const signals = db.whales.findAll(type ? { signalType: type } : null);
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

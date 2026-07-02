const express = require('express');
const router  = express.Router();
const auth    = require('../services/authService');
const premarket = require('../services/preMarketService');

// GET /api/premarket — market direction, breadth, sector heat, movers + user overlay.
// Market-wide payload is cached server-side (~10 min); safe to poll.
router.get('/', async (req, res) => {
  try {
    res.json(await premarket.getPreMarketInsight(auth.currentEmail(req)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

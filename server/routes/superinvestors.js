const express = require('express');
const router  = express.Router();
const { getSuperInvestors } = require('../services/superInvestors');

// GET /api/superinvestors  (?refresh=1 to bypass the 12h cache)
router.get('/', async (req, res) => {
  try {
    const data = await getSuperInvestors({ force: req.query.refresh === '1' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router  = express.Router();
const { getIndianInvestors } = require('../services/indianInvestors');

// GET /api/indian-investors  (?refresh=1 to bypass the 30-min cache)
router.get('/', async (req, res) => {
  try {
    res.json(await getIndianInvestors({ force: req.query.refresh === '1' }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

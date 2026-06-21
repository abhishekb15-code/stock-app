const express = require('express');
const router  = express.Router();
const store   = require('../services/store');
const auth    = require('../services/authService');
const billing = require('../services/billingService');

// GET /api/profile — the signed-in user's details
router.get('/', async (req, res) => {
  try {
    const email = auth.currentEmail(req);
    const [p, plan] = await Promise.all([store.getProfile(email), billing.getPlan(email)]);
    res.json({ ...p, plan: plan.plan, planStatus: plan.status, billingEnabled: billing.billingEnabled() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/profile { name, phone }
router.put('/', async (req, res) => {
  try {
    const email = auth.currentEmail(req);
    const update = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length > 80) return res.status(400).json({ error: 'Name is too long' });
      update.name = name;
    }
    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone).trim();
      if (phone && !/^[+]?[\d\s()-]{6,20}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid phone number' });
      update.phone = phone || null;
    }
    const profile = await store.updateProfile(email, update);

    // Keep the session name in sync so the sidebar updates without re-login.
    const sess = auth.currentUser(req);
    if (sess && update.name !== undefined) auth.issueSession(res, { ...sess, name: update.name, verified: sess.ver });

    res.json(profile);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

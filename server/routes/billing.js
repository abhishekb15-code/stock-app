const express = require('express');
const router  = express.Router();
const auth    = require('../services/authService');
const billing = require('../services/billingService');

// GET /api/billing/me — current plan + available plans
router.get('/me', async (req, res) => {
  try {
    const email = auth.currentEmail(req);
    const plan = await billing.getPlan(email);
    res.json({ billingEnabled: billing.billingEnabled(), provider: billing.activeProvider(), ...plan, plans: billing.publicPlans() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/billing/checkout { planId } — start an upgrade
router.post('/checkout', async (req, res) => {
  try {
    if (!billing.billingEnabled()) return res.status(503).json({ error: 'Billing is not configured yet' });
    const result = await billing.createCheckout({ email: auth.currentEmail(req), planId: req.body.planId, baseUrl: auth.baseUrl(req) });
    res.json(result);   // { url } (provider checkout / mock success page)
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// POST /api/billing/cancel — downgrade to Free
router.post('/cancel', async (req, res) => {
  try {
    const plan = await billing.cancel(auth.currentEmail(req));
    res.json(plan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

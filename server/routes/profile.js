const express = require('express');
const router  = express.Router();
const store   = require('../services/store');
const auth    = require('../services/authService');
const billing = require('../services/billingService');

const MAX_PHOTO = 700 * 1024;   // ~700 KB data URL (client resizes before upload)

// GET /api/profile — the signed-in user's details
router.get('/', async (req, res) => {
  try {
    const email = auth.currentEmail(req);
    const [p, plan] = await Promise.all([store.getProfile(email), billing.getPlan(email)]);
    res.json({ ...p, plan: plan.plan, planStatus: plan.status, billingEnabled: billing.billingEnabled() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/profile { name, phone, picture }
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
    if (req.body.picture !== undefined) {
      const pic = req.body.picture;
      if (pic === null || pic === '') update.picture = null;
      else if (typeof pic === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(pic) && pic.length <= MAX_PHOTO) update.picture = pic;
      else return res.status(400).json({ error: 'Invalid image (use PNG/JPG/WebP under 700 KB)' });
    }
    const profile = await store.updateProfile(email, update);

    // Keep the session in sync so the sidebar updates without re-login.
    const sess = auth.currentUser(req);
    if (sess && (update.name !== undefined || update.picture !== undefined))
      auth.issueSession(res, { ...sess, name: update.name ?? sess.name, picture: update.picture !== undefined ? update.picture : sess.picture, verified: sess.ver });

    res.json(profile);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/profile/change-password { currentPassword, newPassword }
router.post('/change-password', async (req, res) => {
  try {
    const email = auth.currentEmail(req);
    const user = await store.getUser(email);
    if (!user || !user.passwordHash) return res.status(400).json({ error: 'This account signs in with Google — no password to change' });
    if (!auth.verifyPassword(req.body.currentPassword || '', user.passwordHash))
      return res.status(401).json({ error: 'Current password is incorrect' });
    const next = req.body.newPassword || '';
    if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    await store.setPassword(email, auth.hashPassword(next));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/profile/preferences { dailyDigest }
router.put('/preferences', async (req, res) => {
  try {
    const email = auth.currentEmail(req);
    const patch = {};
    if (req.body.dailyDigest !== undefined) patch.dailyDigest = !!req.body.dailyDigest;
    const prefs = await store.updatePrefs(email, patch);
    res.json({ prefs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

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
    // NEVER store a base64 data: URL in the JWT — it would blow past the ~4KB
    // cookie limit and silently drop the session. Uploaded photos live in the
    // DB and are loaded by the Profile page from /api/profile instead.
    const sess = auth.currentUser(req);
    if (sess && (update.name !== undefined || update.picture !== undefined)) {
      let nextPic = sess.picture;
      if (update.picture === null) nextPic = null;
      else if (typeof update.picture === 'string' && !update.picture.startsWith('data:')) nextPic = update.picture;
      auth.issueSession(res, { ...sess, name: update.name ?? sess.name, picture: nextPic, verified: sess.ver });
    }

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

// GET /api/profile/export — download all of the user's data (DPDP / GDPR right).
router.get('/export', async (req, res) => {
  try {
    const email = auth.currentEmail(req);
    const data = await store.exportData(email);
    res.setHeader('Content-Disposition', 'attachment; filename="stock-intel-data.json"');
    res.json({ exportedAt: new Date().toISOString(), account: email, ...data });
  } catch (err) { console.error('Export failed:', err.message); res.status(500).json({ error: 'Could not export your data' }); }
});

// DELETE /api/profile/account { password? } — permanent account + data deletion.
router.delete('/account', async (req, res) => {
  try {
    const email = auth.currentEmail(req);
    if (email === store.LOCAL_USER) return res.status(400).json({ error: 'The local account cannot be deleted' });
    // If the account has a password, require it to confirm the destructive action.
    const user = await store.getUser(email);
    if (user && user.passwordHash && !auth.verifyPassword(req.body.password || '', user.passwordHash))
      return res.status(401).json({ error: 'Password is incorrect' });
    await store.deleteAccount(email);
    auth.clearSession(res);
    res.json({ success: true });
  } catch (err) { console.error('Account deletion failed:', err.message); res.status(500).json({ error: 'Could not delete your account' }); }
});

module.exports = router;

const express = require('express');
const rateLimit = require('express-rate-limit');
const router  = express.Router();
const auth    = require('../services/authService');
const store   = require('../services/store');

// Throttle credential endpoints to slow brute-force attempts.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// GET /api/auth/me — current session + which methods are available
router.get('/me', (req, res) => {
  const user = auth.currentUser(req);
  res.json({
    authEnabled:     auth.isConfigured(),
    googleEnabled:   auth.googleConfigured(),
    authenticated:   !!user,
    user: user ? { email: user.email, name: user.name, picture: user.picture } : null,
  });
});

// POST /api/auth/register { email, password, name }
router.post('/register', limiter, async (req, res) => {
  try {
    if (!auth.isConfigured()) return res.status(503).json({ error: 'Auth is not configured on the server' });
    const email = auth.normalizeEmail(req.body.email);
    const password = req.body.password || '';
    const name = (req.body.name || '').trim() || email.split('@')[0];
    if (!auth.validEmail(email))   return res.status(400).json({ error: 'Enter a valid email address' });
    if (password.length < 8)       return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!auth.isAllowed(email))    return res.status(403).json({ error: 'This email is not permitted to sign up' });

    const existing = await store.getUser(email);
    if (existing && existing.passwordHash) return res.status(409).json({ error: 'An account with this email already exists — please sign in' });

    await store.ensureUser(email, { name, provider: 'password', passwordHash: auth.hashPassword(password) });
    auth.issueSession(res, { email, name });
    res.status(201).json({ user: { email, name } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/login { email, password }
router.post('/login', limiter, async (req, res) => {
  try {
    if (!auth.isConfigured()) return res.status(503).json({ error: 'Auth is not configured on the server' });
    const email = auth.normalizeEmail(req.body.email);
    const password = req.body.password || '';
    const user = await store.getUser(email);
    if (!user || !user.passwordHash || !auth.verifyPassword(password, user.passwordHash))
      return res.status(401).json({ error: 'Invalid email or password' });
    auth.issueSession(res, { email: user.email, name: user.name, picture: user.picture });
    res.json({ user: { email: user.email, name: user.name, picture: user.picture } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/auth/google — start the OAuth flow
router.get('/google', (req, res) => {
  if (!auth.googleConfigured()) return res.status(503).json({ error: 'Google sign-in is not configured on the server' });
  res.redirect(auth.googleAuthUrl(req, res));
});

// GET /api/auth/google/callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const expectedState = auth.parseCookies(req).oauth_state;
    if (!code || !state || state !== expectedState) return res.redirect('/?auth_error=invalid_state');

    const profile = await auth.exchangeCode(req, code);
    const email = auth.normalizeEmail(profile.email);
    if (!email || profile.email_verified === false) return res.redirect('/?auth_error=unverified');
    if (!auth.isAllowed(email)) return res.redirect(`/?auth_error=not_allowed&email=${encodeURIComponent(email)}`);

    await store.ensureUser(email, { name: profile.name, picture: profile.picture, provider: 'google' });
    auth.issueSession(res, { email, name: profile.name, picture: profile.picture });
    res.redirect('/');
  } catch (err) {
    res.redirect('/?auth_error=failed');
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => { auth.clearSession(res); res.json({ success: true }); });

module.exports = router;

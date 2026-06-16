const express = require('express');
const router  = express.Router();
const auth    = require('../services/authService');

// GET /api/auth/me — current session + whether auth is on
router.get('/me', (req, res) => {
  const user = auth.currentUser(req);
  res.json({
    authEnabled:   auth.isConfigured(),
    authenticated: !!user,
    user: user ? { email: user.email, name: user.name, picture: user.picture } : null,
  });
});

// GET /api/auth/google — start the OAuth flow
router.get('/google', (req, res) => {
  if (!auth.isConfigured()) return res.status(503).json({ error: 'Google auth is not configured on the server' });
  res.redirect(auth.googleAuthUrl(req, res));
});

// GET /api/auth/google/callback — Google redirects here with ?code&state
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const expectedState = auth.parseCookies(req).oauth_state;
    if (!code || !state || state !== expectedState) return res.redirect('/?auth_error=invalid_state');

    const profile = await auth.exchangeCode(req, code);
    if (!profile.email || profile.email_verified === false) return res.redirect('/?auth_error=unverified');
    if (!auth.isAllowed(profile.email)) return res.redirect(`/?auth_error=not_allowed&email=${encodeURIComponent(profile.email)}`);

    auth.issueSession(res, profile);
    res.redirect('/');
  } catch (err) {
    res.redirect('/?auth_error=failed');
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => { auth.clearSession(res); res.json({ success: true }); });

module.exports = router;

const express = require('express');
const rateLimit = require('express-rate-limit');
const router  = express.Router();
const auth    = require('../services/authService');
const store   = require('../services/store');
const { sendVerificationEmail, sendPasswordResetEmail, isEmailConfigured } = require('../services/emailService');

// Throttle credential endpoints to slow brute-force attempts.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

const VERIFY_TTL = 24 * 60 * 60 * 1000;   // 24h
const RESET_TTL  = 60 * 60 * 1000;        // 1h

async function emailVerification(req, email) {
  const token = auth.genToken();
  await store.setVerifyToken(email, token, Date.now() + VERIFY_TTL);
  await sendVerificationEmail(email, `${auth.baseUrl(req)}/api/auth/verify?token=${token}`);
}

// GET /api/auth/me — session + available methods + verification state
router.get('/me', async (req, res) => {
  const sess = auth.currentUser(req);
  let verified = sess ? sess.ver !== false : false;
  if (sess && !verified) {   // they may have verified in another tab — refresh from store + re-issue cookie
    const u = await store.getUser(sess.email).catch(() => null);
    if (u && u.emailVerified) { verified = true; auth.issueSession(res, { ...sess, verified: true }); }
  }
  res.json({
    authEnabled:        auth.isConfigured(),
    googleEnabled:      auth.googleConfigured(),
    emailConfigured:    isEmailConfigured(),
    verificationRequired: auth.emailVerificationEnforced(),
    authenticated:      !!sess,
    verified,
    user: sess ? { email: sess.email, name: sess.name, picture: sess.picture } : null,
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

    // If we can't send email, auto-verify (can't gate on something we can't deliver).
    const verified = !isEmailConfigured();
    await store.ensureUser(email, { name, provider: 'password', passwordHash: auth.hashPassword(password), emailVerified: verified });
    if (!verified) await emailVerification(req, email);

    auth.issueSession(res, { email, name, verified });
    res.status(201).json({ user: { email, name }, needsVerification: !verified });
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
    auth.issueSession(res, { email: user.email, name: user.name, picture: user.picture, verified: !!user.emailVerified });
    res.json({ user: { email: user.email, name: user.name, picture: user.picture }, needsVerification: !user.emailVerified });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/resend-verification — for the signed-in (unverified) user
router.post('/resend-verification', limiter, async (req, res) => {
  try {
    const sess = auth.currentUser(req);
    if (!sess) return res.status(401).json({ error: 'Not signed in' });
    if (!isEmailConfigured()) return res.status(400).json({ error: 'Email sending is not configured on the server' });
    await emailVerification(req, sess.email);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/auth/verify?token= — link from the verification email
router.get('/verify', async (req, res) => {
  try {
    const result = await store.consumeVerifyToken(req.query.token || '');
    if (!result) return res.redirect('/?verify_error=1');
    // If this is the same browser/session, refresh the cookie so it's verified.
    const sess = auth.currentUser(req);
    if (sess && sess.email === result.email) auth.issueSession(res, { ...sess, verified: true });
    res.redirect('/?verified=1');
  } catch { res.redirect('/?verify_error=1'); }
});

// POST /api/auth/forgot-password { email }
router.post('/forgot-password', limiter, async (req, res) => {
  try {
    const email = auth.normalizeEmail(req.body.email);
    const user = await store.getUser(email);
    if (user && user.passwordHash && isEmailConfigured()) {
      const token = auth.genToken();
      await store.setResetToken(email, token, Date.now() + RESET_TTL);
      await sendPasswordResetEmail(email, `${auth.baseUrl(req)}/reset-password?token=${token}`);
    }
    // Always generic — never reveal whether an email exists.
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/reset-password { token, password }
router.post('/reset-password', limiter, async (req, res) => {
  try {
    const password = req.body.password || '';
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const result = await store.consumeResetToken(req.body.token || '', auth.hashPassword(password));
    if (!result) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    const user = await store.getUser(result.email);
    auth.issueSession(res, { email: result.email, name: user?.name, verified: true });
    res.json({ success: true, user: { email: result.email, name: user?.name } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/auth/google
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

    await store.ensureUser(email, { name: profile.name, picture: profile.picture, provider: 'google', emailVerified: true });
    auth.issueSession(res, { email, name: profile.name, picture: profile.picture, verified: true });
    res.redirect('/');
  } catch (err) {
    res.redirect('/?auth_error=failed');
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => { auth.clearSession(res); res.json({ success: true }); });

module.exports = router;

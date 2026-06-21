/**
 * authService.js
 *
 * Google Sign-In (OAuth 2.0 authorization-code flow) with an email allowlist,
 * backed by a stateless HMAC-signed session cookie. No external dependencies and
 * no database — works on Render's in-memory setup.
 *
 * Auth is ENFORCED only when fully configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 * JWT_SECRET, ALLOWED_EMAILS). Until then the app stays open (with a console
 * warning) so a deploy can't lock everyone out before the OAuth client is set up.
 *
 * Forward-compatible with multi-tenant SaaS: the session carries the user's
 * identity (email/sub), so going multi-customer later is "drop the allowlist +
 * key data by user + add a DB", not a rewrite.
 */

const https  = require('https');
const crypto = require('crypto');

const COOKIE_NAME = 'sid';
const SESSION_TTL = 7 * 24 * 60 * 60;   // 7 days (seconds)

const cfg = {
  clientId:     process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  jwtSecret:    process.env.JWT_SECRET || '',
  allowed:      (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
  baseUrl:      process.env.APP_BASE_URL || '',
  isProd:       process.env.NODE_ENV === 'production' || !!process.env.RENDER,
};

// Auth is ON whenever we can sign sessions (email/password works with just JWT_SECRET).
function isConfigured() {
  return !!cfg.jwtSecret;
}
// Google is an additional option, only when its credentials are present.
function googleConfigured() {
  return !!(cfg.clientId && cfg.clientSecret && cfg.jwtSecret);
}

// Open signup (any email) when no allowlist is set or it contains "*".
// Otherwise restrict to the allow-listed emails.
function isAllowed(email) {
  if (!email) return false;
  if (!cfg.allowed.length || cfg.allowed.includes('*')) return true;
  return cfg.allowed.includes(email.toLowerCase());
}

// ── Password hashing (scrypt — no external deps) ───────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64);
  const ref  = Buffer.from(hash, 'hex');
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}
const normalizeEmail = (e) => (e || '').trim().toLowerCase();
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// ── Tiny JWT (HMAC-SHA256) ─────────────────────────────────────────────────────
const b64url = (buf) => Buffer.from(buf).toString('base64url');
function sign(payload) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_TTL };
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = `${head}.${b64url(JSON.stringify(body))}`;
  const sig  = crypto.createHmac('sha256', cfg.jwtSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}
function verify(token) {
  if (!token || token.split('.').length !== 3) return null;
  const [head, payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', cfg.jwtSecret).update(`${head}.${payload}`).digest('base64url');
  // timing-safe compare
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}

// ── Cookies ─────────────────────────────────────────────────────────────────────
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i > -1) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function setCookie(res, name, value, maxAgeSec) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (cfg.isProd) parts.push('Secure');
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  res.append('Set-Cookie', parts.join('; '));
}

// ── HTTP helpers for Google endpoints ────────────────────────────────────────────
function postForm(host, path, form) {
  const body = new URLSearchParams(form).toString();
  return new Promise((resolve, reject) => {
    const req = https.request({ host, path, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d || '{}'))); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
function getJson(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d || '{}'))); })
      .on('error', reject);
  });
}

function baseUrl(req) {
  if (cfg.baseUrl) return cfg.baseUrl.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  return `${proto}://${req.headers.host}`;
}
const redirectUri = (req) => `${baseUrl(req)}/api/auth/google/callback`;

// Build the Google consent URL + a CSRF state.
function googleAuthUrl(req, res) {
  const state = crypto.randomBytes(16).toString('hex');
  setCookie(res, 'oauth_state', state, 600);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Exchange the code for the user's verified profile.
async function exchangeCode(req, code) {
  const tok = await postForm('oauth2.googleapis.com', '/token', {
    code, client_id: cfg.clientId, client_secret: cfg.clientSecret,
    redirect_uri: redirectUri(req), grant_type: 'authorization_code',
  });
  if (!tok.access_token) throw new Error('Token exchange failed');
  const info = await getJson('https://www.googleapis.com/oauth2/v3/userinfo', { Authorization: `Bearer ${tok.access_token}` });
  return info;   // { sub, email, email_verified, name, picture }
}

function issueSession(res, user) {
  const token = sign({ sub: user.sub, email: user.email, name: user.name, picture: user.picture });
  setCookie(res, COOKIE_NAME, token, SESSION_TTL);
}
function clearSession(res) { setCookie(res, COOKIE_NAME, '', 0); }

function currentUser(req) {
  return verify(parseCookies(req)[COOKIE_NAME] || '');
}

// The email that scopes a request's data. Falls back to the single local user
// when auth is disabled (local/single-user mode).
function currentEmail(req) {
  return ((req.user && req.user.email) || 'local@local').toLowerCase();
}

// Middleware — enforces auth only when configured.
function requireAuth(req, res, next) {
  if (!isConfigured()) return next();        // not set up yet → app stays open
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  next();
}

module.exports = {
  cfg, isConfigured, googleConfigured, isAllowed, googleAuthUrl, exchangeCode, issueSession,
  clearSession, currentUser, requireAuth, parseCookies, COOKIE_NAME,
  hashPassword, verifyPassword, normalizeEmail, validEmail, currentEmail,
};

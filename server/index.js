require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const monitoring = require('./services/monitoring');
const { validateConfig } = require('./config/validate');

// Config check + error tracking. Wrapped so they can NEVER prevent the server
// from starting — a startup hiccup here must not stop us binding the port
// (Render fails the deploy with "no open ports detected" if we never listen).
try { validateConfig(); } catch (e) { console.error('Config check error:', e.message); }
try { monitoring.init();  } catch (e) { console.error('Monitoring init error:', e.message); }

let listening = false;   // becomes true once the HTTP server is bound

// Runtime errors: log + report, keep serving. But if something throws DURING
// startup (before we bind the port), exit loudly so the real error shows in the
// logs instead of a silent "no open ports" timeout.
process.on('unhandledRejection', (err) => { console.error('UnhandledRejection:', err); monitoring.capture(err, { kind: 'unhandledRejection' }); });
process.on('uncaughtException',  (err) => {
  console.error('UncaughtException:', err);
  monitoring.capture(err, { kind: 'uncaughtException' });
  if (!listening) process.exit(1);   // startup failure → crash with a clear stack
});

const stockRoutes = require('./routes/stocks');
const portfolioRoutes = require('./routes/portfolio');
const whaleRoutes = require('./routes/whales');
const { router: emailRoutes } = require('./routes/email');
const recommendationRoutes = require('./routes/recommendations');
const analysisRoutes = require('./routes/analysis');

const { initScheduler } = require('./jobs/scheduler');
const auth = require('./services/authService');
const store = require('./services/store');

const app = express();
app.set('trust proxy', 1);   // Render runs behind a proxy (needed for secure cookies / proto)
const PORT = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

// The React build folder is one level up at ../client/build
const CLIENT_BUILD = path.join(__dirname, '..', 'client', 'build');
const hasBuild = fs.existsSync(path.join(CLIENT_BUILD, 'index.html'));

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      // App is inline-style heavy and CRA inlines a small runtime script.
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],   // profile-photo data URLs + Google avatars
      connectSrc: ["'self'"],
      fontSrc:    ["'self'", 'data:'],
      objectSrc:  ["'none'"],
      baseUri:    ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS: allow-list in prod (same-origin requests carry no Origin and are always
// allowed). The web app and the Capacitor shell both load the app's own origin,
// so cross-origin is only for explicitly listed hosts.
const allowedOrigins = [process.env.APP_BASE_URL, 'https://stock-intelligence-jttc.onrender.com']
  .filter(Boolean).map(o => o.replace(/\/$/, ''));
app.use(cors({
  credentials: true,
  origin: (IS_PROD || hasBuild)
    ? (origin, cb) => cb(null, !origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin.replace(/\/$/, '')))
    : 'http://localhost:3000',   // dev: CRA dev server
}));
app.use(morgan(IS_PROD ? 'combined' : 'dev'));

const billing = require('./services/billingService');
// Payment webhooks need the RAW body for signature verification — mount BEFORE
// the JSON parser and before the auth gate (providers call without our cookie).
app.post('/api/billing/webhook/:provider', express.raw({ type: '*/*' }), async (req, res) => {
  try { req.rawBody = req.body.toString('utf8'); await billing.handleWebhook(req.params.provider, req); res.json({ received: true }); }
  catch (err) { console.warn('Webhook error:', err.message); res.status(400).json({ error: err.message }); }
});

app.use(express.json({ limit: '1mb' }));   // 1mb to allow small profile-photo uploads

// Baseline per-IP rate limit across the whole API — caps scraping and runaway
// data/AI cost. Generous enough for normal use (a page load fires ~8 requests);
// auth and chat keep their own stricter limits on top of this.
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
  skip: (req) => req.path === '/health',
}));

// Open routes (no auth): health check + auth endpoints themselves
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: 'live',
    market: 'India NSE',
    dataProvider: 'yahoo-finance2',
    authEnabled: auth.isConfigured(),
    billingEnabled: billing.billingEnabled(),
    servesFrontend: hasBuild,
  });
});
app.use('/api/auth', require('./routes/auth'));

if (auth.isConfigured()) {
  console.log(`🔒 Auth ENABLED — ${auth.cfg.restrict ? `invite-only (${auth.cfg.allowed.length} allowed email(s))` : 'open signup (any email)'}`);
} else {
  console.warn('⚠️  Auth DISABLED — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, ALLOWED_EMAILS to lock the app down.');
}
app.use('/api', auth.requireAuth);       // must be signed in
app.use('/api', auth.requireVerified);   // …and email-verified (when enforced)

// Account routes — must be signed in, not Pro-gated
app.use('/api/profile', require('./routes/profile'));
app.use('/api/billing', require('./routes/billing'));

// Free API routes
app.use('/api/stock', stockRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/whales', whaleRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/watchlist', require('./routes/watchlist'));
app.use('/api/premarket', require('./routes/premarket'));

// Pro-only API routes (gated when billing is enabled)
app.use('/api/analysis', billing.requirePro, analysisRoutes);
app.use('/api/chat', billing.requirePro, require('./routes/chat'));
app.use('/api/signals', billing.requirePro, require('./routes/signals'));
app.use('/api/superinvestors', billing.requirePro, require('./routes/superinvestors'));
app.use('/api/indian-investors', billing.requirePro, require('./routes/indianInvestors'));

app.use('/api/debug', require('./routes/debug'));

// Serve React build (production / local single-port mode)
if (hasBuild) {
  app.use(express.static(CLIENT_BUILD));
  // All non-API routes → React index.html (client-side routing)
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_BUILD, 'index.html'));
  });
  console.log('🖥️  Serving React build from client/build');
} else {
  app.get('/', (req, res) => {
    res.json({
      message: 'Stock Intelligence API is running.',
      hint: 'Run `npm run build` inside the client folder, then restart the server to serve the UI.',
      api: `http://localhost:${PORT}/api/health`,
    });
  });
}

// Error handler — log full detail server-side + report to Sentry, but never
// leak internals (stack/DB errors) to the client.
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  monitoring.capture(err, { path: req.path, method: req.method });
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  listening = true;
  console.log(`\n🚀 Stock Intelligence Server running on http://localhost:${PORT}`);
  console.log('📊 Mode: 🟢 LIVE NSE DATA via yahoo-finance2');
  if (hasBuild) {
    console.log(`🌐 Open in browser → http://localhost:${PORT}`);
  } else {
    console.log('⚠️  No React build found. Run: cd client && npm run build');
  }
  store.init().catch(e => console.error('Store init failed:', e.message));
  initScheduler();
  // Pre-warm the pre-market snapshot so the first Dashboard load is instant.
  require('./services/preMarketService').getPreMarketInsight('local@local')
    .then(() => console.log('🌅 Pre-market snapshot warmed'))
    .catch(e => console.warn('Pre-market warm-up failed:', e.message));
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

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
  contentSecurityPolicy: false, // allow React app to load fonts, scripts etc.
}));
app.use(cors({
  origin: IS_PROD || hasBuild
    ? true                        // same-origin when serving build
    : 'http://localhost:3000',    // dev: allow CRA dev server
}));
app.use(morgan('dev'));

const billing = require('./services/billingService');
// Payment webhooks need the RAW body for signature verification — mount BEFORE
// the JSON parser and before the auth gate (providers call without our cookie).
app.post('/api/billing/webhook/:provider', express.raw({ type: '*/*' }), async (req, res) => {
  try { req.rawBody = req.body.toString('utf8'); await billing.handleWebhook(req.params.provider, req); res.json({ received: true }); }
  catch (err) { console.warn('Webhook error:', err.message); res.status(400).json({ error: err.message }); }
});

app.use(express.json());

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
  console.log(`🔒 Auth ENABLED — Google Sign-In, ${auth.cfg.allowed.includes('*') ? 'any verified Google account' : auth.cfg.allowed.length + ' allowed email(s)'}`);
} else {
  console.warn('⚠️  Auth DISABLED — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, ALLOWED_EMAILS to lock the app down.');
}
app.use('/api', auth.requireAuth);       // must be signed in
app.use('/api', auth.requireVerified);   // …and email-verified (when enforced)

// Billing (account/plan) — must be signed in, not Pro-gated
app.use('/api/billing', require('./routes/billing'));

// Free API routes
app.use('/api/stock', stockRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/whales', whaleRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/watchlist', require('./routes/watchlist'));

// Pro-only API routes (gated when billing is enabled)
app.use('/api/analysis', billing.requirePro, analysisRoutes);
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

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Stock Intelligence Server running on http://localhost:${PORT}`);
  console.log('📊 Mode: 🟢 LIVE NSE DATA via yahoo-finance2');
  if (hasBuild) {
    console.log(`🌐 Open in browser → http://localhost:${PORT}`);
  } else {
    console.log('⚠️  No React build found. Run: cd client && npm run build');
  }
  store.init().catch(e => console.error('Store init failed:', e.message));
  initScheduler();
});

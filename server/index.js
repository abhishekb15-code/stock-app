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

const { initScheduler } = require('./jobs/scheduler');

const app = express();
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
app.use(express.json());

// API Routes
app.use('/api/stock', stockRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/whales', whaleRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/recommendations', recommendationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: 'live',
    market: 'India NSE',
    dataProvider: 'yahoo-finance2',
    servesFrontend: hasBuild,
  });
});

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
  initScheduler();
});

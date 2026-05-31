require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const stockRoutes = require('./routes/stocks');
const portfolioRoutes = require('./routes/portfolio');
const whaleRoutes = require('./routes/whales');
const { router: emailRoutes } = require('./routes/email');
const recommendationRoutes = require('./routes/recommendations');

const { initScheduler } = require('./jobs/scheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api/stock', stockRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/whales', whaleRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/recommendations', recommendationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), mode: 'live', market: 'India NSE', dataProvider: 'yahoo-finance2' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Stock Intelligence Server running on http://localhost:${PORT}`);
  console.log('📊 Mode: 🟢 LIVE NSE DATA via yahoo-finance2');
  initScheduler();
});

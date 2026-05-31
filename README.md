# Stock Intelligence & Portfolio Analyzer

A full-stack Indian stock market analysis app with live NSE quotes, technical indicators, portfolio P&L, recommendations, and daily email digests.

## Features

- Deep stock analysis: RSI, MACD, Bollinger Bands, EMA 20/50/200, SMA 20/50, support, and resistance
- Live NSE market data via `yahoo-finance2`
- NSE symbol defaults: `RELIANCE`, `TCS`, and `INFY` become `RELIANCE.NS`, `TCS.NS`, and `INFY.NS`
- Portfolio tracker with buy price, current price, P&L, P&L %, and sector allocation
- Recommendation generation from real technical indicators and Yahoo Finance valuation data when available
- Daily email digest with live portfolio analysis

## Quick Start

```bash
npm run install:all
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Health check: http://localhost:5000/api/health

No market data API key is required. Yahoo Finance availability and rate limits still apply.

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server status |
| GET | `/api/stock/:ticker` | Full live analysis for an NSE stock |
| GET | `/api/stock/:ticker/technical` | Technical indicators and chart data |
| GET | `/api/stock/:ticker/fundamental` | Yahoo Finance fundamentals and valuation |
| GET | `/api/portfolio` | Holdings with live P&L and indicators |
| POST | `/api/portfolio` | Add holding `{ ticker, shares, avgBuyPrice }` |
| PUT | `/api/portfolio/:id` | Update holding |
| DELETE | `/api/portfolio/:id` | Remove holding |
| GET | `/api/whales` | Manually added institutional signals |
| GET | `/api/recommendations` | Buy/Hold/Sell recommendations for portfolio |
| POST | `/api/email/trigger` | Manually run daily digest |

## Project Structure

```text
stock-app/
  server/
    index.js
    routes/
      stocks.js
      portfolio.js
      whales.js
      email.js
      recommendations.js
    services/
      indianMarketData.js
      emailService.js
    models/
      db.js
    jobs/
      scheduler.js
  client/
    src/
      App.js
      pages/
        Dashboard.js
        Portfolio.js
        StockDeepDive.js
        WhaleSignals.js
      components/
        layout/Sidebar.js
```

## Email Setup

Add these values to `server/.env` to enable Gmail digests:

```env
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
EMAIL_RECIPIENT=recipient@gmail.com
PORT=5000
```

## Database Note

The app currently uses an in-memory development store for holdings and manually added signals. Replace `server/models/db.js` with persistent SQL queries when moving to production.

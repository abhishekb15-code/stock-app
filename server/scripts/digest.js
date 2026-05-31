/**
 * digest.js — Standalone portfolio digest script
 * Used by GitHub Actions daily-digest.yml workflow.
 * Runs analysis directly (no HTTP server needed) and sends email or logs to console.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { getStockAnalysis, getFundamentals, generateRecommendation, getPortfolioHoldings } = require('../services/indianMarketData');
const { sendDailyDigest } = require('../services/emailService');
const { getSignalsForPortfolio } = require('../services/signalsService');
const db = require('../models/db');

const OUTPUT_FILE = path.join(__dirname, '..', 'digest-output.json');

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function run() {
  const startTime = Date.now();
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   📈 Stock Intelligence Daily Digest   ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n🕐 Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST\n`);

  // Load portfolio from persistent store (or defaults)
  const rawHoldings = db.portfolio.findAll();
  if (rawHoldings.length === 0) {
    console.log('⚠️  No holdings in portfolio. Using default holdings.');
  }
  const holdings = rawHoldings.length > 0 ? rawHoldings : getPortfolioHoldings();
  console.log(`📋 Analyzing ${holdings.length} holdings...\n`);

  const enrichedHoldings = [];
  const recommendations = [];

  for (const holding of holdings) {
    const displayTicker = holding.ticker.replace('.NS', '').replace('.BO', '');
    process.stdout.write(`   ⟳  ${displayTicker.padEnd(12)}`);

    try {
      const [technical, fundamental] = await Promise.all([
        getStockAnalysis(holding.ticker),
        getFundamentals(holding.ticker),
      ]);

      const rec = generateRecommendation(holding.ticker, technical.technical, fundamental);
      recommendations.push(rec);

      const currentPrice = technical.price;
      const totalValue = currentPrice * holding.shares;
      const pnl = (currentPrice - holding.avgBuyPrice) * holding.shares;

      enrichedHoldings.push({
        ...holding,
        name: technical.name,
        displayTicker: technical.displayTicker,
        currentPrice,
        dailyChange: technical.change,
        dailyChangePercent: technical.changePercent,
        totalValue,
        pnl,
      });

      const emoji = rec.recommendation === 'buy' ? '🟢' : rec.recommendation === 'sell' ? '🔴' : '🟡';
      console.log(`✅  ${money(currentPrice).padEnd(16)} ${emoji} ${rec.recommendation.toUpperCase()}`);
    } catch (err) {
      console.log(`❌  ERROR: ${err.message}`);
      enrichedHoldings.push({
        ...holding,
        displayTicker,
        name: displayTicker,
        currentPrice: holding.avgBuyPrice,
        dailyChange: 0,
        dailyChangePercent: 0,
        totalValue: holding.avgBuyPrice * holding.shares,
        pnl: 0,
      });
    }
  }

  console.log('\n🐋 Generating whale & institutional signals...');
  let whaleSignals = [];
  try {
    const generated = await getSignalsForPortfolio(holdings);
    const manual = db.whales.findAll();
    whaleSignals = [...generated, ...manual];
    console.log(`   Found ${whaleSignals.length} signals`);
  } catch (err) {
    console.log(`   ⚠️  Signals skipped: ${err.message}`);
  }

  // Portfolio summary
  const totalValue = enrichedHoldings.reduce((s, h) => s + h.totalValue, 0);
  const totalCost = enrichedHoldings.reduce((s, h) => s + h.avgBuyPrice * h.shares, 0);
  const totalPnl = enrichedHoldings.reduce((s, h) => s + h.pnl, 0);
  const dailyPnl = enrichedHoldings.reduce((s, h) => s + (h.dailyChange || 0) * h.shares, 0);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 PORTFOLIO SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Total Value  : ${money(totalValue)}`);
  console.log(`   Total Cost   : ${money(totalCost)}`);
  console.log(`   Total P&L    : ${totalPnl >= 0 ? '+' : ''}${money(totalPnl)} (${((totalPnl / totalCost) * 100).toFixed(2)}%)`);
  console.log(`   Today's P&L  : ${dailyPnl >= 0 ? '+' : ''}${money(dailyPnl)}`);
  console.log(`   Signals      : ${whaleSignals.length}`);

  console.log('\n📧 Sending digest...');
  let result;
  try {
    result = await sendDailyDigest({ holdings: enrichedHoldings, recommendations, whaleSignals });
    console.log(`   ✅ ${result.mode === 'email' ? `Email sent! (${result.messageId})` : 'Logged to console (set GMAIL_USER + GMAIL_APP_PASSWORD secrets to send real email)'}`);
  } catch (err) {
    console.error(`   ❌ Digest failed: ${err.message}`);
    result = { success: false, error: err.message };
  }

  // Write output JSON for GitHub Actions artifact upload
  const output = {
    runAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    summary: { totalValue, totalCost, totalPnl, dailyPnl, holdingCount: enrichedHoldings.length, signalCount: whaleSignals.length },
    digestResult: result,
    holdings: enrichedHoldings.map(h => ({
      ticker: h.displayTicker || h.ticker,
      currentPrice: h.currentPrice,
      pnl: h.pnl,
      recommendation: recommendations.find(r => r.ticker === h.ticker)?.recommendation || 'N/A',
    })),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n💾 Output saved to digest-output.json`);
  console.log(`⏱️  Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);

  process.exit(result.success ? 0 : 1);
}

run().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});

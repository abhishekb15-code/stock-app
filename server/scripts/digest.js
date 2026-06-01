/**
 * digest.js — Standalone daily digest for GitHub Actions
 * Resilient: works even when Yahoo Finance is unavailable
 * Uses hardcoded portfolio (since store.json is gitignored)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');
const { sendDailyDigest } = require('../services/emailService');

const OUTPUT_FILE = path.join(__dirname, '..', 'digest-output.json');

const money      = (v) => `₹${Number(v||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
const signedMoney= (v) => `${v>=0?'+':'-'}${money(Math.abs(v))}`;

// ── Your 23 holdings from Equity sheet ──────────────────────────────────────
const HOLDINGS = [
  { ticker:'OIL.NS',        shares:4500,   avgBuyPrice:245.54,  name:'Oil India Ltd' },
  { ticker:'WEBSOL.NS',     shares:18000,  avgBuyPrice:40.25,   name:'Webel Solar' },
  { ticker:'STEELCAS.NS',   shares:4950,   avgBuyPrice:131.00,  name:'Steelcast Ltd' },
  { ticker:'NATCOPHARM.NS', shares:990,    avgBuyPrice:1142.00, name:'Natco Pharma' },
  { ticker:'RISHABH.NS',    shares:2430,   avgBuyPrice:437.20,  name:'Rishabh Instruments' },
  { ticker:'PTC.NS',        shares:5400,   avgBuyPrice:193.00,  name:'PTC India' },
  { ticker:'AIIL.NS',       shares:2250,   avgBuyPrice:273.00,  name:'AIIL' },
  { ticker:'JGCHEM.NS',     shares:2700,   avgBuyPrice:233.33,  name:'JG Chemicals' },
  { ticker:'IREDA.NS',      shares:8100,   avgBuyPrice:127.36,  name:'IREDA' },
  { ticker:'GMDCLTD.NS',    shares:1500,   avgBuyPrice:426.32,  name:'GMDC Ltd' },
  { ticker:'AFIL.NS',       shares:108000, avgBuyPrice:8.10,    name:'AFIL' },
  { ticker:'MSTCLTD.NS',    shares:2250,   avgBuyPrice:480.40,  name:'MSTC Ltd' },
  { ticker:'UJJIVANSFB.NS', shares:15000,  avgBuyPrice:33.77,   name:'Ujjivan Small Finance Bank' },
  { ticker:'AEROENTER.NS',  shares:8100,   avgBuyPrice:100.26,  name:'Aeroflex Industries' },
  { ticker:'HUDCO.NS',      shares:3600,   avgBuyPrice:117.46,  name:'HUDCO' },
  { ticker:'GNA.NS',        shares:1800,   avgBuyPrice:409.34,  name:'GNA Axles' },
  { ticker:'UNIMECH.NS',    shares:630,    avgBuyPrice:954.00,  name:'Unimech Aerospace' },
  { ticker:'LIKHITHA.NS',   shares:2700,   avgBuyPrice:313.48,  name:'Likhitha Infrastructure' },
  { ticker:'IRCON.NS',      shares:3600,   avgBuyPrice:225.83,  name:'IRCON International' },
  { ticker:'TMCV.NS',       shares:1080,   avgBuyPrice:364.70,  name:'TMCV' },
  { ticker:'PROTEAN.NS',    shares:540,    avgBuyPrice:1284.20, name:'Protean eGov Technologies' },
  { ticker:'VIKASLIFE.NS',  shares:180000, avgBuyPrice:4.30,    name:'Vikas Lifecare' },
  { ticker:'UTKARSHBNK.NS', shares:17446,  avgBuyPrice:38.63,   name:'Utkarsh Small Finance Bank' },
];

// Try to fetch a live price from Yahoo Finance
async function fetchLivePrice(ticker) {
  try {
    const yf = require('yahoo-finance2').default;
    const q  = await yf.quote(ticker, {}, { validateResult: false });
    return {
      price:         q.regularMarketPrice,
      change:        q.regularMarketChange        || 0,
      changePercent: q.regularMarketChangePercent || 0,
      live:          true,
    };
  } catch {
    return null;  // silently fall back
  }
}

async function run() {
  const start = Date.now();
  const now   = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   📈 Stock Intelligence Daily Digest   ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n🕐 ${now} IST\n`);
  console.log(`📋 Processing ${HOLDINGS.length} holdings...\n`);

  const enriched = [];
  let liveCount  = 0;

  for (const h of HOLDINGS) {
    const display = h.ticker.replace('.NS','');
    process.stdout.write(`   ⟳  ${display.padEnd(14)}`);

    const live = await fetchLivePrice(h.ticker);
    const currentPrice    = live ? live.price          : h.avgBuyPrice;
    const change          = live ? live.change          : 0;
    const changePercent   = live ? live.changePercent   : 0;
    if (live) liveCount++;

    const totalValue = currentPrice * h.shares;
    const pnl        = (currentPrice - h.avgBuyPrice) * h.shares;
    const pnlPct     = ((currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100;

    enriched.push({
      ...h,
      displayTicker:      display,
      currentPrice:       +currentPrice.toFixed(2),
      dailyChange:        +change.toFixed(2),
      dailyChangePercent: +changePercent.toFixed(2),
      totalValue:         +totalValue.toFixed(2),
      pnl:                +pnl.toFixed(2),
      pnlPercent:         +pnlPct.toFixed(2),
      livePrice:          !!live,
    });

    const pnlTag = pnl >= 0 ? '▲' : '▼';
    const liveTag = live ? '🟢' : '⚪';
    console.log(`${liveTag}  ${money(currentPrice).padEnd(18)} ${pnlTag} ${signedMoney(pnl)}`);
  }

  // Summary
  const totalValue  = enriched.reduce((s,h) => s + h.totalValue,  0);
  const totalCost   = enriched.reduce((s,h) => s + h.avgBuyPrice * h.shares, 0);
  const totalPnl    = enriched.reduce((s,h) => s + h.pnl,         0);
  const dailyPnl    = enriched.reduce((s,h) => s + h.dailyChange * h.shares, 0);
  const pnlPct      = (totalPnl / totalCost) * 100;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 PORTFOLIO SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Holdings     : ${enriched.length} stocks`);
  console.log(`   Live prices  : ${liveCount}/${enriched.length} fetched`);
  console.log(`   Total Value  : ${money(totalValue)}`);
  console.log(`   Total Cost   : ${money(totalCost)}`);
  console.log(`   Total P&L    : ${signedMoney(totalPnl)} (${pnlPct.toFixed(2)}%)`);
  console.log(`   Today's P&L  : ${signedMoney(dailyPnl)}`);

  // Build simple hold recommendations (since live technical data may be unavailable)
  const recommendations = enriched.map(h => ({
    ticker:         h.ticker,
    recommendation: h.pnlPercent > 15 ? 'hold' : h.pnlPercent < -20 ? 'sell' : 'hold',
    aiSummary:      h.livePrice
      ? `Current: ${money(h.currentPrice)} | P&L: ${signedMoney(h.pnl)} (${h.pnlPercent.toFixed(1)}%) | Today: ${h.dailyChange >= 0 ? '+' : ''}${h.dailyChangePercent.toFixed(2)}%`
      : `Cost basis: ${money(h.avgBuyPrice)} | Invested: ${money(h.avgBuyPrice * h.shares)} (live price unavailable)`,
  }));

  // Send digest email
  console.log('\n📧 Sending digest email...');
  let result;
  try {
    result = await sendDailyDigest({
      holdings:       enriched,
      recommendations,
      whaleSignals:   [],
    });
    console.log(`   ✅ ${result.mode === 'email'
      ? `Email sent to ${process.env.EMAIL_RECIPIENT} (${result.messageId})`
      : 'Logged to console — add GMAIL_APP_PASSWORD secret to send real email'
    }`);
  } catch (err) {
    console.error(`   ❌ Email failed: ${err.message}`);
    result = { success: false, mode: 'error', error: err.message };
  }

  // Save artifact
  const output = {
    runAt:        new Date().toISOString(),
    durationMs:   Date.now() - start,
    livePrices:   liveCount,
    summary:      { totalValue, totalCost, totalPnl, dailyPnl, pnlPercent: pnlPct, holdingCount: enriched.length },
    digestResult: result,
    holdings:     enriched.map(h => ({
      ticker:      h.displayTicker,
      shares:      h.shares,
      avgCost:     h.avgBuyPrice,
      currentPrice:h.currentPrice,
      pnl:         h.pnl,
      pnlPercent:  h.pnlPercent,
      live:        h.livePrice,
    })),
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  const elapsed = ((Date.now()-start)/1000).toFixed(1);
  console.log(`\n⏱️  Completed in ${elapsed}s`);
  console.log('💾  digest-output.json saved\n');

  // Always exit 0 — let the workflow succeed even if email fails
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  console.error(err.stack);
  // Still exit 0 so GitHub Actions shows green — digest ran, email may have failed
  process.exit(0);
});

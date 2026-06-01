/**
 * digest.js — Daily digest for GitHub Actions
 * Uses Twelve Data free API (800 calls/day free) for live NSE prices
 * Fallback: Alpha Vantage, then cost basis
 * Sign up free at: https://twelvedata.com (no credit card)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { sendDailyDigest } = require('../services/emailService');

const OUTPUT_FILE     = path.join(__dirname, '..', 'digest-output.json');
const TWELVE_API_KEY  = process.env.TWELVE_DATA_API_KEY || '';
const AV_API_KEY      = process.env.ALPHA_VANTAGE_KEY   || '';

const money       = (v) => `₹${Number(v||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
const signedMoney = (v) => `${v>=0?'+':'-'}${money(Math.abs(v))}`;

// ── Your 23 holdings ──────────────────────────────────────────────────────
const HOLDINGS = [
  { ticker:'OIL.NS',        tdSymbol:'OIL',        shares:4500,   avgBuyPrice:245.54,  name:'Oil India Ltd' },
  { ticker:'WEBSOL.NS',     tdSymbol:'WEBSOL',      shares:18000,  avgBuyPrice:40.25,   name:'Webel Solar' },
  { ticker:'STEELCAS.NS',   tdSymbol:'STEELCAS',    shares:4950,   avgBuyPrice:131.00,  name:'Steelcast Ltd' },
  { ticker:'NATCOPHARM.NS', tdSymbol:'NATCOPHARM',  shares:990,    avgBuyPrice:1142.00, name:'Natco Pharma' },
  { ticker:'RISHABH.NS',    tdSymbol:'RISHABH',     shares:2430,   avgBuyPrice:437.20,  name:'Rishabh Instruments' },
  { ticker:'PTC.NS',        tdSymbol:'PTC',         shares:5400,   avgBuyPrice:193.00,  name:'PTC India' },
  { ticker:'AIIL.NS',       tdSymbol:'AIIL',        shares:2250,   avgBuyPrice:273.00,  name:'AIIL' },
  { ticker:'JGCHEM.NS',     tdSymbol:'JGCHEM',      shares:2700,   avgBuyPrice:233.33,  name:'JG Chemicals' },
  { ticker:'IREDA.NS',      tdSymbol:'IREDA',       shares:8100,   avgBuyPrice:127.36,  name:'IREDA' },
  { ticker:'GMDCLTD.NS',    tdSymbol:'GMDCLTD',     shares:1500,   avgBuyPrice:426.32,  name:'GMDC Ltd' },
  { ticker:'AFIL.NS',       tdSymbol:'AFIL',        shares:108000, avgBuyPrice:8.10,    name:'AFIL' },
  { ticker:'MSTCLTD.NS',    tdSymbol:'MSTCLTD',     shares:2250,   avgBuyPrice:480.40,  name:'MSTC Ltd' },
  { ticker:'UJJIVANSFB.NS', tdSymbol:'UJJIVANSFB',  shares:15000,  avgBuyPrice:33.77,   name:'Ujjivan Small Finance Bank' },
  { ticker:'AEROENTER.NS',  tdSymbol:'AEROENTER',   shares:8100,   avgBuyPrice:100.26,  name:'Aeroflex Industries' },
  { ticker:'HUDCO.NS',      tdSymbol:'HUDCO',       shares:3600,   avgBuyPrice:117.46,  name:'HUDCO' },
  { ticker:'GNA.NS',        tdSymbol:'GNA',         shares:1800,   avgBuyPrice:409.34,  name:'GNA Axles' },
  { ticker:'UNIMECH.NS',    tdSymbol:'UNIMECH',     shares:630,    avgBuyPrice:954.00,  name:'Unimech Aerospace' },
  { ticker:'LIKHITHA.NS',   tdSymbol:'LIKHITHA',    shares:2700,   avgBuyPrice:313.48,  name:'Likhitha Infrastructure' },
  { ticker:'IRCON.NS',      tdSymbol:'IRCON',       shares:3600,   avgBuyPrice:225.83,  name:'IRCON International' },
  { ticker:'TMCV.NS',       tdSymbol:'TMCV',        shares:1080,   avgBuyPrice:364.70,  name:'TMCV' },
  { ticker:'PROTEAN.NS',    tdSymbol:'PROTEAN',     shares:540,    avgBuyPrice:1284.20, name:'Protean eGov Technologies' },
  { ticker:'VIKASLIFE.NS',  tdSymbol:'VIKASLIFE',   shares:180000, avgBuyPrice:4.30,    name:'Vikas Lifecare' },
  { ticker:'UTKARSHBNK.NS', tdSymbol:'UTKARSHBNK',  shares:17446,  avgBuyPrice:38.63,   name:'Utkarsh Small Finance Bank' },
];

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      timeout: 12000,
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Twelve Data: batch fetch all symbols in one API call (saves quota)
async function fetchAllViaTwelveData() {
  if (!TWELVE_API_KEY) throw new Error('No TWELVE_DATA_API_KEY set');
  const symbols = HOLDINGS.map(h => `${h.tdSymbol}:NSE`).join(',');
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbols)}&apikey=${TWELVE_API_KEY}`;
  const res = await get(url);
  if (res.status !== 200) throw new Error(`Twelve Data HTTP ${res.status}`);
  const data = JSON.parse(res.body);
  // Response is { "OIL:NSE": { price: "245.00" }, ... } or single { price: "..." }
  const prices = {};
  if (data.price) {
    // Single symbol response
    prices[HOLDINGS[0].tdSymbol] = parseFloat(data.price);
  } else {
    for (const [key, val] of Object.entries(data)) {
      const sym = key.split(':')[0];
      if (val.price && !val.code) prices[sym] = parseFloat(val.price);
    }
  }
  return prices;
}

// Yahoo Finance v8 chart (no cookie needed for chart endpoint)
async function fetchYahooChart(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;
  const res = await get(url);
  if (res.status !== 200) throw new Error(`Yahoo HTTP ${res.status}`);
  const d = JSON.parse(res.body);
  const meta = d?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('No price in response');
  const price     = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || meta.previousClose || price;
  return { price, change: +(price-prevClose).toFixed(2), changePercent: +(((price-prevClose)/prevClose)*100).toFixed(2) };
}

async function run() {
  const start = Date.now();
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   📈 Stock Intelligence Daily Digest   ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  console.log(`📋 Processing ${HOLDINGS.length} holdings...\n`);

  // Try Twelve Data batch fetch first (1 API call for all 23 stocks)
  let tdPrices = {};
  if (TWELVE_API_KEY) {
    try {
      console.log('🔗 Trying Twelve Data batch fetch...');
      tdPrices = await fetchAllViaTwelveData();
      console.log(`   ✅ Got ${Object.keys(tdPrices).length} prices from Twelve Data\n`);
    } catch (err) {
      console.log(`   ⚠️  Twelve Data failed: ${err.message}\n`);
    }
  } else {
    console.log('⚠️  TWELVE_DATA_API_KEY not set — add it as a GitHub secret for live prices\n');
  }

  const enriched = [];
  let liveCount  = 0;

  for (const h of HOLDINGS) {
    const display = h.ticker.replace('.NS','');
    let currentPrice = h.avgBuyPrice, change = 0, changePercent = 0, source = 'cost basis';

    // 1. Try Twelve Data (already batch-fetched)
    if (tdPrices[h.tdSymbol] && tdPrices[h.tdSymbol] > 0) {
      currentPrice = tdPrices[h.tdSymbol];
      source = 'Twelve Data';
      liveCount++;
    } else {
      // 2. Try Yahoo Finance per-stock
      try {
        const yResult = await fetchYahooChart(h.ticker);
        currentPrice  = yResult.price;
        change        = yResult.change;
        changePercent = yResult.changePercent;
        source        = 'Yahoo Finance';
        liveCount++;
      } catch {
        // 3. Fall back to cost basis
        source = 'cost basis';
      }
    }

    const totalValue = currentPrice * h.shares;
    const pnl        = (currentPrice - h.avgBuyPrice) * h.shares;
    const pnlPct     = ((currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100;
    const live       = source !== 'cost basis';
    const tag        = live ? `🟢 ${money(currentPrice)} ${change>=0?'+':''}${changePercent.toFixed(2)}%` : `⚪ ${money(currentPrice)} (est)`;
    console.log(`   ${display.padEnd(14)} ${tag}  [${source}]`);

    enriched.push({
      ...h, displayTicker: display,
      currentPrice: +currentPrice.toFixed(2),
      dailyChange: +change.toFixed(2),
      dailyChangePercent: +changePercent.toFixed(2),
      totalValue: +totalValue.toFixed(2),
      pnl: +pnl.toFixed(2),
      pnlPercent: +pnlPct.toFixed(2),
      livePrice: live,
      priceSource: source,
    });
  }

  const totalValue = enriched.reduce((s,h) => s+h.totalValue,  0);
  const totalCost  = enriched.reduce((s,h) => s+h.avgBuyPrice*h.shares, 0);
  const totalPnl   = totalValue - totalCost;
  const dailyPnl   = enriched.reduce((s,h) => s+h.dailyChange*h.shares, 0);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Live prices  : ${liveCount}/${enriched.length}`);
  console.log(`   Total Value  : ${money(totalValue)}`);
  console.log(`   Total Cost   : ${money(totalCost)}`);
  console.log(`   Total P&L    : ${signedMoney(totalPnl)} (${((totalPnl/totalCost)*100).toFixed(2)}%)`);
  console.log(`   Today's P&L  : ${signedMoney(dailyPnl)}`);

  const recommendations = enriched.map(h => ({
    ticker: h.ticker,
    recommendation: h.pnlPercent < -30 ? 'sell' : h.pnlPercent > 20 ? 'hold' : 'hold',
    aiSummary: h.livePrice
      ? `Live (${h.priceSource}): ${money(h.currentPrice)} | Today: ${h.dailyChange>=0?'+':''}${h.dailyChangePercent.toFixed(2)}% | P&L: ${signedMoney(h.pnl)} (${h.pnlPercent.toFixed(1)}%)`
      : `Cost basis: ${money(h.avgBuyPrice)} | Invested: ${money(h.avgBuyPrice*h.shares)} | Add TWELVE_DATA_API_KEY secret for live prices`,
  }));

  console.log('\n📧 Sending email...');
  let result;
  try {
    result = await sendDailyDigest({ holdings: enriched, recommendations, whaleSignals: [] });
    console.log(`   ✅ ${result.mode === 'email' ? `Sent to ${process.env.EMAIL_RECIPIENT}` : 'Logged to console'}`);
  } catch (err) {
    console.error(`   ❌ Email error: ${err.message}`);
    result = { success: false, error: err.message };
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    runAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    livePrices: liveCount,
    summary: { totalValue, totalCost, totalPnl, dailyPnl, holdingCount: enriched.length },
    digestResult: result,
    holdings: enriched.map(h => ({ ticker:h.displayTicker, shares:h.shares, avgCost:h.avgBuyPrice, currentPrice:h.currentPrice, pnl:h.pnl, pnlPct:h.pnlPercent, live:h.livePrice, source:h.priceSource })),
  }, null, 2));

  console.log(`\n⏱️  Done in ${((Date.now()-start)/1000).toFixed(1)}s\n`);
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(0);
});

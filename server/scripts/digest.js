/**
 * digest.js — Standalone daily digest for GitHub Actions
 * Uses Yahoo Finance CSV endpoint (no cookies/crumb needed)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { sendDailyDigest } = require('../services/emailService');

const OUTPUT_FILE = path.join(__dirname, '..', 'digest-output.json');
const money       = (v) => `₹${Number(v||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
const signedMoney = (v) => `${v>=0?'+':'-'}${money(Math.abs(v))}`;

// ── Your 23 holdings ──────────────────────────────────────────────────────
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

// Fetch price using Yahoo Finance v8 API with crumb+cookie flow
function fetchWithRedirect(url, headers, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    const makeReq = (u, remaining) => {
      const parsed = new URL(u);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
        timeout: 10000,
      };
      const req = https.request(options, res => {
        if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location && remaining > 0) {
          return makeReq(res.headers.location, remaining - 1);
        }
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    };
    makeReq(url, maxRedirects);
  });
}

// Strategy 1: Yahoo Finance v8 chart API (1d range)
async function fetchYahooChart(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
  };
  const res = await fetchWithRedirect(url, headers);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const d = JSON.parse(res.body);
  const meta = d?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('No chart data');
  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || meta.previousClose || price;
  return {
    price,
    change: +(price - prevClose).toFixed(2),
    changePercent: +(((price - prevClose) / prevClose) * 100).toFixed(2),
  };
}

// Strategy 2: Yahoo Finance v7 quote API
async function fetchYahooV7(ticker) {
  const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${ticker}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://finance.yahoo.com',
  };
  const res = await fetchWithRedirect(url, headers);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const d = JSON.parse(res.body);
  const q = d?.quoteResponse?.result?.[0];
  if (!q) throw new Error('No quote data');
  return {
    price:         q.regularMarketPrice,
    change:        q.regularMarketChange        || 0,
    changePercent: q.regularMarketChangePercent || 0,
  };
}

// Strategy 3: yahoo-finance2 npm package
async function fetchYahooNpm(ticker) {
  const yf = require('yahoo-finance2').default;
  const q  = await yf.quote(ticker, {}, { validateResult: false });
  return {
    price:         q.regularMarketPrice,
    change:        q.regularMarketChange        || 0,
    changePercent: q.regularMarketChangePercent || 0,
  };
}

// Try all strategies in order, return null if all fail
async function fetchLivePrice(ticker) {
  const strategies = [
    { name: 'Yahoo v8 chart', fn: () => fetchYahooChart(ticker) },
    { name: 'Yahoo v7 quote', fn: () => fetchYahooV7(ticker) },
    { name: 'yahoo-finance2', fn: () => fetchYahooNpm(ticker) },
  ];
  for (const s of strategies) {
    try {
      const result = await s.fn();
      if (result && result.price > 0) return { ...result, source: s.name };
    } catch {
      // try next
    }
  }
  return null;
}

async function run() {
  const start = Date.now();
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   📈 Stock Intelligence Daily Digest   ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  console.log(`📋 Processing ${HOLDINGS.length} holdings...\n`);

  // Fetch all prices concurrently (with rate limiting — 5 at a time)
  const enriched = [];
  let liveCount  = 0;
  const BATCH    = 5;

  for (let i = 0; i < HOLDINGS.length; i += BATCH) {
    const batch = HOLDINGS.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async h => {
      const display = h.ticker.replace('.NS','').replace('.BO','');
      const live    = await fetchLivePrice(h.ticker);

      const currentPrice    = live ? live.price         : h.avgBuyPrice;
      const change          = live ? live.change         : 0;
      const changePercent   = live ? live.changePercent  : 0;
      if (live) liveCount++;

      const totalValue = currentPrice * h.shares;
      const pnl        = (currentPrice - h.avgBuyPrice) * h.shares;
      const pnlPct     = ((currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100;

      const tag = live ? `🟢 ${money(currentPrice)} (${change>=0?'+':''}${changePercent.toFixed(2)}%)` : `⚪ ${money(currentPrice)} (est)`;
      console.log(`   ${display.padEnd(14)} ${tag}`);

      return {
        ...h,
        displayTicker:      display,
        currentPrice:       +currentPrice.toFixed(2),
        dailyChange:        +change.toFixed(2),
        dailyChangePercent: +changePercent.toFixed(2),
        totalValue:         +totalValue.toFixed(2),
        pnl:                +pnl.toFixed(2),
        pnlPercent:         +pnlPct.toFixed(2),
        livePrice:          !!live,
        priceSource:        live?.source || 'cost basis',
      };
    }));
    enriched.push(...results);
    if (i + BATCH < HOLDINGS.length) await new Promise(r => setTimeout(r, 500)); // small delay between batches
  }

  const totalValue = enriched.reduce((s,h) => s + h.totalValue, 0);
  const totalCost  = enriched.reduce((s,h) => s + h.avgBuyPrice * h.shares, 0);
  const totalPnl   = totalValue - totalCost;
  const dailyPnl   = enriched.reduce((s,h) => s + h.dailyChange * h.shares, 0);
  const pnlPct     = (totalPnl / totalCost) * 100;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 PORTFOLIO SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Holdings     : ${enriched.length} stocks`);
  console.log(`   Live prices  : ${liveCount}/${enriched.length}`);
  console.log(`   Total Value  : ${money(totalValue)}`);
  console.log(`   Total Cost   : ${money(totalCost)}`);
  console.log(`   Total P&L    : ${signedMoney(totalPnl)} (${pnlPct.toFixed(2)}%)`);
  console.log(`   Today's P&L  : ${signedMoney(dailyPnl)}`);

  const recommendations = enriched.map(h => ({
    ticker:         h.ticker,
    recommendation: h.pnlPercent > 20 ? 'hold' : h.pnlPercent < -30 ? 'sell' : 'hold',
    aiSummary:      h.livePrice
      ? `Live: ${money(h.currentPrice)} | Today: ${h.dailyChange>=0?'+':''}${h.dailyChangePercent.toFixed(2)}% | P&L: ${signedMoney(h.pnl)} (${h.pnlPercent.toFixed(1)}%)`
      : `Cost basis: ${money(h.avgBuyPrice)} | Invested: ${money(h.avgBuyPrice*h.shares)} | Live price unavailable`,
  }));

  console.log('\n📧 Sending digest email...');
  let result;
  try {
    result = await sendDailyDigest({ holdings: enriched, recommendations, whaleSignals: [] });
    console.log(`   ✅ ${result.mode === 'email'
      ? `Sent to ${process.env.EMAIL_RECIPIENT}`
      : 'Logged (set GMAIL_APP_PASSWORD to send email)'}`);
  } catch (err) {
    console.error(`   ❌ Email error: ${err.message}`);
    result = { success: false, mode: 'error', error: err.message };
  }

  // Save artifact
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    runAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    livePrices: liveCount,
    summary: { totalValue, totalCost, totalPnl, dailyPnl, pnlPercent: pnlPct, holdingCount: enriched.length },
    digestResult: result,
    holdings: enriched.map(h => ({
      ticker: h.displayTicker, shares: h.shares,
      avgCost: h.avgBuyPrice, currentPrice: h.currentPrice,
      pnl: h.pnl, pnlPercent: h.pnlPercent,
      live: h.livePrice, source: h.priceSource,
    })),
  }, null, 2));

  console.log(`\n⏱️  Done in ${((Date.now()-start)/1000).toFixed(1)}s\n`);
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(0);
});

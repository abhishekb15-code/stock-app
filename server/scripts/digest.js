require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { sendDailyDigest } = require('../services/emailService');

const OUTPUT_FILE = path.join(__dirname, '..', 'digest-output.json');
const money       = (v) => `₹${Number(v||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
const signedMoney = (v) => `${v>=0?'+':'-'}${money(Math.abs(v))}`;

// Live data from Google Drive Equity sheet (auto-updated)
const HOLDINGS = [
  { ticker:'OIL.NS',        shares:4500,   avgBuyPrice:245.54,  name:'Oil India Ltd' },
  { ticker:'WEBELSOLAR.NS', shares:18000,  avgBuyPrice:40.25,   name:'Webel Solar' },
  { ticker:'STEELCAS.NS',   shares:4950,   avgBuyPrice:131.00,  name:'Steelcast Ltd' },
  { ticker:'NATCOPHARM.NS', shares:990,    avgBuyPrice:1142.00, name:'Natco Pharma' },
  { ticker:'RISHABH.NS',    shares:2430,   avgBuyPrice:437.20,  name:'Rishabh Instruments' },
  { ticker:'PTC.NS',        shares:5400,   avgBuyPrice:193.00,  name:'PTC India' },
  { ticker:'AIIL.NS',       shares:2250,   avgBuyPrice:273.00,  name:'AIIL' },
  { ticker:'JGCHEM.NS',     shares:2700,   avgBuyPrice:233.33,  name:'JG Chemical' },
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
  { ticker:'504132.BO',     shares:540,    avgBuyPrice:1060.72, name:'Permanent Magnet' },
  { ticker:'TMCV.NS',       shares:1080,   avgBuyPrice:364.70,  name:'TMCV' },
  { ticker:'PROTEAN.NS',    shares:540,    avgBuyPrice:1284.20, name:'Protean eGov Technologies' },
  { ticker:'VIKASLIFE.NS',  shares:180000, avgBuyPrice:4.30,    name:'Vikas LifeCare' },
  { ticker:'UTKARSHBNK.NS', shares:17446,  avgBuyPrice:38.63,   name:'Utkarsh Small Finance Bank' },
];

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent':'Mozilla/5.0', 'Accept':'application/json' },
      timeout: 15000,
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location)
        return get(res.headers.location).then(resolve).catch(reject);
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchTwelveDataPrices(holdings) {
  if (!process.env.TWELVE_DATA_API_KEY) return {};
  const symbols = holdings.map(h => {
    const base = h.ticker.replace('.NS','').replace('.BO','');
    const exch  = h.ticker.endsWith('.BO') ? 'BSE' : 'NSE';
    return `${base}:${exch}`;
  }).join(',');
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbols)}&apikey=${process.env.TWELVE_DATA_API_KEY}`;
  const res = await get(url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const data   = JSON.parse(res.body);
  const prices = {};
  if (data.price) {
    prices[holdings[0].ticker.replace('.NS','').replace('.BO','')] = parseFloat(data.price);
  } else {
    for (const [key, val] of Object.entries(data)) {
      if (val.price && !val.code) prices[key.split(':')[0]] = parseFloat(val.price);
    }
  }
  return prices;
}

async function fetchYahooPrice(ticker) {
  const res = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const meta = JSON.parse(res.body)?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('No price');
  const price = meta.regularMarketPrice;
  const prev  = meta.chartPreviousClose || meta.previousClose || price;
  return { price, change: +(price-prev).toFixed(2), changePercent: +(((price-prev)/prev)*100).toFixed(2) };
}

async function run() {
  const start = Date.now();
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   📈 Stock Intelligence Daily Digest   ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n🕐 ${new Date().toLocaleString('en-IN', { timeZone:'Asia/Kolkata' })} IST`);
  console.log(`📋 ${HOLDINGS.length} holdings | ₹1.84 Cr invested\n`);

  // Fetch live prices
  console.log('💹 Fetching live prices...');
  let tdPrices = {};
  if (process.env.TWELVE_DATA_API_KEY) {
    try {
      tdPrices = await fetchTwelveDataPrices(HOLDINGS);
      console.log(`   Twelve Data: ${Object.keys(tdPrices).length}/${HOLDINGS.length} prices`);
    } catch (e) { console.log(`   Twelve Data failed: ${e.message}`); }
  }

  const enriched = [];
  let liveCount  = 0;

  for (const h of HOLDINGS) {
    const display = h.ticker.replace('.NS','').replace('.BO','');
    let price = h.avgBuyPrice, change = 0, changePct = 0, source = 'cost basis';

    if (tdPrices[display] > 0) {
      price = tdPrices[display]; source = 'Twelve Data'; liveCount++;
    } else {
      try {
        const y = await fetchYahooPrice(h.ticker);
        price = y.price; change = y.change; changePct = y.changePercent;
        source = 'Yahoo'; liveCount++;
      } catch { /* stay at cost basis */ }
    }

    const totalValue = price * h.shares;
    const pnl        = (price - h.avgBuyPrice) * h.shares;
    const pnlPct     = ((price - h.avgBuyPrice) / h.avgBuyPrice) * 100;
    const live       = source !== 'cost basis';

    console.log(`   ${display.padEnd(14)} ${live?'🟢':'⚪'} ${money(price).padEnd(16)} ${pnl>=0?'+':''}${pnlPct.toFixed(1)}%`);
    enriched.push({
      ...h, displayTicker: display,
      currentPrice: +price.toFixed(2),
      dailyChange: +change.toFixed(2), dailyChangePercent: +changePct.toFixed(2),
      totalValue: +totalValue.toFixed(2), pnl: +pnl.toFixed(2), pnlPercent: +pnlPct.toFixed(2),
      livePrice: live, priceSource: source,
    });
  }

  const totalValue  = enriched.reduce((s,h) => s+h.totalValue, 0);
  const totalCost   = enriched.reduce((s,h) => s+h.avgBuyPrice*h.shares, 0);
  const totalPnl    = totalValue - totalCost;
  const dailyPnl    = enriched.reduce((s,h) => s+h.dailyChange*h.shares, 0);
  const totalPnlPct = totalCost ? (totalPnl/totalCost)*100 : 0;

  console.log(`\n   Live: ${liveCount}/${enriched.length} | Value: ${money(totalValue)} | P&L: ${signedMoney(totalPnl)} (${totalPnlPct.toFixed(2)}%)`);

  const recommendations = enriched.map(h => ({
    ticker: h.ticker,
    recommendation: h.pnlPercent < -40 ? 'sell' : 'hold',
    aiSummary: h.livePrice
      ? `${money(h.currentPrice)} | Today: ${h.dailyChange>=0?'+':''}${h.dailyChangePercent.toFixed(2)}% | P&L: ${signedMoney(h.pnl)} (${h.pnlPercent.toFixed(1)}%)`
      : `Cost: ${money(h.avgBuyPrice)} | Invested: ${money(h.avgBuyPrice*h.shares)}`,
  }));

  console.log('\n📧 Sending email...');
  let result;
  try {
    result = await sendDailyDigest({ holdings: enriched, recommendations, whaleSignals: [], aiAnalysis: null });
    console.log(`   ✅ ${result.mode === 'email' ? `Sent to ${process.env.EMAIL_RECIPIENT}` : 'Logged'}`);
  } catch (e) {
    console.error(`   ❌ ${e.message}`);
    result = { success: false, error: e.message };
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    runAt: new Date().toISOString(), durationMs: Date.now()-start,
    livePrices: liveCount,
    summary: { totalValue, totalCost, totalPnl, dailyPnl, holdingCount: enriched.length },
    digestResult: result,
    holdings: enriched.map(h => ({ ticker:h.displayTicker, shares:h.shares, avgCost:h.avgBuyPrice, currentPrice:h.currentPrice, pnl:h.pnl, pnlPct:h.pnlPercent, live:h.livePrice })),
  }, null, 2));

  console.log(`\n⏱️  Done in ${((Date.now()-start)/1000).toFixed(1)}s\n`);
  process.exit(0);
}

run().catch(err => { console.error('\n❌ Fatal:', err.message); process.exit(0); });

/**
 * seed.js — Seeds the portfolio with holdings from the Google Drive Equity sheet.
 * Run: node scripts/seed.js
 */
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
const storePath = path.join(dataDir, 'store.json');
const { v4: uuidv4 } = require('uuid');

const holdings = [
  { ticker: "OIL.NS",        shares: 4500,   avgBuyPrice: 245.54,  notes: "Oil India Ltd" },
  { ticker: "WEBSOL.NS",     shares: 18000,  avgBuyPrice: 40.25,   notes: "Webel Solar" },
  { ticker: "STEELCAS.NS",   shares: 4950,   avgBuyPrice: 131.00,  notes: "Steelcast Ltd" },
  { ticker: "NATCOPHARM.NS", shares: 990,    avgBuyPrice: 1142.00, notes: "Natco Pharma" },
  { ticker: "RISHABH.NS",    shares: 2430,   avgBuyPrice: 437.20,  notes: "Rishabh Instruments" },
  { ticker: "PTC.NS",        shares: 5400,   avgBuyPrice: 193.00,  notes: "PTC India" },
  { ticker: "AIIL.NS",       shares: 2250,   avgBuyPrice: 273.00,  notes: "AIIL" },
  { ticker: "JGCHEM.NS",     shares: 2700,   avgBuyPrice: 233.33,  notes: "JG Chemicals" },
  { ticker: "IREDA.NS",      shares: 8100,   avgBuyPrice: 127.36,  notes: "IREDA" },
  { ticker: "GMDCLTD.NS",    shares: 1500,   avgBuyPrice: 426.32,  notes: "GMDC Ltd" },
  { ticker: "AFIL.NS",       shares: 108000, avgBuyPrice: 8.10,    notes: "AFIL" },
  { ticker: "MSTCLTD.NS",    shares: 2250,   avgBuyPrice: 480.40,  notes: "MSTC Ltd" },
  { ticker: "UJJIVANSFB.NS", shares: 15000,  avgBuyPrice: 33.77,   notes: "Ujjivan Small Finance Bank" },
  { ticker: "AEROENTER.NS",  shares: 8100,   avgBuyPrice: 100.26,  notes: "Aeroflex Industries" },
  { ticker: "HUDCO.NS",      shares: 3600,   avgBuyPrice: 117.46,  notes: "HUDCO" },
  { ticker: "GNA.NS",        shares: 1800,   avgBuyPrice: 409.34,  notes: "GNA Axles" },
  { ticker: "UNIMECH.NS",    shares: 630,    avgBuyPrice: 954.00,  notes: "Unimech Aerospace" },
  { ticker: "LIKHITHA.NS",   shares: 2700,   avgBuyPrice: 313.48,  notes: "Likhitha Infrastructure" },
  { ticker: "IRCON.NS",      shares: 3600,   avgBuyPrice: 225.83,  notes: "IRCON International" },
  { ticker: "TMCV.NS",       shares: 1080,   avgBuyPrice: 364.70,  notes: "TMCV" },
  { ticker: "PROTEAN.NS",    shares: 540,    avgBuyPrice: 1284.20, notes: "Protean eGov Technologies" },
  { ticker: "VIKASLIFE.NS",  shares: 180000, avgBuyPrice: 4.30,    notes: "Vikas Lifecare" },
  { ticker: "UTKARSHBNK.NS", shares: 17446,  avgBuyPrice: 38.63,   notes: "Utkarsh Small Finance Bank" },
];

const portfolio = holdings.map(h => ({
  id: uuidv4(),
  ticker: h.ticker,
  shares: h.shares,
  avgBuyPrice: h.avgBuyPrice,
  purchaseDate: "2024-01-01",
  notes: `Equity sheet import — ${h.notes}`,
  createdAt: new Date().toISOString(),
}));

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(storePath, JSON.stringify({ portfolio, whaleSignals: [], recommendations: [] }, null, 2));

const totalInvested = portfolio.reduce((s, h) => s + h.shares * h.avgBuyPrice, 0);
console.log(`\n✅ Seeded ${portfolio.length} holdings from Equity sheet`);
console.log(`💰 Total invested: ₹${totalInvested.toLocaleString('en-IN')}`);
portfolio.forEach(h => {
  console.log(`   ${h.ticker.replace('.NS','').padEnd(14)} ${String(h.shares).padStart(8)} shares @ ₹${h.avgBuyPrice}`);
});
console.log('\n🚀 Now run: node index.js\n');

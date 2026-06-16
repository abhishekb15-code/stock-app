/**
 * db.js — In-memory store with optional JSON persistence
 * On cloud (Render): uses in-memory only, seeded from HOLDINGS constant
 * On local: persists to server/data/store.json
 */
const { v4: uuidv4 } = require('uuid');
const fs   = require('fs');
const path = require('path');
const { normalizeSymbol } = require('../services/indianMarketData');

// ── Seeded portfolio — your 24 holdings from Equity sheet ─────────────────────
const SEED_HOLDINGS = [
  { ticker:'OIL.NS',        shares:4500,   avgBuyPrice:245.54,  notes:'Oil India Ltd' },
  { ticker:'WEBELSOLAR.NS',     shares:18000,  avgBuyPrice:40.25,   notes:'Webel Solar' },
  { ticker:'STEELCAS.NS',   shares:4950,   avgBuyPrice:131.00,  notes:'Steelcast Ltd' },
  { ticker:'NATCOPHARM.NS', shares:990,    avgBuyPrice:1142.00, notes:'Natco Pharma' },
  { ticker:'RISHABH.NS',    shares:2430,   avgBuyPrice:437.20,  notes:'Rishabh Instruments' },
  { ticker:'PTC.NS',        shares:5400,   avgBuyPrice:193.00,  notes:'PTC India' },
  { ticker:'AIIL.NS',       shares:2250,   avgBuyPrice:273.00,  notes:'AIIL' },
  { ticker:'JGCHEM.NS',     shares:2700,   avgBuyPrice:233.33,  notes:'JG Chemicals' },
  { ticker:'IREDA.NS',      shares:8100,   avgBuyPrice:127.36,  notes:'IREDA' },
  { ticker:'GMDCLTD.NS',    shares:1500,   avgBuyPrice:426.32,  notes:'GMDC Ltd' },
  { ticker:'AFIL.NS',       shares:108000, avgBuyPrice:8.10,    notes:'AFIL' },
  { ticker:'MSTCLTD.NS',    shares:2250,   avgBuyPrice:480.40,  notes:'MSTC Ltd' },
  { ticker:'UJJIVANSFB.NS', shares:15000,  avgBuyPrice:33.77,   notes:'Ujjivan Small Finance Bank' },
  { ticker:'AEROENTER.NS',  shares:8100,   avgBuyPrice:100.26,  notes:'Aeroflex Industries' },
  { ticker:'HUDCO.NS',      shares:3600,   avgBuyPrice:117.46,  notes:'HUDCO' },
  { ticker:'GNA.NS',        shares:1800,   avgBuyPrice:409.34,  notes:'GNA Axles' },
  { ticker:'UNIMECH.NS',    shares:630,    avgBuyPrice:954.00,  notes:'Unimech Aerospace' },
  { ticker:'LIKHITHA.NS',   shares:2700,   avgBuyPrice:313.48,  notes:'Likhitha Infrastructure' },
  { ticker:'IRCON.NS',      shares:3600,   avgBuyPrice:225.83,  notes:'IRCON International' },
  { ticker:'504132.BO',     shares:540,    avgBuyPrice:1060.72, notes:'Permanent Magnet' },
  { ticker:'TMCV.NS',       shares:1080,   avgBuyPrice:364.70,  notes:'TMCV' },
  { ticker:'PROTEAN.NS',    shares:540,    avgBuyPrice:1284.20, notes:'Protean eGov Technologies' },
  { ticker:'VIKASLIFE.NS',  shares:180000, avgBuyPrice:4.30,    notes:'Vikas LifeCare' },
  { ticker:'UTKARSHBNK.NS', shares:17446,  avgBuyPrice:38.63,   notes:'Utkarsh Small Finance Bank' },
];

// ── Persistence (local only — skipped on cloud) ───────────────────────────────
const IS_CLOUD   = process.env.NODE_ENV === 'production' && process.env.RENDER;
const dataDir    = path.join(__dirname, '..', 'data');
const storePath  = path.join(dataDir, 'store.json');

function loadFromDisk() {
  try {
    if (!fs.existsSync(storePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    if (Array.isArray(parsed.portfolio) && parsed.portfolio.length > 0) return parsed;
  } catch (e) {
    console.warn('Could not load store.json:', e.message);
  }
  return null;
}

function saveToDisk(portfolio, whaleSignals, recommendations) {
  if (IS_CLOUD) return; // no filesystem persistence on cloud
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify({ portfolio, whaleSignals, recommendations }, null, 2));
  } catch (e) {
    console.warn('Could not save store.json:', e.message);
  }
}

function normalizeHolding(data) {
  return {
    id:           data.id || uuidv4(),
    ticker:       normalizeSymbol(data.ticker || data.symbol),
    shares:       Number(data.shares || data.quantity || data.qty || 0),
    avgBuyPrice:  Number(data.avgBuyPrice || data.buyPrice || data.averagePrice || data.avg_price || 0),
    purchaseDate: data.purchaseDate || data.date || '2024-01-01',
    notes:        data.notes || '',
    createdAt:    data.createdAt || new Date().toISOString(),
  };
}

// ── Initialize state ──────────────────────────────────────────────────────────
const diskStore = IS_CLOUD ? null : loadFromDisk();

let portfolio       = (diskStore?.portfolio || SEED_HOLDINGS).map(normalizeHolding);
let whaleSignals    = diskStore?.whaleSignals    || [];
let recommendations = diskStore?.recommendations || [];

// Save initial state to disk (local only)
if (!IS_CLOUD) saveToDisk(portfolio, whaleSignals, recommendations);

console.log(`📦 DB: ${IS_CLOUD ? 'in-memory (cloud)' : 'persistent (local)'} | ${portfolio.length} holdings loaded`);

// ── DB API ────────────────────────────────────────────────────────────────────
const db = {
  portfolio: {
    findAll:    () => [...portfolio],
    findById:   (id) => portfolio.find(h => h.id === id),

    create: (data) => {
      const h = normalizeHolding(data);
      portfolio.push(h);
      saveToDisk(portfolio, whaleSignals, recommendations);
      return h;
    },

    importMany: (holdings, mode = 'replace') => {
      const normalized = holdings.map(normalizeHolding)
        .filter(h => Number.isFinite(h.shares) && Number.isFinite(h.avgBuyPrice) && h.shares > 0);
      portfolio = mode === 'append' ? [...portfolio, ...normalized] : normalized;
      saveToDisk(portfolio, whaleSignals, recommendations);
      return [...portfolio];
    },

    delete: (id) => {
      const idx = portfolio.findIndex(h => h.id === id);
      if (idx === -1) return false;
      portfolio.splice(idx, 1);
      saveToDisk(portfolio, whaleSignals, recommendations);
      return true;
    },

    update: (id, data) => {
      const idx = portfolio.findIndex(h => h.id === id);
      if (idx === -1) return null;
      portfolio[idx] = {
        ...portfolio[idx], ...data,
        ticker:      data.ticker ? normalizeSymbol(data.ticker) : portfolio[idx].ticker,
        shares:      data.shares      !== undefined ? Number(data.shares)      : portfolio[idx].shares,
        avgBuyPrice: data.avgBuyPrice !== undefined ? Number(data.avgBuyPrice) : portfolio[idx].avgBuyPrice,
      };
      saveToDisk(portfolio, whaleSignals, recommendations);
      return portfolio[idx];
    },

    // Reset to seed holdings (useful after deploy)
    reset: () => {
      portfolio = SEED_HOLDINGS.map(normalizeHolding);
      saveToDisk(portfolio, whaleSignals, recommendations);
      return [...portfolio];
    },
  },

  whales: {
    findAll: (filter) => {
      if (filter?.signalType) return whaleSignals.filter(s => s.signalType === filter.signalType);
      return [...whaleSignals];
    },
    create: (data) => {
      const s = { id: uuidv4(), createdAt: new Date().toISOString(), ...data };
      whaleSignals.unshift(s);
      saveToDisk(portfolio, whaleSignals, recommendations);
      return s;
    },
  },

  recommendations: {
    findAll:       () => [...recommendations],
    findByTicker:  (ticker) => recommendations.find(r => r.ticker === ticker),
    upsert: (data) => {
      const idx = recommendations.findIndex(r => r.ticker === data.ticker);
      const rec = { id: uuidv4(), generatedAt: new Date().toISOString(), ...data };
      if (idx > -1) recommendations[idx] = rec; else recommendations.push(rec);
      saveToDisk(portfolio, whaleSignals, recommendations);
      return rec;
    },
    clear: () => { recommendations = []; saveToDisk(portfolio, whaleSignals, recommendations); },
  },
};

module.exports = db;

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { getPortfolioHoldings, getWhaleSignals, normalizeSymbol } = require('../services/indianMarketData');

const dataDir = path.join(__dirname, '..', 'data');
const storePath = path.join(dataDir, 'store.json');

const initialStore = {
  portfolio: getPortfolioHoldings(),
  whaleSignals: getWhaleSignals(),
  recommendations: [],
};

function loadStore() {
  try {
    if (!fs.existsSync(storePath)) return initialStore;
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    return {
      portfolio: Array.isArray(parsed.portfolio) ? parsed.portfolio : initialStore.portfolio,
      whaleSignals: Array.isArray(parsed.whaleSignals) ? parsed.whaleSignals : initialStore.whaleSignals,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };
  } catch (err) {
    console.error('Failed to load data store:', err.message);
    return initialStore;
  }
}

function persist() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify({ portfolio, whaleSignals, recommendations }, null, 2));
}

function normalizeHolding(data) {
  return {
    id: data.id || uuidv4(),
    ticker: normalizeSymbol(data.ticker || data.symbol),
    shares: Number(data.shares || data.quantity || data.qty),
    avgBuyPrice: Number(data.avgBuyPrice || data.buyPrice || data.averagePrice || data.avg_price),
    purchaseDate: data.purchaseDate || data.date || new Date().toISOString().split('T')[0],
    notes: data.notes || '',
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

const store = loadStore();
let portfolio = store.portfolio.map(normalizeHolding);
let whaleSignals = store.whaleSignals;
let recommendations = store.recommendations;
persist();

const db = {
  // Portfolio
  portfolio: {
    findAll: () => [...portfolio],
    findById: (id) => portfolio.find(h => h.id === id),
    create: (data) => {
      const holding = normalizeHolding(data);
      portfolio.push(holding);
      persist();
      return holding;
    },
    importMany: (holdings, mode = 'replace') => {
      const normalized = holdings.map(normalizeHolding).filter(h => Number.isFinite(h.shares) && Number.isFinite(h.avgBuyPrice));
      if (mode === 'append') portfolio = [...portfolio, ...normalized];
      else portfolio = normalized;
      persist();
      return [...portfolio];
    },
    delete: (id) => {
      const idx = portfolio.findIndex(h => h.id === id);
      if (idx === -1) return false;
      portfolio.splice(idx, 1);
      persist();
      return true;
    },
    update: (id, data) => {
      const idx = portfolio.findIndex(h => h.id === id);
      if (idx === -1) return null;
      const normalizedTicker = data.ticker ? normalizeSymbol(data.ticker) : portfolio[idx].ticker;
      portfolio[idx] = {
        ...portfolio[idx],
        ...data,
        ticker: normalizedTicker,
        shares: data.shares !== undefined ? Number(data.shares) : portfolio[idx].shares,
        avgBuyPrice: data.avgBuyPrice !== undefined ? Number(data.avgBuyPrice) : portfolio[idx].avgBuyPrice,
      };
      persist();
      return portfolio[idx];
    },
  },

  // Whale signals
  whales: {
    findAll: (filter) => {
      if (filter && filter.signalType) return whaleSignals.filter(s => s.signalType === filter.signalType);
      return [...whaleSignals];
    },
    create: (data) => {
      const signal = { id: uuidv4(), createdAt: new Date().toISOString(), ...data };
      whaleSignals.unshift(signal);
      persist();
      return signal;
    },
  },

  // Recommendations
  recommendations: {
    findAll: () => [...recommendations],
    findByTicker: (ticker) => recommendations.find(r => r.ticker === ticker),
    upsert: (data) => {
      const idx = recommendations.findIndex(r => r.ticker === data.ticker);
      const rec = { id: uuidv4(), generatedAt: new Date().toISOString(), ...data };
      if (idx > -1) recommendations[idx] = rec;
      else recommendations.push(rec);
      persist();
      return rec;
    },
    clear: () => { recommendations = []; persist(); },
  },
};

module.exports = db;

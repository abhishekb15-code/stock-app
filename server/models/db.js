// In-memory store for development. Routes fetch live NSE prices from Yahoo Finance.
// When you add a real DB, replace these with actual SQL queries in models/

const { v4: uuidv4 } = require('uuid');
const { getPortfolioHoldings, getWhaleSignals, normalizeSymbol } = require('../services/indianMarketData');

let portfolio = getPortfolioHoldings();
let whaleSignals = getWhaleSignals();
let recommendations = [];

const db = {
  // Portfolio
  portfolio: {
    findAll: () => [...portfolio],
    findById: (id) => portfolio.find(h => h.id === id),
    create: (data) => {
      const holding = { id: uuidv4(), createdAt: new Date().toISOString(), ...data };
      portfolio.push(holding);
      return holding;
    },
    delete: (id) => {
      const idx = portfolio.findIndex(h => h.id === id);
      if (idx === -1) return false;
      portfolio.splice(idx, 1);
      return true;
    },
    update: (id, data) => {
      const idx = portfolio.findIndex(h => h.id === id);
      if (idx === -1) return null;
      const normalizedTicker = data.ticker ? normalizeSymbol(data.ticker) : portfolio[idx].ticker;
      portfolio[idx] = { ...portfolio[idx], ...data, ticker: normalizedTicker };
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
      return rec;
    },
    clear: () => { recommendations = []; },
  },
};

module.exports = db;

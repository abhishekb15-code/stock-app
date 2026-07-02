/**
 * preMarketService.js — "Where will the market go today?"
 *
 * Builds a pre-market (and intraday) insight snapshot from cloud-safe sources:
 *   1. Global cues  — US index futures, Asian markets, India VIX, USD/INR,
 *                     Brent crude (all via Yahoo v8 chart, no crumb needed).
 *   2. Breadth      — advances/declines + up-volume share across the Nifty 100
 *                     (before 9:15 IST this reflects the previous session —
 *                     labeled as such; during market hours it's live).
 *   3. Sector heat  — average change per sector across the universe.
 *   4. Movers       — top gainers/losers; volume-spike scan on the biggest movers.
 *   5. Verdict      — weighted cue score → bullish/bearish/neutral, plus a
 *                     buyers-vs-sellers read from breadth.
 *   6. AI narrative — 3-4 line morning brief from Claude, generated at most
 *                     once per IST day and cached (one API call/day total).
 *
 * The market-wide payload is cached ~10 min; the per-user overlay (their
 * portfolio/watchlist tickers) is computed per request from cached quotes.
 */

const Anthropic = require('@anthropic-ai/sdk');
const mds       = require('./marketDataService');
const volume    = require('./volumeService');
const store     = require('./store');
const UNIVERSE  = require('../config/nifty100');

const r = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

// ── IST clock helpers ─────────────────────────────────────────────────────────
function istNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}
function istDateStr() {
  return istNow().toISOString().slice(0, 10);
}
// pre-open (before 9:15), open (9:15–15:30), closed (after / weekend)
function marketPhase() {
  const n = istNow();
  const day = n.getDay();                       // 0 Sun … 6 Sat
  const mins = n.getHours() * 60 + n.getMinutes();
  if (day === 0 || day === 6) return 'closed';
  if (mins < 9 * 60 + 15)  return 'pre-open';
  if (mins <= 15 * 60 + 30) return 'open';
  return 'closed';
}

// ── 1. Global cues ────────────────────────────────────────────────────────────
// weight: contribution to the verdict score. invert: up is BAD for Indian equities.
const CUES = [
  { id: 'sp500_fut',  symbol: 'ES=F',      label: 'S&P 500 Futures',  weight: 25 },
  { id: 'nasdaq_fut', symbol: 'NQ=F',      label: 'Nasdaq Futures',   weight: 10 },
  { id: 'nikkei',     symbol: '^N225',     label: 'Nikkei 225',       weight: 15 },
  { id: 'hangseng',   symbol: '^HSI',      label: 'Hang Seng',        weight: 10 },
  { id: 'nifty',      symbol: '^NSEI',     label: 'Nifty 50 (prev)',  weight: 15 },
  { id: 'indiavix',   symbol: '^INDIAVIX', label: 'India VIX',        weight: 10, invert: true },
  { id: 'usdinr',     symbol: 'INR=X',     label: 'USD/INR',          weight: 8,  invert: true },
  { id: 'brent',      symbol: 'BZ=F',      label: 'Brent Crude',      weight: 7,  invert: true },
  { id: 'gold',       symbol: 'GC=F',      label: 'Gold',             weight: 0 },   // shown, not scored
];

async function fetchCues() {
  const out = await Promise.allSettled(CUES.map(c => mds.getQuote(c.symbol)));
  return CUES.map((c, i) => {
    const q = out[i].status === 'fulfilled' ? out[i].value : null;
    return {
      id: c.id, label: c.label, weight: c.weight, invert: !!c.invert,
      price: q ? r(q.price) : null,
      changePercent: q ? r(q.changePercent) : null,
      ok: !!q,
    };
  });
}

// ── 2+3+4. Universe scan (breadth, sectors, movers) ──────────────────────────
async function scanUniverse() {
  const tickers = UNIVERSE.map(u => u.ticker);
  const quotes  = await mds.getCachedBatchQuotes(tickers);
  const rows = [];
  for (const u of UNIVERSE) {
    const q = quotes[u.ticker];
    if (!q || !Number.isFinite(q.changePercent)) continue;
    rows.push({
      ticker: u.ticker,
      displayTicker: u.ticker.replace('.NS', ''),
      sector: u.sector,
      price: r(q.price),
      changePercent: r(q.changePercent),
      volume: q.volume || 0,
    });
  }

  // Breadth
  const advances  = rows.filter(x => x.changePercent > 0.05).length;
  const declines  = rows.filter(x => x.changePercent < -0.05).length;
  const unchanged = rows.length - advances - declines;
  const upVol   = rows.filter(x => x.changePercent > 0).reduce((s, x) => s + x.volume, 0);
  const downVol = rows.filter(x => x.changePercent < 0).reduce((s, x) => s + x.volume, 0);
  const breadth = {
    scanned: rows.length,
    advances, declines, unchanged,
    advDecRatio: declines ? r(advances / declines) : (advances ? 99 : 1),
    upVolumePct: (upVol + downVol) ? r((upVol / (upVol + downVol)) * 100, 1) : 50,
    avgChange: rows.length ? r(rows.reduce((s, x) => s + x.changePercent, 0) / rows.length) : 0,
  };

  // Sector heat
  const bySector = {};
  rows.forEach(x => (bySector[x.sector] ||= []).push(x));
  const sectors = Object.entries(bySector).map(([sector, list]) => {
    const avg = list.reduce((s, x) => s + x.changePercent, 0) / list.length;
    const top = [...list].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0];
    return {
      sector,
      count: list.length,
      avgChange: r(avg),
      advances: list.filter(x => x.changePercent > 0).length,
      declines: list.filter(x => x.changePercent < 0).length,
      topMover: top ? { ticker: top.displayTicker, changePercent: top.changePercent } : null,
    };
  }).sort((a, b) => b.avgChange - a.avgChange);

  // Movers
  const sorted  = [...rows].sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.slice(0, 6);
  const losers  = sorted.slice(-6).reverse();

  return { rows, breadth, sectors, gainers, losers };
}

// Volume-spike check on the biggest movers only (each needs a history call).
async function spikeScan(rows) {
  const candidates = [...rows]
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 12)
    .map(c => c.ticker);
  try {
    const spikes = await volume.scanVolume(candidates);   // parallel, spikes only, hottest first
    return spikes.slice(0, 6).map(s => ({
      ticker: s.displayTicker,
      changePercent: s.priceChangePercent,
      multiplier: s.multiplier,
      direction: s.direction,          // accumulation | distribution
      intensity: s.intensity,          // elevated | high | extreme
    }));
  } catch { return []; }
}

// ── 5. Verdict ────────────────────────────────────────────────────────────────
function computeVerdict(cues, breadth) {
  // Each cue contributes weight * clamp(chg% / 1.5, -1, 1); inverted cues flip sign.
  let score = 0, weightSum = 0;
  const drivers = [];
  for (const c of cues) {
    if (!c.ok || !c.weight || c.changePercent == null) continue;
    const norm = Math.max(-1, Math.min(1, c.changePercent / 1.5)) * (c.invert ? -1 : 1);
    score += c.weight * norm;
    weightSum += c.weight;
    if (Math.abs(c.changePercent) >= 0.5) {
      drivers.push(`${c.label} ${c.changePercent > 0 ? '+' : ''}${c.changePercent}%`);
    }
  }
  score = weightSum ? r((score / weightSum) * 100, 0) : 0;   // -100..100

  const direction = score >= 20 ? 'bullish' : score <= -20 ? 'bearish' : 'neutral';

  // Buyers vs sellers from breadth (adv/dec + where the volume went)
  let buyersVsSellers = 'balanced';
  if (breadth.advDecRatio >= 1.5 && breadth.upVolumePct >= 58) buyersVsSellers = 'buyers';
  else if (breadth.advDecRatio <= 0.67 && breadth.upVolumePct <= 42) buyersVsSellers = 'sellers';
  else if (breadth.advDecRatio >= 1.2) buyersVsSellers = 'leaning buyers';
  else if (breadth.advDecRatio <= 0.83) buyersVsSellers = 'leaning sellers';

  return { direction, score, buyersVsSellers, drivers: drivers.slice(0, 4) };
}

// ── 6. AI morning narrative (once per IST day, cached) ───────────────────────
let narrativeCache = { date: null, text: null, pending: null };

async function getNarrative(payload) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const today = istDateStr();
  if (narrativeCache.date === today && narrativeCache.text) return narrativeCache.text;
  if (narrativeCache.pending) return narrativeCache.pending;   // coalesce concurrent callers

  narrativeCache.pending = (async () => {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const cueLines = payload.cues.filter(c => c.ok)
        .map(c => `${c.label}: ${c.changePercent > 0 ? '+' : ''}${c.changePercent}%`).join(', ');
      const secLines = payload.sectors.slice(0, 3).map(s => `${s.sector} ${s.avgChange > 0 ? '+' : ''}${s.avgChange}%`).join(', ')
        + ' | weakest: ' + payload.sectors.slice(-2).map(s => `${s.sector} ${s.avgChange}%`).join(', ');
      const msg = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 350,
        system: 'You are a sharp Indian market analyst writing a pre-market brief for retail investors. Plain text only, no markdown. 3-4 short sentences, under 90 words. Be concrete and decision-useful, never hedgy filler. This is market commentary, not personal advice.',
        messages: [{
          role: 'user',
          content: `Write today's pre-market brief for Indian equities (${today}).\nGlobal cues: ${cueLines}\nVerdict score: ${payload.verdict.score} (${payload.verdict.direction}), breadth: ${payload.breadth.advances} adv / ${payload.breadth.declines} dec, up-volume ${payload.breadth.upVolumePct}%${payload.phase === 'pre-open' ? ' (previous session)' : ''}\nSector heat: ${secLines}\nTop movers: ${payload.gainers.slice(0, 3).map(g => `${g.displayTicker} +${g.changePercent}%`).join(', ')} / ${payload.losers.slice(0, 3).map(l => `${l.displayTicker} ${l.changePercent}%`).join(', ')}`,
        }],
      });
      const text = msg.content?.find(b => b.type === 'text')?.text?.trim() || null;
      if (text) narrativeCache = { date: today, text, pending: null };
      return text;
    } catch (err) {
      console.warn('Pre-market narrative failed:', err.message);
      narrativeCache.pending = null;
      return null;
    }
  })();
  return narrativeCache.pending;
}

// ── Assembly + cache ──────────────────────────────────────────────────────────
let snapCache = { ts: 0, data: null, building: null };
const SNAP_TTL = 10 * 60 * 1000;   // 10 min

async function buildSnapshot() {
  const [cues, scan] = await Promise.all([fetchCues(), scanUniverse()]);
  const verdict = computeVerdict(cues, scan.breadth);
  const spikes  = await spikeScan(scan.rows);
  const phase   = marketPhase();

  const payload = {
    generatedAt: new Date().toISOString(),
    istDate: istDateStr(),
    phase,                                   // pre-open | open | closed
    breadthIsPreviousSession: phase === 'pre-open',
    verdict,
    cues: cues.map(({ invert, weight, ...c }) => c),
    breadth: scan.breadth,
    sectors: scan.sectors,
    gainers: scan.gainers,
    losers: scan.losers,
    volumeSpikes: spikes,
  };
  payload.aiNarrative = await getNarrative({ ...payload, gainers: scan.gainers, losers: scan.losers });
  return payload;
}

async function getSnapshot() {
  if (snapCache.data && Date.now() - snapCache.ts < SNAP_TTL) return snapCache.data;
  if (snapCache.building) return snapCache.building;           // coalesce
  snapCache.building = buildSnapshot()
    .then(data => { snapCache = { ts: Date.now(), data, building: null }; return data; })
    .catch(err => { snapCache.building = null; throw err; });
  return snapCache.building;
}

// Per-user overlay: how their own stocks look this morning (quotes are cached).
async function userOverlay(email) {
  try {
    const [holdings, watch] = await Promise.all([store.getHoldings(email), store.getWatchlist(email)]);
    const tickers = [...new Set([...holdings.map(h => h.ticker), ...watch.map(w => w.ticker)])].slice(0, 40);
    if (!tickers.length) return [];
    const quotes = await mds.getCachedBatchQuotes(tickers);
    return tickers
      .map(t => {
        const q = quotes[t];
        if (!q || !Number.isFinite(q.changePercent)) return null;
        return {
          ticker: t.replace('.NS', '').replace('.BO', ''),
          changePercent: r(q.changePercent),
          held: holdings.some(h => h.ticker === t),
        };
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 8);
  } catch { return []; }
}

async function getPreMarketInsight(email) {
  const [snapshot, yourStocks] = await Promise.all([getSnapshot(), userOverlay(email)]);
  return { ...snapshot, yourStocks };
}

module.exports = { getPreMarketInsight };

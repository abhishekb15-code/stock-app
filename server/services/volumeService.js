/**
 * volumeService.js
 *
 * Volume-spike detector. Compares the latest session's volume against the
 * trailing 20-session average and classifies the move:
 *   - accumulation : spike on an up day  → likely HNI/institution building a position
 *   - distribution : spike on a down day → likely HNI/institution offloading
 *
 * Uses only the v8 chart history (cloud-safe / works on Render).
 */

const mds = require('./marketDataService');

function avg(values) {
  const v = values.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      try { out[idx] = await fn(items[idx], idx); } catch { out[idx] = null; }
    }
  });
  await Promise.all(workers);
  return out;
}

function intensity(mult) {
  if (mult >= 3)   return 'extreme';
  if (mult >= 2)   return 'high';
  if (mult >= 1.5) return 'elevated';
  return 'normal';
}

// Single ticker volume signal (null if not enough history).
async function getVolumeSignal(ticker) {
  const series = await mds.getTimeSeries(ticker, 45);   // ~30 trading sessions
  if (series.length < 12) return null;

  const last   = series[series.length - 1];
  const prevDay = series[series.length - 2];
  const prior  = series.slice(-21, -1);                 // 20 sessions before the latest
  const avgVol = avg(prior.map(d => d.volume));
  if (!avgVol || !last.volume) return null;

  const mult       = last.volume / avgVol;
  const priceChg   = prevDay?.close ? ((last.close - prevDay.close) / prevDay.close) * 100 : 0;
  const isSpike    = mult >= 1.5;
  const direction  = !isSpike ? 'neutral' : priceChg >= 0 ? 'accumulation' : 'distribution';

  return {
    ticker,
    displayTicker:      ticker.replace('.NS', '').replace('.BO', ''),
    date:               last.date,
    volume:             last.volume,
    avgVolume:          Math.round(avgVol),
    multiplier:         mds.r(mult, 1),
    priceChangePercent: mds.r(priceChg, 2),
    close:              last.close,
    spike:              isSpike,
    direction,
    intensity:          intensity(mult),
  };
}

// Scan many tickers; by default return only the spikes, hottest first.
async function scanVolume(tickers, { onlySpikes = true } = {}) {
  const results = (await mapLimit(tickers, 6, t => getVolumeSignal(t))).filter(Boolean);
  const filtered = onlySpikes ? results.filter(s => s.spike) : results;
  return filtered.sort((a, b) => b.multiplier - a.multiplier);
}

module.exports = { getVolumeSignal, scanVolume, mapLimit };

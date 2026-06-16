/**
 * indianInvestors.js
 *
 * Notable Indian "ace investor" portfolios.
 *
 * India has no 13F-equivalent: holdings are only knowable from each company's
 * quarterly shareholding pattern filed with BSE/NSE (SEBI LODR Reg. 31), where
 * holders above 1% are named. There is no free per-investor feed, so this is a
 * CURATED set of well-documented holdings compiled from those public quarterly
 * disclosures, enriched at request time with LIVE prices (Yahoo v8, cloud-safe).
 *
 * The holdings list is a quarterly snapshot (see DATASET_AS_OF); prices/changes
 * are live. Update HOLDINGS as new shareholding patterns are published.
 */

const mds = require('./marketDataService');
const { mapLimit } = require('./volumeService');

const DATASET_AS_OF = 'Mar 2025 quarter (BSE/NSE shareholding disclosures)';

// key, name, fund/label, qualitative note, holdings [{ticker, company, sector}]
const INVESTORS = [
  {
    key: 'jhunjhunwala', name: 'Rekha Jhunjhunwala', fund: 'Rakesh Jhunjhunwala family',
    note: "Late Rakesh Jhunjhunwala's portfolio, India's best-known investor",
    holdings: [
      { ticker: 'TITAN.NS',      company: 'Titan Company',        sector: 'Consumer Cyclical' },
      { ticker: 'STARHEALTH.NS', company: 'Star Health Insurance',sector: 'Financial Services' },
      { ticker: 'METROBRAND.NS', company: 'Metro Brands',         sector: 'Consumer Cyclical' },
      { ticker: 'CRISIL.NS',     company: 'CRISIL',               sector: 'Financial Services' },
      { ticker: 'FEDERALBNK.NS', company: 'Federal Bank',         sector: 'Financial Services' },
      { ticker: 'NAZARA.NS',     company: 'Nazara Technologies',  sector: 'Communication Services' },
      { ticker: 'CANBK.NS',      company: 'Canara Bank',          sector: 'Financial Services' },
      { ticker: 'INDHOTEL.NS',   company: 'Indian Hotels (Taj)',  sector: 'Consumer Cyclical' },
      { ticker: 'ESCORTS.NS',    company: 'Escorts Kubota',       sector: 'Industrials' },
      { ticker: 'TATACOMM.NS',   company: 'Tata Communications',  sector: 'Communication Services' },
      { ticker: 'APTECHT.NS',    company: 'Aptech',               sector: 'Consumer Cyclical' },
    ],
  },
  {
    key: 'damani', name: 'Radhakishan Damani', fund: 'DMart founder / Bright Star',
    note: 'Founder of Avenue Supermarts (DMart); among India’s richest investors',
    holdings: [
      { ticker: 'DMART.NS',      company: 'Avenue Supermarts (DMart)', sector: 'Consumer Defensive' },
      { ticker: 'VSTIND.NS',     company: 'VST Industries',        sector: 'Consumer Defensive' },
      { ticker: 'INDIACEM.NS',   company: 'India Cements',         sector: 'Basic Materials' },
      { ticker: 'SUNDARMFIN.NS', company: 'Sundaram Finance',      sector: 'Financial Services' },
      { ticker: 'TRENT.NS',      company: 'Trent',                 sector: 'Consumer Cyclical' },
      { ticker: '3MINDIA.NS',    company: '3M India',              sector: 'Industrials' },
      { ticker: 'BFUTILITIE.NS', company: 'BF Utilities',          sector: 'Utilities' },
    ],
  },
  {
    key: 'kedia', name: 'Vijay Kedia', fund: 'Kedia Securities',
    note: 'SMILE-investing (Small in size, Medium in experience, Large in aspiration)',
    holdings: [
      { ticker: 'ATULAUTO.NS',   company: 'Atul Auto',            sector: 'Consumer Cyclical' },
      { ticker: 'TEJASNET.NS',   company: 'Tejas Networks',       sector: 'Technology' },
      { ticker: 'ELECON.NS',     company: 'Elecon Engineering',   sector: 'Industrials' },
      { ticker: 'PATELENG.NS',   company: 'Patel Engineering',    sector: 'Industrials' },
      { ticker: 'MAHLIFE.NS',    company: 'Mahindra Lifespace',   sector: 'Real Estate' },
      { ticker: 'SIYSIL.NS',     company: 'Siyaram Silk Mills',   sector: 'Consumer Cyclical' },
      { ticker: 'TALBROAUTO.NS', company: 'Talbros Automotive',   sector: 'Consumer Cyclical' },
    ],
  },
  {
    key: 'kacholia', name: 'Ashish Kacholia', fund: 'Lucky Investment Managers',
    note: 'Small/mid-cap specialist',
    holdings: [
      { ticker: 'SAFARI.NS',   company: 'Safari Industries',      sector: 'Consumer Cyclical' },
      { ticker: 'LAOPALA.NS',  company: 'La Opala RG',            sector: 'Consumer Cyclical' },
      { ticker: 'SHAILY.NS',   company: 'Shaily Engineering',     sector: 'Industrials' },
      { ticker: 'GARFIBRES.NS',company: 'Garware Technical Fibres',sector: 'Industrials' },
    ],
  },
  {
    key: 'singhania', name: 'Sunil Singhania', fund: 'Abakkus Asset Manager',
    note: 'Founder of Abakkus; ex-CIO Reliance Mutual Fund',
    holdings: [
      { ticker: 'HEG.NS',     company: 'HEG',                     sector: 'Industrials' },
      { ticker: 'MASTEK.NS',  company: 'Mastek',                  sector: 'Technology' },
      { ticker: 'SARDAEN.NS', company: 'Sarda Energy & Minerals', sector: 'Basic Materials' },
    ],
  },
  {
    key: 'mukul', name: 'Mukul Agrawal', fund: 'Param Capital',
    note: 'High-conviction mid/small-cap investor',
    holdings: [
      { ticker: 'BSE.NS',        company: 'BSE Ltd',              sector: 'Financial Services' },
      { ticker: 'NEULANDLAB.NS', company: 'Neuland Laboratories', sector: 'Healthcare' },
      { ticker: 'RADICO.NS',     company: 'Radico Khaitan',       sector: 'Consumer Defensive' },
    ],
  },
  {
    key: 'goel', name: 'Anil Kumar Goel', fund: 'Individual investor',
    note: 'Known for sugar & agri-commodity cyclicals',
    holdings: [
      { ticker: 'KRBL.NS',       company: 'KRBL (India Gate rice)', sector: 'Consumer Defensive' },
      { ticker: 'TRIVENI.NS',    company: 'Triveni Engineering',    sector: 'Industrials' },
      { ticker: 'DHAMPURSUG.NS', company: 'Dhampur Sugar Mills',    sector: 'Consumer Defensive' },
    ],
  },
  {
    key: 'dolly', name: 'Dolly Khanna', fund: 'Rajiv & Dolly Khanna',
    note: 'Value-style cyclical/commodity small-caps; portfolio rotates frequently',
    holdings: [
      { ticker: 'PRAKASH.NS',  company: 'Prakash Industries',  sector: 'Basic Materials' },
      { ticker: 'KCP.NS',      company: 'KCP Ltd',             sector: 'Basic Materials' },
      { ticker: 'NACLIND.NS',  company: 'NACL Industries',     sector: 'Basic Materials' },
      { ticker: 'RACLGEAR.NS', company: 'RACL Geartech',       sector: 'Consumer Cyclical' },
      { ticker: 'POLYPLEX.NS', company: 'Polyplex',            sector: 'Basic Materials' },
    ],
  },
  {
    key: 'porinju', name: 'Porinju Veliyath', fund: 'Equity Intelligence India',
    note: 'Contrarian "special situations" small-cap investor',
    holdings: [
      { ticker: 'ORIENTBELL.NS', company: 'Orient Bell (tiles)',  sector: 'Industrials' },
      { ticker: 'KSOLVES.NS',    company: 'KSolves India',        sector: 'Technology' },
      { ticker: 'SHALPAINTS.NS', company: 'Shalimar Paints',      sector: 'Basic Materials' },
      { ticker: 'RPSGVENT.NS',   company: 'RPSG Ventures',        sector: 'Consumer Cyclical' },
    ],
  },
  {
    key: 'rdamani', name: 'Ramesh Damani', fund: 'Renowned BSE-member investor',
    note: 'Veteran long-term investor; keeps a concentrated book with few public >1% disclosures, so individual holdings are not reliably tracked here',
    holdings: [],
  },
];

let _cache = { ts: 0, data: null };
let _inflight = null;
const TTL = 30 * 60 * 1000;   // 30 min (prices are live; holdings are static)

async function build() {
  // One live quote per unique ticker (cached in marketDataService)
  const tickers = [...new Set(INVESTORS.flatMap(i => i.holdings.map(h => h.ticker)))];
  const quotes = {};
  await mapLimit(tickers, 8, async t => {
    try { const q = await mds.getQuote(t); quotes[t] = { price: q.price, changePercent: q.changePercent }; }
    catch { quotes[t] = null; }
  });

  const investors = INVESTORS.map(inv => ({
    key: inv.key, name: inv.name, fund: inv.fund, note: inv.note,
    holdingsCount: inv.holdings.length,
    holdings: inv.holdings.map(h => ({
      ticker: h.ticker,
      displayTicker: h.ticker.replace('.NS', '').replace('.BO', ''),
      company: h.company,
      sector: h.sector,
      price: quotes[h.ticker]?.price ?? null,
      changePercent: quotes[h.ticker]?.changePercent ?? null,
    })).sort((a, b) => a.company.localeCompare(b.company)),
  }));

  // Consensus — stocks held by more than one tracked investor
  const byTicker = {};
  for (const inv of INVESTORS) {
    for (const h of inv.holdings) {
      const e = byTicker[h.ticker] || (byTicker[h.ticker] = { company: h.company, displayTicker: h.ticker.replace('.NS','').replace('.BO',''), sector: h.sector, holders: [] });
      e.holders.push(inv.name);
    }
  }
  const consensus = Object.values(byTicker)
    .map(e => ({ ...e, count: e.holders.length }))
    .filter(e => e.count >= 2)
    .sort((a, b) => b.count - a.count);

  // Sector breakdown — by number of holdings across all investors
  const bySector = {};
  let total = 0;
  for (const inv of INVESTORS) for (const h of inv.holdings) { bySector[h.sector] = (bySector[h.sector] || 0) + 1; total++; }
  const sectors = Object.entries(bySector)
    .map(([sector, count]) => ({ sector, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);

  return { market: 'India', asOf: DATASET_AS_OF, generatedAt: new Date().toISOString(), investors, consensus, sectors };
}

async function getIndianInvestors({ force = false } = {}) {
  if (!force && _cache.data && (Date.now() - _cache.ts) < TTL) return _cache.data;
  if (_inflight) return _inflight;
  _inflight = build()
    .then(data => { _cache = { ts: Date.now(), data }; return data; })
    .finally(() => { _inflight = null; });
  return _inflight;
}

module.exports = { getIndianInvestors, INVESTORS };

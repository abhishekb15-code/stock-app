/**
 * superInvestors.js
 *
 * Tracks notable value investors via their US SEC Form 13F-HR filings
 * (US-listed long positions, filed quarterly, ~45-day lag). Pulls the latest
 * two 13Fs per manager from EDGAR, parses the holdings info table, and derives:
 *   - per-investor top holdings (% of 13F portfolio)
 *   - quarter-over-quarter moves (new / added / reduced / exited)
 *   - most-owned consensus across all tracked managers
 *   - sector concentration
 *
 * Data is cached for 12h since 13Fs only change quarterly.
 */

const https = require('https');

const INVESTORS = [
  { key:'buffett',     name:'Warren Buffett',     fund:'Berkshire Hathaway',     cik:'0001067983' },
  { key:'ackman',      name:'Bill Ackman',        fund:'Pershing Square',        cik:'0001336528' },
  { key:'lilu',        name:'Li Lu',              fund:'Himalaya Capital',       cik:'0001709323' },
  { key:'klarman',     name:'Seth Klarman',       fund:'Baupost Group',          cik:'0001061768' },
  { key:'pabrai',      name:'Mohnish Pabrai',     fund:'Pabrai / Dalal Street',  cik:'0001549575' },
  { key:'spier',       name:'Guy Spier',          fund:'Aquamarine Capital',     cik:'0001404599' },
  { key:'einhorn',     name:'David Einhorn',      fund:'Greenlight / DME Capital',cik:'0001489933' },
  { key:'burry',       name:'Michael Burry',      fund:'Scion Asset Management', cik:'0001649339' },
  { key:'druckenmiller', name:'Stanley Druckenmiller', fund:'Duquesne Family Office', cik:'0001536411' },
];

// SEC requires a descriptive User-Agent. https://www.sec.gov/os/webmaster-faq#developers
const UA = 'StockIntel/1.0 (portfolio research; abhishekb15@gmail.com)';

function secGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'identity' }, timeout: 20000 }, res => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location)
        return secGet(res.headers.location).then(resolve).catch(reject);
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('SEC request timeout')); });
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Sector map (by issuer-name substring; 13F gives no sector) ────────────────
const ISSUER_SECTOR = [
  ['APPLE','Technology'], ['MICROSOFT','Technology'], ['NVIDIA','Technology'], ['MICRON','Technology'],
  ['HP INC','Technology'], ['HEWLETT','Technology'], ['ADOBE','Technology'], ['ORACLE','Technology'],
  ['INTEL','Technology'], ['TAIWAN SEMICON','Technology'], ['SALESFORCE','Technology'], ['SNOWFLAKE','Technology'],
  ['ALPHABET','Communication Services'], ['META PLATFORMS','Communication Services'], ['GOOGLE','Communication Services'],
  ['NETFLIX','Communication Services'], ['CHARTER COMM','Communication Services'], ['LIBERTY','Communication Services'],
  ['WARNER','Communication Services'], ['PARAMOUNT','Communication Services'], ['T-MOBILE','Communication Services'],
  ['VERISIGN','Communication Services'],
  ['AMAZON','Consumer Cyclical'], ['ALIBABA','Consumer Cyclical'], ['CHIPOTLE','Consumer Cyclical'],
  ['DOMINO','Consumer Cyclical'], ['HILTON','Consumer Cyclical'], ['RESTAURANT BRANDS','Consumer Cyclical'],
  ['LENNAR','Consumer Cyclical'], ['NVR','Consumer Cyclical'], ['POOL CORP','Consumer Cyclical'],
  ['HOWARD HUGHES','Consumer Cyclical'], ['CARMAX','Consumer Cyclical'], ['FLOOR & DECOR','Consumer Cyclical'],
  ['ULTA','Consumer Cyclical'], ['BURLINGTON','Consumer Cyclical'],
  ['COCA COLA','Consumer Defensive'], ['KRAFT HEINZ','Consumer Defensive'], ['KROGER','Consumer Defensive'],
  ['PROCTER','Consumer Defensive'], ['CONSTELLATION BRANDS','Consumer Defensive'], ['MONDELEZ','Consumer Defensive'],
  ['COSTCO','Consumer Defensive'], ['WALMART','Consumer Defensive'],
  ['AMERICAN EXPRESS','Financial Services'], ['BANK AMER','Financial Services'], ['BANK OF AMER','Financial Services'],
  ['WELLS FARGO','Financial Services'], ['JPMORGAN','Financial Services'], ['CITIGROUP','Financial Services'],
  ['VISA','Financial Services'], ['MASTERCARD','Financial Services'], ['MOODY','Financial Services'],
  ['BANK NEW YORK','Financial Services'], ['CAPITAL ONE','Financial Services'], ['GOLDMAN','Financial Services'],
  ['BERKSHIRE','Financial Services'], ['BROOKFIELD','Financial Services'], ['FEDERAL NATL MTG','Financial Services'],
  ['FEDERAL HOME LOAN','Financial Services'], ['JEFFERIES','Financial Services'], ['NU HOLDINGS','Financial Services'],
  ['ALLY FINL','Financial Services'], ['DELL','Technology'],
  ['CHEVRON','Energy'], ['OCCIDENTAL','Energy'], ['EXXON','Energy'], ['CONOCO','Energy'],
  ['CHORD ENERGY','Energy'], ['CENOVUS','Energy'], ['CNX RESOURCES','Energy'],
  ['DAVITA','Healthcare'], ['MCKESSON','Healthcare'], ['UNITEDHEALTH','Healthcare'], ['CENTENE','Healthcare'],
  ['HUMANA','Healthcare'], ['CVS','Healthcare'], ['DANAHER','Healthcare'], ['LABORATORY CORP','Healthcare'],
  ['CHUBB','Financial Services'], ['MARKEL','Financial Services'], ['AON','Financial Services'],
  ['CANADIAN PAC','Industrials'], ['CANADIAN NATL','Industrials'], ['UNITED PARCEL','Industrials'],
  ['CATERPILLAR','Industrials'], ['GENERAL DYNAMICS','Industrials'], ['WATTS WATER','Industrials'],
  ['FERGUSON','Industrials'], ['AERCAP','Industrials'], ['UBER','Technology'],
  ['SEND','Communication Services'], ['HEICO','Industrials'], ['CRH','Basic Materials'],
  ['AIR PRODUCTS','Basic Materials'], ['LOUISIANA-PACIFIC','Basic Materials'], ['SEAGATE','Technology'],
  ['LAMAR ADVERT','Real Estate'], ['SERITAGE','Real Estate'], ['HOULIHAN','Financial Services'],
];
function sectorForIssuer(name) {
  const up = (name || '').toUpperCase();
  for (const [needle, sector] of ISSUER_SECTOR) if (up.includes(needle)) return sector;
  return 'Other';
}

function titleCase(s) {
  return (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\b(Inc|Corp|Co|Ltd|Llc|Plc|Sa|Nv|Cl|Com|Group|Holdings|The)\b/gi, m => m.toUpperCase() === 'THE' ? 'the' : m);
}
const fmtUSD = (v) => {
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e9) return `$${(v/1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
};

// Normalize an issuer name so different share classes (e.g. ALPHABET CL A / CL C)
// merge into one position.
function issuerKey(name) {
  return (name || '').toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(CL|CLASS|SER|SERIES)\s+[A-Z0-9]\b/g, ' ')
    .replace(/\b(COM|COMMON|STK|SHS|NEW|DEL|INC|CORP|CORPORATION|CO|LTD|PLC|NV|SA|HLDGS?|HOLDINGS?|GROUP|THE)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ── Parse a 13F info table XML into aggregated holdings (merged by issuer) ─────
// scale: pre-2023 13Fs report value in thousands; later filings in whole dollars.
function parseInfoTable(xml, scale = 1) {
  const blocks = xml.match(/<(?:\w+:)?infoTable>[\s\S]*?<\/(?:\w+:)?infoTable>/g) || [];
  const tag = (s, t) => { const m = s.match(new RegExp(`<(?:\\w+:)?${t}>([^<]*)`)); return m ? m[1].trim() : null; };
  const byIssuer = {};
  for (const b of blocks) {
    if (tag(b, 'putCall')) continue;                    // skip options, count share ownership only
    const issuer = tag(b, 'nameOfIssuer');
    if (!issuer) continue;
    const key    = issuerKey(issuer);
    const cusip  = (tag(b, 'cusip') || '').toUpperCase();
    const value  = (Number(tag(b, 'value')) || 0) * scale;
    const shares = Number((b.match(/<(?:\w+:)?sshPrnamt>([^<]*)/) || [])[1]) || 0;
    if (!byIssuer[key]) byIssuer[key] = { key, issuer, cusip, value: 0, shares: 0 };
    byIssuer[key].value  += value;
    byIssuer[key].shares += shares;
  }
  return Object.values(byIssuer);
}

// Locate + fetch the holdings info table for one accession.
// 13F values should be whole dollars (post-2023) but some filers still report in
// thousands — detect by magnitude (no notable manager has a top position < $1M).
async function fetchHoldings(cikNum, accession) {
  const accNo = accession.replace(/-/g, '');
  const base  = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNo}`;
  const idx   = await secGet(`${base}/index.json`);
  if (idx.status !== 200) return [];
  const items = (JSON.parse(idx.body).directory?.item || []).map(i => i.name);
  // Candidate xml files (exclude the cover page primary_doc.xml)
  const candidates = items.filter(n => n.toLowerCase().endsWith('.xml') && !/primary_doc/i.test(n))
    .sort((a, b) => (/(infotable|form13f)/i.test(b) ? 1 : 0) - (/(infotable|form13f)/i.test(a) ? 1 : 0));
  for (const name of candidates) {
    await sleep(120);
    const xml = await secGet(`${base}/${name}`);
    if (xml.status === 200 && /infoTable>/.test(xml.body)) {
      let holds = parseInfoTable(xml.body);
      if (holds.length) {
        const maxV = Math.max(...holds.map(h => h.value));
        if (maxV > 0 && maxV < 1e6) holds = holds.map(h => ({ ...h, value: h.value * 1000 }));
        return holds;
      }
    }
  }
  return [];
}

// Build one investor's holdings + QoQ moves from their two latest 13F-HRs.
async function buildInvestor(inv) {
  const cikNum = String(Number(inv.cik));   // strip leading zeros for Archives path
  const sub = await secGet(`https://data.sec.gov/submissions/CIK${inv.cik}.json`);
  if (sub.status !== 200) throw new Error(`submissions HTTP ${sub.status}`);
  const recent = JSON.parse(sub.body).filings.recent;

  const filings = [];
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === '13F-HR') {
      filings.push({ accession: recent.accessionNumber[i], filingDate: recent.filingDate[i], reportDate: recent.reportDate[i] });
    }
  }
  if (!filings.length) throw new Error('no 13F-HR filings');
  filings.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const [latest, prev] = filings;

  await sleep(120);
  const latestHoldings = await fetchHoldings(cikNum, latest.accession);
  const prevHoldings   = prev ? await fetchHoldings(cikNum, prev.accession) : [];

  const totalValue = latestHoldings.reduce((s, h) => s + h.value, 0);
  const prevByKey   = Object.fromEntries(prevHoldings.map(h => [h.key, h]));
  const latestByKey = Object.fromEntries(latestHoldings.map(h => [h.key, h]));

  const decorate = (h) => {
    const before = prevByKey[h.key];
    let change = { type: 'hold', sharesPct: 0 };
    if (!before)                          change = { type: 'new', sharesPct: 100 };
    else if (before.shares && h.shares > before.shares * 1.05) change = { type: 'added',   sharesPct: Math.round(((h.shares - before.shares) / before.shares) * 100) };
    else if (before.shares && h.shares < before.shares * 0.95) change = { type: 'reduced', sharesPct: Math.round(((h.shares - before.shares) / before.shares) * 100) };
    return {
      key: h.key, issuer: titleCase(h.issuer), cusip: h.cusip,
      value: h.value, valueFmt: fmtUSD(h.value),
      pct: totalValue ? Math.round((h.value / totalValue) * 1000) / 10 : 0,
      shares: h.shares, sector: sectorForIssuer(h.issuer), change,
    };
  };

  const holdings = latestHoldings.map(decorate).sort((a, b) => b.value - a.value);

  const moves = {
    new:     holdings.filter(h => h.change.type === 'new'),
    added:   holdings.filter(h => h.change.type === 'added'),
    reduced: holdings.filter(h => h.change.type === 'reduced'),
    exited:  prevHoldings.filter(h => !latestByKey[h.key])
               .map(h => ({ issuer: titleCase(h.issuer), value: h.value, valueFmt: fmtUSD(h.value), sector: sectorForIssuer(h.issuer) }))
               .sort((a, b) => b.value - a.value),
  };

  const staleCutoff = new Date(Date.now() - 200 * 86400 * 1000).toISOString().split('T')[0];

  return {
    ...inv, cikNum,
    reportDate: latest.reportDate, filingDate: latest.filingDate, prevReportDate: prev?.reportDate || null,
    stale: latest.reportDate < staleCutoff,
    totalValue, totalValueFmt: fmtUSD(totalValue), holdingsCount: holdings.length,
    topHoldings: holdings.slice(0, 12),
    moves: {
      new:     moves.new.slice(0, 8),
      added:   moves.added.slice(0, 8),
      reduced: moves.reduced.slice(0, 8),
      exited:  moves.exited.slice(0, 8),
    },
    _allHoldings: holdings,   // internal, used for consensus/sector; stripped before sending
  };
}

// ── Aggregate across all tracked investors ────────────────────────────────────
function buildConsensus(investors) {
  const byKey = {};
  for (const inv of investors) {
    for (const h of inv._allHoldings || []) {
      const e = byKey[h.key] || (byKey[h.key] = { issuer: h.issuer, sector: h.sector, holders: [], totalValue: 0 });
      e.holders.push({ key: inv.key, name: inv.name, pct: h.pct });
      e.totalValue += h.value;
    }
  }
  return Object.values(byKey)
    .map(e => ({ ...e, count: e.holders.length, totalValueFmt: fmtUSD(e.totalValue) }))
    .filter(e => e.count >= 2)
    .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
    .slice(0, 25);
}

function buildSectors(investors) {
  const bySector = {};
  let total = 0;
  for (const inv of investors) {
    for (const h of inv._allHoldings || []) {
      bySector[h.sector] = (bySector[h.sector] || 0) + h.value;
      total += h.value;
    }
  }
  return Object.entries(bySector)
    .map(([sector, value]) => ({ sector, value, valueFmt: fmtUSD(value), pct: total ? Math.round((value / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.value - a.value);
}

// ── Cache + public API ─────────────────────────────────────────────────────────
let _cache = { ts: 0, data: null };
let _inflight = null;
const TTL = 12 * 60 * 60 * 1000;   // 12h

async function build() {
  const settled = [];
  // Limited concurrency to respect SEC's rate guidance (~10 req/s).
  const queue = [...INVESTORS];
  async function worker() {
    while (queue.length) {
      const inv = queue.shift();
      try { settled.push(await buildInvestor(inv)); }
      catch (e) { settled.push({ ...inv, error: e.message, topHoldings: [], moves: {}, _allHoldings: [] }); }
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  const ok = settled.filter(i => !i.error);
  const consensus = buildConsensus(ok);
  const sectors   = buildSectors(ok);

  // strip internal field before returning
  const investors = settled.map(({ _allHoldings, ...rest }) => rest);
  return { generatedAt: new Date().toISOString(), investors, consensus, sectors };
}

async function getSuperInvestors({ force = false } = {}) {
  if (!force && _cache.data && (Date.now() - _cache.ts) < TTL) return _cache.data;
  if (_inflight) return _inflight;
  _inflight = build()
    .then(data => { _cache = { ts: Date.now(), data }; return data; })
    .finally(() => { _inflight = null; });
  return _inflight;
}

module.exports = { getSuperInvestors, INVESTORS };

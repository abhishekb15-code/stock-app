/**
 * googleDriveSync.js — Syncs portfolio from Google Drive "equity" sheet
 * Uses Google Sheets API v4 with a service account key (JSON) stored as a GitHub secret
 * OR reads a publicly shared CSV export URL
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'StockApp/1.0', ...headers }, timeout: 15000 }, res => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return get(res.headers.location, headers).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Parse CSV text into array of objects
function parseCSV(text) {
  const lines   = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] || '').trim()]));
  });
}

// Map raw CSV row to a holding object
function rowToHolding(row) {
  // Support various column name formats from the Equity sheet
  const ticker = row.ticker || row.symbol || row.stock || row.nse || row.nsesymbol || row.scrip;
  const shares  = parseFloat(row.shares || row.qty || row.quantity || row.units || 0);
  const avgCost = parseFloat(row.avgcost || row.avgbuyprice || row.buyprice || row.averagecost || row.avgprice || row.cost || 0);

  if (!ticker || !shares || !avgCost) return null;

  // Clean ticker — remove NSE: prefix if present
  const cleanTicker = ticker.replace(/^NSE:/i, '').replace(/^BSE:/i, '').trim().toUpperCase();
  if (!cleanTicker) return null;

  return {
    ticker:       cleanTicker.endsWith('.NS') || cleanTicker.endsWith('.BO') ? cleanTicker : `${cleanTicker}.NS`,
    shares,
    avgBuyPrice:  avgCost,
    purchaseDate: row.date || row.purchasedate || '2024-01-01',
    notes:        `Google Drive sync — ${new Date().toISOString().split('T')[0]}`,
  };
}

/**
 * Fetch portfolio from a publicly shared Google Sheet (CSV export URL)
 * URL format: https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=SHEET_GID
 */
async function syncFromGoogleSheetCSV(sheetUrl) {
  console.log('📂 Fetching portfolio from Google Drive...');
  const res = await get(sheetUrl);
  if (res.status !== 200) throw new Error(`Google Sheets returned HTTP ${res.status}`);

  const rows     = parseCSV(res.body);
  const holdings = rows.map(rowToHolding).filter(Boolean);
  if (holdings.length === 0) throw new Error('No valid holdings found in sheet');

  console.log(`   ✅ Found ${holdings.length} holdings from Google Drive`);
  return holdings;
}

/**
 * Sync via Google Sheets API v4 using a service account
 * GOOGLE_SERVICE_ACCOUNT_JSON must be set as a GitHub secret (the full JSON key file content)
 */
async function syncViaServiceAccount(spreadsheetId, sheetName = 'Sheet1') {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');

  const serviceAccount = JSON.parse(serviceAccountJson);

  // Get access token via JWT
  const token = await getAccessToken(serviceAccount);

  // Fetch sheet data
  const range  = `${sheetName}!A1:Z1000`;
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res    = await get(apiUrl, { Authorization: `Bearer ${token}` });

  if (res.status !== 200) throw new Error(`Sheets API returned ${res.status}: ${res.body}`);

  const data    = JSON.parse(res.body);
  const rows    = data.values || [];
  if (rows.length < 2) throw new Error('Sheet has no data');

  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const holdings = rows.slice(1).map(vals => {
    const row = Object.fromEntries(headers.map((h, i) => [h, (vals[i] || '').trim()]));
    return rowToHolding(row);
  }).filter(Boolean);

  console.log(`   ✅ Synced ${holdings.length} holdings via Google Sheets API`);
  return holdings;
}

// Simple JWT + OAuth2 for Google service account
async function getAccessToken(serviceAccount) {
  const { createSign } = require('crypto');

  const now  = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const signing = `${header}.${payload}`;

  const sign = createSign('RSA-SHA256');
  sign.update(signing);
  const sig = sign.sign(serviceAccount.private_key, 'base64url');
  const jwt = `${signing}.${sig}`;

  // Exchange JWT for access token
  const tokenRes = await new Promise((resolve, reject) => {
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const req  = https.request({
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      timeout:  10000,
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  const parsed = JSON.parse(tokenRes);
  if (!parsed.access_token) throw new Error(`Token error: ${tokenRes}`);
  return parsed.access_token;
}

/**
 * Main export — tries service account first, then CSV URL, then falls back to hardcoded holdings
 */
async function syncPortfolio() {
  // Option 1: Service account (most reliable — reads private sheets too)
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && spreadsheetId) {
    try {
      const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
      return await syncViaServiceAccount(spreadsheetId, sheetName);
    } catch (err) {
      console.log(`   ⚠️  Service account sync failed: ${err.message}`);
    }
  }

  // Option 2: Public CSV URL
  const csvUrl = process.env.GOOGLE_SHEET_CSV_URL;
  if (csvUrl) {
    try {
      return await syncFromGoogleSheetCSV(csvUrl);
    } catch (err) {
      console.log(`   ⚠️  CSV sync failed: ${err.message}`);
    }
  }

  console.log('   ℹ️  No Google Drive config — using hardcoded holdings');
  return null; // caller will use hardcoded holdings
}

module.exports = { syncPortfolio };

// Ticker corrections — some Drive sheet codes differ from official NSE symbols
const TICKER_CORRECTIONS = {
  'WEBELSOLAR': 'WEBSOL',
  'WEBEL':      'WEBSOL',
  'UTKARSHBNK': 'UTKARSHBNK', // confirmed correct
  'AEROENTER':  'AEROENTER',  // confirmed correct
};

function correctTicker(symbol) {
  const upper = symbol.toUpperCase().replace('.NS','').replace('.BO','');
  return TICKER_CORRECTIONS[upper] || upper;
}

module.exports.correctTicker = correctTicker;

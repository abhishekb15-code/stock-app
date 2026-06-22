/**
 * store.js — per-user data layer (users, holdings, watchlist)
 *
 * Two interchangeable backends, auto-selected:
 *   - Postgres  when DATABASE_URL is set (durable; required for real customers)
 *   - In-memory otherwise (works with zero setup, but wiped on restart)
 *
 * All data is keyed by the user's lowercased email, so every account has its own
 * isolated portfolio and watchlist. The owner email + the local fallback user are
 * seeded with the original holdings; brand-new users start empty.
 */

const crypto = require('crypto');
const { normalizeSymbol } = require('./indianMarketData');

const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'abhishekb15@gmail.com').toLowerCase();
const LOCAL_USER  = 'local@local';   // used when auth is disabled (single-user/local mode)

// Original seed portfolio — applied to the owner + local user only.
const SEED_HOLDINGS = [
  { ticker:'OIL.NS',        shares:4500,   avgBuyPrice:245.54,  notes:'Oil India Ltd' },
  { ticker:'WEBELSOLAR.NS', shares:18000,  avgBuyPrice:40.25,   notes:'Webel Solar' },
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

function normHolding(d) {
  return {
    id:           d.id || crypto.randomUUID(),
    ticker:       normalizeSymbol(d.ticker || d.symbol),
    shares:       Number(d.shares || d.quantity || d.qty || 0),
    avgBuyPrice:  Number(d.avgBuyPrice || d.buyPrice || d.averagePrice || d.avg_price || 0),
    purchaseDate: d.purchaseDate || d.date || '2024-01-01',
    notes:        d.notes || '',
    createdAt:    d.createdAt || new Date().toISOString(),
  };
}
const isSeedUser = (email) => email === OWNER_EMAIL || email === LOCAL_USER;

const USE_PG = !!process.env.DATABASE_URL;

// ─────────────────────────────────────────────────────────────────────────────
// In-memory backend
// ─────────────────────────────────────────────────────────────────────────────
const mem = { users: new Map(), holdings: new Map(), watch: new Map(), txns: new Map() };  // email -> …

const memBackend = {
  async init() {
    await this.ensureUser(LOCAL_USER, { name: 'Local' });
  },
  async ensureUser(email, profile = {}) {
    if (!mem.users.has(email)) {
      mem.users.set(email, { email, name: profile.name || null, picture: profile.picture || null,
        provider: profile.provider || null, passwordHash: profile.passwordHash || null,
        emailVerified: !!profile.emailVerified || isSeedUser(email),
        phone: profile.phone || null,
        prefs: { dailyDigest: isSeedUser(email) },
        verifyToken: null, verifyExpires: 0, resetToken: null, resetExpires: 0,
        plan: isSeedUser(email) ? 'pro' : 'free', planStatus: isSeedUser(email) ? 'active' : null,
        billingProvider: null, subscriptionId: null, currentPeriodEnd: null,
        createdAt: new Date().toISOString() });
      mem.holdings.set(email, isSeedUser(email) ? SEED_HOLDINGS.map(normHolding) : []);
      mem.watch.set(email, []);
    } else {
      const u = mem.users.get(email);
      if (profile.name) u.name = profile.name;
      if (profile.picture) u.picture = profile.picture;
      if (profile.passwordHash) u.passwordHash = profile.passwordHash;
      if (profile.provider) u.provider = profile.provider;
      if (profile.emailVerified) u.emailVerified = true;
    }
    return mem.users.get(email);
  },
  async getUser(email)            { return mem.users.get(email) || null; },

  async setVerifyToken(email, token, expires) { const u = await this.ensureUser(email); u.verifyToken = token; u.verifyExpires = expires; },
  async markVerified(email)       { const u = await this.ensureUser(email); u.emailVerified = true; u.verifyToken = null; },
  async consumeVerifyToken(token) {
    for (const u of mem.users.values()) if (u.verifyToken === token) {
      if (u.verifyExpires < Date.now()) return null;
      u.emailVerified = true; u.verifyToken = null; return { email: u.email };
    }
    return null;
  },
  async setResetToken(email, token, expires) { const u = mem.users.get(email); if (!u) return false; u.resetToken = token; u.resetExpires = expires; return true; },
  async consumeResetToken(token, passwordHash) {
    for (const u of mem.users.values()) if (u.resetToken === token) {
      if (u.resetExpires < Date.now()) return null;
      u.passwordHash = passwordHash; u.resetToken = null; u.emailVerified = true; return { email: u.email };
    }
    return null;
  },

  async getSubscription(email) { const u = await this.ensureUser(email);
    return { plan: u.plan || 'free', status: u.planStatus, provider: u.billingProvider, subscriptionId: u.subscriptionId, currentPeriodEnd: u.currentPeriodEnd }; },
  async setSubscription(email, sub) { const u = await this.ensureUser(email);
    if (sub.plan !== undefined) u.plan = sub.plan;
    if (sub.status !== undefined) u.planStatus = sub.status;
    if (sub.provider !== undefined) u.billingProvider = sub.provider;
    if (sub.subscriptionId !== undefined) u.subscriptionId = sub.subscriptionId;
    if (sub.currentPeriodEnd !== undefined) u.currentPeriodEnd = sub.currentPeriodEnd;
    return this.getSubscription(email); },
  async findBySubscriptionId(subId) { for (const u of mem.users.values()) if (u.subscriptionId === subId) return u.email; return null; },

  async getProfile(email) { const u = await this.ensureUser(email);
    return { email: u.email, name: u.name, phone: u.phone || null, picture: u.picture, provider: u.provider, emailVerified: !!u.emailVerified, hasPassword: !!u.passwordHash, prefs: u.prefs || {}, createdAt: u.createdAt }; },
  async updateProfile(email, data) { const u = await this.ensureUser(email);
    if (data.name    !== undefined) u.name    = data.name;
    if (data.phone   !== undefined) u.phone   = data.phone;
    if (data.picture !== undefined) u.picture = data.picture;
    return this.getProfile(email); },
  async setPassword(email, hash) { const u = await this.ensureUser(email); u.passwordHash = hash; return true; },
  async updatePrefs(email, patch) { const u = await this.ensureUser(email); u.prefs = { ...(u.prefs || {}), ...patch }; return u.prefs; },
  async getDigestRecipients() { return [...mem.users.values()].filter(u => u.prefs && u.prefs.dailyDigest).map(u => u.email); },

  async addTransaction(email, tx) { const arr = mem.txns.get(email) || []; const rec = { id: crypto.randomUUID(), ...tx, createdAt: new Date().toISOString() }; arr.unshift(rec); mem.txns.set(email, arr); return rec; },
  async getTransactions(email, ticker) { const arr = mem.txns.get(email) || []; return (ticker ? arr.filter(t => t.ticker === ticker) : arr).slice(0, 50); },

  async getHoldings(email)        { await this.ensureUser(email); return [...(mem.holdings.get(email) || [])]; },
  async addHolding(email, data)   { await this.ensureUser(email); const h = normHolding(data); mem.holdings.get(email).push(h); return h; },
  async updateHolding(email, id, data) {
    await this.ensureUser(email);
    const arr = mem.holdings.get(email); const i = arr.findIndex(h => h.id === id);
    if (i === -1) return null;
    arr[i] = { ...arr[i], ...data,
      ticker: data.ticker ? normalizeSymbol(data.ticker) : arr[i].ticker,
      shares: data.shares !== undefined ? Number(data.shares) : arr[i].shares,
      avgBuyPrice: data.avgBuyPrice !== undefined ? Number(data.avgBuyPrice) : arr[i].avgBuyPrice };
    return arr[i];
  },
  async deleteHolding(email, id)  { await this.ensureUser(email); const arr = mem.holdings.get(email); const i = arr.findIndex(h => h.id === id); if (i === -1) return false; arr.splice(i, 1); return true; },
  async importHoldings(email, holdings, mode) {
    await this.ensureUser(email);
    const norm = holdings.map(normHolding).filter(h => h.shares > 0 && Number.isFinite(h.avgBuyPrice));
    mem.holdings.set(email, mode === 'append' ? [...mem.holdings.get(email), ...norm] : norm);
    return [...mem.holdings.get(email)];
  },

  async getWatchlist(email)       { await this.ensureUser(email); return [...(mem.watch.get(email) || [])]; },
  async addWatch(email, data) {
    await this.ensureUser(email);
    const ticker = normalizeSymbol(data.ticker);
    const arr = mem.watch.get(email);
    const existing = arr.find(w => w.ticker === ticker);
    if (existing) { if (data.note != null) existing.note = data.note; if (data.targetPrice != null) existing.targetPrice = Number(data.targetPrice); return existing; }
    const item = { id: crypto.randomUUID(), ticker, note: data.note || '', targetPrice: data.targetPrice != null ? Number(data.targetPrice) : null, addedAt: new Date().toISOString() };
    arr.unshift(item); return item;
  },
  async updateWatch(email, id, data) {
    await this.ensureUser(email);
    const item = mem.watch.get(email).find(w => w.id === id); if (!item) return null;
    if (data.note !== undefined) item.note = data.note;
    if (data.targetPrice !== undefined) item.targetPrice = data.targetPrice != null ? Number(data.targetPrice) : null;
    return item;
  },
  async deleteWatch(email, id)    { await this.ensureUser(email); const arr = mem.watch.get(email); const i = arr.findIndex(w => w.id === id); if (i === -1) return false; arr.splice(i, 1); return true; },
};

// ─────────────────────────────────────────────────────────────────────────────
// Postgres backend
// ─────────────────────────────────────────────────────────────────────────────
let pool;
const pgBackend = {
  async init() {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY, name TEXT, picture TEXT, provider TEXT,
        password_hash TEXT, seeded BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS holdings (
        id UUID PRIMARY KEY, user_email TEXT NOT NULL, ticker TEXT NOT NULL,
        shares DOUBLE PRECISION NOT NULL, avg_buy_price DOUBLE PRECISION NOT NULL,
        purchase_date TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT now());
      CREATE INDEX IF NOT EXISTS holdings_user ON holdings(user_email);
      CREATE TABLE IF NOT EXISTS watchlist (
        id UUID PRIMARY KEY, user_email TEXT NOT NULL, ticker TEXT NOT NULL,
        note TEXT, target_price DOUBLE PRECISION, added_at TIMESTAMPTZ DEFAULT now());
      CREATE INDEX IF NOT EXISTS watchlist_user ON watchlist(user_email);
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY, user_email TEXT NOT NULL, holding_id TEXT, ticker TEXT NOT NULL,
        type TEXT NOT NULL, shares DOUBLE PRECISION, price DOUBLE PRECISION,
        realized DOUBLE PRECISION, tx_date TEXT, created_at TIMESTAMPTZ DEFAULT now());
      CREATE INDEX IF NOT EXISTS tx_user ON transactions(user_email, ticker);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_expires BIGINT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires BIGINT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_status TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_provider TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end BIGINT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS prefs JSONB DEFAULT '{}'::jsonb;`);
    await this.ensureUser(LOCAL_USER, { name: 'Local' });
  },
  async ensureUser(email, profile = {}) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!rows.length) {
      await pool.query('INSERT INTO users(email,name,picture,provider,password_hash,seeded,email_verified) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [email, profile.name || null, profile.picture || null, profile.provider || null, profile.passwordHash || null, isSeedUser(email), isSeedUser(email) || !!profile.emailVerified]);
      if (isSeedUser(email)) {
        await pool.query(`UPDATE users SET plan='pro', plan_status='active', prefs='{"dailyDigest":true}'::jsonb WHERE email=$1`, [email]);
        for (const s of SEED_HOLDINGS) { const h = normHolding(s);
          await pool.query('INSERT INTO holdings(id,user_email,ticker,shares,avg_buy_price,purchase_date,notes) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [h.id, email, h.ticker, h.shares, h.avgBuyPrice, h.purchaseDate, h.notes]); }
      }
      return (await pool.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
    }
    const u = rows[0], sets = [], vals = [];
    if (profile.name && !u.name)         { sets.push(`name=$${sets.length + 2}`); vals.push(profile.name); }
    if (profile.picture)                 { sets.push(`picture=$${sets.length + 2}`); vals.push(profile.picture); }
    if (profile.passwordHash)            { sets.push(`password_hash=$${sets.length + 2}`); vals.push(profile.passwordHash); }
    if (profile.provider && !u.provider) { sets.push(`provider=$${sets.length + 2}`); vals.push(profile.provider); }
    if (profile.emailVerified)           { sets.push(`email_verified=TRUE`); }
    if (sets.length) await pool.query(`UPDATE users SET ${sets.join(',')} WHERE email=$1`, [email, ...vals]);
    return u;
  },
  async getUser(email) { const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]); if (!rows.length) return null;
    const u = rows[0]; return { email: u.email, name: u.name, picture: u.picture, provider: u.provider, passwordHash: u.password_hash, emailVerified: u.email_verified, createdAt: u.created_at }; },

  async setVerifyToken(email, token, expires) { await this.ensureUser(email); await pool.query('UPDATE users SET verify_token=$1, verify_expires=$2 WHERE email=$3', [token, expires, email]); },
  async markVerified(email) { await this.ensureUser(email); await pool.query('UPDATE users SET email_verified=TRUE, verify_token=NULL WHERE email=$1', [email]); },
  async consumeVerifyToken(token) {
    const { rows } = await pool.query('SELECT email, verify_expires FROM users WHERE verify_token=$1', [token]);
    if (!rows.length || Number(rows[0].verify_expires) < Date.now()) return null;
    await pool.query('UPDATE users SET email_verified=TRUE, verify_token=NULL WHERE email=$1', [rows[0].email]);
    return { email: rows[0].email };
  },
  async setResetToken(email, token, expires) { const { rowCount } = await pool.query('UPDATE users SET reset_token=$1, reset_expires=$2 WHERE email=$3', [token, expires, email]); return rowCount > 0; },
  async consumeResetToken(token, passwordHash) {
    const { rows } = await pool.query('SELECT email, reset_expires FROM users WHERE reset_token=$1', [token]);
    if (!rows.length || Number(rows[0].reset_expires) < Date.now()) return null;
    await pool.query('UPDATE users SET password_hash=$1, reset_token=NULL, email_verified=TRUE WHERE email=$2', [passwordHash, rows[0].email]);
    return { email: rows[0].email };
  },

  async getSubscription(email) { await this.ensureUser(email);
    const { rows } = await pool.query('SELECT plan, plan_status, billing_provider, subscription_id, current_period_end FROM users WHERE email=$1', [email]);
    const u = rows[0] || {}; return { plan: u.plan || 'free', status: u.plan_status, provider: u.billing_provider, subscriptionId: u.subscription_id, currentPeriodEnd: u.current_period_end ? Number(u.current_period_end) : null }; },
  async setSubscription(email, sub) { await this.ensureUser(email);
    const map = { plan: 'plan', status: 'plan_status', provider: 'billing_provider', subscriptionId: 'subscription_id', currentPeriodEnd: 'current_period_end' };
    const sets = [], vals = [];
    for (const [k, col] of Object.entries(map)) if (sub[k] !== undefined) { sets.push(`${col}=$${sets.length + 2}`); vals.push(sub[k]); }
    if (sets.length) await pool.query(`UPDATE users SET ${sets.join(',')} WHERE email=$1`, [email, ...vals]);
    return this.getSubscription(email); },
  async findBySubscriptionId(subId) { const { rows } = await pool.query('SELECT email FROM users WHERE subscription_id=$1', [subId]); return rows.length ? rows[0].email : null; },

  async getProfile(email) { await this.ensureUser(email);
    const { rows } = await pool.query('SELECT email, name, phone, picture, provider, email_verified, password_hash, prefs, created_at FROM users WHERE email=$1', [email]);
    const u = rows[0] || {}; return { email: u.email, name: u.name, phone: u.phone || null, picture: u.picture, provider: u.provider, emailVerified: !!u.email_verified, hasPassword: !!u.password_hash, prefs: u.prefs || {}, createdAt: u.created_at }; },
  async updateProfile(email, data) { await this.ensureUser(email);
    const sets = [], vals = [];
    if (data.name    !== undefined) { sets.push(`name=$${sets.length + 2}`);    vals.push(data.name); }
    if (data.phone   !== undefined) { sets.push(`phone=$${sets.length + 2}`);   vals.push(data.phone); }
    if (data.picture !== undefined) { sets.push(`picture=$${sets.length + 2}`); vals.push(data.picture); }
    if (sets.length) await pool.query(`UPDATE users SET ${sets.join(',')} WHERE email=$1`, [email, ...vals]);
    return this.getProfile(email); },
  async setPassword(email, hash) { await this.ensureUser(email); await pool.query('UPDATE users SET password_hash=$1 WHERE email=$2', [hash, email]); return true; },
  async updatePrefs(email, patch) { await this.ensureUser(email);
    await pool.query('UPDATE users SET prefs = COALESCE(prefs, \'{}\'::jsonb) || $1::jsonb WHERE email=$2', [JSON.stringify(patch), email]);
    return (await pool.query('SELECT prefs FROM users WHERE email=$1', [email])).rows[0].prefs; },
  async getDigestRecipients() { const { rows } = await pool.query(`SELECT email FROM users WHERE (prefs->>'dailyDigest')::boolean IS TRUE`); return rows.map(r => r.email); },

  async addTransaction(email, tx) { const id = crypto.randomUUID();
    await pool.query('INSERT INTO transactions(id,user_email,holding_id,ticker,type,shares,price,realized,tx_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, email, tx.holdingId || null, tx.ticker, tx.type, tx.shares, tx.price, tx.realized ?? null, tx.date || null]);
    return { id, ...tx, createdAt: new Date().toISOString() }; },
  async getTransactions(email, ticker) {
    const { rows } = await pool.query('SELECT * FROM transactions WHERE user_email=$1 AND ($2::text IS NULL OR ticker=$2) ORDER BY created_at DESC LIMIT 50', [email, ticker || null]);
    return rows.map(r => ({ id: r.id, holdingId: r.holding_id, ticker: r.ticker, type: r.type, shares: Number(r.shares), price: Number(r.price), realized: r.realized != null ? Number(r.realized) : null, date: r.tx_date, createdAt: r.created_at })); },

  _mapH: (r) => ({ id: r.id, ticker: r.ticker, shares: Number(r.shares), avgBuyPrice: Number(r.avg_buy_price), purchaseDate: r.purchase_date, notes: r.notes, createdAt: r.created_at }),
  async getHoldings(email) { await this.ensureUser(email); const { rows } = await pool.query('SELECT * FROM holdings WHERE user_email=$1 ORDER BY created_at', [email]); return rows.map(this._mapH); },
  async addHolding(email, data) { await this.ensureUser(email); const h = normHolding(data);
    await pool.query('INSERT INTO holdings(id,user_email,ticker,shares,avg_buy_price,purchase_date,notes) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [h.id, email, h.ticker, h.shares, h.avgBuyPrice, h.purchaseDate, h.notes]); return h; },
  async updateHolding(email, id, data) {
    await this.ensureUser(email);
    const { rows } = await pool.query('SELECT * FROM holdings WHERE id=$1 AND user_email=$2', [id, email]);
    if (!rows.length) return null; const cur = this._mapH(rows[0]);
    const ticker = data.ticker ? normalizeSymbol(data.ticker) : cur.ticker;
    const shares = data.shares !== undefined ? Number(data.shares) : cur.shares;
    const price  = data.avgBuyPrice !== undefined ? Number(data.avgBuyPrice) : cur.avgBuyPrice;
    const notes  = data.notes !== undefined ? data.notes : cur.notes;
    await pool.query('UPDATE holdings SET ticker=$1,shares=$2,avg_buy_price=$3,notes=$4 WHERE id=$5 AND user_email=$6', [ticker, shares, price, notes, id, email]);
    return { ...cur, ticker, shares, avgBuyPrice: price, notes };
  },
  async deleteHolding(email, id) { const { rowCount } = await pool.query('DELETE FROM holdings WHERE id=$1 AND user_email=$2', [id, email]); return rowCount > 0; },
  async importHoldings(email, holdings, mode) {
    await this.ensureUser(email);
    const norm = holdings.map(normHolding).filter(h => h.shares > 0 && Number.isFinite(h.avgBuyPrice));
    if (mode !== 'append') await pool.query('DELETE FROM holdings WHERE user_email=$1', [email]);
    for (const h of norm) await pool.query('INSERT INTO holdings(id,user_email,ticker,shares,avg_buy_price,purchase_date,notes) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [h.id, email, h.ticker, h.shares, h.avgBuyPrice, h.purchaseDate, h.notes]);
    return this.getHoldings(email);
  },

  _mapW: (r) => ({ id: r.id, ticker: r.ticker, note: r.note, targetPrice: r.target_price != null ? Number(r.target_price) : null, addedAt: r.added_at }),
  async getWatchlist(email) { await this.ensureUser(email); const { rows } = await pool.query('SELECT * FROM watchlist WHERE user_email=$1 ORDER BY added_at DESC', [email]); return rows.map(this._mapW); },
  async addWatch(email, data) {
    await this.ensureUser(email); const ticker = normalizeSymbol(data.ticker);
    const { rows } = await pool.query('SELECT * FROM watchlist WHERE user_email=$1 AND ticker=$2', [email, ticker]);
    if (rows.length) { await pool.query('UPDATE watchlist SET note=COALESCE($1,note), target_price=COALESCE($2,target_price) WHERE id=$3',
      [data.note ?? null, data.targetPrice != null ? Number(data.targetPrice) : null, rows[0].id]);
      return this._mapW((await pool.query('SELECT * FROM watchlist WHERE id=$1', [rows[0].id])).rows[0]); }
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO watchlist(id,user_email,ticker,note,target_price) VALUES($1,$2,$3,$4,$5)',
      [id, email, ticker, data.note || '', data.targetPrice != null ? Number(data.targetPrice) : null]);
    return { id, ticker, note: data.note || '', targetPrice: data.targetPrice != null ? Number(data.targetPrice) : null, addedAt: new Date().toISOString() };
  },
  async updateWatch(email, id, data) {
    await this.ensureUser(email);
    const { rows } = await pool.query('SELECT * FROM watchlist WHERE id=$1 AND user_email=$2', [id, email]); if (!rows.length) return null;
    const note = data.note !== undefined ? data.note : rows[0].note;
    const tp   = data.targetPrice !== undefined ? (data.targetPrice != null ? Number(data.targetPrice) : null) : rows[0].target_price;
    await pool.query('UPDATE watchlist SET note=$1,target_price=$2 WHERE id=$3', [note, tp, id]);
    return this._mapW({ ...rows[0], note, target_price: tp });
  },
  async deleteWatch(email, id) { const { rowCount } = await pool.query('DELETE FROM watchlist WHERE id=$1 AND user_email=$2', [id, email]); return rowCount > 0; },
};

const backend = USE_PG ? pgBackend : memBackend;
let _ready;
function init() { _ready = _ready || backend.init().then(() => console.log(`🗄️  Data store: ${USE_PG ? 'Postgres (durable)' : 'in-memory (ephemeral)'}`)); return _ready; }

module.exports = new Proxy(backend, {
  get(t, p) {
    if (p === 'init') return init;
    if (p === 'OWNER_EMAIL') return OWNER_EMAIL;
    if (p === 'LOCAL_USER') return LOCAL_USER;
    if (p === 'isPostgres') return USE_PG;
    return t[p] ? t[p].bind(t) : undefined;
  },
});

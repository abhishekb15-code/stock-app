/**
 * chatLimiter.js — cheap spend guard for the AI chat.
 *
 * Caps how many assistant turns can run per day, both per-user and globally
 * (the global cap is the real backstop on API spend). Checked BEFORE any Claude
 * call, so an over-limit request costs nothing. Counters live in memory and
 * reset at UTC midnight (and on restart) — fine for a single-instance deploy;
 * the global cap means a restart can't meaningfully inflate the bill.
 *
 * Tune without code via env:
 *   CHAT_DAILY_LIMIT         per-user turns/day   (default 30; 0 = unlimited)
 *   CHAT_GLOBAL_DAILY_LIMIT  total turns/day      (default 300; 0 = unlimited)
 */

const PER_USER = parseInt(process.env.CHAT_DAILY_LIMIT ?? '30', 10);
const GLOBAL   = parseInt(process.env.CHAT_GLOBAL_DAILY_LIMIT ?? '300', 10);

let day         = utcDay();
let perUser     = new Map();   // email -> count today
let globalCount = 0;

function utcDay() { return new Date().toISOString().slice(0, 10); }   // YYYY-MM-DD (UTC)

function rollover() {
  const d = utcDay();
  if (d !== day) { day = d; perUser = new Map(); globalCount = 0; }
}

// Can this user run a turn right now? (does not consume)
function check(email) {
  rollover();
  const used = perUser.get(email) || 0;
  if (GLOBAL   > 0 && globalCount >= GLOBAL)  return { ok: false, scope: 'global', limit: GLOBAL };
  if (PER_USER > 0 && used        >= PER_USER) return { ok: false, scope: 'user', limit: PER_USER, used };
  return { ok: true, remaining: PER_USER > 0 ? PER_USER - used : null };
}

// Consume one turn for this user.
function record(email) {
  rollover();
  perUser.set(email, (perUser.get(email) || 0) + 1);
  globalCount += 1;
}

// For /status — how many the user has left today.
function status(email) {
  rollover();
  const used = perUser.get(email) || 0;
  return {
    dailyLimit: PER_USER > 0 ? PER_USER : null,
    remaining:  PER_USER > 0 ? Math.max(0, PER_USER - used) : null,
  };
}

module.exports = { check, record, status };

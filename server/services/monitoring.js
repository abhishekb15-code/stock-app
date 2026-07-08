/**
 * monitoring.js — optional Sentry error tracking.
 *
 * Activates only when SENTRY_DSN is set, so local/dev and un-configured
 * deploys are unaffected. Everything is a safe no-op without a DSN.
 */

let Sentry = null;
let enabled = false;

function init() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || (process.env.RENDER ? 'production' : 'development'),
      tracesSampleRate: 0,          // errors only; no perf tracing (keeps cost/quota low)
      sendDefaultPii: false,        // don't ship request bodies / headers by default
    });
    enabled = true;
    console.log('🛰️  Sentry error tracking enabled');
  } catch (e) {
    console.warn('Sentry init failed:', e.message);
  }
  return enabled;
}

// Report an error (no-op unless Sentry is configured).
function capture(err, context) {
  if (!enabled || !Sentry) return;
  try { Sentry.captureException(err, context ? { extra: context } : undefined); } catch { /* ignore */ }
}

const isEnabled = () => enabled;

module.exports = { init, capture, isEnabled };

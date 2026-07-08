/**
 * validate.js — fail-fast config check at boot.
 *
 * In production, a half-configured deploy is worse than a loud failure. This
 * prints a clear summary and HARD-FAILS on config that is guaranteed broken
 * (e.g. a payment provider with a partial key set — which would silently drop
 * upgrades). Non-fatal gaps are warnings so a deploy is never bricked over
 * an optional feature.
 */

function validateConfig() {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  const warnings = [];
  const fatals = [];

  // ── Auth ───────────────────────────────────────────────────────────────────
  if (!process.env.JWT_SECRET) {
    (isProd ? fatals : warnings).push(
      'JWT_SECRET is not set — authentication is DISABLED and the app is fully open. Set a long random JWT_SECRET.');
  }

  // ── Durable storage ──────────────────────────────────────────────────────────
  if (isProd && !process.env.DATABASE_URL) {
    warnings.push('DATABASE_URL is not set — using in-memory storage. All user data is LOST on every restart. Set a Postgres URL before real customers.');
  }

  // ── Billing: catch partial provider config that guarantees broken upgrades ───
  const rzpId = process.env.RAZORPAY_KEY_ID, rzpSecret = process.env.RAZORPAY_KEY_SECRET;
  if (rzpId || rzpSecret) {
    if (!rzpId || !rzpSecret) fatals.push('Razorpay is half-configured: set BOTH RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (or neither).');
    if (rzpId && rzpSecret && !process.env.RAZORPAY_WEBHOOK_SECRET) fatals.push('RAZORPAY_WEBHOOK_SECRET is missing — webhooks are rejected (anti-fraud), so no upgrade will ever register. Set it.');
    if (rzpId && rzpSecret && (!process.env.RAZORPAY_PLAN_MONTHLY || !process.env.RAZORPAY_PLAN_ANNUAL))
      warnings.push('RAZORPAY_PLAN_MONTHLY / RAZORPAY_PLAN_ANNUAL not both set — that plan\'s checkout will error.');
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && !process.env.STRIPE_WEBHOOK_SECRET)
    fatals.push('STRIPE_WEBHOOK_SECRET is missing — Stripe webhooks are rejected, so no upgrade will register. Set it.');

  // ── Optional features (informational) ────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) warnings.push('ANTHROPIC_API_KEY not set — AI Analyst chat + pre-market narrative are disabled.');
  if (isProd && !process.env.APP_BASE_URL) warnings.push('APP_BASE_URL not set — email links and CORS fall back to request headers. Set it to your canonical https URL.');

  // ── Report ───────────────────────────────────────────────────────────────────
  if (warnings.length) {
    console.warn('\n⚠️  Config warnings:');
    warnings.forEach(w => console.warn('   • ' + w));
  }
  if (fatals.length) {
    console.error('\n❌ Fatal config errors — refusing to start:');
    fatals.forEach(f => console.error('   • ' + f));
    console.error('');
    process.exit(1);
  }
  if (!warnings.length) console.log('✅ Config check passed');
}

module.exports = { validateConfig };

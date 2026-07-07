/**
 * billingService.js — provider-agnostic subscriptions
 *
 * Free vs Pro gating with a pluggable payment provider:
 *   - Stripe   when STRIPE_SECRET_KEY is set
 *   - Razorpay when RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set
 *   - Mock     when BILLING_ENABLED=1 and no real provider (for testing the flow)
 *   - Disabled otherwise → everything is unlocked (no paywall), so deploying this
 *     changes nothing until a provider (or BILLING_ENABLED) is configured.
 *
 * Real-provider adapters are implemented against each provider's REST API but
 * can only be exercised once you add live/test keys (and the provider's plan/price
 * IDs + a webhook secret). The mock provider exercises the whole UX end to end now.
 */

const https  = require('https');
const crypto  = require('crypto');
const store   = require('./store');

const num = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;

// Prices are display values (configure via env); change freely.
const PLANS = {
  free:        { id: 'free',        name: 'Free',        amount: 0,                                    interval: null,    currency: 'INR' },
  pro_monthly: { id: 'pro_monthly', name: 'Pro · Monthly', amount: num(process.env.PRICE_PRO_MONTHLY_INR, 499),  interval: 'month', currency: 'INR' },
  pro_annual:  { id: 'pro_annual',  name: 'Pro · Annual',  amount: num(process.env.PRICE_PRO_ANNUAL_INR, 4999),  interval: 'year',  currency: 'INR' },
};
const PRO_PLANS = ['pro_monthly', 'pro_annual'];

function activeProvider() {
  if (process.env.STRIPE_SECRET_KEY) return 'stripe';
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return 'razorpay';
  if (process.env.BILLING_ENABLED) return 'mock';
  return null;
}
const billingEnabled = () => activeProvider() != null;

async function getPlan(email) {
  if (!billingEnabled()) return { plan: 'pro', status: 'active', unlimited: true };   // no paywall
  const s = await store.getSubscription(email);
  const active = s.plan === 'pro' && (!s.currentPeriodEnd || s.currentPeriodEnd > Date.now());
  return { plan: active ? 'pro' : 'free', status: s.status, currentPeriodEnd: s.currentPeriodEnd, provider: s.provider };
}
async function isPro(email) { return (await getPlan(email)).plan === 'pro'; }

// Middleware — blocks Pro-only routes for free users (when billing is enabled).
function requirePro(req, res, next) {
  if (!billingEnabled()) return next();
  const email = ((req.user && req.user.email) || 'local@local').toLowerCase();
  isPro(email).then(ok => ok ? next()
    : res.status(402).json({ error: 'This feature is part of Stock Intel Pro', code: 'upgrade_required' }))
    .catch(e => res.status(500).json({ error: e.message }));
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
function httpsRequest(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : {} }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Stripe ───────────────────────────────────────────────────────────────────
const STRIPE_PRICE = { pro_monthly: process.env.STRIPE_PRICE_MONTHLY, pro_annual: process.env.STRIPE_PRICE_ANNUAL };
async function stripeCheckout({ email, planId, baseUrl }) {
  const price = STRIPE_PRICE[planId];
  if (!price) throw new Error(`Set STRIPE_PRICE_${planId === 'pro_annual' ? 'ANNUAL' : 'MONTHLY'} to the Stripe price ID`);
  const form = new URLSearchParams({
    mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': '1',
    success_url: `${baseUrl}/pricing?upgraded=1`, cancel_url: `${baseUrl}/pricing?canceled=1`,
    customer_email: email, 'metadata[email]': email, 'subscription_data[metadata][email]': email,
  }).toString();
  const res = await httpsRequest('POST', 'https://api.stripe.com/v1/checkout/sessions',
    { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) }, form);
  if (res.status >= 300) throw new Error(res.body?.error?.message || 'Stripe checkout failed');
  return { url: res.body.url };
}
function stripeVerify(req) {
  const sig = req.headers['stripe-signature'] || '';
  const parts = Object.fromEntries(sig.split(',').map(p => p.split('=')));
  const signed = `${parts.t}.${req.rawBody}`;
  const expected = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(signed).digest('hex');
  return parts.v1 && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}
async function stripeWebhook(req) {
  // Fail closed: never process an unverified webhook. A missing secret would
  // otherwise let anyone forge a "paid" event and unlock Pro for free.
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  if (!stripeVerify(req)) throw new Error('bad signature');
  const evt = JSON.parse(req.rawBody);
  const obj = evt.data?.object || {};
  let email = (obj.metadata?.email || obj.customer_email || '').toLowerCase();
  if (!email && obj.subscription) email = (await store.findBySubscriptionId(obj.subscription)) || '';
  if (!email) return;
  if (evt.type === 'checkout.session.completed' || evt.type === 'customer.subscription.updated') {
    const active = evt.type === 'checkout.session.completed' || obj.status === 'active' || obj.status === 'trialing';
    await store.setSubscription(email, { plan: active ? 'pro' : 'free', status: obj.status || 'active', provider: 'stripe',
      subscriptionId: obj.subscription || obj.id, currentPeriodEnd: obj.current_period_end ? obj.current_period_end * 1000 : null });
  } else if (evt.type === 'customer.subscription.deleted') {
    await store.setSubscription(email, { plan: 'free', status: 'canceled' });
  }
}

// ── Razorpay ─────────────────────────────────────────────────────────────────
const RZP_PLAN = { pro_monthly: process.env.RAZORPAY_PLAN_MONTHLY, pro_annual: process.env.RAZORPAY_PLAN_ANNUAL };
const rzpAuth = () => 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
async function razorpayCheckout({ email, planId }) {
  const plan_id = RZP_PLAN[planId];
  if (!plan_id) throw new Error(`Set RAZORPAY_PLAN_${planId === 'pro_annual' ? 'ANNUAL' : 'MONTHLY'} to the Razorpay plan ID`);
  const body = JSON.stringify({ plan_id, total_count: planId === 'pro_annual' ? 10 : 120, customer_notify: 1, notes: { email } });
  const res = await httpsRequest('POST', 'https://api.razorpay.com/v1/subscriptions',
    { 'Authorization': rzpAuth(), 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, body);
  if (res.status >= 300) throw new Error(res.body?.error?.description || 'Razorpay subscription failed');
  return { url: res.body.short_url, subscriptionId: res.body.id };
}
function razorpayVerify(req) {
  const sig = req.headers['x-razorpay-signature'] || '';
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(req.rawBody).digest('hex');
  return sig && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
async function razorpayWebhook(req) {
  // Fail closed: never process an unverified webhook. A missing secret would
  // otherwise let anyone forge a "charged" event and unlock Pro for free.
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) throw new Error('RAZORPAY_WEBHOOK_SECRET not configured');
  if (!razorpayVerify(req)) throw new Error('bad signature');
  const evt = JSON.parse(req.rawBody);
  const sub = evt.payload?.subscription?.entity;
  if (!sub) return;
  // Prefer the email we stamped in notes at checkout; fall back to the stored
  // subscription_id → email mapping if notes are missing on this event.
  let email = (sub.notes?.email || '').toLowerCase();
  if (!email && sub.id) email = (await store.findBySubscriptionId(sub.id)) || '';
  if (!email) return;
  // setSubscription is a last-writer state set, so replayed/duplicate webhooks
  // (Razorpay retries) are naturally idempotent — same event → same state.
  if (['subscription.charged', 'subscription.activated', 'subscription.resumed'].includes(evt.event)) {
    await store.setSubscription(email, { plan: 'pro', status: 'active', provider: 'razorpay',
      subscriptionId: sub.id, currentPeriodEnd: sub.current_end ? sub.current_end * 1000 : null });
  } else if (['subscription.cancelled', 'subscription.halted', 'subscription.completed'].includes(evt.event)) {
    await store.setSubscription(email, { plan: 'free', status: evt.event.split('.')[1] });
  }
}

// ── Mock (testing) ───────────────────────────────────────────────────────────
async function mockCheckout({ email, planId }) {
  const plan = PLANS[planId];
  const days = plan.interval === 'year' ? 365 : 30;
  await store.setSubscription(email, { plan: 'pro', status: 'active', provider: 'mock',
    subscriptionId: 'mock_' + Date.now(), currentPeriodEnd: Date.now() + days * 86400000 });
  return { mode: 'mock', url: '/pricing?upgraded=1' };
}

// ── Public API ────────────────────────────────────────────────────────────────
async function createCheckout({ email, planId, baseUrl }) {
  if (!PRO_PLANS.includes(planId)) throw new Error('Invalid plan');
  const provider = activeProvider();
  if (provider === 'stripe')   return stripeCheckout({ email, planId, baseUrl });
  if (provider === 'razorpay') return razorpayCheckout({ email, planId, baseUrl });
  if (provider === 'mock')     return mockCheckout({ email, planId });
  throw new Error('Billing is not configured');
}
async function handleWebhook(provider, req) {
  if (provider === 'stripe')   return stripeWebhook(req);
  if (provider === 'razorpay') return razorpayWebhook(req);
}
async function cancel(email) {
  // Note: also cancel at the provider via their dashboard/API for a real refundless stop.
  await store.setSubscription(email, { plan: 'free', status: 'canceled' });
  return getPlan(email);
}

function publicPlans() {
  return PRO_PLANS.map(id => ({ ...PLANS[id] }));
}

module.exports = { PLANS, publicPlans, activeProvider, billingEnabled, getPlan, isPro, requirePro, createCheckout, handleWebhook, cancel };

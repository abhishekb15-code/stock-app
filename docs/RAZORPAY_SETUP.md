# Razorpay Go-Live Checklist — Stock Intel Pro

Turn on real subscription payments. Do the steps **in order**. Test in Test Mode first, then repeat 3 env values with Live keys.

The code is already built for this — you're only creating Razorpay objects and setting env vars on Render. No code changes needed.

---

## 0. Prerequisites (once)

- [ ] A Razorpay account → https://dashboard.razorpay.com
- [ ] **KYC / business verification complete** — Razorpay will not issue **Live** keys or activate subscriptions until this passes. Test Mode works immediately.
- [ ] The 4 legal pages are **live and reachable** on your domain (Razorpay checks these during activation):
      `/privacy`, `/terms`, `/refund`, `/contact` — already built; just fill the `[BRACKETED]` placeholders in `client/src/pages/Legal.js` and redeploy.

---

## 1. Create the two Plans (Razorpay Dashboard)

Dashboard → **Subscriptions → Plans → Create Plan**. Make **two**:

| Plan | Billing cycle | Amount | Notes |
|---|---|---|---|
| Pro Monthly | Monthly | ₹499 | Interval = 1 month |
| Pro Annual | Yearly | ₹4999 | Interval = 1 year |

After creating each, **copy its Plan ID** — looks like `plan_XXXXXXXXXXXXXX`.

> Amounts here are what Razorpay actually charges. The numbers shown on your Pricing page come from `PRICE_PRO_MONTHLY_INR` / `PRICE_PRO_ANNUAL_INR` (defaults 499 / 4999) — keep them in sync.

---

## 2. Get your API keys

Dashboard → **Settings → API Keys → Generate Key**.
- [ ] Copy **Key ID** (`rzp_test_...` in Test Mode, `rzp_live_...` in Live).
- [ ] Copy **Key Secret** (shown once — save it now).

---

## 3. Create the webhook

Dashboard → **Settings → Webhooks → Add New Webhook**.

- [ ] **Webhook URL:**
      ```
      https://stock-intelligence-jttc.onrender.com/api/billing/webhook/razorpay
      ```
      (swap in your custom domain if you have one)
- [ ] **Secret:** type any strong random string (e.g. `openssl rand -hex 24`). **Save this — it becomes `RAZORPAY_WEBHOOK_SECRET`.**
- [ ] **Active events** — tick exactly these:
  - `subscription.activated`
  - `subscription.charged`
  - `subscription.resumed`
  - `subscription.cancelled`
  - `subscription.halted`
  - `subscription.completed`

> ⚠️ Without the webhook secret set on Render, the endpoint **rejects every webhook by design** (anti-fraud, SEC-01). No secret = no upgrades will register. This is intentional.

---

## 4. Set env vars on Render

Render Dashboard → your service → **Environment** → add these 5 (+ optional 2):

| Key | Value | Required |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_test_...` / `rzp_live_...` | ✅ |
| `RAZORPAY_KEY_SECRET` | key secret from step 2 | ✅ |
| `RAZORPAY_PLAN_MONTHLY` | `plan_...` (monthly) from step 1 | ✅ |
| `RAZORPAY_PLAN_ANNUAL` | `plan_...` (annual) from step 1 | ✅ |
| `RAZORPAY_WEBHOOK_SECRET` | secret from step 3 | ✅ |
| `PRICE_PRO_MONTHLY_INR` | `499` | optional (display) |
| `PRICE_PRO_ANNUAL_INR` | `4999` | optional (display) |

Save → Render auto-redeploys.

> Setting `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` **automatically flips billing ON** and the paywall starts gating Pro features. There's no separate toggle. (If both Stripe and Razorpay keys are set, Stripe wins — don't set Stripe keys.)

---

## 5. Verify (Test Mode dry run)

- [ ] `GET https://<your-app>/api/health` → `"billingEnabled": true`
- [ ] Open the app → **Pricing** → "Upgrade to Pro" → you land on Razorpay's hosted checkout.
- [ ] Pay with a **Razorpay test card** (from their docs, e.g. a test success card + any future expiry + any CVV).
- [ ] Within a few seconds the webhook fires → your account shows **Pro** (Dashboard → Profile → Plan, or the ✓ on Pricing).
- [ ] Dashboard → **Webhooks → your webhook → Recent Deliveries** shows `200 OK` for `subscription.charged`.
- [ ] **Cancel test:** Pricing → "Cancel subscription" → confirm → plan returns to Free at period end.

If the webhook shows non-200: check the secret matches exactly, and that all 5 env vars are set with no trailing spaces.

---

## 6. Go Live

- [ ] Repeat step 1 (Plans) and step 2 (Keys) in **Live Mode** — Test and Live objects are separate.
- [ ] Recreate the webhook in Live Mode (step 3) with a fresh secret.
- [ ] Update the 5 env vars on Render with the **Live** values (`rzp_live_...`, live plan IDs, live webhook secret).
- [ ] Do **one real ₹499 transaction** yourself end-to-end, confirm Pro unlocks, then cancel/refund it from the Razorpay dashboard.

---

## How it works (for reference)

- **Checkout:** Pricing page → `POST /api/billing/checkout {planId}` → server creates a Razorpay subscription, returns its `short_url` → browser redirects to Razorpay's hosted page. Your email is stamped in the subscription `notes`.
- **Activation:** Razorpay charges the customer → sends `subscription.charged` webhook → server verifies the signature → sets your plan to Pro (with `current_period_end`). The app reflects Pro on next load / `/api/billing/me`.
- **Gating:** `requirePro` middleware returns HTTP 402 on Pro-only routes for Free users. Currently Pro-gated: `/api/analysis`, `/api/chat`, `/api/signals`, `/api/superinvestors`, `/api/indian-investors`.
- **Cancel:** Pricing → Cancel → `POST /api/billing/cancel` sets plan to Free. **Also cancel at the Razorpay end** for a hard stop — either from the customer's Razorpay flow or your dashboard/API — otherwise Razorpay may keep attempting charges.

## Known limitation to revisit (post-launch)

`/api/billing/cancel` flips *our* record to Free but does **not** call Razorpay's cancel API. For launch this is acceptable (you also cancel from the dashboard), but wiring a real `POST /v1/subscriptions/{id}/cancel` call is a good P1 follow-up so cancellation is fully self-serve.

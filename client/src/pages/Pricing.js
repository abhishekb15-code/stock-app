import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { canPurchaseInApp } from '../native';
import { Check, Sparkles, Crown } from 'lucide-react';
import { useAuth } from '../AuthContext';

const FREE_FEATURES = ['Live portfolio & P&L', 'Today’s P&L', 'Watchlist with price targets', 'Stock search & overview'];
const PRO_FEATURES  = ['Everything in Free', 'All 6 analysis tabs (Earnings, Financials, Competitive, Sector, Report)', 'Ace Investors (US 13F + India)', 'Smart-money volume signals', 'Priority data refresh'];

export default function Pricing() {
  const { plan } = useAuth();
  const [billing, setBilling] = useState(null);
  const [cycle, setCycle] = useState('pro_annual');   // default to the better-value annual
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const params = new URLSearchParams(window.location.search);
  const justUpgraded = params.get('upgraded') === '1';

  useEffect(() => { axios.get('/api/billing/me').then(r => setBilling(r.data)).catch(() => {}); }, []);

  const price = (id) => billing?.plans?.find(p => p.id === id);
  const monthly = price('pro_monthly');
  const annual  = price('pro_annual');
  const annualPerMonth = annual ? Math.round(annual.amount / 12) : null;
  const savePct = (monthly && annual) ? Math.round((1 - (annual.amount / (monthly.amount * 12))) * 100) : 0;

  const upgrade = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await axios.post('/api/billing/checkout', { planId: cycle });
      if (data.url) window.location.href = data.url;      // provider checkout or mock success page
      else window.location.reload();
    } catch (e) { setError(e.response?.data?.error || 'Could not start checkout.'); setBusy(false); }
  };

  const cancelSub = async () => {
    if (!window.confirm('Cancel Pro? You keep Pro access until the end of your current billing period, then move to Free.')) return;
    setBusy(true); setError('');
    try { await axios.post('/api/billing/cancel'); window.location.reload(); }
    catch (e) { setError(e.response?.data?.error || 'Could not cancel. Email support and we\'ll sort it out.'); setBusy(false); }
  };

  const isPro = plan === 'pro';

  return (
    <div className="fade-in" style={{ maxWidth: 880, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Crown size={22} color="var(--blue)" /> Choose your plan
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>Start free. Upgrade when you want the full analysis suite.</p>
      </div>

      {justUpgraded && (
        <div style={{ background: '#052e16', border: '1px solid #166534', color: '#4ade80', borderRadius: 10, padding: '12px 18px', textAlign: 'center', margin: '16px auto', maxWidth: 480 }}>
          🎉 You’re on Pro — enjoy the full suite!
        </div>
      )}
      {error && <div style={{ color: 'var(--red)', textAlign: 'center', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {/* Billing cycle toggle */}
      {!isPro && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, marginTop: 18 }}>
          <div style={{ display: 'inline-flex', background: 'var(--bg-800)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
            {[['pro_monthly', 'Monthly'], ['pro_annual', `Annual${savePct > 0 ? ` · save ${savePct}%` : ''}`]].map(([id, label]) => (
              <button key={id} onClick={() => setCycle(id)}
                style={{ border: 'none', cursor: 'pointer', borderRadius: 7, padding: '8px 18px', fontSize: 13, fontWeight: 700,
                  background: cycle === id ? 'var(--blue)' : 'transparent', color: cycle === id ? '#fff' : 'var(--text-secondary)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Free */}
        <div className="card" style={{ padding: 28, opacity: isPro ? 0.7 : 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Free</div>
          <div style={{ fontSize: 34, fontWeight: 900, margin: '10px 0 4px' }}>₹0</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>forever</div>
          {FREE_FEATURES.map(f => (
            <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
              <Check size={15} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} /> {f}
            </div>
          ))}
          <div style={{ marginTop: 18, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>{!isPro ? 'Your current plan' : ''}</div>
        </div>

        {/* Pro */}
        <div className="card" style={{ padding: 28, border: '1px solid var(--blue)', position: 'relative', boxShadow: '0 0 0 1px var(--blue)' }}>
          <div style={{ position: 'absolute', top: -11, right: 20, background: 'var(--blue)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 6 }}>RECOMMENDED</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} /> Pro
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, margin: '10px 0 4px' }}>
            ₹{cycle === 'pro_annual' && annualPerMonth != null ? annualPerMonth : (monthly?.amount ?? '—')}
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>/mo</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
            {cycle === 'pro_annual' && annual ? `Billed ₹${annual.amount}/year` : 'Billed monthly'}
          </div>
          {PRO_FEATURES.map(f => (
            <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, fontSize: 13, color: 'var(--text-primary)' }}>
              <Check size={15} color="var(--blue)" style={{ flexShrink: 0, marginTop: 1 }} /> {f}
            </div>
          ))}
          {isPro ? (
            <div style={{ marginTop: 18, textAlign: 'center' }}>
              <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>✓ You’re on Pro</div>
              {billing?.billingEnabled && (
                <button className="btn btn-ghost" onClick={cancelSub} disabled={busy} style={{ fontSize: 12.5 }}>
                  {busy ? 'Working…' : 'Cancel subscription'}
                </button>
              )}
            </div>
          ) : canPurchaseInApp() ? (
            <button className="btn btn-primary" onClick={upgrade} disabled={busy || !billing?.billingEnabled}
              style={{ width: '100%', justifyContent: 'center', marginTop: 18 }}>
              <Sparkles size={14} /> {busy ? 'Starting…' : billing?.billingEnabled ? 'Upgrade to Pro' : 'Coming soon'}
            </button>
          ) : (
            // Native app (reader-app rule): no in-app purchase. Direct to web.
            <div style={{ marginTop: 18, textAlign: 'center', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              To upgrade to Pro, visit <b>Stock Intel</b> in your web browser and sign in with this account.
            </div>
          )}
          {billing && !billing.billingEnabled && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 10 }}>Payments aren’t enabled on this server yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

import React from 'react';

/**
 * Public legal pages (Privacy, Terms, Refund, Contact) + a site-wide SEBI
 * disclaimer. Rendered at /privacy /terms /refund /contact — reachable WITHOUT
 * login (see App.js). These are commercial-launch templates: fill the
 * [BRACKETED] placeholders and have a lawyer review before you go live.
 */

// ⚠️ FILL THESE IN before launch.
const CO = {
  name:    '[Your Legal Business Name]',       // e.g. "Niveshak Technologies Pvt Ltd" or your own name if sole proprietor
  email:   '[support@yourdomain.com]',
  phone:   '[+91-XXXXXXXXXX]',
  address: '[Registered address, City, State, PIN, India]',
  site:    'Stock Intel',
  updated: 'July 2026',
};

const wrap = {
  maxWidth: 820, margin: '0 auto', padding: '48px 24px 80px',
  color: 'var(--text-primary)', lineHeight: 1.7, fontSize: 15,
};
const h1 = { fontSize: 28, fontWeight: 800, marginBottom: 6 };
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 8px' };
const muted = { color: 'var(--text-muted)', fontSize: 12.5 };
const p = { margin: '0 0 12px', color: 'var(--text-secondary)' };

function Shell({ title, children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-900)' }}>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
        <a href="/" style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>← {CO.site}</a>
      </div>
      <div style={wrap}>
        <h1 style={h1}>{title}</h1>
        <div style={muted}>Last updated: {CO.updated}</div>
        <div style={{ marginTop: 24 }}>{children}</div>
        <div style={{ marginTop: 48, paddingTop: 20, borderTop: '1px solid var(--border)', ...muted }}>
          {CO.name} · <a href="/privacy" style={{ color: 'var(--blue)' }}>Privacy</a> · <a href="/terms" style={{ color: 'var(--blue)' }}>Terms</a> · <a href="/refund" style={{ color: 'var(--blue)' }}>Refunds</a> · <a href="/contact" style={{ color: 'var(--blue)' }}>Contact</a>
        </div>
      </div>
    </div>
  );
}

const Disclaimer = () => (
  <div style={{ background: '#f59e0b18', border: '1px solid #f59e0b55', borderRadius: 10, padding: '12px 16px', margin: '0 0 20px', fontSize: 13.5, color: 'var(--text-primary)' }}>
    <b>Not investment advice.</b> {CO.site} is an educational and analytical tool. It is <b>not</b> a SEBI-registered
    investment adviser or research analyst. Nothing here is a recommendation to buy or sell any security. Markets carry risk;
    do your own research and consult a SEBI-registered adviser before investing.
  </div>
);

function Privacy() {
  return (
    <Shell title="Privacy Policy">
      <Disclaimer />
      <p style={p}>This policy explains what {CO.name} ("we") collects when you use {CO.site}, why, and your rights under India's Digital Personal Data Protection Act, 2023 (DPDP).</p>

      <h2 style={h2}>1. What we collect</h2>
      <p style={p}>• <b>Account data</b> — your email, name, and (optionally) phone number and profile photo.<br />
      • <b>Portfolio data</b> — the stock holdings, trades, and watchlist tickers you add. This stays private to your account.<br />
      • <b>Usage data</b> — basic logs (requests, errors) to run and secure the service.<br />
      • <b>Payment data</b> — handled entirely by our payment processor (Razorpay). We never see or store your card/UPI details.</p>

      <h2 style={h2}>2. Why we use it</h2>
      <p style={p}>To provide the service (show your portfolio, run analyses), authenticate you, process subscriptions, send transactional emails (verification, digests you opt into), and comply with law. We do <b>not</b> sell your personal data.</p>

      <h2 style={h2}>3. Third parties we share with</h2>
      <p style={p}>• <b>Yahoo Finance</b> — market data (we send stock symbols, not your identity).<br />
      • <b>Anthropic (Claude)</b> — powers the AI analyst; your questions are sent to generate answers.<br />
      • <b>Google</b> — only if you choose Google Sign-In.<br />
      • <b>Razorpay</b> — subscription payments.<br />
      • <b>Render / Neon</b> — hosting and database.</p>

      <h2 style={h2}>4. Data retention</h2>
      <p style={p}>We keep your data while your account is active. Delete your account any time from Profile → Delete Account, which permanently erases your holdings, watchlist, trades, and profile.</p>

      <h2 style={h2}>5. Your rights (DPDP)</h2>
      <p style={p}>You can access, correct, export, or delete your data. Export: Profile → Download my data. Delete: Profile → Delete Account. For any request, email {CO.email}.</p>

      <h2 style={h2}>6. Security</h2>
      <p style={p}>Passwords are hashed (scrypt), sessions use signed HTTP-only cookies over HTTPS, and data is scoped per user. No system is perfectly secure, but we apply reasonable safeguards.</p>

      <h2 style={h2}>7. Contact</h2>
      <p style={p}>Questions or grievances: {CO.email}, {CO.phone}, {CO.address}.</p>
    </Shell>
  );
}

function Terms() {
  return (
    <Shell title="Terms of Service">
      <Disclaimer />
      <p style={p}>By using {CO.site} you agree to these terms.</p>

      <h2 style={h2}>1. The service</h2>
      <p style={p}>{CO.site} provides portfolio tracking, market data, and AI-assisted analysis for Indian equities. It is an educational tool, not financial, investment, legal, or tax advice.</p>

      <h2 style={h2}>2. No investment advice</h2>
      <p style={p}>We are not a SEBI-registered investment adviser or research analyst. Any signal, score, valuation, or AI output is informational only. You are solely responsible for your investment decisions and their outcomes.</p>

      <h2 style={h2}>3. Market data</h2>
      <p style={p}>Prices and fundamentals come from third-party sources and may be delayed, incomplete, or inaccurate. Do not rely on them for real-time trading.</p>

      <h2 style={h2}>4. Your account</h2>
      <p style={p}>Keep your credentials secure; you are responsible for activity under your account. Provide accurate information. We may suspend accounts that abuse the service or violate these terms.</p>

      <h2 style={h2}>5. Subscriptions</h2>
      <p style={p}>Pro is a paid subscription billed via Razorpay on a monthly or annual basis, auto-renewing until cancelled. Cancel any time from your account; see our <a href="/refund" style={{ color: 'var(--blue)' }}>Refund &amp; Cancellation Policy</a>.</p>

      <h2 style={h2}>6. Acceptable use</h2>
      <p style={p}>Don't scrape, resell, reverse-engineer, or overload the service, or use it unlawfully.</p>

      <h2 style={h2}>7. Liability</h2>
      <p style={p}>The service is provided "as is" without warranties. To the extent permitted by law, {CO.name} is not liable for any trading losses or damages arising from use of the service.</p>

      <h2 style={h2}>8. Changes &amp; governing law</h2>
      <p style={p}>We may update these terms; continued use means acceptance. These terms are governed by the laws of India, with jurisdiction in [Your City], India.</p>

      <h2 style={h2}>9. Contact</h2>
      <p style={p}>{CO.email}</p>
    </Shell>
  );
}

function Refund() {
  return (
    <Shell title="Refund & Cancellation Policy">
      <p style={p}>This policy covers {CO.site} Pro subscriptions purchased through Razorpay.</p>

      <h2 style={h2}>Cancellation</h2>
      <p style={p}>You can cancel your Pro subscription any time from Pricing → Manage / Cancel, or by emailing {CO.email}. On cancellation, your plan stays active until the end of the current billing period, then reverts to Free. No further charges are made after cancellation.</p>

      <h2 style={h2}>Refunds</h2>
      <p style={p}>• We offer a <b>[7]-day refund</b> on your <b>first</b> subscription payment if you're not satisfied — email {CO.email} within [7] days of the charge.<br />
      • Renewal charges are <b>non-refundable</b>, but you can cancel before a renewal to avoid the next charge.<br />
      • Approved refunds are processed to the original payment method within 5–7 business days via Razorpay.</p>

      <h2 style={h2}>Contact</h2>
      <p style={p}>{CO.email}, {CO.phone}</p>
      <p style={{ ...muted, marginTop: 16 }}>Adjust the bracketed refund window to your actual policy before launch.</p>
    </Shell>
  );
}

function Contact() {
  return (
    <Shell title="Contact Us">
      <p style={p}>We'd love to hear from you.</p>
      <h2 style={h2}>Support &amp; grievances</h2>
      <p style={p}>Email: {CO.email}<br />Phone: {CO.phone}<br />Address: {CO.address}</p>
      <p style={p}>For data-privacy requests (access, export, deletion), email {CO.email} with the subject "Data Request".</p>
    </Shell>
  );
}

export default function Legal({ page }) {
  if (page === 'terms')   return <Terms />;
  if (page === 'refund')  return <Refund />;
  if (page === 'contact') return <Contact />;
  return <Privacy />;
}

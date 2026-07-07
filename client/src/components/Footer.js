import React from 'react';

// Site-wide footer: SEBI disclaimer (required for a market tool) + legal links.
export default function Footer() {
  return (
    <footer style={{ marginTop: 40, paddingTop: 18, borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
      <div style={{ marginBottom: 8 }}>
        <b style={{ color: 'var(--text-secondary)' }}>Not investment advice.</b> Stock Intel is an educational and analytical tool,
        not a SEBI-registered investment adviser or research analyst. Data may be delayed or inaccurate. Markets carry risk —
        do your own research before investing.
      </div>
      <div>
        <a href="/privacy" style={{ color: 'var(--text-muted)', marginRight: 12 }}>Privacy</a>
        <a href="/terms" style={{ color: 'var(--text-muted)', marginRight: 12 }}>Terms</a>
        <a href="/refund" style={{ color: 'var(--text-muted)', marginRight: 12 }}>Refunds</a>
        <a href="/contact" style={{ color: 'var(--text-muted)' }}>Contact</a>
        <span style={{ marginLeft: 12 }}>© {new Date().getFullYear()} Stock Intel</span>
      </div>
    </footer>
  );
}

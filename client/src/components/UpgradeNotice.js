import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';

// Inline paywall shown in place of a Pro-only feature for free users.
export default function UpgradeNotice({ feature = 'This feature', compact }) {
  const navigate = useNavigate();
  return (
    <div className="card" style={{ textAlign: 'center', padding: compact ? '24px 20px' : '48px 24px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: 'var(--blue-dim)', marginBottom: 14 }}>
        <Lock size={20} color="var(--blue)" />
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{feature} is a Pro feature</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
        Upgrade to Stock Intel Pro to unlock the full analysis suite, Ace Investors, and smart-money volume signals.
      </div>
      <button className="btn btn-primary" onClick={() => navigate('/pricing')} style={{ justifyContent: 'center' }}>
        <Sparkles size={14} /> Upgrade to Pro
      </button>
    </div>
  );
}

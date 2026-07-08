import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Menu, Activity } from 'lucide-react';
import axios from 'axios';
import Sidebar from './components/layout/Sidebar';
import useIsMobile from './useIsMobile';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import StockDeepDive from './pages/StockDeepDive';
import WhaleSignals from './pages/WhaleSignals';
import Watchlist from './pages/Watchlist';
import SuperInvestors from './pages/SuperInvestors';
import Login from './pages/Login';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';
import Pricing from './pages/Pricing';
import Profile from './pages/Profile';
import Chat from './pages/Chat';
import Legal from './pages/Legal';
import Footer from './components/Footer';
import { AuthContext } from './AuthContext';

axios.defaults.withCredentials = true;   // send the session cookie with API calls

export default function App() {
  const [auth, setAuth] = useState(null);   // null = checking

  useEffect(() => {
    axios.get('/api/auth/me')
      .then(r => setAuth(r.data))
      .catch(() => setAuth({ authEnabled: false, authenticated: false }));   // fail open if the check itself errors
  }, []);

  // Password-reset page is reachable without being signed in (link from email).
  if (window.location.pathname === '/reset-password') return <ResetPassword />;

  // Legal pages are public (required for app stores, Razorpay, DPDP).
  const LEGAL = { '/privacy': 'privacy', '/terms': 'terms', '/refund': 'refund', '/contact': 'contact' };
  if (LEGAL[window.location.pathname]) return <Legal page={LEGAL[window.location.pathname]} />;

  if (!auth) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
      </div>
    );
  }

  if (auth.authEnabled && !auth.authenticated) return <Login googleEnabled={auth.googleEnabled} />;

  if (auth.authEnabled && auth.authenticated && auth.verificationRequired && !auth.verified)
    return <VerifyEmail email={auth.user?.email} />;

  return (
    <AuthContext.Provider value={{ plan: auth.plan || 'pro', billingEnabled: !!auth.billingEnabled, user: auth.user, verified: auth.verified }}>
      <BrowserRouter>
        <Shell auth={auth} />
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

function Shell({ auth }) {
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Close the drawer whenever the route changes (tapped a nav item).
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  const main = {
    flex: 1,
    marginLeft: isMobile ? 0 : 220,
    maxWidth: isMobile ? '100vw' : 'calc(100vw - 220px)',
    padding: isMobile ? '16px 16px 32px' : '28px 32px',
    paddingTop: isMobile ? 64 : 28,   // room for the fixed mobile top bar
    minWidth: 0,
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile top bar */}
      {isMobile && (
        <header style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px',
          background: 'var(--bg-800)', borderBottom: '1px solid var(--border)',
        }}>
          <button onClick={() => setNavOpen(true)} aria-label="Menu"
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <Menu size={22} />
          </button>
          <Activity size={18} color="var(--blue)" strokeWidth={2.5} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Stock Intel</span>
        </header>
      )}

      {/* Backdrop when drawer open */}
      {isMobile && navOpen && (
        <div onClick={() => setNavOpen(false)}
          style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 150 }} />
      )}

      <Sidebar user={auth.user} isMobile={isMobile} open={navOpen} onClose={() => setNavOpen(false)} />

      <main style={main}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/stock/:ticker" element={<StockDeepDive />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/whales" element={<WhaleSignals />} />
          <Route path="/investors" element={<SuperInvestors />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/privacy" element={<Legal page="privacy" />} />
          <Route path="/terms" element={<Legal page="terms" />} />
          <Route path="/refund" element={<Legal page="refund" />} />
          <Route path="/contact" element={<Legal page="contact" />} />
        </Routes>
        <Footer />
      </main>
    </div>
  );
}

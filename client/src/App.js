import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import StockDeepDive from './pages/StockDeepDive';
import WhaleSignals from './pages/WhaleSignals';
import Watchlist from './pages/Watchlist';
import SuperInvestors from './pages/SuperInvestors';
import Login from './pages/Login';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';

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
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar user={auth.user} />
        <main style={{ flex: 1, marginLeft: 220, padding: '28px 32px', maxWidth: 'calc(100vw - 220px)' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/stock/:ticker" element={<StockDeepDive />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/whales" element={<WhaleSignals />} />
            <Route path="/investors" element={<SuperInvestors />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import StockDeepDive from './pages/StockDeepDive';
import WhaleSignals from './pages/WhaleSignals';

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, marginLeft: 220, padding: '28px 32px', maxWidth: 'calc(100vw - 220px)' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/stock/:ticker" element={<StockDeepDive />} />
            <Route path="/whales" element={<WhaleSignals />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

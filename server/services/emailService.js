const nodemailer = require('nodemailer');

const money       = (v) => `₹${Number(v||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
const signedMoney = (v) => `${v>=0?'+':'-'}${money(Math.abs(v))}`;
const pct         = (v) => `${v>=0?'+':''}${Number(v||0).toFixed(2)}%`;

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

function recBadge(rec) {
  if (!rec) return { bg:'#1e293b', color:'#64748b', border:'#334155', label:'—' };
  if (rec === 'buy')  return { bg:'#052e16', color:'#4ade80', border:'#166534', label:'▲ BUY' };
  if (rec === 'sell') return { bg:'#2d0a0a', color:'#f87171', border:'#7f1d1d', label:'▼ SELL' };
  return { bg:'#1c1500', color:'#fbbf24', border:'#78350f', label:'◆ HOLD' };
}

function buildEmailHTML({ holdings, recommendations, whaleSignals, aiAnalysis, date }) {
  const totalValue  = holdings.reduce((s,h) => s+h.totalValue, 0);
  const totalCost   = holdings.reduce((s,h) => s+(h.avgBuyPrice*h.shares), 0);
  const totalPnl    = holdings.reduce((s,h) => s+h.pnl, 0);
  const dailyPnl    = holdings.reduce((s,h) => s+(h.dailyChange||0)*h.shares, 0);
  const totalPnlPct = totalCost ? ((totalPnl/totalCost)*100) : 0;

  // Sort: biggest losers first (most attention needed)
  const sorted = [...holdings].sort((a,b) => (a.pnlPercent||0) - (b.pnlPercent||0));

  const topGainers = [...holdings].sort((a,b)=>(b.pnlPercent||0)-(a.pnlPercent||0)).slice(0,3);
  const topLosers  = [...holdings].sort((a,b)=>(a.pnlPercent||0)-(b.pnlPercent||0)).slice(0,3);

  const holdingsRows = sorted.map(h => {
    const rec  = recommendations.find(r => r.ticker === h.ticker);
    const badge = recBadge(rec?.recommendation);
    const pnlColor = h.pnl >= 0 ? '#4ade80' : '#f87171';
    const dayColor = (h.dailyChange||0) >= 0 ? '#4ade80' : '#f87171';
    return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #1e293b;">
          <div style="font-weight:800;font-size:14px;color:#f1f5f9;font-family:'Courier New',monospace;">${h.displayTicker||h.ticker.replace('.NS','')}</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">${h.shares?.toLocaleString('en-IN')} shares</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #1e293b;font-family:'Courier New',monospace;">
          <div style="color:#f1f5f9;font-size:14px;">${money(h.currentPrice)}</div>
          <div style="color:${dayColor};font-size:11px;">${(h.dailyChange||0)>=0?'+':''}${(h.dailyChangePercent||0).toFixed(2)}% today</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #1e293b;font-family:'Courier New',monospace;">
          <div style="color:${pnlColor};font-weight:700;font-size:14px;">${signedMoney(h.pnl)}</div>
          <div style="color:${pnlColor};font-size:11px;opacity:0.8;">${pct(h.pnlPercent)}</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #1e293b;">
          <span style="background:${badge.bg};color:${badge.color};border:1px solid ${badge.border};padding:4px 10px;border-radius:4px;font-size:11px;font-weight:800;font-family:'Courier New',monospace;letter-spacing:0.5px;">${badge.label}</span>
        </td>
      </tr>
    `;
  }).join('');

  const gainersHTML = topGainers.map(h => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1e293b;">
      <span style="color:#94a3b8;font-size:13px;font-family:'Courier New',monospace;">${h.displayTicker||h.ticker.replace('.NS','')}</span>
      <span style="color:#4ade80;font-weight:700;font-size:13px;font-family:'Courier New',monospace;">${pct(h.pnlPercent)}</span>
    </div>`).join('');

  const losersHTML = topLosers.map(h => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1e293b;">
      <span style="color:#94a3b8;font-size:13px;font-family:'Courier New',monospace;">${h.displayTicker||h.ticker.replace('.NS','')}</span>
      <span style="color:#f87171;font-weight:700;font-size:13px;font-family:'Courier New',monospace;">${pct(h.pnlPercent)}</span>
    </div>`).join('');

  const aiHTML = aiAnalysis ? `
  <div style="background:#0d1f0d;border:1px solid #166534;border-left:4px solid #4ade80;border-radius:8px;padding:24px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:800;color:#4ade80;text-transform:uppercase;letter-spacing:2px;margin-bottom:14px;">🤖 AI Portfolio Analysis</div>
    <div style="color:#d1fae5;font-size:14px;line-height:1.8;white-space:pre-line;">${aiAnalysis}</div>
  </div>` : '';

  const whalesHTML = whaleSignals && whaleSignals.length > 0 ? whaleSignals.slice(0,5).map(s => {
    const typeColors = { volume_spike:'#f59e0b', analyst:'#8b5cf6', momentum:'#06b6d4', institutional:'#ec4899' };
    const color = typeColors[s.signalType] || '#64748b';
    return `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #1e293b;">
        <span style="background:${color}22;color:${color};border:1px solid ${color}44;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:800;white-space:nowrap;font-family:'Courier New',monospace;">${(s.signalType||'').replace('_',' ').toUpperCase()}</span>
        <div>
          <div style="color:#f1f5f9;font-size:13px;font-weight:700;">${s.ticker} <span style="color:#64748b;font-weight:400;">· ${s.institutionName||''}</span></div>
          <div style="color:#94a3b8;font-size:12px;margin-top:3px;">${s.detail ? Object.values(s.detail).slice(0,2).join(' · ') : ''}</div>
        </div>
      </div>`;
  }).join('') : '<div style="color:#475569;font-size:13px;padding:12px 0;">No signals today.</div>';

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stock Intelligence Digest</title>
</head>
<body style="margin:0;padding:0;background:#070d14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:24px 16px;">

  <!-- HEADER -->
  <div style="text-align:center;padding:40px 24px 32px;background:linear-gradient(180deg,#0f1f35 0%,#070d14 100%);border:1px solid #1e3a5f;border-radius:12px;margin-bottom:20px;position:relative;overflow:hidden;">
    <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#3b82f6,#8b5cf6,transparent);"></div>
    <div style="font-size:11px;letter-spacing:4px;color:#3b82f6;text-transform:uppercase;font-weight:700;margin-bottom:12px;">PORTFOLIO INTELLIGENCE</div>
    <div style="font-size:32px;font-weight:900;color:#f1f5f9;letter-spacing:-1px;">Morning Digest</div>
    <div style="color:#475569;font-size:13px;margin-top:8px;">${date}</div>
  </div>

  <!-- SUMMARY METRICS -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
    <tr>
      <td width="50%" style="padding-right:10px;">
        <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:20px;">
          <div style="font-size:10px;letter-spacing:2px;color:#475569;text-transform:uppercase;font-weight:700;">Total Value</div>
          <div style="font-size:26px;font-weight:900;color:#f1f5f9;margin-top:6px;font-family:'Courier New',monospace;">${money(totalValue)}</div>
          <div style="font-size:12px;color:#475569;margin-top:4px;">${holdings.length} positions</div>
        </div>
      </td>
      <td width="50%" style="padding-left:10px;">
        <div style="background:#0f172a;border:1px solid ${totalPnl>=0?'#166534':'#7f1d1d'};border-radius:10px;padding:20px;">
          <div style="font-size:10px;letter-spacing:2px;color:#475569;text-transform:uppercase;font-weight:700;">Total P&amp;L</div>
          <div style="font-size:26px;font-weight:900;color:${totalPnl>=0?'#4ade80':'#f87171'};margin-top:6px;font-family:'Courier New',monospace;">${signedMoney(totalPnl)}</div>
          <div style="font-size:12px;color:${totalPnl>=0?'#4ade80':'#f87171'};margin-top:4px;">${pct(totalPnlPct)} all time</div>
        </div>
      </td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
    <tr>
      <td width="50%" style="padding-right:10px;">
        <div style="background:#0f172a;border:1px solid ${dailyPnl>=0?'#166534':'#7f1d1d'};border-radius:10px;padding:20px;">
          <div style="font-size:10px;letter-spacing:2px;color:#475569;text-transform:uppercase;font-weight:700;">Today's P&amp;L</div>
          <div style="font-size:22px;font-weight:900;color:${dailyPnl>=0?'#4ade80':'#f87171'};margin-top:6px;font-family:'Courier New',monospace;">${signedMoney(dailyPnl)}</div>
        </div>
      </td>
      <td width="50%" style="padding-left:10px;">
        <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:20px;">
          <div style="font-size:10px;letter-spacing:2px;color:#475569;text-transform:uppercase;font-weight:700;">Invested</div>
          <div style="font-size:22px;font-weight:900;color:#94a3b8;margin-top:6px;font-family:'Courier New',monospace;">${money(totalCost)}</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- TOP MOVERS -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
    <tr>
      <td width="50%" style="padding-right:10px;vertical-align:top;">
        <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:20px;">
          <div style="font-size:10px;letter-spacing:2px;color:#4ade80;text-transform:uppercase;font-weight:700;margin-bottom:12px;">▲ Top Gainers</div>
          ${gainersHTML}
        </div>
      </td>
      <td width="50%" style="padding-left:10px;vertical-align:top;">
        <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:20px;">
          <div style="font-size:10px;letter-spacing:2px;color:#f87171;text-transform:uppercase;font-weight:700;margin-bottom:12px;">▼ Biggest Losers</div>
          ${losersHTML}
        </div>
      </td>
    </tr>
  </table>

  <!-- AI ANALYSIS -->
  ${aiHTML}

  <!-- HOLDINGS TABLE -->
  <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;margin-bottom:20px;overflow:hidden;">
    <div style="padding:16px 20px;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;font-weight:700;">All Holdings</div>
      <div style="font-size:11px;color:#334155;">${holdings.filter(h=>h.livePrice).length}/${holdings.length} live prices</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <thead>
        <tr style="background:#0a1220;">
          <th style="padding:10px 16px;text-align:left;font-size:10px;color:#334155;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Stock</th>
          <th style="padding:10px 16px;text-align:left;font-size:10px;color:#334155;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Price</th>
          <th style="padding:10px 16px;text-align:left;font-size:10px;color:#334155;font-weight:700;text-transform:uppercase;letter-spacing:1px;">P&amp;L</th>
          <th style="padding:10px 16px;text-align:left;font-size:10px;color:#334155;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Signal</th>
        </tr>
      </thead>
      <tbody>${holdingsRows}</tbody>
    </table>
  </div>

  <!-- WHALE SIGNALS -->
  <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:20px;margin-bottom:20px;">
    <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;font-weight:700;margin-bottom:14px;">🐋 Institutional Signals</div>
    ${whalesHTML}
  </div>

  <!-- FOOTER -->
  <div style="text-align:center;padding:20px;color:#1e293b;font-size:11px;line-height:1.8;">
    <div style="color:#334155;">Stock Intelligence • ${new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</div>
    <div style="margin-top:4px;">Not financial advice. Do your own research.</div>
  </div>

</div>
</body></html>`;
}

async function sendDailyDigest({ holdings, recommendations, whaleSignals, aiAnalysis }) {
  const date = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Kolkata' });

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    const totalValue = holdings.reduce((s,h)=>s+h.totalValue,0);
    const totalPnl   = holdings.reduce((s,h)=>s+h.pnl,0);
    console.log('\n📧 DIGEST (no SMTP — printing to console):');
    console.log(`   Date: ${date} | Value: ${money(totalValue)} | P&L: ${signedMoney(totalPnl)}`);
    holdings.forEach(h => {
      const rec = recommendations.find(r=>r.ticker===h.ticker);
      console.log(`   ${(h.displayTicker||h.ticker).padEnd(14)} ${money(h.currentPrice).padEnd(16)} ${signedMoney(h.pnl).padEnd(16)} ${rec?.recommendation?.toUpperCase()||'N/A'}`);
    });
    return { success:true, mode:'console' };
  }

  const transporter = createTransporter();
  const html = buildEmailHTML({ holdings, recommendations, whaleSignals, aiAnalysis, date });

  const info = await transporter.sendMail({
    from: `"📈 Stock Intelligence" <${process.env.GMAIL_USER}>`,
    to: process.env.EMAIL_RECIPIENT || process.env.GMAIL_USER,
    subject: `📈 Morning Digest — ${date}`,
    html,
  });

  return { success:true, mode:'email', messageId:info.messageId };
}

module.exports = { sendDailyDigest, buildEmailHTML };

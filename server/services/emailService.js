const nodemailer = require('nodemailer');

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = (value) => `${value >= 0 ? '+' : '-'}${money(Math.abs(value))}`;

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function getRecommendationColor(rec) {
  if (rec === 'buy') return '#10b981';
  if (rec === 'sell') return '#ef4444';
  return '#f59e0b';
}

function getRecommendationLabel(rec) {
  if (rec === 'buy') return '🟢 BUY';
  if (rec === 'sell') return '🔴 SELL';
  return '🟡 HOLD';
}

function buildEmailHTML({ holdings, recommendations, whaleSignals, date }) {
  const totalValue = holdings.reduce((s, h) => s + h.totalValue, 0);
  const totalPnl = holdings.reduce((s, h) => s + h.pnl, 0);
  const dailyPnl = holdings.reduce((s, h) => s + h.dailyChange * h.shares, 0);

  const holdingsHTML = holdings.map(h => {
    const rec = recommendations.find(r => r.ticker === h.ticker);
    const recColor = rec ? getRecommendationColor(rec.recommendation) : '#6b7280';
    const recLabel = rec ? getRecommendationLabel(rec.recommendation) : '⚪ N/A';
    const pnlColor = h.pnl >= 0 ? '#10b981' : '#ef4444';
    return `
      <tr style="border-bottom: 1px solid #1e293b;">
        <td style="padding: 14px 12px; font-weight: 700; font-size: 15px; color: #f1f5f9;">${h.displayTicker || h.ticker}</td>
        <td style="padding: 14px 12px; color: #94a3b8;">${h.name}</td>
        <td style="padding: 14px 12px; color: #f1f5f9;">${money(h.currentPrice)}</td>
        <td style="padding: 14px 12px; color: ${h.dailyChange >= 0 ? '#10b981' : '#ef4444'};">${h.dailyChange >= 0 ? '+' : ''}${h.dailyChange.toFixed(2)} (${h.dailyChangePercent >= 0 ? '+' : ''}${h.dailyChangePercent.toFixed(2)}%)</td>
        <td style="padding: 14px 12px; color: ${pnlColor}; font-weight: 600;">${signedMoney(h.pnl)}</td>
        <td style="padding: 14px 12px;">
          <span style="background: ${recColor}22; color: ${recColor}; border: 1px solid ${recColor}44; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700;">${recLabel}</span>
        </td>
      </tr>
      ${rec ? `<tr style="border-bottom: 1px solid #1e293b;"><td colspan="6" style="padding: 0 12px 14px; color: #94a3b8; font-size: 13px; line-height: 1.6;">${rec.aiSummary}</td></tr>` : ''}
    `;
  }).join('');

  const whalesHTML = whaleSignals.slice(0, 4).map(s => {
    const typeColors = { '13f': '#8b5cf6', 'options': '#06b6d4', 'volume_spike': '#f59e0b', 'dark_pool': '#6b7280' };
    const color = typeColors[s.signalType] || '#6b7280';
    const typeLabel = s.signalType.replace('_', ' ').toUpperCase();
    return `
      <tr style="border-bottom: 1px solid #1e293b;">
        <td style="padding: 12px; font-weight: 700; color: #f1f5f9;">${s.ticker}</td>
        <td style="padding: 12px;"><span style="background: ${color}22; color: ${color}; border: 1px solid ${color}44; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">${typeLabel}</span></td>
        <td style="padding: 12px; color: #94a3b8; font-size: 13px;">${s.institutionName || Object.entries(s.detail).slice(0, 2).map(([k, v]) => `${v}`).join(' · ')}</td>
        <td style="padding: 12px; color: #64748b; font-size: 12px;">${s.signalDate}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stock Intelligence Daily Digest</title></head>
<body style="margin:0; padding:0; background:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
<div style="max-width: 700px; margin: 0 auto; padding: 20px;">

  <!-- Header -->
  <div style="background: linear-gradient(135deg, #1e3a5f, #0f172a); border: 1px solid #1e40af; border-radius: 12px; padding: 28px; margin-bottom: 20px; text-align: center;">
    <div style="font-size: 28px; font-weight: 800; color: #f1f5f9; letter-spacing: -0.5px;">📈 Stock Intelligence</div>
    <div style="color: #94a3b8; margin-top: 6px; font-size: 15px;">Daily Digest — ${date}</div>
  </div>

  <!-- Portfolio Summary -->
  <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
    <div style="font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px;">Portfolio Summary</div>
    <div style="display: flex; gap: 16px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 130px; background: #0f172a; border-radius: 8px; padding: 16px;">
        <div style="color: #64748b; font-size: 12px;">Total Value</div>
        <div style="color: #f1f5f9; font-size: 22px; font-weight: 700; margin-top: 4px;">${money(totalValue)}</div>
      </div>
      <div style="flex: 1; min-width: 130px; background: #0f172a; border-radius: 8px; padding: 16px;">
        <div style="color: #64748b; font-size: 12px;">Total P&L</div>
        <div style="color: ${totalPnl >= 0 ? '#10b981' : '#ef4444'}; font-size: 22px; font-weight: 700; margin-top: 4px;">${signedMoney(totalPnl)}</div>
      </div>
      <div style="flex: 1; min-width: 130px; background: #0f172a; border-radius: 8px; padding: 16px;">
        <div style="color: #64748b; font-size: 12px;">Today's P&L</div>
        <div style="color: ${dailyPnl >= 0 ? '#10b981' : '#ef4444'}; font-size: 22px; font-weight: 700; margin-top: 4px;">${signedMoney(dailyPnl)}</div>
      </div>
    </div>
  </div>

  <!-- Holdings & Recommendations -->
  <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
    <div style="font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px;">Holdings & Recommendations</div>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 1px solid #334155;">
          <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Ticker</th>
          <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Name</th>
          <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Price</th>
          <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Today</th>
          <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">P&L</th>
          <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Signal</th>
        </tr>
      </thead>
      <tbody>${holdingsHTML}</tbody>
    </table>
  </div>

  <!-- Whale Signals -->
  <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
    <div style="font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px;">🐋 Big Money Signals</div>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 1px solid #334155;">
          <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px;">Ticker</th>
          <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px;">Type</th>
          <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px;">Detail</th>
          <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 11px;">Date</th>
        </tr>
      </thead>
      <tbody>${whalesHTML}</tbody>
    </table>
  </div>

  <!-- Footer -->
  <div style="text-align: center; color: #475569; font-size: 12px; padding: 16px;">
    <p>Stock Intelligence App • Generated at ${new Date().toLocaleTimeString()}</p>
    <p style="margin-top: 4px;">This is not financial advice. Always do your own research.</p>
  </div>
</div>
</body></html>`;
}

async function sendDailyDigest({ holdings, recommendations, whaleSignals }) {
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // If no email config, log to console (development mode)
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log('\n📧 EMAIL DIGEST (no SMTP configured — printing to console):');
    console.log(`Date: ${date}`);
    holdings.forEach(h => {
      const rec = recommendations.find(r => r.ticker === h.ticker);
      console.log(`  ${h.displayTicker || h.ticker}: ${money(h.currentPrice)} | P&L: ${money(h.pnl)} | Signal: ${rec?.recommendation?.toUpperCase() || 'N/A'}`);
    });
    console.log(`  ${whaleSignals.length} whale signals included\n`);
    return { success: true, mode: 'console', message: 'Digest logged to console (configure GMAIL_USER to send real emails)' };
  }

  const transporter = createTransporter();
  const html = buildEmailHTML({ holdings, recommendations, whaleSignals, date });

  const info = await transporter.sendMail({
    from: `"Stock Intelligence" <${process.env.GMAIL_USER}>`,
    to: process.env.EMAIL_RECIPIENT || process.env.GMAIL_USER,
    subject: `📈 Daily Stock Digest — ${date}`,
    html,
  });

  return { success: true, mode: 'email', messageId: info.messageId };
}

module.exports = { sendDailyDigest, buildEmailHTML };

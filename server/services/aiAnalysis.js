/**
 * aiAnalysis.js — Uses Claude API to generate intelligent portfolio commentary
 * for the daily digest email
 */

const https = require('https');

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers:  {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(data),
      },
      timeout: 30000,
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude API timeout')); });
    req.write(data);
    req.end();
  });
}

async function generatePortfolioAnalysis({ holdings, recommendations, summary }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('   ⚠️  No ANTHROPIC_API_KEY — skipping AI analysis');
    return null;
  }

  const money    = (v) => `₹${Number(v||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
  const topLosers  = [...holdings].sort((a,b)=>(a.pnlPercent||0)-(b.pnlPercent||0)).slice(0,5);
  const topGainers = [...holdings].sort((a,b)=>(b.pnlPercent||0)-(a.pnlPercent||0)).slice(0,5);

  const portfolioSummary = `
Portfolio Summary:
- Total Value: ${money(summary.totalValue)}
- Total Invested: ${money(summary.totalCost)}
- Total P&L: ${money(summary.totalPnl)} (${summary.totalPnlPercent?.toFixed(2)}%)
- Today's P&L: ${money(summary.dailyPnl)}
- Number of holdings: ${holdings.length}

Top Gainers (all-time):
${topGainers.map(h => `- ${h.displayTicker||h.ticker.replace('.NS','')}: ${money(h.currentPrice)} | P&L: ${money(h.pnl)} (${(h.pnlPercent||0).toFixed(1)}%)`).join('\n')}

Biggest Losers (all-time):
${topLosers.map(h => `- ${h.displayTicker||h.ticker.replace('.NS','')}: ${money(h.currentPrice)} | P&L: ${money(h.pnl)} (${(h.pnlPercent||0).toFixed(1)}%)`).join('\n')}

All Holdings with Signals:
${holdings.map(h => {
  const rec = recommendations.find(r => r.ticker === h.ticker);
  return `- ${(h.displayTicker||h.ticker.replace('.NS','')).padEnd(14)} Price: ${money(h.currentPrice).padEnd(14)} P&L: ${(h.pnlPercent||0).toFixed(1)}%  Signal: ${rec?.recommendation?.toUpperCase()||'N/A'}`;
}).join('\n')}
`.trim();

  console.log('   🤖 Calling Claude API for portfolio analysis...');
  try {
    const res = await post({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: `You are a sharp, concise Indian stock market analyst writing a daily morning briefing for a retail investor. 
Be direct, insightful and actionable. Use Indian market context (NSE, Nifty, sectoral trends). 
Write in plain text — no markdown, no bullet symbols, no asterisks. Use line breaks between paragraphs.
Keep it under 200 words. Focus on what matters most today.`,
      messages: [{
        role:    'user',
        content: `Here is my portfolio as of this morning. Write a sharp 3-paragraph analysis:\n\n${portfolioSummary}\n\nParagraph 1: Overall portfolio health and key observation.\nParagraph 2: Which positions need attention today and why.\nParagraph 3: One specific actionable insight for today.`,
      }],
    });

    if (res.status !== 200) {
      console.log(`   ❌ Claude API returned ${res.status}`);
      return null;
    }

    const parsed = JSON.parse(res.body);
    const text   = parsed.content?.[0]?.text || null;
    if (text) console.log('   ✅ AI analysis generated');
    return text;
  } catch (err) {
    console.log(`   ❌ AI analysis failed: ${err.message}`);
    return null;
  }
}

module.exports = { generatePortfolioAnalysis };

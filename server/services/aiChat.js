/**
 * aiChat.js — In-app AI financial analyst (ChatGPT/Claude-style).
 *
 * Powered by Claude (claude-opus-4-8) via the official @anthropic-ai/sdk, with
 * adaptive thinking and TOOL USE so answers are grounded in this app's real,
 * live data (Yahoo-backed quotes, technicals, fundamentals, earnings, the
 * user's own portfolio & watchlist) instead of the model's memory.
 *
 * The runner streams text (and a summarized thinking trace) back to the caller
 * via callbacks; routes/chat.js forwards those over SSE to the browser.
 */

const Anthropic = require('@anthropic-ai/sdk');

const indian = require('./indianMarketData');
const engine = require('./analysisEngine');
const mds    = require('./marketDataService');
const store  = require('./store');

const MODEL       = 'claude-opus-4-8';
const MAX_TOKENS  = 8000;
const MAX_TURNS   = 8;          // safety cap on the tool-use loop
const TOOL_CAP    = 24000;      // max chars of a single tool result we feed back

let _client = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}
function isConfigured() { return !!process.env.ANTHROPIC_API_KEY; }

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM = `You are "Niveshak AI", an expert equity research analyst built into an Indian stock-portfolio app. You answer the user's financial questions and run financial analyses on request, the way a sharp sell-side analyst would.

Core rules:
- You cover Indian equities (NSE/BSE). Tickers are plain symbols like TCS, RELIANCE, INFY (no exchange suffix needed — the tools add ".NS").
- ALWAYS ground numeric claims in real data by calling the tools. Never invent prices, ratios, or financials from memory. If a tool returns an error or no data, say so plainly rather than guessing.
- Currency is the Indian Rupee (₹). Use Indian number formatting (lakh/crore) where natural.
- Be direct, structured and decision-useful. Use Markdown: short sections, bold key numbers, compact tables, bullet points. Lead with the takeaway, then the supporting detail.
- When the user asks about "my portfolio", "my holdings", or "my watchlist", use the portfolio/watchlist tools — that data is scoped to the signed-in user.
- You are an analytical aid, not a SEBI-registered advisor. When you give a clear view (buy/hold/sell, fair value, etc.), it is analysis/education, not personalised investment advice — note this briefly only when you actually issue a recommendation, not on every message.

Running specific models when asked:
- Earnings analysis: pull get_earnings_analysis + a snapshot, then assess growth, margins, surprises and outlook.
- Competitive analysis: use get_competitive_analysis (and snapshots of peers if needed) to compare valuation, growth and quality vs peers.
- DCF / financial models: there is no canned DCF tool — BUILD the model yourself. Fetch get_financial_statements and get_stock_snapshot, then lay out explicit assumptions (revenue growth, margins, WACC, terminal growth), project free cash flow, discount it, and show the per-share fair value with a short sensitivity note. State every assumption you used.
- Always show your key assumptions and reasoning so the user can challenge them.`;

// ── Tool definitions (sent to Claude) ────────────────────────────────────────
const TICKER = { type: 'object', properties: { ticker: { type: 'string', description: 'NSE/BSE symbol, e.g. TCS, RELIANCE, HDFCBANK' } }, required: ['ticker'], additionalProperties: false };

const TOOLS = [
  { name: 'get_stock_snapshot',       description: 'Live quote + technical indicators (RSI, moving averages, MACD, support/resistance) + key fundamentals (PE, ROE, margins, growth) for one stock. Use this first for almost any single-stock question.', input_schema: TICKER },
  { name: 'get_earnings_analysis',    description: 'Recent earnings: revenue/profit trend, growth rates, margins and earnings-quality assessment for one stock.', input_schema: TICKER },
  { name: 'get_financial_statements', description: 'Multi-year income statement, balance sheet and cash-flow line items for one stock. Use this to build DCF / financial models.', input_schema: TICKER },
  { name: 'get_competitive_analysis', description: 'Peer comparison: how this stock stacks up against sector peers on valuation, growth and quality.', input_schema: TICKER },
  { name: 'get_sector_overview',      description: 'Overview of an Indian market sector (constituents, breadth, leaders/laggards).', input_schema: { type: 'object', properties: { sector: { type: 'string', description: 'Sector name, e.g. IT, Banking, Auto, Pharma, FMCG, Energy' } }, required: ['sector'], additionalProperties: false } },
  { name: 'get_my_portfolio',         description: "The signed-in user's own portfolio: every holding with live price, weighted-average cost, P&L, plus totals. Use when the user refers to 'my portfolio/holdings/positions'.", input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_my_watchlist',         description: "The signed-in user's watchlist of tickers they are tracking.", input_schema: { type: 'object', properties: {}, additionalProperties: false } },
];

// ── Tool executors ───────────────────────────────────────────────────────────
async function enrichHoldings(raw) {
  if (!raw.length) return [];
  let quotes = {};
  try { quotes = await mds.getCachedBatchQuotes(raw.map(h => h.ticker)); } catch { /* fall back to cost basis */ }
  return raw.map(h => {
    const q = quotes[h.ticker];
    const live = q && q.price > 0;
    const price = live ? q.price : h.avgBuyPrice;
    const value = price * h.shares, cost = h.avgBuyPrice * h.shares;
    return {
      ticker: h.ticker.replace('.NS', '').replace('.BO', ''),
      shares: h.shares,
      avgBuyPrice: h.avgBuyPrice,
      currentPrice: Math.round(price * 100) / 100,
      invested: Math.round(cost),
      currentValue: Math.round(value),
      pnl: Math.round(value - cost),
      pnlPercent: Math.round(((price - h.avgBuyPrice) / h.avgBuyPrice) * 10000) / 100,
      livePrice: live,
    };
  });
}

const EXECUTORS = {
  async get_stock_snapshot({ ticker }) {
    const [technical, fundamentals] = await Promise.all([
      indian.getStockAnalysis(ticker).catch(e => ({ error: e.message })),
      indian.getFundamentals(ticker).catch(e => ({ error: e.message })),
    ]);
    return { ticker, technical, fundamentals };
  },
  get_earnings_analysis:    ({ ticker }) => engine.earningsAnalysis(ticker),
  get_financial_statements: ({ ticker }) => engine.financialStatements(ticker),
  get_competitive_analysis: ({ ticker }) => engine.competitiveAnalysis(ticker),
  get_sector_overview:      ({ sector }) => engine.sectorOverview(sector),
  async get_my_portfolio(_args, ctx) {
    const raw = await store.getHoldings(ctx.email);
    const holdings = await enrichHoldings(raw);
    const invested = holdings.reduce((s, h) => s + h.invested, 0);
    const value    = holdings.reduce((s, h) => s + h.currentValue, 0);
    return {
      holdingCount: holdings.length,
      totalInvested: invested,
      totalValue: value,
      totalPnl: value - invested,
      totalPnlPercent: invested ? Math.round(((value - invested) / invested) * 10000) / 100 : 0,
      holdings,
    };
  },
  async get_my_watchlist(_args, ctx) {
    const wl = await store.getWatchlist(ctx.email);
    return { count: wl.length, tickers: wl.map(w => (w.ticker || '').replace('.NS', '').replace('.BO', '')) };
  },
};

async function runTool(name, input, ctx) {
  const fn = EXECUTORS[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  try {
    const out = await fn(input || {}, ctx);
    return out == null ? { error: 'No data available' } : out;
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

// Command → extra instruction appended to the system prompt for one request.
const COMMANDS = {
  'earnings-analysis':    'The user invoked /earnings-analysis. Produce a thorough earnings review for the stock they name: revenue & profit trend, growth, margins, any surprise vs trend, balance-sheet/cash-flow health, and a forward view.',
  'competitive-analysis': 'The user invoked /competitive-analysis. Benchmark the named stock against its sector peers on valuation, growth, profitability and quality, and conclude with where it stands in the pack.',
  'dcf':                  'The user invoked /financial-analysis:dcf. Build a discounted-cash-flow valuation of the named stock from its financial statements. State assumptions (revenue growth, EBIT/FCF margins, WACC, terminal growth), project & discount free cash flow, and give a per-share fair value with a brief sensitivity table. Flag it as analysis, not advice.',
  'financial-analysis':   'The user invoked /financial-analysis. Give a full fundamental analysis of the named stock: financial statements trend, ratios, quality, valuation and a bottom line.',
};

/**
 * Run one assistant turn (with the tool-use loop), streaming output via callbacks.
 * @param {object}   opts
 * @param {Array}    opts.messages  conversation so far ([{role, content}])
 * @param {string}   [opts.command] slash-command id (see COMMANDS)
 * @param {string}   opts.email     signed-in user (scopes portfolio/watchlist tools)
 * @param {function} opts.onText      (textDelta) => void
 * @param {function} opts.onThinking  (thinkingDelta) => void
 * @param {function} opts.onTool      (toolName) => void
 */
async function runChat({ messages, command, email, onText, onThinking, onTool }) {
  const system = COMMANDS[command]
    ? `${SYSTEM}\n\n${COMMANDS[command]}`
    : SYSTEM;

  const convo = messages.map(m => ({ role: m.role, content: m.content }));
  const ctx = { email };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client().messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      thinking: { type: 'adaptive', display: 'summarized' },
      tools: TOOLS,
      messages: convo,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta' && onText) onText(event.delta.text);
        else if (event.delta.type === 'thinking_delta' && onThinking) onThinking(event.delta.thinking);
      }
    }

    const msg = await stream.finalMessage();
    convo.push({ role: 'assistant', content: msg.content });   // preserve thinking + tool_use blocks

    if (msg.stop_reason !== 'tool_use') break;

    const toolUses = msg.content.filter(b => b.type === 'tool_use');
    const results = [];
    for (const tu of toolUses) {
      if (onTool) onTool(tu.name);
      const out = await runTool(tu.name, tu.input, ctx);
      results.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(out).slice(0, TOOL_CAP),
      });
    }
    convo.push({ role: 'user', content: results });
  }
}

module.exports = { isConfigured, runChat, TOOLS, COMMANDS };

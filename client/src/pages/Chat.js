import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, Bot, User, Square, AlertTriangle, Plus } from 'lucide-react';
import Markdown from '../components/Markdown';

// Slash commands → backend command id. Typing "/" surfaces this menu.
const SLASH = [
  { token: '/earnings-analysis',       command: 'earnings-analysis',    label: 'Earnings analysis',     hint: 'Deep-dive a stock\'s latest results' },
  { token: '/competitive-analysis',    command: 'competitive-analysis', label: 'Competitive analysis',  hint: 'Benchmark a stock vs its peers' },
  { token: '/financial-analysis:dcf',  command: 'dcf',                  label: 'DCF valuation',         hint: 'Build a discounted-cash-flow fair value' },
  { token: '/financial-analysis',      command: 'financial-analysis',   hint: 'Full fundamental analysis', label: 'Financial analysis' },
];

const STARTERS = [
  'Analyze TCS\'s latest earnings',
  'Build a DCF valuation of RELIANCE',
  'Compare HDFCBANK against its peers',
  'Review my portfolio and flag any risks',
];

// Parse a leading "/command" out of the typed text → { command, text }.
function parseCommand(input) {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith('/')) return { command: null, text: input };
  // longest token match first so /financial-analysis:dcf beats /financial-analysis
  const match = [...SLASH].sort((a, b) => b.token.length - a.token.length)
    .find(s => trimmed.toLowerCase().startsWith(s.token));
  if (!match) return { command: null, text: input };
  return { command: match.command, text: trimmed.slice(match.token.length).trimStart() };
}

export default function Chat() {
  const [messages, setMessages] = useState([]);   // { role, content }
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState({ text: '', thinking: '', tool: '' });
  const [available, setAvailable] = useState(null); // null=checking, true/false
  const [error, setError] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const [remaining, setRemaining] = useState(null);  // turns left today (null = unlimited)

  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    fetch('/api/chat/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setAvailable(!!d.available); setRemaining(d.remaining ?? null); })
      .catch(s => setAvailable(s === 402 ? 'locked' : false));
    // Restore the saved conversation (survives refresh; per account).
    fetch('/api/chat/history', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { messages: [] })
      .then(d => { if (Array.isArray(d.messages) && d.messages.length) setMessages(d.messages.map(m => ({ role: m.role, content: m.content }))); })
      .catch(() => {});
  }, []);

  const newChat = async () => {
    if (streaming) return;
    if (messages.length && !window.confirm('Start a new chat? The current conversation will be cleared.')) return;
    try { await fetch('/api/chat/history', { method: 'DELETE', credentials: 'include' }); } catch {}
    setMessages([]); setError('');
  };

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(scrollToEnd, [messages, draft, scrollToEnd]);

  const autoGrow = () => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; }
  };
  useEffect(autoGrow, [input]);

  async function send(rawText) {
    const text = (rawText ?? input).trim();
    if (!text || streaming) return;
    setError('');
    setShowSlash(false);

    const { command, text: cleaned } = parseCommand(text);
    const userMsg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setStreaming(true);
    setDraft({ text: '', thinking: '', tool: '' });

    // What we actually send the model: history with the slash token stripped from the new turn.
    const payloadMessages = [...messages, { role: 'user', content: command ? (cleaned || text) : text }];

    const controller = new AbortController();
    abortRef.current = controller;

    let acc = { text: '', thinking: '' };
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: payloadMessages, command }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        if (resp.status === 402) { setAvailable('locked'); throw new Error('The AI assistant is a Pro feature.'); }
        if (resp.status === 503) { setAvailable(false); throw new Error('The AI assistant is not configured on the server.'); }
        const j = await resp.json().catch(() => ({}));
        if (resp.status === 429) { setRemaining(0); throw new Error(j.error || 'Daily message limit reached.'); }
        throw new Error(j.error || `Request failed (${resp.status})`);
      }

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, sep); buf = buf.slice(sep + 2);
          let evt = 'message', data = '';
          chunk.split('\n').forEach(l => {
            if (l.startsWith('event:')) evt = l.slice(6).trim();
            else if (l.startsWith('data:')) data += l.slice(5).trim();
          });
          if (!data) continue;
          let payload; try { payload = JSON.parse(data); } catch { continue; }

          if (evt === 'text')     { acc.text += payload.text; setDraft({ ...acc, tool: '' }); }
          else if (evt === 'thinking') { acc.thinking += payload.text; setDraft(d => ({ ...d, thinking: acc.thinking })); }
          else if (evt === 'tool') { setDraft(d => ({ ...d, tool: payload.name })); }
          else if (evt === 'error') { throw new Error(payload.error || 'Assistant error'); }
          else if (evt === 'done') { if (payload.remaining !== undefined) setRemaining(payload.remaining); }
        }
      }

      if (acc.text.trim()) {
        setMessages(m => [...m, { role: 'assistant', content: acc.text }]);
      } else {
        setError('The assistant returned an empty response. Please try again.');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (acc.text.trim()) setMessages(m => [...m, { role: 'assistant', content: acc.text + '\n\n_(stopped)_' }]);
      } else {
        setError(err.message || 'Something went wrong.');
      }
    } finally {
      setStreaming(false);
      setDraft({ text: '', thinking: '', tool: '' });
      abortRef.current = null;
    }
  }

  const stop = () => { abortRef.current?.abort(); };

  const onInputChange = (e) => {
    const v = e.target.value;
    setInput(v);
    setShowSlash(v.trimStart().startsWith('/') && !v.includes(' '));
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') setShowSlash(false);
  };

  const pickSlash = (s) => {
    setInput(s.token + ' ');
    setShowSlash(false);
    taRef.current?.focus();
  };

  const slashMatches = SLASH.filter(s => s.token.startsWith(input.trimStart().toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={18} color="var(--blue)" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Niveshak AI</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Your AI equity research analyst · grounded in live data</div>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-ghost" onClick={newChat} disabled={streaming}
            style={{ marginLeft: 'auto', fontSize: 12 }}>
            <Plus size={13} /> New chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 4px' }}>
        {available === false && (
          <Notice icon={<AlertTriangle size={16} />} title="Assistant not configured"
            body="The server is missing an ANTHROPIC_API_KEY. Add it in your environment to enable AI chat." />
        )}
        {available === 'locked' && (
          <Notice icon={<Sparkles size={16} />} title="AI analyst is a Pro feature"
            body="Upgrade to Pro to chat with the AI analyst and run earnings, competitive and DCF analyses on demand." />
        )}

        {messages.length === 0 && available === true && (
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Bot size={28} color="var(--blue)" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Ask me anything about the markets</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, margin: '0 auto 22px' }}>
              I pull live prices, fundamentals and earnings, and can run financial models. Type <b>/</b> for analysis commands.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 600, margin: '0 auto' }}>
              {STARTERS.map(s => (
                <button key={s} className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, idx) => <Bubble key={idx} role={m.role} content={m.content} />)}

        {/* Live streaming draft */}
        {streaming && (
          <div style={{ marginBottom: 22 }}>
            <RoleRow role="assistant" />
            {draft.thinking && !draft.text && (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic', whiteSpace: 'pre-wrap', marginBottom: 8, paddingLeft: 34 }}>
                {draft.thinking}
              </div>
            )}
            {draft.tool && !draft.text && (
              <div style={{ fontSize: 12.5, color: 'var(--blue)', paddingLeft: 34, display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="chat-pulse" /> Fetching data ({prettyTool(draft.tool)})…
              </div>
            )}
            {draft.text
              ? <div style={{ paddingLeft: 34 }}><Markdown text={draft.text} /><span className="chat-caret" /></div>
              : (!draft.thinking && !draft.tool && <div style={{ paddingLeft: 34, color: 'var(--text-muted)', fontSize: 13 }}><span className="chat-pulse" /> Thinking…</div>)}
          </div>
        )}

        {error && (
          <div style={{ background: 'var(--red-dim)', border: '1px solid #ef444444', color: 'var(--red)', borderRadius: 10, padding: '10px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} /> {error}
          </div>
        )}
      </div>

      {/* Composer */}
      {available === true && (
        <div style={{ position: 'relative', paddingTop: 10 }}>
          {showSlash && slashMatches.length > 0 && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 8, background: 'var(--bg-700)', border: '1px solid var(--border-bright)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 28px #0008' }}>
              {slashMatches.map(s => (
                <div key={s.token} onMouseDown={(e) => { e.preventDefault(); pickSlash(s); }}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  className="slash-item">
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.token}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{s.hint}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', background: 'var(--bg-700)', border: '1px solid var(--border-bright)', borderRadius: 14, padding: 10 }}>
            <textarea
              ref={taRef}
              value={input}
              onChange={onInputChange}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask about a stock, your portfolio, or type / for analysis commands…"
              style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.5, maxHeight: 200, fontFamily: 'inherit' }}
            />
            {streaming ? (
              <button className="btn btn-ghost" onClick={stop} title="Stop" style={{ padding: '9px 12px' }}><Square size={15} /></button>
            ) : (
              <button className="btn btn-primary" onClick={() => send()} disabled={!input.trim()} title="Send" style={{ padding: '9px 13px' }}><Send size={15} /></button>
            )}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textAlign: 'center', marginTop: 7 }}>
            AI analysis for education — not personalised investment advice. Verify before trading.
            {remaining !== null && <> · <span style={{ color: remaining <= 3 ? 'var(--red)' : 'var(--text-muted)' }}>{remaining} message{remaining === 1 ? '' : 's'} left today</span></>}
          </div>
        </div>
      )}
    </div>
  );
}

function prettyTool(name) {
  return ({
    get_stock_snapshot: 'snapshot',
    get_earnings_analysis: 'earnings',
    get_financial_statements: 'financials',
    get_competitive_analysis: 'peers',
    get_sector_overview: 'sector',
    get_my_portfolio: 'your portfolio',
    get_my_watchlist: 'your watchlist',
  })[name] || name;
}

function RoleRow({ role }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isUser ? 'var(--bg-500)' : 'var(--blue-dim)' }}>
        {isUser ? <User size={14} color="var(--text-secondary)" /> : <Sparkles size={14} color="var(--blue)" />}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>{isUser ? 'You' : 'Niveshak AI'}</div>
    </div>
  );
}

function Bubble({ role, content }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <RoleRow role={role} />
      <div style={{ paddingLeft: 34 }}>
        {role === 'user'
          ? <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{content}</div>
          : <Markdown text={content} />}
      </div>
    </div>
  );
}

function Notice({ icon, title, body }) {
  return (
    <div style={{ background: 'var(--bg-700)', border: '1px solid var(--border-bright)', borderRadius: 12, padding: '16px 18px', maxWidth: 520, margin: '20px auto', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--blue)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{icon}{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

const express = require('express');
const rateLimit = require('express-rate-limit');
const router  = express.Router();
const auth    = require('../services/authService');
const chat    = require('../services/aiChat');
const cap     = require('../services/chatLimiter');
const store   = require('../services/store');

// AI calls cost money — throttle per IP (burst guard, on top of the daily caps).
const limiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// GET /api/chat/status — is the assistant available + how many turns left today?
router.get('/status', (req, res) => {
  res.json({
    available: chat.isConfigured(),
    commands:  Object.keys(chat.COMMANDS),
    ...cap.status(auth.currentEmail(req)),
  });
});

// GET /api/chat/history — the saved conversation (survives refresh, per user).
router.get('/history', async (req, res) => {
  try { res.json({ messages: await store.getChatHistory(auth.currentEmail(req)) }); }
  catch (err) { console.error('Chat history failed:', err.message); res.status(500).json({ error: 'Could not load chat history' }); }
});

// DELETE /api/chat/history — start a fresh conversation.
router.delete('/history', async (req, res) => {
  try { await store.clearChat(auth.currentEmail(req)); res.json({ success: true }); }
  catch (err) { console.error('Chat clear failed:', err.message); res.status(500).json({ error: 'Could not clear chat' }); }
});

// POST /api/chat — stream an assistant turn over Server-Sent Events.
// Body: { messages: [{ role:'user'|'assistant', content:string }], command?: string }
router.post('/', limiter, async (req, res) => {
  if (!chat.isConfigured()) {
    return res.status(503).json({ error: 'AI assistant is not configured (ANTHROPIC_API_KEY missing).' });
  }

  const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
  const command  = req.body.command || null;
  if (!messages.length) return res.status(400).json({ error: 'messages array is required' });

  // Daily spend cap — checked before any Claude call, so over-limit costs nothing.
  const email = auth.currentEmail(req);
  const allowed = cap.check(email);
  if (!allowed.ok) {
    const msg = allowed.scope === 'global'
      ? 'The AI assistant has hit its daily usage limit for everyone. Please try again tomorrow.'
      : `You've reached today's limit of ${allowed.limit} AI messages. It resets at midnight UTC.`;
    return res.status(429).json({ error: msg, code: 'rate_limited', scope: allowed.scope });
  }
  cap.record(email);   // consume one turn up front (the turn is about to run)

  // SSE headers
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',   // disable proxy buffering (nginx/Render)
  });
  res.flushHeaders?.();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('open', { ok: true });

  let closed = false;
  req.on('close', () => { closed = true; });

  // Persist the user's newest message so the conversation survives refresh.
  const latest = messages[messages.length - 1];
  if (latest?.role === 'user' && typeof latest.content === 'string') {
    store.addChatMessage(email, { role: 'user', content: latest.content })
      .catch(e => console.warn('Chat save (user) failed:', e.message));
  }

  let assistantText = '';
  try {
    await chat.runChat({
      messages: messages.slice(-24),   // cap what we send to the model (token cost)
      command,
      email,
      onText:     (t) => { assistantText += t; if (!closed) send('text', { text: t }); },
      onThinking: (t) => { if (!closed) send('thinking', { text: t }); },
      onTool:     (name) => { if (!closed) send('tool', { name }); },
    });
    if (!closed) send('done', { ok: true, ...cap.status(email) });
  } catch (err) {
    console.warn('Chat error:', err.message);
    if (!closed) send('error', { error: err.message || 'Assistant failed' });
  } finally {
    // Persist the assistant's reply (even if the client disconnected mid-stream,
    // the recommendation is saved and reappears on next load).
    if (assistantText.trim()) {
      store.addChatMessage(email, { role: 'assistant', content: assistantText })
        .catch(e => console.warn('Chat save (assistant) failed:', e.message));
    }
    if (!closed) res.end();
  }
});

module.exports = router;

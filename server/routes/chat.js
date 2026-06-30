const express = require('express');
const rateLimit = require('express-rate-limit');
const router  = express.Router();
const auth    = require('../services/authService');
const chat    = require('../services/aiChat');
const cap     = require('../services/chatLimiter');

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

  try {
    await chat.runChat({
      messages,
      command,
      email,
      onText:     (t) => { if (!closed) send('text', { text: t }); },
      onThinking: (t) => { if (!closed) send('thinking', { text: t }); },
      onTool:     (name) => { if (!closed) send('tool', { name }); },
    });
    if (!closed) send('done', { ok: true, ...cap.status(email) });
  } catch (err) {
    console.warn('Chat error:', err.message);
    if (!closed) send('error', { error: err.message || 'Assistant failed' });
  } finally {
    if (!closed) res.end();
  }
});

module.exports = router;

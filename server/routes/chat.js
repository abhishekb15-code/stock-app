const express = require('express');
const rateLimit = require('express-rate-limit');
const router  = express.Router();
const auth    = require('../services/authService');
const chat    = require('../services/aiChat');

// AI calls cost money — throttle per IP.
const limiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// GET /api/chat/status — is the assistant available?
router.get('/status', (req, res) => {
  res.json({ available: chat.isConfigured(), commands: Object.keys(chat.COMMANDS) });
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
      email: auth.currentEmail(req),
      onText:     (t) => { if (!closed) send('text', { text: t }); },
      onThinking: (t) => { if (!closed) send('thinking', { text: t }); },
      onTool:     (name) => { if (!closed) send('tool', { name }); },
    });
    if (!closed) send('done', { ok: true });
  } catch (err) {
    console.warn('Chat error:', err.message);
    if (!closed) send('error', { error: err.message || 'Assistant failed' });
  } finally {
    if (!closed) res.end();
  }
});

module.exports = router;

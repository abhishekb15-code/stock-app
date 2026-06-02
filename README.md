# 📈 Stock Intelligence — Indian Portfolio Analyzer

Live NSE portfolio tracker with daily AI-powered email digest.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/abhishekb15-code/stock-app)

---

## Features

- **Live NSE prices** via Twelve Data & Yahoo Finance
- **Daily 7am GST digest** via GitHub Actions — beautiful HTML email
- **AI portfolio analysis** via Claude (Anthropic API)
- **Google Drive sync** — auto-pulls from your Equity sheet
- **Whale & institutional signals**
- **One-click local run** via `start.bat`

---

## Quick Start (Local)

Double-click `start.bat` — opens at http://localhost:5000

---

## Deploy to Render (Free, Hosted)

1. Click **Deploy to Render** above
2. Connect your GitHub account
3. Add environment variables in Render dashboard
4. Live in ~2 minutes at `https://your-app.onrender.com`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GMAIL_USER` | ✅ | Your Gmail address |
| `GMAIL_APP_PASSWORD` | ✅ | Gmail App Password |
| `EMAIL_RECIPIENT` | ✅ | Digest recipient email |
| `TWELVE_DATA_API_KEY` | ✅ | Free at twelvedata.com |
| `ANTHROPIC_API_KEY` | ✅ | From console.anthropic.com |
| `GOOGLE_SHEET_CSV_URL` | ⚡ | Public CSV export of your Equity sheet |
| `RENDER_DEPLOY_HOOK` | ⚡ | Auto-deploy on push (from Render dashboard) |

### Get GOOGLE_SHEET_CSV_URL
1. Open Equity sheet → File → Share → Anyone with link (Viewer)
2. File → Export → CSV → copy the URL
3. Replace `/edit` with `/export?format=csv`

---

## GitHub Actions

| Workflow | Trigger |
|---|---|
| 📈 Daily Morning Digest | 7:00 AM GST, Mon–Fri |
| 🚀 Deploy to Render | Every push to main |
| 🌐 Open App in Browser | Manual |

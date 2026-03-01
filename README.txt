# 😈 DAREMAXXING

Real X-powered dare score calculator.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 HOW TO RUN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: Install Node.js (if not installed)
→ Go to https://nodejs.org → Download LTS version → Install it

STEP 2: Start the app
→ Windows: Double-click START-WINDOWS.bat
→ Mac:     Double-click START-MAC.command

STEP 3: Browser opens automatically at http://localhost:3000

That's it. Type any X username and get their real dare score.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TO PUT IT LIVE ONLINE (FREE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Upload this folder to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add environment variable: X_BEARER_TOKEN (copy from .env file)
4. Get a live URL in 2 minutes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 FILE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

daremaxxing/
├── server.js          ← Backend (X API calls)
├── package.json       ← Dependencies
├── .env               ← Bearer token
├── START-WINDOWS.bat  ← Windows launcher
├── START-MAC.command  ← Mac launcher
└── public/
    └── index.html     ← Frontend website

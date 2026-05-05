# اقرأ - Iqra — AI Page Summarizer

> _A Chrome Extension that reads the web so you don't have to._
> Van Gogh Starry Night × Almond Blossom Edition · Manifest V3

---

## What It Does

Iqra (Arabic: اقرأ — _"Read"_) is a Chrome Extension that extracts meaningful content from any webpage and uses AI to generate structured summaries instantly — with zero API keys stored in the extension.

**One click gives you:**

- Bullet-point key insights (3 summary modes)
- Estimated reading time + word count
- Optional in-page highlighting of key phrases
- Van Gogh dual-theme UI (Starry Night dark / Almond Blossom light)

---

## Quick Setup (Local Installation)

> This extension runs locally and is **not** on the Chrome Web Store.

### Step 1 — Download & Unzip

1. Download `iqra-summarizer.zip`
2. Unzip to a **permanent** folder (e.g. `~/Extensions/iqra-summarizer`)
   - Do not delete this folder after installing — Chrome loads from it live

### Step 2 — Load in Chrome

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer Mode** (toggle, top-right corner)
3. Click **"Load unpacked"**
4. Select the unzipped `iqra-summarizer` folder
5. The Iqra star icon appears in your toolbar

> **Pin it:** Click the puzzle piece icon → pin Iqra for easy access

### Step 3 — Connect to the Backend

1. Click the Iqra icon → click the gear button (top right of popup)
2. In the **Backend URL** field, paste:
   ```
   https://iqra-backend-two.vercel.app
   ```
3. Click **Test Connection** — should say Connected
4. Click **Save Settings**

No API key needed anywhere. The backend handles all AI calls securely.

### Step 4 — Use It

1. Go to any article, blog post, Wikipedia page, or news story
2. Click the Iqra icon in your toolbar
3. Choose your summary mode (Full Summary / 3 Bullets / Key Quotes)
4. Click **Summarize This Page**
5. Toggle **Highlight on Page** to mark key phrases in the browser
6. Click the paintbrush icon to switch between dark and light themes

---

## Architecture

### File Structure

```
iqra-summarizer/          Chrome Extension (frontend)
├── manifest.json         MV3 config, minimal permissions
├── background.js         Service worker — proxy calls, cache, rate limiting
├── content.js            Injected script — content extraction, highlighting
├── popup.html            Extension popup UI
├── popup.css             Van Gogh dual-theme styling + animations
├── popup.js              Popup logic — state, messaging, rendering
├── options.html          Settings page — backend URL config
├── options.css           Settings page styling
├── options.js            Settings logic — save/load/test backend URL
└── icons/                Islamic 8-point star icons (16/32/48/128px)

iqra-backend/             Proxy Server (deployed on Vercel)
├── api/
│   └── index.js          Express server — validates, calls Gemini, returns summary
├── package.json
├── vercel.json
├── .env.example          Documents which env vars to set
└── .gitignore
```

### Data Flow

```
User clicks "Summarize This Page"
        │
        ▼
popup.js
├── Injects content.js into active tab (on demand, not persistent)
└── Sends extractContent message to content.js
        │
        ▼
content.js (runs in page context)
├── Strips noise: nav, footer, ads, sidebars (20+ selectors)
├── Finds main content via 18-selector priority list
├── Falls back to heuristic: densest text block
└── Returns { text, wordCount, title, url }
        │
        ▼
popup.js → background.js (service worker)
├── Checks chrome.storage.local cache (24h TTL per URL+mode)
├── Checks client-side rate limit (10 req/min)
└── POSTs { content, mode, wordCount, readingTime } over HTTPS
        │
        ▼
Vercel Proxy Server — iqra-backend
├── Validates and sanitizes all input
├── Server-side rate limiting (20 req/min per IP)
├── Reads GEMINI_API_KEY from encrypted environment variables
├── Calls Gemini 2.5 Flash REST API
├── Parses and validates JSON response
├── Sanitizes all strings before returning
└── Returns { insights, readingTime, wordCount, keyPhrases }
        │
        ▼
background.js
├── Caches result to chrome.storage.local
└── Returns summary to popup.js
        │
        ▼
popup.js — renders numbered insight cards
        │
        ▼ (if Highlight toggle ON)
content.js
└── Highlights keyPhrases in live DOM via Range API
```

---

## AI Integration

### Model

**Google Gemini 2.5 Flash** (`gemini-2.5-flash`) — Google's latest fast model, called via REST API from the proxy backend. No SDK required.

### Why a Proxy Server?

The AI API key lives exclusively in Vercel's encrypted environment variables. The extension never sees, stores, or transmits any API key. This means:

- No setup required for anyone testing — just paste the backend URL
- The key cannot be extracted from the extension by anyone
- All AI traffic flows through a controlled, rate-limited, validated server

### Prompt Strategy

The prompt uses `responseMimeType: "application/json"` and `thinkingBudget: 0` to force clean JSON output and disable reasoning mode — making responses deterministic and instantly parseable.

### Summary Modes

| Mode         | Output                                  |
| ------------ | --------------------------------------- |
| Full Summary | 4-6 comprehensive key insights          |
| 3 Bullets    | Exactly 3 high-impact takeaways         |
| Key Quotes   | 3 near-verbatim sentences from the text |

---

## Security Decisions

### No API Key in Extension — Ever

The API key lives only in Vercel environment variables. The extension stores only a backend URL. Even if someone fully reverse-engineered the extension, there is nothing sensitive to find.

### Proxy Server as Security Boundary

- CORS restricted to `chrome-extension://` origins only
- All inputs validated server-side before reaching the AI
- Server-side rate limiting (20 req/min per IP) prevents abuse
- Key never logged, never returned to client

### Content Security Policy

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'"
}
```

Blocks all inline scripts, eval, and external CDN scripts.

### XSS Prevention

- AI responses sanitized before storage and before render
- Summary rendered via `element.textContent` — never `innerHTML`
- Highlight phrases validated: no HTML, length-capped, char-whitelisted

### Minimal Permissions

```json
"permissions": ["activeTab", "scripting", "storage", "tabs"]
```

No `<all_urls>`. Content script injected on-demand only.

---

## Features Checklist

| Feature                              | Status |
| ------------------------------------ | ------ |
| Manifest V3                          | ✅     |
| Background service worker            | ✅     |
| Content script (on-demand)           | ✅     |
| Secure proxy backend on Vercel       | ✅     |
| Gemini 2.5 Flash                     | ✅     |
| Full / 3 Bullets / Key Quotes modes  | ✅     |
| In-page highlighting                 | ✅     |
| 24h smart caching per URL+mode       | ✅     |
| Rate limiting (client + server)      | ✅     |
| Reading time + word count            | ✅     |
| Copy summary to clipboard            | ✅     |
| Dark mode — Van Gogh Starry Night    | ✅     |
| Light mode — Van Gogh Almond Blossom | ✅     |
| Paintbrush theme toggle (persisted)  | ✅     |
| Animated twinkling stars             | ✅     |
| Islamic geometric border             | ✅     |
| Graceful error handling              | ✅     |
| Keyboard accessible + focus states   | ✅     |
| XSS prevention                       | ✅     |
| Zero exposed secrets                 | ✅     |

---

## Trade-offs

### Proxy vs. Direct API Calls

A backend adds ~50-100ms of network latency vs. calling the AI directly. Worth it: zero key exposure, centralized rate limiting, zero setup for testers.

### Heuristic Extraction vs. Readability Parser

Prioritized CSS selectors + density heuristics instead of Mozilla Readability. Zero dependencies, fully inspectable. Works on 95%+ of article pages. May miss unusual layouts.

### Truncation at 10,000 chars

Long pages truncated to control cost and latency. Covers most articles fully. Very long documents summarize the first ~2,000 words.

### No Build Step

Vanilla HTML/CSS/JS — zero tooling to install or run. Instantly inspectable. Trade-off: no type safety or tree-shaking.

---

## Backend Deployment

The backend is already live at `https://iqra-backend-two.vercel.app`. To deploy your own:

1. Clone the `iqra-backend` repo
2. Deploy to [vercel.com](https://vercel.com) — import repo, one click
3. Add environment variable: `GEMINI_API_KEY` from [aistudio.google.com](https://aistudio.google.com)
4. Update Backend URL in extension settings to your new Vercel URL

## Backend Source Code

The backend is already deployed and ready to use — no setup needed.

**Live URL:** `https://iqra-backend-two.vercel.app`

**Source code:** (https://github.com/lateefaayesufu/iqra-backend)

To connect: open the extension → click ⚙ → paste the URL → click Test Connection.

---

## Credits

- Design aesthetic: Vincent van Gogh — _The Starry Night_ (1889) + _Almond Blossom_ (1890)
- Name: اقرأ (_Iqra_)
- Islamic geometric patterns: traditional 8-point star tessellation
- Stack: Chrome Extensions Manifest V3 · Node.js · Express · Gemini 2.5 Flash · Vanilla JS

---

_"The beginning of wisdom is: read."_

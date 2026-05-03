# اقرأ Iqra — AI Page Summarizer

> _A Chrome Extension that reads the web so you don't have to._
> Van Gogh Starry Night Edition · Manifest V3

---

## What It Does

Iqra (Arabic: اقرأ — _"Read"_, the first word of the Quran's revelation) is a Chrome Extension that extracts meaningful content from any webpage and uses AI to generate structured summaries instantly.

**One click gives you:**

- Bullet-point key insights
- Estimated reading time + word count
- Optional in-page highlighting of key phrases
- Three summary modes: Full Summary, 3 Bullets, Key Quotes

---

## Quick Setup (Local Installation)

> This extension runs locally and is **not** on the Chrome Web Store.

### Step 1 — Download the Extension

1. Download the `iqra-summarizer.zip` file
2. Unzip it to a permanent folder (e.g. `~/Extensions/iqra-summarizer`)
   - **Important:** Don't delete this folder after installing — Chrome loads from it

### Step 2 — Load in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the unzipped `iqra-summarizer` folder
5. The Iqra icon (✦ Islamic star) will appear in your toolbar

> Pin it: Click the puzzle piece icon → pin Iqra for easy access

### Step 3 — Configure Your API Key

1. Click the ⚙ settings icon inside the popup, **or** go to `chrome://extensions` → Iqra → Extension options
2. Select your AI provider (Anthropic, OpenAI, or Gemini)
3. Paste your API key
4. Click **Test Connection** to verify
5. Click **Save Settings**

### Step 4 — Use It

1. Navigate to any article, blog post, documentation page, or news story
2. Click the Iqra icon in your toolbar
3. Choose your summary mode (Full / 3 Bullets / Key Quotes)
4. Click **"Summarize This Page"**
5. Toggle **"Highlight on Page"** to mark key phrases in the browser

---

## Getting an API Key

| Provider                           | Link                                                                     | Free Tier                    |
| ---------------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| **Anthropic Claude** (recommended) | [console.anthropic.com](https://console.anthropic.com)                   | Pay-as-you-go, ~$0.0001/call |
| **OpenAI**                         | [platform.openai.com/api-keys](https://platform.openai.com/api-keys)     | $5 free credit               |
| **Google Gemini**                  | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | Free quota available         |

---

## Architecture

```
iqra-summarizer/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker — AI calls, cache, rate limiting
├── content.js          # Injected script — content extraction, highlighting
├── popup.html          # Extension popup UI structure
├── popup.css           # Van Gogh Starry Night styling + animations
├── popup.js            # Popup logic — state, messaging, rendering
├── options.html        # Settings page UI
├── options.css         # Settings page styling
├── options.js          # Settings logic — save/load/test API key
└── icons/
    ├── icon16.png      # Islamic 8-point star icon
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

### Data Flow

```
User clicks "Summarize"
        │
        ▼
   popup.js
   ├── Injects content.js into active tab (if not already present)
   ├── Sends { action: 'extractContent' } to content.js
   │
   ▼
content.js (runs in page context)
   ├── Removes noise elements (nav, footer, ads, sidebars)
   ├── Finds main article content via selector priority list
   ├── Falls back to heuristic: densest text block
   ├── Returns { text, wordCount, title, url }
   │
   ▼
popup.js
   └── Sends { action: 'summarize', content, url, mode } to background.js
           │
           ▼
      background.js (service worker — isolated, secure)
           ├── Checks chrome.storage.local cache (24h TTL)
           ├── Checks rate limit (10 req/min)
           ├── Reads API key from chrome.storage.sync
           ├── Calls AI API (Anthropic / OpenAI / Gemini)
           ├── Parses + validates JSON response
           ├── Sanitizes all strings (XSS prevention)
           ├── Saves result to cache
           └── Returns { insights, readingTime, wordCount, keyPhrases }
                   │
                   ▼
              popup.js
              └── Renders summary → optionally sends keyPhrases to content.js
                          │
                          ▼
                     content.js
                     └── Highlights matching phrases in live DOM using Range API
```

---

## AI Integration

### Provider Support

Iqra supports three AI providers, selected from settings:

| Provider      | Model Used                  | Notes                            |
| ------------- | --------------------------- | -------------------------------- |
| Anthropic     | `claude-haiku-4-5-20251001` | Fast, cheap, excellent summaries |
| OpenAI        | `gpt-4o-mini`               | Reliable, widely available       |
| Google Gemini | `gemini-1.5-flash`          | Free quota, good quality         |

### Prompt Strategy

The prompt instructs the AI to return **strict JSON only** — no markdown, no preamble. This makes parsing deterministic and crash-resistant.

The AI is given:

- Truncated page content (max 10,000 chars to control cost)
- Exact word count and reading time (pre-calculated)
- Mode-specific instruction (full / 3 bullets / key quotes)
- Required JSON schema with field descriptions

The response parser strips any accidental markdown fences, extracts the first `{…}` block, JSON-parses it, validates required fields, and sanitizes all strings before rendering.

### Summary Modes

| Mode         | Instruction                             | Output        |
| ------------ | --------------------------------------- | ------------- |
| Full Summary | 4–6 comprehensive key insights          | Numbered list |
| 3 Bullets    | Exactly 3 high-impact takeaways         | Numbered list |
| Key Quotes   | 3 near-verbatim sentences from the text | Numbered list |

---

## Security Decisions

### API Key Storage

- Stored in `chrome.storage.sync` — Chrome's **encrypted** built-in key-value store
- **Never** stored in `localStorage`, cookies, or any web-accessible location
- **Never** passed through content scripts or injected into page context
- **Never** hardcoded anywhere in the extension

### API Calls

- All AI API calls are made exclusively from `background.js` (the service worker)
- The service worker runs in a **sandboxed, isolated context** — completely separate from any web page
- Content scripts (running in page context) never touch the API key or make any network requests
- Popup scripts communicate with background via `chrome.runtime.sendMessage` — Chrome's validated internal message bus

### Content Security Policy

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'"
}
```

Blocks all inline scripts and external script sources — no eval, no CDN scripts.

### XSS Prevention

- All strings returned from the AI are sanitized with `.replace(/</g, '&lt;').replace(/>/g, '&gt;')` before storage
- Summary text is rendered with `element.textContent = …` — **never** `innerHTML`
- Highlight phrases are validated: no HTML, no script characters, length-capped

### Message Validation

- Background service worker only responds to messages from extension pages (not from content scripts or web pages)
- Message actions are explicitly whitelisted (`summarize`, `clearCache`, `getCacheSize`)
- All inputs are validated and type-checked before processing

### Minimal Permissions

```json
"permissions": ["activeTab", "scripting", "storage", "tabs"]
```

- `activeTab` — read only the current tab (not all tabs)
- `scripting` — inject content.js on demand (not persistently)
- `storage` — cache summaries + save settings
- `tabs` — read the current tab's URL and title
- **No** `<all_urls>` host permission — content script is injected on-demand only

---

## Trade-offs

### Readability vs. Completeness

Content extraction uses heuristic HTML selectors rather than a full Readability parser (like Mozilla's). This keeps the bundle to zero dependencies but may miss content on unusual page layouts. For 95%+ of standard article pages it works excellently.

### Truncation at 10,000 chars

Very long pages are truncated before sending to the AI to control API cost and latency. For most articles this captures the full content. For very long documents (books, long-form reports), the summary reflects the first ~2,000 words.

### Rate limiting is in-memory

The 10 req/min rate limiter resets when the service worker goes idle (Chrome can terminate service workers). This is a best-effort guard, not an absolute one. For a production extension a persistent counter in `chrome.storage.local` would be more reliable.

### chrome.storage.sync vs. local for API keys

Sync storage means the key roams across devices signed into the same Google account. This is convenient but means the key is synced to Google's servers (encrypted). Users who prefer pure local storage can switch to `chrome.storage.local` in `options.js` line 43.

### No bundler / build step

The extension ships as vanilla HTML/CSS/JS — no Webpack, Vite, or TypeScript. This makes it instantly inspectable, hackable, and installable with zero build tooling. Trade-off: no tree-shaking or type safety.

---

## Development

To modify and test locally:

1. Edit any file in the extension folder
2. Go to `chrome://extensions`
3. Click the **↻ refresh** icon on the Iqra card
4. The popup will reflect your changes immediately

To watch console logs from the background service worker:

1. Go to `chrome://extensions`
2. Click **"Service Worker"** link under Iqra
3. DevTools opens for the background context

---

## Credits

- Design aesthetic: Vincent van Gogh's _The Starry Night_ (1889)
- Arabic calligraphy: اقرأ
- Islamic geometric patterns: traditional 8-point star tessellation
- Built with: Chrome Extensions Manifest V3, vanilla JS

---

_"The beginning of wisdom is: read."_

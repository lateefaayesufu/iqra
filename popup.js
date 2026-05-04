"use strict";

// ── State ──────────────────────────────────────────────────
const state = {
  tab: null,
  mode: "full",
  highlightOn: false,
  summary: null, // { insights, readingTime, wordCount, keyPhrases, fromCache }
  wordCount: 0,
  readingTime: 0,
  loading: false,
};

// ── DOM Refs ───────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const ui = {
  pageTitle: $("pageTitle"),
  statMin: $("statMin"),
  statWords: $("statWords"),
  statInsights: $("statInsights"),
  summarizeBtn: $("summarizeBtn"),
  highlightToggle: $("highlightToggle"),
  loadingState: $("loadingState"),
  errorBanner: $("errorBanner"),
  errorText: $("errorText"),
  errorClose: $("errorClose"),
  cacheBadge: $("cacheBadge"),
  resultsDivider: $("resultsDivider"),
  summaryResults: $("summaryResults"),
  readTime: $("readTime"),
  copyBtn: $("copyBtn"),
  clearBtn: $("clearBtn"),
  copyToast: $("copyToast"),
  settingsBtn: $("settingsBtn"),
  modeBtns: $$(".p-mode-btn"),
};

// ── Helpers ────────────────────────────────────────────────
function showError(msg) {
  ui.errorText.textContent = msg;
  ui.errorBanner.hidden = false;
  ui.loadingState.hidden = true;
}

function hideError() {
  ui.errorBanner.hidden = true;
}

function setLoading(on) {
  state.loading = on;
  ui.loadingState.hidden = !on;
  ui.summarizeBtn.disabled = on;
  if (on) {
    hideError();
    ui.cacheBadge.hidden = true;
  }
}

function updateStats(wordCount, readingTime, insightCount) {
  ui.statMin.textContent = readingTime || "—";
  ui.statWords.textContent = wordCount ? wordCount.toLocaleString() : "—";
  ui.statInsights.textContent = insightCount != null ? insightCount : "—";
  ui.readTime.textContent = readingTime ? `~${readingTime} min` : "—";
}

function renderSummary(summary) {
  state.summary = summary;
  ui.summaryResults.innerHTML = "";

  summary.insights.forEach((text, i) => {
    const li = document.createElement("li");
    li.className = "p-result-item";
    li.style.animationDelay = `${i * 0.07}s`;

    const num = document.createElement("span");
    num.className = "p-result-num";
    num.setAttribute("aria-hidden", "true");
    num.textContent = String(i + 1).padStart(2, "0");

    const txt = document.createElement("span");
    txt.className = "p-result-text";
    // textContent — never innerHTML — to prevent XSS
    txt.textContent = text;

    li.appendChild(num);
    li.appendChild(txt);
    ui.summaryResults.appendChild(li);
  });

  updateStats(summary.wordCount, summary.readingTime, summary.insights.length);

  ui.summaryResults.hidden = false;
  ui.resultsDivider.hidden = false;
  ui.cacheBadge.hidden = !summary.fromCache;
  ui.copyBtn.disabled = false;
  ui.clearBtn.disabled = false;
}

function clearSummary() {
  state.summary = null;
  ui.summaryResults.innerHTML = "";
  ui.summaryResults.hidden = true;
  ui.resultsDivider.hidden = true;
  ui.cacheBadge.hidden = true;
  ui.copyBtn.disabled = true;
  ui.clearBtn.disabled = true;
  updateStats(state.wordCount, state.readingTime, null);
  hideError();
}

// ── Content Script ─────────────────────────────────────────
async function ensureContentScript(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: "ping" });
    if (res && res.pong) return; // already injected
  } catch (_) {
    // not injected — inject now
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  // Brief pause to let script initialise
  await new Promise((r) => setTimeout(r, 80));
}

async function extractPageContent(tabId) {
  await ensureContentScript(tabId);
  const res = await chrome.tabs.sendMessage(tabId, {
    action: "extractContent",
  });
  if (!res || !res.ok)
    throw new Error(res?.error || "Could not extract page content.");
  return res.data;
}

async function sendHighlight(tabId, phrases) {
  try {
    await ensureContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, { action: "highlight", phrases });
  } catch (_) {
    /* non-fatal */
  }
}

async function removeHighlights(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "removeHighlights" });
  } catch (_) {
    /* non-fatal */
  }
}

// ── Summarize Flow ─────────────────────────────────────────
async function doSummarize() {
  if (state.loading || !state.tab) return;
  setLoading(true);

  try {
    // Extract content
    const extracted = await extractPageContent(state.tab.id);

    state.wordCount = extracted.wordCount || 0;
    state.readingTime = Math.max(1, Math.ceil(state.wordCount / 200));

    if (!extracted.text || extracted.text.trim().length < 50) {
      throw new Error(
        "Not enough readable content found on this page. Try a different page.",
      );
    }

    // Ask background to summarise
    const response = await chrome.runtime.sendMessage({
      action: "summarize",
      content: extracted.text,
      url: state.tab.url,
      mode: state.mode,
      wordCount: state.wordCount,
      readingTime: state.readingTime,
    });

    if (!response || !response.ok) {
      throw new Error(
        response?.error || "Summarization failed. Please try again.",
      );
    }

    renderSummary(response.data);

    // Apply highlights if toggle is on
    if (state.highlightOn && response.data.keyPhrases?.length) {
      await sendHighlight(state.tab.id, response.data.keyPhrases);
    }
  } catch (err) {
    showError(err.message || "Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
}

// ── Copy Summary ───────────────────────────────────────────
function copySummary() {
  if (!state.summary) return;

  const modeLabel = {
    full: "Full Summary",
    "3bullets": "3 Key Bullets",
    quotes: "Key Quotes",
  };
  const lines = [
    `Iqra — ${modeLabel[state.mode] || "Summary"}`,
    `Page: ${state.tab?.title || "Unknown"}`,
    `Reading time: ~${state.summary.readingTime} min | Words: ${state.summary.wordCount}`,
    "",
    ...state.summary.insights.map((t, i) => `${i + 1}. ${t}`),
  ];

  navigator.clipboard
    .writeText(lines.join("\n"))
    .then(() => {
      showToast();
    })
    .catch(() => {
      // Fallback for older contexts
      const ta = document.createElement("textarea");
      ta.value = lines.join("\n");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast();
    });
}

function showToast() {
  ui.copyToast.hidden = false;
  ui.copyToast.classList.remove("hiding");
  clearTimeout(ui.copyToast._timer);
  ui.copyToast._timer = setTimeout(() => {
    ui.copyToast.classList.add("hiding");
    setTimeout(() => {
      ui.copyToast.hidden = true;
    }, 300);
  }, 1800);
}

// ── Mode Switch ────────────────────────────────────────────
function switchMode(newMode) {
  if (state.mode === newMode) return;
  state.mode = newMode;

  ui.modeBtns.forEach((btn) => {
    const active = btn.dataset.mode === newMode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  // If we already have a summary, re-summarize in new mode
  if (state.summary && state.tab) {
    clearSummary();
    doSummarize();
  }
}

// ── Toggle Highlight ───────────────────────────────────────
async function toggleHighlight() {
  state.highlightOn = !state.highlightOn;
  ui.highlightToggle.setAttribute("aria-checked", String(state.highlightOn));

  if (!state.tab) return;

  if (state.highlightOn && state.summary?.keyPhrases?.length) {
    await sendHighlight(state.tab.id, state.summary.keyPhrases);
  } else {
    await removeHighlights(state.tab.id);
  }
}

// ── Initialise Popup ───────────────────────────────────────
async function init() {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tab = tab;

  if (!tab) {
    showError("Could not access the current tab.");
    ui.summarizeBtn.disabled = true;
    return;
  }

  // Block on extension/system pages
  const url = tab.url || "";
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("data:")
  ) {
    ui.pageTitle.textContent = "System page — cannot summarize";
    ui.summarizeBtn.disabled = true;
    return;
  }

  // Display page title
  const titleText = tab.title || url;
  ui.pageTitle.textContent = titleText;
  ui.pageTitle.title = titleText;

  // Extract word count in background (don't block UI)
  try {
    const extracted = await extractPageContent(tab.id);
    state.wordCount = extracted.wordCount || 0;
    state.readingTime = Math.max(1, Math.ceil(state.wordCount / 200));
    ui.statMin.textContent = state.readingTime;
    ui.statWords.textContent = state.wordCount.toLocaleString();
  } catch (_) {
    // Non-fatal — stats will show when summarizing
  }
}

// ── Event Listeners ────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  init();

  // Summarize button
  ui.summarizeBtn.addEventListener("click", doSummarize);

  // Keyboard: Enter / Space on summarize button (handled by default for buttons)
  ui.summarizeBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      doSummarize();
    }
  });

  // Mode switcher
  ui.modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => switchMode(btn.dataset.mode));
  });

  // Highlight toggle
  ui.highlightToggle.addEventListener("click", toggleHighlight);
  ui.highlightToggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleHighlight();
    }
  });

  // Copy
  ui.copyBtn.addEventListener("click", copySummary);

  // Clear
  ui.clearBtn.addEventListener("click", async () => {
    clearSummary();
    if (state.tab) await removeHighlights(state.tab.id);
    state.highlightOn = false;
    ui.highlightToggle.setAttribute("aria-checked", "false");
  });

  // Dismiss error
  ui.errorClose.addEventListener("click", hideError);

  // Settings
  ui.settingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});

// ── Theme Toggle ───────────────────────────────────────────
function initTheme() {
  chrome.storage.local.get(["theme"], (result) => {
    const theme = result.theme || "dark";
    document.documentElement.setAttribute("data-theme", theme);
  });
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";

  // Animate the paintbrush
  const btn = document.getElementById("themeBtn");
  btn.classList.add("spinning");
  setTimeout(() => btn.classList.remove("spinning"), 400);

  document.documentElement.setAttribute("data-theme", next);
  chrome.storage.local.set({ theme: next });
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  document.getElementById("themeBtn")?.addEventListener("click", toggleTheme);
});

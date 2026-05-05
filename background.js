"use strict";
function getBackendUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["backendUrl"], (result) => {
      resolve((result.backendUrl || "https://iqra-backend-two.vercel.app").trim().replace(/\/$/, ""));
    });
  });
}

const IQRA_SECRET = "";

// ── Config ──────────────────────────────────────────────────
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const CONTENT_MAX_CHARS = 10000;

let rateLimitTimestamps = [];

// ── Rate Limiting ────────────────────────────────────────────
function checkRateLimit() {
  const now = Date.now();
  rateLimitTimestamps = rateLimitTimestamps.filter(
    (ts) => now - ts < RATE_WINDOW_MS,
  );
  if (rateLimitTimestamps.length >= RATE_LIMIT_MAX) {
    const waitSecs = Math.ceil(
      (RATE_WINDOW_MS - (now - rateLimitTimestamps[0])) / 1000,
    );
    throw new Error(
      `Rate limit reached. Please wait ${waitSecs}s before summarizing again.`,
    );
  }
  rateLimitTimestamps.push(now);
}

// ── Cache ────────────────────────────────────────────────────
function buildCacheKey(url, mode) {
  const safe = (url + "|" + mode)
    .replace(/[^a-zA-Z0-9|._~:/?#[\]@!$&'()*+,;=%-]/g, "_")
    .slice(0, 100);
  return "cache_v1_" + safe;
}

function getCachedSummary(url, mode) {
  return new Promise((resolve) => {
    const key = buildCacheKey(url, mode);
    chrome.storage.local.get(key, (result) => {
      const entry = result[key];
      if (
        entry &&
        typeof entry === "object" &&
        Date.now() - entry.ts < CACHE_TTL_MS
      ) {
        resolve({ data: entry.data, fromCache: true });
      } else {
        resolve(null);
      }
    });
  });
}

function setCachedSummary(url, mode, data) {
  return new Promise((resolve) => {
    const key = buildCacheKey(url, mode);
    chrome.storage.local.set({ [key]: { data, ts: Date.now() } }, resolve);
  });
}

// ── Call Backend ─────────────────────────────────────────────
async function callBackend({ content, mode, wordCount, readingTime }) {
  const headers = { "Content-Type": "application/json" };
  if (IQRA_SECRET) headers["x-iqra-token"] = IQRA_SECRET;

  const backendUrl = await getBackendUrl();
  if (!backendUrl)
    throw new Error(
      "No backend URL configured. Click ⚙ settings to add your Vercel URL.",
    );

  const res = await fetch(`${backendUrl}/api/summarize`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: content.slice(0, CONTENT_MAX_CHARS),
      mode,
      wordCount,
      readingTime,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    const msg = data.error || `Server error (${res.status})`;

    if (res.status === 429)
      throw new Error("Too many requests. Please wait a moment.");
    if (res.status === 401)
      throw new Error("Backend auth failed. Check IQRA_SECRET setting.");
    if (res.status === 0 || !res.status)
      throw new Error(
        "Could not reach the Iqra server. Check your internet connection.",
      );

    throw new Error(msg);
  }

  return data.data;
}

// ── Main Summarize ───────────────────────────────────────────
async function summarizePage({ content, url, mode, wordCount, readingTime }) {
  if (!content || typeof content !== "string" || content.trim().length < 50) {
    throw new Error("Not enough readable content found on this page.");
  }
  if (!url || typeof url !== "string") throw new Error("Invalid page URL.");

  const safeMode = ["full", "3bullets", "quotes"].includes(mode)
    ? mode
    : "full";

  // Check cache first
  const cached = await getCachedSummary(url, safeMode);
  if (cached) return { ...cached.data, fromCache: true };

  // Rate limit check
  checkRateLimit();

  // Call backend
  const result = await callBackend({
    content,
    mode: safeMode,
    wordCount,
    readingTime,
  });

  // Cache result
  await setCachedSummary(url, safeMode, result);

  return { ...result, fromCache: false };
}

// ── Message Handler ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (_sender.tab) return false;

  if (message.action === "summarize") {
    summarizePage(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) =>
        sendResponse({ ok: false, error: err.message || "Unexpected error." }),
      );
    return true;
  }
  if (message.action === "clearCache") {
    chrome.storage.local.clear(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.action === "getCacheSize") {
    chrome.storage.local.getBytesInUse(null, (bytes) =>
      sendResponse({ ok: true, bytes }),
    );
    return true;
  }
  return false;
});

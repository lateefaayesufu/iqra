(function () {
  "use strict";

  // Prevent double-injection
  if (window.__iqraContentLoaded) return;
  window.__iqraContentLoaded = true;

  // ── Content Extraction ──────────────────────────────────
  function extractContent() {
    // Work on a clone to never modify the live DOM
    const clone = document.cloneNode(true);

    // Remove noise elements
    const noiseSelectors = [
      "script",
      "style",
      "noscript",
      "iframe",
      "object",
      "embed",
      "nav",
      "header",
      "footer",
      "aside",
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '[role="complementary"]',
      '[role="search"]',
      ".nav",
      ".navbar",
      ".navigation",
      ".menu",
      ".site-header",
      ".site-footer",
      ".page-footer",
      ".sidebar",
      ".side-bar",
      ".widget",
      ".widgets",
      ".advertisement",
      ".ads",
      ".ad",
      ".cookie-notice",
      ".cookie-banner",
      ".cookie-consent",
      ".popup",
      ".modal",
      ".overlay",
      ".newsletter-signup",
      ".social-share",
      ".share-buttons",
      ".share-bar",
      ".related-posts",
      ".related-articles",
      "#comments",
      ".comments",
      ".comment-section",
      ".breadcrumb",
      ".breadcrumbs",
      ".pagination",
      ".pager",
      '[aria-label="Advertisement"]',
      "[data-ad]",
      "[data-advertisement]",
    ];

    noiseSelectors.forEach((sel) => {
      try {
        clone.querySelectorAll(sel).forEach((el) => el.remove());
      } catch (_) {}
    });

    // Ordered list of main-content selectors (best guess first)
    const mainSelectors = [
      'article[class*="content"]',
      'article[class*="post"]',
      'article[class*="article"]',
      "article",
      '[role="main"]',
      "main",
      ".article-content",
      ".post-content",
      ".entry-content",
      ".article-body",
      ".story-body",
      ".story-content",
      ".content-body",
      ".page-content",
      "#article-body",
      "#content",
      ".prose",
      ".readable",
      ".body-copy",
      '[itemprop="articleBody"]',
    ];

    let mainEl = null;
    for (const sel of mainSelectors) {
      try {
        const el = clone.querySelector(sel);
        if (el) {
          const text = (el.textContent || "").trim();
          if (text.length > 200) {
            mainEl = el;
            break;
          }
        }
      } catch (_) {}
    }

    // Heuristic fallback — find densest text block
    if (!mainEl) {
      const candidates = Array.from(clone.querySelectorAll("div, section"));
      let best = null,
        bestLen = 0;
      for (const el of candidates) {
        // Skip tiny or deeply nested elements
        const depth = getDepth(el);
        if (depth > 8) continue;
        const len = (el.textContent || "").trim().length;
        if (len > bestLen && len > 300) {
          bestLen = len;
          best = el;
        }
      }
      mainEl = best || clone.body;
    }

    const rawText = (mainEl || clone.body).textContent || "";

    // Normalise whitespace
    const cleaned = rawText
      .replace(/\t/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const words = cleaned.split(/\s+/).filter((w) => w.length > 0);

    return {
      text: cleaned,
      wordCount: words.length,
      title: document.title || "",
      url: window.location.href,
    };
  }

  function getDepth(el) {
    let d = 0,
      node = el;
    while (node.parentElement) {
      d++;
      node = node.parentElement;
    }
    return d;
  }

  // ── Highlighting ────────────────────────────────────────
  const HIGHLIGHT_ATTR = "data-iqra-hl";
  const HIGHLIGHT_STYLE = [
    "background: rgba(232, 193, 74, 0.28) !important",
    "color: inherit !important",
    "border-radius: 3px !important",
    "padding: 1px 3px !important",
    "border-bottom: 1.5px solid rgba(232, 193, 74, 0.75) !important",
    "box-shadow: 0 0 8px rgba(232, 193, 74, 0.15) !important",
    "transition: background 0.3s !important",
  ].join(";");

  function highlightPhrases(phrases) {
    removeHighlights();
    if (!Array.isArray(phrases) || phrases.length === 0) return;

    // Sanitize: only allow safe strings, no HTML/script
    const safePhrases = phrases
      .filter((p) => typeof p === "string")
      .map((p) => p.replace(/[<>"'`]/g, "").trim())
      .filter((p) => p.length >= 3 && p.length <= 150);

    if (safePhrases.length === 0) return;

    // Walk text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (
            [
              "script",
              "style",
              "textarea",
              "input",
              "noscript",
              "mark",
            ].includes(tag)
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip already highlighted
          if (parent.hasAttribute(HIGHLIGHT_ATTR))
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    let totalHighlights = 0;
    const MAX_HIGHLIGHTS = 12;

    for (const textNode of nodes) {
      if (totalHighlights >= MAX_HIGHLIGHTS) break;
      const text = textNode.nodeValue || "";
      if (text.trim().length < 10) continue;

      for (const phrase of safePhrases) {
        if (totalHighlights >= MAX_HIGHLIGHTS) break;
        const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
        if (idx === -1) continue;

        try {
          const range = document.createRange();
          range.setStart(textNode, idx);
          range.setEnd(textNode, idx + phrase.length);

          const mark = document.createElement("mark");
          mark.setAttribute(HIGHLIGHT_ATTR, "true");
          mark.setAttribute("style", HIGHLIGHT_STYLE);

          range.surroundContents(mark);
          totalHighlights++;

          // Scroll to first highlight
          if (totalHighlights === 1) {
            setTimeout(
              () =>
                mark.scrollIntoView({ behavior: "smooth", block: "center" }),
              200,
            );
          }
          break; // one phrase per text node
        } catch (_) {
          // Range may span multiple nodes — skip gracefully
        }
      }
    }
  }

  function removeHighlights() {
    document.querySelectorAll(`[${HIGHLIGHT_ATTR}="true"]`).forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      const text = document.createTextNode(mark.textContent || "");
      parent.replaceChild(text, mark);
      parent.normalize();
    });
  }

  // ── Message Listener ────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case "ping":
        sendResponse({ pong: true });
        return true;

      case "extractContent": {
        try {
          const data = extractContent();
          sendResponse({ ok: true, data });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
        return true;
      }

      case "highlight": {
        try {
          highlightPhrases(msg.phrases);
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
        return true;
      }

      case "removeHighlights": {
        try {
          removeHighlights();
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
        return true;
      }
    }
    return false;
  });
})();

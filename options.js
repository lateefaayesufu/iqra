'use strict';

const $ = id => document.getElementById(id);

const ui = {
  backendUrl:    $('backendUrl'),
  testBtn:       $('testBtn'),
  testSpinner:   $('testSpinner'),
  testResult:    $('testResult'),
  saveBtn:       $('saveBtn'),
  saveBanner:    $('saveBanner'),
  errorBanner:   $('errorBanner'),
  errorText:     $('errorText'),
  cacheSizeLabel:$('cacheSizeLabel'),
  clearCacheBtn: $('clearCacheBtn'),
  backLink:      $('backLink')
};

function showSaveBanner() {
  ui.saveBanner.hidden = false;
  ui.errorBanner.hidden = true;
  clearTimeout(ui.saveBanner._t);
  ui.saveBanner._t = setTimeout(() => { ui.saveBanner.hidden = true; }, 3000);
}

function showErrorBanner(msg) {
  ui.errorText.textContent = msg;
  ui.errorBanner.hidden = false;
  ui.saveBanner.hidden = true;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function refreshCacheSize() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getCacheSize' });
    ui.cacheSizeLabel.textContent = res?.ok ? `Cache size: ${formatBytes(res.bytes)}` : 'Cache size: unknown';
  } catch (_) {
    ui.cacheSizeLabel.textContent = 'Cache size: unavailable';
  }
}

async function loadSettings() {
  chrome.storage.sync.get(['backendUrl'], result => {
    if (result.backendUrl) ui.backendUrl.value = result.backendUrl;
  });
  await refreshCacheSize();
}

async function saveSettings() {
  const url = ui.backendUrl.value.trim();
  if (!url) {
    showErrorBanner('Please enter your backend URL before saving.');
    ui.backendUrl.focus();
    return;
  }
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    showErrorBanner('URL must start with https://');
    return;
  }
  chrome.storage.sync.set({ backendUrl: url }, () => {
    if (chrome.runtime.lastError) showErrorBanner('Failed to save: ' + chrome.runtime.lastError.message);
    else showSaveBanner();
  });
}

async function testConnection() {
  const url = ui.backendUrl.value.trim();
  if (!url) {
    ui.testResult.className   = 'o-test-result error';
    ui.testResult.textContent = 'Enter your backend URL first.';
    ui.testResult.hidden      = false;
    return;
  }

  ui.testBtn.disabled   = true;
  ui.testSpinner.hidden = false;
  ui.testResult.hidden  = true;

  try {
    const res  = await fetch(`${url.replace(/\/$/, '')}/`);
    const data = await res.json().catch(() => ({}));
    const ok   = res.ok && data.service === 'Iqra AI Summarizer Backend';

    ui.testResult.className   = `o-test-result ${ok ? 'success' : 'error'}`;
    ui.testResult.textContent = ok
      ? `✓ Connected! Iqra backend v${data.version} is live and ready.`
      : `✗ Server responded but doesn't look like Iqra backend. Check your URL.`;
    ui.testResult.hidden = false;
  } catch (err) {
    ui.testResult.className   = 'o-test-result error';
    ui.testResult.textContent = `✗ Could not reach server: ${err.message}`;
    ui.testResult.hidden      = false;
  } finally {
    ui.testBtn.disabled   = false;
    ui.testSpinner.hidden = true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  ui.saveBtn.addEventListener('click', saveSettings);
  ui.testBtn.addEventListener('click', testConnection);
  ui.clearCacheBtn.addEventListener('click', async () => {
    ui.clearCacheBtn.disabled = true;
    ui.clearCacheBtn.textContent = 'Clearing…';
    try {
      await chrome.runtime.sendMessage({ action: 'clearCache' });
      await refreshCacheSize();
    } finally {
      ui.clearCacheBtn.disabled = false;
      ui.clearCacheBtn.textContent = 'Clear Cache';
    }
  });
  ui.backLink.addEventListener('click', e => {
    e.preventDefault();
    if (window.history.length > 1) window.history.back();
    else window.close();
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveSettings(); }
  });
});

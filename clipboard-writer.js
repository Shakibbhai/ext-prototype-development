// clipboard-writer.js
// Lightweight content script injected into all pages to track last copy/cut
// Stores a small metadata object at key "__lastClipboard__" in chrome.storage.local (if available)
// and falls back to localStorage. This allows other content scripts (e.g. Word capture)
// to read the URL/title/source of the last copied text when a paste occurs.

(function () {
  'use strict';

  const KEY = '__lastClipboard__';
  const MAX_TEXT = 2000; // cap amount stored

  function truncate(text, max = MAX_TEXT) {
    if (!text) return '';
    return text.length > max ? text.slice(0, max) : text;
  }

  function storePayload(payload) {
    console.log('[clipboard-writer] storePayload called with:', payload);
    try {
      // Try chrome.storage.local first if available
      const chromeAny = (globalThis || window).chrome;
      console.log('[clipboard-writer] chrome available?', !!chromeAny);
      console.log('[clipboard-writer] chrome.storage available?', !!(chromeAny && chromeAny.storage));
      console.log('[clipboard-writer] chrome.storage.local available?', !!(chromeAny && chromeAny.storage && chromeAny.storage.local));
      
      if (chromeAny && chromeAny.storage && chromeAny.storage.local && chromeAny.storage.local.set) {
        const obj = {};
        obj[KEY] = payload;
        try {
          chromeAny.storage.local.set(obj, () => {
            console.log('[clipboard-writer] chrome.storage.local.set completed');
            if (chrome.runtime.lastError) {
              console.error('[clipboard-writer] chrome.storage.local.set error:', chrome.runtime.lastError);
            }
          });
        } catch (e) {
          console.error('[clipboard-writer] chrome.storage.local.set exception:', e);
        }
      } else {
        console.log('[clipboard-writer] chrome.storage.local NOT available, skipping');
      }
    } catch (e) {
      console.error('[clipboard-writer] chrome storage error:', e);
    }

    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
      console.log('[clipboard-writer] localStorage.setItem completed');
    } catch (e) {
      console.error('[clipboard-writer] localStorage error:', e);
    }
  }

  function readSelectionText() {
    try {
      const s = document.getSelection();
      if (s) return s.toString();
    } catch (e) {}
    return '';
  }

  function onCopyCut(e) {
    try {
      const textFromClipboard = e && e.clipboardData ? (e.clipboardData.getData('text/plain') || '') : '';
      const selection = textFromClipboard || readSelectionText() || '';
      const payload = {
        text: truncate(selection),
        url: location.href,
        title: document.title || '',
        ts: Date.now()
      };

      // Store payload and log source for debugging/visibility
      storePayload(payload);
      try {
        // Log minimal info to the page console so developers can see source
        console.log(`[clipboard-writer] stored __lastClipboard__ -> url=${location.href} title="${document.title || ''}" textSnippet="${(payload.text || '').slice(0,200)}"`);
      } catch (e) {
        // ignore
      }
    } catch (err) {
      // ignore
    }
  }

  // Attach listeners
  try {
    document.addEventListener('copy', onCopyCut, true);
    document.addEventListener('cut', onCopyCut, true);
    // Also listen for paste locally for debugging (does not replace Word's paste handler)
    // so that if a paste happens on the same page we can show source info clearly.
    document.addEventListener('paste', (e) => {
      try {
        const KEY = '__lastClipboard__';
        const raw = localStorage.getItem(KEY);
        const src = raw ? JSON.parse(raw) : null;
        if (src) {
          console.log(`[clipboard-writer] local PASTE observed -> from=${src.url} title="${src.title}" textSnippet="${(src.text||'').slice(0,200)}" age=${Date.now()-src.ts}ms`);
        }
      } catch (err) {}
    }, true);
  } catch (e) {
    // ignore
  }
})();

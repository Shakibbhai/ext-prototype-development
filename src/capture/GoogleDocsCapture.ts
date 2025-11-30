import { SimpleCaptureManager as CaptureManager } from "./CaptureManager";
import type { CaptureStrategy, CaptureEvent } from "./types";
import { createLogger } from "./logger";

const logger = createLogger("content.injections.googledDocs");

const kGoogleCaptureTag = Symbol("GoogleCaptureTag");
const kGoogleCaptureIdTag = Symbol("GoogleCaptureIdTag");

export class GoogleDocsCapture implements CaptureStrategy {
  private static instances = new Map<string, GoogleDocsCapture>();
  static is(element: any): element is GoogleDocsCapture {
    return !!(element && element[kGoogleCaptureTag]);
  }
  static get(element: any) {
    return this.instances.get(element[kGoogleCaptureIdTag]);
  }

  private static _instance: GoogleDocsCapture;
  static get instance(): GoogleDocsCapture {
    if (!GoogleDocsCapture._instance) {
      GoogleDocsCapture._instance = new GoogleDocsCapture();
    }
    return GoogleDocsCapture._instance;
  }

  private tileObservers = new WeakMap<
    HTMLElement,
    { observer: MutationObserver; callbacks: Set<(tile: HTMLElement) => void> }
  >();

  private observersForCleanup = new Set<MutationObserver>();
  private pageObservers = new Map<HTMLElement, MutationObserver>();

  // new diff strategy to track inputs event agnostic
  private previousText: string = "";
  private isProcessingChange: boolean = false;
  private changeTimeout: number | null = null;

  private constructor() {}

  matches(hostname: string) {
    return hostname.includes("docs.google.com");
  }

  private applyCanvas<R>(cb: (tile: HTMLElement) => R) {
    const tiles = document
      .querySelector(".kix-appview-editor")
      ?.querySelectorAll<HTMLElement>(".kix-canvas-tile-content");

    const results: R[] = [];
    tiles?.forEach((tile) => {
      results.push(cb(tile));
      let entry = this.tileObservers.get(tile);

      if (!entry) {
        const callbacks = new Set<(tile: HTMLElement) => void>([cb]);
        const observer = new MutationObserver(() => {
          callbacks.forEach((fn) => fn(tile));
        });
        observer.observe(tile, { childList: true, subtree: true });

        this.tileObservers.set(tile, { observer, callbacks });
      } else {
        entry.callbacks.add(cb);
      }
    });
    return results;
  }

  highlight(style: Partial<CSSStyleDeclaration>) {
    const border = style.border;
    if (!border) return () => {};
    const prevBorders = new WeakMap();
    this.applyCanvas((tile) => {
      prevBorders.set(tile, tile.style.border);
      tile.style.border = border;
    });
    return () => this.applyCanvas((tile) => (tile.style.border = prevBorders.get(tile)));
  }

  async queryNodes(root: HTMLElement | Document = document) {
    console.log("Capturing from google docs");
    const iframes = root.querySelectorAll<HTMLIFrameElement>(".docs-texteventtarget-iframe");
    iframes.forEach((iframe) => {
      if (!(iframe as any)[kGoogleCaptureTag]) {
        (iframe as any)[kGoogleCaptureTag] = true;
        (iframe as any)[kGoogleCaptureIdTag] = Math.floor(1 + Math.random() * (2_147_483_647 - 1));
        GoogleDocsCapture.instances.set((iframe as any)[kGoogleCaptureIdTag], this);
      }
    });
    return Array.from(iframes);
  }

  public canTrackSelection(doc: Document): boolean {
    return doc.baseURI.includes("docs.google.com/document");
  }

  /**
   * Reconstructs the full text of the document by reading the `aria-label`
   * attributes from the SVG text rectangles and ordering them visually.
   */
  public extractText(): string {
    console.log("📖 [GoogleDocs] extractText() called");
    const rects = this.getAllTextRects();
    console.log("📐 [GoogleDocs] Text rects found:", rects.length);
    const text = rects.map((rectData) => rectData.text).join("\n");
    console.log("📄 [GoogleDocs] Extracted text length:", text.length);
    return text;
  }

  /**
   * Gathers all SVG rects representing text and sorts them in reading order.
   */
  private getAllTextRects(): { text: string; x: number; y: number }[] {
    const allTextRects: { text: string; x: number; y: number; page: number }[] = [];
    const contentTiles = document.querySelectorAll<HTMLDivElement>(
      "div.kix-canvas-tile-content:not(.kix-canvas-tile-selection)",
    );

    contentTiles.forEach((tile, tileIndex) => {
      const rects = tile.querySelectorAll<SVGRectElement>("rect[aria-label]");
      rects.forEach((r) => {
        const transform = r.getAttribute("transform") || "";
        const match = /matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+),([^,]+)\)/.exec(transform);
        if (match) {
          allTextRects.push({
            text: r.getAttribute("aria-label") ?? "",
            x: parseFloat(match[1]),
            y: parseFloat(match[2]),
            page: tileIndex,
          });
        }
      });
    });

    // Sort rects by visual position (top-to-bottom, then left-to-right)
    const Y_TOLERANCE = 5; // Tolerance for slight misalignments in the same line
    allTextRects.sort((a, b) => {
      if (a.page !== b.page) {
        return a.page - b.page;
      }
      if (Math.abs(a.y - b.y) > Y_TOLERANCE) {
        return a.y - b.y;
      }
      return a.x - b.x;
    });

    return allTextRects.map(({ text, x, y }) => ({ text, x, y }));
  }

  /**
   * This is the core of the new strategy. It's triggered when the DOM changes,
   * gets the new text, and compares it to the previous version to find the change.
   */

  private async processChanges() {
    //console.log("🔍 [GoogleDocs] processChanges() called");

    if (this.isProcessingChange) {
      //console.log("⏸️ [GoogleDocs] Already processing, skipping...");
      return;
    }
    this.isProcessingChange = true;

    const newText = this.extractText();
    console.log("📝 [GoogleDocs] Extracted text:", {
      length: newText.length,
      preview: newText.substring(0, 100) + (newText.length > 100 ? "..." : ""),
    });

    if (newText !== this.previousText) {
      //console.log("✨ [GoogleDocs] Change detected! Calculating diff...");
      console.log("📊 [GoogleDocs] Text comparison:", {
        oldLength: this.previousText.length,
        newLength: newText.length,
        oldPreview: this.previousText.substring(0, 50) + "...",
        newPreview: newText.substring(0, 50) + "...",
      });

      //logger.debug("Change detected, calculating diff.");
      const captureEvents = this.calculateDiff(this.previousText, newText);
     // console.log("🎯 [GoogleDocs] Diff calculated, events generated:", captureEvents);

      const captureManager = CaptureManager.instance;
      for (const event of captureEvents) {
        console.log("📤 [GoogleDocs] Processing capture event:", event);
        captureManager.processCaptureEvent(event);
      }
      this.previousText = newText;
      
      // Update live typing display in panel
      this.updateTypingDisplay(newText);
      //console.log("✅ [GoogleDocs] Text state updated");
    } else {
      //console.log("⏭️ [GoogleDocs] No changes detected");
    }

    this.isProcessingChange = false;
    //console.log("🏁 [GoogleDocs] processChanges() completed");
  }

  /**
   * Compares two strings to find the first and last differing characters,
   * then generates `delete` and `insertion` events for that range.
   */
  private calculateDiff(oldStr: string, newStr: string): CaptureEvent[] {
    //console.log("🔬 [GoogleDocs] calculateDiff() started");
    const events: CaptureEvent[] = [];
    const timestamp = Date.now();

    logger.debug({ oldStr, newStr }, "Calculating diff");

    let start = 0;
    while (start < oldStr.length && start < newStr.length && oldStr[start] === newStr[start]) {
      start++;
    }

    let oldEnd = oldStr.length;
    let newEnd = newStr.length;
    while (oldEnd > start && newEnd > start && oldStr[oldEnd - 1] === newStr[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    console.log("📍 [GoogleDocs] Diff range found:", {
      start,
      oldEnd,
      newEnd,
      deletedLength: oldEnd - start,
      insertedLength: newEnd - start,
    });

    logger.debug("Found newStr differs in range %d to %d", start, newEnd);

    const deletedLength = oldEnd - start;
    if (deletedLength > 0) {
      const deleteEvent = {
        type: "delete" as const,
        timestamp,
        pos: start,
        length: deletedLength,
      };
      console.log("🗑️ [GoogleDocs] Delete event created:", deleteEvent);
      events.push(deleteEvent);
    }

    const insertedText = newStr.substring(start, newEnd);
    if (insertedText.length > 0) {
      const insertEvent = {
        type: "insertion" as const,
        timestamp: timestamp + 1,
        pos: start + insertedText.length,
        length: insertedText.length,
        text: insertedText,
      };
      console.log("➕ [GoogleDocs] Insertion event created:", insertEvent, "Text:", insertedText);
      events.push(insertEvent);
    }

    console.log("✅ [GoogleDocs] calculateDiff() completed, total events:", events.length);
    return events;
  }

  /**
   * Sets up a multi-level observer system to efficiently monitor the document
   * for any changes to the rendered text content.
   */
  public setupSelectionTracking(tracker: any, doc: Document): () => void {
    //console.log("🚀 [GoogleDocs] setupSelectionTracking() initialized");

    // Attach copy/paste/cut event listeners
    this.attachClipboardListeners(doc);
    
    // Add visual indicator (green border)
    this.addVisualIndicator();
    
    // Extract and display initial text
    setTimeout(() => {
      const initialText = this.extractText();
      this.previousText = initialText;
      this.updateTypingDisplay(initialText);
      console.log('[GoogleDocs] Initial text extracted and displayed:', initialText.length, 'chars');
    }, 1000);

    const onChangeDetected = () => {
     // console.log("🔔 [GoogleDocs] Change detected in DOM, scheduling processChanges...");
      if (this.changeTimeout) clearTimeout(this.changeTimeout);
      // Debounce changes to avoid excessive processing during rapid typing
      this.changeTimeout = setTimeout(() => this.processChanges(), 150);
    };

    const setupContentObserver = (page: HTMLElement) => {
      if (this.pageObservers.has(page)) return; // Already observing

      const contentTile = page.querySelector<HTMLDivElement>(
        "div.kix-canvas-tile-content:not(.kix-canvas-tile-selection)",
      );

      if (contentTile) {
        console.log("👁️ [GoogleDocs] Attaching content observer to a new page");
        logger.debug("Attaching content observer to a new page.");
        const observer = new MutationObserver(onChangeDetected);
        observer.observe(contentTile, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["aria-label"],
        });
        this.pageObservers.set(page, observer);
        this.observersForCleanup.add(observer);
        console.log("✅ [GoogleDocs] Observer attached successfully");
      }
    };

    const pageObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            (node as HTMLElement).classList.contains("kix-page-paginated")
          ) {
            setupContentObserver(node as HTMLElement);
          }
        });
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE && this.pageObservers.has(node as HTMLElement)) {
            const observer = this.pageObservers.get(node as HTMLElement);
            if (observer) {
              observer.disconnect();
              this.observersForCleanup.delete(observer);
              this.pageObservers.delete(node as HTMLElement);
              logger.debug("Cleaned up observer for removed page.");
            }
          }
        });
      }
    });

    const attachPageObserver = (editorRoot: HTMLElement) => {
     // console.log("🎯 [GoogleDocs] Editor root found. Attaching page observer");
      logger.debug("Editor root found. Attaching page observer.");
      // Initial scan for existing pages
      const existingPages = editorRoot.querySelectorAll<HTMLElement>(".kix-page-paginated");
      //console.log("📄 [GoogleDocs] Existing pages found:", existingPages.length);
      existingPages.forEach(setupContentObserver);
      // Watch for new pages being added
      pageObserver.observe(editorRoot, { childList: true });
      this.observersForCleanup.add(pageObserver);

      // Capture initial state
      this.previousText = this.extractText();
      console.log("💾 [GoogleDocs] Initial text state captured:", {
        length: this.previousText.length,
        preview: this.previousText.substring(0, 100) + "...",
      });
    };

    // Bootstrap Observer: Waits for the main editor to appear in the DOM.
    const editorContent = doc.querySelector<HTMLElement>(".kix-rotatingtilemanager-content");
    if (editorContent) {
      attachPageObserver(editorContent);
    } else {
      const bootstrapObserver = new MutationObserver(() => {
        const editorContent = doc.querySelector<HTMLElement>(".kix-rotatingtilemanager-content");
        if (editorContent) {
          bootstrapObserver.disconnect();
          this.observersForCleanup.delete(bootstrapObserver);
          attachPageObserver(editorContent);
        }
      });
      bootstrapObserver.observe(doc.body, { childList: true, subtree: true });
      this.observersForCleanup.add(bootstrapObserver);
    }

    // Return a cleanup function
    return () => {
      if (this.changeTimeout) clearTimeout(this.changeTimeout);
      for (const observer of this.observersForCleanup) {
        observer.disconnect();
      }
      this.observersForCleanup.clear();
      this.pageObservers.clear();
      logger.debug("All Google Docs observers have been disconnected.");
    };
  }

  public initialize(): void {
    this.setupSelectionTracking(null, document);
  }

  public cleanup(): void {
    if (this.changeTimeout) clearTimeout(this.changeTimeout);
    for (const observer of this.observersForCleanup) {
      observer.disconnect();
    }
    this.observersForCleanup.clear();
    this.pageObservers.clear();
    logger.debug("All Google Docs observers have been disconnected.");
  }

  // DO NOT CALL - whole architecture is screwed but fix that later
  public async getSelectionRange(doc: Document): Promise<{ start: number; end: number } | null> {
    return null;
  }

  public async resolveInsertion(event: Event, doc: Document): Promise<number | null> {
    return null;
  }

  // ============================================================================
  // Clipboard Event Handling (Copy/Paste/Cut)
  // ============================================================================

  private attachClipboardListeners(doc: Document): void {
    const pasteHandler = (e: Event) => this.handleClipboardEvent(e as ClipboardEvent);
    const copyHandler = (e: Event) => this.handleClipboardEvent(e as ClipboardEvent);
    const cutHandler = (e: Event) => this.handleClipboardEvent(e as ClipboardEvent);

    doc.addEventListener('paste', pasteHandler, true);
    doc.addEventListener('copy', copyHandler, true);
    doc.addEventListener('cut', cutHandler, true);

    console.log('[GoogleDocs] Attached clipboard event listeners to document');
    logger.debug('Attached clipboard event listeners to Google Docs');
  }

  private handleClipboardEvent(event: ClipboardEvent): void {
    console.log('[GoogleDocs] Clipboard event detected:', event.type);
    
    const clipboardData = event.clipboardData;
    let data = '';

    if (clipboardData) {
      const text = clipboardData.getData('text/plain');
      const html = clipboardData.getData('text/html');
      data = text ? `text: ${text.substring(0, 100)}` : `html length: ${html.length}`;
    }

    console.log('[GoogleDocs] Clipboard data:', data);
    logger.debug({ type: event.type, data }, 'Clipboard event');

    // On paste, try to read stored clipboard metadata
    if (event.type === 'paste') {
      const KEY = '__lastClipboard__';
      const chromeApi: any = (globalThis as any).chrome || (window as any).chrome || null;
      const pastedText = clipboardData ? (clipboardData.getData('text/plain') || '') : '';

      const handleSrc = (src: any) => {
        try {
          if (!src) return;

          const isExternalSource = src.url && !src.url.includes(location.hostname);
          const age = src.ts ? `${Math.max(0, Date.now() - src.ts)}ms` : 'unknown';
          const title = src.title || '';
          const url = src.url || '';
          const copiedText = src.text || '';

          console.log(
            `%c[Clipboard Source Info]%c\n` +
            `From: ${url || 'unknown'}\n` +
            `Title: %c${title}%c\n` +
            `Copied: "${copiedText}"\n` +
            `Pasted: "${pastedText}"\n` +
            `Age: ${age}`,
            'color: #4285f4; font-weight: bold; font-size: 14px;',
            'color: inherit;',
            'text-decoration: underline; font-weight: bold;',
            'text-decoration: none; font-weight: normal;'
          );

          if (isExternalSource) {
            const panel = (window as any).wordCapturePanel;
            if (panel && typeof panel.addClipboardSource === 'function') {
              panel.addClipboardSource({
                url,
                title,
                copied: copiedText,
                pasted: pastedText,
                age,
                timestamp: Date.now()
              });
            }
          }
        } catch (e) {
          logger.debug(e, 'Error handling clipboard source');
        }
      };

      if (chromeApi?.storage?.local?.get) {
        chromeApi.storage.local.get([KEY], (res: any) => {
          const src = res && res[KEY] ? res[KEY] : null;
          handleSrc(src);

          if (!src) {
            try {
              const raw = localStorage.getItem(KEY);
              handleSrc(raw ? JSON.parse(raw) : null);
            } catch (e) {}
          }
        });
      } else {
        try {
          const raw = localStorage.getItem(KEY);
          handleSrc(raw ? JSON.parse(raw) : null);
        } catch (e) {}
      }
    }

    // Handle copy/cut - store metadata
    if (event.type === 'copy' || event.type === 'cut') {
      this.handleCopyCutEvent(event);
    }
  }

  private handleCopyCutEvent(event: ClipboardEvent): void {
    try {
      const clipboardData = event.clipboardData;
      let text = '';

      if (clipboardData) {
        text = clipboardData.getData('text/plain') || '';
      }

      if (!text) {
        const sel = document.getSelection ? document.getSelection() : null;
        text = sel ? sel.toString() : '';
      }

      const payload = {
        text: (text || '').slice(0, 2000),
        url: location.href,
        title: document.title || '',
        ts: Date.now()
      };

      this.storeLastClipboard(payload);

      console.log(
        `[clipboard-writer] stored __lastClipboard__ -> url=${payload.url} title="${payload.title}" textSnippet="${(payload.text || '').slice(0, 200)}"`
      );
    } catch (e) {
      logger.debug(e, 'Error in copy/cut handler');
    }
  }

  private storeLastClipboard(payload: { text: string; url: string; title: string; ts: number }): void {
    const KEY = '__lastClipboard__';
    try {
      const chromeApi: any = (globalThis as any).chrome || (window as any).chrome || null;
      if (chromeApi?.storage?.local?.set) {
        const obj: any = {};
        obj[KEY] = payload;
        chromeApi.storage.local.set(obj, () => {});
      }
    } catch (e) {}

    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  // ============================================================================
  // Visual Indicator (Green Border)
  // ============================================================================

  private addVisualIndicator(): void {
    logger.debug('Adding visual indicator to Google Docs');
    
    // Find the main Google Docs editor container
    const editorContainer = document.querySelector('.kix-appview-editor') as HTMLElement;
    
    if (!editorContainer) {
      logger.debug('Could not find Google Docs editor container');
      return;
    }

    logger.debug('Found Google Docs editor container, applying border');

    // Apply green border to indicate extension is active
    editorContainer.style.border = '3px solid #00a67e';
    editorContainer.style.boxShadow = '0 0 10px rgba(0, 166, 126, 0.3)';
    editorContainer.style.outline = 'none';

    // Add focus/blur effects
    const focusHandler = () => {
      editorContainer.style.boxShadow = '0 0 15px rgba(0, 166, 126, 0.5)';
    };
    const blurHandler = () => {
      editorContainer.style.boxShadow = '0 0 10px rgba(0, 166, 126, 0.3)';
    };

    document.addEventListener('focusin', focusHandler);
    document.addEventListener('focusout', blurHandler);

    logger.debug('Visual indicator added successfully');
  }

  private updateTypingDisplay(text: string): void {
    try {
      console.log('[GoogleDocs] updateTypingDisplay called, text length:', text.length);
      const panel = (window as any).wordCapturePanel;
      console.log('[GoogleDocs] Panel exists:', !!panel, 'updateTypedText exists:', !!(panel?.updateTypedText));
      
      if (panel && typeof panel.updateTypedText === 'function') {
        panel.updateTypedText(text);
        console.log('[GoogleDocs] Successfully updated typing display in panel');
        logger.debug('Updated typing display in panel', { textLength: text.length });
      } else {
        console.warn('[GoogleDocs] Panel or updateTypedText method not available');
      }
    } catch (e) {
      console.error('[GoogleDocs] Error updating typing display:', e);
      logger.debug(e, 'Error updating typing display');
    }
  }
}

// ---------------------------------------------------------
// Clipboard provenance logger for Google Docs
// - Logs a concise line on paste with pasted text, original source URL,
//   original copied text (truncated), and age since copy
// ---------------------------------------------------------
(function attachGoogleDocsPasteLogger() {
  try {
    // Hostname guard: prevent running on non-Google Docs pages (Word was showing GoogleDocs logs)
    if (!/(^|\.)docs\.google\.com$/i.test(location.hostname)) return;

    const w = window as any;
    if (w.__gd_paste_logger_attached) return;
    w.__gd_paste_logger_attached = true;

    const chromeAny: any = (globalThis as any).chrome;
    const key = "__lastClipboard__";

    const getLastClipboard = async (): Promise<
      { text: string; url: string; title?: string; ts: number } | null
    > => {
      try {
        if (chromeAny?.storage?.local) {
          return await new Promise((resolve) =>
            chromeAny.storage.local.get([key], (items: any) => resolve(items?.[key] ?? null)),
          );
        }
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    const truncate = (s: string, n = 200) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");

    // Helper to show floating paste indicator in Google Docs
    const showGoogleDocsPasteUI = (pasted: string, meta: { text: string; url: string; title?: string; ts: number } | null) => {
      if (!meta || !pasted) return;

      try {
        // Create floating indicator
        const indicator = document.createElement('div');
        indicator.style.cssText = `
          position: fixed;
          top: 80px;
          right: 20px;
          background: #ffeb3b;
          color: #000;
          padding: 8px 16px;
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          z-index: 9999;
          cursor: pointer;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          font-weight: 500;
          max-width: 200px;
          text-align: center;
          transition: all 0.2s ease;
        `;
        indicator.textContent = '📋 PASTED TEXT';
        indicator.title = 'Click to view paste source';

        // Create tooltip (shows on hover, above indicator)
        const tooltip = document.createElement('div');
        tooltip.style.cssText = `
          display: none;
          position: fixed;
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 8px 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          z-index: 10000;
          max-width: 300px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          pointer-events: none;
        `;

        const age = Date.now() - meta.ts;
        const ageStr = age < 60000 ? `${Math.floor(age / 1000)}s ago` : `${Math.floor(age / 60000)}m ago`;

        tooltip.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 4px; color: #ff6b6b; font-size: 10px;">
            PASTED FROM EXTERNAL SOURCE
          </div>
          ${meta.title ? `<div style="margin-bottom: 3px;"><strong>From:</strong> ${truncate(meta.title, 80)}</div>` : ''}
          <div style="color: #666; font-size: 11px;">Copied ${ageStr}</div>
        `;

        document.body.appendChild(indicator);
        document.body.appendChild(tooltip);

        // Show tooltip above on hover
        indicator.addEventListener('mouseenter', () => {
          const rect = indicator.getBoundingClientRect();
          tooltip.style.display = 'block';
          tooltip.style.left = `${rect.left}px`;
          tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`; // 8px gap above
        });

        indicator.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });

        // Click handler to open extension sidebar
        indicator.addEventListener('click', () => {
          window.postMessage({
            type: 'COPILOT_SHOW_PASTE_DETAILS',
            data: {
              pastedText: pasted,
              sourceUrl: meta.url,
              sourceTitle: meta.title || 'Unknown',
              copiedAt: meta.ts,
              originalText: meta.text
            }
          }, '*');
        });

        // Auto-hide indicator after 10 seconds
        setTimeout(() => {
          indicator.style.opacity = '0';
          setTimeout(() => {
            indicator.remove();
            tooltip.remove();
          }, 300);
        }, 10000);

      } catch (err) {
        console.error('[GoogleDocs Paste UI] Failed to show indicator:', err);
      }
    };

    const logPaste = async (sourceEvt?: ClipboardEvent) => {
      try {
        let pasted = sourceEvt?.clipboardData?.getData("text/plain") ?? "";
        if (!pasted) {
          // Fallback: async clipboard API after paste (may be blocked without permissions)
          try {
            pasted = await navigator.clipboard.readText();
          } catch {}
        }
        const meta = await getLastClipboard();
        const parts: string[] = [];
        parts.push(
          `[Clipboard] PASTE -> GoogleDocs | pasted="${truncate(pasted)}" length=${pasted.length}`,
        );
        if (meta) {
          parts.push(
            `| from=${meta.url} | copied="${truncate(meta.text)}" srcAge=${Math.max(
              0,
              Date.now() - meta.ts,
            )}ms`,
          );
        }
        console.log(parts.join(" "));

        // Show floating paste UI
        showGoogleDocsPasteUI(pasted, meta);
      } catch {
        // ignore
      }
    };

    // Attach listeners on multiple targets (document, window, editor root)
    const attachListeners = (target: EventTarget) => {
      target.addEventListener(
        "paste",
        (e: any) => {
          // microtask to let internal handlers run first
          Promise.resolve().then(() => logPaste(e as ClipboardEvent));
        },
        { capture: true },
      );
      target.addEventListener(
        "keydown",
        (e: any) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
            setTimeout(() => logPaste(), 30); // fallback
          }
        },
        { capture: true },
      );
    };

    attachListeners(document);
    attachListeners(window);

    // Try editor root if present
    const editorRoot = document.querySelector(
      ".kix-appview-editor, .kix-rotatingtilemanager-content",
    );
    if (editorRoot) attachListeners(editorRoot);

    // Attach inside typing iframe (paste may fire there)
    const connectIframe = (iframe: HTMLIFrameElement) => {
      try {
        if ((iframe as any).__gd_iframe_paste_attached) return;
        const cw = iframe.contentWindow;
        if (!cw) return;
        (iframe as any).__gd_iframe_paste_attached = true;
        attachListeners(cw);
      } catch {}
    };
    document
      .querySelectorAll<HTMLIFrameElement>(".docs-texteventtarget-iframe")
      .forEach(connectIframe);
    // Observe future iframes
    const mo = new MutationObserver((muts) => {
      muts.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (
            n instanceof HTMLIFrameElement &&
            n.classList.contains("docs-texteventtarget-iframe")
          ) {
            connectIframe(n);
          }
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch {
    // ignore
  }
})();
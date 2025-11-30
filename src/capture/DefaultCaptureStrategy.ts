import type { DOMObserver } from "./observer";
import { SimpleCaptureManager as CaptureManager } from "./CaptureManager";
import type { CaptureStrategy } from "./types";

// =========================================================
// FRAMEWORKS
// =========================================================
function detectFramework(el: HTMLElement) {
  if (el.classList.contains("ProseMirror")) return "ProseMirror";
  if (el.classList.contains("ql-editor")) return "Quill";
  if (el.hasAttribute("data-slate-editor")) return "Slate";
  if (el.hasAttribute("data-contents")) return "DraftJS";

  // Custom/fallback signatures
  if (el.dataset.editorType === "prosemirror") return "ProseMirror";
  if (el.dataset.editor === "prosemirror") return "ProseMirror";

  return "unknown-contenteditable";
}

function isSingleLine(el: HTMLElement) {
  const style = getComputedStyle(el);

  // ARIA role
  const role = el.getAttribute("role");
  const isMultiline = el.getAttribute("aria-multiline") === "true";

  // Approx line-height check
  const lineHeight = parseFloat(style.lineHeight) || 16;
  const singleLineHeight = lineHeight * 1.5;
  const isSingleLineHeight = el.clientHeight <= singleLineHeight;

  // CSS nowrap check
  const isNoWrap = style.whiteSpace.includes("nowrap");

  if (
    (role === "textbox" && !isMultiline) || // role says single-line
    isNoWrap || // forced single-line
    isSingleLineHeight // visually one-line
  ) {
    return true; // skip single-line editors
  }

  return false;
}

// =========================================================
// MAIN
// =========================================================
interface Editor {
  element: HTMLElement;
  type: string;
  framework: string;
}

export class DefaultCaptureStrategy implements CaptureStrategy {
  isDefault = true;
  queryCache: Editor[];

  private static _instance: DefaultCaptureStrategy;
  static get instance(): DefaultCaptureStrategy {
    if (!DefaultCaptureStrategy._instance) {
      DefaultCaptureStrategy._instance = new DefaultCaptureStrategy();
    }
    return DefaultCaptureStrategy._instance;
  }

  private constructor() {
    this.queryCache = [];
  }

  matches(hostname: string) {
    // fallback strategy (works everywhere not explicitly handled)
    return true;
  }

  highlight(style: Partial<CSSStyleDeclaration>, target: HTMLElement) {
    const border = style.border;
    if (!border) return () => {};
    const prev = target.style.border;
    target.style.border = border;
    return () => (target.style.border = prev);
  }

  async queryNodes(root: HTMLElement | Document = document) {
    return Promise.all([
      Promise.resolve(root.querySelectorAll<HTMLTextAreaElement>("textarea")).then((c) =>
        Array.from(c).reduce((acc, el) => {
          const rows = parseInt(el.getAttribute("rows") || "2", 10);
          if (rows <= 1) return acc;

          this.queryCache.push({
            element: el,
            type: "textarea",
            framework: "native",
          });

          acc.push(el);
          return acc;
        }, [] as HTMLTextAreaElement[]),
      ),
      Promise.resolve(root.querySelectorAll<HTMLDivElement>("[contenteditable='true']")).then((c) =>
        Array.from(c).reduce((acc, el) => {
          if (el.closest("[contenteditable='true']") !== el) return acc;

          const framework = detectFramework(el);
          if (!framework.includes("ProseMirror") && isSingleLine(el)) return acc;
          this.queryCache.push({
            element: el,
            type: "contenteditable",
            framework,
          });

          acc.push(el);
          return acc;
        }, [] as HTMLDivElement[]),
      ),
    ]).then((nodes) => nodes.flat());
  }

  public canTrackSelection(doc: Document): boolean {
    const element = doc.activeElement;

    if (!(element instanceof HTMLElement)) return false;

    if (element instanceof HTMLTextAreaElement) {
      // filter single-line textareas as in queryNodes
      const rows = parseInt(element.getAttribute("rows") || "2", 10);
      return rows > 1;
    }
    if (element.isContentEditable) {
      if (element.closest("[contenteditable='true']") !== element) {
        return false;
      }

      const framework = detectFramework(element);
      if (!framework.includes("ProseMirror") && isSingleLine(element)) {
        return false; // skip single-line editors again
      }
      return true;
    }
    return false;
  }

  extractText(node: HTMLElement) {
    let content;
    if (node instanceof HTMLIFrameElement) {
      content = node.contentDocument?.body?.innerText ?? "";
    } else if (node instanceof HTMLTextAreaElement) {
      const text = node.value.substring(node.selectionStart ?? 0, node.selectionEnd ?? 0);
      content = text;
    } else {
      content = node.innerText || node.textContent || "";
    }
    return content.trim();
  }

  // used to find absolute pos across all nodes in contenteditable, accounting for newlines
  private reconstructTextWithNewlines(element: HTMLElement, range?: Range): string {
    let text = "";
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null,
    );

    let currentNode = walker.nextNode();
    while (currentNode) {
      if (range && currentNode === range.endContainer && currentNode.nodeType === Node.TEXT_NODE) {
        text += currentNode.textContent?.substring(0, range.endOffset) ?? "";
        break;
      }

      if (currentNode.nodeType === Node.TEXT_NODE) {
        text += currentNode.textContent;
      } else if (currentNode.nodeName === "DIV" || currentNode.nodeName === "P") {
        if (
          currentNode.previousSibling ||
          currentNode.parentElement !== element ||
          text.length > 0
        ) {
          // prevent newline at start
          text += "\n";
        }
      }

      currentNode = walker.nextNode();
    }

    return text;
  }

  public async resolveInsertion(
    event: Event,
    element: HTMLElement | Document,
  ): Promise<number | null> {
    const activeElement =
      element.nodeType === Node.DOCUMENT_NODE
        ? ((element as Document).activeElement as HTMLElement)
        : (element as HTMLElement);

    if (!activeElement) return null;

    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
      return activeElement.selectionStart;
    }
    if (activeElement.isContentEditable) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(activeElement);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        return this.reconstructTextWithNewlines(activeElement, preCaretRange).length;
      }
    }
    return null;
  }

  public async getSelectionRange(
    element: HTMLElement | Document,
  ): Promise<{ start: number; end: number } | null> {
    const activeElement =
      element.nodeType === Node.DOCUMENT_NODE
        ? ((element as Document).activeElement as HTMLElement)
        : (element as HTMLElement);

    if (!activeElement) return null;

    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
      return {
        start: activeElement.selectionStart ?? 0,
        end: activeElement.selectionEnd ?? 0,
      };
    }
    if (activeElement.isContentEditable) {
      const selection = activeElement.ownerDocument.defaultView?.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(activeElement);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const start = this.reconstructTextWithNewlines(activeElement, preSelectionRange).length;
        const end = start + selection.toString().length;
        return { start, end };
      }
    }
    return null;
  }

  public setupSelectionTracking(tracker: DOMObserver<any, any>, doc: Document): () => void {
    tracker.observe(doc);
    // Attach copy/paste/cut event listeners
    this.attachClipboardListeners(doc);
    // Attach input listeners for live typing display
    this.attachInputListeners(doc);
    return () => {};
  }

  public initialize(): void {
    // Add visual indicator after a short delay to ensure DOM is ready
    setTimeout(() => this.addVisualIndicator(), 500);
  }

  public cleanup(): void {
    // No-op for default strategy
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

    console.log('[DefaultCapture] Attached clipboard event listeners');
  }

  private handleClipboardEvent(event: ClipboardEvent): void {
    const clipboardData = event.clipboardData;
    let data = '';

    if (clipboardData) {
      const text = clipboardData.getData('text/plain');
      const html = clipboardData.getData('text/html');
      data = text ? `text: ${text.substring(0, 100)}` : `html length: ${html.length}`;
    }

    console.log('[DefaultCapture] Clipboard event:', event.type, data);

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
            'color: #9333ea; font-weight: bold; font-size: 14px;',
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
          console.log('[DefaultCapture] Error handling clipboard source:', e);
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
      console.log('[DefaultCapture] Error in copy/cut handler:', e);
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
    console.log('[DefaultCapture] Adding visual indicator');
    
    // Find all contenteditable elements and textareas that we're tracking
    const editableElements = document.querySelectorAll('[contenteditable="true"], textarea');
    
    let indicatorAdded = false;
    
    editableElements.forEach((element) => {
      const el = element as HTMLElement;
      
      // Skip single-line editors
      if (el instanceof HTMLTextAreaElement) {
        const rows = parseInt(el.getAttribute('rows') || '2', 10);
        if (rows <= 1) return;
      } else if (el.isContentEditable) {
        // Skip if it's nested inside another contenteditable
        if (el.closest('[contenteditable="true"]') !== el) return;
        
        // Skip single-line contenteditable
        const style = getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight) || 16;
        const singleLineHeight = lineHeight * 1.5;
        if (el.clientHeight <= singleLineHeight) return;
      }
      
      // Apply green border to indicate extension is active
      el.style.border = '3px solid #00a67e';
      el.style.boxShadow = '0 0 10px rgba(0, 166, 126, 0.3)';
      el.style.outline = 'none';
      
      // Add focus/blur effects
      const focusHandler = () => {
        el.style.boxShadow = '0 0 15px rgba(0, 166, 126, 0.5)';
      };
      const blurHandler = () => {
        el.style.boxShadow = '0 0 10px rgba(0, 166, 126, 0.3)';
      };
      
      el.addEventListener('focus', focusHandler);
      el.addEventListener('blur', blurHandler);
      
      indicatorAdded = true;
    });
    
    if (indicatorAdded) {
      console.log('[DefaultCapture] Visual indicator added to editable elements');
    } else {
      console.log('[DefaultCapture] No suitable elements found for visual indicator');
    }
  }

  private attachInputListeners(doc: Document): void {
    // Attach input listeners to track typing
    const inputHandler = (e: Event) => this.handleInputEvent(e);
    
    doc.addEventListener('input', inputHandler, true);
    doc.addEventListener('keyup', inputHandler, true);
    
    console.log('[DefaultCapture] Attached input event listeners for typing display');
  }

  private handleInputEvent(event: Event): void {
    const target = event.target as HTMLElement;
    
    // Check if target is a tracked editor
    if (target instanceof HTMLTextAreaElement) {
      const rows = parseInt(target.getAttribute('rows') || '2', 10);
      if (rows <= 1) return;
      this.updateTypingDisplay(target.value);
    } else if (target.isContentEditable) {
      if (target.closest('[contenteditable="true"]') !== target) return;
      const text = target.innerText || target.textContent || '';
      this.updateTypingDisplay(text);
    }
  }

  private updateTypingDisplay(text: string): void {
    try {
      const panel = (window as any).wordCapturePanel;
      if (panel && typeof panel.updateTypedText === 'function') {
        panel.updateTypedText(text);
      }
    } catch (e) {
      console.log('[DefaultCapture] Error updating typing display:', e);
    }
  }
}

// ---------------------------------------------------------
// Global clipboard tracker (runs on all pages via default capture)
// - Records the last copy/cut text and source URL in storage
// - msWord injection reads this on paste to display source page
// ---------------------------------------------------------
(function attachGlobalClipboardTracker() {
  const w = window as any;
  const chromeAny: any = (globalThis as any).chrome;
  const key = "__lastClipboard__";

  const setLastClipboard = async (payload: {
    text: string;
    url: string;
    title?: string;
    ts: number;
  }) => {
    try {
      if (chromeAny?.storage?.local) {
        await new Promise<void>((resolve) =>
          chromeAny.storage.local.set({ [key]: payload }, () => resolve()),
        );
      } else {
        localStorage.setItem(key, JSON.stringify(payload));
      }
    } catch {}
  };

  const truncate = (s: string, n = 1000) => (s.length > n ? s.slice(0, n) + "…" : s);

  const handler = () => {
    try {
      const text = document.getSelection()?.toString() || "";
      if (!text) return;
      setLastClipboard({
        text: truncate(text),
        url: location.href,
        title: document.title,
        ts: Date.now(),
      });
    } catch {}
  };

  document.addEventListener("copy", handler, { capture: false });
  document.addEventListener("cut", handler, { capture: false });
})();

// ---------------------------------------------------------
// Global paste provenance logger (generic pages)
// - Logs one concise line on paste using stored `__lastClipboard__`
// - Skips known specialized domains to avoid duplicate logs
// ---------------------------------------------------------
(function attachDefaultPasteProvenanceLogger() {
  try {
    const host = location.hostname;
    // Skip when specialized strategies handle paste logging themselves
    if (/\.officeapps\.live\.com$/i.test(host) || /(^|\.)docs\.google\.com$/i.test(host)) {
      return;
    }

    const w = window as any;
    if (w.__default_paste_logger_attached) return;
    w.__default_paste_logger_attached = true;

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

    document.addEventListener(
      "paste",
      async (e: ClipboardEvent) => {
        try {
          const pasted = e.clipboardData?.getData("text/plain") ?? "";
          const meta = await getLastClipboard();
          const parts: string[] = [];
          parts.push(
            `[Clipboard] PASTE -> Default | pasted="${truncate(pasted)}" length=${pasted.length}`,
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
        } catch {
          // ignore
        }
      },
      { capture: true },
    );
  } catch {
    // ignore
  }
})();

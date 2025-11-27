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
    return () => {};
  }

  public initialize(): void {
    // No-op for default strategy
  }

  public cleanup(): void {
    // No-op for default strategy
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

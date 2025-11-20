// ============================================
// Word Capture Extension - Bundled Content Script
// Generated: 2025-11-20T12:32:06.912Z
// ============================================

(function() {
    'use strict';

// ============================================
// types.js
// ============================================



// ============================================
// CaptureManager.js
// ============================================
class SimpleCaptureManager {
    static get instance() {
        if (!SimpleCaptureManager._instance) {
            SimpleCaptureManager._instance = new SimpleCaptureManager();
        }
        return SimpleCaptureManager._instance;
    }
    constructor() {
        this.strategies = new Set();
        console.log('[Capture Manager] Initialized');
    }
    register(strategy) {
        this.strategies.add(strategy);
        console.log('[Capture Manager] Strategy registered');
    }
    autoSelect(hostname = location.hostname) {
        console.log('[Capture Manager] Auto-selecting strategy for:', hostname);
        for (const strategy of this.strategies) {
            if (strategy.matches(hostname)) {
                this.activeStrategy = strategy;
                console.log('[Capture Manager] Strategy selected');
                return strategy;
            }
        }
        console.log('[Capture Manager] No matching strategy found');
        return null;
    }
    getActiveStrategy() {
        return this.activeStrategy;
    }
}


// ============================================
// WordCaptureStrategy.js
// ============================================
class WordCaptureStrategy {
    // Singleton pattern
    static get instance() {
        if (!WordCaptureStrategy._instance) {
            WordCaptureStrategy._instance = new WordCaptureStrategy();
        }
        return WordCaptureStrategy._instance;
    }
    constructor() {
        // State management
        this.editorElement = null;
        this.editorDocument = null;
        this.observerActive = false;
        this.mutationObserver = null;
        this.eventListenersAttached = false;
        this.cleanupFunctions = [];
        // Text tracking for diff-based capture
        this.previousText = '';
        this.isProcessingChange = false;
        this.queryCache = [];
        this.log('WordCaptureStrategy constructed');
    }
    // CaptureStrategy Interface Implementation
    matches(hostname) {
        const wordDomains = [
            'office.com',
            'officeapps.live.com',
            'sharepoint.com',
            'live.com',
            'microsoft.com'
        ];
        return wordDomains.some(domain => hostname.includes(domain));
    }
    async queryNodes(root = document) {
        this.log('Querying for Word editor nodes...');
        if (!this.editorElement) {
            const result = await this.locateEditor();
            if (result) {
                this.editorElement = result.element;
                this.editorDocument = result.document;
                this.queryCache.push(this.editorElement);
            }
        }
        return this.editorElement ? [this.editorElement] : [];
    }
    extractText(node) {
        if (!node)
            return '';
        return node.textContent || '';
    }
    /* NEED TO UPDATE THIS METHOD **/
    highlight(style, el) {
        const target = el || this.editorElement;
        if (!target) {
            this.log('No element to highlight');
            return () => { };
        }
        // Use the correct document context
        const searchDoc = this.editorDocument || target.ownerDocument || document;
        let pageContent = null;
        // Try to find PageContent container
        pageContent = target.closest('.PageContent');
        if (!pageContent) {
            pageContent = searchDoc.querySelector('.PageContent');
        }
        if (!pageContent) {
            pageContent = searchDoc.getElementById('PageContent');
        }
        if (!pageContent) {
            const candidates = searchDoc.querySelectorAll('[class*="PageContent"], [id*="PageContent"]');
            if (candidates.length > 0) {
                pageContent = candidates[0];
            }
        }
        if (!pageContent) {
            pageContent = target;
        }
        // Store original styles
        const originalBorder = pageContent.style.border;
        const originalBoxShadow = pageContent.style.boxShadow;
        // Apply styles
        if (style.border)
            pageContent.style.border = style.border;
        if (style.boxShadow)
            pageContent.style.boxShadow = style.boxShadow;
        this.log('Visual highlight applied');
        // Return cleanup function
        return () => {
            pageContent.style.border = originalBorder;
            pageContent.style.boxShadow = originalBoxShadow;
        };
    }
    /* NEED TO UPDATE THIS METHOD **/
    setupSelectionTracking(tracker, doc) {
        this.log('Setting up selection tracking');
        if (!this.eventListenersAttached && this.editorElement) {
            this.attachEventListeners();
        }
        this.setupMutationObserver();
        return () => this.cleanup();
    }
    canTrackSelection(doc) {
        return doc.baseURI.includes('office.com') ||
            doc.baseURI.includes('officeapps.live.com');
    }
    async resolveInsertion(event, element) {
        return null;
    }
    /** NEED TO LOOK INTO THIS */
    async getSelectionRange(element) {
        try {
            const doc = element instanceof Document ? element : element.ownerDocument;
            if (!doc)
                return null;
            const selection = doc.getSelection();
            if (!selection || selection.rangeCount === 0)
                return null;
            const range = selection.getRangeAt(0);
            return {
                start: range.startOffset,
                end: range.endOffset
            };
        }
        catch (e) {
            return null;
        }
    }
    // ============================================================================
    // Word-Specific Implementation
    // ============================================================================
    async initialize() {
        this.log('Initializing Word Capture Strategy');
        this.log(`Context: ${window === window.top ? 'TOP FRAME' : 'IFRAME'}`);
        this.log(`URL: ${window.location.href}`);
        if (!this.matches(window.location.hostname)) {
            this.log('URL does not match Word Online domains');
            return;
        }
        if (window !== window.top) {
            this.log('Running in iframe - searching locally');
            const directEditor = this.findEditorInCurrentDocument();
            if (directEditor) {
                this.editorElement = directEditor;
                this.editorDocument = document;
                this.attachEventListeners();
                this.setupMutationObserver();
                this.log('Successfully attached to editor in iframe');
                return;
            }
        }
        await this.findEditorWithRetry();
    }
    async findEditorWithRetry() {
        const maxAttempts = 20;
        const retryInterval = 500;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            this.log(`Search attempt ${attempt}/${maxAttempts}`);
            const result = await this.locateEditor();
            if (result) {
                this.editorElement = result.element;
                this.editorDocument = result.document;
                this.log('Editor found!', this.editorElement);
                this.attachEventListeners();
                this.setupMutationObserver();
                this.log('Successfully attached to editor');
                return;
            }
            if (attempt < maxAttempts) {
                await this.sleep(retryInterval);
            }
        }
        this.log(`Failed to find editor after ${maxAttempts} attempts`);
        this.logDebugInfo();
    }
    async locateEditor() {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        this.log(`Found ${iframes.length} iframes`);
        for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc)
                    continue;
                const editableElements = iframeDoc.querySelectorAll('[contenteditable="true"]');
                for (const el of Array.from(editableElements)) {
                    const htmlEl = el;
                    if (this.isMainEditor(htmlEl)) {
                        this.log(`Found main editor in iframe ${i + 1}`);
                        return { element: htmlEl, document: iframeDoc };
                    }
                }
            }
            catch (e) {
                continue;
            }
        }
        this.log('Checking main document');
        const editableElements = document.querySelectorAll('[contenteditable="true"]');
        for (const el of Array.from(editableElements)) {
            const htmlEl = el;
            if (this.isMainEditor(htmlEl)) {
                this.log('Found main editor in main document');
                return { element: htmlEl, document };
            }
        }
        const selectors = [
            '#PageContent [contenteditable="true"]',
            '.PageContent [contenteditable="true"]',
            '[data-ot="editor"]',
            '[role="textbox"]',
            '.OutlineElement',
            '#WACViewPanel_EditingElement',
            '[aria-label*="document"]'
        ];
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.isContentEditable) {
                    this.log(`Found with selector: ${selector}`);
                    return { element, document };
                }
                for (const iframe of iframes) {
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (!iframeDoc)
                            continue;
                        const element = iframeDoc.querySelector(selector);
                        if (element && element.isContentEditable) {
                            this.log(`Found in iframe with selector: ${selector}`);
                            return { element, document: iframeDoc };
                        }
                    }
                    catch (e) {
                        continue;
                    }
                }
            }
            catch (e) {
                continue;
            }
        }
        return null;
    }
    findEditorInCurrentDocument() {
        this.log('Searching in current document');
        const pageContent = document.getElementById('PageContent') ||
            document.querySelector('.PageContent') ||
            document.querySelector('[id*="PageContent"]');
        if (pageContent) {
            this.log('Found PageContent div');
            const editable = pageContent.querySelector('[contenteditable="true"]');
            if (editable) {
                this.log('Found contenteditable inside PageContent');
                return editable;
            }
            if (pageContent.isContentEditable) {
                this.log('PageContent itself is editable');
                return pageContent;
            }
        }
        const editableElements = document.querySelectorAll('[contenteditable="true"]');
        this.log(`Found ${editableElements.length} contenteditable elements`);
        for (const el of Array.from(editableElements)) {
            const htmlEl = el;
            this.log(`  Checking: ${htmlEl.tagName}.${htmlEl.className} id="${htmlEl.id}"`);
            const isInPageContent = htmlEl.closest('#PageContent') ||
                htmlEl.closest('.PageContent') ||
                htmlEl.id === 'PageContent';
            if (isInPageContent) {
                this.log('Found editor inside PageContent');
                return htmlEl;
            }
            const rect = htmlEl.getBoundingClientRect();
            this.log(`  Size: ${rect.width}x${rect.height}`);
            if (rect.width > 50 && rect.height > 30) {
                this.log('Found viable editor element (relaxed check)');
                return htmlEl;
            }
        }
        const textboxes = document.querySelectorAll('[role="textbox"]');
        this.log(`Found ${textboxes.length} textbox elements`);
        for (const el of Array.from(textboxes)) {
            const htmlEl = el;
            const rect = htmlEl.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 30) {
                this.log('Found textbox element');
                return htmlEl;
            }
        }
        this.log('No editor found in current document');
        return null;
    }
    isMainEditor(element) {
        const rect = element.getBoundingClientRect();
        if (rect.width < 200 || rect.height < 100) {
            return false;
        }
        const className = element.className || '';
        const role = element.getAttribute('role');
        const ariaLabel = element.getAttribute('aria-label');
        if (className.includes('doc') ||
            className.includes('WACView') ||
            className.includes('PageContent') ||
            role === 'textbox' ||
            ariaLabel?.toLowerCase().includes('document') ||
            element.getAttribute('data-ot') === 'editor') {
            return true;
        }
        let parent = element.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
            const parentClass = parent.className || '';
            if (parentClass.includes('WACView') ||
                parentClass.includes('doc-content') ||
                parentClass.includes('PageContent') ||
                parent.id.includes('WACView') ||
                parent.id.includes('PageContent')) {
                return true;
            }
            parent = parent.parentElement;
        }
        return rect.width > 400 && rect.height > 300;
    }
    attachEventListeners() {
        if (!this.editorElement || !this.editorDocument) {
            this.log('Cannot attach listeners: editor not found');
            return;
        }
        if (this.eventListenersAttached) {
            this.log('Event listeners already attached');
            return;
        }
        this.log('Attaching event listeners to editor');
        const keydownHandler = (e) => this.handleKeyEvent(e);
        const keyupHandler = (e) => this.handleKeyEvent(e);
        const keypressHandler = (e) => this.handleKeyEvent(e);
        this.editorElement.addEventListener('keydown', keydownHandler);
        this.editorElement.addEventListener('keyup', keyupHandler);
        this.editorElement.addEventListener('keypress', keypressHandler);
        const beforeinputHandler = (e) => this.handleInputEvent(e);
        const inputHandler = (e) => this.handleInputEvent(e);
        this.editorElement.addEventListener('beforeinput', beforeinputHandler);
        this.editorElement.addEventListener('input', inputHandler);
        const pasteHandler = (e) => this.handleClipboardEvent(e);
        const copyHandler = (e) => this.handleClipboardEvent(e);
        const cutHandler = (e) => this.handleClipboardEvent(e);
        this.editorElement.addEventListener('paste', pasteHandler);
        this.editorElement.addEventListener('copy', copyHandler);
        this.editorElement.addEventListener('cut', cutHandler);
        this.eventListenersAttached = true;
        this.observerActive = true;
        this.cleanupFunctions.push(() => {
            if (this.editorElement) {
                this.editorElement.removeEventListener('keydown', keydownHandler);
                this.editorElement.removeEventListener('keyup', keyupHandler);
                this.editorElement.removeEventListener('keypress', keypressHandler);
                this.editorElement.removeEventListener('beforeinput', beforeinputHandler);
                this.editorElement.removeEventListener('input', inputHandler);
                this.editorElement.removeEventListener('paste', pasteHandler);
                this.editorElement.removeEventListener('copy', copyHandler);
                this.editorElement.removeEventListener('cut', cutHandler);
            }
        });
        // Also attach global copy/cut listeners on the document so we can persist
        // last-copy metadata (url, title, snippet) to storage. This helps when the
        // user copies text on other pages/frames that the clipboard-writer script
        // may not have been able to reach.
        try {
            const globalCopy = (e) => this.handleCopyCutEvent(e);
            const globalCut = (e) => this.handleCopyCutEvent(e);
            document.addEventListener('copy', globalCopy, true);
            document.addEventListener('cut', globalCut, true);
            this.cleanupFunctions.push(() => {
                document.removeEventListener('copy', globalCopy, true);
                document.removeEventListener('cut', globalCut, true);
            });
        }
        catch (e) {
            // ignore if attaching global listeners fails due to CSP or other issues
        }
        this.addVisualIndicator();
        this.log('Event listeners attached successfully');
    }
    setupMutationObserver() {
        if (!this.editorElement) {
            this.log('Cannot setup observer: no editor element');
            return;
        }
        if (this.mutationObserver) {
            this.log('MutationObserver already active');
            return;
        }
        this.mutationObserver = new MutationObserver((mutations) => {
            // Mutation observer active but not logging events
            // Mutations are tracked silently
            // for (const mutation of mutations) {
            //   if (mutation.type === 'characterData' || mutation.type === 'childList') {
            //     this.logEvent({
            //       type: 'mutation',
            //       timestamp: Date.now(),
            //       targetTag: (mutation.target as HTMLElement).tagName || 'TEXT_NODE',
            //       data: mutation.type === 'characterData' 
            //         ? (mutation.target.textContent || '').substring(0, 100) 
            //         : `${mutation.addedNodes.length} added, ${mutation.removedNodes.length} removed`
            //     });
            //   }
            // }
        });
        this.mutationObserver.observe(this.editorElement, {
            characterData: true,
            characterDataOldValue: true,
            childList: true,
            subtree: true
        });
        this.log('MutationObserver active');
    }
    addVisualIndicator() {
        if (!this.editorElement)
            return;
        const searchDoc = this.editorDocument || this.editorElement.ownerDocument || document;
        console.log("object ", searchDoc);
        let pageContent = null;
        this.log(`Searching for PageContent in ${searchDoc === document ? 'main document' : 'iframe document'}`);
        console.log("object " + `Searching for PageContent in ${searchDoc === document ? 'main document' : 'iframe document'}`);
        pageContent = this.editorElement.closest('.PageContent');
        if (pageContent) {
            this.log('Found PageContent via closest()');
            console.log("object " + 'Found PageContent via closest()');
        }
        if (!pageContent) {
            pageContent = searchDoc.querySelector('.PageContent');
            if (pageContent) {
                this.log('Found PageContent via querySelector in iframe');
                console.log("object " + 'Found PageContent via closest()');
            }
        }
        if (!pageContent) {
            pageContent = searchDoc.getElementById('PageContent');
            if (pageContent) {
                this.log('Found PageContent via getElementById');
                console.log("object " + 'Found PageContent via getElementById');
            }
        }
        if (!pageContent) {
            const candidates = searchDoc.querySelectorAll('[class*="PageContent"], [id*="PageContent"]');
            if (candidates.length > 0) {
                pageContent = candidates[0];
                this.log(`Found PageContent candidate: ${pageContent.className}`);
                console.log("object " + `Found PageContent candidate: ${pageContent.className}`);
            }
        }
        if (!pageContent) {
            this.log('Could not find PageContent div, using editor element');
            console.log("object " + 'Could not find PageContent div, using editor element');
            pageContent = this.editorElement;
        }
        else {
            this.log(`Highlighting PageContent: class="${pageContent.className}" id="${pageContent.id}"`);
            console.log("object " + `Highlighting PageContent: class="${pageContent.className}" id="${pageContent.id}"`);
        }
        pageContent.style.border = '3px solid #00a67e';
        pageContent.style.boxShadow = '0 0 10px rgba(0, 166, 126, 0.3)';
        pageContent.style.outline = 'none';
        const focusHandler = () => {
            pageContent.style.boxShadow = '0 0 15px rgba(0, 166, 126, 0.5)';
        };
        const blurHandler = () => {
            pageContent.style.boxShadow = '0 0 10px rgba(0, 166, 126, 0.3)';
        };
        this.editorElement.addEventListener('focus', focusHandler);
        this.editorElement.addEventListener('blur', blurHandler);
        this.cleanupFunctions.push(() => {
            if (this.editorElement) {
                this.editorElement.removeEventListener('focus', focusHandler);
                this.editorElement.removeEventListener('blur', blurHandler);
            }
            if (pageContent) {
                pageContent.style.border = '';
                pageContent.style.boxShadow = '';
                pageContent.style.outline = '';
            }
        });
        this.log('Visual indicator added');
        console.log("object " + 'Visual indicator added');
    }
    isWithinEditor(target) {
        if (!target)
            return false;
        if (this.editorElement && (target === this.editorElement || this.editorElement.contains(target))) {
            return true;
        }
        let element = target;
        while (element) {
            if (element.id === 'PageContent' ||
                element.className?.includes('PageContent') ||
                element.className?.includes('OutlineElement') ||
                element.className?.includes('doc-content')) {
                return true;
            }
            element = element.parentElement;
        }
        return false;
    }
    handleKeyEvent(event) {
        const target = event.target;
        if (!this.isWithinEditor(target))
            return;
        this.logEvent({
            type: event.type,
            timestamp: Date.now(),
            key: event.key,
            targetTag: target.tagName,
            selection: this.getSelectionRangeSync()
        });
    }
    handleInputEvent(event) {
        const inputEvent = event;
        const target = event.target;
        if (!this.isWithinEditor(target))
            return;
        // removed temporarily for log simplification
        // this.logEvent({
        //   type: event.type as 'input' | 'beforeinput',
        //   timestamp: Date.now(),
        //   inputType: inputEvent.inputType,
        //   data: inputEvent.data || '',
        //   targetTag: target.tagName,
        //   selection: this.getSelectionRangeSync()
        // });
    }
    handleClipboardEvent(event) {
        const target = event.target;
        if (!this.isWithinEditor(target))
            return;
        const clipboardData = event.clipboardData;
        let data = '';
        if (clipboardData) {
            const text = clipboardData.getData('text/plain');
            const html = clipboardData.getData('text/html');
            data = text ? `text: ${text.substring(0, 100)}` : `html length: ${html.length}`;
        }
        this.logEvent({
            type: event.type,
            timestamp: Date.now(),
            data,
            targetTag: target.tagName,
            selection: this.getSelectionRangeSync()
        });
        // On paste, try to read stored clipboard metadata and log it for visibility
        if (event.type === 'paste') {
            try {
                const KEY = '__lastClipboard__';
                const chromeApi = globalThis.chrome || window.chrome || null;
                const handleSrc = (src) => {
                    try {
                        if (!src)
                            return;
                        const age = src.ts ? `${Math.max(0, Date.now() - src.ts)}ms` : 'unknown';
                        const title = src.title || '';
                        const url = src.url || '';
                        const copiedText = src.text ? src.text.substring(0, 200) : '';
                        // Get the pasted text from clipboard
                        const pastedText = clipboardData ? (clipboardData.getData('text/plain') || '').substring(0, 200) : '';
                        console.log(`%c[Clipboard Source Info]%c\n` +
                            `From: ${url || 'unknown'}\n` +
                            `Title: %c${title}%c\n` +
                            `Copied: "${copiedText}"\n` +
                            `Pasted: "${pastedText}"\n` +
                            `Age: ${age}`, 'color: #00a67e; font-weight: bold; font-size: 14px;', 'color: inherit;', 'text-decoration: underline; font-weight: bold;', 'text-decoration: none; font-weight: normal;');
                    }
                    catch (e) { }
                };
                if (chromeApi?.storage?.local?.get) {
                    try {
                        chromeApi.storage.local.get([KEY], (res) => {
                            const src = res && res[KEY] ? res[KEY] : null;
                            handleSrc(src);
                            // Fallback to localStorage if chrome storage is empty
                            if (!src) {
                                try {
                                    const raw = localStorage.getItem(KEY);
                                    handleSrc(raw ? JSON.parse(raw) : null);
                                }
                                catch (e) { }
                            }
                        });
                    }
                    catch (e) {
                        try {
                            const raw = localStorage.getItem(KEY);
                            handleSrc(raw ? JSON.parse(raw) : null);
                        }
                        catch (e2) { }
                    }
                }
                else {
                    try {
                        const raw = localStorage.getItem(KEY);
                        handleSrc(raw ? JSON.parse(raw) : null);
                    }
                    catch (e) { }
                }
            }
            catch (e) { }
        }
    }
    /**
     * Handle copy / cut events and store minimal metadata so paste handler can
     * later log where the content came from.
     */
    handleCopyCutEvent(event) {
        try {
            const clipboardData = event.clipboardData;
            let text = '';
            if (clipboardData) {
                text = clipboardData.getData('text/plain') || '';
            }
            if (!text) {
                // fall back to selection
                try {
                    const sel = document.getSelection ? document.getSelection() : null;
                    text = sel ? sel.toString() : '';
                }
                catch (e) {
                    text = '';
                }
            }
            const payload = {
                text: (text || '').slice(0, 2000),
                url: location.href,
                title: document.title || '',
                ts: Date.now()
            };
            this.storeLastClipboard(payload);
            try {
                console.log(`[clipboard-writer] stored __lastClipboard__ -> url=${payload.url} title="${payload.title}" textSnippet="${(payload.text || '').slice(0, 200)}"`);
            }
            catch (e) { }
        }
        catch (e) {
            // ignore
        }
    }
    storeLastClipboard(payload) {
        const KEY = '__lastClipboard__';
        try {
            const chromeApi = globalThis.chrome || window.chrome || null;
            if (chromeApi?.storage?.local?.set) {
                try {
                    const obj = {};
                    obj[KEY] = payload;
                    chromeApi.storage.local.set(obj, () => { });
                }
                catch (e) { }
            }
        }
        catch (e) { }
        try {
            localStorage.setItem(KEY, JSON.stringify(payload));
        }
        catch (e) { }
    }
    getSelectionRangeSync() {
        if (!this.editorDocument)
            return undefined;
        try {
            const selection = this.editorDocument.getSelection();
            if (!selection || selection.rangeCount === 0)
                return undefined;
            const range = selection.getRangeAt(0);
            return {
                start: range.startOffset,
                end: range.endOffset
            };
        }
        catch (e) {
            return undefined;
        }
    }
    logEvent(event) {
        const style = 'color: #00a67e; font-weight: bold;';
        console.log('%c[Word Capture Event]', style, event);
    }
    cleanup() {
        this.log('Cleaning up');
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        this.cleanupFunctions.forEach(fn => fn());
        this.cleanupFunctions = [];
        this.observerActive = false;
        this.eventListenersAttached = false;
        this.log('Cleanup completed');
    }
    // Utility methods
    log(message, ...args) {
        console.log(`[Word Capture] ${message}`, ...args);
    }
    logDebugInfo() {
        console.log('[Word Capture] 💡 Debug Info:');
        console.log('  - Total iframes:', document.querySelectorAll('iframe').length);
        console.log('  - Contenteditable elements:', document.querySelectorAll('[contenteditable="true"]').length);
        console.log('  - Current frame:', window === window.top ? 'TOP' : 'IFRAME');
        console.log('  - URL:', window.location.href);
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // Public getters for debugging
    getEditor() {
        return this.editorElement;
    }
    getDocument() {
        return this.editorDocument;
    }
    isActive() {
        return this.observerActive;
    }
}


// ============================================
// index.js (main entry point)
// ============================================
/**
 * Main entry point for Word Capture Extension
 * Initializes the capture strategy and manager
 */

// Log script load with detailed context
console.log('[Word Capture] Script loaded!', new Date().toISOString());
console.log('[Word Capture] Context:', window === window.top ? 'TOP FRAME' : 'IFRAME');
console.log('[Word Capture] URL:', window.location.href);
console.log('[Word Capture] Hostname:', window.location.hostname);
console.log('[Word Capture] Document ready state:', document.readyState);
// Log if we're in an iframe with useful info
if (window !== window.top) {
    console.log('[Word Capture] IFRAME DETECTED - This is where the editor should be!');
    console.log('[Word Capture] Looking for .PageContent and contenteditable elements...');
    // Immediate check for PageContent
    const pageContentCheck = document.querySelector('.PageContent');
    console.log('[Word Capture] .PageContent found:', !!pageContentCheck, pageContentCheck);
    const editableCheck = document.querySelectorAll('[contenteditable="true"]');
    console.log('[Word Capture] contenteditable elements found:', editableCheck.length);
}
// Initialize strategy and manager
const wordStrategy = WordCaptureStrategy.instance;
const captureManager = SimpleCaptureManager.instance;
// Register strategy
captureManager.register(wordStrategy);
// Auto-select and initialize if we match
const selectedStrategy = captureManager.autoSelect();
if (selectedStrategy) {
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            selectedStrategy.initialize();
        });
    }
    else {
        selectedStrategy.initialize();
    }
}
// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (selectedStrategy) {
        selectedStrategy.cleanup();
    }
});
// Export for debugging
window.wordCapture = {
    strategy: wordStrategy,
    manager: captureManager,
    getEditor: () => wordStrategy.getEditor(),
    getDocument: () => wordStrategy.getDocument(),
    isActive: () => wordStrategy.isActive(),
    reinitialize: () => wordStrategy.initialize()
};
console.log('[Word Capture] Global wordCapture object created');
console.log('[Word Capture] Script initialization complete');
console.log('[Word Capture] Access via: window.wordCapture');


})();
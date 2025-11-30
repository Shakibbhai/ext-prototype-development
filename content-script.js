// ============================================
// Word Capture Extension - Bundled Content Script
// Generated: 2025-11-27T09:45:16.979Z
// ============================================

(function() {
    'use strict';

// ============================================
// logger.js
// ============================================
// This is a placeholder for the logger functionality.
// In a real scenario, this would proxy to the background script.
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (LogLevel = {}));
const createLoggerInternal = (namespace) => {
    const log = (level, ...args) => {
        const levelStr = LogLevel[level];
        console.log(`[${levelStr}] ${namespace}:`, ...args);
    };
    return {
        debug: (...args) => log(LogLevel.DEBUG, ...args),
        info: (...args) => log(LogLevel.INFO, ...args),
        warn: (...args) => log(LogLevel.WARN, ...args),
        error: (...args) => log(LogLevel.ERROR, ...args),
    };
};
function createLogger(namespace) {
    return createLoggerInternal(namespace);
}


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
    processCaptureEvent(event) {
        console.log('🎯 [Capture Manager] Processing capture event:', {
            type: event.type,
            pos: event.pos,
            length: event.length,
            text: event.text?.substring(0, 50) + (event.text && event.text.length > 50 ? '...' : ''),
            timestamp: new Date(event.timestamp).toISOString()
        });
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
        // Track last extracted text for reference
        this.previousEditorText = '';
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
        console.log('[Word Capture] Editor element:', this.editorElement);
        console.log('[Word Capture] Editor has content:', !!this.editorElement.textContent);
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
        let pageContent = null;
        this.log(`Searching for page container in ${searchDoc === document ? 'main document' : 'iframe document'}`);
        // 1) Try PagesContainer first (main MS Word container)
        pageContent = this.editorElement.closest('.PageContent');
        if (pageContent) {
            this.log('Found PagesContainer via querySelector');
        }
        if (!pageContent) {
            pageContent = searchDoc.getElementById('PagesContainer');
            if (pageContent) {
                this.log('Found PagesContainer via getElementById');
            }
        }
        // 2) Try PageContent as fallback
        if (!pageContent) {
            pageContent = searchDoc.querySelector('.PageContent');
            if (pageContent) {
                this.log('Found PageContent via querySelector');
            }
        }
        if (!pageContent) {
            pageContent = searchDoc.getElementById('PageContent');
            if (pageContent) {
                this.log('Found PageContent via getElementById');
            }
        }
        // 3) Try partial matches
        if (!pageContent) {
            const candidates = searchDoc.querySelectorAll('[class*="PagesContainer"], [class*="PageContent"], [id*="PagesContainer"], [id*="PageContent"]');
            if (candidates.length > 0) {
                pageContent = candidates[0];
                this.log(`Found container candidate: ${pageContent.className}`);
            }
        }
        // // 4) Look for WACViewPanel
        // if (!pageContent) {
        //   const wacPanel = searchDoc.querySelector('[id*="WACViewPanel"]') as HTMLElement | null;
        //   if (wacPanel) {
        //     pageContent = wacPanel;
        //     this.log('Found WACViewPanel');
        //   }
        // }
        // 5) Climb ancestors to find page container (skip editorElement and its direct parent)
        if (!pageContent && this.editorElement.parentElement) {
            let current = this.editorElement.parentElement.parentElement; // Skip direct parent
            let bestCandidate = null;
            while (current && current !== searchDoc.body) {
                const rect = current.getBoundingClientRect();
                // Ensure it's NOT the editor itself and is page-sized
                if (current !== this.editorElement && rect.width > 600 && rect.height > 400) {
                    bestCandidate = current;
                    break;
                }
                current = current.parentElement;
            }
            if (bestCandidate) {
                pageContent = bestCandidate;
                this.log(`Found parent container: ${bestCandidate.className}`);
            }
        }
        // CRITICAL: Never apply border to editorElement itself - skip if that's all we found
        if (!pageContent || pageContent === this.editorElement || pageContent.contains(this.editorElement) === false) {
            this.log('Could not find proper outer container (would be editorElement), skipping border');
            return;
        }
        this.log(`Highlighting page container: class="${pageContent.className}" id="${pageContent.id}"`);
        // Apply border ONLY to the page container
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
        // Update typing display on keyup to capture all changes including backspace
        if (event.type === 'keyup') {
            this.updateTypingDisplay();
        }
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
        // Update real-time typing display in UI panel
        if (event.type === 'input') {
            this.updateTypingDisplay();
        }
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
    updateTypingDisplay() {
        try {
            const panel = window.wordCapturePanel;
            if (panel && typeof panel.updateTypedText === 'function' && this.editorElement) {
                // Try multiple extraction methods
                let text = '';
                // Method 1: innerText (best for preserving formatting)
                if (this.editorElement.innerText) {
                    text = this.editorElement.innerText;
                }
                // Method 2: textContent fallback
                else if (this.editorElement.textContent) {
                    text = this.editorElement.textContent;
                }
                // Method 3: innerHTML as last resort, strip tags
                else if (this.editorElement.innerHTML) {
                    text = this.editorElement.innerHTML.replace(/<[^>]*>/g, ' ').trim();
                }
                console.log('[Word Capture] Extracted text length:', text.length, 'Preview:', text.substring(0, 50));
                panel.updateTypedText(text);
                this.previousEditorText = text;
            }
            else {
                console.warn('[Word Capture] Panel or editor not available', {
                    hasPanel: !!panel,
                    hasUpdateMethod: !!(panel && panel.updateTypedText),
                    hasEditor: !!this.editorElement
                });
            }
        }
        catch (e) {
            console.error('[Word Capture] Error in updateTypingDisplay:', e);
        }
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
                const pastedText = clipboardData ? (clipboardData.getData('text/plain') || '') : '';
                const handleSrc = (src) => {
                    try {
                        if (!src)
                            return;
                        // Check if paste is from external source (not from Word document itself)
                        const isExternalSource = src.url && !src.url.includes(location.hostname);
                        const age = src.ts ? `${Math.max(0, Date.now() - src.ts)}ms` : 'unknown';
                        const title = src.title || '';
                        const url = src.url || '';
                        const copiedText = src.text || '';
                        console.log(`%c[Clipboard Source Info]%c\n` +
                            `From: ${url || 'unknown'}\n` +
                            `Title: %c${title}%c\n` +
                            `Copied: "${copiedText}"\n` +
                            `Pasted: "${pastedText}"\n` +
                            `Age: ${age}`, 'color: #00a67e; font-weight: bold; font-size: 14px;', 'color: inherit;', 'text-decoration: underline; font-weight: bold;', 'text-decoration: none; font-weight: normal;');
                        // Only process external source with custom highlighted insertion
                        if (isExternalSource) {
                            try {
                                // Prevent default paste so Word doesn't insert unwrapped content
                                event.preventDefault();
                            }
                            catch (e) { }
                            // Insert highlighted span at current selection
                            this.insertHighlightedPaste(pastedText, url);
                            // Add to floating panel
                            const panel = window.wordCapturePanel;
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
                            // Refresh typing display after insertion
                            this.updateTypingDisplay();
                        }
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
    // Direct insertion of highlighted pasted text at current selection
    insertHighlightedPaste(pastedText, sourceUrl) {
        try {
            if (!this.editorDocument || !this.editorElement || !pastedText)
                return;
            const doc = this.editorDocument;
            const selection = doc.getSelection();
            if (!selection || selection.rangeCount === 0)
                return;
            const range = selection.getRangeAt(0);
            // Delete current selection contents (default paste target)
            try {
                range.deleteContents();
            }
            catch (e) { }
            const span = doc.createElement('span');
            span.style.backgroundColor = '#fef3c7';
            span.style.borderBottom = '2px solid #fbbf24';
            span.style.cursor = 'pointer';
            span.style.padding = '0 2px';
            span.title = sourceUrl ? `Open source: ${sourceUrl}` : 'Pasted text';
            if (sourceUrl)
                span.dataset.sourceUrl = sourceUrl;
            // Preserve line breaks by inserting <br> elements
            const lines = pastedText.split(/\r?\n/);
            lines.forEach((line, idx) => {
                span.appendChild(doc.createTextNode(line));
                if (idx < lines.length - 1)
                    span.appendChild(doc.createElement('br'));
            });
            span.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (sourceUrl)
                    window.open(sourceUrl, '_blank');
            });
            range.insertNode(span);
            // Move caret after inserted span
            range.setStartAfter(span);
            range.setEndAfter(span);
            selection.removeAllRanges();
            selection.addRange(range);
            this.log('Inserted highlighted pasted text span');
        }
        catch (e) {
            this.log('Failed to insert highlighted paste: ' + e);
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
// GoogleDocsCapture.js
// ============================================


const logger = createLogger("content.injections.googledDocs");
const kGoogleCaptureTag = Symbol("GoogleCaptureTag");
const kGoogleCaptureIdTag = Symbol("GoogleCaptureIdTag");
class GoogleDocsCapture {
    static is(element) {
        return !!(element && element[kGoogleCaptureTag]);
    }
    static get(element) {
        return this.instances.get(element[kGoogleCaptureIdTag]);
    }
    static get instance() {
        if (!GoogleDocsCapture._instance) {
            GoogleDocsCapture._instance = new GoogleDocsCapture();
        }
        return GoogleDocsCapture._instance;
    }
    constructor() {
        this.tileObservers = new WeakMap();
        this.observersForCleanup = new Set();
        this.pageObservers = new Map();
        // new diff strategy to track inputs event agnostic
        this.previousText = "";
        this.isProcessingChange = false;
        this.changeTimeout = null;
    }
    matches(hostname) {
        return hostname.includes("docs.google.com");
    }
    applyCanvas(cb) {
        const tiles = document
            .querySelector(".kix-appview-editor")
            ?.querySelectorAll(".kix-canvas-tile-content");
        const results = [];
        tiles?.forEach((tile) => {
            results.push(cb(tile));
            let entry = this.tileObservers.get(tile);
            if (!entry) {
                const callbacks = new Set([cb]);
                const observer = new MutationObserver(() => {
                    callbacks.forEach((fn) => fn(tile));
                });
                observer.observe(tile, { childList: true, subtree: true });
                this.tileObservers.set(tile, { observer, callbacks });
            }
            else {
                entry.callbacks.add(cb);
            }
        });
        return results;
    }
    highlight(style) {
        const border = style.border;
        if (!border)
            return () => { };
        const prevBorders = new WeakMap();
        this.applyCanvas((tile) => {
            prevBorders.set(tile, tile.style.border);
            tile.style.border = border;
        });
        return () => this.applyCanvas((tile) => (tile.style.border = prevBorders.get(tile)));
    }
    async queryNodes(root = document) {
        console.log("Capturing from google docs");
        const iframes = root.querySelectorAll(".docs-texteventtarget-iframe");
        iframes.forEach((iframe) => {
            if (!iframe[kGoogleCaptureTag]) {
                iframe[kGoogleCaptureTag] = true;
                iframe[kGoogleCaptureIdTag] = Math.floor(1 + Math.random() * (2147483647 - 1));
                GoogleDocsCapture.instances.set(iframe[kGoogleCaptureIdTag], this);
            }
        });
        return Array.from(iframes);
    }
    canTrackSelection(doc) {
        return doc.baseURI.includes("docs.google.com/document");
    }
    /**
     * Reconstructs the full text of the document by reading the `aria-label`
     * attributes from the SVG text rectangles and ordering them visually.
     */
    extractText() {
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
    getAllTextRects() {
        const allTextRects = [];
        const contentTiles = document.querySelectorAll("div.kix-canvas-tile-content:not(.kix-canvas-tile-selection)");
        contentTiles.forEach((tile, tileIndex) => {
            const rects = tile.querySelectorAll("rect[aria-label]");
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
    async processChanges() {
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
        }
        else {
            //console.log("⏭️ [GoogleDocs] No changes detected");
        }
        this.isProcessingChange = false;
        //console.log("🏁 [GoogleDocs] processChanges() completed");
    }
    /**
     * Compares two strings to find the first and last differing characters,
     * then generates `delete` and `insertion` events for that range.
     */
    calculateDiff(oldStr, newStr) {
        //console.log("🔬 [GoogleDocs] calculateDiff() started");
        const events = [];
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
                type: "delete",
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
                type: "insertion",
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
    setupSelectionTracking(tracker, doc) {
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
            if (this.changeTimeout)
                clearTimeout(this.changeTimeout);
            // Debounce changes to avoid excessive processing during rapid typing
            this.changeTimeout = setTimeout(() => this.processChanges(), 150);
        };
        const setupContentObserver = (page) => {
            if (this.pageObservers.has(page))
                return; // Already observing
            const contentTile = page.querySelector("div.kix-canvas-tile-content:not(.kix-canvas-tile-selection)");
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
                    if (node.nodeType === Node.ELEMENT_NODE &&
                        node.classList.contains("kix-page-paginated")) {
                        setupContentObserver(node);
                    }
                });
                mutation.removedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && this.pageObservers.has(node)) {
                        const observer = this.pageObservers.get(node);
                        if (observer) {
                            observer.disconnect();
                            this.observersForCleanup.delete(observer);
                            this.pageObservers.delete(node);
                            logger.debug("Cleaned up observer for removed page.");
                        }
                    }
                });
            }
        });
        const attachPageObserver = (editorRoot) => {
            // console.log("🎯 [GoogleDocs] Editor root found. Attaching page observer");
            logger.debug("Editor root found. Attaching page observer.");
            // Initial scan for existing pages
            const existingPages = editorRoot.querySelectorAll(".kix-page-paginated");
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
        const editorContent = doc.querySelector(".kix-rotatingtilemanager-content");
        if (editorContent) {
            attachPageObserver(editorContent);
        }
        else {
            const bootstrapObserver = new MutationObserver(() => {
                const editorContent = doc.querySelector(".kix-rotatingtilemanager-content");
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
            if (this.changeTimeout)
                clearTimeout(this.changeTimeout);
            for (const observer of this.observersForCleanup) {
                observer.disconnect();
            }
            this.observersForCleanup.clear();
            this.pageObservers.clear();
            logger.debug("All Google Docs observers have been disconnected.");
        };
    }
    initialize() {
        this.setupSelectionTracking(null, document);
    }
    cleanup() {
        if (this.changeTimeout)
            clearTimeout(this.changeTimeout);
        for (const observer of this.observersForCleanup) {
            observer.disconnect();
        }
        this.observersForCleanup.clear();
        this.pageObservers.clear();
        logger.debug("All Google Docs observers have been disconnected.");
    }
    // DO NOT CALL - whole architecture is screwed but fix that later
    async getSelectionRange(doc) {
        return null;
    }
    async resolveInsertion(event, doc) {
        return null;
    }
    // ============================================================================
    // Clipboard Event Handling (Copy/Paste/Cut)
    // ============================================================================
    attachClipboardListeners(doc) {
        const pasteHandler = (e) => this.handleClipboardEvent(e);
        const copyHandler = (e) => this.handleClipboardEvent(e);
        const cutHandler = (e) => this.handleClipboardEvent(e);
        doc.addEventListener('paste', pasteHandler, true);
        doc.addEventListener('copy', copyHandler, true);
        doc.addEventListener('cut', cutHandler, true);
        console.log('[GoogleDocs] Attached clipboard event listeners to document');
        logger.debug('Attached clipboard event listeners to Google Docs');
    }
    handleClipboardEvent(event) {
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
            const chromeApi = globalThis.chrome || window.chrome || null;
            const pastedText = clipboardData ? (clipboardData.getData('text/plain') || '') : '';
            const handleSrc = (src) => {
                try {
                    if (!src)
                        return;
                    const isExternalSource = src.url && !src.url.includes(location.hostname);
                    const age = src.ts ? `${Math.max(0, Date.now() - src.ts)}ms` : 'unknown';
                    const title = src.title || '';
                    const url = src.url || '';
                    const copiedText = src.text || '';
                    console.log(`%c[Clipboard Source Info]%c\n` +
                        `From: ${url || 'unknown'}\n` +
                        `Title: %c${title}%c\n` +
                        `Copied: "${copiedText}"\n` +
                        `Pasted: "${pastedText}"\n` +
                        `Age: ${age}`, 'color: #4285f4; font-weight: bold; font-size: 14px;', 'color: inherit;', 'text-decoration: underline; font-weight: bold;', 'text-decoration: none; font-weight: normal;');
                    if (isExternalSource) {
                        const panel = window.wordCapturePanel;
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
                }
                catch (e) {
                    logger.debug(e, 'Error handling clipboard source');
                }
            };
            if (chromeApi?.storage?.local?.get) {
                chromeApi.storage.local.get([KEY], (res) => {
                    const src = res && res[KEY] ? res[KEY] : null;
                    handleSrc(src);
                    if (!src) {
                        try {
                            const raw = localStorage.getItem(KEY);
                            handleSrc(raw ? JSON.parse(raw) : null);
                        }
                        catch (e) { }
                    }
                });
            }
            else {
                try {
                    const raw = localStorage.getItem(KEY);
                    handleSrc(raw ? JSON.parse(raw) : null);
                }
                catch (e) { }
            }
        }
        // Handle copy/cut - store metadata
        if (event.type === 'copy' || event.type === 'cut') {
            this.handleCopyCutEvent(event);
        }
    }
    handleCopyCutEvent(event) {
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
            console.log(`[clipboard-writer] stored __lastClipboard__ -> url=${payload.url} title="${payload.title}" textSnippet="${(payload.text || '').slice(0, 200)}"`);
        }
        catch (e) {
            logger.debug(e, 'Error in copy/cut handler');
        }
    }
    storeLastClipboard(payload) {
        const KEY = '__lastClipboard__';
        try {
            const chromeApi = globalThis.chrome || window.chrome || null;
            if (chromeApi?.storage?.local?.set) {
                const obj = {};
                obj[KEY] = payload;
                chromeApi.storage.local.set(obj, () => { });
            }
        }
        catch (e) { }
        try {
            localStorage.setItem(KEY, JSON.stringify(payload));
        }
        catch (e) { }
    }
    // ============================================================================
    // Visual Indicator (Green Border)
    // ============================================================================
    addVisualIndicator() {
        logger.debug('Adding visual indicator to Google Docs');
        // Find the main Google Docs editor container
        const editorContainer = document.querySelector('.kix-appview-editor');
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
    updateTypingDisplay(text) {
        try {
            console.log('[GoogleDocs] updateTypingDisplay called, text length:', text.length);
            const panel = window.wordCapturePanel;
            console.log('[GoogleDocs] Panel exists:', !!panel, 'updateTypedText exists:', !!(panel?.updateTypedText));
            if (panel && typeof panel.updateTypedText === 'function') {
                panel.updateTypedText(text);
                console.log('[GoogleDocs] Successfully updated typing display in panel');
                logger.debug('Updated typing display in panel', { textLength: text.length });
            }
            else {
                console.warn('[GoogleDocs] Panel or updateTypedText method not available');
            }
        }
        catch (e) {
            console.error('[GoogleDocs] Error updating typing display:', e);
            logger.debug(e, 'Error updating typing display');
        }
    }
}
GoogleDocsCapture.instances = new Map();
// ---------------------------------------------------------
// Clipboard provenance logger for Google Docs
// - Logs a concise line on paste with pasted text, original source URL,
//   original copied text (truncated), and age since copy
// ---------------------------------------------------------
(function attachGoogleDocsPasteLogger() {
    try {
        // Hostname guard: prevent running on non-Google Docs pages (Word was showing GoogleDocs logs)
        if (!/(^|\.)docs\.google\.com$/i.test(location.hostname))
            return;
        const w = window;
        if (w.__gd_paste_logger_attached)
            return;
        w.__gd_paste_logger_attached = true;
        const chromeAny = globalThis.chrome;
        const key = "__lastClipboard__";
        const getLastClipboard = async () => {
            try {
                if (chromeAny?.storage?.local) {
                    return await new Promise((resolve) => chromeAny.storage.local.get([key], (items) => resolve(items?.[key] ?? null)));
                }
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            }
            catch {
                return null;
            }
        };
        const truncate = (s, n = 200) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");
        // Helper to show floating paste indicator in Google Docs
        const showGoogleDocsPasteUI = (pasted, meta) => {
            if (!meta || !pasted)
                return;
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
            }
            catch (err) {
                console.error('[GoogleDocs Paste UI] Failed to show indicator:', err);
            }
        };
        const logPaste = async (sourceEvt) => {
            try {
                let pasted = sourceEvt?.clipboardData?.getData("text/plain") ?? "";
                if (!pasted) {
                    // Fallback: async clipboard API after paste (may be blocked without permissions)
                    try {
                        pasted = await navigator.clipboard.readText();
                    }
                    catch { }
                }
                const meta = await getLastClipboard();
                const parts = [];
                parts.push(`[Clipboard] PASTE -> GoogleDocs | pasted="${truncate(pasted)}" length=${pasted.length}`);
                if (meta) {
                    parts.push(`| from=${meta.url} | copied="${truncate(meta.text)}" srcAge=${Math.max(0, Date.now() - meta.ts)}ms`);
                }
                console.log(parts.join(" "));
                // Show floating paste UI
                showGoogleDocsPasteUI(pasted, meta);
            }
            catch {
                // ignore
            }
        };
        // Attach listeners on multiple targets (document, window, editor root)
        const attachListeners = (target) => {
            target.addEventListener("paste", (e) => {
                // microtask to let internal handlers run first
                Promise.resolve().then(() => logPaste(e));
            }, { capture: true });
            target.addEventListener("keydown", (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
                    setTimeout(() => logPaste(), 30); // fallback
                }
            }, { capture: true });
        };
        attachListeners(document);
        attachListeners(window);
        // Try editor root if present
        const editorRoot = document.querySelector(".kix-appview-editor, .kix-rotatingtilemanager-content");
        if (editorRoot)
            attachListeners(editorRoot);
        // Attach inside typing iframe (paste may fire there)
        const connectIframe = (iframe) => {
            try {
                if (iframe.__gd_iframe_paste_attached)
                    return;
                const cw = iframe.contentWindow;
                if (!cw)
                    return;
                iframe.__gd_iframe_paste_attached = true;
                attachListeners(cw);
            }
            catch { }
        };
        document
            .querySelectorAll(".docs-texteventtarget-iframe")
            .forEach(connectIframe);
        // Observe future iframes
        const mo = new MutationObserver((muts) => {
            muts.forEach((m) => {
                m.addedNodes.forEach((n) => {
                    if (n instanceof HTMLIFrameElement &&
                        n.classList.contains("docs-texteventtarget-iframe")) {
                        connectIframe(n);
                    }
                });
            });
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }
    catch {
        // ignore
    }
})();


// ============================================
// DefaultCaptureStrategy.js
// ============================================
// =========================================================
// FRAMEWORKS
// =========================================================
function detectFramework(el) {
    if (el.classList.contains("ProseMirror"))
        return "ProseMirror";
    if (el.classList.contains("ql-editor"))
        return "Quill";
    if (el.hasAttribute("data-slate-editor"))
        return "Slate";
    if (el.hasAttribute("data-contents"))
        return "DraftJS";
    // Custom/fallback signatures
    if (el.dataset.editorType === "prosemirror")
        return "ProseMirror";
    if (el.dataset.editor === "prosemirror")
        return "ProseMirror";
    return "unknown-contenteditable";
}
function isSingleLine(el) {
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
    if ((role === "textbox" && !isMultiline) || // role says single-line
        isNoWrap || // forced single-line
        isSingleLineHeight // visually one-line
    ) {
        return true; // skip single-line editors
    }
    return false;
}
class DefaultCaptureStrategy {
    static get instance() {
        if (!DefaultCaptureStrategy._instance) {
            DefaultCaptureStrategy._instance = new DefaultCaptureStrategy();
        }
        return DefaultCaptureStrategy._instance;
    }
    constructor() {
        this.isDefault = true;
        this.queryCache = [];
    }
    matches(hostname) {
        // fallback strategy (works everywhere not explicitly handled)
        return true;
    }
    highlight(style, target) {
        const border = style.border;
        if (!border)
            return () => { };
        const prev = target.style.border;
        target.style.border = border;
        return () => (target.style.border = prev);
    }
    async queryNodes(root = document) {
        return Promise.all([
            Promise.resolve(root.querySelectorAll("textarea")).then((c) => Array.from(c).reduce((acc, el) => {
                const rows = parseInt(el.getAttribute("rows") || "2", 10);
                if (rows <= 1)
                    return acc;
                this.queryCache.push({
                    element: el,
                    type: "textarea",
                    framework: "native",
                });
                acc.push(el);
                return acc;
            }, [])),
            Promise.resolve(root.querySelectorAll("[contenteditable='true']")).then((c) => Array.from(c).reduce((acc, el) => {
                if (el.closest("[contenteditable='true']") !== el)
                    return acc;
                const framework = detectFramework(el);
                if (!framework.includes("ProseMirror") && isSingleLine(el))
                    return acc;
                this.queryCache.push({
                    element: el,
                    type: "contenteditable",
                    framework,
                });
                acc.push(el);
                return acc;
            }, [])),
        ]).then((nodes) => nodes.flat());
    }
    canTrackSelection(doc) {
        const element = doc.activeElement;
        if (!(element instanceof HTMLElement))
            return false;
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
    extractText(node) {
        let content;
        if (node instanceof HTMLIFrameElement) {
            content = node.contentDocument?.body?.innerText ?? "";
        }
        else if (node instanceof HTMLTextAreaElement) {
            const text = node.value.substring(node.selectionStart ?? 0, node.selectionEnd ?? 0);
            content = text;
        }
        else {
            content = node.innerText || node.textContent || "";
        }
        return content.trim();
    }
    // used to find absolute pos across all nodes in contenteditable, accounting for newlines
    reconstructTextWithNewlines(element, range) {
        let text = "";
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
        let currentNode = walker.nextNode();
        while (currentNode) {
            if (range && currentNode === range.endContainer && currentNode.nodeType === Node.TEXT_NODE) {
                text += currentNode.textContent?.substring(0, range.endOffset) ?? "";
                break;
            }
            if (currentNode.nodeType === Node.TEXT_NODE) {
                text += currentNode.textContent;
            }
            else if (currentNode.nodeName === "DIV" || currentNode.nodeName === "P") {
                if (currentNode.previousSibling ||
                    currentNode.parentElement !== element ||
                    text.length > 0) {
                    // prevent newline at start
                    text += "\n";
                }
            }
            currentNode = walker.nextNode();
        }
        return text;
    }
    async resolveInsertion(event, element) {
        const activeElement = element.nodeType === Node.DOCUMENT_NODE
            ? element.activeElement
            : element;
        if (!activeElement)
            return null;
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
    async getSelectionRange(element) {
        const activeElement = element.nodeType === Node.DOCUMENT_NODE
            ? element.activeElement
            : element;
        if (!activeElement)
            return null;
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
    setupSelectionTracking(tracker, doc) {
        tracker.observe(doc);
        // Attach copy/paste/cut event listeners
        this.attachClipboardListeners(doc);
        // Attach input listeners for live typing display
        this.attachInputListeners(doc);
        return () => { };
    }
    initialize() {
        // Add visual indicator after a short delay to ensure DOM is ready
        setTimeout(() => this.addVisualIndicator(), 500);
    }
    cleanup() {
        // No-op for default strategy
    }
    // ============================================================================
    // Clipboard Event Handling (Copy/Paste/Cut)
    // ============================================================================
    attachClipboardListeners(doc) {
        const pasteHandler = (e) => this.handleClipboardEvent(e);
        const copyHandler = (e) => this.handleClipboardEvent(e);
        const cutHandler = (e) => this.handleClipboardEvent(e);
        doc.addEventListener('paste', pasteHandler, true);
        doc.addEventListener('copy', copyHandler, true);
        doc.addEventListener('cut', cutHandler, true);
        console.log('[DefaultCapture] Attached clipboard event listeners');
    }
    handleClipboardEvent(event) {
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
            const chromeApi = globalThis.chrome || window.chrome || null;
            const pastedText = clipboardData ? (clipboardData.getData('text/plain') || '') : '';
            const handleSrc = (src) => {
                try {
                    if (!src)
                        return;
                    const isExternalSource = src.url && !src.url.includes(location.hostname);
                    const age = src.ts ? `${Math.max(0, Date.now() - src.ts)}ms` : 'unknown';
                    const title = src.title || '';
                    const url = src.url || '';
                    const copiedText = src.text || '';
                    console.log(`%c[Clipboard Source Info]%c\n` +
                        `From: ${url || 'unknown'}\n` +
                        `Title: %c${title}%c\n` +
                        `Copied: "${copiedText}"\n` +
                        `Pasted: "${pastedText}"\n` +
                        `Age: ${age}`, 'color: #9333ea; font-weight: bold; font-size: 14px;', 'color: inherit;', 'text-decoration: underline; font-weight: bold;', 'text-decoration: none; font-weight: normal;');
                    if (isExternalSource) {
                        const panel = window.wordCapturePanel;
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
                }
                catch (e) {
                    console.log('[DefaultCapture] Error handling clipboard source:', e);
                }
            };
            if (chromeApi?.storage?.local?.get) {
                chromeApi.storage.local.get([KEY], (res) => {
                    const src = res && res[KEY] ? res[KEY] : null;
                    handleSrc(src);
                    if (!src) {
                        try {
                            const raw = localStorage.getItem(KEY);
                            handleSrc(raw ? JSON.parse(raw) : null);
                        }
                        catch (e) { }
                    }
                });
            }
            else {
                try {
                    const raw = localStorage.getItem(KEY);
                    handleSrc(raw ? JSON.parse(raw) : null);
                }
                catch (e) { }
            }
        }
        // Handle copy/cut - store metadata
        if (event.type === 'copy' || event.type === 'cut') {
            this.handleCopyCutEvent(event);
        }
    }
    handleCopyCutEvent(event) {
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
            console.log(`[clipboard-writer] stored __lastClipboard__ -> url=${payload.url} title="${payload.title}" textSnippet="${(payload.text || '').slice(0, 200)}"`);
        }
        catch (e) {
            console.log('[DefaultCapture] Error in copy/cut handler:', e);
        }
    }
    storeLastClipboard(payload) {
        const KEY = '__lastClipboard__';
        try {
            const chromeApi = globalThis.chrome || window.chrome || null;
            if (chromeApi?.storage?.local?.set) {
                const obj = {};
                obj[KEY] = payload;
                chromeApi.storage.local.set(obj, () => { });
            }
        }
        catch (e) { }
        try {
            localStorage.setItem(KEY, JSON.stringify(payload));
        }
        catch (e) { }
    }
    // ============================================================================
    // Visual Indicator (Green Border)
    // ============================================================================
    addVisualIndicator() {
        console.log('[DefaultCapture] Adding visual indicator');
        // Find all contenteditable elements and textareas that we're tracking
        const editableElements = document.querySelectorAll('[contenteditable="true"], textarea');
        let indicatorAdded = false;
        editableElements.forEach((element) => {
            const el = element;
            // Skip single-line editors
            if (el instanceof HTMLTextAreaElement) {
                const rows = parseInt(el.getAttribute('rows') || '2', 10);
                if (rows <= 1)
                    return;
            }
            else if (el.isContentEditable) {
                // Skip if it's nested inside another contenteditable
                if (el.closest('[contenteditable="true"]') !== el)
                    return;
                // Skip single-line contenteditable
                const style = getComputedStyle(el);
                const lineHeight = parseFloat(style.lineHeight) || 16;
                const singleLineHeight = lineHeight * 1.5;
                if (el.clientHeight <= singleLineHeight)
                    return;
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
        }
        else {
            console.log('[DefaultCapture] No suitable elements found for visual indicator');
        }
    }
    attachInputListeners(doc) {
        // Attach input listeners to track typing
        const inputHandler = (e) => this.handleInputEvent(e);
        doc.addEventListener('input', inputHandler, true);
        doc.addEventListener('keyup', inputHandler, true);
        console.log('[DefaultCapture] Attached input event listeners for typing display');
    }
    handleInputEvent(event) {
        const target = event.target;
        // Check if target is a tracked editor
        if (target instanceof HTMLTextAreaElement) {
            const rows = parseInt(target.getAttribute('rows') || '2', 10);
            if (rows <= 1)
                return;
            this.updateTypingDisplay(target.value);
        }
        else if (target.isContentEditable) {
            if (target.closest('[contenteditable="true"]') !== target)
                return;
            const text = target.innerText || target.textContent || '';
            this.updateTypingDisplay(text);
        }
    }
    updateTypingDisplay(text) {
        try {
            const panel = window.wordCapturePanel;
            if (panel && typeof panel.updateTypedText === 'function') {
                panel.updateTypedText(text);
            }
        }
        catch (e) {
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
    const w = window;
    const chromeAny = globalThis.chrome;
    const key = "__lastClipboard__";
    const setLastClipboard = async (payload) => {
        try {
            if (chromeAny?.storage?.local) {
                await new Promise((resolve) => chromeAny.storage.local.set({ [key]: payload }, () => resolve()));
            }
            else {
                localStorage.setItem(key, JSON.stringify(payload));
            }
        }
        catch { }
    };
    const truncate = (s, n = 1000) => (s.length > n ? s.slice(0, n) + "…" : s);
    const handler = () => {
        try {
            const text = document.getSelection()?.toString() || "";
            if (!text)
                return;
            setLastClipboard({
                text: truncate(text),
                url: location.href,
                title: document.title,
                ts: Date.now(),
            });
        }
        catch { }
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
        const w = window;
        if (w.__default_paste_logger_attached)
            return;
        w.__default_paste_logger_attached = true;
        const chromeAny = globalThis.chrome;
        const key = "__lastClipboard__";
        const getLastClipboard = async () => {
            try {
                if (chromeAny?.storage?.local) {
                    return await new Promise((resolve) => chromeAny.storage.local.get([key], (items) => resolve(items?.[key] ?? null)));
                }
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            }
            catch {
                return null;
            }
        };
        const truncate = (s, n = 200) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");
        document.addEventListener("paste", async (e) => {
            try {
                const pasted = e.clipboardData?.getData("text/plain") ?? "";
                const meta = await getLastClipboard();
                const parts = [];
                parts.push(`[Clipboard] PASTE -> Default | pasted="${truncate(pasted)}" length=${pasted.length}`);
                if (meta) {
                    parts.push(`| from=${meta.url} | copied="${truncate(meta.text)}" srcAge=${Math.max(0, Date.now() - meta.ts)}ms`);
                }
                console.log(parts.join(" "));
            }
            catch {
                // ignore
            }
        }, { capture: true });
    }
    catch {
        // ignore
    }
})();


// ============================================
// ClipboardPanel.js
// ============================================
/**
 * Floating in-page panel to visualize real-time typing and pasted clipboard content.
 * Shows what user types in Word and highlights pasted content from external sources.
 */
class ClipboardPanel {
    static get instance() {
        // Create separate instance for each window/frame
        if (!window._clipboardPanelInstance) {
            window._clipboardPanelInstance = new ClipboardPanel();
        }
        return window._clipboardPanelInstance;
    }
    constructor() {
        this.isCollapsed = false;
        this.isMinimized = false;
        this.maxPastedItems = 50;
        this.currentTypedText = '';
        this.pastedTexts = []; // Track pasted text snippets
        this.pastedMetadata = new Map(); // Track metadata for tooltips
        this.createUI();
    }
    createUI() {
        // Avoid injecting multiple times in same window
        if (document.getElementById('__wc_clipboard_panel')) {
            console.log('[ClipboardPanel] Panel already exists in this window');
            return;
        }
        this.container = document.createElement('div');
        this.container.id = '__wc_clipboard_panel';
        Object.assign(this.container.style, {
            position: 'fixed',
            bottom: '12px',
            right: '12px',
            width: '450px',
            maxHeight: '75vh',
            fontFamily: 'Segoe UI, Arial, sans-serif',
            background: '#ffffff',
            color: '#1a1a1a',
            border: '2px solid #2563eb',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(37, 99, 235, 0.2)',
            zIndex: '999999',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        });
        // Show panel in iframes OR in top window for non-Word sites
        // (Word Online uses iframes, so we hide top window panel there)
        const isWordOnline = window.location.hostname.includes('office.com') ||
            window.location.hostname.includes('officeapps.live.com') ||
            window.location.hostname.includes('sharepoint.com');
        if (window === window.top && isWordOnline) {
            // Hide panel in Word's top window (iframe will have it)
            this.container.style.display = 'none';
            console.log('[ClipboardPanel] Hiding panel in Word top window');
        }
        else {
            // Show panel in all other cases (iframes, or non-Word top windows)
            console.log('[ClipboardPanel] Showing panel in', window === window.top ? 'top window' : 'iframe');
        }
        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            borderBottom: '2px solid #1e40af',
            fontSize: '13px',
            letterSpacing: '0.5px'
        });
        const title = document.createElement('div');
        title.textContent = 'Word Capture • Live View';
        Object.assign(title.style, { fontWeight: '600', color: '#ffffff', fontSize: '15px' });
        const buttonsWrap = document.createElement('div');
        Object.assign(buttonsWrap.style, { display: 'flex', gap: '6px' });
        const minimizeBtn = this.makeButton('_');
        const clearBtn = this.makeButton('Clear');
        const collapseBtn = this.makeButton('Hide');
        minimizeBtn.onclick = () => this.minimize();
        collapseBtn.onclick = () => this.toggle();
        clearBtn.onclick = () => this.clearAll();
        buttonsWrap.appendChild(minimizeBtn);
        buttonsWrap.appendChild(clearBtn);
        buttonsWrap.appendChild(collapseBtn);
        header.appendChild(title);
        header.appendChild(buttonsWrap);
        const sectionsWrap = document.createElement('div');
        Object.assign(sectionsWrap.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            padding: '10px',
            overflowY: 'auto',
            maxHeight: 'calc(75vh - 60px)',
            background: '#f8fafc'
        });
        // Real-time typing section
        const typingSection = this.makeTypingSection();
        // Pasted content section
        const pastedSection = this.makePastedSection();
        sectionsWrap.appendChild(typingSection);
        sectionsWrap.appendChild(pastedSection);
        this.container.appendChild(header);
        this.container.appendChild(sectionsWrap);
        // Append to current window's document
        document.documentElement.appendChild(this.container);
        console.log('[ClipboardPanel] Panel injected into', window === window.top ? 'TOP window' : 'IFRAME');
    }
    makeButton(label) {
        const btn = document.createElement('button');
        btn.textContent = label;
        Object.assign(btn.style, {
            background: '#ffffff',
            color: '#2563eb',
            border: '1px solid #dbeafe',
            padding: '6px 14px',
            fontSize: '12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
        });
        btn.onmouseenter = () => { btn.style.background = '#eff6ff'; };
        btn.onmouseleave = () => { btn.style.background = '#ffffff'; };
        return btn;
    }
    makeTypingSection() {
        const wrap = document.createElement('div');
        Object.assign(wrap.style, {
            background: '#ffffff',
            borderRadius: '8px',
            padding: '14px',
            border: '2px solid #3b82f6',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.1)'
        });
        const heading = document.createElement('div');
        heading.textContent = '✍️ LIVE TYPING';
        Object.assign(heading.style, {
            fontSize: '12px',
            fontWeight: '700',
            color: '#2563eb',
            marginBottom: '10px',
            letterSpacing: '0.8px'
        });
        // Use div instead of textarea for better highlighting
        this.typingDisplay = document.createElement('div');
        this.typingDisplay.contentEditable = 'false';
        Object.assign(this.typingDisplay.style, {
            width: '100%',
            minHeight: '200px',
            height: 'auto',
            maxHeight: '350px',
            background: '#ffffff',
            border: '2px solid #dbeafe',
            borderRadius: '6px',
            padding: '10px',
            color: '#000000',
            fontSize: '13px',
            lineHeight: '1.6',
            fontFamily: 'Segoe UI, Arial, sans-serif',
            outline: 'none',
            boxSizing: 'border-box',
            fontWeight: '500',
            overflowY: 'auto',
            overflowX: 'hidden',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            display: 'block'
        });
        this.typingDisplay.setAttribute('data-placeholder', 'Waiting for typing in Word...');
        // Add scroll buttons container
        const scrollButtons = document.createElement('div');
        Object.assign(scrollButtons.style, {
            display: 'flex',
            gap: '4px',
            marginTop: '6px',
            justifyContent: 'flex-end'
        });
        const scrollToTop = document.createElement('button');
        scrollToTop.textContent = '⬆ Top';
        Object.assign(scrollToTop.style, {
            background: '#dbeafe',
            color: '#1e40af',
            border: '1px solid #93c5fd',
            padding: '4px 10px',
            fontSize: '11px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '600'
        });
        scrollToTop.onclick = () => {
            this.typingDisplay.scrollTop = 0;
        };
        const scrollToBottom = document.createElement('button');
        scrollToBottom.textContent = '⬇ Bottom';
        Object.assign(scrollToBottom.style, {
            background: '#dbeafe',
            color: '#1e40af',
            border: '1px solid #93c5fd',
            padding: '4px 10px',
            fontSize: '11px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '600'
        });
        scrollToBottom.onclick = () => {
            this.typingDisplay.scrollTop = this.typingDisplay.scrollHeight;
        };
        scrollButtons.appendChild(scrollToTop);
        scrollButtons.appendChild(scrollToBottom);
        // Focus border color
        this.typingDisplay.addEventListener('focus', () => {
            this.typingDisplay.style.borderColor = '#3b82f6';
        });
        this.typingDisplay.addEventListener('blur', () => {
            this.typingDisplay.style.borderColor = '#dbeafe';
        });
        wrap.appendChild(heading);
        wrap.appendChild(this.typingDisplay);
        wrap.appendChild(scrollButtons);
        return wrap;
    }
    makePastedSection() {
        const wrap = document.createElement('div');
        Object.assign(wrap.style, {
            background: '#ffffff',
            borderRadius: '8px',
            padding: '12px',
            border: '2px solid #e5e7eb',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)'
        });
        const heading = document.createElement('div');
        heading.textContent = '📋 PASTED FROM EXTERNAL SOURCES';
        Object.assign(heading.style, {
            fontSize: '11px',
            fontWeight: '700',
            color: '#6b7280',
            marginBottom: '8px',
            letterSpacing: '0.8px'
        });
        this.pastedList = document.createElement('div');
        Object.assign(this.pastedList.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '180px',
            overflowY: 'auto',
            padding: '2px'
        });
        wrap.appendChild(heading);
        wrap.appendChild(this.pastedList);
        return wrap;
    }
    toggle() {
        this.isCollapsed = !this.isCollapsed;
        const btn = this.container.querySelector('button:last-child');
        btn.textContent = this.isCollapsed ? 'Show' : 'Hide';
        const sections = this.container.querySelector('div > div:nth-child(2)');
        if (sections) {
            sections.style.display = this.isCollapsed ? 'none' : 'flex';
        }
    }
    minimize() {
        if (!this.isMinimized) {
            // Minimize - make it MORE visible and larger
            this.isMinimized = true;
            this.container.style.width = '120px';
            this.container.style.height = '60px';
            this.container.style.background = '#2563eb'; // Solid blue background
            this.container.style.boxShadow = '0 8px 32px rgba(37, 99, 235, 0.6)';
            this.container.style.cursor = 'pointer';
            const title = this.container.querySelector('div > div:first-child');
            if (title) {
                title.textContent = '📝 WC';
                title.style.fontSize = '18px';
                title.style.textAlign = 'center';
            }
            const sections = this.container.querySelector('div > div:nth-child(2)');
            if (sections)
                sections.style.display = 'none';
            const btns = this.container.querySelectorAll('button');
            btns.forEach((btn, idx) => {
                if (idx === 0) {
                    btn.textContent = '⬜'; // Restore button with emoji
                    btn.style.fontSize = '16px';
                }
                else {
                    btn.style.display = 'none';
                }
            });
            // Make entire container clickable to restore
            this.container.onclick = () => this.minimize();
        }
        else {
            // Restore
            this.isMinimized = false;
            this.container.style.width = '340px';
            this.container.style.height = 'auto';
            this.container.style.background = '#ffffff';
            this.container.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.2)';
            this.container.style.cursor = 'default';
            this.container.onclick = null;
            const title = this.container.querySelector('div > div:first-child');
            if (title) {
                title.textContent = 'Word Capture • Live View';
                title.style.fontSize = '15px';
                title.style.textAlign = 'left';
            }
            const sections = this.container.querySelector('div > div:nth-child(2)');
            if (sections)
                sections.style.display = 'flex';
            const btns = this.container.querySelectorAll('button');
            btns.forEach((btn, idx) => {
                if (idx === 0) {
                    btn.textContent = '_';
                    btn.style.fontSize = '12px';
                }
                else {
                    btn.style.display = 'inline-block';
                }
            });
        }
    }
    clearAll() {
        this.typingDisplay.textContent = '';
        this.currentTypedText = '';
        this.pastedTexts = [];
        this.pastedList.innerHTML = '';
    }
    // Update live typing display with highlighted pasted text
    updateTypedText(text) {
        console.log('[ClipboardPanel] updateTypedText called with text length:', text?.length || 0);
        this.currentTypedText = text;
        if (!text || text.length === 0) {
            this.typingDisplay.innerHTML = '<span style="color: #9ca3af; font-style: italic;">Waiting for typing...</span>';
            return;
        }
        console.log('[ClipboardPanel] Setting text in panel:', text.substring(0, 100));
        // Clear and rebuild with highlighting
        this.typingDisplay.innerHTML = '';
        if (this.pastedTexts.length === 0) {
            // No pasted text, just show plain text with proper line breaks
            const lines = text.split('\n');
            lines.forEach((line, index) => {
                this.typingDisplay.appendChild(document.createTextNode(line));
                if (index < lines.length - 1) {
                    this.typingDisplay.appendChild(document.createElement('br'));
                }
            });
        }
        else {
            // Highlight pasted portions while preserving line breaks
            // Build fragments by finding all pasted text occurrences
            let fragments = [];
            let lastIndex = 0;
            // Create array of positions where pasted text occurs
            const pastedOccurrences = [];
            this.pastedTexts.forEach(pastedSnippet => {
                const snippet = pastedSnippet.trim();
                if (!snippet)
                    return;
                // Find all occurrences using indexOf loop
                let searchIndex = 0;
                while (searchIndex < text.length) {
                    const foundIndex = text.indexOf(snippet, searchIndex);
                    if (foundIndex === -1)
                        break;
                    pastedOccurrences.push({
                        start: foundIndex,
                        end: foundIndex + snippet.length,
                        pastedText: snippet
                    });
                    searchIndex = foundIndex + snippet.length;
                }
            });
            // Sort occurrences by start position
            pastedOccurrences.sort((a, b) => a.start - b.start);
            // Build fragments from sorted occurrences
            pastedOccurrences.forEach(occurrence => {
                // Add non-pasted text before this occurrence
                if (lastIndex < occurrence.start) {
                    fragments.push({
                        text: text.substring(lastIndex, occurrence.start),
                        isPasted: false
                    });
                }
                // Add pasted text
                fragments.push({
                    text: text.substring(occurrence.start, occurrence.end),
                    isPasted: true,
                    originalPastedText: occurrence.pastedText
                });
                lastIndex = occurrence.end;
            });
            // Add remaining non-pasted text
            if (lastIndex < text.length) {
                fragments.push({
                    text: text.substring(lastIndex),
                    isPasted: false
                });
            }
            // If no pasted text found, use original
            if (fragments.length === 0) {
                fragments = [{ text: text, isPasted: false }];
            }
            // Render fragments with proper formatting
            fragments.forEach(fragment => {
                const lines = fragment.text.split('\n');
                lines.forEach((line, lineIdx) => {
                    if (fragment.isPasted) {
                        // Highlighted pasted text with tooltip
                        const pastedSpan = document.createElement('span');
                        pastedSpan.textContent = line;
                        pastedSpan.style.cssText = 'background-color: #fef3c7; border-bottom: 2px solid #fbbf24; text-decoration: underline; text-decoration-color: #f59e0b; padding: 2px 4px; border-radius: 3px; cursor: help; position: relative;';
                        // Get metadata for this pasted text using originalPastedText
                        const metadataKey = fragment.originalPastedText || fragment.text.trim();
                        const metadata = this.pastedMetadata.get(metadataKey);
                        if (metadata) {
                            // Create tooltip
                            const tooltip = document.createElement('span');
                            tooltip.style.cssText = `
                visibility: hidden;
                background-color: #1e293b;
                color: #ffffff;
                text-align: left;
                border-radius: 6px;
                padding: 8px 12px;
                position: absolute;
                z-index: 1000000;
                bottom: 125%;
                left: 50%;
                transform: translateX(-50%);
                width: max-content;
                max-width: 300px;
                font-size: 11px;
                line-height: 1.4;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                white-space: normal;
                word-break: break-word;
                user-select: text;
                cursor: text;
                pointer-events: auto;
              `;
                            const titleDiv = document.createElement('div');
                            titleDiv.style.cssText = 'font-weight: 700; color: #fbbf24; margin-bottom: 4px; font-size: 12px; user-select: text;';
                            titleDiv.textContent = metadata.title;
                            const urlDiv = document.createElement('div');
                            urlDiv.style.cssText = 'color: #94a3b8; font-size: 10px; font-family: monospace; user-select: text; word-break: break-all;';
                            urlDiv.textContent = metadata.url;
                            tooltip.appendChild(titleDiv);
                            tooltip.appendChild(urlDiv);
                            // Tooltip arrow
                            const arrow = document.createElement('span');
                            arrow.style.cssText = `
                position: absolute;
                top: 100%;
                left: 50%;
                margin-left: -5px;
                border-width: 5px;
                border-style: solid;
                border-color: #1e293b transparent transparent transparent;
              `;
                            tooltip.appendChild(arrow);
                            pastedSpan.appendChild(tooltip);
                            // Show/hide tooltip on hover - keep visible when hovering tooltip itself
                            let hideTimeout = null;
                            pastedSpan.onmouseenter = () => {
                                if (hideTimeout)
                                    clearTimeout(hideTimeout);
                                tooltip.style.visibility = 'visible';
                                tooltip.style.opacity = '1';
                            };
                            pastedSpan.onmouseleave = () => {
                                hideTimeout = setTimeout(() => {
                                    tooltip.style.visibility = 'hidden';
                                    tooltip.style.opacity = '0';
                                }, 300); // 300ms delay before hiding
                            };
                            // Keep tooltip visible when hovering over it
                            tooltip.onmouseenter = () => {
                                if (hideTimeout)
                                    clearTimeout(hideTimeout);
                                tooltip.style.visibility = 'visible';
                                tooltip.style.opacity = '1';
                            };
                            tooltip.onmouseleave = () => {
                                tooltip.style.visibility = 'hidden';
                                tooltip.style.opacity = '0';
                            };
                        }
                        this.typingDisplay.appendChild(pastedSpan);
                    }
                    else {
                        // Normal text
                        this.typingDisplay.appendChild(document.createTextNode(line));
                    }
                    // Add line break if not last line
                    if (lineIdx < lines.length - 1) {
                        this.typingDisplay.appendChild(document.createElement('br'));
                    }
                });
            });
        }
        // Force scroll to show latest content
        setTimeout(() => {
            this.typingDisplay.scrollTop = this.typingDisplay.scrollHeight;
        }, 10);
    }
    // Add pasted content with yellow highlight
    addClipboardSource(info) {
        console.log('[ClipboardPanel] addClipboardSource called with:', info);
        // Track this pasted text for highlighting in live typing section
        if (info.pasted && info.pasted.trim()) {
            const pastedText = info.pasted.trim();
            this.pastedTexts.push(pastedText);
            console.log('[ClipboardPanel] Added pasted text to tracking:', pastedText.substring(0, 50));
            // Store metadata for tooltip
            this.pastedMetadata.set(pastedText, {
                url: info.url || 'Unknown source',
                title: info.title || 'Untitled'
            });
            // Refresh the display to show highlighting
            this.updateTypedText(this.currentTypedText);
        }
        const item = document.createElement('div');
        Object.assign(item.style, {
            background: '#fefce8',
            border: '2px solid #fbbf24',
            borderRadius: '8px',
            padding: '12px',
            position: 'relative',
            cursor: 'pointer',
            transition: 'all 0.2s'
        });
        // Make entire card clickable to open source
        item.onclick = () => {
            if (info.url) {
                window.open(info.url, '_blank');
            }
        };
        item.onmouseenter = () => {
            item.style.transform = 'scale(1.02)';
            item.style.boxShadow = '0 4px 12px rgba(251, 191, 36, 0.3)';
        };
        item.onmouseleave = () => {
            item.style.transform = 'scale(1)';
            item.style.boxShadow = 'none';
        };
        const time = new Date(info.timestamp).toLocaleTimeString();
        const copiedEsc = this.escape(info.copied || '');
        const titleEsc = this.escape(info.title || 'Untitled');
        const urlEsc = this.escape(info.url || '');
        item.innerHTML = `
      <div style="font-size:10px;color:#78716c;margin-bottom:8px;font-weight:600">${time} • Click to open source</div>
      <div style="margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;color:#92400e;letter-spacing:.5px;margin-bottom:4px">TITLE:</div>
        <div style="font-size:12px;color:#713f12;font-weight:600">${titleEsc}</div>
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;color:#92400e;letter-spacing:.5px;margin-bottom:4px">SOURCE:</div>
        <div style="font-size:11px;color:#1d4ed8;text-decoration:underline;word-break:break-all">${urlEsc} ↗</div>
      </div>
        <div style="font-size:10px;font-weight:700;color:#92400e;letter-spacing:.5px;margin-bottom:5px">PASTED TEXT: <span style="color:#6b7280;font-weight:400">(${copiedEsc.length} chars)</span></div>
        <div style="background:#fef9e7;padding:8px;border-radius:4px;color:#44403c;font-size:12px;line-height:1.6;max-height:120px;overflow-y:auto;word-break:break-word;white-space:pre-wrap;border:1px solid #fde68a">${copiedEsc || '<em style="color:#9ca3af">(empty)</em>'}</div>
      </div>
    `;
        this.pastedList.prepend(item);
        this.trimPastedList();
    }
    // For backward compatibility with key events (now ignored)
    addEvent(e) {
        // No longer used - we track typing via text extraction
    }
    trimPastedList() {
        while (this.pastedList.children.length > this.maxPastedItems) {
            this.pastedList.removeChild(this.pastedList.lastChild);
        }
    }
    escape(str) {
        return (str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
    }
}
ClipboardPanel._instance = null;
// Expose globally for integration
window.ClipboardPanel = ClipboardPanel;


// ============================================
// index.js (main entry point)
// ============================================


// Log script load with detailed context
console.log('[Capture] Script loaded!', new Date().toISOString());
console.log('[Capture] Context:', window === window.top ? 'TOP FRAME' : 'IFRAME');
console.log('[Capture] URL:', window.location.href);
console.log('[Capture] Hostname:', window.location.hostname);
console.log('[Capture] Document ready state:', document.readyState);
// Initialize UI panel in every frame
// But only the iframe panel will be visible (top window panel is hidden via CSS)
try {
    window.wordCapturePanel = ClipboardPanel.instance;
    console.log('[Word Capture] ClipboardPanel created in', window === window.top ? 'TOP window' : 'IFRAME');
}
catch (e) {
    console.warn('[Word Capture] Failed to init ClipboardPanel', e);
}
// Initialize strategies and manager
const wordStrategy = WordCaptureStrategy.instance;
const defaultStrategy = DefaultCaptureStrategy.instance;
const googleDocsStrategy = GoogleDocsCapture.instance;
const captureManager = SimpleCaptureManager.instance;
// Register strategies
captureManager.register(wordStrategy);
captureManager.register(googleDocsStrategy);
captureManager.register(defaultStrategy); // Register default strategy last
// Auto-select and initialize if we match
const selectedStrategy = captureManager.autoSelect();
if (selectedStrategy) {
    console.log('[Capture] Strategy selected:', selectedStrategy.constructor.name);
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[Capture] DOMContentLoaded, initializing strategy.');
            selectedStrategy.initialize();
            selectedStrategy.initialize();
            selectedStrategy.initialize();
        });
    }
    else {
        console.log('[Capture] DOM already ready, initializing strategy.');
        selectedStrategy.initialize();
        selectedStrategy.initialize();
        selectedStrategy.initialize();
    }
}
// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (selectedStrategy) {
        // selectedStrategy.cleanup();
    }
});
// Export for debugging
window.captureDebug = {
    strategy: wordStrategy,
    manager: captureManager,
    selectedStrategy: selectedStrategy,
    getEditor: () => wordStrategy.getEditor(),
    getDocument: () => wordStrategy.getDocument(),
    isActive: () => wordStrategy.isActive(),
    reinitialize: () => wordStrategy.initialize(),
    panel: window.wordCapturePanel || null
};
console.log('[Capture] Script initialization complete');
console.log('[Capture] Access via: window.captureDebug');


})();
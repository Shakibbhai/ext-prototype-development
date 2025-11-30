import type { LogEvent } from '../capture/types';

interface ClipboardSourceInfo {
  url: string;
  title: string;
  copied: string;
  pasted: string;
  age: string;
  timestamp: number;
}

/**
 * Floating in-page panel to visualize real-time typing and pasted clipboard content.
 * Shows what user types in Word and highlights pasted content from external sources.
 */
export class ClipboardPanel {
  private static _instance: ClipboardPanel | null = null;
  
  static get instance(): ClipboardPanel {
    // Create separate instance for each window/frame
    if (!(window as any)._clipboardPanelInstance) {
      (window as any)._clipboardPanelInstance = new ClipboardPanel();
    }
    return (window as any)._clipboardPanelInstance;
  }

  private container!: HTMLElement;
  private typingDisplay!: HTMLTextAreaElement;
  private pastedList!: HTMLElement;
  private isCollapsed = false;
  private isMinimized = false;
  private maxPastedItems = 50;
  private currentTypedText = '';
  private pastedTexts: string[] = []; // Track pasted text snippets
  private pastedMetadata: Map<string, {url: string, title: string}> = new Map(); // Track metadata for tooltips

  private constructor() {
    this.createUI();
  }

  private createUI() {
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
    } else {
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

  private makeButton(label: string): HTMLButtonElement {
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

  private makeTypingSection(): HTMLElement {
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
    this.typingDisplay = document.createElement('div') as any;
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

  private makePastedSection(): HTMLElement {
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
    const btn = this.container.querySelector('button:last-child') as HTMLButtonElement;
    btn.textContent = this.isCollapsed ? 'Show' : 'Hide';
    
    const sections = this.container.querySelector('div > div:nth-child(2)') as HTMLElement;
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
      
      const title = this.container.querySelector('div > div:first-child') as HTMLElement;
      if (title) {
        title.textContent = '📝 WC';
        title.style.fontSize = '18px';
        title.style.textAlign = 'center';
      }
      const sections = this.container.querySelector('div > div:nth-child(2)') as HTMLElement;
      if (sections) sections.style.display = 'none';
      const btns = this.container.querySelectorAll('button');
      btns.forEach((btn, idx) => {
        if (idx === 0) {
          btn.textContent = '⬜'; // Restore button with emoji
          btn.style.fontSize = '16px';
        } else {
          btn.style.display = 'none';
        }
      });
      
      // Make entire container clickable to restore
      this.container.onclick = () => this.minimize();
    } else {
      // Restore
      this.isMinimized = false;
      this.container.style.width = '340px';
      this.container.style.height = 'auto';
      this.container.style.background = '#ffffff';
      this.container.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.2)';
      this.container.style.cursor = 'default';
      this.container.onclick = null;
      
      const title = this.container.querySelector('div > div:first-child') as HTMLElement;
      if (title) {
        title.textContent = 'Word Capture • Live View';
        title.style.fontSize = '15px';
        title.style.textAlign = 'left';
      }
      const sections = this.container.querySelector('div > div:nth-child(2)') as HTMLElement;
      if (sections) sections.style.display = 'flex';
      const btns = this.container.querySelectorAll('button');
      btns.forEach((btn, idx) => {
        if (idx === 0) {
          btn.textContent = '_';
          btn.style.fontSize = '12px';
        } else {
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
  updateTypedText(text: string) {
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
    } else {
      // Highlight pasted portions while preserving line breaks
      // Build fragments by finding all pasted text occurrences
      let fragments: Array<{text: string, isPasted: boolean, originalPastedText?: string}> = [];
      let lastIndex = 0;
      
      // Create array of positions where pasted text occurs
      const pastedOccurrences: Array<{start: number, end: number, pastedText: string}> = [];
      
      this.pastedTexts.forEach(pastedSnippet => {
        const snippet = pastedSnippet.trim();
        if (!snippet) return;
        
        // Find all occurrences using indexOf loop
        let searchIndex = 0;
        while (searchIndex < text.length) {
          const foundIndex = text.indexOf(snippet, searchIndex);
          if (foundIndex === -1) break;
          
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
        fragments = [{text: text, isPasted: false}];
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
              let hideTimeout: any = null;
              
              pastedSpan.onmouseenter = () => {
                if (hideTimeout) clearTimeout(hideTimeout);
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
                if (hideTimeout) clearTimeout(hideTimeout);
                tooltip.style.visibility = 'visible';
                tooltip.style.opacity = '1';
              };
              
              tooltip.onmouseleave = () => {
                tooltip.style.visibility = 'hidden';
                tooltip.style.opacity = '0';
              };
            }
            
            this.typingDisplay.appendChild(pastedSpan);
          } else {
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
  addClipboardSource(info: ClipboardSourceInfo) {
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
  addEvent(e: LogEvent) {
    // No longer used - we track typing via text extraction
  }

  private trimPastedList() {
    while (this.pastedList.children.length > this.maxPastedItems) {
      this.pastedList.removeChild(this.pastedList.lastChild!);
    }
  }

  private escape(str: string): string {
    return (str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]!));
  }
}

// Expose globally for integration
(window as any).ClipboardPanel = ClipboardPanel;

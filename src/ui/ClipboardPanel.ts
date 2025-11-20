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
 * Floating in-page panel to visualize clipboard source info and Word capture events.
 * Injected via content script (index.ts) so no additional extension pages needed.
 */
export class ClipboardPanel {
  static get instance(): ClipboardPanel {
    if (!(window as any)._clipboardPanelInstance) {
      (window as any)._clipboardPanelInstance = new ClipboardPanel();
    }
    return (window as any)._clipboardPanelInstance;
  }

  private container!: HTMLElement;
  private eventsList!: HTMLElement;
  private sourcesList!: HTMLElement;
  private isCollapsed = false;
  private maxItems = 100;

  private constructor() {
    this.createUI();
  }

  private createUI() {
    // Avoid injecting multiple times
    if (document.getElementById('__wc_clipboard_panel')) return;

    this.container = document.createElement('div');
    this.container.id = '__wc_clipboard_panel';
    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: '12px',
      right: '12px',
      width: '380px',
      maxHeight: '60vh',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      background: 'rgba(23,23,23,0.95)',
      color: '#eee',
      border: '1px solid #00a67e',
      borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      zIndex: '999999',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 10px',
      background: '#121212',
      borderBottom: '1px solid #033',
      fontSize: '13px',
      letterSpacing: '0.5px'
    });

    const title = document.createElement('div');
    title.textContent = 'Word Capture • Clipboard';
    Object.assign(title.style, { fontWeight: '600', color: '#00a67e' });

    const buttonsWrap = document.createElement('div');
    Object.assign(buttonsWrap.style, { display: 'flex', gap: '6px' });

    const collapseBtn = this.makeButton('Hide');
    const clearBtn = this.makeButton('Clear');

    collapseBtn.onclick = () => this.toggle();
    clearBtn.onclick = () => this.clearAll();

    buttonsWrap.appendChild(clearBtn);
    buttonsWrap.appendChild(collapseBtn);

    header.appendChild(title);
    header.appendChild(buttonsWrap);

    const sectionsWrap = document.createElement('div');
    Object.assign(sectionsWrap.style, {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '8px',
      padding: '8px',
      overflowY: 'auto'
    });

    // Clipboard Sources section
    const sourcesSection = this.makeSection('Clipboard Sources');
    this.sourcesList = sourcesSection.querySelector('ul')!;

    // Events section
    const eventsSection = this.makeSection('Key / Paste Events');
    this.eventsList = eventsSection.querySelector('ul')!;

    sectionsWrap.appendChild(sourcesSection);
    sectionsWrap.appendChild(eventsSection);

    this.container.appendChild(header);
    this.container.appendChild(sectionsWrap);

    document.documentElement.appendChild(this.container);
  }

  private makeButton(label: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      background: '#00a67e',
      color: '#fff',
      border: 'none',
      padding: '4px 10px',
      fontSize: '12px',
      borderRadius: '4px',
      cursor: 'pointer'
    });
    btn.onmouseenter = () => btn.style.opacity = '0.85';
    btn.onmouseleave = () => btn.style.opacity = '1';
    return btn;
  }

  private makeSection(title: string): HTMLElement {
    const wrap = document.createElement('div');
    const heading = document.createElement('div');
    heading.textContent = title;
    Object.assign(heading.style, {
      fontSize: '12px',
      fontWeight: '600',
      color: '#99e2cd',
      marginBottom: '4px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    });
    const list = document.createElement('ul');
    Object.assign(list.style, {
      listStyle: 'none',
      margin: '0',
      padding: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    });
    wrap.appendChild(heading);
    wrap.appendChild(list);
    return wrap;
  }

  toggle() {
    this.isCollapsed = !this.isCollapsed;
    (this.container.querySelector('button:last-child') as HTMLButtonElement).textContent = this.isCollapsed ? 'Show' : 'Hide';
    this.container.style.height = this.isCollapsed ? '32px' : 'auto';
    const sections = this.container.querySelectorAll('div > div > div');
    sections.forEach((el, idx) => {
      if (idx >= 1) {
        (el as HTMLElement).style.display = this.isCollapsed ? 'none' : 'block';
      }
    });
  }

  clearAll() {
    this.eventsList.innerHTML = '';
    this.sourcesList.innerHTML = '';
  }

  addEvent(e: LogEvent) {
    const li = document.createElement('li');
    const time = new Date(e.timestamp).toLocaleTimeString();
    li.textContent = `${time} ${e.type}${e.key ? ' key=' + e.key : ''}${e.data ? ' data=' + e.data : ''}`;
    Object.assign(li.style, {
      padding: '4px 6px',
      background: '#1e1e1e',
      borderRadius: '4px',
      fontSize: '11px',
      fontFamily: 'monospace'
    });
    this.eventsList.prepend(li);
    this.trim(this.eventsList);
  }

  addClipboardSource(info: ClipboardSourceInfo) {
    const li = document.createElement('li');
    const time = new Date(info.timestamp).toLocaleTimeString();
    li.innerHTML = `<div style="font-size:11px; line-height:1.3">`+
      `<div style="color:#00a67e; font-weight:600">${time} Clipboard Source</div>`+
      `<div style="opacity:0.8">${this.escape(info.title)}</div>`+
      `<div style="word-break:break-word"><span style="color:#999">Copied:</span> ${this.escape(info.copied)}</div>`+
      `<div style="word-break:break-word"><span style="color:#999">Pasted:</span> ${this.escape(info.pasted)}</div>`+
      `<div style="color:#666">Age: ${info.age} | <a href="${info.url}" target="_blank" style="color:#66d1b8; text-decoration:none">source</a></div>`+
      `</div>`;
    Object.assign(li.style, {
      padding: '6px 6px',
      background: '#242424',
      borderRadius: '4px',
      fontSize: '11px',
      fontFamily: 'Segoe UI, Arial'
    });
    this.sourcesList.prepend(li);
    this.trim(this.sourcesList);
  }

  private trim(list: HTMLElement) {
    while (list.children.length > this.maxItems) {
      list.removeChild(list.lastChild!);
    }
  }

  private escape(str: string): string {
    return (str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]!));
  }
}

// Expose globally for integration
(window as any).ClipboardPanel = ClipboardPanel;

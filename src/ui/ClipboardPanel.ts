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
      width: '450px',
      maxHeight: '70vh',
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
    title.textContent = 'Clipboard History';
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

    // Clipboard Sources section only
    const sourcesSection = this.makeSection('Clipboard History');
    this.sourcesList = sourcesSection.querySelector('ul')!;

    // Create empty events list for compatibility (not displayed)
    this.eventsList = document.createElement('ul');

    sectionsWrap.appendChild(sourcesSection);

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
    // Remove highlight from previous latest
    const prevLatest = this.sourcesList.querySelector('li[data-latest="true"]');
    if (prevLatest) {
      prevLatest.removeAttribute('data-latest');
      Object.assign((prevLatest as HTMLElement).style, {
        background: '#242424',
        borderLeft: '4px solid #2d2d2d'
      });
    }

    const li = document.createElement('li');
    li.setAttribute('data-latest', 'true');
    const time = new Date(info.timestamp).toLocaleTimeString();

    const copiedEsc = this.escape(info.copied || '');
    const titleEsc = this.escape(info.title || 'Untitled');
    const urlEsc = this.escape(info.url || '');

    li.innerHTML = `
      <div style="font-size:11px; line-height:1.4">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="color:#00c297;font-weight:700;font-size:12px">${time}</span>
        </div>
        
        <div style="margin-bottom:10px">
          <div style="font-size:10px;font-weight:700;color:#66d1b8;letter-spacing:.5px;margin-bottom:4px">TITLE:</div>
          <div style="padding:5px 7px;background:#183d35;border-radius:4px;font-weight:600;color:#9df5e1;border:1px solid #0a6656;font-size:11px">${titleEsc}</div>
        </div>

        <div style="margin-bottom:10px">
          <div style="font-size:10px;font-weight:700;color:#66d1b8;letter-spacing:.5px;margin-bottom:4px">SOURCE:</div>
          <a href="${info.url}" target="_blank" style="display:block;padding:5px 7px;background:#0d3d33;border-radius:4px;color:#7ce8d1;text-decoration:none;word-break:break-all;border:1px solid #066;font-size:10px;max-height:60px;overflow:auto">${urlEsc} ↗</a>
        </div>
        
        <div style="background:#30230f;padding:8px;border-radius:4px;border:1px solid #8a6409;margin-top:10px">
          <div style="font-size:10px;font-weight:700;color:#ffc86b;letter-spacing:.5px;margin-bottom:4px">TEXT COPIED: <span style="color:#999;font-weight:400">(${copiedEsc.length} chars)</span></div>
          <div style="word-break:break-word;white-space:pre-wrap;color:#f3d9a6;font-size:11px;line-height:1.5;max-height:900px;overflow-y:auto">${copiedEsc || '<em style="color:#666">(empty)</em>'}</div>
        </div>
      </div>
    `;

    Object.assign(li.style, {
      padding: '8px 10px 10px 10px',
      background: '#072822',
      borderRadius: '6px',
      fontSize: '11px',
      fontFamily: 'Segoe UI, Arial',
      borderLeft: '4px solid #00a67e',
      boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
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

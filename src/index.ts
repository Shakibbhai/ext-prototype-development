import { WordCaptureStrategy } from './capture/WordCaptureStrategy';
import { DefaultCaptureStrategy } from './capture/DefaultCaptureStrategy';
import { GoogleDocsCapture } from './capture/GoogleDocsCapture';
import { SimpleCaptureManager } from './capture/CaptureManager';
import { ClipboardPanel } from './ui/ClipboardPanel';

// Log script load with detailed context
console.log('[Capture] Script loaded!', new Date().toISOString());
console.log('[Capture] Context:', window === window.top ? 'TOP FRAME' : 'IFRAME');
console.log('[Capture] URL:', window.location.href);
console.log('[Capture] Hostname:', window.location.hostname);
console.log('[Capture] Document ready state:', document.readyState);


// Initialize UI panel in every frame
// But only the iframe panel will be visible (top window panel is hidden via CSS)
try {
  (window as any).wordCapturePanel = ClipboardPanel.instance;
  console.log('[Word Capture] ClipboardPanel created in', window === window.top ? 'TOP window' : 'IFRAME');
} catch (e) {
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
      (selectedStrategy as WordCaptureStrategy).initialize();
      (selectedStrategy as  GoogleDocsCapture).initialize();
      (selectedStrategy as  DefaultCaptureStrategy).initialize();
    });
  
  } else {
    console.log('[Capture] DOM already ready, initializing strategy.');
    (selectedStrategy as WordCaptureStrategy).initialize();
      (selectedStrategy as  GoogleDocsCapture).initialize();
      (selectedStrategy as  DefaultCaptureStrategy).initialize();
  }
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (selectedStrategy) {
    // selectedStrategy.cleanup();
  }
});

// Export for debugging
(window as any).captureDebug = {
  strategy:wordStrategy,
  manager: captureManager,
  selectedStrategy: selectedStrategy,
  getEditor: () => wordStrategy.getEditor(),
  getDocument: () => wordStrategy.getDocument(),
  isActive: () => wordStrategy.isActive(),
  reinitialize: () => wordStrategy.initialize(),
  panel: (window as any).wordCapturePanel || null};

console.log('[Capture] Script initialization complete');
console.log('[Capture] Access via: window.captureDebug');

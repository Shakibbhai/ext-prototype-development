/**
 * Main entry point for Word Capture Extension
 * Initializes the capture strategy and manager
 */

import { WordCaptureStrategy } from './capture/WordCaptureStrategy';
import { SimpleCaptureManager } from './capture/CaptureManager';
import { ClipboardPanel } from './ui/ClipboardPanel';

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
// Initialize UI panel in every frame (Word editor often lives in iframe)
try {
  (window as any).wordCapturePanel = ClipboardPanel.instance;
  console.log('[Word Capture] ClipboardPanel injected');
} catch (e) {
  console.warn('[Word Capture] Failed to init ClipboardPanel', e);
}

// Register strategy
captureManager.register(wordStrategy);

// Auto-select and initialize if we match
const selectedStrategy = captureManager.autoSelect();
if (selectedStrategy) {
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      (selectedStrategy as WordCaptureStrategy).initialize();
    });
  } else {
    (selectedStrategy as WordCaptureStrategy).initialize();
  }
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (selectedStrategy) {
    (selectedStrategy as WordCaptureStrategy).cleanup();
  }
});

// Export for debugging
(window as any).wordCapture = {
  strategy: wordStrategy,
  manager: captureManager,
  getEditor: () => wordStrategy.getEditor(),
  getDocument: () => wordStrategy.getDocument(),
  isActive: () => wordStrategy.isActive(),
  reinitialize: () => wordStrategy.initialize(),
  panel: (window as any).wordCapturePanel || null
};

console.log('[Word Capture] Global wordCapture object created');
console.log('[Word Capture] Script initialization complete');
console.log('[Word Capture] Access via: window.wordCapture');

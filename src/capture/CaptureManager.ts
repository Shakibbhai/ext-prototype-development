import type { CaptureStrategy } from './types';

export class SimpleCaptureManager {
  private static _instance: SimpleCaptureManager;
  
  static get instance(): SimpleCaptureManager {
    if (!SimpleCaptureManager._instance) {
      SimpleCaptureManager._instance = new SimpleCaptureManager();
    }
    return SimpleCaptureManager._instance;
  }

  private strategies: Set<CaptureStrategy> = new Set();
  private activeStrategy?: CaptureStrategy;

  private constructor() {
    console.log('[Capture Manager] Initialized');
  }

  register(strategy: CaptureStrategy): void {
    this.strategies.add(strategy);
    console.log('[Capture Manager] Strategy registered');
  }

  autoSelect(hostname: string = location.hostname): CaptureStrategy | null {
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

  getActiveStrategy(): CaptureStrategy | undefined {
    return this.activeStrategy;
  }

  processCaptureEvent(event: any): void {
    console.log('🎯 [Capture Manager] Processing capture event:', {
      type: event.type,
      pos: event.pos,
      length: event.length,
      text: event.text?.substring(0, 50) + (event.text && event.text.length > 50 ? '...' : ''),
      timestamp: new Date(event.timestamp).toISOString()
    });
  }
}

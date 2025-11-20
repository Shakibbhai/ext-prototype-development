export interface CaptureStrategy {
  readonly isDefault?: boolean;
  readonly queryCache?: (HTMLElement | { element: HTMLElement; [key: string]: any })[];

  // Which hostnames/domains this strategy supports
  matches(hostname: string): boolean;
  
  // Query for editor nodes in the DOM
  queryNodes(root?: HTMLElement | Document): Promise<HTMLElement[]>;
  
  // Extract text content from a node
  extractText(node: HTMLElement): string;
  
  // Add visual highlight to tracked element
  highlight(style: Partial<CSSStyleDeclaration>, el?: HTMLElement): () => void;
  
  // Setup tracking (simplified for prototype)
  setupSelectionTracking(tracker: any, doc: Document): () => void;
  canTrackSelection(doc: Document): boolean;
  resolveInsertion(event: Event, element: HTMLElement | Document): Promise<number | null>;
  getSelectionRange(element: HTMLElement | Document): Promise<{ start: number; end: number } | null>;
}

export interface CaptureEvent {
  type: 'insertion' | 'paste' | 'delete' | 'selection' | 'key';
  timestamp: number;
  pos?: number;
  length?: number;
  text?: string;
}

/**
 * LogEvent - console logging format
 */
export interface LogEvent {
  type: 'keydown' | 'keyup' | 'keypress' | 'input' | 'paste' | 'copy' | 'cut'; // 'beforeinput' | 'mutation' | 'ready';
  timestamp: number;
  key?: string;
  inputType?: string;
  data?: string;
  targetTag?: string;
  selection?: { start: number; end: number };
  message?: string;
}

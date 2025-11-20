# Word Capture Extension - Project Structure

## Overview
This extension captures user input events in Microsoft Word 365 Online documents, following the CaptureStrategy pattern.

## Directory Structure

```
word-capture-ext/
├── src/                          # Source TypeScript files
│   ├── index.ts                  # Main entry point
│   └── capture/                  # Capture strategy module
│       ├── types.ts              # Type definitions (interfaces)
│       ├── CaptureManager.ts     # Strategy manager (singleton)
│       └── WordCaptureStrategy.ts # Word-specific implementation
│
├── dist/                         # Compiled JavaScript output
│   ├── index.js                  # Compiled entry point
│   ├── index.d.ts               # Type declarations
│   ├── *.map                    # Source maps
│   └── capture/                 # Compiled capture module
│       ├── types.js
│       ├── CaptureManager.js
│       └── WordCaptureStrategy.js
│
├── content-script.js             # Final content script (copy of dist/index.js)
├── manifest.json                 # Browser extension manifest
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # NPM package configuration
└── wordCaptureStrategy-impl.ts   # [DEPRECATED] Old monolithic file
```

## Module Responsibilities

### `src/index.ts`
- **Purpose:** Main entry point for the extension
- **Responsibilities:**
  - Initializes WordCaptureStrategy and SimpleCaptureManager
  - Registers strategy with manager
  - Auto-selects and initializes strategy if URL matches
  - Sets up cleanup on page unload
  - Exposes debug interface via `window.wordCapture`
- **Exports:** None (entry point)

### `src/capture/types.ts`
- **Purpose:** Type definitions and interfaces
- **Exports:**
  - `CaptureStrategy` interface (8 methods)
  - `CaptureEvent` interface
  - `LogEvent` interface

### `src/capture/CaptureManager.ts`
- **Purpose:** Strategy registration and selection
- **Pattern:** Singleton
- **Exports:**
  - `SimpleCaptureManager` class
- **Key Methods:**
  - `register(strategy)`: Register a strategy
  - `autoSelect()`: Select strategy based on current URL

### `src/capture/WordCaptureStrategy.ts`
- **Purpose:** Word 365 Online specific capture implementation
- **Pattern:** Singleton
- **Exports:**
  - `WordCaptureStrategy` class
- **Key Features:**
  - Iframe detection and handling
  - Editor location with retry logic
  - Event capture (keyboard, input, clipboard, mutations)
  - Visual indicators (green border, notifications)
  - Selection tracking
  - PageContent div highlighting

## CaptureStrategy Interface

All capture strategies must implement these 8 methods:

1. **`matches(url: string): boolean`**
   - Determines if strategy should be used for given URL

2. **`queryNodes(doc: Document): Node[]`**
   - Returns all capturable nodes in the document

3. **`extractText(node: Node): string | null`**
   - Extracts text content from a node

4. **`highlight(node: Node | null): void`**
   - Highlights the specified node visually

5. **`setupSelectionTracking(doc: Document): void`**
   - Sets up selection change listeners

6. **`canTrackSelection(): boolean`**
   - Indicates if selection tracking is supported

7. **`resolveInsertion(event: CaptureEvent): Promise<Node | null>`**
   - Resolves where text was inserted

8. **`getSelectionRange(): Range | null`**
   - Returns current selection range

## Build Process

```bash
# Install dependencies
npm install

# Build (TypeScript → JavaScript)
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch

# Clean build artifacts
npm run clean
```

### Build Steps:
1. TypeScript compiler (`tsc`) compiles `src/**/*.ts` to `dist/`
2. Build script copies `dist/index.js` to `content-script.js`
3. Browser extension loads `content-script.js` from manifest

## Configuration

### TypeScript (`tsconfig.json`)
- **Target:** ES2020
- **Module:** ES2020
- **Root:** `./src`
- **Output:** `./dist`
- **Strict mode:** Enabled
- **Source maps:** Enabled

### Manifest (`manifest.json`)
- **Version:** Manifest V3
- **Content Script:** `content-script.js`
- **Matches:**
  - `*://*.office.com/*`
  - `*://*.officeapps.live.com/*`
  - `*://word-edit.officeapps.live.com/*`
  - `*://*.sharepoint.com/*`
- **Run at:** `document_idle`
- **All frames:** `true` (injects into iframes)

## Word Online Architecture

### Frame Structure
```
Top Frame (office.com)
└── Iframe (word-edit.officeapps.live.com)
    └── .PageContent div
        └── [contenteditable="true"] elements
```

### Editor Location Strategy
1. Check all iframes for contenteditable elements
2. Search main document if no iframes found
3. Retry up to 20 times (500ms intervals)
4. Look for specific selectors: `.WACViewPanel_EditingElement`, `[contenteditable="true"]`

## Debug Interface

Access via browser console:
```javascript
// Global object
window.wordCapture

// Methods
window.wordCapture.getEditor()       // Get editor element
window.wordCapture.getDocument()     // Get editor document
window.wordCapture.isActive()        // Check if initialized
window.wordCapture.reinitialize()    // Re-initialize strategy
window.wordCapture.strategy          // Access strategy instance
window.wordCapture.manager           // Access manager instance
```

## Event Capture

### Captured Events
- **Keyboard:** `keydown`, `keyup`, `keypress`
- **Input:** `input`, `textInput`, `beforeinput`
- **Clipboard:** `copy`, `cut`, `paste`
- **Mutations:** `characterData`, `childList`, `subtree`

### Event Filtering
- Events must originate from within editor element
- `isWithinEditor()` checks event target ancestry

## Known Limitations

1. **Cross-origin iframes:** Cannot access PageContent div in some contexts due to browser security
2. **Dynamic content:** Requires mutation observer for content changes
3. **Iframe timing:** Editor may not be immediately available, requires retry logic

## Migration from Old Structure

The old `wordCaptureStrategy-impl.ts` monolithic file (1024 lines) has been replaced with:
- `src/index.ts` (70 lines) - entry point
- `src/capture/types.ts` (55 lines) - interfaces
- `src/capture/CaptureManager.ts` (50 lines) - manager
- `src/capture/WordCaptureStrategy.ts` (700+ lines) - implementation

**Benefits:**
- ✅ Modular architecture
- ✅ Follows CaptureStrategy pattern
- ✅ Easier to maintain and test
- ✅ Better code organization
- ✅ Reusable components

## Testing

1. Build the extension: `npm run build`
2. Load in Chrome: `chrome://extensions/` → Load unpacked → select `word-capture-ext` folder
3. Navigate to Word Online document
4. Open DevTools console
5. Check for initialization logs: `[Word Capture] 🔥 Script loaded!`
6. Test input capture by typing in document
7. Check `window.wordCapture` debug interface

## Future Enhancements

- [ ] Add unit tests
- [ ] Improve PageContent highlighting for all iframe contexts
- [ ] Add support for additional Word Online features
- [ ] Create configuration UI
- [ ] Add telemetry/analytics
- [ ] Package as Chrome Web Store extension

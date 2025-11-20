#!/usr/bin/env node

/**
 * Simple build script to bundle TypeScript output into a single content script
 * Content scripts can't use ES modules, so we need to concatenate everything
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const outputFile = path.join(__dirname, 'content-script.js');

// Read all the compiled files in order
const typesJs = fs.readFileSync(path.join(distDir, 'capture', 'types.js'), 'utf8');
const captureManagerJs = fs.readFileSync(path.join(distDir, 'capture', 'CaptureManager.js'), 'utf8');
const wordStrategyJs = fs.readFileSync(path.join(distDir, 'capture', 'WordCaptureStrategy.js'), 'utf8');
// UI panel
let clipboardPanelJs = '';
try {
    clipboardPanelJs = fs.readFileSync(path.join(distDir, 'ui', 'ClipboardPanel.js'), 'utf8');
} catch (e) {
    console.warn('[build] ClipboardPanel.js missing (ui not compiled?)');
}
const indexJs = fs.readFileSync(path.join(distDir, 'index.js'), 'utf8');

// Remove all export/import statements and combine
function stripModuleSyntax(code) {
    return code
        // Remove export statements
        .replace(/export\s+\{\s*[\w\s,]*\s*\};?/g, '')
        .replace(/export\s+\{\s*\};?/g, '')
        .replace(/export\s+(class|const|let|var|function|interface|type)\s+/g, '$1 ')
        .replace(/export\s+default\s+/g, '')
        // Remove import statements
        .replace(/import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?/g, '')
        .replace(/import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]+['"];?/g, '')
        .replace(/import\s+['"][^'"]+['"];?/g, '')
        // Remove source map comments
        .replace(/\/\/# sourceMappingURL=.+\.map/g, '')
        // Clean up extra blank lines
        .replace(/\n\s*\n\s*\n/g, '\n\n');
}

// Combine all files
const bundled = `
// ============================================
// Word Capture Extension - Bundled Content Script
// Generated: ${new Date().toISOString()}
// ============================================

(function() {
    'use strict';

// ============================================
// types.js
// ============================================
${stripModuleSyntax(typesJs)}

// ============================================
// CaptureManager.js
// ============================================
${stripModuleSyntax(captureManagerJs)}

// ============================================
// WordCaptureStrategy.js
// ============================================
${stripModuleSyntax(wordStrategyJs)}

// ============================================
// ClipboardPanel.js
// ============================================
${stripModuleSyntax(clipboardPanelJs)}

// ============================================
// index.js (main entry point)
// ============================================
${stripModuleSyntax(indexJs)}

})();
`.trim();

// Write the bundled file
fs.writeFileSync(outputFile, bundled, 'utf8');

console.log('Build complete!');
console.log(`Bundled to: ${outputFile}`);

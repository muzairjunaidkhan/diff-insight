// src/changeAnalyzer.js
const { parseJS } = require('./parser/jsParser');
const { parseReact } = require('./parser/reactParser');
const { parseHTML } = require('./parser/htmlParser');
const { parseCSS } = require('./parser/cssParser');
const { parseJQuery } = require('./parser/jqueryParser');
const { assessRisk } = require('./utils');

async function analyzeChanges(diffs, options) {
  const results = [];
  
  for (const diff of diffs) {
    if (diff.binary) {
      results.push({
        file: diff.path,
        type: 'binary',
        changes: ['Binary file changed'],
        risk: 'LOW'
      });
      continue;
    }
    
    const fileType = detectFileType(diff.path, diff.diff);
    let changes = [];
    
    switch (fileType) {
      case 'javascript':
      case 'typescript':
        changes = parseJS(diff.diff, diff.path);
        break;
      case 'react':
        changes = parseReact(diff.diff, diff.path);
        break;
      case 'html':
        changes = parseHTML(diff.diff, diff.path);
        break;
      case 'css':
      case 'scss':
        changes = parseCSS(diff.diff, diff.path);
        break;
      case 'jquery':
        changes = parseJQuery(diff.diff, diff.path);
        break;
      default:
        changes = parseGeneric(diff.diff);
    }
    
    const risk = options.risk ? assessRisk(diff.path, changes) : null;
    
    results.push({
      file: diff.path,
      type: fileType,
      changes,
      risk,
      insertions: diff.insertions,
      deletions: diff.deletions
    });
  }
  
  return results;
}

function detectFileType(filepath, content) {
  const ext = filepath.split('.').pop().toLowerCase();
  
  if (ext === 'jsx' || ext === 'tsx') return 'react';
  if (ext === 'ts') return 'typescript';
  if (ext === 'js') {
    if (content.includes('$(') || content.includes('jQuery')) return 'jquery';
    return 'javascript';
  }
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'scss' || ext === 'sass') return 'scss';
  if (ext === 'json') return 'json';
  
  return 'unknown';
}

function parseGeneric(diff) {
  const lines = diff.split('\n');
  const added = lines.filter(l => l.startsWith('+')).length;
  const removed = lines.filter(l => l.startsWith('-')).length;
  
  return [`${added} lines added, ${removed} lines removed`];
}

module.exports = { analyzeChanges };
// src/changeAnalyzer.js - Updated with AST support
const { parseJSWithAST } = require('./parser/astJsParser');
const { parseReactWithAST } = require('./parser/astReactParser');
const { parseHTML } = require('./parser/htmlParser');
const { parseCSS } = require('./parser/cssParser');
const { parseJQuery } = require('./parser/jqueryParser');
const { assessRisk } = require('./utils');

/**
 * Main analyzer with AST-based parsing for supported languages
 */
async function analyzeChanges(diffs, options) {
  const results = [];
  
  for (const diff of diffs) {
    // Handle added files
    if (diff.status === 'added') {
      results.push({
        file: diff.path,
        status: 'added',
        type: detectFileType(diff.path, diff.diff),
        changes: ['File added'],
        risk: options.risk ? 'LOW' : null,
        insertions: diff.insertions,
        deletions: diff.deletions,
        complexity: calculateComplexity(diff.diff)
      });
      continue;
    }
    
    // Handle deleted files
    if (diff.status === 'deleted') {
      results.push({
        file: diff.path,
        status: 'deleted',
        type: detectFileType(diff.path, diff.diff),
        changes: ['File deleted'],
        risk: options.risk ? assessRisk(diff.path, ['File deleted']) : null,
        insertions: diff.insertions,
        deletions: diff.deletions
      });
      continue;
    }
    
    // Handle renamed files
    if (diff.status === 'renamed') {
      results.push({
        file: diff.newPath,
        oldFile: diff.oldPath,
        status: 'renamed',
        type: detectFileType(diff.newPath, diff.diff),
        changes: [`File renamed from: ${diff.oldPath}`],
        risk: options.risk ? 'LOW' : null,
        insertions: diff.insertions,
        deletions: diff.deletions
      });
      continue;
    }
    
    // Handle binary files
    if (diff.binary) {
      results.push({
        file: diff.path,
        status: 'modified',
        type: 'binary',
        changes: ['Binary file changed'],
        risk: 'LOW'
      });
      continue;
    }
    
    // Handle modified files with AST-based parsing
    const fileType = detectFileType(diff.path, diff.diff);
    let changes = [];
    let parseMethod = 'ast'; // Track which method was used
    
    switch (fileType) {
      case 'javascript':
      case 'typescript':
        try {
          changes = parseJSWithAST(diff.diff, diff.path);
          parseMethod = 'ast';
        } catch (e) {
          console.warn(`AST parsing failed for ${diff.path}: ${e.message}`);
          changes = parseGeneric(diff.diff);
          parseMethod = 'generic';
        }
        break;
        
      case 'react':
        try {
          changes = parseReactWithAST(diff.diff, diff.path);
          parseMethod = 'ast';
        } catch (e) {
          console.warn(`AST parsing failed for ${diff.path}: ${e.message}`);
          changes = parseGeneric(diff.diff);
          parseMethod = 'generic';
        }
        break;
        
      case 'html':
        changes = parseHTML(diff.diff, diff.path);
        parseMethod = 'regex';
        break;
        
      case 'css':
      case 'scss':
        changes = parseCSS(diff.diff, diff.path);
        parseMethod = 'regex';
        break;
        
      case 'jquery':
        changes = parseJQuery(diff.diff, diff.path);
        parseMethod = 'regex';
        break;
        
      default:
        changes = parseGeneric(diff.diff);
        parseMethod = 'generic';
    }
    
    const risk = options.risk ? assessRisk(diff.path, changes) : null;
    const complexity = calculateComplexity(diff.diff);
    
    results.push({
      file: diff.path,
      status: 'modified',
      type: fileType,
      changes,
      risk,
      insertions: diff.insertions,
      deletions: diff.deletions,
      complexity,
      parseMethod, // Include for debugging/transparency
      churnScore: calculateChurnScore(diff)
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
    if (content.includes('import React') || content.includes('from "react"')) return 'react';
    return 'javascript';
  }
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'scss' || ext === 'sass') return 'scss';
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'py') return 'python';
  if (ext === 'java') return 'java';
  if (ext === 'go') return 'go';
  if (ext === 'rs') return 'rust';
  
  return 'unknown';
}

function parseGeneric(diff) {
  const lines = diff.split('\n');
  const added = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
  const removed = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
  
  const changes = [];
  
  if (added > 0 && removed > 0) {
    changes.push(`Modified: +${added} -${removed} lines`);
  } else if (added > 0) {
    changes.push(`Added ${added} lines`);
  } else if (removed > 0) {
    changes.push(`Removed ${removed} lines`);
  }
  
  return changes;
}

/**
 * Calculate code complexity based on cyclomatic complexity indicators
 */
function calculateComplexity(diff) {
  const lines = diff.split('\n');
  let complexity = 0;
  
  // Count complexity indicators in added lines
  for (const line of lines) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    
    const code = line.substring(1);
    
    // Conditionals
    if (code.match(/\bif\s*\(/)) complexity += 1;
    if (code.match(/\belse\s+if\b/)) complexity += 1;
    if (code.match(/\bswitch\s*\(/)) complexity += 1;
    if (code.match(/\bcase\s+/)) complexity += 1;
    
    // Loops
    if (code.match(/\bfor\s*\(/)) complexity += 2;
    if (code.match(/\bwhile\s*\(/)) complexity += 2;
    if (code.match(/\bdo\s*\{/)) complexity += 2;
    
    // Logical operators
    if (code.match(/&&/)) complexity += 1;
    if (code.match(/\|\|/)) complexity += 1;
    
    // Try-catch
    if (code.match(/\btry\s*\{/)) complexity += 1;
    if (code.match(/\bcatch\s*\(/)) complexity += 1;
    
    // Ternary operators
    if (code.match(/\?.*:/)) complexity += 1;
  }
  
  if (complexity === 0) return 'LOW';
  if (complexity <= 5) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Calculate churn score based on frequency of changes to the same file
 */
function calculateChurnScore(diff) {
  const totalLines = diff.insertions + diff.deletions;
  
  if (totalLines < 10) return 'LOW';
  if (totalLines < 50) return 'MEDIUM';
  return 'HIGH';
}

module.exports = { analyzeChanges };

// // src/changeAnalyzer.js
// const { parseJS } = require('./parser/jsParser');
// const { parseReact } = require('./parser/reactParser');
// const { parseHTML } = require('./parser/htmlParser');
// const { parseCSS } = require('./parser/cssParser');
// const { parseJQuery } = require('./parser/jqueryParser');
// const { assessRisk } = require('./utils');

// async function analyzeChanges(diffs, options) {
//   const results = [];
  
//   for (const diff of diffs) {
//     // Handle added files
//     if (diff.status === 'added') {
//       results.push({
//         file: diff.path,
//         status: 'added',
//         type: detectFileType(diff.path, diff.diff),
//         changes: ['File added'],
//         risk: options.risk ? 'LOW' : null,
//         insertions: diff.insertions,
//         deletions: diff.deletions
//       });
//       continue;
//     }
    
//     // Handle deleted files
//     if (diff.status === 'deleted') {
//       results.push({
//         file: diff.path,
//         status: 'deleted',
//         type: detectFileType(diff.path, diff.diff),
//         changes: ['File deleted'],
//         risk: options.risk ? assessRisk(diff.path, ['File deleted']) : null,
//         insertions: diff.insertions,
//         deletions: diff.deletions
//       });
//       continue;
//     }
    
//     // Handle renamed files
//     if (diff.status === 'renamed') {
//       results.push({
//         file: diff.newPath,
//         oldFile: diff.oldPath,
//         status: 'renamed',
//         type: detectFileType(diff.newPath, diff.diff),
//         changes: [`File renamed from: ${diff.oldPath}`],
//         risk: options.risk ? 'LOW' : null,
//         insertions: diff.insertions,
//         deletions: diff.deletions
//       });
//       continue;
//     }
    
//     // Handle binary files
//     if (diff.binary) {
//       results.push({
//         file: diff.path,
//         status: 'modified',
//         type: 'binary',
//         changes: ['Binary file changed'],
//         risk: 'LOW'
//       });
//       continue;
//     }
    
//     // Handle modified files
//     const fileType = detectFileType(diff.path, diff.diff);
//     let changes = [];
    
//     switch (fileType) {
//       case 'javascript':
//       case 'typescript':
//         changes = parseJS(diff.diff, diff.path);
//         break;
//       case 'react':
//         changes = parseReact(diff.diff, diff.path);
//         break;
//       case 'html':
//         changes = parseHTML(diff.diff, diff.path);
//         break;
//       case 'css':
//       case 'scss':
//         changes = parseCSS(diff.diff, diff.path);
//         break;
//       case 'jquery':
//         changes = parseJQuery(diff.diff, diff.path);
//         break;
//       default:
//         changes = parseGeneric(diff.diff);
//     }
    
//     const risk = options.risk ? assessRisk(diff.path, changes) : null;
    
//     results.push({
//       file: diff.path,
//       status: 'modified',
//       type: fileType,
//       changes,
//       risk,
//       insertions: diff.insertions,
//       deletions: diff.deletions
//     });
//   }
  
//   return results;
// }

// function detectFileType(filepath, content) {
//   const ext = filepath.split('.').pop().toLowerCase();
  
//   if (ext === 'jsx' || ext === 'tsx') return 'react';
//   if (ext === 'ts') return 'typescript';
//   if (ext === 'js') {
//     if (content.includes('$(') || content.includes('jQuery')) return 'jquery';
//     return 'javascript';
//   }
//   if (ext === 'html' || ext === 'htm') return 'html';
//   if (ext === 'css') return 'css';
//   if (ext === 'scss' || ext === 'sass') return 'scss';
//   if (ext === 'json') return 'json';
  
//   return 'unknown';
// }

// function parseGeneric(diff) {
//   const lines = diff.split('\n');
//   const added = lines.filter(l => l.startsWith('+')).length;
//   const removed = lines.filter(l => l.startsWith('-')).length;
  
//   return [`${added} lines added, ${removed} lines removed`];
// }

// module.exports = { analyzeChanges };
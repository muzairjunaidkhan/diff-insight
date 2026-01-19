
// src/parser/jsParser.js
const acorn = require('acorn');

function parseJS(diff, filepath) {
  const changes = [];
  const lines = diff.split('\n');
  
  let addedLines = [];
  let removedLines = [];
  
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push(line.substring(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removedLines.push(line.substring(1));
    }
  }
  
  // Detect function changes
  const addedFuncs = extractFunctions(addedLines.join('\n'));
  const removedFuncs = extractFunctions(removedLines.join('\n'));
  
  for (const func of addedFuncs) {
    if (!removedFuncs.includes(func)) {
      changes.push(`Added function: ${func}`);
    }
  }
  
  for (const func of removedFuncs) {
    if (!addedFuncs.includes(func)) {
      changes.push(`Removed function: ${func}`);
    }
  }
  
  // Detect import changes
  const addedImports = extractImports(addedLines.join('\n'));
  const removedImports = extractImports(removedLines.join('\n'));
  
  addedImports.forEach(imp => {
    if (!removedImports.includes(imp)) {
      changes.push(`Added import: ${imp}`);
    }
  });
  
  removedImports.forEach(imp => {
    if (!addedImports.includes(imp)) {
      changes.push(`Removed import: ${imp}`);
    }
  });
  
  // Detect conditional logic changes
  if (addedLines.join('\n').match(/if\s*\(/)) {
    changes.push('Added conditional logic');
  }
  
  if (addedLines.join('\n').match(/try\s*\{/)) {
    changes.push('Added error handling');
  }
  
  return changes.length > 0 ? changes : ['Logic changes detected'];
}

function extractFunctions(code) {
  const funcs = [];
  const funcRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*:\s*(?:async\s*)?\()/g;
  let match;
  
  while ((match = funcRegex.exec(code)) !== null) {
    funcs.push(match[1] || match[2] || match[3]);
  }
  
  return funcs;
}

function extractImports(code) {
  const imports = [];
  const importRegex = /import\s+.*?from\s+['"](.+?)['"]/g;
  let match;
  
  while ((match = importRegex.exec(code)) !== null) {
    imports.push(match[1]);
  }
  
  return imports;
}

module.exports = { parseJS };
// src/parser/jqueryParser.js
function parseJQuery(diff, filepath) {
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
  
  const addedCode = addedLines.join('\n');
  const removedCode = removedLines.join('\n');
  
  // Detect jQuery selectors
  const addedSelectors = extractJQuerySelectors(addedCode);
  const removedSelectors = extractJQuerySelectors(removedCode);
  
  addedSelectors.forEach(sel => {
    if (!removedSelectors.includes(sel)) {
      changes.push(`Added jQuery selector: ${sel}`);
    }
  });
  
  // Detect event handlers
  if (addedCode.includes('.on(') || addedCode.includes('.bind(')) {
    changes.push('Event handler added');
  }
  
  if (removedCode.includes('.off(') || addedCode.includes('.off(')) {
    changes.push('Event handler removed');
  }
  
  // Detect chained methods
  const chainRegex = /\$\([^)]+\)(?:\.\w+\([^)]*\))+/g;
  if (addedCode.match(chainRegex)) {
    changes.push('jQuery method chaining modified');
  }
  
  return changes.length > 0 ? changes : ['jQuery code updated'];
}

function extractJQuerySelectors(code) {
  const selectors = [];
  const selectorRegex = /\$\(['"]([^'"]+)['"]\)/g;
  let match;
  
  while ((match = selectorRegex.exec(code)) !== null) {
    selectors.push(match[1]);
  }
  
  return selectors;
}

module.exports = { parseJQuery };

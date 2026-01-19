// src/parser/cssParser.js
function parseCSS(diff, filepath) {
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
  
  // Detect selector changes
  const addedSelectors = extractSelectors(addedLines.join('\n'));
  const removedSelectors = extractSelectors(removedLines.join('\n'));
  
  addedSelectors.forEach(sel => {
    if (!removedSelectors.includes(sel)) {
      changes.push(`Added selector: ${sel}`);
    }
  });
  
  removedSelectors.forEach(sel => {
    if (!addedSelectors.includes(sel)) {
      changes.push(`Removed selector: ${sel}`);
    }
  });
  
  // Detect media query changes
  if (addedLines.join('\n').includes('@media')) {
    changes.push('Media query added or modified');
  }
  
  // Detect property changes
  const propertyChanges = detectPropertyChanges(addedLines, removedLines);
  changes.push(...propertyChanges);
  
  return changes.length > 0 ? changes : ['Style rules updated'];
}

function extractSelectors(css) {
  const selectors = [];
  const selectorRegex = /([.#]?[\w-]+(?:\s*[>+~]\s*[\w-]+)*)\s*\{/g;
  let match;
  
  while ((match = selectorRegex.exec(css)) !== null) {
    selectors.push(match[1].trim());
  }
  
  return selectors;
}

function detectPropertyChanges(added, removed) {
  const changes = [];
  const addedProps = extractProperties(added.join('\n'));
  const removedProps = extractProperties(removed.join('\n'));
  
  if (addedProps.color && addedProps.color !== removedProps.color) {
    changes.push('Color property changed');
  }
  
  return changes;
}

function extractProperties(css) {
  const props = {};
  const propRegex = /([\w-]+)\s*:\s*([^;]+);/g;
  let match;
  
  while ((match = propRegex.exec(css)) !== null) {
    props[match[1]] = match[2];
  }
  
  return props;
}

module.exports = { parseCSS };
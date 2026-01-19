// src/parser/reactParser.js
const parser = require('@babel/parser');

function parseReact(diff, filepath) {
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
  
  // Detect hooks
  const addedHooks = extractHooks(addedCode);
  const removedHooks = extractHooks(removedCode);
  
  addedHooks.forEach(hook => {
    if (!removedHooks.includes(hook)) {
      changes.push(`Added hook: ${hook}`);
    }
  });
  
  removedHooks.forEach(hook => {
    if (!addedHooks.includes(hook)) {
      changes.push(`Removed hook: ${hook}`);
    }
  });
  
  // Detect component changes
  const addedComponents = extractComponents(addedCode);
  const removedComponents = extractComponents(removedCode);
  
  addedComponents.forEach(comp => {
    if (!removedComponents.includes(comp)) {
      changes.push(`Added component: ${comp}`);
    }
  });
  
  // Detect prop changes
  if (addedCode.includes('props.') || addedCode.includes('{') && addedCode.includes('}')) {
    changes.push('Props usage modified');
  }
  
  // Detect event handlers
  if (addedCode.match(/on\w+={/)) {
    changes.push('Event handlers modified');
  }
  
  return changes.length > 0 ? changes : ['Component logic updated'];
}

function extractHooks(code) {
  const hooks = [];
  const hookRegex = /use\w+\(/g;
  let match;
  
  while ((match = hookRegex.exec(code)) !== null) {
    hooks.push(match[0].replace('(', ''));
  }
  
  return hooks;
}

function extractComponents(code) {
  const components = [];
  const compRegex = /(?:function|const)\s+([A-Z]\w+)/g;
  let match;
  
  while ((match = compRegex.exec(code)) !== null) {
    components.push(match[1]);
  }
  
  return components;
}

module.exports = { parseReact };
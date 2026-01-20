// src/parser/cssParser.js - Advanced regex-based parser

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
  
  const addedContent = addedLines.join('\n');
  const removedContent = removedLines.join('\n');
  
  // 1. Selector changes (detailed analysis)
  const selectorChanges = detectSelectorChanges(addedContent, removedContent);
  changes.push(...selectorChanges);
  
  // 2. Property changes (specific properties)
  const propertyChanges = detectPropertyChanges(addedContent, removedContent);
  changes.push(...propertyChanges);
  
  // 3. Responsive design changes (media queries)
  const responsiveChanges = detectResponsiveChanges(addedContent, removedContent);
  changes.push(...responsiveChanges);
  
  // 4. Animation and transition changes
  const animationChanges = detectAnimationChanges(addedContent, removedContent);
  changes.push(...animationChanges);
  
  // 5. Layout changes (flexbox, grid, positioning)
  const layoutChanges = detectLayoutChanges(addedContent, removedContent);
  changes.push(...layoutChanges);
  
  // 6. Color and theme changes
  const colorChanges = detectColorChanges(addedContent, removedContent);
  changes.push(...colorChanges);
  
  // 7. Typography changes
  const typographyChanges = detectTypographyChanges(addedContent, removedContent);
  changes.push(...typographyChanges);
  
  // 8. CSS variables and custom properties
  const variableChanges = detectVariableChanges(addedContent, removedContent);
  changes.push(...variableChanges);
  
  // 9. Pseudo-classes and pseudo-elements
  const pseudoChanges = detectPseudoChanges(addedContent, removedContent);
  changes.push(...pseudoChanges);
  
  // 10. Import and external resources
  const importChanges = detectImportChanges(addedContent, removedContent);
  changes.push(...importChanges);
  
  // 11. CSS preprocessor features (SCSS/SASS)
  if (filepath.match(/\.(scss|sass)$/)) {
    const preprocessorChanges = detectPreprocessorChanges(addedContent, removedContent);
    changes.push(...preprocessorChanges);
  }
  
  return changes.length > 0 ? changes : ['Style rules updated'];
}

/**
 * Detect selector changes with specificity analysis
 */
function detectSelectorChanges(added, removed) {
  const changes = [];
  
  const addedSelectors = extractSelectors(added);
  const removedSelectors = extractSelectors(removed);
  
  // New selectors
  const newSelectors = addedSelectors.filter(s => !removedSelectors.includes(s));
  const deletedSelectors = removedSelectors.filter(s => !addedSelectors.includes(s));
  
  // Categorize selectors
  const categorized = categorizeSelectors(newSelectors);
  
  if (categorized.ids.length > 0) {
    changes.push(`Added ID selector${categorized.ids.length > 1 ? 's' : ''}: ${categorized.ids.slice(0, 3).join(', ')}${categorized.ids.length > 3 ? '...' : ''}`);
  }
  
  if (categorized.classes.length > 0) {
    if (categorized.classes.length <= 5) {
      categorized.classes.forEach(cls => changes.push(`Added class selector: ${cls}`));
    } else {
      changes.push(`Added ${categorized.classes.length} class selectors: ${categorized.classes.slice(0, 3).join(', ')}...`);
    }
  }
  
  if (categorized.attributes.length > 0) {
    changes.push(`Added ${categorized.attributes.length} attribute selector${categorized.attributes.length > 1 ? 's' : ''}`);
  }
  
  if (categorized.elements.length > 0 && categorized.elements.length <= 5) {
    categorized.elements.forEach(elem => changes.push(`Added element selector: ${elem}`));
  }
  
  // Complex selectors
  if (categorized.complex.length > 0) {
    changes.push(`Added ${categorized.complex.length} complex selector${categorized.complex.length > 1 ? 's' : ''} (combinators)`);
    if (categorized.complex.length <= 3) {
      categorized.complex.forEach(sel => changes.push(`  └─ ${sel}`));
    }
  }
  
  // Deleted selectors
  if (deletedSelectors.length > 0) {
    if (deletedSelectors.length <= 3) {
      deletedSelectors.forEach(sel => changes.push(`Removed selector: ${sel}`));
    } else {
      changes.push(`Removed ${deletedSelectors.length} selectors`);
    }
  }
  
  return changes;
}

function extractSelectors(css) {
  const selectors = [];
  // Match selectors before opening brace
  const regex = /([^{}]+)\s*\{/g;
  let match;
  
  while ((match = regex.exec(css)) !== null) {
    const selector = match[1].trim();
    // Skip @-rules and empty selectors
    if (selector && !selector.startsWith('@') && selector.length > 0) {
      selectors.push(selector);
    }
  }
  
  return selectors;
}

function categorizeSelectors(selectors) {
  return {
    ids: selectors.filter(s => /^#[\w-]+$/.test(s)),
    classes: selectors.filter(s => /^\.[\w-]+$/.test(s)),
    elements: selectors.filter(s => /^[a-z]+$/i.test(s)),
    attributes: selectors.filter(s => /\[[\w-]+/.test(s)),
    complex: selectors.filter(s => /[\s>+~]/.test(s))
  };
}

/**
 * Detect specific property changes
 */
function detectPropertyChanges(added, removed) {
  const changes = [];
  
  const addedProps = extractProperties(added);
  const removedProps = extractProperties(removed);
  
  // Color properties
  const colorProps = ['color', 'background-color', 'border-color', 'fill', 'stroke'];
  colorProps.forEach(prop => {
    if (addedProps[prop] && (!removedProps[prop] || addedProps[prop] !== removedProps[prop])) {
      changes.push(`Modified ${prop}: ${addedProps[prop]}`);
    }
  });
  
  // Display property
  if (addedProps.display) {
    if (!removedProps.display || addedProps.display !== removedProps.display) {
      changes.push(`Changed display to: ${addedProps.display}`);
    }
  }
  
  // Position property
  if (addedProps.position) {
    if (!removedProps.position || addedProps.position !== removedProps.position) {
      changes.push(`Changed position to: ${addedProps.position}`);
    }
  }
  
  // Z-index
  if (addedProps['z-index']) {
    changes.push(`Set z-index: ${addedProps['z-index']}`);
  }
  
  // Visibility and opacity
  if (addedProps.visibility === 'hidden' || addedProps.display === 'none') {
    changes.push('⚠ Element hidden via CSS');
  }
  
  if (addedProps.opacity && parseFloat(addedProps.opacity) < 0.5) {
    changes.push(`Set opacity to ${addedProps.opacity} (semi-transparent)`);
  }
  
  return changes;
}

function extractProperties(css) {
  const props = {};
  const propRegex = /([\w-]+)\s*:\s*([^;]+);/g;
  let match;
  
  while ((match = propRegex.exec(css)) !== null) {
    const prop = match[1].trim();
    const value = match[2].trim();
    props[prop] = value;
  }
  
  return props;
}

/**
 * Detect responsive design changes
 */
function detectResponsiveChanges(added, removed) {
  const changes = [];
  
  // Media queries
  const addedMediaQueries = extractMediaQueries(added);
  const removedMediaQueries = extractMediaQueries(removed);
  
  if (addedMediaQueries.length > removedMediaQueries.length) {
    const diff = addedMediaQueries.length - removedMediaQueries.length;
    changes.push(`Added ${diff} media quer${diff > 1 ? 'ies' : 'y'}`);
    
    // Analyze breakpoints
    const breakpoints = [];
    addedMediaQueries.forEach(mq => {
      const widthMatch = mq.match(/(?:max|min)-width:\s*(\d+(?:\.\d+)?)(px|em|rem)/);
      if (widthMatch) {
        breakpoints.push(`${widthMatch[1]}${widthMatch[2]}`);
      }
    });
    
    if (breakpoints.length > 0) {
      changes.push(`  └─ Breakpoints: ${[...new Set(breakpoints)].join(', ')}`);
    }
    
    // Detect device targeting
    if (addedMediaQueries.some(mq => /max-width:\s*768px/.test(mq))) {
      changes.push('  └─ Tablet/mobile responsive rules added');
    }
    if (addedMediaQueries.some(mq => /max-width:\s*480px/.test(mq))) {
      changes.push('  └─ Mobile-specific rules added');
    }
  }
  
  // Container queries (modern CSS)
  if (/@container/.test(added)) {
    changes.push('Added container query (modern CSS)');
  }
  
  return changes;
}

function extractMediaQueries(css) {
  const queries = [];
  const regex = /@media\s*([^{]+)\{/g;
  let match;
  
  while ((match = regex.exec(css)) !== null) {
    queries.push(match[1].trim());
  }
  
  return queries;
}

/**
 * Detect animation and transition changes
 */
function detectAnimationChanges(added, removed) {
  const changes = [];
  
  // Keyframe animations
  const addedKeyframes = (added.match(/@keyframes\s+([\w-]+)/g) || []);
  if (addedKeyframes.length > 0) {
    const names = addedKeyframes.map(kf => kf.replace(/@keyframes\s+/, ''));
    changes.push(`Added ${addedKeyframes.length} animation${addedKeyframes.length > 1 ? 's' : ''}: ${names.join(', ')}`);
  }
  
  // Animation property
  if (/animation(?:-name)?:/.test(added)) {
    const animCount = (added.match(/animation(?:-name)?:/g) || []).length;
    changes.push(`Applied animation to ${animCount} element${animCount > 1 ? 's' : ''}`);
  }
  
  // Transitions
  if (/transition:/.test(added)) {
    const transCount = (added.match(/transition:/g) || []).length;
    changes.push(`Added ${transCount} transition${transCount > 1 ? 's' : ''}`);
    
    // Extract transition properties
    const transMatch = added.match(/transition:\s*([^;]+);/);
    if (transMatch) {
      changes.push(`  └─ Properties: ${transMatch[1].split(',')[0].trim()}`);
    }
  }
  
  // Transform
  if (/transform:/.test(added)) {
    const transforms = added.match(/transform:\s*([^;]+);/g) || [];
    if (transforms.length > 0) {
      changes.push(`Added ${transforms.length} CSS transform${transforms.length > 1 ? 's' : ''}`);
    }
  }
  
  return changes;
}

/**
 * Detect layout system changes
 */
function detectLayoutChanges(added, removed) {
  const changes = [];
  
  // Flexbox
  if (/display:\s*flex/.test(added)) {
    const flexCount = (added.match(/display:\s*flex/g) || []).length;
    changes.push(`Implemented Flexbox layout (${flexCount} container${flexCount > 1 ? 's' : ''})`);
    
    // Flex direction
    if (/flex-direction:\s*column/.test(added)) {
      changes.push('  └─ Column layout');
    }
    
    // Justify/align
    if (/justify-content:/.test(added)) {
      const justifyMatch = added.match(/justify-content:\s*([\w-]+)/);
      if (justifyMatch) {
        changes.push(`  └─ Justify: ${justifyMatch[1]}`);
      }
    }
  }
  
  // CSS Grid
  if (/display:\s*grid/.test(added)) {
    const gridCount = (added.match(/display:\s*grid/g) || []).length;
    changes.push(`Implemented CSS Grid layout (${gridCount} container${gridCount > 1 ? 's' : ''})`);
    
    // Grid template
    const templateMatch = added.match(/grid-template-columns:\s*([^;]+);/);
    if (templateMatch) {
      const columns = templateMatch[1].split(/\s+/).length;
      changes.push(`  └─ ${columns} column grid`);
    }
    
    // Grid gap
    if (/gap:/.test(added) || /grid-gap:/.test(added)) {
      changes.push('  └─ With gap spacing');
    }
  }
  
  // Positioning
  const positions = ['absolute', 'fixed', 'sticky'];
  positions.forEach(pos => {
    if (new RegExp(`position:\\s*${pos}`).test(added)) {
      const count = (added.match(new RegExp(`position:\\s*${pos}`, 'g')) || []).length;
      changes.push(`Set ${count} element${count > 1 ? 's' : ''} to position: ${pos}`);
    }
  });
  
  return changes;
}

/**
 * Detect color and theme changes
 */
function detectColorChanges(added, removed) {
  const changes = [];
  
  // Extract all colors
  const addedColors = extractColors(added);
  const removedColors = extractColors(removed);
  
  const newColors = addedColors.filter(c => !removedColors.includes(c));
  
  if (newColors.length > 0) {
    if (newColors.length <= 5) {
      changes.push(`Added colors: ${newColors.join(', ')}`);
    } else {
      changes.push(`Added ${newColors.length} new colors`);
    }
  }
  
  // Dark mode / theme support
  if (/@media\s*\(prefers-color-scheme:\s*dark\)/.test(added)) {
    changes.push('✓ Added dark mode support');
  }
  
  // CSS filters (can affect colors)
  if (/filter:/.test(added)) {
    changes.push('Added CSS filter effects');
  }
  
  return changes;
}

function extractColors(css) {
  const colors = new Set();
  
  // Hex colors
  const hexRegex = /#[0-9a-f]{3,6}\b/gi;
  let match;
  while ((match = hexRegex.exec(css)) !== null) {
    colors.add(match[0].toLowerCase());
  }
  
  // RGB/RGBA
  const rgbRegex = /rgba?\([^)]+\)/gi;
  while ((match = rgbRegex.exec(css)) !== null) {
    colors.add(match[0]);
  }
  
  // HSL/HSLA
  const hslRegex = /hsla?\([^)]+\)/gi;
  while ((match = hslRegex.exec(css)) !== null) {
    colors.add(match[0]);
  }
  
  return Array.from(colors);
}

/**
 * Detect typography changes
 */
function detectTypographyChanges(added, removed) {
  const changes = [];
  
  // Font family changes
  const fontMatch = added.match(/font-family:\s*([^;]+);/);
  if (fontMatch) {
    changes.push(`Changed font family: ${fontMatch[1]}`);
  }
  
  // Font size changes
  const fontSizes = added.match(/font-size:\s*([^;]+);/g);
  if (fontSizes && fontSizes.length > 0) {
    changes.push(`Modified font sizes (${fontSizes.length} instance${fontSizes.length > 1 ? 's' : ''})`);
  }
  
  // Font weight
  if (/font-weight:\s*(?:bold|[6-9]00)/.test(added)) {
    changes.push('Added bold text styling');
  }
  
  // Text alignment
  const alignMatch = added.match(/text-align:\s*([\w-]+)/);
  if (alignMatch) {
    changes.push(`Text alignment: ${alignMatch[1]}`);
  }
  
  // Line height
  if (/line-height:/.test(added)) {
    changes.push('Modified line height');
  }
  
  // Letter spacing
  if (/letter-spacing:/.test(added)) {
    changes.push('Added letter spacing');
  }
  
  // Text transform
  const transformMatch = added.match(/text-transform:\s*([\w-]+)/);
  if (transformMatch) {
    changes.push(`Text transform: ${transformMatch[1]}`);
  }
  
  // Web fonts (@font-face)
  if (/@font-face/.test(added)) {
    const fontFaces = (added.match(/@font-face/g) || []).length;
    changes.push(`Added ${fontFaces} custom font${fontFaces > 1 ? 's' : ''} (@font-face)`);
  }
  
  return changes;
}

/**
 * Detect CSS variable changes
 */
function detectVariableChanges(added, removed) {
  const changes = [];
  
  // CSS custom properties (variables)
  const addedVars = extractCSSVariables(added);
  const removedVars = extractCSSVariables(removed);
  
  const newVars = addedVars.filter(v => !removedVars.includes(v));
  const deletedVars = removedVars.filter(v => !addedVars.includes(v));
  
  if (newVars.length > 0) {
    if (newVars.length <= 5) {
      newVars.forEach(v => changes.push(`Added CSS variable: ${v}`));
    } else {
      changes.push(`Added ${newVars.length} CSS variables`);
      newVars.slice(0, 3).forEach(v => changes.push(`  └─ ${v}`));
    }
  }
  
  if (deletedVars.length > 0) {
    changes.push(`Removed ${deletedVars.length} CSS variable${deletedVars.length > 1 ? 's' : ''}`);
  }
  
  // Using CSS variables
  const varUsage = (added.match(/var\(--[\w-]+\)/g) || []).length;
  if (varUsage > 0) {
    changes.push(`Using ${varUsage} CSS variable reference${varUsage > 1 ? 's' : ''}`);
  }
  
  return changes;
}

function extractCSSVariables(css) {
  const vars = new Set();
  const regex = /--([\w-]+):/g;
  let match;
  
  while ((match = regex.exec(css)) !== null) {
    vars.add(`--${match[1]}`);
  }
  
  return Array.from(vars);
}

/**
 * Detect pseudo-class and pseudo-element changes
 */
function detectPseudoChanges(added, removed) {
  const changes = [];
  
  // Pseudo-classes
  const pseudoClasses = [':hover', ':focus', ':active', ':visited', ':disabled', ':checked', ':first-child', ':last-child', ':nth-child'];
  
  pseudoClasses.forEach(pseudo => {
    const addedCount = (added.match(new RegExp(pseudo.replace(/[()]/g, '\\$&'), 'g')) || []).length;
    const removedCount = (removed.match(new RegExp(pseudo.replace(/[()]/g, '\\$&'), 'g')) || []).length;
    
    if (addedCount > removedCount) {
      changes.push(`Added ${addedCount - removedCount} ${pseudo} state${addedCount - removedCount > 1 ? 's' : ''}`);
    }
  });
  
  // Pseudo-elements
  const pseudoElements = ['::before', '::after', '::placeholder', '::selection'];
  
  pseudoElements.forEach(pseudo => {
    if (new RegExp(pseudo).test(added)) {
      const count = (added.match(new RegExp(pseudo, 'g')) || []).length;
      changes.push(`Added ${count} ${pseudo} pseudo-element${count > 1 ? 's' : ''}`);
    }
  });
  
  return changes;
}

/**
 * Detect import changes
 */
function detectImportChanges(added, removed) {
  const changes = [];
  
  // @import rules
  const addedImports = (added.match(/@import\s+(?:url\()?["']([^"')]+)["']\)?/g) || []);
  if (addedImports.length > 0) {
    changes.push(`Added ${addedImports.length} @import statement${addedImports.length > 1 ? 's' : ''}`);
    
    // Extract URLs
    const urls = addedImports.map(imp => {
      const match = imp.match(/["']([^"']+)["']/);
      return match ? match[1] : '';
    }).filter(Boolean);
    
    if (urls.length > 0 && urls.length <= 3) {
      urls.forEach(url => changes.push(`  └─ ${url}`));
    }
  }
  
  return changes;
}

/**
 * Detect SCSS/SASS preprocessor features
 */
function detectPreprocessorChanges(added, removed) {
  const changes = [];
  
  // Variables
  const scssVars = (added.match(/\$[\w-]+:/g) || []);
  if (scssVars.length > 0) {
    const unique = [...new Set(scssVars.map(v => v.replace(/:$/, '')))];
    if (unique.length <= 5) {
      changes.push(`Added SCSS variables: ${unique.join(', ')}`);
    } else {
      changes.push(`Added ${unique.length} SCSS variables`);
    }
  }
  
  // Mixins
  const mixinDefs = (added.match(/@mixin\s+([\w-]+)/g) || []);
  if (mixinDefs.length > 0) {
    const names = mixinDefs.map(m => m.replace(/@mixin\s+/, ''));
    changes.push(`Defined ${mixinDefs.length} mixin${mixinDefs.length > 1 ? 's' : ''}: ${names.join(', ')}`);
  }
  
  const mixinIncludes = (added.match(/@include\s+([\w-]+)/g) || []);
  if (mixinIncludes.length > 0) {
    changes.push(`Used ${mixinIncludes.length} mixin${mixinIncludes.length > 1 ? 's' : ''}`);
  }
  
  // Nesting
  const nestingDepth = detectNestingDepth(added);
  if (nestingDepth > 2) {
    changes.push(`⚠ Deep nesting detected (${nestingDepth} levels)`);
  }
  
  // Extend/Inheritance
  if (/@extend/.test(added)) {
    const extendCount = (added.match(/@extend/g) || []).length;
    changes.push(`Used @extend ${extendCount} time${extendCount > 1 ? 's' : ''}`);
  }
  
  // Functions
  const functionDefs = (added.match(/@function\s+([\w-]+)/g) || []);
  if (functionDefs.length > 0) {
    changes.push(`Defined ${functionDefs.length} SCSS function${functionDefs.length > 1 ? 's' : ''}`);
  }
  
  return changes;
}

function detectNestingDepth(css) {
  let maxDepth = 0;
  let currentDepth = 0;
  
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (css[i] === '}') {
      currentDepth--;
    }
  }
  
  return maxDepth;
}

module.exports = { parseCSS };

// // src/parser/cssParser.js
// function parseCSS(diff, filepath) {
//   const changes = [];
//   const lines = diff.split('\n');
  
//   let addedLines = [];
//   let removedLines = [];
  
//   for (const line of lines) {
//     if (line.startsWith('+') && !line.startsWith('+++')) {
//       addedLines.push(line.substring(1));
//     } else if (line.startsWith('-') && !line.startsWith('---')) {
//       removedLines.push(line.substring(1));
//     }
//   }
  
//   // Detect selector changes
//   const addedSelectors = extractSelectors(addedLines.join('\n'));
//   const removedSelectors = extractSelectors(removedLines.join('\n'));
  
//   addedSelectors.forEach(sel => {
//     if (!removedSelectors.includes(sel)) {
//       changes.push(`Added selector: ${sel}`);
//     }
//   });
  
//   removedSelectors.forEach(sel => {
//     if (!addedSelectors.includes(sel)) {
//       changes.push(`Removed selector: ${sel}`);
//     }
//   });
  
//   // Detect media query changes
//   if (addedLines.join('\n').includes('@media')) {
//     changes.push('Media query added or modified');
//   }
  
//   // Detect property changes
//   const propertyChanges = detectPropertyChanges(addedLines, removedLines);
//   changes.push(...propertyChanges);
  
//   return changes.length > 0 ? changes : ['Style rules updated'];
// }

// function extractSelectors(css) {
//   const selectors = [];
//   const selectorRegex = /([.#]?[\w-]+(?:\s*[>+~]\s*[\w-]+)*)\s*\{/g;
//   let match;
  
//   while ((match = selectorRegex.exec(css)) !== null) {
//     selectors.push(match[1].trim());
//   }
  
//   return selectors;
// }

// function detectPropertyChanges(added, removed) {
//   const changes = [];
//   const addedProps = extractProperties(added.join('\n'));
//   const removedProps = extractProperties(removed.join('\n'));
  
//   if (addedProps.color && addedProps.color !== removedProps.color) {
//     changes.push('Color property changed');
//   }
  
//   return changes;
// }

// function extractProperties(css) {
//   const props = {};
//   const propRegex = /([\w-]+)\s*:\s*([^;]+);/g;
//   let match;
  
//   while ((match = propRegex.exec(css)) !== null) {
//     props[match[1]] = match[2];
//   }
  
//   return props;
// }

// module.exports = { parseCSS };
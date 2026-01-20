// src/parser/cssParser.js - PostCSS AST with regex fallback

const postcss = require('postcss');
const postcssScss = require('postcss-scss');
const postcssNested = require('postcss-nested');

/**
 * Main CSS parser with AST-first approach
 */
async function parseCSS(diff, filepath) {
  try {
    console.log(`[CSS-AST] Parsing ${filepath} with PostCSS...`);
    
    const changes = await parseCSSWithAST(diff, filepath);
    
    if (changes.length > 0) {
      console.log(`[CSS-AST] ✓ Success: ${filepath}`);
      return changes;
    }
    
    throw new Error('No changes detected by AST');
    
  } catch (astError) {
    console.warn(`[CSS-AST] ✗ Failed: ${filepath} - ${astError.message}`);
    console.log(`[CSS-FALLBACK] Trying regex parser for ${filepath}...`);
    
    try {
      const changes = parseCSSWithRegex(diff, filepath);
      console.log(`[CSS-FALLBACK] ✓ Success: ${filepath}`);
      return changes;
    } catch (regexError) {
      console.warn(`[CSS-FALLBACK] ✗ Failed: ${filepath}`);
      return ['Component visual changes detected'];
    }
  }
}

/**
 * PostCSS AST-based parser
 */
async function parseCSSWithAST(diff, filepath) {
  const changes = [];
  const lines = diff.split('\n');
  
  // Extract added and removed content
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
  
  // Determine syntax (CSS, SCSS, SASS)
  const syntax = filepath.match(/\.(scss|sass)$/) ? postcssScss : null;
  
  // Parse both added and removed content
  let addedAST, removedAST;
  
  try {
    if (addedContent.trim()) {
      addedAST = postcss([postcssNested]).process(addedContent, { 
        syntax,
        from: filepath 
      }).root;
    }
  } catch (e) {
    console.warn(`[CSS-AST] Warning: Could not parse added content`);
  }
  
  try {
    if (removedContent.trim()) {
      removedAST = postcss([postcssNested]).process(removedContent, { 
        syntax,
        from: filepath 
      }).root;
    }
  } catch (e) {
    console.warn(`[CSS-AST] Warning: Could not parse removed content`);
  }
  
  // 1. Analyze selectors
  if (addedAST) {
    const selectorChanges = analyzeSelectorChanges(addedAST, removedAST);
    changes.push(...selectorChanges);
  }
  
  // 2. Analyze declarations
  if (addedAST) {
    const declarationChanges = analyzeDeclarationChanges(addedAST, removedAST);
    changes.push(...declarationChanges);
  }
  
  // 3. Analyze at-rules (media queries, keyframes, etc.)
  if (addedAST) {
    const atRuleChanges = analyzeAtRules(addedAST, removedAST);
    changes.push(...atRuleChanges);
  }
  
  // 4. Analyze SCSS/SASS features
  if (filepath.match(/\.(scss|sass)$/)) {
    const preprocessorChanges = analyzePreprocessorFeatures(addedContent, removedContent);
    changes.push(...preprocessorChanges);
  }
  
  return changes;
}

/**
 * Analyze selector changes using AST
 */
function analyzeSelectorChanges(addedAST, removedAST) {
  const changes = [];
  
  const addedSelectors = extractSelectorsFromAST(addedAST);
  const removedSelectors = removedAST ? extractSelectorsFromAST(removedAST) : [];
  
  // Find new and deleted selectors
  const newSelectors = addedSelectors.filter(s => !removedSelectors.includes(s));
  const deletedSelectors = removedSelectors.filter(s => !addedSelectors.includes(s));
  
  // Add new selectors
  newSelectors.forEach(selector => {
    changes.push(`Property added: selector ${selector}`);
  });
  
  // Remove selectors
  deletedSelectors.forEach(selector => {
    changes.push(`Property removed: selector ${selector}`);
  });
  
  return changes;
}

/**
 * Extract all selectors from AST
 */
function extractSelectorsFromAST(ast) {
  const selectors = [];
  
  ast.walkRules(rule => {
    if (rule.selector) {
      selectors.push(rule.selector.trim());
    }
  });
  
  return selectors;
}

/**
 * Normalize CSS values for comparison
 */
function normalizeValue(value, prop) {
  if (!value) return value;
  
  const val = value.toString().trim().toLowerCase();
  
  // Normalize hex colors: #fff → #ffffff
  if (/^#([0-9a-f]{3})$/i.test(val)) {
    const [, rgb] = val.match(/^#([0-9a-f]{3})$/i);
    return `#${rgb[0]}${rgb[0]}${rgb[1]}${rgb[1]}${rgb[2]}${rgb[2]}`;
  }
  
  // Normalize hex colors to lowercase
  if (/^#[0-9a-f]{6}$/i.test(val)) {
    return val.toLowerCase();
  }
  
  // Normalize decimals: 0.5 → 0.50 (2 decimal places for consistency)
  if (/^\d*\.\d+$/.test(val)) {
    return parseFloat(val).toFixed(2);
  }
  
  // Normalize zero values: 0px, 0em, 0% → 0
  if (/^0(px|em|rem|%|vh|vw)?$/.test(val)) {
    return '0';
  }
  
  // Normalize RGB/RGBA spaces
  if (val.startsWith('rgb')) {
    return val.replace(/\s+/g, '');
  }
  
  return val;
}

/**
 * Analyze declaration (property) changes
 */
function analyzeDeclarationChanges(addedAST, removedAST) {
  const changes = [];

  const addedProps = extractDeclarationsFromAST(addedAST);
  const removedProps = removedAST ? extractDeclarationsFromAST(removedAST) : {};

  const toArray = (val) => (Array.isArray(val) ? val : val ? [val] : []);

  const allProps = new Set([...Object.keys(addedProps), ...Object.keys(removedProps)]);

  allProps.forEach(prop => {
    const addedVals = toArray(addedProps[prop]).map(v => normalizeValue(v, prop));
    const removedVals = toArray(removedProps[prop]).map(v => normalizeValue(v, prop));

    const addedUnique = Array.from(new Set(addedVals));
    const removedUnique = Array.from(new Set(removedVals));

    // Count occurrences for each value
    const addedCounts = {};
    const removedCounts = {};
    
    addedVals.forEach(v => addedCounts[v] = (addedCounts[v] || 0) + 1);
    removedVals.forEach(v => removedCounts[v] = (removedCounts[v] || 0) + 1);

    // Handle high-impact properties with special formatting
    if (prop === 'display') {
      handleDisplayChanges(addedUnique, removedUnique, addedCounts, addedAST, changes);
      return;
    }

    if (prop === 'position') {
      handlePositionChanges(addedUnique, removedUnique, addedCounts, changes);
      return;
    }

    if (prop === 'visibility') {
      handleVisibilityChanges(addedUnique, removedUnique, addedCounts, changes);
      return;
    }

    if (prop === 'opacity') {
      handleOpacityChanges(addedUnique, removedUnique, addedCounts, changes);
      return;
    }

    if (prop === 'z-index') {
      handleZIndexChanges(addedUnique, removedUnique, addedCounts, changes);
      return;
    }

    // Standard property handling: added, removed, changed
    const newValues = addedUnique.filter(v => !removedUnique.includes(v));
    const deletedValues = removedUnique.filter(v => !addedUnique.includes(v));
    
    newValues.forEach(value => {
      const count = addedCounts[value];
      if (count > 1) {
        changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property added: ${prop}: ${value}`);
      }
    });

    deletedValues.forEach(value => {
      const count = removedCounts[value];
      if (count > 1) {
        changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: ${prop}: ${value}`);
      }
    });

    // Detect value changes (1-to-1 mapping)
    if (removedUnique.length === 1 && addedUnique.length === 1 && removedUnique[0] !== addedUnique[0]) {
      const totalCount = Math.max(addedVals.length, removedVals.length);
      if (totalCount > 1) {
        changes.push(`Property changed: ${prop} from ${removedUnique[0]} → ${addedUnique[0]} (${totalCount} elements)`);
      } else {
        changes.push(`Property changed: ${prop} from ${removedUnique[0]} → ${addedUnique[0]}`);
      }
    } else if (removedUnique.length > 0 && addedUnique.length > 0 && 
               newValues.length === 0 && deletedValues.length === 0) {
      // Multiple values changed but no clear 1-to-1 mapping
      const totalCount = Math.max(addedVals.length, removedVals.length);
      if (totalCount > 2) {
        changes.push(`Property changed multiple times: ${prop} (${totalCount} elements)`);
      }
    }
  });

  // Analyze layout systems, animations & typography
  analyzeLayoutSystems(addedAST, removedAST, changes);
  analyzeAnimations(addedAST, removedAST, changes);
  analyzeTypography(addedAST, removedAST, changes);

  return changes;
}

/**
 * Handle display property changes with special formatting
 */
function handleDisplayChanges(added, removed, counts, addedAST, changes) {
  added.forEach(value => {
    if (!removed.includes(value)) {
      const count = counts[value];
      
      if (value === 'flex') {
        changes.push('Implemented Flexbox layout');
        analyzeFlexboxProperties(addedAST, changes);
      } else if (value === 'grid') {
        changes.push('Implemented CSS Grid layout');
        analyzeGridProperties(addedAST, changes);
      } else if (value === 'none') {
        if (count > 1) {
          changes.push(`⚠ Element hidden via display: none (${count} elements)`);
        } else {
          changes.push('⚠ Element hidden via display: none');
        }
      } else {
        if (count > 1) {
          changes.push(`Property added: display: ${value} (${count} elements)`);
        } else {
          changes.push(`Property added: display: ${value}`);
        }
      }
    }
  });
  
  removed.forEach(value => {
    if (!added.includes(value)) {
      const count = counts[value];
      if (count > 1) {
        changes.push(`Property removed: display: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: display: ${value}`);
      }
    }
  });
  
  // Detect changes
  if (removed.length === 1 && added.length === 1 && removed[0] !== added[0]) {
    changes.push(`Property changed: display from ${removed[0]} → ${added[0]}`);
  }
}

/**
 * Handle position property changes
 */
function handlePositionChanges(added, removed, counts, changes) {
  added.forEach(value => {
    if (!removed.includes(value)) {
      const count = counts[value];
      if (count > 1) {
        changes.push(`Property added: position: ${value} (${count} elements)`);
      } else {
        changes.push(`Property added: position: ${value}`);
      }
    }
  });
  
  removed.forEach(value => {
    if (!added.includes(value)) {
      const count = counts[value];
      if (count > 1) {
        changes.push(`Property removed: position: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: position: ${value}`);
      }
    }
  });
  
  if (removed.length === 1 && added.length === 1 && removed[0] !== added[0]) {
    changes.push(`Property changed: position from ${removed[0]} → ${added[0]}`);
  }
}

/**
 * Handle visibility property changes
 */
function handleVisibilityChanges(added, removed, counts, changes) {
  added.forEach(value => {
    if (!removed.includes(value)) {
      const count = counts[value];
      if (value === 'hidden') {
        if (count > 1) {
          changes.push(`⚠ Element hidden via visibility: hidden (${count} elements)`);
        } else {
          changes.push('⚠ Element hidden via visibility: hidden');
        }
      } else {
        if (count > 1) {
          changes.push(`Property added: visibility: ${value} (${count} elements)`);
        } else {
          changes.push(`Property added: visibility: ${value}`);
        }
      }
    }
  });
  
  removed.forEach(value => {
    if (!added.includes(value)) {
      const count = counts[value];
      if (count > 1) {
        changes.push(`Property removed: visibility: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: visibility: ${value}`);
      }
    }
  });
  
  if (removed.length === 1 && added.length === 1 && removed[0] !== added[0]) {
    changes.push(`Property changed: visibility from ${removed[0]} → ${added[0]}`);
  }
}

/**
 * Handle opacity property changes
 */
function handleOpacityChanges(added, removed, counts, changes) {
  added.forEach(value => {
    if (!removed.includes(value)) {
      const count = counts[value];
      if (count > 1) {
        changes.push(`Property added: opacity: ${value} (${count} elements)`);
      } else {
        changes.push(`Property added: opacity: ${value}`);
      }
    }
  });
  
  removed.forEach(value => {
    if (!added.includes(value)) {
      const count = counts[value];
      if (count > 1) {
        changes.push(`Property removed: opacity: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: opacity: ${value}`);
      }
    }
  });
  
  if (removed.length === 1 && added.length === 1 && removed[0] !== added[0]) {
    changes.push(`Property changed: opacity from ${removed[0]} → ${added[0]}`);
  }
}

/**
 * Handle z-index property changes
 */
function handleZIndexChanges(added, removed, counts, changes) {
  added.forEach(value => {
    if (!removed.includes(value)) {
      const count = counts[value];
      if (count > 1) {
        changes.push(`Property added: z-index: ${value} (${count} elements)`);
      } else {
        changes.push(`Property added: z-index: ${value}`);
      }
    }
  });
  
  removed.forEach(value => {
    if (!added.includes(value)) {
      const count = counts[value];
      if (count > 1) {
        changes.push(`Property removed: z-index: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: z-index: ${value}`);
      }
    }
  });
  
  if (removed.length === 1 && added.length === 1 && removed[0] !== added[0]) {
    changes.push(`Property changed: z-index from ${removed[0]} → ${added[0]}`);
  }
}

/**
 * Analyze layout systems (Flexbox and Grid) with deep analysis
 */
function analyzeLayoutSystems(addedAST, removedAST, changes) {
  // Already handled in handleDisplayChanges, but we analyze details here
  // This is called after display changes are detected
}

/**
 * Extract all declarations from AST
 */
function extractDeclarationsFromAST(ast) {
  const props = {};
  
  ast.walkDecls(decl => {
    if (!props[decl.prop]) {
      props[decl.prop] = [];
    }
    props[decl.prop].push(decl.value);
  });
  
  return props;
}

/**
 * Analyze Flexbox properties
 */
function analyzeFlexboxProperties(ast, changes) {
  const flexProps = {};
  
  ast.walkDecls(decl => {
    if (decl.prop.startsWith('flex-') || ['justify-content', 'align-items', 'align-content', 'gap'].includes(decl.prop)) {
      flexProps[decl.prop] = decl.value;
    }
  });
  
  if (flexProps['flex-direction'] === 'column') {
    changes.push('  └─ Column layout');
  }
  
  if (flexProps['justify-content']) {
    changes.push(`  └─ Justify: ${flexProps['justify-content']}`);
  }
  
  if (flexProps['align-items']) {
    changes.push(`  └─ Align: ${flexProps['align-items']}`);
  }
  
  if (flexProps['gap']) {
    changes.push(`  └─ Gap: ${flexProps['gap']}`);
  }
}

/**
 * Analyze Grid properties
 */
function analyzeGridProperties(ast, changes) {
  ast.walkDecls(decl => {
    if (decl.prop === 'grid-template-columns') {
      const columns = decl.value.split(/\s+/).filter(v => v && v !== '|').length;
      changes.push(`  └─ ${columns} column grid`);
    }
    
    if (decl.prop === 'gap' || decl.prop === 'grid-gap') {
      changes.push(`  └─ With gap spacing: ${decl.value}`);
    }
    
    if (decl.prop === 'grid-template-rows') {
      changes.push(`  └─ Row template: ${decl.value}`);
    }
  });
}

/**
 * Analyze animations and transitions
 */
function analyzeAnimations(addedAST, removedAST, changes) {
  const addedAnimProps = {};
  const removedAnimProps = removedAST ? {} : {};
  
  addedAST.walkDecls(decl => {
    if (decl.prop.startsWith('animation') || decl.prop === 'transition' || decl.prop === 'transform') {
      if (!addedAnimProps[decl.prop]) {
        addedAnimProps[decl.prop] = [];
      }
      addedAnimProps[decl.prop].push(decl.value);
    }
  });
  
  if (removedAST) {
    removedAST.walkDecls(decl => {
      if (decl.prop.startsWith('animation') || decl.prop === 'transition' || decl.prop === 'transform') {
        if (!removedAnimProps[decl.prop]) {
          removedAnimProps[decl.prop] = [];
        }
        removedAnimProps[decl.prop].push(decl.value);
      }
    });
  }
  
  // Animation changes
  Object.keys(addedAnimProps).forEach(prop => {
    const added = addedAnimProps[prop];
    const removed = removedAnimProps[prop] || [];
    
    const newVals = added.filter(v => !removed.includes(v));
    const removedVals = removed.filter(v => !added.includes(v));
    
    newVals.forEach(value => {
      const count = added.filter(v => v === value).length;
      if (count > 1) {
        changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property added: ${prop}: ${value}`);
      }
    });
    
    removedVals.forEach(value => {
      const count = removed.filter(v => v === value).length;
      if (count > 1) {
        changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: ${prop}: ${value}`);
      }
    });
    
    // Detect changes
    if (removed.length === 1 && added.length === 1 && removed[0] !== added[0]) {
      changes.push(`Property changed: ${prop} from ${removed[0]} → ${added[0]}`);
    }
  });
}

/**
 * Analyze typography
 */
function analyzeTypography(addedAST, removedAST, changes) {
  const typographyProps = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration'];
  
  const addedTypo = {};
  const removedTypo = removedAST ? {} : {};
  
  addedAST.walkDecls(decl => {
    if (typographyProps.includes(decl.prop)) {
      if (!addedTypo[decl.prop]) {
        addedTypo[decl.prop] = [];
      }
      addedTypo[decl.prop].push(decl.value);
    }
  });
  
  if (removedAST) {
    removedAST.walkDecls(decl => {
      if (typographyProps.includes(decl.prop)) {
        if (!removedTypo[decl.prop]) {
          removedTypo[decl.prop] = [];
        }
        removedTypo[decl.prop].push(decl.value);
      }
    });
  }
  
  // Typography changes
  Object.keys(addedTypo).forEach(prop => {
    const added = addedTypo[prop];
    const removed = removedTypo[prop] || [];
    
    const newVals = added.filter(v => !removed.includes(v));
    const removedVals = removed.filter(v => !added.includes(v));
    
    newVals.forEach(value => {
      const count = added.filter(v => v === value).length;
      if (count > 1) {
        changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property added: ${prop}: ${value}`);
      }
    });
    
    removedVals.forEach(value => {
      const count = removed.filter(v => v === value).length;
      if (count > 1) {
        changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: ${prop}: ${value}`);
      }
    });
    
    // Detect changes
    if (removed.length === 1 && added.length === 1 && removed[0] !== added[0]) {
      changes.push(`Property changed: ${prop} from ${removed[0]} → ${added[0]}`);
    }
  });
}

/**
 * Analyze at-rules (media queries, keyframes, etc.)
 */
function analyzeAtRules(addedAST, removedAST) {
  const changes = [];
  
  const addedAtRules = extractAtRules(addedAST);
  const removedAtRules = removedAST ? extractAtRules(removedAST) : { media: [], keyframes: [], import: [], fontFace: [], supports: [], container: [] };
  
  // Media queries
  const newMedia = addedAtRules.media.filter(m => !removedAtRules.media.includes(m));
  const removedMedia = removedAtRules.media.filter(m => !addedAtRules.media.includes(m));
  
  newMedia.forEach(params => {
    changes.push(`Property added: @media ${params}`);
    
    // Check for dark mode
    if (/prefers-color-scheme:\s*dark/.test(params)) {
      changes.push('✓ Added dark mode support');
    }
  });
  
  removedMedia.forEach(params => {
    changes.push(`Property removed: @media ${params}`);
  });
  
  // Detect media query changes
  if (removedAtRules.media.length === 1 && addedAtRules.media.length === 1 && 
      !newMedia.length && !removedMedia.length) {
    // Media queries exist but are different
    const oldParam = removedAtRules.media[0];
    const newParam = addedAtRules.media[0];
    if (oldParam !== newParam) {
      changes.push(`Property changed: @media from ${oldParam} → ${newParam}`);
    }
  }
  
  // Keyframes
  const newKeyframes = addedAtRules.keyframes.filter(k => !removedAtRules.keyframes.includes(k));
  const removedKeyframes = removedAtRules.keyframes.filter(k => !addedAtRules.keyframes.includes(k));
  
  newKeyframes.forEach(name => {
    changes.push(`Property added: @keyframes ${name}`);
  });
  
  removedKeyframes.forEach(name => {
    changes.push(`Property removed: @keyframes ${name}`);
  });
  
  // Font-face
  if (addedAtRules.fontFace.length > removedAtRules.fontFace.length) {
    const diff = addedAtRules.fontFace.length - removedAtRules.fontFace.length;
    changes.push(`Property added: @font-face (${diff} custom font${diff > 1 ? 's' : ''})`);
  }
  
  // Imports
  const newImports = addedAtRules.import.filter(i => !removedAtRules.import.includes(i));
  const removedImports = removedAtRules.import.filter(i => !addedAtRules.import.includes(i));
  
  newImports.forEach(url => {
    changes.push(`Property added: @import ${url}`);
  });
  
  removedImports.forEach(url => {
    changes.push(`Property removed: @import ${url}`);
  });
  
  // Container queries
  const newContainer = addedAtRules.container.filter(c => !removedAtRules.container.includes(c));
  newContainer.forEach(params => {
    changes.push(`Property added: container-type: ${params}`);
  });
  
  // Supports queries
  const newSupports = addedAtRules.supports.filter(s => !removedAtRules.supports.includes(s));
  newSupports.forEach(params => {
    changes.push(`Property added: @supports ${params}`);
  });
  
  return changes;
}

/**
 * Extract at-rules from AST
 */
function extractAtRules(ast) {
  const atRules = {
    media: [],
    keyframes: [],
    import: [],
    fontFace: [],
    supports: [],
    container: []
  };
  
  ast.walkAtRules(atRule => {
    switch (atRule.name) {
      case 'media':
        atRules.media.push(atRule.params);
        break;
      case 'keyframes':
        atRules.keyframes.push(atRule.params);
        break;
      case 'import':
        atRules.import.push(atRule.params.replace(/['"]/g, ''));
        break;
      case 'font-face':
        atRules.fontFace.push('font-face');
        break;
      case 'supports':
        atRules.supports.push(atRule.params);
        break;
      case 'container':
        atRules.container.push(atRule.params);
        break;
    }
  });
  
  return atRules;
}

/**
 * Analyze SCSS/SASS preprocessor features
 */
function analyzePreprocessorFeatures(added, removed) {
  const changes = [];
  
  // SCSS variables
  const addedVars = (added.match(/\$[\w-]+:/g) || []).map(v => v.replace(/:$/, ''));
  const removedVars = (removed.match(/\$[\w-]+:/g) || []).map(v => v.replace(/:$/, ''));
  
  const newVars = addedVars.filter(v => !removedVars.includes(v));
  const deletedVars = removedVars.filter(v => !addedVars.includes(v));
  
  newVars.forEach(varName => {
    // Try to extract value
    const regex = new RegExp(`\\${varName}:\\s*([^;]+);`);
    const match = added.match(regex);
    if (match) {
      changes.push(`Property added: SCSS variable ${varName}: ${match[1].trim()}`);
    } else {
      changes.push(`Property added: SCSS variable ${varName}`);
    }
  });
  
  deletedVars.forEach(varName => {
    changes.push(`Property removed: SCSS variable ${varName}`);
  });
  
  // Detect variable value changes
  const commonVars = addedVars.filter(v => removedVars.includes(v));
  commonVars.forEach(varName => {
    const addedRegex = new RegExp(`\\${varName}:\\s*([^;]+);`);
    const removedRegex = new RegExp(`\\${varName}:\\s*([^;]+);`);
    const addedMatch = added.match(addedRegex);
    const removedMatch = removed.match(removedRegex);
    
    if (addedMatch && removedMatch && addedMatch[1] !== removedMatch[1]) {
      changes.push(`Property changed: SCSS variable ${varName} from ${removedMatch[1].trim()} → ${addedMatch[1].trim()}`);
    }
  });
  
  // Mixins
  const mixinDefs = (added.match(/@mixin\s+([\w-]+)/g) || []);
  const removedMixinDefs = (removed.match(/@mixin\s+([\w-]+)/g) || []);
  
  const newMixins = mixinDefs.filter(m => !removedMixinDefs.includes(m));
  newMixins.forEach(mixin => {
    const name = mixin.replace(/@mixin\s+/, '');
    changes.push(`Defined mixin: ${name}`);
  });
  
  const mixinIncludes = (added.match(/@include\s+([\w-]+)/g) || []);
  const removedMixinIncludes = (removed.match(/@include\s+([\w-]+)/g) || []);
  
  const newIncludes = mixinIncludes.filter(m => !removedMixinIncludes.includes(m));
  newIncludes.forEach(include => {
    const name = include.replace(/@include\s+/, '');
    changes.push(`Used mixin: ${name}`);
  });
  
  // Extend
  const extendMatches = (added.match(/@extend\s+([^;]+);/g) || []);
  const removedExtends = (removed.match(/@extend\s+([^;]+);/g) || []);
  
  const newExtends = extendMatches.filter(e => !removedExtends.includes(e));
  newExtends.forEach(extend => {
    const selector = extend.replace(/@extend\s+/, '').replace(/;$/, '');
    changes.push(`Property used: @extend ${selector}`);
  });
  
  // Functions
  const functionDefs = (added.match(/@function\s+([\w-]+)/g) || []);
  const removedFunctionDefs = (removed.match(/@function\s+([\w-]+)/g) || []);
  
  const newFunctions = functionDefs.filter(f => !removedFunctionDefs.includes(f));
  newFunctions.forEach(func => {
    const name = func.replace(/@function\s+/, '');
    changes.push(`Defined SCSS function: ${name}`);
  });
  
  // Nesting depth
  const addedDepth = detectNestingDepth(added);
  const removedDepth = detectNestingDepth(removed);
  
  if (addedDepth > 4 && addedDepth > removedDepth) {
    changes.push(`⚠ Deep nesting detected (${addedDepth} levels)`);
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

/**
 * REGEX FALLBACK PARSER
 * Used when PostCSS AST parsing fails
 */
function parseCSSWithRegex(diff, filepath) {
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
  
  // Selector changes (basic regex)
  const selectorChanges = detectSelectorChangesRegex(addedContent, removedContent);
  changes.push(...selectorChanges);
  
  // Property changes
  const propertyChanges = detectPropertyChangesRegex(addedContent, removedContent);
  changes.push(...propertyChanges);
  
  // Media queries
  const responsiveChanges = detectResponsiveChangesRegex(addedContent, removedContent);
  changes.push(...responsiveChanges);
  
  // Animations
  const animationChanges = detectAnimationChangesRegex(addedContent, removedContent);
  changes.push(...animationChanges);
  
  // SCSS features
  if (filepath.match(/\.(scss|sass)$/)) {
    const preprocessorChanges = detectPreprocessorChangesRegex(addedContent, removedContent);
    changes.push(...preprocessorChanges);
  }
  
  return changes.length > 0 ? changes : ['Component visual changes detected'];
}

function detectSelectorChangesRegex(added, removed) {
  const changes = [];
  const addedSelectors = extractSelectorsRegex(added);
  const removedSelectors = extractSelectorsRegex(removed);
  
  const newSelectors = addedSelectors.filter(s => !removedSelectors.includes(s));
  const deletedSelectors = removedSelectors.filter(s => !addedSelectors.includes(s));
  
  newSelectors.forEach(selector => {
    changes.push(`Property added: selector ${selector}`);
  });
  
  deletedSelectors.forEach(selector => {
    changes.push(`Property removed: selector ${selector}`);
  });
  
  return changes;
}

function extractSelectorsRegex(css) {
  const selectors = [];
  const regex = /([^{}]+)\s*\{/g;
  let match;
  
  while ((match = regex.exec(css)) !== null) {
    const selector = match[1].trim();
    if (selector && !selector.startsWith('@')) {
      selectors.push(selector);
    }
  }
  
  return selectors;
}

function detectPropertyChangesRegex(added, removed) {
  const changes = [];
  
  // Extract properties from added and removed content
  const addedProps = extractPropertiesRegex(added);
  const removedProps = extractPropertiesRegex(removed);
  
  const allProps = new Set([...Object.keys(addedProps), ...Object.keys(removedProps)]);
  
  allProps.forEach(prop => {
    const addedVals = addedProps[prop] || [];
    const removedVals = removedProps[prop] || [];
    
    const newVals = addedVals.filter(v => !removedVals.includes(v));
    const deletedVals = removedVals.filter(v => !addedVals.includes(v));
    
    // High-impact properties
    if (prop === 'display') {
      newVals.forEach(value => {
        if (value === 'flex') {
          changes.push('Implemented Flexbox layout');
        } else if (value === 'grid') {
          changes.push('Implemented CSS Grid layout');
        } else if (value === 'none') {
          changes.push('⚠ Element hidden via display: none');
        } else {
          changes.push(`Property added: display: ${value}`);
        }
      });
      deletedVals.forEach(value => {
        changes.push(`Property removed: display: ${value}`);
      });
      if (removedVals.length === 1 && addedVals.length === 1 && removedVals[0] !== addedVals[0]) {
        changes.push(`Property changed: display from ${removedVals[0]} → ${addedVals[0]}`);
      }
      return;
    }
    
    // Standard properties
    newVals.forEach(value => {
      const count = addedVals.filter(v => v === value).length;
      if (count > 1) {
        changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property added: ${prop}: ${value}`);
      }
    });
    
    deletedVals.forEach(value => {
      const count = removedVals.filter(v => v === value).length;
      if (count > 1) {
        changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: ${prop}: ${value}`);
      }
    });
    
    // Detect changes
    if (removedVals.length === 1 && addedVals.length === 1 && removedVals[0] !== addedVals[0]) {
      changes.push(`Property changed: ${prop} from ${removedVals[0]} → ${addedVals[0]}`);
    }
  });
  
  return changes;
}

function extractPropertiesRegex(css) {
  const props = {};
  const regex = /([\w-]+)\s*:\s*([^;{]+)/g;
  let match;
  
  while ((match = regex.exec(css)) !== null) {
    const prop = match[1].trim();
    const value = match[2].trim();
    
    if (!props[prop]) {
      props[prop] = [];
    }
    props[prop].push(normalizeValue(value, prop));
  }
  
  return props;
}

function detectResponsiveChangesRegex(added, removed) {
  const changes = [];
  
  const addedMedia = (added.match(/@media[^{]+/g) || []).map(m => m.replace(/@media\s*/, '').trim());
  const removedMedia = (removed.match(/@media[^{]+/g) || []).map(m => m.replace(/@media\s*/, '').trim());
  
  const newMedia = addedMedia.filter(m => !removedMedia.includes(m));
  const deletedMedia = removedMedia.filter(m => !addedMedia.includes(m));
  
  newMedia.forEach(params => {
    changes.push(`Property added: @media ${params}`);
    if (/prefers-color-scheme:\s*dark/.test(params)) {
      changes.push('✓ Added dark mode support');
    }
  });
  
  deletedMedia.forEach(params => {
    changes.push(`Property removed: @media ${params}`);
  });
  
  return changes;
}

function detectAnimationChangesRegex(added, removed) {
  const changes = [];
  
  const addedKeyframes = (added.match(/@keyframes\s+([\w-]+)/g) || []).map(k => k.replace(/@keyframes\s+/, ''));
  const removedKeyframes = (removed.match(/@keyframes\s+([\w-]+)/g) || []).map(k => k.replace(/@keyframes\s+/, ''));
  
  const newKeyframes = addedKeyframes.filter(k => !removedKeyframes.includes(k));
  const deletedKeyframes = removedKeyframes.filter(k => !addedKeyframes.includes(k));
  
  newKeyframes.forEach(name => {
    changes.push(`Property added: @keyframes ${name}`);
  });
  
  deletedKeyframes.forEach(name => {
    changes.push(`Property removed: @keyframes ${name}`);
  });
  
  return changes;
}

function detectPreprocessorChangesRegex(added, removed) {
  const changes = [];
  
  // SCSS variables
  const addedVars = (added.match(/\$[\w-]+:/g) || []).map(v => v.replace(/:$/, ''));
  const removedVars = (removed.match(/\$[\w-]+:/g) || []).map(v => v.replace(/:$/, ''));
  
  const newVars = addedVars.filter(v => !removedVars.includes(v));
  
  newVars.forEach(varName => {
    changes.push(`Property added: SCSS variable ${varName}`);
  });
  
  return changes;
}

module.exports = { parseCSS };


// // src/parser/cssParser.js - PostCSS AST with regex fallback

// const postcss = require('postcss');
// const postcssScss = require('postcss-scss');
// const postcssNested = require('postcss-nested');

// /**
//  * Main CSS parser with AST-first approach
//  */
// async function parseCSS(diff, filepath) {
//   try {
//     console.log(`[CSS-AST] Parsing ${filepath} with PostCSS...`);
    
//     const changes = await parseCSSWithAST(diff, filepath);
    
//     if (changes.length > 0) {
//       console.log(`[CSS-AST] ✓ Success: ${filepath}`);
//       return changes;
//     }
    
//     throw new Error('No changes detected by AST');
    
//   } catch (astError) {
//     console.warn(`[CSS-AST] ✗ Failed: ${filepath} - ${astError.message}`);
//     console.log(`[CSS-FALLBACK] Trying regex parser for ${filepath}...`);
    
//     try {
//       const changes = parseCSSWithRegex(diff, filepath);
//       console.log(`[CSS-FALLBACK] ✓ Success: ${filepath}`);
//       return changes;
//     } catch (regexError) {
//       console.warn(`[CSS-FALLBACK] ✗ Failed: ${filepath}`);
//       return ['Style rules updated'];
//     }
//   }
// }

// /**
//  * PostCSS AST-based parser
//  */
// async function parseCSSWithAST(diff, filepath) {
//   const changes = [];
//   const lines = diff.split('\n');
  
//   // Extract added and removed content
//   let addedLines = [];
//   let removedLines = [];
  
//   for (const line of lines) {
//     if (line.startsWith('+') && !line.startsWith('+++')) {
//       addedLines.push(line.substring(1));
//     } else if (line.startsWith('-') && !line.startsWith('---')) {
//       removedLines.push(line.substring(1));
//     }
//   }
  
//   const addedContent = addedLines.join('\n');
//   const removedContent = removedLines.join('\n');
  
//   // Determine syntax (CSS, SCSS, SASS)
//   const syntax = filepath.match(/\.(scss|sass)$/) ? postcssScss : null;
  
//   // Parse both added and removed content
//   let addedAST, removedAST;
  
//   try {
//     if (addedContent.trim()) {
//       addedAST = postcss([postcssNested]).process(addedContent, { 
//         syntax,
//         from: filepath 
//       }).root;
//     }
//   } catch (e) {
//     console.warn(`[CSS-AST] Warning: Could not parse added content`);
//   }
  
//   try {
//     if (removedContent.trim()) {
//       removedAST = postcss([postcssNested]).process(removedContent, { 
//         syntax,
//         from: filepath 
//       }).root;
//     }
//   } catch (e) {
//     console.warn(`[CSS-AST] Warning: Could not parse removed content`);
//   }
  
//   // 1. Analyze selectors
//   if (addedAST) {
//     const selectorChanges = analyzeSelectorChanges(addedAST, removedAST);
//     changes.push(...selectorChanges);
//   }
  
//   // 2. Analyze declarations
//   if (addedAST) {
//     const declarationChanges = analyzeDeclarationChanges(addedAST, removedAST);
//     changes.push(...declarationChanges);
//   }
  
//   // 3. Analyze at-rules (media queries, keyframes, etc.)
//   if (addedAST) {
//     const atRuleChanges = analyzeAtRules(addedAST, removedAST);
//     changes.push(...atRuleChanges);
//   }
  
//   // 4. Analyze SCSS/SASS features
//   if (filepath.match(/\.(scss|sass)$/)) {
//     const preprocessorChanges = analyzePreprocessorFeatures(addedContent, removedContent);
//     changes.push(...preprocessorChanges);
//   }
  
//   return changes;
// }

// /**
//  * Analyze selector changes using AST
//  */
// function analyzeSelectorChanges(addedAST, removedAST) {
//   const changes = [];
  
//   const addedSelectors = extractSelectorsFromAST(addedAST);
//   const removedSelectors = removedAST ? extractSelectorsFromAST(removedAST) : [];
  
//   // Find new selectors
//   const newSelectors = addedSelectors.filter(s => !removedSelectors.includes(s));
//   const deletedSelectors = removedSelectors.filter(s => !addedSelectors.includes(s));
  
//   // Categorize selectors
//   const categorized = categorizeSelectors(newSelectors);
  
//   // ID selectors
//   if (categorized.ids.length > 0) {
//     changes.push(`Added ID selector${categorized.ids.length > 1 ? 's' : ''}: ${categorized.ids.slice(0, 3).join(', ')}${categorized.ids.length > 3 ? '...' : ''}`);
//   }
  
//   // Class selectors
//   if (categorized.classes.length > 0) {
//     if (categorized.classes.length <= 5) {
//       categorized.classes.forEach(cls => changes.push(`Added class selector: ${cls}`));
//     } else {
//       changes.push(`Added ${categorized.classes.length} class selectors: ${categorized.classes.slice(0, 3).join(', ')}...`);
//     }
//   }
  
//   // Attribute selectors
//   if (categorized.attributes.length > 0) {
//     changes.push(`Added ${categorized.attributes.length} attribute selector${categorized.attributes.length > 1 ? 's' : ''}`);
//     if (categorized.attributes.length <= 3) {
//       categorized.attributes.forEach(sel => changes.push(`  └─ ${sel}`));
//     }
//   }
  
//   // Element selectors
//   if (categorized.elements.length > 0 && categorized.elements.length <= 5) {
//     categorized.elements.forEach(elem => changes.push(`Added element selector: ${elem}`));
//   }
  
//   // Complex selectors (with combinators)
//   if (categorized.complex.length > 0) {
//     changes.push(`Added ${categorized.complex.length} complex selector${categorized.complex.length > 1 ? 's' : ''}`);
//     if (categorized.complex.length <= 3) {
//       categorized.complex.forEach(sel => changes.push(`  └─ ${sel}`));
//     }
//   }
  
//   // Pseudo-class selectors
//   if (categorized.pseudo.length > 0) {
//     const pseudoTypes = {};
//     categorized.pseudo.forEach(sel => {
//       const match = sel.match(/:([\w-]+)/);
//       if (match) {
//         const pseudo = `:${match[1]}`;
//         pseudoTypes[pseudo] = (pseudoTypes[pseudo] || 0) + 1;
//       }
//     });
    
//     Object.entries(pseudoTypes).forEach(([pseudo, count]) => {
//       changes.push(`Added ${count} ${pseudo} state${count > 1 ? 's' : ''}`);
//     });
//   }
  
//   // Nested/descendant selectors (SCSS)
//   if (categorized.nested.length > 0) {
//     changes.push(`Added ${categorized.nested.length} nested selector${categorized.nested.length > 1 ? 's' : ''}`);
//   }
  
//   // Deleted selectors
//   if (deletedSelectors.length > 0) {
//     if (deletedSelectors.length <= 3) {
//       deletedSelectors.forEach(sel => changes.push(`Removed selector: ${sel}`));
//     } else {
//       changes.push(`Removed ${deletedSelectors.length} selectors`);
//     }
//   }
  
//   return changes;
// }

// /**
//  * Extract all selectors from AST
//  */
// function extractSelectorsFromAST(ast) {
//   const selectors = [];
  
//   ast.walkRules(rule => {
//     if (rule.selector) {
//       selectors.push(rule.selector.trim());
//     }
//   });
  
//   return selectors;
// }

// /**
//  * Categorize selectors by type
//  */
// function categorizeSelectors(selectors) {
//   return {
//     ids: selectors.filter(s => /^#[\w-]+$/.test(s)),
//     classes: selectors.filter(s => /^\.[\w-]+$/.test(s)),
//     elements: selectors.filter(s => /^[a-z]+$/i.test(s) && !s.includes(':')),
//     attributes: selectors.filter(s => /\[[\w-]+/.test(s)),
//     complex: selectors.filter(s => /[\s>+~]/.test(s) && !s.includes(':')),
//     pseudo: selectors.filter(s => /:(?!:)/.test(s)), // Single colon pseudo-classes
//     nested: selectors.filter(s => s.includes('&'))
//   };
// }

// /**
//  * Analyze declaration (property) changes
//  */
// // function analyzeDeclarationChanges(addedAST, removedAST) {
// //   const changes = [];
  
// //   const addedProps = extractDeclarationsFromAST(addedAST);
// //   const removedProps = removedAST ? extractDeclarationsFromAST(removedAST) : {};
  
// //   // Display changes
// //   if (addedProps.display) {
// //     const values = Array.from(new Set(addedProps.display));
// //     if (values.includes('flex')) {
// //       changes.push(`Implemented Flexbox layout`);
// //       analyzeFlexboxProperties(addedAST, changes);
// //     }
// //     if (values.includes('grid')) {
// //       changes.push(`Implemented CSS Grid layout`);
// //       analyzeGridProperties(addedAST, changes);
// //     }
// //     if (values.includes('none')) {
// //       changes.push('⚠ Element hidden via display: none');
// //     }
// //   }
  
// //   // Position changes
// //   if (addedProps.position) {
// //     const positions = Array.from(new Set(addedProps.position));
// //     positions.forEach(pos => {
// //       if (['absolute', 'fixed', 'sticky'].includes(pos)) {
// //         const count = addedProps.position.filter(p => p === pos).length;
// //         changes.push(`Set ${count} element${count > 1 ? 's' : ''} to position: ${pos}`);
// //       }
// //     });
// //   }
  
// //   // Color changes
// //   const colorProps = ['color', 'background-color', 'border-color', 'fill', 'stroke'];
// //   const colorChanges = [];
// //   colorProps.forEach(prop => {
// //     if (addedProps[prop]) {
// //       colorChanges.push(...addedProps[prop]);
// //     }
// //   });
  
// //   if (colorChanges.length > 0) {
// //     const uniqueColors = Array.from(new Set(colorChanges));
// //     if (uniqueColors.length <= 5) {
// //       changes.push(`Added colors: ${uniqueColors.join(', ')}`);
// //     } else {
// //       changes.push(`Added ${uniqueColors.length} new colors`);
// //     }
// //   }
  
// //   // Animation changes
// //   analyzeAnimations(addedAST, changes);
  
// //   // Typography changes
// //   analyzeTypography(addedAST, changes);
  
// //   // Z-index changes
// //   if (addedProps['z-index']) {
// //     const zIndexes = Array.from(new Set(addedProps['z-index']));
// //     changes.push(`Set z-index: ${zIndexes.join(', ')}`);
// //   }
  
// //   // Opacity/visibility
// //   if (addedProps.opacity) {
// //     const lowOpacity = addedProps.opacity.filter(o => parseFloat(o) < 0.5);
// //     if (lowOpacity.length > 0) {
// //       changes.push(`Set ${lowOpacity.length} element${lowOpacity.length > 1 ? 's' : ''} to semi-transparent`);
// //     }
// //   }
  
// //   if (addedProps.visibility) {
// //     const hidden = addedProps.visibility.filter(v => v === 'hidden');
// //     if (hidden.length > 0) {
// //       changes.push(`⚠ ${hidden.length} element${hidden.length > 1 ? 's' : ''} hidden via visibility`);
// //     }
// //   }
  
// //   return changes;
// // }

// function analyzeDeclarationChanges(addedAST, removedAST) {
//   const changes = [];

//   const addedProps = extractDeclarationsFromAST(addedAST);
//   const removedProps = removedAST ? extractDeclarationsFromAST(removedAST) : {};

//   const toArray = (val) => (Array.isArray(val) ? val : val ? [val] : []);

//   const allProps = new Set([...Object.keys(addedProps), ...Object.keys(removedProps)]);

//   allProps.forEach(prop => {
//     const addedVals = Array.from(new Set(toArray(addedProps[prop])));
//     const removedVals = Array.from(new Set(toArray(removedProps[prop])));

//     // New values
//     addedVals.forEach(value => {
//       if (!removedVals.includes(value)) {
//         switch (prop) {
//           case 'display':
//             if (value === 'flex') {
//               changes.push('Implemented Flexbox layout');
//               analyzeFlexboxProperties(addedAST, changes);
//             } else if (value === 'grid') {
//               changes.push('Implemented CSS Grid layout');
//               analyzeGridProperties(addedAST, changes);
//             } else if (value === 'none') {
//               changes.push('⚠ Element hidden via display: none');
//             }
//             break;
//           case 'position':
//             if (['absolute', 'fixed', 'sticky'].includes(value)) {
//               const count = addedVals.filter(v => v === value).length;
//               changes.push(`Set ${count} element${count>1?'s':''} to position: ${value}`);
//             }
//             break;
//           case 'opacity':
//             if (parseFloat(value) < 0.5) {
//               changes.push(`Set ${addedVals.filter(v => parseFloat(v) < 0.5).length} element${addedVals.filter(v => parseFloat(v) < 0.5).length > 1 ? 's':''} to semi-transparent`);
//             }
//             break;
//           case 'visibility':
//             if (value === 'hidden') {
//               changes.push(`⚠ ${addedVals.filter(v => v==='hidden').length} element${addedVals.filter(v => v==='hidden').length > 1?'s':''} hidden via visibility`);
//             }
//             break;
//           case 'z-index':
//             changes.push(`Set z-index: ${addedVals.join(', ')}`);
//             break;
//           default:
//             changes.push(`Property added/changed: ${prop}: ${value}`);
//         }
//       }
//     });

//     // Removed values (optional, if you want to track removals)
//     removedVals.forEach(value => {
//       if (!addedVals.includes(value)) {
//         changes.push(`Removed ${prop}: ${value}`);
//       }
//     });
//   });

//   // Animations & Typography
//   analyzeAnimations(addedAST, changes);
//   analyzeTypography(addedAST, changes);

//   return changes;
// }


// /**
//  * Extract all declarations from AST
//  */
// function extractDeclarationsFromAST(ast) {
//   const props = {};
  
//   ast.walkDecls(decl => {
//     if (!props[decl.prop]) {
//       props[decl.prop] = [];
//     }
//     props[decl.prop].push(decl.value);
//   });
  
//   return props;
// }

// /**
//  * Analyze Flexbox properties
//  */
// function analyzeFlexboxProperties(ast, changes) {
//   const flexProps = {};
  
//   ast.walkDecls(decl => {
//     if (decl.prop.startsWith('flex-') || ['justify-content', 'align-items', 'align-content'].includes(decl.prop)) {
//       flexProps[decl.prop] = decl.value;
//     }
//   });
  
//   if (flexProps['flex-direction'] === 'column') {
//     changes.push('  └─ Column layout');
//   }
  
//   if (flexProps['justify-content']) {
//     changes.push(`  └─ Justify: ${flexProps['justify-content']}`);
//   }
  
//   if (flexProps['align-items']) {
//     changes.push(`  └─ Align: ${flexProps['align-items']}`);
//   }
// }

// /**
//  * Analyze Grid properties
//  */
// function analyzeGridProperties(ast, changes) {
//   ast.walkDecls(decl => {
//     if (decl.prop === 'grid-template-columns') {
//       const columns = decl.value.split(/\s+/).length;
//       changes.push(`  └─ ${columns} column grid`);
//     }
    
//     if (decl.prop === 'gap' || decl.prop === 'grid-gap') {
//       changes.push(`  └─ With gap spacing: ${decl.value}`);
//     }
//   });
// }

// /**
//  * Analyze animations and transitions
//  */
// function analyzeAnimations(ast, changes) {
//   let animationCount = 0;
//   let transitionCount = 0;
//   let transformCount = 0;
  
//   ast.walkDecls(decl => {
//     if (decl.prop.startsWith('animation')) {
//       animationCount++;
//     } else if (decl.prop === 'transition') {
//       transitionCount++;
//     } else if (decl.prop === 'transform') {
//       transformCount++;
//     }
//   });
  
//   if (animationCount > 0) {
//     changes.push(`Applied animation to ${animationCount} element${animationCount > 1 ? 's' : ''}`);
//   }
  
//   if (transitionCount > 0) {
//     changes.push(`Added ${transitionCount} transition${transitionCount > 1 ? 's' : ''}`);
//   }
  
//   if (transformCount > 0) {
//     changes.push(`Added ${transformCount} CSS transform${transformCount > 1 ? 's' : ''}`);
//   }
// }

// /**
//  * Analyze typography
//  */
// function analyzeTypography(ast, changes) {
//   const typographyProps = {};
  
//   ast.walkDecls(decl => {
//     if (['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-transform'].includes(decl.prop)) {
//       if (!typographyProps[decl.prop]) {
//         typographyProps[decl.prop] = [];
//       }
//       typographyProps[decl.prop].push(decl.value);
//     }
//   });
  
//   if (typographyProps['font-family']) {
//     changes.push(`Changed font family: ${typographyProps['font-family'][0]}`);
//   }
  
//   if (typographyProps['font-size']) {
//     changes.push(`Modified font sizes (${typographyProps['font-size'].length} instance${typographyProps['font-size'].length > 1 ? 's' : ''})`);
//   }
  
//   if (typographyProps['font-weight']) {
//     const bold = typographyProps['font-weight'].some(w => w === 'bold' || parseInt(w) >= 600);
//     if (bold) {
//       changes.push('Added bold text styling');
//     }
//   }
// }

// /**
//  * Analyze at-rules (media queries, keyframes, etc.)
//  */
// function analyzeAtRules(addedAST, removedAST) {
//   const changes = [];
  
//   const addedAtRules = extractAtRules(addedAST);
//   const removedAtRules = removedAST ? extractAtRules(removedAST) : { media: [], keyframes: [], import: [], fontFace: [], supports: [], container: [] };
  
//   // Media queries
//   if (addedAtRules.media.length > removedAtRules.media.length) {
//     const diff = addedAtRules.media.length - removedAtRules.media.length;
//     changes.push(`Added ${diff} media quer${diff > 1 ? 'ies' : 'y'}`);
    
//     // Analyze breakpoints
//     const breakpoints = [];
//     addedAtRules.media.forEach(params => {
//       const widthMatch = params.match(/(?:max|min)-width:\s*(\d+(?:\.\d+)?)(px|em|rem)/);
//       if (widthMatch) {
//         breakpoints.push(`${widthMatch[1]}${widthMatch[2]}`);
//       }
//     });
    
//     if (breakpoints.length > 0) {
//       changes.push(`  └─ Breakpoints: ${[...new Set(breakpoints)].join(', ')}`);
//     }
    
//     // Dark mode
//     if (addedAtRules.media.some(p => /prefers-color-scheme:\s*dark/.test(p))) {
//       changes.push('✓ Added dark mode support');
//     }
//   }
  
//   // Keyframes
//   if (addedAtRules.keyframes.length > 0) {
//     changes.push(`Added ${addedAtRules.keyframes.length} animation${addedAtRules.keyframes.length > 1 ? 's' : ''}: ${addedAtRules.keyframes.join(', ')}`);
//   }
  
//   // Font-face
//   if (addedAtRules.fontFace.length > 0) {
//     changes.push(`Added ${addedAtRules.fontFace.length} custom font${addedAtRules.fontFace.length > 1 ? 's' : ''} (@font-face)`);
//   }
  
//   // Imports
//   if (addedAtRules.import.length > 0) {
//     changes.push(`Added ${addedAtRules.import.length} @import statement${addedAtRules.import.length > 1 ? 's' : ''}`);
//     if (addedAtRules.import.length <= 3) {
//       addedAtRules.import.forEach(url => changes.push(`  └─ ${url}`));
//     }
//   }
  
//   // Container queries
//   if (addedAtRules.container.length > 0) {
//     changes.push('Added container query (modern CSS)');
//   }
  
//   // Supports queries
//   if (addedAtRules.supports.length > 0) {
//     changes.push(`Added ${addedAtRules.supports.length} @supports rule${addedAtRules.supports.length > 1 ? 's' : ''}`);
//   }
  
//   return changes;
// }

// /**
//  * Extract at-rules from AST
//  */
// function extractAtRules(ast) {
//   const atRules = {
//     media: [],
//     keyframes: [],
//     import: [],
//     fontFace: [],
//     supports: [],
//     container: []
//   };
  
//   ast.walkAtRules(atRule => {
//     switch (atRule.name) {
//       case 'media':
//         atRules.media.push(atRule.params);
//         break;
//       case 'keyframes':
//         atRules.keyframes.push(atRule.params);
//         break;
//       case 'import':
//         atRules.import.push(atRule.params.replace(/['"]/g, ''));
//         break;
//       case 'font-face':
//         atRules.fontFace.push('font-face');
//         break;
//       case 'supports':
//         atRules.supports.push(atRule.params);
//         break;
//       case 'container':
//         atRules.container.push(atRule.params);
//         break;
//     }
//   });
  
//   return atRules;
// }

// /**
//  * Analyze SCSS/SASS preprocessor features
//  */
// function analyzePreprocessorFeatures(added, removed) {
//   const changes = [];
  
//   // SCSS variables
//   const scssVars = (added.match(/\$[\w-]+:/g) || []);
//   if (scssVars.length > 0) {
//     const unique = [...new Set(scssVars.map(v => v.replace(/:$/, '')))];
//     if (unique.length <= 5) {
//       changes.push(`Added SCSS variables: ${unique.join(', ')}`);
//     } else {
//       changes.push(`Added ${unique.length} SCSS variables`);
//     }
//   }
  
//   // Mixins
//   const mixinDefs = (added.match(/@mixin\s+([\w-]+)/g) || []);
//   if (mixinDefs.length > 0) {
//     const names = mixinDefs.map(m => m.replace(/@mixin\s+/, ''));
//     changes.push(`Defined ${mixinDefs.length} mixin${mixinDefs.length > 1 ? 's' : ''}: ${names.join(', ')}`);
//   }
  
//   const mixinIncludes = (added.match(/@include\s+([\w-]+)/g) || []);
//   if (mixinIncludes.length > 0) {
//     changes.push(`Used ${mixinIncludes.length} mixin${mixinIncludes.length > 1 ? 's' : ''}`);
//   }
  
//   // Extend
//   if (/@extend/.test(added)) {
//     const extendCount = (added.match(/@extend/g) || []).length;
//     changes.push(`Used @extend ${extendCount} time${extendCount > 1 ? 's' : ''}`);
//   }
  
//   // Functions
//   const functionDefs = (added.match(/@function\s+([\w-]+)/g) || []);
//   if (functionDefs.length > 0) {
//     changes.push(`Defined ${functionDefs.length} SCSS function${functionDefs.length > 1 ? 's' : ''}`);
//   }
  
//   // Nesting depth
//   const nestingDepth = detectNestingDepth(added);
//   if (nestingDepth > 3) {
//     changes.push(`⚠ Deep nesting detected (${nestingDepth} levels)`);
//   }
  
//   return changes;
// }

// function detectNestingDepth(css) {
//   let maxDepth = 0;
//   let currentDepth = 0;
  
//   for (let i = 0; i < css.length; i++) {
//     if (css[i] === '{') {
//       currentDepth++;
//       maxDepth = Math.max(maxDepth, currentDepth);
//     } else if (css[i] === '}') {
//       currentDepth--;
//     }
//   }
  
//   return maxDepth;
// }

// /**
//  * REGEX FALLBACK PARSER
//  * Used when PostCSS AST parsing fails
//  */
// function parseCSSWithRegex(diff, filepath) {
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
  
//   const addedContent = addedLines.join('\n');
//   const removedContent = removedLines.join('\n');
  
//   // Selector changes (basic regex)
//   const selectorChanges = detectSelectorChangesRegex(addedContent, removedContent);
//   changes.push(...selectorChanges);
  
//   // Property changes
//   const propertyChanges = detectPropertyChangesRegex(addedContent, removedContent);
//   changes.push(...propertyChanges);
  
//   // Media queries
//   const responsiveChanges = detectResponsiveChangesRegex(addedContent, removedContent);
//   changes.push(...responsiveChanges);
  
//   // Animations
//   const animationChanges = detectAnimationChangesRegex(addedContent, removedContent);
//   changes.push(...animationChanges);
  
//   return changes.length > 0 ? changes : ['Style rules updated'];
// }

// function detectSelectorChangesRegex(added, removed) {
//   const changes = [];
//   const addedSelectors = extractSelectorsRegex(added);
//   const removedSelectors = extractSelectorsRegex(removed);
  
//   const newSelectors = addedSelectors.filter(s => !removedSelectors.includes(s));
  
//   if (newSelectors.length > 0) {
//     if (newSelectors.length <= 5) {
//       newSelectors.forEach(sel => changes.push(`Added selector: ${sel}`));
//     } else {
//       changes.push(`Added ${newSelectors.length} selectors`);
//     }
//   }
  
//   return changes;
// }

// function extractSelectorsRegex(css) {
//   const selectors = [];
//   const regex = /([^{}]+)\s*\{/g;
//   let match;
  
//   while ((match = regex.exec(css)) !== null) {
//     const selector = match[1].trim();
//     if (selector && !selector.startsWith('@')) {
//       selectors.push(selector);
//     }
//   }
  
//   return selectors;
// }

// function detectPropertyChangesRegex(added, removed) {
//   const changes = [];
  
//   if (/display:\s*flex/.test(added)) {
//     changes.push('Implemented Flexbox layout');
//   }
  
//   if (/display:\s*grid/.test(added)) {
//     changes.push('Implemented CSS Grid layout');
//   }
  
//   if (/display:\s*none/.test(added)) {
//     changes.push('⚠ Element hidden via display: none');
//   }
  
//   return changes;
// }

// function detectResponsiveChangesRegex(added, removed) {
//   const changes = [];
  
//   const mediaQueries = (added.match(/@media[^{]+/g) || []);
//   if (mediaQueries.length > 0) {
//     changes.push(`Added ${mediaQueries.length} media quer${mediaQueries.length > 1 ? 'ies' : 'y'}`);
//   }
  
//   return changes;
// }

// function detectAnimationChangesRegex(added, removed) {
//   const changes = [];
  
//   const keyframes = (added.match(/@keyframes\s+([\w-]+)/g) || []);
//   if (keyframes.length > 0) {
//     changes.push(`Added ${keyframes.length} animation${keyframes.length > 1 ? 's' : ''}`);
//   }
  
//   return changes;
// }

// module.exports = { parseCSS };

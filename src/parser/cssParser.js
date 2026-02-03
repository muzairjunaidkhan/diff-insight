// src/parser/cssParser.js - Fixed version with correctness improvements

const postcss = require('postcss');
const postcssScss = require('postcss-scss');
const postcssNested = require('postcss-nested');

/**
 * Main CSS parser with full-file AST approach
 * Primary: Parse complete old/new files and compare ASTs
 * Fallback: Diff-aware regex when AST fails
 */
async function parseCSS(diff, filepath, targetBranch = 'main') {
  // OPTIMIZATION 1: Skip unchanged files
  if (!diff || (diff.status && diff.status !== 'modified')) {
    console.log(`[CSS-AST] Skipping unchanged file: ${filepath}`);
    return [];
  }
  
  // Handle diff object vs diff string
  const diffContent = typeof diff === 'string' ? diff : diff.diff;
  
  if (!diffContent) {
    console.log(`[CSS-AST] No diff content for: ${filepath}`);
    return [];
  }
  
  try {
    console.log(`[CSS-AST] Full-file parsing ${filepath}...`);
    
    // Try full-file AST approach first
    const changes = await parseCSSWithFullFileAST(diffContent, filepath, targetBranch, diff);
    
    if (changes.length > 0) {
      console.log(`[CSS-AST] ✓ Success: ${filepath} (${changes.length} changes)`);
      return changes;
    }
    
    throw new Error('No changes detected by full-file AST');
    
  } catch (astError) {
    console.warn(`[CSS-AST] ✗ Failed: ${filepath} - ${astError.message}`);
    console.log(`[CSS-FALLBACK] Using diff-aware fallback for ${filepath}...`);
    
    try {
      const changes = parseCSSWithDiffFallback(diffContent, filepath);
      console.log(`[CSS-FALLBACK] ✓ Success: ${filepath}`);
      return changes;
    } catch (fallbackError) {
      console.warn(`[CSS-FALLBACK] ✗ Failed: ${filepath}`);
      return ['Component visual changes detected'];
    }
  }
}

/**
 * PRIMARY METHOD: Full-file AST parsing
 * Fetches complete old and new file content, parses both, compares ASTs
 */
async function parseCSSWithFullFileAST(diffContent, filepath, targetBranch, diffObj) {
  const changes = [];
  
  // Extract full file contents from the repository
  const { oldContent, newContent } = await extractFullFileContents(filepath, targetBranch, diffContent);
  
  // OPTIMIZATION 3: Explicit SCSS/CSS syntax detection
  const isSCSS = /\.(scss|sass)$/.test(filepath);
  const syntax = isSCSS ? postcssScss : undefined;
  const plugins = isSCSS ? [postcssNested] : [];
  
  // Parse both versions completely
  let oldAST = null;
  let newAST = null;
  const parseWarnings = [];
  
  try {
    if (oldContent && oldContent.trim()) {
      const result = await postcss(plugins).process(oldContent, { 
        syntax,
        from: filepath
      });
      oldAST = result.root;
      
      // FIX #2: Detect malformed CSS in old file
      const malformedNodes = detectMalformedNodes(oldAST);
      if (malformedNodes.length > 0) {
        parseWarnings.push(`⚠ ${malformedNodes.length} malformed CSS block(s) in old version`);
      }
    }
  } catch (e) {
    console.warn(`[CSS-AST] Warning: Could not parse old file - ${e.message}`);
    // Try without nested plugin
    if (oldContent && oldContent.trim() && isSCSS) {
      try {
        const result = await postcss().process(oldContent, { 
          syntax,
          from: filepath 
        });
        oldAST = result.root;
      } catch (e2) {
        console.warn(`[CSS-AST] Warning: Fallback parse also failed`);
      }
    }
  }
  
  try {
    if (newContent && newContent.trim()) {
      const result = await postcss(plugins).process(newContent, { 
        syntax,
        from: filepath
      });
      newAST = result.root;
      
      // FIX #2: Detect malformed CSS in new file
      const malformedNodes = detectMalformedNodes(newAST);
      if (malformedNodes.length > 0) {
        parseWarnings.push(`⚠ ${malformedNodes.length} malformed CSS block(s) in new version`);
      }
    }
  } catch (e) {
    console.warn(`[CSS-AST] Warning: Could not parse new file - ${e.message}`);
    // Try without nested plugin
    if (newContent && newContent.trim() && isSCSS) {
      try {
        const result = await postcss().process(newContent, { 
          syntax,
          from: filepath 
        });
        newAST = result.root;
      } catch (e2) {
        console.warn(`[CSS-AST] Warning: Fallback parse also failed`);
      }
    }
  }
  
  // Add parse warnings to changes
  changes.push(...parseWarnings);
  
  // Compare ASTs
  if (!oldAST && !newAST) {
    throw new Error('Could not parse either version of the file');
  }
  
  // 1. FIX #1: Compare selectors with full paths
  const selectorChanges = compareSelectorsWithContext(oldAST, newAST);
  changes.push(...selectorChanges);
  
  // 2. Compare declarations (properties)
  const declarationChanges = compareDeclarations(oldAST, newAST);
  changes.push(...declarationChanges);
  
  // 3. Compare at-rules (media queries, keyframes, etc.)
  const atRuleChanges = compareAtRules(oldAST, newAST);
  changes.push(...atRuleChanges);
  
  // 4. Compare SCSS/SASS features if applicable
  if (isSCSS) {
    const preprocessorChanges = comparePreprocessorFeatures(oldContent || '', newContent || '');
    changes.push(...preprocessorChanges);
  }
  
  return changes;
}

/**
 * FIX #2: Detect malformed CSS nodes
 * Identifies CSS blocks that were partially parsed or have structural issues
 */
function detectMalformedNodes(ast) {
  const malformed = [];
  
  if (!ast) return malformed;
  
  ast.walk(node => {
    // Check for missing critical raw properties that indicate malformed nodes
    if (node.type === 'rule' && node.raws.between === undefined) {
      malformed.push({
        type: node.type,
        selector: node.selector,
        line: node.source?.start?.line
      });
    }
    
    // Check for declarations without values
    if (node.type === 'decl' && (!node.value || node.value.trim() === '')) {
      malformed.push({
        type: node.type,
        prop: node.prop,
        line: node.source?.start?.line
      });
    }
    
    // Check for rules without selectors
    if (node.type === 'rule' && (!node.selector || node.selector.trim() === '')) {
      malformed.push({
        type: node.type,
        line: node.source?.start?.line
      });
    }
  });
  
  return malformed;
}

/**
 * FIX #1: Compare selectors with full context paths
 * Tracks complete selector ancestry to avoid false positives
 */
function compareSelectorsWithContext(oldAST, newAST) {
  const changes = [];
  
  const oldSelectors = oldAST ? extractSelectorsWithContext(oldAST) : [];
  const newSelectors = newAST ? extractSelectorsWithContext(newAST) : [];
  
  // Build maps for easier lookup
  const oldSelectorMap = new Map();
  const newSelectorMap = new Map();
  
  oldSelectors.forEach(sel => {
    const count = oldSelectorMap.get(sel.fullPath) || 0;
    oldSelectorMap.set(sel.fullPath, count + 1);
  });
  
  newSelectors.forEach(sel => {
    const count = newSelectorMap.get(sel.fullPath) || 0;
    newSelectorMap.set(sel.fullPath, count + 1);
  });
  
  // Find added selectors
  newSelectorMap.forEach((count, fullPath) => {
    if (!oldSelectorMap.has(fullPath)) {
      if (count > 1) {
        changes.push(`Property added: selector ${fullPath} (${count} instances)`);
      } else {
        changes.push(`Property added: selector ${fullPath}`);
      }
    }
  });
  
  // Find removed selectors
  oldSelectorMap.forEach((count, fullPath) => {
    if (!newSelectorMap.has(fullPath)) {
      if (count > 1) {
        changes.push(`Property removed: selector ${fullPath} (${count} instances)`);
      } else {
        changes.push(`Property removed: selector ${fullPath}`);
      }
    }
  });
  
  return changes;
}

/**
 * FIX #1: Extract selectors with full context paths
 * Builds complete selector paths including parent nesting
 */
function extractSelectorsWithContext(ast) {
  const selectors = [];
  
  ast.walkRules(rule => {
    if (rule.selector) {
      const fullPath = buildSelectorPath(rule);
      selectors.push({
        selector: rule.selector.trim(),
        fullPath: fullPath,
        line: rule.source?.start?.line
      });
    }
  });
  
  return selectors;
}

/**
 * FIX #1: Build complete selector path including nesting
 */
function buildSelectorPath(rule) {
  const parts = [];
  let current = rule;
  
  while (current) {
    if (current.type === 'rule' && current.selector) {
      parts.unshift(current.selector.trim());
    } else if (current.type === 'atrule') {
      // Include at-rule context (e.g., @media)
      parts.unshift(`@${current.name} ${current.params}`);
    }
    current = current.parent;
  }
  
  return parts.join(' > ');
}

/**
 * Extract full file contents from git repository
 * This uses git commands to get the complete old and new versions
 */
async function extractFullFileContents(filepath, targetBranch, diffContent) {
  const { execSync } = require('child_process');
  
  let oldContent = '';
  let newContent = '';
  
  try {
    // Get old file content from target branch
    try {
      oldContent = execSync(`git show ${targetBranch}:${filepath}`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
    } catch (e) {
      // File might be new, doesn't exist in old branch
      console.log(`[CSS-AST] File is new or doesn't exist in ${targetBranch}`);
    }
    
    // Get new file content from current working tree
    try {
      const fs = require('fs');
      
      if (fs.existsSync(filepath)) {
        newContent = fs.readFileSync(filepath, 'utf8');
      } else {
        // File might be deleted
        console.log(`[CSS-AST] File deleted from working tree`);
      }
    } catch (e) {
      console.warn(`[CSS-AST] Could not read new file: ${e.message}`);
    }
    
  } catch (e) {
    console.warn(`[CSS-AST] Error extracting file contents: ${e.message}`);
    // OPTIMIZATION 2: Fall back to reconstructing from diff
    return reconstructFromDiff(diffContent);
  }
  
  return { oldContent, newContent };
}

/**
 * OPTIMIZATION 2: Improved diff reconstruction
 * Handles both string diffs and structured diff objects
 */
function reconstructFromDiff(diff) {
  // Handle different diff formats
  let diffText = '';
  
  if (typeof diff === 'string') {
    diffText = diff;
  } else if (diff && diff.diff) {
    diffText = diff.diff;
  } else if (diff && Array.isArray(diff.hunks)) {
    // Handle structured git diff with hunks
    diffText = diff.hunks.map(hunk => hunk.lines.join('\n')).join('\n');
  } else {
    console.warn('[CSS-AST] Unknown diff format, cannot reconstruct');
    return { oldContent: '', newContent: '' };
  }
  
  const lines = diffText.split('\n');
  let oldLines = [];
  let newLines = [];
  
  for (const line of lines) {
    if (line.startsWith('@@')) continue;
    if (line.startsWith('+++')) continue;
    if (line.startsWith('---')) continue;
    
    if (line.startsWith('+')) {
      newLines.push(line.substring(1));
    } else if (line.startsWith('-')) {
      oldLines.push(line.substring(1));
    } else {
      // Context line - appears in both
      const contextLine = line.startsWith(' ') ? line.substring(1) : line;
      oldLines.push(contextLine);
      newLines.push(contextLine);
    }
  }
  
  return {
    oldContent: oldLines.join('\n'),
    newContent: newLines.join('\n')
  };
}

/**
 * Compare declarations (CSS properties) between ASTs
 * FIX #3: Now detects duplicate/overridden properties within same rule
 */
function compareDeclarations(oldAST, newAST) {
  const changes = [];
  
  // FIX #3: Check for duplicate properties in same rule
  if (newAST) {
    const duplicateWarnings = detectDuplicateProperties(newAST);
    changes.push(...duplicateWarnings);
  }
  
  const oldProps = oldAST ? extractDeclarations(oldAST) : {};
  const newProps = newAST ? extractDeclarations(newAST) : {};
  
  const allProps = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
  
  allProps.forEach(prop => {
    // FIX: Animation Double Reporting - Skip animation props, handled in analyzeAnimations
    if (prop.startsWith('animation') || prop === 'transition' || prop === 'transform') {
      return;
    }
    
    const oldVals = (oldProps[prop] || []).map(v => normalizeValue(v, prop));
    const newVals = (newProps[prop] || []).map(v => normalizeValue(v, prop));
    
    const oldUnique = Array.from(new Set(oldVals));
    const newUnique = Array.from(new Set(newVals));
    
    // Count occurrences
    const oldCounts = {};
    const newCounts = {};
    oldVals.forEach(v => oldCounts[v] = (oldCounts[v] || 0) + 1);
    newVals.forEach(v => newCounts[v] = (newCounts[v] || 0) + 1);
    
    // Special handling for high-impact properties
    if (prop === 'display') {
      handleDisplayChanges(newUnique, oldUnique, newCounts, newAST, changes);
      return;
    }
    
    if (['position', 'visibility', 'opacity', 'z-index'].includes(prop)) {
      handleSpecialProperty(prop, newUnique, oldUnique, newCounts, oldCounts, changes);
      return;
    }
    
    // OPTIMIZATION 6: Improved declaration comparison logic
    const addedValues = newUnique.filter(v => !oldUnique.includes(v));
    const removedValues = oldUnique.filter(v => !newUnique.includes(v));
    
    // Case 1: Simple 1-to-1 value change (old has 1 unique, new has 1 unique, they differ)
    if (oldUnique.length === 1 && newUnique.length === 1 && oldUnique[0] !== newUnique[0]) {
      const totalCount = Math.max(oldVals.length, newVals.length);
      if (totalCount > 1) {
        changes.push(`Property changed: ${prop} from ${oldUnique[0]} → ${newUnique[0]} (${totalCount} elements)`);
      } else {
        changes.push(`Property changed: ${prop} from ${oldUnique[0]} → ${newUnique[0]}`);
      }
      return; // Don't report added/removed for simple changes
    }
    
    // Case 2: Property added to new elements (no old values)
    if (oldUnique.length === 0 && newUnique.length > 0) {
      newUnique.forEach(value => {
        const count = newCounts[value];
        if (count > 1) {
          changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
        } else {
          changes.push(`Property added: ${prop}: ${value}`);
        }
      });
      return;
    }
    
    // Case 3: Property removed from old elements (no new values)
    if (newUnique.length === 0 && oldUnique.length > 0) {
      oldUnique.forEach(value => {
        const count = oldCounts[value];
        if (count > 1) {
          changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
        } else {
          changes.push(`Property removed: ${prop}: ${value}`);
        }
      });
      return;
    }
    
    // Case 4: Complex changes (multiple values added/removed/changed)
    // Only report actual additions and removals, not changes
    addedValues.forEach(value => {
      const count = newCounts[value];
      if (count > 1) {
        changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property added: ${prop}: ${value}`);
      }
    });
    
    removedValues.forEach(value => {
      const count = oldCounts[value];
      if (count > 1) {
        changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: ${prop}: ${value}`);
      }
    });
  });
  
  // Analyze layout systems, animations, typography
  if (newAST) {
    analyzeLayoutSystems(newAST, oldAST, changes);
    analyzeAnimations(newAST, oldAST, changes);
    analyzeTypography(newAST, oldAST, changes);
  }
  
  return changes;
}

/**
 * FIX #3: Detect duplicate/overridden properties within same rule
 */
function detectDuplicateProperties(ast) {
  const warnings = [];
  
  ast.walkRules(rule => {
    const propMap = new Map();
    const duplicates = new Map();
    
    rule.walkDecls(decl => {
      const prop = decl.prop;
      
      if (propMap.has(prop)) {
        // Duplicate found
        if (!duplicates.has(prop)) {
          duplicates.set(prop, [propMap.get(prop)]);
        }
        duplicates.get(prop).push(decl.value);
      } else {
        propMap.set(prop, decl.value);
      }
    });
    
    // Report duplicates
    duplicates.forEach((values, prop) => {
      const selector = buildSelectorPath(rule);
      const uniqueValues = Array.from(new Set(values.map(v => normalizeValue(v, prop))));
      
      if (uniqueValues.length > 1) {
        // Conflicting values
        warnings.push(
          `⚠ Property override detected: ${prop} in ${selector} ` +
          `(${uniqueValues.length} different values, last wins)`
        );
      }
    });
  });
  
  return warnings;
}

/**
 * Extract all declarations from AST
 */
function extractDeclarations(ast) {
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
 * Normalize CSS values for accurate comparison
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
  
  // Normalize decimals
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
 * Handle display property changes with special formatting
 */
function handleDisplayChanges(newVals, oldVals, counts, ast, changes) {
  // Simple 1-to-1 change
  if (oldVals.length === 1 && newVals.length === 1 && oldVals[0] !== newVals[0]) {
    if (newVals[0] === 'flex') {
      changes.push(`Changed to Flexbox layout (was: ${oldVals[0]})`);
      analyzeFlexboxProperties(ast, changes);
    } else if (newVals[0] === 'grid') {
      changes.push(`Changed to CSS Grid layout (was: ${oldVals[0]})`);
      analyzeGridProperties(ast, changes);
    } else {
      changes.push(`Property changed: display from ${oldVals[0]} → ${newVals[0]}`);
    }
    return;
  }
  
  // Additions
  newVals.forEach(value => {
    if (!oldVals.includes(value)) {
      const count = counts[value];
      
      if (value === 'flex') {
        changes.push('Implemented Flexbox layout');
        analyzeFlexboxProperties(ast, changes);
      } else if (value === 'grid') {
        changes.push('Implemented CSS Grid layout');
        analyzeGridProperties(ast, changes);
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
  
  // Removals
  oldVals.forEach(value => {
    if (!newVals.includes(value)) {
      const count = counts[value];
      if (count > 1) {
        changes.push(`Property removed: display: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: display: ${value}`);
      }
    }
  });
}

/**
 * Handle special properties (position, visibility, opacity, z-index)
 */
function handleSpecialProperty(prop, newVals, oldVals, newCounts, oldCounts, changes) {
  // Simple 1-to-1 change
  if (oldVals.length === 1 && newVals.length === 1 && oldVals[0] !== newVals[0]) {
    changes.push(`Property changed: ${prop} from ${oldVals[0]} → ${newVals[0]}`);
    return;
  }
  
  // Additions
  newVals.forEach(value => {
    if (!oldVals.includes(value)) {
      const count = newCounts[value];
      
      // Special messages for certain values
      if (prop === 'visibility' && value === 'hidden') {
        if (count > 1) {
          changes.push(`⚠ Element hidden via visibility: hidden (${count} elements)`);
        } else {
          changes.push('⚠ Element hidden via visibility: hidden');
        }
      } else {
        if (count > 1) {
          changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
        } else {
          changes.push(`Property added: ${prop}: ${value}`);
        }
      }
    }
  });
  
  // Removals
  oldVals.forEach(value => {
    if (!newVals.includes(value)) {
      const count = oldCounts[value];
      if (count > 1) {
        changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: ${prop}: ${value}`);
      }
    }
  });
}

/**
 * Analyze Flexbox properties
 */
function analyzeFlexboxProperties(ast, changes) {
  const flexProps = {};
  
  ast.walkDecls(decl => {
    if (decl.prop.startsWith('flex-') || 
        ['justify-content', 'align-items', 'align-content', 'gap'].includes(decl.prop)) {
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
 * FIX: Accurate column counting with repeat() and minmax() support
 */
function analyzeGridProperties(ast, changes) {
  ast.walkDecls(decl => {
    if (decl.prop === 'grid-template-columns') {
      const columns = countGridColumns(decl.value);
      if (columns > 0) {
        changes.push(`  └─ ${columns} column grid`);
      } else {
        changes.push(`  └─ Grid columns: ${decl.value}`);
      }
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
 * FIX: Accurate grid column counting with repeat() and minmax() support
 */
function countGridColumns(value) {
  if (!value) return 0;
  
  let columnCount = 0;
  const val = value.trim();
  
  // Handle repeat() function
  const repeatMatch = val.match(/repeat\((\d+|auto-fill|auto-fit),\s*(.+?)\)/);
  if (repeatMatch) {
    const [, count, template] = repeatMatch;
    
    if (count === 'auto-fill' || count === 'auto-fit') {
      // Can't determine exact count for auto-fill/auto-fit
      return -1;
    }
    
    const repeatCount = parseInt(count, 10);
    
    // Count columns in the template (handle nested minmax, etc.)
    const templateColumns = countColumnsInTemplate(template);
    columnCount += repeatCount * templateColumns;
    
    // Remove the repeat() part and count remaining columns
    const remaining = val.replace(/repeat\([^)]+\)/, '').trim();
    if (remaining) {
      columnCount += countColumnsInTemplate(remaining);
    }
  } else {
    // Simple case: no repeat()
    columnCount = countColumnsInTemplate(val);
  }
  
  return columnCount;
}

/**
 * Count columns in a template string (handles minmax, fit-content, etc.)
 */
function countColumnsInTemplate(template) {
  if (!template || !template.trim()) return 0;
  
  // Remove nested functions to avoid double-counting
  let cleaned = template;
  
  // Replace minmax(), fit-content(), etc. with placeholders
  cleaned = cleaned.replace(/minmax\([^)]+\)/g, 'COL');
  cleaned = cleaned.replace(/fit-content\([^)]+\)/g, 'COL');
  cleaned = cleaned.replace(/clamp\([^)]+\)/g, 'COL');
  
  // Split by whitespace and filter out empty strings
  const parts = cleaned.split(/\s+/).filter(p => p && p !== '|');
  
  return parts.length;
}

/**
 * Analyze layout systems
 */
function analyzeLayoutSystems(newAST, oldAST, changes) {
  // Already handled in display changes
}

/**
 * Analyze animations
 */
function analyzeAnimations(newAST, oldAST, changes) {
  const newAnimProps = extractAnimationProps(newAST);
  const oldAnimProps = oldAST ? extractAnimationProps(oldAST) : {};
  
  const allProps = new Set([...Object.keys(newAnimProps), ...Object.keys(oldAnimProps)]);
  
  allProps.forEach(prop => {
    const newVals = newAnimProps[prop] || [];
    const oldVals = oldAnimProps[prop] || [];
    
    const newUnique = Array.from(new Set(newVals));
    const oldUnique = Array.from(new Set(oldVals));
    
    // Simple 1-to-1 change
    if (oldUnique.length === 1 && newUnique.length === 1 && oldUnique[0] !== newUnique[0]) {
      changes.push(`Property changed: ${prop} from ${oldUnique[0]} → ${newUnique[0]}`);
      return;
    }
    
    const addedVals = newUnique.filter(v => !oldUnique.includes(v));
    const removedVals = oldUnique.filter(v => !newUnique.includes(v));
    
    addedVals.forEach(value => {
      const count = newVals.filter(v => v === value).length;
      if (count > 1) {
        changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property added: ${prop}: ${value}`);
      }
    });
    
    removedVals.forEach(value => {
      const count = oldVals.filter(v => v === value).length;
      if (count > 1) {
        changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: ${prop}: ${value}`);
      }
    });
  });
}

function extractAnimationProps(ast) {
  const props = {};
  
  ast.walkDecls(decl => {
    if (decl.prop.startsWith('animation') || decl.prop === 'transition' || decl.prop === 'transform') {
      if (!props[decl.prop]) {
        props[decl.prop] = [];
      }
      props[decl.prop].push(decl.value);
    }
  });
  
  return props;
}

/**
 * Analyze typography
 */
function analyzeTypography(newAST, oldAST, changes) {
  const typographyProps = [
    'font-family', 'font-size', 'font-weight', 'line-height',
    'letter-spacing', 'text-align', 'text-transform', 'text-decoration'
  ];
  
  const newTypo = extractTypographyProps(newAST, typographyProps);
  const oldTypo = oldAST ? extractTypographyProps(oldAST, typographyProps) : {};
  
  Object.keys(newTypo).forEach(prop => {
    const newVals = newTypo[prop] || [];
    const oldVals = oldTypo[prop] || [];
    
    const newUnique = Array.from(new Set(newVals));
    const oldUnique = Array.from(new Set(oldVals));
    
    // Simple 1-to-1 change
    if (oldUnique.length === 1 && newUnique.length === 1 && oldUnique[0] !== newUnique[0]) {
      changes.push(`Property changed: ${prop} from ${oldUnique[0]} → ${newUnique[0]}`);
      return;
    }
    
    const addedVals = newUnique.filter(v => !oldUnique.includes(v));
    const removedVals = oldUnique.filter(v => !newUnique.includes(v));
    
    addedVals.forEach(value => {
      const count = newVals.filter(v => v === value).length;
      if (count > 1) {
        changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property added: ${prop}: ${value}`);
      }
    });
    
    removedVals.forEach(value => {
      const count = oldVals.filter(v => v === value).length;
      if (count > 1) {
        changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
      } else {
        changes.push(`Property removed: ${prop}: ${value}`);
      }
    });
  });
}

function extractTypographyProps(ast, props) {
  const result = {};
  
  ast.walkDecls(decl => {
    if (props.includes(decl.prop)) {
      if (!result[decl.prop]) {
        result[decl.prop] = [];
      }
      result[decl.prop].push(decl.value);
    }
  });
  
  return result;
}

/**
 * Compare at-rules (media queries, keyframes, etc.)
 */
function compareAtRules(oldAST, newAST) {
  const changes = [];
  
  const oldAtRules = oldAST ? extractAtRules(oldAST) : { 
    media: [], keyframes: [], import: [], fontFace: [], supports: [], container: [] 
  };
  const newAtRules = newAST ? extractAtRules(newAST) : { 
    media: [], keyframes: [], import: [], fontFace: [], supports: [], container: [] 
  };
  
  // Media queries
  const addedMedia = newAtRules.media.filter(m => !oldAtRules.media.includes(m));
  const removedMedia = oldAtRules.media.filter(m => !newAtRules.media.includes(m));
  
  addedMedia.forEach(params => {
    changes.push(`Property added: @media ${params}`);
    if (/prefers-color-scheme:\s*dark/.test(params)) {
      changes.push('✓ Added dark mode support');
    }
  });
  
  removedMedia.forEach(params => {
    changes.push(`Property removed: @media ${params}`);
  });
  
  // Keyframes
  const addedKeyframes = newAtRules.keyframes.filter(k => !oldAtRules.keyframes.includes(k));
  const removedKeyframes = oldAtRules.keyframes.filter(k => !newAtRules.keyframes.includes(k));
  
  addedKeyframes.forEach(name => {
    changes.push(`Property added: @keyframes ${name}`);
  });
  
  removedKeyframes.forEach(name => {
    changes.push(`Property removed: @keyframes ${name}`);
  });
  
  // Font-face
  if (newAtRules.fontFace.length > oldAtRules.fontFace.length) {
    const diff = newAtRules.fontFace.length - oldAtRules.fontFace.length;
    changes.push(`Property added: @font-face (${diff} custom font${diff > 1 ? 's' : ''})`);
  }
  
  // Imports
  const addedImports = newAtRules.import.filter(i => !oldAtRules.import.includes(i));
  const removedImports = oldAtRules.import.filter(i => !newAtRules.import.includes(i));
  
  addedImports.forEach(url => {
    changes.push(`Property added: @import ${url}`);
  });
  
  removedImports.forEach(url => {
    changes.push(`Property removed: @import ${url}`);
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
 * OPTIMIZATION 7: Fixed SCSS variable comparison to avoid double reporting
 * Compare SCSS/SASS preprocessor features
 * FIX: Track all variable values and warn about duplicates
 */
function comparePreprocessorFeatures(oldContent, newContent) {
  const changes = [];
  
  // SCSS variables - Extract with ALL values (track duplicates)
  const oldVars = extractSCSSVariablesWithDuplicates(oldContent);
  const newVars = extractSCSSVariablesWithDuplicates(newContent);
  
  const allVarNames = new Set([...Object.keys(oldVars), ...Object.keys(newVars)]);
  
  allVarNames.forEach(varName => {
    const oldValues = oldVars[varName] || [];
    const newValues = newVars[varName] || [];
    
    // Check for duplicate definitions
    if (newValues.length > 1) {
      const uniqueValues = Array.from(new Set(newValues));
      if (uniqueValues.length > 1) {
        changes.push(
          `⚠ SCSS variable ${varName} defined ${newValues.length} times with different values (last wins)`
        );
      }
    }
    
    // Compare effective values (last one wins)
    const oldValue = oldValues.length > 0 ? oldValues[oldValues.length - 1] : null;
    const newValue = newValues.length > 0 ? newValues[newValues.length - 1] : null;
    
    if (!oldValue && newValue) {
      // Variable added
      changes.push(`Property added: SCSS variable ${varName}: ${newValue}`);
    } else if (oldValue && !newValue) {
      // Variable removed
      changes.push(`Property removed: SCSS variable ${varName}`);
    } else if (oldValue && newValue && oldValue !== newValue) {
      // Variable value changed
      changes.push(`Property changed: SCSS variable ${varName} from ${oldValue} → ${newValue}`);
    }
    // If oldValue === newValue, no change - don't report anything
  });
  
  // Mixins
  const oldMixins = extractMixins(oldContent);
  const newMixins = extractMixins(newContent);
  
  const addedMixins = newMixins.filter(m => !oldMixins.includes(m));
  addedMixins.forEach(mixin => {
    changes.push(`Defined mixin: ${mixin}`);
  });
  
  // Mixin includes
  const oldIncludes = extractMixinIncludes(oldContent);
  const newIncludes = extractMixinIncludes(newContent);
  
  const addedIncludes = newIncludes.filter(m => !oldIncludes.includes(m));
  addedIncludes.forEach(include => {
    changes.push(`Used mixin: ${include}`);
  });
  
  // OPTIMIZATION 4: Improved nesting depth warning
  // FIX: Mark as approximate due to lexical counting limitations
  const newDepth = detectNestingDepth(newContent);
  const oldDepth = detectNestingDepth(oldContent);
  
  // Warn if new depth is excessive (>4), even if old depth was also high
  if (newDepth > 4) {
    if (newDepth > oldDepth) {
      changes.push(`⚠ Deep nesting detected (~${newDepth} levels, increased from ~${oldDepth}) - approximate count`);
    } else if (oldDepth <= 4) {
      // New deep nesting introduced
      changes.push(`⚠ Deep nesting detected (~${newDepth} levels) - approximate count`);
    }
    // If both old and new are >4 and new <= old, don't warn (already had deep nesting)
  }
  
  return changes;
}

/**
 * FIX: Extract SCSS variables with all values (track duplicates)
 */
function extractSCSSVariablesWithDuplicates(content) {
  const vars = {};
  const regex = /\$([\w-]+):\s*([^;]+);/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const varName = match[1];
    const value = match[2].trim();
    
    if (!vars[varName]) {
      vars[varName] = [];
    }
    vars[varName].push(value);
  }
  
  return vars;
}

function extractSCSSVariables(content) {
  const vars = {};
  const regex = /\$([\w-]+):\s*([^;]+);/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    vars[`${match[1]}`] = match[2].trim();
  }
  
  return vars;
}

function extractMixins(content) {
  const mixins = [];
  const regex = /@mixin\s+([\w-]+)/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    mixins.push(match[1]);
  }
  
  return mixins;
}

function extractMixinIncludes(content) {
  const includes = [];
  const regex = /@include\s+([\w-]+)/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    includes.push(match[1]);
  }
  
  return includes;
}

/**
 * FIX: Nesting depth detection - approximate due to lexical counting
 * Note: This counts braces lexically and may be inaccurate with comments/strings
 */
function detectNestingDepth(css) {
  let maxDepth = 0;
  let currentDepth = 0;
  let inString = false;
  let inComment = false;
  let stringChar = null;
  
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    const nextChar = css[i + 1];
    
    // Handle string literals (skip braces inside strings)
    if ((char === '"' || char === "'") && !inComment) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar && css[i - 1] !== '\\') {
        inString = false;
        stringChar = null;
      }
      continue;
    }
    
    // Handle comments (skip braces inside comments)
    if (!inString) {
      if (char === '/' && nextChar === '*') {
        inComment = true;
        i++; // Skip next char
        continue;
      }
      if (inComment && char === '*' && nextChar === '/') {
        inComment = false;
        i++; // Skip next char
        continue;
      }
    }
    
    // Count braces only outside strings and comments
    if (!inString && !inComment) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth--;
      }
    }
  }
  
  return maxDepth;
}

/**
 * OPTIMIZATION 5: Enhanced fallback with property extraction
 * FALLBACK METHOD: Diff-aware lightweight parsing
 * Used only when full-file AST parsing fails (rare)
 */
function parseCSSWithDiffFallback(diffContent, filepath) {
  const changes = [];
  
  // Extract added lines from diff
  const lines = diffContent.split('\n');
  const addedLines = [];
  
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push(line.substring(1).trim());
    }
  }
  
  const addedContent = addedLines.join('\n');
  
  // Try to extract some basic property information
  const propertyMatches = addedContent.match(/([\w-]+)\s*:\s*([^;{]+)/g);
  
  if (propertyMatches && propertyMatches.length > 0) {
    // Extract unique properties
    const properties = new Set();
    
    propertyMatches.forEach(match => {
      const propMatch = match.match(/([\w-]+)\s*:/);
      if (propMatch) {
        const prop = propMatch[1].trim();
        
        // Skip common non-CSS properties
        if (!prop.startsWith('@') && prop.length > 0) {
          properties.add(prop);
        }
      }
    });
    
    if (properties.size > 0) {
      // Report properties found
      if (properties.size <= 5) {
        // If few properties, list them
        Array.from(properties).forEach(prop => {
          changes.push(`Property modified: ${prop}`);
        });
      } else {
        // If many properties, give summary
        changes.push(`Component visual changes detected (${properties.size} properties modified)`);
      }
    } else {
      changes.push('Component visual changes detected');
    }
  } else {
    // No properties found, generic message
    changes.push('Component visual changes detected');
  }
  
  // Check for special cases
  if (addedContent.includes('@media')) {
    changes.push('Responsive design changes detected');
  }
  
  if (addedContent.includes('@keyframes')) {
    changes.push('Animation changes detected');
  }
  
  if (addedContent.includes('display:') || addedContent.includes('display :')) {
    if (addedContent.includes('flex')) {
      changes.push('Possible Flexbox layout changes');
    }
    if (addedContent.includes('grid')) {
      changes.push('Possible Grid layout changes');
    }
  }
  
  return changes.length > 0 ? changes : ['Component visual changes detected'];
}

module.exports = { parseCSS };

// // src/parser/cssParser.js - Full-file AST with improvements

// const postcss = require('postcss');
// const postcssScss = require('postcss-scss');
// const postcssNested = require('postcss-nested');

// /**
//  * Main CSS parser with full-file AST approach
//  * Primary: Parse complete old/new files and compare ASTs
//  * Fallback: Diff-aware regex when AST fails
//  */
// async function parseCSS(diff, filepath, targetBranch = 'main') {
//   // OPTIMIZATION 1: Skip unchanged files
//   if (!diff || (diff.status && diff.status !== 'modified')) {
//     console.log(`[CSS-AST] Skipping unchanged file: ${filepath}`);
//     return [];
//   }
  
//   // Handle diff object vs diff string
//   const diffContent = typeof diff === 'string' ? diff : diff.diff;
  
//   if (!diffContent) {
//     console.log(`[CSS-AST] No diff content for: ${filepath}`);
//     return [];
//   }
  
//   try {
//     console.log(`[CSS-AST] Full-file parsing ${filepath}...`);
    
//     // Try full-file AST approach first
//     const changes = await parseCSSWithFullFileAST(diffContent, filepath, targetBranch, diff);
    
//     if (changes.length > 0) {
//       console.log(`[CSS-AST] ✓ Success: ${filepath} (${changes.length} changes)`);
//       return changes;
//     }
    
//     throw new Error('No changes detected by full-file AST');
    
//   } catch (astError) {
//     console.warn(`[CSS-AST] ✗ Failed: ${filepath} - ${astError.message}`);
//     console.log(`[CSS-FALLBACK] Using diff-aware fallback for ${filepath}...`);
    
//     try {
//       const changes = parseCSSWithDiffFallback(diffContent, filepath);
//       console.log(`[CSS-FALLBACK] ✓ Success: ${filepath}`);
//       return changes;
//     } catch (fallbackError) {
//       console.warn(`[CSS-FALLBACK] ✗ Failed: ${filepath}`);
//       return ['Component visual changes detected'];
//     }
//   }
// }

// /**
//  * PRIMARY METHOD: Full-file AST parsing
//  * Fetches complete old and new file content, parses both, compares ASTs
//  */
// async function parseCSSWithFullFileAST(diffContent, filepath, targetBranch, diffObj) {
//   const changes = [];
  
//   // Extract full file contents from the repository
//   const { oldContent, newContent } = await extractFullFileContents(filepath, targetBranch, diffContent);
  
//   // OPTIMIZATION 3: Explicit SCSS/CSS syntax detection
//   const isSCSS = /\.(scss|sass)$/.test(filepath);
//   const syntax = isSCSS ? postcssScss : undefined;
//   const plugins = isSCSS ? [postcssNested] : [];
  
//   // Parse both versions completely
//   let oldAST = null;
//   let newAST = null;
  
//   try {
//     if (oldContent && oldContent.trim()) {
//       const result = await postcss(plugins).process(oldContent, { 
//         syntax,
//         from: filepath,
//         parser: syntax
//       });
//       oldAST = result.root;
//     }
//   } catch (e) {
//     console.warn(`[CSS-AST] Warning: Could not parse old file - ${e.message}`);
//     // Try without nested plugin
//     if (oldContent && oldContent.trim() && isSCSS) {
//       try {
//         const result = await postcss().process(oldContent, { 
//           syntax,
//           from: filepath 
//         });
//         oldAST = result.root;
//       } catch (e2) {
//         console.warn(`[CSS-AST] Warning: Fallback parse also failed`);
//       }
//     }
//   }
  
//   try {
//     if (newContent && newContent.trim()) {
//       const result = await postcss(plugins).process(newContent, { 
//         syntax,
//         from: filepath,
//         parser: syntax
//       });
//       newAST = result.root;
//     }
//   } catch (e) {
//     console.warn(`[CSS-AST] Warning: Could not parse new file - ${e.message}`);
//     // Try without nested plugin
//     if (newContent && newContent.trim() && isSCSS) {
//       try {
//         const result = await postcss().process(newContent, { 
//           syntax,
//           from: filepath 
//         });
//         newAST = result.root;
//       } catch (e2) {
//         console.warn(`[CSS-AST] Warning: Fallback parse also failed`);
//       }
//     }
//   }
  
//   // Compare ASTs
//   if (!oldAST && !newAST) {
//     throw new Error('Could not parse either version of the file');
//   }
  
//   // 1. Compare selectors
//   const selectorChanges = compareSelectors(oldAST, newAST);
//   changes.push(...selectorChanges);
  
//   // 2. Compare declarations (properties)
//   const declarationChanges = compareDeclarations(oldAST, newAST);
//   changes.push(...declarationChanges);
  
//   // 3. Compare at-rules (media queries, keyframes, etc.)
//   const atRuleChanges = compareAtRules(oldAST, newAST);
//   changes.push(...atRuleChanges);
  
//   // 4. Compare SCSS/SASS features if applicable
//   if (isSCSS) {
//     const preprocessorChanges = comparePreprocessorFeatures(oldContent || '', newContent || '');
//     changes.push(...preprocessorChanges);
//   }
  
//   return changes;
// }

// /**
//  * Extract full file contents from git repository
//  * This uses git commands to get the complete old and new versions
//  */
// async function extractFullFileContents(filepath, targetBranch, diffContent) {
//   const { execSync } = require('child_process');
  
//   let oldContent = '';
//   let newContent = '';
  
//   try {
//     // Get old file content from target branch
//     try {
//       oldContent = execSync(`git show ${targetBranch}:${filepath}`, { 
//         encoding: 'utf8',
//         stdio: ['pipe', 'pipe', 'ignore']
//       });
//     } catch (e) {
//       // File might be new, doesn't exist in old branch
//       console.log(`[CSS-AST] File is new or doesn't exist in ${targetBranch}`);
//     }
    
//     // Get new file content from current working tree
//     try {
//       const fs = require('fs');
      
//       if (fs.existsSync(filepath)) {
//         newContent = fs.readFileSync(filepath, 'utf8');
//       } else {
//         // File might be deleted
//         console.log(`[CSS-AST] File deleted from working tree`);
//       }
//     } catch (e) {
//       console.warn(`[CSS-AST] Could not read new file: ${e.message}`);
//     }
    
//   } catch (e) {
//     console.warn(`[CSS-AST] Error extracting file contents: ${e.message}`);
//     // OPTIMIZATION 2: Fall back to reconstructing from diff
//     return reconstructFromDiff(diffContent);
//   }
  
//   return { oldContent, newContent };
// }

// /**
//  * OPTIMIZATION 2: Improved diff reconstruction
//  * Handles both string diffs and structured diff objects
//  */
// function reconstructFromDiff(diff) {
//   // Handle different diff formats
//   let diffText = '';
  
//   if (typeof diff === 'string') {
//     diffText = diff;
//   } else if (diff && diff.diff) {
//     diffText = diff.diff;
//   } else if (diff && Array.isArray(diff.hunks)) {
//     // Handle structured git diff with hunks
//     diffText = diff.hunks.map(hunk => hunk.lines.join('\n')).join('\n');
//   } else {
//     console.warn('[CSS-AST] Unknown diff format, cannot reconstruct');
//     return { oldContent: '', newContent: '' };
//   }
  
//   const lines = diffText.split('\n');
//   let oldLines = [];
//   let newLines = [];
  
//   for (const line of lines) {
//     if (line.startsWith('@@')) continue;
//     if (line.startsWith('+++')) continue;
//     if (line.startsWith('---')) continue;
    
//     if (line.startsWith('+')) {
//       newLines.push(line.substring(1));
//     } else if (line.startsWith('-')) {
//       oldLines.push(line.substring(1));
//     } else {
//       // Context line - appears in both
//       const contextLine = line.startsWith(' ') ? line.substring(1) : line;
//       oldLines.push(contextLine);
//       newLines.push(contextLine);
//     }
//   }
  
//   return {
//     oldContent: oldLines.join('\n'),
//     newContent: newLines.join('\n')
//   };
// }

// /**
//  * Compare selectors between old and new ASTs
//  */
// function compareSelectors(oldAST, newAST) {
//   const changes = [];
  
//   const oldSelectors = oldAST ? extractSelectors(oldAST) : [];
//   const newSelectors = newAST ? extractSelectors(newAST) : [];
  
//   // Find added and removed selectors
//   const addedSelectors = newSelectors.filter(s => !oldSelectors.includes(s));
//   const removedSelectors = oldSelectors.filter(s => !newSelectors.includes(s));
  
//   addedSelectors.forEach(selector => {
//     const count = newSelectors.filter(s => s === selector).length;
//     if (count > 1) {
//       changes.push(`Property added: selector ${selector} (${count} instances)`);
//     } else {
//       changes.push(`Property added: selector ${selector}`);
//     }
//   });
  
//   removedSelectors.forEach(selector => {
//     const count = oldSelectors.filter(s => s === selector).length;
//     if (count > 1) {
//       changes.push(`Property removed: selector ${selector} (${count} instances)`);
//     } else {
//       changes.push(`Property removed: selector ${selector}`);
//     }
//   });
  
//   return changes;
// }

// /**
//  * Extract all selectors from AST
//  */
// function extractSelectors(ast) {
//   const selectors = [];
  
//   ast.walkRules(rule => {
//     if (rule.selector) {
//       selectors.push(rule.selector.trim());
//     }
//   });
  
//   return selectors;
// }

// /**
//  * Compare declarations (CSS properties) between ASTs
//  */
// function compareDeclarations(oldAST, newAST) {
//   const changes = [];
  
//   const oldProps = oldAST ? extractDeclarations(oldAST) : {};
//   const newProps = newAST ? extractDeclarations(newAST) : {};
  
//   const allProps = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
  
//   allProps.forEach(prop => {
//     const oldVals = (oldProps[prop] || []).map(v => normalizeValue(v, prop));
//     const newVals = (newProps[prop] || []).map(v => normalizeValue(v, prop));
    
//     const oldUnique = Array.from(new Set(oldVals));
//     const newUnique = Array.from(new Set(newVals));
    
//     // Count occurrences
//     const oldCounts = {};
//     const newCounts = {};
//     oldVals.forEach(v => oldCounts[v] = (oldCounts[v] || 0) + 1);
//     newVals.forEach(v => newCounts[v] = (newCounts[v] || 0) + 1);
    
//     // Special handling for high-impact properties
//     if (prop === 'display') {
//       handleDisplayChanges(newUnique, oldUnique, newCounts, newAST, changes);
//       return;
//     }
    
//     if (['position', 'visibility', 'opacity', 'z-index'].includes(prop)) {
//       handleSpecialProperty(prop, newUnique, oldUnique, newCounts, oldCounts, changes);
//       return;
//     }
    
//     // OPTIMIZATION 6: Improved declaration comparison logic
//     const addedValues = newUnique.filter(v => !oldUnique.includes(v));
//     const removedValues = oldUnique.filter(v => !newUnique.includes(v));
    
//     // Case 1: Simple 1-to-1 value change (old has 1 unique, new has 1 unique, they differ)
//     if (oldUnique.length === 1 && newUnique.length === 1 && oldUnique[0] !== newUnique[0]) {
//       const totalCount = Math.max(oldVals.length, newVals.length);
//       if (totalCount > 1) {
//         changes.push(`Property changed: ${prop} from ${oldUnique[0]} → ${newUnique[0]} (${totalCount} elements)`);
//       } else {
//         changes.push(`Property changed: ${prop} from ${oldUnique[0]} → ${newUnique[0]}`);
//       }
//       return; // Don't report added/removed for simple changes
//     }
    
//     // Case 2: Property added to new elements (no old values)
//     if (oldUnique.length === 0 && newUnique.length > 0) {
//       newUnique.forEach(value => {
//         const count = newCounts[value];
//         if (count > 1) {
//           changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
//         } else {
//           changes.push(`Property added: ${prop}: ${value}`);
//         }
//       });
//       return;
//     }
    
//     // Case 3: Property removed from old elements (no new values)
//     if (newUnique.length === 0 && oldUnique.length > 0) {
//       oldUnique.forEach(value => {
//         const count = oldCounts[value];
//         if (count > 1) {
//           changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
//         } else {
//           changes.push(`Property removed: ${prop}: ${value}`);
//         }
//       });
//       return;
//     }
    
//     // Case 4: Complex changes (multiple values added/removed/changed)
//     // Only report actual additions and removals, not changes
//     addedValues.forEach(value => {
//       const count = newCounts[value];
//       if (count > 1) {
//         changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
//       } else {
//         changes.push(`Property added: ${prop}: ${value}`);
//       }
//     });
    
//     removedValues.forEach(value => {
//       const count = oldCounts[value];
//       if (count > 1) {
//         changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
//       } else {
//         changes.push(`Property removed: ${prop}: ${value}`);
//       }
//     });
//   });
  
//   // Analyze layout systems, animations, typography
//   if (newAST) {
//     analyzeLayoutSystems(newAST, oldAST, changes);
//     analyzeAnimations(newAST, oldAST, changes);
//     analyzeTypography(newAST, oldAST, changes);
//   }
  
//   return changes;
// }

// /**
//  * Extract all declarations from AST
//  */
// function extractDeclarations(ast) {
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
//  * Normalize CSS values for accurate comparison
//  */
// function normalizeValue(value, prop) {
//   if (!value) return value;
  
//   const val = value.toString().trim().toLowerCase();
  
//   // Normalize hex colors: #fff → #ffffff
//   if (/^#([0-9a-f]{3})$/i.test(val)) {
//     const [, rgb] = val.match(/^#([0-9a-f]{3})$/i);
//     return `#${rgb[0]}${rgb[0]}${rgb[1]}${rgb[1]}${rgb[2]}${rgb[2]}`;
//   }
  
//   // Normalize hex colors to lowercase
//   if (/^#[0-9a-f]{6}$/i.test(val)) {
//     return val.toLowerCase();
//   }
  
//   // Normalize decimals
//   if (/^\d*\.\d+$/.test(val)) {
//     return parseFloat(val).toFixed(2);
//   }
  
//   // Normalize zero values: 0px, 0em, 0% → 0
//   if (/^0(px|em|rem|%|vh|vw)?$/.test(val)) {
//     return '0';
//   }
  
//   // Normalize RGB/RGBA spaces
//   if (val.startsWith('rgb')) {
//     return val.replace(/\s+/g, '');
//   }
  
//   return val;
// }

// /**
//  * Handle display property changes with special formatting
//  */
// function handleDisplayChanges(newVals, oldVals, counts, ast, changes) {
//   // Simple 1-to-1 change
//   if (oldVals.length === 1 && newVals.length === 1 && oldVals[0] !== newVals[0]) {
//     if (newVals[0] === 'flex') {
//       changes.push(`Changed to Flexbox layout (was: ${oldVals[0]})`);
//       analyzeFlexboxProperties(ast, changes);
//     } else if (newVals[0] === 'grid') {
//       changes.push(`Changed to CSS Grid layout (was: ${oldVals[0]})`);
//       analyzeGridProperties(ast, changes);
//     } else {
//       changes.push(`Property changed: display from ${oldVals[0]} → ${newVals[0]}`);
//     }
//     return;
//   }
  
//   // Additions
//   newVals.forEach(value => {
//     if (!oldVals.includes(value)) {
//       const count = counts[value];
      
//       if (value === 'flex') {
//         changes.push('Implemented Flexbox layout');
//         analyzeFlexboxProperties(ast, changes);
//       } else if (value === 'grid') {
//         changes.push('Implemented CSS Grid layout');
//         analyzeGridProperties(ast, changes);
//       } else if (value === 'none') {
//         if (count > 1) {
//           changes.push(`⚠ Element hidden via display: none (${count} elements)`);
//         } else {
//           changes.push('⚠ Element hidden via display: none');
//         }
//       } else {
//         if (count > 1) {
//           changes.push(`Property added: display: ${value} (${count} elements)`);
//         } else {
//           changes.push(`Property added: display: ${value}`);
//         }
//       }
//     }
//   });
  
//   // Removals
//   oldVals.forEach(value => {
//     if (!newVals.includes(value)) {
//       const count = counts[value];
//       if (count > 1) {
//         changes.push(`Property removed: display: ${value} (${count} elements)`);
//       } else {
//         changes.push(`Property removed: display: ${value}`);
//       }
//     }
//   });
// }

// /**
//  * Handle special properties (position, visibility, opacity, z-index)
//  */
// function handleSpecialProperty(prop, newVals, oldVals, newCounts, oldCounts, changes) {
//   // Simple 1-to-1 change
//   if (oldVals.length === 1 && newVals.length === 1 && oldVals[0] !== newVals[0]) {
//     changes.push(`Property changed: ${prop} from ${oldVals[0]} → ${newVals[0]}`);
//     return;
//   }
  
//   // Additions
//   newVals.forEach(value => {
//     if (!oldVals.includes(value)) {
//       const count = newCounts[value];
      
//       // Special messages for certain values
//       if (prop === 'visibility' && value === 'hidden') {
//         if (count > 1) {
//           changes.push(`⚠ Element hidden via visibility: hidden (${count} elements)`);
//         } else {
//           changes.push('⚠ Element hidden via visibility: hidden');
//         }
//       } else {
//         if (count > 1) {
//           changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
//         } else {
//           changes.push(`Property added: ${prop}: ${value}`);
//         }
//       }
//     }
//   });
  
//   // Removals
//   oldVals.forEach(value => {
//     if (!newVals.includes(value)) {
//       const count = oldCounts[value];
//       if (count > 1) {
//         changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
//       } else {
//         changes.push(`Property removed: ${prop}: ${value}`);
//       }
//     }
//   });
// }

// /**
//  * Analyze Flexbox properties
//  */
// function analyzeFlexboxProperties(ast, changes) {
//   const flexProps = {};
  
//   ast.walkDecls(decl => {
//     if (decl.prop.startsWith('flex-') || 
//         ['justify-content', 'align-items', 'align-content', 'gap'].includes(decl.prop)) {
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
//   if (flexProps['gap']) {
//     changes.push(`  └─ Gap: ${flexProps['gap']}`);
//   }
// }

// /**
//  * Analyze Grid properties
//  */
// function analyzeGridProperties(ast, changes) {
//   ast.walkDecls(decl => {
//     if (decl.prop === 'grid-template-columns') {
//       const columns = decl.value.split(/\s+/).filter(v => v && v !== '|').length;
//       changes.push(`  └─ ${columns} column grid`);
//     }
//     if (decl.prop === 'gap' || decl.prop === 'grid-gap') {
//       changes.push(`  └─ With gap spacing: ${decl.value}`);
//     }
//     if (decl.prop === 'grid-template-rows') {
//       changes.push(`  └─ Row template: ${decl.value}`);
//     }
//   });
// }

// /**
//  * Analyze layout systems
//  */
// function analyzeLayoutSystems(newAST, oldAST, changes) {
//   // Already handled in display changes
// }

// /**
//  * Analyze animations
//  */
// function analyzeAnimations(newAST, oldAST, changes) {
//   const newAnimProps = extractAnimationProps(newAST);
//   const oldAnimProps = oldAST ? extractAnimationProps(oldAST) : {};
  
//   const allProps = new Set([...Object.keys(newAnimProps), ...Object.keys(oldAnimProps)]);
  
//   allProps.forEach(prop => {
//     const newVals = newAnimProps[prop] || [];
//     const oldVals = oldAnimProps[prop] || [];
    
//     const newUnique = Array.from(new Set(newVals));
//     const oldUnique = Array.from(new Set(oldVals));
    
//     // Simple 1-to-1 change
//     if (oldUnique.length === 1 && newUnique.length === 1 && oldUnique[0] !== newUnique[0]) {
//       changes.push(`Property changed: ${prop} from ${oldUnique[0]} → ${newUnique[0]}`);
//       return;
//     }
    
//     const addedVals = newUnique.filter(v => !oldUnique.includes(v));
//     const removedVals = oldUnique.filter(v => !newUnique.includes(v));
    
//     addedVals.forEach(value => {
//       const count = newVals.filter(v => v === value).length;
//       if (count > 1) {
//         changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
//       } else {
//         changes.push(`Property added: ${prop}: ${value}`);
//       }
//     });
    
//     removedVals.forEach(value => {
//       const count = oldVals.filter(v => v === value).length;
//       if (count > 1) {
//         changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
//       } else {
//         changes.push(`Property removed: ${prop}: ${value}`);
//       }
//     });
//   });
// }

// function extractAnimationProps(ast) {
//   const props = {};
  
//   ast.walkDecls(decl => {
//     if (decl.prop.startsWith('animation') || decl.prop === 'transition' || decl.prop === 'transform') {
//       if (!props[decl.prop]) {
//         props[decl.prop] = [];
//       }
//       props[decl.prop].push(decl.value);
//     }
//   });
  
//   return props;
// }

// /**
//  * Analyze typography
//  */
// function analyzeTypography(newAST, oldAST, changes) {
//   const typographyProps = [
//     'font-family', 'font-size', 'font-weight', 'line-height',
//     'letter-spacing', 'text-align', 'text-transform', 'text-decoration'
//   ];
  
//   const newTypo = extractTypographyProps(newAST, typographyProps);
//   const oldTypo = oldAST ? extractTypographyProps(oldAST, typographyProps) : {};
  
//   Object.keys(newTypo).forEach(prop => {
//     const newVals = newTypo[prop] || [];
//     const oldVals = oldTypo[prop] || [];
    
//     const newUnique = Array.from(new Set(newVals));
//     const oldUnique = Array.from(new Set(oldVals));
    
//     // Simple 1-to-1 change
//     if (oldUnique.length === 1 && newUnique.length === 1 && oldUnique[0] !== newUnique[0]) {
//       changes.push(`Property changed: ${prop} from ${oldUnique[0]} → ${newUnique[0]}`);
//       return;
//     }
    
//     const addedVals = newUnique.filter(v => !oldUnique.includes(v));
//     const removedVals = oldUnique.filter(v => !newUnique.includes(v));
    
//     addedVals.forEach(value => {
//       const count = newVals.filter(v => v === value).length;
//       if (count > 1) {
//         changes.push(`Property added: ${prop}: ${value} (${count} elements)`);
//       } else {
//         changes.push(`Property added: ${prop}: ${value}`);
//       }
//     });
    
//     removedVals.forEach(value => {
//       const count = oldVals.filter(v => v === value).length;
//       if (count > 1) {
//         changes.push(`Property removed: ${prop}: ${value} (${count} elements)`);
//       } else {
//         changes.push(`Property removed: ${prop}: ${value}`);
//       }
//     });
//   });
// }

// function extractTypographyProps(ast, props) {
//   const result = {};
  
//   ast.walkDecls(decl => {
//     if (props.includes(decl.prop)) {
//       if (!result[decl.prop]) {
//         result[decl.prop] = [];
//       }
//       result[decl.prop].push(decl.value);
//     }
//   });
  
//   return result;
// }

// /**
//  * Compare at-rules (media queries, keyframes, etc.)
//  */
// function compareAtRules(oldAST, newAST) {
//   const changes = [];
  
//   const oldAtRules = oldAST ? extractAtRules(oldAST) : { 
//     media: [], keyframes: [], import: [], fontFace: [], supports: [], container: [] 
//   };
//   const newAtRules = newAST ? extractAtRules(newAST) : { 
//     media: [], keyframes: [], import: [], fontFace: [], supports: [], container: [] 
//   };
  
//   // Media queries
//   const addedMedia = newAtRules.media.filter(m => !oldAtRules.media.includes(m));
//   const removedMedia = oldAtRules.media.filter(m => !newAtRules.media.includes(m));
  
//   addedMedia.forEach(params => {
//     changes.push(`Property added: @media ${params}`);
//     if (/prefers-color-scheme:\s*dark/.test(params)) {
//       changes.push('✓ Added dark mode support');
//     }
//   });
  
//   removedMedia.forEach(params => {
//     changes.push(`Property removed: @media ${params}`);
//   });
  
//   // Keyframes
//   const addedKeyframes = newAtRules.keyframes.filter(k => !oldAtRules.keyframes.includes(k));
//   const removedKeyframes = oldAtRules.keyframes.filter(k => !newAtRules.keyframes.includes(k));
  
//   addedKeyframes.forEach(name => {
//     changes.push(`Property added: @keyframes ${name}`);
//   });
  
//   removedKeyframes.forEach(name => {
//     changes.push(`Property removed: @keyframes ${name}`);
//   });
  
//   // Font-face
//   if (newAtRules.fontFace.length > oldAtRules.fontFace.length) {
//     const diff = newAtRules.fontFace.length - oldAtRules.fontFace.length;
//     changes.push(`Property added: @font-face (${diff} custom font${diff > 1 ? 's' : ''})`);
//   }
  
//   // Imports
//   const addedImports = newAtRules.import.filter(i => !oldAtRules.import.includes(i));
//   const removedImports = oldAtRules.import.filter(i => !newAtRules.import.includes(i));
  
//   addedImports.forEach(url => {
//     changes.push(`Property added: @import ${url}`);
//   });
  
//   removedImports.forEach(url => {
//     changes.push(`Property removed: @import ${url}`);
//   });
  
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
//  * OPTIMIZATION 7: Fixed SCSS variable comparison to avoid double reporting
//  * Compare SCSS/SASS preprocessor features
//  */
// function comparePreprocessorFeatures(oldContent, newContent) {
//   const changes = [];
  
//   // SCSS variables - Extract with values
//   const oldVars = extractSCSSVariables(oldContent);
//   const newVars = extractSCSSVariables(newContent);
  
//   const allVarNames = new Set([...Object.keys(oldVars), ...Object.keys(newVars)]);
  
//   allVarNames.forEach(varName => {
//     const oldValue = oldVars[varName];
//     const newValue = newVars[varName];
    
//     if (!oldValue && newValue) {
//       // Variable added
//       changes.push(`Property added: SCSS variable ${varName}: ${newValue}`);
//     } else if (oldValue && !newValue) {
//       // Variable removed
//       changes.push(`Property removed: SCSS variable ${varName}`);
//     } else if (oldValue && newValue && oldValue !== newValue) {
//       // Variable value changed
//       changes.push(`Property changed: SCSS variable ${varName} from ${oldValue} → ${newValue}`);
//     }
//     // If oldValue === newValue, no change - don't report anything
//   });
  
//   // Mixins
//   const oldMixins = extractMixins(oldContent);
//   const newMixins = extractMixins(newContent);
  
//   const addedMixins = newMixins.filter(m => !oldMixins.includes(m));
//   addedMixins.forEach(mixin => {
//     changes.push(`Defined mixin: ${mixin}`);
//   });
  
//   // Mixin includes
//   const oldIncludes = extractMixinIncludes(oldContent);
//   const newIncludes = extractMixinIncludes(newContent);
  
//   const addedIncludes = newIncludes.filter(m => !oldIncludes.includes(m));
//   addedIncludes.forEach(include => {
//     changes.push(`Used mixin: ${include}`);
//   });
  
//   // OPTIMIZATION 4: Improved nesting depth warning
//   const newDepth = detectNestingDepth(newContent);
//   const oldDepth = detectNestingDepth(oldContent);
  
//   // Warn if new depth is excessive (>4), even if old depth was also high
//   if (newDepth > 4) {
//     if (newDepth > oldDepth) {
//       changes.push(`⚠ Deep nesting detected (${newDepth} levels, increased from ${oldDepth})`);
//     } else if (oldDepth <= 4) {
//       // New deep nesting introduced
//       changes.push(`⚠ Deep nesting detected (${newDepth} levels)`);
//     }
//     // If both old and new are >4 and new <= old, don't warn (already had deep nesting)
//   }
  
//   return changes;
// }

// function extractSCSSVariables(content) {
//   const vars = {};
//   const regex = /\$([\w-]+):\s*([^;]+);/g;
//   let match;
  
//   while ((match = regex.exec(content)) !== null) {
//     vars[`${match[1]}`] = match[2].trim();
//   }
  
//   return vars;
// }

// function extractMixins(content) {
//   const mixins = [];
//   const regex = /@mixin\s+([\w-]+)/g;
//   let match;
  
//   while ((match = regex.exec(content)) !== null) {
//     mixins.push(match[1]);
//   }
  
//   return mixins;
// }

// function extractMixinIncludes(content) {
//   const includes = [];
//   const regex = /@include\s+([\w-]+)/g;
//   let match;
  
//   while ((match = regex.exec(content)) !== null) {
//     includes.push(match[1]);
//   }
  
//   return includes;
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
//  * OPTIMIZATION 5: Enhanced fallback with property extraction
//  * FALLBACK METHOD: Diff-aware lightweight parsing
//  * Used only when full-file AST parsing fails (rare)
//  */
// function parseCSSWithDiffFallback(diffContent, filepath) {
//   const changes = [];
  
//   // Extract added lines from diff
//   const lines = diffContent.split('\n');
//   const addedLines = [];
  
//   for (const line of lines) {
//     if (line.startsWith('+') && !line.startsWith('+++')) {
//       addedLines.push(line.substring(1).trim());
//     }
//   }
  
//   const addedContent = addedLines.join('\n');
  
//   // Try to extract some basic property information
//   const propertyMatches = addedContent.match(/([\w-]+)\s*:\s*([^;{]+)/g);
  
//   if (propertyMatches && propertyMatches.length > 0) {
//     // Extract unique properties
//     const properties = new Set();
    
//     propertyMatches.forEach(match => {
//       const propMatch = match.match(/([\w-]+)\s*:/);
//       if (propMatch) {
//         const prop = propMatch[1].trim();
        
//         // Skip common non-CSS properties
//         if (!prop.startsWith('@') && prop.length > 0) {
//           properties.add(prop);
//         }
//       }
//     });
    
//     if (properties.size > 0) {
//       // Report properties found
//       if (properties.size <= 5) {
//         // If few properties, list them
//         Array.from(properties).forEach(prop => {
//           changes.push(`Property modified: ${prop}`);
//         });
//       } else {
//         // If many properties, give summary
//         changes.push(`Component visual changes detected (${properties.size} properties modified)`);
//       }
//     } else {
//       changes.push('Component visual changes detected');
//     }
//   } else {
//     // No properties found, generic message
//     changes.push('Component visual changes detected');
//   }
  
//   // Check for special cases
//   if (addedContent.includes('@media')) {
//     changes.push('Responsive design changes detected');
//   }
  
//   if (addedContent.includes('@keyframes')) {
//     changes.push('Animation changes detected');
//   }
  
//   if (addedContent.includes('display:') || addedContent.includes('display :')) {
//     if (addedContent.includes('flex')) {
//       changes.push('Possible Flexbox layout changes');
//     }
//     if (addedContent.includes('grid')) {
//       changes.push('Possible Grid layout changes');
//     }
//   }
  
//   return changes.length > 0 ? changes : ['Component visual changes detected'];
// }

// module.exports = { parseCSS };


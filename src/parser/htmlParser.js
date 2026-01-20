// src/parser/htmlParser.js - Advanced regex-based parser
const { parse } = require('node-html-parser');

function parseHTML(diff, filepath) {
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
  
  // 1. Semantic HTML5 element changes
  const semanticChanges = detectSemanticElements(addedContent, removedContent);
  changes.push(...semanticChanges);
  
  // 2. Form element changes
  const formChanges = detectFormChanges(addedContent, removedContent);
  changes.push(...formChanges);
  
  // 3. Interactive element changes (buttons, links)
  const interactiveChanges = detectInteractiveElements(addedContent, removedContent);
  changes.push(...interactiveChanges);
  
  // 4. Media element changes (img, video, audio)
  const mediaChanges = detectMediaElements(addedContent, removedContent);
  changes.push(...mediaChanges);
  
  // 5. Attribute changes (data-*, aria-*, role)
  const attributeChanges = detectAttributeChanges(addedContent, removedContent);
  changes.push(...attributeChanges);
  
  // 6. Class and ID changes (more detailed)
  const classIdChanges = detectClassIdChanges(addedContent, removedContent);
  changes.push(...classIdChanges);
  
  // 7. Script and style tag changes
  const scriptStyleChanges = detectScriptStyleTags(addedContent, removedContent);
  changes.push(...scriptStyleChanges);
  
  // 8. Structural changes (nesting, hierarchy)
  const structuralChanges = detectStructuralChanges(addedContent, removedContent);
  changes.push(...structuralChanges);
  
  // 9. Accessibility changes
  const a11yChanges = detectAccessibilityChanges(addedContent, removedContent);
  changes.push(...a11yChanges);
  
  // 10. Template and component patterns
  const templateChanges = detectTemplatePatterns(addedContent, removedContent);
  changes.push(...templateChanges);
  
  return changes.length > 0 ? changes : ['HTML structure modified'];
}

/**
 * Detect semantic HTML5 element changes
 */
function detectSemanticElements(added, removed) {
  const changes = [];
  const semanticTags = ['header', 'footer', 'nav', 'main', 'article', 'section', 'aside', 'figure', 'figcaption'];
  
  semanticTags.forEach(tag => {
    const addedCount = (added.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const removedCount = (removed.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    
    if (addedCount > removedCount) {
      changes.push(`Added <${tag}> element${addedCount - removedCount > 1 ? ` (${addedCount - removedCount})` : ''}`);
    } else if (removedCount > addedCount) {
      changes.push(`Removed <${tag}> element${removedCount - addedCount > 1 ? ` (${removedCount - addedCount})` : ''}`);
    }
  });
  
  return changes;
}

/**
 * Detect form-related changes
 */
function detectFormChanges(added, removed) {
  const changes = [];
  
  // Form element
  if (/<form[\s>]/.test(added) && !/<form[\s>]/.test(removed)) {
    changes.push('Added <form> element');
    
    // Detect form method
    const methodMatch = added.match(/<form[^>]*method=["'](\w+)["']/);
    if (methodMatch) {
      changes.push(`  └─ Form method: ${methodMatch[1].toUpperCase()}`);
    }
    
    // Detect form action
    const actionMatch = added.match(/<form[^>]*action=["']([^"']+)["']/);
    if (actionMatch) {
      changes.push(`  └─ Form action: ${actionMatch[1]}`);
    }
  }
  
  // Input fields
  const inputTypes = ['text', 'email', 'password', 'number', 'tel', 'url', 'search', 'date', 'checkbox', 'radio', 'file', 'hidden'];
  const addedInputs = extractInputTypes(added);
  const removedInputs = extractInputTypes(removed);
  
  inputTypes.forEach(type => {
    const addedCount = addedInputs.filter(t => t === type).length;
    const removedCount = removedInputs.filter(t => t === type).length;
    
    if (addedCount > removedCount) {
      const diff = addedCount - removedCount;
      changes.push(`Added ${diff} <input type="${type}"> field${diff > 1 ? 's' : ''}`);
    } else if (removedCount > addedCount) {
      const diff = removedCount - addedCount;
      changes.push(`Removed ${diff} <input type="${type}"> field${diff > 1 ? 's' : ''}`);
    }
  });
  
  // Textarea
  const addedTextareas = (added.match(/<textarea/g) || []).length;
  const removedTextareas = (removed.match(/<textarea/g) || []).length;
  if (addedTextareas > removedTextareas) {
    changes.push(`Added ${addedTextareas - removedTextareas} <textarea> element${addedTextareas - removedTextareas > 1 ? 's' : ''}`);
  }
  
  // Select dropdown
  const addedSelects = (added.match(/<select/g) || []).length;
  const removedSelects = (removed.match(/<select/g) || []).length;
  if (addedSelects > removedSelects) {
    changes.push(`Added ${addedSelects - removedSelects} <select> dropdown${addedSelects - removedSelects > 1 ? 's' : ''}`);
  }
  
  // Required fields
  const addedRequired = (added.match(/required[\s=>]/g) || []).length;
  const removedRequired = (removed.match(/required[\s=>]/g) || []).length;
  if (addedRequired > removedRequired) {
    changes.push(`Added ${addedRequired - removedRequired} required field${addedRequired - removedRequired > 1 ? 's' : ''}`);
  }
  
  return changes;
}

function extractInputTypes(html) {
  const types = [];
  const regex = /<input[^>]*type=["'](\w+)["']/g;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    types.push(match[1]);
  }
  
  return types;
}

/**
 * Detect interactive element changes
 */
function detectInteractiveElements(added, removed) {
  const changes = [];
  
  // Buttons
  const addedButtons = (added.match(/<button[\s>]/g) || []).length;
  const removedButtons = (removed.match(/<button[\s>]/g) || []).length;
  
  if (addedButtons > removedButtons) {
    changes.push(`Added ${addedButtons - removedButtons} <button> element${addedButtons - removedButtons > 1 ? 's' : ''}`);
    
    // Button types
    const submitButtons = (added.match(/<button[^>]*type=["']submit["']/g) || []).length;
    if (submitButtons > 0) {
      changes.push(`  └─ Including ${submitButtons} submit button${submitButtons > 1 ? 's' : ''}`);
    }
  } else if (removedButtons > addedButtons) {
    changes.push(`Removed ${removedButtons - addedButtons} <button> element${removedButtons - addedButtons > 1 ? 's' : ''}`);
  }
  
  // Links
  const addedLinks = (added.match(/<a[\s>]/g) || []).length;
  const removedLinks = (removed.match(/<a[\s>]/g) || []).length;
  
  if (addedLinks > removedLinks) {
    changes.push(`Added ${addedLinks - removedLinks} <a> link${addedLinks - removedLinks > 1 ? 's' : ''}`);
    
    // External links
    const externalLinks = (added.match(/<a[^>]*href=["']https?:\/\//g) || []).length;
    if (externalLinks > 0) {
      changes.push(`  └─ Including ${externalLinks} external link${externalLinks > 1 ? 's' : ''}`);
    }
    
    // Target blank
    const targetBlank = (added.match(/<a[^>]*target=["']_blank["']/g) || []).length;
    if (targetBlank > 0) {
      changes.push(`  └─ Including ${targetBlank} link${targetBlank > 1 ? 's' : ''} opening in new tab`);
    }
  } else if (removedLinks > addedLinks) {
    changes.push(`Removed ${removedLinks - addedLinks} <a> link${removedLinks - addedLinks > 1 ? 's' : ''}`);
  }
  
  return changes;
}

/**
 * Detect media element changes
 */
function detectMediaElements(added, removed) {
  const changes = [];
  
  // Images
  const addedImages = (added.match(/<img[\s>]/g) || []).length;
  const removedImages = (removed.match(/<img[\s>]/g) || []).length;
  
  if (addedImages > removedImages) {
    changes.push(`Added ${addedImages - removedImages} <img> element${addedImages - removedImages > 1 ? 's' : ''}`);
    
    // Alt text
    const imagesWithAlt = (added.match(/<img[^>]*alt=["'][^"']+["']/g) || []).length;
    const imagesWithoutAlt = addedImages - imagesWithAlt;
    if (imagesWithoutAlt > 0) {
      changes.push(`  └─ Warning: ${imagesWithoutAlt} image${imagesWithoutAlt > 1 ? 's' : ''} without alt text`);
    }
  } else if (removedImages > addedImages) {
    changes.push(`Removed ${removedImages - addedImages} <img> element${removedImages - addedImages > 1 ? 's' : ''}`);
  }
  
  // Video
  const addedVideos = (added.match(/<video[\s>]/g) || []).length;
  if (addedVideos > 0) {
    changes.push(`Added ${addedVideos} <video> element${addedVideos > 1 ? 's' : ''}`);
  }
  
  // Audio
  const addedAudio = (added.match(/<audio[\s>]/g) || []).length;
  if (addedAudio > 0) {
    changes.push(`Added ${addedAudio} <audio> element${addedAudio > 1 ? 's' : ''}`);
  }
  
  // SVG
  const addedSvg = (added.match(/<svg[\s>]/g) || []).length;
  const removedSvg = (removed.match(/<svg[\s>]/g) || []).length;
  if (addedSvg > removedSvg) {
    changes.push(`Added ${addedSvg - removedSvg} <svg> graphic${addedSvg - removedSvg > 1 ? 's' : ''}`);
  }
  
  // Picture (responsive images)
  const addedPicture = (added.match(/<picture[\s>]/g) || []).length;
  if (addedPicture > 0) {
    changes.push(`Added ${addedPicture} <picture> element${addedPicture > 1 ? 's' : ''} (responsive image)`);
  }
  
  return changes;
}

/**
 * Detect attribute changes
 */
function detectAttributeChanges(added, removed) {
  const changes = [];
  
  // Data attributes
  const addedDataAttrs = extractDataAttributes(added);
  const removedDataAttrs = extractDataAttributes(removed);
  
  addedDataAttrs.forEach(attr => {
    if (!removedDataAttrs.includes(attr)) {
      changes.push(`Added data attribute: ${attr}`);
    }
  });
  
  // ARIA attributes
  const addedAriaAttrs = extractAriaAttributes(added);
  if (addedAriaAttrs.length > 0) {
    changes.push(`Added ${addedAriaAttrs.length} ARIA attribute${addedAriaAttrs.length > 1 ? 's' : ''}`);
    addedAriaAttrs.slice(0, 3).forEach(attr => {
      changes.push(`  └─ ${attr}`);
    });
  }
  
  // Role attribute
  const addedRoles = (added.match(/role=["']([^"']+)["']/g) || []);
  if (addedRoles.length > 0) {
    const roles = addedRoles.map(r => r.match(/role=["']([^"']+)["']/)[1]);
    changes.push(`Added role attributes: ${[...new Set(roles)].join(', ')}`);
  }
  
  return changes;
}

function extractDataAttributes(html) {
  const attrs = new Set();
  const regex = /data-([\w-]+)=/g;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    attrs.add(`data-${match[1]}`);
  }
  
  return Array.from(attrs);
}

function extractAriaAttributes(html) {
  const attrs = new Set();
  const regex = /aria-([\w-]+)=/g;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    attrs.add(`aria-${match[1]}`);
  }
  
  return Array.from(attrs);
}

/**
 * Detect class and ID changes (more detailed)
 */
function detectClassIdChanges(added, removed) {
  const changes = [];
  
  // Extract unique classes
  const addedClasses = extractUniqueClasses(added);
  const removedClasses = extractUniqueClasses(removed);
  
  const newClasses = addedClasses.filter(c => !removedClasses.includes(c));
  const deletedClasses = removedClasses.filter(c => !addedClasses.includes(c));
  
  if (newClasses.length > 0) {
    if (newClasses.length <= 5) {
      newClasses.forEach(cls => {
        changes.push(`Added class: .${cls}`);
      });
    } else {
      changes.push(`Added ${newClasses.length} classes: ${newClasses.slice(0, 3).map(c => `.${c}`).join(', ')}...`);
    }
  }
  
  if (deletedClasses.length > 0) {
    if (deletedClasses.length <= 3) {
      deletedClasses.forEach(cls => {
        changes.push(`Removed class: .${cls}`);
      });
    } else {
      changes.push(`Removed ${deletedClasses.length} classes`);
    }
  }
  
  // IDs
  const addedIds = extractIds(added);
  const removedIds = extractIds(removed);
  
  const newIds = addedIds.filter(id => !removedIds.includes(id));
  const deletedIds = removedIds.filter(id => !addedIds.includes(id));
  
  if (newIds.length > 0) {
    newIds.forEach(id => {
      changes.push(`Added ID: #${id}`);
    });
  }
  
  if (deletedIds.length > 0) {
    deletedIds.forEach(id => {
      changes.push(`Removed ID: #${id}`);
    });
  }
  
  return changes;
}

function extractUniqueClasses(html) {
  const classes = new Set();
  const classRegex = /class=["']([^"']+)["']/g;
  let match;
  
  while ((match = classRegex.exec(html)) !== null) {
    match[1].split(/\s+/).forEach(c => {
      if (c.trim()) classes.add(c.trim());
    });
  }
  
  return Array.from(classes);
}

function extractIds(html) {
  const ids = new Set();
  const idRegex = /id=["']([^"']+)["']/g;
  let match;
  
  while ((match = idRegex.exec(html)) !== null) {
    ids.add(match[1]);
  }
  
  return Array.from(ids);
}

/**
 * Detect script and style tag changes
 */
function detectScriptStyleTags(added, removed) {
  const changes = [];
  
  // Script tags
  const addedScripts = (added.match(/<script/g) || []).length;
  const removedScripts = (removed.match(/<script/g) || []).length;
  
  if (addedScripts > removedScripts) {
    changes.push(`Added ${addedScripts - removedScripts} <script> tag${addedScripts - removedScripts > 1 ? 's' : ''}`);
    
    // External scripts
    const externalScripts = (added.match(/<script[^>]*src=["'][^"']+["']/g) || []).length;
    if (externalScripts > 0) {
      changes.push(`  └─ ${externalScripts} external script${externalScripts > 1 ? 's' : ''}`);
    }
  } else if (removedScripts > addedScripts) {
    changes.push(`Removed ${removedScripts - addedScripts} <script> tag${removedScripts - addedScripts > 1 ? 's' : ''}`);
  }
  
  // Style tags
  const addedStyles = (added.match(/<style/g) || []).length;
  if (addedStyles > 0) {
    changes.push(`Added ${addedStyles} inline <style> block${addedStyles > 1 ? 's' : ''}`);
  }
  
  // Link tags (stylesheets)
  const addedLinks = (added.match(/<link[^>]*rel=["']stylesheet["']/g) || []).length;
  if (addedLinks > 0) {
    changes.push(`Added ${addedLinks} stylesheet link${addedLinks > 1 ? 's' : ''}`);
  }
  
  return changes;
}

/**
 * Detect structural changes
 */
function detectStructuralChanges(added, removed) {
  const changes = [];
  
  // Container elements
  const containers = ['div', 'span'];
  containers.forEach(tag => {
    const addedCount = (added.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const removedCount = (removed.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    
    const diff = addedCount - removedCount;
    if (Math.abs(diff) >= 3) {
      if (diff > 0) {
        changes.push(`Added ${diff} <${tag}> container${diff > 1 ? 's' : ''}`);
      } else {
        changes.push(`Removed ${Math.abs(diff)} <${tag}> container${Math.abs(diff) > 1 ? 's' : ''}`);
      }
    }
  });
  
  // Lists
  const addedUl = (added.match(/<ul[\s>]/g) || []).length;
  const addedOl = (added.match(/<ol[\s>]/g) || []).length;
  const addedLi = (added.match(/<li[\s>]/g) || []).length;
  
  if (addedUl > 0 || addedOl > 0) {
    const listType = addedUl > 0 ? 'unordered' : 'ordered';
    const count = Math.max(addedUl, addedOl);
    changes.push(`Added ${count} ${listType} list${count > 1 ? 's' : ''} with ${addedLi} item${addedLi > 1 ? 's' : ''}`);
  }
  
  // Tables
  const addedTables = (added.match(/<table[\s>]/g) || []).length;
  if (addedTables > 0) {
    const rows = (added.match(/<tr[\s>]/g) || []).length;
    changes.push(`Added ${addedTables} table${addedTables > 1 ? 's' : ''} with ${rows} row${rows > 1 ? 's' : ''}`);
  }
  
  return changes;
}

/**
 * Detect accessibility improvements/regressions
 */
function detectAccessibilityChanges(added, removed) {
  const changes = [];
  
  // Images without alt text
  const imagesAdded = (added.match(/<img[\s>]/g) || []).length;
  const imagesWithoutAlt = added.match(/<img(?![^>]*alt=)/g);
  
  if (imagesWithoutAlt && imagesWithoutAlt.length > 0) {
    changes.push(`⚠ Accessibility: ${imagesWithoutAlt.length} image${imagesWithoutAlt.length > 1 ? 's' : ''} missing alt attribute`);
  }
  
  // Links without text
  const emptyLinks = added.match(/<a[^>]*>\s*<\/a>/g);
  if (emptyLinks && emptyLinks.length > 0) {
    changes.push(`⚠ Accessibility: ${emptyLinks.length} empty link${emptyLinks.length > 1 ? 's' : ''}`);
  }
  
  // Form inputs without labels
  const inputsAdded = (added.match(/<input/g) || []).length;
  const labelsAdded = (added.match(/<label/g) || []).length;
  
  if (inputsAdded > labelsAdded && inputsAdded - labelsAdded >= 2) {
    changes.push(`⚠ Accessibility: ${inputsAdded - labelsAdded} input${inputsAdded - labelsAdded > 1 ? 's' : ''} without associated label${inputsAdded - labelsAdded > 1 ? 's' : ''}`);
  }
  
  // Positive accessibility additions
  const ariaLabelAdded = (added.match(/aria-label=/g) || []).length;
  if (ariaLabelAdded > 0) {
    changes.push(`✓ Accessibility: Added ${ariaLabelAdded} aria-label attribute${ariaLabelAdded > 1 ? 's' : ''}`);
  }
  
  return changes;
}

/**
 * Detect template and component patterns
 */
function detectTemplatePatterns(added, removed) {
  const changes = [];
  
  // Template syntax (Angular, Vue, etc.)
  if (/\{\{[^}]+\}\}/.test(added)) {
    const count = (added.match(/\{\{[^}]+\}\}/g) || []).length;
    changes.push(`Added ${count} template binding${count > 1 ? 's' : ''}`);
  }
  
  // Vue directives
  const vueDirectives = (added.match(/v-[\w-]+=/g) || []);
  if (vueDirectives.length > 0) {
    const unique = [...new Set(vueDirectives.map(d => d.replace(/=$/, '')))];
    changes.push(`Added Vue directives: ${unique.join(', ')}`);
  }
  
  // Angular directives
  const ngDirectives = (added.match(/\*ng[\w-]+=/g) || []);
  if (ngDirectives.length > 0) {
    const unique = [...new Set(ngDirectives.map(d => d.replace(/=$/, '')))];
    changes.push(`Added Angular directives: ${unique.join(', ')}`);
  }
  
  // React-like attributes
  const reactAttrs = (added.match(/className=|onClick=|onChange=/g) || []);
  if (reactAttrs.length > 0) {
    changes.push(`Detected ${reactAttrs.length} React-style attribute${reactAttrs.length > 1 ? 's' : ''}`);
  }
  
  return changes;
}

module.exports = { parseHTML };

// // src/parser/htmlParser.js
// const { parse } = require('node-html-parser');

// function parseHTML(diff, filepath) {
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
  
//   // Detect tag changes
//   const addedTags = extractTags(addedLines.join('\n'));
//   const removedTags = extractTags(removedLines.join('\n'));
  
//   addedTags.forEach(tag => {
//     if (!removedTags.includes(tag)) {
//       changes.push(`Added element: <${tag}>`);
//     }
//   });
  
//   removedTags.forEach(tag => {
//     if (!addedTags.includes(tag)) {
//       changes.push(`Removed element: <${tag}>`);
//     }
//   });
  
//   // Detect class/ID changes
//   const addedClasses = extractClasses(addedLines.join('\n'));
//   const removedClasses = extractClasses(removedLines.join('\n'));
  
//   addedClasses.forEach(cls => {
//     if (!removedClasses.includes(cls)) {
//       changes.push(`Added class: .${cls}`);
//     }
//   });
  
//   const addedIds = extractIds(addedLines.join('\n'));
//   addedIds.forEach(id => {
//     changes.push(`Added ID: #${id}`);
//   });
  
//   return changes.length > 0 ? changes : ['HTML structure modified'];
// }

// function extractTags(html) {
//   const tags = [];
//   const tagRegex = /<(\w+)/g;
//   let match;
  
//   while ((match = tagRegex.exec(html)) !== null) {
//     tags.push(match[1]);
//   }
  
//   return tags;
// }

// function extractClasses(html) {
//   const classes = [];
//   const classRegex = /class=["']([^"']+)["']/g;
//   let match;
  
//   while ((match = classRegex.exec(html)) !== null) {
//     classes.push(...match[1].split(' '));
//   }
  
//   return classes;
// }

// function extractIds(html) {
//   const ids = [];
//   const idRegex = /id=["']([^"']+)["']/g;
//   let match;
  
//   while ((match = idRegex.exec(html)) !== null) {
//     ids.push(match[1]);
//   }
  
//   return ids;
// }

// module.exports = { parseHTML };
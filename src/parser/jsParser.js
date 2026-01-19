// src/parser/astJsParser.js
const acorn = require('acorn');
const { parseJS: regexParseJS } = require('./jsParser');

/**
 * AST-based JavaScript parser with regex fallback
 */
function parseJSWithAST(diff, filepath) {
  const lines = diff.split('\n');
  const changes = [];
  
  let addedCode = [];
  let removedCode = [];
  
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedCode.push(line.substring(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removedCode.push(line.substring(1));
    }
  }
  
  const addedSource = addedCode.join('\n');
  const removedSource = removedCode.join('\n');
  
  try {
    // Try AST-based analysis first
    const addedAST = parseToAST(addedSource);
    const removedAST = parseToAST(removedSource);
    
    // Function declarations and expressions
    const funcChanges = analyzeFunctionChanges(addedAST, removedAST);
    changes.push(...funcChanges);
    
    // Variable declarations
    const varChanges = analyzeVariableChanges(addedAST, removedAST);
    changes.push(...varChanges);
    
    // Import/Export statements
    const importChanges = analyzeImportChanges(addedAST, removedAST);
    changes.push(...importChanges);
    
    // Control flow
    const controlFlowChanges = analyzeControlFlow(addedAST, removedAST);
    changes.push(...controlFlowChanges);
    
    // Class changes
    const classChanges = analyzeClassChanges(addedAST, removedAST);
    changes.push(...classChanges);
    
    // API calls and function invocations
    const apiChanges = analyzeAPIChanges(addedAST, removedAST);
    changes.push(...apiChanges);
    
  } catch (error) {
    // Fallback to regex-based parsing for partial code
    console.warn(`AST parsing failed for ${filepath}, using regex fallback`);
    return regexParseJS(diff, filepath);
  }
  
  return changes.length > 0 ? changes : ['Code structure modified'];
}

function parseToAST(code) {
  if (!code.trim()) return { body: [] };
  
  try {
    return acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      allowImportExportEverywhere: true,
      allowAwaitOutsideFunction: true
    });
  } catch (e) {
    // Try wrapping in function for partial code
    try {
      const wrapped = `(function() { ${code} })()`;
      return acorn.parse(wrapped, {
        ecmaVersion: 'latest',
        sourceType: 'module'
      });
    } catch (e2) {
      throw new Error('Unable to parse code');
    }
  }
}

function analyzeFunctionChanges(addedAST, removedAST) {
  const changes = [];
  const addedFuncs = extractFunctionsFromAST(addedAST);
  const removedFuncs = extractFunctionsFromAST(removedAST);
  
  // New functions
  addedFuncs.forEach(func => {
    const existing = removedFuncs.find(f => f.name === func.name);
    if (!existing) {
      const asyncStr = func.async ? 'async ' : '';
      const params = func.params.join(', ');
      changes.push(`Added ${asyncStr}function: ${func.name}(${params})`);
    } else {
      // Check if signature changed
      if (JSON.stringify(func.params) !== JSON.stringify(existing.params)) {
        changes.push(`Modified function signature: ${func.name}`);
      }
      if (func.async !== existing.async) {
        changes.push(`Changed ${func.name} to ${func.async ? 'async' : 'sync'}`);
      }
    }
  });
  
  // Removed functions
  removedFuncs.forEach(func => {
    if (!addedFuncs.find(f => f.name === func.name)) {
      changes.push(`Removed function: ${func.name}`);
    }
  });
  
  return changes;
}

function extractFunctionsFromAST(ast) {
  const functions = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    // Function declarations
    if (node.type === 'FunctionDeclaration') {
      functions.push({
        name: node.id?.name || 'anonymous',
        params: node.params.map(p => p.name || '...'),
        async: node.async || false
      });
    }
    
    // Arrow functions and function expressions
    if (node.type === 'VariableDeclarator' && 
        (node.init?.type === 'ArrowFunctionExpression' || 
         node.init?.type === 'FunctionExpression')) {
      functions.push({
        name: node.id?.name || 'anonymous',
        params: node.init.params.map(p => p.name || '...'),
        async: node.init.async || false
      });
    }
    
    // Method definitions in classes/objects
    if (node.type === 'MethodDefinition') {
      functions.push({
        name: node.key?.name || 'anonymous',
        params: node.value.params.map(p => p.name || '...'),
        async: node.value.async || false
      });
    }
    
    // Recurse through AST
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }
  
  traverse(ast);
  return functions;
}

function analyzeVariableChanges(addedAST, removedAST) {
  const changes = [];
  const addedVars = extractVariablesFromAST(addedAST);
  const removedVars = extractVariablesFromAST(removedAST);
  
  // Check for const -> let/var changes (potential mutability issues)
  addedVars.forEach(v => {
    const removed = removedVars.find(r => r.name === v.name);
    if (removed && removed.kind !== v.kind) {
      changes.push(`Changed ${removed.name} from '${removed.kind}' to '${v.kind}'`);
    } else if (!removed && v.kind === 'const') {
      changes.push(`Added constant: ${v.name}`);
    }
  });
  
  return changes;
}

function extractVariablesFromAST(ast) {
  const variables = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'VariableDeclaration') {
      node.declarations.forEach(decl => {
        if (decl.id?.name) {
          variables.push({
            name: decl.id.name,
            kind: node.kind
          });
        }
      });
    }
    
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }
  
  traverse(ast);
  return variables;
}

function analyzeImportChanges(addedAST, removedAST) {
  const changes = [];
  const addedImports = extractImportsFromAST(addedAST);
  const removedImports = extractImportsFromAST(removedAST);
  
  addedImports.forEach(imp => {
    if (!removedImports.find(r => r.source === imp.source)) {
      const specifiers = imp.specifiers.join(', ');
      changes.push(`Added import: ${specifiers} from '${imp.source}'`);
    }
  });
  
  removedImports.forEach(imp => {
    if (!addedImports.find(a => a.source === imp.source)) {
      changes.push(`Removed import from '${imp.source}'`);
    }
  });
  
  return changes;
}

function extractImportsFromAST(ast) {
  const imports = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'ImportDeclaration') {
      imports.push({
        source: node.source.value,
        specifiers: node.specifiers.map(s => 
          s.imported?.name || s.local?.name || 'default'
        )
      });
    }
    
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }
  
  traverse(ast);
  return imports;
}

function analyzeControlFlow(addedAST, removedAST) {
  const changes = [];
  const addedPatterns = analyzeControlFlowPatterns(addedAST);
  const removedPatterns = analyzeControlFlowPatterns(removedAST);
  
  if (addedPatterns.conditionals > removedPatterns.conditionals) {
    changes.push(`Added ${addedPatterns.conditionals - removedPatterns.conditionals} conditional(s)`);
  }
  
  if (addedPatterns.loops > removedPatterns.loops) {
    changes.push(`Added ${addedPatterns.loops - removedPatterns.loops} loop(s)`);
  }
  
  if (addedPatterns.tryCatch > removedPatterns.tryCatch) {
    changes.push('Added error handling');
  }
  
  if (addedPatterns.switches > removedPatterns.switches) {
    changes.push('Added switch statement');
  }
  
  return changes;
}

function analyzeControlFlowPatterns(ast) {
  const patterns = {
    conditionals: 0,
    loops: 0,
    tryCatch: 0,
    switches: 0
  };
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'IfStatement') patterns.conditionals++;
    if (node.type === 'ForStatement' || 
        node.type === 'WhileStatement' || 
        node.type === 'DoWhileStatement' ||
        node.type === 'ForInStatement' ||
        node.type === 'ForOfStatement') patterns.loops++;
    if (node.type === 'TryStatement') patterns.tryCatch++;
    if (node.type === 'SwitchStatement') patterns.switches++;
    
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }
  
  traverse(ast);
  return patterns;
}

function analyzeClassChanges(addedAST, removedAST) {
  const changes = [];
  const addedClasses = extractClassesFromAST(addedAST);
  const removedClasses = extractClassesFromAST(removedAST);
  
  addedClasses.forEach(cls => {
    const existing = removedClasses.find(c => c.name === cls.name);
    if (!existing) {
      changes.push(`Added class: ${cls.name}`);
    } else {
      // Check for method changes
      cls.methods.forEach(method => {
        if (!existing.methods.includes(method)) {
          changes.push(`Added method to ${cls.name}: ${method}`);
        }
      });
    }
  });
  
  return changes;
}

function extractClassesFromAST(ast) {
  const classes = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'ClassDeclaration') {
      const methods = node.body.body
        .filter(m => m.type === 'MethodDefinition')
        .map(m => m.key?.name || 'anonymous');
      
      classes.push({
        name: node.id?.name || 'anonymous',
        methods: methods
      });
    }
    
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }
  
  traverse(ast);
  return classes;
}

function analyzeAPIChanges(addedAST, removedAST) {
  const changes = [];
  const addedCalls = extractAPICallsFromAST(addedAST);
  const removedCalls = extractAPICallsFromAST(removedAST);
  
  // Check for new API endpoints
  const newAPICalls = addedCalls.filter(call => 
    call.includes('fetch') || 
    call.includes('axios') || 
    call.includes('http')
  );
  
  if (newAPICalls.length > 0) {
    changes.push(`Added ${newAPICalls.length} API call(s)`);
  }
  
  return changes;
}

function extractAPICallsFromAST(ast) {
  const calls = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'CallExpression') {
      if (node.callee?.name) {
        calls.push(node.callee.name);
      } else if (node.callee?.property?.name) {
        calls.push(node.callee.property.name);
      }
    }
    
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }
  
  traverse(ast);
  return calls;
}

module.exports = { parseJSWithAST };


// // src/parser/jsParser.js
// const acorn = require('acorn');

// function parseJS(diff, filepath) {
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
  
//   // Detect function changes
//   const addedFuncs = extractFunctions(addedLines.join('\n'));
//   const removedFuncs = extractFunctions(removedLines.join('\n'));
  
//   for (const func of addedFuncs) {
//     if (!removedFuncs.includes(func)) {
//       changes.push(`Added function: ${func}`);
//     }
//   }
  
//   for (const func of removedFuncs) {
//     if (!addedFuncs.includes(func)) {
//       changes.push(`Removed function: ${func}`);
//     }
//   }
  
//   // Detect import changes
//   const addedImports = extractImports(addedLines.join('\n'));
//   const removedImports = extractImports(removedLines.join('\n'));
  
//   addedImports.forEach(imp => {
//     if (!removedImports.includes(imp)) {
//       changes.push(`Added import: ${imp}`);
//     }
//   });
  
//   removedImports.forEach(imp => {
//     if (!addedImports.includes(imp)) {
//       changes.push(`Removed import: ${imp}`);
//     }
//   });
  
//   // Detect conditional logic changes
//   if (addedLines.join('\n').match(/if\s*\(/)) {
//     changes.push('Added conditional logic');
//   }
  
//   if (addedLines.join('\n').match(/try\s*\{/)) {
//     changes.push('Added error handling');
//   }
  
//   return changes.length > 0 ? changes : ['Logic changes detected'];
// }

// function extractFunctions(code) {
//   const funcs = [];
//   const funcRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*:\s*(?:async\s*)?\()/g;
//   let match;
  
//   while ((match = funcRegex.exec(code)) !== null) {
//     funcs.push(match[1] || match[2] || match[3]);
//   }
  
//   return funcs;
// }

// function extractImports(code) {
//   const imports = [];
//   const importRegex = /import\s+.*?from\s+['"](.+?)['"]/g;
//   let match;
  
//   while ((match = importRegex.exec(code)) !== null) {
//     imports.push(match[1]);
//   }
  
//   return imports;
// }

// module.exports = { parseJS };
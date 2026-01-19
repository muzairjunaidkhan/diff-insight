// src/parser/astReactParser.js
const parser = require('@babel/parser');
const { parseReact: regexParseReact } = require('./reactParser');

/**
 * AST-based React parser using Babel
 */
function parseReactWithAST(diff, filepath) {
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
    const addedAST = parseToReactAST(addedSource);
    const removedAST = parseToReactAST(removedSource);
    
    // Component changes
    const componentChanges = analyzeComponentChanges(addedAST, removedAST);
    changes.push(...componentChanges);
    
    // Hook changes
    const hookChanges = analyzeHookChanges(addedAST, removedAST);
    changes.push(...hookChanges);
    
    // Props changes
    const propChanges = analyzePropChanges(addedAST, removedAST);
    changes.push(...propChanges);
    
    // JSX structure changes
    const jsxChanges = analyzeJSXChanges(addedAST, removedAST);
    changes.push(...jsxChanges);
    
    // Event handler changes
    const eventChanges = analyzeEventHandlers(addedAST, removedAST);
    changes.push(...eventChanges);
    
    // Context usage
    const contextChanges = analyzeContextUsage(addedAST, removedAST);
    changes.push(...contextChanges);
    
    // Lifecycle changes (for class components)
    const lifecycleChanges = analyzeLifecycleMethods(addedAST, removedAST);
    changes.push(...lifecycleChanges);
    
  } catch (error) {
    console.warn(`Babel parsing failed for ${filepath}, using regex fallback`);
    return regexParseReact(diff, filepath);
  }
  
  return changes.length > 0 ? changes : ['Component logic updated'];
}

function parseToReactAST(code) {
  if (!code.trim()) return { program: { body: [] } };
  
  try {
    return parser.parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'decorators-legacy',
        'optionalChaining',
        'nullishCoalescingOperator',
        'dynamicImport'
      ]
    });
  } catch (e) {
    // Try wrapping for partial JSX
    try {
      const wrapped = `function Component() { return (${code}); }`;
      return parser.parse(wrapped, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
      });
    } catch (e2) {
      throw new Error('Unable to parse React code');
    }
  }
}

function analyzeComponentChanges(addedAST, removedAST) {
  const changes = [];
  const addedComps = extractComponentsFromAST(addedAST);
  const removedComps = extractComponentsFromAST(removedAST);
  
  addedComps.forEach(comp => {
    const existing = removedComps.find(c => c.name === comp.name);
    if (!existing) {
      const type = comp.type === 'function' ? 'functional' : 'class';
      changes.push(`Added ${type} component: ${comp.name}`);
    } else {
      // Check if component type changed
      if (comp.type !== existing.type) {
        changes.push(`Converted ${comp.name} from ${existing.type} to ${comp.type} component`);
      }
    }
  });
  
  removedComps.forEach(comp => {
    if (!addedComps.find(c => c.name === comp.name)) {
      changes.push(`Removed component: ${comp.name}`);
    }
  });
  
  return changes;
}

function extractComponentsFromAST(ast) {
  const components = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    // Function components
    if ((node.type === 'FunctionDeclaration' || 
         node.type === 'ArrowFunctionExpression') &&
        hasJSXReturn(node)) {
      const name = node.id?.name || 'Anonymous';
      if (name[0] === name[0].toUpperCase()) {
        components.push({ name, type: 'function' });
      }
    }
    
    // Class components
    if (node.type === 'ClassDeclaration') {
      const extendsReact = node.superClass?.property?.name === 'Component' ||
                          node.superClass?.name === 'Component';
      if (extendsReact) {
        components.push({ 
          name: node.id?.name || 'Anonymous', 
          type: 'class' 
        });
      }
    }
    
    // Variable declarations with components
    if (node.type === 'VariableDeclarator' && 
        (node.init?.type === 'ArrowFunctionExpression' ||
         node.init?.type === 'FunctionExpression') &&
        hasJSXReturn(node.init)) {
      const name = node.id?.name;
      if (name && name[0] === name[0].toUpperCase()) {
        components.push({ name, type: 'function' });
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
  
  traverse(ast.program);
  return components;
}

function hasJSXReturn(node) {
  let hasJSX = false;
  
  function check(n) {
    if (!n || typeof n !== 'object') return;
    
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
      hasJSX = true;
      return;
    }
    
    for (const key in n) {
      if (hasJSX) return;
      if (Array.isArray(n[key])) {
        n[key].forEach(check);
      } else if (n[key] && typeof n[key] === 'object') {
        check(n[key]);
      }
    }
  }
  
  check(node);
  return hasJSX;
}

function analyzeHookChanges(addedAST, removedAST) {
  const changes = [];
  const addedHooks = extractHooksFromAST(addedAST);
  const removedHooks = extractHooksFromAST(removedAST);
  
  // Group hooks by type
  const hookTypes = ['useState', 'useEffect', 'useContext', 'useReducer', 
                     'useCallback', 'useMemo', 'useRef', 'useLayoutEffect'];
  
  hookTypes.forEach(hookType => {
    const addedCount = addedHooks.filter(h => h.name === hookType).length;
    const removedCount = removedHooks.filter(h => h.name === hookType).length;
    
    if (addedCount > removedCount) {
      changes.push(`Added ${addedCount - removedCount} ${hookType} call(s)`);
    } else if (removedCount > addedCount) {
      changes.push(`Removed ${removedCount - addedCount} ${hookType} call(s)`);
    }
  });
  
  // Check for custom hooks
  const customAdded = addedHooks.filter(h => 
    !hookTypes.includes(h.name) && h.name.startsWith('use')
  );
  customAdded.forEach(hook => {
    if (!removedHooks.find(h => h.name === hook.name)) {
      changes.push(`Added custom hook: ${hook.name}`);
    }
  });
  
  return changes;
}

function extractHooksFromAST(ast) {
  const hooks = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'CallExpression' && 
        node.callee?.name?.startsWith('use')) {
      hooks.push({
        name: node.callee.name,
        arguments: node.arguments.length
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
  
  traverse(ast.program);
  return hooks;
}

function analyzePropChanges(addedAST, removedAST) {
  const changes = [];
  const addedProps = extractPropsFromAST(addedAST);
  const removedProps = extractPropsFromAST(removedAST);
  
  // New props
  addedProps.forEach(prop => {
    if (!removedProps.includes(prop)) {
      changes.push(`Added prop usage: ${prop}`);
    }
  });
  
  // Removed props
  const removedCount = removedProps.filter(p => !addedProps.includes(p)).length;
  if (removedCount > 0) {
    changes.push(`Removed ${removedCount} prop reference(s)`);
  }
  
  return changes;
}

function extractPropsFromAST(ast) {
  const props = new Set();
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    // props.something
    if (node.type === 'MemberExpression' && 
        node.object?.name === 'props' &&
        node.property?.name) {
      props.add(node.property.name);
    }
    
    // Destructured props
    if (node.type === 'ObjectPattern') {
      node.properties?.forEach(prop => {
        if (prop.key?.name) {
          props.add(prop.key.name);
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
  
  traverse(ast.program);
  return Array.from(props);
}

function analyzeJSXChanges(addedAST, removedAST) {
  const changes = [];
  const addedElements = extractJSXElementsFromAST(addedAST);
  const removedElements = extractJSXElementsFromAST(removedAST);
  
  // New JSX elements
  addedElements.forEach(elem => {
    if (!removedElements.includes(elem)) {
      changes.push(`Added JSX element: <${elem}>`);
    }
  });
  
  return changes;
}

function extractJSXElementsFromAST(ast) {
  const elements = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'JSXElement') {
      const name = node.openingElement?.name?.name;
      if (name) elements.push(name);
    }
    
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }
  
  traverse(ast.program);
  return elements;
}

function analyzeEventHandlers(addedAST, removedAST) {
  const changes = [];
  const addedHandlers = extractEventHandlersFromAST(addedAST);
  const removedHandlers = extractEventHandlersFromAST(removedAST);
  
  const newHandlers = addedHandlers.filter(h => !removedHandlers.includes(h));
  if (newHandlers.length > 0) {
    changes.push(`Added event handlers: ${newHandlers.join(', ')}`);
  }
  
  return changes;
}

function extractEventHandlersFromAST(ast) {
  const handlers = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'JSXAttribute') {
      const name = node.name?.name;
      if (name && name.startsWith('on')) {
        handlers.push(name);
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
  
  traverse(ast.program);
  return handlers;
}

function analyzeContextUsage(addedAST, removedAST) {
  const changes = [];
  const addedContexts = extractContextUsageFromAST(addedAST);
  const removedContexts = extractContextUsageFromAST(removedAST);
  
  if (addedContexts.length > removedContexts.length) {
    changes.push('Added Context usage');
  }
  
  return changes;
}

function extractContextUsageFromAST(ast) {
  const contexts = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'CallExpression' && 
        node.callee?.name === 'useContext') {
      contexts.push(true);
    }
    
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }
  
  traverse(ast.program);
  return contexts;
}

function analyzeLifecycleMethods(addedAST, removedAST) {
  const changes = [];
  const addedMethods = extractLifecycleMethodsFromAST(addedAST);
  const removedMethods = extractLifecycleMethodsFromAST(removedAST);
  
  addedMethods.forEach(method => {
    if (!removedMethods.includes(method)) {
      changes.push(`Added lifecycle method: ${method}`);
    }
  });
  
  return changes;
}

function extractLifecycleMethodsFromAST(ast) {
  const methods = [];
  const lifecycleMethods = [
    'componentDidMount', 'componentDidUpdate', 'componentWillUnmount',
    'shouldComponentUpdate', 'getDerivedStateFromProps', 'getSnapshotBeforeUpdate'
  ];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'MethodDefinition') {
      const name = node.key?.name;
      if (lifecycleMethods.includes(name)) {
        methods.push(name);
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
  
  traverse(ast.program);
  return methods;
}

module.exports = { parseReactWithAST };


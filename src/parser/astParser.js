// src/parser/astParser.js
const parser = require('@babel/parser');
const acorn = require('acorn');
const simpleGit = require('simple-git');

/**
 * Industry-grade AST parser - parses FULL files, not just diffs
 * Similar to GitHub, Sourcegraph, CodeQL approach
 */
class ASTParser {
  constructor() {
    this.git = simpleGit();
  }

  /**
   * Main entry: Parse full files and perform semantic diffing
   */
  async analyzeFile(filepath, targetBranch, diffInfo) {
    try {
      // Step 1: Get FULL file content from both commits
      const oldContent = await this.getFullFileContent(filepath, targetBranch);
      const newContent = await this.getFullFileContent(filepath, 'HEAD');

      // Step 2: Select appropriate parser
      const parserType = this.selectParser(filepath, newContent);

      // Step 3: Parse FULL AST (not just diff snippets)
      const oldAST = this.parseFullAST(oldContent, parserType);
      const newAST = this.parseFullAST(newContent, parserType);

      // Step 4: Map diff ranges to AST nodes
      const affectedRanges = this.extractDiffRanges(diffInfo.diff);
      
      // Step 5: Perform semantic AST diffing
      const semanticChanges = this.performSemanticDiff(
        oldAST, 
        newAST, 
        affectedRanges,
        filepath
      );

      return {
        success: true,
        changes: semanticChanges,
        parserType,
        method: 'ast-full-file'
      };

    } catch (error) {
      console.warn(`AST parsing failed for ${filepath}: ${error.message}`);
      throw error; // Let caller handle fallback
    }
  }

  /**
   * Get complete file content at specific git ref
   */
  async getFullFileContent(filepath, ref) {
    try {
      return await this.git.show([`${ref}:${filepath}`]);
    } catch (error) {
      return ''; // File doesn't exist at this ref (new/deleted)
    }
  }

  /**
   * Intelligent parser selection based on file type
   */
  selectParser(filepath, content = '') {
    const ext = filepath.split('.').pop().toLowerCase();
    
    // Check content for hints
    const hasJSX = content.includes('React') || /<[A-Z]/.test(content);
    const hasTypeScript = content.includes(': ') && (content.includes('interface') || content.includes('type '));
    
    const parserMap = {
      'tsx': 'babel-tsx',
      'jsx': 'babel-jsx',
      'ts': hasJSX ? 'babel-tsx' : 'babel-ts',
      'js': hasJSX ? 'babel-jsx' : (hasTypeScript ? 'babel-ts' : 'babel-js'),
      'mjs': 'babel-js',
      'cjs': 'babel-js'
    };

    return parserMap[ext] || 'acorn';
  }

  /**
   * Parse complete source to AST with appropriate parser
   */
  parseFullAST(code, parserType) {
    if (!code || !code.trim()) {
      return { type: 'Program', body: [], sourceType: 'module' };
    }

    const babelPlugins = this.getBabelPlugins(parserType);

    try {
      if (parserType.startsWith('babel-')) {
        return parser.parse(code, {
          sourceType: 'unambiguous', // auto-detect module vs script
          plugins: babelPlugins,
          errorRecovery: true,
          ranges: true,
          tokens: false
        });
      } else {
        return acorn.parse(code, {
          ecmaVersion: 'latest',
          sourceType: 'module',
          locations: true,
          ranges: true
        });
      }
    } catch (error) {
      throw new Error(`Parser failed: ${error.message}`);
    }
  }

  /**
   * Get Babel plugins based on parser type
   */
  getBabelPlugins(parserType) {
    const basePlugins = [
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'decorators-legacy',
      'optionalChaining',
      'nullishCoalescingOperator',
      'dynamicImport',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'objectRestSpread',
      'asyncGenerators',
      'topLevelAwait',
      'importMeta'
    ];

    switch (parserType) {
      case 'babel-tsx':
        return [...basePlugins, 'jsx', 'typescript'];
      case 'babel-jsx':
        return [...basePlugins, 'jsx'];
      case 'babel-ts':
        return [...basePlugins, 'typescript'];
      default:
        return basePlugins;
    }
  }

  /**
   * Extract changed line ranges from diff
   */
  extractDiffRanges(diff) {
    const ranges = [];
    const lines = diff.split('\n');
    let newLineNum = 0;
    let oldLineNum = 0;

    for (const line of lines) {
      // Parse @@ -old_start,old_count +new_start,new_count @@
      const match = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        oldLineNum = parseInt(match[1]);
        newLineNum = parseInt(match[3]);
        continue;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        ranges.push({
          line: newLineNum,
          type: 'added',
          content: line.substring(1)
        });
        newLineNum++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        ranges.push({
          line: oldLineNum,
          type: 'removed',
          content: line.substring(1)
        });
        oldLineNum++;
      } else if (!line.startsWith('\\')) {
        newLineNum++;
        oldLineNum++;
      }
    }

    return this.groupRanges(ranges);
  }

  /**
   * Group adjacent changed lines into ranges
   */
  groupRanges(ranges) {
    if (ranges.length === 0) return [];

    const grouped = [];
    let current = { start: ranges[0].line, end: ranges[0].line, type: ranges[0].type };

    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].line === current.end + 1 && ranges[i].type === current.type) {
        current.end = ranges[i].line;
      } else {
        grouped.push(current);
        current = { start: ranges[i].line, end: ranges[i].line, type: ranges[i].type };
      }
    }
    grouped.push(current);

    return grouped;
  }

  /**
   * SEMANTIC DIFFING - The core intelligence
   * Compare ASTs structurally, not textually
   */
  performSemanticDiff(oldAST, newAST, affectedRanges, filepath) {
    const changes = [];

    // Extract structured information
    const oldStructure = this.extractCodeStructure(oldAST);
    const newStructure = this.extractCodeStructure(newAST);

    // 1. Function-level semantic diff
    changes.push(...this.diffFunctions(oldStructure.functions, newStructure.functions));

    // 2. Class-level semantic diff
    changes.push(...this.diffClasses(oldStructure.classes, newStructure.classes));

    // 3. Import/Export changes
    changes.push(...this.diffImports(oldStructure.imports, newStructure.imports));
    changes.push(...this.diffExports(oldStructure.exports, newStructure.exports));

    // 4. Variable declarations
    changes.push(...this.diffVariables(oldStructure.variables, newStructure.variables));

    // 5. React-specific analysis
    if (oldStructure.isReact || newStructure.isReact) {
      changes.push(...this.diffReactComponents(
        oldStructure.components,
        newStructure.components
      ));
      changes.push(...this.diffHooks(oldStructure.hooks, newStructure.hooks));
    }

    return changes.filter(c => c !== null);
  }

  /**
   * Extract complete code structure from AST
   */
  extractCodeStructure(ast) {
    const structure = {
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      variables: [],
      components: [],
      hooks: [],
      isReact: false
    };

    const traverse = (node, parent = null) => {
      if (!node || typeof node !== 'object') return;

      switch (node.type) {
        case 'FunctionDeclaration':
          structure.functions.push(this.extractFunctionDetails(node));
          break;

        case 'VariableDeclarator':
          if (node.init?.type === 'ArrowFunctionExpression' || 
              node.init?.type === 'FunctionExpression') {
            structure.functions.push(this.extractFunctionDetails(node, node.init));
          } else {
            structure.variables.push(this.extractVariableDetails(node, parent));
          }
          break;

        case 'ClassDeclaration':
          const classInfo = this.extractClassDetails(node);
          structure.classes.push(classInfo);
          if (classInfo.isComponent) {
            structure.components.push(classInfo);
            structure.isReact = true;
          }
          break;

        case 'ImportDeclaration':
          structure.imports.push(this.extractImportDetails(node));
          if (node.source.value === 'react') {
            structure.isReact = true;
          }
          break;

        case 'ExportNamedDeclaration':
        case 'ExportDefaultDeclaration':
          structure.exports.push(this.extractExportDetails(node));
          break;

        case 'CallExpression':
          if (node.callee?.name?.startsWith('use')) {
            structure.hooks.push(this.extractHookDetails(node));
          }
          break;

        case 'JSXElement':
          structure.isReact = true;
          break;
      }

      // Traverse children
      for (const key in node) {
        if (key === 'loc' || key === 'range') continue;
        
        if (Array.isArray(node[key])) {
          node[key].forEach(child => traverse(child, node));
        } else if (node[key] && typeof node[key] === 'object') {
          traverse(node[key], node);
        }
      }
    };

    traverse(ast.program || ast);
    return structure;
  }

  /**
   * Extract detailed function information
   */
  extractFunctionDetails(node, funcNode = null) {
    const func = funcNode || node;
    const name = node.id?.name || node.key?.name || 'anonymous';

    return {
      name,
      type: func.type,
      async: func.async || false,
      generator: func.generator || false,
      params: func.params?.map(p => this.extractParamInfo(p)) || [],
      body: func.body,
      loc: node.loc,
      hasReturn: this.hasReturnStatement(func.body),
      complexity: this.calculateComplexity(func.body),
      callsAPI: this.detectAPICallsIn(func.body)
    };
  }

  /**
   * Extract parameter information including defaults and destructuring
   */
  extractParamInfo(param) {
    if (param.type === 'Identifier') {
      return { name: param.name, hasDefault: false };
    } else if (param.type === 'AssignmentPattern') {
      return { 
        name: param.left.name, 
        hasDefault: true,
        defaultValue: this.getParamDefault(param.right)
      };
    } else if (param.type === 'RestElement') {
      return { name: `...${param.argument.name}`, rest: true };
    } else if (param.type === 'ObjectPattern') {
      return { 
        name: `{ ${param.properties.map(p => p.key?.name).join(', ')} }`,
        destructured: true
      };
    }
    return { name: 'unknown' };
  }

  getParamDefault(node) {
    if (node.type === 'Literal') return String(node.value);
    if (node.type === 'Identifier') return node.name;
    return 'complex';
  }

  /**
   * Extract class details including methods
   */
  extractClassDetails(node) {
    const methods = node.body.body
      .filter(m => m.type === 'MethodDefinition')
      .map(m => ({
        name: m.key.name,
        kind: m.kind, // constructor, method, get, set
        static: m.static,
        async: m.value.async,
        params: m.value.params.map(p => this.extractParamInfo(p))
      }));

    const superClass = node.superClass?.name || node.superClass?.property?.name;
    const isComponent = superClass === 'Component' || superClass === 'PureComponent';

    return {
      name: node.id.name,
      superClass,
      isComponent,
      methods,
      loc: node.loc
    };
  }

  /**
   * Extract import details
   */
  extractImportDetails(node) {
    return {
      source: node.source.value,
      specifiers: node.specifiers.map(s => ({
        imported: s.imported?.name || 'default',
        local: s.local.name,
        type: s.type
      }))
    };
  }

  /**
   * Extract export details
   */
  extractExportDetails(node) {
    if (node.type === 'ExportDefaultDeclaration') {
      return {
        type: 'default',
        name: node.declaration?.name || node.declaration?.id?.name || 'anonymous'
      };
    }
    return {
      type: 'named',
      specifiers: node.specifiers?.map(s => s.exported.name) || [],
      declaration: node.declaration?.id?.name
    };
  }

  /**
   * Extract variable details
   */
  extractVariableDetails(node, parent) {
    return {
      name: node.id.name,
      kind: parent?.kind || 'unknown', // const, let, var
      hasInitializer: node.init !== null,
      loc: node.loc
    };
  }

  /**
   * Extract hook usage details
   */
  extractHookDetails(node) {
    return {
      name: node.callee.name,
      arguments: node.arguments.length,
      loc: node.loc
    };
  }

  /**
   * Check if function body has return statement
   */
  hasReturnStatement(body) {
    let hasReturn = false;
    
    const check = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'ReturnStatement') {
        hasReturn = true;
        return;
      }
      for (const key in node) {
        if (hasReturn) return;
        if (Array.isArray(node[key])) {
          node[key].forEach(check);
        } else if (node[key] && typeof node[key] === 'object') {
          check(node[key]);
        }
      }
    };
    
    check(body);
    return hasReturn;
  }

  /**
   * Calculate cyclomatic complexity
   */
  calculateComplexity(body) {
    let complexity = 1;
    
    const count = (node) => {
      if (!node || typeof node !== 'object') return;
      
      if (['IfStatement', 'ConditionalExpression', 'SwitchCase',
           'ForStatement', 'ForInStatement', 'ForOfStatement',
           'WhileStatement', 'DoWhileStatement', 
           'LogicalExpression'].includes(node.type)) {
        complexity++;
      }
      
      for (const key in node) {
        if (Array.isArray(node[key])) {
          node[key].forEach(count);
        } else if (node[key] && typeof node[key] === 'object') {
          count(node[key]);
        }
      }
    };
    
    count(body);
    return complexity;
  }

  /**
   * Detect API calls in function body
   */
  detectAPICallsIn(body) {
    const apiPatterns = ['fetch', 'axios', 'http', 'request', 'get', 'post', 'put', 'delete'];
    let hasAPICall = false;
    
    const check = (node) => {
      if (!node || typeof node !== 'object') return;
      
      if (node.type === 'CallExpression') {
        const name = node.callee?.name || node.callee?.property?.name;
        if (apiPatterns.includes(name)) {
          hasAPICall = true;
          return;
        }
      }
      
      for (const key in node) {
        if (hasAPICall) return;
        if (Array.isArray(node[key])) {
          node[key].forEach(check);
        } else if (node[key] && typeof node[key] === 'object') {
          check(node[key]);
        }
      }
    };
    
    check(body);
    return hasAPICall;
  }

  /**
   * SEMANTIC DIFF: Functions
   */
  diffFunctions(oldFuncs, newFuncs) {
    const changes = [];

    // Find added functions
    newFuncs.forEach(newFunc => {
      const oldFunc = oldFuncs.find(f => f.name === newFunc.name);
      
      if (!oldFunc) {
        const asyncStr = newFunc.async ? 'async ' : '';
        const params = newFunc.params.map(p => p.name).join(', ');
        changes.push(`Added ${asyncStr}function: ${newFunc.name}(${params})`);
        
        if (newFunc.callsAPI) {
          changes.push(`  └─ Function ${newFunc.name} makes API calls`);
        }
        if (newFunc.complexity > 5) {
          changes.push(`  └─ High complexity (${newFunc.complexity})`);
        }
      } else {
        // Function exists - check what changed
        const funcChanges = this.compareFunctions(oldFunc, newFunc);
        if (funcChanges.length > 0) {
          changes.push(`Function ${newFunc.name} changed:`);
          funcChanges.forEach(c => changes.push(`  └─ ${c}`));
        }
      }
    });

    // Find removed functions
    oldFuncs.forEach(oldFunc => {
      if (!newFuncs.find(f => f.name === oldFunc.name)) {
        changes.push(`Removed function: ${oldFunc.name}`);
      }
    });

    return changes;
  }

  /**
   * Compare two versions of the same function
   */
  compareFunctions(oldFunc, newFunc) {
    const changes = [];

    // Async/sync change
    if (oldFunc.async !== newFunc.async) {
      changes.push(`Changed to ${newFunc.async ? 'async' : 'sync'}`);
    }

    // Parameter changes
    const oldParams = oldFunc.params.map(p => p.name).join(',');
    const newParams = newFunc.params.map(p => p.name).join(',');
    if (oldParams !== newParams) {
      const added = newFunc.params.filter(np => 
        !oldFunc.params.some(op => op.name === np.name)
      );
      const removed = oldFunc.params.filter(op => 
        !newFunc.params.some(np => np.name === op.name)
      );
      
      added.forEach(p => changes.push(`Added parameter: ${p.name}${p.hasDefault ? ' (with default)' : ''}`));
      removed.forEach(p => changes.push(`Removed parameter: ${p.name}`));
    }

    // Complexity change
    if (newFunc.complexity > oldFunc.complexity + 2) {
      changes.push(`Complexity increased (${oldFunc.complexity} → ${newFunc.complexity})`);
    }

    // API calls added
    if (!oldFunc.callsAPI && newFunc.callsAPI) {
      changes.push('Added API calls');
    }

    // Return statement added/removed
    if (oldFunc.hasReturn !== newFunc.hasReturn) {
      changes.push(newFunc.hasReturn ? 'Added return statement' : 'Removed return statement');
    }

    return changes;
  }

  /**
   * SEMANTIC DIFF: Classes
   */
  diffClasses(oldClasses, newClasses) {
    const changes = [];

    newClasses.forEach(newClass => {
      const oldClass = oldClasses.find(c => c.name === newClass.name);
      
      if (!oldClass) {
        const type = newClass.isComponent ? 'component class' : 'class';
        changes.push(`Added ${type}: ${newClass.name}`);
      } else {
        // Compare methods
        const methodChanges = this.compareClassMethods(oldClass, newClass);
        if (methodChanges.length > 0) {
          changes.push(`Class ${newClass.name} changed:`);
          methodChanges.forEach(c => changes.push(`  └─ ${c}`));
        }
      }
    });

    oldClasses.forEach(oldClass => {
      if (!newClasses.find(c => c.name === oldClass.name)) {
        changes.push(`Removed class: ${oldClass.name}`);
      }
    });

    return changes;
  }

  /**
   * Compare class methods
   */
  compareClassMethods(oldClass, newClass) {
    const changes = [];

    newClass.methods.forEach(newMethod => {
      const oldMethod = oldClass.methods.find(m => m.name === newMethod.name);
      if (!oldMethod) {
        changes.push(`Added method: ${newMethod.name}${newMethod.static ? ' (static)' : ''}`);
      }
    });

    oldClass.methods.forEach(oldMethod => {
      if (!newClass.methods.find(m => m.name === oldMethod.name)) {
        changes.push(`Removed method: ${oldMethod.name}`);
      }
    });

    return changes;
  }

  /**
   * SEMANTIC DIFF: Imports
   */
  diffImports(oldImports, newImports) {
    const changes = [];

    newImports.forEach(newImp => {
      const oldImp = oldImports.find(i => i.source === newImp.source);
      if (!oldImp) {
        const names = newImp.specifiers.map(s => s.local).join(', ');
        changes.push(`Added import: ${names} from '${newImp.source}'`);
      }
    });

    oldImports.forEach(oldImp => {
      if (!newImports.find(i => i.source === oldImp.source)) {
        changes.push(`Removed import from '${oldImp.source}'`);
      }
    });

    return changes;
  }

  /**
   * SEMANTIC DIFF: Exports
   */
  diffExports(oldExports, newExports) {
    const changes = [];

    const newDefaultExport = newExports.find(e => e.type === 'default');
    const oldDefaultExport = oldExports.find(e => e.type === 'default');

    if (newDefaultExport && !oldDefaultExport) {
      changes.push(`Added default export: ${newDefaultExport.name}`);
    } else if (!newDefaultExport && oldDefaultExport) {
      changes.push(`Removed default export: ${oldDefaultExport.name}`);
    }

    return changes;
  }

  /**
   * SEMANTIC DIFF: Variables
   */
  diffVariables(oldVars, newVars) {
    const changes = [];

    newVars.forEach(newVar => {
      const oldVar = oldVars.find(v => v.name === newVar.name);
      if (oldVar && oldVar.kind !== newVar.kind) {
        changes.push(`Changed ${newVar.name} from '${oldVar.kind}' to '${newVar.kind}'`);
      }
    });

    return changes;
  }

  /**
   * SEMANTIC DIFF: React Components
   */
  diffReactComponents(oldComps, newComps) {
    const changes = [];

    newComps.forEach(newComp => {
      const oldComp = oldComps.find(c => c.name === newComp.name);
      if (!oldComp) {
        changes.push(`Added component: ${newComp.name}`);
      }
    });

    return changes;
  }

  /**
   * SEMANTIC DIFF: React Hooks
   */
  diffHooks(oldHooks, newHooks) {
    const changes = [];
    const hookTypes = ['useState', 'useEffect', 'useContext', 'useReducer', 'useCallback', 'useMemo'];

    hookTypes.forEach(hookType => {
      const oldCount = oldHooks.filter(h => h.name === hookType).length;
      const newCount = newHooks.filter(h => h.name === hookType).length;

      if (newCount > oldCount) {
        changes.push(`Added ${newCount - oldCount} ${hookType} call(s)`);
      } else if (oldCount > newCount) {
        changes.push(`Removed ${oldCount - newCount} ${hookType} call(s)`);
      }
    });

    return changes;
  }
}

module.exports = { ASTParser };
// src/index.js - Updated to pass target branch to analyzer
const { getDiff } = require('./gitReader');
const { analyzeChanges } = require('./changeAnalyzer');
const { formatSummary } = require('./summaryFormatter');

async function analyzeDiff(targetBranch, options) {
  console.log(`\n🔍 Analyzing diff against ${targetBranch}...\n`);
  
  // Get diffs from git
  const diffs = await getDiff(targetBranch, options.files);
  
  if (diffs.length === 0) {
    console.log('No changes detected.');
    return;
  }
  
  console.log(`📊 Found ${diffs.length} changed file(s)\n`);
  
  // Pass target branch to analyzer for full-file AST parsing
  const analysisOptions = {
    ...options,
    targetBranch // Important: pass target branch for git.show()
  };
  
  // Analyze changes with AST + fallback
  const analysis = await analyzeChanges(diffs, analysisOptions);
  
  // Output results
  if (options.json) {
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    const summary = formatSummary(analysis, options);
    console.log(summary);
  }
  
  // Summary statistics
  const astSuccesses = analysis.filter(a => a.parseMethod === 'ast-full-file').length;
  const regexFallbacks = analysis.filter(a => a.parseMethod === 'regex-fallback').length;
  const genericFallbacks = analysis.filter(a => a.parseMethod === 'generic-fallback').length;
  
  if (astSuccesses > 0 || regexFallbacks > 0) {
    console.log('\n📈 Parser Statistics:');
    if (astSuccesses > 0) {
      console.log(`  ✓ AST Full-File: ${astSuccesses} file(s)`);
    }
    if (regexFallbacks > 0) {
      console.log(`  ⚠ Regex Fallback: ${regexFallbacks} file(s)`);
    }
    if (genericFallbacks > 0) {
      console.log(`  ⚠ Generic Fallback: ${genericFallbacks} file(s)`);
    }
  }
}

module.exports = { analyzeDiff };

// // src/index.js
// const { getDiff } = require('./gitReader');
// const { analyzeChanges } = require('./changeAnalyzer');
// const { formatSummary } = require('./summaryFormatter');

// async function analyzeDiff(targetBranch, options) {
//   console.log(`Analyzing diff against ${targetBranch}...`);
  
//   const diffs = await getDiff(targetBranch, options.files);
//   const analysis = await analyzeChanges(diffs, options);
  
//   if (options.json) {
//     console.log(JSON.stringify(analysis, null, 2));
//   } else {
//     const summary = formatSummary(analysis, options);
//     console.log(summary);
//   }
// }

// module.exports = { analyzeDiff };
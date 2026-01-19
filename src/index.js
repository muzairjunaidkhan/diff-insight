// src/index.js
const { getDiff } = require('./gitReader');
const { analyzeChanges } = require('./changeAnalyzer');
const { formatSummary } = require('./summaryFormatter');

async function analyzeDiff(targetBranch, options) {
  console.log(`Analyzing diff against ${targetBranch}...`);
  
  const diffs = await getDiff(targetBranch, options.files);
  const analysis = await analyzeChanges(diffs, options);
  
  if (options.json) {
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    const summary = formatSummary(analysis, options);
    console.log(summary);
  }
}

module.exports = { analyzeDiff };
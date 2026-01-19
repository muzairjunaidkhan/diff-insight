// src/summaryFormatter.js
const chalk = require('chalk');

function formatSummary(analysis, options) {
  let output = '\n' + chalk.bold.cyan('=== Diff Insight Summary ===\n\n');
  
  const grouped = groupByRisk(analysis);
  
  ['HIGH', 'MEDIUM', 'LOW'].forEach(risk => {
    if (grouped[risk] && grouped[risk].length > 0) {
      output += formatRiskSection(risk, grouped[risk], options);
    }
  });
  
  output += '\n' + chalk.gray(`Total files analyzed: ${analysis.length}\n`);
  
  return output;
}

function groupByRisk(analysis) {
  const grouped = { HIGH: [], MEDIUM: [], LOW: [] };
  
  analysis.forEach(item => {
    const risk = item.risk || 'LOW';
    grouped[risk].push(item);
  });
  
  return grouped;
}

function formatRiskSection(risk, items, options) {
  const color = risk === 'HIGH' ? chalk.red : risk === 'MEDIUM' ? chalk.yellow : chalk.green;
  let output = color.bold(`[${risk}]\n`);
  
  items.forEach(item => {
    output += color(`\n${item.file}`) + chalk.gray(` (${item.type})\n`);
    
    item.changes.forEach(change => {
      output += `  • ${change}\n`;
    });
    
    if (options.risk && item.insertions !== undefined) {
      output += chalk.gray(`  +${item.insertions} -${item.deletions}\n`);
    }
  });
  
  return output + '\n';
}

module.exports = { formatSummary };
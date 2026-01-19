// src/summaryFormatter.js
const chalk = require('chalk');

function formatSummary(analysis, options) {
  let output = '\n' + chalk.bold.cyan('=== Diff Insight Summary ===\n\n');
  
  // Separate files by status
  const added = analysis.filter(a => a.status === 'added');
  const deleted = analysis.filter(a => a.status === 'deleted');
  const renamed = analysis.filter(a => a.status === 'renamed');
  const modified = analysis.filter(a => a.status === 'modified');
  
  // Show file status summary
  if (added.length > 0 || deleted.length > 0 || renamed.length > 0) {
    output += chalk.bold('File Changes:\n');
    
    if (added.length > 0) {
      output += chalk.green(`  ✓ ${added.length} file(s) added\n`);
      added.forEach(file => {
        output += chalk.green(`    + ${file.file}\n`);
      });
    }
    
    if (deleted.length > 0) {
      output += chalk.red(`  ✗ ${deleted.length} file(s) deleted\n`);
      deleted.forEach(file => {
        output += chalk.red(`    - ${file.file}\n`);
      });
    }
    
    if (renamed.length > 0) {
      output += chalk.yellow(`  ➜ ${renamed.length} file(s) renamed\n`);
      renamed.forEach(file => {
        output += chalk.yellow(`    ${file.oldFile} → ${file.file}\n`);
      });
    }
    
    output += '\n';
  }
  
  // Show modified files grouped by risk
  if (modified.length > 0) {
    output += chalk.bold('Modified Files:\n\n');
    const grouped = groupByRisk(modified);
    
    ['HIGH', 'MEDIUM', 'LOW'].forEach(risk => {
      if (grouped[risk] && grouped[risk].length > 0) {
        output += formatRiskSection(risk, grouped[risk], options);
      }
    });
  }
  
  // Summary stats
  output += '\n' + chalk.bold('Summary:\n');
  output += chalk.gray(`  Total files analyzed: ${analysis.length}\n`);
  output += chalk.green(`  Added: ${added.length}\n`);
  output += chalk.red(`  Deleted: ${deleted.length}\n`);
  output += chalk.yellow(`  Renamed: ${renamed.length}\n`);
  output += chalk.blue(`  Modified: ${modified.length}\n`);
  
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
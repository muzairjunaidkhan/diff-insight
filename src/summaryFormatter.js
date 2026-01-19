// src/summaryFormatter.js - Enhanced with detailed AST insights
const chalk = require('chalk');
const { 
  suggestReviewPriority, 
  detectSecurityConcerns,
  detectBreakingChanges,
  generateRecommendations 
} = require('./utils');

function formatSummary(analysis, options) {
  let output = '\n' + chalk.bold.cyan('╔═══════════════════════════════════════════╗\n');
  output += chalk.bold.cyan('║     Diff Insight Summary (AST-Based)     ║\n');
  output += chalk.bold.cyan('╚═══════════════════════════════════════════╝\n\n');
  
  // Separate files by status
  const added = analysis.filter(a => a.status === 'added');
  const deleted = analysis.filter(a => a.status === 'deleted');
  const renamed = analysis.filter(a => a.status === 'renamed');
  const modified = analysis.filter(a => a.status === 'modified');
  
  // File changes overview
  if (added.length > 0 || deleted.length > 0 || renamed.length > 0) {
    output += chalk.bold.white('📁 File Changes:\n');
    output += chalk.gray('─'.repeat(50) + '\n');
    
    if (added.length > 0) {
      output += chalk.green(`  ✓ ${added.length} file(s) added\n`);
      added.slice(0, 5).forEach(file => {
        output += chalk.green(`    + ${file.file}`) + chalk.gray(` (${file.type})\n`);
      });
      if (added.length > 5) {
        output += chalk.gray(`    ... and ${added.length - 5} more\n`);
      }
    }
    
    if (deleted.length > 0) {
      output += chalk.red(`  ✗ ${deleted.length} file(s) deleted\n`);
      deleted.slice(0, 5).forEach(file => {
        output += chalk.red(`    - ${file.file}`) + chalk.gray(` (${file.type})\n`);
      });
      if (deleted.length > 5) {
        output += chalk.gray(`    ... and ${deleted.length - 5} more\n`);
      }
    }
    
    if (renamed.length > 0) {
      output += chalk.yellow(`  ➜ ${renamed.length} file(s) renamed\n`);
      renamed.forEach(file => {
        output += chalk.yellow(`    ${file.oldFile} → ${file.file}\n`);
      });
    }
    
    output += '\n';
  }
  
  // Modified files with detailed analysis
  if (modified.length > 0) {
    output += chalk.bold.white('📝 Modified Files (Detailed Analysis):\n');
    output += chalk.gray('─'.repeat(50) + '\n\n');
    
    // Group by priority
    const prioritized = prioritizeFiles(modified);
    
    ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].forEach(priority => {
      if (prioritized[priority] && prioritized[priority].length > 0) {
        output += formatPrioritySection(priority, prioritized[priority], options);
      }
    });
  }
  
  // Security concerns section
  const securityIssues = findSecurityIssues(analysis);
  if (securityIssues.length > 0) {
    output += '\n' + chalk.bold.red('🔒 Security Concerns:\n');
    output += chalk.gray('─'.repeat(50) + '\n');
    securityIssues.forEach(issue => {
      output += chalk.red(`  ⚠ ${issue.file}\n`);
      issue.concerns.forEach(concern => {
        output += chalk.yellow(`    • ${concern}\n`);
      });
    });
    output += '\n';
  }
  
  // Breaking changes section
  const breakingChanges = findBreakingChanges(analysis);
  if (breakingChanges.length > 0) {
    output += chalk.bold.yellow('⚡ Potential Breaking Changes:\n');
    output += chalk.gray('─'.repeat(50) + '\n');
    breakingChanges.forEach(change => {
      output += chalk.yellow(`  ${change.file}\n`);
      change.changes.forEach(c => {
        output += chalk.white(`    • ${c}\n`);
      });
    });
    output += '\n';
  }
  
  // Complexity analysis
  const highComplexity = modified.filter(m => m.complexity === 'HIGH');
  if (highComplexity.length > 0) {
    output += chalk.bold.magenta('🧩 High Complexity Changes:\n');
    output += chalk.gray('─'.repeat(50) + '\n');
    highComplexity.forEach(item => {
      output += chalk.magenta(`  ${item.file}\n`);
      output += chalk.gray(`    Complexity: ${item.complexity}, Churn: ${item.churnScore}\n`);
    });
    output += '\n';
  }
  
  // Summary statistics
  output += formatStatistics(analysis, options);
  
  // Recommendations
  if (options.risk) {
    output += formatRecommendations(analysis);
  }
  
  return output;
}

function prioritizeFiles(files) {
  const prioritized = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: []
  };
  
  files.forEach(file => {
    const priority = suggestReviewPriority(
      file.risk || 'LOW',
      (file.insertions || 0) + (file.deletions || 0),
      file.type
    );
    prioritized[priority].push(file);
  });
  
  return prioritized;
}

function formatPrioritySection(priority, items, options) {
  const icons = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    MEDIUM: '🟡',
    LOW: '🟢'
  };
  
  const colors = {
    CRITICAL: chalk.red,
    HIGH: chalk.yellow,
    MEDIUM: chalk.blue,
    LOW: chalk.green
  };
  
  const color = colors[priority];
  let output = color.bold(`${icons[priority]} ${priority} Priority\n\n`);
  
  items.forEach(item => {
    output += color(`  ${item.file}`) + chalk.gray(` (${item.type})\n`);
    
    // Show parse method if available
    if (item.parseMethod) {
      const methodBadge = item.parseMethod === 'ast' ? 
        chalk.green('[AST]') : 
        chalk.yellow(`[${item.parseMethod}]`);
      output += `  ${methodBadge}\n`;
    }
    
    // Show changes
    item.changes.forEach(change => {
      output += `    • ${change}\n`;
    });
    
    // Show metrics if risk option is enabled
    if (options.risk) {
      const metrics = [];
      if (item.insertions !== undefined) {
        metrics.push(chalk.green(`+${item.insertions}`));
      }
      if (item.deletions !== undefined) {
        metrics.push(chalk.red(`-${item.deletions}`));
      }
      if (item.complexity) {
        metrics.push(chalk.gray(`complexity: ${item.complexity}`));
      }
      if (item.churnScore) {
        metrics.push(chalk.gray(`churn: ${item.churnScore}`));
      }
      
      if (metrics.length > 0) {
        output += chalk.gray(`    ${metrics.join(' | ')}\n`);
      }
    }
    
    output += '\n';
  });
  
  return output;
}

function findSecurityIssues(analysis) {
  const issues = [];
  
  analysis.forEach(item => {
    if (item.status !== 'modified') return;
    
    const concerns = detectSecurityConcerns(item.changes);
    if (concerns.length > 0) {
      issues.push({
        file: item.file,
        concerns: concerns
      });
    }
  });
  
  return issues;
}

function findBreakingChanges(analysis) {
  const breaking = [];
  
  analysis.forEach(item => {
    if (item.status !== 'modified') return;
    
    const breakingChanges = detectBreakingChanges(item.changes);
    if (breakingChanges.length > 0) {
      breaking.push({
        file: item.file,
        changes: breakingChanges
      });
    }
  });
  
  return breaking;
}

function formatStatistics(analysis, options) {
  const stats = calculateStatistics(analysis);
  
  let output = chalk.bold.white('📊 Summary Statistics:\n');
  output += chalk.gray('─'.repeat(50) + '\n');
  
  output += chalk.white(`  Total files analyzed: ${chalk.bold(stats.total)}\n`);
  output += chalk.green(`  Added: ${stats.added}\n`);
  output += chalk.red(`  Deleted: ${stats.deleted}\n`);
  output += chalk.yellow(`  Renamed: ${stats.renamed}\n`);
  output += chalk.blue(`  Modified: ${stats.modified}\n`);
  
  if (options.risk) {
    output += '\n';
    output += chalk.white('  Risk Distribution:\n');
    output += chalk.red(`    High: ${stats.riskHigh}\n`);
    output += chalk.yellow(`    Medium: ${stats.riskMedium}\n`);
    output += chalk.green(`    Low: ${stats.riskLow}\n`);
  }
  
  output += '\n';
  output += chalk.white(`  Total lines changed: ${chalk.bold(stats.totalLines)}\n`);
  output += chalk.green(`    Insertions: +${stats.totalInsertions}\n`);
  output += chalk.red(`    Deletions: -${stats.totalDeletions}\n`);
  
  // Parse method statistics
  if (stats.astParsed > 0) {
    output += '\n';
    output += chalk.white('  Analysis Methods:\n');
    output += chalk.green(`    AST-based: ${stats.astParsed}\n`);
    output += chalk.yellow(`    Regex-based: ${stats.regexParsed}\n`);
    output += chalk.gray(`    Generic: ${stats.genericParsed}\n`);
  }
  
  return output + '\n';
}

function calculateStatistics(analysis) {
  const stats = {
    total: analysis.length,
    added: 0,
    deleted: 0,
    renamed: 0,
    modified: 0,
    riskHigh: 0,
    riskMedium: 0,
    riskLow: 0,
    totalInsertions: 0,
    totalDeletions: 0,
    totalLines: 0,
    astParsed: 0,
    regexParsed: 0,
    genericParsed: 0
  };
  
  analysis.forEach(item => {
    // Status counts
    if (item.status === 'added') stats.added++;
    else if (item.status === 'deleted') stats.deleted++;
    else if (item.status === 'renamed') stats.renamed++;
    else if (item.status === 'modified') stats.modified++;
    
    // Risk counts
    if (item.risk === 'HIGH') stats.riskHigh++;
    else if (item.risk === 'MEDIUM') stats.riskMedium++;
    else if (item.risk === 'LOW') stats.riskLow++;
    
    // Line counts
    stats.totalInsertions += item.insertions || 0;
    stats.totalDeletions += item.deletions || 0;
    stats.totalLines += (item.insertions || 0) + (item.deletions || 0);
    
    // Parse method counts
    if (item.parseMethod === 'ast') stats.astParsed++;
    else if (item.parseMethod === 'regex') stats.regexParsed++;
    else if (item.parseMethod === 'generic') stats.genericParsed++;
  });
  
  return stats;
}

function formatRecommendations(analysis) {
  let output = chalk.bold.white('💡 Recommendations:\n');
  output += chalk.gray('─'.repeat(50) + '\n');
  
  const allRecommendations = [];
  
  analysis.forEach(item => {
    if (item.status !== 'modified') return;
    
    const recommendations = generateRecommendations(
      item.file,
      item.changes,
      item.risk || 'LOW'
    );
    
    recommendations.forEach(rec => {
      rec.file = item.file;
      allRecommendations.push(rec);
    });
  });
  
  // Group by type
  const byType = {
    SECURITY: [],
    BREAKING: [],
    TESTING: [],
    DOCUMENTATION: []
  };
  
  allRecommendations.forEach(rec => {
    if (byType[rec.type]) {
      byType[rec.type].push(rec);
    }
  });
  
  // Format each type
  Object.entries(byType).forEach(([type, recs]) => {
    if (recs.length === 0) return;
    
    const icons = {
      SECURITY: '🔒',
      BREAKING: '⚡',
      TESTING: '🧪',
      DOCUMENTATION: '📚'
    };
    
    output += chalk.white(`\n  ${icons[type]} ${type}:\n`);
    
    // Deduplicate similar recommendations
    const uniqueMessages = [...new Set(recs.map(r => r.message))];
    uniqueMessages.forEach(msg => {
      const count = recs.filter(r => r.message === msg).length;
      output += chalk.gray(`    • ${msg}`);
      if (count > 1) {
        output += chalk.gray(` (${count} files)`);
      }
      output += '\n';
    });
  });
  
  return output + '\n';
}

module.exports = { formatSummary };

// // src/summaryFormatter.js
// const chalk = require('chalk');

// function formatSummary(analysis, options) {
//   let output = '\n' + chalk.bold.cyan('=== Diff Insight Summary ===\n\n');
  
//   // Separate files by status
//   const added = analysis.filter(a => a.status === 'added');
//   const deleted = analysis.filter(a => a.status === 'deleted');
//   const renamed = analysis.filter(a => a.status === 'renamed');
//   const modified = analysis.filter(a => a.status === 'modified');
  
//   // Show file status summary
//   if (added.length > 0 || deleted.length > 0 || renamed.length > 0) {
//     output += chalk.bold('File Changes:\n');
    
//     if (added.length > 0) {
//       output += chalk.green(`  ✓ ${added.length} file(s) added\n`);
//       added.forEach(file => {
//         output += chalk.green(`    + ${file.file}\n`);
//       });
//     }
    
//     if (deleted.length > 0) {
//       output += chalk.red(`  ✗ ${deleted.length} file(s) deleted\n`);
//       deleted.forEach(file => {
//         output += chalk.red(`    - ${file.file}\n`);
//       });
//     }
    
//     if (renamed.length > 0) {
//       output += chalk.yellow(`  ➜ ${renamed.length} file(s) renamed\n`);
//       renamed.forEach(file => {
//         output += chalk.yellow(`    ${file.oldFile} → ${file.file}\n`);
//       });
//     }
    
//     output += '\n';
//   }
  
//   // Show modified files grouped by risk
//   if (modified.length > 0) {
//     output += chalk.bold('Modified Files:\n\n');
//     const grouped = groupByRisk(modified);
    
//     ['HIGH', 'MEDIUM', 'LOW'].forEach(risk => {
//       if (grouped[risk] && grouped[risk].length > 0) {
//         output += formatRiskSection(risk, grouped[risk], options);
//       }
//     });
//   }
  
//   // Summary stats
//   output += '\n' + chalk.bold('Summary:\n');
//   output += chalk.gray(`  Total files analyzed: ${analysis.length}\n`);
//   output += chalk.green(`  Added: ${added.length}\n`);
//   output += chalk.red(`  Deleted: ${deleted.length}\n`);
//   output += chalk.yellow(`  Renamed: ${renamed.length}\n`);
//   output += chalk.blue(`  Modified: ${modified.length}\n`);
  
//   return output;
// }

// function groupByRisk(analysis) {
//   const grouped = { HIGH: [], MEDIUM: [], LOW: [] };
  
//   analysis.forEach(item => {
//     const risk = item.risk || 'LOW';
//     grouped[risk].push(item);
//   });
  
//   return grouped;
// }

// function formatRiskSection(risk, items, options) {
//   const color = risk === 'HIGH' ? chalk.red : risk === 'MEDIUM' ? chalk.yellow : chalk.green;
//   let output = color.bold(`[${risk}]\n`);
  
//   items.forEach(item => {
//     output += color(`\n${item.file}`) + chalk.gray(` (${item.type})\n`);
    
//     item.changes.forEach(change => {
//       output += `  • ${change}\n`;
//     });
    
//     if (options.risk && item.insertions !== undefined) {
//       output += chalk.gray(`  +${item.insertions} -${item.deletions}\n`);
//     }
//   });
  
//   return output + '\n';
// }

// module.exports = { formatSummary };
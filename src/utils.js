// src/utils.js - Enhanced with advanced risk assessment
const path = require('path');

/**
 * Advanced risk assessment based on multiple factors
 */
function assessRisk(filepath, changes) {
  let riskScore = 0;
  const filename = filepath.toLowerCase();
  const basename = path.basename(filename);
  
  // Critical file patterns (highest risk)
  const criticalPatterns = [
    /auth/i,
    /login/i,
    /password/i,
    /token/i,
    /secret/i,
    /credential/i,
    /session/i,
    /cookie/i,
    /security/i,
    /encryption/i,
    /crypto/i,
    /payment/i,
    /billing/i,
    /transaction/i,
    /database/i,
    /migration/i,
    /schema/i,
    /config/i,
    /env/i,
    /\.key$/i,
    /\.pem$/i,
    /docker/i,
    /kubernetes/i,
    /k8s/i
  ];
  
  // Core application files (medium-high risk)
  const corePatterns = [
    /api/i,
    /service/i,
    /controller/i,
    /middleware/i,
    /model/i,
    /route/i,
    /router/i,
    /handler/i,
    /validator/i,
    /permission/i,
    /role/i,
    /access/i
  ];
  
  // Check critical patterns
  if (criticalPatterns.some(pattern => pattern.test(filename))) {
    riskScore += 50;
  }
  
  // Check core patterns
  if (corePatterns.some(pattern => pattern.test(filename))) {
    riskScore += 25;
  }
  
  // Check file location risk
  if (filename.includes('/src/')) riskScore += 5;
  if (filename.includes('/lib/')) riskScore += 5;
  if (filename.includes('/core/')) riskScore += 10;
  if (filename.includes('index.')) riskScore += 5;
  
  // Analyze change patterns
  const changeText = changes.join(' ').toLowerCase();
  
  // High-risk change indicators
  const highRiskChanges = [
    { pattern: /removed.*function/i, score: 15 },
    { pattern: /removed.*class/i, score: 15 },
    { pattern: /removed.*component/i, score: 12 },
    { pattern: /deleted.*import/i, score: 10 },
    { pattern: /security|authentication|authorization/i, score: 20 },
    { pattern: /sql|query|database/i, score: 15 },
    { pattern: /api.*call/i, score: 10 },
    { pattern: /fetch|axios|http/i, score: 8 },
    { pattern: /error.*handling/i, score: 8 },
    { pattern: /validation/i, score: 10 },
    { pattern: /permission|role|access/i, score: 15 },
    { pattern: /crypto|encrypt|decrypt/i, score: 20 },
    { pattern: /token|jwt|session/i, score: 15 }
  ];
  
  highRiskChanges.forEach(({ pattern, score }) => {
    if (pattern.test(changeText)) {
      riskScore += score;
    }
  });
  
  // Medium-risk change indicators
  const mediumRiskChanges = [
    { pattern: /added.*function/i, score: 5 },
    { pattern: /added.*class/i, score: 5 },
    { pattern: /added.*component/i, score: 4 },
    { pattern: /hook/i, score: 6 },
    { pattern: /lifecycle/i, score: 7 },
    { pattern: /props.*modified/i, score: 5 },
    { pattern: /state/i, score: 6 },
    { pattern: /conditional/i, score: 4 },
    { pattern: /loop/i, score: 5 }
  ];
  
  mediumRiskChanges.forEach(({ pattern, score }) => {
    if (pattern.test(changeText)) {
      riskScore += score;
    }
  });
  
  // Number of changes factor
  if (changes.length > 10) riskScore += 10;
  else if (changes.length > 5) riskScore += 5;
  
  // Determine final risk level
  if (riskScore >= 50) return 'HIGH';
  if (riskScore >= 25) return 'MEDIUM';
  return 'LOW';
}

/**
 * Calculate impact score for prioritization
 */
function calculateImpactScore(filepath, changes, insertions, deletions) {
  let impact = 0;
  
  // File type impact
  const ext = path.extname(filepath);
  const highImpactTypes = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java'];
  const mediumImpactTypes = ['.css', '.scss', '.html'];
  
  if (highImpactTypes.includes(ext)) impact += 10;
  else if (mediumImpactTypes.includes(ext)) impact += 5;
  
  // Change volume impact
  const totalLines = insertions + deletions;
  if (totalLines > 100) impact += 15;
  else if (totalLines > 50) impact += 10;
  else if (totalLines > 20) impact += 5;
  
  // Structural changes impact
  const structuralKeywords = [
    'Added function', 'Removed function',
    'Added class', 'Removed class',
    'Added component', 'Removed component'
  ];
  
  const structuralChanges = changes.filter(c => 
    structuralKeywords.some(kw => c.includes(kw))
  ).length;
  
  impact += structuralChanges * 5;
  
  return impact;
}

/**
 * Suggest review priority based on risk and impact
 */
function suggestReviewPriority(risk, impactScore, fileType) {
  const criticalTypes = ['javascript', 'typescript', 'react'];
  
  if (risk === 'HIGH') return 'CRITICAL';
  if (risk === 'MEDIUM' && impactScore > 20) return 'HIGH';
  if (risk === 'MEDIUM' || impactScore > 15) return 'MEDIUM';
  if (criticalTypes.includes(fileType)) return 'MEDIUM';
  return 'LOW';
}

/**
 * Detect security-sensitive changes
 */
function detectSecurityConcerns(changes) {
  const concerns = [];
  const changeText = changes.join(' ').toLowerCase();
  
  const securityPatterns = [
    { 
      pattern: /password|secret|token|key/i, 
      concern: 'Credential handling modified' 
    },
    { 
      pattern: /auth|login|session/i, 
      concern: 'Authentication logic changed' 
    },
    { 
      pattern: /permission|role|access|authorize/i, 
      concern: 'Authorization logic changed' 
    },
    { 
      pattern: /sql|query|database/i, 
      concern: 'Database query modified' 
    },
    { 
      pattern: /eval|exec|system/i, 
      concern: 'Potentially dangerous function used' 
    },
    { 
      pattern: /cors|csrf|xss/i, 
      concern: 'Security header configuration changed' 
    },
    {
      pattern: /crypto|encrypt|decrypt|hash/i,
      concern: 'Cryptographic operation modified'
    }
  ];
  
  securityPatterns.forEach(({ pattern, concern }) => {
    if (pattern.test(changeText)) {
      concerns.push(concern);
    }
  });
  
  return concerns;
}

/**
 * Detect potential breaking changes
 */
function detectBreakingChanges(changes) {
  const breakingPatterns = [
    'Removed function',
    'Removed class',
    'Removed component',
    'Removed export',
    'Modified function signature',
    'Removed prop',
    'Changed.*from.*to' // Type changes
  ];
  
  return changes.filter(change => 
    breakingPatterns.some(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(change);
    })
  );
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(filepath, changes, risk) {
  const recommendations = [];
  const filename = filepath.toLowerCase();
  
  // Security recommendations
  const securityConcerns = detectSecurityConcerns(changes);
  if (securityConcerns.length > 0) {
    recommendations.push({
      type: 'SECURITY',
      message: 'Security review required',
      details: securityConcerns
    });
  }
  
  // Breaking change recommendations
  const breakingChanges = detectBreakingChanges(changes);
  if (breakingChanges.length > 0) {
    recommendations.push({
      type: 'BREAKING',
      message: 'Potential breaking changes detected',
      details: breakingChanges
    });
  }
  
  // Test coverage recommendations
  const hasTests = filename.includes('test') || filename.includes('spec');
  if (!hasTests && (risk === 'HIGH' || risk === 'MEDIUM')) {
    recommendations.push({
      type: 'TESTING',
      message: 'Consider adding tests for these changes'
    });
  }
  
  // Documentation recommendations
  const hasNewExports = changes.some(c => c.includes('Added function') || c.includes('Added class'));
  if (hasNewExports) {
    recommendations.push({
      type: 'DOCUMENTATION',
      message: 'Update documentation for new exports'
    });
  }
  
  return recommendations;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Calculate code quality metrics
 */
function calculateQualityMetrics(changes) {
  const metrics = {
    maintainability: 'GOOD',
    testability: 'GOOD',
    readability: 'GOOD'
  };
  
  const changeText = changes.join(' ').toLowerCase();
  
  // Check maintainability
  if (changeText.includes('removed error handling')) {
    metrics.maintainability = 'POOR';
  } else if (changes.length > 15) {
    metrics.maintainability = 'FAIR';
  }
  
  // Check testability
  if (changeText.includes('added conditional') && 
      changeText.includes('added loop')) {
    metrics.testability = 'FAIR';
  }
  
  // Check readability
  const complexityIndicators = ['nested', 'callback', 'promise chain'];
  if (complexityIndicators.some(ind => changeText.includes(ind))) {
    metrics.readability = 'FAIR';
  }
  
  return metrics;
}

module.exports = {
  assessRisk,
  calculateImpactScore,
  suggestReviewPriority,
  detectSecurityConcerns,
  detectBreakingChanges,
  generateRecommendations,
  formatFileSize,
  calculateQualityMetrics
};

// // src/utils.js
// function assessRisk(filepath, changes) {
//   const criticalFiles = ['auth', 'login', 'password', 'token', 'api', 'database', 'config'];
//   const filename = filepath.toLowerCase();
  
//   if (criticalFiles.some(word => filename.includes(word))) {
//     return 'HIGH';
//   }
  
//   if (changes.some(c => c.includes('Removed') || c.includes('security') || c.includes('authentication'))) {
//     return 'HIGH';
//   }
  
//   if (changes.length > 5 || changes.some(c => c.includes('Added import') || c.includes('hook'))) {
//     return 'MEDIUM';
//   }
  
//   return 'LOW';
// }

// module.exports = { assessRisk };
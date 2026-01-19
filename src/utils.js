// src/utils.js
function assessRisk(filepath, changes) {
  const criticalFiles = ['auth', 'login', 'password', 'token', 'api', 'database', 'config'];
  const filename = filepath.toLowerCase();
  
  if (criticalFiles.some(word => filename.includes(word))) {
    return 'HIGH';
  }
  
  if (changes.some(c => c.includes('Removed') || c.includes('security') || c.includes('authentication'))) {
    return 'HIGH';
  }
  
  if (changes.length > 5 || changes.some(c => c.includes('Added import') || c.includes('hook'))) {
    return 'MEDIUM';
  }
  
  return 'LOW';
}

module.exports = { assessRisk };
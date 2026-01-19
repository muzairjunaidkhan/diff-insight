// src/gitReader.js
const simpleGit = require('simple-git');
const path = require('path');

async function getDiff(targetBranch, filePattern) {
  const git = simpleGit();
  
  const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
  const diffSummary = await git.diffSummary([targetBranch]);
  
  const diffs = [];
  
  for (const file of diffSummary.files) {
    if (filePattern && !matchesPattern(file.file, filePattern)) {
      continue;
    }
    
    // Determine file status
    let status = 'modified';
    let oldPath = file.file;
    let newPath = file.file;
    
    // Check for new files (all additions, no deletions)
    if (file.insertions > 0 && file.deletions === 0) {
      try {
        await git.show([`${targetBranch}:${file.file}`]);
      } catch (e) {
        status = 'added';
      }
    }
    
    // Check for deleted files (all deletions, no additions)
    if (file.deletions > 0 && file.insertions === 0) {
      try {
        await git.show([`HEAD:${file.file}`]);
      } catch (e) {
        status = 'deleted';
      }
    }
    
    // Check for renames using git status
    const statusResult = await git.status();
    const renamedFile = statusResult.renamed.find(r => 
      r.to === file.file || r.from === file.file
    );
    
    if (renamedFile) {
      status = 'renamed';
      oldPath = renamedFile.from;
      newPath = renamedFile.to;
    }
    
    const diff = await git.diff([targetBranch, '--', file.file]);
    
    diffs.push({
      path: file.file,
      oldPath: oldPath,
      newPath: newPath,
      status: status,
      extension: path.extname(file.file),
      diff: diff,
      insertions: file.insertions,
      deletions: file.deletions,
      binary: file.binary
    });
  }
  
  return diffs;
}

function matchesPattern(filename, pattern) {
  const patterns = pattern.split(',').map(p => p.trim());
  return patterns.some(p => {
    const regex = new RegExp(p.replace(/\*/g, '.*').replace(/\./g, '\\.'));
    return regex.test(filename);
  });
}

module.exports = { getDiff };
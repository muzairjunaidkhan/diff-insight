// src/gitReader.js
const simpleGit = require('simple-git');
const path = require('path');

async function getDiff(targetBranch, filePattern) {
    const git = simpleGit();

    // currentBranch is not used current branch is user default/current branch
    //   const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
    const diffSummary = await git.diffSummary([targetBranch]);

    //   console.log(`Diffing from ${currentBranch} to ${targetBranch}`);

    const diffs = [];

    for (const file of diffSummary.files) {
        if (filePattern && !matchesPattern(file.file, filePattern)) {
            continue;
        }

        // const diff = await git.diff([`${currentBranch}..${targetBranch}`, '--', file.file]);
        const diff = await git.diff([targetBranch, '--', file.file]);

        diffs.push({
            path: file.file,
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
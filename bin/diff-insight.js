#!/usr/bin/env node

const { program } = require('commander');
const { analyzeDiff } = require('../src/index');

program
.name('diff-insight')
.description('Analyze git diffs for meaningful changes across multiple languages')
.argument('<target-branch>', 'Target branch to compare against')
.option('-s, --summary', 'Output human-readable summary (default)', true)
.option('-r, --risk', 'Include risk scoring')
.option('-f, --files <pattern>', 'Restrict to specific file types (e.g., "*.js,*.jsx")')
.option('-j, --json', 'Output as JSON')
.action(async (targetBranch, options) => {
    try {
        await analyzeDiff(targetBranch, options);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
});

program.parse();

// bin/diff-insight.js
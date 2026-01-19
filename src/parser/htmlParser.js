// src/parser/htmlParser.js
const { parse } = require('node-html-parser');

function parseHTML(diff, filepath) {
//   const changes = [];
//   const lines = diff.split('\n');
  
//   let addedLines = [];
//   let removedLines = [];
  
//   for (const line of lines) {
//     if (line.startsWith('+') && !line.startsWith('+++')) {
//       addedLines.push(line.substring(1));
//     } else if (line.startsWith('-') && !line.startsWith('---')) {
//       removedLines.push(line.substring(1));
//     }
//   }
  
//   // Detect tag changes
//   const addedTags = extractTags(addedLines.join('\n'));
//   const removedTags = extractTags(removedLines.join('\n'));
  
//   addedTags.forEach(tag => {
//     if (!removedTags.includes(tag)) {
//       changes.push(`Added element: <${tag}>`);
//     }
//   });
  
//   removedTags.forEach(tag => {
//     if (!addedTags.includes(tag)) {
//       changes.push(`Removed element: <${tag}>`);
//     }
//   });
  
//   // Detect class/ID changes
//   const addedClasses = extractClasses(addedLines.join('\n'));
//   const removedClasses = extractClasses(removedLines.join('\n'));
  
//   addedClasses.forEach(cls => {
//     if (!removedClasses.includes(cls)) {
//       changes.push(`Added class: .${cls}`);
//     }
//   });
  
//   const addedIds = extractIds(addedLines.join('\n'));
//   addedIds.forEach(id => {
//     changes.push(`Added ID: #${id}`);
//   });
  
//   return changes.length > 0 ? changes : ['HTML structure modified'];
}

function extractTags(html) {
  const tags = [];
  const tagRegex = /<(\w+)/g;
  let match;
  
  while ((match = tagRegex.exec(html)) !== null) {
    tags.push(match[1]);
  }
  
  return tags;
}

function extractClasses(html) {
  const classes = [];
  const classRegex = /class=["']([^"']+)["']/g;
  let match;
  
  while ((match = classRegex.exec(html)) !== null) {
    classes.push(...match[1].split(' '));
  }
  
  return classes;
}

function extractIds(html) {
  const ids = [];
  const idRegex = /id=["']([^"']+)["']/g;
  let match;
  
  while ((match = idRegex.exec(html)) !== null) {
    ids.push(match[1]);
  }
  
  return ids;
}

module.exports = { parseHTML };
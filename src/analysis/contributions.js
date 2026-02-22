const { listProjectDirs, listSessionFiles } = require('../data/reader.js');
const { parseSessionFile, extractWriteEditCalls } = require('../data/session-parser.js');
const { execSync } = require('child_process');

async function getContributions() {
  const projectDirs = await listProjectDirs();
  let totalLinesWritten = 0;
  let totalLinesEdited = 0;
  const fileCounts = {};
  let coAuthoredCommits = 0;

  for (const dir of projectDirs) {
    const sessionFiles = await listSessionFiles(dir.path);

    for (const file of sessionFiles) {
      try {
        const session = await parseSessionFile(file);
        const { writes, edits } = extractWriteEditCalls(session);

        for (const w of writes) {
          if (w.content) {
            const lines = w.content.split('\n').length;
            totalLinesWritten += lines;
          }
          if (w.filePath) {
            fileCounts[w.filePath] = (fileCounts[w.filePath] || 0) + 1;
          }
        }

        for (const e of edits) {
          if (e.newString) {
            const newLines = e.newString.split('\n').length;
            const oldLines = (e.oldString || '').split('\n').length;
            totalLinesEdited += Math.abs(newLines - oldLines) + Math.min(newLines, oldLines);
          }
          if (e.filePath) {
            fileCounts[e.filePath] = (fileCounts[e.filePath] || 0) + 1;
          }
        }
      } catch {
        // Skip unreadable sessions
      }
    }

    // Try git log for co-authored commits
    try {
      const projectPath = dir.projectPath;
      const result = execSync(
        'git log --all --format="%B" 2>/dev/null | grep -c "Co-Authored-By.*Claude\\|Co-Authored-By.*claude\\|Co-authored-by.*Claude\\|Co-authored-by.*claude"',
        { cwd: projectPath, encoding: 'utf-8', timeout: 5000 }
      ).trim();
      coAuthoredCommits += parseInt(result, 10) || 0;
    } catch {
      // Not a git repo or no matches
    }
  }

  // Build top files list
  const topFiles = Object.entries(fileCounts)
    .map(([file, changes]) => ({ file, changes }))
    .sort((a, b) => b.changes - a.changes);

  return {
    totalLinesWritten,
    totalLinesEdited,
    totalFilesTouched: Object.keys(fileCounts).length,
    coAuthoredCommits,
    topFiles
  };
}

module.exports = { getContributions };

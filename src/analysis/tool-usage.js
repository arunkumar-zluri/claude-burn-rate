const { listProjectDirs, listSessionFiles } = require('../data/reader.js');
const { parseSessionFile } = require('../data/session-parser.js');

async function getToolUsage(filters) {
  const projectDirs = await listProjectDirs();
  const toolCounts = {};
  let totalToolCalls = 0;
  let sessionCount = 0;
  let readCount = 0;
  let writeCount = 0;

  const readTools = new Set(['Read', 'read', 'Grep', 'grep', 'Glob', 'glob', 'LS', 'ls']);
  const writeTools = new Set(['Write', 'write', 'Edit', 'edit', 'NotebookEdit']);

  for (const dir of projectDirs) {
    const sessionFiles = await listSessionFiles(dir.path);

    for (const file of sessionFiles) {
      try {
        const session = await parseSessionFile(file);

        // Apply basic filters if provided
        if (filters) {
          if (filters.project && session.projectPath !== filters.project) continue;
          if (filters.from) {
            const sessionDate = session.firstTimestamp
              ? new Date(session.firstTimestamp).toISOString().split('T')[0]
              : null;
            if (sessionDate && sessionDate < filters.from) continue;
          }
          if (filters.to) {
            const sessionDate = session.firstTimestamp
              ? new Date(session.firstTimestamp).toISOString().split('T')[0]
              : null;
            if (sessionDate && sessionDate > filters.to) continue;
          }
        }

        sessionCount++;

        for (const msg of session.assistantMessages) {
          for (const tool of msg.toolCalls) {
            const name = tool.name;
            toolCounts[name] = (toolCounts[name] || 0) + 1;
            totalToolCalls++;

            if (readTools.has(name)) readCount++;
            if (writeTools.has(name)) writeCount++;
          }
        }
      } catch {
        // Skip unreadable sessions
      }
    }
  }

  // Sort by count, take top tools
  const topTools = Object.entries(toolCounts)
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalToolCalls > 0 ? Math.round(count / totalToolCalls * 1000) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count);

  const readWriteRatio = writeCount > 0
    ? Math.round(readCount / writeCount * 10) / 10
    : readCount > 0 ? Infinity : 0;

  return {
    toolCounts,
    topTools,
    totalToolCalls,
    sessionCount,
    avgToolsPerSession: sessionCount > 0 ? Math.round(totalToolCalls / sessionCount * 10) / 10 : 0,
    readWriteRatio,
    readCount,
    writeCount,
    helpText: 'This shows which Claude Code tools are used most. Read/Grep/Glob are exploration tools — high usage means Claude is spending time understanding your code. Write/Edit are modification tools — higher usage means more direct code production. Bash runs commands (tests, builds, git). A healthy ratio is roughly 3:1 read-to-write, showing Claude reads enough context before making changes. Low tool usage overall may mean Claude isn\'t being given permission to act — enable tool permissions for better results.'
  };
}

module.exports = { getToolUsage };

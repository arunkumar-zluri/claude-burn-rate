const { listProjectDirs, listSessionFiles } = require('../data/reader.js');
const { parseSessionFile } = require('../data/session-parser.js');
const { formatCost, formatTokens } = require('../cost/pricing.js');

async function getAdvancedInsights(overview, sessions, contributions) {
  const insights = [];

  roiMetrics(insights, overview, contributions);

  const [contextInsight, wasteInsight] = await Promise.all([
    contextWindowAnalysis(),
    wastedSpendDetection()
  ]);

  if (contextInsight) insights.push(contextInsight);
  if (wasteInsight) insights.push(wasteInsight);

  return insights;
}

function roiMetrics(insights, overview, contributions) {
  if (!contributions || !overview || overview.empty) return;
  if (!overview.totalCost || overview.totalCost <= 0) return;

  const totalLines = (contributions.totalLinesWritten || 0) + (contributions.totalLinesEdited || 0);
  if (totalLines <= 0) return;

  const linesPerDollar = totalLines / overview.totalCost;
  const commitsPerDollar = (contributions.coAuthoredCommits || 0) / overview.totalCost;
  const filesPerSession = overview.totalSessions > 0
    ? (contributions.totalFilesTouched || 0) / overview.totalSessions
    : 0;

  // Productivity index (0-100): weighted score
  // Normalize each metric to a 0-100 scale based on reasonable benchmarks
  const linesScore = Math.min(100, (linesPerDollar / 500) * 100); // 500 lines/$ = perfect
  const commitsScore = Math.min(100, (commitsPerDollar / 2) * 100); // 2 commits/$ = perfect
  const filesScore = Math.min(100, (filesPerSession / 10) * 100); // 10 files/session = perfect

  const productivityIndex = Math.round(linesScore * 0.5 + commitsScore * 0.3 + filesScore * 0.2);

  const indexLabel = productivityIndex >= 70 ? 'High' : productivityIndex >= 40 ? 'Medium' : 'Low';

  insights.push({
    severity: productivityIndex < 40 ? 'warning' : 'info',
    title: `ROI Score: ${productivityIndex}/100 (${indexLabel}) — ${Math.round(linesPerDollar)} lines per dollar`,
    description: `${totalLines.toLocaleString()} total lines written/edited for ${formatCost(overview.totalCost)}. ${(contributions.coAuthoredCommits || 0).toLocaleString()} co-authored commits. ${(contributions.totalFilesTouched || 0).toLocaleString()} files touched across ${overview.totalSessions} sessions.`,
    detail: `Lines per dollar: ${Math.round(linesPerDollar)}\nCommits per dollar: ${commitsPerDollar.toFixed(2)}\nFiles per session: ${filesPerSession.toFixed(1)}\n\nProductivity Index Breakdown:\n  Lines score: ${Math.round(linesScore)}/100 (weight: 50%)\n  Commits score: ${Math.round(commitsScore)}/100 (weight: 30%)\n  Files score: ${Math.round(filesScore)}/100 (weight: 20%)\n  Total: ${productivityIndex}/100`,
    helpText: 'This measures tangible output per dollar spent. Lines per dollar = total lines written and edited / total cost. To improve ROI: use Claude for substantive coding tasks rather than exploration, provide clear requirements upfront, use Sonnet for simple edits, and ensure Claude can use tools (Edit, Write, Bash) for hands-on work rather than just explaining.'
  });
}

async function contextWindowAnalysis() {
  try {
    const projectDirs = await listProjectDirs();
    let totalSessions = 0;
    let nearLimitSessions = 0;
    let criticalSessions = 0;
    let compactionEvents = 0;
    let peakContextTotal = 0;
    let peakContextCount = 0;
    let totalGrowthRates = 0;
    let growthRateCount = 0;

    for (const dir of projectDirs) {
      const sessionFiles = await listSessionFiles(dir.path);

      for (const file of sessionFiles) {
        try {
          const session = await parseSessionFile(file);
          if (!session.assistantMessages || session.assistantMessages.length < 2) continue;

          totalSessions++;
          let prevContext = 0;
          let peakContext = 0;
          let turnCount = 0;

          for (const msg of session.assistantMessages) {
            if (!msg.usage) continue;
            const contextSize =
              (msg.usage.cacheReadInputTokens || 0) +
              (msg.usage.cacheCreationInputTokens || 0) +
              (msg.usage.inputTokens || 0);

            if (contextSize > peakContext) peakContext = contextSize;

            // Detect compaction: context dropping >30% between consecutive turns
            if (prevContext > 0 && contextSize < prevContext * 0.7) {
              compactionEvents++;
            }

            // Growth rate
            if (prevContext > 0 && contextSize > prevContext) {
              totalGrowthRates += (contextSize - prevContext);
              growthRateCount++;
            }

            prevContext = contextSize;
            turnCount++;
          }

          if (peakContext > 0) {
            peakContextTotal += peakContext;
            peakContextCount++;
          }

          if (peakContext > 150000) nearLimitSessions++;
          if (peakContext > 180000) criticalSessions++;
        } catch {
          // Skip unreadable sessions
        }
      }
    }

    if (totalSessions < 2) return null;

    const avgPeak = peakContextCount > 0 ? Math.round(peakContextTotal / peakContextCount) : 0;
    const avgGrowth = growthRateCount > 0 ? Math.round(totalGrowthRates / growthRateCount) : 0;

    const severity = criticalSessions > 0 ? 'warning' : nearLimitSessions > 0 ? 'warning' : 'info';

    return {
      severity,
      title: `Context window: ${nearLimitSessions} session${nearLimitSessions !== 1 ? 's' : ''} near limit, avg peak ${formatTokens(avgPeak)}`,
      description: `Out of ${totalSessions} sessions analyzed, ${nearLimitSessions} exceeded 150K tokens (75% of 200K limit) and ${criticalSessions} exceeded 180K (90%). ${compactionEvents} compaction events detected. Avg context growth: ${formatTokens(avgGrowth)}/turn.`,
      detail: `Sessions analyzed: ${totalSessions}\nNear limit (>150K tokens): ${nearLimitSessions}\nCritical (>180K tokens): ${criticalSessions}\nCompaction events detected: ${compactionEvents}\nAverage peak context: ${formatTokens(avgPeak)}\nAverage growth per turn: ${formatTokens(avgGrowth)}`,
      helpText: 'The context window is the total text Claude can \'see\' at once (~200K tokens). Every message includes the full conversation history, so context grows each turn. When approaching the limit, Claude loses access to early context or the session errors. Best practices: (1) Use /compact to compress context when sessions get long, (2) Start new sessions when switching topics, (3) Keep CLAUDE.md files lean — every word adds to every message\'s context, (4) Avoid pasting entire files when you can reference them by path, (5) Use /clear to reset context if the conversation has drifted. Sessions exceeding 150K tokens cost significantly more per message due to cache write costs.'
    };
  } catch {
    return null;
  }
}

async function wastedSpendDetection() {
  try {
    const projectDirs = await listProjectDirs();
    let flaggedSessions = 0;
    let totalRetryFiles = 0;
    let totalRepeatedCommands = 0;
    let estimatedWastedCost = 0;
    let totalSessionsChecked = 0;
    const examples = [];

    for (const dir of projectDirs) {
      const sessionFiles = await listSessionFiles(dir.path);

      for (const file of sessionFiles) {
        try {
          const session = await parseSessionFile(file);
          if (!session.assistantMessages || session.assistantMessages.length < 3) continue;

          totalSessionsChecked++;

          // Track Write/Edit calls grouped by file_path
          const fileEdits = {};
          // Track Bash commands
          const bashCommands = {};
          let sessionCost = 0;

          for (const msg of session.assistantMessages) {
            // Estimate cost contribution
            if (msg.usage) {
              sessionCost += (msg.usage.outputTokens || 0) / 1e6 * 75; // rough Opus output cost
            }

            for (const tool of msg.toolCalls) {
              if (tool.name === 'Write' || tool.name === 'write' || tool.name === 'Edit' || tool.name === 'edit') {
                const filePath = tool.input.file_path || tool.input.path || 'unknown';
                fileEdits[filePath] = (fileEdits[filePath] || 0) + 1;
              }
              if (tool.name === 'Bash' || tool.name === 'bash') {
                const cmd = tool.input.command || '';
                if (cmd) {
                  bashCommands[cmd] = (bashCommands[cmd] || 0) + 1;
                }
              }
            }
          }

          // Flag: file edited 3+ times
          let sessionFlagged = false;
          for (const [filePath, count] of Object.entries(fileEdits)) {
            if (count >= 3) {
              totalRetryFiles++;
              sessionFlagged = true;
              if (examples.length < 3) {
                examples.push(`${filePath} edited ${count} times`);
              }
            }
          }

          // Flag: repeated bash commands (same command 2+ times)
          for (const [cmd, count] of Object.entries(bashCommands)) {
            if (count >= 2) {
              totalRepeatedCommands++;
              sessionFlagged = true;
            }
          }

          if (sessionFlagged) {
            flaggedSessions++;
            // Estimate ~30% of session cost was wasted on retries
            estimatedWastedCost += sessionCost * 0.3;
          }
        } catch {
          // Skip unreadable sessions
        }
      }
    }

    if (totalSessionsChecked < 3) return null;
    if (flaggedSessions === 0) return null;

    return {
      severity: flaggedSessions >= 3 ? 'warning' : 'info',
      title: `${flaggedSessions} session${flaggedSessions !== 1 ? 's' : ''} had retry patterns — est. ${formatCost(estimatedWastedCost)} wasted`,
      description: `${totalRetryFiles} file${totalRetryFiles !== 1 ? 's were' : ' was'} edited 3+ times and ${totalRepeatedCommands} bash command${totalRepeatedCommands !== 1 ? 's were' : ' was'} repeated in sessions that showed struggle patterns.`,
      detail: `Sessions with retries: ${flaggedSessions} of ${totalSessionsChecked}\nFiles edited 3+ times: ${totalRetryFiles}\nRepeated bash commands: ${totalRepeatedCommands}\nEstimated wasted cost: ${formatCost(estimatedWastedCost)}${examples.length > 0 ? '\n\nExamples:\n' + examples.map(e => '  • ' + e).join('\n') : ''}`,
      helpText: 'This detects sessions where Claude struggled — editing the same file 3+ times or running the same command repeatedly. Retries mean the full conversation context (often 100K+ tokens) is resent each time. To reduce retries: (1) Provide specific error messages when something fails, (2) Break complex tasks into smaller steps, (3) Give Claude test commands to verify before proceeding, (4) Intervene manually when you see Claude looping — a quick hint can save several expensive retry rounds, (5) Use /clear and restate the problem if Claude is stuck in a loop.'
    };
  } catch {
    return null;
  }
}

module.exports = { getAdvancedInsights };

const { listProjectDirs, listSessionFiles } = require('../data/reader.js');
const { parseSessionFile, pairMessages } = require('../data/session-parser.js');
const { calculateCost, getPricing } = require('../cost/pricing.js');

let cachedExpensive = null;

async function getExpensivePrompts(filters) {
  if (!cachedExpensive) {
    cachedExpensive = await buildExpensivePrompts();
  }

  let results = cachedExpensive;

  if (filters) {
    if (filters.from) results = results.filter(p => p.date >= filters.from);
    if (filters.to) results = results.filter(p => p.date <= filters.to);
    if (filters.project) results = results.filter(p => p.project === filters.project);
  }

  return results;
}

async function buildExpensivePrompts() {
  const projectDirs = await listProjectDirs();
  const allPrompts = [];

  for (const dir of projectDirs) {
    const sessionFiles = await listSessionFiles(dir.path);

    for (const file of sessionFiles) {
      try {
        const session = await parseSessionFile(file);
        const pairs = pairMessages(session);

        for (const pair of pairs) {
          // Sum all assistant response costs for this turn
          let totalCost = 0;
          let totalTokens = 0;
          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          let totalCacheRead = 0;
          let totalCacheWrite = 0;
          let model = null;
          const toolsUsed = [];

          for (const resp of pair.responses) {
            if (!resp.usage || !resp.model) continue;
            model = resp.model;
            const cost = calculateCost(resp.usage, resp.model);
            totalCost += cost.totalCost;
            totalInputTokens += resp.usage.inputTokens;
            totalOutputTokens += resp.usage.outputTokens;
            totalCacheRead += resp.usage.cacheReadInputTokens;
            totalCacheWrite += resp.usage.cacheCreationInputTokens;
            totalTokens += resp.usage.inputTokens + resp.usage.outputTokens +
              resp.usage.cacheReadInputTokens + resp.usage.cacheCreationInputTokens;

            for (const tc of resp.toolCalls) {
              if (!toolsUsed.includes(tc.name)) toolsUsed.push(tc.name);
            }
          }

          if (totalCost <= 0) continue;

          // Determine why it was expensive
          const reasons = [];
          if (totalCacheWrite > 50000) {
            reasons.push(`Large cache creation (${fmtTokens(totalCacheWrite)} tokens) — first message in session or context changed`);
          }
          if (totalCacheRead > 200000) {
            reasons.push(`Large context window (${fmtTokens(totalCacheRead)} cached tokens read)`);
          }
          if (totalOutputTokens > 5000) {
            reasons.push(`Long response (${fmtTokens(totalOutputTokens)} output tokens at ${model && model.includes('opus') ? '$75' : '$15'}/M)`);
          }
          if (model && model.includes('opus') && totalOutputTokens < 200 && totalCacheWrite > 10000) {
            reasons.push('Opus used for a short response with heavy cache creation — Sonnet would be cheaper');
          }
          if (pair.turnIndex > 15) {
            reasons.push(`Late in conversation (turn ${pair.turnIndex + 1}) — accumulated context increases cost`);
          }
          if (reasons.length === 0) {
            if (model && model.includes('opus')) {
              reasons.push('Opus model with standard token usage');
            } else {
              reasons.push('Standard token usage');
            }
          }

          const date = pair.prompt.timestamp ? pair.prompt.timestamp.split('T')[0] : null;

          allPrompts.push({
            prompt: truncate(pair.prompt.promptText || '(no text)', 200),
            fullPrompt: pair.prompt.promptText || '(no text)',
            date,
            timestamp: pair.prompt.timestamp,
            sessionId: session.sessionId,
            project: session.projectPath,
            model,
            cost: totalCost,
            totalTokens,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cacheReadTokens: totalCacheRead,
            cacheWriteTokens: totalCacheWrite,
            turnIndex: pair.turnIndex,
            toolsUsed,
            reasons
          });
        }
      } catch {
        // Skip unreadable sessions
      }
    }
  }

  // Sort by cost descending and return top 50
  allPrompts.sort((a, b) => b.cost - a.cost);
  return allPrompts.slice(0, 50);
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '...' : s;
}

function fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

module.exports = { getExpensivePrompts };

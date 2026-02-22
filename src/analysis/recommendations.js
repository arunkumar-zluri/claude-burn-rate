function getRecommendations(overview, sessions) {
  const recs = [];

  if (!overview || overview.empty) return recs;

  // Rule 1: High cache write ratio
  const tc = overview.tokenComposition;
  if (tc && tc.total > 0) {
    const cacheWriteRatio = tc.cacheWrite / tc.total;
    if (cacheWriteRatio > 0.15) {
      recs.push({
        severity: 'medium',
        title: 'High Cache Creation Overhead',
        description: `${(cacheWriteRatio * 100).toFixed(1)}% of your tokens are cache creation tokens. This suggests many short sessions or frequent context resets.`,
        fix: 'Try longer sessions instead of many short ones. Cache write tokens cost more than cache read tokens.',
        estimatedSavings: null
      });
    }
  }

  // Rule 2: Low cache hit rate
  if (tc && tc.cacheRead > 0 && tc.cacheWrite > 0) {
    const cacheHitRatio = tc.cacheRead / (tc.cacheRead + tc.cacheWrite);
    if (cacheHitRatio < 0.5) {
      recs.push({
        severity: 'high',
        title: 'Low Cache Hit Rate',
        description: `Your cache hit rate is ${(cacheHitRatio * 100).toFixed(1)}%. More than half your cache tokens are being written rather than read.`,
        fix: 'Keep sessions open longer and use /continue to resume existing sessions instead of starting new ones.',
        estimatedSavings: null
      });
    }
  }

  // Rule 3: Mostly Opus usage — suggest Sonnet for simple tasks
  if (overview.modelBreakdown) {
    const opusModels = overview.modelBreakdown.filter(m => m.modelId.includes('opus'));
    const totalCost = overview.totalCost;
    const opusCost = opusModels.reduce((sum, m) => sum + m.totalCost, 0);
    if (totalCost > 0 && opusCost / totalCost > 0.9) {
      const sonnetSavings = opusCost * 0.8; // Sonnet is ~5x cheaper
      recs.push({
        severity: 'medium',
        title: 'Consider Using Sonnet for Simple Tasks',
        description: `${(opusCost / totalCost * 100).toFixed(0)}% of your spend is on Opus models. Sonnet is 5x cheaper and handles many tasks well.`,
        fix: 'Use "claude --model sonnet" or set CLAUDE_MODEL=sonnet for straightforward tasks like code formatting, simple refactors, or documentation.',
        estimatedSavings: `Up to $${sonnetSavings.toFixed(2)} if 80% of tasks used Sonnet`
      });
    }
  }

  // Rule 4: High daily variance
  if (overview.dailyActivity && overview.dailyActivity.length > 7) {
    const messageCounts = overview.dailyActivity.map(d => d.messageCount);
    const avg = messageCounts.reduce((a, b) => a + b, 0) / messageCounts.length;
    const maxDay = Math.max(...messageCounts);
    if (maxDay > avg * 5 && maxDay > 500) {
      recs.push({
        severity: 'low',
        title: 'Highly Variable Usage',
        description: `Your peak day had ${maxDay.toLocaleString()} messages vs an average of ${Math.round(avg).toLocaleString()}. Spiky usage may indicate complex debugging sessions.`,
        fix: 'Consider breaking complex problems into smaller tasks. Use /compact to reduce context when sessions get long.',
        estimatedSavings: null
      });
    }
  }

  // Rule 5: Late night usage
  if (overview.hourCounts) {
    const lateNight = [0, 1, 2, 3, 4, 5].reduce((sum, h) => sum + (overview.hourCounts[h] || 0), 0);
    const totalHours = Object.values(overview.hourCounts).reduce((a, b) => a + b, 0);
    if (totalHours > 0 && lateNight / totalHours > 0.2) {
      recs.push({
        severity: 'low',
        title: 'Significant Late Night Usage',
        description: `${(lateNight / totalHours * 100).toFixed(0)}% of your sessions are between midnight and 6 AM.`,
        fix: 'Late night coding sessions tend to be less productive and may lead to more debugging. Consider scheduling complex tasks for peak focus hours.',
        estimatedSavings: null
      });
    }
  }

  // Rule 6: Many very short sessions
  if (Array.isArray(sessions) && sessions.length > 5) {
    const shortSessions = sessions.filter(s => s.messages <= 3);
    const shortRatio = shortSessions.length / sessions.length;
    if (shortRatio > 0.3) {
      recs.push({
        severity: 'low',
        title: 'Many Short Sessions',
        description: `${(shortRatio * 100).toFixed(0)}% of your sessions have 3 or fewer messages. Short sessions have higher per-message cost due to cache warm-up.`,
        fix: 'Use /continue to resume sessions. Keep sessions open for related follow-up questions.',
        estimatedSavings: null
      });
    }
  }

  // Rule 7: Low tool usage
  if (overview.totalMessages > 100 && overview.totalToolCalls > 0) {
    const toolRatio = overview.totalToolCalls / overview.totalMessages;
    if (toolRatio < 0.1) {
      recs.push({
        severity: 'low',
        title: 'Low Tool Usage',
        description: `Only ${(toolRatio * 100).toFixed(1)}% tool call rate. Claude Code is most effective when it can read/write files and run commands.`,
        fix: 'Give Claude Code permission to use tools (Edit, Write, Bash) for better results. Use "claude --dangerously-skip-permissions" for trusted tasks.',
        estimatedSavings: null
      });
    }
  }

  // Rule 8: Output-heavy usage
  if (tc && tc.output > 0 && tc.input > 0) {
    const outputRatio = tc.output / (tc.input + tc.output);
    if (outputRatio > 0.7) {
      recs.push({
        severity: 'low',
        title: 'Output-Heavy Usage',
        description: `${(outputRatio * 100).toFixed(0)}% of your non-cache tokens are output tokens, which cost 5x more than input tokens.`,
        fix: 'Be more specific in prompts to reduce output length. Ask for targeted changes rather than full file rewrites.',
        estimatedSavings: null
      });
    }
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  recs.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return recs;
}

module.exports = { getRecommendations };

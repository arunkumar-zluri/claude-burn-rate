const { parseStatsCache, getDateRange } = require('../data/stats-parser.js');
const { calculateTotalCost, calculateCost, getPricing } = require('../cost/pricing.js');

// Unfiltered: fast path from stats-cache.json
// Filtered: recompute everything from session data
function buildOverview(stats, filters, sessions) {
  if (!stats) {
    return {
      error: 'No stats-cache.json found. Run Claude Code to generate usage data.',
      empty: true
    };
  }

  // If filters are active and we have session data, build from sessions
  if (filters && sessions) {
    return buildFromSessions(stats, sessions);
  }

  return buildFromStats(stats);
}

function buildFromStats(stats) {
  const parsed = parseStatsCache(stats);
  const dateRange = getDateRange(parsed);
  const costResult = calculateTotalCost(parsed.modelUsage);
  const dailyCosts = buildDailyCosts(parsed.dailyModelTokens);
  const dailyTokens = buildDailyTokens(parsed.dailyModelTokens);
  const modelBreakdown = buildModelBreakdown(parsed.modelUsage, costResult.byModel);
  const tokenComposition = buildTokenComposition(parsed.modelUsage);

  const activeDays = parsed.dailyActivity.length;
  const totalMessages = parsed.totalMessages;
  const totalSessions = parsed.totalSessions;

  return {
    totalCost: costResult.totalCost,
    totalSessions,
    totalMessages,
    totalToolCalls: parsed.dailyActivity.reduce((sum, d) => sum + (d.toolCallCount || 0), 0),
    dateRange,
    activeDays,
    avgMessagesPerDay: activeDays > 0 ? Math.round(totalMessages / activeDays) : 0,
    avgSessionsPerDay: activeDays > 0 ? (totalSessions / activeDays).toFixed(1) : '0',
    avgCostPerDay: activeDays > 0 ? costResult.totalCost / activeDays : 0,
    dailyActivity: parsed.dailyActivity,
    dailyCosts,
    dailyTokens,
    modelBreakdown,
    tokenComposition,
    hourCounts: parsed.hourCounts,
    longestSession: parsed.longestSession,
    firstSessionDate: parsed.firstSessionDate
  };
}

function buildFromSessions(stats, sessions) {
  // Aggregate everything from filtered session data
  const modelUsage = {};
  const dailyMap = {};
  const hourCounts = {};
  let totalMessages = 0;
  let longestSession = null;

  for (const s of sessions) {
    totalMessages += s.messages || 0;

    // Track longest session
    if (s.duration && (!longestSession || s.duration > longestSession.duration)) {
      longestSession = { sessionId: s.sessionId, duration: s.duration, messageCount: s.messages };
    }

    // Aggregate token usage per model
    for (const [model, tokens] of Object.entries(s.tokensByModel || {})) {
      if (!modelUsage[model]) {
        modelUsage[model] = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
      }
      modelUsage[model].inputTokens += tokens.inputTokens || 0;
      modelUsage[model].outputTokens += tokens.outputTokens || 0;
      modelUsage[model].cacheReadInputTokens += tokens.cacheReadInputTokens || 0;
      modelUsage[model].cacheCreationInputTokens += tokens.cacheCreationInputTokens || 0;
    }

    // Build daily activity from sessions
    if (s.date) {
      if (!dailyMap[s.date]) {
        dailyMap[s.date] = { date: s.date, messageCount: 0, sessionCount: 0, toolCallCount: 0, tokensByModel: {} };
      }
      dailyMap[s.date].messageCount += s.messages || 0;
      dailyMap[s.date].sessionCount += 1;
      // Approximate tool calls — not available per-session from index, so skip
      for (const [model, tokens] of Object.entries(s.tokensByModel || {})) {
        dailyMap[s.date].tokensByModel[model] = (dailyMap[s.date].tokensByModel[model] || 0) + (tokens.outputTokens || 0);
      }
    }

    // Hour counts from session creation time
    if (s.date) {
      // We don't have exact hour from date string alone, so try created timestamp if available
      // Fall back to not populating hourCounts for filtered view
    }
  }

  const dailyActivity = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  const dailyModelTokens = dailyActivity.map(d => ({ date: d.date, tokensByModel: d.tokensByModel }));

  const costResult = calculateTotalCost(modelUsage);
  const dailyCosts = buildDailyCosts(dailyModelTokens);
  const dailyTokens = buildDailyTokens(dailyModelTokens);
  const modelBreakdown = buildModelBreakdown(modelUsage, costResult.byModel);
  const tokenComposition = buildTokenComposition(modelUsage);

  const activeDays = dailyActivity.length;
  const totalSessions = sessions.length;
  const dates = dailyActivity.map(d => d.date);
  const dateRange = dates.length > 0
    ? { start: dates[0], end: dates[dates.length - 1], days: Math.ceil((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000) + 1 }
    : { start: null, end: null, days: 0 };

  return {
    totalCost: costResult.totalCost,
    totalSessions,
    totalMessages,
    totalToolCalls: 0, // not available per-session
    dateRange,
    activeDays,
    avgMessagesPerDay: activeDays > 0 ? Math.round(totalMessages / activeDays) : 0,
    avgSessionsPerDay: activeDays > 0 ? (totalSessions / activeDays).toFixed(1) : '0',
    avgCostPerDay: activeDays > 0 ? costResult.totalCost / activeDays : 0,
    dailyActivity,
    dailyCosts,
    dailyTokens,
    modelBreakdown,
    tokenComposition,
    hourCounts,
    longestSession,
    firstSessionDate: dates[0] || null,
    filtered: true
  };
}

function buildDailyCosts(dailyModelTokens) {
  return dailyModelTokens.map(day => {
    let dayCost = 0;
    const byModel = {};
    for (const [model, tokens] of Object.entries(day.tokensByModel)) {
      const cost = calculateCost({ outputTokens: tokens }, model);
      dayCost += cost.totalCost;
      byModel[model] = { tokens, cost: cost.totalCost };
    }
    return { date: day.date, cost: dayCost, byModel };
  });
}

function buildDailyTokens(dailyModelTokens) {
  return dailyModelTokens.map(day => {
    let totalTokens = 0;
    const byModel = {};
    for (const [model, tokens] of Object.entries(day.tokensByModel)) {
      totalTokens += tokens;
      byModel[model] = tokens;
    }
    return { date: day.date, total: totalTokens, byModel };
  });
}

function buildModelBreakdown(modelUsage, costByModel) {
  return Object.entries(modelUsage).map(([modelId, usage]) => {
    const costInfo = costByModel[modelId] || {};
    return {
      modelId,
      displayName: costInfo.displayName || modelId,
      totalCost: costInfo.totalCost || 0,
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      cacheReadInputTokens: usage.cacheReadInputTokens || 0,
      cacheCreationInputTokens: usage.cacheCreationInputTokens || 0,
      costBreakdown: {
        input: costInfo.inputCost || 0,
        output: costInfo.outputCost || 0,
        cacheRead: costInfo.cacheReadCost || 0,
        cacheWrite: costInfo.cacheWriteCost || 0
      }
    };
  }).sort((a, b) => b.totalCost - a.totalCost);
}

function buildTokenComposition(modelUsage) {
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;

  for (const usage of Object.values(modelUsage)) {
    totalInput += usage.inputTokens || 0;
    totalOutput += usage.outputTokens || 0;
    totalCacheRead += usage.cacheReadInputTokens || 0;
    totalCacheWrite += usage.cacheCreationInputTokens || 0;
  }

  const total = totalInput + totalOutput + totalCacheRead + totalCacheWrite;

  return {
    input: totalInput,
    output: totalOutput,
    cacheRead: totalCacheRead,
    cacheWrite: totalCacheWrite,
    total,
    percentages: total > 0 ? {
      input: (totalInput / total * 100).toFixed(1),
      output: (totalOutput / total * 100).toFixed(1),
      cacheRead: (totalCacheRead / total * 100).toFixed(1),
      cacheWrite: (totalCacheWrite / total * 100).toFixed(1)
    } : { input: '0', output: '0', cacheRead: '0', cacheWrite: '0' }
  };
}

module.exports = { buildOverview };

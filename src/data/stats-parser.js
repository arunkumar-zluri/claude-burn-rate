function parseStatsCache(stats) {
  if (!stats) return null;

  return {
    version: stats.version,
    lastComputedDate: stats.lastComputedDate,
    dailyActivity: stats.dailyActivity || [],
    dailyModelTokens: stats.dailyModelTokens || [],
    modelUsage: stats.modelUsage || {},
    totalSessions: stats.totalSessions || 0,
    totalMessages: stats.totalMessages || 0,
    longestSession: stats.longestSession || null,
    firstSessionDate: stats.firstSessionDate || null,
    hourCounts: stats.hourCounts || {},
    totalSpeculationTimeSavedMs: stats.totalSpeculationTimeSavedMs || 0
  };
}

function getDateRange(stats) {
  if (!stats || !stats.dailyActivity || stats.dailyActivity.length === 0) {
    return { start: null, end: null, days: 0 };
  }
  const dates = stats.dailyActivity.map(d => d.date).sort();
  const start = dates[0];
  const end = dates[dates.length - 1];
  const days = Math.ceil(
    (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)
  ) + 1;
  return { start, end, days };
}

function getModelTokenTotals(stats) {
  if (!stats || !stats.modelUsage) return {};

  const totals = {};
  for (const [model, usage] of Object.entries(stats.modelUsage)) {
    totals[model] = {
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      cacheReadInputTokens: usage.cacheReadInputTokens || 0,
      cacheCreationInputTokens: usage.cacheCreationInputTokens || 0,
      totalTokens:
        (usage.inputTokens || 0) +
        (usage.outputTokens || 0) +
        (usage.cacheReadInputTokens || 0) +
        (usage.cacheCreationInputTokens || 0)
    };
  }
  return totals;
}

function getDailyTokensByModel(stats) {
  if (!stats || !stats.dailyModelTokens) return [];
  return stats.dailyModelTokens.map(d => ({
    date: d.date,
    tokensByModel: d.tokensByModel || {}
  }));
}

module.exports = {
  parseStatsCache,
  getDateRange,
  getModelTokenTotals,
  getDailyTokensByModel
};

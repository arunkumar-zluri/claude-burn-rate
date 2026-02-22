const { readStatsCache } = require('../data/reader.js');
const { parseStatsCache } = require('../data/stats-parser.js');

async function getPatterns() {
  const stats = await readStatsCache();
  if (!stats) return { hourCounts: {}, weeklyComparison: [], peakHour: null, quietHour: null };

  const parsed = parseStatsCache(stats);

  // Hour distribution
  const hourCounts = parsed.hourCounts || {};

  // Peak / quiet hours
  const hourEntries = Object.entries(hourCounts).map(([h, c]) => [parseInt(h), c]);
  hourEntries.sort((a, b) => b[1] - a[1]);
  const peakHour = hourEntries.length > 0 ? hourEntries[0][0] : null;
  const quietHour = hourEntries.length > 0 ? hourEntries[hourEntries.length - 1][0] : null;

  // Weekly comparison
  const weeklyComparison = buildWeeklyComparison(parsed.dailyActivity);

  // Day of week distribution
  const dayOfWeekCounts = buildDayOfWeekCounts(parsed.dailyActivity);

  // Model trends over time
  const modelTrends = buildModelTrends(parsed.dailyModelTokens);

  return {
    hourCounts,
    peakHour,
    quietHour,
    weeklyComparison,
    dayOfWeekCounts,
    modelTrends
  };
}

function buildWeeklyComparison(dailyActivity) {
  if (!dailyActivity || dailyActivity.length === 0) return [];

  const weeks = {};
  for (const day of dailyActivity) {
    const d = new Date(day.date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    const weekNum = getWeekNumber(d);

    if (!weeks[weekKey]) {
      weeks[weekKey] = { week: weekNum, weekStart: weekKey, messages: 0, sessions: 0, toolCalls: 0, days: 0 };
    }
    weeks[weekKey].messages += day.messageCount || 0;
    weeks[weekKey].sessions += day.sessionCount || 0;
    weeks[weekKey].toolCalls += day.toolCallCount || 0;
    weeks[weekKey].days++;
  }

  return Object.values(weeks).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function buildDayOfWeekCounts(dailyActivity) {
  const days = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (!dailyActivity) return dayNames.map((name, i) => ({ day: name, count: 0 }));

  for (const d of dailyActivity) {
    const dow = new Date(d.date).getDay();
    days[dow] += d.messageCount || 0;
  }

  return dayNames.map((name, i) => ({ day: name, count: days[i] }));
}

function buildModelTrends(dailyModelTokens) {
  if (!dailyModelTokens) return [];
  return dailyModelTokens.map(d => ({
    date: d.date,
    models: d.tokensByModel || {}
  }));
}

function getWeekNumber(d) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
}

module.exports = { getPatterns };

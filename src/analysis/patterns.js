const { readStatsCache } = require('../data/reader.js');
const { parseStatsCache } = require('../data/stats-parser.js');

async function getPatterns() {
  const stats = await readStatsCache();
  if (!stats) return { hourCounts: {}, weeklyComparison: [], peakHour: null, quietHour: null };

  const parsed = parseStatsCache(stats);

  // Supplement stale cache with recent session data
  let dailyActivity = parsed.dailyActivity || [];
  let dailyModelTokens = parsed.dailyModelTokens || [];
  let hourCounts = { ...(parsed.hourCounts || {}) };

  if (stats.lastComputedDate) {
    const today = new Date().toISOString().split('T')[0];
    if (stats.lastComputedDate < today) {
      const { getSessions } = require('./sessions.js');
      const allSessions = await getSessions();
      const recentSessions = allSessions.filter(s => s.date && s.date > stats.lastComputedDate);

      if (recentSessions.length > 0) {
        // Supplement daily activity
        const dailyMap = {};
        for (const s of recentSessions) {
          if (!s.date) continue;
          if (!dailyMap[s.date]) {
            dailyMap[s.date] = { date: s.date, messageCount: 0, sessionCount: 0, toolCallCount: 0, tokensByModel: {} };
          }
          dailyMap[s.date].messageCount += s.messages || 0;
          dailyMap[s.date].sessionCount += 1;
          for (const [model, tokens] of Object.entries(s.tokensByModel || {})) {
            if (!dailyMap[s.date].tokensByModel[model]) dailyMap[s.date].tokensByModel[model] = 0;
            dailyMap[s.date].tokensByModel[model] += (tokens.outputTokens || 0);
          }
        }

        const recentDaily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
        dailyActivity = [...dailyActivity, ...recentDaily];
        dailyModelTokens = [...dailyModelTokens, ...recentDaily.map(d => ({ date: d.date, tokensByModel: d.tokensByModel }))];

        // Supplement hour counts from session creation timestamps
        for (const s of recentSessions) {
          if (s.createdAt) {
            const hour = new Date(s.createdAt).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + (s.messages || 1);
          }
        }
      }
    }
  }

  // Peak / quiet hours
  const hourEntries = Object.entries(hourCounts).map(([h, c]) => [parseInt(h), c]);
  hourEntries.sort((a, b) => b[1] - a[1]);
  const peakHour = hourEntries.length > 0 ? hourEntries[0][0] : null;
  const quietHour = hourEntries.length > 0 ? hourEntries[hourEntries.length - 1][0] : null;

  // Weekly comparison
  const weeklyComparison = buildWeeklyComparison(dailyActivity);

  // Day of week distribution
  const dayOfWeekCounts = buildDayOfWeekCounts(dailyActivity);

  // Model trends over time
  const modelTrends = buildModelTrends(dailyModelTokens);

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

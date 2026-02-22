/**
 * Gamification module — efficiency score, achievements, and usage streaks.
 * All computation is pure; no I/O. Consumes overview + sessions from existing modules.
 */

function getGamification(overview, sessions) {
  const score = computeScore(overview, sessions);
  const achievements = computeAchievements(overview, sessions);
  const streak = computeStreak(overview);

  return { score, achievements, streak };
}

// ========== EFFICIENCY SCORE ==========

function computeScore(overview, sessions) {
  const cache = scoreCacheHitRate(overview);
  const modelChoice = scoreModelChoice(sessions);
  const sessionEfficiency = scoreSessionEfficiency(sessions);
  const costTrend = scoreCostTrend(overview, sessions);

  const total = Math.round(
    cache * 0.30 +
    modelChoice * 0.25 +
    sessionEfficiency * 0.25 +
    costTrend * 0.20
  );

  return {
    total: clamp(total, 0, 100),
    factors: {
      cache: Math.round(cache),
      modelChoice: Math.round(modelChoice),
      sessionEfficiency: Math.round(sessionEfficiency),
      costTrend: Math.round(costTrend)
    }
  };
}

/**
 * Cache hit rate: cacheRead / (cacheRead + cacheWrite)
 * 90%+ = 100 points, scales linearly from 0.
 */
function scoreCacheHitRate(overview) {
  const tc = overview.tokenComposition;
  if (!tc) return 50;

  const total = (tc.cacheRead || 0) + (tc.cacheWrite || 0);
  if (total === 0) return 50;

  const hitRate = tc.cacheRead / total;
  // 90%+ = 100pts, linear scale from 0 to 90%
  return Math.min((hitRate / 0.9) * 100, 100);
}

/**
 * Model choice: % of short sessions (<=6 messages) that used Sonnet.
 * 100% Sonnet for quick tasks = 100pts.
 */
function scoreModelChoice(sessions) {
  if (!sessions || sessions.length === 0) return 50;

  const shortSessions = sessions.filter(s => (s.messages || 0) <= 6);
  if (shortSessions.length === 0) return 50;

  let sonnetCount = 0;
  for (const s of shortSessions) {
    const models = Object.keys(s.tokensByModel || {});
    const hasSonnet = models.some(m => m.includes('sonnet'));
    if (hasSonnet) sonnetCount++;
  }

  return (sonnetCount / shortSessions.length) * 100;
}

/**
 * Session efficiency: inverse of short session ratio.
 * Fewer throwaway sessions (<=3 messages) = better.
 */
function scoreSessionEfficiency(sessions) {
  if (!sessions || sessions.length === 0) return 50;

  const throwaway = sessions.filter(s => (s.messages || 0) <= 3).length;
  const ratio = throwaway / sessions.length;

  // 0% throwaway = 100, 100% throwaway = 0
  return (1 - ratio) * 100;
}

/**
 * Cost trend: compare last 7 days avg cost/message vs overall.
 * Lower recent cost = better.
 */
function scoreCostTrend(overview, sessions) {
  if (!sessions || sessions.length === 0) return 50;
  if (!overview.totalMessages || overview.totalMessages === 0) return 50;

  const overallCostPerMsg = overview.totalCost / overview.totalMessages;
  if (overallCostPerMsg === 0) return 50;

  // Get last 7 days of sessions
  const sortedDates = (overview.dailyActivity || [])
    .map(d => d.date)
    .sort();
  if (sortedDates.length === 0) return 50;

  const cutoff = sortedDates.length >= 7
    ? sortedDates[sortedDates.length - 7]
    : sortedDates[0];

  const recentSessions = sessions.filter(s => s.date && s.date >= cutoff);
  const recentCost = recentSessions.reduce((sum, s) => sum + (s.cost || 0), 0);
  const recentMsgs = recentSessions.reduce((sum, s) => sum + (s.messages || 0), 0);

  if (recentMsgs === 0) return 50;

  const recentCostPerMsg = recentCost / recentMsgs;
  // If recent cost/msg is lower than overall, that's good
  const ratio = recentCostPerMsg / overallCostPerMsg;

  // ratio < 1 means improving (score > 50), ratio > 1 means worsening
  // Map: 0.5 ratio -> 100, 1.0 ratio -> 50, 1.5+ ratio -> 0
  return clamp((1.5 - ratio) * 100 / 1, 0, 100);
}

// ========== ACHIEVEMENTS ==========

function computeAchievements(overview, sessions) {
  const totalCost = overview.totalCost || 0;
  const totalSessions = overview.totalSessions || 0;
  const totalToolCalls = overview.totalToolCalls || 0;
  const totalMessages = overview.totalMessages || 0;
  const tc = overview.tokenComposition || {};

  // Cache hit rate
  const cacheTotal = (tc.cacheRead || 0) + (tc.cacheWrite || 0);
  const cacheHitRate = cacheTotal > 0 ? tc.cacheRead / cacheTotal : 0;

  // Cost per message
  const costPerMsg = totalMessages > 0 ? totalCost / totalMessages : 0;

  // Sonnet usage ratio
  const sonnetSessions = (sessions || []).filter(s => {
    const models = Object.keys(s.tokensByModel || {});
    return models.some(m => m.includes('sonnet'));
  }).length;
  const sonnetRatio = totalSessions > 0 ? sonnetSessions / totalSessions : 0;

  // Longest session message count
  const maxMessages = (sessions || []).reduce((max, s) => Math.max(max, s.messages || 0), 0);

  // Night owl: sessions between 11PM-5AM
  // We approximate from hourCounts in overview
  const hourCounts = overview.hourCounts || {};
  let nightSessions = 0;
  for (const h of [23, 0, 1, 2, 3, 4]) {
    nightSessions += hourCounts[h] || hourCounts[String(h)] || 0;
  }

  // Streaks
  const { current, longest } = computeStreak(overview);

  const fmtCost = n => '$' + n.toFixed(2);
  const fmtPct = n => Math.round(n * 100) + '%';

  return [
    // Cost milestones
    {
      id: 'first_hundred',
      title: 'First $100',
      description: 'Total spend crossed $100',
      icon: 'dollar',
      unlocked: totalCost >= 100,
      progress: totalCost < 100 ? fmtCost(totalCost) + ' / $100 (' + fmtCost(100 - totalCost) + ' to go)' : null
    },
    {
      id: 'big_spender',
      title: 'Big Spender',
      description: 'Total spend crossed $500',
      icon: 'money',
      unlocked: totalCost >= 500,
      progress: totalCost < 500 ? fmtCost(totalCost) + ' / $500 (' + fmtCost(500 - totalCost) + ' to go)' : null
    },
    {
      id: 'whale',
      title: 'Whale',
      description: 'Total spend crossed $1,000',
      icon: 'whale',
      unlocked: totalCost >= 1000,
      progress: totalCost < 1000 ? fmtCost(totalCost) + ' / $1,000 (' + fmtCost(1000 - totalCost) + ' to go)' : null
    },
    // Efficiency
    {
      id: 'cache_master',
      title: 'Cache Master',
      description: 'Cache hit rate above 90%',
      icon: 'cache',
      unlocked: cacheHitRate >= 0.9,
      progress: cacheHitRate < 0.9 ? 'Currently at ' + fmtPct(cacheHitRate) + ' (need 90%)' : null
    },
    {
      id: 'penny_pincher',
      title: 'Penny Pincher',
      description: 'Average cost per message below $0.05',
      icon: 'penny',
      unlocked: totalMessages > 0 && costPerMsg < 0.05,
      progress: !(totalMessages > 0 && costPerMsg < 0.05) ? 'Currently ' + fmtCost(costPerMsg) + '/msg (need < $0.05)' : null
    },
    {
      id: 'sonnet_savvy',
      title: 'Sonnet Savvy',
      description: '50%+ of sessions used Sonnet',
      icon: 'sonnet',
      unlocked: sonnetRatio >= 0.5,
      progress: sonnetRatio < 0.5 ? fmtPct(sonnetRatio) + ' Sonnet sessions (need 50%)' : null
    },
    // Usage
    {
      id: 'marathon',
      title: 'Marathon Runner',
      description: 'A session with 100+ messages',
      icon: 'marathon',
      unlocked: maxMessages >= 100,
      progress: maxMessages < 100 ? 'Best session: ' + maxMessages + ' msgs (need 100)' : null
    },
    {
      id: 'night_owl',
      title: 'Night Owl',
      description: '20+ sessions between 11PM-5AM',
      icon: 'night',
      unlocked: nightSessions >= 20,
      progress: nightSessions < 20 ? nightSessions + ' / 20 night sessions' : null
    },
    {
      id: 'centurion',
      title: 'Centurion',
      description: '100+ total sessions',
      icon: 'centurion',
      unlocked: totalSessions >= 100,
      progress: totalSessions < 100 ? totalSessions + ' / 100 sessions' : null
    },
    {
      id: 'toolsmith',
      title: 'Toolsmith',
      description: '1,000+ total tool calls',
      icon: 'toolsmith',
      unlocked: totalToolCalls >= 1000,
      progress: totalToolCalls < 1000 ? totalToolCalls.toLocaleString() + ' / 1,000 tool calls' : null
    },
    // Streaks
    {
      id: 'on_fire',
      title: 'On Fire',
      description: '5+ day usage streak',
      icon: 'fire',
      unlocked: longest >= 5,
      progress: longest < 5 ? 'Best streak: ' + longest + ' days (need 5)' : null
    },
    {
      id: 'dedicated',
      title: 'Dedicated',
      description: '10+ day usage streak',
      icon: 'dedicated',
      unlocked: longest >= 10,
      progress: longest < 10 ? 'Best streak: ' + longest + ' days (need 10)' : null
    }
  ];
}

// ========== STREAKS ==========

function computeStreak(overview) {
  const dailyActivity = overview.dailyActivity;
  if (!dailyActivity || dailyActivity.length === 0) {
    return { current: 0, longest: 0 };
  }

  // Get sorted unique dates
  const dates = [...new Set(dailyActivity.map(d => d.date))].sort();
  if (dates.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let currentRun = 1;

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00');
    const curr = new Date(dates[i] + 'T00:00:00');
    const diffDays = Math.round((curr - prev) / 86400000);

    if (diffDays === 1) {
      currentRun++;
      if (currentRun > longest) longest = currentRun;
    } else {
      currentRun = 1;
    }
  }

  // Current streak: count backwards from the last date
  // Check if the last activity date is today or yesterday (still active streak)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDate = new Date(dates[dates.length - 1] + 'T00:00:00');
  const daysSinceLast = Math.round((today - lastDate) / 86400000);

  let current = 0;
  if (daysSinceLast <= 1) {
    // Streak is still active — count backwards
    current = 1;
    for (let i = dates.length - 2; i >= 0; i--) {
      const prev = new Date(dates[i] + 'T00:00:00');
      const curr = new Date(dates[i + 1] + 'T00:00:00');
      const diffDays = Math.round((curr - prev) / 86400000);
      if (diffDays === 1) {
        current++;
      } else {
        break;
      }
    }
  }

  return { current, longest };
}

// ========== HELPERS ==========

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

module.exports = { getGamification };

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getGamification } = require('../src/analysis/gamification.js');

function makeOverview(overrides = {}) {
  return {
    totalCost: 50,
    totalSessions: 20,
    totalMessages: 200,
    totalToolCalls: 500,
    tokenComposition: {
      input: 1000, output: 1000, cacheRead: 8000, cacheWrite: 1000, total: 11000,
      percentages: { input: '9.1', output: '9.1', cacheRead: '72.7', cacheWrite: '9.1' }
    },
    dailyActivity: [
      { date: '2026-02-18', messageCount: 40, sessionCount: 4, toolCallCount: 100 },
      { date: '2026-02-19', messageCount: 50, sessionCount: 5, toolCallCount: 120 },
      { date: '2026-02-20', messageCount: 60, sessionCount: 6, toolCallCount: 130 },
      { date: '2026-02-21', messageCount: 30, sessionCount: 3, toolCallCount: 80 },
      { date: '2026-02-22', messageCount: 20, sessionCount: 2, toolCallCount: 70 }
    ],
    hourCounts: { '10': 5, '14': 8, '22': 3 },
    modelBreakdown: [],
    ...overrides
  };
}

function makeSession(overrides = {}) {
  return {
    sessionId: 'test-' + Math.random().toString(36).slice(2),
    date: '2026-02-20',
    messages: 10,
    cost: 2.5,
    duration: 3600000,
    tokensByModel: { 'claude-opus-4-6': { inputTokens: 500, outputTokens: 500, cacheReadInputTokens: 4000, cacheCreationInputTokens: 500 } },
    ...overrides
  };
}

describe('getGamification', () => {
  it('returns score, achievements, and streak', () => {
    const result = getGamification(makeOverview(), [makeSession()]);
    assert.ok(result.score);
    assert.ok(result.achievements);
    assert.ok(result.streak);
    assert.equal(typeof result.score.total, 'number');
    assert.ok(Array.isArray(result.achievements));
    assert.equal(typeof result.streak.current, 'number');
    assert.equal(typeof result.streak.longest, 'number');
  });

  it('score is between 0 and 100', () => {
    const result = getGamification(makeOverview(), [makeSession()]);
    assert.ok(result.score.total >= 0);
    assert.ok(result.score.total <= 100);
  });

  it('score factors are between 0 and 100', () => {
    const result = getGamification(makeOverview(), [makeSession()]);
    for (const val of Object.values(result.score.factors)) {
      assert.ok(val >= 0, `Factor ${val} should be >= 0`);
      assert.ok(val <= 100, `Factor ${val} should be <= 100`);
    }
  });

  it('returns 12 achievements', () => {
    const result = getGamification(makeOverview(), [makeSession()]);
    assert.equal(result.achievements.length, 12);
  });

  it('each achievement has required fields', () => {
    const result = getGamification(makeOverview(), [makeSession()]);
    for (const a of result.achievements) {
      assert.ok(a.id);
      assert.ok(a.title);
      assert.ok(a.description);
      assert.ok(a.icon);
      assert.equal(typeof a.unlocked, 'boolean');
    }
  });
});

describe('efficiency score', () => {
  it('high cache hit rate gives high cache score', () => {
    const overview = makeOverview({
      tokenComposition: { input: 100, output: 100, cacheRead: 9000, cacheWrite: 100, total: 9300 }
    });
    const result = getGamification(overview, [makeSession()]);
    assert.ok(result.score.factors.cache >= 90, `Expected cache >= 90 got ${result.score.factors.cache}`);
  });

  it('low cache hit rate gives low cache score', () => {
    const overview = makeOverview({
      tokenComposition: { input: 100, output: 100, cacheRead: 100, cacheWrite: 9000, total: 9300 }
    });
    const result = getGamification(overview, [makeSession()]);
    assert.ok(result.score.factors.cache < 20, `Expected cache < 20 got ${result.score.factors.cache}`);
  });

  it('sonnet sessions improve model choice score', () => {
    const sessions = [
      makeSession({ messages: 4, tokensByModel: { 'claude-sonnet-4-6': { inputTokens: 100, outputTokens: 100 } } }),
      makeSession({ messages: 5, tokensByModel: { 'claude-sonnet-4-6': { inputTokens: 100, outputTokens: 100 } } }),
      makeSession({ messages: 3, tokensByModel: { 'claude-sonnet-4-6': { inputTokens: 100, outputTokens: 100 } } })
    ];
    const result = getGamification(makeOverview(), sessions);
    assert.equal(result.score.factors.modelChoice, 100);
  });

  it('opus-only short sessions give low model choice score', () => {
    const sessions = [
      makeSession({ messages: 4, tokensByModel: { 'claude-opus-4-6': { inputTokens: 100, outputTokens: 100 } } }),
      makeSession({ messages: 5, tokensByModel: { 'claude-opus-4-6': { inputTokens: 100, outputTokens: 100 } } })
    ];
    const result = getGamification(makeOverview(), sessions);
    assert.equal(result.score.factors.modelChoice, 0);
  });

  it('fewer throwaway sessions improves efficiency score', () => {
    const sessions = Array(10).fill(null).map(() => makeSession({ messages: 20 }));
    const result = getGamification(makeOverview(), sessions);
    assert.equal(result.score.factors.sessionEfficiency, 100);
  });

  it('many throwaway sessions lowers efficiency score', () => {
    const sessions = Array(10).fill(null).map(() => makeSession({ messages: 2 }));
    const result = getGamification(makeOverview(), sessions);
    assert.equal(result.score.factors.sessionEfficiency, 0);
  });
});

describe('achievements', () => {
  it('unlocks first_hundred when cost >= 100', () => {
    const result = getGamification(makeOverview({ totalCost: 150 }), []);
    const badge = result.achievements.find(a => a.id === 'first_hundred');
    assert.equal(badge.unlocked, true);
  });

  it('locks first_hundred when cost < 100', () => {
    const result = getGamification(makeOverview({ totalCost: 50 }), []);
    const badge = result.achievements.find(a => a.id === 'first_hundred');
    assert.equal(badge.unlocked, false);
  });

  it('unlocks cache_master with 90%+ hit rate', () => {
    const overview = makeOverview({
      tokenComposition: { cacheRead: 9500, cacheWrite: 500, total: 10000 }
    });
    const result = getGamification(overview, []);
    const badge = result.achievements.find(a => a.id === 'cache_master');
    assert.equal(badge.unlocked, true);
  });

  it('unlocks marathon with 100+ message session', () => {
    const sessions = [makeSession({ messages: 150 })];
    const result = getGamification(makeOverview(), sessions);
    const badge = result.achievements.find(a => a.id === 'marathon');
    assert.equal(badge.unlocked, true);
  });

  it('locks marathon without 100+ message session', () => {
    const sessions = [makeSession({ messages: 50 })];
    const result = getGamification(makeOverview(), sessions);
    const badge = result.achievements.find(a => a.id === 'marathon');
    assert.equal(badge.unlocked, false);
  });

  it('unlocks centurion with 100+ sessions', () => {
    const result = getGamification(makeOverview({ totalSessions: 120 }), []);
    const badge = result.achievements.find(a => a.id === 'centurion');
    assert.equal(badge.unlocked, true);
  });

  it('unlocks toolsmith with 1000+ tool calls', () => {
    const result = getGamification(makeOverview({ totalToolCalls: 1500 }), []);
    const badge = result.achievements.find(a => a.id === 'toolsmith');
    assert.equal(badge.unlocked, true);
  });

  it('unlocks night_owl with 20+ night sessions', () => {
    const result = getGamification(makeOverview({ hourCounts: { '0': 10, '1': 8, '2': 5 } }), []);
    const badge = result.achievements.find(a => a.id === 'night_owl');
    assert.equal(badge.unlocked, true);
  });

  it('unlocks penny_pincher with low cost per message', () => {
    const result = getGamification(makeOverview({ totalCost: 5, totalMessages: 200 }), []);
    const badge = result.achievements.find(a => a.id === 'penny_pincher');
    assert.equal(badge.unlocked, true);
  });
});

describe('streaks', () => {
  it('calculates consecutive day streak', () => {
    const overview = makeOverview({
      dailyActivity: [
        { date: '2026-02-18' },
        { date: '2026-02-19' },
        { date: '2026-02-20' },
        { date: '2026-02-21' },
        { date: '2026-02-22' }
      ]
    });
    const result = getGamification(overview, []);
    assert.equal(result.streak.longest, 5);
  });

  it('handles gaps in streak', () => {
    const overview = makeOverview({
      dailyActivity: [
        { date: '2026-02-15' },
        { date: '2026-02-16' },
        { date: '2026-02-18' },
        { date: '2026-02-19' },
        { date: '2026-02-20' }
      ]
    });
    const result = getGamification(overview, []);
    assert.equal(result.streak.longest, 3);
  });

  it('returns zero streak with no activity', () => {
    const overview = makeOverview({ dailyActivity: [] });
    const result = getGamification(overview, []);
    assert.equal(result.streak.current, 0);
    assert.equal(result.streak.longest, 0);
  });

  it('single day gives longest streak of 1', () => {
    const overview = makeOverview({
      dailyActivity: [{ date: '2026-02-22' }]
    });
    const result = getGamification(overview, []);
    assert.equal(result.streak.longest, 1);
  });

  it('unlocks on_fire with 5+ day streak', () => {
    const overview = makeOverview({
      dailyActivity: [
        { date: '2026-02-16' },
        { date: '2026-02-17' },
        { date: '2026-02-18' },
        { date: '2026-02-19' },
        { date: '2026-02-20' }
      ]
    });
    const result = getGamification(overview, []);
    const badge = result.achievements.find(a => a.id === 'on_fire');
    assert.equal(badge.unlocked, true);
  });

  it('unlocks dedicated with 10+ day streak', () => {
    const dates = [];
    for (let i = 1; i <= 12; i++) {
      dates.push({ date: `2026-02-${String(i).padStart(2, '0')}` });
    }
    const overview = makeOverview({ dailyActivity: dates });
    const result = getGamification(overview, []);
    const badge = result.achievements.find(a => a.id === 'dedicated');
    assert.equal(badge.unlocked, true);
  });
});

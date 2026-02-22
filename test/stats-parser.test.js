const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseStatsCache, getDateRange, getModelTokenTotals } = require('../src/data/stats-parser.js');

describe('parseStatsCache', () => {
  it('returns null for null input', () => {
    assert.equal(parseStatsCache(null), null);
  });

  it('parses valid stats', () => {
    const stats = {
      version: 2,
      lastComputedDate: '2026-02-12',
      dailyActivity: [{ date: '2026-01-07', messageCount: 100, sessionCount: 2, toolCallCount: 10 }],
      dailyModelTokens: [{ date: '2026-01-07', tokensByModel: { 'claude-opus-4-6': 1000 } }],
      modelUsage: { 'claude-opus-4-6': { inputTokens: 500, outputTokens: 300, cacheReadInputTokens: 10000, cacheCreationInputTokens: 5000 } },
      totalSessions: 5,
      totalMessages: 100,
      hourCounts: { '10': 3, '14': 5 }
    };

    const parsed = parseStatsCache(stats);
    assert.equal(parsed.version, 2);
    assert.equal(parsed.totalSessions, 5);
    assert.equal(parsed.dailyActivity.length, 1);
    assert.deepEqual(parsed.hourCounts, { '10': 3, '14': 5 });
  });

  it('handles missing fields', () => {
    const parsed = parseStatsCache({});
    assert.equal(parsed.totalSessions, 0);
    assert.equal(parsed.totalMessages, 0);
    assert.deepEqual(parsed.dailyActivity, []);
  });
});

describe('getDateRange', () => {
  it('returns null range for empty stats', () => {
    const range = getDateRange(null);
    assert.equal(range.start, null);
    assert.equal(range.end, null);
  });

  it('calculates correct range', () => {
    const range = getDateRange({
      dailyActivity: [
        { date: '2026-01-10' },
        { date: '2026-01-07' },
        { date: '2026-01-15' }
      ]
    });
    assert.equal(range.start, '2026-01-07');
    assert.equal(range.end, '2026-01-15');
    assert.equal(range.days, 9);
  });
});

describe('getModelTokenTotals', () => {
  it('aggregates token totals per model', () => {
    const totals = getModelTokenTotals({
      modelUsage: {
        'claude-opus-4-6': { inputTokens: 100, outputTokens: 200, cacheReadInputTokens: 1000, cacheCreationInputTokens: 500 }
      }
    });

    assert.equal(totals['claude-opus-4-6'].totalTokens, 1800);
    assert.equal(totals['claude-opus-4-6'].inputTokens, 100);
  });

  it('returns empty for missing data', () => {
    assert.deepEqual(getModelTokenTotals(null), {});
    assert.deepEqual(getModelTokenTotals({}), {});
  });
});

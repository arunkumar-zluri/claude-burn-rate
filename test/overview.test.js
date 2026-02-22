const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildOverview } = require('../src/analysis/overview.js');

describe('buildOverview', () => {
  it('returns error for null stats', () => {
    const result = buildOverview(null);
    assert.ok(result.empty);
    assert.ok(result.error);
  });

  it('builds complete overview from stats', () => {
    const stats = {
      version: 2,
      lastComputedDate: '2026-02-12',
      dailyActivity: [
        { date: '2026-01-07', messageCount: 100, sessionCount: 2, toolCallCount: 10 },
        { date: '2026-01-08', messageCount: 50, sessionCount: 1, toolCallCount: 5 }
      ],
      dailyModelTokens: [
        { date: '2026-01-07', tokensByModel: { 'claude-opus-4-6': 1000 } }
      ],
      modelUsage: {
        'claude-opus-4-6': {
          inputTokens: 500,
          outputTokens: 300,
          cacheReadInputTokens: 10000,
          cacheCreationInputTokens: 5000
        }
      },
      totalSessions: 3,
      totalMessages: 150,
      hourCounts: { '10': 2 }
    };

    const overview = buildOverview(stats);
    assert.ok(!overview.empty);
    assert.ok(overview.totalCost > 0);
    assert.equal(overview.totalSessions, 3);
    assert.equal(overview.totalMessages, 150);
    assert.equal(overview.totalToolCalls, 15);
    assert.equal(overview.activeDays, 2);
    assert.ok(overview.modelBreakdown.length > 0);
    assert.ok(overview.tokenComposition.total > 0);
    assert.ok(overview.dailyCosts.length > 0);
  });
});

describe('buildOverview token composition', () => {
  it('calculates correct percentages', () => {
    const stats = {
      version: 2,
      dailyActivity: [],
      dailyModelTokens: [],
      modelUsage: {
        'test-model': {
          inputTokens: 100,
          outputTokens: 100,
          cacheReadInputTokens: 400,
          cacheCreationInputTokens: 400
        }
      },
      totalSessions: 1,
      totalMessages: 1,
      hourCounts: {}
    };

    const overview = buildOverview(stats);
    const tc = overview.tokenComposition;
    assert.equal(tc.total, 1000);
    assert.equal(tc.percentages.input, '10.0');
    assert.equal(tc.percentages.output, '10.0');
    assert.equal(tc.percentages.cacheRead, '40.0');
    assert.equal(tc.percentages.cacheWrite, '40.0');
  });
});

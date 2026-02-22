const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getRecommendations } = require('../src/analysis/recommendations.js');

describe('getRecommendations', () => {
  it('returns empty for null overview', () => {
    const recs = getRecommendations(null, []);
    assert.deepEqual(recs, []);
  });

  it('returns empty for empty overview', () => {
    const recs = getRecommendations({ empty: true }, []);
    assert.deepEqual(recs, []);
  });

  it('detects high cache write ratio', () => {
    const overview = {
      tokenComposition: { input: 100, output: 100, cacheRead: 100, cacheWrite: 300, total: 600, percentages: {} },
      modelBreakdown: [],
      dailyActivity: [],
      hourCounts: {},
      totalMessages: 0,
      totalToolCalls: 0,
      totalCost: 0
    };

    const recs = getRecommendations(overview, []);
    const cacheRec = recs.find(r => r.title.includes('Cache Creation'));
    assert.ok(cacheRec);
    assert.equal(cacheRec.severity, 'medium');
  });

  it('detects opus-heavy usage', () => {
    const overview = {
      tokenComposition: { input: 100, output: 100, cacheRead: 100, cacheWrite: 100, total: 400, percentages: {} },
      modelBreakdown: [
        { modelId: 'claude-opus-4-6', totalCost: 95, displayName: 'Opus' },
        { modelId: 'claude-sonnet-4-5', totalCost: 5, displayName: 'Sonnet' }
      ],
      dailyActivity: [],
      hourCounts: {},
      totalMessages: 0,
      totalToolCalls: 0,
      totalCost: 100
    };

    const recs = getRecommendations(overview, []);
    const sonnetRec = recs.find(r => r.title.includes('Sonnet'));
    assert.ok(sonnetRec);
  });

  it('detects many short sessions', () => {
    const overview = {
      tokenComposition: { total: 0 },
      modelBreakdown: [],
      dailyActivity: [],
      hourCounts: {},
      totalMessages: 0,
      totalToolCalls: 0,
      totalCost: 0
    };

    const sessions = Array(10).fill(null).map((_, i) => ({
      messages: i < 5 ? 2 : 20
    }));

    const recs = getRecommendations(overview, sessions);
    const shortRec = recs.find(r => r.title.includes('Short Sessions'));
    assert.ok(shortRec);
  });

  it('sorts by severity', () => {
    const overview = {
      tokenComposition: { input: 10, output: 10, cacheRead: 10, cacheWrite: 200, total: 230, percentages: {} },
      modelBreakdown: [{ modelId: 'claude-opus-4-6', totalCost: 100, displayName: 'Opus' }],
      dailyActivity: Array(10).fill(null).map((_, i) => ({
        date: `2026-01-${i + 1}`, messageCount: i === 0 ? 5000 : 50, sessionCount: 1, toolCallCount: 0
      })),
      hourCounts: { '1': 5, '2': 5, '3': 5, '10': 2, '14': 3 },
      totalMessages: 200,
      totalToolCalls: 5,
      totalCost: 100
    };

    const recs = getRecommendations(overview, []);
    if (recs.length > 1) {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < recs.length; i++) {
        assert.ok(severityOrder[recs[i].severity] >= severityOrder[recs[i - 1].severity]);
      }
    }
  });
});

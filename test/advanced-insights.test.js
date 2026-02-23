const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Mock the reader and session-parser modules before requiring the module under test
const mockListProjectDirs = mock.fn(async () => []);
const mockListSessionFiles = mock.fn(async () => []);
const mockParseSessionFile = mock.fn(async () => ({
  assistantMessages: [],
  userMessages: [],
  messages: [],
  messageCount: 0
}));

// We need to set up mocks via require cache manipulation
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

// Instead, test the logic by requiring the module and providing controlled data through its public interface
// For roiMetrics, it's called via getAdvancedInsights which we can invoke directly
// For async functions, we mock at the reader/session-parser level

describe('advanced-insights', () => {
  describe('getAdvancedInsights - ROI metrics', () => {
    it('produces ROI insight with valid data', async () => {
      // We test by directly requiring and checking the behavior
      // Since contextWindowAnalysis and wastedSpendDetection read actual files,
      // we focus on testing the synchronous roiMetrics logic through getAdvancedInsights
      const { getAdvancedInsights } = require('../src/analysis/advanced-insights.js');

      const overview = {
        totalCost: 50,
        totalSessions: 10,
        totalMessages: 100,
        empty: false
      };

      const sessions = [];

      const contributions = {
        totalLinesWritten: 5000,
        totalLinesEdited: 3000,
        totalFilesTouched: 40,
        coAuthoredCommits: 20,
        topFiles: []
      };

      const insights = await getAdvancedInsights(overview, sessions, contributions);

      // Should include ROI insight (context window and wasted spend may or may not appear depending on disk)
      const roiInsight = insights.find(i => i.title.includes('ROI Score'));
      assert.ok(roiInsight, 'Should produce ROI insight');
      assert.ok(roiInsight.title.includes('lines per dollar'));
      assert.ok(roiInsight.helpText);
      assert.ok(roiInsight.description.includes('8,000') || roiInsight.description.includes('lines'), 'Should mention lines in description');
    });

    it('skips ROI when cost is zero', async () => {
      const { getAdvancedInsights } = require('../src/analysis/advanced-insights.js');

      const overview = {
        totalCost: 0,
        totalSessions: 0,
        totalMessages: 0,
        empty: false
      };

      const contributions = {
        totalLinesWritten: 100,
        totalLinesEdited: 50,
        totalFilesTouched: 5,
        coAuthoredCommits: 1,
        topFiles: []
      };

      const insights = await getAdvancedInsights(overview, [], contributions);
      const roiInsight = insights.find(i => i.title.includes('ROI Score'));
      assert.equal(roiInsight, undefined, 'Should skip ROI when cost is 0');
    });

    it('skips ROI when contributions is null', async () => {
      const { getAdvancedInsights } = require('../src/analysis/advanced-insights.js');

      const overview = {
        totalCost: 50,
        totalSessions: 10,
        totalMessages: 100,
        empty: false
      };

      const insights = await getAdvancedInsights(overview, [], null);
      const roiInsight = insights.find(i => i.title.includes('ROI Score'));
      assert.equal(roiInsight, undefined, 'Should skip ROI when contributions is null');
    });

    it('skips ROI when overview is empty', async () => {
      const { getAdvancedInsights } = require('../src/analysis/advanced-insights.js');

      const overview = { empty: true };

      const contributions = {
        totalLinesWritten: 100,
        totalLinesEdited: 50,
        totalFilesTouched: 5,
        coAuthoredCommits: 1,
        topFiles: []
      };

      const insights = await getAdvancedInsights(overview, [], contributions);
      const roiInsight = insights.find(i => i.title.includes('ROI Score'));
      assert.equal(roiInsight, undefined, 'Should skip ROI when overview is empty');
    });

    it('skips ROI when no lines written', async () => {
      const { getAdvancedInsights } = require('../src/analysis/advanced-insights.js');

      const overview = {
        totalCost: 50,
        totalSessions: 10,
        totalMessages: 100,
        empty: false
      };

      const contributions = {
        totalLinesWritten: 0,
        totalLinesEdited: 0,
        totalFilesTouched: 0,
        coAuthoredCommits: 0,
        topFiles: []
      };

      const insights = await getAdvancedInsights(overview, [], contributions);
      const roiInsight = insights.find(i => i.title.includes('ROI Score'));
      assert.equal(roiInsight, undefined, 'Should skip ROI when no lines written');
    });

    it('shows warning severity for low ROI', async () => {
      const { getAdvancedInsights } = require('../src/analysis/advanced-insights.js');

      const overview = {
        totalCost: 500,
        totalSessions: 100,
        totalMessages: 1000,
        empty: false
      };

      const contributions = {
        totalLinesWritten: 10,
        totalLinesEdited: 5,
        totalFilesTouched: 2,
        coAuthoredCommits: 0,
        topFiles: []
      };

      const insights = await getAdvancedInsights(overview, [], contributions);
      const roiInsight = insights.find(i => i.title.includes('ROI Score'));
      assert.ok(roiInsight);
      assert.equal(roiInsight.severity, 'warning', 'Low ROI should show warning');
    });
  });

  describe('generateInsights - costForecast', () => {
    const { generateInsights } = require('../src/analysis/insights.js');

    it('produces cost forecast with 14+ days of data', () => {
      const overview = {
        totalCost: 100,
        totalMessages: 200,
        totalSessions: 20,
        dailyCosts: Array.from({ length: 20 }, (_, i) => ({
          date: `2026-02-${(i + 1).toString().padStart(2, '0')}`,
          cost: 5 + (i < 10 ? 0 : 2) // increasing trend
        })),
        dailyActivity: [],
        tokenComposition: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        modelBreakdown: [],
        hourCounts: {}
      };

      const insights = generateInsights(overview, [], null);
      const forecast = insights.find(i => i.title.includes('Projected spend'));
      assert.ok(forecast, 'Should produce cost forecast');
      assert.ok(forecast.detail.includes('high'), 'Should have high confidence with 14+ days');
      assert.ok(forecast.helpText);
    });

    it('shows increasing trend when recent spend is higher', () => {
      const overview = {
        totalCost: 100,
        totalMessages: 200,
        totalSessions: 20,
        dailyCosts: Array.from({ length: 14 }, (_, i) => ({
          date: `2026-02-${(i + 1).toString().padStart(2, '0')}`,
          cost: i < 7 ? 2 : 10 // first week $2/day, second week $10/day
        })),
        dailyActivity: [],
        tokenComposition: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        modelBreakdown: [],
        hourCounts: {}
      };

      const insights = generateInsights(overview, [], null);
      const forecast = insights.find(i => i.title.includes('Projected spend'));
      assert.ok(forecast);
      assert.ok(forecast.description.includes('trending up'));
      assert.equal(forecast.severity, 'warning');
    });

    it('skips forecast with fewer than 3 days', () => {
      const overview = {
        totalCost: 10,
        totalMessages: 20,
        totalSessions: 2,
        dailyCosts: [{ date: '2026-02-01', cost: 5 }, { date: '2026-02-02', cost: 5 }],
        dailyActivity: [],
        tokenComposition: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        modelBreakdown: [],
        hourCounts: {}
      };

      const insights = generateInsights(overview, [], null);
      const forecast = insights.find(i => i.title.includes('Projected spend'));
      assert.equal(forecast, undefined, 'Should not produce forecast with <3 days');
    });
  });

  describe('generateInsights - sessionDurationDistribution', () => {
    const { generateInsights } = require('../src/analysis/insights.js');

    it('produces duration distribution with sufficient sessions', () => {
      const overview = {
        totalCost: 50,
        totalMessages: 100,
        totalSessions: 10,
        dailyCosts: [],
        dailyActivity: [],
        tokenComposition: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        modelBreakdown: [],
        hourCounts: {}
      };

      const sessions = [
        { messages: 5, cost: 2, duration: 3 * 60000 },   // <5min
        { messages: 10, cost: 5, duration: 10 * 60000 },  // 5-15min
        { messages: 15, cost: 8, duration: 20 * 60000 },  // 15-30min
        { messages: 20, cost: 12, duration: 45 * 60000 }, // 30-60min
        { messages: 25, cost: 15, duration: 90 * 60000 }, // 1-2hr
        { messages: 8, cost: 3, duration: 8 * 60000 },    // 5-15min
      ];

      const insights = generateInsights(overview, sessions, null);
      const duration = insights.find(i => i.title.includes('Most sessions last'));
      assert.ok(duration, 'Should produce duration distribution');
      assert.ok(duration.helpText);
    });

    it('skips with fewer than 5 sessions', () => {
      const overview = {
        totalCost: 10,
        totalMessages: 20,
        totalSessions: 2,
        dailyCosts: [],
        dailyActivity: [],
        tokenComposition: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        modelBreakdown: [],
        hourCounts: {}
      };

      const sessions = [
        { messages: 5, cost: 2, duration: 3 * 60000 },
        { messages: 10, cost: 5, duration: 10 * 60000 },
      ];

      const insights = generateInsights(overview, sessions, null);
      const duration = insights.find(i => i.title.includes('Most sessions last'));
      assert.equal(duration, undefined, 'Should skip with <5 sessions');
    });

    it('skips sessions without duration', () => {
      const overview = {
        totalCost: 50,
        totalMessages: 100,
        totalSessions: 10,
        dailyCosts: [],
        dailyActivity: [],
        tokenComposition: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        modelBreakdown: [],
        hourCounts: {}
      };

      const sessions = [
        { messages: 5, cost: 2, duration: 0 },
        { messages: 10, cost: 5, duration: 0 },
        { messages: 15, cost: 8, duration: 0 },
        { messages: 20, cost: 12, duration: 0 },
        { messages: 25, cost: 15, duration: 0 },
      ];

      const insights = generateInsights(overview, sessions, null);
      const duration = insights.find(i => i.title.includes('Most sessions last'));
      assert.equal(duration, undefined, 'Should skip when no sessions have duration');
    });
  });
});

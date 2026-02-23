const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateInsights } = require('../src/analysis/insights.js');

describe('claudeSetupOverview insight', () => {
  const baseOverview = {
    tokenComposition: { input: 100, output: 100, cacheRead: 100, cacheWrite: 100, total: 400, percentages: {} },
    modelBreakdown: [{ modelId: 'claude-sonnet-4-5', totalCost: 1, displayName: 'Sonnet', costBreakdown: { input: 0.5, output: 0.3, cacheRead: 0.1, cacheWrite: 0.1 }, cacheReadInputTokens: 100 }],
    dailyActivity: [],
    hourCounts: {},
    totalMessages: 10,
    totalToolCalls: 5,
    totalCost: 1
  };

  it('returns setup insight when config is provided', () => {
    const config = {
      mcpServers: { total: 2, names: ['jira', 'postgres'] },
      commands: { total: 1, names: ['commit'] },
      hooks: { total: 0, events: [] },
      plugins: { total: 3, enabled: 2, names: ['Voicemode', 'Context7'] }
    };

    const insights = generateInsights(baseOverview, [], config);
    const setup = insights.find(i => i.title.includes('Your setup'));
    assert.ok(setup, 'should have a setup insight');
    assert.ok(setup.title.includes('2 MCP servers'));
    assert.ok(setup.title.includes('2 active plugins'));
    assert.ok(setup.title.includes('1 custom command'));
    assert.ok(setup.title.includes('0 hooks'));
    assert.ok(setup.detail.includes('jira'));
    assert.ok(setup.detail.includes('postgres'));
    assert.ok(setup.detail.includes('/commit'));
    assert.ok(setup.detail.includes('Voicemode'));
  });

  it('skips setup insight when config is null', () => {
    const insights = generateInsights(baseOverview, [], null);
    const setup = insights.find(i => i.title.includes('Your setup'));
    assert.equal(setup, undefined);
  });

  it('handles empty config gracefully', () => {
    const config = {
      mcpServers: { total: 0, names: [] },
      commands: { total: 0, names: [] },
      hooks: { total: 0, events: [] },
      plugins: { total: 0, enabled: 0, names: [] }
    };

    const insights = generateInsights(baseOverview, [], config);
    const setup = insights.find(i => i.title.includes('Your setup'));
    assert.ok(setup);
    assert.ok(setup.title.includes('0 MCP servers'));
    assert.ok(setup.description.includes('0 active configurations'));
    assert.ok(setup.description.includes('Adding MCP servers or hooks'));
  });

  it('shows hooks with event details', () => {
    const config = {
      mcpServers: { total: 0, names: [] },
      commands: { total: 0, names: [] },
      hooks: { total: 3, events: [{ event: 'PreToolUse', count: 2 }, { event: 'PostToolUse', count: 1 }] },
      plugins: { total: 0, enabled: 0, names: [] }
    };

    const insights = generateInsights(baseOverview, [], config);
    const setup = insights.find(i => i.title.includes('Your setup'));
    assert.ok(setup);
    assert.ok(setup.title.includes('3 hooks across 2 events'));
    assert.ok(setup.detail.includes('PreToolUse: 2 hooks'));
    assert.ok(setup.detail.includes('PostToolUse: 1 hook'));
  });
});

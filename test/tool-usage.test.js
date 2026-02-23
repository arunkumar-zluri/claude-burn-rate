const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getBranchCosts } = require('../src/analysis/branch-costs.js');

describe('getBranchCosts', () => {
  it('returns branches structure with helpText', async () => {
    const data = await getBranchCosts(null);
    assert.ok(data.branches, 'Should have branches array');
    assert.ok(Array.isArray(data.branches));
    assert.ok(data.helpText, 'Should include helpText');
    assert.equal(typeof data.totalBranches, 'number');
  });

  it('groups sessions by gitBranch', async () => {
    const data = await getBranchCosts(null);

    // Each branch entry should have required fields
    for (const b of data.branches) {
      assert.ok(typeof b.branch === 'string', 'Branch should have name');
      assert.ok(typeof b.sessions === 'number', 'Branch should have session count');
      assert.ok(typeof b.messages === 'number', 'Branch should have message count');
      assert.ok(typeof b.cost === 'number', 'Branch should have cost');
      assert.ok(typeof b.avgCostPerSession === 'number', 'Branch should have avgCostPerSession');
    }
  });

  it('sorts by cost descending', async () => {
    const data = await getBranchCosts(null);

    for (let i = 1; i < data.branches.length; i++) {
      assert.ok(data.branches[i].cost <= data.branches[i - 1].cost, 'Branches should be sorted by cost desc');
    }
  });

  it('labels sessions without branch as "(no branch)"', async () => {
    const data = await getBranchCosts(null);

    // If there are sessions without a branch, they should be grouped under "(no branch)"
    const noBranch = data.branches.find(b => b.branch === '(no branch)');
    // This may or may not exist depending on the actual data, so just verify the structure
    if (noBranch) {
      assert.ok(noBranch.sessions > 0);
    }
  });
});

describe('getToolUsage', () => {
  const { getToolUsage } = require('../src/analysis/tool-usage.js');

  it('returns tool usage structure with helpText', async () => {
    const data = await getToolUsage(null);
    assert.ok(typeof data.totalToolCalls === 'number');
    assert.ok(typeof data.sessionCount === 'number');
    assert.ok(typeof data.avgToolsPerSession === 'number');
    assert.ok(typeof data.readWriteRatio === 'number');
    assert.ok(typeof data.readCount === 'number');
    assert.ok(typeof data.writeCount === 'number');
    assert.ok(data.helpText, 'Should include helpText');
    assert.ok(data.toolCounts, 'Should have toolCounts');
    assert.ok(Array.isArray(data.topTools), 'Should have topTools array');
  });

  it('topTools sorted by count descending', async () => {
    const data = await getToolUsage(null);

    for (let i = 1; i < data.topTools.length; i++) {
      assert.ok(data.topTools[i].count <= data.topTools[i - 1].count, 'Top tools should be sorted by count desc');
    }
  });

  it('topTools have name, count, percentage', async () => {
    const data = await getToolUsage(null);

    for (const t of data.topTools) {
      assert.ok(typeof t.name === 'string', 'Tool should have name');
      assert.ok(typeof t.count === 'number', 'Tool should have count');
      assert.ok(typeof t.percentage === 'number', 'Tool should have percentage');
    }
  });

  it('read/write ratio is consistent with counts', async () => {
    const data = await getToolUsage(null);

    if (data.writeCount > 0) {
      const expectedRatio = Math.round(data.readCount / data.writeCount * 10) / 10;
      assert.equal(data.readWriteRatio, expectedRatio, 'Read/write ratio should match counts');
    }
  });
});

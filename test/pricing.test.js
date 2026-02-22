const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getPricing, calculateCost, calculateTotalCost, formatCost, formatTokens } = require('../src/cost/pricing.js');

describe('getPricing', () => {
  it('returns exact match for known model', () => {
    const p = getPricing('claude-opus-4-6');
    assert.equal(p.input, 15.00);
    assert.equal(p.output, 75.00);
    assert.equal(p.displayName, 'Claude Opus 4.6');
  });

  it('returns pricing for dated model ID', () => {
    const p = getPricing('claude-opus-4-5-20251101');
    assert.equal(p.input, 15.00);
    assert.equal(p.displayName, 'Claude Opus 4.5');
  });

  it('returns sonnet pricing for sonnet models', () => {
    const p = getPricing('claude-sonnet-4-5-20250929');
    assert.equal(p.input, 3.00);
    assert.equal(p.output, 15.00);
  });

  it('infers opus pricing for unknown opus model', () => {
    const p = getPricing('claude-opus-99');
    assert.equal(p.input, 15.00);
    assert.equal(p.output, 75.00);
  });

  it('returns fallback for completely unknown model', () => {
    const p = getPricing('some-random-model');
    assert.equal(p.input, 3.00);
  });
});

describe('calculateCost', () => {
  it('calculates cost for opus usage', () => {
    const result = calculateCost({
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 100000,
      cacheCreationInputTokens: 50000
    }, 'claude-opus-4-6');

    assert.ok(result.totalCost > 0);
    assert.equal(result.breakdown.inputTokens, 1000);
    assert.equal(result.breakdown.outputTokens, 500);

    // Expected: (1000/1M)*15 + (500/1M)*75 + (100000/1M)*1.5 + (50000/1M)*18.75
    const expected = 0.015 + 0.0375 + 0.15 + 0.9375;
    assert.ok(Math.abs(result.totalCost - expected) < 0.0001);
  });

  it('handles zero tokens', () => {
    const result = calculateCost({}, 'claude-opus-4-6');
    assert.equal(result.totalCost, 0);
  });
});

describe('calculateTotalCost', () => {
  it('sums costs across models', () => {
    const result = calculateTotalCost({
      'claude-opus-4-6': { inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      'claude-sonnet-4-5-20250929': { inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }
    });

    assert.ok(result.totalCost > 0);
    assert.ok(result.byModel['claude-opus-4-6']);
    assert.ok(result.byModel['claude-sonnet-4-5-20250929']);
    // Opus should cost more than Sonnet
    assert.ok(result.byModel['claude-opus-4-6'].totalCost > result.byModel['claude-sonnet-4-5-20250929'].totalCost);
  });
});

describe('formatCost', () => {
  it('formats large costs with 2 decimals', () => {
    assert.equal(formatCost(10.5), '$10.50');
    assert.equal(formatCost(1.0), '$1.00');
  });

  it('formats small costs with more precision', () => {
    assert.equal(formatCost(0.05), '$0.050');
    assert.equal(formatCost(0.001), '$0.0010');
  });
});

describe('formatTokens', () => {
  it('formats millions', () => {
    assert.equal(formatTokens(1500000), '1.5M');
  });

  it('formats thousands', () => {
    assert.equal(formatTokens(15000), '15.0K');
  });

  it('formats small numbers as-is', () => {
    assert.equal(formatTokens(500), '500');
  });
});

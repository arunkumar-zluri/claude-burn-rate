// Pricing per million tokens (USD)
// Source: https://docs.anthropic.com/en/docs/about-claude/pricing
const MODEL_PRICING = {
  'claude-opus-4-6': {
    input: 15.00,
    output: 75.00,
    cacheRead: 1.50,
    cacheWrite: 18.75,
    displayName: 'Claude Opus 4.6'
  },
  'claude-opus-4-5-20251101': {
    input: 15.00,
    output: 75.00,
    cacheRead: 1.50,
    cacheWrite: 18.75,
    displayName: 'Claude Opus 4.5'
  },
  'claude-sonnet-4-6': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
    displayName: 'Claude Sonnet 4.6'
  },
  'claude-sonnet-4-5-20250929': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
    displayName: 'Claude Sonnet 4.5'
  },
  'claude-haiku-4-5-20251001': {
    input: 0.80,
    output: 4.00,
    cacheRead: 0.08,
    cacheWrite: 1.00,
    displayName: 'Claude Haiku 4.5'
  }
};

// Fallback pricing for unknown models — estimate as Sonnet-tier
const FALLBACK_PRICING = {
  input: 3.00,
  output: 15.00,
  cacheRead: 0.30,
  cacheWrite: 3.75,
  displayName: 'Unknown Model'
};

function getPricing(modelId) {
  // Try exact match first
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];

  // Try prefix match (e.g. "claude-opus-4-6-20260101" matches "claude-opus-4-6")
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelId.startsWith(key)) return pricing;
  }

  // Infer from model name
  if (modelId.includes('opus')) return { ...FALLBACK_PRICING, input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 };
  if (modelId.includes('haiku')) return { ...FALLBACK_PRICING, input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 1.00 };

  return FALLBACK_PRICING;
}

function calculateCost(usage, modelId) {
  const pricing = getPricing(modelId);
  const perMillion = 1_000_000;

  const inputCost = ((usage.inputTokens || 0) / perMillion) * pricing.input;
  const outputCost = ((usage.outputTokens || 0) / perMillion) * pricing.output;
  const cacheReadCost = ((usage.cacheReadInputTokens || 0) / perMillion) * pricing.cacheRead;
  const cacheWriteCost = ((usage.cacheCreationInputTokens || 0) / perMillion) * pricing.cacheWrite;

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
    breakdown: {
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      cacheReadInputTokens: usage.cacheReadInputTokens || 0,
      cacheCreationInputTokens: usage.cacheCreationInputTokens || 0
    }
  };
}

function calculateTotalCost(modelUsage) {
  let totalCost = 0;
  const byModel = {};

  for (const [modelId, usage] of Object.entries(modelUsage)) {
    const cost = calculateCost(usage, modelId);
    const pricing = getPricing(modelId);
    totalCost += cost.totalCost;
    byModel[modelId] = {
      ...cost,
      displayName: pricing.displayName || modelId
    };
  }

  return { totalCost, byModel };
}

function formatCost(amount) {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

function formatTokens(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

module.exports = {
  MODEL_PRICING,
  getPricing,
  calculateCost,
  calculateTotalCost,
  formatCost,
  formatTokens
};

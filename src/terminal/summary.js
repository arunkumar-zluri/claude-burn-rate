const { readStatsCache } = require('../data/reader.js');
const { buildOverview } = require('../analysis/overview.js');
const { formatCost, formatTokens } = require('../cost/pricing.js');

async function printSummary() {
  const stats = await readStatsCache();
  const overview = buildOverview(stats);

  if (overview.empty) {
    console.log(overview.error);
    return;
  }

  const line = '─'.repeat(50);

  console.log(`
${line}
  claude-burn-rate — Usage Summary
${line}

  Total Estimated Cost:  ${formatCost(overview.totalCost)}
  Active Days:           ${overview.activeDays}
  Avg Cost/Day:          ${formatCost(overview.avgCostPerDay)}

  Sessions:              ${overview.totalSessions}
  Messages:              ${overview.totalMessages.toLocaleString()}
  Tool Calls:            ${overview.totalToolCalls.toLocaleString()}

${line}
  Model Breakdown
${line}
`);

  for (const model of overview.modelBreakdown) {
    console.log(`  ${model.displayName.padEnd(25)} ${formatCost(model.totalCost).padStart(12)}`);
    console.log(`    Input:      ${formatCost(model.costBreakdown.input).padStart(10)}    Output:     ${formatCost(model.costBreakdown.output).padStart(10)}`);
    console.log(`    Cache Read: ${formatCost(model.costBreakdown.cacheRead).padStart(10)}    Cache Write:${formatCost(model.costBreakdown.cacheWrite).padStart(10)}`);
    console.log();
  }

  console.log(`${line}
  Token Composition
${line}
`);

  const tc = overview.tokenComposition;
  console.log(`  Input:       ${formatTokens(tc.input).padStart(10)}  (${tc.percentages.input}%)`);
  console.log(`  Output:      ${formatTokens(tc.output).padStart(10)}  (${tc.percentages.output}%)`);
  console.log(`  Cache Read:  ${formatTokens(tc.cacheRead).padStart(10)}  (${tc.percentages.cacheRead}%)`);
  console.log(`  Cache Write: ${formatTokens(tc.cacheWrite).padStart(10)}  (${tc.percentages.cacheWrite}%)`);
  console.log(`  Total:       ${formatTokens(tc.total).padStart(10)}`);

  console.log(`\n${line}
  Date Range: ${overview.dateRange.start} to ${overview.dateRange.end}
${line}
`);
}

module.exports = { printSummary };

const { readStatsCache } = require('../data/reader.js');
const { buildOverview } = require('../analysis/overview.js');
const { formatCost, formatTokens } = require('../cost/pricing.js');

async function exportData(format) {
  const stats = await readStatsCache();
  const overview = buildOverview(stats);

  if (overview.empty) {
    console.error(overview.error);
    process.exit(1);
  }

  switch (format.toLowerCase()) {
    case 'json':
      console.log(JSON.stringify(overview, null, 2));
      break;
    case 'csv':
      exportCSV(overview);
      break;
    case 'markdown':
    case 'md':
      exportMarkdown(overview);
      break;
    default:
      console.error(`Unknown format: ${format}. Use json, csv, or markdown.`);
      process.exit(1);
  }
}

function exportCSV(overview) {
  // Daily activity CSV
  console.log('date,messages,sessions,tool_calls');
  for (const day of overview.dailyActivity) {
    console.log(`${day.date},${day.messageCount},${day.sessionCount},${day.toolCallCount}`);
  }
  console.log();

  // Model breakdown CSV
  console.log('model,input_cost,output_cost,cache_read_cost,cache_write_cost,total_cost');
  for (const model of overview.modelBreakdown) {
    console.log(`${model.displayName},${model.costBreakdown.input.toFixed(4)},${model.costBreakdown.output.toFixed(4)},${model.costBreakdown.cacheRead.toFixed(4)},${model.costBreakdown.cacheWrite.toFixed(4)},${model.totalCost.toFixed(4)}`);
  }
}

function exportMarkdown(overview) {
  console.log(`# Claude Code Usage Report\n`);
  console.log(`**Period:** ${overview.dateRange.start} to ${overview.dateRange.end}\n`);
  console.log(`## Summary\n`);
  console.log(`| Metric | Value |`);
  console.log(`| --- | --- |`);
  console.log(`| Total Estimated Cost | ${formatCost(overview.totalCost)} |`);
  console.log(`| Sessions | ${overview.totalSessions} |`);
  console.log(`| Messages | ${overview.totalMessages.toLocaleString()} |`);
  console.log(`| Tool Calls | ${overview.totalToolCalls.toLocaleString()} |`);
  console.log(`| Active Days | ${overview.activeDays} |`);
  console.log(`| Avg Cost/Day | ${formatCost(overview.avgCostPerDay)} |`);
  console.log();
  console.log(`## Model Breakdown\n`);
  console.log(`| Model | Input | Output | Cache Read | Cache Write | Total |`);
  console.log(`| --- | ---: | ---: | ---: | ---: | ---: |`);
  for (const m of overview.modelBreakdown) {
    console.log(`| ${m.displayName} | ${formatCost(m.costBreakdown.input)} | ${formatCost(m.costBreakdown.output)} | ${formatCost(m.costBreakdown.cacheRead)} | ${formatCost(m.costBreakdown.cacheWrite)} | ${formatCost(m.totalCost)} |`);
  }
  console.log();
  console.log(`## Token Composition\n`);
  const tc = overview.tokenComposition;
  console.log(`| Type | Count | % |`);
  console.log(`| --- | ---: | ---: |`);
  console.log(`| Input | ${formatTokens(tc.input)} | ${tc.percentages.input}% |`);
  console.log(`| Output | ${formatTokens(tc.output)} | ${tc.percentages.output}% |`);
  console.log(`| Cache Read | ${formatTokens(tc.cacheRead)} | ${tc.percentages.cacheRead}% |`);
  console.log(`| Cache Write | ${formatTokens(tc.cacheWrite)} | ${tc.percentages.cacheWrite}% |`);
}

module.exports = { exportData };

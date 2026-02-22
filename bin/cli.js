#!/usr/bin/env node

const { createServer } = require('../src/server/server.js');

const args = process.argv.slice(2);
const port = parseInt(getArg(args, '--port', '-p') || '3456', 10);
const summaryMode = args.includes('--summary') || args.includes('-s');
const helpMode = args.includes('--help') || args.includes('-h');
const exportFormat = getArg(args, '--export', '-e');
const watchMode = args.includes('--watch') || args.includes('-w');

if (helpMode) {
  console.log(`
claude-burn-rate — Claude Code usage analytics dashboard

Usage:
  claude-burn-rate              Open browser dashboard
  claude-burn-rate --summary    Quick terminal summary
  claude-burn-rate --export csv Export data (json|csv|markdown)

Options:
  -p, --port <port>    Server port (default: 3456)
  -s, --summary        Terminal summary mode
  -e, --export <fmt>   Export format: json, csv, markdown
  -w, --watch          Watch mode with live updates
  -h, --help           Show this help
`);
  process.exit(0);
}

if (summaryMode) {
  const { printSummary } = require('../src/terminal/summary.js');
  printSummary().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
} else if (exportFormat) {
  const { exportData } = require('../src/export/exporter.js');
  exportData(exportFormat).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
} else {
  createServer({ port, watch: watchMode }).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

function getArg(args, long, short) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === long || args[i] === short) {
      return args[i + 1];
    }
    if (args[i].startsWith(long + '=')) {
      return args[i].split('=')[1];
    }
  }
  return null;
}

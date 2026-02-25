<h1 align="center">claude-burn-rate</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/claude-burn-rate"><img src="https://img.shields.io/npm/v/claude-burn-rate.svg" alt="npm version"></a>
  <a href="https://github.com/arunkumar-zluri/claude-burn-rate/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/claude-burn-rate.svg" alt="license"></a>
  <img src="https://img.shields.io/node/v/claude-burn-rate.svg" alt="node version">
</p>

<p align="center"><strong>Know exactly where your Claude Code dollars go.</strong></p>

<p align="center">
A privacy-first CLI dashboard that turns your local <code>~/.claude</code> session files into rich usage analytics — cost breakdowns, session history, security audits, and more.<br>Zero data collection. Zero external calls. Everything stays on your machine.
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/arunkumar-zluri/claude-burn-rate/main/docs/screenshots/overview.png" alt="Dashboard overview — cost summary cards, daily activity chart, token breakdown, and model cost distribution" width="100%"/>
</p>

## Quick Start

```bash
npx claude-burn-rate
```

A browser dashboard opens at `localhost:3456` with your full usage analytics. No API keys, no config, no setup.

To install globally:

```bash
npm install -g claude-burn-rate
```

---

## Features

### Overview

Summary cards for total cost, sessions, messages, and tool calls. Daily activity charts, token composition breakdown, cost by model, and key insights — all at a glance.

### Usage Analytics

**Sessions** — Searchable, sortable table of every session with date, project, summary, message count, estimated cost, and duration.

**Projects** — Per-project cost and usage breakdown with bar charts, a leaderboard, and branch-level cost analysis.

**Patterns** — Usage heatmap by hour of day, peak hours chart, and week-over-week comparisons. See when you're most productive (or most expensive).

**Tool Usage** — Breakdown of every tool Claude invoked across your sessions.

<p align="center">
  <img src="https://raw.githubusercontent.com/arunkumar-zluri/claude-burn-rate/main/docs/screenshots/projects.png" alt="Usage tab showing project cost breakdown, leaderboard, and branch cost analysis" width="100%"/>
</p>

### Insights & Gamification

**Efficiency Score** — A composite score based on cache hit rates, model selection, and cost concentration.

**Achievements** — Unlock badges as you hit milestones: First $100, Cache Master, Night Owl, and more.

**Streaks** — Track consecutive days of Claude Code usage.

**Expensive Prompts** — Find your costliest individual prompts across all sessions with per-prompt token breakdowns and optimization tips.

**Contributions** — Lines written, lines edited, files touched, and co-authored git commits. See which files Claude edits most.

<p align="center">
  <img src="https://raw.githubusercontent.com/arunkumar-zluri/claude-burn-rate/main/docs/screenshots/insights.png" alt="Insights tab with efficiency score ring, usage streak, and achievement badges" width="100%"/>
</p>

### Security Audit

A complete audit of everything Claude accessed during your sessions:

- **Risk Posture Score** — Overall security rating based on sensitive file access, dangerous commands, and out-of-scope activity
- **Secret Detection** — Flags bearer tokens, API keys (OpenAI, AWS, GitHub, Atlassian), passwords, and credentials found in commands
- **Dangerous Sessions** — Sessions with the highest concentration of risky operations
- **MCP Risk Analysis** — Identifies high-risk Model Context Protocol server activity
- **File Access Log** — Every file read, written, or edited, with sensitive path highlighting
- **Bash Command Log** — Commands categorized as destructive, permission changes, network, package managers, or safe
- **Directory Scope Map** — In-project vs out-of-project access, with flags on out-of-scope paths

<p align="center">
  <img src="https://raw.githubusercontent.com/arunkumar-zluri/claude-burn-rate/main/docs/screenshots/security.png" alt="Security audit showing risk posture score, secrets exposed, dangerous sessions, and high-risk MCP findings" width="100%"/>
</p>

### Light & Dark Theme

Toggle between light and dark mode from the header. Your preference is saved across sessions.

---

## CLI Reference

```
claude-burn-rate              # Open browser dashboard (default)
claude-burn-rate --summary    # Quick terminal summary
claude-burn-rate --export csv # Export data (json|csv|markdown)
```

| Flag | Short | Description |
|------|-------|-------------|
| `--port <port>` | `-p` | Server port (default: 3456) |
| `--summary` | `-s` | Print terminal summary and exit |
| `--export <fmt>` | `-e` | Export as `json`, `csv`, or `markdown` |
| `--watch` | `-w` | Watch mode with live updates |
| `--help` | `-h` | Show help |

### Terminal Summary

```bash
$ claude-burn-rate --summary

──────────────────────────────────────────────────
  claude-burn-rate — Usage Summary
──────────────────────────────────────────────────

  Total Estimated Cost:  $142.58
  Active Days:           12
  Avg Cost/Day:          $11.88

  Sessions:              34
  Messages:              4,210
  Tool Calls:            891

──────────────────────────────────────────────────
```

### Exports

```bash
# JSON — pipe into jq, scripts, or other tools
claude-burn-rate --export json > usage.json

# CSV — open in Excel, Google Sheets, etc.
claude-burn-rate --export csv > sessions.csv

# Markdown — paste into docs, PRs, or Notion
claude-burn-rate --export markdown > report.md
```

### Filtering

All dashboard tabs support filtering by **date range** and **project**.

---

## How It Works

claude-burn-rate reads the JSONL session files from `~/.claude/projects/` that Claude Code already creates on your machine. It parses token usage, tool calls, timestamps, and model identifiers, then computes costs using [Anthropic's published pricing](https://docs.anthropic.com/en/docs/about-claude/pricing).

**Supported models:** Opus 4.5/4.6, Sonnet 4.5/4.6, Haiku 4.5 — with automatic fallback pricing for unknown models.

**Requirements:** Node.js 18+. No dependencies beyond one small package (`open`).

---

## Privacy

claude-burn-rate is designed to be fully offline:

- **No network requests** — the dashboard is served locally and reads only local files
- **No telemetry** — no usage tracking, analytics, or crash reporting
- **No data collection** — nothing is sent anywhere, ever
- **No API keys required** — everything is computed from files already on your machine

Your data never leaves your machine. You can verify this — the package has a single dependency (`open`, for launching the browser) and makes zero HTTP calls.

---

## License

MIT

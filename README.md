# claude-burn-rate

**Know exactly where your Claude Code dollars go.**

A privacy-first CLI dashboard that turns your local `~/.claude` session files into rich usage analytics — cost breakdowns, session history, security audits, and more. Zero data collection. Zero external calls. Everything stays on your machine.

---

## Why claude-burn-rate?

If you use Claude Code daily, costs add up fast. But there's no built-in way to answer simple questions:

- *How much did I spend this week?*
- *Which project is burning the most tokens?*
- *Am I using cache efficiently?*
- *What did Claude access on my filesystem?*

**claude-burn-rate** answers all of that — in seconds — using data Claude Code already stores locally.

---

## Quick Start

```bash
npx claude-burn-rate
```

That's it. A browser dashboard opens at `localhost:3456` with your full usage analytics.

To install globally:

```bash
npm install -g claude-burn-rate
```

Requires **Node.js 18+**. No API keys, no config, no setup.

---

## What You Get

### Overview
Summary cards for total cost, sessions, messages, and tool calls. Daily activity charts, token composition breakdown, cost by model, and key insights — all at a glance.

### Sessions
Searchable, sortable table of every session — date, project, summary, message count, estimated cost, and duration.

### Projects
Per-project cost and usage breakdown with bar charts and a leaderboard.

### Patterns
Usage heatmap by hour of day, peak hours chart, and week-over-week comparisons. See when you're most productive (or most expensive).

### Expensive Prompts
Finds your costliest individual prompts across all sessions. Per-prompt cost, full token breakdown, and optimization tips.

### Personalized Insights
Analysis of your usage patterns — cache efficiency, model selection, cost concentration, and actionable recommendations. Includes an **efficiency score**, **achievement badges** (First $100, Cache Master, Night Owl, and more), and **usage streaks**.

### Contributions
Lines written, lines edited, files touched, and co-authored git commits. See which files Claude edits most.

### Security Audit
A complete audit of everything Claude accessed during your sessions:
- **File access log** — every file read, written, or edited, with sensitive path highlighting
- **Bash command log** — commands categorized as destructive, permission changes, network, package managers, or safe
- **Directory scope map** — in-project vs out-of-project access, with flags on out-of-scope paths
- **Secret detection** — flags bearer tokens, API keys (OpenAI, AWS, GitHub, Atlassian), passwords, and credentials found in commands

Sensitive path detection covers `.env`, `.ssh/`, `.aws/`, `.gnupg/`, credential files, `.pem`/`.key` files, and system directories.

---

## CLI Options

```bash
claude-burn-rate                    # Open browser dashboard (default)
claude-burn-rate --summary          # Quick terminal summary
claude-burn-rate --export json      # Export as JSON
claude-burn-rate --export csv       # Export as CSV
claude-burn-rate --export markdown  # Export as Markdown
claude-burn-rate --port 8080        # Custom port
claude-burn-rate --watch            # Live reload on new sessions
```

| Flag | Short | Description |
|------|-------|-------------|
| `--port <port>` | `-p` | Server port (default: 3456) |
| `--summary` | `-s` | Print terminal summary and exit |
| `--export <fmt>` | `-e` | Export as `json`, `csv`, or `markdown` |
| `--watch` | `-w` | Watch mode with live updates |
| `--help` | `-h` | Show help |

---

## Filtering

All dashboard tabs support filtering by:
- **Date range** — pick start and end dates
- **Project** — narrow down to a specific project

---

## How It Works

claude-burn-rate reads the JSONL session files from `~/.claude/projects/` that Claude Code already creates on your machine. It parses token usage, tool calls, timestamps, and model identifiers, then computes costs using [Anthropic's published pricing](https://docs.anthropic.com/en/docs/about-claude/pricing).

**Supported models:** Opus 4.5/4.6, Sonnet 4.5/4.6, Haiku 4.5 — with automatic fallback pricing for unknown models.

No API keys. No network requests. No telemetry. Your data never leaves your machine.

---

## License

MIT

# claude-burn-rate

Privacy-first CLI dashboard for Claude Code usage analytics. All data stays local — reads from `~/.claude` session files already on your machine. Zero data collection, zero external calls.

## Install

```bash
npm install -g claude-burn-rate
```

Or run without installing:

```bash
npx claude-burn-rate
```

Requires Node.js 18+.

## Usage

```bash
# Open the browser dashboard (default)
claude-burn-rate

# Quick terminal summary
claude-burn-rate --summary

# Export data
claude-burn-rate --export json
claude-burn-rate --export csv
claude-burn-rate --export markdown

# Custom port
claude-burn-rate --port 8080

# Watch mode — live reload on new sessions
claude-burn-rate --watch
```

## Dashboard Tabs

### Overview
Summary cards (total cost, sessions, messages, tool calls), daily activity charts, token composition breakdown, cost by model, and key insights at a glance.

### Sessions
Full session list with date, project, summary, message count, estimated cost, and duration. Sortable columns.

### Projects
Cost and usage breakdown per project. Bar chart and leaderboard table.

### Patterns
Usage heatmap by hour of day, peak hours chart, and weekly comparison.

### Expensive Prompts
Finds your costliest prompts across all sessions with per-prompt cost, token breakdown, and optimization tips.

### Personalized Insights
AI-style analysis of your usage patterns — cache efficiency, model selection, session length, and actionable recommendations. Includes a gamification score, achievement badges, and usage streaks.

### Contributions
Lines written, lines edited, files touched, and co-authored git commits. Top edited files list.

### Security
Audit of everything Claude accessed during your sessions:
- **Summary cards** — files accessed, bash commands (with flagged count), directories reached, sensitive path flags
- **File access audit** — sortable table of every file read/written/edited, with sensitive path highlighting
- **Bash command log** — commands categorized as destructive, permission changes, network/external, package managers, or safe. Destructive and permission categories auto-expand
- **Directory scope map** — directories grouped by in-project vs outside-project, with sensitive flags on out-of-scope access

Sensitive path detection covers: `.env` files, `.ssh/`, `.aws/`, `.gnupg/`, credential/secret/password files, `.pem`/`.key` files, and `/etc/`/`/var/` system directories.

## Filtering

All tabs support filtering by:
- **Date range** — from/to dates
- **Project** — filter to a specific project

Click the Filters button at the top to open the filter bar.

## How It Works

Reads session JSONL files from `~/.claude/projects/` that Claude Code already creates. Parses token usage, tool calls, timestamps, and model info to compute costs using Anthropic's published pricing.

No API keys needed. No data leaves your machine.

## Options

| Flag | Short | Description |
|------|-------|-------------|
| `--port <port>` | `-p` | Server port (default: 3456) |
| `--summary` | `-s` | Print terminal summary and exit |
| `--export <fmt>` | `-e` | Export as `json`, `csv`, or `markdown` |
| `--watch` | `-w` | Watch mode with live updates |
| `--help` | `-h` | Show help |

## Development

```bash
git clone https://github.com/arunkumar-zluri/claude-burn-rate.git
cd claude-burn-rate
npm install
npm test
npm start
```

## License

MIT

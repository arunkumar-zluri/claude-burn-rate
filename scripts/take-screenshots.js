#!/usr/bin/env node
/**
 * Takes dashboard screenshots using Puppeteer with realistic dummy data.
 * Usage: npx puppeteer node scripts/take-screenshots.js
 *   or:  node scripts/take-screenshots.js  (if puppeteer is in node_modules)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const DASHBOARD_HTML = path.join(__dirname, '..', 'src', 'dashboard', 'index.html');
const SCREENSHOT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');

// ──────────────────────────────────────────────
//  Dummy API data — realistic, impressive values
// ──────────────────────────────────────────────

const today = new Date();
const dates = Array.from({ length: 21 }, (_, i) => {
  const d = new Date(today);
  d.setDate(d.getDate() - 20 + i);
  return d.toISOString().split('T')[0];
});

const DUMMY = {
  'projects-list': ['claude-burn-rate', 'acme-backend', 'react-dashboard', 'ml-pipeline', 'docs-site'],

  overview: {
    dateRange: { start: dates[0], end: dates[dates.length - 1] },
    activeDays: 18,
    totalCost: 127.43,
    avgCostPerDay: 7.08,
    totalSessions: 284,
    avgSessionsPerDay: 15.8,
    totalMessages: 4218,
    avgMessagesPerDay: 234,
    totalToolCalls: 12847,
    dailyActivity: dates.map((date, i) => ({
      date,
      messageCount: 120 + Math.floor(Math.sin(i * 0.7) * 80 + Math.random() * 60),
      toolCallCount: 350 + Math.floor(Math.sin(i * 0.5) * 200 + Math.random() * 150),
      sessionCount: 8 + Math.floor(Math.sin(i * 0.9) * 6 + Math.random() * 4),
    })),
    dailyTokens: dates.map((date, i) => ({
      date,
      byModel: {
        'claude-sonnet-4-6': 180000 + Math.floor(Math.random() * 120000),
        'claude-opus-4-6': 90000 + Math.floor(Math.random() * 80000),
        'claude-haiku-4-5-20251001': 40000 + Math.floor(Math.random() * 30000),
      },
    })),
    modelBreakdown: [
      { displayName: 'Sonnet 4.6', totalCost: 58.21, costBreakdown: { input: 18.40, output: 29.10, cacheRead: 7.32, cacheWrite: 3.39 } },
      { displayName: 'Opus 4.6', totalCost: 52.87, costBreakdown: { input: 22.15, output: 24.60, cacheRead: 4.12, cacheWrite: 2.00 } },
      { displayName: 'Haiku 4.5', totalCost: 16.35, costBreakdown: { input: 5.80, output: 8.20, cacheRead: 1.85, cacheWrite: 0.50 } },
    ],
    tokenComposition: { input: 4850000, output: 6200000, cacheRead: 2100000, cacheWrite: 890000 },
  },

  insights: [
    {
      title: 'High cache hit rate — saving ~$32/week',
      severity: 'info',
      description: 'Your 68% cache hit rate is well above average. Long sessions reuse context efficiently, reducing redundant token costs. Keep leveraging session continuity for complex tasks.',
      helpText: 'Cache hits mean Claude reuses previously processed context instead of re-reading it. Higher rates = lower costs. Improve by using longer sessions for related tasks.',
    },
    {
      title: 'Opus usage doubled this week',
      severity: 'warning',
      description: 'Opus 4.6 usage increased 108% week-over-week. 14 sessions used Opus for tasks under 5 messages — these could use Sonnet at 1/5th the cost.',
      detail: 'Affected sessions: acme-backend (6), react-dashboard (5), ml-pipeline (3)\nEstimated savings if switched: ~$8.40/week',
      helpText: 'Model selection matters — Opus excels at complex reasoning but Sonnet handles routine coding well. Use /model sonnet for quick tasks.',
    },
    {
      title: 'Weekend usage pattern detected',
      severity: 'info',
      description: 'You average 22 sessions on weekdays vs 8 on weekends. Weekend sessions are 40% longer on average, suggesting deeper exploration work.',
    },
    {
      title: '3 sessions exceeded $5 each',
      severity: 'warning',
      description: 'Three sessions this week each cost over $5. The most expensive ($8.72) was a refactoring task in ml-pipeline that ran for 2.5 hours with 847 tool calls.',
      detail: 'ml-pipeline refactor: $8.72 (847 tools, 2h 34m)\nacme-backend API redesign: $6.14 (612 tools, 1h 48m)\nreact-dashboard migration: $5.89 (523 tools, 1h 22m)',
      helpText: 'Expensive sessions aren\'t necessarily bad — they often represent high-value work. But check if tasks could be broken into smaller, more focused sessions.',
    },
  ],

  gamification: {
    score: {
      total: 74,
      factors: { cache: 82, modelChoice: 58, sessionEfficiency: 76, costTrend: 70 },
    },
    streak: { current: 12, longest: 18 },
    achievements: [
      { title: 'First Dollar', icon: 'dollar', description: 'Spent your first dollar on Claude', unlocked: true },
      { title: 'Cache Master', icon: 'cache', description: 'Achieved 70%+ cache hit rate', unlocked: true },
      { title: 'Sonnet Singer', icon: 'sonnet', description: 'Use Sonnet for 50%+ of short tasks', unlocked: false, progress: '38/50 sessions' },
      { title: 'Marathon Coder', icon: 'marathon', description: 'Single session over 2 hours', unlocked: true },
      { title: 'Night Owl', icon: 'night', description: '10+ sessions after midnight', unlocked: true },
      { title: 'Centurion', icon: 'centurion', description: 'Reach 100 sessions', unlocked: true },
      { title: 'Toolsmith', icon: 'toolsmith', description: '10,000+ tool calls total', unlocked: true },
      { title: 'Whale', icon: 'whale', description: 'Spend over $100 total', unlocked: true },
      { title: 'Penny Pincher', icon: 'penny', description: '5 sessions under $0.10 each', unlocked: true },
      { title: 'Fire Streak', icon: 'fire', description: '7+ day active streak', unlocked: true },
      { title: 'Dedicated', icon: 'dedicated', description: '30+ day active streak', unlocked: false, progress: '12/30 days' },
      { title: 'Money Bags', icon: 'money', description: 'Spend over $500 total', unlocked: false, progress: '$127 / $500' },
    ],
  },

  'expensive-prompts': [
    {
      cost: 8.72,
      prompt: 'Refactor the entire data pipeline module to use async iterators instead of callbacks. Update all tests and ensure backward compatibility with the existing API consumers.',
      model: 'claude-opus-4-6',
      messages: 47,
      toolCalls: 847,
      duration: 9240,
      project: 'ml-pipeline',
      date: dates[dates.length - 2],
      reasons: ['Extended session with 847 tool calls', 'Opus model for complex refactoring'],
    },
    {
      cost: 6.14,
      prompt: 'Redesign the REST API endpoints to follow OpenAPI 3.1 spec. Add request validation, proper error responses, and generate TypeScript client SDK from the schema.',
      model: 'claude-opus-4-6',
      messages: 38,
      toolCalls: 612,
      duration: 6480,
      project: 'acme-backend',
      date: dates[dates.length - 3],
      reasons: ['Large API surface area redesign', 'SDK generation with type safety'],
    },
    {
      cost: 5.89,
      prompt: 'Migrate the dashboard from Create React App to Vite. Update all imports, fix CSS module paths, and ensure hot reload works for all components.',
      model: 'claude-sonnet-4-6',
      messages: 52,
      toolCalls: 523,
      duration: 4920,
      project: 'react-dashboard',
      date: dates[dates.length - 5],
      reasons: ['Migration across 200+ files', 'Build config complexity'],
    },
  ],

  contributions: {
    totalLinesWritten: 14823,
    totalLinesEdited: 6247,
    totalFilesTouched: 342,
    coAuthoredCommits: 89,
    topFiles: [
      { file: 'src/api/handlers.ts', changes: 47 },
      { file: 'src/pipeline/async-iterator.ts', changes: 38 },
      { file: 'src/components/Dashboard.tsx', changes: 35 },
      { file: 'tests/api/handlers.test.ts', changes: 31 },
      { file: 'src/schema/openapi.yaml', changes: 28 },
      { file: 'src/utils/validation.ts', changes: 24 },
      { file: 'vite.config.ts', changes: 22 },
      { file: 'src/pipeline/transforms.ts', changes: 19 },
      { file: 'src/components/Charts.tsx', changes: 17 },
      { file: 'package.json', changes: 15 },
    ],
  },

  sessions: (() => {
    const projects = ['claude-burn-rate', 'acme-backend', 'react-dashboard', 'ml-pipeline', 'docs-site'];
    const summaries = [
      'Refactored data pipeline to use async iterators',
      'Added OpenAPI 3.1 schema validation',
      'Migrated build system from CRA to Vite',
      'Fixed authentication middleware race condition',
      'Implemented dark/light theme toggle',
      'Added real-time WebSocket notifications',
      'Created E2E tests for checkout flow',
      'Optimized database query performance',
      'Built CSV export for analytics data',
      'Added rate limiting to public API endpoints',
      'Refactored state management to use Zustand',
      'Fixed memory leak in SSE connection handler',
      'Updated dependencies and resolved audit issues',
      'Added pagination to project listing endpoint',
      'Implemented search with fuzzy matching',
    ];
    return Array.from({ length: 40 }, (_, i) => ({
      date: dates[Math.floor(Math.random() * dates.length)],
      project: projects[Math.floor(Math.random() * projects.length)],
      summary: summaries[i % summaries.length],
      messages: 5 + Math.floor(Math.random() * 45),
      cost: +(0.15 + Math.random() * 4.5).toFixed(2),
      duration: 120 + Math.floor(Math.random() * 7200),
    })).sort((a, b) => b.date.localeCompare(a.date));
  })(),

  projects: [
    { project: 'acme-backend', sessions: 82, messages: 1240, cost: 42.18 },
    { project: 'react-dashboard', sessions: 68, messages: 986, cost: 31.56 },
    { project: 'ml-pipeline', sessions: 54, messages: 820, cost: 28.94 },
    { project: 'claude-burn-rate', sessions: 45, messages: 678, cost: 15.42 },
    { project: 'docs-site', sessions: 35, messages: 494, cost: 9.33 },
  ],

  patterns: {
    hourCounts: Object.fromEntries(
      Array.from({ length: 24 }, (_, h) => {
        const peak = h >= 9 && h <= 17 ? 15 + Math.floor(Math.random() * 20) : h >= 21 || h <= 2 ? 5 + Math.floor(Math.random() * 8) : Math.floor(Math.random() * 5);
        return [h, peak];
      })
    ),
    weeklyComparison: Array.from({ length: 8 }, (_, i) => {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - (7 - i) * 7);
      return {
        week: i + 1,
        weekStart: weekStart.toISOString().split('T')[0],
        messages: 300 + Math.floor(Math.random() * 250 + i * 30),
        sessions: 20 + Math.floor(Math.random() * 15 + i * 2),
      };
    }),
  },

  'tool-usage': {
    totalToolCalls: 12847,
    avgToolsPerSession: 45.2,
    readWriteRatio: 3.2,
    topTools: [
      { name: 'Read', count: 4280 },
      { name: 'Edit', count: 2840 },
      { name: 'Bash', count: 1920 },
      { name: 'Write', count: 1340 },
      { name: 'Grep', count: 1120 },
      { name: 'Glob', count: 780 },
      { name: 'Task', count: 340 },
      { name: 'WebFetch', count: 227 },
    ],
    helpText: 'Read is your most-used tool — healthy for understanding code before modifying it. Your 3.2:1 read:write ratio shows careful, deliberate development.',
  },

  'branch-costs': {
    branches: [
      { project: 'acme-backend', branch: 'feat/openapi-migration', cost: 12.40, sessions: 8 },
      { project: 'ml-pipeline', branch: 'refactor/async-iterators', cost: 10.85, sessions: 6 },
      { project: 'react-dashboard', branch: 'feat/vite-migration', cost: 8.92, sessions: 7 },
      { project: 'acme-backend', branch: 'fix/auth-race-condition', cost: 4.21, sessions: 3 },
      { project: 'claude-burn-rate', branch: 'feat/theme-toggle', cost: 3.68, sessions: 4 },
      { project: 'docs-site', branch: 'main', cost: 2.90, sessions: 5 },
    ],
  },

  security: {
    summary: {
      totalBashCommands: 1920,
      totalFilesAccessed: 4280,
      totalDirectories: 47,
      secretsInBashCount: 2,
      dangerousSessionCount: 1,
      mcpHighRiskCount: 1,
      outsideProjectWriteCount: 3,
      anomalyCount: 1,
      sensitiveFlags: 4,
      flaggedBashCommands: 18,
    },
    secretsInBash: [
      { command: 'curl -H "Authorization: Bearer sk-ant-api03-xxxx...redacted" https://api.anthropic.com/v1/messages', secrets: ['API Key'], date: dates[dates.length - 3] + 'T14:22:00Z' },
      { command: 'export GITHUB_TOKEN=ghp_xxxxxxxxxxxx && gh pr create', secrets: ['GitHub Token'], date: dates[dates.length - 7] + 'T09:15:00Z' },
    ],
    dangerousSessions: {
      'a1b2c3d4e5f6': {
        mode: 'bypassPermissions',
        projectPath: 'acme-backend',
        date: dates[dates.length - 4] + 'T16:30:00Z',
        flaggedCommands: ['rm -rf dist/', 'chmod 777 deploy.sh', 'npm publish --access public'],
      },
    },
    mcpRiskAssessments: [
      {
        name: 'custom-db-server',
        command: '/usr/local/bin/mcp-db-proxy',
        riskLevel: 'high',
        unknownCommand: true,
        exposedSecrets: [
          { name: 'DATABASE_URL', preview: 'postgres://admin:****@prod-db...' },
          { name: 'REDIS_PASSWORD', preview: '****' },
          { name: 'JWT_SECRET', preview: '****' },
        ],
      },
      {
        name: 'github-mcp',
        command: 'npx @modelcontextprotocol/server-github',
        riskLevel: 'low',
        unknownCommand: false,
        exposedSecrets: [{ name: 'GITHUB_TOKEN', preview: 'ghp_****' }],
      },
    ],
    outsideProjectWrites: [
      { path: '~/.zshrc', writes: 1, edits: 2, sensitive: true },
      { path: '~/.ssh/config', writes: 0, edits: 1, sensitive: true },
      { path: '/tmp/debug-output.log', writes: 3, edits: 0, sensitive: false },
    ],
    anomalies: [
      {
        sessionId: 'f8e7d6c5b4a3',
        projectPath: 'ml-pipeline',
        date: dates[dates.length - 2] + 'T22:15:00Z',
        flags: ['4.2x avg writes', '3.8x avg deletes'],
      },
    ],
    fileAccess: Array.from({ length: 60 }, (_, i) => ({
      path: [
        'src/api/handlers.ts', 'src/pipeline/async-iterator.ts', 'tests/api/handlers.test.ts',
        'src/components/Dashboard.tsx', 'src/schema/openapi.yaml', 'package.json',
        'src/utils/validation.ts', 'tsconfig.json', '.eslintrc.js', 'src/index.ts',
      ][i % 10],
      reads: 5 + Math.floor(Math.random() * 30),
      writes: Math.floor(Math.random() * 8),
      edits: Math.floor(Math.random() * 12),
      total: 10 + Math.floor(Math.random() * 40),
      sensitive: i < 2,
    })),
    bashCommands: {
      sudo: [
        { command: 'sudo chmod 755 /etc/nginx/conf.d/app.conf', date: dates[dates.length - 5] + 'T11:20:00Z' },
      ],
      destructive: [
        { command: 'rm -rf dist/', date: dates[dates.length - 4] + 'T16:32:00Z' },
        { command: 'rm -rf node_modules/', date: dates[dates.length - 6] + 'T09:10:00Z' },
        { command: 'git reset --hard HEAD~3', date: dates[dates.length - 8] + 'T14:45:00Z' },
      ],
      permissions: [
        { command: 'chmod 777 deploy.sh', date: dates[dates.length - 4] + 'T16:33:00Z' },
        { command: 'chmod +x scripts/migrate.sh', date: dates[dates.length - 9] + 'T10:15:00Z' },
      ],
      network: [
        { command: 'curl https://api.anthropic.com/v1/messages', date: dates[dates.length - 3] + 'T14:22:00Z' },
        { command: 'wget https://releases.hashicorp.com/terraform/1.5.0/terraform_1.5.0_linux_amd64.zip', date: dates[dates.length - 10] + 'T08:30:00Z' },
        { command: 'ssh deploy@staging.example.com "pm2 restart all"', date: dates[dates.length - 6] + 'T17:00:00Z' },
      ],
      packageManagers: [
        { command: 'npm install', date: dates[dates.length - 1] + 'T09:00:00Z' },
        { command: 'npm audit fix', date: dates[dates.length - 3] + 'T10:00:00Z' },
        { command: 'npx tsc --noEmit', date: dates[dates.length - 2] + 'T11:30:00Z' },
        { command: 'npm publish --access public', date: dates[dates.length - 4] + 'T16:35:00Z' },
      ],
      safe: Array.from({ length: 24 }, (_, i) => ({
        command: ['npm test', 'git status', 'git diff', 'npm run build', 'npm run lint',
          'git add .', 'git commit -m "feat: update"', 'git log --oneline -5',
          'node scripts/seed.js', 'docker compose up -d', 'git branch -a', 'npm run dev'][i % 12],
        date: dates[Math.floor(Math.random() * dates.length)] + 'T12:00:00Z',
      })),
    },
    directoryScope: {
      inProject: [
        { dir: 'src/', accessCount: 1840 },
        { dir: 'tests/', accessCount: 620 },
        { dir: 'scripts/', accessCount: 180 },
        { dir: 'config/', accessCount: 95 },
        { dir: 'docs/', accessCount: 42 },
      ],
      outsideProject: [
        { dir: '~/', accessCount: 4, sensitive: true },
        { dir: '~/.ssh/', accessCount: 1, sensitive: true },
        { dir: '/tmp/', accessCount: 3, sensitive: false },
      ],
    },
    permissionSettings: {
      global: { allow: ['Read', 'Glob', 'Grep', 'Bash(npm test)', 'Bash(git status)'] },
      projects: [
        { projectPath: 'acme-backend', allow: ['Bash(npm run build)', 'Bash(docker compose up -d)'] },
      ],
    },
    permissionModes: { 'default': 240, 'allowedTools': 38, 'bypassPermissions': 1 },
  },
};

// ──────────────────────────────────────────────
//  Serve dashboard + intercept API with dummy data
// ──────────────────────────────────────────────

function createServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');

      // API endpoints — return dummy data
      if (url.pathname.startsWith('/api/')) {
        const endpoint = url.pathname.replace('/api/', '');
        const data = DUMMY[endpoint];
        if (data !== undefined) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } else {
          res.writeHead(404);
          res.end('{}');
        }
        return;
      }

      // SSE endpoint — just keep alive
      if (url.pathname === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        return;
      }

      // Serve dashboard HTML
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = fs.readFileSync(DASHBOARD_HTML, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`Server running on http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}

// ──────────────────────────────────────────────
//  Screenshot logic
// ──────────────────────────────────────────────

async function takeScreenshots() {
  const puppeteer = require('puppeteer');
  const { server, port } = await createServer();
  const baseUrl = `http://127.0.0.1:${port}`;

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

    // Log browser console errors for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('  [browser error]', msg.text());
    });
    page.on('pageerror', err => console.log('  [page error]', err.message));

    // Navigate and wait for data to load (use domcontentloaded — SSE keeps networkidle from firing)
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#overview-content', { visible: true, timeout: 15000 });

    // Switch to light mode
    await page.click('#theme-toggle');
    await new Promise(r => setTimeout(r, 500));

    // Wait for charts to render
    await new Promise(r => setTimeout(r, 1500));

    // 1. Overview screenshot
    console.log('Taking overview screenshot...');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'overview.png'), fullPage: true });
    console.log('  ✓ overview.png');

    // 2. Usage → Projects tab
    console.log('Taking projects screenshot...');
    await page.click('.tab[data-tab="usage"]');
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'projects.png'), fullPage: true });
    console.log('  ✓ projects.png');

    // 3. Insights tab
    console.log('Taking insights screenshot...');
    await page.click('.tab[data-tab="insights"]');
    await new Promise(r => setTimeout(r, 2000));
    // Open first two insights for visual interest (use evaluate to avoid scroll issues)
    await page.evaluate(() => {
      const headers = document.querySelectorAll('.insight-header');
      if (headers[0]) headers[0].click();
      if (headers[1]) headers[1].click();
    });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'insights.png'), fullPage: true });
    console.log('  ✓ insights.png');

    // 4. Security tab
    console.log('Taking security screenshot...');
    await page.click('.tab[data-tab="security"]');
    await new Promise(r => setTimeout(r, 3000));
    // Wait for security content to be visible
    try {
      await page.waitForSelector('#security-content', { visible: true, timeout: 10000 });
    } catch { console.log('  (security-content not visible, proceeding anyway)'); }
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'security.png'), fullPage: true });
    console.log('  ✓ security.png');

    console.log('\nAll screenshots saved to docs/screenshots/');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

takeScreenshots().catch(err => {
  console.error('Screenshot failed:', err);
  process.exit(1);
});

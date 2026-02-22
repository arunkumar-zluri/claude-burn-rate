const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { handleApi } = require('./api.js');

const DASHBOARD_PATH = path.join(__dirname, '..', 'dashboard', 'index.html');

// SSE clients for watch mode
const sseClients = new Set();

async function createServer({ port = 3456, watch = false } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const pathname = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');

    if (pathname.startsWith('/api/')) {
      return handleApi(pathname, req, res);
    }

    if (pathname === '/events' && watch) {
      return handleSSE(req, res);
    }

    if (pathname === '/' || pathname === '/index.html') {
      try {
        const html = await fs.readFile(DASHBOARD_PATH, 'utf-8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      } catch (err) {
        res.statusCode = 500;
        res.end('Dashboard not found');
      }
      return;
    }

    res.statusCode = 404;
    res.end('Not found');
  });

  // Handle EADDRINUSE — try next ports
  const maxRetries = 10;
  let currentPort = port;

  function tryListen(attempt) {
    server.listen(currentPort, () => {
      const url = `http://localhost:${currentPort}`;
      console.log(`\n  claude-burn-rate dashboard running at ${url}\n`);

      if (watch) {
        console.log('  Watch mode enabled — dashboard will auto-refresh\n');
        startWatcher();
      }

      openBrowser(url);
    });
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      currentPort++;
      if (currentPort - port < maxRetries) {
        console.log(`  Port ${currentPort - 1} is busy, trying ${currentPort}...`);
        server.listen(currentPort);
      } else {
        console.error(`  Could not find an open port (tried ${port}-${currentPort})`);
        process.exit(1);
      }
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  tryListen(0);

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close();
    process.exit(0);
  });
}

async function openBrowser(url) {
  try {
    const open = (await import('open')).default;
    await open(url);
  } catch {
    console.log(`  Open ${url} in your browser\n`);
  }
}

function handleSSE(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
}

function broadcastSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

function startWatcher() {
  const fsSync = require('fs');
  const os = require('os');
  const claudeDir = path.join(os.homedir(), '.claude');
  const statsFile = path.join(claudeDir, 'stats-cache.json');

  try {
    fsSync.watch(statsFile, () => {
      const { invalidateCache } = require('./api.js');
      invalidateCache();
      broadcastSSE('refresh', { timestamp: Date.now() });
    });
  } catch {
    // stats-cache.json might not exist yet
  }
}

module.exports = { createServer };

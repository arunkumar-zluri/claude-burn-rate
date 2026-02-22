const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');

async function readStatsCache() {
  const filePath = path.join(CLAUDE_DIR, 'stats-cache.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function readHistory() {
  const filePath = path.join(CLAUDE_DIR, 'history.jsonl');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function listProjectDirs() {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => ({
        name: e.name,
        path: path.join(projectsDir, e.name),
        projectPath: e.name.replace(/^-/, '/').replace(/-/g, '/')
      }));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function readSessionsIndex(projectDir) {
  const filePath = path.join(projectDir, 'sessions-index.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function listSessionFiles(projectDir) {
  try {
    const entries = await fs.readdir(projectDir);
    return entries
      .filter(e => e.endsWith('.jsonl'))
      .map(e => path.join(projectDir, e));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// Read first few lines of a JSONL to extract basic session metadata
async function probeSessionFile(filePath) {
  try {
    const stream = fsSync.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let sessionId = null;
    let cwd = null;
    let gitBranch = null;
    let firstTimestamp = null;
    let lastTimestamp = null;
    let firstPrompt = null;
    let messageCount = 0;
    let linesRead = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      linesRead++;
      try {
        const obj = JSON.parse(line);
        if (!sessionId && obj.sessionId) sessionId = obj.sessionId;
        if (!cwd && obj.cwd) cwd = obj.cwd;
        if (!gitBranch && obj.gitBranch) gitBranch = obj.gitBranch;
        if (obj.timestamp) {
          const ts = obj.timestamp;
          if (!firstTimestamp) firstTimestamp = ts;
          lastTimestamp = ts;
        }
        if (obj.type === 'user' || obj.type === 'assistant') messageCount++;
        if (!firstPrompt && obj.type === 'user' && !obj.isMeta && obj.message) {
          const content = obj.message.content;
          if (typeof content === 'string') {
            firstPrompt = content.replace(/<[^>]+>/g, '').trim().slice(0, 200);
          } else if (Array.isArray(content)) {
            firstPrompt = content.filter(c => c && c.type === 'text').map(c => c.text || '').join(' ').slice(0, 200);
          }
        }
      } catch {}
      // Read enough lines to get metadata but not the whole file
      if (linesRead > 50 && sessionId && cwd && firstPrompt) break;
    }

    rl.close();
    stream.destroy();

    return {
      sessionId: sessionId || path.basename(filePath, '.jsonl'),
      fullPath: filePath,
      firstPrompt: firstPrompt || 'No prompt',
      messageCount,
      created: firstTimestamp || null,
      modified: lastTimestamp || null,
      gitBranch,
      projectPath: cwd
    };
  } catch {
    return null;
  }
}

async function getAllSessionIndexes() {
  const projectDirs = await listProjectDirs();
  const indexes = [];
  const seenSessionIds = new Set();

  for (const dir of projectDirs) {
    const index = await readSessionsIndex(dir.path);

    if (index && index.entries) {
      // Use the index when available
      for (const entry of index.entries) {
        seenSessionIds.add(entry.sessionId);
        indexes.push({
          ...entry,
          projectDir: dir.name,
          projectPath: index.originalPath || dir.projectPath
        });
      }
    }

    // Also discover JSONL files not in the index
    const sessionFiles = await listSessionFiles(dir.path);
    for (const file of sessionFiles) {
      const basename = path.basename(file, '.jsonl');
      if (seenSessionIds.has(basename)) continue;
      seenSessionIds.add(basename);

      const probed = await probeSessionFile(file);
      if (probed) {
        indexes.push({
          ...probed,
          projectDir: dir.name,
          projectPath: probed.projectPath || dir.projectPath
        });
      }
    }
  }

  return indexes;
}

module.exports = {
  CLAUDE_DIR,
  readStatsCache,
  readHistory,
  listProjectDirs,
  readSessionsIndex,
  listSessionFiles,
  getAllSessionIndexes
};

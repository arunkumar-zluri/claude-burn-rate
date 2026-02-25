const { listProjectDirs, listSessionFiles } = require('../data/reader.js');
const { parseSessionFile } = require('../data/session-parser.js');
const path = require('path');

const SENSITIVE_PATTERNS = [
  /\.env($|\.)/,
  /\.ssh\//,
  /\.aws\//,
  /\.gnupg\//,
  /credential/i,
  /secret/i,
  /password/i,
  /\.pem$/,
  /\.key$/,
  /\/etc\//,
  /\/var\//,
];

const SECRET_PATTERNS = [
  { name: 'Bearer Token', pattern: /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/i },
  { name: 'OpenAI/Anthropic Key (sk-)', pattern: /\bsk-[A-Za-z0-9\-_]{20,}/ },
  { name: 'AWS Access Key (AKIA)', pattern: /\bAKIA[A-Z0-9]{16}\b/ },
  { name: 'GitHub Token (ghp_)', pattern: /\bghp_[A-Za-z0-9]{36,}\b/ },
  { name: 'token= parameter', pattern: /\btoken=[A-Za-z0-9\-._~+\/]{8,}/i },
  { name: 'password= parameter', pattern: /\bpassword=[^\s&]{4,}/i },
  { name: '--password flag', pattern: /--password[= ]\S+/ },
  { name: 'Atlassian Token (ATATT)', pattern: /\bATATT[A-Za-z0-9\-_]{20,}/ },
];

const SENSITIVE_ENV_PATTERNS = [
  /token/i,
  /key/i,
  /secret/i,
  /password/i,
  /credential/i,
];

const BASH_CATEGORIES = {
  sudo: /\bsudo\s/,
  destructive: /\b(rm\s|rmdir|git\s+reset\s+--hard|git\s+clean|git\s+checkout\s+\.)/,
  permissions: /\b(chmod|chown|chgrp)\b/,
  network: /\b(curl|wget|ssh\s|scp\s|git\s+push|git\s+clone|git\s+fetch|git\s+pull)\b/,
  packageManagers: /\b(npm\s+install|yarn\s+add|pip\s+install|cargo\s+install|brew\s+install|apt\s+install|apt-get\s+install)\b/,
};

function isSensitivePath(filePath) {
  if (!filePath) return false;
  return SENSITIVE_PATTERNS.some(p => p.test(filePath));
}

function classifyBashCommand(command) {
  if (!command) return 'safe';
  for (const [category, pattern] of Object.entries(BASH_CATEGORIES)) {
    if (pattern.test(command)) return category;
  }
  return 'safe';
}

function detectSecretsInCommand(command) {
  if (!command) return [];
  const found = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(command)) {
      found.push(name);
    }
  }
  return found;
}

function assessMcpRisk(name, config) {
  const command = config.command || null;
  const args = config.args || [];
  const env = config.env || {};

  const knownCommands = ['npx', 'node', 'python', 'python3', 'uvx', 'docker'];
  const unknownCommand = command ? !knownCommands.includes(path.basename(command)) : false;

  const exposedSecrets = [];
  for (const [envName, envValue] of Object.entries(env)) {
    const isSensitive = SENSITIVE_ENV_PATTERNS.some(p => p.test(envName));
    if (isSensitive) {
      // Show truncated preview: first 4 chars + '...'
      const preview = typeof envValue === 'string' && envValue.length > 4
        ? envValue.slice(0, 4) + '...'
        : '***';
      exposedSecrets.push({ name: envName, preview });
    }
  }

  let riskLevel = 'low';
  if (exposedSecrets.length >= 3 || unknownCommand) {
    riskLevel = 'high';
  } else if (exposedSecrets.length > 0) {
    riskLevel = 'medium';
  }

  return {
    name,
    command,
    args,
    riskLevel,
    exposedSecrets,
    unknownCommand
  };
}

function detectAnomalies(sessionStats) {
  if (sessionStats.length < 3) return [];

  const threshold = 3;
  const n = sessionStats.length;
  const totalDestructive = sessionStats.reduce((s, x) => s + x.destructiveCount, 0);
  const totalWrites = sessionStats.reduce((s, x) => s + x.writeCount, 0);

  const anomalies = [];
  for (const sess of sessionStats) {
    // Leave-one-out average: exclude current session from the average
    const othersCount = n - 1;
    const avgDestructive = (totalDestructive - sess.destructiveCount) / othersCount;
    const avgWrites = (totalWrites - sess.writeCount) / othersCount;

    const flags = [];
    if (avgDestructive > 0 && sess.destructiveCount > avgDestructive * threshold) {
      flags.push(`${sess.destructiveCount} destructive commands (avg: ${avgDestructive.toFixed(1)})`);
    }
    if (avgWrites > 0 && sess.writeCount > avgWrites * threshold) {
      flags.push(`${sess.writeCount} write operations (avg: ${avgWrites.toFixed(1)})`);
    }
    if (flags.length > 0) {
      anomalies.push({
        sessionId: sess.sessionId,
        projectPath: sess.projectPath,
        date: sess.date,
        flags
      });
    }
  }
  return anomalies;
}

function extractFilePaths(toolCall) {
  const paths = [];
  const input = toolCall.input || {};

  const filePath = input.file_path || input.path;
  if (filePath) paths.push(filePath);

  if (toolCall.name === 'Glob' && input.path) {
    paths.push(input.path);
  }

  return paths;
}

async function getSecurityAudit() {
  const projectDirs = await listProjectDirs();

  // Track file access: path -> { reads, writes, edits }
  const fileAccessMap = {};
  // Track bash commands
  const bashCommands = {
    sudo: [],
    destructive: [],
    permissions: [],
    network: [],
    packageManagers: [],
    safe: []
  };
  // Track directories
  const dirAccessMap = {};
  // Collect project working directories for scope detection
  const projectWorkDirs = new Set();

  // Feature 3: dangerous sessions (non-default permissionMode)
  const dangerousSessions = {};
  // Feature 4: secrets in bash
  const secretsInBash = [];
  // Feature 5: outside-project writes
  const outsideProjectWrites = [];
  // Feature 7: per-session stats for anomaly detection
  const sessionStats = [];

  for (const dir of projectDirs) {
    if (dir.projectPath) projectWorkDirs.add(dir.projectPath);

    const sessionFiles = await listSessionFiles(dir.path);

    for (const file of sessionFiles) {
      try {
        const session = await parseSessionFile(file);
        const sessionId = session.sessionId;

        if (session.projectPath) projectWorkDirs.add(session.projectPath);

        // Feature 3: track permissionMode
        // Only flag modes that bypass safety confirmations broadly.
        // acceptEdits is a convenience mode (auto-approve file edits only) — not dangerous.
        const dangerousModes = new Set(['bypassPermissions', 'fullAutoMode', 'yolo']);
        const isDangerousSession = session.permissionMode && dangerousModes.has(session.permissionMode);

        // Per-session counters for anomaly detection
        let sessDestructive = 0;
        let sessWrites = 0;
        // Collect flagged commands for dangerous sessions
        const sessFlaggedCommands = [];

        for (const msg of session.assistantMessages) {
          for (const tool of msg.toolCalls) {
            const toolName = tool.name;
            const input = tool.input || {};

            // File access tracking
            if (toolName === 'Read' || toolName === 'read') {
              const fp = input.file_path || input.path;
              if (fp) {
                if (!fileAccessMap[fp]) fileAccessMap[fp] = { reads: 0, writes: 0, edits: 0 };
                fileAccessMap[fp].reads++;
                trackDir(dirAccessMap, fp);
              }
            } else if (toolName === 'Write' || toolName === 'write') {
              const fp = input.file_path || input.path;
              if (fp) {
                if (!fileAccessMap[fp]) fileAccessMap[fp] = { reads: 0, writes: 0, edits: 0 };
                fileAccessMap[fp].writes++;
                trackDir(dirAccessMap, fp);
                sessWrites++;
              }
            } else if (toolName === 'Edit' || toolName === 'edit') {
              const fp = input.file_path || input.path;
              if (fp) {
                if (!fileAccessMap[fp]) fileAccessMap[fp] = { reads: 0, writes: 0, edits: 0 };
                fileAccessMap[fp].edits++;
                trackDir(dirAccessMap, fp);
                sessWrites++;
              }
            } else if (toolName === 'Glob' || toolName === 'glob') {
              const dp = input.path;
              if (dp) trackDir(dirAccessMap, dp + '/.');
            } else if (toolName === 'Grep' || toolName === 'grep') {
              const dp = input.path;
              if (dp) trackDir(dirAccessMap, dp + '/.');
            } else if (toolName === 'Bash' || toolName === 'bash') {
              const command = input.command;
              if (command) {
                const category = classifyBashCommand(command);
                bashCommands[category].push({
                  command,
                  sessionId,
                  date: msg.timestamp || null
                });
                if (category === 'destructive' || category === 'sudo') sessDestructive++;

                // Track flagged commands for dangerous sessions
                if (isDangerousSession && category !== 'safe') {
                  sessFlaggedCommands.push({
                    command,
                    category,
                    date: msg.timestamp || null
                  });
                }

                // Feature 4: detect secrets in bash commands
                const secrets = detectSecretsInCommand(command);
                if (secrets.length > 0) {
                  secretsInBash.push({
                    command,
                    secrets,
                    sessionId,
                    date: msg.timestamp || null
                  });
                }
              }
            }
          }
        }

        if (isDangerousSession) {
          dangerousSessions[sessionId] = {
            mode: session.permissionMode,
            date: session.firstTimestamp ? new Date(session.firstTimestamp).toISOString() : null,
            projectPath: session.projectPath,
            sessionFile: file,
            flaggedCommands: sessFlaggedCommands
          };
        }

        sessionStats.push({
          sessionId,
          projectPath: session.projectPath,
          date: session.firstTimestamp ? new Date(session.firstTimestamp).toISOString() : null,
          destructiveCount: sessDestructive,
          writeCount: sessWrites
        });
      } catch {
        // Skip unreadable sessions
      }
    }
  }

  // Build file access list
  const fileAccess = Object.entries(fileAccessMap)
    .map(([filePath, counts]) => ({
      path: filePath,
      reads: counts.reads,
      writes: counts.writes,
      edits: counts.edits,
      total: counts.reads + counts.writes + counts.edits,
      sensitive: isSensitivePath(filePath)
    }))
    .sort((a, b) => b.total - a.total);

  // Build directory scope
  const inProject = [];
  const outsideProject = [];
  const projectRoots = Array.from(projectWorkDirs);

  for (const [dir, count] of Object.entries(dirAccessMap)) {
    const isInProject = projectRoots.some(root => dir.startsWith(root));
    if (isInProject) {
      inProject.push({ dir, accessCount: count });
    } else {
      outsideProject.push({ dir, accessCount: count, sensitive: isSensitivePath(dir) });
    }
  }

  inProject.sort((a, b) => b.accessCount - a.accessCount);
  outsideProject.sort((a, b) => b.accessCount - a.accessCount);

  // Feature 5: outside-project writes (files written/edited outside any project root)
  for (const f of fileAccess) {
    if ((f.writes > 0 || f.edits > 0) && !projectRoots.some(root => f.path.startsWith(root))) {
      outsideProjectWrites.push({
        path: f.path,
        writes: f.writes,
        edits: f.edits,
        sensitive: f.sensitive
      });
    }
  }

  // Feature 1: permission settings
  let permissionSettings = { global: { allow: [] }, projects: [] };
  try {
    const { readPermissionSettings } = require('../data/config-reader.js');
    permissionSettings = await readPermissionSettings();
  } catch { /* config may not exist */ }

  // Feature 2: MCP server risk assessment
  let mcpRiskAssessments = [];
  try {
    const { readMcpServersRaw } = require('../data/config-reader.js');
    const servers = await readMcpServersRaw();
    for (const [name, config] of Object.entries(servers)) {
      mcpRiskAssessments.push(assessMcpRisk(name, config));
    }
  } catch { /* config may not exist */ }

  // Feature 7: anomaly detection
  const anomalies = detectAnomalies(sessionStats);

  // Compute summary
  const sensitiveFlags = fileAccess.filter(f => f.sensitive).length +
    outsideProject.filter(d => d.sensitive).length;

  const totalBashCommands = Object.values(bashCommands)
    .reduce((sum, arr) => sum + arr.length, 0);
  const flaggedBashCommands = bashCommands.destructive.length +
    bashCommands.permissions.length +
    bashCommands.network.length +
    bashCommands.sudo.length;

  const dangerousSessionCount = Object.keys(dangerousSessions).length;
  const mcpHighRiskCount = mcpRiskAssessments.filter(r => r.riskLevel === 'high').length;

  return {
    summary: {
      totalFilesAccessed: fileAccess.length,
      totalBashCommands,
      flaggedBashCommands,
      totalDirectories: Object.keys(dirAccessMap).length,
      sensitiveFlags,
      dangerousSessionCount,
      secretsInBashCount: secretsInBash.length,
      outsideProjectWriteCount: outsideProjectWrites.length,
      anomalyCount: anomalies.length,
      mcpHighRiskCount
    },
    fileAccess,
    bashCommands,
    directoryScope: {
      inProject,
      outsideProject
    },
    permissionSettings,
    mcpRiskAssessments,
    dangerousSessions,
    secretsInBash,
    outsideProjectWrites,
    anomalies
  };
}

function trackDir(dirMap, filePath) {
  const dir = path.dirname(filePath);
  if (dir) {
    dirMap[dir] = (dirMap[dir] || 0) + 1;
  }
}

module.exports = {
  getSecurityAudit,
  isSensitivePath,
  classifyBashCommand,
  detectSecretsInCommand,
  assessMcpRisk,
  detectAnomalies,
  SENSITIVE_PATTERNS,
  BASH_CATEGORIES,
  SECRET_PATTERNS,
  SENSITIVE_ENV_PATTERNS
};

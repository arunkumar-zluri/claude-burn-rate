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

const BASH_CATEGORIES = {
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

function extractFilePaths(toolCall) {
  const paths = [];
  const input = toolCall.input || {};

  // Read, Write, Edit tools use file_path or path
  const filePath = input.file_path || input.path;
  if (filePath) paths.push(filePath);

  // Glob tool uses pattern + path (directory)
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

  for (const dir of projectDirs) {
    if (dir.projectPath) projectWorkDirs.add(dir.projectPath);

    const sessionFiles = await listSessionFiles(dir.path);

    for (const file of sessionFiles) {
      try {
        const session = await parseSessionFile(file);
        const sessionId = session.sessionId;

        if (session.projectPath) projectWorkDirs.add(session.projectPath);

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
              }
            } else if (toolName === 'Edit' || toolName === 'edit') {
              const fp = input.file_path || input.path;
              if (fp) {
                if (!fileAccessMap[fp]) fileAccessMap[fp] = { reads: 0, writes: 0, edits: 0 };
                fileAccessMap[fp].edits++;
                trackDir(dirAccessMap, fp);
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
              }
            }
          }
        }
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

  // Compute summary
  const sensitiveFlags = fileAccess.filter(f => f.sensitive).length +
    outsideProject.filter(d => d.sensitive).length;

  const totalBashCommands = Object.values(bashCommands)
    .reduce((sum, arr) => sum + arr.length, 0);
  const flaggedBashCommands = bashCommands.destructive.length +
    bashCommands.permissions.length +
    bashCommands.network.length;

  return {
    summary: {
      totalFilesAccessed: fileAccess.length,
      totalBashCommands,
      flaggedBashCommands,
      totalDirectories: Object.keys(dirAccessMap).length,
      sensitiveFlags
    },
    fileAccess,
    bashCommands,
    directoryScope: {
      inProject,
      outsideProject
    }
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
  SENSITIVE_PATTERNS,
  BASH_CATEGORIES
};

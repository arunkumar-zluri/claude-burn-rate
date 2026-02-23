const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listMdFiles(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter(e => e.endsWith('.md')).map(e => e.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

async function readClaudeConfig() {
  const config = {
    mcpServers: { total: 0, names: [] },
    commands: { total: 0, names: [] },
    hooks: { total: 0, events: [] },
    plugins: { total: 0, enabled: 0, names: [] }
  };

  // --- MCP Servers ---
  // Global: ~/.claude/.mcp.json
  const globalMcp = await readJsonSafe(path.join(CLAUDE_DIR, '.mcp.json'));
  if (globalMcp && globalMcp.mcpServers) {
    const names = Object.keys(globalMcp.mcpServers);
    for (const name of names) {
      if (!config.mcpServers.names.includes(name)) {
        config.mcpServers.names.push(name);
      }
    }
  }

  // Also check settings.json for mcpServers
  const globalSettings = await readJsonSafe(path.join(CLAUDE_DIR, 'settings.json'));
  if (globalSettings && globalSettings.mcpServers) {
    const names = Object.keys(globalSettings.mcpServers);
    for (const name of names) {
      if (!config.mcpServers.names.includes(name)) {
        config.mcpServers.names.push(name);
      }
    }
  }

  config.mcpServers.total = config.mcpServers.names.length;

  // --- Custom Commands ---
  // Global: ~/.claude/commands/
  const globalCmds = await listMdFiles(path.join(CLAUDE_DIR, 'commands'));
  for (const cmd of globalCmds) {
    if (!config.commands.names.includes(cmd)) {
      config.commands.names.push(cmd);
    }
  }
  config.commands.total = config.commands.names.length;

  // --- Hooks ---
  if (globalSettings && globalSettings.hooks) {
    const hookEvents = Object.keys(globalSettings.hooks);
    for (const event of hookEvents) {
      const hooks = globalSettings.hooks[event];
      if (Array.isArray(hooks) && hooks.length > 0) {
        config.hooks.events.push({ event, count: hooks.length });
        config.hooks.total += hooks.length;
      }
    }
  }

  // --- Plugins (Agents) ---
  if (globalSettings && globalSettings.enabledPlugins) {
    const entries = Object.entries(globalSettings.enabledPlugins);
    config.plugins.total = entries.length;
    config.plugins.enabled = entries.filter(([, v]) => v === true).length;
    config.plugins.names = entries
      .filter(([, v]) => v === true)
      .map(([name]) => {
        // "voicemode@mbailey" -> "voicemode"
        const short = name.split('@')[0];
        return short.charAt(0).toUpperCase() + short.slice(1);
      });
  }

  return config;
}

async function readPermissionSettings() {
  const { listProjectDirs } = require('./reader.js');
  const result = { global: { allow: [] }, projects: [] };

  // Global: ~/.claude/settings.json -> permissions.allow
  const globalSettings = await readJsonSafe(path.join(CLAUDE_DIR, 'settings.json'));
  if (globalSettings && globalSettings.permissions && Array.isArray(globalSettings.permissions.allow)) {
    result.global.allow = globalSettings.permissions.allow;
  }

  // Per-project: <projectPath>/.claude/settings.local.json -> permissions.allow
  const projectDirs = await listProjectDirs();
  for (const dir of projectDirs) {
    const projectPath = dir.projectPath;
    const localSettings = await readJsonSafe(path.join(projectPath, '.claude', 'settings.local.json'));
    if (localSettings && localSettings.permissions && Array.isArray(localSettings.permissions.allow)) {
      result.projects.push({
        projectPath,
        allow: localSettings.permissions.allow
      });
    }
  }

  return result;
}

async function readMcpServersRaw() {
  const servers = {};

  // Global: ~/.claude/.mcp.json
  const globalMcp = await readJsonSafe(path.join(CLAUDE_DIR, '.mcp.json'));
  if (globalMcp && globalMcp.mcpServers) {
    for (const [name, config] of Object.entries(globalMcp.mcpServers)) {
      servers[name] = { ...config, source: 'global (.mcp.json)' };
    }
  }

  // Global: ~/.claude/settings.json
  const globalSettings = await readJsonSafe(path.join(CLAUDE_DIR, 'settings.json'));
  if (globalSettings && globalSettings.mcpServers) {
    for (const [name, config] of Object.entries(globalSettings.mcpServers)) {
      if (!servers[name]) {
        servers[name] = { ...config, source: 'global (settings.json)' };
      }
    }
  }

  return servers;
}

module.exports = { readClaudeConfig, readPermissionSettings, readMcpServersRaw };

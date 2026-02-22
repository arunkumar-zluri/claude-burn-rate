const { getAllSessionIndexes, listProjectDirs, listSessionFiles } = require('../data/reader.js');
const { parseSessionFile, aggregateSessionTokens } = require('../data/session-parser.js');
const { calculateCost } = require('../cost/pricing.js');

let cachedSessions = null;

async function getSessions(filters) {
  let sessions = cachedSessions;
  if (!sessions) {
    sessions = await buildAllSessions();
    cachedSessions = sessions;
  }

  return applyFilters(sessions, filters);
}

async function buildAllSessions() {
  const indexes = await getAllSessionIndexes();
  const sessions = [];

  for (const entry of indexes) {
    let cost = 0;
    let duration = 0;
    let tokensByModel = {};

    if (entry.fullPath) {
      try {
        const session = await parseSessionFile(entry.fullPath);
        tokensByModel = aggregateSessionTokens(session);
        for (const [model, tokens] of Object.entries(tokensByModel)) {
          const c = calculateCost(tokens, model);
          cost += c.totalCost;
        }
        duration = session.duration;
      } catch {
        // Fall back to index data only
      }
    }

    sessions.push({
      sessionId: entry.sessionId,
      date: entry.created ? entry.created.split('T')[0] : null,
      project: entry.projectPath || null,
      summary: entry.summary || null,
      firstPrompt: entry.firstPrompt || null,
      messages: entry.messageCount || 0,
      cost,
      duration,
      gitBranch: entry.gitBranch || null,
      tokensByModel
    });
  }

  sessions.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  return sessions;
}

function applyFilters(sessions, filters) {
  if (!filters) return sessions;

  let result = sessions;

  if (filters.from) {
    result = result.filter(s => s.date && s.date >= filters.from);
  }
  if (filters.to) {
    result = result.filter(s => s.date && s.date <= filters.to);
  }
  if (filters.project) {
    result = result.filter(s => s.project && s.project === filters.project);
  }

  return result;
}

function getUniqueProjects(sessions) {
  const projects = new Set();
  for (const s of sessions) {
    if (s.project) projects.add(s.project);
  }
  return [...projects].sort();
}

function invalidateSessionsCache() {
  cachedSessions = null;
}

module.exports = { getSessions, getUniqueProjects, invalidateSessionsCache };

const { readStatsCache } = require('../data/reader.js');
const { buildOverview } = require('../analysis/overview.js');

let cachedOverview = null;
let cacheTime = 0;
const CACHE_TTL = 5000;

async function handleApi(pathname, req, res) {
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const filters = parseFilters(url.searchParams);

  try {
    if (pathname === '/api/overview') {
      const data = await getOverview(filters);
      return json(res, data);
    }

    if (pathname === '/api/sessions') {
      const { getSessions } = require('../analysis/sessions.js');
      const data = await getSessions(filters);
      return json(res, data);
    }

    if (pathname === '/api/projects') {
      const { getProjects } = require('../analysis/projects.js');
      const data = await getProjects(filters);
      return json(res, data);
    }

    if (pathname === '/api/projects-list') {
      const { getSessions, getUniqueProjects } = require('../analysis/sessions.js');
      const allSessions = await getSessions();
      const projects = getUniqueProjects(allSessions);
      return json(res, projects);
    }

    if (pathname === '/api/patterns') {
      const { getPatterns } = require('../analysis/patterns.js');
      const data = await getPatterns();
      return json(res, data);
    }

    if (pathname === '/api/insights') {
      const { generateInsights } = require('../analysis/insights.js');
      const { readClaudeConfig } = require('../data/config-reader.js');
      const overview = await getOverview(filters);
      const { getSessions } = require('../analysis/sessions.js');
      const [sessions, config] = await Promise.all([getSessions(filters), readClaudeConfig()]);
      const data = generateInsights(overview, sessions, config);
      return json(res, data);
    }

    if (pathname === '/api/expensive-prompts') {
      const { getExpensivePrompts } = require('../analysis/expensive-prompts.js');
      const data = await getExpensivePrompts(filters);
      return json(res, data);
    }

    if (pathname === '/api/recommendations') {
      const { getRecommendations } = require('../analysis/recommendations.js');
      const overview = await getOverview(filters);
      const { getSessions } = require('../analysis/sessions.js');
      const sessions = await getSessions(filters);
      const data = getRecommendations(overview, sessions);
      return json(res, data);
    }

    if (pathname === '/api/gamification') {
      const { getGamification } = require('../analysis/gamification.js');
      const overview = await getOverview(filters);
      const { getSessions } = require('../analysis/sessions.js');
      const sessions = await getSessions(filters);
      const data = getGamification(overview, sessions);
      return json(res, data);
    }

    if (pathname === '/api/contributions') {
      const { getContributions } = require('../analysis/contributions.js');
      const data = await getContributions();
      return json(res, data);
    }

    if (pathname === '/api/security') {
      const { getSecurityAudit } = require('../analysis/security.js');
      const data = await getSecurityAudit();
      return json(res, data);
    }

    res.statusCode = 404;
    return json(res, { error: 'Not found' });
  } catch (err) {
    console.error('API error:', err);
    res.statusCode = 500;
    return json(res, { error: err.message });
  }
}

function parseFilters(params) {
  const filters = {};
  const from = params.get('from');
  const to = params.get('to');
  const project = params.get('project');

  if (from) filters.from = from;
  if (to) filters.to = to;
  if (project) filters.project = project;

  return Object.keys(filters).length > 0 ? filters : null;
}

async function getOverview(filters) {
  // Fast path: no filters, use cached stats-cache
  if (!filters) {
    const now = Date.now();
    if (cachedOverview && (now - cacheTime) < CACHE_TTL) {
      return cachedOverview;
    }
    const stats = await readStatsCache();
    cachedOverview = buildOverview(stats, null, null);
    cacheTime = Date.now();
    return cachedOverview;
  }

  // Filtered path: compute from session data
  const stats = await readStatsCache();
  const { getSessions } = require('../analysis/sessions.js');
  const sessions = await getSessions(filters);
  return buildOverview(stats, filters, sessions);
}

function json(res, data) {
  res.end(JSON.stringify(data));
}

function invalidateCache() {
  cachedOverview = null;
  cacheTime = 0;
}

module.exports = { handleApi, invalidateCache };

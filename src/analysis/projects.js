const { getSessions } = require('./sessions.js');

async function getProjects(filters) {
  const sessions = await getSessions(filters);
  const projectMap = {};

  for (const s of sessions) {
    const key = s.project || 'Unknown';
    if (!projectMap[key]) {
      projectMap[key] = { project: key, sessions: 0, messages: 0, cost: 0 };
    }
    projectMap[key].sessions++;
    projectMap[key].messages += s.messages || 0;
    projectMap[key].cost += s.cost || 0;
  }

  const projects = Object.values(projectMap);
  projects.sort((a, b) => b.cost - a.cost);
  return projects;
}

module.exports = { getProjects };

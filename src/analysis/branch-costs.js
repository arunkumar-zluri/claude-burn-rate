const { getSessions } = require('./sessions.js');

async function getBranchCosts(filters) {
  const sessions = await getSessions(filters);
  const branchMap = {};

  for (const s of sessions) {
    const branch = s.gitBranch || '(no branch)';
    const project = s.project || '(unknown)';
    const key = project + '::' + branch;
    if (!branchMap[key]) {
      branchMap[key] = { branch, project, sessions: 0, messages: 0, cost: 0 };
    }
    branchMap[key].sessions++;
    branchMap[key].messages += s.messages || 0;
    branchMap[key].cost += s.cost || 0;
  }

  const results = Object.values(branchMap)
    .map(b => ({
      ...b,
      avgCostPerSession: b.sessions > 0 ? b.cost / b.sessions : 0
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    branches: results,
    totalBranches: results.length,
    helpText: 'This aggregates cost by git branch, letting you see how much each feature or bug fix cost to develop. Branches with high costs may indicate complex features, large codebases, or extended debugging sessions. To control per-branch costs: scope branches to focused changes, use Sonnet for routine work on the branch, and start new sessions rather than keeping long-running ones open. Use this data to estimate future feature costs based on historical complexity.'
  };
}

module.exports = { getBranchCosts };

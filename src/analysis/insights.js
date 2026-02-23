const { formatCost, formatTokens, getPricing, calculateCost } = require('../cost/pricing.js');

function generateInsights(overview, sessions, config) {
  const insights = [];
  if (!overview || overview.empty) return insights;

  claudeSetupOverview(insights, config);
  costBreakdownByCategory(insights, overview);
  cacheSavings(insights, overview);
  costConcentration(insights, sessions);
  outputTokenRatio(insights, overview);
  peakUsageDay(insights, overview);
  modelChoiceEfficiency(insights, sessions);
  projectConcentration(insights, sessions);
  messageEscalation(insights, sessions);
  largeContextSessions(insights, sessions);
  cacheEfficiency(insights, overview);
  costPerMessage(insights, overview, sessions);
  shortVsLongSessions(insights, sessions);
  weekendWarrior(insights, overview);

  return insights;
}

// "Your Claude Code setup: N MCP servers, N commands, N plugins, N hooks"
function claudeSetupOverview(insights, config) {
  if (!config) return;

  const parts = [];
  const detailLines = [];

  // MCP Servers
  if (config.mcpServers.total > 0) {
    parts.push(`${config.mcpServers.total} MCP server${config.mcpServers.total !== 1 ? 's' : ''}`);
    detailLines.push(`MCP Servers (${config.mcpServers.total}):`);
    for (const name of config.mcpServers.names) {
      detailLines.push(`  \u2022 ${name}`);
    }
  } else {
    parts.push('0 MCP servers');
    detailLines.push('MCP Servers: None configured');
  }

  // Plugins (Agents)
  if (config.plugins.total > 0) {
    parts.push(`${config.plugins.enabled} active plugin${config.plugins.enabled !== 1 ? 's' : ''}`);
    detailLines.push('');
    detailLines.push(`Plugins (${config.plugins.enabled} active of ${config.plugins.total}):`);
    for (const name of config.plugins.names) {
      detailLines.push(`  \u2022 ${name}`);
    }
  } else {
    parts.push('0 plugins');
    detailLines.push('');
    detailLines.push('Plugins: None installed');
  }

  // Custom Commands
  if (config.commands.total > 0) {
    parts.push(`${config.commands.total} custom command${config.commands.total !== 1 ? 's' : ''}`);
    detailLines.push('');
    detailLines.push(`Custom Commands (${config.commands.total}):`);
    for (const name of config.commands.names) {
      detailLines.push(`  \u2022 /${name}`);
    }
  } else {
    parts.push('0 commands');
    detailLines.push('');
    detailLines.push('Custom Commands: None (add .md files to ~/.claude/commands/)');
  }

  // Hooks
  if (config.hooks.total > 0) {
    const hookLabel = `${config.hooks.total} hook${config.hooks.total !== 1 ? 's' : ''} across ${config.hooks.events.length} event${config.hooks.events.length !== 1 ? 's' : ''}`;
    parts.push(hookLabel);
    detailLines.push('');
    detailLines.push(`Hooks (${config.hooks.total}):`);
    for (const { event, count } of config.hooks.events) {
      detailLines.push(`  \u2022 ${event}: ${count} hook${count !== 1 ? 's' : ''}`);
    }
  } else {
    parts.push('0 hooks');
    detailLines.push('');
    detailLines.push('Hooks: None configured (add hooks in ~/.claude/settings.json)');
  }

  const activeCount = config.mcpServers.total + config.plugins.enabled + config.commands.total + config.hooks.total;

  insights.push({
    severity: 'info',
    title: `Your setup: ${parts.join(', ')}`,
    description: `You have ${activeCount} active configuration${activeCount !== 1 ? 's' : ''} across MCP servers, plugins, custom commands, and hooks. ${config.mcpServers.total === 0 && config.hooks.total === 0 ? 'Adding MCP servers or hooks could extend Claude\'s capabilities.' : 'Your environment is well-configured.'}`,
    detail: detailLines.join('\n'),
    helpText: 'This shows your Claude Code environment configuration. MCP servers extend Claude with external tools (databases, APIs, search). Plugins add specialized agents and commands. Custom commands (*.md files in ~/.claude/commands/) create reusable slash commands. Hooks let you run shell commands automatically on events like pre-commit or tool calls.'
  });
}

// "Cache writes are your biggest cost driver at $X"
function costBreakdownByCategory(insights, overview) {
  const mb = overview.modelBreakdown;
  if (!mb || mb.length === 0) return;

  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalCost = 0;
  for (const m of mb) {
    totalInput += m.costBreakdown.input || 0;
    totalOutput += m.costBreakdown.output || 0;
    totalCacheRead += m.costBreakdown.cacheRead || 0;
    totalCacheWrite += m.costBreakdown.cacheWrite || 0;
    totalCost += m.totalCost || 0;
  }

  if (totalCost <= 0) return;

  const categories = [
    { name: 'Cache Write', cost: totalCacheWrite, desc: 'Building and caching conversation context' },
    { name: 'Cache Read', cost: totalCacheRead, desc: 'Reusing previously cached context' },
    { name: 'Output', cost: totalOutput, desc: 'Claude\'s actual responses' },
    { name: 'Input', cost: totalInput, desc: 'Direct (uncached) input tokens' }
  ].sort((a, b) => b.cost - a.cost);

  const top = categories[0];
  const topPct = Math.round(top.cost / totalCost * 100);

  insights.push({
    severity: topPct >= 40 ? 'warning' : 'info',
    title: `${top.name} is your biggest cost driver at ${formatCost(top.cost)} (${topPct}%)`,
    description: `${top.desc}. Out of ${formatCost(totalCost)} total: ${categories.map(c => `${c.name} ${formatCost(c.cost)} (${Math.round(c.cost / totalCost * 100)}%)`).join(', ')}.`,
    detail: categories.map(c => {
      const pct = Math.round(c.cost / totalCost * 100);
      const bar = '\u2588'.repeat(Math.max(1, Math.round(pct / 3))) + '\u2591'.repeat(Math.max(0, 33 - Math.round(pct / 3)));
      return `${c.name.padEnd(12)} ${formatCost(c.cost).padStart(10)}  ${bar}  ${pct}%`;
    }).join('\n'),
    helpText: 'This breaks down your total cost into four token categories. Cache Write = cost of initially processing and caching your project context, code, and conversation history (most expensive per token at $18.75/M for Opus). Cache Read = cost of reusing cached context on subsequent messages (cheaper at $1.50/M). Output = Claude\'s generated responses ($75/M for Opus). Input = uncached input tokens ($15/M). Understanding which category dominates helps you target cost reductions.'
  });
}

// "Caching saved you $X — without it you'd have paid $Y"
function cacheSavings(insights, overview) {
  const tc = overview.tokenComposition;
  if (!tc || tc.cacheRead <= 0) return;

  const mb = overview.modelBreakdown;
  if (!mb || mb.length === 0) return;

  // Calculate what cache reads would have cost as regular input
  let actualCacheReadCost = 0;
  let hypotheticalInputCost = 0;
  for (const m of mb) {
    const pricing = getPricing(m.modelId);
    actualCacheReadCost += (m.cacheReadInputTokens / 1e6) * pricing.cacheRead;
    hypotheticalInputCost += (m.cacheReadInputTokens / 1e6) * pricing.input;
  }

  const savings = hypotheticalInputCost - actualCacheReadCost;
  if (savings <= 0) return;

  const totalCost = mb.reduce((s, m) => s + m.totalCost, 0);
  const hypotheticalTotal = totalCost + savings;
  const savedPct = Math.round(savings / hypotheticalTotal * 100);

  insights.push({
    severity: 'info',
    title: `Caching saved you ${formatCost(savings)} (${savedPct}% of what you'd have paid)`,
    description: `Without prompt caching, your ${formatTokens(tc.cacheRead)} cache-read tokens would have been regular input, costing ${formatCost(hypotheticalInputCost)} instead of ${formatCost(actualCacheReadCost)}. Your total bill would have been ${formatCost(hypotheticalTotal)} instead of ${formatCost(totalCost)}.`,
    detail: `How caching works:\n• First message in a session: context is processed and cached (Cache Write at $18.75/M)\n• Every subsequent message: context is read from cache (Cache Read at $1.50/M)\n• Without caching: every message would pay full input price ($15/M)\n\nYour savings: ${formatCost(hypotheticalInputCost)} (without cache) - ${formatCost(actualCacheReadCost)} (with cache) = ${formatCost(savings)} saved`,
    helpText: 'This calculates how much money prompt caching is saving you. Every message in a Claude Code session sends the full conversation context. Without caching, each message would re-process all context at the full input token price ($15/M for Opus). With caching, subsequent messages reuse cached context at $1.50/M — a 10x discount. The savings shown here is the difference between what you would have paid at full input price vs. the discounted cache-read price.'
  });
}

// "Just N long conversations used X% of all your spend"
function costConcentration(insights, sessions) {
  if (!sessions || sessions.length < 5) return;

  const sorted = [...sessions].sort((a, b) => b.cost - a.cost);
  const totalCost = sorted.reduce((s, x) => s + x.cost, 0);
  if (totalCost <= 0) return;

  // Find how many top sessions make up 50%+
  let cumulative = 0;
  let count = 0;
  for (const s of sorted) {
    cumulative += s.cost;
    count++;
    if (cumulative >= totalCost * 0.5) break;
  }

  const pct = Math.round((cumulative / totalCost) * 100);
  if (count <= sessions.length * 0.2) {
    insights.push({
      severity: 'info',
      title: `Just ${count} conversation${count > 1 ? 's' : ''} used ${pct}% of all your spend`,
      description: `Your top ${count} sessions out of ${sessions.length} total account for ${formatCost(cumulative)} of your ${formatCost(totalCost)} total. The most expensive session alone cost ${formatCost(sorted[0].cost)} (${sorted[0].summary || sorted[0].firstPrompt || 'untitled'}).`,
      detail: `Top sessions:\n${sorted.slice(0, 5).map((s, i) => `${i + 1}. ${formatCost(s.cost)} — ${s.summary || s.firstPrompt || 'untitled'} (${s.messages} msgs)`).join('\n')}`,
      helpText: 'This measures how concentrated your spending is. It counts how many of your most expensive sessions it takes to reach 50% of your total cost. A small number means a few heavy sessions dominate your bill — reviewing those sessions can reveal opportunities to reduce cost.'
    });
  }
}

// "X% of your tokens are Claude actually writing"
function outputTokenRatio(insights, overview) {
  const tc = overview.tokenComposition;
  if (!tc || tc.total <= 0) return;

  const outputPct = (tc.output / tc.total * 100);
  if (outputPct < 5) {
    insights.push({
      severity: 'info',
      title: `${outputPct.toFixed(1)}% of your tokens are Claude actually writing`,
      description: `Out of ${formatTokens(tc.total)} total tokens, only ${formatTokens(tc.output)} are Claude's output. The rest is context: ${formatTokens(tc.cacheRead)} cache reads (${(tc.cacheRead / tc.total * 100).toFixed(1)}%) and ${formatTokens(tc.cacheWrite)} cache writes (${(tc.cacheWrite / tc.total * 100).toFixed(1)}%).`,
      detail: `This is normal for Claude Code — most tokens go toward maintaining conversation context. Cache reads are 10x cheaper than regular input, so caching is saving you money.`,
      helpText: 'Output token ratio shows how much of your token usage goes to Claude\'s actual responses vs. input context. In Claude Code, most tokens are input (your code, conversation history, tool results). A low percentage is normal — it means Claude is reading a lot of context to give informed answers. Output tokens are the most expensive per-token, so this ratio affects your overall cost.'
    });
  }
}

// "You use Claude the most on [day]"
function peakUsageDay(insights, overview) {
  if (!overview.dailyActivity || overview.dailyActivity.length < 7) return;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];

  for (const d of overview.dailyActivity) {
    const dow = new Date(d.date).getDay();
    dayCounts[dow] += d.messageCount;
  }

  const maxIdx = dayCounts.indexOf(Math.max(...dayCounts));
  const total = dayCounts.reduce((a, b) => a + b, 0);
  const pct = total > 0 ? Math.round(dayCounts[maxIdx] / total * 100) : 0;

  // Also find weekday vs weekend
  const weekday = dayCounts.slice(1, 6).reduce((a, b) => a + b, 0);
  const weekend = dayCounts[0] + dayCounts[6];

  insights.push({
    severity: 'info',
    title: `You use Claude the most on ${dayNames[maxIdx]}s`,
    description: `${pct}% of your messages (${dayCounts[maxIdx].toLocaleString()}) happen on ${dayNames[maxIdx]}s. ${weekend > weekday * 0.5 ? 'You also have significant weekend usage.' : 'Most of your usage is on weekdays.'}`,
    detail: dayNames.map((name, i) => `${name}: ${dayCounts[i].toLocaleString()} messages`).join('\n'),
    helpText: 'This shows which day of the week you use Claude Code the most, based on message count. It helps you understand your work rhythm. If one day dominates, it may indicate crunch patterns or that you rely on Claude more for certain types of work that cluster on specific days.'
  });
}

// "N simple conversations used Opus unnecessarily"
function modelChoiceEfficiency(insights, sessions) {
  if (!sessions || sessions.length < 3) return;

  let opusSimple = 0;
  let opusSimpleCost = 0;
  const examples = [];

  for (const s of sessions) {
    const hasOpus = Object.keys(s.tokensByModel || {}).some(m => m.includes('opus'));
    if (hasOpus && s.messages <= 6) {
      opusSimple++;
      opusSimpleCost += s.cost;
      if (examples.length < 3) {
        examples.push(s.summary || s.firstPrompt || 'untitled');
      }
    }
  }

  if (opusSimple >= 3) {
    // Estimate Sonnet savings (Sonnet is ~5x cheaper)
    const sonnetCost = opusSimpleCost * 0.2;
    const savings = opusSimpleCost - sonnetCost;

    insights.push({
      severity: 'warning',
      title: `${opusSimple} simple conversations used Opus unnecessarily`,
      description: `These sessions had 6 or fewer messages but used Opus (${formatCost(opusSimpleCost)} total). Sonnet would have cost ~${formatCost(sonnetCost)}, saving ${formatCost(savings)}.`,
      detail: `Examples:\n${examples.map(e => `• ${e}`).join('\n')}\n\nTip: Use "claude --model sonnet" for quick questions, code formatting, or simple refactors.`,
      helpText: 'This identifies sessions where you used the Opus model (the most expensive) for short, simple interactions. Sessions with 6 or fewer messages are likely quick questions or small tasks where Sonnet (5x cheaper) would produce comparable results. The estimated savings assumes Sonnet pricing for those sessions.'
    });
  }
}

// "X% of your tokens went to one project"
function projectConcentration(insights, sessions) {
  if (!sessions || sessions.length < 3) return;

  const projectCosts = {};
  let totalCost = 0;
  for (const s of sessions) {
    const key = s.project || 'Unknown';
    projectCosts[key] = (projectCosts[key] || 0) + s.cost;
    totalCost += s.cost;
  }

  if (totalCost <= 0) return;

  const sorted = Object.entries(projectCosts).sort((a, b) => b[1] - a[1]);
  const [topProject, topCost] = sorted[0];
  const pct = Math.round(topCost / totalCost * 100);

  if (pct >= 50 && sorted.length > 1) {
    const shortName = topProject.split('/').pop() || topProject;
    insights.push({
      severity: 'info',
      title: `${pct}% of your spend went to one project: ${shortName}`,
      description: `${topProject} consumed ${formatCost(topCost)} out of ${formatCost(totalCost)} total. ${sorted.length > 2 ? `The next highest is ${sorted[1][0].split('/').pop()} at ${formatCost(sorted[1][1])}.` : ''}`,
      detail: sorted.slice(0, 5).map(([p, c]) => `${p.split('/').pop()}: ${formatCost(c)} (${Math.round(c / totalCost * 100)}%)`).join('\n'),
      helpText: 'This shows how your spending is distributed across projects. When one project dominates (50%+), it may be worth investigating whether that project has unusually long sessions, large codebases requiring more context, or is simply where you do most of your work. Use the project filter to drill into specific project costs.'
    });
  }
}

// "Each message costs Nx more in long conversations"
function messageEscalation(insights, sessions) {
  if (!sessions || sessions.length < 5) return;

  const short = sessions.filter(s => s.messages > 0 && s.messages <= 10 && s.cost > 0);
  const long = sessions.filter(s => s.messages > 20 && s.cost > 0);

  if (short.length < 3 || long.length < 2) return;

  const shortAvgPerMsg = short.reduce((s, x) => s + x.cost, 0) / short.reduce((s, x) => s + x.messages, 0);
  const longAvgPerMsg = long.reduce((s, x) => s + x.cost, 0) / long.reduce((s, x) => s + x.messages, 0);

  if (shortAvgPerMsg <= 0) return;
  const multiplier = longAvgPerMsg / shortAvgPerMsg;

  if (multiplier > 1.5) {
    insights.push({
      severity: 'warning',
      title: `Each message costs ${multiplier.toFixed(1)}x more in long conversations`,
      description: `In sessions with 20+ messages, each message costs ~${formatCost(longAvgPerMsg)} vs ${formatCost(shortAvgPerMsg)} in shorter sessions. This is because context grows with each turn.`,
      detail: `Short sessions (≤10 msgs): ${formatCost(shortAvgPerMsg)}/message average\nLong sessions (20+ msgs): ${formatCost(longAvgPerMsg)}/message average\n\nTip: Use /compact to compress context in long sessions, or start a new session when switching topics.`,
      helpText: 'This compares the average per-message cost in short vs. long sessions. Every message in a Claude Code session includes the full conversation history as input, so later messages carry more context and cost more. The multiplier shows how much more expensive each additional message becomes. A high multiplier (3x+) means long sessions are significantly driving up your bill.'
    });
  }
}

// "N conversations started with XK+ tokens of context"
function largeContextSessions(insights, sessions) {
  if (!sessions || sessions.length < 3) return;

  let largeContextCount = 0;
  let totalExtraCost = 0;

  for (const s of sessions) {
    for (const [model, tokens] of Object.entries(s.tokensByModel || {})) {
      if (tokens.cacheCreationInputTokens > 66000) {
        largeContextCount++;
        // Cost of just the cache creation portion
        const pricing = getPricing(model);
        totalExtraCost += (tokens.cacheCreationInputTokens / 1e6) * pricing.cacheWrite;
        break;
      }
    }
  }

  if (largeContextCount >= 2) {
    insights.push({
      severity: 'info',
      title: `${largeContextCount} conversations started with 66K+ tokens of context`,
      description: `These sessions had large initial cache creation costs (${formatCost(totalExtraCost)} total). This happens when CLAUDE.md files, project context, or pasted content is large.`,
      detail: `Large initial context isn't always bad — it helps Claude understand your codebase. But if you're paying for the same context repeatedly across sessions, consider:\n• Using /continue to resume sessions\n• Keeping CLAUDE.md concise\n• Reducing pasted content size`,
      helpText: 'Cache creation tokens are written when Claude first processes your project context (CLAUDE.md, system prompts, initial files). 66K tokens is roughly 50K words — a substantial amount of context. Cache writes are expensive ($18.75/M for Opus), but they enable cheaper cache reads ($1.50/M) on subsequent messages. This insight flags sessions with unusually large upfront context costs.'
    });
  }
}

// Cache hit rate insight
function cacheEfficiency(insights, overview) {
  const tc = overview.tokenComposition;
  if (!tc || (tc.cacheRead + tc.cacheWrite) === 0) return;

  const hitRate = tc.cacheRead / (tc.cacheRead + tc.cacheWrite) * 100;

  if (hitRate < 80) {
    const ideal = tc.cacheWrite * 0.1; // if cache write was only 10%
    const actualWriteCost = tc.cacheWrite; // tokens
    insights.push({
      severity: 'warning',
      title: `Your cache hit rate is ${hitRate.toFixed(0)}%`,
      description: `For every ${formatTokens(tc.cacheRead)} tokens read from cache, ${formatTokens(tc.cacheWrite)} were written. A higher hit rate means more reuse of cached context and lower costs.`,
      detail: `Cache writes cost more than cache reads. To improve:\n• Use longer sessions instead of many short ones\n• Use /continue to resume previous sessions\n• Avoid clearing conversation history unnecessarily`,
      helpText: 'Cache hit rate = cache reads / (cache reads + cache writes). It measures how often Claude reuses previously cached context instead of creating it from scratch. Cache reads cost ~10x less than writes (e.g. $1.50 vs $18.75 per million tokens for Opus). Below 80% means you\'re paying more for cache creation than ideal — usually from many short sessions that each rebuild context.'
    });
  } else {
    insights.push({
      severity: 'info',
      title: `Your cache hit rate is ${hitRate.toFixed(0)}% — that's efficient`,
      description: `${formatTokens(tc.cacheRead)} tokens were served from cache vs ${formatTokens(tc.cacheWrite)} cache writes. Cache reads are 10x cheaper than creation, so this is saving you money.`,
      detail: `Cache read: $${(1.50).toFixed(2)}/M tokens vs Cache write: $${(18.75).toFixed(2)}/M tokens (Opus pricing). Your caching efficiency is keeping costs down.`,
      helpText: 'Cache hit rate = cache reads / (cache reads + cache writes). It measures how often Claude reuses previously cached context instead of creating it from scratch. Cache reads cost ~10x less than writes (e.g. $1.50 vs $18.75 per million tokens for Opus). A rate above 80% means your sessions are efficiently reusing context, keeping costs lower.'
    });
  }
}

// Average cost per message
function costPerMessage(insights, overview, sessions) {
  if (!sessions || sessions.length < 3) return;
  if (!overview.totalCost || !overview.totalMessages || overview.totalMessages <= 0) return;

  const avgCost = overview.totalCost / overview.totalMessages;

  // Find the session with the highest per-message cost (min 3 messages to exclude noise)
  const qualifying = sessions.filter(s => s.messages >= 3 && s.cost > 0);
  let mostExpensivePerMsg = null;
  let highestPerMsg = 0;
  for (const s of qualifying) {
    const perMsg = s.cost / s.messages;
    if (perMsg > highestPerMsg) {
      highestPerMsg = perMsg;
      mostExpensivePerMsg = s;
    }
  }

  // Find cheapest per-message session
  let cheapestPerMsg = null;
  let lowestPerMsg = Infinity;
  for (const s of qualifying) {
    const perMsg = s.cost / s.messages;
    if (perMsg < lowestPerMsg) {
      lowestPerMsg = perMsg;
      cheapestPerMsg = s;
    }
  }

  const range = highestPerMsg > 0 && lowestPerMsg < Infinity
    ? `\nRange: ${formatCost(lowestPerMsg)}/msg (cheapest) to ${formatCost(highestPerMsg)}/msg (most expensive) — a ${(highestPerMsg / lowestPerMsg).toFixed(0)}x difference`
    : '';

  const expDetail = mostExpensivePerMsg
    ? `\nMost expensive: ${formatCost(highestPerMsg)}/msg in "${(mostExpensivePerMsg.summary || mostExpensivePerMsg.firstPrompt || 'untitled').slice(0, 80)}" (${mostExpensivePerMsg.messages} msgs, ${formatCost(mostExpensivePerMsg.cost)} total)`
    : '';

  const cheapDetail = cheapestPerMsg
    ? `\nCheapest: ${formatCost(lowestPerMsg)}/msg in "${(cheapestPerMsg.summary || cheapestPerMsg.firstPrompt || 'untitled').slice(0, 80)}" (${cheapestPerMsg.messages} msgs, ${formatCost(cheapestPerMsg.cost)} total)`
    : '';

  insights.push({
    severity: 'info',
    title: `Your average cost per message is ${formatCost(avgCost)}`,
    description: `Across ${overview.totalMessages.toLocaleString()} messages totalling ${formatCost(overview.totalCost)}, each message costs ${formatCost(avgCost)} on average. This includes both your prompts and Claude's responses.`,
    detail: `${formatCost(overview.totalCost)} total / ${overview.totalMessages.toLocaleString()} messages = ${formatCost(avgCost)}/message${range}${expDetail}${cheapDetail}`,
    helpText: 'Average cost per message = total cost / total messages. This gives you a quick baseline for how much each interaction costs. The range between cheapest and most expensive sessions shows how much variability there is — sessions with large codebases or long histories cost more per message due to growing context. Use this to estimate future costs based on your messaging volume.'
  });
}

// Short vs long session cost efficiency
function shortVsLongSessions(insights, sessions) {
  if (!sessions || sessions.length < 5) return;

  const veryShort = sessions.filter(s => s.messages <= 3 && s.messages > 0);
  const total = sessions.length;

  if (veryShort.length < 3) return;

  const shortPct = Math.round(veryShort.length / total * 100);
  const shortTotalCost = veryShort.reduce((s, x) => s + x.cost, 0);

  if (shortPct >= 25) {
    insights.push({
      severity: 'warning',
      title: `${shortPct}% of sessions are 3 messages or fewer`,
      description: `${veryShort.length} out of ${total} sessions are very short, costing ${formatCost(shortTotalCost)} total. Short sessions have disproportionate cache warm-up costs.`,
      detail: `Each new session pays for cache creation. When you ask one quick question and close, most of the cost goes to building context that's never reused.\n\nTip: Keep sessions open for follow-up questions. Use /continue to resume sessions instead of starting new ones.`,
      helpText: 'This counts sessions where you sent 3 or fewer messages. Each new session incurs a "cold start" cost — Claude must read and cache your project context, CLAUDE.md, and system prompts. For very short sessions, this setup cost dominates the total, making each message disproportionately expensive. Consolidating quick questions into longer sessions improves cost efficiency.'
    });
  }
}

// Weekend/late night patterns
function weekendWarrior(insights, overview) {
  if (!overview.hourCounts || Object.keys(overview.hourCounts).length < 5) return;

  const totalSessions = Object.values(overview.hourCounts).reduce((a, b) => a + b, 0);
  if (totalSessions < 10) return;

  // Late night: 11pm - 5am
  const lateHours = [23, 0, 1, 2, 3, 4, 5];
  const lateSessions = lateHours.reduce((s, h) => s + (overview.hourCounts[h] || 0), 0);
  const latePct = Math.round(lateSessions / totalSessions * 100);

  if (latePct >= 15) {
    // Find peak late hour
    let peakLateHour = 23;
    let peakLateCount = 0;
    for (const h of lateHours) {
      const count = overview.hourCounts[h] || 0;
      if (count > peakLateCount) {
        peakLateCount = count;
        peakLateHour = h;
      }
    }

    insights.push({
      severity: 'info',
      title: `${latePct}% of your coding happens after 11 PM`,
      description: `${lateSessions} sessions between 11 PM and 5 AM, peaking at ${peakLateHour}:00. Late-night sessions tend to be longer and more exploratory.`,
      detail: `Hour distribution:\n${Object.entries(overview.hourCounts).sort((a, b) => a[0] - b[0]).map(([h, c]) => `${h.toString().padStart(2, '0')}:00 — ${c} sessions`).join('\n')}`,
      helpText: 'This tracks what percentage of your sessions happen between 11 PM and 5 AM (your local time). Late-night coding sessions tend to be more exploratory and can run longer, which increases costs. This is purely informational — it helps you understand your usage patterns and whether late-night work is a significant part of your workflow.'
    });
  }
}

module.exports = { generateInsights };

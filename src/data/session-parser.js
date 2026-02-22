const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function parseSessionFile(filePath) {
  const messages = [];
  let sessionId = null;
  let projectPath = null;
  let gitBranch = null;
  let firstTimestamp = null;
  let lastTimestamp = null;

  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);

      if (!sessionId && obj.sessionId) sessionId = obj.sessionId;
      if (!projectPath && obj.cwd) projectPath = obj.cwd;
      if (!gitBranch && obj.gitBranch) gitBranch = obj.gitBranch;

      if (obj.timestamp) {
        const ts = new Date(obj.timestamp).getTime();
        if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
        if (!lastTimestamp || ts > lastTimestamp) lastTimestamp = ts;
      }

      if (obj.type === 'assistant' && obj.message) {
        const msg = obj.message;
        messages.push({
          type: 'assistant',
          model: msg.model || null,
          usage: msg.usage ? {
            inputTokens: msg.usage.input_tokens || 0,
            outputTokens: msg.usage.output_tokens || 0,
            cacheReadInputTokens: msg.usage.cache_read_input_tokens || 0,
            cacheCreationInputTokens: msg.usage.cache_creation_input_tokens || 0
          } : null,
          toolCalls: extractToolCalls(msg.content),
          timestamp: obj.timestamp
        });
      } else if (obj.type === 'user' && obj.message && !obj.isMeta) {
        const content = obj.message.content;
        let promptText = '';
        if (typeof content === 'string') {
          promptText = content;
        } else if (Array.isArray(content)) {
          promptText = content
            .filter(c => c && c.type === 'text')
            .map(c => c.text || '')
            .join(' ');
        }
        // Strip command tags
        promptText = promptText.replace(/<[^>]+>/g, '').trim();
        messages.push({
          type: 'user',
          promptText,
          timestamp: obj.timestamp
        });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return {
    sessionId: sessionId || path.basename(filePath, '.jsonl'),
    projectPath,
    gitBranch,
    firstTimestamp,
    lastTimestamp,
    duration: firstTimestamp && lastTimestamp ? lastTimestamp - firstTimestamp : 0,
    messages,
    messageCount: messages.length,
    assistantMessages: messages.filter(m => m.type === 'assistant'),
    userMessages: messages.filter(m => m.type === 'user')
  };
}

function extractToolCalls(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter(c => c && c.type === 'tool_use')
    .map(c => ({
      name: c.name,
      input: c.input || {}
    }));
}

function aggregateSessionTokens(session) {
  const totals = {};

  for (const msg of session.assistantMessages) {
    if (!msg.usage || !msg.model) continue;
    if (!totals[msg.model]) {
      totals[msg.model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0
      };
    }
    totals[msg.model].inputTokens += msg.usage.inputTokens;
    totals[msg.model].outputTokens += msg.usage.outputTokens;
    totals[msg.model].cacheReadInputTokens += msg.usage.cacheReadInputTokens;
    totals[msg.model].cacheCreationInputTokens += msg.usage.cacheCreationInputTokens;
  }

  return totals;
}

function extractWriteEditCalls(session) {
  const writes = [];
  const edits = [];

  for (const msg of session.assistantMessages) {
    for (const tool of msg.toolCalls) {
      if (tool.name === 'Write' || tool.name === 'write') {
        writes.push({
          filePath: tool.input.file_path || tool.input.path || null,
          content: tool.input.content || '',
          timestamp: msg.timestamp
        });
      }
      if (tool.name === 'Edit' || tool.name === 'edit') {
        edits.push({
          filePath: tool.input.file_path || tool.input.path || null,
          oldString: tool.input.old_string || '',
          newString: tool.input.new_string || '',
          timestamp: msg.timestamp
        });
      }
    }
  }

  return { writes, edits };
}

// Get paired user-prompt → assistant-response with costs
function pairMessages(session) {
  const pairs = [];
  const msgs = session.messages;

  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].type === 'user') {
      // Collect all assistant responses until next user message
      const responses = [];
      let j = i + 1;
      while (j < msgs.length && msgs[j].type === 'assistant') {
        responses.push(msgs[j]);
        j++;
      }
      if (responses.length > 0) {
        pairs.push({
          prompt: msgs[i],
          responses,
          turnIndex: pairs.length
        });
      }
    }
  }
  return pairs;
}

module.exports = {
  parseSessionFile,
  aggregateSessionTokens,
  extractWriteEditCalls,
  pairMessages
};

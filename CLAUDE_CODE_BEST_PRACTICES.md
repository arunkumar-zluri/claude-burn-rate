# Claude Code Best Practices: Save Tokens, Cut Costs, Work Smarter

> A comprehensive guide to optimizing your Claude Code usage. Based on Anthropic's official docs, community research, and real-world data from developers tracking millions of tokens.

---

## Table of Contents

- [The Numbers That Matter](#the-numbers-that-matter)
- [1. Prompt Craft](#1-prompt-craft)
- [2. Session Discipline](#2-session-discipline)
- [3. Model Selection Strategy](#3-model-selection-strategy)
- [4. Context Window Management](#4-context-window-management)
- [5. Caching — Your Biggest Cost Lever](#5-caching--your-biggest-cost-lever)
- [6. Tool Usage Efficiency](#6-tool-usage-efficiency)
- [7. CLAUDE.md and Project Setup](#7-claudemd-and-project-setup)
- [8. Cost Reduction Techniques](#8-cost-reduction-techniques)
- [9. The 7 Critical Token-Wasting Anti-Patterns](#9-the-7-critical-token-wasting-anti-patterns)
- [10. Quick Reference Cheat Sheet](#10-quick-reference-cheat-sheet)
- [Sources](#sources)

---

## The Numbers That Matter

| Metric | Value |
|---|---|
| Average Claude Code cost per developer/day | **$6** |
| 90th percentile cost per developer/day | **$12** |
| Typical monthly cost (Sonnet) | **$100–200/developer** |
| Cost reduction possible with optimization | **40–70%** |
| Cache read discount vs full input price | **90% cheaper** |
| Token waste from common anti-patterns | **35% of total usage** |

---

## 1. Prompt Craft

### The Golden Rule: Specific, Bounded, Verifiable

Claude 4.x models take instructions literally. Vague prompts trigger broad file scanning. Specific prompts let Claude work surgically.

### Bad vs Good Prompts

**Vague prompt (causes exploration spiral, 10–50x more tokens):**
```
fix the login bug
```

**Specific prompt (surgical, verifiable):**
```
Users report that login fails after session timeout. Check the auth flow
in src/auth/, especially token refresh. Write a failing test that
reproduces the issue, then fix it.
```

---

**Over-specified prompt (wastes input tokens on context Claude can discover):**
```
In my project at /Users/me/projects/myapp, which uses React 18.2.0 with
TypeScript 5.3.2, webpack 5.89.0, and has the following directory
structure: src/components/ (Button.tsx, Header.tsx, Footer.tsx, Nav.tsx,
Sidebar.tsx, Modal.tsx...), I need you to look at the Button component
in src/components/Button.tsx which currently has props interface
IButtonProps { label: string; onClick: () => void; ... } and change it
to also accept a 'variant' prop...
```

**Just enough context:**
```
Add a 'variant' prop to the Button component in src/components/Button.tsx.
Support "primary", "secondary", and "danger" variants. Follow the
existing pattern used in other components like Header.tsx.
```

---

**No context (forces unnecessary file reads):**
```
Why does ExecutionFactory have such a weird API?
```

**Directed:**
```
Look through ExecutionFactory's git history and summarize how its
API came to be.
```

---

**No verification criteria (trust-then-debug cycle):**
```
Implement a function that validates email addresses.
```

**With test cases:**
```
Write a validateEmail function. Test cases:
user@example.com -> true, "invalid" -> false, user@.com -> false.
Run the tests after implementing.
```

### Prompt Optimization Checklist

- [ ] Does it name specific files/functions? (avoids broad scanning)
- [ ] Does it reference an existing pattern? ("Follow UserController.ts")
- [ ] Does it include success criteria? (test cases, expected output)
- [ ] Is it under ~200 words? (if longer, you're over-specifying)
- [ ] Did you remove "be thorough" / "think carefully"? (counterproductive on Claude 4.x)

---

## 2. Session Discipline

### The Context Quality Zones

Research shows Claude's output quality correlates with context window usage:

| Context Usage | Quality | Behavior |
|---|---|---|
| **0–40%** | High | Clean output, exact instruction following |
| **40–70%** | Medium | Quality drops, some corner-cutting |
| **70%+** | Low | Sloppy work, instructions often ignored |

### When to Start Fresh (`/clear`)

- Switching to an unrelated task
- After completing a feature or fix
- After 20+ turns of iteration
- When `/cost` shows over 5M tokens

### When to Continue

- Tasks are directly related and share context
- You're iterating on the same feature
- Prior conversation contains critical decisions not captured elsewhere

### The Optimal Session Pattern

```
1. /clear (fresh start)
2. CLAUDE.md loads automatically
3. Work on a single objective
4. /compact if context grows (with custom focus instructions)
5. Complete task, commit
6. /rename (label for future reference)
7. /clear, repeat
```

### The Undo/Redo Trap

After **2 failed correction attempts**, stop. Each correction cycle adds 1,000–5,000+ tokens of failed code and error messages to context. After 3 cycles, you may have 15,000+ tokens of noise actively misleading the model.

**Instead:** Run `/clear` and write a better initial prompt that incorporates what you learned from the failures. A clean session with a better prompt almost always outperforms a polluted session with accumulated corrections.

### Git as Checkpoints

- Commit after each logical unit of work
- Use `Escape` (double-tap) or `/rewind` to restore conversation + code state
- Never rely on conversation history as your undo mechanism

---

## 3. Model Selection Strategy

### Pricing Reference

| Model | Input | Output | Cache Read | Cache Write |
|---|---|---|---|---|
| **Opus 4.6** | $15/M | $75/M | $1.50/M | $18.75/M |
| **Sonnet 4.6** | $3/M | $15/M | $0.30/M | $3.75/M |
| **Haiku 4.5** | $0.80/M | $4/M | $0.08/M | $1.00/M |

### When to Use Each

**Sonnet (80–90% of your work):**
- Daily coding: implementation, bug fixes, features
- Code review and single-file refactoring
- Test writing and debugging
- Documentation generation
- 90% of Opus capability at 2x speed, 60% the cost

**Opus (reserve for hard problems):**
- Complex architectural decisions spanning multiple systems
- Multi-file refactoring with deep interdependencies
- Debugging subtle, non-obvious bugs
- When Sonnet's answers require repeated follow-up

**Haiku (lightweight operations):**
- Subagent tasks (`CLAUDE_CODE_SUBAGENT_MODEL=haiku`)
- Simple code generation, boilerplate, formatting
- Quick lookups and transformations

### The `opusplan` Strategy

Use `/model opusplan` to get:
- **Opus** during plan mode (Shift+Tab) — quality architectural reasoning
- **Sonnet** during execution — fast code generation

Result: ~60% cost reduction vs pure Opus, higher quality than pure Sonnet.

### Effort Levels (Opus only)

Opus supports effort levels controlling reasoning depth:
- **Low:** Faster and cheaper for straightforward tasks
- **Medium:** Balanced
- **High (default):** Deep reasoning for complex problems

Set via: `CLAUDE_CODE_EFFORT_LEVEL=low|medium|high`

---

## 4. Context Window Management

### What Consumes Your Context

Every file read, command output, and tool result stays in context until compaction. Claude re-processes the **entire conversation** with each new message.

### CLAUDE.md Impact

Your CLAUDE.md loads at session start and stays in context for **every single message**. Target: **under 500 lines / ~5,000 tokens**.

### MCP Server Overhead — The Hidden Cost

Each connected MCP server adds tool definitions to context, even when idle:

| Scenario | Token Overhead |
|---|---|
| 5 servers, 58 tools | ~55,000 tokens before typing anything |
| Single Jira server | ~17,000 tokens |
| With Tool Search enabled | ~500 tokens (85% reduction) |

**Mitigations:**
- Run `/context` to audit what's consuming space
- Set `ENABLE_TOOL_SEARCH=auto:5` for aggressive tool search
- Prefer CLI tools (`gh`, `aws`, `gcloud`) over MCP servers — no persistent overhead
- Disable unused servers via `/mcp`

### Subagent Strategy

Subagents run in their own context windows. Fixed overhead: ~20K tokens per spawn.

**Use subagents for:** Running tests, fetching docs, processing logs — verbose output stays in the subagent's context, only a summary returns.

**Don't use subagents for:** Small tasks where the 20K overhead exceeds the task cost. A subagent that reads one file costs 20K tokens; the same task in the main thread costs ~2K.

---

## 5. Caching — Your Biggest Cost Lever

### How It Works

Claude Code automatically inserts cache breakpoints. The system caches the processed state of your prompt prefix. On subsequent requests with the same prefix, the model loads the cached state instead of recomputing.

| Token Type | Cost vs Base Input |
|---|---|
| Cache writes | 1.25x (one-time) |
| Cache reads (hits) | 0.1x (**90% savings**) |
| Cache lifetime | 5 minutes (refreshed on use) |

### Behaviors That Maximize Cache Hits

1. **Keep your conversation prefix stable** — changing anything early invalidates everything after it
2. **Don't change tool definitions mid-session** — invalidates the entire cache
3. **Don't toggle web search, citations, or speed settings** — modifies system prompt, invalidates caches
4. **Work within the 5-minute window** — follow-up messages within 5 min refresh the cache for free
5. **Stay on one model** — different models have different cache pools

### Behaviors That Waste Cache

- Switching models mid-session
- Changing thinking parameters (enable/disable, budget changes)
- Long pauses (>5 minutes without activity)
- Starting new sessions for every small task (rebuilds cache from scratch)

### Real Impact

Processing 2M input tokens: **$6.00 without caching → $1.15 with caching** (81% reduction).

---

## 6. Tool Usage Efficiency

### The Token Cost of Tools

**File reads are the biggest context consumers.** A single large file can add thousands of tokens that persist for the rest of the session.

**Command output (Bash):** A verbose `npm test` can dump 10K+ tokens into context.

### The Two-Step Pattern

```
# Step 1: Find (cheap — ~100 tokens)
grep "feature" src/

# Step 2: Read (targeted — ~2K tokens)
Read the specific file/function found

# Total: ~2.1K tokens
```

vs.

```
# The expensive way: Read multiple files looking for the feature
Read file1.ts (3K tokens)
Read file2.ts (5K tokens)
Read file3.ts (2K tokens)

# Total: ~10K tokens
```

**Community mantra: "GREP > AGENT" (100 tokens vs 40K tokens)**

### Use Hooks to Filter Output

Instead of Claude reading a 10,000-line log file, use a PreToolUse hook to filter:

```bash
#!/bin/bash
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command')

if [[ "$cmd" =~ ^(npm test|pytest|go test) ]]; then
  filtered_cmd="$cmd 2>&1 | grep -A 5 -E '(FAIL|ERROR|error:)' | head -100"
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"updatedInput\":{\"command\":\"$filtered_cmd\"}}}"
else
  echo "{}"
fi
```

### Partial File Reads

Use `offset` and `limit` with the Read tool to read only relevant sections of large files, not the whole thing.

---

## 7. CLAUDE.md and Project Setup

### What to Include (Under 500 Lines)

| Include | Why |
|---|---|
| Project summary (2–3 sentences) | Orients Claude quickly |
| Tech stack (list format) | Prevents wrong framework assumptions |
| Build/test/lint commands | Claude can't guess these |
| Code style and naming conventions | Prevents rework |
| Key architecture decisions | Avoids wrong patterns |
| Forbidden directories | Prevents scanning node_modules/ |

### What to Exclude

| Exclude | Why |
|---|---|
| Narrative text and explanations | Wastes tokens on every message |
| Obvious information | Claude already knows what JavaScript is |
| Detailed API documentation | Link to it instead |
| Task-specific workflows | Move to Skills |

### Skills vs. CLAUDE.md

**Skills** (`.claude/skills/`) load on-demand. **CLAUDE.md** loads on every message.

Moving specialized instructions from CLAUDE.md to skills recovers **~15,000 tokens per session** — an **82% improvement**.

**Move to skills:** PR review workflows, deployment checklists, migration procedures, domain-specific patterns.

**Keep in CLAUDE.md:** Universal conventions, build commands, forbidden dirs, architecture overview.

### Custom Compaction Instructions

Add to CLAUDE.md:
```markdown
# Compact instructions
When compacting, focus on preserving: code changes, test output, and API decisions.
```

---

## 8. Cost Reduction Techniques

### Environment Variables

```bash
# Reduce thinking budget (default is 31,999 — very expensive as output tokens)
MAX_THINKING_TOKENS=8000

# Use cheap models for subagents
CLAUDE_CODE_SUBAGENT_MODEL=haiku

# Suppress background model calls
DISABLE_NON_ESSENTIAL_MODEL_CALLS=1

# Reduce Opus reasoning depth for simple tasks
CLAUDE_CODE_EFFORT_LEVEL=low

# Aggressive tool search to reduce MCP overhead
ENABLE_TOOL_SEARCH=auto:5
```

### Extended Thinking Budget

Extended thinking is billed as **output tokens** (the most expensive type). Default: 31,999 tokens.

- Lower to 8,000 or even 1,024 for routine tasks
- Disable entirely in `/config` for simple implementation
- Use high budgets only for complex planning/reasoning

### Batch API

50% discount on both input and output tokens. Combine with caching for maximum savings. Use for non-urgent bulk operations: code analysis, large refactors, CI/CD analysis.

### Subscription vs. API Cost Comparison

| Plan | Monthly Cost | Break-Even Point |
|---|---|---|
| API (Sonnet) | ~$100–200/developer | — |
| Max 5x | $100 | ~17 heavy-use days |
| Max 20x | $200 | ~33 heavy-use days |

### Monitoring Commands

| Command | What It Shows |
|---|---|
| `/cost` | Current session cost, tokens, duration |
| `/stats` | Usage patterns (subscription users) |
| `/context` | What's consuming context space |
| `npx ccusage daily` | Daily cost breakdown by model |
| `npx ccusage monthly` | Monthly aggregation |

---

## 9. The 7 Critical Token-Wasting Anti-Patterns

Documented by a developer who tracked 2M tokens across 20+ sessions, identifying **700K+ tokens of waste (35% of total usage)**.

### Pattern 1: Implementation Without Checking Existing Code
**Waste: 70K tokens | Savings: 97%**

Claude builds a WebSocket server from scratch when SSE was already implemented at line 304.

**Fix:** `grep "feature" src/` first (100 tokens), then read existing code (2K tokens). Total: 2.6K vs 70K.

### Pattern 2: Uncoordinated Agent Swarms
**Waste: 300K tokens | Savings: 93%**

7 parallel agents each read the entire 9,339-line project to deliver 3 buttons.

**Fix:** Use 1 sequential agent, test after each module. Expected: 20K vs 410K.

### Pattern 3: Building Without Testing
**Waste: 124K tokens | Savings: 92%**

Generate 34 modules then test. Nothing loads. 50K additional debugging tokens.

**Fix:** Write one module, test it, continue. Total: ~10K vs 124K.

### Pattern 4: Overengineering
**Waste: 112K tokens | Savings: 98%**

User wanted live logs (a simple fix). Agent delivered WebSocket + Conversation Logger + BSV Integration.

**Fix:** Only build what is explicitly requested. No bonus features.

### Pattern 5: Parallel File Collisions
**Waste: 15K tokens | 100% preventable**

Two agents edit the same file simultaneously, causing compiler errors and fix cycles.

### Pattern 6: Context Lost After Compaction
**Waste: 80K tokens per repeated mistake**

User states "Feature X failed 3x, never build it!" — lost during compaction. Agent rebuilds the same failed feature.

**Fix:** Persist critical preferences in CLAUDE.md, not just conversation.

### Pattern 7: The "Death Spiral"

Context fills with thoughts rather than code, forcing more frequent compactions, which accelerates context loss, which causes more exploration, which fills context faster. A vicious feedback loop.

**Fix:** Delegate verbose operations to subagents. Use `/compact` proactively with focus instructions.

---

## 10. Quick Reference Cheat Sheet

### Prompting

| Do | Don't |
|---|---|
| Name specific files and functions | Say "fix the bug" |
| Provide test cases or expected output | Leave "done" ambiguous |
| Reference exemplar patterns in the codebase | Assume Claude knows your conventions |
| Keep prompts under ~200 words | Paste your entire project structure |
| Remove "be thorough" / "think carefully" | Add anti-laziness instructions |

### Sessions

| Do | Don't |
|---|---|
| `/clear` between unrelated tasks | One session running all day |
| Commit at logical milestones | Rely on conversation as undo |
| After 2 failed corrections, start fresh | Keep correcting in polluted context |
| `/compact Focus on X` when context grows | Let auto-compaction decide what to keep |
| `/rename` sessions for later reference | Lose valuable session context |

### Model Selection

| Do | Don't |
|---|---|
| Sonnet for 80% of tasks | Opus for everything |
| Haiku for subagents | Expensive models for boilerplate |
| `opusplan` for plan+execute workflows | Forget to switch models by task complexity |
| Effort level `low` for simple Opus tasks | Always use high effort |

### Tools & Context

| Do | Don't |
|---|---|
| Grep first, then read specific files | Read multiple files speculatively |
| Use subagents for verbose operations | Let test output pollute main context |
| Disable unused MCP servers | Leave 5+ servers connected |
| Use CLI tools over MCP when available | Add MCP for every service |
| Run `/context` regularly | Ignore what's consuming your tokens |

### The Golden Rules

```
CHECK FIRST, BUILD SECOND    (grep before implement)
TEST IMMEDIATELY             (1 file → test → continue)
ONE TASK, ONE SESSION        (/clear between tasks)
GREP > AGENT                 (100 tokens vs 40K tokens)
PERSIST CRITICAL CONTEXT     (CLAUDE.md, not just memory)
START SMALL                  (iterate, don't build everything)
COMMIT OFTEN                 (git as your undo mechanism)
```

---

## Sources

- [Manage Costs Effectively — Claude Code Official Docs](https://code.claude.com/docs/en/costs)
- [Best Practices for Claude Code — Official Docs](https://code.claude.com/docs/en/best-practices)
- [Model Configuration — Claude Code Docs](https://code.claude.com/docs/en/model-config)
- [Prompt Caching — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Effective Context Engineering for AI Agents — Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [7 Critical Token-Wasting Patterns — GitHub Issue #13579](https://github.com/anthropics/claude-code/issues/13579)
- [Claude Code Skills: 98% Token Savings — CodeWithSeb](https://www.codewithseb.com/blog/claude-code-skills-reusable-ai-workflows-guide)
- [Claude Code Token Management: Save 50–70% — Richard Porter](https://richardporter.dev/blog/claude-code-token-management)
- [Optimising MCP Server Context Usage — Scott Spence](https://scottspence.com/posts/optimising-mcp-server-context-usage-in-claude-code)
- [Why You Need To Clear Your Coding Agent's Context Window — willness.dev](https://willness.dev/blog/one-session-per-task)
- [AI Coding: Managing Context — Pete Hodgson](https://blog.thepete.net/blog/2025/10/29/ai-coding-managing-context/)
- [Claude Code Pricing & Optimization — ClaudeFast](https://claudefa.st/blog/guide/development/usage-optimization)
- [5 Strategies to Reduce Token Costs by 60–80% — KAPI](https://www.kapihq.com/blog/token-cost-optimization)
- [The Hidden Costs of Claude Code — AI Engineering Report](https://www.aiengineering.report/p/the-hidden-costs-of-claude-code-token)
- [60–80% of Tokens are a WASTE — GitHub Issue #4804](https://github.com/anthropics/claude-code/issues/4804)
- [Claude Code Anti-Patterns Exposed — KDnuggets](https://ai-report.kdnuggets.com/p/claude-code-anti-patterns-exposed)

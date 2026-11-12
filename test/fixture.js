'use strict';
// Builds a fake CLAUDE_DIR with neutral, synthetic content. Nothing here is copied from real transcripts.
const fs = require('fs');
const os = require('os');
const path = require('path');

const SECRETS = {
  prompt: 'PROMPT-SECRET-alpha please summarise the quarterly widgets',
  assistantText: 'ASSISTANT-SECRET-beta here is my plan',
  toolInput: 'TOOLINPUT-SECRET-gamma /srv/private/ledger.csv',
  toolOutput: 'TOOLOUTPUT-SECRET-delta',
  name: 'NAME-SECRET-epsilon session',
  description: 'DESC-SECRET-zeta research the ledger',
};

const SID = '11111111-2222-4333-8444-555555555555';
const SID2 = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
const CWD = '/work/acme.app';

function procStart(pid = process.pid) {
  const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  return s.slice(s.lastIndexOf(')') + 2).split(' ')[19];
}

const iso = (ms) => new Date(ms).toISOString();

const asst = (ms, content, stop = null, model = 'claude-test-1') => JSON.stringify({
  type: 'assistant', timestamp: iso(ms),
  message: { role: 'assistant', model, stop_reason: stop, content },
});
const userPrompt = (ms, text = SECRETS.prompt) => JSON.stringify({ type: 'user', timestamp: iso(ms), message: { role: 'user', content: text } });
const toolResult = (ms, id) => JSON.stringify({
  type: 'user', timestamp: iso(ms),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: SECRETS.toolOutput }] },
});
const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input });
const text = (t = SECRETS.assistantText) => ({ type: 'text', text: t });
const bashLaunch = (id, command) => toolUse(id, 'Bash', { command });

function slug(cwd) { return cwd.replace(/[\/.]/g, '-'); }

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocdash-test-'));
  const claudeDir = path.join(root, 'claude');
  fs.mkdirSync(path.join(claudeDir, 'sessions'), { recursive: true });
  const api = {
    root, claudeDir,
    // Registers a live session using the test process's own pid by default.
    session(o = {}) {
      const pid = o.pid ?? process.pid;
      const id = o.id ?? SID;
      const cwd = o.cwd ?? CWD;
      const j = {
        pid, sessionId: id, cwd, startedAt: o.startedAt ?? Date.now() - 3600e3,
        procStart: o.procStart ?? (fs.existsSync(`/proc/${pid}`) ? procStart(pid) : '1'), kind: o.kind ?? 'interactive',
        status: o.status ?? 'idle', updatedAt: o.updatedAt ?? Date.now(), statusUpdatedAt: o.statusUpdatedAt ?? Date.now(),
        name: SECRETS.name,
      };
      fs.writeFileSync(path.join(claudeDir, 'sessions', `${pid}.json`), JSON.stringify(j));
      fs.writeFileSync(path.join(claudeDir, 'sessions', `${pid}.deadbeef.key`), 'KEY-SECRET-do-not-read');
      return j;
    },
    transcriptPath(id = SID, cwd = CWD) {
      const d = path.join(claudeDir, 'projects', slug(cwd));
      fs.mkdirSync(d, { recursive: true });
      return path.join(d, id + '.jsonl');
    },
    transcript(lines, id = SID, cwd = CWD) {
      fs.writeFileSync(api.transcriptPath(id, cwd), lines.join('\n') + '\n');
    },
    append(lines, id = SID, cwd = CWD) {
      fs.appendFileSync(api.transcriptPath(id, cwd), lines.join('\n') + '\n');
    },
    subagent(hex, meta, lines = [], id = SID, cwd = CWD) {
      const d = path.join(claudeDir, 'projects', slug(cwd), id, 'subagents');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, `agent-${hex}.meta.json`), JSON.stringify({
        agentType: 'general-purpose', toolUseId: 'toolu_x', finished: false, spawnDepth: 1, description: SECRETS.description, ...meta,
      }));
      fs.writeFileSync(path.join(d, `agent-${hex}.jsonl`), lines.join('\n') + (lines.length ? '\n' : ''));
    },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); },
  };
  return api;
}

module.exports = { SECRETS, SID, SID2, CWD, makeFixture, asst, userPrompt, toolResult, toolUse, text, bashLaunch, procStart };

process.removeAllListeners('warning');
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const os = require('os');

const PORT = parseInt(process.env.PORT) || 3456;
const DB_PATH = path.join(os.homedir(), '.local/share/opencode/opencode.db');
const LOG_PATH = path.join(os.homedir(), '.local/share/opencode/log/opencode.log');
const LOCKS_DIR = path.join(os.homedir(), '.local/state/opencode/locks');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function getProcesses() {
  try {
    const out = execSync('ps aux | grep -i opencode | grep -v grep', {
      encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 5000,
    });
    return out.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[1]);
      const cmd = parts.slice(10).join(' ');
      if (cmd.includes('opencode-dashboard') || cmd.includes('server.js')) return null;
      let state = '?', startTime = 0, elapsed = 0, rss = 0, cpu = 0;
      try {
        const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const m = s.match(/^(\d+)\s+\((.+?)\)\s+([RSDTZtXxKWP])/);
        if (m) state = m[3];
        const clk = 100;
        const ticks = parseInt(s.split(' ').at(21));
        const uptime = parseFloat(fs.readFileSync('/proc/uptime', 'utf8'));
        startTime = Math.floor(Date.now() / 1000 - (uptime - ticks / clk));
        elapsed = Math.floor(uptime - ticks / clk);
      } catch (_) {}
      try {
        const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
        const vm = status.match(/VmRSS:\s+(\d+)/);
        if (vm) rss = parseInt(vm[1]);
      } catch (_) {}
      cpu = parseFloat(parts[2]) || 0;
      let fdCount = 0;
      try { fdCount = fs.readdirSync(`/proc/${pid}/fd`).length; } catch (_) {}
      let envSessionId = '';
      try {
        const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8');
        const entries = env.split('\0');
        const sidEntry = entries.find(e => e.startsWith('CLAUDE_CODE_SESSION_ID=') || e.startsWith('OPENCODE_SESSION_ID='));
        if (sidEntry) envSessionId = sidEntry.split('=')[1];
      } catch (_) {}
      const isRun = cmd.includes('opencode run ');
      const isInteractive = /^opencode\s*$/.test(cmd.trim()) || cmd.trim() === 'opencode';
      return { pid, cpu, rss: Math.round(rss / 1024), state, startTime, elapsed, cmd: cmd.slice(0, 200), fdCount, envSessionId, isRun, isInteractive };
    }).filter(Boolean);
  } catch { return []; }
}

let db;
function getDb() {
  if (!db) {
    try { db = new DatabaseSync(DB_PATH); } catch { return null; }
  }
  return db;
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return s; }
}

function getLocks() {
  try {
    if (!fs.existsSync(LOCKS_DIR)) return [];
    return fs.readdirSync(LOCKS_DIR).filter(e =>
      fs.statSync(path.join(LOCKS_DIR, e)).isDirectory()
    ).map(entry => {
      const dir = path.join(LOCKS_DIR, entry);
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch {}
      let hbAge = null;
      try { hbAge = (Date.now() - fs.statSync(path.join(dir, 'heartbeat')).mtimeMs) / 1000; } catch {}
      let pidAlive = false;
      if (meta.pid) { try { process.kill(meta.pid, 0); pidAlive = true; } catch {} }
      return {
        id: entry.replace('.lock', ''),
        token: meta.token || '?',
        pid: meta.pid || null,
        hostname: meta.hostname || '',
        createdAt: meta.createdAt || null,
        hbAge,
        pidAlive,
        stuck: !pidAlive || (hbAge !== null && hbAge > 120),
      };
    });
  } catch { return []; }
}

function parseLogLine(line) {
  const m = line.match(/^timestamp=(\S+) level=(\S+) run=(\S+) message=(\S+)(?:\s+(.+))?$/);
  if (!m) {
    const fallback = line.match(/session\.id=(\S+)/);
    return { time: null, level: null, run: null, message: line.slice(0, 150), sessionId: fallback?.[1] || null, rest: line };
  }
  const rest = m[5] || '';
  const sessionM = rest.match(/session\.id=(\S+)/);
  return {
    time: m[1], level: m[2], run: m[3], message: m[4],
    sessionId: sessionM?.[1] || null, rest,
  };
}

function getLogLines(sessionId, maxLines = 200) {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    const content = fs.readFileSync(LOG_PATH, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const matching = [];
    for (let i = lines.length - 1; i >= 0 && matching.length < maxLines; i--) {
      const parsed = parseLogLine(lines[i]);
      if (sessionId === '__all__' || parsed.sessionId === sessionId) {
        matching.unshift(parsed);
      }
    }
    return matching;
  } catch { return []; }
}

function handleLogSSE(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get('sessionId') || '__all__';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);
  let lastSize = 0;
  try { lastSize = fs.statSync(LOG_PATH).size; } catch {}
  const interval = setInterval(() => {
    try {
      const stat = fs.statSync(LOG_PATH);
      if (stat.size > lastSize) {
        const fd = fs.openSync(LOG_PATH, 'r');
        const buf = Buffer.alloc(stat.size - lastSize);
        fs.readSync(fd, buf, 0, buf.length, lastSize);
        fs.closeSync(fd);
        lastSize = stat.size;
        const newLines = buf.toString('utf8').split('\n').filter(Boolean);
        for (const line of newLines) {
          const parsed = parseLogLine(line);
          if (sessionId === '__all__' || parsed.sessionId === sessionId) {
            res.write(`data: ${JSON.stringify({ type: 'line', ...parsed })}\n\n`);
          }
        }
      }
    } catch {}
  }, 1000);
  const keepalive = setInterval(() => { res.write(`:keepalive\n\n`); }, 15000);
  req.on('close', () => { clearInterval(interval); clearInterval(keepalive); });
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---- opencode v2 data model ----
// Dalla v2 opencode scrive su session_v2 + session_message: ogni riga di
// session_message è un messaggio tipizzato (user, assistant, idle, synthetic,
// compaction, system) e i messaggi assistant vengono aggiornati in place
// mentre il modello genera, quindi il tempo reale si legge da time_updated.
// Le vecchie tabelle session/message/part restano solo per lo storico v1.

const SESSION_TABLE = 'session_v2';
const ACTIVITY_WINDOW_MS = 6 * 3600 * 1000;

function clip(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function toolInputSummary(name, input) {
  if (input == null) return '';
  if (typeof input === 'string') input = safeJson(input);
  if (typeof input !== 'object') return String(input);
  const pick = input.command ?? input.path ?? input.filePath ?? input.file_path
    ?? input.pattern ?? input.query ?? input.url ?? input.description ?? input.prompt;
  if (pick != null) return String(pick);
  const keys = Object.keys(input);
  return keys[0] ? keys[0] + ': ' + (typeof input[keys[0]] === 'string' ? input[keys[0]] : JSON.stringify(input[keys[0]])) : '';
}

function toolOutput(state) {
  if (!state) return null;
  if (state.error) return state.error.message || JSON.stringify(state.error);
  if (Array.isArray(state.content)) {
    const txt = state.content.filter(c => c && c.type === 'text').map(c => c.text).join('\n');
    return txt || null;
  }
  return state.output != null ? String(state.output) : null;
}

function getFirstUserPrompt(sessionId) {
  try {
    const d = getDb();
    if (!d) return null;
    const row = d.prepare(`
      SELECT json_extract(data, '$.text') AS text FROM session_message
      WHERE session_id = ? AND type = 'user' ORDER BY seq ASC LIMIT 1
    `).get(sessionId);
    return row?.text ? clip(row.text, 500) : null;
  } catch { return null; }
}

function getLastMessages(sessionId) {
  const d = getDb();
  const last = d.prepare(`
    SELECT type, time_updated, data FROM session_message
    WHERE session_id = ? AND type != 'system' ORDER BY seq DESC LIMIT 1
  `).get(sessionId);
  const lastAssistant = last?.type === 'assistant' ? last : d.prepare(`
    SELECT type, time_updated, data FROM session_message
    WHERE session_id = ? AND type = 'assistant' ORDER BY seq DESC LIMIT 1
  `).get(sessionId);
  return {
    last: last ? { ...last, data: safeJson(last.data) } : null,
    lastAssistant: lastAssistant ? { ...lastAssistant, data: safeJson(lastAssistant.data) } : null,
  };
}

function describeContent(c) {
  if (!c) return null;
  if (c.type === 'tool') {
    return {
      type: 'tool', tool: c.name || '',
      status: c.state?.status || 'pending',
      summary: clip(toolInputSummary(c.name, c.state?.input), 120),
    };
  }
  if (c.type === 'text') return { type: 'text', summary: clip(c.text, 120) };
  if (c.type === 'reasoning') return { type: 'reasoning', summary: 'Reasoning…' };
  return null;
}

function getLastActivity(sessionId, msgs) {
  try {
    const { last, lastAssistant } = msgs || getLastMessages(sessionId);
    if (last?.type === 'idle') {
      return { type: 'idle', status: last.data?.outcome || 'done', summary: last.data?.error?.message ? clip(last.data.error.message, 120) : 'Turno concluso' };
    }
    if (last?.type === 'user') return { type: 'user', summary: clip(last.data?.text, 120) };
    if (last?.type === 'synthetic') return { type: 'shell', summary: clip(last.data?.metadata?.state ? 'shell ' + last.data.metadata.state : last.data?.text, 120) };
    if (last?.type === 'compaction') return { type: 'compaction', summary: 'Contesto compattato' };
    const retry = last?.type === 'assistant' && !last.data?.time?.completed && last.data?.retry;
    if (retry) return { type: 'retry', status: 'retry', summary: clip('Retry #' + (retry.attempt || '?') + ': ' + (retry.error?.message || ''), 120) };
    const content = lastAssistant?.data?.content || [];
    const desc = describeContent(content[content.length - 1]);
    if (desc) return desc;
    if (lastAssistant?.data?.error) return { type: 'error', summary: clip(lastAssistant.data.error.message, 120) };
    return null;
  } catch { return null; }
}

function getTodos(sessionId) {
  try {
    const d = getDb();
    if (!d) return { done: 0, total: 0 };
    const row = d.prepare(`
      SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done
      FROM todo WHERE session_id = ?
    `).get(sessionId);
    return { done: row?.done || 0, total: row?.total || 0 };
  } catch { return { done: 0, total: 0 }; }
}

function getCost24h() {
  try {
    const d = getDb();
    if (!d) return 0;
    const row = d.prepare(`SELECT COALESCE(SUM(cost),0) as total FROM ${SESSION_TABLE} WHERE time_updated > ?`).get(Date.now() - 86400000);
    return row?.total || 0;
  } catch { return 0; }
}

function getEstCost24h() {
  try {
    const d = getDb();
    if (!d) return 0;
    const rows = d.prepare(`
      SELECT model, cost, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write
      FROM ${SESSION_TABLE} WHERE time_updated > ?
    `).all(Date.now() - 86400000);
    return rows.reduce((sum, r) => {
      if (r.cost > 0) return sum + r.cost;
      const e = estimateCost(r.model, {
        input: r.tokens_input, output: r.tokens_output,
        cacheRead: r.tokens_cache_read, cacheWrite: r.tokens_cache_write,
      });
      return sum + (e?.usd || 0);
    }, 0);
  } catch { return 0; }
}

function getService() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.local/state/opencode/service.json'), 'utf8'));
    let alive = false;
    if (s.pid) { try { process.kill(s.pid, 0); alive = true; } catch {} }
    return { version: s.version || null, url: s.url || null, pid: s.pid || null, alive };
  } catch { return { version: null, url: null, pid: null, alive: false }; }
}

function modelName(raw) {
  if (!raw) return '';
  try { const m = JSON.parse(raw); return m.id || raw; } catch { return raw; }
}

// ---- cost estimation ----
// I modelli "-free" hanno cost 0 in models.json: per la stima si usa il prezzo
// del gemello a pagamento (stesso id senza suffisso), preferendo lo stesso provider.
const CATALOG_PATH = path.join(os.homedir(), '.cache/opencode/models.json');
let catalog = null, catalogMtime = 0;
function getCatalog() {
  try {
    const mtime = fs.statSync(CATALOG_PATH).mtimeMs;
    if (!catalog || mtime !== catalogMtime) {
      catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
      catalogMtime = mtime;
      priceCache.clear();
    }
  } catch { catalog = catalog || null; }
  return catalog;
}

const priceCache = new Map();
function hasPrice(c) { return c && ((c.input || 0) > 0 || (c.output || 0) > 0); }

function lookupPricing(raw) {
  if (!raw) return null;
  let providerID = '', id = '';
  try { const m = JSON.parse(raw); providerID = m.providerID || ''; id = m.id || ''; } catch { id = String(raw); }
  if (!id) return null;
  const key = providerID + '/' + id;
  if (priceCache.has(key)) return priceCache.get(key);

  const cat = getCatalog();
  let result = null;
  if (cat) {
    const candidates = id.endsWith('-free') ? [id, id.slice(0, -5)] : [id];
    outer:
    for (const cid of candidates) {
      const own = cat[providerID]?.models?.[cid]?.cost;
      if (hasPrice(own)) { result = { cost: own, source: cid === id ? 'exact' : 'paid-twin', model: cid, provider: providerID }; break; }
      for (const [pid, p] of Object.entries(cat)) {
        const c = p?.models?.[cid]?.cost;
        if (hasPrice(c)) { result = { cost: c, source: cid === id ? 'other-provider' : 'paid-twin', model: cid, provider: pid }; break outer; }
      }
    }
  }
  priceCache.set(key, result);
  return result;
}

function estimateCost(raw, t) {
  const p = lookupPricing(raw);
  if (!p) return null;
  const c = p.cost;
  const usd = ((t.input || 0) * (c.input || 0)
    + (t.output || 0) * (c.output || 0)
    + (t.cacheRead || 0) * (c.cache_read || 0)
    + (t.cacheWrite || 0) * (c.cache_write || 0)) / 1e6;
  return { usd, source: p.source, pricedAs: p.provider + '/' + p.model, rates: c };
}

// Stato di una sessione v2 dall'ultimo messaggio: un assistant senza
// time.completed (o con un tool pending/running) sta generando adesso.
function sessionStatus(row, msgs, locks) {
  const now = Date.now();
  const { last, lastAssistant } = msgs;
  const updated = Math.max(row.time_updated || 0, last?.time_updated || 0);
  const secsAgo = (now - updated) / 1000;
  if (last?.type === 'idle') {
    if (last.data?.outcome === 'failed') return 'failed';
    return secsAgo < 300 ? 'active' : 'idle';
  }
  const content = lastAssistant?.data?.content || [];
  const toolRunning = content.some(c => c.type === 'tool' && ['pending', 'running'].includes(c.state?.status));
  const generating = last?.type === 'assistant' && !last.data?.time?.completed;
  if (toolRunning || generating || ['user', 'synthetic', 'compaction'].includes(last?.type)) {
    if (secsAgo < 600) return 'working';
    // time_suspended viene scritto anche su sessioni vive: conta solo se la sessione tace.
    if (row.time_suspended) return 'suspended';
    const lock = locks.find(l => l.token === row.id);
    return lock && !lock.stuck ? 'working' : 'stuck';
  }
  if (secsAgo < 15) return 'working';
  if (secsAgo < 300) return 'active';
  return 'idle';
}

function sessionFields(r, msgs) {
  const est = estimateCost(r.model, {
    input: r.tokens_input, output: r.tokens_output,
    cacheRead: r.tokens_cache_read, cacheWrite: r.tokens_cache_write,
  });
  const la = msgs.lastAssistant?.data;
  const model = modelName(r.model) || la?.model?.id || '';
  return {
    id: r.id,
    parentId: r.parent_id || null,
    title: r.title || 'Untitled',
    directory: (r.directory || '').replace(os.homedir(), '~'),
    agent: r.agent || la?.agent || 'build',
    model,
    provider: (safeJson(r.model)?.providerID) || la?.model?.providerID || '',
    cost: r.cost || 0,
    estCost: est?.usd ?? null,
    estSource: est?.source ?? null,
    estPricedAs: est?.pricedAs ?? null,
    tokensInput: r.tokens_input || 0,
    tokensOutput: r.tokens_output || 0,
    tokensReasoning: r.tokens_reasoning || 0,
    tokensCacheRead: r.tokens_cache_read || 0,
    tokensCacheWrite: r.tokens_cache_write || 0,
    timeCreated: r.time_created,
    timeUpdated: Math.max(r.time_updated || 0, msgs.last?.time_updated || 0),
    idleOutcome: r.idle_outcome || null,
  };
}

const SESSION_COLS = `id, parent_id, title, directory, agent, model, cost,
  tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
  time_created, time_updated, time_suspended, idle_outcome`;

function getOverview() {
  try {
    const d = getDb();
    if (!d) return [];
    const rows = d.prepare(`
      SELECT ${SESSION_COLS} FROM ${SESSION_TABLE}
      WHERE time_archived IS NULL ORDER BY time_updated DESC LIMIT 50
    `).all();
    const locks = getLocks();
    return rows.map(r => {
      const msgs = getLastMessages(r.id);
      return {
        ...sessionFields(r, msgs),
        firstUserPrompt: getFirstUserPrompt(r.id),
        lastActivity: getLastActivity(r.id, msgs),
        todos: getTodos(r.id),
        status: sessionStatus(r, msgs, locks),
      };
    }).sort((a, b) => b.timeUpdated - a.timeUpdated);
  } catch { return []; }
}

function mapContent(c, idx, msgId) {
  const id = msgId + ':' + idx;
  if (c?.type === 'tool') {
    const out = toolOutput(c.state);
    return {
      id, type: 'tool', tool: c.name, callID: c.id,
      status: c.state?.status || 'pending',
      inputSummary: clip(toolInputSummary(c.name, c.state?.input), 300),
      output: out ? clip(out, 2000) : null,
      timeCreated: c.time?.created || null,
      timeCompleted: c.time?.completed || null,
    };
  }
  if (c?.type === 'text') return { id, type: 'text', text: c.text || '' };
  if (c?.type === 'reasoning') return { id, type: 'reasoning', text: c.text || '' };
  return { id, type: 'unknown' };
}

function mapMessage(m) {
  const data = safeJson(m.data) || {};
  const base = { id: m.id, role: m.type, agent: data.agent || null, mode: null, timeCreated: m.time_created, timeUpdated: m.time_updated };
  switch (m.type) {
    case 'user':
      return { ...base, parts: [{ id: m.id + ':0', type: 'text', text: data.text || '' }] };
    case 'assistant': {
      const parts = (data.content || []).map((c, i) => mapContent(c, i, m.id));
      if (data.error) parts.push({ id: m.id + ':err', type: 'error', text: data.error.message || JSON.stringify(data.error) });
      if (data.time?.completed) parts.push({ id: m.id + ':fin', type: 'step-finish', tokens: data.tokens || null, cost: data.cost || 0 });
      if (data.retry && !data.time?.completed) parts.push({ id: m.id + ':retry', type: 'retry', text: 'Retry #' + (data.retry.attempt || '?') + ': ' + (data.retry.error?.message || '') });
      return { ...base, model: data.model?.id || null, streaming: !data.time?.completed, parts };
    }
    case 'synthetic':
      return { ...base, parts: [{ id: m.id + ':0', type: 'shell', state: data.metadata?.state || null, text: clip(data.text, 2000) }] };
    case 'compaction':
      return { ...base, parts: [{ id: m.id + ':0', type: 'compaction', text: clip(data.summary, 2000) }] };
    case 'idle':
      return { ...base, parts: [{ id: m.id + ':0', type: 'idle', outcome: data.outcome || 'done', text: data.error?.message || '' }] };
    case 'model-switched':
      return { ...base, parts: [{ id: m.id + ':0', type: 'model-switched', text: (data.previous?.id || '?') + ' → ' + (data.model?.id || '?') }] };
    default:
      return null;
  }
}

// Storico delle sessioni v1 che non hanno righe in session_message.
function getLegacyMessages(d, sessionId) {
  const messages = d.prepare(`SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC`).all(sessionId);
  const partsStmt = d.prepare(`SELECT id, data FROM part WHERE message_id = ? ORDER BY time_created ASC`);
  return messages.map(m => {
    const data = safeJson(m.data);
    return {
      id: m.id, role: data?.role || 'unknown', agent: data?.agent || null, mode: data?.mode || null,
      timeCreated: m.time_created,
      parts: partsStmt.all(m.id).map(p => {
        const pd = safeJson(p.data);
        if (pd?.type === 'tool') {
          return {
            id: p.id, type: 'tool', tool: pd.tool, callID: pd.callID,
            status: pd.state?.status || 'completed',
            inputSummary: clip(toolInputSummary(pd.tool, pd.state?.input), 300),
            output: pd.state?.output ? clip(pd.state.output, 2000) : null,
          };
        }
        if (pd?.type === 'text' || pd?.type === 'reasoning') return { id: p.id, type: pd.type, text: pd.text || '' };
        if (pd?.type === 'step-finish') return { id: p.id, type: 'step-finish', tokens: pd.tokens, cost: pd.cost };
        if (pd?.type === 'patch') return { id: p.id, type: 'patch', files: pd.files || [] };
        return { id: p.id, type: 'unknown' };
      }),
    };
  });
}

function getSessionDetail(sessionId) {
  try {
    const d = getDb();
    if (!d) return null;
    const r = d.prepare(`SELECT ${SESSION_COLS} FROM ${SESSION_TABLE} WHERE id = ?`).get(sessionId);
    if (!r) return null;
    const msgs = getLastMessages(sessionId);
    const rows = d.prepare(`
      SELECT id, type, time_created, time_updated, data FROM session_message
      WHERE session_id = ? AND type != 'system' ORDER BY seq ASC
    `).all(sessionId);
    let messages = rows.map(mapMessage).filter(Boolean);
    if (!messages.length) { try { messages = getLegacyMessages(d, sessionId); } catch {} }
    const todos = d.prepare(`SELECT content, status, position FROM todo WHERE session_id = ? ORDER BY position ASC`).all(sessionId);
    const base = sessionFields(r, msgs);
    const ti = base.tokensInput, tcr = base.tokensCacheRead;
    const est = estimateCost(r.model, { input: ti, output: base.tokensOutput, cacheRead: tcr, cacheWrite: base.tokensCacheWrite });
    const children = d.prepare(`SELECT id, title FROM ${SESSION_TABLE} WHERE parent_id = ? ORDER BY time_created ASC`).all(sessionId);
    return {
      ...base,
      estRates: est?.rates ?? null,
      totalTokens: ti + base.tokensOutput + base.tokensReasoning + tcr + base.tokensCacheWrite,
      cacheRate: ti > 0 ? ((tcr / ti) * 100).toFixed(1) : '0.0',
      fullPrompt: rows.find(m => m.type === 'user') ? (safeJson(rows.find(m => m.type === 'user').data)?.text || '') : '',
      messages,
      todos,
      children,
      lastActivity: getLastActivity(sessionId, msgs),
      status: sessionStatus(r, msgs, getLocks()),
    };
  } catch { return null; }
}

// Eventi di attività dai messaggi aggiornati dopo `since`. Con `seen` (una Map
// per client SSE) emette solo i contenuti nuovi o cambiati: i messaggi
// assistant crescono in place, quindi lo stesso id può tornare con uno stato
// più recente e il client deve fare upsert per id.
function getActivity(since, seen) {
  try {
    const d = getDb();
    if (!d) return [];
    since = Math.max(Number(since) || 0, Date.now() - ACTIVITY_WINDOW_MS);
    const rows = d.prepare(`
      SELECT m.id, m.session_id, m.type, m.time_created, m.time_updated, m.data, s.title AS session_title
      FROM session_message m JOIN ${SESSION_TABLE} s ON s.id = m.session_id
      WHERE m.time_created > ? AND m.time_updated > ? AND m.type != 'system'
      ORDER BY m.time_updated DESC LIMIT 200
    `).all(since - ACTIVITY_WINDOW_MS, since).reverse();
    const out = [];
    const emit = (id, sig, item) => {
      if (seen) { if (seen.get(id) === sig) return; seen.set(id, sig); }
      out.push(item);
    };
    for (const r of rows) {
      const data = safeJson(r.data) || {};
      const base = { sessionId: r.session_id, sessionTitle: r.session_title || '', timeCreated: r.time_created, timeUpdated: r.time_updated };
      if (r.type === 'assistant') {
        (data.content || []).forEach((c, i) => {
          const id = r.id + ':' + i;
          if (c.type === 'tool') {
            const status = c.state?.status || 'pending';
            emit(id, 'tool:' + status, { ...base, id, partType: 'tool', tool: c.name, status, timeCreated: c.time?.created || r.time_created,
              summary: clip(c.name + ': ' + toolInputSummary(c.name, c.state?.input), 200) });
          } else if (c.type === 'text' || c.type === 'reasoning') {
            const len = (c.text || '').length;
            emit(id, c.type + ':' + len, { ...base, id, partType: c.type, streaming: !data.time?.completed,
              summary: c.type === 'reasoning' ? 'Reasoning… ' + clip(c.text, 160) : clip(c.text, 200) });
          }
        });
        if (data.retry && !data.time?.completed) {
          emit(r.id + ':retry', 'retry:' + data.retry.attempt, { ...base, id: r.id + ':retry', partType: 'retry', status: 'retry',
            summary: clip('Retry #' + (data.retry.attempt || '?') + ': ' + (data.retry.error?.message || ''), 200) });
        }
        if (data.time?.completed) {
          const t = data.tokens || {};
          emit(r.id + ':fin', 'fin', { ...base, id: r.id + ':fin', partType: 'step-finish', timeCreated: data.time.completed,
            summary: data.error ? 'Errore: ' + clip(data.error.message, 160) : 'Step finito · ' + ((t.input || 0) + (t.output || 0)) + ' token' });
        }
      } else if (r.type === 'user') {
        emit(r.id, 'user', { ...base, id: r.id, partType: 'user', summary: clip(data.text, 200) });
      } else if (r.type === 'synthetic') {
        emit(r.id, 'syn', { ...base, id: r.id, partType: 'shell', summary: clip(data.text, 200) });
      } else if (r.type === 'compaction') {
        emit(r.id, 'cmp:' + (data.status || ''), { ...base, id: r.id, partType: 'compaction', summary: 'Contesto compattato' });
      } else if (r.type === 'idle') {
        emit(r.id, 'idle', { ...base, id: r.id, partType: 'idle', status: data.outcome || 'done',
          summary: data.outcome === 'failed' ? 'Fallita: ' + clip(data.error?.message, 160) : 'Turno concluso' });
      }
    }
    return out;
  } catch { return []; }
}

function handleStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Parte 30s indietro per mostrare subito l'attività in corso.
  let since = Date.now() - 30000;
  const seen = new Map();
  let lastOverviewTime = Date.now();
  let closed = false;
  const send = (event, data) => {
    if (!closed) res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  };
  send('connected', { ok: true });
  const pushOverview = () => {
    send('overview', {
      sessions: getOverview(),
      cost24h: getCost24h(),
      estCost24h: getEstCost24h(),
      processes: getProcesses(),
      service: getService(),
      timestamp: Date.now(),
    });
  };
  pushOverview();
  const pollInterval = setInterval(() => {
    if (closed) return;
    const now = Date.now();
    let changed = false;
    try {
      const activity = getActivity(since, seen);
      const maxUpdated = Math.max(since, ...activity.map(a => a.timeUpdated || 0));
      // 2s di margine: un messaggio può essere riscritto nello stesso ms.
      since = Math.max(since, maxUpdated - 2000);
      for (const item of activity) send('part', item);
      changed = activity.length > 0;
      if (seen.size > 5000) seen.clear();
    } catch {}
    // Overview subito quando c'è attività, altrimenti ogni 5s.
    if (changed || now - lastOverviewTime >= 5000) {
      lastOverviewTime = now;
      pushOverview();
    }
  }, 1000);
  const keepalive = setInterval(() => { if (!closed) res.write(':keepalive\n\n'); }, 15000);
  req.on('close', () => {
    closed = true;
    clearInterval(pollInterval);
    clearInterval(keepalive);
  });
}

// ---- Alerts: stall/failure detection over SSE (per Claude Code Monitor) ----

const STALL_SECS = parseInt(process.env.OC_STALL_SECS || '180', 10);
const BIRTH_SECS = parseInt(process.env.OC_BIRTH_SECS || '150', 10);
const alertClients = new Set();
const alertedPids = new Set();      // pid già segnalati per pre-session stall
const alertedSessions = new Set();  // sessioni attualmente segnalate come ferme

function detectAlerts() {
  const alerts = [];
  const now = Date.now();
  let runProcs = [];
  try { runProcs = getProcesses().filter(p => p.isRun); } catch {}
  const sessions = getOverview();

  // 1. pre-session stall: processi run vivi da >BIRTH_SECS senza sessione nata dopo il loro avvio
  const stalledProcs = runProcs.filter(p => {
    const age = p.elapsed || 0;
    if (age <= BIRTH_SECS) return false;
    const bornSince = sessions.some(s => s.timeUpdated > now - age * 1000 + 10000);
    return !bornSince;
  });
  const freshPids = stalledProcs.map(p => p.pid).filter(pid => !alertedPids.has(pid));
  if (freshPids.length) {
    freshPids.forEach(pid => alertedPids.add(pid));
    alerts.push({
      type: 'pre_session_stall', pids: freshPids,
      message: `opencode run vivo da >${BIRTH_SECS}s senza sessione (pid ${freshPids.join(',')}): probabile prompt corrotto o zombie`,
    });
  }

  // 2. session stall: processo vivo ma sessione più recente ferma da >STALL_SECS
  if (runProcs.length > 0 && sessions.length > 0) {
    const newest = sessions[0];
    const idle = (now - newest.timeUpdated) / 1000;
    if (idle > STALL_SECS) {
      if (!alertedSessions.has(newest.id)) {
        alertedSessions.add(newest.id);
        alerts.push({
          type: 'session_stall', sessionId: newest.id, title: newest.title,
          idleSeconds: Math.round(idle), pids: runProcs.map(p => p.pid),
          message: `sessione "${newest.title}" ferma da ${Math.round(idle)}s con processo opencode vivo (pid ${runProcs.map(p => p.pid).join(',')})`,
        });
      }
    } else {
      alertedSessions.delete(newest.id);
    }
  }

  // 3. lock stuck (già calcolato in getOverview)
  for (const s of sessions) {
    if (s.status === 'stuck' && !alertedSessions.has(s.id)) {
      alertedSessions.add(s.id);
      alerts.push({ type: 'lock_stuck', sessionId: s.id, title: s.title, message: `lock stuck sulla sessione "${s.title}"` });
    }
  }
  return alerts;
}

let alertTimer = null;
function ensureAlertLoop() {
  if (alertTimer) return;
  alertTimer = setInterval(() => {
    if (alertClients.size === 0) return;
    let alerts = [];
    try { alerts = detectAlerts(); } catch {}
    if (!alerts.length) return;
    const at = new Date().toISOString();
    for (const res of alertClients) {
      try {
        for (const a of alerts) res.write(`event: alert\ndata: ${JSON.stringify({ ...a, at })}\n\n`);
      } catch {}
    }
  }, 15000);
}

function handleAlertsSSE(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(':connected\n\n');
  alertClients.add(res);
  ensureAlertLoop();
  const keepalive = setInterval(() => { try { res.write(':keepalive\n\n'); } catch {} }, 15000);
  req.on('close', () => { clearInterval(keepalive); alertClients.delete(res); });
}

// ---- HTTP handler ----

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);
  const pathname = url.pathname;
  res.setHeader('Access-Control-Allow-Origin', '*');

  // existing
  if (pathname === '/api/log-stream') { handleLogSSE(req, res); return; }
  if (pathname === '/api/log-archive') {
    const sessionId = url.searchParams.get('sessionId') || '__all__';
    const lines = getLogLines(sessionId, parseInt(url.searchParams.get('maxLines')) || 200);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(lines));
    return;
  }
  if (pathname === '/api/processes') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getProcesses()));
    return;
  }
  if (pathname === '/api/locks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getLocks()));
    return;
  }
  if (pathname === '/api/service') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getService()));
    return;
  }
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, db: !!getDb() }));
    return;
  }

  // new
  if (pathname === '/api/overview') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getOverview()));
    return;
  }
  if (pathname === '/api/session') {
    const id = url.searchParams.get('id');
    if (!id) { res.writeHead(400); res.end(JSON.stringify({ error: 'missing id' })); return; }
    const detail = getSessionDetail(id);
    if (!detail) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(detail));
    return;
  }
  if (pathname === '/api/activity') {
    const since = parseInt(url.searchParams.get('since')) || 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getActivity(since)));
    return;
  }
  if (pathname === '/api/stream') {
    handleStream(req, res);
    return;
  }
  if (pathname === '/api/alerts') {
    if (url.searchParams.get('once')) {
      let alerts = [];
      try { alerts = detectAlerts(); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(alerts));
      return;
    }
    handleAlertsSSE(req, res);
    return;
  }

  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log('\n  opencode mission control running at:\n  http://localhost:' + PORT + '\n');
});

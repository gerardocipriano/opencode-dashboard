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
const PUBLIC_DIR = path.join(__dirname, 'public');

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

// ---- new API functions ----

function getFirstUserPrompt(sessionId) {
  try {
    const d = getDb();
    if (!d) return null;
    const row = d.prepare(`
      SELECT json_extract(p.data, '$.text') as text
      FROM message m
      JOIN part p ON p.message_id = m.id
      WHERE m.session_id = ?
        AND json_extract(m.data, '$.role') = 'user'
        AND json_extract(p.data, '$.type') = 'text'
      ORDER BY m.time_created ASC, p.time_created ASC
      LIMIT 1
    `).get(sessionId);
    if (!row || !row.text) return null;
    const t = String(row.text);
    return t.length > 500 ? t.slice(0, 500) + '\u2026' : t;
  } catch { return null; }
}

function getLastActivity(sessionId) {
  try {
    const d = getDb();
    if (!d) return null;
    const row = d.prepare(`
      SELECT json_extract(p.data, '$.type') as type,
             json_extract(p.data, '$.tool') as tool,
             json_extract(p.data, '$.state') as state,
             json_extract(p.data, '$.text') as text
      FROM part p
      WHERE p.session_id = ?
      ORDER BY p.time_created DESC
      LIMIT 1
    `).get(sessionId);
    if (!row) return null;
    const type = row.type;
    if (type === 'tool') {
      const stateObj = typeof row.state === 'string' ? safeJson(row.state) : (row.state || {});
      const input = stateObj.input || '';
      let summary = '';
      const toolName = row.tool || '';
      if (toolName === 'bash') {
        summary = typeof input === 'string' ? input : JSON.stringify(input);
      } else if (['write', 'edit', 'read'].includes(toolName)) {
        const ip = typeof input === 'string' ? safeJson(input) : input;
        summary = ip?.filePath || ip?.file_path || (typeof input === 'string' ? input : '');
      } else {
        const ip = typeof input === 'string' ? safeJson(input) : input;
        if (typeof ip === 'object' && ip) {
          const keys = Object.keys(ip);
          summary = keys[0] ? keys[0] + ': ' + String(ip[keys[0]]) : '';
        } else {
          summary = String(input);
        }
      }
      return {
        type: 'tool',
        tool: toolName,
        status: stateObj?.status || 'completed',
        summary: String(summary).slice(0, 120),
      };
    } else if (type === 'text') {
      const txt = row.text || '';
      return { type: 'text', summary: txt.length > 120 ? txt.slice(0, 120) + '\u2026' : txt };
    } else if (type === 'reasoning') {
      return { type: 'reasoning', summary: 'Reasoning\u2026' };
    } else if (type === 'step-finish') {
      return { type: 'step-finish', summary: 'Step completed' };
    } else if (type === 'patch') {
      return { type: 'patch', summary: 'Applied patch' };
    }
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
    const row = d.prepare(`SELECT COALESCE(SUM(cost),0) as total FROM session WHERE time_updated > ?`).get(Date.now() - 86400000);
    return row?.total || 0;
  } catch { return 0; }
}

function modelName(raw) {
  if (!raw) return '';
  try { const m = JSON.parse(raw); return m.id || raw; } catch { return raw; }
}

function getOverview() {
  try {
    const d = getDb();
    if (!d) return [];
    const rows = d.prepare(`
      SELECT id, title, directory, agent, model, cost,
             tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
             time_created, time_updated
      FROM session ORDER BY time_updated DESC LIMIT 50
    `).all();
    const now = Date.now();
    const locks = getLocks();
    return rows.map(r => {
      const firstUserPrompt = getFirstUserPrompt(r.id);
      const lastActivity = getLastActivity(r.id);
      const todos = getTodos(r.id);
      const secsAgo = (now - r.time_updated) / 1000;
      let status = 'idle';
      if (lastActivity?.type === 'tool' && (lastActivity.status === 'pending' || lastActivity.status === 'running')) {
        status = 'working';
      } else if (secsAgo < 15) {
        status = 'working';
      } else if (secsAgo < 300) {
        status = 'active';
      } else {
        const lock = locks.find(l => l.token === r.id);
        if (lock?.stuck) status = 'stuck';
      }
      return {
        id: r.id,
        title: r.title || 'Untitled',
        directory: (r.directory || '').replace(os.homedir(), '~'),
        agent: r.agent || 'build',
        model: modelName(r.model),
        cost: r.cost || 0,
        tokensInput: r.tokens_input || 0,
        tokensOutput: r.tokens_output || 0,
        tokensReasoning: r.tokens_reasoning || 0,
        tokensCacheRead: r.tokens_cache_read || 0,
        tokensCacheWrite: r.tokens_cache_write || 0,
        timeCreated: r.time_created,
        timeUpdated: r.time_updated,
        firstUserPrompt,
        lastActivity,
        todos,
        status,
      };
    });
  } catch { return []; }
}

function getSessionDetail(sessionId) {
  try {
    const d = getDb();
    if (!d) return null;
    const session = d.prepare(`
      SELECT id, title, directory, agent, model, cost,
             tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
             time_created, time_updated
      FROM session WHERE id = ?
    `).get(sessionId);
    if (!session) return null;
    const now = Date.now();
    const secsAgo = (now - session.time_updated) / 1000;
    const promptRow = d.prepare(`
      SELECT json_extract(p.data, '$.text') as text
      FROM message m
      JOIN part p ON p.message_id = m.id
      WHERE m.session_id = ?
        AND json_extract(m.data, '$.role') = 'user'
        AND json_extract(p.data, '$.type') = 'text'
      ORDER BY m.time_created ASC, p.time_created ASC
      LIMIT 1
    `).get(sessionId);
    const messages = d.prepare(`
      SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC
    `).all(sessionId);
    const partsStmt = d.prepare(`
      SELECT id, time_created, data FROM part WHERE message_id = ? ORDER BY time_created ASC
    `);
    const fullMessages = messages.map(m => {
      const data = safeJson(m.data);
      const parts = partsStmt.all(m.id);
      return {
        id: m.id,
        role: data?.role || 'unknown',
        agent: data?.agent || null,
        mode: data?.mode || null,
        timeCreated: m.time_created,
        parts: parts.map(p => {
          const pdata = safeJson(p.data);
          if (pdata?.type === 'tool') {
            const state = pdata.state || {};
            let inputSummary = '';
            const input = state.input;
            if (pdata.tool === 'bash') {
              inputSummary = typeof input === 'string' ? input : '';
            } else if (['write', 'edit', 'read'].includes(pdata.tool)) {
              const ip = typeof input === 'string' ? safeJson(input) : input;
              inputSummary = ip?.filePath || ip?.file_path || '';
            } else if (input && typeof input === 'object') {
              const keys = Object.keys(input);
              inputSummary = keys[0] ? keys[0] + ': ' + String(input[keys[0]]).slice(0, 80) : '';
            } else {
              inputSummary = String(input || '');
            }
            return {
              id: p.id,
              type: 'tool',
              tool: pdata.tool,
              callID: pdata.callID,
              status: state?.status || 'completed',
              inputSummary,
              output: state.output ? String(state.output).slice(0, 300) : null,
            };
          } else if (pdata?.type === 'text') {
            return { id: p.id, type: 'text', text: pdata.text || '' };
          } else if (pdata?.type === 'reasoning') {
            return { id: p.id, type: 'reasoning', text: pdata.text || '' };
          } else if (pdata?.type === 'step-finish') {
            return { id: p.id, type: 'step-finish', tokens: pdata.tokens, cost: pdata.cost };
          } else if (pdata?.type === 'patch') {
            return { id: p.id, type: 'patch', files: pdata.files || [] };
          }
          return { id: p.id, type: 'unknown' };
        }),
      };
    });
    const todos = d.prepare(`
      SELECT content, status, position FROM todo WHERE session_id = ? ORDER BY position ASC
    `).all(sessionId);
    const ti = session.tokens_input || 0;
    const to = session.tokens_output || 0;
    const tr = session.tokens_reasoning || 0;
    const tcr = session.tokens_cache_read || 0;
    const tcw = session.tokens_cache_write || 0;
    const totalTokens = ti + to + tr + tcr + tcw;
    let status = 'idle';
    if (secsAgo < 15) status = 'working';
    else if (secsAgo < 300) status = 'active';
    return {
      id: session.id,
      title: session.title || 'Untitled',
      directory: (session.directory || '').replace(os.homedir(), '~'),
      agent: session.agent || 'build',
      model: modelName(session.model),
      cost: session.cost || 0,
      tokensInput: ti, tokensOutput: to, tokensReasoning: tr,
      tokensCacheRead: tcr, tokensCacheWrite: tcw,
      totalTokens,
      cacheRate: ti > 0 ? ((tcr / ti) * 100).toFixed(1) : '0.0',
      timeCreated: session.time_created,
      timeUpdated: session.time_updated,
      fullPrompt: promptRow?.text || '',
      messages: fullMessages,
      todos,
      status,
    };
  } catch { return null; }
}

function getActivity(since) {
  try {
    const d = getDb();
    if (!d) return [];
    const rows = d.prepare(`
      SELECT p.id, p.session_id, p.time_created, p.data, s.title as session_title
      FROM part p
      JOIN session s ON p.session_id = s.id
      WHERE p.time_created > ?
      ORDER BY p.time_created ASC
      LIMIT 100
    `).all(since);
    return rows.map(r => {
      const pdata = safeJson(r.data);
      const ptype = pdata?.type || 'unknown';
      let summary = '';
      if (ptype === 'tool') {
        const state = pdata.state || {};
        let inp = state.input || '';
        if (typeof inp === 'object') inp = JSON.stringify(inp);
        summary = pdata.tool + ': ' + String(inp).slice(0, 120);
      } else if (ptype === 'text') {
        summary = (pdata?.text || '').slice(0, 120);
      } else if (ptype === 'reasoning') {
        summary = 'Reasoning\u2026';
      } else if (ptype === 'step-finish') {
        summary = 'Step finished';
      } else if (ptype === 'patch') {
        summary = 'Patch: ' + (pdata?.files || []).length + ' file(s)';
      }
      return {
        id: r.id,
        sessionId: r.session_id,
        sessionTitle: r.session_title || '',
        timeCreated: r.time_created,
        partType: ptype,
        summary: summary.slice(0, 200),
      };
    });
  } catch { return []; }
}

function handleStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  let lastPartTime = Date.now();
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
      processes: getProcesses(),
      timestamp: Date.now(),
    });
  };
  pushOverview();
  const pollInterval = setInterval(() => {
    if (closed) return;
    const now = Date.now();
    try {
      const activity = getActivity(lastPartTime);
      if (activity.length > 0) {
        lastPartTime = Math.max(...activity.map(a => a.timeCreated), lastPartTime);
        for (const item of activity) {
          send('part', item);
        }
      }
    } catch {}
    if (now - lastOverviewTime >= 5000) {
      lastOverviewTime = now;
      pushOverview();
    }
  }, 1500);
  const keepalive = setInterval(() => { if (!closed) res.write(':keepalive\n\n'); }, 15000);
  req.on('close', () => {
    closed = true;
    clearInterval(pollInterval);
    clearInterval(keepalive);
  });
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

  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log('\n  opencode mission control running at:\n  http://localhost:' + PORT + '\n');
});

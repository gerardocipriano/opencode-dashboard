'use strict';
// Claude Code sessions for the dashboard: live-session discovery, incremental
// transcript reading, status derivation and the heuristic join between the
// `opencode run` launches found in a transcript and opencode sessions.
//
// Read-only. Never exposes prompt/message text, tool inputs or outputs, the
// session name or sub-agent descriptions: only ids, status, tool NAMES,
// sub-agent type/state, timestamps and delegation titles.

const fs = require('fs');
const path = require('path');
const os = require('os');

const WINDOW_MS = 6 * 3600 * 1000;       // delegations and sub-agents older than this are dropped
const WAIT_IDLE_MS = 10 * 60 * 1000;     // waiting -> idle
const BUSY_FRESH_MS = 2 * 60 * 1000;     // a 'busy' marker alone counts only while fresh
const SUB_STALE_MS = 15 * 60 * 1000;     // unfinished sub-agent silent for this long counts as done
const REFRESH_MS = 2000;
const FIRST_READ_BYTES = 2 * 1024 * 1024;
const MAX_READ_BYTES = 8 * 1024 * 1024;
const MAX_SUBS = 12;
const MAX_DELEGATIONS = 20;
const MAX_SUB_FILES = 40;
const MAX_LAUNCHES_PER_FILE = 60;
const JOIN_BEFORE_MS = 5000;
const JOIN_AFTER_MS = 120000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- launch command parsing ----

// Splits a shell string into commands (separated by && || ; | & newline), each a
// token list with quotes resolved. Not a full shell: enough for `cd x && opencode run ...`.
function splitCommands(cmd) {
  const cmds = [];
  let toks = [], cur = '', has = false, q = null;
  const pushTok = () => { if (has) toks.push(cur); cur = ''; has = false; };
  const pushCmd = () => { pushTok(); if (toks.length) cmds.push(toks); toks = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { if (c === "'") q = null; else cur += c; continue; }
    if (q === '"') {
      if (c === '\\' && i + 1 < cmd.length && '"\\$`'.includes(cmd[i + 1])) cur += cmd[++i];
      else if (c === '"') q = null;
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (c === '\\') {
      if (cmd[i + 1] === '\n') { i++; continue; }
      if (i + 1 < cmd.length) { cur += cmd[++i]; has = true; }
      continue;
    }
    if (c === ' ' || c === '\t') { pushTok(); continue; }
    if (c === '\n' || c === ';' || c === '|' || c === '&' || c === ')') { pushCmd(); continue; }
    cur += c; has = true;
  }
  pushCmd();
  return cmds;
}

function stripHeredocs(s) {
  return s.replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '$3');
}

// Only the variables in `env` are expanded: the launcher convention puts
// ${CLAUDE_CODE_SESSION_ID:0:8} in the title, and the transcript holds the
// unexpanded text.
function expandVars(s, env) {
  if (!env || !s.includes('$')) return s;
  return s.replace(/\$\{(\w+)(?::(\d+)(?::(\d+))?)?\}|\$(\w+)/g, (m, a, off, len, b) => {
    const v = env[a || b];
    if (v == null) return m;
    if (off != null) return len != null ? v.substr(+off, +len) : v.slice(+off);
    return v;
  });
}

const VALUE_FLAGS = new Set(['--title', '--file', '-f', '--model', '-m', '--agent', '--dir', '--session', '-s', '--format', '--variant', '--attach', '--port', '--command']);

const ENV_ASSIGN_RE = /^[A-Za-z_]\w*=/;
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);

// Skips env assignments and wrappers at the head of a command; returns the index
// of the real command word. `opencode` counts only when it sits here.
function commandWordIndex(toks) {
  let i = 0;
  while (i < toks.length) {
    const t = toks[i], b = path.basename(t);
    if (ENV_ASSIGN_RE.test(t) || t === '!') { i++; continue; }
    if (b === 'nohup' || b === 'setsid' || b === 'time' || b === 'exec' || b === 'command') { i++; continue; }
    if (b === 'env') {
      i++;
      while (i < toks.length && (toks[i].startsWith('-') || ENV_ASSIGN_RE.test(toks[i]))) i++;
      continue;
    }
    if (b === 'timeout') {
      i++;
      while (i < toks.length && toks[i].startsWith('-')) i++;
      if (i < toks.length && /^\d/.test(toks[i])) i++;
      continue;
    }
    if (b === 'stdbuf') {
      i++;
      while (i < toks.length && toks[i].startsWith('-')) i++;
      continue;
    }
    break;
  }
  return i;
}

// -> { title, dir, hasSession, sessionRef } | null (not an opencode run, or --help/--version)
function parseLaunch(command, env, depth = 0) {
  if (typeof command !== 'string' || !/opencode\s+run\b/.test(command)) return null;
  const cmds = splitCommands(stripHeredocs(command)).map(t => t.map(x => expandVars(x, env)));
  let dir = null;
  for (let toks of cmds) {
    // group/subshell/substitution openers glued to the first word
    while (toks.length && /^([A-Za-z_]\w*=)?(\$\(|\(|\{|`)/.test(toks[0])) {
      const r = toks[0].replace(/^([A-Za-z_]\w*=)?(\$\(|\(|\{|`)+/, '');
      if (r) toks = [r, ...toks.slice(1)]; else toks = toks.slice(1);
    }
    if (!toks.length) continue;
    if (toks[0] === 'cd' && toks.length > 1) { dir = toks[toks[1] === '--' ? 2 : 1] || dir; continue; }
    const w = commandWordIndex(toks);
    if (w >= toks.length) continue;
    const i = path.basename(toks[w]) === 'opencode' && toks[w + 1] === 'run' ? w : -1;
    if (i < 0) {
      // bash -c "cd x && opencode run ..."
      if (depth === 0 && SHELLS.has(path.basename(toks[w]))) {
        const c = toks.indexOf('-c', w + 1);
        const inner = c > 0 ? toks[c + 1] : null;
        if (inner) { const r = parseLaunch(inner, env, 1); if (r) return { ...r, dir: r.dir || dir }; }
      }
      continue;
    }
    const args = toks.slice(i + 2);
    let title = null, flagDir = null, hasSession = false, sessionRef = null;
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (a === '--help' || a === '-h' || a === '--version') return null;
      if (a === '--title') { if (args[k + 1] != null) title = args[++k]; continue; }
      if (a.startsWith('--title=')) { title = a.slice(8); continue; }
      if (a === '--dir') { if (args[k + 1] != null) flagDir = args[++k]; continue; }
      if (a.startsWith('--dir=')) { flagDir = a.slice(6); continue; }
      if (a === '--session' || a === '-s') { hasSession = true; if (args[k + 1] != null) sessionRef = args[++k]; continue; }
      if (a.startsWith('--session=')) { hasSession = true; sessionRef = a.slice(10); continue; }
      if (a === '--continue' || a === '-c') { hasSession = true; continue; }
      if (VALUE_FLAGS.has(a)) k++;
    }
    return { title: title || null, dir: flagDir || dir, hasSession, sessionRef };
  }
  return null;
}

// ---- transcript ingestion ----

function newState() {
  return {
    offset: 0, size: -1, mtimeMs: 0, started: false, skipFirst: false,
    pending: new Map(),          // tool_use id -> tool name
    model: null, lastStop: null, lastRole: null, lastTs: 0,
    activity: { type: null, tool: null },
    launches: [], errors: 0,
  };
}

function safeToolName(n) {
  return typeof n === 'string' && /^[\w:.\-]{1,80}$/.test(n) ? n : 'tool';
}

function ingestLine(st, line, env) {
  let o;
  try { o = JSON.parse(line); } catch { st.errors++; return; }
  if (!o || (o.type !== 'assistant' && o.type !== 'user')) return;
  const ts = Date.parse(o.timestamp) || 0;
  const msg = o.message || {};
  const content = Array.isArray(msg.content) ? msg.content : [];
  if (ts) st.lastTs = Math.max(st.lastTs, ts);
  if (o.type === 'assistant') {
    st.lastRole = 'assistant';
    if (typeof msg.model === 'string' && msg.model && msg.model[0] !== '<') st.model = msg.model;
    st.lastStop = msg.stop_reason || null;
    for (const c of content) {
      if (!c || typeof c !== 'object') continue;
      if (c.type === 'tool_use') {
        const name = safeToolName(c.name);
        if (typeof c.id === 'string') {
          st.pending.set(c.id, name);
          if (st.pending.size > 200) st.pending.delete(st.pending.keys().next().value);
        }
        st.activity = { type: 'tool', tool: name };
        const cmd = c.input && c.input.command;
        if (c.name === 'Bash' && typeof cmd === 'string' && cmd.includes('opencode run')) {
          const l = parseLaunch(cmd, env);
          if (l) {
            st.launches.push({ id: String(c.id || ts), ts: ts || st.lastTs, ...l });
            if (st.launches.length > MAX_LAUNCHES_PER_FILE) st.launches.shift();
          }
        }
      } else if (c.type === 'thinking') st.activity = { type: 'thinking', tool: null };
      else if (c.type === 'text') st.activity = { type: 'text', tool: null };
    }
  } else {
    st.lastRole = 'user';
    for (const c of content) if (c && c.type === 'tool_result' && typeof c.tool_use_id === 'string') st.pending.delete(c.tool_use_id);
  }
}

// Reads only what is new since the last call. First sight: last ~2 MB, aligned to a line.
function updateFile(st, file, env) {
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (stat.size === st.size && stat.mtimeMs === st.mtimeMs) return true;
  if (stat.size < st.offset) Object.assign(st, newState());
  if (!st.started) {
    st.started = true;
    st.offset = Math.max(0, stat.size - FIRST_READ_BYTES);
    st.skipFirst = st.offset > 0;
  }
  const want = Math.min(stat.size - st.offset, MAX_READ_BYTES);
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(want);
    const n = fs.readSync(fd, buf, 0, want, st.offset);
    const end = buf.subarray(0, n).lastIndexOf(10);
    if (end < 0) {
      if (want >= MAX_READ_BYTES) { st.offset += n; st.errors++; }   // one monstrous line: skip it
    } else {
      let text = buf.toString('utf8', 0, end);
      if (st.skipFirst) { const nl = text.indexOf('\n'); text = nl < 0 ? '' : text.slice(nl + 1); st.skipFirst = false; }
      for (const line of text.split('\n')) if (line) ingestLine(st, line, env);
      st.offset += end + 1;
    }
    // If a cap left bytes unread, force another pass on the next refresh.
    st.size = st.offset >= stat.size ? stat.size : -1;
    st.mtimeMs = stat.mtimeMs;
  } catch { st.errors++; }
  finally { if (fd != null) try { fs.closeSync(fd); } catch {} }
  return true;
}

// ---- status ----

// st: transcript state; sess: the live-session file (status, statusUpdatedAt, updatedAt)
function deriveStatus(st, now, sess = {}) {
  const lastTs = st.lastTs || 0;
  const age = now - (lastTs || sess.updatedAt || 0);
  const sessStatus = typeof sess.status === 'string' ? sess.status : '';
  const sessBusy = /^(busy|shell)/.test(sessStatus);
  const sessUpdated = sess.statusUpdatedAt || sess.updatedAt || 0;
  const lastPending = () => { let t = null; for (const v of st.pending.values()) t = v; return t; };

  if (st.pending.size > 0) {
    if (sessBusy || age < WAIT_IDLE_MS) return { status: 'working', activity: { type: 'tool', tool: lastPending() } };
    return { status: 'idle', activity: { type: null, tool: null } };
  }
  // The session file flipped to idle after the last transcript line: the turn is over
  // (covers an Esc interrupt, which leaves a user line last).
  const turnOver = sessStatus === 'idle' && sessUpdated >= lastTs;
  if (!turnOver) {
    const endStop = st.lastStop && st.lastStop !== 'tool_use';
    const inProgress = st.lastRole === 'user' || (st.lastRole === 'assistant' && !endStop);
    if (inProgress && age < WAIT_IDLE_MS) {
      const act = st.lastRole === 'user' ? { type: 'thinking', tool: null } : st.activity;
      return { status: 'working', activity: act };
    }
    if (sessBusy && now - sessUpdated < BUSY_FRESH_MS) {
      return { status: 'working', activity: st.lastRole === 'assistant' ? st.activity : { type: 'thinking', tool: null } };
    }
  }
  return { status: age < WAIT_IDLE_MS ? 'waiting' : 'idle', activity: { type: null, tool: null } };
}

// ---- join: launches -> opencode sessions ----

function normDir(d, base, home) {
  if (!d || typeof d !== 'string') return '';
  if (home && (d === '~' || d.startsWith('~/'))) d = path.join(home, d.slice(1));
  return path.resolve(base || '/', d).replace(/\/+$/, '');
}

// launches: [{key, claudeId, ts, title, dir, hasSession, sessionRef}]
// ocRows:   [{id, title, directory, timeCreated}]
// ctx:      { claude: {id: {short, cwd}}, procs: [{envSessionId, cmd, startTime, isRun}], home }
// -> Map(key -> opencode session id)
//
// Rules, strongest first; every opencode session is used at most once.
//  0. `--session ses_...` names the session outright.
//  1. title ends with -<first 8 chars of the launching Claude session id>:
//     exact title match, any time (nearest to the launch wins).
//  2. exact title and time_created in [launch-5s, launch+120s]. Candidates are
//     ranked globally by (directory mismatch, time distance), so two launches
//     with the same title each take their own nearest session. A live
//     `opencode run` owned by the same Claude session (CLAUDE_CODE_SESSION_ID in
//     its environ, title in its command line) replaces the launch time with the
//     process start time as the reference.
// Failure modes: a launch that never created a session can still steal a
// neighbour's session if it shares the title and the window; --continue launches
// are only matched by rule 0 or 1; sessions older than the query window are invisible.
function joinLaunches(launches, ocRows, ctx = {}) {
  const out = new Map();
  const used = new Set();
  const home = ctx.home || os.homedir();
  const byId = new Map(ocRows.map(r => [r.id, r]));
  const procs = (ctx.procs || []).filter(p => p && p.isRun && p.envSessionId);

  const ref = (l) => {
    const p = procs.find(p => p.envSessionId === l.claudeId && l.title && p.cmd && p.cmd.includes(l.title)
      && p.startTime && Math.abs(p.startTime * 1000 - l.ts) < 60000);
    return p ? p.startTime * 1000 : l.ts;
  };
  const dirOf = (l) => normDir(l.dir, ctx.claude?.[l.claudeId]?.cwd, home);

  const pairs = [];
  for (const l of launches) {
    if (l.sessionRef && byId.has(l.sessionRef)) { out.set(l.key, l.sessionRef); continue; }
    if (!l.title) continue;
    const info = ctx.claude?.[l.claudeId];
    const m = /-([0-9a-f]{8})$/i.exec(l.title);
    const suffix = !!(m && info && info.short === m[1].toLowerCase());
    if (l.hasSession && !suffix) continue;
    const t0 = ref(l);
    const ld = dirOf(l) || normDir(info?.cwd, '/', home);
    for (const r of ocRows) {
      if (r.title !== l.title) continue;
      const dt = r.timeCreated - t0;
      if (!suffix && (r.timeCreated < l.ts - JOIN_BEFORE_MS || r.timeCreated > l.ts + JOIN_AFTER_MS)) continue;
      const rd = normDir(r.directory, '/', home);
      const mismatch = !suffix && ld && rd && ld !== rd ? 1 : 0;
      pairs.push({ l, r, tier: suffix ? 0 : 1, mismatch, dist: Math.abs(dt) });
    }
  }
  pairs.sort((a, b) => a.tier - b.tier || a.mismatch - b.mismatch || a.dist - b.dist);
  for (const p of pairs) {
    if (out.has(p.l.key) || used.has(p.r.id)) continue;
    out.set(p.l.key, p.r.id);
    used.add(p.r.id);
  }
  return out;
}

// ---- collector ----

function readStartTicks(pid) {
  try {
    const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const rest = s.slice(s.lastIndexOf(')') + 2).split(' ');
    return rest[19];     // field 22 (starttime), fields after ')' start at 3
  } catch { return null; }
}

function isAlive(pid, procStart) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (fs.existsSync('/proc/self/stat')) {
    const t = readStartTicks(pid);
    if (t == null) return false;
    return procStart == null || String(procStart) === t;
  }
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

const slugOf = (cwd) => cwd.replace(/[\/.]/g, '-');

function createCollector(opts = {}) {
  const enabled = opts.enabled !== false;
  const home = opts.home || os.homedir();
  const dir = opts.dir || path.join(home, '.claude');
  const sessionsDir = path.join(dir, 'sessions');
  const projectsDir = path.join(dir, 'projects');
  const nowFn = opts.now || Date.now;
  const recs = new Map();          // sessionId -> record
  let projScan = { t: 0, map: new Map() };
  let cache = null;
  const stats = { parseErrors: 0 };

  const abbrev = (p) => (home && p && (p === home || p.startsWith(home + '/'))) ? '~' + p.slice(home.length) : p;

  function findTranscript(sessionId, cwd) {
    if (cwd) {
      const p = path.join(projectsDir, slugOf(cwd), sessionId + '.jsonl');
      if (fs.existsSync(p)) return p;
    }
    // Slug rule not matching (unusual characters in cwd): scan project dirs, at most every 30 s.
    const now = nowFn();
    if (now - projScan.t > 30000) {
      projScan = { t: now, map: new Map() };
      try {
        for (const d of fs.readdirSync(projectsDir)) {
          try {
            for (const f of fs.readdirSync(path.join(projectsDir, d))) {
              if (f.endsWith('.jsonl')) projScan.map.set(f.slice(0, -6), path.join(projectsDir, d, f));
            }
          } catch {}
        }
      } catch {}
    }
    return projScan.map.get(sessionId) || null;
  }

  function scanLive() {
    const live = [];
    let files = [];
    try { files = fs.readdirSync(sessionsDir); } catch { return live; }
    for (const f of files) {
      const m = /^(\d+)\.json$/.exec(f);   // never the sibling *.key files
      if (!m) continue;
      let j;
      try { j = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8')); } catch { continue; }
      if (!j || j.pid !== Number(m[1]) || typeof j.sessionId !== 'string' || !UUID_RE.test(j.sessionId)) continue;
      if (typeof j.cwd !== 'string' || !isAlive(j.pid, j.procStart)) continue;
      live.push({
        id: j.sessionId, pid: j.pid, cwd: j.cwd,
        kind: j.kind === 'bg' ? 'bg' : 'interactive',
        startedAt: Number(j.startedAt) || 0, updatedAt: Number(j.updatedAt) || 0,
        status: typeof j.status === 'string' ? j.status : '',
        statusUpdatedAt: Number(j.statusUpdatedAt) || 0,
      });
    }
    return live;
  }

  function updateSubs(rec, now) {
    const sdir = path.join(rec.mainPath.replace(/\.jsonl$/, ''), 'subagents');
    let files;
    try { files = fs.readdirSync(sdir); } catch { rec.subs.clear(); return; }
    const found = [];
    for (const f of files) {
      const m = /^agent-([\w-]+)\.meta\.json$/.exec(f);
      if (!m) continue;
      const jl = path.join(sdir, `agent-${m[1]}.jsonl`);
      let mst, jst = null;
      try { mst = fs.statSync(path.join(sdir, f)); } catch { continue; }
      try { jst = fs.statSync(jl); } catch {}
      found.push({ id: m[1], metaPath: path.join(sdir, f), jl, mst, jst });
    }
    found.sort((a, b) => (b.jst?.mtimeMs || b.mst.mtimeMs) - (a.jst?.mtimeMs || a.mst.mtimeMs));
    const keep = new Set();
    for (const s of found.slice(0, MAX_SUB_FILES)) {
      keep.add(s.id);
      let e = rec.subs.get(s.id);
      if (!e) { e = { state: newState(), meta: null, metaMtime: 0 }; rec.subs.set(s.id, e); }
      if (e.metaMtime !== s.mst.mtimeMs) {
        try {
          const j = JSON.parse(fs.readFileSync(s.metaPath, 'utf8'));
          e.meta = { type: typeof j.agentType === 'string' ? j.agentType.slice(0, 40) : 'agent', finished: j.finished === true };
        } catch { e.meta = e.meta || { type: 'agent', finished: false }; }
        e.metaMtime = s.mst.mtimeMs;
      }
      e.startedAt = Math.round(s.mst.birthtimeMs || s.mst.ctimeMs);
      e.lastMs = s.jst ? s.jst.mtimeMs : s.mst.mtimeMs;
      if (s.jst && now - s.jst.mtimeMs < WINDOW_MS) updateFile(e.state, s.jl, rec.env);
    }
    for (const id of rec.subs.keys()) if (!keep.has(id)) rec.subs.delete(id);
  }

  function refresh(now) {
    const live = scanLive();
    const seen = new Set();
    for (const s of live) {
      seen.add(s.id);
      let rec = recs.get(s.id);
      if (!rec) {
        rec = { state: newState(), subs: new Map(), mainPath: null, env: { CLAUDE_CODE_SESSION_ID: s.id } };
        recs.set(s.id, rec);
      }
      rec.sess = s;
      if (!rec.mainPath || !fs.existsSync(rec.mainPath)) rec.mainPath = findTranscript(s.id, s.cwd);
      if (rec.mainPath) {
        updateFile(rec.state, rec.mainPath, rec.env);
        updateSubs(rec, now);
      }
    }
    for (const id of recs.keys()) if (!seen.has(id)) recs.delete(id);
    return live.map(s => recs.get(s.id));
  }

  function build(o, now) {
    const list = refresh(now);
    const claudeInfo = {};
    const launches = [];
    for (const rec of list) {
      const s = rec.sess;
      claudeInfo[s.id] = { short: s.id.slice(0, 8), cwd: s.cwd };
      const all = [rec.state, ...[...rec.subs.values()].map(e => e.state)];
      for (const st of all) {
        for (const l of st.launches) {
          if (l.ts >= now - WINDOW_MS) launches.push({ ...l, key: s.id + ':' + l.id, claudeId: s.id });
        }
      }
    }
    stats.parseErrors = list.reduce((n, rec) => n + rec.state.errors + [...rec.subs.values()].reduce((m, e) => m + e.state.errors, 0), 0);

    let ocRows = [];
    if (launches.length || list.length) {
      try { ocRows = (o.ocRows && o.ocRows(list.map(r => r.sess.id.slice(0, 8)), now - WINDOW_MS - JOIN_BEFORE_MS)) || []; } catch { ocRows = []; }
    }
    let procs = [];
    if (launches.some(l => now - l.ts < WAIT_IDLE_MS)) {
      try { procs = (typeof o.procs === 'function' ? o.procs() : o.procs) || []; } catch { procs = []; }
    }
    const joined = launches.length ? joinLaunches(launches, ocRows, { claude: claudeInfo, procs, home }) : new Map();
    const liveCache = new Map();
    const isLive = (id) => {
      if (!liveCache.has(id)) { let v = false; try { v = !!(o.isLive && o.isLive(id)); } catch {} liveCache.set(id, v); }
      return liveCache.get(id);
    };
    const titleOf = new Map(ocRows.map(r => [r.id, r.title]));

    const byOc = new Map();
    const claude = list.map(rec => {
      const s = rec.sess, st = rec.state;
      const d = deriveStatus(st, now, s);
      const mine = launches.filter(l => l.claudeId === s.id).sort((a, b) => b.ts - a.ts);
      const delegations = mine.slice(0, MAX_DELEGATIONS).map(l => {
        const sessionId = joined.get(l.key) || null;
        return { sessionId, title: l.title || (sessionId ? titleOf.get(sessionId) || null : null), startedAt: l.ts, live: sessionId ? isLive(sessionId) : false };
      });
      for (const l of mine) {
        const sid = joined.get(l.key);
        if (sid && !byOc.has(sid)) byOc.set(sid, { id: s.id, short: s.id.slice(0, 8) });
      }
      const subagents = [...rec.subs.entries()]
        .filter(([, e]) => e.startedAt >= now - WINDOW_MS)
        .map(([id, e]) => ({
          id, type: e.meta?.type || 'agent', startedAt: e.startedAt,
          state: !e.meta?.finished && now - e.lastMs < SUB_STALE_MS ? 'working' : 'done',
        }))
        .sort((a, b) => (a.state === b.state ? 0 : a.state === 'working' ? -1 : 1) || b.startedAt - a.startedAt)
        .slice(0, MAX_SUBS)
        .map(({ id, type, state }) => ({ id, type, state }));
      return {
        id: s.id, short: s.id.slice(0, 8), pid: s.pid, kind: s.kind,
        directory: abbrev(s.cwd), project: path.basename(s.cwd) || s.cwd,
        model: st.model, status: d.status, activity: d.activity,
        startedAt: s.startedAt, updatedAt: Math.max(s.updatedAt, st.lastTs),
        subagents, delegations,
      };
    }).sort((a, b) => b.updatedAt - a.updatedAt);
    return { claude, byOc };
  }

  return {
    stats,
    // -> { claude: ClaudeSession[], byOc: Map(ocSessionId -> {id, short}) }
    // o: { ocRows(shorts, sinceMs) -> rows, isLive(ocId) -> bool, procs: array | fn }
    snapshot(o = {}) {
      if (!enabled) return { claude: [], byOc: new Map() };
      const now = nowFn();
      if (cache && now - cache.t < REFRESH_MS) return cache.v;
      let v;
      try { v = build(o, now); } catch { v = cache ? cache.v : { claude: [], byOc: new Map() }; }
      cache = { t: now, v };
      return v;
    },
    invalidate() { cache = null; },
  };
}

module.exports = { createCollector, parseLaunch, deriveStatus, joinLaunches, ingestLine, newState, updateFile, isAlive };

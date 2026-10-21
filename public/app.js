// ---- 1. constants ----

// Every user-facing string lives here, so later modules never inline labels.
const TXT = {
  brandSub: 'mission control',
  kpi: {
    working: 'Al lavoro',
    attention: 'Allarme',
    procs: 'Processi',
    cost: 'Costo 24h',
    est: 'stima',
  },
  svc: { alive: 'srv ok', off: 'srv off', down: 'srv giù', unknown: 'srv ?' },
  conn: {
    live: 'live',
    connecting: 'connessione',
    retry: 'riprovo {n}s',
    offline: 'offline {n}s',
    stale: 'in ritardo',
  },
  sessions: {
    title: 'Sessioni',
    search: 'Cerca: titolo, prompt, cartella, modello',
    sub: 'Sub-agent',
  },
  filters: { all: 'Tutte', working: 'Lavoro', attention: 'Allarme', recent: 'Recenti', rest: 'Ferme' },
  groups: { working: 'Al lavoro', attention: 'Allarme', recent: 'Recenti', suspended: 'Sospese', idle: 'Inattive' },
  tabs: { feed: 'Attività', log: 'Log', system: 'Sistema' },
  feed: {
    all: 'Tutto',
    tool: 'Tool',
    problems: 'Problemi',
    steps: 'Step',
    pause: 'Pausa',
    resume: 'Riprendi',
    count: '{n} eventi',
  },
  pills: {
    newer: '↑ {n} nuovi',
    paused: 'In pausa · {n} nuovi',
    log: '↓ {n} nuove righe',
    detail: 'Ultimi eventi ↓',
  },
  detail: {
    close: 'Chiudi dettaglio',
    copy: 'Copia ID sessione',
    more: 'Mostra tutto',
    less: 'Mostra meno',
    older: 'Mostra {n} precedenti',
  },
  empty: {
    sessions: 'Nessuna sessione. Avvia opencode in un terminale.',
    filtered: 'Nessuna sessione per questo filtro.',
    showAll: 'Mostra tutte',
    activity: 'Nessuna attività nelle ultime 6 ore.',
    activityFiltered: 'Nessun evento per questo filtro.',
    processes: 'Nessun processo opencode.',
    locks: 'Nessun lock.',
    log: 'Log vuoto.',
    messages: 'Nessun messaggio.',
  },
  toasts: {
    failed: 'Fallita: {title}',
    stuck: 'Bloccata: {title}',
    done: 'Conclusa: {title}',
    todos: 'Todo completati: {title}',
    copied: 'ID copiato',
    copyFail: 'Copia non riuscita',
  },
  alerts: {
    pre_session_stall: 'Run senza sessione',
    session_stall: 'Sessione ferma',
    lock_stuck: 'Lock bloccato',
    open: 'Apri',
    dismiss: 'Ignora allarme',
    overflow: 'e altri {n} allarmi',
  },
  standby: 'Standby',
  help: { title: 'Scorciatoie e legenda' },
  kv: {
    directory: 'Cartella',
    agent: 'Agent',
    model: 'Modello',
    provider: 'Provider',
    created: 'Creata',
    updated: 'Aggiornata',
    id: 'ID',
    parent: 'Padre',
  },
  roles: { user: 'Tu', assistant: 'assistant' },
  system: {
    title: 'Sistema',
    service: 'Servizio opencode',
    processes: 'Processi',
    locks: 'Lock',
    database: 'Database',
    version: 'Versione',
    url: 'URL',
    pid: 'PID',
    type: 'Tipo',
    state: 'Stato',
    cpu: 'CPU',
    ram: 'RAM',
    age: 'Età',
    fd: 'FD',
    command: 'Comando',
    session: 'Sessione',
    heartbeat: 'Heartbeat',
    alive: 'PID vivo',
  },
  loading: 'Caricamento',
  errors: {
    dbTitle: 'Database di opencode non trovato',
    dbText: 'Atteso in ~/.local/share/opencode/opencode.db. Avvia opencode almeno una volta.',
    network: 'Errore di rete. Riprovo…',
    notFound: 'Sessione non trovata.',
  },
};

// Session status mapping (§4.1). `group` drives ordering and group headers.
const STATUS = {
  working: { lamp: 'working', label: 'Al lavoro', group: 'working', order: 0 },
  failed: { lamp: 'failed', label: 'Fallita', group: 'attention', order: 1 },
  stuck: { lamp: 'stuck', label: 'Bloccata', group: 'attention', order: 1 },
  active: { lamp: 'active', label: 'Recente', group: 'recent', order: 2 },
  suspended: { lamp: 'suspended', label: 'Sospesa', group: 'suspended', order: 3 },
  idle: { lamp: 'idle', label: 'Inattiva', group: 'idle', order: 4 },
};

// Activity status mapping (§4.1). Missing status is handled by the caller.
const ACT = {
  pending: { lamp: 'pending', label: 'in coda' },
  running: { lamp: 'working', label: 'in corso' },
  completed: { lamp: 'active', label: 'ok' },
  error: { lamp: 'failed', label: 'errore' },
  retry: { lamp: 'stuck', label: 'retry' },
  done: { lamp: 'active', label: 'concluso' },
  failed: { lamp: 'failed', label: 'fallito' },
};

const FILTERS = [
  { key: 'all', label: TXT.filters.all },
  { key: 'working', label: TXT.filters.working },
  { key: 'attention', label: TXT.filters.attention },
  { key: 'recent', label: TXT.filters.recent },
  { key: 'rest', label: TXT.filters.rest },
];

// Tool families (§4.9): lowercase test, first match wins.
const FAMILIES = [
  ['exec', /^(bash|shell|exec|run|terminal|process)/],
  ['edit', /^(edit|write|multiedit|patch|apply_patch|str_replace|create|delete|move)/],
  ['read', /^(read|list|ls|glob|grep|find|codegraph|lsp|search_files|view)/],
  ['web', /^(webfetch|websearch|fetch|web|browser|http|context7|exa|tavily|firecrawl)/],
  ['agent', /^(task|agent|subagent|skill|todowrite|todoread|todo)/],
];

const FEED_MAX = 300;
const LOG_MAX = 1000;
const RM = matchMedia('(prefers-reduced-motion: reduce)');

// ---- 2. utils ----

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function tpl(id) {
  const node = document.getElementById(id);
  return node ? node.content.firstElementChild.cloneNode(true) : null;
}

function setText(el, v) {
  if (!el) return;
  const s = v == null ? '' : String(v);
  if (el.textContent !== s) el.textContent = s;
}

function setAttr(el, k, v) {
  if (!el) return;
  if (v == null || v === false) {
    if (el.hasAttribute(k)) el.removeAttribute(k);
    return;
  }
  const s = v === true ? '' : String(v);
  if (el.getAttribute(k) !== s) el.setAttribute(k, s);
}

function setIcon(svgEl, name) {
  if (!svgEl) return;
  const use = svgEl.querySelector('use');
  if (!use) return;
  const href = '#i-' + name;
  if (use.getAttribute('href') !== href) use.setAttribute('href', href);
}

function parseJSON(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// API timestamps may be seconds, milliseconds or microseconds.
function normTs(n) {
  n = Number(n) || 0;
  if (n < 1e11) return n * 1000;
  if (n > 1e14) return Math.floor(n / 1000);
  return n;
}

function relTime(ms) {
  const diff = Date.now() - (Number(ms) || 0);
  if (diff < 5000 || diff < 0) return 'ora';
  const s = Math.floor(diff / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'g';
}

function fmtClock(ms) {
  const n = Number(ms) || 0;
  if (!n) return '—';
  const d = new Date(n);
  const now = new Date();
  let out;
  try {
    out = d.toLocaleTimeString('it-IT', { hour12: false });
  } catch {
    out = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  }
  if (d.toDateString() !== now.toDateString()) {
    out = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + out;
  }
  return out;
}

function fmtTok(n) {
  n = Number(n);
  if (!isFinite(n)) return '—';
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'k';
  return (n / 1e6).toFixed(1) + 'M';
}

function fmtDur(ms) {
  ms = Number(ms) || 0;
  if (ms < 0) ms = 0;
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const m = Math.floor(ms / 60000);
  const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return m + 'm ' + ss + 's';
}

// `s` is seconds (process elapsed).
function fmtElapsed(s) {
  s = Math.max(0, Number(s) || 0);
  if (s < 60) return Math.round(s) + 's';
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const ss = String(Math.floor(s % 60)).padStart(2, '0');
    return m + 'm ' + ss + 's';
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return h + 'h ' + mm + 'm';
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d + 'g ' + h + 'h';
}

function fmtCost(n) {
  if (n == null) return '—';
  n = Number(n);
  if (!isFinite(n)) return '—';
  if (n === 0) return '$0';
  if (n < 0.01) return '$' + n.toFixed(4);
  if (n < 1) return '$' + n.toFixed(3);
  return '$' + n.toFixed(2);
}

function shortId(id) {
  const s = String(id || '');
  return s.length > 14 ? s.slice(0, 10) + '…' : s;
}

function clip(s, n) {
  s = s == null ? '' : String(s);
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)).trimEnd() + '…';
}

function basename(p) {
  const s = String(p || '').replace(/[\\/]+$/, '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i >= 0 ? s.slice(i + 1) : s;
}

function displayTitle(s) {
  const title = String((s && s.title) || '').trim();
  if (title && !/^(untitled|new session)/i.test(title)) return title;
  const prompt = String((s && s.firstUserPrompt) || '').trim();
  if (prompt) return clip(prompt, 80);
  return shortId(s && s.id);
}

function toolFamily(name) {
  const n = String(name || '').toLowerCase();
  for (const [fam, re] of FAMILIES) if (re.test(n)) return fam;
  return 'other';
}

function itemFamily(it) {
  const type = (it && (it.partType || it.type)) || '';
  switch (type) {
    case 'tool': return toolFamily(it.tool);
    case 'user': return 'user';
    case 'text': return 'text';
    case 'reasoning': return 'reason';
    case 'step-finish': return 'step';
    case 'shell': return 'exec';
    case 'compaction': return 'note';
    case 'idle': return it.status === 'failed' ? 'error' : 'idle';
    case 'retry': return 'warn';
    case 'error': return 'error';
    default: return 'other';
  }
}

function iconFor(it) {
  const type = (it && (it.partType || it.type)) || '';
  if (type === 'tool') {
    const fam = toolFamily(it.tool);
    if (fam === 'read') return /^(grep|glob|find|codegraph|search)/i.test(String(it.tool || '')) ? 'search' : 'read';
    return fam === 'other' ? 'tool' : fam;
  }
  switch (type) {
    case 'user': return 'user';
    case 'text': return 'text';
    case 'reasoning': return 'reasoning';
    case 'step-finish': return 'step';
    case 'shell': return 'exec';
    case 'compaction': return 'compaction';
    case 'idle': return it.status === 'failed' ? 'error' : 'idle';
    case 'retry': return 'retry';
    case 'error': return 'error';
    default: return 'tool';
  }
}

function storeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function storeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: the page keeps working in memory
  }
}

// ---- 3. api ----

const MOCK = new URLSearchParams(location.search).has('mock');

const api = MOCK ? createMockApi() : {
  get(path, opts) {
    return fetch(path, opts).then(r => {
      if (!r.ok) {
        const e = new Error('HTTP ' + r.status);
        e.status = r.status;
        throw e;
      }
      return r.json();
    });
  },
  stream(path) {
    return new EventSource(path);
  },
};

// Deterministic fixture + fake EventSource. Control surface on window.__ocmock (§5.12).
function createMockApi() {
  const T0 = Date.now();
  const params = new URLSearchParams(location.search);
  const live = {
    paused: params.has('still'),
    dropped: false,
    tick: 0,
    toolStep: 0,
    toolId: 1,
    toolCreated: T0 - 9000,
    textLen: 48,
    main: null,
    alerts: null,
    streams: new Set(),
    burstTimers: new Set(),
  };

  const LONG_TITLE = '/' + 'a'.repeat(199);

  function mk(over) {
    return Object.assign({
      id: '',
      parentId: null,
      title: '',
      directory: '/home/u/code',
      agent: 'build',
      model: 'gpt-4.1',
      provider: 'openai',
      cost: 0,
      estCost: 0,
      estSource: null,
      estPricedAs: null,
      tokensInput: 0,
      tokensOutput: 0,
      tokensReasoning: 0,
      tokensCacheRead: 0,
      tokensCacheWrite: 0,
      timeCreated: T0 - 3600e3,
      timeUpdated: T0 - 60e3,
      idleOutcome: null,
      firstUserPrompt: '',
      lastActivity: null,
      todos: { done: 0, total: 0 },
      status: 'idle',
    }, over);
  }

  const sessions = [
    mk({
      id: 's-work-1',
      title: 'Refactor modulo billing',
      directory: '/home/u/code/billing',
      agent: 'build',
      model: 'gpt-4.1',
      provider: 'openai',
      cost: 0.042,
      estCost: 0.042,
      estSource: 'exact',
      estPricedAs: 'gpt-4.1',
      tokensInput: 18400,
      tokensOutput: 5200,
      tokensReasoning: 1200,
      tokensCacheRead: 9000,
      tokensCacheWrite: 2100,
      timeCreated: T0 - 42 * 60e3,
      timeUpdated: T0 - 6000,
      firstUserPrompt: 'Rifattorizza il modulo billing separando il calcolo delle imposte dalla persistenza.',
      todos: { done: 3, total: 7 },
      status: 'working',
      lastActivity: { type: 'tool', tool: 'bash', status: 'running', summary: 'npm test -- --watch=false' },
    }),
    mk({
      id: 's-work-2',
      title: 'Ricerca web provider LLM',
      directory: '/home/u/code/research',
      agent: 'build',
      model: 'gemini-2.5-flash',
      provider: 'google',
      cost: 0,
      estCost: 0.31,
      estSource: 'paid-twin',
      estPricedAs: 'gemini-2.5-flash (paid)',
      tokensInput: 26000,
      tokensOutput: 4100,
      tokensReasoning: 800,
      tokensCacheRead: 12000,
      tokensCacheWrite: 900,
      timeCreated: T0 - 20 * 60e3,
      timeUpdated: T0 - 6000,
      firstUserPrompt: 'Confronta i listini dei provider LLM per il 2026.',
      status: 'working',
      lastActivity: { type: 'tool', tool: 'websearch', status: 'running', summary: 'provider LLM pricing 2026' },
    }),
    mk({
      id: 's-child-1',
      parentId: 's-work-1',
      title: 'Sub-agent: analisi test',
      directory: '/home/u/code/billing',
      agent: 'general',
      model: 'gpt-4.1',
      provider: 'openai',
      cost: 0.002,
      estCost: 0.002,
      estSource: 'exact',
      estPricedAs: 'gpt-4.1',
      timeCreated: T0 - 18 * 60e3,
      timeUpdated: T0 - 6000,
      firstUserPrompt: 'Analizza i test falliti del modulo billing.',
      status: 'working',
      lastActivity: { type: 'tool', tool: 'read', status: 'running', summary: 'test/billing.test.ts' },
    }),
    mk({
      id: 's-fail',
      title: 'Portfolio CRT',
      directory: '/home/u/code/portfolio',
      agent: 'build',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
      cost: 0.011,
      estCost: 0.011,
      estSource: 'exact',
      estPricedAs: 'claude-sonnet-4',
      timeCreated: T0 - 3 * 3600e3,
      timeUpdated: T0 - 8 * 60e3,
      firstUserPrompt: 'Rigenera il portfolio con effetto CRT.',
      status: 'failed',
      idleOutcome: 'failed',
      lastActivity: { type: 'idle', status: 'failed', summary: 'Upstream request failed: Endpoint is unavailable.' },
    }),
    mk({
      id: 's-stuck',
      title: 'Migrazione Terraform',
      directory: '/home/u/infra/tf',
      agent: 'build',
      model: 'gpt-4.1',
      provider: 'openai',
      timeCreated: T0 - 2 * 3600e3,
      timeUpdated: T0 - 14 * 60e3,
      firstUserPrompt: 'Migra i moduli Terraform al nuovo provider.',
      status: 'stuck',
      lastActivity: { type: 'tool', tool: 'edit', status: 'running', summary: 'main.tf' },
    }),
    mk({
      id: 's-active',
      title: 'Fix CSS header',
      directory: '/home/u/code/ui',
      model: 'gpt-4.1-mini',
      provider: 'openai',
      cost: 0.004,
      estCost: 0.004,
      estSource: 'exact',
      estPricedAs: 'gpt-4.1-mini',
      timeCreated: T0 - 90 * 60e3,
      timeUpdated: T0 - 2 * 60e3,
      firstUserPrompt: 'Sistema l’allineamento dell’header su mobile.',
      todos: { done: 5, total: 5 },
      status: 'active',
      lastActivity: { type: 'idle', status: 'done', summary: 'Turno concluso' },
    }),
    mk({
      id: 's-susp',
      title: 'Sessione parcheggiata',
      directory: '/home/u/code/legacy',
      agent: 'build',
      model: 'gpt-4.1',
      provider: 'openai',
      timeCreated: T0 - 5 * 3600e3,
      timeUpdated: T0 - 3 * 3600e3,
      status: 'suspended',
      firstUserPrompt: 'Riprendi la migrazione del modulo legacy.',
    }),
    mk({
      id: 's-idle-1',
      title: 'Setup CI GitHub Actions',
      directory: '/home/u/code/ci',
      model: 'gpt-4.1-mini',
      provider: 'openai',
      timeCreated: T0 - 9 * 3600e3,
      timeUpdated: T0 - 6 * 3600e3,
      firstUserPrompt: 'Configura la pipeline CI.',
      status: 'idle',
      lastActivity: { type: 'idle', status: 'done', summary: 'Turno concluso' },
    }),
    mk({
      id: 's-idle-2',
      title: 'Documentazione API',
      directory: '/home/u/code/docs',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
      timeCreated: T0 - 10 * 3600e3,
      timeUpdated: T0 - 7 * 3600e3,
      firstUserPrompt: 'Scrivi la documentazione delle API.',
      status: 'idle',
      lastActivity: { type: 'text', status: 'completed', summary: 'Documentazione aggiornata' },
    }),
    mk({
      id: 's-idle-3',
      title: 'Analisi performance',
      directory: '/home/u/code/perf',
      model: 'gpt-4.1',
      provider: 'openai',
      timeCreated: T0 - 12 * 3600e3,
      timeUpdated: T0 - 11 * 3600e3,
      firstUserPrompt: 'Analizza i colli di bottiglia.',
      status: 'idle',
      lastActivity: { type: 'reasoning', status: 'completed', summary: 'Ragionamento concluso' },
    }),
    mk({
      id: 's-idle-4',
      title: 'Pulizia dipendenze',
      directory: '/home/u/code/deps',
      model: 'gpt-4.1-mini',
      provider: 'openai',
      timeCreated: T0 - 20 * 3600e3,
      timeUpdated: T0 - 18 * 3600e3,
      firstUserPrompt: 'Rimuovi le dipendenze inutilizzate.',
      status: 'idle',
      lastActivity: { type: 'shell', status: 'completed', summary: 'npm prune' },
    }),
    mk({
      id: 's-idle-5',
      title: LONG_TITLE,
      directory: '/home/u/code/long',
      model: 'gpt-4.1',
      provider: 'openai',
      timeCreated: T0 - 26 * 3600e3,
      timeUpdated: T0 - 25 * 3600e3,
      firstUserPrompt: 'Titolo molto lungo senza spazi.',
      status: 'idle',
      lastActivity: null,
    }),
  ];

  const service = { version: '1.14.2', url: 'http://127.0.0.1:4096', pid: 4242, alive: true };
  const processes = [
    { pid: 4242, cpu: 12.5, rss: 184, state: 'R', startTime: T0 - 3600e3, elapsed: 3600, cmd: 'opencode serve --port 4096', fdCount: 42, isRun: true, isInteractive: false },
    { pid: 4243, cpu: 3.2, rss: 96, state: 'S', startTime: T0 - 1800e3, elapsed: 1800, cmd: 'opencode tui', fdCount: 28, isRun: false, isInteractive: true },
    { pid: 4244, cpu: 0, rss: 0, state: 'Z', startTime: T0 - 600e3, elapsed: 600, cmd: 'opencode run --once', fdCount: 0, isRun: false, isInteractive: false },
  ];

  function clone(v) {
    if (typeof structuredClone === 'function') return structuredClone(v);
    return JSON.parse(JSON.stringify(v));
  }

  function httpError(status) {
    const e = new Error('HTTP ' + status);
    e.status = status;
    return e;
  }

  function overviewData() {
    return {
      sessions: clone(sessions),
      cost24h: 0.042,
      estCost24h: 1.15,
      processes: clone(processes),
      service: clone(service),
      timestamp: Date.now(),
    };
  }

  function alertItem() {
    return {
      type: 'session_stall',
      message: 'Nessun aggiornamento da 14 minuti.',
      sessionId: 's-stuck',
      title: 'Migrazione Terraform',
      at: Date.now() - 14 * 60e3,
    };
  }

  const PART_TYPES = ['tool', 'user', 'text', 'reasoning', 'step-finish', 'shell', 'compaction', 'idle', 'retry', 'error'];
  const TOOLS = ['bash', 'edit', 'read', 'grep', 'webfetch', 'task', 'todowrite'];

  function activityItem(type, tool, session, at, i) {
    let status;
    let summary;
    switch (type) {
      case 'tool':
        status = i % 7 === 0 ? 'error' : 'completed';
        summary = tool + ': ' + (status === 'error' ? 'comando fallito' : 'esecuzione completata');
        break;
      case 'user':
        summary = session.firstUserPrompt || 'Richiesta utente';
        break;
      case 'text':
        status = 'completed';
        summary = 'Sto analizzando il codice…';
        break;
      case 'reasoning':
        status = 'completed';
        summary = 'Verifica dei test e dei tipi';
        break;
      case 'step-finish':
        summary = 'step · in 12k · out 3.4k';
        break;
      case 'shell':
        status = 'completed';
        summary = '$ npm test';
        break;
      case 'compaction':
        summary = 'Contesto compattato';
        break;
      case 'idle':
        status = i % 3 === 0 ? 'failed' : 'done';
        summary = status === 'failed' ? 'Turno fallito' : 'Turno concluso';
        break;
      case 'retry':
        status = 'retry';
        summary = 'Retry tra 2s';
        break;
      case 'error':
        status = 'error';
        summary = 'Errore: upstream failed';
        break;
      default:
        status = undefined;
        summary = '';
    }
    return {
      id: 'evt-backlog-' + i,
      sessionId: session.id,
      sessionTitle: session.title,
      timeCreated: at,
      timeUpdated: at + 400,
      partType: type,
      tool: type === 'tool' || type === 'shell' ? tool : undefined,
      status,
      streaming: false,
      summary,
    };
  }

  const activity = [];
  for (let i = 0; i < 40; i++) {
    const type = PART_TYPES[i % PART_TYPES.length];
    const session = sessions[i % sessions.length];
    const at = T0 - (40 - i) * 95e3;
    activity.push(activityItem(type, TOOLS[i % TOOLS.length], session, at, i));
  }

  function logLine(i) {
    const levels = ['INFO', 'INFO', 'WARN', 'INFO', 'ERROR', 'DEBUG', 'INFO'];
    const at = new Date(T0 - (30 - i) * 4000).toISOString();
    return {
      time: at,
      level: levels[i % levels.length],
      run: 'run-' + (i % 3),
      message: 'mock log line ' + (i + 1),
      sessionId: i % 4 === 0 ? 's-work-1' : null,
      rest: i % 5 === 0 ? ' {"upstream":"ok"}' : '',
    };
  }

  const logLines = [];
  for (let i = 0; i < 30; i++) logLines.push(logLine(i));

  function detailFor(id) {
    const s = sessions.find(x => x.id === id);
    if (!s) return null;
    const t = T0 - 10 * 60e3;
    const big = 'errore: ' + 'x'.repeat(3000);
    const messages = [
      {
        id: 'm-u1',
        role: 'user',
        agent: null,
        timeCreated: t,
        parts: [{ type: 'text', text: s.firstUserPrompt || 'Rifattorizza il modulo billing.' }],
      },
      {
        id: 'm-a1',
        role: 'assistant',
        agent: s.agent,
        model: s.model,
        timeCreated: t + 4000,
        streaming: s.status === 'working',
        parts: [
          { type: 'reasoning', text: 'Leggo prima il modulo e i test, poi separo le responsabilità.' },
          { type: 'tool', tool: 'read', status: 'completed', inputSummary: 'src/billing.ts', output: 'export function total(...) { ... }', timeCreated: t + 5000, timeCompleted: t + 6200 },
          { type: 'tool', tool: 'grep', status: 'completed', inputSummary: 'calcolaImposte src/', output: 'src/billing.ts:42', timeCreated: t + 7000, timeCompleted: t + 7600 },
          { type: 'tool', tool: 'bash', status: 'running', inputSummary: 'npm test -- --watch=false', output: '', timeCreated: Date.now() - 12000, timeCompleted: null },
          { type: 'text', text: 'Sto aggiornando il modulo billing e verificando i test.' },
        ],
      },
      {
        id: 'm-a2',
        role: 'assistant',
        agent: s.agent,
        model: s.model,
        timeCreated: t + 20000,
        streaming: false,
        parts: [
          { type: 'tool', tool: 'bash', status: 'error', inputSummary: 'npm run build', output: big, timeCreated: t + 21000, timeCompleted: t + 22500 },
          { type: 'step-finish', tokens: { input: 12000, output: 3400, reasoning: 900, cache: { read: 8000, write: 1200 } }, cost: 0.018 },
          { type: 'shell', state: 'exited', text: '$ npm test\n18 passing' },
          { type: 'retry', text: 'Rate limit, nuovo tentativo tra 2s' },
          { type: 'error', text: 'Upstream request failed' },
          { type: 'patch', files: [{ path: 'src/billing.ts' }, 'src/invoice.ts'] },
          { type: 'unknown' },
        ],
      },
      {
        id: 'm-c1',
        role: 'compaction',
        agent: null,
        timeCreated: t + 30000,
        parts: [{ type: 'compaction', text: 'Contesto compattato: 18 messaggi precedenti.' }],
      },
      {
        id: 'm-s1',
        role: 'synthetic',
        agent: null,
        timeCreated: t + 31000,
        parts: [{ type: 'compaction', text: 'Riepilogo sintetico della sessione.' }],
      },
      {
        id: 'm-i1',
        role: 'idle',
        agent: null,
        timeCreated: t + 32000,
        parts: [{ type: 'idle', outcome: s.status === 'failed' ? 'failed' : 'done', text: s.status === 'failed' ? 'Turno fallito' : 'Turno concluso' }],
      },
      {
        id: 'm-ms1',
        role: 'model-switched',
        agent: null,
        timeCreated: t + 33000,
        parts: [{ type: 'model-switched', text: 'gpt-4.1 → gpt-4.1-mini' }],
      },
    ];
    const todos = [];
    if (s.id === 's-work-1') {
      const defs = [
        ['Leggi il modulo billing', 'completed'],
        ['Estrai il calcolo imposte', 'completed'],
        ['Aggiorna i test unitari', 'completed'],
        ['Separa la persistenza', 'in_progress'],
        ['Aggiorna la documentazione', 'pending'],
        ['Rivedi le migrazioni', 'pending'],
        ['Pulizia finale', 'cancelled'],
      ];
      defs.forEach((d, i) => todos.push({ content: d[0], status: d[1], position: i }));
    } else {
      for (let i = 0; i < (s.todos.total || 0); i++) {
        todos.push({ content: 'Attività ' + (i + 1), status: i < s.todos.done ? 'completed' : 'pending', position: i });
      }
    }
    const totalTokens = s.tokensInput + s.tokensOutput + s.tokensReasoning + s.tokensCacheRead + s.tokensCacheWrite;
    const cacheRate = s.tokensCacheRead + s.tokensInput > 0
      ? Math.round(s.tokensCacheRead / (s.tokensCacheRead + s.tokensInput) * 100)
      : 0;
    return clone(Object.assign({}, s, {
      estRates: { input: 2.5, output: 10, cache_read: 0.25, cache_write: 3.15 },
      totalTokens,
      cacheRate,
      fullPrompt: s.firstUserPrompt || '',
      todos,
      children: s.id === 's-work-1' ? [{ id: 's-child-1', title: 'Sub-agent: analisi test' }] : [],
      messages,
    }));
  }

  function makeES() {
    const listeners = new Map();
    let closed = false;
    const es = {
      onmessage: null,
      onerror: null,
      onopen: null,
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        const set = listeners.get(type);
        if (set) set.delete(fn);
      },
      close() {
        closed = true;
        live.streams.delete(es);
        if (es._timer) clearInterval(es._timer);
      },
    };
    es._dispatch = (type, data) => {
      if (closed) return;
      const ev = { type, data: JSON.stringify(data) };
      const set = listeners.get(type);
      if (set) for (const fn of [...set]) fn(ev);
      if (type === 'message' && typeof es.onmessage === 'function') es.onmessage(ev);
    };
    live.streams.add(es);
    return es;
  }

  function failingStream() {
    const es = makeES();
    setTimeout(() => {
      if (typeof es.onerror === 'function') es.onerror({});
    }, 50);
    return es;
  }

  function stream(path) {
    if (path.indexOf('/api/stream') === 0) {
      if (live.dropped) return failingStream();
      const es = makeES();
      live.main = es;
      setTimeout(() => {
        if (live.dropped) {
          if (typeof es.onerror === 'function') es.onerror({});
          return;
        }
        es._dispatch('connected', { ok: true });
        es._dispatch('overview', overviewData());
      }, 30);
      return es;
    }
    if (path.indexOf('/api/alerts') === 0) {
      const es = makeES();
      live.alerts = es;
      const send = () => es._dispatch('alert', alertItem());
      setTimeout(send, 60);
      es._timer = setInterval(send, 15000);
      return es;
    }
    if (path.indexOf('/api/log-stream') === 0) {
      const es = makeES();
      let n = 0;
      setTimeout(() => es._dispatch('message', { type: 'connected' }), 40);
      es._timer = setInterval(() => {
        if (live.paused) return;
        es._dispatch('message', Object.assign({ type: 'line' }, logLine(n++ % 30)));
      }, 2000);
      return es;
    }
    return makeES();
  }

  async function get(path) {
    await null;
    const raw = String(path || '');
    const q = raw.indexOf('?');
    const p = q < 0 ? raw : raw.slice(0, q);
    const qs = new URLSearchParams(q < 0 ? '' : raw.slice(q + 1));
    if (p === '/api/overview') return clone(sessions);
    if (p === '/api/activity') {
      const since = Number(qs.get('since')) || 0;
      return clone(activity.filter(it => since <= 0 || it.timeUpdated >= since));
    }
    if (p === '/api/session') {
      const d = detailFor(qs.get('id') || '');
      if (!d) throw httpError(404);
      return d;
    }
    if (p === '/api/processes') return clone(processes);
    if (p === '/api/locks') return [];
    if (p === '/api/service') return clone(service);
    if (p === '/api/health') return { ok: true, db: true };
    if (p === '/api/alerts') return [alertItem()];
    if (p === '/api/log-archive') {
      const max = Number(qs.get('maxLines')) || 200;
      return clone(logLines.slice(-max));
    }
    throw httpError(404);
  }

  function pushActivity(item) {
    activity.push(item);
    while (activity.length > 400) activity.shift();
  }

  function emit(type, data) {
    if (type === 'part' && data) pushActivity(clone(data));
    const es = type === 'alert' ? live.alerts : live.main;
    if (!es) return;
    if (type === 'overview') es._dispatch('overview', data || overviewData());
    else es._dispatch(type, data);
  }

  function tick() {
    if (live.paused) return;
    const now = Date.now();
    live.tick++;

    const w1 = sessions.find(x => x.id === 's-work-1');
    const toolStates = ['pending', 'running', 'completed'];
    if (live.toolStep >= toolStates.length) {
      live.toolStep = 0;
      live.toolId++;
      live.toolCreated = now;
    }
    const st = toolStates[live.toolStep++];
    const part = {
      id: 'evt-tool-' + live.toolId,
      sessionId: w1.id,
      sessionTitle: w1.title,
      timeCreated: live.toolCreated,
      timeUpdated: now,
      partType: 'tool',
      tool: 'bash',
      status: st,
      streaming: false,
      summary: 'bash: npm test -- --watch=false',
    };
    w1.lastActivity = { type: 'tool', tool: 'bash', status: st, summary: 'npm test -- --watch=false' };
    pushActivity(part);
    if (live.main) live.main._dispatch('part', part);

    const w2 = sessions.find(x => x.id === 's-work-2');
    live.textLen += 24;
    const textPart = {
      id: 'evt-text-2',
      sessionId: w2.id,
      sessionTitle: w2.title,
      timeCreated: T0 - 15 * 60e3,
      timeUpdated: now,
      partType: 'text',
      streaming: true,
      summary: 'Analisi dei listini in corso: ' + 'dettaglio '.repeat(Math.min(40, live.textLen / 12)).trim(),
    };
    w2.lastActivity = { type: 'text', status: undefined, summary: textPart.summary };
    pushActivity(textPart);
    if (live.main) live.main._dispatch('part', textPart);

    if (live.main) live.main._dispatch('overview', overviewData());
  }

  setInterval(tick, 1500);

  function drop() {
    live.dropped = true;
    const es = live.main;
    if (es && typeof es.onerror === 'function') es.onerror({});
  }

  function restore() {
    live.dropped = false;
  }

  function pause() {
    live.paused = true;
  }

  function resume() {
    live.paused = false;
  }

  function burst(n, perSec) {
    n = Math.max(0, Number(n) || 0);
    const rate = Math.max(0.2, Number(perSec) || 5);
    const step = Math.max(40, Math.round(1000 / rate));
    let i = 0;
    const timer = setInterval(() => {
      if (i >= n) {
        clearInterval(timer);
        live.burstTimers.delete(timer);
        return;
      }
      const s = sessions[i % sessions.length];
      const now = Date.now();
      const item = {
        id: 'evt-burst-' + now + '-' + i,
        sessionId: s.id,
        sessionTitle: s.title,
        timeCreated: now,
        timeUpdated: now,
        partType: i % 2 ? 'text' : 'tool',
        tool: i % 2 ? undefined : TOOLS[i % TOOLS.length],
        status: 'completed',
        streaming: false,
        summary: 'Evento simulato ' + (i + 1),
      };
      emit('part', item);
      i++;
    }, step);
    live.burstTimers.add(timer);
  }

  function setStatus(id, status) {
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    s.status = status;
    s.timeUpdated = Date.now();
    if (status === 'failed') {
      s.idleOutcome = 'failed';
      s.lastActivity = { type: 'idle', status: 'failed', summary: 'Upstream request failed: Endpoint is unavailable.' };
    } else if (status === 'stuck') {
      s.lastActivity = { type: 'tool', tool: 'edit', status: 'running', summary: 'main.tf' };
    }
    emit('overview', overviewData());
  }

  window.__ocmock = { emit, drop, restore, pause, resume, burst, setStatus };

  return { get, stream, fixture: { sessions, service, processes } };
}

// ---- 4. state ----

const S = {
  sessions: new Map(),
  processes: [],
  service: null,
  cost24h: 0,
  estCost24h: 0,
  loaded: false,
  lastOverviewAt: 0,
  selectedId: null,
  filter: 'all',
  search: '',
  showSub: false,
};

const feed = { byId: new Map(), pending: new Map(), timer: 0, paused: false, newCount: 0 };

const D = {
  id: null,
  data: null,
  ctrl: null,
  inflight: false,
  again: false,
  timer: 0,
  debounce: 0,
  keys: new Map(),
  limit: 400,
  stick: false,
  pushed: false,
};

const L = {
  byId: new Map(),
  buf: [],
  timer: 0,
  paused: false,
  newCount: 0,
  level: 'all',
  search: '',
  started: false,
  count: 0,
  es: null,
};

const A = { byKey: new Map(), dismissed: new Map(), timer: 0 };

const C = { es: null, failures: 0, timer: 0, nextAt: 0, lastPartTs: 0, poll: 0 };

// ---- 5. connection ----

function connect() {
  setConn('connecting');
  const es = api.stream('/api/stream');
  C.es = es;

  es.addEventListener('connected', () => {
    const wasDown = C.failures > 0;
    C.failures = 0;
    setConn('live');
    stopPolling();
    if (wasDown) {
      announce('Connessione ripristinata');
      backfillActivity();
    }
  });

  es.addEventListener('overview', e => {
    const d = parseJSON(e.data);
    if (d) onOverview(d);
  });

  es.addEventListener('part', e => {
    const p = parseJSON(e.data);
    if (p && p.id) onPart(p);
  });

  es.onerror = () => {
    if (C.es !== es) return;
    es.close();
    C.es = null;
    C.failures++;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(C.failures - 1, 5)) + Math.floor(Math.random() * 500);
    C.nextAt = Date.now() + delay;
    setConn(C.failures >= 3 ? 'offline' : 'retry');
    if (C.failures === 1) announce('Connessione persa, riprovo');
    startPolling();
    clearTimeout(C.timer);
    C.timer = setTimeout(connect, delay);
  };
}

// Fallback polling while the SSE channel is down (§5.2).
async function pollOnce() {
  const [ov, pr, sv] = await Promise.allSettled([
    api.get('/api/overview'),
    api.get('/api/processes'),
    api.get('/api/service'),
  ]);
  if (ov.status === 'fulfilled') {
    const sessions = Array.isArray(ov.value) ? ov.value : (ov.value && ov.value.sessions) || [];
    onOverview({
      sessions,
      processes: pr.status === 'fulfilled' ? pr.value : undefined,
      service: sv.status === 'fulfilled' ? sv.value : undefined,
      cost24h: S.cost24h,
      estCost24h: S.estCost24h,
    });
  }
  try {
    const items = await api.get('/api/activity?since=' + Math.max(0, C.lastPartTs - 2000));
    if (Array.isArray(items) && items.length) applyFeed(items, { live: true });
  } catch {
    // keep the last known feed: a failed poll never clears data
  }
}

function startPolling() {
  if (C.poll) return;
  pollOnce();
  C.poll = setInterval(pollOnce, 5000);
}

function stopPolling() {
  if (C.poll) clearInterval(C.poll);
  C.poll = 0;
}

// ---- 6. header ----

// Counts shared by the header, the page title, the favicon and the standby card.
function statusCounts() {
  let working = 0;
  let failed = 0;
  let stuck = 0;
  for (const s of S.sessions.values()) {
    if (s.status === 'working') working++;
    else if (s.status === 'failed') failed++;
    else if (s.status === 'stuck') stuck++;
  }
  return { working, failed, stuck, attention: failed + stuck };
}

function renderHeader() {
  const c = statusCounts();
  const setKpi = (id, n) => {
    const el = document.getElementById(id);
    setText(el, n);
    setAttr(el, 'data-zero', n === 0);
  };
  setKpi('kpi-working', c.working);
  setKpi('kpi-attention', c.attention);
  setKpi('kpi-procs', S.processes.length);
  setAttr($('#kpi-btn-attention'), 'data-alert', c.failed > 0 ? 'alarm' : c.stuck > 0 ? 'warn' : null);
  setText($('#kpi-cost'), fmtCost(S.cost24h));
  setText($('#kpi-est'), '~' + fmtCost(S.estCost24h));
  setAttr($('#brand-lamp'), 'data-lamp', c.working > 0 ? 'working' : c.attention > 0 ? 'failed' : 'idle');
  renderSvc();
}

// The countdown is derived from C.nextAt, so calling setConn(C.state) each second keeps it live.
function setConn(state) {
  const el = $('#conn');
  if (!el) return;
  C.state = state;
  const now = Date.now();
  const left = Math.max(0, Math.ceil((C.nextAt - now) / 1000));
  const age = S.lastOverviewAt ? Math.max(0, Math.floor((now - S.lastOverviewAt) / 1000)) : 0;
  let data = 'connecting';
  let label = TXT.conn.connecting;
  let title = 'Connessione SSE in corso';
  if (state === 'live') {
    data = 'live';
    label = TXT.conn.live;
    title = 'Connessione SSE attiva';
  } else if (state === 'stale') {
    data = 'stale';
    label = TXT.conn.stale;
    title = 'Ultimo aggiornamento ' + age + 's fa';
  } else if (state === 'retry') {
    data = 'retry';
    label = TXT.conn.retry.replace('{n}', left);
    title = 'Ultimo aggiornamento ' + age + 's fa, riprovo tra ' + left + 's';
  } else if (state === 'offline') {
    data = 'offline';
    label = TXT.conn.offline.replace('{n}', left);
    title = 'Offline da ' + age + 's, riprovo tra ' + left + 's';
  }
  setAttr(el, 'data-state', data);
  setAttr(el.querySelector('.lamp'), 'data-lamp', data === 'live' ? 'active' : data === 'offline' ? 'failed' : 'pending');
  setText($('#conn-txt'), label);
  el.title = title;
}

function hasSuspendedSession() {
  for (const s of S.sessions.values()) if (s.status === 'suspended') return true;
  return false;
}

function renderSvc() {
  const el = $('#svc');
  if (!el) return;
  const svc = S.service;
  let state = 'unknown';
  if (svc) state = svc.alive ? 'alive' : hasSuspendedSession() ? 'down' : 'off';
  setAttr(el, 'data-state', state);
  setAttr(el.querySelector('.lamp'), 'data-lamp', state === 'alive' ? 'active' : state === 'off' ? 'pending' : state === 'down' ? 'failed' : 'idle');
  setText($('#svc-txt'), TXT.svc[state]);
  el.title = svc ? 'opencode ' + (svc.version || '?') + ' · ' + (svc.url || '?') + ' · pid ' + (svc.pid || '?') : '';
}

let favColour = '';

function renderTitleAndFavicon() {
  const c = statusCounts();
  const bits = [];
  if (c.working) bits.push('▶' + c.working);
  if (c.attention) bits.push('!' + c.attention);
  document.title = (bits.length ? '(' + bits.join(' ') + ') ' : '') + 'opencode mc';

  const colour = c.attention > 0 ? '#FF6B57' : c.working > 0 ? '#B8FFD0' : '#3E7D5A';
  if (colour === favColour) return;
  favColour = colour;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">'
    + '<rect width="16" height="16" fill="#060B08"/>'
    + '<circle cx="8" cy="8" r="4" fill="' + colour + '"/></svg>';
  const link = document.getElementById('favicon');
  if (link) link.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(svg));
}

// ---- 7. sessions ----

S.dbError = S.dbError === true;
S.netError = S.netError === true;

const GROUP_ORDER = ['working', 'attention', 'recent', 'suspended', 'idle'];

const FILTER_TEST = {
  all: () => true,
  working: s => s.status === 'working',
  attention: s => s.status === 'failed' || s.status === 'stuck',
  recent: s => s.status === 'active',
  rest: s => s.status === 'idle' || s.status === 'suspended',
};

const rowEls = new Map();
const groupEls = new Map();

// Overview handler (§5.4): diff by id, toast on real transitions, render the modules.
function onOverview(d) {
  if (!d) return;
  S.lastOverviewAt = Date.now();
  if (C.es) setConn('live');

  const list = Array.isArray(d.sessions) ? d.sessions : [];
  const next = new Map();
  for (const s of list) if (s && s.id) next.set(s.id, s);
  if (S.loaded) detectTransitions(S.sessions, next);
  S.sessions = next;
  S.loaded = true;
  S.netError = false;

  if (Array.isArray(d.processes)) S.processes = d.processes;
  if (d.service) S.service = d.service;
  if (typeof d.cost24h === 'number') S.cost24h = d.cost24h;
  if (typeof d.estCost24h === 'number') S.estCost24h = d.estCost24h;

  renderHeader();
  renderSessions();
  if (typeof renderStandby === 'function') renderStandby();
  if (typeof renderSystem === 'function') renderSystem();
  if (typeof syncDetailFromOverview === 'function') syncDetailFromOverview();
  renderTitleAndFavicon();
}

function matchesSearch(s, q) {
  if (!q) return true;
  const fields = [s.title, s.firstUserPrompt, s.directory, s.id, s.model, s.agent, s.provider];
  return fields.some(v => String(v == null ? '' : v).toLowerCase().includes(q));
}

function isChildSession(s) {
  return !!(s && s.parentId && S.sessions.has(s.parentId));
}

function renderChips(list) {
  for (const f of FILTERS) {
    const n = list.filter(FILTER_TEST[f.key]).length;
    const chip = $('.fchip[data-filter="' + f.key + '"]');
    if (!chip) continue;
    setText(chip.querySelector('.fchip-n'), n);
    setAttr(chip, 'aria-pressed', S.filter === f.key ? 'true' : 'false');
    setAttr(chip, 'aria-label', null);
    if (f.key === 'attention') setAttr(chip, 'data-alert', n > 0);
  }
}

function resetSessionsFilter() {
  S.filter = 'all';
  S.search = '';
  const input = $('#search');
  if (input) input.value = '';
  for (const chip of $$('.fchip')) setAttr(chip, 'aria-pressed', chip.dataset.filter === 'all' ? 'true' : 'false');
  renderSessions();
}

function renderSessions() {
  const ul = $('#session-list');
  if (!ul) return;

  const q = S.search.trim().toLowerCase();
  const all = [...S.sessions.values()];
  const searched = q ? all.filter(s => matchesSearch(s, q)) : all;

  renderChips(searched);
  setText($('#sessions-count'), all.length);

  const test = FILTER_TEST[S.filter] || FILTER_TEST.all;
  const eligible = searched.filter(test);

  // A child is nested under its parent when the parent is in the list, else it is a normal row.
  const nested = new Map();
  const rows = [];
  for (const s of eligible) {
    const hasParent = s.parentId && S.sessions.has(s.parentId);
    if (!hasParent) {
      rows.push(s);
      continue;
    }
    const hot = s.status === 'working' || s.status === 'failed' || s.status === 'stuck';
    if (!S.showSub && !hot && !q) continue;
    if (!nested.has(s.parentId)) nested.set(s.parentId, []);
    nested.get(s.parentId).push(s);
  }
  const topIds = new Set(rows.map(s => s.id));
  for (const [pid, kids] of nested) {
    if (topIds.has(pid)) continue;
    for (const k of kids) rows.push(k);
  }

  const groups = new Map();
  for (const s of rows) {
    const key = (STATUS[s.status] || STATUS.idle).group;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const desired = [];
  let count = 0;
  for (const key of GROUP_ORDER) {
    const list = groups.get(key);
    if (!list || !list.length) continue;
    list.sort(key === 'working'
      ? (a, b) => normTs(b.timeCreated) - normTs(a.timeCreated)
      : (a, b) => normTs(b.timeUpdated) - normTs(a.timeUpdated));
    const entries = [];
    for (const s of list) {
      entries.push({ kind: 's', s, child: isChildSession(s) });
      const kids = nested.get(s.id) || [];
      kids.sort((a, b) => normTs(a.timeCreated) - normTs(b.timeCreated));
      for (const k of kids) entries.push({ kind: 's', s: k, child: true });
    }
    if (S.filter === 'all') desired.push({ kind: 'g', key, n: entries.length });
    for (const e of entries) desired.push(e);
    count += entries.length;
  }

  let i = 0;
  const usedGroups = new Set();
  for (const item of desired) {
    let li;
    if (item.kind === 'g') {
      usedGroups.add(item.key);
      li = groupLi(item);
    } else {
      li = rowLi(item.s, item.child);
    }
    if (!li) continue;
    if (ul.children[i] !== li) ul.insertBefore(li, ul.children[i] || null);
    i++;
  }
  while (ul.children.length > i) ul.lastElementChild.remove();

  // Rows of sessions that left the overview are dropped from the cache.
  for (const [id, li] of rowEls) {
    if (!S.sessions.has(id)) {
      rowEls.delete(id);
      li.remove();
    }
  }
  for (const [key, li] of groupEls) {
    if (!usedGroups.has(key)) {
      groupEls.delete(key);
      li.remove();
    }
  }

  if (!S.loaded) sessionsState('loading', TXT.loading, '', null);
  else if (S.dbError || S.db === false) sessionsState('error', TXT.errors.dbTitle, TXT.errors.dbText, null);
  else if (S.netError) sessionsState('error', TXT.errors.network, '', null);
  else if (!count && all.length === 0) sessionsState('empty', TXT.empty.sessions, '', null);
  else if (!count) sessionsState('empty', TXT.empty.filtered, '', { label: TXT.empty.showAll, run: resetSessionsFilter });
  else sessionsState(null);
}

function sessionsState(kind, title, message, action) {
  const el = $('#sessions-state');
  if (!el) return;
  if (!kind) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  setAttr(el, 'data-kind', kind);
  stateTitle(el.querySelector('.state-k'), title, kind === 'loading');
  setText(el.querySelector('.state-msg'), message || '');
  const act = el.querySelector('.state-act');
  if (!act) return;
  act.hidden = !action;
  if (action) {
    setText(act, action.label);
    act.onclick = action.run;
  } else {
    act.onclick = null;
  }
}

// Loading keeps the cursor span of the markup.
function stateTitle(el, text, cursor) {
  if (!el) return;
  const has = !!el.querySelector('.cursor');
  if (el.textContent === text && has === cursor) return;
  el.replaceChildren(document.createTextNode(text));
  if (cursor) {
    const span = document.createElement('span');
    span.className = 'cursor';
    el.appendChild(span);
  }
}

function groupLi(item) {
  let li = groupEls.get(item.key);
  if (!li) {
    li = tpl('tpl-sgroup');
    if (!li) return null;
    groupEls.set(item.key, li);
  }
  setText(li.querySelector('.sgroup-h'), TXT.groups[item.key] + ' · ' + item.n);
  return li;
}

function rowLi(s, child) {
  let li = rowEls.get(s.id);
  if (!li) {
    li = tpl('tpl-srow');
    if (!li) return null;
    rowEls.set(s.id, li);
  }
  patchRow(li, s, child);
  return li;
}

function setRowTime(el, ms) {
  if (!el) return;
  const n = Number(ms) || 0;
  setText(el, n ? relTime(n) : '—');
  if (n) {
    el.dataset.ts = String(n);
    el.dateTime = new Date(n).toISOString();
    el.title = new Date(n).toLocaleString('it-IT');
  } else {
    delete el.dataset.ts;
    el.removeAttribute('datetime');
    el.removeAttribute('title');
  }
}

function workingChildren(id) {
  let n = 0;
  for (const s of S.sessions.values()) if (s.parentId === id && s.status === 'working') n++;
  return n;
}

// lastActivity line (§4.6).
function liveInfo(s) {
  const a = s.lastActivity;
  if (!a) return { icon: 'idle', family: 'idle', text: 'nessuna attività', problem: null };
  const summary = String(a.summary == null ? '' : a.summary);
  switch (a.type) {
    case 'tool': {
      const name = String(a.tool || 'tool');
      let text = summary || name;
      if (!text.toLowerCase().startsWith(name.toLowerCase() + ':')) text = name + ': ' + text;
      if (a.status === 'pending') text += ' · in coda';
      if (a.status === 'error') text += ' · errore';
      return { icon: iconFor(a), family: toolFamily(a.tool), text, problem: a.status === 'error' ? 'error' : null };
    }
    case 'text':
      return { icon: 'text', family: 'text', text: summary, problem: null };
    case 'reasoning':
      return { icon: 'reasoning', family: 'reason', text: 'Ragionamento…', problem: null };
    case 'user':
      return { icon: 'user', family: 'user', text: summary ? 'prompt: ' + summary : 'prompt', problem: null };
    case 'shell':
      return { icon: 'exec', family: 'exec', text: summary, problem: null };
    case 'compaction':
      return { icon: 'compaction', family: 'note', text: 'Contesto compattato', problem: null };
    case 'idle':
      return a.status === 'failed'
        ? { icon: 'error', family: 'error', text: summary || 'Turno fallito', problem: 'error' }
        : { icon: 'idle', family: 'idle', text: summary || 'Turno concluso', problem: null };
    case 'retry':
      return { icon: 'retry', family: 'warn', text: summary || 'retry', problem: 'warn' };
    case 'error':
      return { icon: 'error', family: 'error', text: summary || 'Errore', problem: 'error' };
    default:
      return { icon: 'idle', family: 'idle', text: summary || 'nessuna attività', problem: null };
  }
}

function costSuffix(s) {
  switch (s.estSource) {
    case 'exact': return ' (= reale)';
    case 'paid-twin': return ' (listino ' + (s.estPricedAs || '?') + ')';
    case 'other-provider': return ' (listino altro provider: ' + (s.estPricedAs || '?') + ')';
    default: return ' (non stimabile)';
  }
}

// `.cost` fragment of a session row (§4.8).
function renderCost(el, s) {
  if (!el) return;
  const real = Number(s.cost) || 0;
  const est = Number(s.estCost) || 0;
  const showEst = est > 0 && s.estSource !== 'exact';
  const realEl = el.querySelector('.cost-real');
  setText(realEl, fmtCost(real));
  setAttr(realEl, 'data-zero', real === 0);
  const estEl = el.querySelector('.cost-est');
  if (estEl) estEl.hidden = !showEst;
  // Hidden estimates are cleared so the row text never carries a stray "~".
  setText(el.querySelector('.cost-est-v'), showEst ? '~' + fmtCost(est) : '');
  el.title = 'Reale ' + fmtCost(real) + ' · Stima ~' + fmtCost(est) + costSuffix(s);
}

function renderRail(railEl, txtEl, todos) {
  const done = Math.max(0, Number(todos && todos.done) || 0);
  const total = Math.max(0, Number(todos && todos.total) || 0);
  if (railEl) {
    railEl.style.setProperty('--done', String(done));
    railEl.style.setProperty('--total', String(total));
    setAttr(railEl, 'data-many', total > 24);
    setAttr(railEl, 'data-complete', total > 0 && done >= total);
  }
  if (txtEl) {
    const n = txtEl.querySelector('.rail-n');
    if (n) setText(n, done + '/' + total);
    else setText(txtEl, done + ' di ' + total + ' completati');
  }
  return total > 0 && done >= total;
}

function patchRow(li, s, child) {
  const btn = li.firstElementChild;
  if (!btn) return;
  const meta = STATUS[s.status] || STATUS.idle;
  setAttr(btn, 'data-status', s.status || 'idle');
  setAttr(btn, 'data-session-id', s.id);
  setAttr(btn, 'aria-current', S.selectedId === s.id ? 'true' : null);
  btn.classList.toggle('is-child', !!child);

  setAttr(btn.querySelector('.lamp'), 'data-lamp', meta.lamp);
  setText(btn.querySelector('.srow-status'), meta.label);

  const dir = btn.querySelector('.srow-dir');
  setText(dir, basename(s.directory));
  setAttr(dir, 'title', s.directory || null);
  setRowTime(btn.querySelector('.srow-time'), normTs(s.timeUpdated) || normTs(s.timeCreated));
  setText(btn.querySelector('.srow-title'), displayTitle(s));
  setAttr(btn, 'title', s.firstUserPrompt ? clip(s.firstUserPrompt, 300) : null);

  const info = liveInfo(s);
  const live = btn.querySelector('.srow-live');
  setAttr(live, 'data-family', info.family);
  setAttr(live, 'data-problem', info.problem);
  setIcon(live.querySelector('svg'), info.icon);
  const liveTxt = live.querySelector('.srow-live-txt');
  setText(liveTxt, info.text);
  liveTxt.classList.toggle('cursor', s.status === 'working');

  const rail = btn.querySelector('.rail');
  const railTxt = btn.querySelector('.rail-txt');
  const total = Number(s.todos && s.todos.total) || 0;
  if (rail) rail.hidden = total === 0;
  if (railTxt) railTxt.hidden = total === 0;
  if (total) renderRail(rail, railTxt, s.todos);

  setText(btn.querySelector('.srow-model'), s.model || '—');
  const sub = btn.querySelector('.srow-sub');
  const kids = workingChildren(s.id);
  if (sub) {
    sub.hidden = kids === 0;
    setText(sub, kids + ' sub-agent');
  }

  renderCost(btn.querySelector('.cost'), s);
}

// One-shot effects (§6): only for live transitions, never with reduced motion, never off-screen.
function fx(id, kind) {
  if (RM.matches || document.visibilityState !== 'visible') return;
  const li = rowEls.get(id);
  if (!li) return;
  const target = kind === 'done' ? li.querySelector('.srow') : li.querySelector('.rail');
  if (!target) return;
  const cls = kind === 'done' ? 'fx-done' : 'fx-full';
  target.classList.remove(cls);
  requestAnimationFrame(() => target.classList.add(cls));
  let timer = 0;
  const clean = () => {
    clearTimeout(timer);
    target.classList.remove(cls);
  };
  timer = setTimeout(clean, 700);
  target.addEventListener('animationend', clean, { once: true });
}

function notifyLater(sev, text, id) {
  if (typeof notify === 'function') notify(sev, text, id);
  else if (typeof announce === 'function') announce(text);
}

function detectTransitions(prev, next) {
  let workingBefore = 0;
  for (const s of prev.values()) if (s.status === 'working') workingBefore++;
  let workingAfter = 0;
  for (const s of next.values()) if (s.status === 'working') workingAfter++;

  for (const [id, s] of next) {
    const p = prev.get(id);
    if (!p) continue;
    const title = displayTitle(s);
    if (p.status !== s.status) {
      if (s.status === 'failed') notifyLater('alarm', TXT.toasts.failed.replace('{title}', title), id);
      else if (s.status === 'stuck') notifyLater('warn', TXT.toasts.stuck.replace('{title}', title), id);
      else if (p.status === 'working' && (s.status === 'active' || s.status === 'idle')) {
        notifyLater('ok', TXT.toasts.done.replace('{title}', title), id);
        fx(id, 'done');
      }
    }
    const pd = Number(p.todos && p.todos.done) || 0;
    const pt = Number(p.todos && p.todos.total) || 0;
    const nd = Number(s.todos && s.todos.done) || 0;
    const nt = Number(s.todos && s.todos.total) || 0;
    if (pt > 0 && pd < pt && nt > 0 && nd >= nt) {
      fx(id, 'full');
      notifyLater('ok', TXT.toasts.todos.replace('{title}', title), id);
    }
  }

  if (workingBefore > 0 && workingAfter === 0 && typeof standby !== 'undefined') standby.condense();
}

// ---- 8. standby ----

// Canvas engine of §4.17. Particles are real sessions updated in the last 24 h.
const standby = {
  canvas: null,
  ctx: null,
  parts: [],
  w: 0,
  h: 0,
  raf: 0,
  running: false,
  last: 0,
  onScreen: true,
  condenseAt: 0,
  palette: null,

  paletteOf() {
    if (standby.palette) return standby.palette;
    const cs = getComputedStyle(document.documentElement);
    const read = (name, fallback) => {
      const v = cs.getPropertyValue(name).trim();
      return v || fallback;
    };
    standby.palette = {
      mid: read('--ph-mid', '#6FB98E'),
      alarm: read('--alarm', '#FF6B57'),
      amber: read('--amber', '#F2B33D'),
      bone: read('--c-bone', '#F4F1E8'),
      lo: read('--ph-lo', '#3E7D5A'),
    };
    return standby.palette;
  },

  colourFor(status) {
    const p = standby.paletteOf();
    if (status === 'failed') return p.alarm;
    if (status === 'stuck') return p.amber;
    if (status === 'suspended') return p.bone;
    if (status === 'active' || status === 'idle') return p.mid;
    return p.lo;
  },

  init() {
    if (standby.canvas) return !!standby.ctx;
    const canvas = $('#standby-canvas');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    standby.canvas = canvas;
    standby.ctx = ctx;
    standby.measure();
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => standby.measure());
      ro.observe(canvas);
    }
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver(entries => {
        standby.onScreen = entries.some(e => e.isIntersecting);
        standby.refresh();
      }, { threshold: 0 });
      io.observe(canvas);
    }
    return true;
  },

  // DPR-safe sizing; canvas.width resets the transform, so it is set right after.
  measure() {
    const canvas = standby.canvas;
    if (!canvas || !standby.ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(rect.width * dpr);
    const h = Math.round((rect.height || 72) * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    standby.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    standby.w = rect.width;
    standby.h = rect.height || 72;
    standby.draw();
  },

  sync(list) {
    if (!standby.init()) return;
    const next = [];
    for (const s of list) {
      let p = standby.parts.find(x => x.id === s.id);
      if (!p) {
        p = {
          id: s.id,
          a: Math.random() * Math.PI * 2,
          w: (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.13),
          r: 0.25 + Math.random() * 0.75,
          c: '',
          size: 2,
        };
      }
      p.c = standby.colourFor(s.status);
      p.size = s.status === 'failed' ? 3 : 2;
      next.push(p);
    }
    standby.parts = next;
    standby.draw();
  },

  draw() {
    const ctx = standby.ctx;
    if (!ctx || !standby.w || !standby.h) return;
    let k = 1;
    if (standby.condenseAt) {
      const t = (performance.now() - standby.condenseAt) / 900;
      if (t >= 1) {
        standby.condenseAt = 0;
      } else {
        const e = 1 - Math.pow(1 - Math.max(0, t), 3);
        k = 1 + 1.2 * (1 - e);
      }
    }
    const cx = standby.w / 2;
    const cy = standby.h / 2;
    const rx = Math.max(1, standby.w / 2 - 6);
    const ry = Math.max(1, standby.h / 2 - 6);
    ctx.clearRect(0, 0, standby.w, standby.h);
    for (const p of standby.parts) {
      const x = cx + Math.cos(p.a) * rx * p.r * k;
      const y = cy + Math.sin(p.a) * ry * p.r * k;
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(x), Math.round(y), p.size, p.size);
    }
  },

  frame(ts) {
    if (!standby.running) return;
    standby.raf = requestAnimationFrame(standby.frame);
    if (standby.last && ts - standby.last < 33) return;
    const dt = standby.last ? Math.min(120, ts - standby.last) : 0;
    standby.last = ts;
    for (const p of standby.parts) p.a += p.w * (dt / 1000);
    standby.draw();
  },

  start() {
    if (!standby.init()) return;
    standby.measure();
    if (RM.matches) return;
    if (standby.running) return;
    if (document.visibilityState !== 'visible' || !standby.onScreen) return;
    standby.running = true;
    standby.last = 0;
    standby.raf = requestAnimationFrame(standby.frame);
  },

  stop() {
    if (standby.raf) cancelAnimationFrame(standby.raf);
    standby.raf = 0;
    standby.running = false;
    standby.last = 0;
  },

  refresh() {
    const card = $('#standby');
    const active = !!card && !card.hidden && document.visibilityState === 'visible' && standby.onScreen;
    if (active) standby.start();
    else standby.stop();
  },

  condense() {
    if (RM.matches) {
      standby.draw();
      return;
    }
    standby.condenseAt = performance.now();
    standby.start();
  },
};

function renderStandby() {
  const card = $('#standby');
  if (!card) return;
  const now = Date.now();
  const list = [...S.sessions.values()]
    .filter(s => {
      const ts = normTs(s.timeUpdated);
      return ts > 0 && now - ts <= 86400e3;
    })
    .slice(0, 120);
  const failed = list.filter(s => s.status === 'failed').length;
  setText($('#standby-sum'), list.length + ' sessioni in 24h · ' + failed + ' fallite · '
    + fmtCost(S.cost24h) + ' reale · ~' + fmtCost(S.estCost24h) + ' stima');

  const anyWorking = [...S.sessions.values()].some(s => s.status === 'working');
  const show = S.loaded && !anyWorking && S.sessions.size > 0;
  card.hidden = !show;
  standby.sync(list);
  if (show) standby.start();
  else standby.stop();
}

document.addEventListener('visibilitychange', () => standby.refresh());

// ---- 9. feed ----

feed.filter = 'all';
feed.steps = false;
feed.loaded = false;

let feedRaf = 0;

// Sort key for a part: creation time, unless it is missing or far from the update.
function sortTs(it) {
  const created = normTs(it && it.timeCreated);
  const updated = normTs(it && it.timeUpdated);
  if (!created || Math.abs(updated - created) > 86400e3) return updated || created;
  return created;
}

function itemProblem(it) {
  const type = (it && (it.partType || it.type)) || '';
  const status = (it && it.status) || '';
  const summary = String((it && it.summary) || '');
  if (status === 'error' || status === 'failed' || /^(errore|fallita)/i.test(summary)) return 'error';
  if (status === 'retry' || type === 'retry') return 'warn';
  return null;
}

function itemState(it) {
  if (it && it.status && ACT[it.status]) return ACT[it.status];
  if (it && it.streaming) return ACT.running;
  return null;
}

function feedMatches(it) {
  if (feed.filter === 'tool') return (it.partType || it.type) === 'tool';
  if (feed.filter === 'problems') return !!itemProblem(it);
  return true;
}

// Rows are newest first: the first row older than `ts` is the insertion point.
function insertByTs(list, el, ts) {
  for (let row = list.firstElementChild; row; row = row.nextElementSibling) {
    if ((Number(row.dataset.order) || 0) < ts) {
      list.insertBefore(el, row);
      return;
    }
  }
  list.appendChild(el);
}

function updateCont(row) {
  if (!row) return;
  const prev = row.previousElementSibling;
  row.classList.toggle('is-cont', !!prev && prev.dataset.session === row.dataset.session);
}

function flashFrow(el) {
  if (!el || RM.matches) return;
  el.classList.remove('is-new');
  requestAnimationFrame(() => {
    el.classList.add('is-new');
    el.addEventListener('animationend', () => el.classList.remove('is-new'), { once: true });
  });
}

function showNewPill() {
  const pill = $('#new-pill');
  const sc = $('#feed-scroll');
  if (!pill) return;
  if (feed.paused || !feed.newCount || !sc || sc.scrollTop <= 24) {
    pill.hidden = true;
    return;
  }
  setText(pill, TXT.pills.newer.replace('{n}', feed.newCount));
  pill.hidden = false;
}

function updatePausePill() {
  const chip = $('#feed-pause');
  setAttr(chip, 'aria-pressed', feed.paused ? 'true' : 'false');
  setText(chip && chip.querySelector('.chip-txt'), feed.paused ? TXT.feed.resume : TXT.feed.pause);
  const pill = $('#new-pill');
  if (!pill) return;
  if (feed.paused && feed.pending.size) {
    setText(pill, TXT.pills.paused.replace('{n}', feed.pending.size));
    pill.hidden = false;
    return;
  }
  if (!feed.paused) showNewPill();
  else pill.hidden = true;
}

// Upsert-safe patch of one feed row (§4.9). Returns true when status or summary moved.
function patchFrow(el, it, prev) {
  if (!el || !it) return false;
  const type = it.partType || it.type || 'unknown';
  const family = itemFamily(it) || 'other';
  const problem = itemProblem(it);
  const ts = sortTs(it);

  el.dataset.id = it.id;
  el.dataset.session = it.sessionId || '';
  el.dataset.order = String(ts || 0);
  setAttr(el, 'data-type', type);
  setAttr(el, 'data-family', family);
  setAttr(el, 'data-status', it.status || null);
  setAttr(el, 'data-problem', problem);

  const time = el.querySelector('.frow-time');
  if (time) {
    const n = Number(ts) || 0;
    setText(time, n ? fmtClock(n) : '—');
    if (n) {
      time.dateTime = new Date(n).toISOString();
      time.title = new Date(n).toLocaleString('it-IT');
    } else {
      time.removeAttribute('datetime');
      time.removeAttribute('title');
    }
  }

  setIcon(el.querySelector('.frow-ic'), iconFor(it));

  const overview = S.sessions.get(it.sessionId);
  const title = it.sessionTitle || (overview ? displayTitle(overview) : shortId(it.sessionId));
  const sess = el.querySelector('.frow-sess');
  setText(el.querySelector('.frow-sess-txt'), title);
  setAttr(sess, 'title', title);

  const sum = String(it.summary == null ? '' : it.summary);
  const sumEl = el.querySelector('.frow-sum');
  setText(sumEl, sum);
  sumEl.classList.toggle('cursor', !!it.streaming);

  const st = itemState(it);
  setAttr(el.querySelector('.frow-state .lamp'), 'data-lamp', st ? st.lamp : 'idle');
  setText(el.querySelector('.frow-state-txt'), st ? st.label : '');

  if (!prev) return false;
  return prev.status !== it.status || prev.summary !== it.summary;
}

function updateFeedMeta() {
  const list = $('#feed-list');
  if (!list) return;
  setAttr(list, 'data-filter', feed.filter);
  setAttr(list, 'data-steps', feed.steps ? true : null);
  setText($('#feed-count'), TXT.feed.count.replace('{n}', list.children.length));

  let visible = 0;
  for (const rec of feed.byId.values()) if (feedMatches(rec.item)) visible++;

  const st = $('#feed-state');
  if (!st) return;
  if (list.children.length && visible) {
    st.hidden = true;
    return;
  }
  const loading = !feed.loaded;
  const filtered = !loading && list.children.length > 0;
  st.hidden = false;
  setAttr(st, 'data-kind', loading ? 'loading' : 'empty');
  stateTitle(st.querySelector('.state-k'), loading ? TXT.loading : filtered ? TXT.empty.activityFiltered : TXT.empty.activity, loading);
  setText(st.querySelector('.state-msg'), '');
}

// One batch: upsert by id, cap, preserve the scroll anchor (§5.3).
function applyFeed(items, opts) {
  const live = !!(opts && opts.live);
  const sc = $('#feed-scroll');
  const list = $('#feed-list');
  if (!list || !Array.isArray(items) || !items.length) {
    updateFeedMeta();
    return;
  }
  const atTop = !sc || sc.scrollTop <= 24;
  const beforeH = sc ? sc.scrollHeight : 0;
  let added = 0;

  const batch = items.slice().sort((a, b) => sortTs(a) - sortTs(b));
  for (const it of batch) {
    if (!it || !it.id) continue;
    const rec = feed.byId.get(it.id);
    if (rec) {
      const changed = patchFrow(rec.el, it, rec.item);
      rec.item = it;
      rec.el.classList.toggle('is-sel', it.sessionId === S.selectedId);
      if (changed && live) flashFrow(rec.el);
      continue;
    }
    const el = tpl('tpl-frow');
    if (!el) continue;
    patchFrow(el, it, null);
    insertByTs(list, el, sortTs(it));
    feed.byId.set(it.id, { item: it, el });
    el.classList.toggle('is-sel', it.sessionId === S.selectedId);
    updateCont(el);
    if (el.nextElementSibling) updateCont(el.nextElementSibling);
    if (live) flashFrow(el);
    added++;
  }

  while (list.children.length > FEED_MAX) {
    const last = list.lastElementChild;
    if (!last) break;
    feed.byId.delete(last.dataset.id);
    last.remove();
  }

  if (sc && !atTop && added) {
    sc.scrollTop += sc.scrollHeight - beforeH;
    feed.newCount += added;
    showNewPill();
  }
  feed.loaded = true;
  updateFeedMeta();
}

function flushFeed() {
  feed.timer = 0;
  if (feed.paused) {
    updatePausePill();
    return;
  }
  if (!feed.pending.size) return;
  const items = [...feed.pending.values()];
  feed.pending.clear();
  applyFeed(items, { live: true });
}

function onPart(item) {
  if (!item || !item.id) return;
  feed.pending.set(item.id, item);
  C.lastPartTs = Math.max(C.lastPartTs, normTs(item.timeUpdated));
  if (item.sessionId === S.selectedId) scheduleDetailRefetch();
  if (!feed.timer) feed.timer = setTimeout(() => requestAnimationFrame(flushFeed), 150);
}

// Backlog after a reconnect (§5.2): never a live flash for old rows.
async function backfillActivity() {
  const since = C.lastPartTs > 0 ? Math.max(0, C.lastPartTs - 5000) : 0;
  try {
    const items = await api.get('/api/activity?since=' + since);
    if (Array.isArray(items)) {
      feed.loaded = true;
      applyFeed(items, { live: false });
    }
  } catch {
    // keep whatever is already on screen
  }
}

function setFeedFilter(key) {
  if (key !== 'all' && key !== 'tool' && key !== 'problems') return;
  feed.filter = key;
  for (const btn of $$('.seg-btn[data-feed-filter]')) {
    setAttr(btn, 'aria-pressed', btn.dataset.feedFilter === key ? 'true' : 'false');
  }
  updateFeedMeta();
  saveFeedPrefs();
}

function setFeedSteps(on) {
  feed.steps = !!on;
  setAttr($('#steps-toggle'), 'aria-pressed', feed.steps ? 'true' : 'false');
  updateFeedMeta();
  saveFeedPrefs();
}

function setFeedPaused(on) {
  feed.paused = !!on;
  if (!feed.paused && feed.pending.size) {
    clearTimeout(feed.timer);
    feed.timer = 0;
    const items = [...feed.pending.values()];
    feed.pending.clear();
    applyFeed(items, { live: true });
  }
  updatePausePill();
}

function saveFeedPrefs() {
  let prefs = storeGet('ocmc:v1', {});
  if (!prefs || typeof prefs !== 'object') prefs = {};
  prefs.feedFilter = feed.filter;
  prefs.steps = feed.steps;
  if (typeof prefs.filter !== 'string') prefs.filter = S.filter;
  if (typeof prefs.showSub !== 'boolean') prefs.showSub = S.showSub;
  if (typeof prefs.logLevel !== 'string') prefs.logLevel = L.level;
  storeSet('ocmc:v1', prefs);
}

function applyFeedPrefs(prefs) {
  if (!prefs || typeof prefs !== 'object') return;
  if (prefs.feedFilter) setFeedFilter(prefs.feedFilter);
  if (typeof prefs.steps === 'boolean') setFeedSteps(prefs.steps);
}

function feedToTop() {
  feed.newCount = 0;
  const pill = $('#new-pill');
  if (pill) pill.hidden = true;
  const sc = $('#feed-scroll');
  if (sc) sc.scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' });
}

function onFeedScroll() {
  if (feedRaf) return;
  feedRaf = requestAnimationFrame(() => {
    feedRaf = 0;
    const sc = $('#feed-scroll');
    if (!sc || sc.scrollTop > 24) return;
    feed.newCount = 0;
    if (!feed.paused) {
      const pill = $('#new-pill');
      if (pill) pill.hidden = true;
    }
  });
}

for (const btn of $$('.seg-btn[data-feed-filter]')) {
  btn.addEventListener('click', () => setFeedFilter(btn.dataset.feedFilter));
}
const feedStepsBtn = $('#steps-toggle');
if (feedStepsBtn) feedStepsBtn.addEventListener('click', () => setFeedSteps(!feed.steps));
const feedPauseBtn = $('#feed-pause');
if (feedPauseBtn) feedPauseBtn.addEventListener('click', () => setFeedPaused(!feed.paused));
const newPillBtn = $('#new-pill');
if (newPillBtn) newPillBtn.addEventListener('click', feedToTop);
const feedScrollEl = $('#feed-scroll');
if (feedScrollEl) feedScrollEl.addEventListener('scroll', onFeedScroll, { passive: true });

updatePausePill();
updateFeedMeta();

// ---- 10. detail ----

D.token = 0;
D.fatal = false;
D.prevStatus = null;

const DETAIL_OUT_MAX = 20000;
let detailRaf = 0;

function fmtDateShort(ms) {
  const n = Number(ms) || 0;
  if (!n) return '—';
  const d = new Date(n);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
    + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function detailStatusOf() {
  if (!S.selectedId) return null;
  const s = S.sessions.get(S.selectedId);
  if (s) return s.status;
  return D.data ? D.data.status : null;
}

function renderDetailHead(s) {
  if (!s) return;
  const status = s.status || 'idle';
  const meta = STATUS[status] || STATUS.idle;
  setAttr($('#d-status-line'), 'data-status', status);
  setAttr($('#d-lamp'), 'data-lamp', meta.lamp);
  setText($('#d-status'), meta.label);

  const ts = normTs(s.timeUpdated) || normTs(s.timeCreated);
  const t = $('#d-updated');
  if (t) {
    if (ts) {
      t.dataset.ts = String(ts);
      t.dateTime = new Date(ts).toISOString();
      t.title = new Date(ts).toLocaleString('it-IT');
      setText(t, relTime(ts));
    } else {
      delete t.dataset.ts;
      t.removeAttribute('datetime');
      t.removeAttribute('title');
      setText(t, '—');
    }
  }
  setText($('#d-title'), displayTitle(s));
}

// Keeps the detail header useful before (and between) fetches.
function renderDetailPlaceholder(id) {
  setAttr($('#d-status-line'), 'data-status', null);
  setAttr($('#d-lamp'), 'data-lamp', 'idle');
  setText($('#d-status'), '');
  setText($('#d-title'), shortId(id));
  const t = $('#d-updated');
  if (t) {
    delete t.dataset.ts;
    t.removeAttribute('datetime');
    t.removeAttribute('title');
    setText(t, '—');
  }
}

function detailState(kind, title, message) {
  const el = $('#d-state');
  if (!el) return;
  if (!kind) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  setAttr(el, 'data-kind', kind);
  stateTitle(el.querySelector('.state-k'), title, kind === 'loading');
  setText(el.querySelector('.state-msg'), message || '');
}

function kvEnsure(dl, key, label) {
  let row = dl.querySelector('.kv-row[data-k="' + key + '"]');
  if (!row) {
    row = tpl('tpl-kv');
    if (!row) return null;
    row.dataset.k = key;
    dl.appendChild(row);
  }
  setText(row.querySelector('dt'), label);
  return row;
}

function setCreatedCell(dd, ts) {
  if (!dd) return;
  const stamp = String(ts || 0);
  if (dd.dataset.stamp === stamp) return;
  dd.dataset.stamp = stamp;
  if (!ts) {
    dd.replaceChildren(document.createTextNode('—'));
    return;
  }
  const t = document.createElement('time');
  t.dataset.ts = String(ts);
  t.dateTime = new Date(ts).toISOString();
  t.title = new Date(ts).toLocaleString('it-IT');
  setText(t, relTime(ts));
  dd.replaceChildren(document.createTextNode(fmtDateShort(ts) + ' · '), t);
}

function setUpdatedCell(dd, ts) {
  if (!dd) return;
  let t = dd.querySelector('time');
  if (!t) {
    t = document.createElement('time');
    dd.replaceChildren(t);
  }
  if (ts) {
    t.dataset.ts = String(ts);
    t.dateTime = new Date(ts).toISOString();
    t.title = new Date(ts).toLocaleString('it-IT');
    setText(t, relTime(ts));
  } else {
    delete t.dataset.ts;
    t.removeAttribute('datetime');
    t.removeAttribute('title');
    setText(t, '—');
  }
}

function renderMeta(d) {
  const dl = $('#d-meta');
  if (!dl) return;
  const rows = [
    ['dir', TXT.kv.directory],
    ['agent', TXT.kv.agent],
    ['model', TXT.kv.model],
    ['provider', TXT.kv.provider],
    ['created', TXT.kv.created],
    ['updated', TXT.kv.updated],
    ['id', TXT.kv.id],
  ];
  if (d.parentId) rows.push(['parent', TXT.kv.parent]);

  const wanted = new Set(rows.map(r => r[0]));
  for (const row of $$('.kv-row', dl)) if (!wanted.has(row.dataset.k)) row.remove();

  const created = normTs(d.timeCreated);
  const updated = normTs(d.timeUpdated);
  for (const [key, label] of rows) {
    const row = kvEnsure(dl, key, label);
    if (!row) continue;
    const dd = row.querySelector('dd');
    if (!dd) continue;
    if (key === 'dir') {
      setText(dd, d.directory || '—');
      setAttr(dd, 'title', d.directory || null);
    } else if (key === 'agent') {
      setText(dd, d.agent || '—');
    } else if (key === 'model') {
      setText(dd, d.model || '—');
    } else if (key === 'provider') {
      setText(dd, d.provider || '—');
    } else if (key === 'created') {
      setCreatedCell(dd, created);
    } else if (key === 'updated') {
      setUpdatedCell(dd, updated);
    } else if (key === 'id') {
      setText(dd, d.id || '—');
      setAttr(dd, 'title', d.id || null);
    } else if (key === 'parent') {
      let btn = dd.querySelector('.link-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'link-btn';
        dd.replaceChildren(btn);
      }
      btn.dataset.session = d.parentId;
      btn.dataset.parent = d.parentId;
      setAttr(btn, 'title', d.parentId);
      setText(btn, shortId(d.parentId));
    }
  }
}

function estSourceLabel(s) {
  switch (s.estSource) {
    case 'exact': return '= reale';
    case 'paid-twin': return 'listino ' + (s.estPricedAs || '?');
    case 'other-provider': return 'listino altro provider: ' + (s.estPricedAs || '?');
    default: return 'non stimabile';
  }
}

function renderKpis(d) {
  const tin = Number(d.tokensInput) || 0;
  const tout = Number(d.tokensOutput) || 0;
  const trea = Number(d.tokensReasoning) || 0;
  const tread = Number(d.tokensCacheRead) || 0;
  const twrite = Number(d.tokensCacheWrite) || 0;
  const total = Number(d.totalTokens) || (tin + tout + trea + tread + twrite);

  setText($('#d-kpi-tokens'), fmtTok(total));
  setText($('#d-kpi-tokens-sub'), 'in ' + fmtTok(tin) + ' · out ' + fmtTok(tout) + ' · reas ' + fmtTok(trea));

  const rate = d.cacheRate != null
    ? Number(d.cacheRate) || 0
    : (tread + tin > 0 ? Math.round(tread / (tread + tin) * 100) : 0);
  setText($('#d-kpi-cache'), rate + '%');
  setText($('#d-kpi-cache-sub'), 'lette ' + fmtTok(tread) + ' · scritte ' + fmtTok(twrite));

  setText($('#d-kpi-cost'), fmtCost(d.cost));
  setText($('#d-kpi-est'), '~' + fmtCost(d.estCost));
  setText($('#d-kpi-est-sub'), estSourceLabel(d));

  const box = $('#d-kpi-est-box');
  if (box) {
    const r = d.estRates;
    box.title = r
      ? 'in ' + r.input + ' / out ' + r.output + ' / cache ' + (r.cache_read || 0) + ' $ per 1M token'
      : '';
  }
}

function renderTodos(d) {
  const sec = $('#d-todos-sec');
  const ol = $('#d-todos');
  const todos = Array.isArray(d.todos)
    ? d.todos.slice().sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
    : [];
  if (sec) sec.hidden = todos.length === 0;
  if (!ol) return;
  if (!todos.length) {
    ol.replaceChildren();
    return;
  }

  let done = 0;
  for (const t of todos) if (t.status === 'completed') done++;
  renderRail($('#d-rail'), $('#d-todos-count'), { done, total: todos.length });

  const frag = document.createDocumentFragment();
  for (const t of todos) {
    const li = tpl('tpl-todo');
    if (!li) continue;
    const status = t.status || 'pending';
    setAttr(li, 'data-status', status);
    const txt = li.querySelector('.todo-txt');
    setText(txt, t.content || '');
    txt.classList.toggle('cursor', status === 'in_progress');
    const suffix = status === 'completed' ? ' (completato)'
      : status === 'in_progress' ? ' (in corso)'
        : status === 'cancelled' ? ' (annullato)' : '';
    if (suffix) {
      const sr = document.createElement('span');
      sr.className = 'sr';
      sr.textContent = suffix;
      li.appendChild(sr);
    }
    frag.appendChild(li);
  }
  ol.replaceChildren(frag);
}

function renderChildren(d) {
  const sec = $('#d-children-sec');
  const ul = $('#d-children');
  const list = d && Array.isArray(d.children) ? d.children : [];
  if (sec) sec.hidden = list.length === 0;
  if (!ul) return;
  if (!list.length) {
    ul.replaceChildren();
    return;
  }

  const frag = document.createDocumentFragment();
  for (const c of list) {
    const li = tpl('tpl-child');
    if (!li) continue;
    const btn = li.querySelector('.child');
    if (!btn) continue;
    const s = S.sessions.get(c.id);
    const status = s ? s.status : 'idle';
    const meta = STATUS[status] || STATUS.idle;
    btn.dataset.session = c.id;
    setAttr(btn.querySelector('.lamp'), 'data-lamp', meta.lamp);
    setText(btn.querySelector('.child-title'), c.title || (s ? displayTitle(s) : shortId(c.id)));
    setText(btn.querySelector('.child-status'), meta.label);
    frag.appendChild(li);
  }
  ul.replaceChildren(frag);
}

function updateClamp(clamp, btn) {
  if (!clamp || !btn) return;
  if (clamp.hidden) {
    btn.hidden = true;
    return;
  }
  if (clamp.classList.contains('is-open')) {
    setText(btn, TXT.detail.less);
    btn.hidden = false;
    return;
  }
  setText(btn, TXT.detail.more);
  btn.hidden = clamp.scrollHeight <= clamp.clientHeight + 2;
}

function updateClamps() {
  for (const li of $$('#d-transcript .tx-item')) {
    const clamp = li.querySelector('.clamp');
    if (clamp) updateClamp(clamp, li.querySelector('.more'));
  }
  updateClamp($('#d-prompt-clamp'), $('#d-prompt-more'));
}

function renderPrompt(d) {
  const sec = $('#d-prompt-sec');
  const text = String(d.fullPrompt || d.firstUserPrompt || '');
  if (sec) sec.hidden = !text;
  setText($('#d-prompt'), text);
  updateClamp($('#d-prompt-clamp'), $('#d-prompt-more'));
}

function togglePromptClamp() {
  const clamp = $('#d-prompt-clamp');
  if (!clamp) return;
  clamp.classList.toggle('is-open');
  updateClamp(clamp, $('#d-prompt-more'));
}

function partKind(m, p) {
  const type = (p && p.type) || '';
  if (type === 'text') return m && m.role === 'user' ? 'user' : 'text';
  if (type === 'reasoning') return 'reason';
  if (type === 'tool') return 'tool';
  if (type === 'step-finish') return 'step';
  return 'note';
}

function txFamily(it) {
  const p = it.part || {};
  if (it.kind === 'tool') return toolFamily(p.tool);
  if (it.kind === 'user') return 'user';
  if (it.kind === 'text') return 'text';
  if (it.kind === 'reason') return 'reason';
  if (it.kind === 'step') return 'step';
  switch (noteInfo(p).variant) {
    case 'shell': return 'exec';
    case 'patch': return 'edit';
    case 'idle-failed':
    case 'error': return 'error';
    case 'retry': return 'warn';
    case 'idle-done': return 'idle';
    default: return 'note';
  }
}

function txSig(it) {
  const p = it.part || {};
  const m = it.msg || {};
  return [
    it.kind,
    p.status,
    (p.text || '').length,
    (p.output || '').length,
    p.timeCompleted,
    m.streaming ? 1 : 0,
    m.model,
    m.agent,
    p.outcome,
    p.state,
    Array.isArray(p.files) ? p.files.length : 0,
  ].join('|');
}

function createTx(it) {
  const name = it.kind === 'msg' ? 'tpl-tx-msg' : 'tpl-tx-' + it.kind;
  const el = tpl(name) || tpl('tpl-tx-note');
  if (!el) return null;
  // Only creation decides the initial open state: polling never overrides the user.
  if (it.kind === 'tool' && it.part && it.part.status === 'error') {
    const det = el.querySelector('details');
    if (det) det.open = true;
  }
  return el;
}

function setTxTime(el, ms) {
  if (!el) return;
  const n = Number(ms) || 0;
  setText(el, n ? fmtClock(n) : '—');
  if (n) {
    el.dateTime = new Date(n).toISOString();
    el.title = new Date(n).toLocaleString('it-IT');
  } else {
    el.removeAttribute('datetime');
    el.removeAttribute('title');
  }
}

function clipOutput(out) {
  const s = String(out == null ? '' : out);
  if (s.length <= DETAIL_OUT_MAX) return s;
  return s.slice(0, DETAIL_OUT_MAX) + '\n… (troncato, ' + s.length + ' caratteri)';
}

function noteInfo(p) {
  const type = (p && p.type) || 'unknown';
  switch (type) {
    case 'shell':
      return { variant: 'shell', head: 'Shell' + (p.state ? ' · ' + p.state : ''), icon: 'exec', body: p.text || '' };
    case 'compaction':
      return { variant: 'compaction', head: 'Contesto compattato', icon: 'compaction', body: p.text || '' };
    case 'idle': {
      const failed = p.outcome === 'failed';
      return {
        variant: failed ? 'idle-failed' : 'idle-done',
        head: failed ? 'Turno fallito' : 'Turno concluso',
        icon: failed ? 'error' : 'idle',
        body: p.text || '',
      };
    }
    case 'retry':
      return { variant: 'retry', head: 'Retry', icon: 'retry', body: p.text || '' };
    case 'error':
      return { variant: 'error', head: 'Errore', icon: 'error', body: p.text || '' };
    case 'model-switched':
      return { variant: 'model', head: 'Modello cambiato', icon: 'switch', body: p.text || '' };
    case 'patch': {
      const files = Array.isArray(p.files) ? p.files : [];
      const lines = files.map(f => (typeof f === 'string' ? f : (f && f.path) || ''));
      return { variant: 'patch', head: 'Patch · ' + files.length + ' file', icon: 'edit', body: lines.join('\n') };
    }
    default:
      return { variant: 'unknown', head: 'Parte non riconosciuta (' + type + ')', icon: 'tool', body: '' };
  }
}

// Mutates the existing node in place: <details> keeps the user's open/closed choice.
function patchTx(el, it) {
  if (!el || !it) return;
  const p = it.part || {};
  const m = it.msg || {};

  if (it.kind === 'msg') {
    const role = m.role === 'user' ? TXT.roles.user : (m.agent || TXT.roles.assistant);
    setText(el.querySelector('.tx-role'), role);
    let model = m.model ? '· ' + m.model : '';
    if (m.streaming) model += (model ? ' ' : '') + '· in corso';
    const modelEl = el.querySelector('.tx-model');
    setText(modelEl, model);
    modelEl.classList.toggle('cursor', !!m.streaming);
    setTxTime(el.querySelector('.tx-time'), normTs(m.timeCreated));
    return;
  }

  if (it.kind === 'user' || it.kind === 'text') {
    setAttr(el, 'data-family', it.kind === 'user' ? 'user' : 'text');
    setText(el.querySelector('.tx-body'), p.text || '');
    el.classList.toggle('cursor', it.kind === 'text' && !!m.streaming && !!it.last);
    return;
  }

  if (it.kind === 'reason') {
    const text = String(p.text || '');
    setAttr(el, 'data-family', 'reason');
    setText(el.querySelector('.tx-meta'), text ? '· ' + fmtTok(text.length) + ' caratteri' : '');
    setText(el.querySelector('.tx-body'), text);
    return;
  }

  if (it.kind === 'tool') {
    setAttr(el, 'data-family', toolFamily(p.tool));
    setAttr(el, 'data-status', p.status || null);
    setIcon(el.querySelector('.tx-ic'), iconFor({ type: 'tool', tool: p.tool }));
    setText(el.querySelector('.tx-tool-name'), p.tool || 'tool');
    setText(el.querySelector('.tx-tool-in'), p.inputSummary || '');

    const start = normTs(p.timeCreated);
    const end = normTs(p.timeCompleted);
    const dur = el.querySelector('.tx-dur');
    if (dur) {
      if (p.status === 'running' && start) {
        dur.dataset.tsStart = String(start);
        setText(dur, 'da ' + fmtDur(Date.now() - start));
      } else {
        delete dur.dataset.tsStart;
        setText(dur, start && end ? fmtDur(end - start) : '');
      }
    }

    const act = p.status ? ACT[p.status] : null;
    setAttr(el.querySelector('.lamp'), 'data-lamp', act ? act.lamp : 'idle');
    setText(el.querySelector('.tx-state'), act ? act.label : '');

    const out = p.output == null ? '' : String(p.output);
    setText(el.querySelector('.tx-out'), out ? clipOutput(out) : 'nessun output');
    return;
  }

  if (it.kind === 'step') {
    const tk = p.tokens || {};
    const cache = tk.cache || {};
    setAttr(el, 'data-family', 'step');
    const bits = ['step', 'in ' + fmtTok(tk.input || 0), 'out ' + fmtTok(tk.output || 0)];
    if (tk.reasoning) bits.push('reas ' + fmtTok(tk.reasoning));
    if (cache.read || cache.write) bits.push('cache ' + fmtTok(cache.read || 0) + '/' + fmtTok(cache.write || 0));
    if (p.cost != null) bits.push(fmtCost(p.cost));
    setText(el.querySelector('.tx-step-txt'), bits.join(' · '));
    return;
  }

  const info = noteInfo(p);
  setAttr(el, 'data-family', txFamily(it));
  setAttr(el, 'data-variant', info.variant);
  setIcon(el.querySelector('.tx-note-h .ic'), info.icon);
  setText(el.querySelector('.tx-k'), info.head);
  setText(el.querySelector('.tx-body'), info.body);
  const clamp = el.querySelector('.clamp');
  if (clamp) clamp.hidden = !info.body;
}

// Keyed list: every node is reused, so <details> and expanded clamps survive polling.
function renderTranscript(d) {
  const ol = $('#d-transcript');
  const sc = $('#d-scroll');
  if (!ol) return;
  const nearBottom = sc ? sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80 : false;

  const desired = [];
  for (const m of d.messages || []) {
    if (m.role === 'user' || m.role === 'assistant') desired.push({ key: 'm:' + m.id, kind: 'msg', msg: m });
    const parts = m.parts || [];
    parts.forEach((p, i) => {
      desired.push({ key: 'p:' + m.id + ':' + i, kind: partKind(m, p), part: p, msg: m, last: i === parts.length - 1 });
    });
  }

  const start = Math.max(0, desired.length - D.limit);
  const older = $('#d-older');
  if (older) {
    older.hidden = start === 0;
    if (start) setText(older, TXT.detail.older.replace('{n}', String(Math.min(200, start))));
  }

  const seen = new Set();
  let i = 0;
  let added = 0;
  for (const it of desired.slice(start)) {
    seen.add(it.key);
    let rec = D.keys.get(it.key);
    if (!rec) {
      const el = createTx(it);
      if (!el) continue;
      rec = { el, sig: null };
      D.keys.set(it.key, rec);
      added++;
    }
    const sig = txSig(it);
    if (rec.sig !== sig) {
      patchTx(rec.el, it);
      rec.sig = sig;
    }
    if (ol.children[i] !== rec.el) ol.insertBefore(rec.el, ol.children[i] || null);
    i++;
  }
  while (ol.children.length > i) ol.lastElementChild.remove();
  for (const key of [...D.keys.keys()]) if (!seen.has(key)) D.keys.delete(key);

  const jump = $('#d-jump');
  if (sc && D.stick && nearBottom) sc.scrollTop = sc.scrollHeight;
  else if (jump) jump.hidden = !(added && !nearBottom);
  updateClamps();
}

function renderDetail(d) {
  if (!d) return;
  D.data = d;
  D.fatal = false;
  const body = $('#d-body');
  if (body) body.hidden = false;
  detailState(null);
  renderDetailHead(d);
  renderMeta(d);
  renderKpis(d);
  renderTodos(d);
  renderChildren(d);
  renderPrompt(d);
  renderTranscript(d);
}

function scheduleDetailPoll() {
  clearTimeout(D.timer);
  D.timer = 0;
  if (!D.id || D.fatal || document.hidden) return;
  if (detailStatusOf() !== 'working') return;
  D.timer = setTimeout(fetchDetail, 2000);
}

function scheduleDetailRefetch() {
  if (!D.id || D.fatal) return;
  clearTimeout(D.debounce);
  D.debounce = setTimeout(fetchDetail, 600);
}

async function fetchDetail() {
  const id = D.id;
  if (!id || D.fatal) return;
  if (D.inflight) {
    D.again = true;
    return;
  }
  D.inflight = true;
  D.again = false;
  const token = D.token;
  if (D.ctrl) D.ctrl.abort();
  const ctrl = new AbortController();
  D.ctrl = ctrl;
  let fatal = false;

  try {
    const d = await api.get('/api/session?id=' + encodeURIComponent(id), { signal: ctrl.signal });
    if (token !== D.token || S.selectedId !== id) return;
    if (!d) throw new Error('empty detail');
    renderDetail(d);
  } catch (e) {
    if (token !== D.token || S.selectedId !== id) return;
    if (e && e.name === 'AbortError') return;
    if (e && e.status === 404) {
      fatal = true;
      D.fatal = true;
      detailState('error', TXT.errors.notFound);
    } else {
      detailState('error', TXT.errors.network);
    }
  } finally {
    if (token !== D.token) return;
    D.inflight = false;
    if (D.again) {
      D.again = false;
      fetchDetail();
    } else if (!fatal) {
      scheduleDetailPoll();
    }
  }
}

function syncSelection() {
  for (const li of rowEls.values()) {
    const btn = li.querySelector('.srow');
    if (btn) setAttr(btn, 'aria-current', btn.dataset.sessionId === S.selectedId ? 'true' : null);
  }
  for (const row of $$('#feed-list .frow')) {
    row.classList.toggle('is-sel', row.dataset.session === S.selectedId);
  }
}

function openSession(id, opts) {
  if (!id) return;
  const wantHash = !opts || opts.hash !== false;
  const modal = document.body.dataset.mode !== 'desk';

  if (id === S.selectedId) {
    if (modal) {
      const close = $('#d-close');
      if (close) close.focus();
    }
    return;
  }

  const wasOpen = !!S.selectedId;
  D.token++;
  if (D.ctrl) {
    D.ctrl.abort();
    D.ctrl = null;
  }
  clearTimeout(D.timer);
  clearTimeout(D.debounce);
  D.timer = 0;
  D.debounce = 0;
  D.inflight = false;
  D.again = false;
  D.fatal = false;
  D.prevStatus = null;
  D.id = id;
  D.data = null;
  D.keys.clear();
  D.limit = 400;
  D.stick = false;

  const ol = $('#d-transcript');
  if (ol) ol.replaceChildren();
  const body = $('#d-body');
  if (body) body.hidden = true;
  const clamp = $('#d-prompt-clamp');
  if (clamp) clamp.classList.remove('is-open');
  const more = $('#d-prompt-more');
  if (more) {
    more.hidden = true;
    setText(more, TXT.detail.more);
  }

  S.selectedId = id;
  document.body.dataset.selected = 'true';

  const s = S.sessions.get(id);
  if (s) renderDetailHead(s);
  else renderDetailPlaceholder(id);
  detailState('loading', TXT.loading);

  const sc = $('#d-scroll');
  if (sc) sc.scrollTop = 0;
  const jump = $('#d-jump');
  if (jump) jump.hidden = true;

  syncSelection();
  if (typeof applyModal === 'function') applyModal();
  if (wantHash && typeof writeHash === 'function') writeHash(modal && !wasOpen);
  fetchDetail();

  if (modal) {
    const close = $('#d-close');
    if (close) close.focus();
  }
}

function closeSession(opts) {
  const viaHistory = !!(opts && opts.viaHistory);
  const id = S.selectedId;
  if (!id) return;
  if (!viaHistory && history.state && history.state.oc === 'detail') {
    history.back();
    return;
  }

  D.token++;
  if (D.ctrl) {
    D.ctrl.abort();
    D.ctrl = null;
  }
  clearTimeout(D.timer);
  clearTimeout(D.debounce);
  D.timer = 0;
  D.debounce = 0;
  D.inflight = false;
  D.again = false;
  D.fatal = false;
  D.id = null;
  D.data = null;
  D.keys.clear();
  D.limit = 400;
  D.stick = false;

  S.selectedId = null;
  document.body.dataset.selected = 'false';
  if (typeof applyModal === 'function') applyModal();
  if (typeof writeHash === 'function') writeHash(false);
  const jump = $('#d-jump');
  if (jump) jump.hidden = true;
  syncSelection();

  const li = rowEls.get(id);
  const btn = li && li.querySelector('.srow');
  if (btn) btn.focus();
  else {
    const search = $('#search');
    if (search) search.focus();
  }
}

// Overview diff hook (§5.5): header and children stay live between polls.
function syncDetailFromOverview() {
  if (!S.selectedId) return;
  const s = S.sessions.get(S.selectedId);
  if (s) {
    renderDetailHead(s);
    const prev = D.prevStatus;
    D.prevStatus = s.status;
    if (s.status === 'working' && prev !== 'working' && !D.fatal) scheduleDetailPoll();
    else if (prev === 'working' && s.status !== 'working') fetchDetail();
  }
  if (D.data) renderChildren(D.data);
}

async function copySessionId() {
  const id = S.selectedId || D.id;
  if (!id) return;
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(id);
    notifyLater('ok', TXT.toasts.copied);
  } catch {
    notifyLater('warn', TXT.toasts.copyFail);
  }
}

function showOlder() {
  if (!D.data) return;
  D.limit += 200;
  renderTranscript(D.data);
}

function jumpBottom() {
  const sc = $('#d-scroll');
  if (!sc) return;
  sc.scrollTop = sc.scrollHeight;
  D.stick = true;
  const jump = $('#d-jump');
  if (jump) jump.hidden = true;
}

function onDetailScroll() {
  if (detailRaf) return;
  detailRaf = requestAnimationFrame(() => {
    detailRaf = 0;
    const sc = $('#d-scroll');
    if (!sc) return;
    const near = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80;
    D.stick = near;
    const jump = $('#d-jump');
    if (jump) jump.hidden = near || detailStatusOf() !== 'working';
  });
}

const detailPromptMoreBtn = $('#d-prompt-more');
if (detailPromptMoreBtn) detailPromptMoreBtn.addEventListener('click', togglePromptClamp);
const detailCopyBtn = $('#d-copy');
if (detailCopyBtn) detailCopyBtn.addEventListener('click', copySessionId);
const detailOlderBtn = $('#d-older');
if (detailOlderBtn) detailOlderBtn.addEventListener('click', showOlder);
const detailJumpBtn = $('#d-jump');
if (detailJumpBtn) detailJumpBtn.addEventListener('click', jumpBottom);
const detailScrollEl = $('#d-scroll');
if (detailScrollEl) detailScrollEl.addEventListener('scroll', onDetailScroll, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.selectedId && !D.fatal) fetchDetail();
});

// ---- 11. system ----

if (S.db === undefined) S.db = null;

const PROCESS_STATE = {
  R: { label: 'attivo', lamp: 'working' },
  S: { label: 'in attesa', lamp: 'active' },
  D: { label: 'I/O', lamp: 'pending' },
  Z: { label: 'zombie', lamp: 'failed' },
  T: { label: 'fermo', lamp: 'stuck' },
};

const procEls = new Map();
let locksTimer = 0;
let locksBusy = false;

function rowCell(tr, col) {
  return tr.querySelector('td[data-col="' + col + '"]');
}

function patchProc(tr, p) {
  setText(rowCell(tr, 'pid'), p.pid == null ? '—' : p.pid);
  setText(rowCell(tr, 'type'), p.isRun ? 'run' : p.isInteractive ? 'tui' : 'altro');

  const letter = String(p.state || '').charAt(0).toUpperCase();
  const st = PROCESS_STATE[letter] || { label: '?', lamp: 'idle' };
  const stateCell = rowCell(tr, 'state');
  if (stateCell) {
    setAttr(stateCell.querySelector('.lamp'), 'data-lamp', st.lamp);
    setText(stateCell.querySelector('.st-txt'), st.label);
  }

  const cpu = Number(p.cpu) || 0;
  const cpuCell = rowCell(tr, 'cpu');
  setText(cpuCell, cpu.toFixed(1) + '%');
  setAttr(cpuCell, 'data-hot', cpu > 80);

  setText(rowCell(tr, 'rss'), Math.round(Number(p.rss) || 0) + ' MB');
  setText(rowCell(tr, 'age'), fmtElapsed(p.elapsed));
  setText(rowCell(tr, 'fd'), p.fdCount == null ? '—' : p.fdCount);

  const cmd = rowCell(tr, 'cmd');
  setText(cmd, p.cmd || '—');
  setAttr(cmd, 'title', p.cmd || null);
}

function renderProcesses() {
  const body = $('#proc-body');
  if (!body) return;
  const list = Array.isArray(S.processes) ? S.processes : [];
  const seen = new Set();
  let i = 0;

  for (const p of list) {
    if (!p) continue;
    const key = String(p.pid);
    seen.add(key);
    let tr = procEls.get(key);
    if (!tr) {
      tr = tpl('tpl-proc');
      if (!tr) continue;
      procEls.set(key, tr);
    }
    patchProc(tr, p);
    if (body.children[i] !== tr) body.insertBefore(tr, body.children[i] || null);
    i++;
  }

  while (body.children.length > i) body.lastElementChild.remove();
  for (const [key, tr] of procEls) {
    if (!seen.has(key)) {
      procEls.delete(key);
      tr.remove();
    }
  }

  setText($('#proc-count'), list.length);
  systemState($('#proc-state'), list.length === 0, TXT.empty.processes);
}

function systemState(el, show, text) {
  if (!el) return;
  el.hidden = !show;
  if (!show) return;
  setAttr(el, 'data-kind', 'empty');
  stateTitle(el.querySelector('.state-k'), text, false);
  setText(el.querySelector('.state-msg'), '');
}

function renderSvcCard() {
  const svc = S.service;
  const suspended = hasSuspendedSession();
  let label = '—';
  let lamp = 'idle';
  if (svc) {
    if (svc.alive) {
      label = 'Attivo';
      lamp = 'active';
    } else if (suspended) {
      label = 'Giù — ci sono sessioni sospese';
      lamp = 'failed';
    } else {
      label = 'Spento';
      lamp = 'pending';
    }
  }
  setAttr($('#svc-card-lamp'), 'data-lamp', lamp);
  setText($('#svc-card-state'), label);
  setText($('#svc-version'), svc ? svc.version || '—' : '—');
  setText($('#svc-url'), svc ? svc.url || '—' : '—');
  setText($('#svc-pid'), svc && svc.pid != null ? svc.pid : '—');
}

function renderLocks(list) {
  const body = $('#lock-body');
  if (!body) return;
  const rows = Array.isArray(list) ? list : [];
  const frag = document.createDocumentFragment();

  for (const l of rows) {
    if (!l) continue;
    const tr = tpl('tpl-lock');
    if (!tr) continue;
    const session = rowCell(tr, 'session');
    setText(session, shortId(l.id));
    setAttr(session, 'title', l.id || null);
    setText(rowCell(tr, 'pid'), l.pid == null ? '—' : l.pid);
    setText(rowCell(tr, 'hb'), (Number(l.hbAge) || 0) + 's');
    setText(rowCell(tr, 'alive'), l.pidAlive ? 'sì' : 'no');
    const state = rowCell(tr, 'state');
    setAttr(state.querySelector('.lamp'), 'data-lamp', l.stuck ? 'failed' : 'active');
    setText(state.querySelector('.st-txt'), l.stuck ? 'bloccato' : 'ok');
    frag.appendChild(tr);
  }

  body.replaceChildren(frag);
  systemState($('#lock-state'), rows.length === 0, TXT.empty.locks);
}

function renderDb() {
  const el = $('#db-state');
  if (!el) return;
  if (S.db == null) {
    setText(el, '—');
    setAttr(el, 'data-state', 'unknown');
    return;
  }
  const ok = S.db !== false;
  setText(el, ok ? 'ok' : 'non trovato');
  setAttr(el, 'data-state', ok ? 'ok' : 'missing');
}

// Database missing: the two lists show the db error (§4.20).
function feedDbError() {
  const list = $('#feed-list');
  if (list && list.children.length) return;
  const st = $('#feed-state');
  if (!st) return;
  st.hidden = false;
  setAttr(st, 'data-kind', 'error');
  stateTitle(st.querySelector('.state-k'), TXT.errors.dbTitle, false);
  setText(st.querySelector('.state-msg'), TXT.errors.dbText);
}

async function loadHealth() {
  let h;
  try {
    h = await api.get('/api/health');
  } catch {
    return;
  }
  S.db = h ? h.db !== false : true;
  S.dbError = S.db === false;
  renderDb();
  if (S.dbError) {
    renderSessions();
    feedDbError();
  }
}

// Locks poll only while #panel-system is visible (§4.12).
function locksVisible() {
  if (S.selectedId) return false;
  if (mqDesk.matches) return true;
  if (document.body.dataset.tab !== 'system') return false;
  return !mqMob.matches || document.body.dataset.mview !== 'sessions';
}

async function fetchLocks() {
  if (locksBusy) return;
  locksBusy = true;
  try {
    renderLocks(await api.get('/api/locks'));
  } catch {
    // a failed poll keeps the previous rows
  } finally {
    locksBusy = false;
  }
}

function startLocks() {
  if (locksTimer || !locksVisible()) return;
  fetchLocks();
  locksTimer = setInterval(fetchLocks, 10000);
}

function stopLocks() {
  if (locksTimer) clearInterval(locksTimer);
  locksTimer = 0;
}

function refreshLocks() {
  if (locksVisible()) startLocks();
  else stopLocks();
}

function renderSystem() {
  renderSvcCard();
  renderProcesses();
  renderDb();
  refreshLocks();
}

// ---- 12. log ----

L.seq = 0;
L.loading = false;
L.error = false;
L.reconnect = false;

function startLog() {
  if (L.started) return;
  L.started = true;
  L.loading = true;
  updateLogStatus();
  loadLogArchive();
  openLogStream();
}

async function loadLogArchive() {
  try {
    const lines = await api.get('/api/log-archive?sessionId=__all__&maxLines=200');
    if (Array.isArray(lines) && lines.length) appendLog(lines);
    L.loading = false;
    L.error = false;
  } catch {
    L.loading = false;
    L.error = true;
  }
  updateLogStatus();
  updateLogEmpty();
}

function openLogStream() {
  const es = api.stream('/api/log-stream?sessionId=__all__');
  L.es = es;
  es.onmessage = e => {
    const d = parseJSON(e.data);
    if (!d) return;
    if (d.type === 'connected') {
      L.loading = false;
      L.error = false;
      L.reconnect = false;
      updateLogStatus();
      return;
    }
    if (d.type === 'line') appendLog([d]);
  };
  es.onerror = () => {
    L.reconnect = true;
    updateLogStatus();
  };
}

function appendLog(lines) {
  for (const line of lines) if (line) L.buf.push(line);
  if (L.buf.length > LOG_MAX) L.buf.splice(0, L.buf.length - LOG_MAX);
  if (!L.timer) L.timer = setTimeout(flushLog, 250);
}

function logEl(line) {
  const li = tpl('tpl-logl');
  if (!li) return null;
  const key = 'l' + (++L.seq);
  li.dataset.key = key;
  L.byId.set(key, li);

  const level = String(line.level || 'INFO').toUpperCase();
  setAttr(li, 'data-level', level);

  const time = li.querySelector('.logl-t');
  const raw = line.time ? String(line.time) : '';
  setText(time, raw ? raw.slice(11, 19) : '—');
  if (raw) {
    time.dateTime = raw;
    time.title = raw;
  } else {
    time.removeAttribute('datetime');
    time.removeAttribute('title');
  }

  setText(li.querySelector('.logl-lv'), level);
  setText(li.querySelector('.logl-msg'), line.message || '');
  setText(li.querySelector('.logl-rest'), line.rest || '');
  return li;
}

function logAtBottom() {
  const sc = $('#log-scroll');
  if (!sc) return true;
  return sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 80;
}

function flushLog() {
  L.timer = 0;
  if (!L.buf.length) {
    updateLogStatus();
    if (L.started) updateLogEmpty();
    return;
  }
  if (L.paused) {
    updateLogPill();
    updateLogStatus();
    return;
  }

  const list = $('#log-list');
  const sc = $('#log-scroll');
  if (!list) {
    L.buf.length = 0;
    return;
  }

  const stick = !sc || logAtBottom();
  const batch = L.buf.splice(0, L.buf.length);
  const frag = document.createDocumentFragment();
  for (const line of batch) {
    const li = logEl(line);
    if (li) frag.appendChild(li);
  }
  list.appendChild(frag);

  while (list.children.length > LOG_MAX) {
    const first = list.firstElementChild;
    if (!first) break;
    L.byId.delete(first.dataset.key);
    first.remove();
  }
  L.count = list.children.length;

  if (stick) {
    if (sc) sc.scrollTop = sc.scrollHeight;
    L.newCount = 0;
    const pill = $('#log-pill');
    if (pill) pill.hidden = true;
  } else {
    L.newCount += batch.length;
    updateLogPill();
  }

  applyLogSearch();
  updateLogStatus();
  updateLogEmpty();
}

function applyLogSearch() {
  const list = $('#log-list');
  if (!list) return;
  const q = L.search;
  for (const li of list.children) {
    let hit = true;
    if (q) {
      const msg = li.querySelector('.logl-msg');
      const rest = li.querySelector('.logl-rest');
      const text = (msg ? msg.textContent : '') + ' ' + (rest ? rest.textContent : '');
      hit = text.toLowerCase().includes(q);
    }
    li.classList.toggle('is-miss', !hit);
  }
}

function paintLogLevel() {
  setAttr($('#log-list'), 'data-level', L.level);
  for (const btn of $$('.seg-btn[data-log-level]')) {
    setAttr(btn, 'aria-pressed', btn.dataset.logLevel === L.level ? 'true' : 'false');
  }
}

function setLogLevel(key) {
  L.level = key === 'warn' ? 'warn' : 'all';
  paintLogLevel();
  savePrefs();
}

function updateLogPill() {
  const pill = $('#log-pill');
  if (!pill) return;
  const n = L.paused ? L.buf.length : L.newCount;
  if (!n) {
    pill.hidden = true;
    return;
  }
  setText(pill, TXT.pills.log.replace('{n}', n));
  pill.hidden = false;
}

function updateLogStatus() {
  const el = $('#log-status');
  if (!el) return;
  let text = '';
  if (L.reconnect) text = 'riconnessione…';
  else if (L.error) text = 'Errore nel caricare il log';
  else if (L.loading) text = TXT.loading;
  else if (L.started) text = 'in ascolto · ' + L.count + ' righe';
  setText(el, text);
}

function updateLogEmpty() {
  const st = $('#log-state');
  if (!st) return;
  if (L.count > 0 || L.loading) {
    st.hidden = true;
    return;
  }
  st.hidden = false;
  setAttr(st, 'data-kind', L.error ? 'error' : 'empty');
  stateTitle(st.querySelector('.state-k'), L.error ? 'Errore nel caricare il log' : TXT.empty.log, false);
  setText(st.querySelector('.state-msg'), '');
}

function setLogPaused(on) {
  L.paused = !!on;
  const btn = $('#log-pause');
  setAttr(btn, 'aria-pressed', L.paused ? 'true' : 'false');
  setText(btn && btn.querySelector('.chip-txt'), L.paused ? TXT.feed.resume : TXT.feed.pause);
  setIcon(btn && btn.querySelector('svg'), L.paused ? 'play' : 'pause');
  updateLogPill();
  if (!L.paused && L.buf.length) {
    if (L.timer) clearTimeout(L.timer);
    L.timer = 0;
    flushLog();
  }
}

function logToBottom() {
  const sc = $('#log-scroll');
  if (sc) sc.scrollTop = sc.scrollHeight;
  L.newCount = 0;
  const pill = $('#log-pill');
  if (pill) pill.hidden = true;
}

function onLogScroll() {
  if (!logAtBottom()) return;
  L.newCount = 0;
  const pill = $('#log-pill');
  if (pill) pill.hidden = true;
}

// ---- 13. alerts ----

const alertEls = new Map();

function alertKey(a) {
  const pids = Array.isArray(a && a.pids) ? a.pids.join(',') : '';
  return String((a && a.type) || 'alert') + ':' + ((a && a.sessionId) || pids);
}

// The server re-sends active alerts every 15 s: upsert by key, never duplicate.
function onAlert(a, opts) {
  if (!a || !a.type) return;
  const key = alertKey(a);
  const now = Date.now();
  const prev = A.byKey.get(key);
  const rec = {
    key,
    data: a,
    lastSeen: now,
    sev: a.type === 'lock_stuck' ? 'alarm' : 'warn',
  };
  A.byKey.set(key, rec);
  renderAlerts();

  const dismissed = (A.dismissed.get(key) || 0) > now;
  if (!prev && !(opts && opts.quiet) && !dismissed) {
    const kind = TXT.alerts[a.type] || a.type;
    announce(a.message ? kind + ': ' + a.message : kind);
  }
}

function patchAlert(li, rec) {
  const a = rec.data;
  setAttr(li, 'data-sev', rec.sev);
  setAttr(li, 'data-key', rec.key);
  setAttr(li.querySelector('.lamp'), 'data-lamp', rec.sev === 'alarm' ? 'failed' : 'stuck');
  setText(li.querySelector('.alert-kind'), TXT.alerts[a.type] || a.type);
  setText(li.querySelector('.alert-txt'), a.message || '');

  const open = li.querySelector('.alert-open');
  if (open) {
    const sid = a.sessionId || null;
    open.hidden = !sid;
    if (sid) open.dataset.session = sid;
    else delete open.dataset.session;
  }
  const close = li.querySelector('.alert-dismiss');
  if (close) setAttr(close, 'aria-label', TXT.alerts.dismiss);
}

function renderAlerts() {
  const sec = $('#alerts');
  const list = $('#alerts-list');
  if (!sec || !list) return;
  const now = Date.now();

  for (const [key, until] of A.dismissed) if (until <= now) A.dismissed.delete(key);
  for (const [key, rec] of A.byKey) if (now - rec.lastSeen > 45000) A.byKey.delete(key);

  const all = [...A.byKey.values()].filter(rec => (A.dismissed.get(rec.key) || 0) <= now);
  all.sort((a, b) => b.lastSeen - a.lastSeen);
  const show = all.slice(0, 3);

  const seen = new Set();
  let i = 0;
  for (const rec of show) {
    seen.add(rec.key);
    let li = alertEls.get(rec.key);
    if (!li) {
      li = tpl('tpl-alert');
      if (!li) continue;
      alertEls.set(rec.key, li);
    }
    patchAlert(li, rec);
    if (list.children[i] !== li) list.insertBefore(li, list.children[i] || null);
    i++;
  }
  while (list.children.length > i) list.lastElementChild.remove();
  for (const [key, li] of alertEls) {
    if (!seen.has(key)) {
      alertEls.delete(key);
      li.remove();
    }
  }

  sec.hidden = show.length === 0;
  const more = $('#alerts-more');
  if (more) {
    const extra = all.length - show.length;
    more.hidden = extra <= 0;
    if (extra > 0) setText(more, TXT.alerts.overflow.replace('{n}', extra));
  }
}

function pruneAlerts() {
  renderAlerts();
}

function dismissAlert(key) {
  if (!key) return;
  A.dismissed.set(key, Date.now() + 10 * 60000);
  renderAlerts();
}

function connectAlerts() {
  const es = api.stream('/api/alerts');
  es.addEventListener('alert', e => {
    const a = parseJSON(e.data);
    if (a) onAlert(a);
  });
}

// ---- 14. toasts + announcer ----

const ann = { q: [], t: 0 };

function announce(msg) {
  if (!msg) return;
  ann.q.push(String(msg));
  if (!ann.t) ann.t = setTimeout(flushAnn, 1500);
}

function flushAnn() {
  const el = $('#announcer');
  const text = ann.q.length > 2
    ? ann.q.length + ' aggiornamenti: ' + ann.q.slice(0, 2).join('; ') + ' e altri'
    : ann.q.join('. ');
  ann.q = [];
  ann.t = 0;
  if (!el) return;
  el.textContent = '';
  setTimeout(() => {
    el.textContent = text;
  }, 50);
}

function notify(sev, text, sessionId) {
  announce(text);
  addToast(sev, text, sessionId);
}

function toastLamp(sev) {
  if (sev === 'alarm') return 'failed';
  if (sev === 'warn') return 'stuck';
  return 'active';
}

function armToast(el, ms) {
  el._left = ms;
  el._start = Date.now();
  clearTimeout(el._t);
  el._t = setTimeout(() => removeToast(el), ms);
}

function pauseToast(el) {
  if (!el._t) return;
  clearTimeout(el._t);
  el._t = 0;
  el._left = Math.max(0, el._left - (Date.now() - el._start));
}

function resumeToast(el) {
  if (el._t) return;
  armToast(el, el._left > 0 ? el._left : 1000);
}

function removeToast(el) {
  if (!el) return;
  clearTimeout(el._t);
  el.remove();
}

function addToast(sev, text, sessionId) {
  const box = $('#toasts');
  if (!box) return;
  const s = sev === 'alarm' ? 'alarm' : sev === 'warn' ? 'warn' : 'ok';
  while (box.children.length >= 3) removeToast(box.firstElementChild);

  const el = tpl('tpl-toast');
  if (!el) return;
  setAttr(el, 'data-sev', s);
  setAttr(el.querySelector('.lamp'), 'data-lamp', toastLamp(s));

  const open = el.querySelector('.toast-open');
  setText(open, text);
  if (sessionId) open.dataset.session = sessionId;
  else open.disabled = true;

  el.addEventListener('mouseenter', () => pauseToast(el));
  el.addEventListener('mouseleave', () => resumeToast(el));
  el.addEventListener('focusin', () => pauseToast(el));
  el.addEventListener('focusout', () => resumeToast(el));

  box.appendChild(el);
  armToast(el, s === 'alarm' ? 15000 : 8000);
}

// ---- 15. ticker ----

let lastPruneAt = 0;

function tick() {
  if (document.hidden) return;
  const now = Date.now();

  for (const el of $$('[data-ts]')) {
    const ts = Number(el.dataset.ts) || 0;
    if (!ts) continue;
    setText(el, relTime(ts));
  }
  for (const el of $$('[data-ts-start]')) {
    const start = Number(el.dataset.tsStart) || 0;
    if (!start) continue;
    setText(el, 'da ' + fmtDur(now - start));
  }

  if (C.state === 'retry' || C.state === 'offline') setConn(C.state);
  else if (C.state === 'live' && S.lastOverviewAt && now - S.lastOverviewAt > 15000) setConn('stale');

  if (now - lastPruneAt >= 5000) {
    lastPruneAt = now;
    pruneAlerts();
  }
  renderBadge();
}

// ---- 16. routing + mode ----

const mqDesk = matchMedia('(min-width:1280px)');
const mqMob = matchMedia('(max-width:767px)');

function syncNav(active) {
  for (const btn of $$('#mnav [data-nav]')) {
    setAttr(btn, 'aria-current', btn.dataset.nav === active ? 'page' : null);
  }
}

function setMView(view) {
  document.body.dataset.mview = view === 'center' ? 'center' : 'sessions';
  const tab = document.body.dataset.tab || 'feed';
  syncNav(document.body.dataset.mview === 'sessions' ? 'sessions' : tab);
  refreshLocks();
}

function applyTab(t, opts) {
  const o = opts || {};
  let tab = t === 'log' || t === 'system' ? t : 'feed';
  if (mqDesk.matches && tab === 'system') tab = 'feed';
  document.body.dataset.tab = tab;

  for (const btn of $$('#tabs [role="tab"]')) {
    const on = btn.dataset.tab === tab;
    setAttr(btn, 'aria-selected', on ? 'true' : 'false');
    setAttr(btn, 'tabindex', on ? '0' : '-1');
  }

  if (tab === 'log') startLog();
  if (!o.keepView && mqMob.matches) document.body.dataset.mview = 'center';
  syncNav(document.body.dataset.mview === 'sessions' ? 'sessions' : tab);
  refreshLocks();
  if (!o.silent) writeHash(false);
}

function applyModal() {
  const modal = !!S.selectedId && !mqDesk.matches;
  for (const id of ['hdr', 'alerts', 'zone-sessions', 'zone-center', 'mnav', 'toasts']) {
    const el = document.getElementById(id);
    if (el) el.inert = modal;
  }
  const det = $('#detail');
  if (!det) return;
  setAttr(det, 'role', modal ? 'dialog' : 'region');
  if (modal) det.setAttribute('aria-modal', 'true');
  else det.removeAttribute('aria-modal');
  refreshLocks();
}

function swapSystemRole() {
  const panel = $('#panel-system');
  if (!panel) return;
  if (mqDesk.matches) {
    setAttr(panel, 'role', 'region');
    setAttr(panel, 'aria-label', TXT.system.title);
    panel.removeAttribute('aria-labelledby');
  } else {
    setAttr(panel, 'role', 'tabpanel');
    panel.removeAttribute('aria-label');
    setAttr(panel, 'aria-labelledby', 'tab-system');
  }
}

function applyMode() {
  document.body.dataset.mode = mqDesk.matches ? 'desk' : 'modal';
  if (mqDesk.matches && document.body.dataset.tab === 'system') applyTab('feed', { silent: true });
  // Narrowing the window on Log/Sistema keeps that panel in view.
  if (mqMob.matches && !S.selectedId && document.body.dataset.tab !== 'feed') {
    document.body.dataset.mview = 'center';
    syncNav(document.body.dataset.tab);
  }
  swapSystemRole();
  applyModal();
  refreshLocks();
}

function writeHash(push) {
  const params = new URLSearchParams();
  if (S.selectedId) params.set('s', S.selectedId);
  const tab = document.body.dataset.tab || 'feed';
  if (tab !== 'feed') params.set('t', tab);
  const qs = params.toString();
  const url = location.pathname + location.search + (qs ? '#' + qs : '');
  if (push) history.pushState({ oc: 'detail' }, '', url);
  else history.replaceState(history.state, '', url);
}

function readHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const tab = params.get('t');
  const sid = params.get('s');
  if (tab) applyTab(tab, { silent: true });
  else applyTab('feed', { silent: true, keepView: true });
  if (sid) openSession(sid, { hash: false });
}

function onPopState() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const tab = params.get('t') || 'feed';
  const sid = params.get('s') || null;
  applyTab(tab, { silent: true, keepView: true });
  if (sid) {
    if (sid !== S.selectedId) openSession(sid, { hash: false });
  } else if (S.selectedId) {
    closeSession({ viaHistory: true });
  }
}

function renderBadge() {
  const el = $('#mnav-badge');
  if (!el) return;
  const n = statusCounts().attention;
  el.hidden = n === 0;
  setText(el, n);
}

function setSessionFilter(key) {
  if (!FILTER_TEST[key]) return;
  S.filter = key;
  for (const chip of $$('.fchip')) {
    setAttr(chip, 'aria-pressed', chip.dataset.filter === key ? 'true' : 'false');
  }
  renderSessions();
  savePrefs();
}

function setShowSub(on) {
  S.showSub = !!on;
  setAttr($('#subagents-toggle'), 'aria-pressed', S.showSub ? 'true' : 'false');
  renderSessions();
  savePrefs();
}

function savePrefs() {
  storeSet('ocmc:v1', {
    filter: S.filter,
    showSub: S.showSub,
    feedFilter: feed.filter,
    steps: feed.steps,
    logLevel: L.level,
  });
}

// ---- 17. keyboard + help ----

function showHelp() {
  const dlg = $('#help');
  if (!dlg || dlg.open) return;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

function closeHelp() {
  const dlg = $('#help');
  if (!dlg) return;
  if (typeof dlg.close === 'function') dlg.close();
  else dlg.removeAttribute('open');
}

function sessionRows() {
  return $$('#session-list .srow');
}

function focusRow(dir) {
  const rows = sessionRows();
  if (!rows.length) return;
  const active = document.activeElement;
  const current = active && active.closest ? active.closest('.srow') : null;
  if (!current) {
    const selected = rows.find(r => r.dataset.sessionId === S.selectedId);
    (selected || rows[0]).focus();
    return;
  }
  const i = rows.indexOf(current);
  const next = rows[Math.max(0, Math.min(rows.length - 1, i + dir))];
  if (next) {
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }
}

function stepSession(dir) {
  const ids = sessionRows().map(r => r.dataset.sessionId).filter(Boolean);
  if (!ids.length) return;
  const i = S.selectedId ? ids.indexOf(S.selectedId) : -1;
  if (i < 0) {
    openSession(ids[0]);
    return;
  }
  openSession(ids[Math.max(0, Math.min(ids.length - 1, i + dir))]);
}

function trapTab(e) {
  if (!S.selectedId || mqDesk.matches) return;
  const det = $('#detail');
  if (!det) return;
  const focusable = $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', det)
    .filter(el => !el.hidden && el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey) {
    if (active === first || !det.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    e.preventDefault();
    first.focus();
  }
}

function clearSearch() {
  const input = $('#search');
  if (!input) return;
  if (input.value) {
    input.value = '';
    S.search = '';
    renderSessions();
    input.focus();
  } else {
    input.blur();
  }
}

function clearLogSearch() {
  const input = $('#log-search');
  if (!input) return;
  if (input.value) {
    input.value = '';
    L.search = '';
    applyLogSearch();
    input.focus();
  } else {
    input.blur();
  }
}

function onKeydown(e) {
  if (e.defaultPrevented) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const help = $('#help');
  if (help && help.open) return;

  const target = e.target;
  const typing = !!(target && (
    target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT'
    || target.isContentEditable
  ));

  if (typing) {
    if (e.key !== 'Escape') return;
    if (target.id === 'search') {
      e.preventDefault();
      clearSearch();
    } else if (target.id === 'log-search') {
      e.preventDefault();
      clearLogSearch();
    }
    return;
  }

  if (e.key === 'Tab') {
    trapTab(e);
    return;
  }

  switch (e.key) {
    case '/': {
      e.preventDefault();
      if (mqMob.matches) setMView('sessions');
      const input = $('#search');
      if (input) {
        input.focus();
        input.select();
      }
      break;
    }
    case '?':
      e.preventDefault();
      showHelp();
      break;
    case 'Escape':
      if (S.selectedId) {
        e.preventDefault();
        closeSession();
      }
      break;
    case 'j':
      e.preventDefault();
      focusRow(1);
      break;
    case 'k':
      e.preventDefault();
      focusRow(-1);
      break;
    case 'ArrowDown': {
      const row = target.closest ? target.closest('.srow') : null;
      if (!row) return;
      e.preventDefault();
      focusRow(1);
      break;
    }
    case 'ArrowUp': {
      const row = target.closest ? target.closest('.srow') : null;
      if (!row) return;
      e.preventDefault();
      focusRow(-1);
      break;
    }
    case '.':
      e.preventDefault();
      stepSession(1);
      break;
    case ',':
      e.preventDefault();
      stepSession(-1);
      break;
    case '1':
      e.preventDefault();
      applyTab('feed');
      break;
    case '2':
      e.preventDefault();
      applyTab('log');
      break;
    case '3':
      e.preventDefault();
      if (mqDesk.matches) {
        if (S.selectedId) closeSession();
      } else {
        applyTab('system');
      }
      break;
    case 'a':
      e.preventDefault();
      setSessionFilter(S.filter === 'attention' ? 'all' : 'attention');
      break;
    case 'p':
      e.preventDefault();
      setFeedPaused(!feed.paused);
      break;
    case 'g':
      e.preventDefault();
      feedToTop();
      break;
    default:
      break;
  }
}

// ---- 18. events wiring ----

const sessionListEl = $('#session-list');
if (sessionListEl) {
  sessionListEl.addEventListener('click', e => {
    const row = e.target.closest('.srow');
    if (row && row.dataset.sessionId) openSession(row.dataset.sessionId);
  });
}

const feedListEl = $('#feed-list');
if (feedListEl) {
  feedListEl.addEventListener('click', e => {
    const row = e.target.closest('.frow');
    if (!row) return;
    if (row.dataset.session) openSession(row.dataset.session);
  });
}

const alertsListEl = $('#alerts-list');
if (alertsListEl) {
  alertsListEl.addEventListener('click', e => {
    const li = e.target.closest('.alert');
    if (!li) return;
    if (e.target.closest('.alert-dismiss')) {
      dismissAlert(li.dataset.key);
      return;
    }
    const open = e.target.closest('.alert-open');
    if (open && open.dataset.session) openSession(open.dataset.session);
  });
}

const toastsEl = $('#toasts');
if (toastsEl) {
  toastsEl.addEventListener('click', e => {
    const toast = e.target.closest('.toast');
    if (!toast) return;
    if (e.target.closest('.toast-close')) {
      removeToast(toast);
      return;
    }
    const open = e.target.closest('.toast-open');
    if (open && open.dataset.session) openSession(open.dataset.session);
  });
}

const childrenEl = $('#d-children');
if (childrenEl) {
  childrenEl.addEventListener('click', e => {
    const btn = e.target.closest('.child');
    if (btn && btn.dataset.session) openSession(btn.dataset.session);
  });
}

const metaEl = $('#d-meta');
if (metaEl) {
  metaEl.addEventListener('click', e => {
    const btn = e.target.closest('.link-btn');
    if (btn && btn.dataset.parent) openSession(btn.dataset.parent);
  });
}

const transcriptEl = $('#d-transcript');
if (transcriptEl) {
  transcriptEl.addEventListener('click', e => {
    const more = e.target.closest('.more');
    if (!more) return;
    const li = more.closest('.tx-item');
    const clamp = li && li.querySelector('.clamp');
    if (!clamp) return;
    clamp.classList.toggle('is-open');
    updateClamp(clamp, more);
  });
}

const kpisEl = $('.kpis');
if (kpisEl) {
  kpisEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'filter') setSessionFilter(btn.dataset.filter);
    else if (btn.dataset.action === 'tab') {
      // At desktop the system panel shares the right zone with the detail,
      // so the KPI only has to close the detail: the tab never changes.
      if (btn.dataset.tab === 'system' && mqDesk.matches) {
        if (S.selectedId) closeSession();
        return;
      }
      applyTab(btn.dataset.tab);
    }
  });
}

const filtersEl = $('.filters');
if (filtersEl) {
  filtersEl.addEventListener('click', e => {
    const chip = e.target.closest('.fchip');
    if (chip) setSessionFilter(chip.dataset.filter);
  });
}

const subToggleEl = $('#subagents-toggle');
if (subToggleEl) subToggleEl.addEventListener('click', () => setShowSub(!S.showSub));

const logSegEl = $('#panel-log .seg');
if (logSegEl) {
  logSegEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-log-level]');
    if (btn) setLogLevel(btn.dataset.logLevel);
  });
}

const logPauseEl = $('#log-pause');
if (logPauseEl) logPauseEl.addEventListener('click', () => setLogPaused(!L.paused));

const logSearchEl = $('#log-search');
let logSearchTimer = 0;
if (logSearchEl) {
  logSearchEl.addEventListener('input', () => {
    clearTimeout(logSearchTimer);
    logSearchTimer = setTimeout(() => {
      L.search = logSearchEl.value.trim().toLowerCase();
      applyLogSearch();
    }, 200);
  });
}

const logPillEl = $('#log-pill');
if (logPillEl) logPillEl.addEventListener('click', logToBottom);

const logScrollEl = $('#log-scroll');
if (logScrollEl) logScrollEl.addEventListener('scroll', onLogScroll, { passive: true });

let searchTimer = 0;
const searchEl = $('#search');
if (searchEl) {
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      S.search = searchEl.value;
      renderSessions();
    }, 150);
  });
}

const mnavEl = $('#mnav');
if (mnavEl) {
  mnavEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    if (btn.dataset.nav === 'sessions') setMView('sessions');
    else applyTab(btn.dataset.nav);
  });
}

const tabsEl = $('#tabs');
if (tabsEl) {
  tabsEl.addEventListener('click', e => {
    const btn = e.target.closest('[role="tab"]');
    if (btn) applyTab(btn.dataset.tab);
  });
  tabsEl.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const tabs = $$('#tabs [role="tab"]').filter(t => !t.hidden && t.offsetParent !== null);
    if (!tabs.length) return;
    const i = tabs.indexOf(document.activeElement);
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(i + dir + tabs.length) % tabs.length] || tabs[0];
    e.preventDefault();
    applyTab(next.dataset.tab);
    next.focus();
  });
}

const scrimEl = $('#scrim');
if (scrimEl) scrimEl.addEventListener('click', () => closeSession());

const dCloseEl = $('#d-close');
if (dCloseEl) dCloseEl.addEventListener('click', () => closeSession());

const helpBtnEl = $('#help-btn');
if (helpBtnEl) helpBtnEl.addEventListener('click', showHelp);

const helpCloseEl = $('#help-close');
if (helpCloseEl) helpCloseEl.addEventListener('click', closeHelp);

document.addEventListener('keydown', onKeydown);
window.addEventListener('popstate', onPopState);
document.addEventListener('visibilitychange', () => {
  standby.refresh();
  refreshLocks();
});

if (typeof mqDesk.addEventListener === 'function') {
  mqDesk.addEventListener('change', applyMode);
  mqMob.addEventListener('change', applyMode);
}
if (typeof RM.addEventListener === 'function') {
  RM.addEventListener('change', () => standby.refresh());
}

// ---- 19. init ----

function paintStoredPrefs(prefs) {
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  if (FILTER_TEST[p.filter]) S.filter = p.filter;
  if (typeof p.showSub === 'boolean') S.showSub = p.showSub;
  if (p.feedFilter === 'all' || p.feedFilter === 'tool' || p.feedFilter === 'problems') feed.filter = p.feedFilter;
  if (typeof p.steps === 'boolean') feed.steps = p.steps;
  if (p.logLevel === 'all' || p.logLevel === 'warn') L.level = p.logLevel;

  for (const chip of $$('.fchip')) {
    setAttr(chip, 'aria-pressed', chip.dataset.filter === S.filter ? 'true' : 'false');
  }
  setAttr($('#subagents-toggle'), 'aria-pressed', S.showSub ? 'true' : 'false');
  for (const btn of $$('.seg-btn[data-feed-filter]')) {
    setAttr(btn, 'aria-pressed', btn.dataset.feedFilter === feed.filter ? 'true' : 'false');
  }
  setAttr($('#steps-toggle'), 'aria-pressed', feed.steps ? 'true' : 'false');
  paintLogLevel();
  updateFeedMeta();
}

function loadFirstPaint() {
  api.get('/api/overview').then(d => {
    const list = Array.isArray(d) ? d : (d && d.sessions) || [];
    onOverview({ sessions: list });
  }).catch(() => {
    S.loaded = true;
    S.netError = true;
    renderSessions();
  });

  api.get('/api/activity?since=0').then(items => {
    feed.loaded = true;
    if (Array.isArray(items)) applyFeed(items, { live: false });
  }).catch(() => {
    feed.loaded = true;
    updateFeedMeta();
  });

  api.get('/api/alerts?once=1').then(list => {
    if (Array.isArray(list)) for (const a of list) onAlert(a, { quiet: true });
  }).catch(() => {
    // the SSE channel will deliver them
  });

  loadHealth();
}

function init() {
  paintStoredPrefs(storeGet('ocmc:v1', {}));
  applyMode();
  readHash();
  renderSessions();
  loadFirstPaint();
  connect();
  connectAlerts();
  setInterval(tick, 1000);
  setInterval(loadHealth, 60000);
  renderBadge();
}

init();

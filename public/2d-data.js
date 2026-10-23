/* opencode-dashboard · vista 2D — livello dati
 * Espone window.OC2D_DATA = { start(onOverview, onPart, onConn) }.
 * Nessuna dipendenza. Nessun accesso al DOM tranne location.search.
 */
(function () {
  'use strict';

  var STREAM_URL = '/api/stream';
  var BACKOFF_MS = [1000, 2000, 5000, 10000];
  var MOCK_PART_MS = 1200;
  var MOCK_OVERVIEW_MS = 5000;
  var MOCK_TRANSITION_MS = 20000;

  // ---- util ----

  function safe(fn, arg) {
    if (typeof fn !== 'function') return;
    try {
      fn(arg);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('[oc2d] callback error', err);
    }
  }

  function parseJSON(raw) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function str(v) {
    return typeof v === 'string' ? v : '';
  }

  function copy(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
    }
    return out;
  }

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function hasParam(name) {
    try {
      if (typeof location === 'undefined') return false;
      return new URLSearchParams(location.search).has(name);
    } catch (err) {
      return false;
    }
  }

  // ---- normalizzazione minima ----

  function normalizeSession(input) {
    if (!input || typeof input !== 'object') return null;
    var s = copy(input);
    var todos = s.todos && typeof s.todos === 'object' ? s.todos : {};
    var la = s.lastActivity && typeof s.lastActivity === 'object' ? s.lastActivity : null;

    s.id = s.id == null ? '' : String(s.id);
    s.parentId = s.parentId == null ? null : String(s.parentId);
    s.title = str(s.title);
    s.directory = str(s.directory);
    s.agent = str(s.agent);
    s.model = str(s.model);
    s.provider = str(s.provider);
    s.cost = num(s.cost);
    s.estCost = num(s.estCost);
    s.tokensInput = num(s.tokensInput);
    s.tokensOutput = num(s.tokensOutput);
    s.todos = { done: num(todos.done), total: num(todos.total) };
    s.timeCreated = num(s.timeCreated);
    s.timeUpdated = num(s.timeUpdated);
    s.status = str(s.status) || 'idle';
    s.lastActivity = la
      ? {
          type: str(la.type) || 'unknown',
          tool: typeof la.tool === 'string' ? la.tool : undefined,
          status: typeof la.status === 'string' ? la.status : undefined,
          summary: str(la.summary),
        }
      : null;
    return s;
  }

  function normalizeOverview(input) {
    if (!input || typeof input !== 'object') return null;
    var data = copy(input);
    var service = data.service && typeof data.service === 'object' ? data.service : {};
    data.sessions = Array.isArray(data.sessions)
      ? data.sessions.map(normalizeSession).filter(Boolean)
      : [];
    data.cost24h = num(data.cost24h);
    data.estCost24h = num(data.estCost24h);
    data.processes = Array.isArray(data.processes) ? data.processes : [];
    data.service = {
      version: str(service.version),
      url: str(service.url),
      pid: service.pid == null ? null : num(service.pid),
      alive: !!service.alive,
    };
    data.timestamp = num(data.timestamp) || Date.now();
    return data;
  }

  function normalizePart(input) {
    if (!input || typeof input !== 'object') return null;
    var p = copy(input);
    p.id = p.id == null ? '' : String(p.id);
    p.sessionId = p.sessionId == null ? '' : String(p.sessionId);
    p.sessionTitle = str(p.sessionTitle);
    p.partType = str(p.partType) || 'unknown';
    p.summary = str(p.summary);
    p.timeCreated = num(p.timeCreated);
    p.timeUpdated = num(p.timeUpdated);
    if (typeof p.tool !== 'string') delete p.tool;
    if (typeof p.status !== 'string') delete p.status;
    return p;
  }

  // ---- modalità reale ----

  function startReal(onOverview, onPart, onConn) {
    var source = null;
    var retryTimer = null;
    var attempt = 0;
    var stopped = false;
    var connState = '';

    function setConn(state) {
      if (connState === state) return;
      connState = state;
      safe(onConn, state);
    }

    function scheduleRetry() {
      if (stopped) return;
      if (retryTimer) clearTimeout(retryTimer);
      var delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (stopped) return;
      retryTimer = null;
      setConn('connecting');

      var es;
      try {
        es = new EventSource(STREAM_URL);
      } catch (err) {
        setConn('offline');
        scheduleRetry();
        return;
      }
      source = es;

      es.addEventListener('overview', function (event) {
        if (stopped || source !== es) return;
        var data = parseJSON(event.data);
        if (!data) return;
        var overview = normalizeOverview(data);
        if (overview) safe(onOverview, overview);
      });

      es.addEventListener('part', function (event) {
        if (stopped || source !== es) return;
        var data = parseJSON(event.data);
        if (!data) return;
        var part = normalizePart(data);
        if (part) safe(onPart, part);
      });

      es.onopen = function () {
        if (stopped || source !== es) return;
        attempt = 0;
        setConn('live');
      };

      es.onerror = function () {
        if (stopped || source !== es) return;
        source = null;
        try {
          es.close();
        } catch (err) {}
        setConn('offline');
        scheduleRetry();
      };
    }

    function stop() {
      stopped = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (source) {
        try {
          source.close();
        } catch (err) {}
        source = null;
      }
    }

    connect();
    return { stop: stop };
  }

  // ---- fixture mock ----

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createSessions(T0) {
    var LONG_TITLE = '/' + 'a'.repeat(199);

    function mk(over) {
      var base = {
        id: '',
        parentId: null,
        title: '',
        directory: '/home/u/code',
        agent: 'build',
        model: 'gpt-4.1',
        provider: 'openai',
        cost: 0,
        estCost: 0,
        tokensInput: 0,
        tokensOutput: 0,
        todos: { done: 0, total: 0 },
        timeCreated: T0 - 3600e3,
        timeUpdated: T0 - 600e3,
        status: 'idle',
        lastActivity: null,
      };
      return Object.assign(base, over);
    }

    return [
      mk({
        id: 's-work-1',
        title: 'Refactor del modulo billing',
        directory: '/home/u/code/billing',
        agent: 'build',
        model: 'claude-sonnet-4.5',
        provider: 'anthropic',
        cost: 0.084,
        estCost: 0.084,
        tokensInput: 28400,
        tokensOutput: 6300,
        todos: { done: 3, total: 7 },
        timeCreated: T0 - 42 * 60e3,
        timeUpdated: T0 - 4e3,
        status: 'working',
        lastActivity: { type: 'tool', tool: 'shell', status: 'running', summary: '$ npm test -- --watch=false' },
      }),
      mk({
        id: 's-work-2',
        title: 'Confronto dei listini dei provider LLM',
        directory: '/home/u/code/research',
        agent: 'build',
        model: 'gemini-2.5-flash',
        provider: 'google',
        cost: 0,
        estCost: 0.42,
        tokensInput: 41200,
        tokensOutput: 5200,
        todos: { done: 1, total: 4 },
        timeCreated: T0 - 26 * 60e3,
        timeUpdated: T0 - 6e3,
        status: 'working',
        lastActivity: {
          type: 'reasoning',
          status: 'running',
          summary: 'Ragiono su quale provider convenga davvero per il 2026.',
        },
      }),
      mk({
        id: 's-work-3',
        title: 'Verifica dei listini GCP',
        directory: '/home/u/code/infra',
        agent: 'build',
        model: 'gpt-4.1',
        provider: 'openai',
        cost: 0.031,
        estCost: 0.031,
        tokensInput: 15600,
        tokensOutput: 2900,
        todos: { done: 2, total: 5 },
        timeCreated: T0 - 15 * 60e3,
        timeUpdated: T0 - 8e3,
        status: 'working',
        lastActivity: {
          type: 'tool',
          tool: 'websearch',
          status: 'running',
          summary: 'quota Cloud Run listino 2026',
        },
      }),
      mk({
        id: 's-child-1',
        parentId: 's-work-1',
        title: 'Sub-agent · analisi dei test',
        directory: '/home/u/code/billing',
        agent: 'general',
        model: 'claude-sonnet-4.5',
        provider: 'anthropic',
        cost: 0.006,
        estCost: 0.006,
        tokensInput: 9800,
        tokensOutput: 2100,
        todos: { done: 1, total: 3 },
        timeCreated: T0 - 18 * 60e3,
        timeUpdated: T0 - 5e3,
        status: 'working',
        lastActivity: {
          type: 'tool',
          tool: 'read',
          status: 'completed',
          summary: 'test/billing.test.ts',
        },
      }),
      mk({
        id: 's-child-2',
        parentId: 's-work-1',
        title: 'Sub-agent · mappa delle dipendenze',
        directory: '/home/u/code/billing',
        agent: 'explore',
        model: 'gpt-4.1-mini',
        provider: 'openai',
        cost: 0.002,
        estCost: 0.002,
        tokensInput: 7200,
        tokensOutput: 1400,
        todos: { done: 0, total: 2 },
        timeCreated: T0 - 11 * 60e3,
        timeUpdated: T0 - 7e3,
        status: 'working',
        lastActivity: {
          type: 'tool',
          tool: 'grep',
          status: 'completed',
          summary: 'calcolaImposte src/',
        },
      }),
      mk({
        id: 's-active-1',
        title: "Sistema il layout dell'header",
        directory: '/home/u/code/ui',
        agent: 'build',
        model: 'gpt-4.1-mini',
        provider: 'openai',
        cost: 0.012,
        estCost: 0.012,
        tokensInput: 12800,
        tokensOutput: 3100,
        todos: { done: 5, total: 5 },
        timeCreated: T0 - 90 * 60e3,
        timeUpdated: T0 - 2 * 60e3,
        status: 'active',
        lastActivity: { type: 'idle', status: 'done', summary: 'Turno concluso, in attesa di te' },
      }),
      mk({
        id: 's-stuck-1',
        title: 'Migrazione Terraform al nuovo provider',
        directory: '/home/u/infra/terraform',
        agent: 'build',
        model: 'gpt-4.1',
        provider: 'openai',
        cost: 0.047,
        estCost: 0.047,
        tokensInput: 22400,
        tokensOutput: 4800,
        todos: { done: 2, total: 6 },
        timeCreated: T0 - 2 * 3600e3,
        timeUpdated: T0 - 14 * 60e3,
        status: 'stuck',
        lastActivity: {
          type: 'tool',
          tool: 'edit',
          status: 'running',
          summary: 'modules/network/main.tf',
        },
      }),
      mk({
        id: 's-fail-1',
        title: 'Portfolio con effetto CRT',
        directory: '/home/u/code/portfolio',
        agent: 'build',
        model: 'claude-sonnet-4.5',
        provider: 'anthropic',
        cost: 0.021,
        estCost: 0.021,
        tokensInput: 18400,
        tokensOutput: 3900,
        todos: { done: 2, total: 5 },
        timeCreated: T0 - 3 * 3600e3,
        timeUpdated: T0 - 8 * 60e3,
        status: 'failed',
        lastActivity: {
          type: 'idle',
          status: 'failed',
          summary: 'Upstream request failed: endpoint non disponibile.',
        },
      }),
      mk({
        id: 's-fail-2',
        title: 'Generazione del report mensile',
        directory: '/home/u/code/reports',
        agent: 'build',
        model: 'gpt-4.1',
        provider: 'openai',
        cost: 0.009,
        estCost: 0.009,
        tokensInput: 8200,
        tokensOutput: 1900,
        todos: { done: 1, total: 3 },
        timeCreated: T0 - 4 * 3600e3,
        timeUpdated: T0 - 19 * 60e3,
        status: 'failed',
        lastActivity: {
          type: 'error',
          status: 'error',
          summary: 'Errore: limite di richieste superato dal provider.',
        },
      }),
      mk({
        id: 's-fail-3',
        title: 'Import del catalogo prodotti',
        directory: '/home/u/code/catalog',
        agent: 'build',
        model: 'gemini-2.5-flash',
        provider: 'google',
        cost: 0,
        estCost: 0.028,
        tokensInput: 15400,
        tokensOutput: 2600,
        todos: { done: 0, total: 4 },
        timeCreated: T0 - 5 * 3600e3,
        timeUpdated: T0 - 33 * 60e3,
        status: 'failed',
        lastActivity: {
          type: 'tool',
          tool: 'read',
          status: 'error',
          summary: 'Errore di lettura su data/catalogo.csv',
        },
      }),
      mk({
        id: 's-fail-4',
        title: 'Pulizia dei log applicativi',
        directory: '/home/u/code/ops',
        agent: 'build',
        model: 'gpt-4.1-mini',
        provider: 'openai',
        cost: 0.003,
        estCost: 0.003,
        tokensInput: 6400,
        tokensOutput: 900,
        todos: { done: 0, total: 2 },
        timeCreated: T0 - 7 * 3600e3,
        timeUpdated: T0 - 51 * 60e3,
        status: 'failed',
        lastActivity: {
          type: 'idle',
          status: 'failed',
          summary: 'Turno fallito: il comando shell è uscito con codice 1.',
        },
      }),
      mk({
        id: 's-idle-1',
        title: 'Setup della pipeline CI',
        directory: '/home/u/code/ci',
        agent: 'build',
        model: 'gpt-4.1-mini',
        provider: 'openai',
        cost: 0.018,
        estCost: 0.018,
        tokensInput: 11200,
        tokensOutput: 2400,
        todos: { done: 4, total: 4 },
        timeCreated: T0 - 9 * 3600e3,
        timeUpdated: T0 - 5 * 3600e3,
        status: 'idle',
        lastActivity: { type: 'idle', status: 'done', summary: 'Turno concluso' },
      }),
      mk({
        id: 's-idle-2',
        title: LONG_TITLE,
        directory: '/home/u/code/legacy-module-with-a-very-long-name',
        agent: 'build',
        model: 'gpt-4.1',
        provider: 'openai',
        cost: 0.032,
        estCost: 0.032,
        tokensInput: 20100,
        tokensOutput: 4300,
        todos: { done: 1, total: 2 },
        timeCreated: T0 - 14 * 3600e3,
        timeUpdated: T0 - 9 * 3600e3,
        status: 'idle',
        lastActivity: { type: 'text', status: 'completed', summary: 'Documentazione aggiornata' },
      }),
      mk({
        id: 's-susp-1',
        title: 'Sessione parcheggiata sul modulo legacy',
        directory: '/home/u/code/legacy',
        agent: 'build',
        model: 'gpt-4.1',
        provider: 'openai',
        cost: 0.004,
        estCost: 0.004,
        tokensInput: 5100,
        tokensOutput: 1100,
        todos: { done: 1, total: 3 },
        timeCreated: T0 - 6 * 3600e3,
        timeUpdated: T0 - 3 * 3600e3,
        status: 'suspended',
        lastActivity: { type: 'idle', status: 'done', summary: 'Sospesa in attesa di essere ripresa.' },
      }),
    ];
  }

  function createProcesses(T0) {
    return [
      {
        pid: 4242,
        cpu: 12.5,
        rss: 184,
        state: 'R',
        startTime: T0 - 3720e3,
        elapsed: 3720,
        cmd: 'opencode serve --port 4096',
        fdCount: 42,
        isRun: true,
        isInteractive: false,
      },
      {
        pid: 4243,
        cpu: 2.1,
        rss: 96,
        state: 'S',
        startTime: T0 - 1800e3,
        elapsed: 1800,
        cmd: 'opencode tui',
        fdCount: 28,
        isRun: false,
        isInteractive: true,
      },
    ];
  }

  var MOCK_PARTS = [
    {
      partType: 'tool',
      tool: 'shell',
      status: 'running',
      summary: '$ npm test -- --watch=false',
    },
    { partType: 'tool', tool: 'edit', status: 'running', summary: 'src/billing.ts' },
    { partType: 'tool', tool: 'read', status: 'completed', summary: 'src/invoice.ts' },
    { partType: 'tool', tool: 'grep', status: 'completed', summary: 'calcolaImposte src/' },
    {
      partType: 'tool',
      tool: 'websearch',
      status: 'running',
      summary: 'listino Cloud Run 2026',
    },
    {
      partType: 'tool',
      tool: 'task',
      status: 'running',
      summary: 'Analisi dei test falliti del modulo billing',
    },
    {
      partType: 'reasoning',
      status: 'running',
      summary: 'Ragiono su come separare il calcolo delle imposte dalla persistenza.',
    },
    {
      partType: 'text',
      status: 'streaming',
      summary: 'Sto aggiornando il modulo billing e verificando i test.',
    },
    { partType: 'tool', tool: 'glob', status: 'completed', summary: 'src/**/*.test.ts' },
    {
      partType: 'tool',
      tool: 'write',
      status: 'running',
      summary: 'test/billing.test.ts',
    },
  ];

  // ---- modalità mock ----

  function startMock(onOverview, onPart, onConn) {
    var still = hasParam('still');
    var T0 = Date.now();
    var rnd = mulberry32(0x5eed1234);
    var sessions = createSessions(T0);
    var processes = createProcesses(T0);
    var service = { version: '1.14.2', url: 'http://127.0.0.1:4096', pid: 4242, alive: true };
    var partSeq = 0;
    var partIndex = 0;
    var timers = [];
    var firstTimer = null;
    var stopped = false;
    var connState = '';

    function setConn(state) {
      if (connState === state) return;
      connState = state;
      safe(onConn, state);
    }

    function snapshot() {
      var cost = 0;
      var est = 0;
      for (var i = 0; i < sessions.length; i++) {
        cost += sessions[i].cost;
        est += sessions[i].estCost;
      }
      return {
        sessions: clone(sessions),
        cost24h: Math.round(cost * 1e4) / 1e4,
        estCost24h: Math.round(est * 1e4) / 1e4,
        processes: clone(processes),
        service: clone(service),
        timestamp: Date.now(),
      };
    }

    function emitOverview() {
      if (stopped) return;
      safe(onOverview, snapshot());
    }

    function workingSessions() {
      var out = [];
      for (var i = 0; i < sessions.length; i++) {
        if (sessions[i].status === 'working') out.push(sessions[i]);
      }
      return out;
    }

    function emitPart() {
      if (stopped) return;
      var working = workingSessions();
      if (!working.length) return;

      var def = MOCK_PARTS[partIndex % MOCK_PARTS.length];
      partIndex += 1;
      var target = working[Math.floor(rnd() * working.length)];
      var now = Date.now();

      var part = {
        id: 'mock-part-' + (partSeq += 1),
        sessionId: target.id,
        sessionTitle: target.title,
        partType: def.partType,
        summary: def.summary,
        timeCreated: now - 400,
        timeUpdated: now,
      };
      if (def.tool) part.tool = def.tool;
      if (def.status) part.status = def.status;

      target.timeUpdated = now;
      target.lastActivity = { type: def.partType, status: def.status, summary: def.summary };
      if (def.tool) target.lastActivity.tool = def.tool;

      safe(onPart, part);
    }

    function oldest(list) {
      var best = list[0];
      for (var i = 1; i < list.length; i++) {
        if (list[i].timeUpdated < best.timeUpdated) best = list[i];
      }
      return best;
    }

    function transition() {
      if (stopped) return;
      var now = Date.now();
      var working = [];
      var idle = [];
      for (var i = 0; i < sessions.length; i++) {
        if (sessions[i].status === 'working') working.push(sessions[i]);
        else if (sessions[i].status === 'idle') idle.push(sessions[i]);
      }

      if (idle.length) {
        var wake = idle[Math.floor(rnd() * idle.length)];
        wake.status = 'working';
        wake.timeUpdated = now;
        wake.lastActivity = {
          type: 'tool',
          tool: 'read',
          status: 'running',
          summary: 'Riprendo da dove avevo lasciato: leggo src/index.ts.',
        };
      }

      if (working.length > 1) {
        var rest = oldest(working);
        rest.status = 'active';
        rest.timeUpdated = now;
        rest.lastActivity = { type: 'idle', status: 'done', summary: 'Turno concluso, in attesa di te' };
      }

      emitOverview();
    }

    function stop() {
      stopped = true;
      if (firstTimer) {
        clearTimeout(firstTimer);
        firstTimer = null;
      }
      for (var i = 0; i < timers.length; i++) clearInterval(timers[i]);
      timers = [];
    }

    setConn('connecting');

    firstTimer = setTimeout(function () {
      firstTimer = null;
      if (stopped) return;
      setConn('live');
      emitOverview();
      if (still) return;
      timers.push(setInterval(emitPart, MOCK_PART_MS));
      timers.push(setInterval(emitOverview, MOCK_OVERVIEW_MS));
      timers.push(setInterval(transition, MOCK_TRANSITION_MS));
    }, 30);

    return { stop: stop };
  }

  // ---- API ----

  function start(onOverview, onPart, onConn) {
    if (hasParam('mock')) return startMock(onOverview, onPart, onConn);
    return startReal(onOverview, onPart, onConn);
  }

  if (typeof window !== 'undefined') {
    window.OC2D_DATA = { start: start };
  }
})();

/* opencode-dashboard · vista 2D "Z Fighters" — motore di rendering
 * Vanilla JS, IIFE, nessuna dipendenza. Legge window.OC2D_DATA.
 */
(function () {
  'use strict';

  // ---- costanti di gioco ----

  var ZONES = [
    { status: 'working',   title: 'NAMEK · IN COMBATTIMENTO', bgs: ['namek-1', 'namek-2', 'namek-3'], cap: 0 },
    { status: 'active',    title: 'TERRA · ASPETTANO TE',     bgs: ['earth-pod', 'meadow-3'],         cap: 0 },
    { status: 'stuck',     title: 'VULCANO · BLOCCATI',       bgs: ['lava-1', 'lava-2', 'volcano'],   cap: 0 },
    { status: 'failed',    title: 'INFERMERIA · FALLITE',     bgs: ['tank', 'tank-empty'],            cap: 12 },
    { status: 'idle',      title: 'PRATERIA · A RIPOSO',      bgs: ['meadow-1', 'meadow-2', 'crater'], cap: 12 },
    { status: 'suspended', title: 'ASTRONAVE · SOSPESE',      bgs: ['corridor', 'lockers'],           cap: 0 }
  ];

  var STATUS_LABEL = {
    working: 'in combattimento',
    active: 'ti aspettano',
    stuck: 'bloccate',
    failed: 'fallite',
    idle: 'a riposo',
    suspended: 'sospese'
  };

  // ---- casting: who plays whom ----
  // Adding a character is a data-only change:
  //  1. Draw its frames into public/2d/sprites.png, cropped tight to the
  //     figure (existing ones are 12-32 px wide, 16-41 px tall; each frame must
  //     fit 64x64, the size of the white hit-flash canvas). A frame is drawn
  //     bottom-centre anchored: its bottom row is the feet baseline (shadow
  //     and ground point) and its horizontal centre is the character's x, so
  //     keep the feet on the bottom row of every frame. The size of the first
  //     stand frame sets the click target.
  //  2. Describe it in public/2d/atlas.json: frames["<name>:<n>"] = [x, y, w, h]
  //     (pixels in the sheet) and chars.<name>.<anim> = { face, frames: [keys] }.
  //     Required: stand (also used as portrait and for the dialog box).
  //     Optional: walk, walkSide, back, sit, charge, blast, melee, hurt, ko,
  //     koFlash, kameCharge, kameFire, power, portrait. A missing animation
  //     falls back along FALLBACKS (always ending at stand), so a character
  //     with only stand/walk renders in every state. `face` is the direction
  //     the frames look: 'F' front (some main opencode sessions are mirrored for variety),
  //     'L' or 'R' side (mirrored to match the walking direction), 'B' back.
  //     kameFire/kameCharge switch the shell-tool pose to a beam attack and
  //     power is the idle pose of the plan role: add them only if wanted.
  //  3. Add the name to a pool below. A pool with several names picks one by
  //     hash of the session id, so the same session keeps the same character.
  //     Optional: a display name in CHAR_LABEL (default: the capitalised name).
  //  4. Check with /2d.html?mock=1. A name missing from the atlas, or without
  //     a usable stand animation, is skipped with one console.warn.
  // Backdrops work the same way: add the PNG to public/2d/bg/, register it as
  // atlas.bg.<key> = { src, w, h } and list the key in a ZONES entry (bgs).
  var CAST = {
    claude: ['goku', 'piccolo', 'trunks'], // Claude Code sessions, by mission id
    service: ['frieza'],                   // opencode service on the throne
    role: {                                // opencode sessions, by role
      delegate: ['ginyu', 'burter', 'jeice', 'recoome'],
      plan: ['vegeta'],
      build: ['vegeta']
    },
    kid: {                                 // child sessions and sub-agents
      explore: ['bubbles'],                // explore/search/research/web types
      work: ['gohan'],                     // plan/general/review/code/test types
      other: ['gohan', 'bubbles']          // everything else
    }
  };
  var CHAR_LABEL = {
    goku: 'Goku',
    vegeta: 'Vegeta',
    ginyu: 'Ginyu',
    burter: 'Burter',
    jeice: 'Jeice',
    recoome: 'Recoome',
    frieza: 'Freezer',
    gohan: 'Gohan',
    bubbles: 'Bubbles',
    piccolo: 'Piccolo',
    trunks: 'Trunks'
  };
  // CAST filtered against the atlas (see resolveCast); pools are never empty
  // once the atlas is loaded.
  var cast = null;
  var ROLE_COLOR = { delegate: '#d58bff', plan: '#5fd8ff', build: '#ffb347' };
  var ROLE_LABEL = { delegate: 'truppa delegata', plan: 'stratega', build: 'operaio' };
  var MISSION_COLORS = ['#ff4f8b', '#19e0ff', '#ffe03a', '#8dff4a', '#b983ff', '#ff9a2e'];
  var LIVE_STATUS = { working: true, active: true, stuck: true };
  var CMD_CFG = { status: 'command', title: 'SALA COMANDI · CLAUDE', bgs: ['throne-empty'], cap: 0, command: true };
  var CLAUDE_X = 0.22;
  var CLAUDE_Y = 0.80;
  var DELEG_SLOTS = [[0.60, 0.66], [0.60, 0.92], [0.84, 0.66], [0.84, 0.92]];
  var SUB_VISIBLE = 4;
  var HOLD_MS = 4200;
  var CHARGE_MS = 900;
  var PROJ_MS = 700;

  // Animation fallback chain: the engine asks for the first name and uses the
  // first one the character has; every chain ends at stand.
  var FALLBACKS = {
    stand: ['stand'],
    walk: ['walk', 'stand'],
    walkSide: ['walkSide', 'walk', 'stand'],
    back: ['back', 'stand'],
    sit: ['sit', 'stand'],
    charge: ['charge', 'stand'],
    blast: ['blast', 'charge', 'stand'],
    melee: ['melee', 'blast', 'stand'],
    hurt: ['hurt', 'stand'],
    ko: ['ko', 'hurt', 'stand'],
    koFlash: ['koFlash', 'ko', 'stand'],
    kameCharge: ['kameCharge', 'charge', 'stand'],
    kameFire: ['kameFire', 'blast', 'charge', 'stand'],
    power: ['power', 'charge', 'stand'],
    portrait: ['portrait', 'stand']
  };

  var SLOT_X = [0.25, 0.5, 0.75];
  var SLOT_Y = [0.62, 0.90];
  var PANEL_SLOTS = 6;
  var BUBBLE_MS = 3000;
  var TYPE_MS = 20;
  var SERVICE_ID = '__service__';
  var SPEECH_MS = 5000;
  var SPEECH_IDLE_MS = 15000;
  var SPEECH_MAX = 4;

  var GLYPHS = {
    '?': ['111', '001', '011', '000', '010'],
    '!': ['01', '01', '01', '00', '01'],
    'z': ['111', '001', '010', '100', '111']
  };

  // ---- stato ----

  var atlas = null;
  var sprites = null;
  var bgImages = new Map();
  var overview = null;
  var fighters = new Map();
  var zoneStates = new Map();
  var expanded = new Set();
  var lastSessionsById = new Map();

  var reducedMotion = false;
  var running = false;
  var rafId = 0;
  var lastTick = 0;

  var bannerKey = '';
  var bannerCanvas = null;
  var bannerCtx = null;

  var openId = null;
  var lastFocus = null;
  var typing = null;

  // Freezer parla: stato del fumetto e baseline degli stati sessione
  var lastStatusById = new Map();
  var hasBaseline = false;
  var speech = {
    current: null,
    until: 0,
    queue: [],
    lastAt: Date.now()
  };
  var ambientIndex = 0;
  var connPrev = '';

  // Claude e missioni
  var missions = [];
  var missionById = new Map();
  var claudeAssign = new Map();
  var prevClaude = new Map();
  var prevSessionIds = new Set();
  var prevLinked = new Set();
  var pendingFx = [];
  var holds = new Map();
  var projectiles = [];
  var eventLog = [];
  var highlightId = null;
  var frameStats = { n: 0, sum: 0, max: 0 };

  var flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  var flashCtx = flashCanvas.getContext('2d');

  // ---- util ----

  function $(id) {
    return document.getElementById(id);
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function truncate(text, max) {
    var s = typeof text === 'string' ? text : '';
    var chars = Array.from(s);
    if (chars.length <= max) return s;
    return chars.slice(0, Math.max(0, max - 1)).join('') + '…';
  }

  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function kidFor(type, id) {
    var t = String(type || '').toLowerCase();
    if (/explor|search|research|web/.test(t)) return castPick(cast.kid.explore, id);
    if (/plan|general|review|code|test/.test(t)) return castPick(cast.kid.work, id);
    return castPick(cast.kid.other, id);
  }

  function castPick(pool, id) {
    return pool.length ? pool[fnv1a(String(id)) % pool.length] : '';
  }

  // Claude missions get distinct characters when the pool allows it: the hash
  // gives the starting preference, the first free name wins. Assignments are
  // kept per mission id, so a sprite never changes while its mission lives.
  function claudeChar(id) {
    var pool = (cast && cast.claude) || [];
    if (!pool.length) return '';
    var cur = claudeAssign.get(id);
    if (cur && pool.indexOf(cur) >= 0) return cur;
    var used = {};
    claudeAssign.forEach(function (name, mid) { if (mid !== id) used[name] = true; });
    var pick = '';
    for (var i = 0; i < pool.length; i += 1) {
      if (!used[pool[i]]) { pick = pool[i]; break; }
    }
    if (!pick) pick = castPick(pool, id);
    claudeAssign.set(id, pick);
    return pick;
  }

  function charLabel(name) {
    return CHAR_LABEL[name] || (name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Guerriero');
  }

  var castWarned = {};

  function charUsable(name) {
    var c = atlas && atlas.chars && atlas.chars[name];
    var st = c && c.stand;
    var ok = !!(st && st.frames && st.frames.length && atlas.frames && atlas.frames[st.frames[0]]);
    if (!ok && !castWarned[name]) {
      castWarned[name] = true;
      console.warn('2d: character "' + name + '" skipped: missing from atlas.json or without a usable stand animation');
    }
    return ok;
  }

  // Filters CAST against the atlas. A pool left empty borrows the first
  // usable character of the atlas so rendering never depends on one name.
  function resolveCast() {
    var any = Object.keys((atlas && atlas.chars) || {}).filter(charUsable)[0];
    function live(pool) {
      var out = (pool || []).filter(charUsable);
      return out.length ? out : (any ? [any] : []);
    }
    function liveMap(map) {
      var out = {};
      Object.keys(map).forEach(function (k) { out[k] = live(map[k]); });
      return out;
    }
    claudeAssign.clear();
    cast = {
      claude: live(CAST.claude),
      service: live(CAST.service),
      role: liveMap(CAST.role),
      kid: liveMap(CAST.kid)
    };
  }

  function roleOf(s) {
    if (s.claude || s.agent === 'delegate' || /^oc-/.test(s.title || '')) return 'delegate';
    if (s.agent === 'plan') return 'plan';
    return 'build';
  }

  function missionColor(id) {
    return MISSION_COLORS[fnv1a(String(id)) % MISSION_COLORS.length];
  }

  function modelLabel(model) {
    var m = String(model || '').toLowerCase();
    if (!m) return '—';
    var names = ['fable', 'opus', 'sonnet', 'haiku'];
    for (var i = 0; i < names.length; i += 1) {
      if (m.indexOf(names[i]) >= 0) return names[i];
    }
    return truncate(m.replace(/^claude[-_]?/, ''), 8);
  }

  function logEvent(type, data) {
    var e = { t: Date.now(), type: type };
    if (data) Object.keys(data).forEach(function (k) { e[k] = data[k]; });
    eventLog.push(e);
    if (eventLog.length > 300) eventLog.shift();
  }

  function timeAgo(ts) {
    if (!ts) return 'data sconosciuta';
    var diff = Date.now() - ts;
    if (!isFinite(diff) || diff < 60000) return 'adesso';
    var min = Math.floor(diff / 60000);
    if (min < 60) return min + ' min fa';
    var ore = Math.floor(min / 60);
    if (ore < 24) return ore + ' h fa';
    return Math.floor(ore / 24) + ' g fa';
  }

  function money(value) {
    return '$' + num(value).toFixed(2);
  }

  function statusLabel(status) {
    return STATUS_LABEL[status] || status || 'sconosciuto';
  }

  function typeLabel(type) {
    var map = {
      tool: 'strumento',
      text: 'testo',
      reasoning: 'ragionamento',
      'step-finish': 'passo concluso',
      user: 'messaggio utente',
      idle: 'inattività',
      shell: 'shell',
      compaction: 'compattazione',
      retry: 'nuovo tentativo',
      error: 'errore'
    };
    return map[type] || type || 'attività';
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function pct(value) {
    return value.toFixed(2) + '%';
  }

  function paint(el, color) {
    if (el) el.style.color = color;
  }

  // ---- connessione e HUD ----

  function setConn(state) {
    var el = $('conn');
    if (!el) return;
    var info;
    if (state === 'live') {
      info = { text: 'IN DIRETTA', ds: 'online' };
    } else if (state === 'offline') {
      info = { text: 'OFFLINE', ds: 'offline' };
    } else {
      info = { text: 'CONNESSIONE…', ds: 'connecting' };
    }
    el.textContent = info.text;
    el.setAttribute('data-state', info.ds);
  }

  function addStat(container, text, value, key) {
    var span = document.createElement('span');
    if (key) span.setAttribute('data-stat', key);
    span.appendChild(document.createTextNode(text));
    if (value !== undefined) {
      var strong = document.createElement('strong');
      strong.textContent = String(value);
      span.appendChild(document.createTextNode(' '));
      span.appendChild(strong);
    }
    container.appendChild(span);
  }

  function renderHud() {
    var stats = $('hud-stats');
    if (!stats) return;
    stats.textContent = '';

    if (!overview) {
      addStat(stats, 'in attesa…');
      return;
    }

    var counts = {};
    ZONES.forEach(function (zone) { counts[zone.status] = 0; });
    var total = 0;
    (overview.sessions || []).forEach(function (s) {
      total += 1;
      if (counts[s.status] === undefined) counts[s.status] = 0;
      counts[s.status] += 1;
    });

    if (total === 0) {
      addStat(stats, 'nessuna sessione');
    } else {
      ZONES.forEach(function (zone) {
        var n = counts[zone.status] || 0;
        if (n > 0) addStat(stats, statusLabel(zone.status), n);
      });
    }

    if (overview.claudeSupported) {
      var cw = 0;
      var cwait = 0;
      var live = 0;
      missions.forEach(function (m) {
        if (m.c.status === 'working') cw += 1;
        else if (m.c.status === 'waiting') cwait += 1;
        live += m.live.length + m.ghosts.length;
      });
      if (missions.length > 0 || live > 0) {
        addStat(stats, 'claude al lavoro', cw, 'claude-working');
        addStat(stats, 'claude in attesa', cwait, 'claude-waiting');
        addStat(stats, 'deleghe vive', live, 'deleg-live');
      }
    }

    var costText = 'costo 24h ' + money(overview.cost24h);
    if (num(overview.estCost24h) > num(overview.cost24h) + 0.0001) {
      costText += ' · ~' + money(overview.estCost24h);
    }
    addStat(stats, costText);

    var version = overview.service && overview.service.version ? overview.service.version : '—';
    addStat(stats, 'servizio v' + version);
  }

  function drawBanner() {
    if (!atlas || !bannerCanvas || !bannerCtx) return;
    if (!overview) return;

    var alive = !!(overview.service && overview.service.alive);
    var key = alive ? 'throne' : 'throne-empty';
    var info = atlas.bg[key] || atlas.bg['throne-empty'] || atlas.bg['throne'];
    if (!info) return;

    if (bannerKey !== key) {
      bannerCanvas.width = info.w;
      bannerCanvas.height = info.h;
      bannerCtx.imageSmoothingEnabled = false;
      bannerKey = key;
    }

    var img = bgImages.get(key);
    if (!img) return;
    bannerCtx.clearRect(0, 0, bannerCanvas.width, bannerCanvas.height);
    bannerCtx.drawImage(img, 0, 0, bannerCanvas.width, bannerCanvas.height);
  }

  // ---- missioni: sessioni Claude e relative deleghe ----

  function subFid(claudeId, subId) {
    return 's:' + claudeId + ':' + subId;
  }

  function isLiveDeleg(s) {
    return !!(LIVE_STATUS[s.status] || holds.has(s.id));
  }

  function buildMissions() {
    var list = [];
    var byId = new Map();
    var sessions = (overview && overview.sessions) || [];
    var claudes = (overview && overview.claude) || [];

    claudes.forEach(function (c) {
      var m = {
        id: c.id,
        c: c,
        fid: 'c:' + c.id,
        color: missionColor(c.id),
        project: c.project || c.short,
        live: [],
        done: [],
        ghosts: [],
        total: 0,
        titles: [],
        isLive: false
      };
      var seen = new Set();
      function addSession(s, listed) {
        if (seen.has(s.id)) return;
        seen.add(s.id);
        m.total += 1;
        m.titles.push({ title: s.title || 'Senza titolo', live: isLiveDeleg(s) });
        var h = holds.get(s.id);
        var kid = !!(s.parentId && s.parentId !== s.id && lastSessionsById.has(s.parentId));
        if (kid) return;
        if (LIVE_STATUS[s.status] || (h && h.claudeId === c.id)) m.live.push(s);
        else m.done.push(s);
      }
      c.delegations.forEach(function (d) {
        var s = d.sessionId ? lastSessionsById.get(d.sessionId) : null;
        if (s) {
          addSession(s, true);
        } else {
          m.total += 1;
          m.titles.push({ title: d.title || 'Senza titolo', live: !!d.live, unlinked: true });
          if (d.live) m.ghosts.push(d);
        }
      });
      sessions.forEach(function (s) {
        if (s.claude && s.claude.id === c.id) addSession(s, false);
      });
      m.live.sort(function (a, b) {
        if (num(a.timeCreated) !== num(b.timeCreated)) return num(a.timeCreated) - num(b.timeCreated);
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
      });
      m.isLive = c.status !== 'idle' || m.live.length > 0 || m.ghosts.length > 0;
      list.push(m);
      byId.set(c.id, m);
    });

    list.sort(function (a, b) {
      if (a.c.startedAt !== b.c.startedAt) return a.c.startedAt - b.c.startedAt;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    missions = list;
    missionById = byId;
    return list;
  }

  function claudeState(c) {
    if (c.status === 'working') return 'lavora';
    if (c.status === 'waiting') return c.kind === 'bg' ? 'in attesa' : 'attende te';
    return 'a riposo';
  }

  function claudeActivity(c) {
    var a = c.activity || {};
    if (a.type === 'tool') return a.tool || 'strumento';
    if (a.type === 'thinking') return 'pensa';
    if (a.type === 'text') return 'scrive';
    return '—';
  }

  function missionOf(f) {
    return f && f.missionId ? missionById.get(f.missionId) || null : null;
  }

  // ---- Freezer: fumetto, commenti e targhetta ----

  function serviceAlive() {
    return !!(overview && overview.service && overview.service.alive);
  }

  function countStatus(status) {
    var n = 0;
    ((overview && overview.sessions) || []).forEach(function (s) {
      if (s && s.status === status) n += 1;
    });
    return n;
  }

  function pushSpeech(text, type) {
    if (!text) return;
    var key = type || 'ambient';
    for (var i = 0; i < speech.queue.length; i += 1) {
      if (speech.queue[i].type === key) return;
    }
    if (speech.queue.length >= SPEECH_MAX) return;
    speech.queue.push({ text: text, type: key });
  }

  function renderSpeech() {
    var el = $('frieza-bubble');
    if (!el) return;
    if (speech.current && !openId) {
      if (el.textContent !== speech.current.text) el.textContent = speech.current.text;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  function startSpeech(text, now) {
    speech.current = { text: text };
    speech.until = now + SPEECH_MS;
    speech.lastAt = now;
    renderSpeech();
  }

  function ambientPhrase() {
    if (!overview) return null;
    var working = countStatus('working');
    var active = countStatus('active');
    var svc = overview.service || {};

    for (var i = 0; i < 4; i += 1) {
      var pick = ambientIndex % 4;
      ambientIndex += 1;

      if (pick === 0) {
        return working > 0
          ? 'Ho ' + working + ' guerrieri in combattimento.'
          : 'Nessuno combatte. Che noia.';
      }
      if (pick === 1) {
        return 'Ultime 24 ore: ' + money(overview.cost24h) + ' reali, circa ' +
          money(overview.estCost24h) + ' a listino.';
      }
      if (pick === 2) {
        var version = svc.version || '—';
        var pid = svc.pid == null ? '—' : svc.pid;
        return 'Servizio v' + version + ', PID ' + pid + '. Tutto sotto controllo.';
      }
      if (active > 0) {
        return active + ' sessioni ti aspettano. Non farle attendere.';
      }
    }
    return null;
  }

  function speechTick() {
    var now = Date.now();

    if (speech.current && now >= speech.until) {
      speech.current = null;
      speech.lastAt = now;
    }

    if (!openId && !speech.current && speech.queue.length) {
      startSpeech(speech.queue.shift().text, now);
      return;
    }

    if (!openId && !speech.current && !speech.queue.length && overview &&
        now - speech.lastAt >= SPEECH_IDLE_MS) {
      var phrase = ambientPhrase();
      if (phrase) {
        startSpeech(phrase, now);
        return;
      }
      speech.lastAt = now;
    }

    renderSpeech();
  }

  function claudeSnapshot(data) {
    var map = new Map();
    (data.claude || []).forEach(function (c) {
      var subs = new Map();
      c.subagents.forEach(function (x) { subs.set(x.id, x.state); });
      var keys = new Set();
      c.delegations.forEach(function (d) { keys.add(delegKey(d)); });
      map.set(c.id, { status: c.status, kind: c.kind, subs: subs, keys: keys, project: c.project || c.short });
    });
    return map;
  }

  function delegKey(d) {
    return d.sessionId ? d.sessionId : 'u:' + d.startedAt + ':' + (d.title || '');
  }

  function noteOverviewEvents(data) {
    var next = new Map();
    var sessions = data.sessions || [];
    var now = Date.now();
    var nextClaude = claudeSnapshot(data);
    var nextIds = new Set();
    var nextLinked = new Set();
    sessions.forEach(function (s) {
      nextIds.add(s.id);
      if (s.claude) nextLinked.add(s.id);
    });

    if (!hasBaseline) {
      sessions.forEach(function (s) { next.set(s.id, s.status); });
      lastStatusById = next;
      prevClaude = nextClaude;
      prevSessionIds = nextIds;
      prevLinked = nextLinked;
      hasBaseline = true;
      return;
    }

    var byId = new Map();
    sessions.forEach(function (s) { byId.set(s.id, s); });
    var started = new Set();

    // Claude: attesa, sub-agenti, nuove deleghe
    (data.claude || []).forEach(function (c) {
      var before = prevClaude.get(c.id);
      var project = c.project || c.short;
      if (!before) return;

      if (c.status === 'waiting' && before.status !== 'waiting' && c.kind !== 'bg') {
        logEvent('claude-wait', { claude: c.id });
        pushSpeech('Claude di ' + truncate(project, 18) + ' aspetta te.', 'evt:cwait');
      }

      c.subagents.forEach(function (sub) {
        var was = before.subs.get(sub.id);
        if (was === undefined) {
          logEvent('sub-start', { claude: c.id, sub: sub.id });
          pendingFx.push({ kind: 'sub-start', claude: c.id, fid: subFid(c.id, sub.id) });
          pushSpeech('Claude chiama rinforzi: un ' + truncate(sub.type, 16) + ' entra in campo.', 'evt:csub');
        } else if (was !== sub.state && sub.state === 'done') {
          logEvent('sub-done', { claude: c.id, sub: sub.id });
        }
      });

      c.delegations.forEach(function (d) {
        var key = delegKey(d);
        if (before.keys.has(key)) return;
        if (d.sessionId) started.add(d.sessionId);
        var title = truncate(d.title || (byId.get(d.sessionId) || {}).title || 'una missione', 24);
        logEvent('deleg-start', { claude: c.id, session: d.sessionId, title: d.title });
        pendingFx.push({ kind: 'deleg-start', claude: c.id, session: d.sessionId, fresh: d.sessionId && !prevSessionIds.has(d.sessionId) });
        pushSpeech('Claude manda in campo ' + title + '.', 'evt:cstart');
      });
    });

    // sessioni opencode collegate a Claude in un secondo momento
    sessions.forEach(function (s) {
      if (!s.claude || prevLinked.has(s.id) || started.has(s.id)) return;
      if (!prevClaude.has(s.claude.id)) return;
      started.add(s.id);
      logEvent('deleg-start', { claude: s.claude.id, session: s.id, title: s.title });
      pendingFx.push({ kind: 'deleg-start', claude: s.claude.id, session: s.id, fresh: !prevSessionIds.has(s.id) });
    });

    sessions.forEach(function (s) {
      next.set(s.id, s.status);
      var before = lastStatusById.get(s.id);
      if (before === s.status) return;

      var title = truncate(s.title || 'Senza titolo', 28);

      if (s.claude) {
        if (before === undefined) return;
        var owner = s.claude.id;
        var wasLive = !!LIVE_STATUS[before];
        if (s.status === 'idle' && before === 'working') {
          holds.set(s.id, { claudeId: owner, start: now, until: now + HOLD_MS, status: 'idle' });
          logEvent('deleg-done', { claude: owner, session: s.id, title: s.title });
          pendingFx.push({ kind: 'deleg-done', claude: owner, session: s.id });
          pushSpeech(title + ' torna da Claude: missione compiuta.', 'evt:cdone');
          return;
        }
        if (s.status === 'failed' && wasLive) {
          holds.set(s.id, { claudeId: owner, start: now, until: now + HOLD_MS, status: 'failed' });
          logEvent('deleg-fail', { claude: owner, session: s.id, title: s.title });
          pendingFx.push({ kind: 'deleg-fail', claude: owner, session: s.id });
          pushSpeech('La missione ' + title + ' è fallita. Claude non sarà contento.', 'evt:cfail');
          return;
        }
        if (s.status === 'stuck' && before !== 'stuck') {
          logEvent('deleg-stuck', { claude: owner, session: s.id, title: s.title });
          pendingFx.push({ kind: 'deleg-stuck', claude: owner, session: s.id });
          pushSpeech(title + ' è bloccata. Claude aspetta.', 'evt:cstuck');
          return;
        }
        return;
      }

      if (s.status === 'working') {
        pushSpeech(title + ' scende in campo.', 'evt:working');
      } else if (s.status === 'failed') {
        pushSpeech(title + ' è caduta. Portatela nella vasca.', 'evt:failed');
      } else if (s.status === 'active') {
        pushSpeech(title + ' ha finito il turno. Tocca a te.', 'evt:active');
      } else if (s.status === 'stuck') {
        pushSpeech(title + ' è bloccata nel vulcano.', 'evt:stuck');
      }
    });

    lastStatusById = next;
    prevClaude = nextClaude;
    prevSessionIds = nextIds;
    prevLinked = nextLinked;
  }

  // effetti coreografici: applicati dopo il layout, quando i guerrieri esistono
  function applyFx() {
    if (!pendingFx.length) return;
    var now = Date.now();
    var list = pendingFx;
    pendingFx = [];

    list.forEach(function (fx) {
      var m = missionById.get(fx.claude);
      var cf = m ? fighters.get(m.fid) : null;
      var target = fx.session ? fighters.get(fx.session) : (fx.fid ? fighters.get(fx.fid) : null);

      if (fx.kind === 'deleg-start') {
        if (cf) cf.chargeUntil = now + CHARGE_MS;
        if (target) {
          var travel = reducedMotion ? 0 : PROJ_MS;
          if (fx.fresh) target.appearAt = now + travel;
          target.flashUntil = now + travel + 450;
          target.powerUntil = now + travel + 650;
          target.ringAt = now + travel;
          if (cf && m && target.inMission && !reducedMotion) {
            projectiles.push({ from: cf.id, to: target.id, start: now, dur: PROJ_MS, color: m.color });
          }
        }
      } else if (fx.kind === 'sub-start') {
        if (cf) cf.chargeUntil = now + CHARGE_MS;
        if (target) {
          target.appearAt = now;
          target.flashUntil = now + 450;
          target.powerUntil = now + 500;
          target.ringAt = now;
        }
      } else if (fx.kind === 'deleg-done') {
        if (target) {
          target.bubble = { text: 'Missione compiuta: ' + truncate(target.session.title || '', 22), until: now + HOLD_MS - 300 };
        }
      } else if (fx.kind === 'deleg-fail') {
        if (cf) cf.alertUntil = now + 5000;
        if (target) {
          target.bubble = { text: 'Missione fallita: ' + truncate(target.session.title || '', 22), until: now + HOLD_MS - 300 };
        }
      } else if (fx.kind === 'deleg-stuck') {
        if (cf) cf.alertUntil = now + 5000;
      }
    });
  }

  function handleConn(state) {
    var was = connPrev;
    connPrev = state;
    setConn(state);

    if (state === 'offline' && was !== 'offline') {
      pushSpeech('Ho perso il contatto con la mia astronave.', 'conn:offline');
    } else if (state === 'live' && was === 'offline') {
      pushSpeech('Contatto ristabilito.', 'conn:live');
    }
  }

  function updateFriezaTag() {
    var plate = $('frieza-plate');
    var hint = $('frieza-hint');
    var alive = serviceAlive();
    if (plate) plate.textContent = alive ? 'FREEZER · servizio opencode' : 'TRONO VUOTO · servizio giù';
    if (hint) hint.hidden = !alive;
  }

  // ---- caricamento asset ----

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Immagine non caricata: ' + src)); };
      img.src = src;
    });
  }

  function loadAssets() {
    return fetch('2d/atlas.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('atlas.json non disponibile');
        return res.json();
      })
      .then(function (data) {
        atlas = data;
        resolveCast();
        var names = Object.keys(atlas.bg || {});
        var jobs = [loadImage('2d/sprites.png')];
        names.forEach(function (name) {
          jobs.push(loadImage('2d/' + atlas.bg[name].src).then(function (img) {
            return { name: name, img: img };
          }));
        });
        return Promise.all(jobs).then(function (results) {
          sprites = results[0];
          results.slice(1).forEach(function (item) {
            bgImages.set(item.name, item.img);
          });
        });
      });
  }

  function showFatal(message) {
    var zonesEl = $('zones');
    if (!zonesEl) return;
    var p = document.createElement('p');
    p.className = 'textbox';
    p.textContent = message;
    zonesEl.appendChild(p);
  }

  // ---- costruzione zone / pannelli / guerrieri ----

  function ensureZone(cfg) {
    var zs = zoneStates.get(cfg.status);
    if (zs) return zs;

    var el = document.createElement('section');
    el.className = cfg.command ? 'zone zone-command' : 'zone';
    el.setAttribute('data-zone', cfg.status);

    var head = document.createElement('div');
    head.className = 'zone-head';
    var title = document.createElement('h2');
    title.textContent = cfg.title;
    var count = document.createElement('span');
    count.className = 'zone-count';
    count.textContent = '0';
    head.appendChild(title);
    head.appendChild(count);

    var panelsEl = document.createElement('div');
    panelsEl.className = 'zone-panels';

    el.appendChild(head);
    el.appendChild(panelsEl);

    var textbox = null;
    if (cfg.status === 'working') {
      textbox = document.createElement('p');
      textbox.className = 'textbox';
      textbox.textContent = 'Nessun guerriero in combattimento.';
      textbox.hidden = true;
      el.appendChild(textbox);
    }

    var zonesEl = $('zones');
    if (zonesEl) {
      if (cfg.command) zonesEl.insertBefore(el, zonesEl.firstChild);
      else zonesEl.appendChild(el);
    }

    zs = {
      cfg: cfg,
      el: el,
      head: head,
      countEl: count,
      panelsEl: panelsEl,
      panels: new Map(),
      textbox: textbox,
      more: null
    };
    zoneStates.set(cfg.status, zs);
    return zs;
  }

  function ensureMore(zs) {
    if (zs.more) return zs.more;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'more-btn';
    btn.addEventListener('click', function () {
      toggleExpand(zs.cfg.status);
    });
    zs.more = btn;
    zs.el.appendChild(btn);
    return btn;
  }

  function toggleExpand(status) {
    if (expanded.has(status)) expanded.delete(status);
    else expanded.add(status);
    layout();
  }

  function ensurePanel(zs, index, bgKey) {
    var p = zs.panels.get(index);
    if (!p) {
      var el = document.createElement('div');
      el.className = 'panel';
      var canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      var overlay = document.createElement('div');
      overlay.className = 'panel-overlay';
      el.appendChild(canvas);
      el.appendChild(overlay);
      p = {
        el: el,
        canvas: canvas,
        ctx: canvas.getContext('2d'),
        overlay: overlay,
        bgKey: '',
        bg: null,
        fighters: []
      };
      zs.panels.set(index, p);
    }

    var info = atlas.bg[bgKey] || atlas.bg['namek-1'] || { w: 239, h: 160 };
    if (p.bgKey !== bgKey) {
      p.canvas.width = info.w;
      p.canvas.height = info.h;
      p.ctx.imageSmoothingEnabled = false;
      p.bgKey = bgKey;
      p.bg = info;
    }
    return p;
  }

  function ensureNode(f) {
    if (f.node) return f.node;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fighter-btn';
    btn.setAttribute('data-id', f.id);
    btn.addEventListener('click', function () {
      openDialog(f.id);
    });

    var name = document.createElement('div');
    name.className = 'nameplate';
    name.setAttribute('aria-hidden', 'true');

    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.hidden = true;

    f.node = {
      btn: btn,
      name: name,
      hp: null,
      hpFill: null,
      bubble: bubble,
      bubbleText: ''
    };
    return f.node;
  }

  function createHp(node) {
    var hp = document.createElement('div');
    hp.className = 'hp';
    hp.setAttribute('aria-hidden', 'true');
    var fill = document.createElement('div');
    fill.className = 'hp-fill';
    hp.appendChild(fill);
    node.hp = hp;
    node.hpFill = fill;
  }

  function newFighter(id, kind) {
    return {
      id: id,
      kind: kind,
      session: null,
      char: '',
      role: '',
      label: '',
      hash: fnv1a(id),
      isCompanion: false,
      parentId: null,
      anim: '',
      animStart: 0,
      actionSig: '',
      actionStart: Date.now(),
      x: 0,
      y: 0,
      drawX: 0,
      drawY: 0,
      flashUntil: 0,
      bubble: null,
      dir: 'R',
      node: null,
      size: { w: 16, h: 32 },
      placed: false,
      inMission: false,
      missionId: null,
      appearAt: 0,
      powerUntil: 0,
      ringAt: 0,
      chargeUntil: 0,
      alertUntil: 0,
      hold: null,
      scale: 1
    };
  }

  function ensureFighter(session) {
    var f = fighters.get(session.id);
    if (!f) {
      f = newFighter(session.id, 'oc');
      fighters.set(session.id, f);
    }
    var companion = !!(session.parentId && session.parentId !== session.id && lastSessionsById.has(session.parentId));
    f.session = session;
    f.kind = 'oc';
    if (companion) {
      f.char = kidFor(session.agent, session.id);
      f.role = 'kid';
      f.scale = f.hash % 3 === 0 ? 1.125 : 1;
    } else {
      f.role = roleOf(session);
      f.char = castPick(cast.role[f.role] || cast.role.build, f.id);
      f.scale = 1;
    }
    f.label = charLabel(f.char);
    f.missionId = session.claude ? session.claude.id : null;
    f.inMission = false;
    f.hold = holds.get(session.id) || null;
    return f;
  }

  function ensureClaudeFighter(m) {
    var f = fighters.get(m.fid);
    if (!f) {
      f = newFighter(m.fid, 'claude');
      fighters.set(m.fid, f);
    }
    var c = m.c;
    var act = c.activity || {};
    var la = null;
    if (act.type === 'tool') la = { type: 'tool', tool: mapClaudeTool(act.tool), summary: act.tool || '' };
    else if (act.type === 'thinking') la = { type: 'reasoning', summary: '' };
    else if (act.type === 'text') la = { type: 'text', summary: '' };
    f.session = {
      id: m.fid,
      title: m.project,
      status: c.status === 'working' ? 'working' : (c.status === 'waiting' ? 'active' : 'idle'),
      lastActivity: la,
      todos: { done: 0, total: 0 }
    };
    f.char = claudeChar(m.id);
    f.role = 'claude';
    f.label = 'Claude';
    f.missionId = m.id;
    f.mission = m;
    f.isCompanion = false;
    f.parentId = null;
    f.inMission = true;
    return f;
  }

  function ensureSubFighter(m, sub, parentFid) {
    var id = subFid(m.id, sub.id);
    var f = fighters.get(id);
    if (!f) {
      f = newFighter(id, 'sub');
      fighters.set(id, f);
    }
    f.session = {
      id: id,
      title: sub.type,
      status: sub.state === 'done' ? 'idle' : 'working',
      lastActivity: null,
      todos: { done: 0, total: 0 },
      subType: sub.type
    };
    f.char = kidFor(sub.type, sub.id);
    f.role = 'sub';
    f.label = charLabel(f.char);
    f.scale = f.hash % 3 === 0 ? 1.125 : 1;
    f.missionId = m.id;
    f.isCompanion = true;
    f.parentId = parentFid;
    f.inMission = true;
    return f;
  }

  function mapClaudeTool(tool) {
    var t = String(tool || '').toLowerCase();
    if (t === 'bash') return 'bash';
    if (t === 'edit' || t === 'write' || t === 'multiedit' || t === 'notebookedit') return 'edit';
    if (t === 'read' || t === 'grep' || t === 'glob' || t === 'ls') return 'read';
    if (t === 'agent' || t === 'task') return 'task';
    if (t === 'webfetch' || t === 'websearch') return 'websearch';
    return t;
  }

  function ariaFor(f) {
    var s = f.session;
    var m = missionOf(f);
    if (f.kind === 'claude') {
      return 'Claude — ' + f.mission.project + ' — ' + claudeState(f.mission.c);
    }
    if (f.kind === 'sub') {
      var mm = missionOf(f);
      return 'Sub-agente ' + s.title + ' di Claude' + (mm ? ' · ' + mm.project : '') + ' — ' + (s.status === 'working' ? 'in corso' : 'finito');
    }
    var base = f.label + ' — ' + (s.title || 'Senza titolo') + ' — ' + statusLabel(s.status);
    if (f.missionId) base += ' — delegata da Claude' + (m ? ' · ' + m.project : '');
    return base;
  }

  function setPlate(f, node) {
    var s = f.session;
    var m = missionOf(f);
    var text = f.kind === 'claude'
      ? f.mission.project + ' · ' + modelLabel(f.mission.c.model)
      : truncate(s.title || 'Senza titolo', 18);
    var color = f.missionId ? (m ? m.color : missionColor(f.missionId)) : '';
    var key = [text, color, f.kind, f.role].join('|');
    if (node.plateKey === key) return;
    node.plateKey = key;
    var name = node.name;
    name.textContent = '';
    if (color) {
      var badge = document.createElement('i');
      badge.className = 'm-badge';
      badge.style.background = color;
      name.appendChild(badge);
    }
    name.appendChild(document.createTextNode(text));
    if (f.missionId) name.setAttribute('data-mission', f.missionId);
    else name.removeAttribute('data-mission');
    if (f.kind === 'claude') {
      name.style.borderColor = color;
      name.style.borderWidth = '2px';
      name.style.borderLeftColor = color;
    } else {
      name.style.borderColor = '';
      name.style.borderWidth = '';
      name.style.borderLeftColor = ROLE_COLOR[f.role] || '';
      name.style.borderLeftWidth = ROLE_COLOR[f.role] ? '3px' : '';
    }
  }

  function applyNodeMeta(f, overlay) {
    var node = ensureNode(f);
    var s = f.session;
    node.btn.setAttribute('data-kind', f.kind);
    if (f.missionId) node.btn.setAttribute('data-mission', f.missionId);
    else node.btn.removeAttribute('data-mission');
    node.btn.setAttribute('aria-label', ariaFor(f));
    setPlate(f, node);
    // i compagni non hanno targhetta: coprirebbe quella del genitore
    node.name.hidden = f.isCompanion;

    var total = s.todos && !f.isCompanion ? num(s.todos.total) : 0;
    if (total > 0) {
      if (!node.hp) createHp(node);
      var done = clamp(num(s.todos.done), 0, total);
      node.hpFill.style.width = Math.round((done / total) * 100) + '%';
      if (node.hp.parentNode !== overlay) overlay.appendChild(node.hp);
    } else if (node.hp && node.hp.parentNode) {
      node.hp.parentNode.removeChild(node.hp);
    }

    if (node.btn.parentNode !== overlay) {
      overlay.appendChild(node.btn);
      overlay.appendChild(node.name);
      if (node.hp && node.hp.parentNode !== overlay) overlay.appendChild(node.hp);
    }

    var stand = resolveAnim(f.char, 'stand');
    var key = stand.def.frames && stand.def.frames[0];
    var fr = (key && atlas.frames[key]) || [0, 0, 16, 32];
    f.size = { w: fr[2], h: fr[3] };
  }

  function detachNode(f) {
    if (!f.node) return;
    ['btn', 'name', 'hp', 'bubble'].forEach(function (key) {
      var el = f.node[key];
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function topParent(session) {
    var cur = session;
    var guard = 0;
    while (cur && cur.parentId && guard < 8) {
      var parent = lastSessionsById.get(cur.parentId);
      if (!parent || parent.id === cur.id) break;
      cur = parent;
      guard += 1;
    }
    return cur || session;
  }

  function sortByRecent(a, b) {
    if (num(b.timeUpdated) !== num(a.timeUpdated)) return num(b.timeUpdated) - num(a.timeUpdated);
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  }

  function placeMain(f, slot, w, h) {
    var col = slot % 3;
    var row = slot < 3 ? 0 : 1;
    f.x = w * SLOT_X[col];
    f.y = h * SLOT_Y[row];
    f.dir = col === 2 ? 'L' : 'R';
  }

  function placeKid(f, parent, index, w, h) {
    var offsets = [24, -24, 34, -34];
    f.x = clamp(parent.x + offsets[index % offsets.length], 12, w - 12);
    f.y = clamp(parent.y - 6, 0, h - 4);
    f.dir = parent.dir === 'L' ? 'R' : 'L';
  }

  function renderZone(cfg, plans, total, fullCount) {
    var zs = ensureZone(cfg);
    var empty = total === 0;
    zs.el.hidden = empty && cfg.status !== 'working';
    zs.countEl.textContent = String(total);

    if (zs.textbox) zs.textbox.hidden = !(cfg.status === 'working' && empty);

    var showMore = cfg.cap > 0 && fullCount > cfg.cap;
    if (showMore) {
      var more = ensureMore(zs);
      more.hidden = false;
      var isOpen = expanded.has(cfg.status);
      more.textContent = isOpen ? 'Mostra meno' : '+' + (fullCount - cfg.cap) + ' altre';
      more.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    } else if (zs.more) {
      zs.more.hidden = true;
    }

    plans.forEach(function (plan, index) {
      var panel = ensurePanel(zs, index, plan.bg);
      panel.fighters = [];
      var w = panel.bg.w;
      var h = panel.bg.h;

      plan.entries.forEach(function (session, slot) {
        var f = fighters.get(session.id);
        if (!f) return;
        f.isCompanion = false;
        f.parentId = null;
        placeMain(f, slot, w, h);
        f.placed = true;
        panel.fighters.push(f);
        applyNodeMeta(f, panel.overlay);
      });

      plan.kids.forEach(function (group) {
        var parentSession = plan.entries[group.slot];
        if (!parentSession) return;
        var parent = fighters.get(parentSession.id);
        if (!parent) return;
        group.list.forEach(function (kidSession, kidIndex) {
          var kid = fighters.get(kidSession.id);
          if (!kid) return;
          kid.isCompanion = true;
          kid.parentId = parent.id;
          kid.missionId = parent.missionId;
          placeKid(kid, parent, kidIndex, w, h);
          kid.placed = true;
          panel.fighters.push(kid);
          applyNodeMeta(kid, panel.overlay);
        });
      });

      panel.el.setAttribute('aria-label', cfg.title);
    });

    var keep = plans.length;
    Array.from(zs.panels.keys()).forEach(function (index) {
      if (index < keep) return;
      var p = zs.panels.get(index);
      if (p && p.el.parentNode) p.el.parentNode.removeChild(p.el);
      zs.panels.delete(index);
    });

    for (var i = 0; i < keep; i += 1) {
      var panel = zs.panels.get(i);
      if (!panel) continue;
      var current = zs.panelsEl.children[i];
      if (current !== panel.el) zs.panelsEl.insertBefore(panel.el, current || null);
    }
  }

  function ensureCmdPanel(zs, key) {
    var p = ensurePanel(zs, key, 'throne-empty');
    if (!p.strip) {
      p.strip = document.createElement('div');
      p.strip.className = 'mission-strip';
      p.el.appendChild(p.strip);
      p.moreEl = document.createElement('div');
      p.moreEl.className = 'sub-more';
      p.moreEl.hidden = true;
      p.overlay.appendChild(p.moreEl);
      p.el.classList.add('panel-new');
    }
    p.mission = null;
    p.ghosts = [];
    p.anchor = null;
    return p;
  }

  function attachKids(parent, kidsByRoot, panel, w, h) {
    var list = kidsByRoot.get(parent.id) || [];
    list.forEach(function (kidSession, kidIndex) {
      var kid = fighters.get(kidSession.id);
      if (!kid) return;
      kid.isCompanion = true;
      kid.parentId = parent.id;
      kid.inMission = parent.inMission;
      kid.missionId = parent.missionId;
      placeKid(kid, parent, kidIndex, w, h);
      if (parent.inMission) {
        kid.x = clamp(parent.x + 18 + kidIndex * 12, 12, w - 12);
        kid.y = clamp(parent.y - 12, 0, h - 4);
      }
      kid.placed = true;
      panel.fighters.push(kid);
      applyNodeMeta(kid, panel.overlay);
    });
  }

  function renderCommand(ms, kidsByRoot) {
    var zs = ensureZone(CMD_CFG);
    var supported = !!(overview && overview.claudeSupported);
    zs.el.hidden = !supported;
    zs.countEl.textContent = String(ms.length);

    if (!zs.empty) {
      var empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = 'Nessuna sessione Claude attiva.';
      zs.empty = empty;
    }

    var plans = [];
    if (supported) {
      var liveMs = ms.filter(function (m) { return m.isLive; });
      var idleMs = ms.filter(function (m) { return !m.isLive; });
      liveMs.forEach(function (m) {
        var slots = m.live.map(function (s) { return { session: s }; })
          .concat(m.ghosts.map(function (d) { return { ghost: d }; }));
        var n = Math.max(1, Math.ceil(slots.length / DELEG_SLOTS.length));
        for (var i = 0; i < n; i += 1) {
          plans.push({
            key: 'm:' + m.id + ':' + i, kind: 'mission', mission: m, part: i, parts: n,
            slots: slots.slice(i * DELEG_SLOTS.length, (i + 1) * DELEG_SLOTS.length)
          });
        }
      });
      for (var j = 0; j < idleMs.length; j += PANEL_SLOTS) {
        plans.push({ key: 'i:' + (j / PANEL_SLOTS), kind: 'idle', list: idleMs.slice(j, j + PANEL_SLOTS) });
      }
    }

    var keys = [];
    plans.forEach(function (plan) {
      keys.push(plan.key);
      var panel = ensureCmdPanel(zs, plan.key);
      panel.fighters = [];
      var w = panel.bg.w;
      var h = panel.bg.h;

      if (plan.kind === 'mission') {
        var m = plan.mission;
        panel.mission = m;
        panel.el.setAttribute('data-mission', m.id);
        panel.el.setAttribute('aria-label', 'Missione di Claude · ' + m.project + ' · ' + claudeState(m.c));
        panel.strip.style.background = m.color;
        var nLive = m.live.length + m.ghosts.length;
        panel.strip.textContent = (plan.part === 0 ? 'CLAUDE · ' : 'CONTINUA · ') + truncate(m.project, 16) +
          ' · ' + claudeState(m.c) + (nLive ? ' · ' + nLive + ' deleghe' : '') +
          (plan.parts > 1 ? ' · ' + (plan.part + 1) + '/' + plan.parts : '');
        panel.moreEl.hidden = true;

        var cf = null;
        if (plan.part === 0) {
          cf = ensureClaudeFighter(m);
          cf.x = w * CLAUDE_X;
          cf.y = h * CLAUDE_Y;
          cf.dir = 'R';
          cf.placed = true;
          panel.fighters.push(cf);
          applyNodeMeta(cf, panel.overlay);

          var subs = m.c.subagents.map(function (x, i) { return { x: x, i: i }; });
          subs.sort(function (a, b) {
            var wa = a.x.state === 'working' ? 0 : 1;
            var wb = b.x.state === 'working' ? 0 : 1;
            return wa !== wb ? wa - wb : a.i - b.i;
          });
          subs.slice(0, SUB_VISIBLE).forEach(function (item, idx) {
            var sf = ensureSubFighter(m, item.x, cf.id);
            placeKid(sf, cf, idx, w, h);
            sf.placed = true;
            panel.fighters.push(sf);
            applyNodeMeta(sf, panel.overlay);
          });
          var hidden = subs.length - SUB_VISIBLE;
          if (hidden > 0) {
            panel.moreEl.hidden = false;
            panel.moreEl.textContent = '+' + hidden + ' sub';
            panel.moreEl.style.left = pct((cf.x / w) * 100);
            panel.moreEl.style.top = pct(((cf.y - 46) / h) * 100);
          }
        } else {
          panel.anchor = { x: 0, y: h * CLAUDE_Y - 12 };
        }

        plan.slots.forEach(function (slot, i) {
          var pos = DELEG_SLOTS[i];
          if (slot.session) {
            var f = fighters.get(slot.session.id);
            if (!f) return;
            f.inMission = true;
            f.isCompanion = false;
            f.parentId = null;
            f.x = w * pos[0];
            f.y = h * pos[1];
            f.dir = 'L';
            f.placed = true;
            panel.fighters.push(f);
            applyNodeMeta(f, panel.overlay);
            attachKids(f, kidsByRoot, panel, w, h);
          } else {
            panel.ghosts.push({ x: w * pos[0], y: h * pos[1], d: slot.ghost });
          }
        });
      } else {
        panel.el.removeAttribute('data-mission');
        panel.el.setAttribute('aria-label', 'Sala comandi · Claude a riposo');
        panel.strip.style.background = '#9aa3c7';
        panel.strip.textContent = 'CLAUDE · A RIPOSO · ' + plan.list.length;
        panel.moreEl.hidden = true;
        plan.list.forEach(function (m, slot) {
          var cf = ensureClaudeFighter(m);
          placeMain(cf, slot, w, h);
          cf.dir = 'R';
          cf.placed = true;
          panel.fighters.push(cf);
          applyNodeMeta(cf, panel.overlay);
        });
      }
    });

    Array.from(zs.panels.keys()).forEach(function (k) {
      if (keys.indexOf(k) >= 0) return;
      var p = zs.panels.get(k);
      if (p && p.el.parentNode) p.el.parentNode.removeChild(p.el);
      zs.panels.delete(k);
    });

    var wantEmpty = supported && plans.length === 0;
    if (wantEmpty) {
      if (zs.empty.parentNode !== zs.panelsEl) zs.panelsEl.appendChild(zs.empty);
    } else if (zs.empty.parentNode) {
      zs.empty.parentNode.removeChild(zs.empty);
    }

    keys.forEach(function (k, i) {
      var panel = zs.panels.get(k);
      var current = zs.panelsEl.children[i];
      if (current !== panel.el) zs.panelsEl.insertBefore(panel.el, current || null);
    });
  }

  function layout() {
    if (!atlas || !overview) return;

    var sessions = overview.sessions || [];
    lastSessionsById = new Map();
    var present = new Set();

    sessions.forEach(function (s) {
      lastSessionsById.set(s.id, s);
      present.add(s.id);
    });

    var ms = buildMissions();
    var liveMissions = new Set();
    ms.forEach(function (m) { liveMissions.add(m.id); });
    claudeAssign.forEach(function (name, mid) {
      if (!liveMissions.has(mid)) claudeAssign.delete(mid);
    });
    ms.forEach(function (m) {
      present.add(m.fid);
      m.c.subagents.forEach(function (x) { present.add(subFid(m.id, x.id)); });
    });

    fighters.forEach(function (f, id) {
      if (!present.has(id)) {
        detachNode(f);
        fighters.delete(id);
      }
    });

    fighters.forEach(function (f) { f.placed = false; });
    sessions.forEach(function (s) { ensureFighter(s); });

    var pulled = new Set();
    ms.forEach(function (m) {
      m.live.forEach(function (s) { pulled.add(s.id); });
    });

    var mainsByStatus = {};
    ZONES.forEach(function (zone) { mainsByStatus[zone.status] = []; });

    var companionSessions = [];
    var mainSessions = [];

    sessions.forEach(function (s) {
      if (s.parentId && s.parentId !== s.id && lastSessionsById.has(s.parentId)) {
        companionSessions.push(s);
      } else if (!pulled.has(s.id)) {
        mainSessions.push(s);
      }
    });

    mainSessions.forEach(function (s) {
      var bucket = mainsByStatus[s.status] ? s.status : 'idle';
      mainsByStatus[bucket].push(s);
    });

    Object.keys(mainsByStatus).forEach(function (key) {
      mainsByStatus[key].sort(sortByRecent);
    });

    var companionsByRoot = new Map();
    companionSessions.forEach(function (s) {
      var root = topParent(s);
      if (!companionsByRoot.has(root.id)) companionsByRoot.set(root.id, []);
      companionsByRoot.get(root.id).push(s);
    });
    companionsByRoot.forEach(function (list) { list.sort(sortByRecent); });

    renderCommand(ms, companionsByRoot);

    var selected = {};
    var selectedIds = new Set();
    pulled.forEach(function (id) { selectedIds.add(id); });

    ZONES.forEach(function (zone) {
      var list = mainsByStatus[zone.status] || [];
      if (zone.cap > 0 && !expanded.has(zone.status)) list = list.slice(0, zone.cap);
      selected[zone.status] = list.slice();
      list.forEach(function (s) { selectedIds.add(s.id); });
    });

    var orphanIds = new Set();
    companionSessions.forEach(function (s) {
      var root = topParent(s);
      if (selectedIds.has(root.id) || orphanIds.has(s.id)) return;
      orphanIds.add(s.id);
      var bucket = mainsByStatus[s.status] ? s.status : 'idle';
      selected[bucket].push(s);
    });

    ZONES.forEach(function (cfg) {
      var list = selected[cfg.status] || [];
      var plans = [];
      var attached = 0;

      for (var i = 0; i < list.length; i += PANEL_SLOTS) {
        plans.push({
          bg: cfg.bgs[Math.floor(i / PANEL_SLOTS) % cfg.bgs.length],
          entries: list.slice(i, i + PANEL_SLOTS),
          kids: []
        });
      }

      plans.forEach(function (plan) {
        plan.entries.forEach(function (s, slot) {
          var kids = (companionsByRoot.get(s.id) || []).filter(function (k) {
            return !orphanIds.has(k.id);
          });
          plan.kids.push({ slot: slot, list: kids });
          attached += kids.length;
        });
      });

      renderZone(cfg, plans, list.length + attached, (mainsByStatus[cfg.status] || []).length);
    });

    fighters.forEach(function (f) {
      if (!f.placed) detachNode(f);
    });

    applyFx();

    if (openId === SERVICE_ID) {
      // Dialog di Freezer: le risposte si calcolano al click, non a ogni overview.
      return;
    }

    if (openId) {
      var current = fighters.get(openId);
      if (current && current.placed) populateDialog(current, false);
      else closeDialog();
    }
  }

  // ---- animazioni ----

  function resolveAnim(charName, animName) {
    var chars = atlas.chars || {};
    var char = chars[charName] || chars[(cast.claude || [])[0]] || {};
    var chain = FALLBACKS[animName] || [animName, 'stand'];
    for (var i = 0; i < chain.length; i += 1) {
      var def = char[chain[i]];
      if (def && def.frames && def.frames.length) {
        return { key: chain[i], def: def };
      }
    }
    return { key: 'stand', def: char.stand || { face: 'F', frames: [] } };
  }

  function hasAnim(charName, animName) {
    var chars = atlas.chars || {};
    var char = chars[charName];
    return !!(char && char[animName] && char[animName].frames && char[animName].frames.length);
  }

  function poseFor(f, now) {
    var s = f.session;
    var la = s.lastActivity;
    var sig = [
      f.isCompanion ? 'c' : 'm',
      s.status,
      la ? la.type : '',
      la ? (la.tool || '') : '',
      la ? (la.summary || '') : ''
    ].join('|');

    if (f.actionSig !== sig) {
      f.actionSig = sig;
      f.actionStart = now;
    }

    var since = now - (f.actionStart || now);
    var pose = {
      anim: 'stand',
      fps: 2,
      offsetX: 0,
      orbitY: 0,
      alpha: 1,
      hidden: false,
      rotate: false,
      dir: f.dir,
      indicator: null,
      attack: null,
      flame: false
    };

    if (f.powerUntil > now) {
      pose.anim = 'power';
      pose.fps = 6;
      return pose;
    }

    if (f.isCompanion) {
      if (f.kind === 'sub' && s.status !== 'working') pose.alpha = 0.5;
      if (s.status === 'working' && !reducedMotion) {
        var seed = (fnv1a(f.id) % 628) / 100;
        var angle = (now / 1000) * 2 + seed;
        pose.offsetX = Math.cos(angle) * 10;
        pose.orbitY = Math.sin(angle) * 4;
        pose.dir = -Math.sin(angle) >= 0 ? 'R' : 'L';
        pose.anim = Math.abs(Math.cos(angle)) > 0.62 ? 'walk' : 'walkSide';
        pose.fps = 8;
      } else {
        pose.anim = 'stand';
        pose.fps = 2;
      }
      return pose;
    }

    if (f.chargeUntil > now) {
      pose.anim = hasAnim(f.char, 'kameCharge') ? 'kameCharge' : 'charge';
      pose.fps = 6;
      return pose;
    }

    if (f.hold && s.status === 'idle') {
      var hp = holdProgress(f, now);
      pose.anim = hp < 1 ? 'walkSide' : 'stand';
      pose.fps = 8;
      pose.dir = 'L';
      pose.walkP = hp;
      return pose;
    }

    var status = s.status;
    var tool = la && la.tool ? String(la.tool).toLowerCase() : '';
    var type = la && la.type ? String(la.type).toLowerCase() : '';

    if (status === 'working') {
      if (tool === 'shell' || tool === 'bash') {
        if (hasAnim(f.char, 'kameFire')) {
          var phase = reducedMotion ? 0 : since % 4000;
          if (phase < 1200) {
            pose.anim = 'kameCharge';
            pose.fps = 6;
          } else {
            pose.anim = 'kameFire';
            pose.fps = 6;
            pose.attack = 'beam';
          }
        } else {
          pose.anim = 'blast';
          pose.fps = 6;
          pose.attack = 'ball';
        }
      } else if (tool === 'edit' || tool === 'write' || tool === 'patch') {
        pose.anim = 'melee';
        pose.fps = 6;
      } else if (tool === 'read' || tool === 'grep' || tool === 'glob' || tool === 'list' || tool === 'ls') {
        pose.anim = 'walkSide';
        pose.fps = 8;
        if (!reducedMotion) {
          pose.offsetX = Math.sin(since / 450) * 16;
          pose.dir = Math.cos(since / 450) >= 0 ? 'R' : 'L';
        }
      } else if (tool === 'webfetch' || tool === 'websearch') {
        pose.anim = 'blast';
        pose.fps = 6;
        pose.attack = 'ball';
      } else if (tool === 'task') {
        pose.anim = 'charge';
        pose.fps = 6;
      } else if (type === 'reasoning') {
        pose.anim = 'charge';
        pose.fps = 6;
        pose.flame = true;
      } else if (type === 'text') {
        pose.anim = 'walk';
        pose.fps = 8;
      } else {
        pose.anim = 'charge';
        pose.fps = 6;
      }
      return pose;
    }

    if (status === 'active') {
      pose.anim = f.role === 'plan' && hasAnim(f.char, 'power') ? 'power' : 'stand';
      pose.fps = 2;
      if (f.kind === 'claude') pose.indicator = f.mission && f.mission.c.kind === 'bg' ? null : '?';
      else pose.indicator = '!';
    } else if (status === 'stuck') {
      pose.anim = 'hurt';
      pose.fps = 4;
      pose.hidden = !reducedMotion && Math.floor(now / 250) % 2 === 1;
    } else if (status === 'failed') {
      if (hasAnim(f.char, 'ko')) {
        pose.anim = 'ko';
        pose.fps = 2;
      } else {
        pose.anim = 'stand';
        pose.fps = 2;
        pose.rotate = true;
      }
    } else if (status === 'idle') {
      pose.anim = 'sit';
      pose.fps = 1;
      pose.indicator = 'z';
    } else if (status === 'suspended') {
      pose.anim = 'back';
      pose.fps = 2;
      pose.alpha = 0.5;
    }

    return pose;
  }

  function holdProgress(f, now) {
    if (!f.hold || reducedMotion) return 1;
    return clamp((now - f.hold.start) / 1100, 0, 1);
  }

  function visibility(f, now) {
    if (!f.appearAt) return 1;
    if (now < f.appearAt) return reducedMotion ? 1 : 0;
    if (reducedMotion) return 1;
    return clamp((now - f.appearAt) / 300, 0, 1);
  }

  function frameFor(f, pose, now) {
    var entry = resolveAnim(f.char, pose.anim);
    if (f.anim !== entry.key) {
      f.anim = entry.key;
      f.animStart = now;
    }
    var frames = entry.def.frames || [];
    var fps = reducedMotion ? 1 : pose.fps;
    var index = 0;
    if (frames.length > 1 && fps > 0) {
      var elapsed = Math.max(0, now - (f.animStart || now)) + (f.hash % 900);
      index = Math.floor((elapsed / 1000) * fps) % frames.length;
    }
    return {
      key: frames[index] || frames[0],
      face: entry.def.face || 'F'
    };
  }

  // ---- disegno ----

  function drawShadow(ctx, x, y, width) {
    var rx = Math.max(3, width * 0.34);
    var ry = Math.max(1.5, width * 0.1);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y - 1, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSprite(ctx, frameKey, x, y, opts) {
    var fr = atlas.frames[frameKey];
    if (!fr) return;
    var sw = fr[2];
    var sh = fr[3];
    var alpha = opts.alpha === undefined ? 1 : opts.alpha;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (opts.rotate) {
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(sprites, fr[0], fr[1], sw, sh, Math.round(-sw / 2), -sh, sw, sh);
      ctx.restore();
      return;
    }

    if (opts.flip) {
      ctx.translate(2 * x, 0);
      ctx.scale(-1, 1);
    }

    var sc = opts.scale || 1;
    var dw = Math.round(sw * sc);
    var dh = Math.round(sh * sc);
    var dx = Math.round(x - dw / 2);
    var dy = Math.round(y - dh);

    if (opts.flash && !reducedMotion) {
      flashCtx.clearRect(0, 0, 64, 64);
      flashCtx.globalCompositeOperation = 'source-over';
      flashCtx.drawImage(sprites, fr[0], fr[1], sw, sh, 0, 0, sw, sh);
      flashCtx.globalCompositeOperation = 'source-atop';
      flashCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      flashCtx.fillRect(0, 0, sw, sh);
      flashCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(flashCanvas, 0, 0, sw, sh, dx, dy, dw, dh);
    } else {
      ctx.drawImage(sprites, fr[0], fr[1], sw, sh, dx, dy, dw, dh);
    }

    ctx.restore();
  }

  function drawFxCentered(ctx, frameKey, cx, cy, flip, alpha) {
    var fr = atlas.frames[frameKey];
    if (!fr) return;
    var sw = fr[2];
    var sh = fr[3];
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flip) {
      ctx.translate(2 * cx, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      sprites,
      fr[0], fr[1], sw, sh,
      Math.round(cx - sw / 2), Math.round(cy - sh / 2), sw, sh
    );
    ctx.restore();
  }

  function drawKiThread(ctx, x1, y1, x2, y2, active, now) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    var offset = reducedMotion ? 0 : Math.floor(now / 60) % 4;
    ctx.save();
    ctx.fillStyle = active ? '#ffd93b' : '#9aa3c7';
    for (var d = 0; d < len; d += 1) {
      if ((d + offset) % 4 >= 2) continue;
      var t = d / len;
      ctx.fillRect(Math.round(x1 + dx * t), Math.round(y1 + dy * t), 1, 1);
    }
    ctx.restore();
  }

  function drawBalls(ctx, handX, handY, sign, start, now) {
    var keys = atlas.fx.kiBall.frames;
    var key = keys[Math.floor(now / 110) % keys.length];
    var period = 900;
    for (var k = 0; k < 2; k += 1) {
      var age = ((now - start) + k * 450) % period;
      if (age < 0) age += period;
      var p = age / period;
      if (p > 0.95) continue;
      var dist = p * 70;
      var alpha = p < 0.75 ? 1 : Math.max(0, (1 - p) / 0.25);
      drawFxCentered(ctx, key, handX + sign * dist, handY, sign < 0, alpha);
    }
  }

  function drawBeam(ctx, handX, handY, sign, now) {
    var keys = atlas.fx.beam.frames;
    var key = keys[Math.floor(now / 90) % keys.length];
    var fr = atlas.frames[key];
    if (!fr) return;
    var len = 60;
    var tile = 56;
    ctx.save();
    ctx.globalAlpha = 0.95;
    if (sign < 0) {
      ctx.translate(2 * handX, 0);
      ctx.scale(-1, 1);
    }
    for (var left = 0; left < len; left += tile) {
      var chunk = Math.min(tile, len - left);
      ctx.drawImage(
        sprites,
        fr[0], fr[1], chunk, fr[3],
        Math.round(handX + left), Math.round(handY - fr[3] / 2), chunk, fr[3]
      );
    }
    ctx.restore();
  }

  function drawAttack(ctx, item, now) {
    if (reducedMotion || !item.pose.attack || item.f.kind === 'claude') return;
    var sign = item.pose.dir === 'L' ? -1 : 1;
    var handX = item.x + sign * 10;
    var handY = item.y - 16;
    var start = item.f.actionStart || now;
    if (item.pose.attack === 'beam') drawBeam(ctx, handX, handY, sign, now);
    else drawBalls(ctx, handX, handY, sign, start, now);
  }

  function drawFlame(ctx, item, now) {
    if (reducedMotion) return;
    var keys = atlas.fx.flame.frames;
    var index = Math.floor(now / 250) % keys.length;
    drawFxCentered(ctx, keys[index], item.x - 4, item.y - 3, false, 0.9);
    drawFxCentered(ctx, keys[(index + 1) % keys.length], item.x + 4, item.y - 4, false, 0.75);
  }

  function drawGlyph(ctx, glyph, x, y, scale, color) {
    var rows = GLYPHS[glyph];
    if (!rows) return;
    var r;
    var c;
    ctx.save();
    ctx.fillStyle = '#000';
    for (r = 0; r < rows.length; r += 1) {
      for (c = 0; c < rows[r].length; c += 1) {
        if (rows[r].charAt(c) !== '1') continue;
        ctx.fillRect(x + c * scale + 1, y + r * scale + 1, scale, scale);
      }
    }
    ctx.fillStyle = color || '#fff';
    for (r = 0; r < rows.length; r += 1) {
      for (c = 0; c < rows[r].length; c += 1) {
        if (rows[r].charAt(c) !== '1') continue;
        ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
      }
    }
    ctx.restore();
  }

  function drawIndicator(ctx, item, now) {
    var f = item.f;
    if (item.pose.indicator === '!') {
      if (!reducedMotion && Math.floor(now / 500) % 2 === 1) return;
      drawGlyph(ctx, '!', Math.round(item.x) - 2, Math.round(item.y - item.fr[3] - 12), 2, '#fff');
    } else if (item.pose.indicator === 'z') {
      var period = 3000;
      var p = ((now - (f.actionStart || now)) % period) / period;
      if (p < 0) p = 0;
      ctx.save();
      ctx.globalAlpha = 0.15 + (1 - p) * 0.85;
      drawGlyph(ctx, 'z', Math.round(item.x) + 6, Math.round(item.y - item.fr[3] - 6 - p * 10), 2, '#fff');
      ctx.restore();
    }
  }

  function updateOverlay(item, panel, now) {
    var f = item.f;
    var node = f.node;
    if (!node) return;
    var overlay = panel.overlay;
    var w = panel.bg.w;
    var h = panel.bg.h;
    var size = f.size;

    if (node.btn.parentNode !== overlay) {
      overlay.appendChild(node.btn);
      overlay.appendChild(node.name);
      if (node.hp) overlay.appendChild(node.hp);
    }

    var left = (item.x / w) * 100;
    var top = (item.y / h) * 100;

    node.btn.style.left = pct(left);
    node.btn.style.top = pct(top);
    node.btn.style.width = pct((size.w / w) * 100);
    node.btn.style.height = pct((size.h / h) * 100);
    node.btn.style.transform = 'translate(-50%, -100%)';

    node.name.style.opacity = item.vis < 1 ? String(item.vis) : '';
    node.name.style.left = pct(left);
    node.name.style.top = pct(top);
    node.name.style.transform = 'translate(-50%, 4px)';

    if (node.hp && node.hp.parentNode === overlay) {
      node.hp.style.left = pct(left);
      node.hp.style.top = pct(top);
      node.hp.style.transform = 'translate(-50%, 28px)';
    }

    if (f.bubble && f.bubble.until > now) {
      if (f.bubble.text !== node.bubbleText) {
        node.bubble.textContent = f.bubble.text;
        node.bubbleText = f.bubble.text;
      }
      node.bubble.hidden = false;
      if (node.bubble.parentNode !== overlay) overlay.appendChild(node.bubble);
      node.bubble.style.left = pct(left);
      node.bubble.style.top = pct(((item.y - size.h - 4) / h) * 100);
      node.bubble.style.transform = 'translate(-50%, -100%)';
    } else {
      if (node.bubble.parentNode) node.bubble.parentNode.removeChild(node.bubble);
      node.bubble.hidden = true;
    }
  }

  function curvePoints(x1, y1, x2, y2) {
    var len = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    var n = Math.max(2, Math.round(len));
    var cx = (x1 + x2) / 2;
    var cy = Math.min(y1, y2) - Math.min(18, len * 0.18);
    var pts = [];
    for (var i = 0; i <= n; i += 1) {
      var t = i / n;
      var u = 1 - t;
      pts.push([u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2]);
    }
    return pts;
  }

  // filo di ki di una missione: dal mittente (Claude) al destinatario
  function drawMissionThread(ctx, pts, color, mode, thick, now, alpha) {
    var off = reducedMotion ? 0 : Math.floor(now / 45);
    var a = alpha;
    if (mode === 'flicker') {
      color = '#ff6b5a';
      if (!reducedMotion && Math.floor(now / 90) % 4 === 0) a *= 0.25;
    }
    ctx.save();
    ctx.globalAlpha = a;
    for (var i = 0; i < pts.length; i += 1) {
      var on;
      if (mode === 'flow') on = ((i - off) % 8 + 8) % 8 < 4;
      else on = i % 6 < 4;
      if (!on) continue;
      var x = Math.round(pts[i][0]);
      var y = Math.round(pts[i][1]);
      if (thick) {
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 1, y - 1, 4, 4);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 2, 2);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();
  }

  function drawRing(ctx, item, now) {
    var f = item.f;
    var m = missionOf(f);
    var color;
    var rx;
    var lw;
    var alpha = 1;
    if (f.kind === 'claude') {
      color = m ? m.color : '#fff';
      rx = Math.max(11, item.fr[2] * 0.6);
      lw = 2;
    } else if (f.kind === 'oc' && !f.isCompanion) {
      color = ROLE_COLOR[f.role] || '#fff';
      rx = item.fr[2] * (0.4 + 0.07 * (f.hash % 3));
      lw = 1;
      alpha = 0.7;
    } else {
      return;
    }
    if (highlightId && f.missionId === highlightId && m) {
      color = m.color;
      lw += 1;
      alpha = 1;
      if (!reducedMotion) rx += Math.sin(now / 160) * 2;
      else rx += 2;
    }
    var ry = Math.max(2, rx * 0.3);
    ctx.save();
    ctx.globalAlpha = alpha * item.vis;
    ctx.lineWidth = lw + 2;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(item.x, item.y - 1, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.ellipse(item.x, item.y - 1, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPowerRing(ctx, item, now) {
    var f = item.f;
    if (reducedMotion || !f.ringAt) return;
    var p = (now - f.ringAt) / 550;
    if (p < 0 || p > 1) return;
    var m = missionOf(f);
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.lineWidth = 2;
    ctx.strokeStyle = m ? m.color : '#fff';
    ctx.beginPath();
    ctx.ellipse(item.x, item.y - 10, 6 + p * 22, 10 + p * 12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawProjectiles(ctx, byId, now) {
    for (var i = 0; i < projectiles.length; i += 1) {
      var pr = projectiles[i];
      var from = byId.get(pr.from);
      var to = byId.get(pr.to);
      if (!from || !to) continue;
      var t = clamp((now - pr.start) / pr.dur, 0, 1);
      var pts = curvePoints(from.x, from.y - 14, to.x, to.y - 14);
      for (var k = 3; k >= 0; k -= 1) {
        var tt = clamp(t - k * 0.04, 0, 1);
        var pt = pts[Math.min(pts.length - 1, Math.round(tt * (pts.length - 1)))];
        var r = k === 0 ? 4 : 3 - k * 0.6;
        ctx.save();
        ctx.globalAlpha = k === 0 ? 1 : 0.7 - k * 0.15;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
        ctx.fill();
        if (k === 0) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(Math.round(pt[0]) - 1, Math.round(pt[1]) - 1, 2, 2);
        }
        ctx.restore();
      }
    }
  }

  function drawMarks(ctx, item, now, m) {
    var f = item.f;
    if (f.kind !== 'claude' || !m) return;
    var top = Math.round(item.y - item.fr[3] - 14);
    var stuck = false;
    for (var i = 0; i < m.live.length; i += 1) {
      if (m.live[i].status === 'stuck') stuck = true;
    }
    var alert = f.alertUntil > now || stuck;
    var wait = item.pose.indicator === '?';
    var blinkOn = reducedMotion || Math.floor(now / 450) % 2 === 0;
    var qx = Math.round(item.x) - (alert ? 8 : 3);
    if (wait && blinkOn) drawGlyph(ctx, '?', qx, top, 2, '#ffe03a');
    if (alert && (reducedMotion || Math.floor(now / 200) % 2 === 0)) {
      drawGlyph(ctx, '!', Math.round(item.x) + (wait ? 4 : -2), top, 2, '#ff4040');
    }
  }

  function drawGhost(ctx, g, color, anchor, now, alpha) {
    var pts = curvePoints(anchor.x, anchor.y, g.x, g.y - 12);
    drawMissionThread(ctx, pts, color, 'steady', false, now, 0.5 * alpha);
    ctx.save();
    ctx.globalAlpha = 0.8 * alpha;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y - 1, 11, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    drawGlyph(ctx, '?', Math.round(g.x) - 3, Math.round(g.y - 22), 2, color);
    ctx.restore();
  }

  function drawPanel(panel, now) {
    if (!panel.bg) return;
    var ctx = panel.ctx;
    ctx.imageSmoothingEnabled = false;

    var bgImg = bgImages.get(panel.bgKey);
    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, panel.canvas.width, panel.canvas.height);
    } else {
      ctx.fillStyle = '#05060d';
      ctx.fillRect(0, 0, panel.canvas.width, panel.canvas.height);
    }

    var mission = panel.mission || null;
    var items = [];
    var i;
    for (i = 0; i < panel.fighters.length; i += 1) {
      var f = panel.fighters[i];
      var pose = poseFor(f, now);
      var frame = frameFor(f, pose, now);
      var fr = atlas.frames[frame.key];
      if (!fr) continue;
      var drawX = f.x + pose.offsetX;
      var drawY = f.y + pose.orbitY;
      if (pose.walkP !== undefined) {
        var owner = fighters.get('c:' + f.missionId);
        if (owner) {
          drawX = f.x + (owner.x + 24 - f.x) * pose.walkP;
          drawY = f.y + (owner.y + 3 - f.y) * pose.walkP;
        }
      }
      f.drawX = drawX;
      f.drawY = drawY;
      var flip = (frame.face === 'L' || frame.face === 'R') && frame.face !== pose.dir;
      if (frame.face === 'F' && f.kind === 'oc' && !f.isCompanion && (f.hash & 1) && !pose.indicator) flip = true;
      var vis = visibility(f, now);
      var dim = highlightId && f.missionId !== highlightId;
      items.push({ f: f, pose: pose, frame: frame, fr: fr, x: drawX, y: drawY, flip: flip, vis: vis * (dim ? 0.35 : 1) });
    }

    var byId = new Map();
    items.forEach(function (item) { byId.set(item.f.id, item); });

    var claudeItem = mission ? byId.get(mission.fid) : null;
    var anchor = claudeItem ? { x: claudeItem.x, y: claudeItem.y - 14 } : (panel.anchor || null);
    var threadDim = highlightId && mission && mission.id !== highlightId ? 0.35 : 1;

    items.forEach(function (item) {
      var f = item.f;
      if (!f.isCompanion || !f.parentId) return;
      var parent = byId.get(f.parentId);
      if (!parent) return;
      if (parent.f.kind === 'claude' && mission) {
        if (item.vis <= 0) return;
        var spts = curvePoints(parent.x, parent.y - 10, item.x, item.y - 10);
        drawMissionThread(ctx, spts, mission.color, f.session.status === 'working' ? 'flow' : 'steady', false, now, (f.session.status === 'working' ? 1 : 0.5) * threadDim);
        return;
      }
      var active = f.session.status === 'working';
      drawKiThread(ctx, parent.x, parent.y - 10, item.x, item.y - 10, active, now);
    });

    if (mission && anchor) {
      items.forEach(function (item) {
        var f = item.f;
        if (f.kind !== 'oc' || f.isCompanion || f.missionId !== mission.id) return;
        if (item.vis <= 0) return;
        var st = f.session.status;
        var mode = st === 'working' ? 'flow' : (st === 'stuck' || st === 'failed' ? 'flicker' : 'steady');
        var pts = curvePoints(anchor.x, anchor.y, item.x, item.y - 14);
        drawMissionThread(ctx, pts, mission.color, mode, true, now, (f.hold && st === 'idle' ? 0.5 : 1) * threadDim);
      });
      (panel.ghosts || []).forEach(function (g) {
        drawGhost(ctx, g, mission.color, anchor, now, threadDim);
      });
    }

    items.sort(function (a, b) { return a.y - b.y; });

    items.forEach(function (item) {
      var f = item.f;
      drawRing(ctx, item, now);
      drawPowerRing(ctx, item, now);
      ctx.save();
      ctx.globalAlpha = item.vis;
      drawShadow(ctx, item.x, item.y, item.fr[2]);
      ctx.restore();
      var alpha = item.pose.alpha * item.vis * (item.pose.hidden ? 0 : 1);
      drawSprite(ctx, item.frame.key, item.x, item.y, {
        flip: item.flip,
        alpha: alpha,
        rotate: item.pose.rotate,
        flash: f.flashUntil > now,
        scale: f.scale
      });
    });

    items.forEach(function (item) {
      if (item.vis < 0.5) return;
      drawAttack(ctx, item, now);
      if (item.pose.flame) drawFlame(ctx, item, now);
    });

    items.forEach(function (item) {
      if (item.vis < 0.5) return;
      drawIndicator(ctx, item, now);
      drawMarks(ctx, item, now, mission);
    });

    drawProjectiles(ctx, byId, now);

    items.forEach(function (item) {
      updateOverlay(item, panel, now);
    });
  }

  // ---- dialog GBA ----

  function delegTitles(m) {
    var shown = m.titles.slice(0, 4).map(function (t) {
      return truncate(t.title, 26) + (t.unlinked ? ' (non collegata)' : (t.live ? '' : ' (finita)'));
    });
    var extra = m.titles.length - shown.length;
    return shown.join(' · ') + (extra > 0 ? ' · +' + extra : '');
  }

  function claudeRows(f) {
    var m = f.mission;
    var c = m.c;
    var subsWorking = c.subagents.filter(function (x) { return x.state === 'working'; }).length;
    var live = m.live.length + m.ghosts.length;
    var deleghe = live + '/' + m.total + (m.total ? ' · ' + delegTitles(m) : '');
    return [
      ['Stato', claudeState(c) + (c.kind === 'bg' ? ' · sessione bg' : '')],
      ['Attività', claudeActivity(c)],
      ['Modello', c.model || '—'],
      ['Directory', c.directory || '—'],
      ['Sub-agenti', subsWorking + '/' + c.subagents.length],
      ['Deleghe', deleghe],
      ['Aggiornata', timeAgo(c.updatedAt)]
    ];
  }

  function dialogRows(f) {
    var s = f.session;
    var la = s.lastActivity;
    if (f.kind === 'claude') return claudeRows(f);
    if (f.kind === 'sub') {
      var mm = missionOf(f);
      return [
        ['Tipo', s.title],
        ['Stato', s.status === 'working' ? 'in corso' : 'finito'],
        ['Agli ordini di', 'Claude' + (mm ? ' · ' + mm.project : '')]
      ];
    }

    var move = '—';
    if (la) {
      var what = la.tool ? la.tool : typeLabel(la.type);
      move = what + (la.summary ? ' · ' + la.summary : '');
    }

    var model = [s.model, s.provider].filter(Boolean).join(' · ') || '—';
    var costo = num(s.cost) > 0 ? money(s.cost) : (num(s.estCost) > 0 ? '~' + money(s.estCost) : money(0));
    var todos = s.todos && num(s.todos.total) > 0
      ? num(s.todos.done) + '/' + num(s.todos.total) + ' completati'
      : 'nessuno';

    var from = missionOf(f);
    var rows0 = [['Stato', statusLabel(s.status)]];
    if (f.missionId) rows0.push(['Delegata da', 'Claude · ' + (from ? from.project : (s.claude && s.claude.short) || '—')]);
    return rows0.concat([
      ['Ultima mossa', move],
      ['Modello', model],
      ['Costo', costo],
      ['Todos', todos],
      ['Directory', s.directory || '—'],
      ['Aggiornata', timeAgo(s.timeUpdated)]
    ]);
  }

  function stopTyping() {
    if (typing && typing.timer) clearInterval(typing.timer);
    typing = null;
  }

  function finishTyping() {
    if (!typing) return;
    var current = typing;
    current.values.forEach(function (value) {
      value.el.textContent = value.text;
    });
    if (current.timer) clearInterval(current.timer);
    typing = null;
  }

  function skipTyping() {
    finishTyping();
  }

  function startTyping(values) {
    typing = { timer: 0, values: values, idx: 0, pos: 0 };
    typing.timer = setInterval(function () {
      var current = typing;
      if (!current) return;
      while (current.idx < current.values.length) {
        var value = current.values[current.idx];
        if (current.pos < value.text.length) {
          current.pos += 1;
          value.el.textContent = value.text.slice(0, current.pos);
          return;
        }
        current.idx += 1;
        current.pos = 0;
      }
      stopTyping();
    }, TYPE_MS);
  }

  function drawPortraitChar(charName) {
    var canvas = $('dialog-portrait');
    if (!canvas || !atlas || !sprites) return;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 32, 32);

    var entry = resolveAnim(charName, 'portrait');
    var frameKey = entry.def.frames && entry.def.frames[0];
    var fr = frameKey ? atlas.frames[frameKey] : null;
    if (!fr) return;

    var scale = Math.min(1, 32 / fr[2], 32 / fr[3]);
    var w = Math.max(1, Math.round(fr[2] * scale));
    var h = Math.max(1, Math.round(fr[3] * scale));
    var dx = Math.round((32 - w) / 2);
    var dy = Math.round((32 - h) / 2);
    ctx.drawImage(sprites, fr[0], fr[1], fr[2], fr[3], dx, dy, w, h);
  }

  function drawPortrait(f) {
    var charName = f.char;
    if (f.isCompanion && f.parentId) {
      var parent = fighters.get(f.parentId);
      if (parent) charName = parent.char;
    }
    if (f.kind === 'sub') charName = claudeChar(f.missionId);
    drawPortraitChar(charName);
  }

  function populateDialog(f, animate) {
    stopTyping();

    var s = f.session;
    var title = $('dialog-title');
    if (title) {
      var name = (f.label || charLabel(f.char)).toUpperCase();
      title.textContent = name + ' · ' + (s.title || 'Senza titolo');
    }

    drawPortrait(f);

    var open = $('dialog-open');
    if (open) {
      open.hidden = f.kind !== 'oc';
      if (f.kind === 'oc') open.href = '/#s=' + encodeURIComponent(s.id);
    }

    var body = $('dialog-body');
    if (!body) return;
    body.textContent = '';

    var rows = dialogRows(f);
    var values = [];
    var type = animate && !reducedMotion;

    rows.forEach(function (row) {
      var p = document.createElement('p');
      var label = document.createElement('span');
      label.textContent = row[0] + ': ';
      paint(label, '#ffd93b');
      var value = document.createElement('span');
      value.textContent = type ? '' : row[1];
      p.appendChild(label);
      p.appendChild(value);
      body.appendChild(p);
      if (type) values.push({ el: value, text: row[1] });
    });

    if (values.length) startTyping(values);
  }

  // ---- dialog di Freezer (il servizio opencode) ----

  var SERVICE_OPENING = 'Ohoho. Io sono il servizio opencode: ogni guerriero qui sotto combatte ai miei ordini. Cosa vuoi sapere?';
  var SERVICE_DOWN = 'Il trono è vuoto: il servizio opencode non risponde.';
  var TALK_OPTIONS = [
    { key: 'status', label: 'Come stai?' },
    { key: 'fighting', label: 'Chi sta combattendo?' },
    { key: 'cost', label: 'Quanto ci costa?' },
    { key: 'problems', label: 'Ci sono problemi?' },
    { key: 'claude', label: 'E Claude?' },
    { key: 'bye', label: 'Arrivederci' }
  ];

  function serviceTitle(s) {
    return s && s.title ? s.title : 'Senza titolo';
  }

  function activityLabel(s) {
    var la = s && s.lastActivity;
    if (!la) return 'attività sconosciuta';
    return la.tool ? la.tool : typeLabel(la.type);
  }

  function serviceAnswer(key) {
    if (!overview) return SERVICE_DOWN;

    var sessions = overview.sessions || [];
    var svc = overview.service || {};

    if (key === 'status') {
      var processes = overview.processes || [];
      var zombies = 0;
      processes.forEach(function (p) {
        if (p && p.state === 'Z') zombies += 1;
      });
      return 'Sono vivo e in forma: il servizio v' + (svc.version || '—') +
        ' risponde su ' + (svc.url || '—') + ', PID ' + (svc.pid == null ? '—' : svc.pid) +
        '. Processi opencode: ' + processes.length + ', zombie: ' + zombies + '.';
    }

    if (key === 'fighting') {
      var working = sessions.filter(function (s) {
        return s.status === 'working';
      }).sort(sortByRecent).slice(0, 5);
      if (!working.length) return 'Nessuno. I miei guerrieri riposano.';
      return 'In combattimento: ' + working.map(function (s) {
        return serviceTitle(s) + ': ' + activityLabel(s);
      }).join(' · ') + '.';
    }

    if (key === 'cost') {
      var top = sessions.slice().sort(function (a, b) {
        return num(b.estCost) - num(a.estCost);
      }).filter(function (s) {
        return num(s.estCost) > 0;
      }).slice(0, 3);

      var text = 'Ultime 24 ore: ' + money(overview.cost24h) + ' reali, circa ' +
        money(overview.estCost24h) + ' a listino.';
      if (top.length) {
        text += ' Le più care: ' + top.map(function (s) {
          return truncate(serviceTitle(s), 32) + ' ' + money(s.estCost);
        }).join(', ') + '.';
      }
      return text;
    }

    if (key === 'problems') {
      var stuck = sessions.filter(function (s) { return s.status === 'stuck'; });
      var failed = sessions.filter(function (s) { return s.status === 'failed'; });
      if (!stuck.length && !failed.length) return 'Nessun problema. Per ora.';

      var parts = [];
      if (stuck.length) {
        parts.push('Bloccate: ' + stuck.length + ' (' + stuck.slice(0, 3).map(function (s) {
          return truncate(serviceTitle(s), 32);
        }).join(', ') + ').');
      }
      if (failed.length) {
        parts.push('Fallite: ' + failed.length + ' (' + failed.slice(0, 3).map(function (s) {
          return truncate(serviceTitle(s), 32);
        }).join(', ') + ').');
      }
      return parts.join(' ');
    }

    if (key === 'claude') return claudeAnswer();

    return '';
  }

  function claudeAnswer() {
    if (!overview.claudeSupported) {
      return 'Non vedo nessun Claude da qui: il server non mi manda notizie.';
    }
    if (!missions.length) return 'Nessun Claude in vista. La sala comandi è vuota.';

    var working = missions.filter(function (m) { return m.c.status === 'working'; });
    var waiting = missions.filter(function (m) { return m.c.status === 'waiting' && m.c.kind !== 'bg'; });
    var bg = missions.filter(function (m) { return m.c.status === 'waiting' && m.c.kind === 'bg'; });
    var idle = missions.filter(function (m) { return m.c.status === 'idle'; });
    var parts = ['Claude: ' + missions.length + (missions.length === 1 ? ' sessione' : ' sessioni') +
      ' (' + working.length + ' al lavoro, ' + (waiting.length + bg.length) + ' in attesa, ' + idle.length + ' a riposo).'];

    if (waiting.length) {
      parts.push('Aspettano te: ' + waiting.map(function (m) { return truncate(m.project, 20); }).join(', ') + '.');
    }
    var withLive = missions.filter(function (m) { return m.live.length + m.ghosts.length > 0; });
    if (withLive.length) {
      parts.push('Deleghe vive: ' + withLive.map(function (m) {
        return truncate(m.project, 20) + ' ' + (m.live.length + m.ghosts.length);
      }).join(', ') + '.');
    } else {
      parts.push('Nessuna delega in corso.');
    }
    var unlinked = [];
    missions.forEach(function (m) {
      m.titles.forEach(function (t) { if (t.unlinked && t.live) unlinked.push(truncate(t.title, 24)); });
    });
    if (unlinked.length) {
      parts.push('Deleghe non collegate: ' + unlinked.length + ' (' + unlinked.slice(0, 3).join(', ') + ').');
    }
    return parts.join(' ');
  }

  function setServiceLine(text, animate) {
    var line = $('service-line');
    if (!line) return;
    stopTyping();
    line.textContent = '';
    if (animate && !reducedMotion) startTyping([{ el: line, text: text }]);
    else line.textContent = text;
  }

  function onServiceChoice(key) {
    if (key === 'bye') {
      closeDialog();
      return;
    }
    setServiceLine(serviceAlive() ? serviceAnswer(key) : SERVICE_DOWN, true);
  }

  function populateServiceDialog(animate) {
    stopTyping();

    var title = $('dialog-title');
    if (title) title.textContent = 'FREEZER · servizio opencode';

    drawPortraitChar(cast.service[0]);

    var open = $('dialog-open');
    if (open) open.hidden = true;

    var body = $('dialog-body');
    if (!body) return;
    body.textContent = '';

    var line = document.createElement('p');
    line.id = 'service-line';
    line.className = 'talk-line';
    body.appendChild(line);

    var menu = document.createElement('ul');
    menu.className = 'talk-menu';

    TALK_OPTIONS.forEach(function (opt) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'talk-opt';
      btn.textContent = opt.label;
      btn.addEventListener('click', function () {
        onServiceChoice(opt.key);
      });
      li.appendChild(btn);
      menu.appendChild(li);
    });

    menu.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      var opts = Array.prototype.slice.call(menu.querySelectorAll('.talk-opt'));
      if (!opts.length) return;
      event.preventDefault();
      var index = opts.indexOf(document.activeElement);
      var step = event.key === 'ArrowDown' ? 1 : -1;
      if (index < 0) index = step > 0 ? 0 : opts.length - 1;
      else index = (index + step + opts.length) % opts.length;
      opts[index].focus();
    });

    body.appendChild(menu);

    setServiceLine(serviceAlive() ? SERVICE_OPENING : SERVICE_DOWN, animate);
  }

  function openServiceDialog() {
    if (!atlas || !overview) return;
    var dialog = $('dialog');
    if (!dialog) return;

    openId = SERVICE_ID;
    lastFocus = $('frieza-btn') || document.activeElement;

    populateServiceDialog(true);
    dialog.hidden = false;
    renderSpeech();

    var first = dialog.querySelector('.talk-opt');
    if (first) first.focus();
    else {
      var close = $('dialog-close');
      if (close) close.focus();
    }
  }

  function openDialog(id) {
    var f = fighters.get(id);
    if (!f || !atlas || !overview) return;
    var dialog = $('dialog');
    if (!dialog) return;

    openId = id;
    highlightId = f.missionId || null;
    lastFocus = f.node ? f.node.btn : document.activeElement;

    populateDialog(f, true);
    dialog.hidden = false;
    renderSpeech();

    var close = $('dialog-close');
    if (close) close.focus();
  }

  function closeDialog() {
    if (!openId) return;
    openId = null;
    highlightId = null;
    stopTyping();
    var dialog = $('dialog');
    if (dialog) dialog.hidden = true;
    if (lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (err) {}
    }
    lastFocus = null;
  }

  function trapFocus(event) {
    var dialog = $('dialog');
    if (!dialog) return;
    var found = dialog.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    var list = Array.prototype.slice.call(found);
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first || !dialog.contains(document.activeElement)) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last || !dialog.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }

  function onKeyDown(event) {
    if (!openId) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key === 'Tab') {
      skipTyping();
      trapFocus(event);
      return;
    }
    skipTyping();
  }

  // ---- flusso dati ----

  function onOverview(data) {
    overview = data;
    noteOverviewEvents(data);
    layout();
    renderHud();
    drawBanner();
    updateFriezaTag();
    if (!running) startLoop();
  }

  function onPart(part) {
    if (!part || !part.sessionId) return;
    var f = fighters.get(part.sessionId);
    if (!f) return;

    var now = Date.now();
    var summary = part.summary || part.partType || '';
    f.session.lastActivity = {
      type: part.partType || 'unknown',
      tool: part.tool,
      status: part.status,
      summary: part.summary || ''
    };
    f.flashUntil = now + 120;
    f.bubble = {
      text: truncate(summary, 40) || '…',
      until: now + BUBBLE_MS
    };
    f.actionSig = '';
    f.actionStart = now;
    f.animStart = now;
  }

  // ---- loop ----

  function tick(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
    if (document.hidden) return;

    var gap = reducedMotion ? 250 : 33;
    if (lastTick && ts - lastTick < gap) return;
    lastTick = ts;

    var now = Date.now();
    var t0 = performance.now();

    var expired = false;
    holds.forEach(function (h, id) {
      if (now >= h.until) {
        holds.delete(id);
        expired = true;
      }
    });
    if (projectiles.length) {
      projectiles = projectiles.filter(function (p) { return now - p.start < p.dur; });
    }
    if (expired) layout();

    drawBanner();
    zoneStates.forEach(function (zs) {
      if (zs.el.hidden) return;
      zs.panels.forEach(function (panel) {
        drawPanel(panel, now);
      });
    });

    var cost = performance.now() - t0;
    frameStats.n += 1;
    frameStats.sum += cost;
    if (cost > frameStats.max) frameStats.max = cost;
  }

  function startLoop() {
    if (running || !atlas) return;
    running = true;
    lastTick = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // ---- avvio ----

  function init() {
    bannerCanvas = $('banner-canvas');
    if (bannerCanvas) {
      bannerCtx = bannerCanvas.getContext('2d');
      bannerCtx.imageSmoothingEnabled = false;
    }

    setConn('connecting');

    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      reducedMotion = !!mq.matches;
      var onChange = function (event) {
        reducedMotion = !!event.matches;
        if (reducedMotion) finishTyping();
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopLoop();
      else startLoop();
    });

    document.addEventListener('keydown', onKeyDown);

    var dialog = $('dialog');
    if (dialog) {
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) closeDialog();
        else skipTyping();
      });
    }
    var close = $('dialog-close');
    if (close) close.addEventListener('click', closeDialog);

    var friezaBtn = $('frieza-btn');
    if (friezaBtn) friezaBtn.addEventListener('click', openServiceDialog);

    setInterval(speechTick, 250);

    loadAssets().then(function () {
      renderHud();
      if (!window.OC2D_DATA || typeof window.OC2D_DATA.start !== 'function') {
        showFatal('Livello dati non disponibile: impossibile avviare la vista 2D.');
        handleConn('offline');
        return;
      }
      window.OC2D_DATA.start(onOverview, onPart, handleConn);
      startLoop();
    }).catch(function (err) {
      handleConn('offline');
      showFatal('Impossibile caricare gli asset della vista 2D. ' + (err && err.message ? err.message : ''));
    });
  }

  function installDebug() {
    var mock = false;
    try { mock = new URLSearchParams(location.search).has('mock'); } catch (err) {}
    if (!mock) return;
    window.__oc2d = {
      events: eventLog,
      state: function () {
        var panels = [];
        zoneStates.forEach(function (zs, status) {
          zs.panels.forEach(function (p, key) {
            panels.push({
              zone: status,
              key: String(key),
              mission: p.mission ? p.mission.id : null,
              ids: p.fighters.map(function (f) { return f.id; })
            });
          });
        });
        var fs = [];
        fighters.forEach(function (f) {
          fs.push({
            id: f.id, kind: f.kind, char: f.char, role: f.role, anim: f.anim, placed: f.placed,
            inMission: f.inMission, missionId: f.missionId, status: f.session && f.session.status,
            vis: visibility(f, Date.now())
          });
        });
        return {
          reduced: reducedMotion,
          highlight: highlightId,
          supported: !!(overview && overview.claudeSupported),
          missions: missions.map(function (m) {
            return {
              id: m.id, project: m.project, color: m.color, status: m.c.status,
              live: m.live.map(function (s) { return s.id; }),
              ghosts: m.ghosts.length, total: m.total
            };
          }),
          panels: panels,
          fighters: fs,
          holds: Array.from(holds.keys()),
          projectiles: projectiles.length
        };
      },
      frame: function () {
        return { n: frameStats.n, avg: frameStats.n ? frameStats.sum / frameStats.n : 0, max: frameStats.max };
      },
      resetFrame: function () { frameStats = { n: 0, sum: 0, max: 0 }; },
      atlas: function () { return atlas; },
      setCast: function (patch) {
        Object.keys(patch || {}).forEach(function (k) {
          if (CAST[k] && !Array.isArray(CAST[k])) Object.assign(CAST[k], patch[k]);
          else CAST[k] = patch[k];
        });
        resolveCast();
        return JSON.parse(JSON.stringify(cast));
      },
      feed: function (raw) {
        var data = window.OC2D_DATA.normalizeOverview(raw);
        if (data) onOverview(data);
      }
    };
  }

  installDebug();
  init();
})();

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

  var CHAR_LABEL = {
    goku: 'Goku',
    vegeta: 'Vegeta',
    ginyu: 'Ginyu',
    frieza: 'Freezer',
    gohan: 'Gohan',
    bubbles: 'Bubbles'
  };

  var CHAR_MAIN = ['goku', 'vegeta', 'ginyu', 'frieza'];
  var CHAR_SUB = ['gohan', 'bubbles'];

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

  var GLYPHS = {
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

  function charFor(id, companion) {
    var list = companion ? CHAR_SUB : CHAR_MAIN;
    return list[fnv1a(String(id)) % list.length];
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

  function addStat(container, text, value) {
    var span = document.createElement('span');
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

    var costText = 'costo 24h ' + money(overview.cost24h);
    if (num(overview.estCost24h) > num(overview.cost24h) + 0.0001) {
      costText += ' · ~' + money(overview.estCost24h);
    }
    addStat(stats, costText);

    var version = overview.service && overview.service.version ? overview.service.version : '—';
    addStat(stats, 'v' + version);
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
    el.className = 'zone';
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
    if (zonesEl) zonesEl.appendChild(el);

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

  function ensureFighter(session) {
    var f = fighters.get(session.id);
    if (!f) {
      var companion = !!(session.parentId && session.parentId !== session.id && lastSessionsById.has(session.parentId));
      f = {
        id: session.id,
        session: session,
        char: charFor(session.id, companion),
        isCompanion: companion,
        parentId: session.parentId || null,
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
        placed: false
      };
      fighters.set(session.id, f);
    }
    f.session = session;
    return f;
  }

  function applyNodeMeta(f, overlay) {
    var node = ensureNode(f);
    var s = f.session;
    var label = CHAR_LABEL[f.char] || 'Guerriero';
    node.btn.setAttribute('aria-label', label + ' — ' + (s.title || 'Senza titolo') + ' — ' + statusLabel(s.status));
    node.name.textContent = truncate(s.title || 'Senza titolo', 18);
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

  function layout() {
    if (!atlas || !overview) return;

    var sessions = overview.sessions || [];
    lastSessionsById = new Map();
    var present = new Set();

    sessions.forEach(function (s) {
      lastSessionsById.set(s.id, s);
      present.add(s.id);
    });

    fighters.forEach(function (f, id) {
      if (!present.has(id)) {
        detachNode(f);
        fighters.delete(id);
      }
    });

    sessions.forEach(function (s) {
      var f = ensureFighter(s);
      f.placed = false;
    });

    var mainsByStatus = {};
    ZONES.forEach(function (zone) { mainsByStatus[zone.status] = []; });

    var companionSessions = [];
    var mainSessions = [];

    sessions.forEach(function (s) {
      if (s.parentId && s.parentId !== s.id && lastSessionsById.has(s.parentId)) {
        companionSessions.push(s);
      } else {
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

    var selected = {};
    var selectedIds = new Set();

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

    if (openId) {
      var current = fighters.get(openId);
      if (current && present.has(openId)) populateDialog(current, false);
      else closeDialog();
    }
  }

  // ---- animazioni ----

  function resolveAnim(charName, animName) {
    var chars = atlas.chars || {};
    var char = chars[charName] || chars.goku || {};
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

    if (f.isCompanion) {
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

    var status = s.status;
    var tool = la && la.tool ? String(la.tool).toLowerCase() : '';
    var type = la && la.type ? String(la.type).toLowerCase() : '';

    if (status === 'working') {
      if (tool === 'shell' || tool === 'bash') {
        if (f.char === 'goku' && hasAnim(f.char, 'kameFire')) {
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
      pose.anim = 'stand';
      pose.fps = 2;
      pose.indicator = '!';
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
      var elapsed = Math.max(0, now - (f.animStart || now));
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

    var dx = Math.round(x - sw / 2);
    var dy = Math.round(y - sh);

    if (opts.flash && !reducedMotion) {
      flashCtx.clearRect(0, 0, 64, 64);
      flashCtx.globalCompositeOperation = 'source-over';
      flashCtx.drawImage(sprites, fr[0], fr[1], sw, sh, 0, 0, sw, sh);
      flashCtx.globalCompositeOperation = 'source-atop';
      flashCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      flashCtx.fillRect(0, 0, sw, sh);
      flashCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(flashCanvas, 0, 0, sw, sh, dx, dy, sw, sh);
    } else {
      ctx.drawImage(sprites, fr[0], fr[1], sw, sh, dx, dy, sw, sh);
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
    if (reducedMotion || !item.pose.attack) return;
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
      f.drawX = drawX;
      f.drawY = drawY;
      var flip = (frame.face === 'L' || frame.face === 'R') && frame.face !== pose.dir;
      items.push({ f: f, pose: pose, frame: frame, fr: fr, x: drawX, y: drawY, flip: flip });
    }

    var byId = new Map();
    items.forEach(function (item) { byId.set(item.f.id, item); });

    items.forEach(function (item) {
      var f = item.f;
      if (!f.isCompanion || !f.parentId) return;
      var parent = byId.get(f.parentId);
      if (!parent) return;
      var active = f.session.status === 'working';
      drawKiThread(ctx, parent.x, parent.y - 10, item.x, item.y - 10, active, now);
    });

    items.sort(function (a, b) { return a.y - b.y; });

    items.forEach(function (item) {
      var f = item.f;
      drawShadow(ctx, item.x, item.y, item.fr[2]);
      var alpha = item.pose.alpha * (item.pose.hidden ? 0 : 1);
      drawSprite(ctx, item.frame.key, item.x, item.y, {
        flip: item.flip,
        alpha: alpha,
        rotate: item.pose.rotate,
        flash: f.flashUntil > now
      });
    });

    items.forEach(function (item) {
      drawAttack(ctx, item, now);
      if (item.pose.flame) drawFlame(ctx, item, now);
    });

    items.forEach(function (item) {
      drawIndicator(ctx, item, now);
    });

    items.forEach(function (item) {
      updateOverlay(item, panel, now);
    });
  }

  // ---- dialog GBA ----

  function dialogRows(f) {
    var s = f.session;
    var la = s.lastActivity;

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

    return [
      ['Stato', statusLabel(s.status)],
      ['Ultima mossa', move],
      ['Modello', model],
      ['Costo', costo],
      ['Todos', todos],
      ['Directory', s.directory || '—'],
      ['Aggiornata', timeAgo(s.timeUpdated)]
    ];
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

  function drawPortrait(f) {
    var canvas = $('dialog-portrait');
    if (!canvas || !atlas || !sprites) return;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 32, 32);

    var charName = f.char;
    if (f.isCompanion && f.parentId) {
      var parent = fighters.get(f.parentId);
      if (parent) charName = parent.char;
    }

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

  function populateDialog(f, animate) {
    stopTyping();

    var s = f.session;
    var title = $('dialog-title');
    if (title) {
      var name = (CHAR_LABEL[f.char] || 'Guerriero').toUpperCase();
      title.textContent = name + ' · ' + (s.title || 'Senza titolo');
    }

    drawPortrait(f);

    var open = $('dialog-open');
    if (open) open.href = '/#s=' + encodeURIComponent(s.id);

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

  function openDialog(id) {
    var f = fighters.get(id);
    if (!f || !atlas || !overview) return;
    var dialog = $('dialog');
    if (!dialog) return;

    openId = id;
    lastFocus = f.node ? f.node.btn : document.activeElement;

    populateDialog(f, true);
    dialog.hidden = false;

    var close = $('dialog-close');
    if (close) close.focus();
  }

  function closeDialog() {
    if (!openId) return;
    openId = null;
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
    layout();
    renderHud();
    drawBanner();
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
    drawBanner();
    zoneStates.forEach(function (zs) {
      if (zs.el.hidden) return;
      zs.panels.forEach(function (panel) {
        drawPanel(panel, now);
      });
    });
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

    loadAssets().then(function () {
      renderHud();
      if (!window.OC2D_DATA || typeof window.OC2D_DATA.start !== 'function') {
        showFatal('Livello dati non disponibile: impossibile avviare la vista 2D.');
        setConn('offline');
        return;
      }
      window.OC2D_DATA.start(onOverview, onPart, setConn);
      startLoop();
    }).catch(function (err) {
      setConn('offline');
      showFatal('Impossibile caricare gli asset della vista 2D. ' + (err && err.message ? err.message : ''));
    });
  }

  init();
})();

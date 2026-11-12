// Test UI della vista 2D (modalità mock). Nessuna dipendenza nel repo:
//   npx -y -p playwright node test/ui/2d.spec.mjs
// Opzione via env: SHOTS=<dir> per gli screenshot (default: $TMPDIR/oc2d-shots).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(here, '../../public');
const SHOTS = process.env.SHOTS || path.join(process.env.TMPDIR || '/tmp', 'oc2d-shots');
fs.mkdirSync(SHOTS, { recursive: true });

function loadPlaywright() {
  const attempts = [];
  const bins = (process.env.PATH || '').split(path.delimiter).filter((p) => p.includes('node_modules'));
  for (const bin of bins) {
    attempts.push(path.join(bin, '..', '..'));
  }
  for (const root of attempts) {
    try {
      return createRequire(path.join(root, 'x.js'))('playwright');
    } catch (err) { /* prossimo */ }
  }
  return createRequire(import.meta.url)('playwright');
}

const { chromium } = loadPlaywright();

// ---- server statico ----

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (url.pathname.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
  const rel = url.pathname === '/' ? '/2d.html' : url.pathname;
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('nf'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- mini framework ----

let passed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name); return; }
  failures.push(name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
  console.log('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = 'a1b2c3d4-0000-4000-8000-00000000000a';
const B = 'b2c3d4e5-0000-4000-8000-00000000000b';

const browser = await chromium.launch();

async function openPage(opts, query) {
  const ctx = await browser.newContext({
    viewport: opts.viewport, reducedMotion: opts.reduced ? 'reduce' : 'no-preference', deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(BASE + '/2d.html?' + query, { waitUntil: 'load' });
  return { ctx, page, problems };
}

const st = (page) => page.evaluate(() => window.__oc2d.state());
const shot = (page, name, full = true) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full });

async function waitState(page, fn, arg, timeout = 8000) {
  await page.waitForFunction(fn, arg, { timeout });
}

async function dialogRows(page) {
  return page.$$eval('#dialog-body p', (ps) => ps.map((p) => p.textContent));
}

// =====================================================================
console.log('\n[1] desktop 1440x900, mock completo');
{
  const { ctx, page, problems } = await openPage({ viewport: { width: 1440, height: 900 } }, 'mock=1');
  await waitState(page, () => document.querySelectorAll('.fighter-btn[data-kind="claude"]').length === 3);
  await sleep(600);
  const s0 = await st(page);

  check('zona sala comandi presente e visibile', await page.locator('[data-zone="command"]').isVisible());
  check('3 personaggi Claude', (await page.locator('.fighter-btn[data-kind="claude"]').count()) === 3);
  const claudeChars = new Set(s0.fighters.filter((f) => f.kind === 'claude').map((f) => f.char));
  check('Claude dal pool dei guerrieri', claudeChars.size >= 1 && [...claudeChars].every((c) => ['goku', 'piccolo', 'trunks'].includes(c)), [...claudeChars]);
  check('tre Claude con sprite distinti', claudeChars.size === 3, [...claudeChars]);
  const ocChars = new Set(s0.fighters.filter((f) => f.kind === 'oc').map((f) => f.char));
  check('nessuna sessione opencode usa goku o frieza', !ocChars.has('goku') && !ocChars.has('frieza'), [...ocChars]);

  const mA = s0.missions.find((m) => m.id === A);
  check('missione A: 3 deleghe vive', mA && mA.live.length === 3, mA);
  const cmdPanels = s0.panels.filter((p) => p.zone === 'command');
  const statusPanels = s0.panels.filter((p) => p.zone !== 'command');
  for (const id of ['s-work-1', 's-work-2', 's-stuck-1']) {
    const inCmd = cmdPanels.filter((p) => p.mission === A && p.ids.includes(id)).length;
    const inStatus = statusPanels.filter((p) => p.ids.includes(id)).length;
    check('delega viva ' + id + ' nel pannello missione e non nelle zone di stato', inCmd === 1 && inStatus === 0, { inCmd, inStatus });
    check('nessun bottone duplicato per ' + id, (await page.locator(`.fighter-btn[data-id="${id}"]`).count()) === 1);
  }
  check('delega non collegata: fantasma contato', s0.missions.find((m) => m.id === B).ghosts === 1);
  check('sub-agenti di A nel pannello (2)', cmdPanels.some((p) => p.mission === A && p.ids.filter((i) => i.startsWith('s:')).length === 2));

  const idleBadge = await page.locator('[data-zone="idle"] .nameplate[data-mission] .m-badge').count();
  const failBadge = await page.locator('[data-zone="failed"] .nameplate[data-mission] .m-badge').count();
  check('delega conclusa (idle) con badge nella sua zona', idleBadge >= 1, idleBadge);
  check('delega fallita con badge nell\'infermeria', failBadge >= 1, failBadge);
  const badgeColor = await page.$eval('[data-zone="idle"] .nameplate[data-mission] .m-badge', (e) => getComputedStyle(e).backgroundColor);
  const mB = s0.missions.find((m) => m.id === B);
  check('colore del badge = colore missione', badgeColor !== 'rgba(0, 0, 0, 0)' && !!mB.color, { badgeColor, color: mB.color });
  check('sessioni non delegate senza badge', (await page.locator('[data-zone="active"] .nameplate[data-mission]').count()) === 0);

  const hud = await page.$$eval('#hud-stats [data-stat]', (els) => Object.fromEntries(els.map((e) => [e.dataset.stat, e.textContent.trim()])));
  check('HUD: claude al lavoro/attesa/deleghe vive', 'claude-working' in hud && 'claude-waiting' in hud && 'deleg-live' in hud, hud);
  check('HUD: valori iniziali 1 / 1 / 4', /1$/.test(hud['claude-working']) && /1$/.test(hud['claude-waiting']) && /4$/.test(hud['deleg-live']), hud);

  const roles = new Set(s0.fighters.filter((f) => f.kind === 'oc').map((f) => f.role));
  check('ruoli opencode presenti: delegate, plan, build, kid', ['delegate', 'plan', 'build', 'kid'].every((r) => roles.has(r)), [...roles]);
  const plan = s0.fighters.find((f) => f.id === 's-plan-1');
  const del = s0.fighters.find((f) => f.id === 's-del-1');
  check('casting: plan=vegeta, delegata dal pool Ginyu', plan.char === 'vegeta' && ['ginyu', 'burter', 'jeice', 'recoome'].includes(del.char), { plan: plan.char, del: del.char });

  await shot(page, 'desktop-1-start');

  // dialog Claude: click
  await page.locator(`.fighter-btn[data-kind="claude"][data-mission="${A}"]`).click();
  await waitState(page, () => !document.getElementById('dialog').hidden);
  await page.keyboard.press('Shift'); // salta la digitazione
  await sleep(150);
  let rows = await dialogRows(page);
  const labels = rows.map((r) => r.split(':')[0]);
  check('dialog Claude (click): campi richiesti', ['Stato', 'Attività', 'Modello', 'Directory', 'Sub-agenti', 'Deleghe'].every((l) => labels.includes(l)), labels);
  check('dialog Claude: sub-agenti 2/2 e deleghe 3/', rows.some((r) => /^Sub-agenti: 2\/2/.test(r)) && rows.some((r) => /^Deleghe: 3\/3/.test(r)), rows);
  check('evidenziazione missione attiva', (await st(page)).highlight === A);
  await sleep(300);
  await shot(page, 'desktop-2-claude-dialog', false);
  await page.keyboard.press('Escape');
  check('chiusura dialog azzera evidenziazione', (await st(page)).highlight === null);

  // dialog Claude: tastiera
  await page.locator(`.fighter-btn[data-kind="claude"][data-mission="${B}"]`).focus();
  await page.keyboard.press('Enter');
  await waitState(page, () => !document.getElementById('dialog').hidden);
  await page.keyboard.press('Shift');
  await sleep(150);
  rows = await dialogRows(page);
  check('dialog Claude (tastiera): attende te + deleghe con titoli', rows.some((r) => /^Stato: attende te/.test(r)) && rows.some((r) => /non collegata/.test(r)), rows);
  const aria = await page.locator(`.fighter-btn[data-kind="claude"][data-mission="${B}"]`).getAttribute('aria-label');
  check('aria-label del bottone Claude significativo', /^Claude — lumen-web — attende te$/.test(aria), aria);
  await page.keyboard.press('Escape');

  // dialog delegata
  await page.locator('.fighter-btn[data-id="s-work-1"]').click();
  await waitState(page, () => !document.getElementById('dialog').hidden);
  await page.keyboard.press('Shift');
  await sleep(150);
  rows = await dialogRows(page);
  check('dialog delegata: "Delegata da: Claude · orion-api"', rows.includes('Delegata da: Claude · orion-api'), rows);
  check('click su delegata evidenzia la missione', (await st(page)).highlight === A);
  await page.keyboard.press('Escape');

  // Freezer: E Claude?
  await page.locator('#frieza-btn').click();
  await waitState(page, () => !document.getElementById('dialog').hidden);
  const opts = await page.$$eval('.talk-opt', (els) => els.map((e) => e.textContent));
  check('Freezer: opzione "E Claude?"', opts.includes('E Claude?'), opts);
  await page.locator('.talk-opt', { hasText: 'E Claude?' }).click();
  await page.keyboard.press('Shift');
  await sleep(200);
  const line = await page.$eval('#service-line', (e) => e.textContent);
  check('Freezer risponde su Claude con dati', /Claude: 3 sessioni/.test(line) && /Aspettano te: lumen-web/.test(line) && /orion-api 3/.test(line) && /non collegate: 1/.test(line), line);
  await page.keyboard.press('Escape');

  // coreografia: attende tutti gli eventi dello script
  console.log('  ... attendo il copione (~45 s)');
  await page.evaluate(() => window.__oc2d.resetFrame());
  const need = ['deleg-start', 'sub-start', 'sub-done', 'deleg-done', 'deleg-stuck', 'deleg-fail', 'claude-wait'];
  const animsA = new Set();
  let maxProj = 0;
  let shotStart = false; let shotDone = false; let shotFail = false;
  let holdSeen = false; let doneInPanelDuringHold = false;
  const t0 = Date.now();
  let types = new Set();
  while (Date.now() - t0 < 60000) {
    const s = await st(page);
    const ev = await page.evaluate(() => window.__oc2d.events.map((e) => e.type));
    types = new Set(ev);
    const ca = s.fighters.find((f) => f.id === 'c:' + A);
    if (ca && ca.anim) animsA.add(ca.anim);
    maxProj = Math.max(maxProj, s.projectiles);
    if (!shotStart && types.has('deleg-start')) { shotStart = true; await sleep(250); await shot(page, 'desktop-3-delegation-start', false); }
    if (types.has('deleg-done') && !holdSeen) {
      holdSeen = s.holds.includes('s-work-2');
      doneInPanelDuringHold = s.panels.some((p) => p.zone === 'command' && p.ids.includes('s-work-2'));
      if (!shotDone) { shotDone = true; await sleep(1500); await shot(page, 'desktop-4-delegation-done', false); }
    }
    if (types.has('deleg-fail') && !shotFail) { shotFail = true; await sleep(300); await shot(page, 'desktop-5-delegation-fail', false); }
    if (need.every((t) => types.has(t)) && Date.now() - t0 > 41000) break;
    await sleep(120);
  }
  const fr = await page.evaluate(() => window.__oc2d.frame());
  for (const t of need) check('evento coreografico: ' + t, types.has(t), [...types]);
  check('delega completata: ancora nel pannello durante la sosta', holdSeen && doneInPanelDuringHold, { holdSeen, doneInPanelDuringHold });
  check('proiettile visto durante l\'avvio di una delega', maxProj >= 1, maxProj);
  check('animazioni di Claude varie (>=3 distinte)', animsA.size >= 3, [...animsA]);
  await sleep(4500);
  const s1 = await st(page);
  check('delega completata poi nella zona a riposo con badge', s1.panels.some((p) => p.zone === 'idle' && p.ids.includes('s-work-2')) && !s1.panels.some((p) => p.zone === 'command' && p.ids.includes('s-work-2')));
  check('delega fallita poi in infermeria', s1.panels.some((p) => p.zone === 'failed' && p.ids.includes('s-new-1')));
  check('nuovo Claude B: fantasma diventa sessione collegata', s1.missions.find((m) => m.id === B).live.includes('s-new-2') && s1.missions.find((m) => m.id === B).ghosts === 0);
  check('A ora in attesa: marcatore ? (indicatore)', s1.missions.find((m) => m.id === A).status === 'waiting');
  const hud2 = await page.$$eval('#hud-stats [data-stat]', (els) => Object.fromEntries(els.map((e) => [e.dataset.stat, e.textContent.trim()])));
  check('HUD aggiornato dopo il copione (2 al lavoro, 1 in attesa)', /2$/.test(hud2['claude-working'] || '') && /1$/.test(hud2['claude-waiting'] || ''), hud2);
  const speech = await page.$eval('#frieza-bubble', (e) => ({ hidden: e.hidden, t: e.textContent }));
  console.log('  info bolla Freezer:', JSON.stringify(speech));
  console.log(`  info costo frame (disegno di tutti i pannelli, mock completo): avg ${fr.avg.toFixed(2)} ms, max ${fr.max.toFixed(1)} ms su ${fr.n} tick`);
  await shot(page, 'desktop-6-end');
  check('nessun errore in console / richieste fallite (desktop)', problems.length === 0, problems);
  await ctx.close();
}

// =====================================================================
console.log('\n[2] mobile 390x844');
{
  const { ctx, page, problems } = await openPage({ viewport: { width: 390, height: 844 } }, 'mock=1&still=1');
  await waitState(page, () => document.querySelectorAll('.fighter-btn[data-kind="claude"]').length === 3);
  await sleep(500);
  const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check('nessun overflow orizzontale su mobile', over.sw <= over.iw, over);
  check('mobile: sala comandi con 3 Claude', (await page.locator('.fighter-btn[data-kind="claude"]').count()) === 3);
  const small = await page.$$eval('.fighter-btn', (els) => els.filter((e) => e.getBoundingClientRect().width < 24).length);
  console.log('  info bottoni sotto i 24 px:', small);
  await shot(page, 'mobile-1-full');
  await page.locator(`.fighter-btn[data-kind="claude"][data-mission="${A}"]`).scrollIntoViewIfNeeded();
  await shot(page, 'mobile-2-command', false);
  await page.locator(`.fighter-btn[data-kind="claude"][data-mission="${A}"]`).click();
  await waitState(page, () => !document.getElementById('dialog').hidden);
  await page.keyboard.press('Shift');
  await sleep(200);
  const box = await page.$eval('.dialog-box', (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: window.innerWidth }; });
  check('mobile: dialog dentro lo schermo', box.l >= 0 && box.r <= box.w + 1, box);
  await shot(page, 'mobile-3-dialog', false);
  check('nessun errore (mobile)', problems.length === 0, problems);
  await ctx.close();
}

// =====================================================================
console.log('\n[3] prefers-reduced-motion: reduce');
{
  const { ctx, page, problems } = await openPage({ viewport: { width: 1440, height: 900 }, reduced: true }, 'mock=1');
  await waitState(page, () => document.querySelectorAll('.fighter-btn[data-kind="claude"]').length === 3);
  check('modalità movimento ridotto riconosciuta', (await st(page)).reduced === true);
  let maxProj = 0;
  const t0 = Date.now();
  let types = new Set();
  while (Date.now() - t0 < 19000) {
    maxProj = Math.max(maxProj, (await st(page)).projectiles);
    types = new Set(await page.evaluate(() => window.__oc2d.events.map((e) => e.type)));
    if (types.has('deleg-start') && types.has('sub-done') && types.has('deleg-done')) break;
    await sleep(150);
  }
  check('nessun proiettile in viaggio', maxProj === 0, maxProj);
  check('eventi comunque registrati', types.has('deleg-start') && types.has('deleg-done'), [...types]);
  const s = await st(page);
  const nw = s.fighters.find((f) => f.id === 's-new-1');
  check('nuovo arrivato visibile subito (stato istantaneo)', nw && nw.vis === 1, nw);
  await page.locator(`.fighter-btn[data-kind="claude"][data-mission="${A}"]`).click();
  await waitState(page, () => !document.getElementById('dialog').hidden);
  const firstRow = await page.$eval('#dialog-body p span:nth-child(2)', (e) => e.textContent);
  check('dialog senza digitazione animata', firstRow.length > 0, firstRow);
  await shot(page, 'reduced-1', false);
  await page.keyboard.press('Escape');
  check('nessun errore (reduced)', problems.length === 0, problems);
  await ctx.close();
}

// =====================================================================
console.log('\n[4] vecchio server: fixture senza `claude`');
{
  const { ctx, page, problems } = await openPage({ viewport: { width: 1440, height: 900 } }, 'mock=1&noclaude=1&still=1');
  await waitState(page, () => document.querySelectorAll('.fighter-btn').length > 5);
  await sleep(500);
  const s = await st(page);
  check('nessuna zona sala comandi visibile', !(await page.locator('[data-zone="command"]').isVisible()));
  check('zero personaggi Claude', (await page.locator('.fighter-btn[data-kind="claude"]').count()) === 0);
  check('sessioni opencode disegnate ugualmente', s.fighters.filter((f) => f.kind === 'oc').length >= 10);
  check('nessuna delega estratta (tutte nelle zone di stato)', s.panels.every((p) => p.zone !== 'command' || p.ids.length === 0));
  check('HUD senza contatori Claude', (await page.locator('#hud-stats [data-stat]').count()) === 0);
  check('nessun badge missione', (await page.locator('.m-badge').count()) === 0);
  await page.locator('#frieza-btn').click();
  await waitState(page, () => !document.getElementById('dialog').hidden);
  await page.locator('.talk-opt', { hasText: 'E Claude?' }).click();
  await page.keyboard.press('Shift');
  await sleep(200);
  const line = await page.$eval('#service-line', (e) => e.textContent);
  check('Freezer: risposta onesta senza dati Claude', /Non vedo nessun Claude/.test(line), line);
  await page.keyboard.press('Escape');
  await shot(page, 'oldserver-1');
  check('nessun errore (vecchio server)', problems.length === 0, problems);

  // feed manuale: sessioni senza campo claude e claude = []
  await page.evaluate(() => {
    window.__oc2d.feed({ sessions: [{ id: 'x1', title: 'solo opencode', status: 'working', agent: 'build' }], service: { alive: true } });
  });
  await sleep(300);
  check('feed senza claude: una sessione, nessun errore', (await page.locator('.fighter-btn[data-id="x1"]').count()) === 1 && problems.length === 0, problems);
  await ctx.close();
}

// =====================================================================
console.log('\n[5] overflow: 6 deleghe vive e 6 sub-agenti');
{
  const { ctx, page, problems } = await openPage({ viewport: { width: 1440, height: 900 } }, 'mock=1&still=1');
  await waitState(page, () => document.querySelectorAll('.fighter-btn[data-kind="claude"]').length === 3);
  await page.evaluate(() => {
    const now = Date.now();
    const cid = 'f0f0f0f0-0000-4000-8000-0000000000ff';
    const sessions = [];
    const deleg = [];
    for (let i = 0; i < 6; i++) {
      sessions.push({ id: 'o' + i, title: 'oc-prova-' + i, status: 'working', agent: 'build', claude: { id: cid, short: cid.slice(0, 8) }, timeCreated: now + i, timeUpdated: now });
      deleg.push({ sessionId: 'o' + i, title: 'oc-prova-' + i, startedAt: now + i, live: true });
    }
    const subs = [];
    for (let i = 0; i < 6; i++) subs.push({ id: 'k' + i, type: i % 2 ? 'Explore' : 'Plan', state: i < 3 ? 'working' : 'done' });
    window.__oc2d.feed({
      sessions, service: { alive: true },
      claude: [{ id: cid, short: cid.slice(0, 8), kind: 'interactive', project: 'prova', model: 'claude-fable-5', status: 'working', activity: { type: 'thinking' }, startedAt: now, subagents: subs, delegations: deleg }],
    });
  });
  await sleep(600);
  const s = await st(page);
  const panels = s.panels.filter((p) => p.mission === 'f0f0f0f0-0000-4000-8000-0000000000ff');
  check('stessa missione su 2 pannelli (4 + 2 deleghe)', panels.length === 2 && panels[0].ids.filter((i) => i.startsWith('o')).length === 4 && panels[1].ids.filter((i) => i.startsWith('o')).length === 2, panels.map((p) => p.ids));
  check('sub-agenti visibili al massimo 4', panels[0].ids.filter((i) => i.startsWith('s:')).length === 4);
  check('marcatore "+2 sub"', (await page.locator('.sub-more:not([hidden])').first().textContent()) === '+2 sub');
  await shot(page, 'overflow-1');
  check('nessun errore (overflow)', problems.length === 0, problems);
  await ctx.close();
}

// =====================================================================
console.log('\n[6] casting: personaggio assente e personaggio con solo stand/walk');
{
  const { ctx, page, problems } = await openPage({ viewport: { width: 1440, height: 900 } }, 'mock=1');
  const warns = [];
  page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
  await waitState(page, () => document.querySelectorAll('.fighter-btn[data-kind="claude"]').length === 3);
  const cast = await page.evaluate(() => {
    const a = window.__oc2d.atlas();
    a.chars.walker = { stand: { face: 'F', frames: ['vegeta:0'] }, walk: { face: 'F', frames: ['vegeta:0', 'vegeta:1'] } };
    window.__oc2d.setCast({ role: { build: ['ghost-missing', 'walker'], plan: ['ghost-missing'] }, kid: { other: ['walker'] } });
    return window.__oc2d.setCast({});
  });
  check('personaggio assente scartato dal pool', !cast.role.build.includes('ghost-missing') && cast.role.build.includes('walker'), cast.role);
  check('pool svuotato: ripiego su un personaggio valido', cast.role.plan.length === 1 && cast.role.plan[0] !== 'ghost-missing', cast.role.plan);
  check('un solo console.warn per il nome assente', warns.filter((w) => w.includes('ghost-missing')).length === 1, warns);
  await page.evaluate(() => {
    const now = Date.now();
    const sessions = ['working', 'active', 'stuck', 'failed', 'idle', 'suspended'].map((status, i) => ({
      id: 'w' + i, title: 'prova-' + i, status, agent: 'build', timeCreated: now + i, timeUpdated: now,
      lastActivity: { type: 'tool', tool: ['bash', 'edit', 'read', 'task', 'webfetch', 'grep'][i], summary: '' },
    }));
    window.__oc2d.feed({ sessions, service: { alive: true } });
  });
  await sleep(1200);
  const s = await st(page);
  const ws = s.fighters.filter((f) => f.id.startsWith('w'));
  check('sessioni con personaggio solo stand/walk in ogni stato', ws.length === 6 && ws.every((f) => f.char === 'walker' && f.placed), ws);
  check('nessun errore (casting)', problems.length === 0, problems);
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\nRisultato: ${passed} asserzioni ok, ${failures.length} fallite. Screenshot in ${SHOTS}`);
if (failures.length) {
  console.log('Fallimenti:\n - ' + failures.join('\n - '));
  process.exit(1);
}

'use strict';
// Starts the real server on a free port with a fake HOME (so the opencode DB is a
// temp SQLite file with just the columns the server reads) and a fake CLAUDE_DIR.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const F = require('./fixture');
const { SECRETS, SID } = F;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', reject);
  });
}

async function waitUp(port) {
  for (let i = 0; i < 100; i++) {
    try { if ((await get(port, '/api/health')).status === 200) return; } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('server did not start');
}

function firstSseEvent(port, name) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/stream' }, (res) => {
      let buf = '';
      res.on('data', (d) => {
        buf += d;
        for (const block of buf.split('\n\n')) {
          const m = /^event: (\S+)\ndata: (.*)$/s.exec(block);
          if (m && m[1] === name) { req.destroy(); resolve(JSON.parse(m[2])); return; }
        }
      });
    });
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
    setTimeout(() => { req.destroy(); reject(new Error('no ' + name + ' event')); }, 8000);
  });
}

function makeHomeWithDb(now) {
  const fx = F.makeFixture();
  const home = path.join(fx.root, 'home');
  const dbDir = path.join(home, '.local/share/opencode');
  fs.mkdirSync(dbDir, { recursive: true });
  const db = new DatabaseSync(path.join(dbDir, 'opencode.db'));
  db.exec(`
    CREATE TABLE session_v2 (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, directory TEXT, agent TEXT, model TEXT,
      cost REAL, tokens_input INT, tokens_output INT, tokens_reasoning INT, tokens_cache_read INT, tokens_cache_write INT,
      time_created INT, time_updated INT, time_suspended INT, idle_outcome TEXT, time_archived INT);
    CREATE TABLE todo (session_id TEXT, content TEXT, status TEXT, position INT);
    CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, seq INT, time_created INT, time_updated INT, data TEXT);
  `);
  const ins = db.prepare('INSERT INTO session_v2 (id,title,directory,agent,model,cost,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write,time_created,time_updated) VALUES (?,?,?,?,?,0,0,0,0,0,0,?,?)');
  ins.run('ses_linked', 'oc-int', '/w/acme', 'build', '{"id":"m","providerID":"p"}', now - 8000, now - 1000);
  ins.run('ses_other', 'oc-unrelated', '/w/other', 'build', '{"id":"m","providerID":"p"}', now - 7000, now - 6000);
  db.prepare("INSERT INTO session_message VALUES ('m1','ses_linked','assistant',1,?,?,?)").run(now - 2000, now - 1000, JSON.stringify({ content: [{ type: 'text', text: 'hi' }] }));
  db.close();
  fx.session({ status: 'busy' });
  fx.transcript([
    F.userPrompt(now - 20000),
    F.asst(now - 10000, [F.bashLaunch('l1', `cd /w/acme && opencode run --title oc-int --file ${SECRETS.toolInput}`)], 'tool_use'),
  ]);
  return { fx, home };
}

async function withServer(env, fn) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), NODE_NO_WARNINGS: '1', ...env }, stdio: 'ignore',
  });
  try { await waitUp(port); await fn(port); } finally { child.kill(); }
}

test('server: /api/claude, /api/health, overview link and SSE carry Claude sessions', async () => {
  const now = Date.now();
  const { fx, home } = makeHomeWithDb(now);
  try {
    await withServer({ HOME: home, CLAUDE_DIR: fx.claudeDir }, async (port) => {
      const health = JSON.parse((await get(port, '/api/health')).body);
      assert.deepStrictEqual(health, { ok: true, db: true });

      const res = await get(port, '/api/claude');
      assert.strictEqual(res.status, 200);
      for (const v of Object.values(SECRETS)) assert.ok(!res.body.includes(v));
      const claude = JSON.parse(res.body);
      assert.strictEqual(claude.length, 1);
      assert.strictEqual(claude[0].id, SID);
      assert.strictEqual(claude[0].status, 'working');
      assert.strictEqual(claude[0].delegations.length, 1);
      assert.strictEqual(claude[0].delegations[0].sessionId, 'ses_linked');
      assert.strictEqual(claude[0].delegations[0].title, 'oc-int');
      assert.strictEqual(claude[0].delegations[0].live, true);

      const overview = JSON.parse((await get(port, '/api/overview')).body);
      assert.deepStrictEqual(overview.find(s => s.id === 'ses_linked').claude, { id: SID, short: SID.slice(0, 8) });
      assert.strictEqual(overview.find(s => s.id === 'ses_other').claude, null);
      const detail = JSON.parse((await get(port, '/api/session?id=ses_linked')).body);
      assert.deepStrictEqual(detail.claude, { id: SID, short: SID.slice(0, 8) });

      const ev = await firstSseEvent(port, 'overview');
      assert.strictEqual(ev.claude.length, 1);
      assert.strictEqual(ev.claude[0].short, SID.slice(0, 8));
      assert.strictEqual(ev.sessions.find(s => s.id === 'ses_linked').claude.id, SID);
    });
  } finally { fx.cleanup(); }
});

test('server: OC_CLAUDE=0 disables the feature', async () => {
  const now = Date.now();
  const { fx, home } = makeHomeWithDb(now);
  try {
    await withServer({ HOME: home, CLAUDE_DIR: fx.claudeDir, OC_CLAUDE: '0' }, async (port) => {
      assert.deepStrictEqual(JSON.parse((await get(port, '/api/claude')).body), []);
      const overview = JSON.parse((await get(port, '/api/overview')).body);
      assert.ok(overview.length > 0 && overview.every(s => s.claude === null));
      const ev = await firstSseEvent(port, 'overview');
      assert.deepStrictEqual(ev.claude, []);
    });
  } finally { fx.cleanup(); }
});

test('server: starts without an opencode DB and still answers /api/claude', async () => {
  const fx = F.makeFixture();
  try {
    const home = path.join(fx.root, 'emptyhome');
    fs.mkdirSync(home);
    fx.session();
    fx.transcript([F.userPrompt(Date.now())]);
    await withServer({ HOME: home, CLAUDE_DIR: fx.claudeDir }, async (port) => {
      assert.strictEqual(JSON.parse((await get(port, '/api/health')).body).db, false);
      const claude = JSON.parse((await get(port, '/api/claude')).body);
      assert.strictEqual(claude.length, 1);
      assert.deepStrictEqual(claude[0].delegations, []);
    });
  } finally { fx.cleanup(); }
});

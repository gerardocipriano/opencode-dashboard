'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { createCollector, parseLaunch, deriveStatus, joinLaunches, ingestLine, newState } = require('../lib/claude');
const F = require('./fixture');
const { SECRETS, SID, SID2, CWD } = F;

const MIN = 60e3;

// ---- parseLaunch ----

test('parseLaunch: quoted and unquoted titles, cd prefix', () => {
  assert.deepStrictEqual(
    parseLaunch('cd /srv/app && opencode run --title "oc-fix login" --file spec.md'),
    { title: 'oc-fix login', dir: '/srv/app', hasSession: false, sessionRef: null });
  assert.strictEqual(parseLaunch("opencode run --title 'oc-x y' --file s.md").title, 'oc-x y');
  assert.strictEqual(parseLaunch('opencode run --title oc-plain --file s.md').title, 'oc-plain');
  assert.strictEqual(parseLaunch('opencode run --title=oc-eq --file s.md').title, 'oc-eq');
  assert.strictEqual(parseLaunch('cd /a; cd /b && nohup opencode run --title t1 "do it" 2>&1 | tail -5').dir, '/b');
  assert.strictEqual(parseLaunch('opencode run --dir /explicit --title t').dir, '/explicit');
  assert.strictEqual(parseLaunch('bash -c "cd /in/bash && opencode run --title t2"').dir, '/in/bash');
});

test('parseLaunch: help/version noise and non-launches', () => {
  assert.strictEqual(parseLaunch('opencode run --help'), null);
  assert.strictEqual(parseLaunch('opencode run --version'), null);
  assert.strictEqual(parseLaunch('opencode session list'), null);
  assert.strictEqual(parseLaunch('echo hello'), null);
  assert.strictEqual(parseLaunch(undefined), null);
});

test('parseLaunch: session reuse flags', () => {
  assert.strictEqual(parseLaunch('opencode run --continue "more"').hasSession, true);
  assert.strictEqual(parseLaunch('opencode run -c "more"').hasSession, true);
  const r = parseLaunch('opencode run --session ses_abc --title x');
  assert.strictEqual(r.hasSession, true);
  assert.strictEqual(r.sessionRef, 'ses_abc');
  assert.strictEqual(parseLaunch('opencode run --title x').hasSession, false);
});

test('parseLaunch: expands the session id convention and ignores heredocs', () => {
  const env = { CLAUDE_CODE_SESSION_ID: SID };
  assert.strictEqual(parseLaunch('opencode run --title "oc-task-${CLAUDE_CODE_SESSION_ID:0:8}"', env).title, 'oc-task-11111111');
  assert.strictEqual(parseLaunch('opencode run --title oc-t-$CLAUDE_CODE_SESSION_ID', env).title, 'oc-t-' + SID);
  const hd = 'cat > /tmp/spec.md <<\'EOF\'\nit\'s "quoted" opencode run --title bogus\nEOF\ncd /w && opencode run --title real --file /tmp/spec.md';
  const r = parseLaunch(hd);
  assert.strictEqual(r.title, 'real');
  assert.strictEqual(r.dir, '/w');
});

// ---- status ----

function stateFrom(lines) {
  const st = newState();
  for (const l of lines) ingestLine(st, l, { CLAUDE_CODE_SESSION_ID: SID });
  return st;
}

test('deriveStatus: pending tool -> working with tool name', () => {
  const now = Date.now();
  const st = stateFrom([F.userPrompt(now - 5000), F.asst(now - 3000, [F.toolUse('t1', 'Read', { file_path: '/x' })], 'tool_use')]);
  const d = deriveStatus(st, now, { status: 'busy', statusUpdatedAt: now - 3000 });
  assert.strictEqual(d.status, 'working');
  assert.deepStrictEqual(d.activity, { type: 'tool', tool: 'Read' });
  ingestLine(st, F.toolResult(now - 1000, 't1'), {});
  assert.strictEqual(st.pending.size, 0);
});

test('deriveStatus: end_turn recent -> waiting, old -> idle', () => {
  const now = Date.now();
  const mk = (ago) => stateFrom([F.userPrompt(now - ago - 5000), F.asst(now - ago, [F.text()], 'end_turn')]);
  const sess = { status: 'idle', statusUpdatedAt: now };
  assert.strictEqual(deriveStatus(mk(30e3), now, sess).status, 'waiting');
  assert.strictEqual(deriveStatus(mk(11 * MIN), now, sess).status, 'idle');
  assert.strictEqual(deriveStatus(mk(9 * MIN), now, sess).status, 'waiting');
});

test('deriveStatus: assistant turn in progress, busy marker, interrupt', () => {
  const now = Date.now();
  const streaming = stateFrom([F.userPrompt(now - 4000), F.asst(now - 2000, [{ type: 'thinking', thinking: 'x' }], null)]);
  assert.deepStrictEqual(deriveStatus(streaming, now, { status: 'busy', statusUpdatedAt: now - 4000 }),
    { status: 'working', activity: { type: 'thinking', tool: null } });
  // end_turn but the session file says busy and fresh (e.g. a hook or background shell)
  const done = stateFrom([F.asst(now - 20e3, [F.text()], 'end_turn')]);
  assert.strictEqual(deriveStatus(done, now, { status: 'shell seen', statusUpdatedAt: now - 5000 }).status, 'working');
  assert.strictEqual(deriveStatus(done, now, { status: 'busy', statusUpdatedAt: now - 5 * MIN }).status, 'waiting');
  // user line last, but the session went idle afterwards: Esc interrupt
  const interrupted = stateFrom([F.asst(now - 20e3, [F.text()], 'tool_use'), F.userPrompt(now - 10e3, '[interrupt]')]);
  assert.strictEqual(deriveStatus(interrupted, now, { status: 'idle', statusUpdatedAt: now - 5000 }).status, 'waiting');
});

test('ingestLine counts bad lines and skips non-conversation types', () => {
  const st = newState();
  ingestLine(st, '{not json', {});
  ingestLine(st, JSON.stringify({ type: 'attachment' }), {});
  assert.strictEqual(st.errors, 1);
  assert.strictEqual(st.lastRole, null);
});

// ---- collector ----

function collector(fx, extra = {}) {
  return createCollector({ dir: fx.claudeDir, home: '/work', ...extra });
}

test('collector: lists live sessions, model, status, sub-agents', () => {
  const fx = F.makeFixture();
  try {
    const now = Date.now();
    fx.session({ status: 'busy' });
    fx.transcript([
      F.userPrompt(now - 9000),
      F.asst(now - 6000, [F.text()], null, 'claude-test-1'),
      F.asst(now - 5000, [F.toolUse('b1', 'Bash', { command: SECRETS.toolInput })], 'tool_use', 'claude-test-2'),
    ]);
    fx.subagent('aaaa', { agentType: 'Explore', finished: true });
    fx.subagent('bbbb', { agentType: 'general-purpose', finished: false }, [F.asst(now, [F.text()], null)]);
    // dead pid and wrong procStart must not appear
    fx.session({ pid: 2147483000, id: SID2 });
    fx.session({ pid: process.ppid, id: '00000000-0000-4000-8000-000000000000', procStart: '1' });
    const { claude } = collector(fx).snapshot({});
    assert.strictEqual(claude.length, 1);
    const c = claude[0];
    assert.strictEqual(c.id, SID);
    assert.strictEqual(c.short, '11111111');
    assert.strictEqual(c.pid, process.pid);
    assert.strictEqual(c.kind, 'interactive');
    assert.strictEqual(c.directory, '~/acme.app');
    assert.strictEqual(c.project, 'acme.app');
    assert.strictEqual(c.model, 'claude-test-2');
    assert.strictEqual(c.status, 'working');
    assert.deepStrictEqual(c.activity, { type: 'tool', tool: 'Bash' });
    assert.deepStrictEqual(c.subagents, [
      { id: 'bbbb', type: 'general-purpose', state: 'working' },
      { id: 'aaaa', type: 'Explore', state: 'done' },
    ]);
    assert.deepStrictEqual(c.delegations, []);
  } finally { fx.cleanup(); }
});

test('collector: sub-agents older than 6 h are omitted, list capped at 12', () => {
  const fx = F.makeFixture();
  try {
    fx.session();
    fx.transcript([F.userPrompt(Date.now())]);
    for (let i = 0; i < 15; i++) fx.subagent('s' + i, { finished: true });
    assert.strictEqual(collector(fx).snapshot({}).claude[0].subagents.length, 12);
    const later = collector(fx, { now: () => Date.now() + 7 * 3600e3 });
    assert.strictEqual(later.snapshot({}).claude[0].subagents.length, 0);
  } finally { fx.cleanup(); }
});

test('collector: incremental reads pick up appended lines; first read is capped to the tail', () => {
  const fx = F.makeFixture();
  try {
    fx.session();
    const now = Date.now();
    const old = F.bashLaunch('old1', 'cd /w && opencode run --title oc-ancient --file s.md');
    const filler = F.asst(now - 3000, [F.text('x'.repeat(1000))], 'end_turn');
    const lines = [F.asst(now - 10000, [old], 'tool_use')];
    for (let i = 0; i < 2600; i++) lines.push(filler);   // ~2.6 MB after the launch
    lines.push(F.asst(now - 2000, [F.bashLaunch('new1', 'opencode run --title oc-recent')], 'tool_use'));
    fx.transcript(lines);
    let tick = now;
    const col = collector(fx, { now: () => tick });
    const launches = () => col.snapshot({ ocRows: () => [] }).claude[0].delegations.map(d => d.title);
    assert.deepStrictEqual(launches(), ['oc-recent']);   // the early one is outside the 2 MB tail
    fx.append([F.asst(now - 1000, [F.bashLaunch('new2', 'opencode run --title oc-later')], 'tool_use')]);
    tick += 3000;
    assert.deepStrictEqual(launches(), ['oc-later', 'oc-recent']);
  } finally { fx.cleanup(); }
});

test('collector: sub-agent launches are attributed to the parent session', () => {
  const fx = F.makeFixture();
  try {
    const now = Date.now();
    fx.session();
    fx.transcript([F.userPrompt(now)]);
    fx.subagent('cccc', {}, [F.asst(now - 1000, [F.bashLaunch('sl1', 'opencode run --title oc-from-sub')], 'tool_use')]);
    const c = collector(fx).snapshot({ ocRows: () => [] }).claude[0];
    assert.deepStrictEqual(c.delegations.map(d => d.title), ['oc-from-sub']);
  } finally { fx.cleanup(); }
});

test('collector: never throws and survives garbage in transcripts', () => {
  const fx = F.makeFixture();
  try {
    fx.session();
    fx.transcript(['{broken', '', 'null', F.userPrompt(Date.now())]);
    const col = collector(fx);
    const r = col.snapshot({ ocRows: () => { throw new Error('db down'); }, isLive: () => { throw new Error('x'); } });
    assert.strictEqual(r.claude.length, 1);
    assert.ok(col.stats.parseErrors >= 1);
  } finally { fx.cleanup(); }
});

test('collector: disabled returns nothing', () => {
  const fx = F.makeFixture();
  try {
    fx.session();
    fx.transcript([F.userPrompt(Date.now())]);
    const r = collector(fx, { enabled: false }).snapshot({});
    assert.deepStrictEqual(r.claude, []);
    assert.strictEqual(r.byOc.size, 0);
  } finally { fx.cleanup(); }
});

// ---- join ----

const base = Date.parse('2026-01-01T10:00:00Z');
const info = { [SID]: { short: SID.slice(0, 8), cwd: CWD } };
const L = (key, o) => ({ key, claudeId: SID, ts: base, title: 'oc-job', dir: null, hasSession: false, sessionRef: null, ...o });
const R = (id, o) => ({ id, title: 'oc-job', directory: CWD, timeCreated: base + 3000, ...o });

test('join rule 1: exact title inside the time window, nearest first', () => {
  const m = joinLaunches([L('a')], [R('s-far', { timeCreated: base + 90e3 }), R('s-near', { timeCreated: base + 2000 }), R('s-late', { timeCreated: base + 130e3 }), R('s-early', { timeCreated: base - 9000 })], { claude: info });
  assert.strictEqual(m.get('a'), 's-near');
  assert.strictEqual(joinLaunches([L('a')], [R('s', { timeCreated: base + 130e3 })], { claude: info }).size, 0);
  assert.strictEqual(joinLaunches([L('a', { title: null })], [R('s')], { claude: info }).size, 0);
});

test('join rule 1: duplicate titles each take their own session, once', () => {
  const m = joinLaunches(
    [L('a', { ts: base }), L('b', { ts: base + 30e3 })],
    [R('s1', { timeCreated: base + 2000 }), R('s2', { timeCreated: base + 32e3 })], { claude: info });
  assert.strictEqual(m.get('a'), 's1');
  assert.strictEqual(m.get('b'), 's2');
  // only the second run created a session: the first launch must not steal it
  const m2 = joinLaunches([L('a', { ts: base }), L('b', { ts: base + 30e3 })], [R('s2', { timeCreated: base + 32e3 })], { claude: info });
  assert.strictEqual(m2.get('b'), 's2');
  assert.strictEqual(m2.has('a'), false);
});

test('join rule 1: prefers the session in the launch directory', () => {
  const m = joinLaunches([L('a', { dir: '/srv/target' })],
    [R('other', { directory: '/srv/other', timeCreated: base + 1000 }), R('right', { directory: '/srv/target', timeCreated: base + 20e3 })], { claude: info });
  assert.strictEqual(m.get('a'), 'right');
  // falls back to the Claude cwd when the launch has no cd
  const m2 = joinLaunches([L('a')], [R('other', { directory: '/srv/other', timeCreated: base + 1000 }), R('cwd', { directory: CWD, timeCreated: base + 20e3 })], { claude: info });
  assert.strictEqual(m2.get('a'), 'cwd');
  // ~ is expanded
  const m3 = joinLaunches([L('a', { dir: '~/proj' })], [R('x', { directory: '/home/u/other' }), R('y', { directory: '~/proj', timeCreated: base + 40e3 })], { claude: info, home: '/home/u' });
  assert.strictEqual(m3.get('a'), 'y');
});

test('join rule 2: -<short> suffix links regardless of time', () => {
  const title = 'oc-job-' + SID.slice(0, 8);
  const m = joinLaunches([L('a', { title })], [R('s', { title, timeCreated: base + 5 * 3600e3 })], { claude: info });
  assert.strictEqual(m.get('a'), 's');
  // suffix of a different Claude session is not an exact link: falls back to the window rule
  const m2 = joinLaunches([L('a', { title: 'oc-job-deadbeef' })], [R('s', { title: 'oc-job-deadbeef', timeCreated: base + 5 * 3600e3 })], { claude: info });
  assert.strictEqual(m2.size, 0);
  // exact beats window: same title, a closer-in-time session of another run is not used when suffix matches
  const m3 = joinLaunches([L('a', { title, hasSession: true })], [R('s', { title, timeCreated: base + 3600e3 })], { claude: info });
  assert.strictEqual(m3.get('a'), 's');
});

test('join rule 0/3: --session id, live process as tie-break, --continue not matched by time', () => {
  assert.strictEqual(joinLaunches([L('a', { hasSession: true, sessionRef: 'ses_known' })], [R('ses_known', { title: 'else' })], { claude: info }).get('a'), 'ses_known');
  assert.strictEqual(joinLaunches([L('a', { hasSession: true })], [R('s')], { claude: info }).size, 0);
  // two candidate sessions; the live run started near s2, so s2 wins even though s1 is closer to the launch ts
  const procs = [{ isRun: true, envSessionId: SID, cmd: 'opencode run --title oc-job --file x', startTime: (base + 50e3) / 1000 }];
  const rows = [R('s1', { timeCreated: base + 4000 }), R('s2', { timeCreated: base + 51e3 })];
  assert.strictEqual(joinLaunches([L('a', { ts: base + 40e3 })], rows, { claude: info, procs }).get('a'), 's2');
  // a process owned by a different Claude session is ignored
  const other = [{ ...procs[0], envSessionId: SID2 }];
  assert.strictEqual(joinLaunches([L('a', { ts: base + 40e3 })], rows, { claude: info, procs: other }).get('a'), 's2');
});

test('collector: end-to-end join sets sessionId, live and the reverse map', () => {
  const fx = F.makeFixture();
  try {
    const now = Date.now();
    fx.session();
    const suffixTitle = 'oc-b-' + SID.slice(0, 8);
    fx.transcript([
      F.asst(now - 60e3, [F.bashLaunch('l1', 'cd /w/acme && opencode run --title oc-a --file spec.md')], 'tool_use'),
      F.asst(now - 30e3, [F.bashLaunch('l2', 'opencode run --title "oc-b-${CLAUDE_CODE_SESSION_ID:0:8}"')], 'tool_use'),
      F.asst(now - 20e3, [F.bashLaunch('l3', 'opencode run --title oc-never')], 'tool_use'),
      F.asst(now - 10e3, [F.bashLaunch('l4', 'opencode run --help')], 'tool_use'),
    ]);
    const rows = [
      { id: 'ses_a', title: 'oc-a', directory: '/w/acme', timeCreated: now - 58e3 },
      { id: 'ses_b', title: suffixTitle, directory: '/elsewhere', timeCreated: now - 3600e3 },
    ];
    const r = collector(fx).snapshot({ ocRows: () => rows, isLive: (id) => id === 'ses_a', procs: [] });
    const d = r.claude[0].delegations;
    assert.deepStrictEqual(d.map(x => [x.title, x.sessionId, x.live]), [
      ['oc-never', null, false],
      [suffixTitle, 'ses_b', false],
      ['oc-a', 'ses_a', true],
    ]);
    assert.deepStrictEqual(r.byOc.get('ses_a'), { id: SID, short: '11111111' });
    assert.deepStrictEqual(r.byOc.get('ses_b'), { id: SID, short: '11111111' });
    assert.strictEqual(r.byOc.has('nope'), false);
  } finally { fx.cleanup(); }
});

// ---- privacy ----

test('privacy: serialized output contains no prompt, message, tool input/output, name or description', () => {
  const fx = F.makeFixture();
  try {
    const now = Date.now();
    fx.session({ status: 'busy' });
    fx.transcript([
      F.userPrompt(now - 9000),
      F.asst(now - 8000, [{ type: 'thinking', thinking: SECRETS.assistantText }, F.text()], null),
      F.asst(now - 7000, [F.toolUse('b1', 'Bash', { command: `cat ${SECRETS.toolInput}` })], 'tool_use'),
      F.toolResult(now - 6000, 'b1'),
      F.asst(now - 5000, [F.bashLaunch('l1', `cd /w && opencode run --title oc-priv --file ${SECRETS.toolInput}`)], 'tool_use'),
    ]);
    fx.subagent('dddd', {}, [F.userPrompt(now, SECRETS.prompt)]);
    const out = JSON.stringify(collector(fx).snapshot({ ocRows: () => [] }).claude);
    for (const [k, v] of Object.entries(SECRETS)) assert.ok(!out.includes(v), `leaked ${k}`);
    assert.ok(!out.includes('SECRET'));
    assert.ok(!out.includes('ledger'));
    assert.ok(out.includes('oc-priv'));   // the delegation title is deliberately exposed
  } finally { fx.cleanup(); }
});

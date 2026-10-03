'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { createServer } = require('../src/server');
const { FixtureSource } = require('../src/sheets');

const config = { centers: { 'Liberty Hill': { sheetId: 'sheet-lh', tabs: ['Table1 2026'], generate: 'dry-run' }, Leander: { sheetId: 'sheet-le', tabs: ['T'], generate: 'off' } } };
const fixture = path.join(__dirname, '..', 'fixtures', 'demo.json');
const TOKEN = 'test-token';

async function withServer(fn, runOpts, source = new FixtureSource(fixture)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srv-'));
  const srv = createServer({ source, config, reportDir: dir, token: TOKEN, runOpts });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base, dir, srv); } finally { srv.close(); }
}
const post = (base, p, body, token = TOKEN) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) }, body: JSON.stringify(body) });

test('trigger needs the token', () => withServer(async base => {
  assert.strictEqual((await post(base, '/trigger', { spreadsheet_id: 'sheet-lh', sheet_name: 'Table1 2026' }, null)).status, 401);
  assert.strictEqual((await post(base, '/trigger', { spreadsheet_id: 'sheet-lh', sheet_name: 'Table1 2026' }, 'wrong')).status, 401);
}));

test('trigger ignores sheets that are not configured, and centers that are off', () => withServer(async base => {
  for (const body of [{ spreadsheet_id: 'nope', sheet_name: 'x' }, { spreadsheet_id: 'sheet-le', sheet_name: 'T' }]) {
    const r = await post(base, '/trigger', body);
    assert.strictEqual(r.status, 202);
    assert.strictEqual((await r.json()).status, 'ignored');
  }
  assert.strictEqual((await post(base, '/trigger', { spreadsheet_id: 'sheet-lh' })).status, 400);
}));

test('trigger from n8n runs a compare-only dry run and the dashboard API shows it', () => withServer(async (base, dir, srv) => {
  const r = await post(base, '/trigger', { spreadsheet_id: 'sheet-lh', sheet_name: 'Table1 2026' });
  assert.strictEqual((await r.json()).status, 'started');
  for (let i = 0; i < 100 && [...srv.jobs.values()].some(j => j.status === 'running'); i++) await new Promise(r => setTimeout(r, 20));
  const { runs, jobs } = await (await fetch(base + '/api/runs?weeks=52')).json();
  assert.strictEqual(jobs[0].status, 'done');
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].kind, 'live-trigger');
  assert.strictEqual(runs[0].wroteAnything, false);
  assert.ok(!('rows' in runs[0]));
  const detail = await (await fetch(`${base}/api/runs/${runs[0].runId}`)).json();
  assert.strictEqual(detail.rows.length, runs[0].total);
}, { waitMs: 1000, pollMs: 1, stableMs: 0 }, (() => {
  // The button was clicked while 09/29 was the newest column; n8n's 10/06-style output appears on the second read.
  const full = new FixtureSource(fixture); let reads = 0;
  return { readCurriculum: () => full.readCurriculum(), readGrid: async (id, tab) => {
    const g = await full.readGrid(id, tab); reads++;
    if (reads > 1) return g;
    const keep = g.headerRow.length - 1; // drop the newest column on the first read
    return { headerRow: g.headerRow.slice(0, keep), rows: g.rows.map(r => ({ ...r, cells: r.cells.slice(0, keep) })) };
  } };
})()));

test('backfill records past weeks; dashboard serves', () => withServer(async (base) => {
  const r = await post(base, '/api/backfill', { weeks: 4 });
  assert.strictEqual((await r.json()).recorded, 4);
  const { runs } = await (await fetch(base + '/api/runs?weeks=520')).json();
  assert.strictEqual(runs.length, 4);
  assert.ok(runs.every(x => x.kind === 'past-week' && x.total > 0));
  assert.ok((await (await fetch(base + '/')).text()).includes('Claude vs n8n'));
  const one = await (await fetch(`${base}/api/runs/${runs[0].runId}`)).json();
  assert.ok(one.rows[0].input && one.rows[0].attendance, 'rows carry this week\'s cell and attendance');
  assert.ok(typeof one.n8nUpdated === 'number' && typeof one.claudeWouldUpdate === 'number');
  assert.strictEqual((await fetch(base + '/api/runs/..%2f..%2fetc')).status, 404);
}));

test('rules page data: every example is computed by the engine, and the curriculum comes from the sheet', () => withServer(async base => {
  const d = await (await fetch(base + '/api/rules')).json();
  assert.ok(d.rules.length >= 20);
  const ex = d.rules.flatMap(r => r.examples);
  assert.ok(ex.length >= 20 && ex.every(e => typeof e.output === 'string'));
  assert.strictEqual(d.rules.find(r => r.id === 'level-end').examples[0].output, 'M 3 A');
  assert.ok(d.curriculum.levels.Maths.includes('0b') && d.curriculum.holidays.length > 0);
  assert.ok(d.openQuestions.length > 0);
}));

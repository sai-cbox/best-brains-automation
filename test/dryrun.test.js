'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { fromCsvTexts } = require('../src/curriculum');
const { createEngine } = require('../src/engine');
const { compareCell } = require('../src/compare');
const { pickColumns } = require('../src/grid');
const { Sink, DryRunWriteError } = require('../src/sheets');
const { runCenter, waitForOutput } = require('../src/run');
const { curriculum, engine } = require('./helpers');

const colour = { pink: { red: 244 / 255, green: 204 / 255, blue: 204 / 255 }, yellow: { red: 1, green: 1 }, white: null };
// Liberty Hill Table1 2026, columns 09/29 (input) and 10/06 (what n8n wrote). Real cells, names replaced by row numbers.
const rows = [
  [4, 'M 2 E\nE F1 G\nPT', 'pink', 'M 2 F\nE F1 H (MT1 NXT)\nPT'],
  [6, 'M 0b I (MT1 NXT)\nPT', 'white', 'M 0b MT1 & J\nPT'],
  [7, 'M 0b X\nE SrR FT 140/143 PASS & Z\nPT Yes', 'pink', 'M 0b Y (FT NXT)\nE MrR A\nPT'],
  [8, 'E J1 D\nPT', 'white', 'E J1 E\nPT'],
  [9, 'M 3 T\nE F1 MT2 30/31 PASS & Q\nPT', 'white', 'M 3 U\nE F1 R\nPT'],
  [10, 'M 0a J\nPT', 'white', 'M 0a K\nPT'],
  [14, 'E H1 FT 39/57 CNTNU & Z\nPT', 'white', 'E I1 A & FT 39/57 CNTNU\nPT'],
  [16, 'M 0b MT1 47/47 PASS & J\nE SrR J\nPT', 'white', 'M 0b K\nE SrR K\nPT'],
  [18, 'M 0b E\nE SrR B\nPT', 'yellow', 'M 0b E\nE SrR B\nPT'],
];
const grid = {
  headerRow: ['Name', '09/29/2026', '10/06/2026'],
  rows: rows.map(([row, a, c, b]) => ({ row, cells: [{ text: `student ${row}` }, { text: a, colour: colour[c] }, { text: b, colour: colour.white }] })),
};
const config = { centers: { 'Liberty Hill': { sheetId: 'sheet-1', tabs: ['Table1 2026'], generate: 'dry-run' }, Leander: { sheetId: null, tabs: [], generate: 'off' } } };
class MemSource { async readCurriculum() { return curriculum(); } async readGrid() { return grid; } }

test('dry run on real Liberty Hill cells compares and reports, and writes nothing', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dry-'));
  const [rep] = await runCenter({ center: 'Liberty Hill', source: new MemSource(), sink: new Sink('dry-run'), reportDir: out, forceMode: 'dry-run', config });
  assert.strictEqual(rep.mode, 'dry-run');
  assert.strictEqual(rep.wroteAnything, false);
  assert.strictEqual(rep.total, 9);
  assert.ok(rep.matched >= 5, `matched ${rep.matched}`);
  assert.ok(fs.existsSync(path.join(out, 'runs.jsonl')));
  assert.ok(!JSON.stringify(rep).includes('student 4'), 'no student names in the report');
});

test('the sink refuses to write unless live', async () => {
  await assert.rejects(() => new Sink('dry-run').writeNextWeek({ cells: [] }), DryRunWriteError);
});

test('a live request on a center configured dry-run stays a dry run', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dry-'));
  const sink = new Sink('live', { spreadsheets: { batchUpdate: () => { throw new Error('should not be called'); } } });
  const reps = await runCenter({ center: 'Liberty Hill', source: new MemSource(), sink, reportDir: out, forceMode: 'live', config });
  assert.ok(reps.every(r => r.mode === 'dry-run'));
});

test('centers that are off do nothing', async () => {
  const reps = await runCenter({ center: 'Leander', source: new MemSource(), sink: new Sink('dry-run'), reportDir: os.tmpdir(), forceMode: 'dry-run', config });
  assert.deepStrictEqual(reps, []);
});

test('dry run refuses columns that are not a week apart', () => {
  assert.throws(() => pickColumns(['Name', '09/29/2026', '10/20/2026'], { dryRun: true }), /not 7 days/);
});

test('level order comes from the sheet, not the code', () => {
  const csv = (rows) => 'Level,Exam,week of the year\n' + rows.join('\n') + '\n';
  const cur = fromCsvTexts({
    maths: csv(['1,FT,Z', '3,FT,Z']), english: csv(['F1,FT,Z']), holidays: 'Date\n',
  });
  const [r] = createEngine(cur).generate([{ student_name: 'x', last_week_log: 'M 1 Z', is_present: true, book_collected: true, new_header_date: '10/06/2026' }]);
  assert.strictEqual(r.next_week_log, 'M 3 A');
});

test('tests and holidays come from the sheet', () => {
  const [r] = engine().generate([{ student_name: 'x', last_week_log: 'M 2 I', is_present: true, book_collected: true, new_header_date: '10/06/2026' }]);
  assert.strictEqual(r.next_week_log, 'M 2 MT1 & J');                  // MT1 for level 2 sits at week J in the sheet
  const [h] = engine().generate([{ student_name: 'x', last_week_log: 'M 2 B', is_present: true, book_collected: true, new_header_date: '11/19/2026' }]);
  assert.strictEqual(h.next_week_log, 'M 2 C & D');                    // 11/26 is a holiday in the sheet
});

test('compare reasons', () => {
  assert.strictEqual(compareCell('M 1 B\nPT', 'M 1 B\nPT').status, 'match');
  assert.strictEqual(compareCell('M 1 B', 'null').reason, 'n8n-wrote-null');
  assert.strictEqual(compareCell('M 1 B (MT1 NXT)', 'M 1 B').reason, 'note-in-brackets');
  assert.strictEqual(compareCell('M 1 C', 'M 1 B').reason, 'level-or-chapter');
});

// ---- button flow: snapshot, wait for n8n, compare ----
const mkGrid = (outRows) => ({
  headerRow: ['Name', '09/29/2026', ...(outRows ? ['10/06/2026'] : [])],
  rows: rows.map(([row, a, c, b]) => ({ row, cells: [{ text: `student ${row}` }, { text: a, colour: colour[c] }, ...(outRows ? [{ text: outRows[row] ?? b }] : [])] })),
});

test('button flow waits for n8n, then compares against the snapshot', async () => {
  let t = 0; const reads = [];
  // n8n not there at first, then half-written, then done and stable
  const states = [mkGrid(null), mkGrid({ 4: 'M 2 F' }), mkGrid({}), mkGrid({}), mkGrid({}), mkGrid({})];
  const source = { readCurriculum: async () => curriculum(), readGrid: async () => { reads.push(t); return states[Math.min(reads.length - 1, states.length - 1)]; } };
  const published = [];
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dry-'));
  const [rep] = await runCenter({ center: 'Liberty Hill', source, sink: new Sink('dry-run'), results: { publish: async r => published.push(r) }, reportDir: out,
    forceMode: 'dry-run', config, inputDate: '09/29/2026', waitForN8n: true, waitMs: 600e3, pollMs: 30e3, stableMs: 60e3,
    sleep: async ms => { t += ms; }, now: () => t });
  assert.strictEqual(rep.verdict, 'good');
  assert.strictEqual(rep.matched, 9);
  assert.strictEqual(published.length, 1);
  assert.ok(t >= 60e3, 'waited for the column to settle');
});

test('button flow reports n8n-not-finished on timeout, and still writes nothing', async () => {
  let t = 0;
  const source = { readCurriculum: async () => curriculum(), readGrid: async () => mkGrid(null) };
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dry-'));
  const [rep] = await runCenter({ center: 'Liberty Hill', source, sink: new Sink('dry-run'), reportDir: out, forceMode: 'dry-run', config,
    inputDate: '09/29/2026', waitForN8n: true, waitMs: 120e3, pollMs: 30e3, stableMs: 60e3, sleep: async ms => { t += ms; }, now: () => t });
  assert.strictEqual(rep.verdict, 'n8n-not-finished');
  assert.strictEqual(rep.wroteAnything, false);
});

test('results sheet may not be a schedule or curriculum sheet', () => {
  const { ResultsSink } = require('../src/sheets');
  assert.throws(() => new ResultsSink('sheet-1', ['sheet-1'], {}), /must not be/);
});

test('config reads centers from CENTERS_JSON and defaults the rest to off', () => {
  const { load } = require('../src/config');
  const c = load({ CENTERS_JSON: JSON.stringify({ centers: { 'Liberty Hill': { sheetId: 'a', tabs: ['T'], generate: 'dry-run' } } }) });
  assert.strictEqual(c.centers['Liberty Hill'].generate, 'dry-run');
  assert.strictEqual(c.centers.Leander.generate, 'off');
  assert.throws(() => load({ CENTERS_JSON: JSON.stringify({ centers: { Leander: { generate: 'yes' } } }) }), /Bad mode/);
});

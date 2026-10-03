'use strict';
// node src/run.js --mode dry-run [--center "Liberty Hill"] [--input-date 09/29/2026 --wait-for-n8n] [--fixture f.json]
//
// Button flow (--input-date + --wait-for-n8n):
//   1. read the input week's column and colours (the date the button saw at click time)
//   2. generate next week from that snapshot (later staff edits cannot change it)
//   3. wait for n8n's new column to appear and stop changing
//   4. compare, record, publish to the results sheet. Nothing is ever written to a schedule sheet.
const path = require('path');
const { createEngine } = require('./engine');
const { cfg, centers, modeFor } = require('./config');
const { pickColumns, pickColumnsForInput, columnSignature, studentsFromGrid, n8nRowsFromGrid } = require('./grid');
const { compareRun } = require('./compare');
const { record } = require('./runlog');
const { FixtureSource, Sink } = require('./sheets');
const { PublicSheetSource } = require('./publicSheets');

const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const realSleep = ms => new Promise(r => setTimeout(r, ms));

/** Waits until the output column exists and its content is unchanged for stableMs. Returns the grid, or null on timeout. */
async function waitForOutput({ source, sheetId, tab, outText, firstGrid, waitMs, pollMs, stableMs, sleep = realSleep, now = Date.now }) {
  const start = now();
  let grid = firstGrid, lastSig = null, stableSince = null;
  for (;;) {
    const cols = pickColumnsForInput(grid.headerRow, outText ? subtractWeek(outText) : '');
    if (cols.output) {
      const sig = columnSignature(grid, cols.output.col);
      if (sig === lastSig) { if (now() - stableSince >= stableMs) return grid; }
      else { lastSig = sig; stableSince = now(); }
    } else { lastSig = null; stableSince = null; }
    if (now() - start >= waitMs) return null;
    await sleep(pollMs);
    grid = await source.readGrid(sheetId, tab);
  }
}
function subtractWeek(text) { const [m, d, y] = text.split('/').map(Number); const t = new Date(y, m - 1, d); t.setDate(t.getDate() - 7); return `${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')}/${t.getFullYear()}`; }

async function runCenter({ center, source, sink, results, reportDir, forceMode, inputDate, onlyTab, kind = 'live-trigger', waitForN8n, waitMs = 15 * 60e3, pollMs = 30e3, stableMs = 60e3, sleep, now, config = cfg }) {
  const c = config.centers[center];
  const configured = c.generate;
  if (configured === 'off') return [];
  // dry-run is always safe; live only when both the request and the config say live
  const mode = forceMode === 'dry-run' ? 'dry-run' : configured;
  const engine = createEngine(await source.readCurriculum());
  const reports = [];
  for (const tab of (onlyTab ? c.tabs.filter(t => t === onlyTab) : c.tabs)) {
    let grid = await source.readGrid(c.sheetId, tab);
    const dry = mode === 'dry-run';
    const cols = inputDate ? pickColumnsForInput(grid.headerRow, inputDate === 'newest' ? pickColumns(grid.headerRow, { dryRun: false }).input.text : inputDate) : pickColumns(grid.headerRow, { dryRun: dry });
    const students = studentsFromGrid(grid, cols.input, cols.newHeaderDate);          // snapshot taken now
    const generated = engine.generate(students).map((g, i) => ({ ...g, row: students[i].row }));
    const runId = `${center.replace(/\s+/g, '')}-${tab.replace(/\s+/g, '')}-${cols.newHeaderDate.replace(/\//g, '')}`;
    if (!dry) {
      await sink.writeNextWeek({ sheetId: c.sheetId, tab, col: cols.input.col + 1, headerDate: cols.newHeaderDate,
        cells: generated.map(g => ({ row: g.row, text: g.next_week_log, needsColor: g.needs_color })) });
      reports.push({ runId, center, tab, mode: 'live', total: generated.length });
      continue;
    }
    let report;
    if (waitForN8n) grid = await waitForOutput({ source, sheetId: c.sheetId, tab, outText: cols.newHeaderDate, firstGrid: grid, waitMs, pollMs, stableMs, sleep, now });
    if (waitForN8n && !grid) {
      report = { runId, center, tab, kind, headerDate: cols.newHeaderDate, mode: 'dry-run', wroteAnything: false, total: generated.length, matched: 0, differs: 0, colourDiffs: 0, byReason: {}, verdict: 'n8n-not-finished', rows: [] };
    } else {
      const outCols = pickColumnsForInput(grid.headerRow, cols.input.text);
      if (!outCols.output) throw new Error(`n8n output column ${cols.newHeaderDate} not found in ${tab}`);
      report = { ...compareRun({ center, runId, claudeRows: generated, n8nRows: n8nRowsFromGrid(grid, outCols.output), headerDate: cols.newHeaderDate }), tab, kind };
    }
    record(reportDir, report);
    if (results) await results.publish(report);
    reports.push(report);
  }
  return reports;
}

async function main() {
  const mode = arg('--mode') || 'dry-run';
  const only = arg('--center');
  const fixture = arg('--fixture');
  const reportDir = arg('--out') || path.join(__dirname, '..', 'reports');
  const source = fixture ? new FixtureSource(fixture) : new PublicSheetSource({ curriculumSheetId: cfg.curriculumSheetId });
  const sink = new Sink(mode === 'live' ? 'live' : 'dry-run', null);
  const results = null;
  const waitForN8n = process.argv.includes('--wait-for-n8n');
  for (const center of Object.keys(centers)) {
    if (only && center !== only) continue;
    const reports = await runCenter({ center, source, sink, results, reportDir, forceMode: mode, inputDate: arg('--input-date'), waitForN8n });
    for (const r of reports) console.log(`${r.center} / ${r.tab}: ${r.mode === 'live' ? `wrote ${r.total}` : `${r.matched}/${r.total} match, verdict ${r.verdict}, ${JSON.stringify(r.byReason)}`}`);
  }
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { runCenter, waitForOutput };

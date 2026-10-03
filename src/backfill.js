'use strict';
// Past weeks: every pair of adjacent weekly columns is one finished run. Claude's engine is run on the
// earlier column and compared with the later column as n8n produced it. Compare only; nothing is written to a sheet.
// Caveat shown on the dashboard: the later column may include edits staff made after n8n wrote it.
const { createEngine } = require('./engine');
const { dateColumns, studentsFromGrid, n8nRowsFromGrid, formatDate } = require('./grid');
const { compareRun } = require('./compare');
const { record } = require('./runlog');

async function backfill({ center, source, config, reportDir, weeks = 4 }) {
  const c = config.centers[center];
  if (!c || c.generate === 'off') return [];
  const engine = createEngine(await source.readCurriculum());
  const reports = [];
  for (const tab of c.tabs) {
    const grid = await source.readGrid(c.sheetId, tab);
    const cols = dateColumns(grid.headerRow).sort((a, b) => a.date - b.date);
    const pairs = [];
    for (let i = 0; i + 1 < cols.length; i++) {
      const days = Math.round((cols[i + 1].date - cols[i].date) / 864e5);
      if (days === 7) pairs.push([cols[i], cols[i + 1]]);
    }
    for (const [input, output] of pairs.slice(-weeks)) {
      const students = studentsFromGrid(grid, input, output.text);
      if (!students.length) continue;
      const generated = engine.generate(students).map((g, i) => ({ ...g, row: students[i].row, input: students[i].last_week_log, attendance: students[i].is_present ? 'present' : 'absent' }));
      const runId = `${center.replace(/\s+/g, '')}-${tab.replace(/\s+/g, '')}-${output.text.replace(/\//g, '')}-past`;
      const report = { ...compareRun({ center, runId, claudeRows: generated, n8nRows: n8nRowsFromGrid(grid, output), headerDate: output.text, compareColour: false }), tab, kind: 'past-week' };
      record(reportDir, report);
      reports.push(report);
    }
  }
  return reports;
}

module.exports = { backfill };

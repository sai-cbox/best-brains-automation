'use strict';
// Run log + dashboard feed. Every run appends one summary line to runs.jsonl and writes a flat
// per-student CSV (differences only) that Looker Studio can read from a Sheet or a bucket.
// Student names never appear: rows are identified by sheet row number.
const fs = require('fs'), path = require('path');

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""').replace(/\n/g, ' / ')}"`;

function record(dir, report) {
  fs.mkdirSync(dir, { recursive: true });
  const { rows, ...summary } = report;
  fs.mkdirSync(path.join(dir, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runs', `${report.runId}.json`), JSON.stringify({ at: new Date().toISOString(), ...report }));
  fs.appendFileSync(path.join(dir, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...summary }) + '\n');
  const lines = ['run_id,center,tab,week,row,status,reason,claude,n8n'];
  for (const r of rows) {
    if (r.status === 'match') continue;
    lines.push([report.runId, report.center, report.tab, report.headerDate, r.row, r.status, r.reason, r.claude, r.n8n].map(csvCell).join(','));
  }
  fs.writeFileSync(path.join(dir, `differences_${report.runId}.csv`), lines.join('\n') + '\n');
  return summary;
}

module.exports = { record };

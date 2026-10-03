'use strict';
// Dry-run comparison: engine output vs what n8n wrote for the same student.
// Compare only. Nothing in this file touches a sheet or the portal.

const norm = s => String(s ?? '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
const stripParens = s => s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

/**
 * Returns { status: 'match'|'differs', reason, detail }.
 * reasons are the gap categories shown on the dashboard so Sai can see what to close before leaving n8n.
 */
function compareCell(claudeCell, n8nCell) {
  const a = norm(claudeCell), b = norm(n8nCell);
  if (a === b) return { status: 'match', reason: 'exact' };
  if (/\bnull\b/i.test(b) && !/\bnull\b/i.test(a)) return { status: 'differs', reason: 'n8n-wrote-null', detail: 'n8n wrote the text "null"; the rebuild does not' };
  if (a.split('\n').length !== b.split('\n').length) return { status: 'differs', reason: 'line-count', detail: 'different number of lines' };
  const la = a.split('\n'), lb = b.split('\n');
  const reasons = new Set();
  la.forEach((x, i) => {
    const y = lb[i];
    if (x === y) return;
    if (y.startsWith(x + ' ') || y.startsWith(x + '\n')) reasons.add('staff-added-text');
    else if (stripParens(x) === stripParens(y)) reasons.add('note-in-brackets');
    else if (x.replace(/ RVW/, '') === y.replace(/ RVW/, '')) reasons.add('rvw-prefix');
    else if (x.split(' ').slice(0, 3).join(' ') === y.split(' ').slice(0, 3).join(' ')) reasons.add('test-or-score-text');
    else reasons.add('level-or-chapter');
  });
  const order = ['level-or-chapter', 'test-or-score-text', 'rvw-prefix', 'note-in-brackets', 'staff-added-text'];
  const reason = order.find(r => reasons.has(r)) || 'other';
  return { status: 'differs', reason, detail: `claude: ${JSON.stringify(a)} | n8n: ${JSON.stringify(b)}` };
}

/** Compare per student (matched by row number, never by name). */
function compareRun({ center, runId, claudeRows, n8nRows, headerDate, compareColour = true }) {
  const n8nByRow = new Map(n8nRows.map(r => [r.row, r]));
  const rows = claudeRows.map(c => {
    const n = n8nByRow.get(c.row);
    if (!n) return { row: c.row, input: c.input, attendance: c.attendance, status: 'differs', reason: 'missing-in-n8n', claude: c.next_week_log, n8n: null };
    const cmp = compareCell(c.next_week_log, n.cell);
    return { row: c.row, input: c.input, attendance: c.attendance, ...cmp, claude: c.next_week_log, n8n: n.cell, colourClaude: !!c.needs_color, colourN8n: n.colour === 'cyan' };
  });
  // Colour is only meaningful right after n8n writes; staff clear cyan flags later, so past weeks skip it.
  const colourDiffs = compareColour ? rows.filter(r => r.status === 'match' && r.colourClaude !== r.colourN8n).length : 0;
  const matched = rows.filter(r => r.status === 'match').length;
  const byReason = {};
  rows.filter(r => r.status === 'differs').forEach(r => { byReason[r.reason] = (byReason[r.reason] || 0) + 1; });
  return {
    runId, center, headerDate, mode: 'dry-run', wroteAnything: false,
    n8nUpdated: rows.filter(r => r.n8n != null && norm(r.n8n) !== norm(r.input)).length,
    claudeWouldUpdate: rows.filter(r => norm(r.claude) !== norm(r.input)).length,
    total: rows.length, matched, differs: rows.length - matched, colourDiffs, byReason,
    verdict: rows.length > 0 && matched === rows.length && colourDiffs === 0 ? 'good' : 'review',
    rows,
  };
}

module.exports = { compareCell, compareRun, norm };

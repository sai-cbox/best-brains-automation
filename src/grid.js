'use strict';
// Pure helpers that turn a sheet grid into engine input. No I/O.
// Grid shape (same for the Google source and fixtures):
//   { headerRow: [ 'Name', '09/22/2026', ... ], rows: [ { row: 4, cells: [ {text, colour} ... ] } ] }
// Column 0 holds the student name; dated columns hold the weekly log. Row numbers are the sheet's own.
const { classifyColour, isAbsent } = require('./colors');

const DAY = 24 * 60 * 60 * 1000;
function parseDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(+m[3], +m[1] - 1, +m[2]) : null;
}
function formatDate(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Dated columns in sheet order: [{ col, date: Date, text }] */
function dateColumns(headerRow) {
  return headerRow.map((t, col) => ({ col, date: parseDate(t), text: t })).filter(c => c.date);
}

/**
 * Picks the two columns a run needs.
 *  last   = the input week (generate next week reads this)
 *  newest = the column after it, if it already exists (n8n's output, used only for dry-run compare)
 * The input week is the newest column that is NOT the n8n output: if the newest column is exactly
 * 7 days after the one before it, in dry run it is treated as n8n's output for that input.
 */
function pickColumns(headerRow, { dryRun }) {
  const cols = dateColumns(headerRow).sort((a, b) => a.date - b.date);
  if (cols.length === 0) throw new Error('No dated columns found in header row');
  if (!dryRun) return { input: cols[cols.length - 1], output: null, newHeaderDate: formatDate(new Date(cols[cols.length - 1].date.getTime() + 7 * DAY)) };
  if (cols.length < 2) throw new Error('Dry run needs two dated columns (input week and n8n output)');
  const output = cols[cols.length - 1], input = cols[cols.length - 2];
  if (Math.round((output.date - input.date) / DAY) !== 7) throw new Error(`Newest column is not 7 days after the previous one (${input.text} -> ${output.text}); refusing to compare`);
  return { input, output, newHeaderDate: output.text };
}

function studentsFromGrid(grid, input, newHeaderDate) {
  const out = [];
  for (const r of grid.rows) {
    const cell = r.cells[input.col];
    const text = (cell && cell.text) || '';
    if (!String(r.cells[0]?.text || '').trim() || !text.trim()) continue; // skip blank rows
    const colour = classifyColour(cell && cell.colour);
    const absent = isAbsent(colour);
    out.push({ row: r.row, student_name: `row ${r.row}`, last_week_log: text, is_present: !absent, book_collected: !absent, new_header_date: newHeaderDate, colour });
  }
  return out;
}

function n8nRowsFromGrid(grid, output) {
  return grid.rows.map(r => {
    const cell = r.cells[output.col];
    return { row: r.row, cell: (cell && cell.text) || '', colour: classifyColour(cell && cell.colour) };
  });
}

/** Input column is the one dated `inputText` (sent by the button at click time); n8n's output is the column 7 days later. */
function pickColumnsForInput(headerRow, inputText) {
  const want = parseDate(inputText);
  if (!want) throw new Error(`Bad input date: ${inputText}`);
  const cols = dateColumns(headerRow);
  const input = cols.find(c => +c.date === +want);
  if (!input) throw new Error(`No column dated ${inputText}`);
  const next = new Date(want); next.setDate(next.getDate() + 7);
  const outText = formatDate(next);
  const output = cols.find(c => c.text.trim() === outText || +c.date === +next) || null;
  return { input, output, outText, newHeaderDate: outText };
}

/** Fingerprint of a column, used to tell when n8n has finished writing it. */
const columnSignature = (grid, col) => JSON.stringify(grid.rows.map(r => [r.row, (r.cells[col] && r.cells[col].text) || '']));

module.exports = { pickColumnsForInput, columnSignature, parseDate, formatDate, dateColumns, pickColumns, studentsFromGrid, n8nRowsFromGrid };

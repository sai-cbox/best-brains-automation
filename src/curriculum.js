'use strict';
// Builds the curriculum from the three tabs of the curriculum sheet (Maths, English, Holidays).
// Nothing about levels, level order, tests, test weeks, novels or holidays lives in code.

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

function toObjects(rows) {
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

function normDate(s) {
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}` : null;
}

/** tabs: { maths: Object[], english: Object[], holidays: Object[] } with the sheet's column headers. */
function buildCurriculum(tabs) {
  const levels = { M: [], E: [] };
  const tests = [];
  for (const [subject, rows] of [['M', tabs.maths], ['E', tabs.english]]) {
    for (const r of rows) {
      const level = String(r.Level || '').trim();
      if (!level) continue;
      if (!levels[subject].includes(level)) levels[subject].push(level); // sheet order = level order
      tests.push({ Subject: subject, Level: level, Exam: String(r.Exam || '').trim(), Chapter: String(r['week of the year'] || '').trim().toUpperCase() });
    }
  }
  const holidays = tabs.holidays.map(r => normDate(r.Date)).filter(Boolean);
  return { levels, tests, holidays };
}

function fromCsvTexts({ maths, english, holidays }) {
  return buildCurriculum({ maths: toObjects(parseCsv(maths)), english: toObjects(parseCsv(english)), holidays: toObjects(parseCsv(holidays)) });
}

module.exports = { parseCsv, toObjects, buildCurriculum, fromCsvTexts, normDate };

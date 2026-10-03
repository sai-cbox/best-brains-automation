'use strict';
const fs = require('fs'), path = require('path');
const { fromCsvTexts, parseCsv, toObjects } = require('../src/curriculum');
const { createEngine } = require('../src/engine');
const fx = n => fs.readFileSync(path.join(__dirname, '..', 'fixtures', n), 'utf8');
const curriculum = () => fromCsvTexts({ maths: fx('maths.csv'), english: fx('english.csv'), holidays: fx('holidays.csv') });
const engine = () => createEngine(curriculum());

// Reference: the corrected n8n Core Logic, run against the same sheet rows.
function reference(students) {
  const code = fx('core_logic_corrected.reference.js');
  const mk = (rows, start) => rows.map((r, i) => ({ row_number: start + i, Level: r.Level, Exam: r.Exam, 'week of the year': r['week of the year'] }));
  const table = [...mk(toObjects(parseCsv(fx('maths.csv'))), 2), ...mk(toObjects(parseCsv(fx('english.csv'))), 2),
    ...toObjects(parseCsv(fx('holidays.csv'))).map((r, i) => ({ row_number: i + 2, Date: r.Date }))];
  const fn = new Function('$input', '$', code);
  return fn({ all: () => [{ json: { data: [{ data: table }, ...students] } }] }, () => null).map(o => o.json);
}
module.exports = { curriculum, engine, reference };

'use strict';
// PublicSheetSource against real .xlsx bytes built the way Google's export looks:
// date cells as real dates, solid RGB fills, rich text, formula results.
const test = require('node:test'), assert = require('node:assert');
const ExcelJS = require('exceljs');
const fs = require('fs'), path = require('path');
const { PublicSheetSource } = require('../src/publicSheets');
const { backfill } = require('../src/backfill');
const { parseCsv, toObjects } = require('../src/curriculum');
const os = require('os');

const fx = n => fs.readFileSync(path.join(__dirname, '..', 'fixtures', n), 'utf8');
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

async function curriculumBook() {
  const wb = new ExcelJS.Workbook();
  for (const [name, file] of [['Maths', 'maths.csv'], ['English', 'english.csv']]) {
    const ws = wb.addWorksheet(name); ws.addRow(['Level', 'Exam', 'week of the year']);
    toObjects(parseCsv(fx(file))).forEach(r => ws.addRow([r.Level, r.Exam, r['week of the year']]));
  }
  const h = wb.addWorksheet('Holidays'); h.addRow(['Date']);
  toObjects(parseCsv(fx('holidays.csv'))).forEach(r => { const [m, d, y] = r.Date.split('/').map(Number); h.addRow([new Date(Date.UTC(y, m - 1, d))]); });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function centerBook() {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Table1 2026');
  ws.addRow(['Liberty Hill']);                                                       // title row above the header
  ws.addRow(['Name', new Date(Date.UTC(2026, 8, 22)), new Date(Date.UTC(2026, 8, 29))]);
  const r1 = ws.addRow(['stu A', { richText: [{ text: 'M 2 ' }, { text: 'E' }] }, 'M 2 F']);
  r1.getCell(2).fill = fill('FFF4CCCC');                                              // pink = present
  const r2 = ws.addRow(['stu B', 'E F1 G', 'E F1 G']);
  r2.getCell(2).fill = fill('FFFFFF00');                                              // yellow = absent
  ws.addRow(['stu C', { formula: 'A1', result: 'M 0b I' }, 'M 0b MT1 & J']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const fetcher = books => async url => {
  const id = url.match(/\/d\/([^/]+)\//)[1];
  const b = books[id];
  return b ? { ok: true, status: 200, arrayBuffer: async () => b } : { ok: false, status: 403, arrayBuffer: async () => Buffer.from('<html>') };
};

test('reads curriculum and a center grid from the public export, with no key', async () => {
  const books = { cur: await curriculumBook(), lh: await centerBook() };
  const src = new PublicSheetSource({ curriculumSheetId: 'cur', fetchImpl: fetcher(books) });
  const cur = await src.readCurriculum();
  assert.deepStrictEqual(cur.levels.M.slice(0, 4), ['JrBg', 'SrBg', '0a', '0b']);
  assert.ok(cur.holidays.includes('11/26/2026'));
  const g = await src.readGrid('lh', 'Table1 2026');
  assert.deepStrictEqual(g.headerRow.slice(1), ['09/22/2026', '09/29/2026']);   // title row skipped, dates formatted
  assert.strictEqual(g.rows[0].row, 3);                                         // real sheet row numbers
  assert.strictEqual(g.rows[0].cells[1].text, 'M 2 E');                         // rich text joined
  assert.strictEqual(g.rows[2].cells[1].text, 'M 0b I');                        // formula result
  assert.ok(g.rows[0].cells[1].colour.red > 0.95 && Math.abs(g.rows[0].cells[1].colour.green - 204 / 255) < .01);
  assert.strictEqual(g.rows[1].cells[1].colour.blue, 0);
});

test('end to end: past-week backfill from the public export', async () => {
  const books = { cur: await curriculumBook(), lh: await centerBook() };
  const src = new PublicSheetSource({ curriculumSheetId: 'cur', fetchImpl: fetcher(books) });
  const config = { centers: { 'Liberty Hill': { sheetId: 'lh', tabs: ['Table1 2026'], generate: 'dry-run' } } };
  const [rep] = await backfill({ center: 'Liberty Hill', source: src, config, reportDir: fs.mkdtempSync(path.join(os.tmpdir(), 'pub-')), weeks: 4 });
  assert.strictEqual(rep.total, 3);
  assert.strictEqual(rep.matched, 3);    // pink M 2 E -> M 2 F; yellow (absent) E F1 G stays; M 0b I -> M 0b MT1 & J
});

test('a sheet that is not link-shared gives a clear error', async () => {
  const src = new PublicSheetSource({ curriculumSheetId: 'nope', fetchImpl: fetcher({}) });
  await assert.rejects(() => src.readCurriculum(), /Anyone with the link/);
});

test('an HTML sign-in page is not mistaken for a spreadsheet', async () => {
  const src = new PublicSheetSource({ curriculumSheetId: 'x', fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('<html>sign in</html>') }) });
  await assert.rejects(() => src.readCurriculum(), /not a spreadsheet|did not return/);
});

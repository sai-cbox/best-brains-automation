'use strict';
// Reads "anyone with the link can view" Google Sheets with NO key and NO login, using the public
// Excel export (https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx). The export carries
// every tab's values and cell fill colours, which is all the dry run needs.
// Read-only by nature: it cannot write to a sheet.
const ExcelJS = require('exceljs');
const { buildCurriculum } = require('./curriculum');

const pad = n => String(n).padStart(2, '0');
const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

/** Cell -> the text the sheet shows (dates as mm/dd/yyyy). */
function cellText(cell) {
  let v = cell && cell.value;
  if (v == null) return '';
  if (v instanceof Date) return `${pad(v.getUTCMonth() + 1)}/${pad(v.getUTCDate())}/${v.getUTCFullYear()}`;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('result' in v) return v.result instanceof Date ? cellText({ value: v.result }) : String(v.result ?? '');
    if ('text' in v) return String(v.text);
    return '';
  }
  return String(v);
}

/** ExcelJS fill -> {red,green,blue} floats (the shape colors.js expects), or null for no fill. */
function cellColour(cell) {
  const f = cell && cell.fill;
  if (!f || f.type !== 'pattern' || f.pattern !== 'solid') return null;
  const argb = f.fgColor && f.fgColor.argb;
  if (!argb || argb.length !== 8) return null;
  return { red: parseInt(argb.slice(2, 4), 16) / 255, green: parseInt(argb.slice(4, 6), 16) / 255, blue: parseInt(argb.slice(6, 8), 16) / 255 };
}

class PublicSheetSource {
  constructor({ curriculumSheetId, fetchImpl = fetch, ttlMs = 15000, now = Date.now } = {}) {
    this.curriculumSheetId = curriculumSheetId; this.fetch = fetchImpl; this.ttl = ttlMs; this.now = now; this.cache = new Map();
  }

  async _book(sheetId, fresh = false) {
    const hit = this.cache.get(sheetId);
    if (!fresh && hit && this.now() - hit.at < this.ttl) return hit.book;
    const res = await this.fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Could not download sheet ${sheetId.slice(0, 6)}… (HTTP ${res.status}). Is it shared as "Anyone with the link: Viewer"?`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4 || buf.readUInt32BE(0) !== 0x504b0304) throw new Error(`Sheet ${sheetId.slice(0, 6)}… did not return a spreadsheet (not shared with link access?)`);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buf);
    this.cache.set(sheetId, { at: this.now(), book });
    return book;
  }

  async _objects(sheetId, tab) {
    const ws = (await this._book(sheetId)).getWorksheet(tab);
    if (!ws) throw new Error(`Tab "${tab}" not found`);
    const head = []; ws.getRow(1).eachCell({ includeEmpty: false }, (c, i) => { head[i] = cellText(c).trim(); });
    const out = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const o = {}; head.forEach((h, i) => { if (h) o[h] = cellText(row.getCell(i)).trim(); });
      out.push(o);
    });
    return out;
  }

  async readCurriculum() {
    if (!this.curriculumSheetId) throw new Error('curriculumSheetId missing from CENTERS_JSON');
    const [maths, english, holidays] = await Promise.all(['Maths', 'English', 'Holidays'].map(t => this._objects(this.curriculumSheetId, t)));
    return buildCurriculum({ maths, english, holidays });
  }

  /** { headerRow: string[], rows: [{ row, cells: [{text, colour}] }] }; cells[0] is column A. */
  async readGrid(sheetId, tab, opts = {}) {
    const ws = (await this._book(sheetId, !!opts.fresh)).getWorksheet(tab);
    if (!ws) throw new Error(`Tab "${tab}" not found`);
    const rowsAll = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const cells = [];
      for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c++) { const cell = row.getCell(c); cells.push({ text: cellText(cell), colour: cellColour(cell) }); }
      rowsAll.push({ row: n, cells });
    });
    const hi = rowsAll.findIndex(r => r.cells.some(c => DATE_RE.test(c.text.trim())));
    if (hi < 0) throw new Error(`No header row with dates in tab "${tab}"`);
    return { headerRow: rowsAll[hi].cells.map(c => c.text), rows: rowsAll.slice(hi + 1) };
  }
}

module.exports = { PublicSheetSource, cellText, cellColour };

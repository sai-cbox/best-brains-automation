'use strict';
// Sheet access. Two sources (Google, fixture) and one sink that refuses to write unless the mode is live.
const fs = require('fs');
const { buildCurriculum } = require('./curriculum');
const { CYAN } = require('./colors');

class DryRunWriteError extends Error {
  constructor(what) { super(`Blocked write (${what}): this run is not in live mode`); this.name = 'DryRunWriteError'; }
}

/** Reads from a JSON fixture: { curriculum: {maths, english, holidays}, tabs: { "<tab>": grid } } */
class FixtureSource {
  constructor(file) { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  async readCurriculum() { return buildCurriculum(this.data.curriculum); }
  async readGrid(_sheetId, tab) { return this.data.tabs[tab]; }
}

/** Reads through the Google Sheets API with a service account (GOOGLE_APPLICATION_CREDENTIALS). Read-only scope. */
class GoogleSource {
  constructor() {
    const { google } = require('googleapis');
    // Public "anyone with the link can view" sheets: a plain API key is enough (GOOGLE_API_KEY).
    // Otherwise a service account (GOOGLE_APPLICATION_CREDENTIALS), read-only scope.
    const auth = process.env.GOOGLE_API_KEY
      ? process.env.GOOGLE_API_KEY
      : new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    this.sheets = google.sheets({ version: 'v4', auth });
  }
  async _values(sheetId, tab) {
    const r = await this.sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: tab });
    const [head, ...body] = r.data.values || [];
    return (body || []).map(row => Object.fromEntries((head || []).map((h, i) => [String(h).trim(), row[i] ?? ''])));
  }
  async readCurriculum() {
    const CURRICULUM_SHEET_ID = require('./config').cfg.curriculumSheetId;
    if (!CURRICULUM_SHEET_ID) throw new Error('curriculumSheetId missing from CENTERS_JSON');
    const [maths, english, holidays] = await Promise.all(['Maths', 'English', 'Holidays'].map(t => this._values(CURRICULUM_SHEET_ID, t)));
    return buildCurriculum({ maths, english, holidays });
  }
  /** Text + background colour for every cell of a tab. Row numbers are the sheet's own (1-based). */
  async readGrid(sheetId, tab) {
    const r = await this.sheets.spreadsheets.get({
      spreadsheetId: sheetId, ranges: [tab], includeGridData: true,
      fields: 'sheets(data(startRow,rowData(values(formattedValue,effectiveFormat/backgroundColor))))',
    });
    const data = r.data.sheets[0].data[0];
    const rowsAll = (data.rowData || []).map((rd, i) => ({
      row: (data.startRow || 0) + i + 1,
      cells: (rd.values || []).map(v => ({ text: v.formattedValue || '', colour: v.effectiveFormat && v.effectiveFormat.backgroundColor })),
    }));
    // header row = first row with at least one dated cell
    const hi = rowsAll.findIndex(r => r.cells.some(c => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c.text)));
    if (hi < 0) throw new Error(`No header row with dates in tab "${tab}"`);
    return { headerRow: rowsAll[hi].cells.map(c => c.text), rows: rowsAll.slice(hi + 1) };
  }
}

/** Write side. Live mode only. Not exercised by dry runs; first live use needs its own review. */
class Sink {
  constructor(mode, google) { this.mode = mode; this.google = google; }
  _guard(what) { if (this.mode !== 'live') throw new DryRunWriteError(what); }
  async writeNextWeek({ sheetId, tab, col, headerDate, cells }) {
    this._guard(`write ${cells.length} cells to ${tab}`);
    const requests = cells.map(c => ({
      updateCells: {
        range: { sheetId: c.gid, startRowIndex: c.row - 1, endRowIndex: c.row, startColumnIndex: col, endColumnIndex: col + 1 },
        rows: [{ values: [{ userEnteredValue: { stringValue: c.text }, userEnteredFormat: c.needsColor ? { backgroundColor: CYAN } : undefined }] }],
        fields: c.needsColor ? 'userEnteredValue,userEnteredFormat.backgroundColor' : 'userEnteredValue',
      },
    }));
    return this.google.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests } });
  }
}


/**
 * Writes dry-run results to ONE results sheet (tabs "Claude Dry Run" and "Claude Dry Run Differences").
 * Refuses to write to any schedule sheet or the curriculum sheet.
 */
class ResultsSink {
  constructor(resultsSheetId, forbiddenIds, api) {
    if (!resultsSheetId) throw new Error('resultsSheetId missing');
    if (forbiddenIds.includes(resultsSheetId)) throw new Error('Results sheet must not be a schedule or curriculum sheet');
    this.id = resultsSheetId; this.api = api;
  }
  static google(resultsSheetId, forbiddenIds) {
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    return new ResultsSink(resultsSheetId, forbiddenIds, google.sheets({ version: 'v4', auth }));
  }
  async _append(tab, values) {
    return this.api.spreadsheets.values.append({ spreadsheetId: this.id, range: `'${tab}'!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values } });
  }
  async publish(report) {
    const at = new Date().toISOString();
    await this._append('Claude Dry Run', [[at, report.runId, report.center, report.tab, report.headerDate, report.verdict, report.total, report.matched, report.differs, report.colourDiffs, JSON.stringify(report.byReason)]]);
    const diffs = (report.rows || []).filter(r => r.status !== 'match').map(r => [at, report.runId, report.center, report.tab, report.headerDate, r.row, r.reason, r.claude, r.n8n]);
    if (diffs.length) await this._append('Claude Dry Run Differences', diffs);
  }
}

module.exports = { FixtureSource, GoogleSource, Sink, ResultsSink, DryRunWriteError };

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


module.exports = { FixtureSource, Sink, DryRunWriteError };

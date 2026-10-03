/**
 * Paste into the Apps Script project that owns the "Schedule Sync" menu.
 * Script Properties needed (Project Settings > Script properties):
 *   GITHUB_TOKEN   fine-grained token, this repo only, "Actions: read and write" permission
 *   RESULTS_SHEET_ID   id of the "Claude Dry Run" results sheet
 * The token is never in code. A failure here must never affect the n8n call.
 */
var CLAUDE_REPO = 'sai-cbox/best-brains-automation';
var CLAUDE_WORKFLOW = 'dry-run.yml';

/** Call this right AFTER the existing n8n webhook call. centerName e.g. 'Liberty Hill'. */
function triggerClaudeDryRun_(centerName) {
  try {
    var sheet = SpreadsheetApp.getActiveSheet();
    var inputDate = newestHeaderDate_(sheet);          // the column the button is generating from, at click time
    if (!inputDate) return;
    var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!token) return;
    UrlFetchApp.fetch('https://api.github.com/repos/' + CLAUDE_REPO + '/actions/workflows/' + CLAUDE_WORKFLOW + '/dispatches', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      payload: JSON.stringify({ ref: 'main', inputs: { center: centerName, input_date: inputDate } }),
      muteHttpExceptions: true
    });
  } catch (e) { console.error('Claude dry run not started: ' + e); }
}

/** Newest dated header cell as mm/dd/yyyy (first row that has dates). */
function newestHeaderDate_(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  for (var r = 0; r < values.length; r++) {
    var best = null, bestT = 0;
    for (var c = 0; c < values[r].length; c++) {
      var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(values[r][c]).trim());
      if (m) { var t = new Date(+m[3], +m[1] - 1, +m[2]).getTime(); if (t > bestT) { bestT = t; best = values[r][c].trim(); } }
    }
    if (best) return best;
  }
  return null;
}

/** For the sidebar: latest Claude dry-run result per tab for this center. */
function getClaudeDryRunStatus(centerName) {
  var id = PropertiesService.getScriptProperties().getProperty('RESULTS_SHEET_ID');
  if (!id) return [];
  var tab = SpreadsheetApp.openById(id).getSheetByName('Claude Dry Run');
  if (!tab) return [];
  var rows = tab.getDataRange().getValues().slice(1).filter(function (r) { return r[2] === centerName; });
  return rows.slice(-8).reverse().map(function (r) {
    return { at: r[0], tab: r[3], week: r[4], verdict: r[5], total: r[6], matched: r[7], differs: r[8], reasons: r[10] };
  });
}

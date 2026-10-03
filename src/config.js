'use strict';
// Per-center settings and the mode switch. No secrets and no sheet IDs in code: IDs come from the
// CENTERS_JSON environment variable (a repo variable in GitHub), the Google key from a secret.
//
// CENTERS_JSON example (set as a GitHub repo variable, never committed):
//   { "curriculumSheetId": "...", "resultsSheetId": "...",
//     "centers": { "Liberty Hill": { "sheetId": "...", "tabs": ["Table1 2026","Table2 2026","Table3 2026","Table4 2026"], "generate": "dry-run" } } }
//
// mode per center:
//   off      - nothing runs
//   dry-run  - read, generate, COMPARE with n8n, report. Never writes a schedule sheet or the portal.
//   live     - writes. Only Sai switches a center here after reviewing its dry runs.
const MODES = ['off', 'dry-run', 'live'];
const NAMES = ['Liberty Hill', 'Leander', 'Avery Ranch', 'Georgetown', 'Round Rock'];

function load(env = process.env) {
  const raw = env.CENTERS_JSON ? JSON.parse(env.CENTERS_JSON) : { centers: {} };
  const centers = {};
  for (const n of NAMES) centers[n] = { sheetId: null, tabs: [], generate: 'off', portal: 'off', ...(raw.centers || {})[n] };
  for (const [n, c] of Object.entries(centers)) if (!MODES.includes(c.generate)) throw new Error(`Bad mode for ${n}: ${c.generate}`);
  return { curriculumSheetId: raw.curriculumSheetId || null, resultsSheetId: raw.resultsSheetId || null, centers };
}

const cfg = load();
function modeFor(center, workflow = 'generate') {
  const c = cfg.centers[center];
  if (!c) throw new Error(`Unknown center: ${center}`);
  return c[workflow];
}
module.exports = { cfg, centers: cfg.centers, modeFor, MODES, load };

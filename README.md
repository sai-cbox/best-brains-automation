# bb-schedule: Generate next week (Claude-managed)

Separate from Update portal (built next). Compare-only dry run first, per center.

- `src/engine.js`   rules engine (corrected n8n Core Logic V37). Pure function. Levels, level order, tests, test weeks, novels and holidays all come from the curriculum sheet.
- `src/curriculum.js` builds the curriculum from the Maths / English / Holidays tabs.
- `src/grid.js`, `src/colors.js` sheet grid -> engine input (yellow = absent; pink/orange/white/cyan = present).
- `src/compare.js`  dry-run comparison against what n8n wrote; gap reasons for the dashboard.
- `src/runlog.js`   `reports/runs.jsonl` (one line per run) and `differences_<run>.csv` (Looker Studio source). Rows are sheet row numbers, never names.
- `src/config.js`   per-center mode: off | dry-run | live. Only Sai changes a center to live.
- `src/sheets.js`   Google source (read-only scope), fixture source, and a Sink that throws unless live.

Run: `npm install; GOOGLE_APPLICATION_CREDENTIALS=<key> node src/run.js --mode dry-run [--center "Liberty Hill"]`
Test: `npm test`

Defaults applied (no preference given): typed "Ob" is written as "0b"; HT1 holds one week.

Not verified yet: Google API reads/writes against real sheets (service account not set up), other centers' layouts, live sink.

## Button flow (dry run alongside n8n)
Schedule Sync click -> n8n webhook (unchanged) + `triggerClaudeDryRun_()` (apps-script/claude_dry_run.gs) -> GitHub Actions `dry-run.yml`
-> snapshot input week, generate, wait for n8n's column to settle (up to 15 min), compare, write to the "Claude Dry Run" results sheet.
Never writes a schedule sheet or the portal.

Setup (nothing secret is committed):
- Secret `GOOGLE_SA_KEY`: service account JSON key. Share each center sheet + curriculum sheet with the account as Viewer; share the results sheet as Editor.
- Variable `CENTERS_JSON`: sheet ids, tabs, per-center mode (see src/config.js).
- Apps Script properties: `GITHUB_TOKEN` (fine-grained, this repo, Actions read/write), `RESULTS_SHEET_ID`.
- Results sheet tabs: "Claude Dry Run" and "Claude Dry Run Differences" (header rows optional).

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

## How it runs next to n8n (dashboard on port 8091)
Schedule Sync click -> n8n webhook (unchanged) -> n8n also calls `POST /trigger` on this service (node: n8n/tell-claude-node.json)
-> the service snapshots the input week, generates next week, waits for n8n's new column to settle (up to 15 min), compares.
The dashboard (`GET /`) shows live runs plus the last N past weeks (BACKFILL_WEEKS, filled at start-up and every 6 hours).
Never writes a schedule sheet or the portal. Student names never appear; rows are sheet row numbers.

Deploy (host 192.168.86.67): see deploy/ (docker-compose.yml or bb-dashboard.service).
Needs: a Google API key (sheets are link-shared as viewer, so no service account); CLAUDE_TRIGGER_TOKEN; CENTERS_JSON (ids are not committed).
Sample data to see the layout: `node scripts/make-demo.js; DEMO=1 FIXTURE=fixtures/demo.json CLAUDE_TRIGGER_TOKEN=x BACKFILL_WEEKS=6 CENTERS_JSON='{"centers":{"Liberty Hill":{"sheetId":"d","tabs":["Table1 2026"],"generate":"dry-run"}}}' node src/server.js`

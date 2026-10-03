'use strict';
// SAMPLE DATA ONLY: records two "button click" runs from the demo fixture so the Day by day page has content.
const { runCenter } = require('../src/run');
const { FixtureSource, Sink } = require('../src/sheets');
(async () => {
  const config = { centers: { 'Liberty Hill': { sheetId: 'd', tabs: ['Table1 2026'], generate: 'dry-run' } } };
  const source = new FixtureSource(process.argv[2]);
  for (const d of ['09/15/2026', '09/22/2026']) {
    await runCenter({ center: 'Liberty Hill', source, sink: new Sink('dry-run'), reportDir: process.argv[3], forceMode: 'dry-run', config, inputDate: d, waitForN8n: true, pollMs: 1, stableMs: 0, kind: 'live-trigger' });
    await new Promise(r => setTimeout(r, 1100));
  }
})();

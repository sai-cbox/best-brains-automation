'use strict';
// HTTP service: n8n tells it a sheet was triggered; it runs the compare-only dry run and serves the dashboard.
//   POST /trigger        (n8n)  header X-Token, body { spreadsheet_id, sheet_name }  -> 202, job runs in background
//   POST /api/backfill   (dashboard button / curl)  body { weeks, center? }
//   GET  /api/runs?weeks=N   run summaries, newest first
//   GET  /api/runs/:id       one run with every differing cell
//   GET  /                   dashboard
// Never writes to a schedule sheet or the portal.
const http = require('http');
const fs = require('fs'), path = require('path');
const crypto = require('crypto');
const { runCenter } = require('./run');
const { backfill } = require('./backfill');
const { createEngine } = require('./engine');
const { evaluate, curriculumSummary, OPEN_QUESTIONS } = require('./rules');

function readRuns(reportDir) {
  const dir = path.join(reportDir, 'runs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}
const summary = ({ rows, ...s }) => s;
const mdy = d => { const [m, dd, y] = d.split('/').map(Number); return new Date(y, m - 1, dd).getTime(); };

function createServer({ source, config, reportDir, token, runOpts = {} }) {
  const jobs = new Map(); // runKey -> { status, startedAt }
  const dashboard = fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8');
  const centerFor = id => Object.entries(config.centers).find(([, c]) => c.sheetId && c.sheetId === id);

  async function startTrigger(center, tab) {
    const key = `${center}|${tab}`;
    if (jobs.get(key)?.status === 'running') return 'already-running';
    const job = { status: 'running', startedAt: new Date().toISOString() };
    jobs.set(key, job);
    runCenter({ center, source, sink: null, reportDir, forceMode: 'dry-run', config, inputDate: 'newest', onlyTab: tab, kind: 'live-trigger', waitForN8n: true, ...runOpts })
      .then(() => { job.status = 'done'; })
      .catch(e => { job.status = 'error'; job.error = e.message; console.error(`${key}: ${e.message}`); });
    job.promise = null;
    return 'started';
  }

  let rulesCache = null;
  async function rulesPayload() {
    if (rulesCache && Date.now() - rulesCache.at < 60e3) return rulesCache.body;
    const cur = await source.readCurriculum();
    const body = { rules: evaluate(createEngine(cur), cur), curriculum: curriculumSummary(cur), openQuestions: OPEN_QUESTIONS };
    rulesCache = { at: Date.now(), body };
    return body;
  }

  const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  const readBody = req => new Promise(r => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r(null); } }); });
  const authed = req => { const t = String(req.headers['x-token'] || ''); return token && t.length === token.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(token)); };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, dashboard, 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/api/runs') {
        const weeks = +url.searchParams.get('weeks') || 6;
        const cutoff = Date.now() - weeks * 7 * 864e5;
        const runs = readRuns(reportDir).filter(r => mdy(r.headerDate) >= cutoff).sort((a, b) => mdy(b.headerDate) - mdy(a.headerDate) || a.center.localeCompare(b.center)).map(summary);
        return send(res, 200, { runs, jobs: [...jobs].map(([k, j]) => ({ key: k, status: j.status, startedAt: j.startedAt, error: j.error })), demo: !!process.env.DEMO });
      }
      if (req.method === 'GET' && url.pathname === '/api/rules') {
        try { return send(res, 200, await rulesPayload()); } catch (e) { return send(res, 502, { error: `Could not read the curriculum sheet: ${e.message}` }); }
      }
      const m = url.pathname.match(/^\/api\/runs\/([\w.-]+)$/);
      if (req.method === 'GET' && m) {
        const f = path.join(reportDir, 'runs', `${m[1]}.json`);
        return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f, 'utf8')) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'POST' && url.pathname === '/trigger') {
        if (!authed(req)) return send(res, 401, { error: 'bad token' });
        const body = await readBody(req);
        if (!body || !body.spreadsheet_id || !body.sheet_name) return send(res, 400, { error: 'need spreadsheet_id and sheet_name' });
        const hit = centerFor(body.spreadsheet_id);
        if (!hit || hit[1].generate === 'off' || !hit[1].tabs.includes(body.sheet_name)) return send(res, 202, { status: 'ignored', reason: 'sheet/tab not configured for dry run' });
        return send(res, 202, { status: await startTrigger(hit[0], body.sheet_name) });
      }
      if (req.method === 'POST' && url.pathname === '/api/backfill') {
        if (!authed(req)) return send(res, 401, { error: 'bad token' });
        const body = (await readBody(req)) || {};
        const centers = body.center ? [body.center] : Object.keys(config.centers);
        let n = 0;
        for (const c of centers) n += (await backfill({ center: c, source, config, reportDir, weeks: +body.weeks || 4 })).length;
        return send(res, 200, { recorded: n });
      }
      send(res, 404, { error: 'not found' });
    } catch (e) { console.error(e); send(res, 500, { error: 'server error' }); }
  });
  server.jobs = jobs;
  return server;
}

async function main() {
  const { cfg } = require('./config');
  const { FixtureSource } = require('./sheets');
  const { PublicSheetSource } = require('./publicSheets');
  const port = +process.env.PORT || 8091;
  const token = process.env.CLAUDE_TRIGGER_TOKEN;
  if (!token) throw new Error('Set CLAUDE_TRIGGER_TOKEN (shared with the n8n HTTP node)');
  const fixture = process.env.FIXTURE;
  const reportDir = process.env.REPORT_DIR || path.join(__dirname, '..', 'reports');
  const source = fixture ? new FixtureSource(fixture) : new PublicSheetSource({ curriculumSheetId: cfg.curriculumSheetId });
  createServer({ source, config: cfg, reportDir, token }).listen(port, '0.0.0.0', () => console.log(`dashboard on :${port}`));
  // Past weeks fill the dashboard without anyone clicking: at start-up, then every 6 hours.
  const weeks = +process.env.BACKFILL_WEEKS || 0;
  if (weeks) {
    const go = async () => { for (const c of Object.keys(cfg.centers)) { try { await backfill({ center: c, source, config: cfg, reportDir, weeks }); } catch (e) { console.error(`backfill ${c}: ${e.message}`); } } };
    go(); setInterval(go, 6 * 3600e3);
  }
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { createServer, readRuns };

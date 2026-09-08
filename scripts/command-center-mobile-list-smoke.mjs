#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import WebSocket from 'ws';

const BASE_URL = process.env.TIBER_MOBILE_BASE_URL ?? 'http://127.0.0.1:5000';
const DEBUG_PORT = Number(process.env.TIBER_MOBILE_LIST_DEBUG_PORT ?? 9225);
const RENDER_BUDGET_MS = Number(process.env.TIBER_MOBILE_LIST_RENDER_BUDGET_MS ?? 2500);
const INTERACTION_BUDGET_MS = Number(process.env.TIBER_MOBILE_LIST_INTERACTION_BUDGET_MS ?? 1000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function invariant(condition, message) { if (!condition) throw new Error(message); }

function chromeBinary() {
  const explicit = process.env.CHROME_BIN?.trim();
  if (explicit && fs.existsSync(explicit)) return explicit;
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error('Chrome/Chromium was not found.');
}

async function waitForJson(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 1; this.pending = new Map(); }
  async connect() {
    await new Promise((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (!msg.id) return;
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      msg.error ? waiter.reject(new Error(msg.error.message)) : waiter.resolve(msg.result ?? {});
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => { this.ws.once('close', resolve); this.ws.close(); setTimeout(resolve, 500).unref(); });
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
  return result.result?.value;
}

async function waitFor(cdp, expression, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, `Boolean(${expression})`).catch(() => false)) return;
    await sleep(75);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function recordsPayload(count = 500) {
  const careers = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return {
      managerId: `mobile-manager-${n}`,
      displayName: `Mobile Manager ${String(n).padStart(3, '0')}`,
      seasons: 3,
      championships: n % 31 === 0 ? 1 : 0,
      finals: n % 17 === 0 ? 1 : 0,
      playoffAppearances: n % 4,
      regularSeasonTitles: n % 37 === 0 ? 1 : 0,
      pointsTitles: n % 41 === 0 ? 1 : 0,
      wins: 18 + (n % 14),
      losses: 14 + (n % 11),
      ties: 0,
      winPct: 0.4 + ((n % 20) / 100),
      pointsFor: 4200 + n * 3.25,
      pointsAgainst: 4100 + n * 2.9,
      bestWeeklyScore: 132 + (n % 70) * 0.5,
      longestWinStreak: 2 + (n % 8),
      currentWinStreak: n % 5,
    };
  });
  return {
    success: true,
    generatedAt: '2026-09-08T00:00:00.000Z',
    currentLeagueId: 'mobile-smoke',
    leagueName: 'Mobile Smoke League',
    managers: careers.map((c) => ({ userId: c.managerId, displayName: c.displayName, seasons: ['2024', '2025', '2026'] })),
    careers,
    records: [],
    rivalries: [],
    achievements: [],
    almanac: [],
    recordWatch: [],
    scoringEras: [{ id: 'mobile-era', fingerprint: 'mobile-smoke-v1', seasons: ['2026'], isCurrent: true }],
    coverage: { complete: true, seasonsRequested: 3, seasonsLoaded: 3, diagnostics: [] },
  };
}

function bootstrap(payload) {
  return `(() => {
    localStorage.setItem('tiber.records.leagueId', 'mobile-smoke');
    const realFetch = window.fetch.bind(window);
    const payload = ${JSON.stringify(payload)};
    window.fetch = (input, init) => {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      if (url.includes('/api/league-records')) {
        return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
      }
      return realFetch(input, init);
    };
  })();`;
}

async function main() {
  const report = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiber-mobile-list-'));
  const chrome = spawn(chromeBinary(), [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${dir}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let cdp;
  try {
    await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const page = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.connect();
    await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 3, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap(recordsPayload(500)) });
    await cdp.send('Page.navigate', { url: new URL('/records', BASE_URL).toString() });
    await waitFor(cdp, `document.body?.innerText?.includes('Mobile Smoke League')`, 'mock Records payload');

    const started = Date.now();
    invariant(await evaluate(cdp, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='Managers'); if(!b)return false; b.click(); return true; })()`), 'Managers tab missing');
    await waitFor(cdp, `document.querySelectorAll('tbody tr').length === 500`, '500 manager rows');
    const renderMs = Date.now() - started;
    invariant(renderMs <= RENDER_BUDGET_MS, `390px 500-row render took ${renderMs}ms, budget ${RENDER_BUDGET_MS}ms`);

    const pageOverflow = await evaluate(cdp, `Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth`);
    invariant(pageOverflow <= 1, `390px Records page has ${pageOverflow}px horizontal page overflow`);

    const interactionStarted = Date.now();
    invariant(await evaluate(cdp, `(() => { const rows=document.querySelectorAll('tbody tr'); const row=rows[rows.length-1]; if(!row)return false; row.click(); return true; })()`), 'Last manager row not clickable');
    await waitFor(cdp, `document.body?.innerText?.includes('Mobile Manager 500')`, 'last manager Legacy view');
    const interactionMs = Date.now() - interactionStarted;
    invariant(interactionMs <= INTERACTION_BUDGET_MS, `390px row interaction took ${interactionMs}ms, budget ${INTERACTION_BUDGET_MS}ms`);

    report.width = 390;
    report.rows = 500;
    report.renderMs = renderMs;
    report.renderBudgetMs = RENDER_BUDGET_MS;
    report.interactionMs = interactionMs;
    report.interactionBudgetMs = INTERACTION_BUDGET_MS;
    report.horizontalPageOverflowPx = pageOverflow;
    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), report }, null, 2));
    process.exitCode = 1;
  } finally {
    if (cdp) await cdp.close().catch(() => {});
    chrome.kill('SIGTERM');
    await sleep(100);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

await main();

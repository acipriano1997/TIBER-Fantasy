#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import WebSocket from 'ws';

const BASE_URL = process.env.TIBER_BROWSER_BASE_URL ?? 'http://127.0.0.1:5000';
const ROUTE_TIMEOUT_MS = Number(process.env.TIBER_BROWSER_ROUTE_TIMEOUT_MS ?? 10_000);
const SPA_NAV_BUDGET_MS = Number(process.env.TIBER_BROWSER_SPA_NAV_BUDGET_MS ?? 1_500);
const LARGE_LIST_RENDER_BUDGET_MS = Number(process.env.TIBER_BROWSER_LARGE_LIST_RENDER_BUDGET_MS ?? 2_500);
const LARGE_LIST_INTERACTION_BUDGET_MS = Number(process.env.TIBER_BROWSER_LARGE_LIST_INTERACTION_BUDGET_MS ?? 1_000);
const DEBUG_PORT = Number(process.env.TIBER_BROWSER_DEBUG_PORT ?? 9222);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function chromeBinary() {
  const explicit = process.env.CHROME_BIN?.trim();
  if (explicit && fs.existsSync(explicit)) return explicit;

  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }

  throw new Error('Chrome/Chromium was not found. Set CHROME_BIN to the browser executable.');
}

async function waitForJson(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = (error) => { cleanup(); reject(error); };
      const cleanup = () => {
        this.ws.off('open', onOpen);
        this.ws.off('error', onError);
      };
      this.ws.on('open', onOpen);
      this.ws.on('error', onError);
    });

    this.ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (message.id) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
        else waiter.resolve(message.result ?? {});
        return;
      }

      if (message.method) {
        for (const handler of this.handlers.get(message.method) ?? []) {
          Promise.resolve().then(() => handler(message.params ?? {})).catch((error) => {
            console.error(`[browser-smoke] event handler ${message.method} failed:`, error);
          });
        }
      }
    });
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set());
    this.handlers.get(method).add(handler);
    return () => this.handlers.get(method)?.delete(handler);
  }

  send(method, params = {}) {
    invariant(this.ws?.readyState === WebSocket.OPEN, `CDP websocket is not open for ${method}`);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (!this.ws) return;
    for (const { reject, method } of this.pending.values()) {
      reject(new Error(`CDP closed while waiting for ${method}`));
    }
    this.pending.clear();
    await new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) return resolve();
      this.ws.once('close', resolve);
      this.ws.close();
      setTimeout(resolve, 500).unref();
    });
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed: ${result.exceptionDetails.text ?? 'unknown exception'}`);
  }
  return result.result?.value;
}

async function waitForExpression(cdp, expression, label, timeoutMs = ROUTE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(cdp, `Boolean(${expression})`)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }

  let body = '';
  try {
    body = await evaluate(cdp, 'document.body?.innerText?.slice(0, 1200) ?? ""');
  } catch {
    // best-effort diagnostics only
  }
  throw new Error(`Timed out waiting for ${label}.${lastError ? ` ${lastError.message}` : ''}\nDOM excerpt:\n${body}`);
}

function bodyIncludes(text) {
  const normalized = String(text).toLocaleLowerCase();
  return `document.body?.innerText?.toLocaleLowerCase().includes(${JSON.stringify(normalized)})`;
}

async function navigateAndAssert(cdp, pathName, expectedText, report) {
  const startedAt = Date.now();
  await cdp.send('Page.navigate', { url: new URL(pathName, BASE_URL).toString() });
  await waitForExpression(
    cdp,
    `document.readyState !== 'loading' && ${bodyIncludes(expectedText)}`,
    `${pathName} to render ${JSON.stringify(expectedText)}`,
  );
  const elapsedMs = Date.now() - startedAt;
  report.routes.push({ path: pathName, expectedText, elapsedMs });
  return elapsedMs;
}

/**
 * Chrome's Fetch.urlPattern glob semantics have changed subtly across releases.
 * Intercept every request, then decide in JavaScript what to pause/fulfill. This
 * keeps the certification deterministic across runner Chrome versions while
 * continuing non-target traffic immediately.
 */
async function enableRequestInterceptor(cdp, handler) {
  const handlerErrors = [];
  const stop = cdp.on('Fetch.requestPaused', async (event) => {
    try {
      const handled = await handler(event);
      if (!handled) {
        await cdp.send('Fetch.continueRequest', { requestId: event.requestId });
      }
    } catch (error) {
      handlerErrors.push(error instanceof Error ? error.message : String(error));
      try {
        await cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' });
      } catch {
        // Request may already have been canceled by navigation.
      }
    }
  });

  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*', requestStage: 'Request' }],
  });

  return {
    errors: handlerErrors,
    async disable() {
      stop();
      await cdp.send('Fetch.disable');
    },
  };
}

function buildRecordsPayload(count = 500) {
  const careers = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      managerId: `manager-${number}`,
      displayName: `Smoke Manager ${String(number).padStart(3, '0')}`,
      seasons: 3,
      championships: number % 23 === 0 ? 1 : 0,
      finals: number % 17 === 0 ? 1 : 0,
      playoffAppearances: number % 4,
      regularSeasonTitles: number % 29 === 0 ? 1 : 0,
      pointsTitles: number % 31 === 0 ? 1 : 0,
      wins: 18 + (number % 14),
      losses: 14 + (number % 11),
      ties: 0,
      winPct: 0.4 + ((number % 20) / 100),
      pointsFor: 4200 + number * 3.25,
      pointsAgainst: 4100 + number * 2.9,
      bestWeeklyScore: 132 + (number % 70) * 0.5,
      longestWinStreak: 2 + (number % 8),
      currentWinStreak: number % 5,
    };
  });

  return {
    success: true,
    generatedAt: '2026-09-07T23:30:00.000Z',
    currentLeagueId: 'browser-smoke',
    leagueName: 'Browser Smoke League',
    managers: careers.map((career) => ({
      userId: career.managerId,
      displayName: career.displayName,
      seasons: ['2024', '2025', '2026'],
    })),
    careers,
    records: [
      {
        recordId: 'career-wins',
        label: 'Career wins',
        scope: 'league_series',
        scoringEraId: null,
        value: careers[0].wins,
        unit: 'games',
        managerId: careers[0].managerId,
        displayName: careers[0].displayName,
        opponentManagerId: null,
        season: null,
        week: null,
        leagueId: 'browser-smoke',
        matchupId: null,
        provenance: { definition: 'Browser-smoke factual career count.', source: 'sleeper' },
      },
    ],
    rivalries: [],
    achievements: [],
    almanac: [],
    recordWatch: [],
    scoringEras: [
      { id: 'era-2026', fingerprint: 'browser-smoke-v1', seasons: ['2026'], isCurrent: true },
    ],
    coverage: {
      complete: true,
      seasonsRequested: 3,
      seasonsLoaded: 3,
      diagnostics: [],
    },
  };
}

async function main() {
  const report = {
    baseUrl: BASE_URL,
    routes: [],
    resilience: {},
    performance: {},
    browserErrors: [],
  };

  const chromePath = chromeBinary();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiber-browser-smoke-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let chromeStderr = '';
  chrome.stderr.on('data', (chunk) => { chromeStderr += String(chunk); });

  let cdp;
  try {
    await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const page = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' }).then(async (response) => {
      invariant(response.ok, `Chrome target creation failed with HTTP ${response.status}`);
      return response.json();
    });
    invariant(page.webSocketDebuggerUrl, 'Chrome did not return a page debugger websocket URL.');

    cdp = new CdpClient(page.webSocketDebuggerUrl);
    await cdp.connect();
    await Promise.all([
      cdp.send('Page.enable'),
      cdp.send('Runtime.enable'),
      cdp.send('Network.enable'),
    ]);

    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (() => {
          const errors = [];
          Object.defineProperty(window, '__tiberBrowserSmokeErrors', { value: errors, configurable: false });
          window.addEventListener('error', (event) => {
            errors.push({ type: 'error', message: String(event.message || 'window error') });
          });
          window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
            errors.push({ type: 'unhandledrejection', message: reason });
          });
        })();
      `,
    });

    cdp.on('Runtime.exceptionThrown', (event) => {
      const description = event.exceptionDetails?.exception?.description
        ?? event.exceptionDetails?.text
        ?? 'uncaught browser exception';
      report.browserErrors.push({ type: 'Runtime.exceptionThrown', description });
    });

    // Core release routes: assert the built SPA renders unique semantic page copy,
    // not CSS-transformed presentation labels.
    await navigateAndAssert(cdp, '/command-center', 'Home / What Changed', report);
    await navigateAndAssert(cdp, '/command-center/weekly', 'INSUFFICIENT EVIDENCE', report);
    await navigateAndAssert(cdp, '/command-center/waivers', 'UNSUPPORTED DOMAIN', report);
    await navigateAndAssert(cdp, '/command-center/trades', 'UNSUPPORTED DOMAIN', report);
    await navigateAndAssert(cdp, '/draft-review', 'Let TIBER read the team you actually drafted.', report);
    await navigateAndAssert(cdp, '/records', 'A reconstructable record book built from Sleeper league history.', report);

    // Resilience: deliberately leave Management data reads pending, then prove SPA navigation is still responsive.
    const hungRequestIds = new Set();
    const managementNeedles = [
      '/api/league-context',
      '/api/league-sync',
      '/api/league-dashboard',
      '/api/management',
      '/api/data-lab/team-environment-movement',
    ];
    const managementInterceptor = await enableRequestInterceptor(cdp, async (event) => {
      const requestUrl = event.request?.url ?? '';
      if (!managementNeedles.some((needle) => requestUrl.includes(needle))) return false;
      hungRequestIds.add(event.requestId);
      // Intentionally do not continue the request until after the navigation proof.
      return true;
    });

    await navigateAndAssert(cdp, '/management', 'Connect your team, inspect signals, then research your next move.', report);
    const requestDeadline = Date.now() + 3_000;
    while (hungRequestIds.size === 0 && Date.now() < requestDeadline) await sleep(50);
    invariant(hungRequestIds.size > 0, 'Management resilience probe did not capture any governed data request to hold pending.');

    const spaStartedAt = Date.now();
    const clickedCommandCenter = await evaluate(cdp, `(() => {
      const link = Array.from(document.querySelectorAll('a')).find((node) =>
        node.getAttribute('href') === '/command-center' && node.textContent?.includes('Command Center')
      );
      if (!link) return false;
      link.click();
      return true;
    })()`);
    invariant(clickedCommandCenter, 'Could not find the Command Center SPA navigation link from Management.');
    await waitForExpression(
      cdp,
      `location.pathname === '/command-center' && ${bodyIncludes('Home / What Changed')}`,
      'SPA navigation away from pending Management requests',
    );
    const spaNavigationMs = Date.now() - spaStartedAt;
    report.resilience.pendingManagementRequests = hungRequestIds.size;
    report.resilience.spaNavigationMs = spaNavigationMs;
    report.resilience.spaNavigationBudgetMs = SPA_NAV_BUDGET_MS;
    invariant(
      spaNavigationMs <= SPA_NAV_BUDGET_MS,
      `SPA navigation took ${spaNavigationMs}ms with pending Management requests; budget is ${SPA_NAV_BUDGET_MS}ms.`,
    );

    for (const requestId of [...hungRequestIds]) {
      try {
        await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' });
      } catch {
        // Navigation may already have canceled a paused request.
      }
    }
    await managementInterceptor.disable();
    invariant(
      managementInterceptor.errors.length === 0,
      `Management request interception failed: ${managementInterceptor.errors.join('; ')}`,
    );

    // Performance: feed Records a deterministic 500-manager historical payload and exercise the all-manager table.
    const recordsPayload = JSON.stringify(buildRecordsPayload(500));
    const recordsInterceptor = await enableRequestInterceptor(cdp, async (event) => {
      const requestUrl = event.request?.url ?? '';
      if (!requestUrl.includes('/api/league-records')) return false;
      await cdp.send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json; charset=utf-8' },
          { name: 'Cache-Control', value: 'no-store' },
        ],
        body: Buffer.from(recordsPayload, 'utf8').toString('base64'),
      });
      return true;
    });

    await evaluate(cdp, `localStorage.setItem('tiber.records.leagueId', 'browser-smoke')`);
    await navigateAndAssert(cdp, '/records', 'Browser Smoke League', report);

    const renderStartedAt = Date.now();
    const clickedManagers = await evaluate(cdp, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === 'Managers');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    invariant(clickedManagers, 'Records Managers tab button was not found.');
    await waitForExpression(cdp, "document.querySelectorAll('tbody tr').length === 500", '500 Records manager rows');
    const largeListRenderMs = Date.now() - renderStartedAt;
    report.performance.largeListRows = 500;
    report.performance.largeListRenderMs = largeListRenderMs;
    report.performance.largeListRenderBudgetMs = LARGE_LIST_RENDER_BUDGET_MS;
    invariant(
      largeListRenderMs <= LARGE_LIST_RENDER_BUDGET_MS,
      `500-row Records render took ${largeListRenderMs}ms; budget is ${LARGE_LIST_RENDER_BUDGET_MS}ms.`,
    );

    const interactionStartedAt = Date.now();
    const clickedLastRow = await evaluate(cdp, `(() => {
      const rows = document.querySelectorAll('tbody tr');
      const row = rows[rows.length - 1];
      if (!row) return false;
      row.click();
      return true;
    })()`);
    invariant(clickedLastRow, 'Could not click the last row in the 500-row Records table.');
    await waitForExpression(cdp, bodyIncludes('Smoke Manager 500'), 'large-list row interaction');
    const rowInteractionMs = Date.now() - interactionStartedAt;
    report.performance.largeListInteractionMs = rowInteractionMs;
    report.performance.largeListInteractionBudgetMs = LARGE_LIST_INTERACTION_BUDGET_MS;
    invariant(
      rowInteractionMs <= LARGE_LIST_INTERACTION_BUDGET_MS,
      `500-row Records interaction took ${rowInteractionMs}ms; budget is ${LARGE_LIST_INTERACTION_BUDGET_MS}ms.`,
    );

    await recordsInterceptor.disable();
    invariant(
      recordsInterceptor.errors.length === 0,
      `Records request interception failed: ${recordsInterceptor.errors.join('; ')}`,
    );

    const pageErrors = await evaluate(cdp, 'window.__tiberBrowserSmokeErrors ?? []');
    report.browserErrors.push(...(Array.isArray(pageErrors) ? pageErrors : []));
    invariant(report.browserErrors.length === 0, `Browser smoke captured ${report.browserErrors.length} uncaught error(s).`);

    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      report,
      chromeStderr: chromeStderr.slice(-4_000),
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (cdp) await cdp.close().catch(() => {});
    chrome.kill('SIGTERM');
    await sleep(150);
    if (!chrome.killed) chrome.kill('SIGKILL');
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

await main();

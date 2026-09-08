#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import WebSocket from 'ws';

const BASE_URL = process.env.TIBER_MOBILE_BASE_URL ?? 'http://127.0.0.1:5000';
const DEBUG_PORT = Number(process.env.TIBER_MOBILE_DEBUG_PORT ?? 9224);
const TIMEOUT_MS = Number(process.env.TIBER_MOBILE_ROUTE_TIMEOUT_MS ?? 12_000);
const WIDTHS = [375, 390, 430];
const ROUTES = [
  ['/command-center', 'Home / What Changed'],
  ['/command-center/weekly', 'No recommendation is being issued.'],
  ['/command-center/waivers', 'This decision engine is intentionally unavailable in v1.'],
  ['/command-center/trades', 'This decision engine is intentionally unavailable in v1.'],
  ['/management', 'Connect your team, inspect signals, then research your next move.'],
  ['/draft-review', 'Let TIBER read the team you actually drafted.'],
  ['/records', 'A reconstructable record book built from Sleeper league history.'],
];

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
  throw new Error('Chrome/Chromium was not found.');
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
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
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
          Promise.resolve(handler(message.params ?? {})).catch(() => {});
        }
      }
    });
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set());
    this.handlers.get(method).add(handler);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => {
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
  return result.result?.value;
}

function bodyHas(text) {
  return `document.body?.innerText?.toLowerCase().includes(${JSON.stringify(String(text).toLowerCase())})`;
}

async function waitFor(cdp, expression, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, `Boolean(${expression})`).catch(() => false)) return;
    await sleep(100);
  }
  const excerpt = await evaluate(cdp, 'document.body?.innerText?.slice(0, 1200) ?? ""').catch(() => '');
  throw new Error(`Timed out waiting for ${label}\nDOM excerpt:\n${excerpt}`);
}

async function setIphoneViewport(cdp, width) {
  const height = width === 375 ? 812 : width === 390 ? 844 : 932;
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    screenWidth: width,
    screenHeight: height,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  return height;
}

async function navigate(cdp, pathname, anchor) {
  await cdp.send('Page.navigate', { url: new URL(pathname, BASE_URL).toString() });
  await waitFor(cdp, `document.readyState !== 'loading' && ${bodyHas(anchor)}`, `${pathname} to render ${anchor}`);
}

async function certifyStaticPwaContract() {
  const [manifestResponse, swResponse, htmlResponse, touchIcon] = await Promise.all([
    fetch(new URL('/manifest.json', BASE_URL)),
    fetch(new URL('/sw.js', BASE_URL)),
    fetch(BASE_URL),
    fetch(new URL('/icons/icon-180x180.png', BASE_URL)),
  ]);
  invariant(manifestResponse.ok, `manifest.json returned ${manifestResponse.status}`);
  invariant(swResponse.ok, `sw.js returned ${swResponse.status}`);
  invariant(htmlResponse.ok, `root document returned ${htmlResponse.status}`);
  invariant(touchIcon.ok, `Apple touch icon returned ${touchIcon.status}`);

  const manifest = await manifestResponse.json();
  const sw = await swResponse.text();
  const html = await htmlResponse.text();

  invariant(manifest.display === 'standalone', `manifest display is ${manifest.display}`);
  invariant(manifest.start_url === '/' && manifest.scope === '/', 'manifest start_url/scope must both be root');
  invariant(manifest.icons?.some((icon) => icon.sizes === '192x192'), 'manifest is missing 192x192 icon');
  invariant(manifest.icons?.some((icon) => icon.sizes === '512x512'), 'manifest is missing 512x512 icon');
  invariant(html.includes('viewport-fit=cover'), 'viewport-fit=cover is missing');
  invariant(html.includes('apple-mobile-web-app-capable'), 'Apple standalone metadata is missing');
  invariant(html.includes("navigator.serviceWorker.register('/sw.js')"), 'root service-worker registration is missing');

  const apiMarker = "url.pathname.toLowerCase().startsWith('/api/')";
  const apiStart = sw.indexOf(apiMarker);
  const documentStart = sw.indexOf("if (request.destination === 'document')", apiStart);
  invariant(apiStart >= 0 && documentStart > apiStart, 'service worker API bypass branch is missing');
  const apiBranch = sw.slice(apiStart, documentStart);
  invariant(apiBranch.includes('return;'), 'service worker API branch must return without interception');
  invariant(!apiBranch.includes('respondWith'), 'service worker must not call respondWith for API traffic');
  invariant(!apiBranch.includes('cache.put'), 'service worker must not cache API traffic');
  invariant(sw.includes('self.skipWaiting()') && sw.includes('self.clients.claim()'), 'service-worker update lifecycle is incomplete');
  invariant(sw.includes('caches.delete(name)'), 'service worker does not delete old cache versions');

  return { display: manifest.display, startUrl: manifest.start_url, scope: manifest.scope, apiPolicy: 'service_worker_bypass' };
}

async function certifyRouteGeometry(cdp, width, route) {
  const geometry = await evaluate(cdp, `(() => {
    const root = document.documentElement;
    const body = document.body;
    const button = document.querySelector('button[aria-label="Open navigation"]');
    const rect = button?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      pageScrollWidth: Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0),
      hamburger: rect ? { width: rect.width, height: rect.height, left: rect.left, right: rect.right } : null,
    };
  })()`);
  invariant(geometry.viewportWidth === width, `${route}: expected ${width}px viewport, got ${geometry.viewportWidth}px`);
  invariant(geometry.pageScrollWidth <= width + 1, `${route}: page overflow ${geometry.pageScrollWidth}px at ${width}px viewport`);
  invariant(geometry.hamburger, `${route}: hamburger is missing`);
  invariant(geometry.hamburger.width >= 44 && geometry.hamburger.height >= 44, `${route}: hamburger is smaller than 44x44`);
  invariant(geometry.hamburger.left >= 0 && geometry.hamburger.right <= width + 1, `${route}: hamburger is outside viewport`);
  return geometry;
}

async function certifyDrawer(cdp) {
  const opened = await evaluate(cdp, `(() => {
    const button = document.querySelector('button[aria-label="Open navigation"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  invariant(opened, 'Could not open mobile navigation drawer');
  await waitFor(cdp, `(() => {
    const drawer = document.querySelector('.tiber-sidebar-mobile.open');
    const button = document.querySelector('button[aria-label="Close navigation"]');
    if (!drawer || !button) return false;
    const rect = button.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth + 1 && rect.top >= 0;
  })()`, 'drawer transition to settle inside viewport');
  const geometry = await evaluate(cdp, `(() => {
    const button = document.querySelector('button[aria-label="Close navigation"]');
    const rect = button?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height, left: rect.left, right: rect.right, top: rect.top, viewportWidth: window.innerWidth } : null;
  })()`);
  invariant(geometry?.width >= 44 && geometry?.height >= 44, 'drawer close target is smaller than 44x44');
  invariant(geometry.left >= 0 && geometry.right <= geometry.viewportWidth + 1, 'drawer close target is outside viewport');
  await evaluate(cdp, `document.querySelector('button[aria-label="Close navigation"]')?.click()`);
  await waitFor(cdp, `!document.querySelector('.tiber-sidebar-mobile.open')`, 'drawer to close');
  return geometry;
}

async function certifyFocus(cdp) {
  await navigate(cdp, '/records', 'A reconstructable record book built from Sleeper league history.');
  const focus = await evaluate(cdp, `(() => {
    const input = document.querySelector('#records-league-id');
    if (!(input instanceof HTMLInputElement)) return null;
    input.focus();
    input.scrollIntoView({ block: 'center' });
    const rect = input.getBoundingClientRect();
    return {
      active: document.activeElement === input,
      fontSize: parseFloat(getComputedStyle(input).fontSize),
      width: rect.width,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      visualHeight: window.visualViewport?.height ?? window.innerHeight,
    };
  })()`);
  invariant(focus?.active, 'Records league input could not receive focus');
  invariant(focus.fontSize >= 16, `Focused input font size is ${focus.fontSize}px; expected >=16px`);
  invariant(focus.height >= 44, `Focused input height is ${focus.height}px; expected >=44px`);
  invariant(focus.left >= 0 && focus.right <= focus.viewportWidth + 1, 'Focused input is horizontally outside viewport');
  invariant(focus.top >= 0 && focus.bottom <= focus.visualHeight + 1, 'Focused input could not be scrolled into visible viewport');
  return focus;
}

async function ensureServiceWorker(cdp) {
  await navigate(cdp, '/command-center', 'Home / What Changed');
  await waitFor(cdp, 'navigator.serviceWorker && navigator.serviceWorker.ready', 'service-worker readiness');
  let state = await evaluate(cdp, `(async () => ({
    controlled: Boolean(navigator.serviceWorker.controller),
    scope: (await navigator.serviceWorker.ready).scope,
  }))()`);
  if (!state.controlled) {
    await cdp.send('Page.reload', { ignoreCache: false });
    await waitFor(cdp, 'navigator.serviceWorker?.controller', 'service-worker controller after reload');
    state = await evaluate(cdp, `(async () => ({
      controlled: Boolean(navigator.serviceWorker.controller),
      scope: (await navigator.serviceWorker.ready).scope,
    }))()`);
  }
  invariant(state.controlled, 'Page is not controlled by the service worker');
  invariant(state.scope.endsWith('/'), `Unexpected service-worker scope ${state.scope}`);
  return state;
}

async function certifyServiceWorkerPrivacy(cdp) {
  const healthStatus = await evaluate(cdp, `fetch('/api/health?gate4_online_probe=1', { cache: 'no-store' }).then((response) => response.status)`);
  invariant(healthStatus === 200, `online API probe returned ${healthStatus}`);
  const urls = await evaluate(cdp, `(async () => {
    const out = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) out.push(request.url);
    }
    return out;
  })()`);
  const apiUrls = urls.filter((url) => new URL(url).pathname.toLowerCase().startsWith('/api/'));
  invariant(apiUrls.length === 0, `CacheStorage contains API URLs: ${apiUrls.join(', ')}`);
  return { onlineApiStatus: healthStatus, cacheEntries: urls.length, apiEntries: 0 };
}

async function certifyLifecycle(cdp) {
  await navigate(cdp, '/command-center', 'Home / What Changed');
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await sleep(200);
  await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  await waitFor(cdp, bodyHas('Home / What Changed'), 'foreground recovery');
  const clicked = await evaluate(cdp, `(() => {
    const link = [...document.querySelectorAll('a')].find((node) => node.getAttribute('href') === '/command-center/weekly');
    if (!link) return false;
    link.click();
    return true;
  })()`);
  invariant(clicked, 'Weekly Decisions link was not interactive after foreground recovery');
  await waitFor(cdp, `location.pathname === '/command-center/weekly' && ${bodyHas('No recommendation is being issued.')}`, 'post-foreground route');
  return { recovered: true };
}

async function certifyTextZoom(cdp) {
  await navigate(cdp, '/command-center', 'Home / What Changed');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await sleep(100);
  const visible = await evaluate(cdp, `Boolean(document.querySelector('button[aria-label="Open navigation"]')) && ${bodyHas('Home / What Changed')}`);
  invariant(visible, 'Core controls disappeared at 200% page scale');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  return { pageScaleFactor: 2, coreControlsVisible: true };
}

async function certifyOfflineFailClosed(cdp) {
  await navigate(cdp, '/command-center/weekly', 'No recommendation is being issued.');
  await sleep(150);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });

  const apiResult = await evaluate(cdp, `fetch('/api/health?gate4_offline_probe=1', { cache: 'no-store' }).then(
    (response) => ({ kind: 'resolved', status: response.status }),
    () => ({ kind: 'rejected', status: null }),
  )`);
  invariant(apiResult.kind === 'rejected', `offline API unexpectedly resolved with status ${apiResult.status}`);

  await cdp.send('Page.navigate', { url: new URL('/command-center/weekly', BASE_URL).toString() });
  await waitFor(
    cdp,
    `${bodyHas('No recommendation is being issued.')} || ${bodyHas('Let TIBER read the team you actually drafted.')}`,
    'offline shell to reopen in a fail-closed state',
  );

  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  return { api: 'rejected', shell: 'fail_closed' };
}

async function main() {
  const report = {
    pwa: await certifyStaticPwaContract(),
    widths: [],
    drawer: null,
    focus: null,
    serviceWorker: null,
    lifecycle: null,
    textZoom: null,
    offline: null,
    browserErrors: [],
  };

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiber-mobile-certify-'));
  const chrome = spawn(chromeBinary(), [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--no-first-run',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let chromeStderr = '';
  chrome.stderr.on('data', (chunk) => { chromeStderr += String(chunk); });
  let cdp;

  try {
    await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const page = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json());
    invariant(page.webSocketDebuggerUrl, 'Chrome target did not expose a debugger URL');

    cdp = new CdpClient(page.webSocketDebuggerUrl);
    await cdp.connect();
    await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable')]);
    cdp.on('Runtime.exceptionThrown', (event) => {
      report.browserErrors.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? 'runtime exception');
    });

    for (const width of WIDTHS) {
      const height = await setIphoneViewport(cdp, width);
      const routes = [];
      for (const [route, anchor] of ROUTES) {
        await navigate(cdp, route, anchor);
        routes.push({ route, geometry: await certifyRouteGeometry(cdp, width, route) });
      }
      report.widths.push({ width, height, routes });
    }

    await setIphoneViewport(cdp, 390);
    await navigate(cdp, '/command-center', 'Home / What Changed');
    report.drawer = await certifyDrawer(cdp);
    report.focus = await certifyFocus(cdp);
    report.serviceWorker = {
      ...(await ensureServiceWorker(cdp)),
      ...(await certifyServiceWorkerPrivacy(cdp)),
    };
    report.lifecycle = await certifyLifecycle(cdp);
    report.textZoom = await certifyTextZoom(cdp);
    report.offline = await certifyOfflineFailClosed(cdp);

    invariant(report.browserErrors.length === 0, `Mobile certification captured browser errors: ${report.browserErrors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      report,
      chromeStderr: chromeStderr.slice(-4000),
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (cdp) await cdp.close().catch(() => {});
    chrome.kill('SIGTERM');
    await sleep(100);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

await main();

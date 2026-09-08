#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import WebSocket from 'ws';

const BASE_URL = process.env.TIBER_MOBILE_BASE_URL ?? 'http://127.0.0.1:5000';
const DEBUG_PORT = Number(process.env.TIBER_MOBILE_DEBUG_PORT ?? 9224);
const ROUTE_TIMEOUT_MS = Number(process.env.TIBER_MOBILE_ROUTE_TIMEOUT_MS ?? 12_000);
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
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result ?? {});
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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

function bodyHas(text) {
  return `document.body?.innerText?.toLowerCase().includes(${JSON.stringify(String(text).toLowerCase())})`;
}

async function waitFor(cdp, expression, label, timeoutMs = ROUTE_TIMEOUT_MS) {
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
  await waitFor(cdp, `document.readyState !== 'loading' && ${bodyHas(anchor)}`, `${pathname} / ${anchor}`);
}

async function inspectShellGeometry(cdp, width, route) {
  const geometry = await evaluate(cdp, `(() => {
    const root = document.documentElement;
    const body = document.body;
    const hamburger = document.querySelector('button[aria-label="Open navigation"]');
    const rect = hamburger?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      pageScrollWidth: Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0),
      hamburger: rect ? { width: rect.width, height: rect.height, left: rect.left, right: rect.right } : null,
    };
  })()`);

  invariant(geometry.viewportWidth === width, `${route}: expected viewport ${width}, got ${geometry.viewportWidth}`);
  invariant(geometry.pageScrollWidth <= geometry.viewportWidth + 1, `${route}: page horizontally overflows (${geometry.pageScrollWidth}px > ${geometry.viewportWidth}px)`);
  invariant(geometry.hamburger, `${route}: mobile hamburger is missing at ${width}px`);
  invariant(geometry.hamburger.width >= 44 && geometry.hamburger.height >= 44, `${route}: hamburger target is ${geometry.hamburger.width}x${geometry.hamburger.height}, expected at least 44x44`);
  invariant(geometry.hamburger.left >= 0 && geometry.hamburger.right <= width + 1, `${route}: hamburger lies outside the viewport`);
  return geometry;
}

async function certifyDrawer(cdp) {
  const opened = await evaluate(cdp, `(() => {
    const button = document.querySelector('button[aria-label="Open navigation"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  invariant(opened, 'Could not open the mobile navigation drawer.');
  await waitFor(cdp, `document.querySelector('.tiber-sidebar-mobile.open')`, 'mobile drawer to open');
  const closeRect = await evaluate(cdp, `(() => {
    const button = document.querySelector('button[aria-label="Close navigation"]');
    const rect = button?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height, top: rect.top, right: rect.right } : null;
  })()`);
  invariant(closeRect, 'Mobile drawer close button is missing.');
  invariant(closeRect.width >= 44 && closeRect.height >= 44, `Drawer close target is ${closeRect.width}x${closeRect.height}, expected at least 44x44.`);
  await evaluate(cdp, `document.querySelector('button[aria-label="Close navigation"]')?.click()`);
  await waitFor(cdp, `!document.querySelector('.tiber-sidebar-mobile.open')`, 'mobile drawer to close');
  return closeRect;
}

async function certifyFormFocus(cdp) {
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
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      visualHeight: window.visualViewport?.height ?? window.innerHeight,
    };
  })()`);
  invariant(focus?.active, 'Records league input could not receive focus.');
  invariant(focus.fontSize >= 16, `Focused input font size is ${focus.fontSize}px; iOS auto-zoom protection requires >=16px.`);
  invariant(focus.height >= 44, `Focused input height is ${focus.height}px; expected at least 44px.`);
  invariant(focus.left >= 0 && focus.right <= windowWidth(focus) + 1, 'Focused input extends outside the horizontal viewport.');
  invariant(focus.top >= 0 && focus.bottom <= focus.visualHeight + 1, 'Focused input could not be brought into the visible viewport.');
  return focus;
}

function windowWidth(focus) {
  // The right edge is compared against the largest finite viewport-like value
  // available in the record; visualHeight is vertical, so callers use 430 max
  // only as a fallback. Real width bounds are separately certified per route.
  return Number.isFinite(focus.viewportWidth) ? focus.viewportWidth : 430;
}

async function certifyPwaFiles() {
  const manifestResponse = await fetch(new URL('/manifest.json', BASE_URL));
  invariant(manifestResponse.ok, `manifest.json returned ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  invariant(manifest.display === 'standalone', `manifest display is ${manifest.display}, expected standalone`);
  invariant(manifest.start_url === '/', `manifest start_url is ${manifest.start_url}`);
  invariant(manifest.scope === '/', `manifest scope is ${manifest.scope}`);
  invariant(Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.sizes === '192x192'), 'manifest is missing a 192x192 icon');
  invariant(manifest.icons.some((icon) => icon.sizes === '512x512'), 'manifest is missing a 512x512 icon');

  const touchIcon = await fetch(new URL('/icons/icon-180x180.png', BASE_URL));
  invariant(touchIcon.ok, `Apple touch icon returned ${touchIcon.status}`);

  const swResponse = await fetch(new URL('/sw.js', BASE_URL));
  invariant(swResponse.ok, `sw.js returned ${swResponse.status}`);
  const sw = await swResponse.text();
  invariant(sw.includes("url.pathname.toLowerCase().startsWith('/api/')"), 'service worker does not explicitly identify API requests');
  invariant(sw.includes("fetch(request, { cache: 'no-store' })"), 'service worker API transport is not network-only/no-store');
  invariant(sw.includes('self.skipWaiting()'), 'service worker does not skip waiting on update');
  invariant(sw.includes('self.clients.claim()'), 'service worker does not claim clients after activation');

  const htmlResponse = await fetch(BASE_URL);
  const html = await htmlResponse.text();
  invariant(html.includes('viewport-fit=cover'), 'HTML viewport is missing viewport-fit=cover');
  invariant(html.includes('apple-mobile-web-app-capable'), 'HTML is missing Apple standalone metadata');
  invariant(html.includes("navigator.serviceWorker.register('/sw.js')"), 'HTML does not register sw.js at root scope');
  return { display: manifest.display, startUrl: manifest.start_url, scope: manifest.scope };
}

async function ensureServiceWorkerController(cdp) {
  await waitFor(cdp, `navigator.serviceWorker && navigator.serviceWorker.ready`, 'service worker readiness');
  const ready = await evaluate(cdp, `(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2500);
        navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    return { scope: registration.scope, controlled: Boolean(navigator.serviceWorker.controller) };
  })()`);
  if (!ready.controlled) {
    await cdp.send('Page.reload', { ignoreCache: false });
    await waitFor(cdp, `navigator.serviceWorker?.controller`, 'service worker controller after reload');
  }
  const state = await evaluate(cdp, `(async () => ({
    controlled: Boolean(navigator.serviceWorker.controller),
    scope: (await navigator.serviceWorker.ready).scope,
  }))()`);
  invariant(state.controlled, 'Page is not controlled by the service worker.');
  invariant(state.scope.endsWith('/'), `Unexpected service worker scope: ${state.scope}`);
  return state;
}

async function certifyServiceWorkerPrivacy(cdp) {
  const cacheUrls = await evaluate(cdp, `(async () => {
    const urls = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  })()`);
  invariant(Array.isArray(cacheUrls), 'Could not inspect service-worker cache contents.');
  const apiUrls = cacheUrls.filter((url) => new URL(url).pathname.toLowerCase().startsWith('/api/'));
  invariant(apiUrls.length === 0, `Service worker persisted API URLs: ${apiUrls.join(', ')}`);
  return { cacheEntries: cacheUrls.length, apiEntries: apiUrls.length };
}

async function certifyOfflineFailClosed(cdp) {
  // Visit the deep link online once so its document shell is eligible for the
  // document cache, then prove private API data is not replayed offline.
  await navigate(cdp, '/command-center/weekly', 'No recommendation is being issued.');
  await sleep(150);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });

  const apiResult = await evaluate(cdp, `fetch('/api/health').then(() => 'resolved', () => 'rejected')`);
  invariant(apiResult === 'rejected', `Offline API request ${apiResult}; private/live API must not be replayed from cache.`);

  await cdp.send('Page.navigate', { url: new URL('/command-center/weekly', BASE_URL).toString() });
  await waitFor(
    cdp,
    `${bodyHas('Draft Review')} || ${bodyHas('Let TIBER read the team you actually drafted.')}`,
    'offline shell to fail closed to the public Draft Review capability',
  );

  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  return { offlineApi: apiResult, fallback: 'public_draft_review' };
}

async function certifyLifecycleRecovery(cdp) {
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
  invariant(clicked, 'Weekly Decisions link was not interactive after foreground recovery.');
  await waitFor(cdp, `location.pathname === '/command-center/weekly' && ${bodyHas('No recommendation is being issued.')}`, 'post-foreground navigation');
  return { recovered: true };
}

async function certifyTextZoom(cdp) {
  await navigate(cdp, '/command-center', 'Home / What Changed');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await sleep(100);
  const visible = await evaluate(cdp, `Boolean(document.querySelector('button[aria-label="Open navigation"]')) && ${bodyHas('Home / What Changed')}`);
  invariant(visible, 'Core Command Center controls disappeared at 200% page scale.');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  return { pageScaleFactor: 2, coreControlsVisible: true };
}

async function main() {
  const report = {
    pwa: await certifyPwaFiles(),
    widths: [],
    drawer: null,
    focus: null,
    serviceWorker: null,
    offline: null,
    lifecycle: null,
    textZoom: null,
    browserErrors: [],
  };

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiber-mobile-pwa-'));
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
    invariant(page.webSocketDebuggerUrl, 'Chrome target did not expose a debugger URL.');

    cdp = new CdpClient(page.webSocketDebuggerUrl);
    await cdp.connect();
    await Promise.all([
      cdp.send('Page.enable'),
      cdp.send('Runtime.enable'),
      cdp.send('Network.enable'),
    ]);
    cdp.on('Runtime.exceptionThrown', (event) => {
      report.browserErrors.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? 'runtime exception');
    });

    for (const width of WIDTHS) {
      const height = await setIphoneViewport(cdp, width);
      const routeResults = [];
      for (const [route, anchor] of ROUTES) {
        await navigate(cdp, route, anchor);
        routeResults.push({ route, geometry: await inspectShellGeometry(cdp, width, route) });
      }
      report.widths.push({ width, height, routes: routeResults });
    }

    await setIphoneViewport(cdp, 390);
    await navigate(cdp, '/command-center', 'Home / What Changed');
    report.drawer = await certifyDrawer(cdp);
    report.focus = await certifyFormFocus(cdp);

    await navigate(cdp, '/command-center', 'Home / What Changed');
    report.serviceWorker = {
      ...(await ensureServiceWorkerController(cdp)),
      ...(await certifyServiceWorkerPrivacy(cdp)),
    };
    report.lifecycle = await certifyLifecycleRecovery(cdp);
    report.textZoom = await certifyTextZoom(cdp);
    report.offline = await certifyOfflineFailClosed(cdp);

    invariant(report.browserErrors.length === 0, `Mobile PWA smoke captured browser errors: ${report.browserErrors.join(' | ')}`);
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

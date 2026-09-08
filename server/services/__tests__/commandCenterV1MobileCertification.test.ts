import fs from 'node:fs';
import path from 'node:path';
import {
  COMMAND_CENTER_V1_GATE4_CAPABILITIES,
  COMMAND_CENTER_V1_GATE4_REQUIRED_IDS,
  COMMAND_CENTER_V1_MOBILE_SURFACES,
  isCommandCenterV1Gate4Complete,
} from '../../../shared/commandCenterV1MobileCertification';

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('Command Center v1 Gate 4 personal iPhone/PWA certification', () => {
  test('requires every mobile capability and leaves no blocked v1 surface', () => {
    expect(new Set(COMMAND_CENTER_V1_GATE4_REQUIRED_IDS).size).toBe(COMMAND_CENTER_V1_GATE4_REQUIRED_IDS.length);
    expect(Object.keys(COMMAND_CENTER_V1_GATE4_CAPABILITIES).sort()).toEqual([...COMMAND_CENTER_V1_GATE4_REQUIRED_IDS].sort());
    expect(isCommandCenterV1Gate4Complete()).toBe(true);
    for (const id of COMMAND_CENTER_V1_GATE4_REQUIRED_IDS) {
      expect(COMMAND_CENTER_V1_GATE4_CAPABILITIES[id].status).toBe('certified');
    }
    expect(Object.values(COMMAND_CENTER_V1_MOBILE_SURFACES).some((surface) => surface.status === 'blocked')).toBe(false);
  });

  test('preserves the iOS installability and standalone metadata contract', () => {
    const html = readRepoFile('client/index.html');
    const manifest = JSON.parse(readRepoFile('client/public/manifest.json'));
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('user-scalable=yes');
    expect(html).toContain('maximum-scale=5');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('black-translucent');
    expect(html).toContain('/icons/icon-180x180.png');
    expect(html).toContain("navigator.serviceWorker.register('/sw.js')");
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.icons.some((icon: any) => icon.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((icon: any) => icon.sizes === '512x512')).toBe(true);
  });

  test('keeps private/live API data network-only in the service worker', () => {
    const sw = readRepoFile('client/public/sw.js');
    expect(sw).toContain("url.pathname.toLowerCase().startsWith('/api/')");
    expect(sw).toContain('apiNetworkOnly(request)');
    expect(sw).toContain("fetch(request, { cache: 'no-store' })");
    expect(sw).toContain('self.skipWaiting()');
    expect(sw).toContain('self.clients.claim()');
    expect(sw).toContain('caches.delete(name)');
  });

  test('loads safe-area/touch hardening through the shared application entrypoint', () => {
    const main = readRepoFile('client/src/main.tsx');
    const css = readRepoFile('client/src/styles/mobilePwa.css');
    expect(main).toContain('./styles/mobilePwa.css');
    for (const inset of ['safe-area-inset-top', 'safe-area-inset-right', 'safe-area-inset-bottom', 'safe-area-inset-left']) {
      expect(css).toContain(inset);
    }
    expect(css).toContain('min-height: 100dvh');
    expect(css).toContain('min-width: 44px');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('font-size: max(16px, 1em)');
    expect(css).toContain('touch-action: manipulation');
    expect(css).toContain('-webkit-text-size-adjust: 100%');
  });

  test('retains explicit accessible mobile drawer controls and route-close behavior', () => {
    const layout = readRepoFile('client/src/components/TiberLayout.tsx');
    expect(layout).toContain('aria-label="Open navigation"');
    expect(layout).toContain('aria-label="Close navigation"');
    expect(layout).toContain('setMobileOpen(false)');
    expect(layout).toContain('tiber-sidebar-mobile');
  });

  test('mobile PWA browser probe covers all three target widths, offline privacy, lifecycle recovery, and 200 percent scale', () => {
    const smoke = readRepoFile('scripts/command-center-mobile-pwa-smoke.mjs');
    expect(smoke).toContain('const WIDTHS = [375, 390, 430]');
    expect(smoke).toContain("'/command-center/weekly'");
    expect(smoke).toContain("'/management'");
    expect(smoke).toContain("'/draft-review'");
    expect(smoke).toContain("'/records'");
    expect(smoke).toContain("offline: true");
    expect(smoke).toContain("fetch('/api/health')");
    expect(smoke).toContain("Page.setWebLifecycleState");
    expect(smoke).toContain('pageScaleFactor: 2');
    expect(smoke).toContain("startsWith('/api/')");
  });

  test('phone-scale large-list probe uses 390px, 500 rows, explicit budgets, and rejects page overflow', () => {
    const smoke = readRepoFile('scripts/command-center-mobile-list-smoke.mjs');
    expect(smoke).toContain('width: 390');
    expect(smoke).toContain('recordsPayload(500)');
    expect(smoke).toContain('RENDER_BUDGET_MS');
    expect(smoke).toContain('INTERACTION_BUDGET_MS');
    expect(smoke).toContain('pageOverflow <= 1');
    expect(smoke).toContain('Mobile Manager 500');
  });

  test('keeps research-heavy Player Intelligence condensed rather than pretending it is a phone-first decision surface', () => {
    expect(COMMAND_CENTER_V1_MOBILE_SURFACES.player_intelligence.status).toBe('desktop_first_condensed');
    const player = readRepoFile('client/src/pages/PlayerPage.tsx');
    expect(player).toContain('overflow-x-auto');
    expect(player).toContain('Player Not Found');
  });
});

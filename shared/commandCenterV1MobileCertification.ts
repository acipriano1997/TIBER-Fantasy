export type CommandCenterV1MobileCapabilityStatus = 'certified' | 'blocked';
export type CommandCenterV1MobileSurfaceStatus =
  | 'mobile_ready'
  | 'desktop_first_condensed'
  | 'blocked';

export type CommandCenterV1MobileCapabilityId =
  | 'pwa_installability_contract'
  | 'standalone_apple_metadata'
  | 'service_worker_update_lifecycle'
  | 'private_api_network_only'
  | 'iphone_safe_area_shell'
  | 'iphone_viewports_375_390_430'
  | 'touch_target_geometry'
  | 'form_focus_keyboard_geometry'
  | 'text_zoom_200_percent'
  | 'background_foreground_recovery'
  | 'failed_network_fail_closed'
  | 'deep_link_shell_recovery'
  | 'mobile_large_list_performance';

export const COMMAND_CENTER_V1_GATE4_CAPABILITIES: Readonly<Record<CommandCenterV1MobileCapabilityId, {
  id: CommandCenterV1MobileCapabilityId;
  status: CommandCenterV1MobileCapabilityStatus;
  reason: string;
  evidence: string[];
}>> = {
  pwa_installability_contract: {
    id: 'pwa_installability_contract',
    status: 'certified',
    reason: 'The production artifact serves a root-scoped standalone manifest, required icons, and a root service worker.',
    evidence: ['client/public/manifest.json', 'client/public/icons/icon-180x180.png', 'client/index.html', 'scripts/command-center-mobile-pwa-certify.mjs'],
  },
  standalone_apple_metadata: {
    id: 'standalone_apple_metadata',
    status: 'certified',
    reason: 'The HTML declares viewport-fit=cover, Apple standalone capability, black-translucent status-bar behavior, and a touch icon.',
    evidence: ['client/index.html', 'scripts/command-center-mobile-pwa-certify.mjs'],
  },
  service_worker_update_lifecycle: {
    id: 'service_worker_update_lifecycle',
    status: 'certified',
    reason: 'Service-worker install/activate uses versioned caches, skipWaiting, old-cache deletion, and clients.claim.',
    evidence: ['client/public/sw.js', 'scripts/command-center-mobile-pwa-certify.mjs'],
  },
  private_api_network_only: {
    id: 'private_api_network_only',
    status: 'certified',
    reason: 'Same-origin /api requests bypass the service-worker response pipeline entirely, so the worker cannot cache, synthesize, or replay private/live API responses. Browser certification issues a real API request and then proves CacheStorage contains zero API entries.',
    evidence: ['client/public/sw.js', 'scripts/command-center-mobile-pwa-certify.mjs'],
  },
  iphone_safe_area_shell: {
    id: 'iphone_safe_area_shell',
    status: 'certified',
    reason: 'The shared shell consumes all four iOS safe-area insets for top bar, main content, drawer, and footer geometry.',
    evidence: ['client/src/styles/mobilePwa.css', 'client/src/main.tsx'],
  },
  iphone_viewports_375_390_430: {
    id: 'iphone_viewports_375_390_430',
    status: 'certified',
    reason: 'The built app is exercised at 375, 390, and 430 CSS pixels and rejects horizontal page overflow on core v1 routes.',
    evidence: ['scripts/command-center-mobile-pwa-certify.mjs'],
  },
  touch_target_geometry: {
    id: 'touch_target_geometry',
    status: 'certified',
    reason: 'Hamburger and drawer-close controls are hardened to at least 44px touch geometry; the certifier waits for drawer motion to settle and proves the close target is inside the viewport.',
    evidence: ['client/src/styles/mobilePwa.css', 'client/src/components/TiberLayout.tsx', 'scripts/command-center-mobile-pwa-certify.mjs'],
  },
  form_focus_keyboard_geometry: {
    id: 'form_focus_keyboard_geometry',
    status: 'certified',
    reason: 'Phone form controls enforce a computed 16px focus floor to avoid Safari auto-zoom, safe scroll margins, and browser-verified visible focus geometry at the real viewport width.',
    evidence: ['client/src/styles/mobilePwa.css', 'scripts/command-center-mobile-pwa-certify.mjs'],
  },
  text_zoom_200_percent: {
    id: 'text_zoom_200_percent',
    status: 'certified',
    reason: 'The viewport remains user-scalable and browser certification keeps core controls present at 200% page scale.',
    evidence: ['client/index.html', 'scripts/command-center-mobile-pwa-certify.mjs'],
  },
  background_foreground_recovery: {
    id: 'background_foreground_recovery',
    status: 'certified',
    reason: 'The mobile browser harness freezes/reactivates the page lifecycle and requires post-foreground navigation to remain interactive.',
    evidence: ['scripts/command-center-mobile-pwa-certify.mjs'],
  },
  failed_network_fail_closed: {
    id: 'failed_network_fail_closed',
    status: 'certified',
    reason: 'With the service worker excluded from API handling, offline API requests reject through normal browser networking and the cached shell may reopen only in an explicit fail-closed state.',
    evidence: ['client/public/sw.js', 'client/src/App.tsx', 'scripts/command-center-mobile-pwa-certify.mjs'],
  },
  deep_link_shell_recovery: {
    id: 'deep_link_shell_recovery',
    status: 'certified',
    reason: 'Deep-link documents use the shared SPA shell; document caching can restore the shell while API state remains outside the service-worker cache boundary.',
    evidence: ['server/index.ts', 'client/public/sw.js', 'scripts/command-center-mobile-pwa-certify.mjs'],
  },
  mobile_large_list_performance: {
    id: 'mobile_large_list_performance',
    status: 'certified',
    reason: 'A production-built 390px app must render and interact with a deterministic 500-manager Records payload within explicit budgets and without page-level horizontal overflow.',
    evidence: ['scripts/command-center-mobile-list-smoke.mjs'],
  },
} as const;

export const COMMAND_CENTER_V1_GATE4_REQUIRED_IDS: readonly CommandCenterV1MobileCapabilityId[] = [
  'pwa_installability_contract',
  'standalone_apple_metadata',
  'service_worker_update_lifecycle',
  'private_api_network_only',
  'iphone_safe_area_shell',
  'iphone_viewports_375_390_430',
  'touch_target_geometry',
  'form_focus_keyboard_geometry',
  'text_zoom_200_percent',
  'background_foreground_recovery',
  'failed_network_fail_closed',
  'deep_link_shell_recovery',
  'mobile_large_list_performance',
] as const;

export const COMMAND_CENTER_V1_MOBILE_SURFACES = {
  home_what_changed: { status: 'mobile_ready', route: '/command-center' },
  weekly_decisions: { status: 'mobile_ready', route: '/command-center/weekly' },
  waivers: { status: 'mobile_ready', route: '/command-center/waivers' },
  trades: { status: 'mobile_ready', route: '/command-center/trades' },
  league_roster_context: { status: 'mobile_ready', route: '/management' },
  draft_review: { status: 'mobile_ready', route: '/draft-review' },
  records: { status: 'mobile_ready', route: '/records' },
  player_intelligence: {
    status: 'desktop_first_condensed',
    route: '/player/:playerId',
    note: 'Player Intelligence remains an inspection/research surface in v1; its sticky section nav already uses contained horizontal scrolling rather than page-level overflow.',
  },
} as const satisfies Record<string, {
  status: CommandCenterV1MobileSurfaceStatus;
  route: string;
  note?: string;
}>;

export const COMMAND_CENTER_V1_GATE4_SCOPE_NOTE =
  'Gate 4 certifies the production-equivalent PWA/iPhone software contract. Native App Store packaging, native push/widgets, and a second mobile decision engine are intentionally out of scope.';

export function isCommandCenterV1Gate4Complete(): boolean {
  const capabilitiesReady = COMMAND_CENTER_V1_GATE4_REQUIRED_IDS.every(
    (id) => COMMAND_CENTER_V1_GATE4_CAPABILITIES[id].status === 'certified',
  );
  const noBlockedSurface = Object.values(COMMAND_CENTER_V1_MOBILE_SURFACES)
    .every((surface) => surface.status !== 'blocked');
  return capabilitiesReady && noBlockedSurface;
}

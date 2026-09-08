export type CommandCenterV1RuntimeCapabilityStatus = 'certified' | 'blocked';

export type CommandCenterV1RuntimeCapabilityId =
  | 'release_build'
  | 'delta_typecheck'
  | 'api_liveness'
  | 'database_transport_readiness'
  | 'sleeper_sync_ci'
  | 'synthetic_fallback_quarantine'
  | 'browser_route_smoke'
  | 'pending_request_navigation_resilience'
  | 'large_list_performance'
  | 'active_surface_fallback_audit';

export type CommandCenterV1RuntimeCapability = {
  id: CommandCenterV1RuntimeCapabilityId;
  status: CommandCenterV1RuntimeCapabilityStatus;
  reason: string;
  evidence: string[];
};

export const COMMAND_CENTER_V1_GATE3_CAPABILITIES: Readonly<
  Record<CommandCenterV1RuntimeCapabilityId, CommandCenterV1RuntimeCapability>
> = {
  release_build: {
    id: 'release_build',
    status: 'certified',
    reason: 'The personal-release artifact is built with build.sh and exercised as the production bootstrap + SPA artifact in CI.',
    evidence: ['build.sh', '.github/workflows/core-build.yml', '.github/workflows/command-center-browser-smoke.yml'],
  },
  delta_typecheck: {
    id: 'delta_typecheck',
    status: 'certified',
    reason: 'Release gates distinguish pre-existing repository-wide TypeScript debt from new errors in the certified release boundary.',
    evidence: ['.github/workflows/command-center-certification.yml', '.github/workflows/sleeper-sync.yml'],
  },
  api_liveness: {
    id: 'api_liveness',
    status: 'certified',
    reason: 'Dependency-free liveness is mounted before private runtime/database initialization at /health and /api/health.',
    evidence: ['server/routes/healthRoutes.ts', 'server/index.ts', 'server/routes/__tests__/healthRoutes.test.ts'],
  },
  database_transport_readiness: {
    id: 'database_transport_readiness',
    status: 'certified',
    reason: 'Database transport readiness is separate from liveness and returns typed 200/503 states without leaking provider errors.',
    evidence: ['server/routes/healthRoutes.ts', 'server/infra/databaseSsl.ts', '.github/workflows/sleeper-sync.yml'],
  },
  sleeper_sync_ci: {
    id: 'sleeper_sync_ci',
    status: 'certified',
    reason: 'Sleeper CI runs focused truth regressions, the real release build, PostgreSQL-backed runtime smoke, and credential-gated external smoke.',
    evidence: ['.github/workflows/sleeper-sync.yml'],
  },
  synthetic_fallback_quarantine: {
    id: 'synthetic_fallback_quarantine',
    status: 'certified',
    reason: 'The known legacy random/fixed Sleeper usage path is shadowed by a typed 503 boundary that explicitly forbids synthetic fallback.',
    evidence: ['server/routes/sleeperUsageTruthBoundary.ts', 'server/index.ts', 'server/routes/__tests__/sleeperUsageTruthBoundary.test.ts'],
  },
  browser_route_smoke: {
    id: 'browser_route_smoke',
    status: 'certified',
    reason: 'The built production artifact renders every core v1 browser surface under headless Chrome with uncaught browser errors treated as failures.',
    evidence: ['scripts/command-center-browser-smoke.mjs', '.github/workflows/command-center-browser-smoke.yml'],
  },
  pending_request_navigation_resilience: {
    id: 'pending_request_navigation_resilience',
    status: 'certified',
    reason: 'Browser certification holds Management data requests pending and requires SPA navigation away from the stalled surface within a bounded budget.',
    evidence: ['scripts/command-center-browser-smoke.mjs', '.github/workflows/command-center-browser-smoke.yml'],
  },
  large_list_performance: {
    id: 'large_list_performance',
    status: 'certified',
    reason: 'Browser certification renders and interacts with a deterministic 500-manager Records table under explicit regression budgets.',
    evidence: ['scripts/command-center-browser-smoke.mjs', '.github/workflows/command-center-browser-smoke.yml'],
  },
  active_surface_fallback_audit: {
    id: 'active_surface_fallback_audit',
    status: 'certified',
    reason: 'Active v1 surfaces either expose observed/governed data or an explicit unavailable/unsupported state; missing evidence is not silently imputed into authority.',
    evidence: [
      'shared/commandCenterV1SurfaceManifest.ts',
      'server/services/leagueDashboardTruthBoundary.ts',
      'server/modules/draftReview/draftReviewService.ts',
      'server/services/recordsHistoryService.ts',
      'client/src/pages/RecordsPage.tsx',
      'server/routes/sleeperUsageTruthBoundary.ts',
    ],
  },
} as const;

export const COMMAND_CENTER_V1_GATE3_REQUIRED_IDS: readonly CommandCenterV1RuntimeCapabilityId[] = [
  'release_build',
  'delta_typecheck',
  'api_liveness',
  'database_transport_readiness',
  'sleeper_sync_ci',
  'synthetic_fallback_quarantine',
  'browser_route_smoke',
  'pending_request_navigation_resilience',
  'large_list_performance',
  'active_surface_fallback_audit',
] as const;

export const COMMAND_CENTER_V1_GATE3_NONBLOCKING_DEBT = [
  {
    id: 'repository_wide_typescript_baseline',
    severity: 'P2',
    note: 'Gate 3 certifies the personal-release delta; it does not claim the full legacy repository has zero TypeScript errors.',
  },
  {
    id: 'bundle_size_warning',
    severity: 'P2',
    note: 'The current SPA bundle still triggers Vite large-chunk warnings. Browser timing is certified at representative v1 scale; code-splitting remains optimization debt.',
  },
  {
    id: 'empty_database_schema_bootstrap',
    severity: 'P2',
    note: 'Database readiness certifies transport/query reachability, not that a blank PostgreSQL instance contains the full historical application schema.',
  },
] as const;

export function isCommandCenterV1Gate3Complete(): boolean {
  return COMMAND_CENTER_V1_GATE3_REQUIRED_IDS.every(
    (id) => COMMAND_CENTER_V1_GATE3_CAPABILITIES[id].status === 'certified',
  );
}

import fs from 'node:fs';
import path from 'node:path';
import {
  COMMAND_CENTER_V1_GATE3_CAPABILITIES,
  COMMAND_CENTER_V1_GATE3_NONBLOCKING_DEBT,
  COMMAND_CENTER_V1_GATE3_REQUIRED_IDS,
  isCommandCenterV1Gate3Complete,
} from '../../../shared/commandCenterV1RuntimeCertification';
import {
  COMMAND_CENTER_V1_SURFACES,
  isCommandCenterV1Gate1Complete,
} from '../../../shared/commandCenterV1SurfaceManifest';

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('Command Center v1 Gate 3 runtime certification', () => {
  test('enumerates every required runtime capability and marks the gate complete', () => {
    expect(new Set(COMMAND_CENTER_V1_GATE3_REQUIRED_IDS).size).toBe(COMMAND_CENTER_V1_GATE3_REQUIRED_IDS.length);
    expect(Object.keys(COMMAND_CENTER_V1_GATE3_CAPABILITIES).sort()).toEqual([...COMMAND_CENTER_V1_GATE3_REQUIRED_IDS].sort());
    expect(isCommandCenterV1Gate3Complete()).toBe(true);
    for (const id of COMMAND_CENTER_V1_GATE3_REQUIRED_IDS) {
      expect(COMMAND_CENTER_V1_GATE3_CAPABILITIES[id].status).toBe('certified');
      expect(COMMAND_CENTER_V1_GATE3_CAPABILITIES[id].evidence.length).toBeGreaterThan(0);
    }
  });

  test('keeps baseline repository debt explicit instead of laundering it into the release claim', () => {
    expect(COMMAND_CENTER_V1_GATE3_NONBLOCKING_DEBT.map((row) => row.id)).toEqual(expect.arrayContaining([
      'repository_wide_typescript_baseline',
      'bundle_size_warning',
      'empty_database_schema_bootstrap',
    ]));
    const dbDebt = COMMAND_CENTER_V1_GATE3_NONBLOCKING_DEBT.find((row) => row.id === 'empty_database_schema_bootstrap');
    expect(dbDebt?.note).toContain('transport/query reachability');
    expect(dbDebt?.note).not.toContain('schema complete');
  });

  test('mounts dependency-free liveness before private runtime and keeps DB readiness separate and typed', () => {
    const index = readRepoFile('server/index.ts');
    const health = readRepoFile('server/routes/healthRoutes.ts');
    expect(index.indexOf('app.use(createHealthRouter())')).toBeGreaterThanOrEqual(0);
    expect(index.indexOf('app.use(createHealthRouter())')).toBeLessThan(index.indexOf('export async function initBackground'));
    expect(health).toContain("router.get('/api/health'");
    expect(health).toContain("router.get('/api/health/db'");
    expect(health).toContain("'database_url_missing'");
    expect(health).toContain("'database_unavailable'");
    expect(health).toContain('database.ready ? 200 : 503');
  });

  test('quarantines the known synthetic Sleeper usage path before the legacy route graph', () => {
    const index = readRepoFile('server/index.ts');
    const boundary = readRepoFile('server/routes/sleeperUsageTruthBoundary.ts');
    expect(index).toContain('app.use(sleeperUsageTruthBoundaryRouter)');
    expect(boundary).toContain("code: SLEEPER_USAGE_UNAVAILABLE_CODE");
    expect(boundary).toContain("res.status(503)");
    expect(boundary).toContain('syntheticFallbackAllowed: false');
    expect(boundary).not.toContain('Math.random');
  });

  test('keeps the active Command Center authority boundary fail-closed', () => {
    expect(isCommandCenterV1Gate1Complete()).toBe(true);
    expect(COMMAND_CENTER_V1_SURFACES.home_what_changed.releaseOutcome).toBe('insufficient_evidence');
    expect(COMMAND_CENTER_V1_SURFACES.weekly_decisions.releaseOutcome).toBe('insufficient_evidence');
    expect(COMMAND_CENTER_V1_SURFACES.waivers.releaseOutcome).toBe('unsupported_domain');
    expect(COMMAND_CENTER_V1_SURFACES.trades.releaseOutcome).toBe('unsupported_domain');
    expect(COMMAND_CENTER_V1_SURFACES.waivers.prohibitedAuthority).toContain('server/voice/deciders/waiver.ts');
    expect(COMMAND_CENTER_V1_SURFACES.trades.prohibitedAuthority).toContain('server/services/trade/tradeLogic.ts');
  });

  test('requires Management to use observed roster/starter truth and fail on malformed ownership geometry', () => {
    const management = readRepoFile('server/services/leagueDashboardTruthBoundary.ts');
    expect(management).toContain('normalizeExternalId(roster.roster_id)');
    expect(management).toContain('(observedRoster.starters ?? []).map(String)');
    expect(management).toContain('usedAsStarter: observedStarterIds.has(sleeperId)');
    expect(management).toContain("'external_roster_owner_mismatch'");
    expect(management).toContain("'observed_starter_not_on_roster'");
    expect(management).toContain('freshnessAccepted');
  });

  test('keeps Draft Review unavailable domains explicitly non-fabricated', () => {
    const draft = readRepoFile('server/modules/draftReview/draftReviewService.ts');
    expect(draft).toContain("bye_week_geometry: {");
    expect(draft).toContain("forecast: {");
    expect((draft.match(/fabricated_values: false/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(draft).toContain('This pilot does not use FFC ADP, create projections, grade the draft, or recommend transactions.');
  });

  test('keeps Records coverage partial rather than imputing missing history', () => {
    const page = readRepoFile('client/src/pages/RecordsPage.tsx');
    const service = readRepoFile('server/services/recordsHistoryService.ts');
    expect(page).toContain('Missing weeks or seasons are not imputed.');
    expect(service).toContain("code: 'league_unavailable' | 'season_partial' | 'lineage_cycle' | 'lineage_depth_limit'");
    expect(service).toContain('coverage: {');
  });

  test('browser CI certifies the real built artifact, pending-request navigation, and 500-row interaction', () => {
    const workflow = readRepoFile('.github/workflows/command-center-browser-smoke.yml');
    const harness = readRepoFile('scripts/command-center-browser-smoke.mjs');
    expect(workflow).toContain('sh build.sh');
    expect(workflow).toContain('node scripts/command-center-browser-smoke.mjs');
    expect(workflow).toContain('api/health/db');
    expect(harness).toContain("'/command-center/weekly'");
    expect(harness).toContain("'/management'");
    expect(harness).toContain('pendingManagementRequests');
    expect(harness).toContain('buildRecordsPayload(500)');
    expect(harness).toContain('largeListRenderBudgetMs');
    expect(harness).toContain('largeListInteractionBudgetMs');
  });

  test('Sleeper CI no longer depends on a nonexistent generic check command', () => {
    const workflow = readRepoFile('.github/workflows/sleeper-sync.yml');
    expect(workflow).not.toContain('npm run check');
    expect(workflow).toContain('Build release artifact');
    expect(workflow).toContain('/api/health/db');
  });
});

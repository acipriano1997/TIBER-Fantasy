import fs from 'node:fs';
import path from 'node:path';
import {
  COMMAND_CENTER_V1_REQUIRED_SURFACE_IDS,
  COMMAND_CENTER_V1_SURFACES,
  isCommandCenterV1Gate1Complete,
} from '../../../shared/commandCenterV1SurfaceManifest';

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('Command Center v1 Gate 1 surface manifest', () => {
  test('enumerates every required owner workflow exactly once', () => {
    expect(new Set(COMMAND_CENTER_V1_REQUIRED_SURFACE_IDS).size).toBe(COMMAND_CENTER_V1_REQUIRED_SURFACE_IDS.length);
    expect(Object.keys(COMMAND_CENTER_V1_SURFACES).sort()).toEqual([...COMMAND_CENTER_V1_REQUIRED_SURFACE_IDS].sort());
  });

  test('keeps human final authority on every release surface', () => {
    for (const surface of Object.values(COMMAND_CENTER_V1_SURFACES)) {
      expect(surface.finalActionAuthority).toBe('human');
    }
  });

  test('certifies Gate 1 only because every required workflow is either governed, inspection-only, or explicitly fail-closed', () => {
    expect(isCommandCenterV1Gate1Complete()).toBe(true);

    expect(COMMAND_CENTER_V1_SURFACES.home_what_changed).toMatchObject({
      status: 'certified_fail_closed',
      userFacingState: 'available',
      releaseOutcome: 'insufficient_evidence',
      canonicalRoute: '/command-center',
    });
    expect(COMMAND_CENTER_V1_SURFACES.weekly_decisions).toMatchObject({
      status: 'certified_fail_closed',
      userFacingState: 'available',
      releaseOutcome: 'insufficient_evidence',
      canonicalRoute: '/command-center/weekly',
    });
    expect(COMMAND_CENTER_V1_SURFACES.waivers).toMatchObject({
      status: 'certified_fail_closed',
      userFacingState: 'available',
      releaseOutcome: 'unsupported_domain',
      canonicalRoute: '/command-center/waivers',
    });
    expect(COMMAND_CENTER_V1_SURFACES.trades).toMatchObject({
      status: 'certified_fail_closed',
      userFacingState: 'available',
      releaseOutcome: 'unsupported_domain',
      canonicalRoute: '/command-center/trades',
    });
  });

  test('keeps the legacy waiver heuristic prohibited while it still assigns hand-set boosts and confidence', () => {
    const source = readRepoFile('server/voice/deciders/waiver.ts');
    expect(source).toContain('priority_score += 10');
    expect(source).toContain("return { verdict: 'Claim: High', conf:");
    expect(COMMAND_CENTER_V1_SURFACES.waivers.status).toBe('certified_fail_closed');
    expect(COMMAND_CENTER_V1_SURFACES.waivers.releaseOutcome).toBe('unsupported_domain');
    expect(COMMAND_CENTER_V1_SURFACES.waivers.prohibitedAuthority).toContain('server/voice/deciders/waiver.ts');
  });

  test('keeps the transitional trade heuristic prohibited while prometheusScore and fixed bonuses remain authoritative', () => {
    const source = readRepoFile('server/services/trade/tradeLogic.ts');
    expect(source).toContain('prometheusScore');
    expect(source).toContain('const STARTER_BONUS = 5');
    expect(source).toContain('const AGE_PENALTY_PER_YEAR = 2');
    expect(COMMAND_CENTER_V1_SURFACES.trades.status).toBe('certified_fail_closed');
    expect(COMMAND_CENTER_V1_SURFACES.trades.releaseOutcome).toBe('unsupported_domain');
    expect(COMMAND_CENTER_V1_SURFACES.trades.prohibitedAuthority).toContain('server/services/trade/tradeLogic.ts');
  });

  test('activates weekly decisions only as a fail-closed adapter over the typed contract', () => {
    const weekly = COMMAND_CENTER_V1_SURFACES.weekly_decisions;
    expect(weekly.status).toBe('certified_fail_closed');
    expect(weekly.releaseOutcome).toBe('insufficient_evidence');
    expect(weekly.canonicalRoute).toBe('/command-center/weekly');
    expect(weekly.userFacingState).toBe('available');
    expect(weekly.prohibitedAuthority).toContain('server/services/playerComparisonService.ts');
    expect(weekly.prohibitedAuthority).toContain('server/voice/deciders/startSit.ts');
  });

  test('routes the four release-safe workflow surfaces without importing legacy decision engines into their page', () => {
    const app = readRepoFile('client/src/App.tsx');
    const page = readRepoFile('client/src/pages/CommandCenterV1.tsx');

    for (const route of [
      '/command-center',
      '/command-center/weekly',
      '/command-center/waivers',
      '/command-center/trades',
    ]) {
      expect(app).toContain(`path=\"${route}\"`);
    }

    expect(page).toContain('@shared/commandCenterV1SurfaceManifest');
    expect(page).not.toContain('server/voice/deciders/waiver');
    expect(page).not.toContain('server/services/trade/tradeLogic');
    expect(page).not.toContain('playerComparisonService');
    expect(page).not.toContain('startSit');
  });

  test('records the already-certified read-only release surfaces without expanding their authority', () => {
    expect(COMMAND_CENTER_V1_SURFACES.league_portfolio).toMatchObject({
      status: 'certified_read_only',
      canonicalRoute: '/management',
      userFacingState: 'available',
      releaseOutcome: 'read_only_context',
    });
    expect(COMMAND_CENTER_V1_SURFACES.draft).toMatchObject({
      status: 'certified_read_only',
      canonicalRoute: '/draft-review',
      userFacingState: 'available',
      releaseOutcome: 'read_only_context',
    });
    expect(COMMAND_CENTER_V1_SURFACES.records).toMatchObject({
      status: 'certified_read_only',
      canonicalRoute: '/records',
      userFacingState: 'available',
      releaseOutcome: 'read_only_context',
      finalActionAuthority: 'human',
    });
  });
});

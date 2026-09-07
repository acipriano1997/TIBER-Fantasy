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

  test('does not claim Gate 1 complete while required workflows remain blocked or inactive', () => {
    expect(isCommandCenterV1Gate1Complete()).toBe(false);
    expect(COMMAND_CENTER_V1_SURFACES.home_what_changed.userFacingState).toBe('unavailable');
    expect(COMMAND_CENTER_V1_SURFACES.weekly_decisions.userFacingState).toBe('unavailable');
    expect(COMMAND_CENTER_V1_SURFACES.waivers.userFacingState).toBe('unavailable');
    expect(COMMAND_CENTER_V1_SURFACES.trades.userFacingState).toBe('unavailable');
  });

  test('quarantines the legacy waiver heuristic while it still assigns hand-set boosts and confidence', () => {
    const source = readRepoFile('server/voice/deciders/waiver.ts');
    expect(source).toContain('priority_score += 10');
    expect(source).toContain("return { verdict: 'Claim: High', conf:");
    expect(COMMAND_CENTER_V1_SURFACES.waivers.status).toBe('blocked_legacy_authority');
    expect(COMMAND_CENTER_V1_SURFACES.waivers.prohibitedAuthority).toContain('server/voice/deciders/waiver.ts');
  });

  test('quarantines the transitional trade heuristic while prometheusScore and fixed bonuses remain authoritative', () => {
    const source = readRepoFile('server/services/trade/tradeLogic.ts');
    expect(source).toContain('prometheusScore');
    expect(source).toContain('const STARTER_BONUS = 5');
    expect(source).toContain('const AGE_PENALTY_PER_YEAR = 2');
    expect(COMMAND_CENTER_V1_SURFACES.trades.status).toBe('blocked_legacy_authority');
    expect(COMMAND_CENTER_V1_SURFACES.trades.prohibitedAuthority).toContain('server/services/trade/tradeLogic.ts');
  });

  test('does not promote a contract-only weekly decision slice into a user-facing recommendation', () => {
    const weekly = COMMAND_CENTER_V1_SURFACES.weekly_decisions;
    expect(weekly.status).toBe('contract_ready_not_activated');
    expect(weekly.canonicalRoute).toBeNull();
    expect(weekly.userFacingState).toBe('unavailable');
  });

  test('records the already-certified read-only release surfaces without expanding their authority', () => {
    expect(COMMAND_CENTER_V1_SURFACES.league_portfolio).toMatchObject({
      status: 'certified_read_only',
      canonicalRoute: '/management',
      userFacingState: 'available',
    });
    expect(COMMAND_CENTER_V1_SURFACES.draft).toMatchObject({
      status: 'certified_read_only',
      canonicalRoute: '/draft-review',
      userFacingState: 'available',
    });
  });
});

import {
  COMMAND_CENTER_V1_INVARIANT_IDS,
  type CommandCenterV1InvariantId,
} from '../../../shared/commandCenterV1InvariantManifest';
import {
  evaluateWeeklyDecision,
  type WeeklyDecisionContext,
} from '../../../shared/weeklyDecisionContract';
import {
  computeTruthBoundLeagueDashboard,
  type LeagueDashboardTruthError,
} from '../leagueDashboardTruthBoundary';
import {
  createWeeklyDecisionLedgerEntry,
  replayWeeklyDecisionLedgerEntry,
  type WeeklyDecisionLedgerEntryV1,
} from '../weeklyDecisionLedger';
import { WEEKLY_DECISION_GATE2_GOLDEN_TRACES } from './golden/weeklyDecisionGate2GoldenTraces';

const FIXED_NOW = new Date('2026-09-07T16:00:00.000Z');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function player(id: string, alpha: number) {
  return {
    rosterKey: `sleeper:${id}`,
    canonicalId: `sleeper:${id}`,
    sleeperId: id,
    name: id,
    pos: 'WR',
    alpha,
    forgeScoreSource: 'player_specific',
    usedAsStarter: false,
  };
}

function managementDeps() {
  const league = {
    id: 'league-1',
    userId: 'personal-user',
    leagueIdExternal: 'sleeper-league',
    scoringFormat: 'ppr',
    season: 2026,
    settings: { roster_positions: ['WR', 'WR', 'FLEX'] },
    teams: [{
      id: 'team-1',
      externalRosterId: '1',
      externalUserId: 'owner-1',
      displayName: 'Invariant Team',
    }],
  };

  const payload = {
    success: true as const,
    meta: {
      league_id: 'league-1',
      week: 1,
      season: 2026,
      computed_at: FIXED_NOW.toISOString(),
      cached: false,
    },
    diagnostics: {
      forgeArtifact: {
        state: 'available',
        available: true,
        code: null,
        sourcePath: '/tmp/forge.json',
        contractVersion: 'v1',
        generatedAt: '2026-09-01T12:00:00.000Z',
        generatedAtSource: 'root_generated_at',
        promotedAt: null,
        freshness: { status: 'fresh' },
      },
    },
    unresolvedPlayers: [],
    teams: [{
      team_id: 'team-1',
      display_name: 'Invariant Team',
      totals: { QB: 0, RB: 0, WR: 99, TE: 0 },
      bench_contribution: 0,
      overall_total: 99,
      starters_used: [player('bench-high', 99)],
      roster: [player('starter-low', 10), player('bench-high', 99)],
    }],
  } as any;

  return {
    league,
    payload,
    deps: {
      storage: { getLeagueWithTeams: jest.fn().mockResolvedValue(league) },
      sleeperClient: {
        getLeagueRosters: jest.fn().mockResolvedValue([{
          roster_id: 1,
          owner_id: 'owner-1',
          players: ['starter-low', 'bench-high'],
          starters: ['starter-low'],
        }]),
      },
      computeLeagueDashboard: jest.fn().mockResolvedValue(payload),
      now: () => FIXED_NOW,
    } as any,
  };
}

function weeklyContext(): WeeklyDecisionContext {
  return clone(WEEKLY_DECISION_GATE2_GOLDEN_TRACES[0].context);
}

async function expectTruthError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`Expected truth error ${code}`);
  } catch (error) {
    expect(error).toMatchObject<Partial<LeagueDashboardTruthError>>({ code });
  }
}

type InvariantProof = () => void | Promise<void>;

const proofs: Record<CommandCenterV1InvariantId, InvariantProof> = {
  scoped_user_identity: async () => {
    const { deps } = managementDeps();
    await expectTruthError(
      computeTruthBoundLeagueDashboard({ userId: 'default_user', leagueId: 'league-1' }, deps),
      'unscoped_user_id',
    );
  },

  league_ownership_identity: async () => {
    const { deps, league } = managementDeps();
    deps.storage.getLeagueWithTeams.mockResolvedValue({ ...league, userId: 'another-user' });
    await expectTruthError(
      computeTruthBoundLeagueDashboard({ userId: 'personal-user', leagueId: 'league-1' }, deps),
      'league_context_not_found',
    );
  },

  external_league_identity: async () => {
    const { deps, league } = managementDeps();
    deps.storage.getLeagueWithTeams.mockResolvedValue({ ...league, leagueIdExternal: null });
    await expectTruthError(
      computeTruthBoundLeagueDashboard({ userId: 'personal-user', leagueId: 'league-1' }, deps),
      'external_league_id_missing',
    );
  },

  external_roster_identity: async () => {
    const { deps, league } = managementDeps();
    deps.storage.getLeagueWithTeams.mockResolvedValue({
      ...league,
      teams: [{ ...league.teams[0], externalRosterId: '99' }],
    });
    await expectTruthError(
      computeTruthBoundLeagueDashboard({ userId: 'personal-user', leagueId: 'league-1' }, deps),
      'external_roster_binding_mismatch',
    );
  },

  external_owner_identity: async () => {
    const { deps, league } = managementDeps();
    deps.storage.getLeagueWithTeams.mockResolvedValue({
      ...league,
      teams: [{ ...league.teams[0], externalUserId: 'wrong-owner' }],
    });
    await expectTruthError(
      computeTruthBoundLeagueDashboard({ userId: 'personal-user', leagueId: 'league-1' }, deps),
      'external_roster_owner_mismatch',
    );
  },

  observed_roster_geometry: async () => {
    const first = managementDeps();
    first.deps.sleeperClient.getLeagueRosters.mockResolvedValue([{
      roster_id: 1,
      owner_id: 'owner-1',
      players: ['starter-low', 'bench-high'],
      starters: ['ghost-player'],
    }]);
    await expectTruthError(
      computeTruthBoundLeagueDashboard({ userId: 'personal-user', leagueId: 'league-1' }, first.deps),
      'observed_starter_not_on_roster',
    );

    const second = managementDeps();
    second.deps.sleeperClient.getLeagueRosters.mockResolvedValue([
      { roster_id: 1, owner_id: 'owner-1', players: ['starter-low'], starters: ['starter-low'] },
      { roster_id: 2, owner_id: 'owner-2', players: ['starter-low'], starters: ['starter-low'] },
    ]);
    await expectTruthError(
      computeTruthBoundLeagueDashboard({ userId: 'personal-user', leagueId: 'league-1' }, second.deps),
      'duplicate_observed_player_membership',
    );
  },

  observed_starter_truth: async () => {
    const { deps } = managementDeps();
    const result = await computeTruthBoundLeagueDashboard(
      { userId: 'personal-user', leagueId: 'league-1' },
      deps,
    ) as any;
    const roster = result.teams[0].roster;
    expect(roster.find((row: any) => row.sleeperId === 'starter-low').usedAsStarter).toBe(true);
    expect(roster.find((row: any) => row.sleeperId === 'bench-high').usedAsStarter).toBe(false);
    expect(result.teams[0].totals.WR).toBe(10);
    expect(result.teams[0].starter_source).toBe('sleeper_observed');
  },

  forge_freshness_and_coverage: async () => {
    const { deps, payload } = managementDeps();
    const stale = clone(payload);
    stale.diagnostics.forgeArtifact.generatedAt = '2026-01-01T00:00:00.000Z';
    deps.computeLeagueDashboard.mockResolvedValue(stale);
    const result = await computeTruthBoundLeagueDashboard(
      { userId: 'personal-user', leagueId: 'league-1' }, deps,
    ) as any;
    expect(result.teams[0].overall_available).toBe(false);
    expect(result.teams[0].overall_total).toBeNull();
    expect(result.teams[0].forge_freshness_receipt.decision).toBe('rejected');
  },

  weekly_context_identity: () => {
    const context = weeklyContext();
    context.decisionId = '';
    const result = evaluateWeeklyDecision(context);
    expect(result.decisionState).toBe('insufficient_evidence');
    expect(result.missingInputs).toContain('decision_id');
  },

  weekly_scoring_identity: () => {
    const context = weeklyContext();
    context.candidateB.tailOutlook!.scoringProfileRef = 'league:other';
    const result = evaluateWeeklyDecision(context);
    expect(result.decisionState).toBe('insufficient_evidence');
    expect(result.missingInputs).toContain('bench:scoring_profile_mismatch');
  },

  weekly_roster_lineup_identity: () => {
    const context = weeklyContext();
    context.rosterSnapshotHash = '';
    const result = evaluateWeeklyDecision(context);
    expect(result.decisionState).toBe('insufficient_evidence');
    expect(result.missingInputs).toContain('roster_snapshot_hash');
  },

  weekly_legality_and_lock_state: () => {
    const context = weeklyContext();
    context.locked = true;
    const result = evaluateWeeklyDecision(context);
    expect(result.decisionState).toBe('unsupported_domain');
    expect(result.preferredPlayerId).toBeNull();
  },

  weekly_canonical_player_identity: () => {
    const context = weeklyContext();
    context.candidateB.identityStatus = 'unresolved';
    const result = evaluateWeeklyDecision(context);
    expect(result.decisionState).toBe('insufficient_evidence');
    expect(result.missingInputs).toContain('bench:canonical_identity');
  },

  weekly_as_of_boundary: () => {
    const context = weeklyContext();
    context.evidenceCutoffAt = '2026-09-07 16:00:00';
    const result = evaluateWeeklyDecision(context);
    expect(result.decisionState).toBe('insufficient_evidence');
    expect(result.missingInputs).toContain('evidence_cutoff_at');
  },

  weekly_tail_completeness: () => {
    const context = weeklyContext();
    context.candidateB.tailOutlook!.quantiles.p95 = null;
    const result = evaluateWeeklyDecision(context);
    expect(result.decisionState).toBe('insufficient_evidence');
    expect(result.missingInputs).toContain('bench:p95_missing');
  },

  weekly_authoritative_lineage: () => {
    const context = weeklyContext();
    context.candidateB.tailOutlook!.sourceReceipts[0].owner = 'TIBER-Fantasy';
    const result = evaluateWeeklyDecision(context);
    expect(result.decisionState).toBe('insufficient_evidence');
    expect(result.missingInputs).toContain('bench:authoritative_forecast_receipt_missing');
  },

  weekly_ledger_integrity_and_replay: () => {
    const context = weeklyContext();
    const entry = createWeeklyDecisionLedgerEntry(context, '2026-09-07T16:10:00.000Z');
    const intact = replayWeeklyDecisionLedgerEntry(entry);
    expect(intact.integrity).toBe('verified');
    expect(intact.determinism).toBe('matched');

    const tampered = clone(entry) as WeeklyDecisionLedgerEntryV1;
    tampered.contextSnapshot.teamRef = 'tampered-team';
    const rejected = replayWeeklyDecisionLedgerEntry(tampered);
    expect(rejected.integrity).toBe('tampered');
    expect(rejected.determinism).toBe('not_run');
    expect(rejected.replayedResult).toBeNull();
  },
};

describe('Command Center v1 unified deterministic invariant replay', () => {
  test('has exactly one executable proof registered for every catalog invariant', () => {
    expect(Object.keys(proofs).sort()).toEqual([...COMMAND_CENTER_V1_INVARIANT_IDS].sort());
  });

  test.each(COMMAND_CENTER_V1_INVARIANT_IDS)('%s fails closed or preserves its certified boundary', async (id) => {
    await proofs[id]();
  });
});

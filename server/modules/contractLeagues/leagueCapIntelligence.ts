import { contractLeagueSnapshotSchema } from './contracts';
import { contractLeaguePolicySchema, type ContractLeaguePolicy } from './policy';
import { buildMultiYearCapHealth } from './capIntelligence';

export const LEAGUE_CAP_INTELLIGENCE_VERSION = 'league-cap-intelligence.v1' as const;

type ContractLeaguePhase = ContractLeaguePolicy['roster']['limitsByPhase'][number]['phase'];

type TeamBinding = {
  teamKey: string;
  sourceTeamName: string;
};

export type LeagueCapCapacityResult =
  | {
    status: 'ABSTAIN';
    version: typeof LEAGUE_CAP_INTELLIGENCE_VERSION;
    reasonCodes: string[];
    details: string[];
  }
  | {
    status: 'READY' | 'PARTIAL';
    version: typeof LEAGUE_CAP_INTELLIGENCE_VERSION;
    season: number;
    phase: ContractLeaguePhase;
    teams: Array<{
      teamKey: string;
      sourceTeamName: string;
      currentCapRemaining: number;
      currentHardHeadroom: number | null;
      currentCapOnlyAbsorptionCapacity: number;
      currentViolation: boolean;
      knownFutureViolation: boolean;
      firstViolationSeason: number | null;
      futureCapTrajectory: Array<{
        season: number;
        sourceCapRemaining: number;
        strictestHardHeadroom: number | null;
      }>;
      rankByCurrentCapOnlyCapacity: number;
      inferredManagerIntent: null;
    }>;
    unavailableTeams: Array<{
      teamKey: string;
      sourceTeamName: string;
      reasonCodes: string[];
      details: string[];
    }>;
  };

function money(value: number) {
  return Number(value.toFixed(6));
}

/**
 * League-wide factual capacity view. It reports what teams can absorb under
 * current cap state; it never infers willingness to trade or bid from capacity.
 */
export function buildLeagueWideCapCapacity(input: {
  snapshot: unknown;
  policy: unknown;
  phase: ContractLeaguePhase;
  teamBindings: TeamBinding[];
}): LeagueCapCapacityResult {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(input.snapshot);
  if (!snapshotResult.success) {
    return { status: 'ABSTAIN', version: LEAGUE_CAP_INTELLIGENCE_VERSION, reasonCodes: ['SNAPSHOT_INVALID'], details: ['Contract snapshot failed schema validation.'] };
  }
  const policyResult = contractLeaguePolicySchema.safeParse(input.policy);
  if (!policyResult.success) {
    return { status: 'ABSTAIN', version: LEAGUE_CAP_INTELLIGENCE_VERSION, reasonCodes: ['POLICY_INVALID'], details: ['Contract policy failed schema validation.'] };
  }
  const snapshot = snapshotResult.data;
  const policy = policyResult.data;
  if (snapshot.validation.status !== 'VALID' || policy.validation.status !== 'VALID') {
    return {
      status: 'ABSTAIN',
      version: LEAGUE_CAP_INTELLIGENCE_VERSION,
      reasonCodes: [
        ...(snapshot.validation.status !== 'VALID' ? ['SNAPSHOT_NOT_DECISION_READY'] : []),
        ...(policy.validation.status !== 'VALID' ? ['POLICY_NOT_DECISION_READY'] : []),
      ],
      details: ['League-wide cap intelligence requires VALID snapshot and policy state.'],
    };
  }

  const seenTeamKeys = new Set<string>();
  const seenSources = new Set<string>();
  for (const binding of input.teamBindings) {
    if (!binding.teamKey.trim() || !binding.sourceTeamName.trim()
      || seenTeamKeys.has(binding.teamKey) || seenSources.has(binding.sourceTeamName)) {
      return {
        status: 'ABSTAIN',
        version: LEAGUE_CAP_INTELLIGENCE_VERSION,
        reasonCodes: ['TEAM_BINDINGS_INVALID'],
        details: ['League-wide cap intelligence requires unique non-empty internal/source team bindings.'],
      };
    }
    seenTeamKeys.add(binding.teamKey);
    seenSources.add(binding.sourceTeamName);
  }

  const available: Array<{
    teamKey: string;
    sourceTeamName: string;
    currentCapRemaining: number;
    currentHardHeadroom: number | null;
    currentCapOnlyAbsorptionCapacity: number;
    currentViolation: boolean;
    knownFutureViolation: boolean;
    firstViolationSeason: number | null;
    futureCapTrajectory: Array<{ season: number; sourceCapRemaining: number; strictestHardHeadroom: number | null }>;
    rankByCurrentCapOnlyCapacity: number;
    inferredManagerIntent: null;
  }> = [];
  const unavailable: Array<{ teamKey: string; sourceTeamName: string; reasonCodes: string[]; details: string[] }> = [];

  for (const binding of input.teamBindings) {
    const health = buildMultiYearCapHealth(snapshot, policy, {
      teamKey: binding.teamKey,
      sourceTeamName: binding.sourceTeamName,
      phase: input.phase,
    });
    if (health.status === 'ABSTAIN') {
      unavailable.push({
        teamKey: binding.teamKey,
        sourceTeamName: binding.sourceTeamName,
        reasonCodes: health.reasonCodes,
        details: health.details,
      });
      continue;
    }
    const current = health.seasons.find((season) => season.season === snapshot.league.season) ?? null;
    if (!current) {
      unavailable.push({
        teamKey: binding.teamKey,
        sourceTeamName: binding.sourceTeamName,
        reasonCodes: ['CURRENT_CAP_LEDGER_MISSING'],
        details: ['No current-season cap row is available for the bound team.'],
      });
      continue;
    }
    const hardCapacity = current.strictestHardHeadroom === null
      ? current.sourceCapRemaining
      : Math.min(current.sourceCapRemaining, current.strictestHardHeadroom);
    available.push({
      teamKey: binding.teamKey,
      sourceTeamName: binding.sourceTeamName,
      currentCapRemaining: current.sourceCapRemaining,
      currentHardHeadroom: current.strictestHardHeadroom,
      currentCapOnlyAbsorptionCapacity: money(Math.max(0, hardCapacity)),
      currentViolation: health.currentViolation,
      knownFutureViolation: health.knownFutureViolation,
      firstViolationSeason: health.firstViolationSeason,
      futureCapTrajectory: health.seasons.map((season) => ({
        season: season.season,
        sourceCapRemaining: season.sourceCapRemaining,
        strictestHardHeadroom: season.strictestHardHeadroom,
      })),
      rankByCurrentCapOnlyCapacity: 0,
      inferredManagerIntent: null,
    });
  }

  available.sort((a, b) => b.currentCapOnlyAbsorptionCapacity - a.currentCapOnlyAbsorptionCapacity
    || a.teamKey.localeCompare(b.teamKey));
  available.forEach((team, index) => {
    team.rankByCurrentCapOnlyCapacity = index + 1;
  });

  return {
    status: unavailable.length > 0 ? 'PARTIAL' : 'READY',
    version: LEAGUE_CAP_INTELLIGENCE_VERSION,
    season: snapshot.league.season,
    phase: input.phase,
    teams: available,
    unavailableTeams: unavailable,
  };
}

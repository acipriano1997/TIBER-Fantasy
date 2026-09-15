import { buildMultiYearCapHealth, type CapHealthContext } from './capIntelligence';
import { finalizeCapScenario, type CapScenario } from './capScenario';
import { contractLeagueSnapshotSchema } from './contracts';
import { contractLeaguePolicySchema } from './policy';

export const CAP_STRESS_TESTER_VERSION = 'contract-cap-stress-tester.v1' as const;

export type CapStressConstraintResult = {
  type: CapScenario['constraints'][number]['type'];
  status: 'PASS' | 'FAIL' | 'UNRESOLVED';
  detail: string;
  season: number | null;
};

export type CapStressTesterResult =
  | {
    status: 'ABSTAIN' | 'EXECUTION_GATED';
    version: typeof CAP_STRESS_TESTER_VERSION;
    scenarioFingerprint: string | null;
    reasonCodes: string[];
    details: string[];
  }
  | {
    status: 'READY';
    version: typeof CAP_STRESS_TESTER_VERSION;
    mode: 'PLANNING_ONLY';
    scenarioFingerprint: string;
    seasons: Array<{
      season: number;
      baselineCapRemaining: number;
      assumedCapChange: number;
      projectedCapRemaining: number;
      assumptionDetails: string[];
    }>;
    constraints: CapStressConstraintResult[];
    allResolvedConstraintsPass: boolean;
    unresolvedConstraintCount: number;
    scopeNote: string;
  };

function money(value: number) {
  return Number(value.toFixed(6));
}

function gated(scenario: CapScenario, code: string, detail: string): CapStressTesterResult {
  return {
    status: 'EXECUTION_GATED',
    version: CAP_STRESS_TESTER_VERSION,
    scenarioFingerprint: scenario.scenarioFingerprint,
    reasonCodes: [code],
    details: [detail],
  };
}

/**
 * Stress-tests explicit planning assumptions against the frozen cap ledger.
 * Real transaction/restructure sequences are intentionally gated until the
 * deterministic engines can emit and consume certified hypothetical branch state.
 */
export function evaluatePlanningOnlyCapScenario(input: {
  snapshot: unknown;
  policy: unknown;
  leagueKey: string;
  healthContext: CapHealthContext;
  scenario: unknown;
}): CapStressTesterResult {
  let scenario: CapScenario;
  try {
    scenario = finalizeCapScenario(input.scenario);
  } catch {
    return {
      status: 'ABSTAIN',
      version: CAP_STRESS_TESTER_VERSION,
      scenarioFingerprint: null,
      reasonCodes: ['SCENARIO_INVALID'],
      details: ['Cap scenario failed schema validation.'],
    };
  }

  const leagueKey = input.leagueKey.trim();
  if (!leagueKey) {
    return {
      status: 'ABSTAIN',
      version: CAP_STRESS_TESTER_VERSION,
      scenarioFingerprint: scenario.scenarioFingerprint,
      reasonCodes: ['LEAGUE_KEY_REQUIRED'],
      details: ['Planning stress test requires an explicit internal league key.'],
    };
  }
  if (scenario.leagueKey !== leagueKey) {
    return {
      status: 'ABSTAIN',
      version: CAP_STRESS_TESTER_VERSION,
      scenarioFingerprint: scenario.scenarioFingerprint,
      reasonCodes: ['SCENARIO_LEAGUE_MISMATCH'],
      details: ['Scenario belongs to a different internal league key.'],
    };
  }

  const executableActions = scenario.proposedActions.filter((action) => action.engine !== 'PLANNING_ONLY');
  if (executableActions.length > 0) {
    return gated(
      scenario,
      'HYPOTHETICAL_BRANCH_STATE_REQUIRED',
      'Transaction/restructure stress tests require sequential certified hypothetical state; independent action deltas must not be summed.',
    );
  }

  const snapshotResult = contractLeagueSnapshotSchema.safeParse(input.snapshot);
  const policyResult = contractLeaguePolicySchema.safeParse(input.policy);
  if (!snapshotResult.success || !policyResult.success) {
    return {
      status: 'ABSTAIN',
      version: CAP_STRESS_TESTER_VERSION,
      scenarioFingerprint: scenario.scenarioFingerprint,
      reasonCodes: [
        ...(!snapshotResult.success ? ['SNAPSHOT_INVALID'] : []),
        ...(!policyResult.success ? ['POLICY_INVALID'] : []),
      ],
      details: ['Planning stress test requires valid contract snapshot and policy inputs.'],
    };
  }
  const snapshot = snapshotResult.data;
  const policy = policyResult.data;

  const health = buildMultiYearCapHealth(snapshot, policy, input.healthContext);
  if (health.status === 'ABSTAIN') {
    return {
      status: 'ABSTAIN',
      version: CAP_STRESS_TESTER_VERSION,
      scenarioFingerprint: scenario.scenarioFingerprint,
      reasonCodes: health.reasonCodes,
      details: health.details,
    };
  }

  const seasons = health.seasons.map((baseline) => {
    let change = 0;
    const details: string[] = [];
    for (const assumption of scenario.assumptions) {
      if (assumption.type === 'RESERVE_BUDGET' && assumption.season === baseline.season) {
        change -= assumption.amount;
        details.push(`${assumption.category} reserve: -${money(assumption.amount)}`);
      }
      if (assumption.type === 'TARGET_ACQUISITION') {
        const endSeason = assumption.startSeason + assumption.years - 1;
        if (baseline.season >= assumption.startSeason && baseline.season <= endSeason) {
          change -= assumption.annualSalary;
          details.push(`Target acquisition planning salary: -${money(assumption.annualSalary)}`);
        }
      }
      if (assumption.type === 'ROLLOVER' && assumption.season === baseline.season) {
        change += assumption.amount;
        details.push(`Assumed rollover: +${money(assumption.amount)}`);
      }
      if (assumption.type === 'FUTURE_CAP' && assumption.season === baseline.season) {
        if (baseline.policyCeiling !== null) {
          const capDelta = assumption.amount - baseline.policyCeiling;
          change += capDelta;
          details.push(`Assumed league-cap change: ${capDelta >= 0 ? '+' : ''}${money(capDelta)}`);
        } else {
          details.push('Future-cap assumption could not be translated because the baseline policy ceiling is unavailable.');
        }
      }
      if (assumption.type === 'RETAIN_PLAYER') {
        details.push('Retain-player preference recorded; no unpriced extension cost was invented.');
      }
      if (assumption.type === 'PRESERVE_RIGHT') {
        details.push(`Preserve ${assumption.rightType} right preference recorded; no cap delta assumed.`);
      }
    }
    return {
      season: baseline.season,
      baselineCapRemaining: baseline.sourceCapRemaining,
      assumedCapChange: money(change),
      projectedCapRemaining: money(baseline.sourceCapRemaining + change),
      assumptionDetails: details,
    };
  });

  const constraints = scenario.constraints.map((constraint): CapStressConstraintResult => {
    if (constraint.type === 'MINIMUM_CAP_ROOM') {
      const season = seasons.find((item) => item.season === constraint.season);
      if (!season) {
        return { type: constraint.type, status: 'UNRESOLVED', season: constraint.season, detail: 'No authoritative baseline cap row exists for this season.' };
      }
      const passes = season.projectedCapRemaining + 0.000001 >= constraint.amount;
      return {
        type: constraint.type,
        status: passes ? 'PASS' : 'FAIL',
        season: constraint.season,
        detail: `Projected cap remaining ${season.projectedCapRemaining} vs required ${money(constraint.amount)}.`,
      };
    }
    if (constraint.type === 'MAXIMUM_DEAD_CAP') {
      const targetSeasons = constraint.season === null
        ? health.seasons
        : health.seasons.filter((item) => item.season === constraint.season);
      if (targetSeasons.length === 0) {
        return { type: constraint.type, status: 'UNRESOLVED', season: constraint.season, detail: 'No authoritative dead-cap row exists for the requested season.' };
      }
      const worst = Math.max(...targetSeasons.map((item) => item.deadCap));
      return {
        type: constraint.type,
        status: worst <= constraint.amount + 0.000001 ? 'PASS' : 'FAIL',
        season: constraint.season,
        detail: `Baseline/planning dead cap maximum ${money(worst)} vs allowed ${money(constraint.amount)}; planning assumptions do not create transaction dead cap.`,
      };
    }

    return {
      type: constraint.type,
      status: 'UNRESOLVED',
      season: 'season' in constraint && typeof constraint.season === 'number' ? constraint.season : null,
      detail: 'This constraint requires CCF, rights, player-state, guarantee-structure, or sequential transaction evidence that planning-only stress mode does not own.',
    };
  });

  return {
    status: 'READY',
    version: CAP_STRESS_TESTER_VERSION,
    mode: 'PLANNING_ONLY',
    scenarioFingerprint: scenario.scenarioFingerprint,
    seasons,
    constraints,
    allResolvedConstraintsPass: constraints.filter((item) => item.status !== 'UNRESOLVED').every((item) => item.status === 'PASS'),
    unresolvedConstraintCount: constraints.filter((item) => item.status === 'UNRESOLVED').length,
    scopeNote: 'Planning-only mode changes cap-room projections using explicit assumptions. It does not certify transaction legality or mutate authoritative state.',
  };
}

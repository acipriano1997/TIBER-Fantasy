export const TEAM_PASSING_INTENT_FAMILY = "PASS_RUN_TENDENCY" as const;

export type PassingIntentCoverage = "complete" | "partial" | "unavailable";

export interface TeamPassingIntentPreworkInput {
  teamId: string;
  season: number;
  asOfWeek: number;
  cutoffAt: string;
  knownAt: string;
  regimeId: string | null;
  neutralPassRate: number | null;
  proe: number | null;
  earlyDownPassRate: number | null;
  firstDownPassRate: number | null;
  neutralPlayCount: number | null;
  sourceRefs: string[];
}

export interface TeamPassingIntentPreworkV1 {
  contract: "ccf_team_passing_intent_prework_v1";
  family: typeof TEAM_PASSING_INTENT_FAMILY;
  teamId: string;
  season: number;
  asOfWeek: number;
  cutoffAt: string;
  knownAt: string;
  regimeId: string | null;
  coverage: PassingIntentCoverage;
  metrics: {
    neutralPassRate: number | null;
    proe: number | null;
    earlyDownPassRate: number | null;
    firstDownPassRate: number | null;
    neutralPlayCount: number | null;
  };
  semantics: {
    neutralPassRate: "observed neutral-script pass share";
    proe: "situation-adjusted pass tendency residual";
  };
  downstreamUse: {
    primaryMechanism: "team_dropback_volume";
    directPlayerFantasyBonusAllowed: false;
    additiveMetricStackingAllowed: false;
  };
  sourceRefs: string[];
  warnings: string[];
}

function assertIsoAtOrBefore(value: string, cutoffAt: string, label: string): void {
  const timestamp = Date.parse(value);
  const cutoff = Date.parse(cutoffAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(cutoff)) {
    throw new Error(`${label} and cutoffAt must be valid timestamps`);
  }
  if (timestamp > cutoff) {
    throw new Error(`${label} cannot be after cutoffAt`);
  }
}

function assertRate(value: number | null, label: string): void {
  if (value === null) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be null or a finite rate in [0, 1]`);
  }
}

function assertProe(value: number | null): void {
  if (value === null) return;
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new Error("proe must be null or a finite pass-rate residual in [-1, 1]");
  }
}

function coverageFor(input: TeamPassingIntentPreworkInput): PassingIntentCoverage {
  const values = [
    input.neutralPassRate,
    input.proe,
    input.earlyDownPassRate,
    input.firstDownPassRate,
  ];
  const available = values.filter((value) => value !== null).length;
  if (available === 0) return "unavailable";
  if (available === values.length && input.neutralPlayCount !== null && input.regimeId !== null) {
    return "complete";
  }
  return "partial";
}

/**
 * Held-prework only. This function does not project fantasy points and must not be imported by
 * runtime sources until the upstream Teamstate contract is promoted and the activation gates pass.
 */
export function buildTeamPassingIntentPreworkV1(
  input: TeamPassingIntentPreworkInput,
): TeamPassingIntentPreworkV1 {
  if (!input.teamId.trim()) throw new Error("teamId is required");
  if (!Number.isInteger(input.season) || input.season < 2000) throw new Error("season is invalid");
  if (!Number.isInteger(input.asOfWeek) || input.asOfWeek < 1) throw new Error("asOfWeek is invalid");
  assertIsoAtOrBefore(input.knownAt, input.cutoffAt, "knownAt");
  assertRate(input.neutralPassRate, "neutralPassRate");
  assertRate(input.earlyDownPassRate, "earlyDownPassRate");
  assertRate(input.firstDownPassRate, "firstDownPassRate");
  assertProe(input.proe);
  if (
    input.neutralPlayCount !== null &&
    (!Number.isInteger(input.neutralPlayCount) || input.neutralPlayCount < 0)
  ) {
    throw new Error("neutralPlayCount must be null or a non-negative integer");
  }

  const coverage = coverageFor(input);
  const warnings: string[] = [];
  if (coverage !== "complete") warnings.push("passing-intent evidence is incomplete");
  if (input.regimeId === null) warnings.push("play-caller regime is unknown");
  if (input.neutralPlayCount === null) warnings.push("neutral-play denominator is unknown");
  if (input.proe === null) warnings.push("PROE is unavailable; do not infer it from neutral pass rate");

  return {
    contract: "ccf_team_passing_intent_prework_v1",
    family: TEAM_PASSING_INTENT_FAMILY,
    teamId: input.teamId,
    season: input.season,
    asOfWeek: input.asOfWeek,
    cutoffAt: input.cutoffAt,
    knownAt: input.knownAt,
    regimeId: input.regimeId,
    coverage,
    metrics: {
      neutralPassRate: input.neutralPassRate,
      proe: input.proe,
      earlyDownPassRate: input.earlyDownPassRate,
      firstDownPassRate: input.firstDownPassRate,
      neutralPlayCount: input.neutralPlayCount,
    },
    semantics: {
      neutralPassRate: "observed neutral-script pass share",
      proe: "situation-adjusted pass tendency residual",
    },
    downstreamUse: {
      primaryMechanism: "team_dropback_volume",
      directPlayerFantasyBonusAllowed: false,
      additiveMetricStackingAllowed: false,
    },
    sourceRefs: [...input.sourceRefs],
    warnings,
  };
}

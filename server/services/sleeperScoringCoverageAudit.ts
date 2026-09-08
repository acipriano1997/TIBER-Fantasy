export type ScoringCoverageStatus = 'GREEN' | 'RED';
export type ScoringCoverageReason =
  | 'supported_exact'
  | 'coefficient_mismatch'
  | 'unsupported_key'
  | 'invalid_value';

export interface ForecastScoringCapability {
  sleeperKey: string;
  expectedCoefficient: number;
  forecastComponent: string;
  evidencePath: string;
}

export interface ScoringCoverageEntry {
  key: string;
  leagueCoefficient: number | null;
  expectedCoefficient: number | null;
  status: ScoringCoverageStatus;
  reason: ScoringCoverageReason;
  forecastComponent: string | null;
  evidencePath: string | null;
}

export interface SleeperScoringCoverageAudit {
  status: ScoringCoverageStatus;
  profileId: 'tiber_forecast_xfpg_ppr_v1';
  authority: 'TIBER-Forecast';
  nonzeroKeyCount: number;
  coveredKeyCount: number;
  coveragePct: number;
  unsupportedKeys: string[];
  coefficientMismatches: string[];
  invalidKeys: string[];
  entries: ScoringCoverageEntry[];
}

/**
 * This is a compatibility registry, not a local scoring model.
 *
 * TIBER-Forecast owns the scoring implementation. These values mirror the
 * current Forecast xFPG scoringSystem constants so TIBER-Fantasy can answer a
 * narrower question: "can the currently promoted Forecast score this Sleeper
 * league exactly?"
 *
 * Evidence in TIBER-Forecast main:
 * - src/core/scoringSystem.ts
 * - src/calculators/xfpg/calculateQbXfpg.ts
 * - src/calculators/xfpg/calculateRbXfpg.ts
 * - src/calculators/xfpg/calculatePassCatcherXfpg.ts
 *
 * Do not add a key merely because Sleeper exposes it. A key belongs here only
 * after the producer can actually model that stat component and coefficient.
 */
export const FORECAST_XFPG_SCORING_CAPABILITIES: Readonly<Record<string, ForecastScoringCapability>> = Object.freeze({
  pass_yd: {
    sleeperKey: 'pass_yd',
    expectedCoefficient: 0.04,
    forecastComponent: 'passing_yards',
    evidencePath: 'TIBER-Forecast/src/core/scoringSystem.ts#passingYardPoint',
  },
  pass_td: {
    sleeperKey: 'pass_td',
    expectedCoefficient: 4,
    forecastComponent: 'passing_touchdowns',
    evidencePath: 'TIBER-Forecast/src/core/scoringSystem.ts#passingTdPoint',
  },
  pass_int: {
    sleeperKey: 'pass_int',
    expectedCoefficient: -1,
    forecastComponent: 'passing_interceptions',
    evidencePath: 'TIBER-Forecast/src/core/scoringSystem.ts#interceptionPoint',
  },
  rush_yd: {
    sleeperKey: 'rush_yd',
    expectedCoefficient: 0.1,
    forecastComponent: 'rushing_yards',
    evidencePath: 'TIBER-Forecast/src/core/scoringSystem.ts#rushingYardPoint',
  },
  rush_td: {
    sleeperKey: 'rush_td',
    expectedCoefficient: 6,
    forecastComponent: 'rushing_touchdowns',
    evidencePath: 'TIBER-Forecast/src/core/scoringSystem.ts#rushingTdPoint',
  },
  rec: {
    sleeperKey: 'rec',
    expectedCoefficient: 1,
    forecastComponent: 'receptions',
    evidencePath: 'TIBER-Forecast/src/core/scoringSystem.ts#receptionPoint',
  },
  rec_yd: {
    sleeperKey: 'rec_yd',
    expectedCoefficient: 0.1,
    forecastComponent: 'receiving_yards',
    evidencePath: 'TIBER-Forecast/src/core/scoringSystem.ts#receivingYardPoint',
  },
  rec_td: {
    sleeperKey: 'rec_td',
    expectedCoefficient: 6,
    forecastComponent: 'receiving_touchdowns',
    evidencePath: 'TIBER-Forecast/src/core/scoringSystem.ts#receivingTdPoint',
  },
});

const coefficientsEqual = (actual: number, expected: number): boolean =>
  Math.abs(actual - expected) <= 1e-9;

/**
 * Audit every nonzero Sleeper scoring key against the currently promoted
 * Forecast scoring profile. Missing/unsupported/ambiguous evidence fails
 * closed. Zero-valued settings do not affect scoring and are intentionally
 * excluded from the certification denominator.
 */
export function auditSleeperScoringCoverage(
  scoringSettings: Record<string, unknown> | null | undefined,
): SleeperScoringCoverageAudit {
  const settings = scoringSettings ?? {};
  const entries: ScoringCoverageEntry[] = [];

  for (const [key, rawValue] of Object.entries(settings).sort(([a], [b]) => a.localeCompare(b))) {
    const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);

    if (!Number.isFinite(numericValue)) {
      entries.push({
        key,
        leagueCoefficient: null,
        expectedCoefficient: FORECAST_XFPG_SCORING_CAPABILITIES[key]?.expectedCoefficient ?? null,
        status: 'RED',
        reason: 'invalid_value',
        forecastComponent: FORECAST_XFPG_SCORING_CAPABILITIES[key]?.forecastComponent ?? null,
        evidencePath: FORECAST_XFPG_SCORING_CAPABILITIES[key]?.evidencePath ?? null,
      });
      continue;
    }

    // A zero coefficient contributes no points, so it is not part of the
    // nonzero scoring-coverage denominator.
    if (numericValue === 0) continue;

    const capability = FORECAST_XFPG_SCORING_CAPABILITIES[key];
    if (!capability) {
      entries.push({
        key,
        leagueCoefficient: numericValue,
        expectedCoefficient: null,
        status: 'RED',
        reason: 'unsupported_key',
        forecastComponent: null,
        evidencePath: null,
      });
      continue;
    }

    if (!coefficientsEqual(numericValue, capability.expectedCoefficient)) {
      entries.push({
        key,
        leagueCoefficient: numericValue,
        expectedCoefficient: capability.expectedCoefficient,
        status: 'RED',
        reason: 'coefficient_mismatch',
        forecastComponent: capability.forecastComponent,
        evidencePath: capability.evidencePath,
      });
      continue;
    }

    entries.push({
      key,
      leagueCoefficient: numericValue,
      expectedCoefficient: capability.expectedCoefficient,
      status: 'GREEN',
      reason: 'supported_exact',
      forecastComponent: capability.forecastComponent,
      evidencePath: capability.evidencePath,
    });
  }

  const nonzeroKeyCount = entries.length;
  const coveredKeyCount = entries.filter((entry) => entry.status === 'GREEN').length;
  const coveragePct = nonzeroKeyCount === 0 ? 100 : Number(((coveredKeyCount / nonzeroKeyCount) * 100).toFixed(2));
  const unsupportedKeys = entries.filter((entry) => entry.reason === 'unsupported_key').map((entry) => entry.key);
  const coefficientMismatches = entries.filter((entry) => entry.reason === 'coefficient_mismatch').map((entry) => entry.key);
  const invalidKeys = entries.filter((entry) => entry.reason === 'invalid_value').map((entry) => entry.key);

  return {
    status: entries.every((entry) => entry.status === 'GREEN') ? 'GREEN' : 'RED',
    profileId: 'tiber_forecast_xfpg_ppr_v1',
    authority: 'TIBER-Forecast',
    nonzeroKeyCount,
    coveredKeyCount,
    coveragePct,
    unsupportedKeys,
    coefficientMismatches,
    invalidKeys,
    entries,
  };
}

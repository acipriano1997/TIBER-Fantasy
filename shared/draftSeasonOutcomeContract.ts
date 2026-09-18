export const DRAFT_SEASON_OUTCOME_SCHEMA_VERSION = 'draft_season_outcome_v1' as const;

export type DraftSeasonOutcomeReadiness =
  | 'ready'
  | 'partial'
  | 'stale'
  | 'unavailable'
  | 'not_promoted'
  | 'unsupported';

export type DraftSeasonOutcomeBandPoint = {
  percentile: number;
  fantasyPoints: number;
};

export type DraftSeasonOutcomeSourceReceipt = {
  owner: string;
  artifactOrEndpoint: string;
  schemaOrModelVersion: string | null;
  runOrContentHash: string | null;
  evidenceWindow: string | null;
  observedAt: string | null;
  inputCutoffAt: string | null;
  generatedAt: string | null;
  retrievedAt: string | null;
  validUntil: string | null;
  publicationState: string | null;
  freshness: string | null;
  coverage: string | null;
};

/**
 * Promoted upstream season distribution consumed by draft surfaces.
 *
 * Low / median / high are aliases over a single calibrated season distribution,
 * never three independently generated projections. The producer chooses the low
 * and high percentiles through historical backtesting and records that choice in
 * `bandSelection`. Consumers must not substitute local percentage offsets.
 */
export type DraftSeasonOutcomeArtifact = {
  schemaVersion: typeof DRAFT_SEASON_OUTCOME_SCHEMA_VERSION;
  status: DraftSeasonOutcomeReadiness;
  horizon: 'season';
  playerId: string;
  season: number;
  scoringProfileRef: string;
  scoringProfileHash: string;
  evidenceCutoffAt: string;
  generatedAt: string;
  modelVersion: string;
  calibrationVersion: string;
  supportedPopulation: string;
  bands: {
    low: DraftSeasonOutcomeBandPoint;
    median: DraftSeasonOutcomeBandPoint;
    high: DraftSeasonOutcomeBandPoint;
  };
  bandSelection: {
    method: 'backtest_calibrated_quantiles';
    backtestVersion: string;
    cohort: string;
    sampleSize: number | null;
  };
  sourceReceipts: DraftSeasonOutcomeSourceReceipt[];
};

export type DraftSeasonOutcomeExpectation = {
  playerId: string;
  season: number;
  scoringProfileRef: string;
  scoringProfileHash: string;
  asOf: string;
};

export type DraftSeasonOutcomeBands = {
  status: 'ready' | 'unavailable';
  low: number | null;
  median: number | null;
  high: number | null;
  lowPercentile: number | null;
  medianPercentile: number | null;
  highPercentile: number | null;
  modelVersion: string | null;
  calibrationVersion: string | null;
  backtestVersion: string | null;
  supportedPopulation: string | null;
  generatedAt: string | null;
  blockers: string[];
};

const AUTHORITATIVE_SEASON_FORECAST_OWNER = 'TIBER-Forecast';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validIsoTimestamp(value: string | null | undefined): value is string {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  try {
    return new Date(parsed).toISOString() === value;
  } catch {
    return false;
  }
}

function validBandPoint(point: DraftSeasonOutcomeBandPoint | null | undefined): boolean {
  return Boolean(
    point
      && finite(point.percentile)
      && point.percentile > 0
      && point.percentile < 1
      && finite(point.fantasyPoints)
      && point.fantasyPoints >= 0,
  );
}

export function inspectDraftSeasonOutcomeArtifact(
  artifact: DraftSeasonOutcomeArtifact | null | undefined,
  expected: DraftSeasonOutcomeExpectation,
): string[] {
  if (!artifact) return ['season_outcome_missing'];

  const blockers: string[] = [];

  if (artifact.schemaVersion !== DRAFT_SEASON_OUTCOME_SCHEMA_VERSION) blockers.push('schema_version_mismatch');
  if (artifact.status !== 'ready') blockers.push(`season_outcome_status_${artifact.status}`);
  if (artifact.horizon !== 'season') blockers.push('horizon_mismatch');
  if (!artifact.playerId || artifact.playerId !== expected.playerId) blockers.push('player_identity_mismatch');
  if (!Number.isInteger(artifact.season) || artifact.season !== expected.season) blockers.push('season_mismatch');
  if (!artifact.scoringProfileRef || artifact.scoringProfileRef !== expected.scoringProfileRef) blockers.push('scoring_profile_mismatch');
  if (!artifact.scoringProfileHash || artifact.scoringProfileHash !== expected.scoringProfileHash) blockers.push('scoring_profile_hash_mismatch');
  if (!validIsoTimestamp(artifact.evidenceCutoffAt)) blockers.push('evidence_cutoff_missing_or_invalid');
  if (!validIsoTimestamp(artifact.generatedAt)) blockers.push('generated_at_missing_or_invalid');
  if (!artifact.modelVersion) blockers.push('model_version_missing');
  if (!artifact.calibrationVersion) blockers.push('calibration_version_missing');
  if (!artifact.supportedPopulation) blockers.push('supported_population_missing');

  const low = artifact.bands?.low;
  const median = artifact.bands?.median;
  const high = artifact.bands?.high;
  if (!validBandPoint(low)) blockers.push('low_band_invalid');
  if (!validBandPoint(median)) blockers.push('median_band_invalid');
  if (!validBandPoint(high)) blockers.push('high_band_invalid');

  if (validBandPoint(low) && validBandPoint(median) && validBandPoint(high)) {
    if (!(low.percentile < median.percentile && median.percentile < high.percentile)) {
      blockers.push('band_percentiles_not_ordered');
    }
    if (Math.abs(median.percentile - 0.5) > 1e-9) blockers.push('median_percentile_not_p50');
    if (!(low.fantasyPoints <= median.fantasyPoints && median.fantasyPoints <= high.fantasyPoints)) {
      blockers.push('band_points_not_ordered');
    }
  }

  if (artifact.bandSelection?.method !== 'backtest_calibrated_quantiles') {
    blockers.push('band_selection_not_backtest_calibrated');
  }
  if (!artifact.bandSelection?.backtestVersion) blockers.push('backtest_version_missing');
  if (!artifact.bandSelection?.cohort) blockers.push('backtest_cohort_missing');
  if (
    artifact.bandSelection?.sampleSize !== null
    && artifact.bandSelection?.sampleSize !== undefined
    && (!Number.isInteger(artifact.bandSelection.sampleSize) || artifact.bandSelection.sampleSize <= 0)
  ) blockers.push('backtest_sample_size_invalid');

  if (!validIsoTimestamp(expected.asOf)) {
    blockers.push('expected_as_of_invalid');
  } else if (validIsoTimestamp(artifact.evidenceCutoffAt) && artifact.evidenceCutoffAt > expected.asOf) {
    blockers.push('future_evidence_leakage');
  }

  const authoritativeReceipts = artifact.sourceReceipts?.filter(
    (receipt) => receipt.owner === AUTHORITATIVE_SEASON_FORECAST_OWNER,
  ) ?? [];

  if (!authoritativeReceipts.length) {
    blockers.push('authoritative_forecast_receipt_missing');
  } else {
    const validReceipt = authoritativeReceipts.some((receipt) => {
      if (!receipt.artifactOrEndpoint || !receipt.runOrContentHash) return false;
      if (receipt.schemaOrModelVersion !== artifact.modelVersion) return false;
      if (receipt.inputCutoffAt !== artifact.evidenceCutoffAt) return false;
      if (receipt.generatedAt !== artifact.generatedAt) return false;
      if (!validIsoTimestamp(receipt.observedAt)) return false;
      if (!validIsoTimestamp(receipt.retrievedAt)) return false;
      if (!validIsoTimestamp(receipt.validUntil)) return false;
      if (receipt.publicationState !== 'promoted') return false;
      if (receipt.freshness !== 'fresh') return false;
      if (receipt.coverage !== 'supported') return false;
      if (validIsoTimestamp(expected.asOf) && receipt.retrievedAt! > expected.asOf) return false;
      return true;
    });
    if (!validReceipt) blockers.push('authoritative_forecast_receipt_invalid');
  }

  return [...new Set(blockers)];
}

export function buildDraftSeasonOutcomeBands(
  artifact: DraftSeasonOutcomeArtifact | null | undefined,
  expected: DraftSeasonOutcomeExpectation,
): DraftSeasonOutcomeBands {
  const blockers = inspectDraftSeasonOutcomeArtifact(artifact, expected);
  if (!artifact || blockers.length) {
    return {
      status: 'unavailable',
      low: null,
      median: null,
      high: null,
      lowPercentile: null,
      medianPercentile: null,
      highPercentile: null,
      modelVersion: artifact?.modelVersion ?? null,
      calibrationVersion: artifact?.calibrationVersion ?? null,
      backtestVersion: artifact?.bandSelection?.backtestVersion ?? null,
      supportedPopulation: artifact?.supportedPopulation ?? null,
      generatedAt: artifact?.generatedAt ?? null,
      blockers,
    };
  }

  return {
    status: 'ready',
    low: artifact.bands.low.fantasyPoints,
    median: artifact.bands.median.fantasyPoints,
    high: artifact.bands.high.fantasyPoints,
    lowPercentile: artifact.bands.low.percentile,
    medianPercentile: artifact.bands.median.percentile,
    highPercentile: artifact.bands.high.percentile,
    modelVersion: artifact.modelVersion,
    calibrationVersion: artifact.calibrationVersion,
    backtestVersion: artifact.bandSelection.backtestVersion,
    supportedPopulation: artifact.supportedPopulation,
    generatedAt: artifact.generatedAt,
    blockers: [],
  };
}

import Papa from 'papaparse';
import { ZodError } from 'zod';
import { assessAndLogArtifactFreshness } from '../artifactFreshness';
import {
  CanonicalBreakoutAccuracyCertification,
  CanonicalSignalValidationExportManifest,
  CanonicalSignalValidationExports,
  CanonicalWrBestRecipeSummary,
  SignalValidationIntegrationError,
  TiberBreakoutAccuracyCertification,
  TiberSignalPromotion,
  TiberWrBestRecipeSummary,
  TiberWrBreakoutLab,
  TiberWrBreakoutSignalRow,
  signalValidationExportManifestSchema,
  wrBestRecipeSummarySchema,
} from './types';

const BREAKOUT_CONTEXT_KEYS = [
  'breakout_context',
  'breakout_context_default',
  'breakout_context_label',
  'breakout_note',
  'breakout_reason',
  'breakout_description',
] as const;

const PLAYER_ID_KEYS = ['player_id', 'gsis_id', 'player_gsis_id'] as const;
const TEAM_KEYS = ['team', 'feature_team', 'team_id', 'team_abbr'] as const;
const BEST_RECIPE_KEYS = ['best_recipe_name', 'recipe_name', 'top_recipe_name'] as const;
const PRIMARY_PROBABILITY_KEYS = [
  'breakout_probability',
  'calibrated_breakout_probability',
  'primary_breakout_probability',
] as const;
const PRIMARY_PROBABILITY_TARGET_KEYS = [
  'breakout_probability_target',
  'primary_breakout_probability_target',
  'probability_target',
] as const;

function pickString(record: Record<string, string | undefined>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (value != null && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

function parseNumber(value: string | undefined): number | null {
  if (value == null || value.trim() === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseProbability(value: string | undefined, field: string, playerName: string): number | null {
  if (value == null || value.trim() === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new SignalValidationIntegrationError(
      'invalid_payload',
      `Signal Validation probability ${field} for ${playerName} must be a finite value between 0 and 1.`,
      502,
      { field, playerName, value },
    );
  }

  return numeric;
}

function pickProbability(
  record: Record<string, string | undefined>,
  keys: readonly string[],
  playerName: string,
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (value != null && value.trim() !== '') {
      return parseProbability(value, key, playerName);
    }
  }

  return null;
}

function toRawFields(record: Record<string, string | undefined>): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value == null || value === '' ? null : value]),
  );
}

function nearlyEqual(left: number, right: number, tolerance: number): boolean {
  return Math.abs(left - right) <= tolerance;
}

export function parseWrBestRecipeSummary(payload: unknown): CanonicalWrBestRecipeSummary {
  try {
    return wrBestRecipeSummarySchema.parse(payload);
  } catch (error) {
    throw new SignalValidationIntegrationError(
      'invalid_payload',
      'Signal Validation best recipe summary does not match the expected contract.',
      502,
      error instanceof ZodError ? error.flatten() : error,
    );
  }
}

export function parseSignalValidationExportManifest(payload: unknown): CanonicalSignalValidationExportManifest {
  try {
    return signalValidationExportManifestSchema.parse(payload);
  } catch (error) {
    throw new SignalValidationIntegrationError(
      'invalid_payload',
      'Signal Validation export manifest does not match the promoted-signal contract.',
      502,
      error instanceof ZodError ? error.flatten() : error,
    );
  }
}

export function parseWrPlayerSignalCardsCsv(csv: string): Record<string, string | undefined>[] {
  const result = Papa.parse<Record<string, string | undefined>>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    throw new SignalValidationIntegrationError(
      'malformed_export',
      'Signal Validation player signal cards CSV could not be parsed cleanly.',
      502,
      result.errors,
    );
  }

  return result.data;
}

export function normalizeWrSignalCardRows(rows: Record<string, string | undefined>[], season: number): TiberWrBreakoutSignalRow[] {
  const normalized = rows.map((record) => {
    const playerName = record.player_name?.trim();

    if (!playerName) {
      throw new SignalValidationIntegrationError(
        'invalid_payload',
        'Signal Validation player signal cards are missing required player_name values.',
        502,
        record,
      );
    }

    return {
      candidateRank: parseNumber(record.candidate_rank),
      finalSignalScore: parseNumber(record.final_signal_score),
      playerName,
      playerId: pickString(record, PLAYER_ID_KEYS),
      team: pickString(record, TEAM_KEYS),
      season: parseNumber(record.season) ?? parseNumber(record.feature_season) ?? season,
      bestRecipeName: pickString(record, BEST_RECIPE_KEYS),
      breakoutLabelDefault: pickString(record, ['breakout_label_default']),
      breakoutContext: pickString(record, BREAKOUT_CONTEXT_KEYS),
      probabilities: {
        primary: pickProbability(record, PRIMARY_PROBABILITY_KEYS, playerName),
        primaryTarget: pickString(record, PRIMARY_PROBABILITY_TARGET_KEYS),
        top12Next4w: parseProbability(record.p_top_12_next_4w, 'p_top_12_next_4w', playerName),
        top24Next4w: parseProbability(record.p_top_24_next_4w, 'p_top_24_next_4w', playerName),
        rosTierJump: parseProbability(record.p_ros_tier_jump, 'p_ros_tier_jump', playerName),
        adpOutperformance12Slots: parseProbability(
          record.p_adp_outperformance_12_slots,
          'p_adp_outperformance_12_slots',
          playerName,
        ),
        roleExpansion: parseProbability(record.p_role_expansion, 'p_role_expansion', playerName),
      },
      components: {
        usage: parseNumber(record.usage_signal),
        efficiency: parseNumber(record.efficiency_signal),
        development: parseNumber(record.development_signal),
        stability: parseNumber(record.stability_signal),
        cohort: parseNumber(record.cohort_signal),
        role: parseNumber(record.role_signal),
        penalty: parseNumber(record.penalty_signal),
      },
      rawFields: toRawFields(record),
    } satisfies TiberWrBreakoutSignalRow;
  });

  return normalized.sort((left, right) => {
    if (left.candidateRank != null && right.candidateRank != null && left.candidateRank !== right.candidateRank) {
      return left.candidateRank - right.candidateRank;
    }

    if (left.candidateRank != null && right.candidateRank == null) return -1;
    if (left.candidateRank == null && right.candidateRank != null) return 1;

    const scoreDelta = (right.finalSignalScore ?? Number.NEGATIVE_INFINITY) - (left.finalSignalScore ?? Number.NEGATIVE_INFINITY);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.playerName.localeCompare(right.playerName);
  });
}

export function normalizeWrBestRecipeSummary(
  payload: unknown,
  fallbackSeason: number,
  options: { includeRawCanonical?: boolean } = {},
): TiberWrBestRecipeSummary {
  const canonical = parseWrBestRecipeSummary(payload);
  const bestRecipeName = canonical.best_recipe_name ?? canonical.recipe_name ?? canonical.name;
  const keyMetrics = canonical.key_metrics;

  if (!bestRecipeName) {
    throw new SignalValidationIntegrationError(
      'invalid_payload',
      'Signal Validation best recipe summary is missing a recipe name.',
      502,
      canonical,
    );
  }

  return {
    bestRecipeName,
    season: canonical.season ?? fallbackSeason,
    validationScore: canonical.validation_score ?? null,
    winRate: canonical.win_rate ?? null,
    hitRate: canonical.hit_rate ?? null,
    candidateCount: canonical.candidate_count ?? keyMetrics?.candidate_count ?? null,
    breakoutCount: keyMetrics?.breakout_count ?? null,
    precisionAt20: keyMetrics?.precision_at_20 ?? null,
    recallAt20: keyMetrics?.recall_at_20 ?? null,
    averageBreakoutRank: keyMetrics?.average_breakout_rank ?? null,
    summary: canonical.summary ?? null,
    generatedAt: canonical.generated_at ?? null,
    modelVersion: canonical.model_version ?? canonical.scoring_version ?? null,
    ...(options.includeRawCanonical ? { rawCanonical: canonical } : {}),
  };
}

function normalizeAccuracyCertification(
  certification: CanonicalBreakoutAccuracyCertification | undefined,
): TiberBreakoutAccuracyCertification | null {
  if (!certification) {
    return null;
  }

  const truePositives = certification.held_out_true_positives;
  const falsePositives = certification.held_out_false_positives;
  const falseNegatives = certification.held_out_false_negatives;
  const trueNegatives = certification.held_out_true_negatives;
  const predictedPositiveCount = truePositives + falsePositives;
  const actualPositiveCount = truePositives + falseNegatives;
  const evaluableCount = truePositives + falsePositives + falseNegatives + trueNegatives;

  const recomputedPrecision = predictedPositiveCount > 0 ? truePositives / predictedPositiveCount : 0;
  const recomputedBaseRate = evaluableCount > 0 ? actualPositiveCount / evaluableCount : 0;
  const recomputedPrecisionLift = recomputedBaseRate > 0 ? recomputedPrecision / recomputedBaseRate : 0;
  const metricsConsistent =
    evaluableCount > 0 &&
    predictedPositiveCount > 0 &&
    certification.held_out_positive_events === actualPositiveCount &&
    nearlyEqual(certification.held_out_precision, recomputedPrecision, 0.005) &&
    nearlyEqual(certification.held_out_base_rate, recomputedBaseRate, 0.005) &&
    nearlyEqual(certification.precision_lift, recomputedPrecisionLift, 0.02);

  const consumerThresholdsPassed =
    certification.passed === true &&
    certification.chronological_out_of_sample === true &&
    certification.final_holdout_untouched === true &&
    certification.leakage_checks_passed === true &&
    certification.calibration_passed === true &&
    certification.challenger_beaten === true &&
    metricsConsistent &&
    actualPositiveCount >= 30 &&
    recomputedPrecision >= 0.15 &&
    recomputedPrecisionLift > 1.5 &&
    certification.precision_lift_lower_95 > 1.0 &&
    certification.brier_score < certification.base_rate_brier_score &&
    certification.log_loss < certification.base_rate_log_loss;

  return {
    certificationVersion: certification.certification_version,
    producerPassed: certification.passed,
    chronologicalOutOfSample: certification.chronological_out_of_sample,
    finalHoldoutUntouched: certification.final_holdout_untouched,
    leakageChecksPassed: certification.leakage_checks_passed,
    calibrationPassed: certification.calibration_passed,
    challengerBeaten: certification.challenger_beaten,
    heldOutTruePositives: truePositives,
    heldOutFalsePositives: falsePositives,
    heldOutFalseNegatives: falseNegatives,
    heldOutTrueNegatives: trueNegatives,
    heldOutPositiveEvents: certification.held_out_positive_events,
    heldOutPrecision: certification.held_out_precision,
    heldOutBaseRate: certification.held_out_base_rate,
    precisionLift: certification.precision_lift,
    precisionLiftLower95: certification.precision_lift_lower_95,
    brierScore: certification.brier_score,
    baseRateBrierScore: certification.base_rate_brier_score,
    logLoss: certification.log_loss,
    baseRateLogLoss: certification.base_rate_log_loss,
    recomputedPrecision,
    recomputedBaseRate,
    recomputedPrecisionLift,
    metricsConsistent,
    consumerThresholdsPassed,
  };
}

function normalizePromotion(
  payload: unknown,
  requestedTargetSeason?: number,
): TiberSignalPromotion | undefined {
  if (payload == null) {
    return undefined;
  }

  const manifest = parseSignalValidationExportManifest(payload);
  const promotion = manifest.promotion;
  const status = promotion?.status ?? 'unverified';
  const backtestPassed = promotion?.backtest_passed === true;
  const prescriptiveValidationPassed = promotion?.prescriptive_validation_passed === true;
  const targetMatches = requestedTargetSeason == null || manifest.outcome_season === requestedTargetSeason;
  const accuracyCertification = normalizeAccuracyCertification(promotion?.accuracy_certification);

  return {
    featureSeason: manifest.feature_season,
    targetSeason: manifest.outcome_season,
    status,
    backtestPassed,
    prescriptiveValidationPassed,
    promotedAt: promotion?.promoted_at ?? null,
    accuracyCertification,
    draftTagEligible:
      status === 'promoted' &&
      backtestPassed &&
      prescriptiveValidationPassed &&
      targetMatches &&
      accuracyCertification?.consumerThresholdsPassed === true,
  };
}

export function isAffirmativeBreakoutLabel(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return !['false', 'no', 'none', '0', 'not_breakout', 'not breakout'].includes(normalized);
}

export function adaptSignalValidationExports(
  payload: CanonicalSignalValidationExports,
  options: { includeRawCanonical?: boolean; exportDirectory: string },
): TiberWrBreakoutLab {
  const rows = normalizeWrSignalCardRows(parseWrPlayerSignalCardsCsv(payload.playerSignalCardsCsv), payload.season);
  const bestRecipeSummary = normalizeWrBestRecipeSummary(payload.bestRecipeSummary, payload.season, {
    includeRawCanonical: options.includeRawCanonical,
  });
  const promotion = normalizePromotion(payload.exportManifest, payload.requestedTargetSeason);

  return {
    season: payload.season,
    availableSeasons: payload.availableSeasons,
    rows,
    bestRecipeSummary,
    ...(promotion ? { promotion } : {}),
    source: {
      provider: 'signal-validation-model',
      exportDirectory: options.exportDirectory,
    },
    freshness: assessAndLogArtifactFreshness({
      artifact: 'signal_validation_wr_exports',
      generatedAt: bestRecipeSummary.generatedAt,
    }),
  };
}

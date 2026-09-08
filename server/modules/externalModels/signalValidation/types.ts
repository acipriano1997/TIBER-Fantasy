import { z } from 'zod';
import type { ArtifactFreshness } from '../artifactFreshness';

export const wrBestRecipeSummarySchema = z
  .object({
    best_recipe_name: z.string().min(1).optional(),
    recipe_name: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    season: z.number().int().min(2000).max(2100).optional(),
    generated_at: z.string().optional(),
    model_version: z.string().optional(),
    scoring_version: z.string().optional(),
    validation_score: z.number().finite().optional(),
    win_rate: z.number().finite().optional(),
    hit_rate: z.number().finite().optional(),
    candidate_count: z.number().int().nonnegative().optional(),
    summary: z.string().optional(),
    notes: z.array(z.string()).optional(),
    key_metrics: z
      .object({
        candidate_count: z.number().int().nonnegative().optional(),
        breakout_count: z.number().int().nonnegative().optional(),
        precision_at_10: z.number().finite().optional(),
        precision_at_20: z.number().finite().optional(),
        precision_at_30: z.number().finite().optional(),
        recall_at_10: z.number().finite().optional(),
        recall_at_20: z.number().finite().optional(),
        recall_at_30: z.number().finite().optional(),
        average_breakout_rank: z.number().finite().optional(),
        median_breakout_rank: z.number().finite().optional(),
        false_positives_in_top_20: z.number().int().nonnegative().optional(),
        false_negatives_outside_top_30: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const breakoutAccuracyCertificationSchema = z.object({
  certification_version: z.string().min(1),
  passed: z.boolean(),
  chronological_out_of_sample: z.boolean(),
  final_holdout_untouched: z.boolean(),
  leakage_checks_passed: z.boolean(),
  calibration_passed: z.boolean(),
  challenger_beaten: z.boolean(),
  held_out_true_positives: z.number().int().nonnegative(),
  held_out_false_positives: z.number().int().nonnegative(),
  held_out_false_negatives: z.number().int().nonnegative(),
  held_out_true_negatives: z.number().int().nonnegative(),
  held_out_positive_events: z.number().int().nonnegative(),
  held_out_precision: z.number().finite().min(0).max(1),
  held_out_base_rate: z.number().finite().gt(0).max(1),
  precision_lift: z.number().finite().nonnegative(),
  precision_lift_lower_95: z.number().finite().nonnegative(),
  brier_score: z.number().finite().min(0).max(1),
  base_rate_brier_score: z.number().finite().min(0).max(1),
  log_loss: z.number().finite().nonnegative(),
  base_rate_log_loss: z.number().finite().nonnegative(),
}).passthrough();

export const signalValidationExportManifestSchema = z
  .object({
    feature_season: z.number().int().min(2000).max(2100),
    outcome_season: z.number().int().min(2000).max(2100),
    generated_at: z.string().optional(),
    artifacts: z
      .array(
        z
          .object({
            artifact_name: z.string().min(1),
            relative_path: z.string().min(1),
            format: z.string().min(1).optional(),
          })
          .passthrough(),
      )
      .optional(),
    promotion: z
      .object({
        status: z.enum(['promoted', 'candidate', 'rejected']),
        backtest_passed: z.boolean(),
        prescriptive_validation_passed: z.boolean(),
        promoted_at: z.string().optional(),
        accuracy_certification: breakoutAccuracyCertificationSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type CanonicalWrBestRecipeSummary = z.infer<typeof wrBestRecipeSummarySchema>;
export type CanonicalSignalValidationExportManifest = z.infer<typeof signalValidationExportManifestSchema>;
export type CanonicalBreakoutAccuracyCertification = z.infer<typeof breakoutAccuracyCertificationSchema>;

export interface CanonicalSignalValidationExports {
  season: number;
  availableSeasons: number[];
  playerSignalCardsCsv: string;
  bestRecipeSummary: unknown;
  exportManifest?: unknown;
  requestedTargetSeason?: number;
}

export interface SignalValidationComponentSignals {
  usage: number | null;
  efficiency: number | null;
  development: number | null;
  stability: number | null;
  cohort: number | null;
  role: number | null;
  penalty: number | null;
}

export interface TiberBreakoutProbabilitySet {
  /** Producer-calibrated probability used as the compact draft-badge headline. */
  primary: number | null;
  /** Explicit producer-defined event measured by `primary`; never inferred locally. */
  primaryTarget: string | null;
  top12Next4w: number | null;
  top24Next4w: number | null;
  rosTierJump: number | null;
  adpOutperformance12Slots: number | null;
  roleExpansion: number | null;
}

export interface TiberBreakoutDraftProbabilitySet extends Omit<TiberBreakoutProbabilitySet, 'primary' | 'primaryTarget'> {
  primary: number;
  primaryTarget: string;
}

export interface TiberWrBreakoutSignalRow {
  candidateRank: number | null;
  finalSignalScore: number | null;
  playerName: string;
  playerId: string | null;
  team: string | null;
  season: number | null;
  bestRecipeName: string | null;
  breakoutLabelDefault: string | null;
  breakoutContext: string | null;
  probabilities: TiberBreakoutProbabilitySet;
  components: SignalValidationComponentSignals;
  rawFields: Record<string, string | null>;
}

export interface TiberWrBestRecipeSummary {
  bestRecipeName: string;
  season: number | null;
  validationScore: number | null;
  winRate: number | null;
  hitRate: number | null;
  candidateCount: number | null;
  breakoutCount: number | null;
  precisionAt20: number | null;
  recallAt20: number | null;
  averageBreakoutRank: number | null;
  summary: string | null;
  generatedAt: string | null;
  modelVersion: string | null;
  rawCanonical?: CanonicalWrBestRecipeSummary;
}

export interface TiberBreakoutAccuracyCertification {
  certificationVersion: string;
  producerPassed: boolean;
  chronologicalOutOfSample: boolean;
  finalHoldoutUntouched: boolean;
  leakageChecksPassed: boolean;
  calibrationPassed: boolean;
  challengerBeaten: boolean;
  heldOutTruePositives: number;
  heldOutFalsePositives: number;
  heldOutFalseNegatives: number;
  heldOutTrueNegatives: number;
  heldOutPositiveEvents: number;
  heldOutPrecision: number;
  heldOutBaseRate: number;
  precisionLift: number;
  precisionLiftLower95: number;
  brierScore: number;
  baseRateBrierScore: number;
  logLoss: number;
  baseRateLogLoss: number;
  recomputedPrecision: number;
  recomputedBaseRate: number;
  recomputedPrecisionLift: number;
  metricsConsistent: boolean;
  consumerThresholdsPassed: boolean;
}

export interface TiberSignalPromotion {
  featureSeason: number;
  targetSeason: number;
  status: 'promoted' | 'candidate' | 'rejected' | 'unverified';
  backtestPassed: boolean;
  prescriptiveValidationPassed: boolean;
  promotedAt: string | null;
  accuracyCertification: TiberBreakoutAccuracyCertification | null;
  draftTagEligible: boolean;
}

export interface TiberWrBreakoutLab {
  season: number;
  availableSeasons: number[];
  rows: TiberWrBreakoutSignalRow[];
  bestRecipeSummary: TiberWrBestRecipeSummary;
  promotion?: TiberSignalPromotion;
  source: {
    provider: 'signal-validation-model';
    exportDirectory: string;
  };
  /** Warn-only artifact age assessment (Issue #192 M3); additive, not enforced. */
  freshness?: ArtifactFreshness;
}

export interface TiberBreakoutDraftTag {
  playerId: string | null;
  playerName: string;
  team: string | null;
  targetSeason: number;
  /** Stable text label retained for existing consumers. */
  label: string;
  /** Ready-to-render compact badge text, e.g. `2026 Breakout · 73%`. */
  displayLabel: string;
  probability: {
    value: number;
    percent: number;
    target: string;
  };
  probabilities: TiberBreakoutDraftProbabilitySet;
  candidateRank: number | null;
  finalSignalScore: number | null;
  breakoutContext: string | null;
  modelVersion: string | null;
  generatedAt: string | null;
}

export type SignalValidationErrorCode =
  | 'config_error'
  | 'not_found'
  | 'not_promoted'
  | 'invalid_payload'
  | 'malformed_export'
  | 'upstream_unavailable';

export class SignalValidationIntegrationError extends Error {
  readonly code: SignalValidationErrorCode;
  readonly status: number;
  readonly cause?: unknown;
  readonly availableSeasons?: number[];

  constructor(code: SignalValidationErrorCode, message: string, status: number, cause?: unknown, availableSeasons?: number[]) {
    super(message);
    this.name = 'SignalValidationIntegrationError';
    this.code = code;
    this.status = status;
    this.cause = cause;
    this.availableSeasons = availableSeasons;
  }
}

export interface SignalValidationClientConfig {
  exportsDir?: string;
  enabled?: boolean;
}

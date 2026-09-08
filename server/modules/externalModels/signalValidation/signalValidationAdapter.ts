import Papa from 'papaparse';
import { ZodError } from 'zod';
import { assessAndLogArtifactFreshness } from '../artifactFreshness';
import {
  CanonicalSignalValidationExportManifest,
  CanonicalSignalValidationExports,
  CanonicalWrBestRecipeSummary,
  SignalValidationIntegrationError,
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
const TEAM_KEYS = ['team', 'team_id', 'team_abbr'] as const;
const BEST_RECIPE_KEYS = ['best_recipe_name', 'recipe_name', 'top_recipe_name'] as const;

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

function toRawFields(record: Record<string, string | undefined>): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value == null || value === '' ? null : value]),
  );
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
    candidateCount: canonical.candidate_count ?? null,
    summary: canonical.summary ?? null,
    generatedAt: canonical.generated_at ?? null,
    modelVersion: canonical.model_version ?? null,
    ...(options.includeRawCanonical ? { rawCanonical: canonical } : {}),
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

  return {
    featureSeason: manifest.feature_season,
    targetSeason: manifest.outcome_season,
    status,
    backtestPassed,
    prescriptiveValidationPassed,
    promotedAt: promotion?.promoted_at ?? null,
    draftTagEligible:
      status === 'promoted' &&
      backtestPassed &&
      prescriptiveValidationPassed &&
      targetMatches,
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

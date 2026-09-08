import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';

const DEFAULT_EXPORTS_DIR = path.join(process.cwd(), 'data', 'signal-validation');

const bustRowSchema = z.object({
  player_id: z.string().min(1),
  season: z.number().int().min(2000).max(2100),
  bust_probability: z.number().finite().min(0).max(1),
  bust_severity_expected: z.number().finite().nullable().optional(),
  bust_mechanisms: z.array(z.string().min(1)).default([]),
  model_version: z.string().min(1),
  calibration_version: z.string().min(1),
  as_of: z.string().min(1),
  promotion_passed: z.boolean(),
  backtest_passed: z.boolean(),
  prescriptive_validation_passed: z.boolean(),
  provenance: z.array(z.unknown()).min(1),
  freshness_context: z.any().refine((value) => value !== undefined && value !== null, {
    message: 'freshness_context is required',
  }),
  label_definition_version: z.string().min(1),
  display_eligible: z.boolean(),
}).passthrough();

const bustArtifactSchema = z.union([
  z.array(bustRowSchema),
  z.object({ rows: z.array(bustRowSchema) }).passthrough(),
]);

const promotionManifestSchema = z.object({
  target_season: z.number().int().min(2000).max(2100).optional(),
  season: z.number().int().min(2000).max(2100).optional(),
  promotion_passed: z.boolean(),
  backtest_passed: z.boolean(),
  prescriptive_validation_passed: z.boolean(),
  model_version: z.string().min(1),
  calibration_version: z.string().min(1),
  label_definition_version: z.string().min(1),
}).passthrough().refine((value) => value.target_season != null || value.season != null, {
  message: 'Draft bust promotion manifest must identify its target season.',
});

export type DraftBustTag = {
  playerId: string;
  targetSeason: number;
  probability: {
    value: number;
    percent: number;
  };
  severityExpected: number | null;
  mechanisms: string[];
  modelVersion: string;
  calibrationVersion: string;
  labelDefinitionVersion: string;
  asOf: string;
  provenance: unknown[];
  freshnessContext: unknown;
};

export class DraftBustEvidenceError extends Error {
  constructor(
    public readonly code: 'not_found' | 'not_promoted' | 'invalid_payload' | 'upstream_unavailable',
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DraftBustEvidenceError';
  }
}

function targetSeasonOf(manifest: z.infer<typeof promotionManifestSchema>): number {
  return manifest.target_season ?? manifest.season!;
}

function explicitStale(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().toLowerCase() === 'stale';
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.stale === true) return true;
  return typeof record.status === 'string' && record.status.trim().toLowerCase() === 'stale';
}

async function readFirstJson(paths: string[], label: string): Promise<{ value: unknown; sourcePath: string }> {
  let lastError: unknown;
  for (const candidate of paths) {
    try {
      return { value: JSON.parse(await fs.readFile(candidate, 'utf8')), sourcePath: candidate };
    } catch (error) {
      lastError = error;
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') continue;
      if (error instanceof SyntaxError) {
        throw new DraftBustEvidenceError('invalid_payload', `${label} is not valid JSON.`, 502, { path: candidate });
      }
      throw new DraftBustEvidenceError('upstream_unavailable', `Unable to read ${label}.`, 503, error);
    }
  }

  throw new DraftBustEvidenceError(
    'not_found',
    `${label} was not found.`,
    404,
    { candidates: paths, lastError: lastError instanceof Error ? lastError.message : lastError },
  );
}

export async function readPromotedDraftBustTags(
  targetSeason: number,
  options: { exportsDir?: string } = {},
): Promise<{ tags: DraftBustTag[]; source: { artifactPath: string; manifestPath: string } }> {
  const exportsDir = options.exportsDir
    ?? process.env.DRAFT_BUST_EXPORTS_DIR
    ?? process.env.SIGNAL_VALIDATION_EXPORTS_DIR
    ?? DEFAULT_EXPORTS_DIR;

  const artifactName = `${targetSeason}_bust_scores.json`;
  const manifestName = `${targetSeason}_bust_signal_promotion.json`;
  const artifactRead = await readFirstJson([
    path.join(exportsDir, artifactName),
    path.join(exportsDir, 'exports', artifactName),
  ], `Draft bust artifact for ${targetSeason}`);
  const manifestRead = await readFirstJson([
    path.join(exportsDir, manifestName),
    path.join(exportsDir, 'output', 'manifests', manifestName),
  ], `Draft bust promotion manifest for ${targetSeason}`);

  const parsedManifest = promotionManifestSchema.safeParse(manifestRead.value);
  if (!parsedManifest.success) {
    throw new DraftBustEvidenceError(
      'invalid_payload',
      'Draft bust promotion manifest failed its required contract.',
      502,
      parsedManifest.error.flatten(),
    );
  }

  const manifest = parsedManifest.data;
  if (targetSeasonOf(manifest) !== targetSeason) {
    throw new DraftBustEvidenceError('not_found', `Draft bust manifest does not target season ${targetSeason}.`, 404);
  }

  if (!manifest.promotion_passed || !manifest.backtest_passed || !manifest.prescriptive_validation_passed) {
    throw new DraftBustEvidenceError(
      'not_promoted',
      `Draft bust evidence for ${targetSeason} has not passed every promotion gate.`,
      409,
    );
  }

  const parsedArtifact = bustArtifactSchema.safeParse(artifactRead.value);
  if (!parsedArtifact.success) {
    throw new DraftBustEvidenceError(
      'invalid_payload',
      'Draft bust artifact failed its required row contract.',
      502,
      parsedArtifact.error.flatten(),
    );
  }

  const rows = Array.isArray(parsedArtifact.data) ? parsedArtifact.data : parsedArtifact.data.rows;
  const seen = new Set<string>();
  const tags: DraftBustTag[] = [];

  for (const row of rows) {
    if (row.season !== targetSeason) continue;
    if (row.model_version !== manifest.model_version
      || row.calibration_version !== manifest.calibration_version
      || row.label_definition_version !== manifest.label_definition_version) {
      throw new DraftBustEvidenceError(
        'invalid_payload',
        `Draft bust row versions do not match the promoted ${targetSeason} manifest.`,
        502,
        { playerId: row.player_id },
      );
    }

    if (seen.has(row.player_id)) {
      throw new DraftBustEvidenceError(
        'invalid_payload',
        `Draft bust artifact contains duplicate canonical player id ${row.player_id}.`,
        502,
      );
    }
    seen.add(row.player_id);

    const eligible = row.bust_probability > 0
      && row.promotion_passed
      && row.backtest_passed
      && row.prescriptive_validation_passed
      && row.display_eligible
      && !explicitStale(row.freshness_context);
    if (!eligible) continue;

    tags.push({
      playerId: row.player_id,
      targetSeason,
      probability: {
        value: row.bust_probability,
        percent: Math.round(row.bust_probability * 100),
      },
      severityExpected: row.bust_severity_expected ?? null,
      mechanisms: row.bust_mechanisms,
      modelVersion: row.model_version,
      calibrationVersion: row.calibration_version,
      labelDefinitionVersion: row.label_definition_version,
      asOf: row.as_of,
      provenance: row.provenance,
      freshnessContext: row.freshness_context,
    });
  }

  return {
    tags,
    source: {
      artifactPath: artifactRead.sourcePath,
      manifestPath: manifestRead.sourcePath,
    },
  };
}

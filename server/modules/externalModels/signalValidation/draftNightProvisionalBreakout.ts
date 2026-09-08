import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const nullableProbabilitySchema = z.number().finite().min(0).max(1).nullable();

export const provisionalBreakoutTagSchema = z.object({
  playerId: z.string().min(1).nullable(),
  playerName: z.string().min(1),
  team: z.string().min(1).nullable(),
  targetSeason: z.number().int().min(2000).max(2100),
  label: z.string().min(1),
  displayLabel: z.string().min(1),
  probability: z.object({
    value: z.number().finite().min(0).max(1),
    percent: z.number().int().min(0).max(100),
    target: z.string().min(1),
  }),
  probabilities: z.object({
    primary: z.number().finite().min(0).max(1),
    primaryTarget: z.string().min(1),
    top12Next4w: nullableProbabilitySchema,
    top24Next4w: nullableProbabilitySchema,
    rosTierJump: nullableProbabilitySchema,
    adpOutperformance12Slots: nullableProbabilitySchema,
    roleExpansion: nullableProbabilitySchema,
  }),
  candidateRank: z.number().int().positive().nullable(),
  finalSignalScore: z.number().finite().nullable(),
  breakoutContext: z.string().nullable(),
  modelVersion: z.string().nullable(),
  generatedAt: z.string().nullable(),
  evidenceStatus: z.literal('provisional_research_only'),
  signalKind: z.enum(['breakout', 'rebound']),
}).strict();

export const provisionalBreakoutArtifactSchema = z.object({
  schema_version: z.literal('draft_night_provisional_breakout_v1'),
  target_season: z.number().int().min(2000).max(2100),
  feature_season: z.number().int().min(2000).max(2100),
  status: z.literal('provisional_research_only'),
  model_id: z.string().min(1),
  probability_target: z.string().min(1),
  action_threshold: z.number().finite().min(0).max(1),
  training_rows: z.number().int().positive(),
  training_positive_events: z.number().int().positive(),
  training_smoothed_event_rate: z.number().finite().gt(0).lt(1),
  source_artifact_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  holdout_evidence: z.object({
    precision: z.number().finite().min(0).max(1),
    recall: z.number().finite().min(0).max(1),
    lift: z.number().finite().positive(),
    positive_events: z.number().int().positive(),
    certified: z.literal(false),
    reason: z.string().min(1),
  }).strict(),
  tags: z.array(provisionalBreakoutTagSchema),
}).strict();

export type DraftNightProvisionalBreakoutArtifact = z.infer<typeof provisionalBreakoutArtifactSchema>;

export class ProvisionalBreakoutArtifactError extends Error {
  readonly status: number;
  readonly code: 'not_found' | 'invalid_payload';

  constructor(code: 'not_found' | 'invalid_payload', message: string, status: number, cause?: unknown) {
    super(message, { cause });
    this.name = 'ProvisionalBreakoutArtifactError';
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_ARTIFACT_PATH = path.resolve(
  process.cwd(),
  'data/signal-validation/draft-night-provisional-breakout-2026.json',
);

export async function readDraftNightProvisionalBreakoutArtifact(
  targetSeason: number,
  artifactPath = DEFAULT_ARTIFACT_PATH,
): Promise<DraftNightProvisionalBreakoutArtifact> {
  let raw: string;
  try {
    raw = await readFile(artifactPath, 'utf8');
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new ProvisionalBreakoutArtifactError(
        'not_found',
        `No draft-night provisional breakout artifact is available for ${targetSeason}.`,
        404,
        error,
      );
    }
    throw new ProvisionalBreakoutArtifactError(
      'invalid_payload',
      'Draft-night provisional breakout artifact could not be read safely.',
      503,
      error,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    throw new ProvisionalBreakoutArtifactError(
      'invalid_payload',
      'Draft-night provisional breakout artifact is malformed JSON.',
      503,
      error,
    );
  }

  const parsed = provisionalBreakoutArtifactSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ProvisionalBreakoutArtifactError(
      'invalid_payload',
      'Draft-night provisional breakout artifact failed its fail-closed schema.',
      503,
      parsed.error,
    );
  }

  if (parsed.data.target_season !== targetSeason) {
    throw new ProvisionalBreakoutArtifactError(
      'not_found',
      `Draft-night provisional breakout artifact targets ${parsed.data.target_season}, not ${targetSeason}.`,
      404,
    );
  }

  for (const tag of parsed.data.tags) {
    if (
      tag.targetSeason !== targetSeason ||
      tag.probability.target !== parsed.data.probability_target ||
      tag.probabilities.primaryTarget !== parsed.data.probability_target ||
      Math.abs(tag.probability.value - tag.probabilities.primary) > 1e-12 ||
      Math.round(tag.probability.value * 100) !== tag.probability.percent ||
      tag.probability.value < parsed.data.action_threshold
    ) {
      throw new ProvisionalBreakoutArtifactError(
        'invalid_payload',
        `Draft-night provisional breakout tag for ${tag.playerName} violates the pinned probability contract.`,
        503,
      );
    }
  }

  return parsed.data;
}

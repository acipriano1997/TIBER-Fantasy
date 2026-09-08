import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ProvisionalBreakoutArtifactError,
  readDraftNightProvisionalBreakoutArtifact,
} from '../draftNightProvisionalBreakout';

const validArtifact = {
  schema_version: 'draft_night_provisional_breakout_v1',
  target_season: 2026,
  feature_season: 2025,
  status: 'provisional_research_only',
  model_id: 'breakout_v1_4_frozen_2026_09_08',
  probability_target: 'ros_tier_jump',
  action_threshold: 0.25,
  training_rows: 445,
  training_positive_events: 72,
  training_smoothed_event_rate: 0.1648,
  source_artifact_sha256: 'd45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac',
  holdout_evidence: {
    precision: 0.4167,
    recall: 0.4762,
    lift: 2.1825,
    positive_events: 21,
    certified: false,
    reason: 'Failed only the preregistered event-count gate.',
  },
  tags: [
    {
      playerId: '00-0040124',
      playerName: 'Tetairoa McMillan',
      team: 'CAR',
      targetSeason: 2026,
      label: '2026 Breakout Research',
      displayLabel: '2026 Breakout · 41%',
      probability: { value: 0.4065, percent: 41, target: 'ros_tier_jump' },
      probabilities: {
        primary: 0.4065,
        primaryTarget: 'ros_tier_jump',
        top12Next4w: null,
        top24Next4w: null,
        rosTierJump: 0.4065,
        adpOutperformance12Slots: null,
        roleExpansion: null,
      },
      candidateRank: 1,
      finalSignalScore: null,
      breakoutContext: 'Frozen research probability.',
      modelVersion: 'breakout_v1_4_frozen_2026_09_08',
      generatedAt: '2026-09-08T16:21:03Z',
      evidenceStatus: 'provisional_research_only',
      signalKind: 'breakout',
    },
  ],
};

describe('readDraftNightProvisionalBreakoutArtifact', () => {
  let dir: string;
  let artifactPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'draft-night-breakout-'));
    artifactPath = path.join(dir, 'artifact.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('accepts a season-matched probability-bearing provisional artifact', async () => {
    await writeFile(artifactPath, JSON.stringify(validArtifact));
    const result = await readDraftNightProvisionalBreakoutArtifact(2026, artifactPath);
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0].probability.percent).toBe(41);
    expect(result.holdout_evidence.certified).toBe(false);
  });

  test('fails closed for a different target season', async () => {
    await writeFile(artifactPath, JSON.stringify(validArtifact));
    await expect(readDraftNightProvisionalBreakoutArtifact(2027, artifactPath)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });

  test('fails closed when probability arithmetic is inconsistent', async () => {
    const invalid = structuredClone(validArtifact);
    invalid.tags[0].probability.percent = 99;
    await writeFile(artifactPath, JSON.stringify(invalid));
    await expect(readDraftNightProvisionalBreakoutArtifact(2026, artifactPath)).rejects.toBeInstanceOf(
      ProvisionalBreakoutArtifactError,
    );
  });

  test('fails closed when a tag falls below the pinned action threshold', async () => {
    const invalid = structuredClone(validArtifact);
    invalid.tags[0].probability.value = 0.20;
    invalid.tags[0].probability.percent = 20;
    invalid.tags[0].probabilities.primary = 0.20;
    invalid.tags[0].probabilities.rosTierJump = 0.20;
    await writeFile(artifactPath, JSON.stringify(invalid));
    await expect(readDraftNightProvisionalBreakoutArtifact(2026, artifactPath)).rejects.toMatchObject({
      code: 'invalid_payload',
      status: 503,
    });
  });
});

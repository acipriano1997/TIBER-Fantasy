import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DraftBustEvidenceError, readPromotedDraftBustTags } from '../draftBustEvidence';

const manifest = {
  target_season: 2026,
  promotion_passed: true,
  backtest_passed: true,
  prescriptive_validation_passed: true,
  model_version: 'draft_bust_v1',
  calibration_version: 'draft_bust_cal_v1',
  label_definition_version: 'draft_bust_label_v1',
};

const row = {
  player_id: 'canonical-player-1',
  season: 2026,
  bust_probability: 0.314,
  bust_severity_expected: 18.5,
  bust_mechanisms: ['role_collapse', 'draft_price_overextension'],
  model_version: 'draft_bust_v1',
  calibration_version: 'draft_bust_cal_v1',
  as_of: '2026-09-08T16:00:00Z',
  promotion_passed: true,
  backtest_passed: true,
  prescriptive_validation_passed: true,
  provenance: [{ artifact: 'frozen-replay' }],
  freshness_context: { stale: false, status: 'fresh' },
  label_definition_version: 'draft_bust_label_v1',
};

describe('readPromotedDraftBustTags', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'draft-bust-evidence-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeFixture(rows: unknown[], manifestOverride: Record<string, unknown> = {}) {
    await writeFile(path.join(dir, '2026_bust_scores.json'), JSON.stringify({ rows }));
    await writeFile(path.join(dir, '2026_bust_signal_promotion.json'), JSON.stringify({ ...manifest, ...manifestOverride }));
  }

  test('returns full precision and a rounded display percent for an eligible row', async () => {
    await writeFixture([row]);
    const result = await readPromotedDraftBustTags(2026, { exportsDir: dir });

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]).toMatchObject({
      playerId: 'canonical-player-1',
      probability: { value: 0.314, percent: 31 },
      mechanisms: ['role_collapse', 'draft_price_overextension'],
    });
  });

  test('fails closed at the manifest when promotion is not complete', async () => {
    await writeFixture([row], { promotion_passed: false });
    await expect(readPromotedDraftBustTags(2026, { exportsDir: dir })).rejects.toMatchObject({
      code: 'not_promoted',
      status: 409,
    });
  });

  test('omits row-level stale, zero-probability, or validation-failed evidence instead of tagging it', async () => {
    await writeFixture([
      { ...row, player_id: 'stale', freshness_context: { stale: true } },
      { ...row, player_id: 'zero', bust_probability: 0 },
      { ...row, player_id: 'failed', backtest_passed: false },
    ]);

    const result = await readPromotedDraftBustTags(2026, { exportsDir: dir });
    expect(result.tags).toEqual([]);
  });

  test('rejects malformed probabilities rather than clipping or inventing a value', async () => {
    await writeFixture([{ ...row, bust_probability: 1.2 }]);
    await expect(readPromotedDraftBustTags(2026, { exportsDir: dir })).rejects.toBeInstanceOf(DraftBustEvidenceError);
  });

  test('rejects row/manifest version drift', async () => {
    await writeFixture([{ ...row, calibration_version: 'old-calibration' }]);
    await expect(readPromotedDraftBustTags(2026, { exportsDir: dir })).rejects.toMatchObject({
      code: 'invalid_payload',
      status: 502,
    });
  });

  test('rejects duplicate canonical player ids', async () => {
    await writeFixture([row, row]);
    await expect(readPromotedDraftBustTags(2026, { exportsDir: dir })).rejects.toMatchObject({
      code: 'invalid_payload',
      status: 502,
    });
  });
});

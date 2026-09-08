import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { SignalValidationClient } from '../signalValidationClient';
import { SignalValidationService } from '../signalValidationService';
import { SignalValidationIntegrationError } from '../types';

const cards = `player_id,player_name,season,team,best_recipe_name,candidate_rank,final_signal_score,breakout_label_default,breakout_context,usage_signal,efficiency_signal,development_signal,stability_signal,cohort_signal,role_signal,penalty_signal\n00-0042051,Malik Nabers,2025,NYG,role_balanced,1,92.4,true,Expanded alpha role,96,91,89,82,85,88,-3\n00-0042048,Rome Odunze,2025,CHI,role_balanced,2,88.1,false,Control row,90,84,87,80,82,81,-4`;

const summary = {
  best_recipe_name: 'role_balanced',
  season: 2025,
  validation_score: 0.81,
  win_rate: 0.62,
  hit_rate: 0.58,
  candidate_count: 2,
  generated_at: '2026-08-31T00:00:00.000Z',
  model_version: 'wr_signal_score_role_balanced_v3',
};

async function writeFixture(
  dir: string,
  promotion?: {
    status: 'promoted' | 'candidate' | 'rejected';
    backtest_passed: boolean;
    prescriptive_validation_passed: boolean;
    promoted_at?: string;
  },
) {
  await Promise.all([
    writeFile(path.join(dir, 'wr_player_signal_cards_2025.csv'), cards),
    writeFile(path.join(dir, 'wr_best_recipe_summary.json'), JSON.stringify(summary)),
    writeFile(
      path.join(dir, 'export_manifest.json'),
      JSON.stringify({
        feature_season: 2025,
        outcome_season: 2026,
        ...(promotion ? { promotion } : {}),
      }),
    ),
  ]);
}

describe('SignalValidationService draft tags', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'signal-validation-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('emits a 2026 Breakout tag only for affirmative rows after the full upstream promotion gate passes', async () => {
    await writeFixture(dir, {
      status: 'promoted',
      backtest_passed: true,
      prescriptive_validation_passed: true,
      promoted_at: '2026-09-01T00:00:00.000Z',
    });

    const service = new SignalValidationService(new SignalValidationClient({ exportsDir: dir }));
    const result = await service.getWrBreakoutDraftTags(2026);

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]).toMatchObject({
      playerId: '00-0042051',
      playerName: 'Malik Nabers',
      targetSeason: 2026,
      label: '2026 Breakout',
      candidateRank: 1,
      finalSignalScore: 92.4,
      modelVersion: 'wr_signal_score_role_balanced_v3',
    });
    expect(result.lab.promotion?.draftTagEligible).toBe(true);
  });

  it('refuses draft tags when the upstream export is not explicitly promoted', async () => {
    await writeFixture(dir);
    const service = new SignalValidationService(new SignalValidationClient({ exportsDir: dir }));

    await expect(service.getWrBreakoutDraftTags(2026)).rejects.toMatchObject({
      code: 'not_promoted',
      status: 409,
    } satisfies Partial<SignalValidationIntegrationError>);
  });

  it('refuses a stale target-season manifest instead of re-labeling feature-season cards', async () => {
    await Promise.all([
      writeFile(path.join(dir, 'wr_player_signal_cards_2025.csv'), cards),
      writeFile(path.join(dir, 'wr_best_recipe_summary.json'), JSON.stringify(summary)),
      writeFile(
        path.join(dir, 'export_manifest.json'),
        JSON.stringify({
          feature_season: 2024,
          outcome_season: 2025,
          promotion: {
            status: 'promoted',
            backtest_passed: true,
            prescriptive_validation_passed: true,
          },
        }),
      ),
    ]);

    const service = new SignalValidationService(new SignalValidationClient({ exportsDir: dir }));

    await expect(service.getWrBreakoutDraftTags(2026)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
      availableSeasons: [2025],
    } satisfies Partial<SignalValidationIntegrationError>);
  });
});

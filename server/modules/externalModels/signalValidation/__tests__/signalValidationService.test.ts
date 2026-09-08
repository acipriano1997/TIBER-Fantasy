import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { SignalValidationClient } from '../signalValidationClient';
import { SignalValidationService } from '../signalValidationService';
import { SignalValidationIntegrationError } from '../types';

const cards = `player_id,player_name,season,team,best_recipe_name,candidate_rank,final_signal_score,breakout_label_default,breakout_context,usage_signal,efficiency_signal,development_signal,stability_signal,cohort_signal,role_signal,penalty_signal,breakout_probability,breakout_probability_target,p_top_12_next_4w,p_top_24_next_4w,p_ros_tier_jump,p_adp_outperformance_12_slots,p_role_expansion\n00-0042051,Malik Nabers,2025,NYG,role_balanced,1,92.4,true,Expanded alpha role,96,91,89,82,85,88,-3,0.73,ros_tier_jump,0.21,0.46,0.73,0.61,0.68\n00-0042048,Rome Odunze,2025,CHI,role_balanced,2,88.1,false,Control row,90,84,87,80,82,81,-4,0.34,ros_tier_jump,0.08,0.22,0.34,0.39,0.52`;

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

const declared2026Artifacts = [
  {
    artifact_name: 'wr_player_signal_cards_2025.csv',
    relative_path: 'wr_player_signal_cards_2025.csv',
    format: 'csv',
  },
  {
    artifact_name: 'wr_best_recipe_summary.json',
    relative_path: 'wr_best_recipe_summary.json',
    format: 'json',
  },
];

async function writeFixture(
  dir: string,
  promotion?: {
    status: 'promoted' | 'candidate' | 'rejected';
    backtest_passed: boolean;
    prescriptive_validation_passed: boolean;
    promoted_at?: string;
  },
  playerCards: string = cards,
) {
  await Promise.all([
    writeFile(path.join(dir, 'wr_player_signal_cards_2025.csv'), playerCards),
    writeFile(path.join(dir, 'wr_best_recipe_summary.json'), JSON.stringify(summary)),
    writeFile(
      path.join(dir, 'export_manifest.json'),
      JSON.stringify({
        feature_season: 2025,
        outcome_season: 2026,
        artifacts: declared2026Artifacts,
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

  it('emits a probability-bearing 2026 Breakout tag only for affirmative rows after the full upstream promotion gate passes', async () => {
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
      displayLabel: '2026 Breakout · 73%',
      probability: {
        value: 0.73,
        percent: 73,
        target: 'ros_tier_jump',
      },
      probabilities: {
        primary: 0.73,
        primaryTarget: 'ros_tier_jump',
        top12Next4w: 0.21,
        top24Next4w: 0.46,
        rosTierJump: 0.73,
        adpOutperformance12Slots: 0.61,
        roleExpansion: 0.68,
      },
      candidateRank: 1,
      finalSignalScore: 92.4,
      modelVersion: 'wr_signal_score_role_balanced_v3',
    });
    expect(result.lab.promotion?.draftTagEligible).toBe(true);
  });

  it('refuses promoted draft tags when an affirmative row lacks calibrated probability evidence', async () => {
    const cardsWithoutProbability = cards
      .split('\n')
      .map((line) => line
        .replace(',breakout_probability,breakout_probability_target,p_top_12_next_4w,p_top_24_next_4w,p_ros_tier_jump,p_adp_outperformance_12_slots,p_role_expansion', '')
        .replace(',0.73,ros_tier_jump,0.21,0.46,0.73,0.61,0.68', '')
        .replace(',0.34,ros_tier_jump,0.08,0.22,0.34,0.39,0.52', ''))
      .join('\n');

    await writeFixture(
      dir,
      {
        status: 'promoted',
        backtest_passed: true,
        prescriptive_validation_passed: true,
      },
      cardsWithoutProbability,
    );

    const service = new SignalValidationService(new SignalValidationClient({ exportsDir: dir }));

    await expect(service.getWrBreakoutDraftTags(2026)).rejects.toMatchObject({
      code: 'invalid_payload',
      status: 502,
    } satisfies Partial<SignalValidationIntegrationError>);
  });

  it('refuses draft tags when the upstream export is not explicitly promoted', async () => {
    await writeFixture(dir);
    const service = new SignalValidationService(new SignalValidationClient({ exportsDir: dir }));

    await expect(service.getWrBreakoutDraftTags(2026)).rejects.toMatchObject({
      code: 'not_promoted',
      status: 409,
    } satisfies Partial<SignalValidationIntegrationError>);
  });

  it('refuses a target-season draft signal when required artifacts are not declared by the manifest', async () => {
    await Promise.all([
      writeFile(path.join(dir, 'wr_player_signal_cards_2025.csv'), cards),
      writeFile(path.join(dir, 'wr_best_recipe_summary.json'), JSON.stringify(summary)),
      writeFile(
        path.join(dir, 'export_manifest.json'),
        JSON.stringify({
          feature_season: 2025,
          outcome_season: 2026,
          artifacts: [declared2026Artifacts[0]],
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
      code: 'invalid_payload',
      status: 502,
    } satisfies Partial<SignalValidationIntegrationError>);
  });

  it('hides an unmanifested future-season fixture from the available/default breakout seasons', async () => {
    const cards2024 = cards.replace(/,2025,/g, ',2024,');
    await Promise.all([
      writeFile(path.join(dir, 'wr_player_signal_cards_2024.csv'), cards2024),
      writeFile(path.join(dir, 'wr_player_signal_cards_2025.csv'), cards),
      writeFile(path.join(dir, 'wr_best_recipe_summary.json'), JSON.stringify({ ...summary, season: 2024 })),
      writeFile(
        path.join(dir, 'export_manifest.json'),
        JSON.stringify({
          feature_season: 2024,
          outcome_season: 2025,
          artifacts: [
            {
              artifact_name: 'wr_player_signal_cards_2024.csv',
              relative_path: 'wr_player_signal_cards_2024.csv',
              format: 'csv',
            },
            declared2026Artifacts[1],
          ],
        }),
      ),
    ]);

    const client = new SignalValidationClient({ exportsDir: dir });
    await expect(client.listAvailableSeasons()).resolves.toEqual([2024]);
    await expect(client.readWrBreakoutExports()).resolves.toMatchObject({ season: 2024, availableSeasons: [2024] });
    await expect(client.readWrBreakoutExports(2025)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
      availableSeasons: [2024],
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

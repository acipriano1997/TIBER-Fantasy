import {
  adaptSignalValidationExports,
  isAffirmativeBreakoutLabel,
  normalizeWrBestRecipeSummary,
} from '../signalValidationAdapter';
import { SignalValidationIntegrationError } from '../types';

const playerSignalCardsCsv = `candidate_rank,final_signal_score,player_name,player_id,team,season,best_recipe_name,usage_signal,efficiency_signal,development_signal,stability_signal,cohort_signal,role_signal,penalty_signal,breakout_label_default,breakout_context,breakout_probability,breakout_probability_target,p_top_12_next_4w,p_top_24_next_4w,p_ros_tier_jump,p_adp_outperformance_12_slots,p_role_expansion\n1,92.4,Malik Nabers,00-0042051,NYG,2025,Second-Year Surge,96,91,89,82,85,88,-3,true,Elite rookie route command with more downfield volume expected,0.73,ros_tier_jump,0.21,0.46,0.73,0.61,0.68\n2,88.1,Rome Odunze,00-0042048,CHI,2025,Second-Year Surge,90,84,87,80,82,81,-4,false,Target share runway if route tree expands,0.34,ros_tier_jump,0.08,0.22,0.34,0.39,0.52`;

const bestRecipeSummary = {
  best_recipe_name: 'Second-Year Surge',
  season: 2025,
  validation_score: 0.78,
  win_rate: 0.64,
  hit_rate: 0.58,
  candidate_count: 12,
  summary: 'Targets ascending second-year WRs with strong usage and efficiency baselines.',
  generated_at: '2026-03-23T00:00:00.000Z',
  model_version: 'svm-2026.03.1',
};

const passingAccuracyCertification = {
  certification_version: 'breakout_accuracy_v1',
  passed: true,
  chronological_out_of_sample: true,
  final_holdout_untouched: true,
  leakage_checks_passed: true,
  calibration_passed: true,
  challenger_beaten: true,
  held_out_true_positives: 12,
  held_out_false_positives: 38,
  held_out_false_negatives: 30,
  held_out_true_negatives: 387,
  held_out_positive_events: 42,
  held_out_precision: 0.24,
  held_out_base_rate: 0.09,
  precision_lift: 2.67,
  precision_lift_lower_95: 1.21,
  brier_score: 0.071,
  base_rate_brier_score: 0.082,
  log_loss: 0.241,
  base_rate_log_loss: 0.303,
};

const promoted2026Manifest = {
  feature_season: 2025,
  outcome_season: 2026,
  promotion: {
    status: 'promoted',
    backtest_passed: true,
    prescriptive_validation_passed: true,
    promoted_at: '2026-08-31T00:00:00.000Z',
    accuracy_certification: passingAccuracyCertification,
  },
};

describe('signalValidationAdapter', () => {
  it('maps Signal Validation exports into the stable TIBER-facing breakout lab shape', () => {
    const result = adaptSignalValidationExports(
      {
        season: 2025,
        availableSeasons: [2025, 2024],
        playerSignalCardsCsv,
        bestRecipeSummary,
      },
      { exportDirectory: '/tmp/signal-validation' },
    );

    expect(result.availableSeasons).toEqual([2025, 2024]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      candidateRank: 1,
      finalSignalScore: 92.4,
      playerName: 'Malik Nabers',
      playerId: '00-0042051',
      team: 'NYG',
      bestRecipeName: 'Second-Year Surge',
      breakoutLabelDefault: 'true',
      breakoutContext: 'Elite rookie route command with more downfield volume expected',
      probabilities: {
        primary: 0.73,
        primaryTarget: 'ros_tier_jump',
        top12Next4w: 0.21,
        top24Next4w: 0.46,
        rosTierJump: 0.73,
        adpOutperformance12Slots: 0.61,
        roleExpansion: 0.68,
      },
      components: {
        usage: 96,
        efficiency: 91,
        development: 89,
        stability: 82,
        cohort: 85,
        role: 88,
        penalty: -3,
      },
    });
    expect(result.bestRecipeSummary).toMatchObject({
      bestRecipeName: 'Second-Year Surge',
      validationScore: 0.78,
      winRate: 0.64,
      hitRate: 0.58,
      candidateCount: 12,
    });
    expect(result.source.provider).toBe('signal-validation-model');
    expect(result.promotion).toBeUndefined();
  });

  it('maps the canonical producer field names without inventing replacements', () => {
    const canonicalCsv = `player_id,player_name,feature_season,outcome_season,feature_team,best_recipe_name,candidate_rank,final_signal_score,breakout_label_default,breakout_reason,usage_signal,efficiency_signal,development_signal,stability_signal,cohort_signal,role_signal,penalty_signal,calibrated_breakout_probability,probability_target,p_ros_tier_jump\n00-0042051,Rome Odunze,2025,2026,CHI,role_balanced,1,88.2,true,Development and opportunity profile,77,84,90,78,80,83,8,0.57,ros_tier_jump,0.57`;
    const canonicalSummary = {
      best_recipe_name: 'role_balanced',
      scoring_version: 'wr_signal_score_role_balanced_v1',
      generated_at: '2026-03-23T01:40:41Z',
      key_metrics: {
        candidate_count: 1122,
        breakout_count: 228,
        precision_at_20: 0.519,
        recall_at_20: 0.1798,
        average_breakout_rank: 88.2412,
      },
    };

    const result = adaptSignalValidationExports(
      {
        season: 2025,
        availableSeasons: [2025, 2024],
        playerSignalCardsCsv: canonicalCsv,
        bestRecipeSummary: canonicalSummary,
      },
      { exportDirectory: '/tmp/signal-validation' },
    );

    expect(result.rows[0]).toMatchObject({
      playerId: '00-0042051',
      playerName: 'Rome Odunze',
      team: 'CHI',
      season: 2025,
      breakoutContext: 'Development and opportunity profile',
      probabilities: {
        primary: 0.57,
        primaryTarget: 'ros_tier_jump',
        rosTierJump: 0.57,
      },
    });
    expect(result.bestRecipeSummary).toMatchObject({
      modelVersion: 'wr_signal_score_role_balanced_v1',
      candidateCount: 1122,
      breakoutCount: 228,
      precisionAt20: 0.519,
      recallAt20: 0.1798,
      averageBreakoutRank: 88.2412,
    });
  });

  it('marks a target-season signal draft-eligible only after promotion and quantitative accuracy certification', () => {
    const result = adaptSignalValidationExports(
      {
        season: 2025,
        availableSeasons: [2025],
        playerSignalCardsCsv,
        bestRecipeSummary,
        exportManifest: promoted2026Manifest,
        requestedTargetSeason: 2026,
      },
      { exportDirectory: '/tmp/signal-validation' },
    );

    expect(result.promotion).toMatchObject({
      featureSeason: 2025,
      targetSeason: 2026,
      status: 'promoted',
      backtestPassed: true,
      prescriptiveValidationPassed: true,
      promotedAt: '2026-08-31T00:00:00.000Z',
      accuracyCertification: {
        certificationVersion: 'breakout_accuracy_v1',
        heldOutTruePositives: 12,
        heldOutFalsePositives: 38,
        heldOutFalseNegatives: 30,
        heldOutTrueNegatives: 387,
        heldOutPositiveEvents: 42,
        heldOutPrecision: 0.24,
        heldOutBaseRate: 0.09,
        precisionLift: 2.67,
        precisionLiftLower95: 1.21,
        recomputedPrecision: 0.24,
        metricsConsistent: true,
        consumerThresholdsPassed: true,
      },
      draftTagEligible: true,
    });
  });

  it('keeps an otherwise promoted export dormant when accuracy certification is absent', () => {
    const result = adaptSignalValidationExports(
      {
        season: 2025,
        availableSeasons: [2025],
        playerSignalCardsCsv,
        bestRecipeSummary,
        exportManifest: {
          feature_season: 2025,
          outcome_season: 2026,
          promotion: {
            status: 'promoted',
            backtest_passed: true,
            prescriptive_validation_passed: true,
          },
        },
        requestedTargetSeason: 2026,
      },
      { exportDirectory: '/tmp/signal-validation' },
    );

    expect(result.promotion?.accuracyCertification).toBeNull();
    expect(result.promotion?.draftTagEligible).toBe(false);
  });

  it('fails the draft eligibility gate when a certification floor is missed', () => {
    const result = adaptSignalValidationExports(
      {
        season: 2025,
        availableSeasons: [2025],
        playerSignalCardsCsv,
        bestRecipeSummary,
        exportManifest: {
          ...promoted2026Manifest,
          promotion: {
            ...promoted2026Manifest.promotion,
            accuracy_certification: {
              ...passingAccuracyCertification,
              held_out_precision: 0.149,
            },
          },
        },
        requestedTargetSeason: 2026,
      },
      { exportDirectory: '/tmp/signal-validation' },
    );

    expect(result.promotion?.accuracyCertification?.metricsConsistent).toBe(false);
    expect(result.promotion?.accuracyCertification?.consumerThresholdsPassed).toBe(false);
    expect(result.promotion?.draftTagEligible).toBe(false);
  });

  it('fails closed when producer-reported metrics disagree with the held-out confusion counts', () => {
    const result = adaptSignalValidationExports(
      {
        season: 2025,
        availableSeasons: [2025],
        playerSignalCardsCsv,
        bestRecipeSummary,
        exportManifest: {
          ...promoted2026Manifest,
          promotion: {
            ...promoted2026Manifest.promotion,
            accuracy_certification: {
              ...passingAccuracyCertification,
              precision_lift: 9.99,
            },
          },
        },
        requestedTargetSeason: 2026,
      },
      { exportDirectory: '/tmp/signal-validation' },
    );

    expect(result.promotion?.accuracyCertification?.metricsConsistent).toBe(false);
    expect(result.promotion?.draftTagEligible).toBe(false);
  });

  it('fails the draft eligibility gate when either validation pass is missing', () => {
    const result = adaptSignalValidationExports(
      {
        season: 2025,
        availableSeasons: [2025],
        playerSignalCardsCsv,
        bestRecipeSummary,
        exportManifest: {
          ...promoted2026Manifest,
          promotion: {
            ...promoted2026Manifest.promotion,
            prescriptive_validation_passed: false,
          },
        },
        requestedTargetSeason: 2026,
      },
      { exportDirectory: '/tmp/signal-validation' },
    );

    expect(result.promotion?.draftTagEligible).toBe(false);
  });

  it('rejects out-of-range producer probabilities instead of coercing them', () => {
    const invalidCsv = playerSignalCardsCsv.replace(',0.73,ros_tier_jump,', ',73,ros_tier_jump,');

    expect(() => adaptSignalValidationExports(
      {
        season: 2025,
        availableSeasons: [2025],
        playerSignalCardsCsv: invalidCsv,
        bestRecipeSummary,
      },
      { exportDirectory: '/tmp/signal-validation' },
    )).toThrow(SignalValidationIntegrationError);
  });

  it('does not treat explicit false labels as breakout candidates', () => {
    expect(isAffirmativeBreakoutLabel('true')).toBe(true);
    expect(isAffirmativeBreakoutLabel('Priority breakout')).toBe(true);
    expect(isAffirmativeBreakoutLabel('false')).toBe(false);
    expect(isAffirmativeBreakoutLabel('not breakout')).toBe(false);
    expect(isAffirmativeBreakoutLabel(null)).toBe(false);
  });

  it('rejects malformed best-recipe payloads with a stable invalid_payload error', () => {
    expect(() => normalizeWrBestRecipeSummary({ season: 2025 }, 2025)).toThrow(SignalValidationIntegrationError);

    try {
      normalizeWrBestRecipeSummary({ season: 2025 }, 2025);
    } catch (error) {
      expect(error).toBeInstanceOf(SignalValidationIntegrationError);
      expect((error as SignalValidationIntegrationError).code).toBe('invalid_payload');
    }
  });
});

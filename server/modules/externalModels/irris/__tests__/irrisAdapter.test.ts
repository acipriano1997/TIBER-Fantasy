import { describe, expect, it } from '@jest/globals';
import { adaptIrrisAssessment } from '../irrisAdapter';
import { IrrisIntegrationError } from '../types';

const payload = () => ({
  ok: true,
  assessment: {
    schema_version: 'irris-assessment-v0',
    model_version: 'irris-v0.1.0',
    inference_status: 'model_inference_not_medically_confirmed',
    player_id: '00-0000001',
    as_of: '2026-09-11T12:00:00Z',
    eligible_evidence_ids: ['e1'],
    excluded_future_evidence_ids: ['e2'],
    official: { game_status: 'questionable' },
    differential: [{
      injury_family: 'hamstring_strain',
      probability: 1,
      severity: { mild: 0.2, moderate: 0.7, severe: 0.1 },
    }],
    recovery: {
      active_next_game_probability: 0.42,
      full_workload_next_game_probability: 0.2,
      median_games_missed_bucket: '1',
      return_to_workload_lag_games: { low: 0, median: 1, high: 3 },
      return_to_performance_lag_games: { low: 0, median: 2, high: 4 },
      recurrence_risk: 'elevated',
    },
    readiness: { score: 61, label: 'loaded', uncertainty: 0.3, drivers: ['recent return from injury'] },
    scenarios: { inactive: 0.58, active_normal: 0.12, active_limited: 0.22, active_early_exit: 0.08 },
    functional_limitations: { acceleration: 0.7, top_speed: 0.7 },
    narrative_divergence: { level: 'high', score: 0.61, explanation: ['team narrative more reassuring than model state'] },
    confidence: 0.78,
    medical_clearance_forecast: 'not_applicable',
    caveats: ['model inference only'],
  },
});

describe('adaptIrrisAssessment', () => {
  it('maps a valid Forecast payload into the stable TIBER-facing shape', () => {
    const insight = adaptIrrisAssessment(payload());
    expect(insight.source).toBe('tiber-forecast-irris');
    expect(insight.inferenceStatus).toBe('model_inference_not_medically_confirmed');
    expect(insight.scenarios.activeLimited).toBe(0.22);
    expect(insight.excludedFutureEvidenceIds).toEqual(['e2']);
  });

  it('rejects a payload that drops the model-inference marker', () => {
    const broken = payload();
    broken.assessment.inference_status = 'confirmed' as any;
    expect(() => adaptIrrisAssessment(broken)).toThrow(IrrisIntegrationError);
  });

  it('rejects malformed probability mixtures', () => {
    const broken = payload();
    broken.assessment.scenarios.active_normal = 0.8;
    expect(() => adaptIrrisAssessment(broken)).toThrow('IRRIS scenario probabilities must sum to 1');
  });

  it('rejects out-of-range probabilities', () => {
    const broken = payload();
    broken.assessment.confidence = 1.2;
    expect(() => adaptIrrisAssessment(broken)).toThrow(IrrisIntegrationError);
  });
});

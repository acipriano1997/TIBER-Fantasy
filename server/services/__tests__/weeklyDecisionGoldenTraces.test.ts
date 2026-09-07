import {
  compareWeeklyDecisionChampionAndChallenger,
} from '../../../shared/weeklyDecisionChallenger';
import {
  createWeeklyDecisionLedgerEntry,
  replayWeeklyDecisionLedgerEntry,
} from '../weeklyDecisionLedger';
import { WEEKLY_DECISION_GATE2_GOLDEN_TRACES } from './golden/weeklyDecisionGate2GoldenTraces';

describe('Weekly Decision Gate 2 frozen golden traces', () => {
  test('keeps trace ids unique and frozen recording timestamps canonical', () => {
    expect(new Set(WEEKLY_DECISION_GATE2_GOLDEN_TRACES.map((trace) => trace.id)).size).toBe(
      WEEKLY_DECISION_GATE2_GOLDEN_TRACES.length,
    );

    for (const trace of WEEKLY_DECISION_GATE2_GOLDEN_TRACES) {
      expect(new Date(trace.recordedAt).toISOString()).toBe(trace.recordedAt);
    }
  });

  test.each(WEEKLY_DECISION_GATE2_GOLDEN_TRACES.map((trace) => [trace.id, trace] as const))(
    '%s reproduces champion, challenger, and frozen replay semantics',
    (_id, trace) => {
      const comparison = compareWeeklyDecisionChampionAndChallenger(trace.context);

      expect(comparison.champion.decisionState).toBe(trace.expected.championState);
      expect(comparison.champion.preferredPlayerId).toBe(trace.expected.championPreferredPlayerId);
      expect(comparison.challenger.preferredPlayerId).toBe(trace.expected.challengerPreferredPlayerId);
      expect(comparison.relation).toBe(trace.expected.relation);
      expect(comparison.confidenceBoostAllowed).toBe(false);
      expect(comparison.finalActionAuthority).toBe('human');

      if (trace.expected.requiredMissingInput) {
        expect(comparison.champion.missingInputs).toContain(trace.expected.requiredMissingInput);
      }

      const entry = createWeeklyDecisionLedgerEntry(trace.context, trace.recordedAt);
      const replay = replayWeeklyDecisionLedgerEntry(entry);
      expect(replay.integrity).toBe('verified');
      expect(replay.determinism).toBe('matched');
      expect(replay.replayedResult).toEqual(entry.resultSnapshot);
      expect(entry.resultSnapshot).toEqual(comparison.champion);
    },
  );

  test('contains both admitted decisions and fail-closed outcomes', () => {
    const states = WEEKLY_DECISION_GATE2_GOLDEN_TRACES.map((trace) => trace.expected.championState);
    expect(states).toContain('comparison_available');
    expect(states).toContain('insufficient_evidence');
    expect(states).toContain('unsupported_domain');
  });

  test('contains both champion/challenger agreement and deliberate disagreement', () => {
    const relations = WEEKLY_DECISION_GATE2_GOLDEN_TRACES.map((trace) => trace.expected.relation);
    expect(relations).toContain('agreement');
    expect(relations).toContain('disagreement');
    expect(relations).toContain('champion_abstained');
    expect(relations).toContain('both_abstained');
  });
});

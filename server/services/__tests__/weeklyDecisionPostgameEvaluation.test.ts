import type {
  WeeklyDecisionCandidate,
  WeeklyDecisionContext,
  WeeklyTailOutlook,
} from '../../../shared/weeklyDecisionContract';
import {
  createWeeklyDecisionLedgerEntry,
  type WeeklyDecisionLedgerEntryV1,
} from '../weeklyDecisionLedger';
import {
  WEEKLY_DECISION_MIN_CALIBRATION_PLAYER_OUTCOMES,
  evaluateWeeklyDecisionPostgame,
  summarizeWeeklyDecisionPostgameCalibration,
  type WeeklyDecisionPostgameEvaluation,
  type WeeklyDecisionRealizedOutcome,
} from '../weeklyDecisionPostgameEvaluation';

const EVIDENCE_CUTOFF = '2026-09-07T16:00:00.000Z';
const DECISION_VALID_UNTIL = '2026-09-07T22:00:00.000Z';
const OUTCOME_FINALIZED_AT = '2026-09-08T04:00:00.000Z';

function tail(
  runHash: string,
  quantiles: WeeklyTailOutlook['quantiles'],
  overrides: Partial<WeeklyTailOutlook> = {},
): WeeklyTailOutlook {
  const modelVersion = overrides.modelVersion ?? 'forecast-weekly-tail-v2';
  const generatedAt = overrides.generatedAt ?? '2026-09-07T16:05:00.000Z';
  return {
    status: 'ready',
    scoringProfileRef: 'league:ppr:hash-1',
    evidenceCutoffAt: EVIDENCE_CUTOFF,
    generatedAt,
    modelVersion,
    calibrationVersion: 'calibration-2026-w1',
    supportedPopulation: 'NFL WR PPR weekly',
    quantiles,
    rightTail: null,
    leftTail: null,
    pathways: null,
    sourceReceipts: [{
      owner: 'TIBER-Forecast',
      artifactOrEndpoint: 'weekly-tail-v2',
      schemaOrModelVersion: modelVersion,
      runOrContentHash: runHash,
      evidenceWindow: '2026 week 1',
      observedAt: '2026-09-07T15:55:00.000Z',
      inputCutoffAt: EVIDENCE_CUTOFF,
      generatedAt,
      retrievedAt: '2026-09-07T16:06:00.000Z',
      validUntil: '2026-09-07T23:00:00.000Z',
      publicationState: 'promoted',
      freshness: 'fresh',
      coverage: 'supported',
    }],
    ...overrides,
  };
}

function candidate(
  playerId: string,
  observedStarter: boolean,
  tailOutlook: WeeklyTailOutlook | null,
): WeeklyDecisionCandidate {
  return {
    playerId,
    playerName: playerId,
    position: 'WR',
    identityStatus: 'canonical',
    observedStarter,
    tailOutlook,
  };
}

function context(
  index = 0,
  overrides: Partial<WeeklyDecisionContext> = {},
): WeeklyDecisionContext {
  return {
    decisionId: `postgame-${index}`,
    season: 2026,
    week: 1,
    evidenceCutoffAt: EVIDENCE_CUTOFF,
    validUntil: DECISION_VALID_UNTIL,
    leagueRef: 'league-1',
    teamRef: 'team-1',
    scoringProfileRef: 'league:ppr:hash-1',
    scoringProfileHash: 'hash-1',
    rosterSnapshotRef: `roster-${index}`,
    rosterSnapshotHash: `roster-hash-${index}`,
    lineupAHash: `lineup-a-${index}`,
    lineupBHash: `lineup-b-${index}`,
    samePositionLegalSwap: true,
    locked: false,
    operatorPosture: 'balanced',
    candidateA: candidate('starter', true, tail(`run-starter-${index}`, {
      p10: 8,
      p25: 11,
      p50: 15,
      p75: 21,
      p90: 28,
      p95: 32,
    })),
    candidateB: candidate('bench', false, tail(`run-bench-${index}`, {
      p10: 7,
      p25: 10,
      p50: 14,
      p75: 20,
      p90: 27,
      p95: 31,
    })),
    ...overrides,
  };
}

function entry(
  index = 0,
  overrides: Partial<WeeklyDecisionContext> = {},
): WeeklyDecisionLedgerEntryV1 {
  return createWeeklyDecisionLedgerEntry(
    context(index, overrides),
    `2026-09-07T16:${String(10 + index).padStart(2, '0')}:00.000Z`,
  );
}

function outcome(
  contentHash = 'outcome-hash-1',
  playerPoints: WeeklyDecisionRealizedOutcome['playerPoints'] = [
    { playerId: 'starter', fantasyPoints: 13 },
    { playerId: 'bench', fantasyPoints: 19 },
  ],
  overrides: Partial<WeeklyDecisionRealizedOutcome> = {},
): WeeklyDecisionRealizedOutcome {
  return {
    season: 2026,
    week: 1,
    leagueRef: 'league-1',
    teamRef: 'team-1',
    scoringProfileRef: 'league:ppr:hash-1',
    scoringProfileHash: 'hash-1',
    finalizedAt: OUTCOME_FINALIZED_AT,
    source: {
      owner: 'TIBER-Data',
      artifactOrEndpoint: 'canonical-weekly-scoring-v1',
      schemaVersion: 'weekly-scoring-final-v1',
      contentHash,
      publicationState: 'final',
      authority: 'canonical_league_scoring',
    },
    playerPoints,
    ...overrides,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('Weekly Decision postgame process evaluation', () => {
  test('separates verified pregame process from outcome luck and preserves the frozen receipt', () => {
    const frozenEntry = entry();
    const before = clone(frozenEntry);
    const evaluation = evaluateWeeklyDecisionPostgame(frozenEntry, outcome());

    expect(evaluation.status).toBe('evaluated');
    expect(evaluation.processAssessment).toBe('pregame_preference_process_verified');
    expect(evaluation.pregamePreferredPlayerId).toBe('starter');
    expect(evaluation.selectionOutcome).toBe('preferred_underperformed_alternative');
    expect(evaluation.outcomeCanRewritePregameReceipt).toBe(false);
    expect(evaluation.outcomeCanRetroactivelyValidateProcess).toBe(false);
    expect(evaluation.calibrationInterpretation).toBe('single_case_diagnostic_only');
    expect(evaluation.receipt.ledgerEntrySha256).toBe(frozenEntry.hashes.entrySha256);
    expect(evaluation.receipt.realizedOutcomeSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evaluation.receipt.evaluationSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(frozenEntry).toEqual(before);
  });

  test('produces deterministic interval diagnostics without turning one result into a model grade', () => {
    const evaluation = evaluateWeeklyDecisionPostgame(entry(), outcome());
    const starter = evaluation.diagnostics.find((row) => row.playerId === 'starter')!;
    const bench = evaluation.diagnostics.find((row) => row.playerId === 'bench')!;

    expect(starter.quantileBucket).toBe('p25_to_p50');
    expect(starter.central50Hit).toBe(true);
    expect(starter.central80Hit).toBe(true);
    expect(starter.medianAbsoluteError).toBe(2);
    expect(starter.scoringProfileHash).toBe('hash-1');
    expect(starter.modelVersion).toBe('forecast-weekly-tail-v2');
    expect(starter.calibrationVersion).toBe('calibration-2026-w1');
    expect(starter.supportedPopulation).toBe('NFL WR PPR weekly');

    expect(bench.quantileBucket).toBe('p50_to_p75');
    expect(bench.central50Hit).toBe(true);
    expect(bench.central80Hit).toBe(true);
    expect(bench.medianAbsoluteError).toBe(5);
  });

  test('fails closed when the immutable pregame entry was tampered', () => {
    const tampered = clone(entry()) as WeeklyDecisionLedgerEntryV1;
    tampered.contextSnapshot.scoringProfileHash = 'tampered';

    const evaluation = evaluateWeeklyDecisionPostgame(tampered, outcome());
    expect(evaluation.status).toBe('invalid_pregame_receipt');
    expect(evaluation.processAssessment).toBe('not_evaluable');
    expect(evaluation.diagnostics).toEqual([]);
    expect(evaluation.blockers.join('|')).toContain('pregame_replay_tampered_not_run');
  });

  test.each([
    ['scoring hash mismatch', { scoringProfileHash: 'wrong-hash' }, 'scoring_profile_hash_mismatch'],
    ['wrong league', { leagueRef: 'wrong-league' }, 'league_mismatch'],
    ['pre-cutoff finality', { finalizedAt: EVIDENCE_CUTOFF }, 'finalized_at_not_after_evidence_cutoff'],
  ])('rejects realized outcome context: %s', (_label, overrides, blocker) => {
    const evaluation = evaluateWeeklyDecisionPostgame(
      entry(),
      outcome('bad-context', undefined, overrides as Partial<WeeklyDecisionRealizedOutcome>),
    );
    expect(evaluation.status).toBe('invalid_realized_outcome');
    expect(evaluation.blockers).toContain(blocker);
  });

  test('rejects noncanonical or nonfinal scoring packets and missing source receipts', () => {
    const invalid = outcome() as any;
    invalid.source.authority = 'projection_model';
    invalid.source.publicationState = 'provisional';
    invalid.source.schemaVersion = '';
    invalid.source.contentHash = '';

    const evaluation = evaluateWeeklyDecisionPostgame(entry(), invalid);
    expect(evaluation.status).toBe('invalid_realized_outcome');
    expect(evaluation.blockers).toEqual(expect.arrayContaining([
      'outcome_authority_invalid',
      'outcome_not_final',
      'outcome_source_schema_missing',
      'outcome_content_hash_missing',
    ]));
  });

  test('rejects missing, duplicate, or malformed candidate outcomes', () => {
    const invalid = outcome('bad-player-rows', [
      { playerId: 'starter', fantasyPoints: 12 },
      { playerId: 'starter', fantasyPoints: 14 },
      { playerId: 'other', fantasyPoints: Number.NaN },
    ]);
    const evaluation = evaluateWeeklyDecisionPostgame(entry(), invalid);

    expect(evaluation.status).toBe('invalid_realized_outcome');
    expect(evaluation.blockers).toEqual(expect.arrayContaining([
      'duplicate_player_outcome:starter',
      'malformed_player_outcome',
      'missing_player_outcome:bench',
    ]));
  });

  test('verifies governed abstention/nonpreference process without inventing selection success', () => {
    const lockedEntry = entry(1, { locked: true });
    const evaluation = evaluateWeeklyDecisionPostgame(
      lockedEntry,
      outcome('locked-outcome'),
    );

    expect(evaluation.status).toBe('evaluated');
    expect(evaluation.pregameDecisionState).toBe('unsupported_domain');
    expect(evaluation.pregamePreferredPlayerId).toBeNull();
    expect(evaluation.processAssessment).toBe('pregame_nonpreference_process_verified');
    expect(evaluation.selectionOutcome).toBeNull();
  });
});

describe('Weekly Decision postgame calibration summary', () => {
  function evaluationFor(index: number, starterPoints: number, benchPoints: number): WeeklyDecisionPostgameEvaluation {
    return evaluateWeeklyDecisionPostgame(
      entry(index),
      outcome(
        `final-${index}`,
        [
          { playerId: 'starter', fantasyPoints: starterPoints },
          { playerId: 'bench', fantasyPoints: benchPoints },
        ],
      ),
    );
  }

  test('enforces the release minimum even if a caller requests a tiny calibration sample', () => {
    const one = evaluationFor(0, 15, 14);
    const summary = summarizeWeeklyDecisionPostgameCalibration([one], 1);

    expect(summary.status).toBe('insufficient_sample');
    expect(summary.minimumPlayerOutcomes).toBe(WEEKLY_DECISION_MIN_CALIBRATION_PLAYER_OUTCOMES);
    expect(summary.playerOutcomeCount).toBe(2);
    expect(summary.interpretation).toBe('cohort_coverage_diagnostic_not_model_grade');
    expect(summary.summarySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('reports interval coverage only after a homogeneous cohort reaches the minimum sample', () => {
    const evaluations = Array.from({ length: 10 }, (_, index) =>
      evaluationFor(index, index < 5 ? 15 : 5, index < 8 ? 14 : 35),
    );
    const summary = summarizeWeeklyDecisionPostgameCalibration(evaluations);

    expect(summary.status).toBe('reportable');
    expect(summary.evaluationCount).toBe(10);
    expect(summary.playerOutcomeCount).toBe(20);
    expect(summary.cohort).toEqual({
      scoringProfileHash: 'hash-1',
      modelVersion: 'forecast-weekly-tail-v2',
      calibrationVersion: 'calibration-2026-w1',
      supportedPopulation: 'NFL WR PPR weekly',
    });
    expect(summary.central50.empiricalCoverage).not.toBeNull();
    expect(summary.central80.empiricalCoverage).not.toBeNull();
    expect(summary.evaluationHashes).toHaveLength(10);
  });

  test('does not let duplicate copies of one evaluation inflate the sample', () => {
    const one = evaluationFor(0, 15, 14);
    const summary = summarizeWeeklyDecisionPostgameCalibration(Array(20).fill(one));

    expect(summary.evaluationCount).toBe(1);
    expect(summary.playerOutcomeCount).toBe(2);
    expect(summary.status).toBe('insufficient_sample');
  });

  test('fails the cohort summary when one pregame ledger entry has conflicting finalized evaluations', () => {
    const frozen = entry(0);
    const first = evaluateWeeklyDecisionPostgame(frozen, outcome('final-a', [
      { playerId: 'starter', fantasyPoints: 12 },
      { playerId: 'bench', fantasyPoints: 20 },
    ]));
    const correction = evaluateWeeklyDecisionPostgame(frozen, outcome('final-b', [
      { playerId: 'starter', fantasyPoints: 18 },
      { playerId: 'bench', fantasyPoints: 10 },
    ]));

    const summary = summarizeWeeklyDecisionPostgameCalibration([first, correction]);
    expect(summary.status).toBe('conflicting_final_outcome');
    expect(summary.central50.empiricalCoverage).toBeNull();
    expect(summary.central80.empiricalCoverage).toBeNull();
  });

  test('refuses to blend different model/calibration/scoring populations into one calibration claim', () => {
    const baseline = evaluationFor(0, 15, 14);
    const changedEntry = entry(1, {
      candidateA: candidate('starter', true, tail('run-starter-mixed', {
        p10: 8, p25: 11, p50: 15, p75: 21, p90: 28, p95: 32,
      }, {
        modelVersion: 'forecast-weekly-tail-v3',
        calibrationVersion: 'calibration-2026-w2',
        supportedPopulation: 'NFL WR PPR weekly v3',
        sourceReceipts: [{
          owner: 'TIBER-Forecast',
          artifactOrEndpoint: 'weekly-tail-v3',
          schemaOrModelVersion: 'forecast-weekly-tail-v3',
          runOrContentHash: 'run-starter-mixed',
          evidenceWindow: '2026 week 1',
          observedAt: '2026-09-07T15:55:00.000Z',
          inputCutoffAt: EVIDENCE_CUTOFF,
          generatedAt: '2026-09-07T16:05:00.000Z',
          retrievedAt: '2026-09-07T16:06:00.000Z',
          validUntil: '2026-09-07T23:00:00.000Z',
          publicationState: 'promoted',
          freshness: 'fresh',
          coverage: 'supported',
        }],
      })),
    });
    const mixed = evaluateWeeklyDecisionPostgame(changedEntry, outcome('mixed-final'));

    const summary = summarizeWeeklyDecisionPostgameCalibration([baseline, mixed]);
    expect(summary.status).toBe('mixed_cohort');
    expect(summary.cohort).toBeNull();
    expect(summary.central50.empiricalCoverage).toBeNull();
    expect(summary.central80.empiricalCoverage).toBeNull();
  });
});

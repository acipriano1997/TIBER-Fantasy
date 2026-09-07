import {
  createWeeklyDecisionLedgerEntry,
  replayWeeklyDecisionLedgerEntry,
} from '../weeklyDecisionLedger';
import type {
  WeeklyDecisionCandidate,
  WeeklyDecisionContext,
  WeeklyTailOutlook,
} from '../../../shared/weeklyDecisionContract';

function tail(overrides: Partial<WeeklyTailOutlook> = {}): WeeklyTailOutlook {
  return {
    status: 'ready',
    scoringProfileRef: 'league:ppr:hash-1',
    evidenceCutoffAt: '2026-09-07T16:00:00.000Z',
    generatedAt: '2026-09-07T16:05:00.000Z',
    modelVersion: 'forecast-weekly-tail-v2',
    calibrationVersion: 'calibration-2026-w1',
    supportedPopulation: 'NFL WR PPR weekly',
    quantiles: { p10: 8, p25: 11, p50: 15, p75: 21, p90: 28, p95: 32 },
    rightTail: null,
    leftTail: null,
    pathways: null,
    sourceReceipts: [
      {
        owner: 'TIBER-Forecast',
        artifactOrEndpoint: 'weekly-tail-v2',
        schemaOrModelVersion: 'forecast-weekly-tail-v2',
        runOrContentHash: 'run-a',
        evidenceWindow: '2026 week 1',
        observedAt: '2026-09-07T15:55:00.000Z',
        inputCutoffAt: '2026-09-07T16:00:00.000Z',
        generatedAt: '2026-09-07T16:05:00.000Z',
        retrievedAt: '2026-09-07T16:06:00.000Z',
        validUntil: '2026-09-07T23:00:00.000Z',
        publicationState: 'promoted',
        freshness: 'fresh',
        coverage: 'supported',
      },
    ],
    ...overrides,
  };
}

function candidate(
  playerId: string,
  playerName: string,
  observedStarter: boolean,
  tailOutlook: WeeklyTailOutlook | null,
): WeeklyDecisionCandidate {
  return {
    playerId,
    playerName,
    position: 'WR',
    identityStatus: 'canonical',
    observedStarter,
    tailOutlook,
  };
}

function context(): WeeklyDecisionContext {
  return {
    decisionId: 'decision-ledger-1',
    season: 2026,
    week: 1,
    evidenceCutoffAt: '2026-09-07T16:00:00.000Z',
    validUntil: '2026-09-07T23:00:00.000Z',
    leagueRef: 'league-1',
    teamRef: 'team-1',
    scoringProfileRef: 'league:ppr:hash-1',
    scoringProfileHash: 'hash-1',
    rosterSnapshotRef: 'roster-snapshot-1',
    rosterSnapshotHash: 'roster-hash-1',
    lineupAHash: 'lineup-a',
    lineupBHash: 'lineup-b',
    samePositionLegalSwap: true,
    locked: false,
    operatorPosture: 'balanced',
    candidateA: candidate('player-a', 'Player A', true, tail()),
    candidateB: candidate('player-b', 'Player B', false, tail({
      quantiles: { p10: 7, p25: 10, p50: 14, p75: 20, p90: 27, p95: 31 },
      sourceReceipts: [{
        ...tail().sourceReceipts[0],
        runOrContentHash: 'run-b',
      }],
    })),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('Weekly Decision Gate 2 ledger + frozen replay', () => {
  test('records complete frozen context, result, lineage and as-of boundary', () => {
    const entry = createWeeklyDecisionLedgerEntry(context(), '2026-09-07T16:10:00.000Z');

    expect(entry.ledgerVersion).toBe('weekly_decision_ledger_entry_v1');
    expect(entry.asOf).toEqual({
      evidenceCutoffAt: '2026-09-07T16:00:00.000Z',
      validUntil: '2026-09-07T23:00:00.000Z',
    });
    expect(entry.resultSnapshot.decisionState).toBe('comparison_available');
    expect(entry.resultSnapshot.preferredPlayerId).toBe('player-a');
    expect(entry.lineage.map((row) => [row.candidatePlayerId, row.runOrContentHash])).toEqual([
      ['player-a', 'run-a'],
      ['player-b', 'run-b'],
    ]);
    expect(entry.immutability).toEqual({
      hashAlgorithm: 'sha256',
      canonicalization: 'json_sorted_keys_v1',
      replayUsesFrozenContextOnly: true,
      liveDataAllowedOnReplay: false,
      wallClockAllowedOnReplay: false,
    });
    expect(entry.hashes.contextSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.hashes.resultSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.hashes.lineageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.hashes.entrySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('replays the exact frozen input and reproduces the recorded result', () => {
    const entry = createWeeklyDecisionLedgerEntry(context(), '2026-09-07T16:10:00.000Z');
    const replay = replayWeeklyDecisionLedgerEntry(entry);

    expect(replay.integrity).toBe('verified');
    expect(replay.determinism).toBe('matched');
    expect(replay.reasons).toEqual([]);
    expect(replay.replayedResult).toEqual(entry.resultSnapshot);
  });

  test('recording time does not change the underlying weekly decision result', () => {
    const first = createWeeklyDecisionLedgerEntry(context(), '2026-09-07T16:10:00.000Z');
    const later = createWeeklyDecisionLedgerEntry(context(), '2026-09-07T20:10:00.000Z');

    expect(first.resultSnapshot).toEqual(later.resultSnapshot);
    expect(first.hashes.resultSha256).toBe(later.hashes.resultSha256);
    expect(first.hashes.contextSha256).toBe(later.hashes.contextSha256);
    expect(first.hashes.entrySha256).not.toBe(later.hashes.entrySha256);
  });

  test('fails closed before replay when frozen context is mutated', () => {
    const entry = createWeeklyDecisionLedgerEntry(context(), '2026-09-07T16:10:00.000Z');
    const tampered = clone(entry);
    tampered.contextSnapshot.candidateB.tailOutlook!.quantiles.p50 = 999;

    const replay = replayWeeklyDecisionLedgerEntry(tampered);
    expect(replay.integrity).toBe('tampered');
    expect(replay.determinism).toBe('not_run');
    expect(replay.replayedResult).toBeNull();
    expect(replay.reasons).toContain('context_hash_mismatch');
    expect(replay.reasons).toContain('entry_hash_mismatch');
  });

  test('fails closed before replay when the recorded decision is mutated', () => {
    const entry = createWeeklyDecisionLedgerEntry(context(), '2026-09-07T16:10:00.000Z');
    const tampered = clone(entry);
    tampered.resultSnapshot.preferredPlayerId = 'player-b';

    const replay = replayWeeklyDecisionLedgerEntry(tampered);
    expect(replay.integrity).toBe('tampered');
    expect(replay.determinism).toBe('not_run');
    expect(replay.replayedResult).toBeNull();
    expect(replay.reasons).toContain('result_hash_mismatch');
  });

  test('fails closed when as-of metadata no longer matches the frozen decision context', () => {
    const entry = createWeeklyDecisionLedgerEntry(context(), '2026-09-07T16:10:00.000Z');
    const tampered = clone(entry);
    tampered.asOf.evidenceCutoffAt = '2026-09-07T17:00:00.000Z';

    const replay = replayWeeklyDecisionLedgerEntry(tampered);
    expect(replay.integrity).toBe('tampered');
    expect(replay.reasons).toContain('as_of_evidence_cutoff_mismatch');
    expect(replay.replayedResult).toBeNull();
  });

  test('does not replay unsupported ledger versions', () => {
    const entry = createWeeklyDecisionLedgerEntry(context(), '2026-09-07T16:10:00.000Z');
    const unsupported = clone(entry) as unknown as Record<string, unknown>;
    unsupported.ledgerVersion = 'weekly_decision_ledger_entry_v999';

    const replay = replayWeeklyDecisionLedgerEntry(unsupported);
    expect(replay.integrity).toBe('unsupported_version');
    expect(replay.determinism).toBe('not_run');
    expect(replay.replayedResult).toBeNull();
  });

  test('fails closed on malformed persisted JSON instead of throwing during replay', () => {
    const malformed = {
      ledgerVersion: 'weekly_decision_ledger_entry_v1',
      evaluatorSchemaVersion: 'weekly_lineup_decision_packet_v1',
      recordedAt: '2026-09-07T16:10:00.000Z',
      asOf: null,
    };

    expect(() => replayWeeklyDecisionLedgerEntry(malformed)).not.toThrow();
    const replay = replayWeeklyDecisionLedgerEntry(malformed);
    expect(replay.integrity).toBe('tampered');
    expect(replay.determinism).toBe('not_run');
    expect(replay.reasons).toContain('malformed_entry');
    expect(replay.replayedResult).toBeNull();
  });

  test('rejects non-canonical recording timestamps instead of silently normalizing them', () => {
    expect(() => createWeeklyDecisionLedgerEntry(context(), '2026-09-07 16:10:00')).toThrow(
      'recordedAt must be a canonical ISO-8601 UTC timestamp',
    );
  });
});

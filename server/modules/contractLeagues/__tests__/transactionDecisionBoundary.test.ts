import { simulateKnownAtContractTransaction } from '../transactionDecisionBoundary';
import {
  makeBoundaryContext,
  makeBoundaryPolicy,
  makeBoundaryRights,
  makeBoundarySnapshot,
} from './decisionBoundaryFixtures';

const keepAction = {
  type: 'KEEP' as const,
  teamKey: 'team-boundary',
  player: { canonicalPlayerId: 'synthetic-player' },
};

describe('contract transaction known-at boundary', () => {
  it('allows decision-ready evidence that was all known before the frozen decision time', () => {
    const result = simulateKnownAtContractTransaction(
      makeBoundarySnapshot(),
      makeBoundaryPolicy(),
      makeBoundaryContext(),
      keepAction,
    );

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
  });

  it('rejects a snapshot imported after the decision time', () => {
    const snapshot = makeBoundarySnapshot();
    snapshot.provenance.importedAt = '2026-09-15T12:31:00.000Z';

    const result = simulateKnownAtContractTransaction(
      snapshot,
      makeBoundaryPolicy(),
      makeBoundaryContext(),
      keepAction,
    );

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('SNAPSHOT_IMPORTED_AFTER_DECISION');
  });

  it('rejects policy evidence modified after the decision time', () => {
    const policy = makeBoundaryPolicy();
    policy.provenance.sourceModifiedAt = '2026-09-15T12:45:00.000Z';

    const result = simulateKnownAtContractTransaction(
      makeBoundarySnapshot(),
      policy,
      makeBoundaryContext(),
      keepAction,
    );

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('POLICY_SOURCE_MODIFIED_AFTER_DECISION');
  });

  it('rejects scarce-right state from another league', () => {
    const context = makeBoundaryContext();
    const rights = makeBoundaryRights();
    rights.leagueKey = 'different-league';
    context.rightsState = rights;

    const result = simulateKnownAtContractTransaction(
      makeBoundarySnapshot(),
      makeBoundaryPolicy(),
      context,
      keepAction,
    );

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('RIGHTS_LEAGUE_MISMATCH');
  });

  it('rejects rights state whose as-of witness is in the future', () => {
    const context = makeBoundaryContext();
    const rights = makeBoundaryRights();
    rights.asOf = '2026-09-15T12:35:00.000Z';
    context.rightsState = rights;

    const result = simulateKnownAtContractTransaction(
      makeBoundarySnapshot(),
      makeBoundaryPolicy(),
      context,
      keepAction,
    );

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('RIGHTS_AS_OF_AFTER_DECISION');
  });

  it('returns the same replay fingerprint for the same rejected evidence packet', () => {
    const snapshot = makeBoundarySnapshot();
    snapshot.provenance.importedAt = '2026-09-15T12:31:00.000Z';
    const policy = makeBoundaryPolicy();
    const context = makeBoundaryContext();

    const first = simulateKnownAtContractTransaction(snapshot, policy, context, keepAction);
    const second = simulateKnownAtContractTransaction(snapshot, policy, context, keepAction);

    expect(first.status).toBe('ABSTAIN');
    expect(second.status).toBe('ABSTAIN');
    expect(first.fingerprint).toBe(second.fingerprint);
  });
});

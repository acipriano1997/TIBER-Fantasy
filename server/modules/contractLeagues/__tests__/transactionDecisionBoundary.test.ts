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

  it('rejects a schema-valid but PARTIAL economic snapshot', () => {
    const snapshot = makeBoundarySnapshot();
    snapshot.validation.status = 'PARTIAL';
    snapshot.validation.warnings = ['Synthetic unresolved economic evidence.'];

    const result = simulateKnownAtContractTransaction(
      snapshot,
      makeBoundaryPolicy(),
      makeBoundaryContext(),
      keepAction,
    );

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('SNAPSHOT_NOT_VALID');
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

  it('rejects a schema-valid but PARTIAL policy', () => {
    const policy = makeBoundaryPolicy();
    policy.validation.status = 'PARTIAL';
    policy.validation.unresolved = [{
      code: 'SYNTHETIC_RULE_CONFLICT',
      path: 'contracts.reSign',
      detail: 'Synthetic rule conflict.',
    }];

    const result = simulateKnownAtContractTransaction(
      makeBoundarySnapshot(),
      policy,
      makeBoundaryContext(),
      keepAction,
    );

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('POLICY_NOT_VALID');
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

  it('rejects schema-valid but PARTIAL rights evidence', () => {
    const context = makeBoundaryContext();
    const rights = makeBoundaryRights();
    rights.validation.status = 'PARTIAL';
    rights.validation.warnings = ['Synthetic unresolved rights history.'];
    context.rightsState = rights;

    const result = simulateKnownAtContractTransaction(
      makeBoundarySnapshot(),
      makeBoundaryPolicy(),
      context,
      keepAction,
    );

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('RIGHTS_STATE_NOT_VALID');
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
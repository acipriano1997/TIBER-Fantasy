import {
  assertContractDecisionEvidencePacketReady,
  buildContractDecisionEvidencePacket,
} from '../decisionPacket';
import { prepareContractLeagueSnapshotRecord } from '../persistenceContract';
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

function persistedSnapshotRow() {
  const prepared = prepareContractLeagueSnapshotRecord(makeBoundarySnapshot(), {
    leagueKey: 'league-boundary',
    sourceRef: 'opaque:synthetic',
  });
  return {
    id: '00000000-0000-4000-8000-000000000001',
    ...prepared,
    supersedesSnapshotId: null,
    persistedAt: new Date('2026-09-15T12:15:00.000Z'),
  };
}

function readyInput() {
  const snapshot = makeBoundarySnapshot();
  const policy = makeBoundaryPolicy();
  const context = makeBoundaryContext();
  const consequence = simulateKnownAtContractTransaction(snapshot, policy, context, keepAction);
  return {
    leagueKey: 'league-boundary',
    decisionAt: context.decisionAt,
    decisionFamily: 'TRANSACTION' as const,
    leagueContextFingerprint: 'league-context-fingerprint',
    economicSnapshot: persistedSnapshotRow(),
    policy,
    rightsState: makeBoundaryRights(),
    scoring: {
      certificationStatus: 'certified',
      fingerprint: 'scoring-fingerprint',
      asOf: '2026-09-15T12:00:00.000Z',
    },
    requiresScoring: true,
    action: keepAction,
    consequence,
    materiallyMissingEvidence: [],
  };
}

describe('contract decision evidence packet', () => {
  it('freezes snapshot, policy, rights, scoring, action, and consequence deterministically', () => {
    const input = readyInput();
    const first = buildContractDecisionEvidencePacket(input);
    const second = buildContractDecisionEvidencePacket(input);

    expect(first.readiness.readyForCcf).toBe(true);
    expect(first.readiness.executable).toBe(true);
    expect(first.economicSnapshot.fingerprint).toBe(input.economicSnapshot.fingerprint);
    expect(first.policy.policyVersion).toBe('boundary-fixture-policy.v1');
    expect(first.policy.fingerprint).toMatch(/^sha256:/);
    expect(first.rights?.fingerprint).toMatch(/^sha256:/);
    expect(first.consequence).toEqual(input.consequence);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(() => assertContractDecisionEvidencePacketReady(first)).not.toThrow();
  });

  it('detects persisted-payload tampering through the economic snapshot fingerprint', () => {
    const input = readyInput();
    const row = structuredClone(input.economicSnapshot) as typeof input.economicSnapshot;
    (row.snapshotPayload as any).teams[0].cap[0].capRemaining = 1;

    const packet = buildContractDecisionEvidencePacket({ ...input, economicSnapshot: row });
    expect(packet.readiness.readyForCcf).toBe(false);
    expect(packet.readiness.blockers).toContain('ECONOMIC_SNAPSHOT_FINGERPRINT_MISMATCH');
  });

  it('does not allow PARTIAL policy evidence to become CCF authority', () => {
    const input = readyInput();
    const policy = structuredClone(input.policy);
    policy.validation.status = 'PARTIAL';
    policy.validation.unresolved = [{
      code: 'SYNTHETIC_RULE_CONFLICT',
      path: 'contracts.reSign',
      detail: 'Synthetic rule conflict.',
    }];

    const packet = buildContractDecisionEvidencePacket({ ...input, policy });
    expect(packet.readiness.readyForCcf).toBe(false);
    expect(packet.readiness.blockers).toContain('POLICY_NOT_VALID');
    expect(() => assertContractDecisionEvidencePacketReady(packet)).toThrow(/abstain/i);
  });

  it('requires certified scoring when the requested decision family needs it', () => {
    const input = readyInput();
    const packet = buildContractDecisionEvidencePacket({ ...input, scoring: null });
    expect(packet.readiness.readyForCcf).toBe(false);
    expect(packet.readiness.blockers).toContain('SCORING_NOT_CERTIFIED');
  });

  it('carries deterministic-engine abstention forward instead of asking CCF to repair it', () => {
    const input = readyInput();
    const snapshot = makeBoundarySnapshot();
    snapshot.validation.status = 'PARTIAL';
    const consequence = simulateKnownAtContractTransaction(
      snapshot,
      makeBoundaryPolicy(),
      makeBoundaryContext(),
      keepAction,
    );

    const packet = buildContractDecisionEvidencePacket({ ...input, consequence });
    expect(consequence.status).toBe('ABSTAIN');
    expect(packet.readiness.readyForCcf).toBe(false);
    expect(packet.readiness.blockers).toContain('CONSEQUENCE_ABSTAINED');
  });

  it('distinguishes valid evidence from executable legality', () => {
    const input = readyInput();
    const consequence = {
      status: 'READY' as const,
      engineVersion: 'synthetic-engine.v1',
      fingerprint: 'sha256:synthetic',
      legal: false,
      violations: [{ code: 'SYNTHETIC_ILLEGAL', detail: 'Synthetic rule violation.' }],
    };

    const packet = buildContractDecisionEvidencePacket({ ...input, consequence });
    expect(packet.readiness.readyForCcf).toBe(true);
    expect(packet.readiness.executable).toBe(false);
  });

  it('blocks materially missing evidence explicitly', () => {
    const input = readyInput();
    const packet = buildContractDecisionEvidencePacket({
      ...input,
      materiallyMissingEvidence: ['authoritative market price unavailable'],
    });
    expect(packet.readiness.readyForCcf).toBe(false);
    expect(packet.readiness.blockers).toContain('MATERIALLY_MISSING_EVIDENCE');
    expect(packet.materiallyMissingEvidence).toEqual(['authoritative market price unavailable']);
  });
});

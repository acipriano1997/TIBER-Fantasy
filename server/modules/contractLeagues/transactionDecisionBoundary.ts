import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { contractLeagueSnapshotSchema } from './contracts';
import { contractLeaguePolicySchema } from './policy';
import { contractLeagueRightsStateSchema } from './rights';
import {
  simulateContractTransaction,
  type ContractTransactionAction,
  type ContractTransactionContext,
  type ContractTransactionResult,
} from './transactionEngine';

export const CONTRACT_TRANSACTION_DECISION_BOUNDARY_VERSION = 'contract-transaction-decision-boundary.v1' as const;

export type ContractTransactionBoundaryAbstention = {
  status: 'ABSTAIN';
  engineVersion: typeof CONTRACT_TRANSACTION_DECISION_BOUNDARY_VERSION;
  reasonCodes: string[];
  details: string[];
  fingerprint: string;
};

export type ContractTransactionBoundaryResult =
  | ContractTransactionBoundaryAbstention
  | ContractTransactionResult;

type BoundaryReason = { code: string; detail: string };

function deterministicFingerprint(value: unknown) {
  const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null';
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function boundaryAbstention(
  snapshotInput: unknown,
  policyInput: unknown,
  context: ContractTransactionContext,
  action: ContractTransactionAction,
  reasons: BoundaryReason[],
): ContractTransactionBoundaryAbstention {
  return {
    status: 'ABSTAIN',
    engineVersion: CONTRACT_TRANSACTION_DECISION_BOUNDARY_VERSION,
    reasonCodes: [...new Set(reasons.map((item) => item.code))],
    details: reasons.map((item) => item.detail),
    fingerprint: deterministicFingerprint({
      boundaryVersion: CONTRACT_TRANSACTION_DECISION_BOUNDARY_VERSION,
      snapshotInput,
      policyInput,
      context,
      action,
      reasons,
    }),
  };
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).valueOf();
  return Number.isFinite(parsed) ? parsed : null;
}

function rejectFutureEvidence(
  reasons: BoundaryReason[],
  decisionMs: number,
  label: string,
  value: string | null | undefined,
  code: string,
) {
  if (!value) return;
  const evidenceMs = parseTime(value);
  if (evidenceMs === null) {
    reasons.push({
      code: `${code}_INVALID`,
      detail: `${label} must be a valid timestamp when present.`,
    });
    return;
  }
  if (evidenceMs > decisionMs) {
    reasons.push({
      code,
      detail: `${label} occurs after the frozen decision timestamp and is ineligible for known-at simulation.`,
    });
  }
}

/**
 * Temporal/source eligibility wrapper for contract transaction simulation.
 *
 * The pure transaction kernel owns legality and economic consequences. This
 * boundary owns known-at/anti-leakage eligibility so historical decisions can
 * be replayed without admitting evidence that only became available later.
 *
 * Schema validity is intentionally not enough. Only evidence explicitly marked
 * VALID may cross this decision boundary; PARTIAL and REJECTED evidence remain
 * inspectable/replayable but cannot become recommendation authority.
 */
export function simulateKnownAtContractTransaction(
  snapshotInput: unknown,
  policyInput: unknown,
  context: ContractTransactionContext,
  action: ContractTransactionAction,
): ContractTransactionBoundaryResult {
  const reasons: BoundaryReason[] = [];
  const leagueKey = context.leagueKey.trim();
  if (!leagueKey) {
    reasons.push({
      code: 'LEAGUE_KEY_REQUIRED',
      detail: 'Known-at transaction simulation requires an explicit internal league key.',
    });
  }

  const decisionMs = parseTime(context.decisionAt);
  if (decisionMs === null) {
    reasons.push({
      code: 'DECISION_TIME_INVALID',
      detail: 'Known-at transaction simulation requires a valid frozen decision timestamp.',
    });
    return boundaryAbstention(snapshotInput, policyInput, context, action, reasons);
  }

  const snapshotResult = contractLeagueSnapshotSchema.safeParse(snapshotInput);
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);

  if (!snapshotResult.success) {
    reasons.push({ code: 'SNAPSHOT_INVALID', detail: 'Contract snapshot failed schema validation.' });
  } else {
    if (snapshotResult.data.validation.status !== 'VALID') {
      reasons.push({
        code: 'SNAPSHOT_NOT_VALID',
        detail: `Contract snapshot validation status is ${snapshotResult.data.validation.status}; only VALID evidence may drive a decision.`,
      });
    }
    rejectFutureEvidence(
      reasons,
      decisionMs,
      'snapshot provenance.importedAt',
      snapshotResult.data.provenance.importedAt,
      'SNAPSHOT_IMPORTED_AFTER_DECISION',
    );
    rejectFutureEvidence(
      reasons,
      decisionMs,
      'snapshot provenance.sourceModifiedAt',
      snapshotResult.data.provenance.sourceModifiedAt,
      'SNAPSHOT_SOURCE_MODIFIED_AFTER_DECISION',
    );
  }

  if (!policyResult.success) {
    reasons.push({ code: 'POLICY_INVALID', detail: 'Contract policy failed schema validation.' });
  } else {
    if (policyResult.data.validation.status !== 'VALID') {
      reasons.push({
        code: 'POLICY_NOT_VALID',
        detail: `Contract policy validation status is ${policyResult.data.validation.status}; only VALID evidence may drive a decision.`,
      });
    }
    rejectFutureEvidence(
      reasons,
      decisionMs,
      'policy provenance.importedAt',
      policyResult.data.provenance.importedAt,
      'POLICY_IMPORTED_AFTER_DECISION',
    );
    rejectFutureEvidence(
      reasons,
      decisionMs,
      'policy provenance.sourceModifiedAt',
      policyResult.data.provenance.sourceModifiedAt,
      'POLICY_SOURCE_MODIFIED_AFTER_DECISION',
    );
  }

  if (context.rightsState) {
    const rightsResult = contractLeagueRightsStateSchema.safeParse(context.rightsState);
    if (!rightsResult.success) {
      reasons.push({ code: 'RIGHTS_STATE_INVALID', detail: 'Contract rights state failed schema validation.' });
    } else {
      if (rightsResult.data.validation.status !== 'VALID') {
        reasons.push({
          code: 'RIGHTS_STATE_NOT_VALID',
          detail: `Contract rights-state validation status is ${rightsResult.data.validation.status}; only VALID evidence may drive a decision.`,
        });
      }
      if (rightsResult.data.leagueKey !== leagueKey) {
        reasons.push({
          code: 'RIGHTS_LEAGUE_MISMATCH',
          detail: 'Scarce-right state belongs to a different internal league key.',
        });
      }
      rejectFutureEvidence(
        reasons,
        decisionMs,
        'rights asOf',
        rightsResult.data.asOf,
        'RIGHTS_AS_OF_AFTER_DECISION',
      );
      rejectFutureEvidence(
        reasons,
        decisionMs,
        'rights provenance.importedAt',
        rightsResult.data.provenance.importedAt,
        'RIGHTS_IMPORTED_AFTER_DECISION',
      );
      rejectFutureEvidence(
        reasons,
        decisionMs,
        'rights provenance.sourceModifiedAt',
        rightsResult.data.provenance.sourceModifiedAt,
        'RIGHTS_SOURCE_MODIFIED_AFTER_DECISION',
      );
    }
  }

  if (reasons.length > 0) {
    return boundaryAbstention(snapshotInput, policyInput, context, action, reasons);
  }

  return simulateContractTransaction(snapshotInput, policyInput, context, action);
}
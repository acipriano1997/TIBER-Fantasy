import crypto from "crypto";

export const SLEEPER_ACTION_TYPES = [
  "lineup_update",
  "reserve_move",
  "waiver_claim",
  "free_agent_add_drop",
  "trade_proposal",
  "trade_response",
] as const;

export type SleeperActionType = typeof SLEEPER_ACTION_TYPES[number];
export type SleeperWriteAuthorizationState =
  | "authorized"
  | "pending_external"
  | "revoked"
  | "unconfigured";
export type SleeperActionLockState = "open" | "locked" | "unknown";

export interface SleeperActionProposal {
  contractVersion: "sleeper-action-proposal-v1";
  actionId: string;
  actionType: SleeperActionType;
  leagueId: string;
  rosterId: number;
  ownerUserId: string;
  createdAt: string;
  expiresAt: string;
  expectedStateFingerprint: string;
  decisionRef: string;
  payloadFingerprint: string;
  idempotencyKey: string;
  explicitApprovalRequired: true;
}

export interface SleeperActionApproval {
  contractVersion: "sleeper-action-approval-v1";
  actionId: string;
  proposalFingerprint: string;
  approvedAt: string;
  approvedByUserId: string;
  explicitApproval: true;
}

export interface SleeperActionExecutionReceipt {
  contractVersion: "sleeper-action-execution-receipt-v1";
  actionId: string;
  idempotencyKey: string;
  proposalFingerprint: string;
  sentAt: string;
  readBackAt: string;
  platformRequestId: string | null;
  beforeStateFingerprint: string;
  afterStateFingerprint: string | null;
  outcome: "confirmed" | "no_change" | "ambiguous" | "failed";
  evidenceRef: string;
}

export interface SleeperActionPreflightContext {
  now: string;
  liveStateFingerprint: string;
  authenticatedUserId: string;
  lockState: SleeperActionLockState;
  writeAuthorization: SleeperWriteAuthorizationState;
  priorExecutionReceipts: readonly SleeperActionExecutionReceipt[];
}

export interface SleeperActionPreflightResult {
  contractVersion: "sleeper-action-preflight-v1";
  status: "ready_to_send" | "blocked_internal" | "blocked_external";
  readyToSend: boolean;
  proposalFingerprint: string | null;
  internalBlockers: string[];
  externalBlockers: string[];
}

export class SleeperActionSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SleeperActionSafetyError";
  }
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new SleeperActionSafetyError(`${label} must be a valid timestamp`);
  return parsed;
}

export function validateSleeperActionProposal(
  proposal: SleeperActionProposal,
): SleeperActionProposal {
  if (proposal.contractVersion !== "sleeper-action-proposal-v1") {
    throw new SleeperActionSafetyError("unsupported Sleeper action proposal version");
  }
  if (!SLEEPER_ACTION_TYPES.includes(proposal.actionType)) {
    throw new SleeperActionSafetyError("unsupported Sleeper action type");
  }
  for (const [label, value] of [
    ["actionId", proposal.actionId],
    ["leagueId", proposal.leagueId],
    ["ownerUserId", proposal.ownerUserId],
    ["expectedStateFingerprint", proposal.expectedStateFingerprint],
    ["decisionRef", proposal.decisionRef],
    ["payloadFingerprint", proposal.payloadFingerprint],
    ["idempotencyKey", proposal.idempotencyKey],
  ] as const) {
    if (!hasText(value)) throw new SleeperActionSafetyError(`${label} is required`);
  }
  if (!Number.isInteger(proposal.rosterId) || proposal.rosterId <= 0) {
    throw new SleeperActionSafetyError("rosterId must be a positive integer");
  }
  const createdAt = timestamp("createdAt", proposal.createdAt);
  const expiresAt = timestamp("expiresAt", proposal.expiresAt);
  if (expiresAt <= createdAt) {
    throw new SleeperActionSafetyError("expiresAt must be after createdAt");
  }
  if (proposal.explicitApprovalRequired !== true) {
    throw new SleeperActionSafetyError("explicit approval must remain required");
  }
  return proposal;
}

export function fingerprintSleeperActionProposal(proposal: SleeperActionProposal): string {
  validateSleeperActionProposal(proposal);
  return crypto.createHash("sha256").update(JSON.stringify(proposal)).digest("hex");
}

export function validateSleeperActionApproval(
  proposal: SleeperActionProposal,
  approval: SleeperActionApproval,
): SleeperActionApproval {
  validateSleeperActionProposal(proposal);
  if (approval.contractVersion !== "sleeper-action-approval-v1") {
    throw new SleeperActionSafetyError("unsupported Sleeper action approval version");
  }
  if (approval.explicitApproval !== true) {
    throw new SleeperActionSafetyError("approval must be explicit");
  }
  if (approval.actionId !== proposal.actionId) {
    throw new SleeperActionSafetyError("approval actionId does not match proposal");
  }
  if (approval.proposalFingerprint !== fingerprintSleeperActionProposal(proposal)) {
    throw new SleeperActionSafetyError("approval proposal fingerprint does not match proposal");
  }
  if (approval.approvedByUserId !== proposal.ownerUserId) {
    throw new SleeperActionSafetyError("approval user does not match proposal owner");
  }
  const approvedAt = timestamp("approvedAt", approval.approvedAt);
  if (approvedAt < Date.parse(proposal.createdAt) || approvedAt > Date.parse(proposal.expiresAt)) {
    throw new SleeperActionSafetyError("approval must occur within proposal validity window");
  }
  return approval;
}

export function evaluateSleeperActionPreflight(
  proposal: SleeperActionProposal,
  approval: SleeperActionApproval | null,
  context: SleeperActionPreflightContext,
): SleeperActionPreflightResult {
  const internalBlockers: string[] = [];
  const externalBlockers: string[] = [];
  let proposalFingerprint: string | null = null;

  try {
    proposalFingerprint = fingerprintSleeperActionProposal(proposal);
  } catch (error) {
    internalBlockers.push(`invalid_proposal:${error instanceof Error ? error.message : "unknown"}`);
  }

  const now = Date.parse(context.now);
  if (!Number.isFinite(now)) internalBlockers.push("invalid_now_timestamp");

  if (!hasText(context.liveStateFingerprint)) internalBlockers.push("live_state_fingerprint_missing");
  if (!hasText(context.authenticatedUserId)) internalBlockers.push("authenticated_user_missing");

  if (proposalFingerprint) {
    if (approval == null) {
      internalBlockers.push("explicit_approval_missing");
    } else {
      try {
        validateSleeperActionApproval(proposal, approval);
        if (Number.isFinite(now) && Date.parse(approval.approvedAt) > now) {
          internalBlockers.push("approval_known_after_preflight");
        }
      } catch (error) {
        internalBlockers.push(`invalid_approval:${error instanceof Error ? error.message : "unknown"}`);
      }
    }

    if (Number.isFinite(now) && now > Date.parse(proposal.expiresAt)) {
      internalBlockers.push("proposal_expired");
    }
    if (context.liveStateFingerprint !== proposal.expectedStateFingerprint) {
      internalBlockers.push("live_state_changed_since_proposal");
    }
    if (context.authenticatedUserId !== proposal.ownerUserId) {
      internalBlockers.push("authenticated_user_does_not_own_proposal");
    }
    if (context.lockState !== "open") {
      internalBlockers.push(`action_lock_state_${context.lockState}`);
    }
    if (context.priorExecutionReceipts.some((receipt) =>
      receipt.idempotencyKey === proposal.idempotencyKey || receipt.actionId === proposal.actionId,
    )) {
      internalBlockers.push("duplicate_or_replayed_action");
    }
  }

  if (context.writeAuthorization === "pending_external") {
    externalBlockers.push("sleeper_write_authorization_pending_external");
  } else if (context.writeAuthorization !== "authorized") {
    internalBlockers.push(`sleeper_write_authorization_${context.writeAuthorization}`);
  }

  const status = internalBlockers.length > 0
    ? "blocked_internal"
    : externalBlockers.length > 0
      ? "blocked_external"
      : "ready_to_send";

  return {
    contractVersion: "sleeper-action-preflight-v1",
    status,
    readyToSend: status === "ready_to_send",
    proposalFingerprint,
    internalBlockers,
    externalBlockers,
  };
}

export function validateSleeperActionExecutionReceipt(
  proposal: SleeperActionProposal,
  approval: SleeperActionApproval,
  receipt: SleeperActionExecutionReceipt,
): SleeperActionExecutionReceipt {
  validateSleeperActionApproval(proposal, approval);
  if (receipt.contractVersion !== "sleeper-action-execution-receipt-v1") {
    throw new SleeperActionSafetyError("unsupported Sleeper action execution receipt version");
  }
  if (receipt.actionId !== proposal.actionId) {
    throw new SleeperActionSafetyError("execution receipt actionId does not match proposal");
  }
  if (receipt.idempotencyKey !== proposal.idempotencyKey) {
    throw new SleeperActionSafetyError("execution receipt idempotencyKey does not match proposal");
  }
  if (receipt.proposalFingerprint !== fingerprintSleeperActionProposal(proposal)) {
    throw new SleeperActionSafetyError("execution receipt proposal fingerprint does not match proposal");
  }
  if (!hasText(receipt.beforeStateFingerprint)) {
    throw new SleeperActionSafetyError("beforeStateFingerprint is required");
  }
  if (!hasText(receipt.evidenceRef)) throw new SleeperActionSafetyError("evidenceRef is required");

  const sentAt = timestamp("sentAt", receipt.sentAt);
  const readBackAt = timestamp("readBackAt", receipt.readBackAt);
  if (sentAt < Date.parse(approval.approvedAt)) {
    throw new SleeperActionSafetyError("action cannot be sent before explicit approval");
  }
  if (readBackAt < sentAt) {
    throw new SleeperActionSafetyError("readBackAt cannot precede sentAt");
  }

  if (receipt.outcome === "confirmed") {
    if (!hasText(receipt.afterStateFingerprint)) {
      throw new SleeperActionSafetyError("confirmed action requires an after-state fingerprint");
    }
    if (receipt.afterStateFingerprint === receipt.beforeStateFingerprint) {
      throw new SleeperActionSafetyError("confirmed action must change observed state");
    }
  }
  if (receipt.outcome === "no_change") {
    if (receipt.afterStateFingerprint !== receipt.beforeStateFingerprint) {
      throw new SleeperActionSafetyError("no_change receipt must preserve the observed state fingerprint");
    }
  }

  return receipt;
}

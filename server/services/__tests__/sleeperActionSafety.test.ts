import {
  evaluateSleeperActionPreflight,
  fingerprintSleeperActionProposal,
  validateSleeperActionExecutionReceipt,
  type SleeperActionApproval,
  type SleeperActionExecutionReceipt,
  type SleeperActionPreflightContext,
  type SleeperActionProposal,
} from "../sleeperActionSafety";

function proposal(): SleeperActionProposal {
  return {
    contractVersion: "sleeper-action-proposal-v1",
    actionId: "action-lineup-001",
    actionType: "lineup_update",
    leagueId: "league-123",
    rosterId: 7,
    ownerUserId: "user-123",
    createdAt: "2026-09-15T16:00:00Z",
    expiresAt: "2026-09-15T16:10:00Z",
    expectedStateFingerprint: "state-before",
    decisionRef: "decision://lineup/2026-w2",
    payloadFingerprint: "payload-sha256",
    idempotencyKey: "idem-lineup-001",
    explicitApprovalRequired: true,
  };
}

function approval(p: SleeperActionProposal = proposal()): SleeperActionApproval {
  return {
    contractVersion: "sleeper-action-approval-v1",
    actionId: p.actionId,
    proposalFingerprint: fingerprintSleeperActionProposal(p),
    approvedAt: "2026-09-15T16:02:00Z",
    approvedByUserId: p.ownerUserId,
    explicitApproval: true,
  };
}

function context(): SleeperActionPreflightContext {
  return {
    now: "2026-09-15T16:03:00Z",
    liveStateFingerprint: "state-before",
    authenticatedUserId: "user-123",
    lockState: "open",
    writeAuthorization: "authorized",
    priorExecutionReceipts: [],
  };
}

function confirmedReceipt(p: SleeperActionProposal = proposal()): SleeperActionExecutionReceipt {
  return {
    contractVersion: "sleeper-action-execution-receipt-v1",
    actionId: p.actionId,
    idempotencyKey: p.idempotencyKey,
    proposalFingerprint: fingerprintSleeperActionProposal(p),
    sentAt: "2026-09-15T16:03:30Z",
    readBackAt: "2026-09-15T16:03:35Z",
    platformRequestId: "sleeper-request-001",
    beforeStateFingerprint: "state-before",
    afterStateFingerprint: "state-after",
    outcome: "confirmed",
    evidenceRef: "readback://sleeper/action-lineup-001",
  };
}

describe("Sleeper write-action safety", () => {
  it("permits send only after explicit approval with unchanged live state and open locks", () => {
    const p = proposal();
    const result = evaluateSleeperActionPreflight(p, approval(p), context());
    expect(result.status).toBe("ready_to_send");
    expect(result.readyToSend).toBe(true);
    expect(result.internalBlockers).toEqual([]);
    expect(result.externalBlockers).toEqual([]);
  });

  it("keeps pending Sleeper write authorization external when internal safety is clean", () => {
    const p = proposal();
    const result = evaluateSleeperActionPreflight(p, approval(p), {
      ...context(),
      writeAuthorization: "pending_external",
    });
    expect(result.status).toBe("blocked_external");
    expect(result.internalBlockers).toEqual([]);
    expect(result.externalBlockers).toEqual([
      "sleeper_write_authorization_pending_external",
    ]);
  });

  it("fails closed when authoritative live state changed after the proposal", () => {
    const p = proposal();
    const result = evaluateSleeperActionPreflight(p, approval(p), {
      ...context(),
      liveStateFingerprint: "state-changed",
    });
    expect(result.status).toBe("blocked_internal");
    expect(result.internalBlockers).toContain("live_state_changed_since_proposal");
  });

  it("rejects missing approval, unknown locks, wrong owner and expired proposals", () => {
    const p = proposal();
    const result = evaluateSleeperActionPreflight(p, null, {
      ...context(),
      now: "2026-09-15T16:11:00Z",
      authenticatedUserId: "another-user",
      lockState: "unknown",
    });
    expect(result.status).toBe("blocked_internal");
    expect(result.internalBlockers).toEqual(expect.arrayContaining([
      "explicit_approval_missing",
      "proposal_expired",
      "authenticated_user_does_not_own_proposal",
      "action_lock_state_unknown",
    ]));
  });

  it("blocks duplicate or replayed idempotency keys before send", () => {
    const p = proposal();
    const prior = confirmedReceipt(p);
    const result = evaluateSleeperActionPreflight(p, approval(p), {
      ...context(),
      priorExecutionReceipts: [prior],
    });
    expect(result.status).toBe("blocked_internal");
    expect(result.internalBlockers).toContain("duplicate_or_replayed_action");
  });

  it("requires post-action readback proof for a confirmed state change", () => {
    const p = proposal();
    const a = approval(p);
    expect(validateSleeperActionExecutionReceipt(p, a, confirmedReceipt(p))).toEqual(
      confirmedReceipt(p),
    );

    expect(() => validateSleeperActionExecutionReceipt(p, a, {
      ...confirmedReceipt(p),
      afterStateFingerprint: "state-before",
    })).toThrow(/confirmed action must change observed state/);
  });

  it("binds approval to the exact proposal fingerprint", () => {
    const p = proposal();
    const changed = { ...p, payloadFingerprint: "different-payload" };
    const result = evaluateSleeperActionPreflight(changed, approval(p), context());
    expect(result.status).toBe("blocked_internal");
    expect(result.internalBlockers.some((blocker) =>
      blocker.includes("approval proposal fingerprint does not match proposal"),
    )).toBe(true);
  });
});

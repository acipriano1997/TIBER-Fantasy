export type CCFSourceEvidenceClass =
  | "source_backed"
  | "manual_observation"
  | "fixture_only"
  | "unknown";

export type CCFSourceGovernanceState =
  | "promoted"
  | "candidate"
  | "provisional"
  | "retired";

export interface CCFSourceSupportWindow {
  validFrom: string;
  validThrough: string | null;
}

export interface CCFSourceState {
  sourceId: string;
  evidenceClass: CCFSourceEvidenceClass;
  governanceState: CCFSourceGovernanceState;
  knownAt: string;
  supportWindow: CCFSourceSupportWindow;
  staleAfter?: string | null;
  producer: string | null;
  note?: string;
}

export type CCFSourceEligibilityReason =
  | "eligible"
  | "not_source_backed"
  | "not_promoted"
  | "known_after_as_of"
  | "before_support_window"
  | "after_support_window"
  | "stale"
  | "invalid_timestamp";

export interface CCFSourceEligibilityDecision {
  eligible: boolean;
  reason: CCFSourceEligibilityReason;
}

function timestamp(value: string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateCCFSourceStateEligibility(
  state: CCFSourceState,
  asOf: string,
): CCFSourceEligibilityDecision {
  const asOfMs = timestamp(asOf);
  const knownAtMs = timestamp(state.knownAt);
  const validFromMs = timestamp(state.supportWindow.validFrom);
  const validThroughMs = timestamp(state.supportWindow.validThrough);
  const staleAfterMs = timestamp(state.staleAfter);

  if (
    asOfMs == null ||
    knownAtMs == null ||
    validFromMs == null ||
    (state.supportWindow.validThrough != null && validThroughMs == null) ||
    (state.staleAfter != null && staleAfterMs == null)
  ) {
    return { eligible: false, reason: "invalid_timestamp" };
  }

  if (state.evidenceClass !== "source_backed") {
    return { eligible: false, reason: "not_source_backed" };
  }
  if (state.governanceState !== "promoted") {
    return { eligible: false, reason: "not_promoted" };
  }
  if (knownAtMs > asOfMs) {
    return { eligible: false, reason: "known_after_as_of" };
  }
  if (asOfMs < validFromMs) {
    return { eligible: false, reason: "before_support_window" };
  }
  if (validThroughMs != null && asOfMs > validThroughMs) {
    return { eligible: false, reason: "after_support_window" };
  }
  if (staleAfterMs != null && asOfMs > staleAfterMs) {
    return { eligible: false, reason: "stale" };
  }

  return { eligible: true, reason: "eligible" };
}

export function assertCCFSourceStateEligible(state: CCFSourceState, asOf: string): CCFSourceState {
  const decision = evaluateCCFSourceStateEligibility(state, asOf);
  if (!decision.eligible) {
    throw new Error(`CCF source ${state.sourceId} is ineligible at ${asOf}: ${decision.reason}`);
  }
  return state;
}

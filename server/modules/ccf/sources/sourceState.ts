import crypto from "crypto";

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

export type CCFSourcePermissionStatus =
  | "unreviewed"
  | "evaluation_only"
  | "conflicted"
  | "permitted_for_intended_use"
  | "prohibited";

export type CCFSourceReliabilityStatus =
  | "unreviewed"
  | "incomplete"
  | "passed"
  | "failed";

export interface CCFSourceQualification {
  qualificationVersion: "ccf-source-qualification-v1";
  qualificationId: string;
  reviewedAt: string;
  termsOrLicenseRef: string | null;
  permissionStatus: CCFSourcePermissionStatus;
  parserVersion: string | null;
  rawTraceSupported: boolean;
  pointInTimeSemanticsDocumented: boolean;
  reliabilityReviewRef: string | null;
  reliabilityStatus: CCFSourceReliabilityStatus;
  notes: string[];
}

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
  /** Required and fully passing before governanceState=promoted is eligible. */
  qualification?: CCFSourceQualification | null;
  note?: string;
}

export type CCFSourceEligibilityReason =
  | "eligible"
  | "not_source_backed"
  | "not_promoted"
  | "qualification_missing"
  | "qualification_invalid"
  | "terms_or_license_missing"
  | "permission_not_cleared"
  | "parser_unversioned"
  | "raw_trace_unavailable"
  | "point_in_time_undocumented"
  | "reliability_review_missing"
  | "reliability_not_passed"
  | "known_after_as_of"
  | "before_support_window"
  | "after_support_window"
  | "stale"
  | "invalid_timestamp";

export interface CCFSourceEligibilityDecision {
  eligible: boolean;
  reason: CCFSourceEligibilityReason;
}

export class CCFSourceQualificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFSourceQualificationError";
  }
}

function timestamp(value: string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function validateCCFSourceQualification(
  qualification: CCFSourceQualification,
): CCFSourceQualification {
  if (qualification.qualificationVersion !== "ccf-source-qualification-v1") {
    throw new CCFSourceQualificationError("unsupported source qualification version");
  }
  if (!hasText(qualification.qualificationId)) {
    throw new CCFSourceQualificationError("qualificationId is required");
  }
  if (timestamp(qualification.reviewedAt) == null) {
    throw new CCFSourceQualificationError("reviewedAt must be a valid timestamp");
  }
  if (new Set(qualification.notes).size !== qualification.notes.length) {
    throw new CCFSourceQualificationError("source qualification notes must not contain duplicates");
  }
  return qualification;
}

export function fingerprintCCFSourceQualification(
  qualification: CCFSourceQualification,
): string {
  validateCCFSourceQualification(qualification);
  const canonical = JSON.stringify({
    ...qualification,
    notes: [...qualification.notes],
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function qualificationEligibilityReason(
  qualification: CCFSourceQualification | null | undefined,
): CCFSourceEligibilityReason | null {
  if (qualification == null) return "qualification_missing";

  try {
    validateCCFSourceQualification(qualification);
  } catch {
    return "qualification_invalid";
  }

  if (!hasText(qualification.termsOrLicenseRef)) return "terms_or_license_missing";
  if (qualification.permissionStatus !== "permitted_for_intended_use") {
    return "permission_not_cleared";
  }
  if (!hasText(qualification.parserVersion)) return "parser_unversioned";
  if (!qualification.rawTraceSupported) return "raw_trace_unavailable";
  if (!qualification.pointInTimeSemanticsDocumented) return "point_in_time_undocumented";
  if (!hasText(qualification.reliabilityReviewRef)) return "reliability_review_missing";
  if (qualification.reliabilityStatus !== "passed") return "reliability_not_passed";
  return null;
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

  const qualificationReason = qualificationEligibilityReason(state.qualification);
  if (qualificationReason != null) {
    return { eligible: false, reason: qualificationReason };
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

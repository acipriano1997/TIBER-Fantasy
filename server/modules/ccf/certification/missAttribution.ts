export type CCFMissPrimaryCause =
  | "model_error"
  | "evidence_error"
  | "calibration_error"
  | "decision_policy_error"
  | "regime_change"
  | "irreducible_variance";

export type CCFMissContributingCause =
  | "missing_source_evidence"
  | "late_breaking_evidence"
  | "source_revision"
  | "parser_or_ingestion_error"
  | "identity_resolution_error"
  | "feature_construction_error"
  | "role_transition_missed"
  | "interaction_missed"
  | "distribution_tail_missed"
  | "overconfidence"
  | "underconfidence"
  | "abstention_failure"
  | "objective_mismatch"
  | "regime_shift_suspected"
  | "variance_without_actionable_signal";

export type CCFMissSeverity = "minor" | "material" | "major";

export interface CCFMissAttributionRecord {
  contractVersion: "ccf-miss-attribution-v1";
  attributionId: string;
  decisionReceiptId: string;
  outcomeKnownAt: string;
  attributedAt: string;
  primaryCause: CCFMissPrimaryCause;
  contributingCauses: CCFMissContributingCause[];
  severity: CCFMissSeverity;
  realizedRegret: number | null;
  absolutePredictionError: number | null;
  evidenceRefs: string[];
  reviewStatus: "automated_preliminary" | "human_reviewed";
  modelUpdateAuthorized: false;
  notes: string[];
}

export interface CCFMissAttributionSummaryRow {
  cause: CCFMissPrimaryCause;
  count: number;
  share: number;
  recordsWithRegret: number;
  meanRegret: number | null;
  totalRegret: number;
  majorCount: number;
}

export interface CCFMissAttributionSummary {
  totalRecords: number;
  rows: CCFMissAttributionSummaryRow[];
}

const PRIMARY_CAUSES: readonly CCFMissPrimaryCause[] = [
  "model_error",
  "evidence_error",
  "calibration_error",
  "decision_policy_error",
  "regime_change",
  "irreducible_variance",
];

function requireText(label: string, value: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function optionalNonNegative(label: string, value: number | null): void {
  if (value != null && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${label} must be finite and non-negative when provided`);
  }
}

export function validateCCFMissAttributionRecord(
  record: CCFMissAttributionRecord,
): CCFMissAttributionRecord {
  if (record.contractVersion !== "ccf-miss-attribution-v1") {
    throw new Error("unsupported miss attribution contract version");
  }
  requireText("attributionId", record.attributionId);
  requireText("decisionReceiptId", record.decisionReceiptId);
  const outcomeKnownAt = timestamp("outcomeKnownAt", record.outcomeKnownAt);
  const attributedAt = timestamp("attributedAt", record.attributedAt);
  if (attributedAt < outcomeKnownAt) {
    throw new Error("attributedAt must not precede outcomeKnownAt");
  }
  if (new Set(record.contributingCauses).size !== record.contributingCauses.length) {
    throw new Error("contributingCauses contains duplicate values");
  }
  optionalNonNegative("realizedRegret", record.realizedRegret);
  optionalNonNegative("absolutePredictionError", record.absolutePredictionError);
  if (new Set(record.evidenceRefs).size !== record.evidenceRefs.length) {
    throw new Error("evidenceRefs contains duplicate values");
  }
  if (record.evidenceRefs.some((ref) => !ref.trim())) {
    throw new Error("evidenceRefs must not contain blank values");
  }
  if (record.modelUpdateAuthorized !== false) {
    throw new Error("miss attribution is diagnostic and cannot itself authorize a model update");
  }
  return record;
}

export function summarizeCCFMissAttributions(
  records: readonly CCFMissAttributionRecord[],
): CCFMissAttributionSummary {
  const ids = new Set<string>();
  const valid = records.map((record) => {
    validateCCFMissAttributionRecord(record);
    if (ids.has(record.attributionId)) {
      throw new Error(`duplicate attributionId ${record.attributionId}`);
    }
    ids.add(record.attributionId);
    return record;
  });

  const rows = PRIMARY_CAUSES.map((cause) => {
    const members = valid.filter((record) => record.primaryCause === cause);
    const regretMembers = members.filter(
      (record): record is CCFMissAttributionRecord & { realizedRegret: number } =>
        record.realizedRegret != null,
    );
    const totalRegret = regretMembers.reduce(
      (sum, record) => sum + record.realizedRegret,
      0,
    );
    return {
      cause,
      count: members.length,
      share: valid.length ? members.length / valid.length : 0,
      recordsWithRegret: regretMembers.length,
      meanRegret: regretMembers.length ? totalRegret / regretMembers.length : null,
      totalRegret,
      majorCount: members.filter((record) => record.severity === "major").length,
    };
  });

  return { totalRecords: valid.length, rows };
}

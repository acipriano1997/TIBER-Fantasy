import crypto from "crypto";
import {
  evaluateCCFDecisionRegret,
  type CCFDecisionRegretMetrics,
  type CCFDecisionRegretObservation,
} from "./decisionRegret";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";

export const CCF_LINEUP_REGRET_POLICY_VERSION =
  "ccf-lineup-regret-policy-v1" as const;
export const CCF_LINEUP_REGRET_CATASTROPHIC_THRESHOLD_V1 = 10;

export interface CCFHistoricalLineupDecisionWitnessV1 {
  contractVersion: "ccf-historical-lineup-decision-witness-v1";
  decisionId: string;
  leagueRef: string;
  teamRef: string;
  season: number;
  week: number;
  decisionAsOf: string;
  rosterSnapshotFingerprint: string;
  feasibleSetFingerprint: string;
  feasibleSetBuilderVersion: string;
  feasibleSetComplete: true;
  feasibleLineupCount: number;
  chosenLineupFingerprint: string;
  chosenRealizedUtility: number;
  bestFeasibleLineupFingerprint: string;
  bestFeasibleRealizedUtility: number;
  outcomeKnownAt: string;
  frozenAt: string;
  outcomeAccess: "available_for_validation";
  evidenceRefs: string[];
}

export interface CCFRollingValidationLineupRegretEvidenceV1 {
  contractVersion: "ccf-rolling-validation-lineup-regret-evidence-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  policyVersion: typeof CCF_LINEUP_REGRET_POLICY_VERSION;
  catastrophicRegretThreshold: number;
  decisionCount: number;
  metrics: CCFDecisionRegretMetrics;
  decisionEvidenceRefs: string[];
  evidenceRef: string;
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingValidationLineupRegretEvidenceInput {
  protocol: CCFPredictiveValidationProtocol;
  replayBindingId: string;
  witnesses: CCFHistoricalLineupDecisionWitnessV1[];
}

export class CCFRollingValidationLineupRegretEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationLineupRegretEvidenceError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requireText(label: string, value: string): string {
  if (!value.trim()) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      `${label} is required`,
    );
  }
  return value;
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      `${label} must be a valid timestamp`,
    );
  }
  return parsed;
}

function validateWitness(
  witness: CCFHistoricalLineupDecisionWitnessV1,
): CCFHistoricalLineupDecisionWitnessV1 {
  if (
    witness.contractVersion !==
    "ccf-historical-lineup-decision-witness-v1"
  ) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "unsupported historical lineup decision witness version",
    );
  }

  for (const [label, value] of [
    ["decisionId", witness.decisionId],
    ["leagueRef", witness.leagueRef],
    ["teamRef", witness.teamRef],
    ["rosterSnapshotFingerprint", witness.rosterSnapshotFingerprint],
    ["feasibleSetFingerprint", witness.feasibleSetFingerprint],
    ["feasibleSetBuilderVersion", witness.feasibleSetBuilderVersion],
    ["chosenLineupFingerprint", witness.chosenLineupFingerprint],
    ["bestFeasibleLineupFingerprint", witness.bestFeasibleLineupFingerprint],
  ] as const) {
    requireText(label, value);
  }

  if (!Number.isInteger(witness.season) || witness.season < 2000) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "witness season must be a valid integer season",
    );
  }
  if (
    !Number.isInteger(witness.week) ||
    witness.week < 1 ||
    witness.week > 25
  ) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "witness week must be within [1, 25]",
    );
  }
  if (
    !Number.isInteger(witness.feasibleLineupCount) ||
    witness.feasibleLineupCount < 1
  ) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "feasibleLineupCount must be a positive integer from a complete feasible-set witness",
    );
  }
  if (witness.feasibleSetComplete !== true) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "historical lineup regret requires a complete feasible-set witness",
    );
  }
  if (witness.outcomeAccess !== "available_for_validation") {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "lineup regret evidence cannot consume sealed final-holdout outcomes",
    );
  }
  if (
    !Number.isFinite(witness.chosenRealizedUtility) ||
    !Number.isFinite(witness.bestFeasibleRealizedUtility)
  ) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "realized lineup utilities must be finite",
    );
  }
  if (
    witness.bestFeasibleRealizedUtility + 1e-9 <
    witness.chosenRealizedUtility
  ) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "best feasible realized utility cannot be below the chosen realized utility",
    );
  }
  if (
    witness.chosenLineupFingerprint ===
      witness.bestFeasibleLineupFingerprint &&
    Math.abs(
      witness.chosenRealizedUtility - witness.bestFeasibleRealizedUtility,
    ) > 1e-9
  ) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "identical chosen/best lineup fingerprints cannot have different realized utility",
    );
  }

  const decisionAsOfMs = timestamp("decisionAsOf", witness.decisionAsOf);
  const outcomeKnownAtMs = timestamp("outcomeKnownAt", witness.outcomeKnownAt);
  const frozenAtMs = timestamp("frozenAt", witness.frozenAt);
  if (outcomeKnownAtMs <= decisionAsOfMs) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "realized lineup outcome must become known after the historical decision cutoff",
    );
  }
  if (frozenAtMs < outcomeKnownAtMs) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "historical lineup witness cannot freeze before realized outcomes are known",
    );
  }

  if (
    witness.evidenceRefs.length === 0 ||
    witness.evidenceRefs.some((ref) => !ref.trim())
  ) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "historical lineup witness requires non-empty evidenceRefs",
    );
  }
  if (new Set(witness.evidenceRefs).size !== witness.evidenceRefs.length) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "historical lineup witness evidenceRefs must be unique",
    );
  }

  return witness;
}

export function fingerprintCCFHistoricalLineupDecisionWitness(
  witness: CCFHistoricalLineupDecisionWitnessV1,
): string {
  validateWitness(witness);
  const canonical = JSON.stringify({
    ...witness,
    evidenceRefs: [...witness.evidenceRefs].sort(),
  });
  return sha256(canonical);
}

function witnessRef(witness: CCFHistoricalLineupDecisionWitnessV1): string {
  return `ccf://historical-lineup-decision-witness/sha256/${fingerprintCCFHistoricalLineupDecisionWitness(
    witness,
  )}`;
}

function buildEvidenceRef(
  replayBindingId: string,
  protocolFingerprint: string,
  metrics: CCFDecisionRegretMetrics,
  decisionEvidenceRefs: readonly string[],
): string {
  const canonical = JSON.stringify({
    contractVersion: "ccf-rolling-validation-lineup-regret-evidence-v1",
    replayBindingId,
    protocolFingerprint,
    policyVersion: CCF_LINEUP_REGRET_POLICY_VERSION,
    catastrophicRegretThreshold:
      CCF_LINEUP_REGRET_CATASTROPHIC_THRESHOLD_V1,
    metrics,
    decisionEvidenceRefs,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  });
  return `ccf://rolling-validation-lineup-regret-evidence/sha256/${sha256(
    canonical,
  )}`;
}

/**
 * Build post-outcome validation evidence only from frozen historical lineup
 * decisions whose complete feasible-choice set has already been witnessed.
 *
 * This layer does not guess the feasible set and does not reconstruct it from
 * today's roster/depth-chart state. A separate point-in-time builder must
 * prove feasible-set completeness and bind its exact fingerprint before this
 * metric is admissible.
 */
export function buildCCFRollingValidationLineupRegretEvidence(
  input: BuildCCFRollingValidationLineupRegretEvidenceInput,
): CCFRollingValidationLineupRegretEvidenceV1 {
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  const protocolFingerprint =
    fingerprintCCFPredictiveValidationProtocol(protocol);
  requireText("replayBindingId", input.replayBindingId);

  if (
    !protocol.targets.includes("lineup_utility") ||
    ![...protocol.primaryMetrics, ...protocol.secondaryMetrics].includes(
      "lineup_regret",
    )
  ) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "frozen protocol must predeclare lineup_utility and lineup_regret before outcomes are evaluated",
    );
  }
  if (input.witnesses.length === 0) {
    throw new CCFRollingValidationLineupRegretEvidenceError(
      "lineup regret evidence requires at least one historical decision witness",
    );
  }

  const seen = new Set<string>();
  const observations: CCFDecisionRegretObservation[] = [];
  const decisionEvidenceRefs: string[] = [];

  for (const witness of input.witnesses) {
    validateWitness(witness);
    if (seen.has(witness.decisionId)) {
      throw new CCFRollingValidationLineupRegretEvidenceError(
        `duplicate historical lineup decision ${witness.decisionId}`,
      );
    }
    seen.add(witness.decisionId);

    observations.push({
      decisionId: witness.decisionId,
      chosenRealizedUtility: witness.chosenRealizedUtility,
      bestFeasibleRealizedUtility: witness.bestFeasibleRealizedUtility,
      feasibleAlternativeCount: witness.feasibleLineupCount,
      abstained: false,
    });
    decisionEvidenceRefs.push(witnessRef(witness));
  }

  const metrics = evaluateCCFDecisionRegret(
    observations,
    CCF_LINEUP_REGRET_CATASTROPHIC_THRESHOLD_V1,
  );
  const refs = decisionEvidenceRefs.sort();

  return {
    contractVersion: "ccf-rolling-validation-lineup-regret-evidence-v1",
    replayBindingId: input.replayBindingId,
    protocolFingerprint,
    policyVersion: CCF_LINEUP_REGRET_POLICY_VERSION,
    catastrophicRegretThreshold:
      CCF_LINEUP_REGRET_CATASTROPHIC_THRESHOLD_V1,
    decisionCount: input.witnesses.length,
    metrics,
    decisionEvidenceRefs: refs,
    evidenceRef: buildEvidenceRef(
      input.replayBindingId,
      protocolFingerprint,
      metrics,
      refs,
    ),
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}

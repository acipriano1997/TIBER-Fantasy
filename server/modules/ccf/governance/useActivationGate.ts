export type CCFActivationLevel = 0 | 1 | 2 | 3;

export type CCFUseReadinessGateId =
  | "availability"
  | "contract_match"
  | "provenance"
  | "governance"
  | "coverage"
  | "freshness"
  | "consumer_fail_closed"
  | "ui_labeling";

export interface CCFUseReadinessGateResult {
  gateId: CCFUseReadinessGateId;
  passed: boolean;
  /** Optional ceiling even when the gate passes, e.g. visibility-only evidence. */
  capLevel: CCFActivationLevel | null;
  detail: string;
}

export interface CCFSourceUseActivationRequest {
  sourceId: string;
  useId: string;
  requestedLevel: CCFActivationLevel;
  requiredGates: readonly CCFUseReadinessGateId[];
  gateResults: readonly CCFUseReadinessGateResult[];
}

export interface CCFSourceUseActivationDecision {
  sourceId: string;
  useId: string;
  requestedLevel: CCFActivationLevel;
  resolvedLevel: CCFActivationLevel;
  active: boolean;
  missingRequiredGates: CCFUseReadinessGateId[];
  failedRequiredGates: CCFUseReadinessGateId[];
  appliedCaps: Array<{ gateId: CCFUseReadinessGateId; capLevel: CCFActivationLevel }>;
  reason: string;
}

function minLevel(left: CCFActivationLevel, right: CCFActivationLevel): CCFActivationLevel {
  return Math.min(left, right) as CCFActivationLevel;
}

export function evaluateCCFSourceUseActivation(
  request: CCFSourceUseActivationRequest,
): CCFSourceUseActivationDecision {
  if (!request.sourceId.trim()) throw new Error("sourceId is required");
  if (!request.useId.trim()) throw new Error("useId is required");

  const required = Array.from(new Set(request.requiredGates));
  const byGate = new Map<CCFUseReadinessGateId, CCFUseReadinessGateResult>();
  for (const result of request.gateResults) {
    if (byGate.has(result.gateId)) {
      throw new Error(`duplicate gate result ${result.gateId}`);
    }
    byGate.set(result.gateId, result);
  }

  const missingRequiredGates = required.filter((gateId) => !byGate.has(gateId));
  const failedRequiredGates = required.filter((gateId) => byGate.get(gateId)?.passed === false);

  if (missingRequiredGates.length > 0) {
    return {
      sourceId: request.sourceId,
      useId: request.useId,
      requestedLevel: request.requestedLevel,
      resolvedLevel: 0,
      active: false,
      missingRequiredGates,
      failedRequiredGates,
      appliedCaps: [],
      reason: `missing required readiness gates: ${missingRequiredGates.join(", ")}`,
    };
  }

  let resolvedLevel = request.requestedLevel;
  const appliedCaps: Array<{ gateId: CCFUseReadinessGateId; capLevel: CCFActivationLevel }> = [];

  for (const gateId of required) {
    const result = byGate.get(gateId)!;
    if (!result.passed) {
      const cap = result.capLevel ?? 0;
      resolvedLevel = minLevel(resolvedLevel, cap);
      appliedCaps.push({ gateId, capLevel: cap });
    } else if (result.capLevel != null) {
      resolvedLevel = minLevel(resolvedLevel, result.capLevel);
      appliedCaps.push({ gateId, capLevel: result.capLevel });
    }
  }

  return {
    sourceId: request.sourceId,
    useId: request.useId,
    requestedLevel: request.requestedLevel,
    resolvedLevel,
    active: resolvedLevel > 0,
    missingRequiredGates,
    failedRequiredGates,
    appliedCaps,
    reason:
      resolvedLevel === request.requestedLevel
        ? "all required gates permit the requested use level"
        : `use capped at level ${resolvedLevel} by readiness evidence`,
  };
}

export function ccfPassedUseGate(
  gateId: CCFUseReadinessGateId,
  detail: string,
  capLevel: CCFActivationLevel | null = null,
): CCFUseReadinessGateResult {
  return { gateId, passed: true, capLevel, detail };
}

export function ccfFailedUseGate(
  gateId: CCFUseReadinessGateId,
  detail: string,
  capLevel: CCFActivationLevel = 0,
): CCFUseReadinessGateResult {
  return { gateId, passed: false, capLevel, detail };
}

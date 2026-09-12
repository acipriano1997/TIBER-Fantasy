import crypto from "crypto";

export type CCFQualitySeverity = "info" | "warn" | "block";

export interface CCFQualityCheckResult {
  passed: boolean;
  confidence: number;
  message: string;
  entityKey?: string | null;
  details?: Record<string, unknown>;
}

export interface CCFQualityRule<T> {
  id: string;
  surface: string;
  severity: CCFQualitySeverity;
  check: (data: T) => CCFQualityCheckResult;
}

export interface CCFQualityEvent {
  ruleId: string;
  surface: string;
  severity: CCFQualitySeverity;
  confidence: number;
  message: string;
  entityKey: string | null;
  details: Record<string, unknown>;
  fingerprint: string;
}

export interface CCFQualityReport {
  surface: string;
  evaluatedRules: number;
  events: CCFQualityEvent[];
  hasBlockingIssues: boolean;
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function fingerprintCCFQualityEvent(input: {
  ruleId: string;
  surface: string;
  entityKey: string | null;
}): string {
  return crypto
    .createHash("sha256")
    .update(`${input.ruleId}\n${input.surface}\n${input.entityKey ?? "__surface__"}`)
    .digest("hex");
}

export function evaluateCCFQualityRules<T>(
  surface: string,
  data: T,
  rules: readonly CCFQualityRule<T>[],
): CCFQualityReport {
  if (!surface.trim()) throw new Error("surface is required");
  const ids = new Set<string>();
  const events: CCFQualityEvent[] = [];

  for (const rule of rules) {
    if (!rule.id.trim()) throw new Error("quality rule id is required");
    if (ids.has(rule.id)) throw new Error(`duplicate quality rule id ${rule.id}`);
    ids.add(rule.id);
    if (rule.surface !== surface) continue;

    let result: CCFQualityCheckResult;
    let executionFailed = false;
    try {
      result = rule.check(data);
    } catch (error) {
      executionFailed = true;
      result = {
        passed: false,
        confidence: 1,
        message: `quality rule execution failed: ${String(error)}`,
        entityKey: null,
        details: { ruleExecutionFailure: true },
      };
    }

    if (result.passed) continue;
    const entityKey = result.entityKey?.trim() || null;
    events.push({
      ruleId: rule.id,
      surface,
      severity: executionFailed ? "block" : rule.severity,
      confidence: clampProbability(result.confidence),
      message: result.message,
      entityKey,
      details: result.details ?? {},
      fingerprint: fingerprintCCFQualityEvent({ ruleId: rule.id, surface, entityKey }),
    });
  }

  return {
    surface,
    evaluatedRules: rules.filter((rule) => rule.surface === surface).length,
    events,
    hasBlockingIssues: events.some((event) => event.severity === "block"),
  };
}

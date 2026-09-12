import {
  CCFIndependenceError,
  CCFOutcomeContractError,
  assertCCFNativeIndependence,
  type CCFPlayerOutcome,
} from "../outcomes/contract";
import {
  CCF_WEEKLY_DEPENDENCY_CENSUS_V0,
  blockedCriticalDependencies,
  type CCFWeeklyDependencyRecord,
} from "./weeklyDependencyCensus";

export type CCFIndependenceFindingCode =
  | "OUTCOME_CONTRACT_INVALID"
  | "NON_NATIVE_CRITICAL_INPUT"
  | "UNRESOLVED_CRITICAL_DEPENDENCY";

export interface CCFIndependenceFinding {
  code: CCFIndependenceFindingCode;
  message: string;
  surface?: CCFWeeklyDependencyRecord["surface"];
  fieldOrMechanism?: string;
  producerFamily?: CCFWeeklyDependencyRecord["producerFamily"];
  nativeStatus?: CCFWeeklyDependencyRecord["nativeStatus"];
}

export interface CCFNativeCertificationResult {
  gate: "CCF-INDEP-001";
  passed: boolean;
  state: "UNCERTIFIED" | "NATIVE_READY";
  playerId: string;
  season: number;
  week: number;
  modelVersion: string;
  asOf: string;
  findings: CCFIndependenceFinding[];
}

export interface CertifyCCFNativeOutcomeOptions {
  /**
   * Use a surface-scoped dependency graph for focused certification. The
   * repository-wide initial weekly census is the safe default and is expected
   * to fail until migration work is complete.
   */
  dependencies?: readonly CCFWeeklyDependencyRecord[];
}

/**
 * Executable functional/provenance portion of CCF-INDEP-001.
 *
 * This function deliberately does not grant `CCF_PRIMARY`; historical
 * calibration and out-of-sample performance are separate promotion gates.
 * Passing here means the outcome is only `NATIVE_READY`.
 */
export function certifyCCFNativeOutcome(
  outcome: CCFPlayerOutcome,
  options: CertifyCCFNativeOutcomeOptions = {},
): CCFNativeCertificationResult {
  const findings: CCFIndependenceFinding[] = [];

  try {
    assertCCFNativeIndependence(outcome);
  } catch (error) {
    if (error instanceof CCFIndependenceError) {
      findings.push({
        code: "NON_NATIVE_CRITICAL_INPUT",
        message: error.message,
      });
    } else if (error instanceof CCFOutcomeContractError) {
      findings.push({
        code: "OUTCOME_CONTRACT_INVALID",
        message: error.message,
      });
    } else {
      throw error;
    }
  }

  const dependencies = options.dependencies ?? CCF_WEEKLY_DEPENDENCY_CENSUS_V0;
  for (const dependency of blockedCriticalDependencies(dependencies)) {
    findings.push({
      code: "UNRESOLVED_CRITICAL_DEPENDENCY",
      message: `${dependency.fieldOrMechanism} is ${dependency.nativeStatus} via ${dependency.producerFamily}`,
      surface: dependency.surface,
      fieldOrMechanism: dependency.fieldOrMechanism,
      producerFamily: dependency.producerFamily,
      nativeStatus: dependency.nativeStatus,
    });
  }

  const passed = findings.length === 0;

  return {
    gate: "CCF-INDEP-001",
    passed,
    state: passed ? "NATIVE_READY" : "UNCERTIFIED",
    playerId: outcome.playerId,
    season: outcome.season,
    week: outcome.week,
    modelVersion: outcome.modelVersion,
    asOf: outcome.asOf,
    findings,
  };
}

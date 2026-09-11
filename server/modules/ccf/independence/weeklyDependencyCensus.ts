import type { CCFProducerFamily } from "../outcomes/contract";
import type { CCFTiberCapabilityMigrationRecord } from "./tiberCapabilityMigration";
import {
  CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0,
  canClaimAllTiberCapabilityMigrationComplete,
} from "./allTiberCapabilityMigration";

export type CCFDependencyStatus =
  | "eligible_native"
  | "blocked_native"
  | "challenger_only"
  | "pending_verification";

export interface CCFWeeklyDependencyRecord {
  surface: "weekly_outcome" | "weekly_ranking" | "start_sit";
  fieldOrMechanism: string;
  producerPath: string;
  producerFamily: CCFProducerFamily;
  recommendationCritical: boolean;
  nativeStatus: CCFDependencyStatus;
  fallbackBehavior: string;
  replacementOwner: string;
  note: string;
}

/**
 * Initial code-level census for CCF-INDEP-001.
 *
 * This list is intentionally conservative. `pending_verification` is not native
 * authority. A dependency must be explicitly promoted to one of the three
 * CCF-native producer families before it can affect a CCF_NATIVE result.
 */
export const CCF_WEEKLY_DEPENDENCY_CENSUS_V0: readonly CCFWeeklyDependencyRecord[] = [
  {
    surface: "weekly_ranking",
    fieldOrMechanism: "incumbent weekly scoring/ranking output",
    producerPath: "TIBER-Forecast scoring service (documented preferred path)",
    producerFamily: "tiber_model",
    recommendationCritical: true,
    nativeStatus: "blocked_native",
    fallbackBehavior: "legacy FORGE compatibility path when Forecast is unavailable or insufficient",
    replacementOwner: "CCF Player Outcome Engine",
    note: "Keep Forecast as challenger/benchmark after native output is frozen.",
  },
  {
    surface: "weekly_ranking",
    fieldOrMechanism: "legacy FORGE ranking/grade fallback",
    producerPath: "server/modules/forge/**",
    producerFamily: "legacy_internal_heuristic",
    recommendationCritical: true,
    nativeStatus: "blocked_native",
    fallbackBehavior: "compatibility fallback from incumbent weekly rankings architecture",
    replacementOwner: "CCF Player Outcome Engine + CCF ranking policy",
    note: "Living in-repo does not make FORGE a certified CCF-native producer.",
  },
  {
    surface: "start_sit",
    fieldOrMechanism: "projPoints",
    producerPath: "server/modules/startSit/dataAssembler.ts::mapEPAToProjection",
    producerFamily: "legacy_internal_heuristic",
    recommendationCritical: true,
    nativeStatus: "blocked_native",
    fallbackBehavior: "undefined when EPA is unavailable; downstream scaler converts missing projection to zero",
    replacementOwner: "CCF Player Outcome Engine",
    note: "Fixed EPA-to-fantasy-point mapping is not a calibrated weekly outcome model.",
  },
  {
    surface: "start_sit",
    fieldOrMechanism: "projFloor/projCeiling",
    producerPath: "server/modules/startSit/dataAssembler.ts",
    producerFamily: "legacy_internal_heuristic",
    recommendationCritical: true,
    nativeStatus: "blocked_native",
    fallbackBehavior: "derived by scaling EPA before the same projection proxy",
    replacementOwner: "CCF Player Outcome Engine",
    note: "Replace with calibrated native quantiles.",
  },
  {
    surface: "start_sit",
    fieldOrMechanism: "ecrDelta",
    producerPath: "server/modules/startSitEngine.ts::scoreNews",
    producerFamily: "external_consensus",
    recommendationCritical: true,
    nativeStatus: "challenger_only",
    fallbackBehavior: "missing value is coerced to zero delta and therefore a midpoint subscore",
    replacementOwner: "CCF challenger/evidence layer",
    note: "ECR may be compared with native output but cannot determine CCF_NATIVE.",
  },
  {
    surface: "start_sit",
    fieldOrMechanism: "stdevLast5",
    producerPath: "server/modules/startSitEngine.ts::scoreVolatility",
    producerFamily: "unknown",
    recommendationCritical: true,
    nativeStatus: "blocked_native",
    fallbackBehavior: "missing value becomes zero standard deviation, which maps to maximum trust",
    replacementOwner: "CCF Player Outcome Engine calibration layer",
    note: "Missing volatility evidence must widen uncertainty, not increase trust.",
  },
  {
    surface: "start_sit",
    fieldOrMechanism: "committeeRisk",
    producerPath: "server/modules/startSitEngine.ts::scoreVolatility",
    producerFamily: "unknown",
    recommendationCritical: true,
    nativeStatus: "blocked_native",
    fallbackBehavior: "missing value becomes zero risk, then invertRisk maps it to maximum trust",
    replacementOwner: "CCF role/opportunity model",
    note: "Absence of evidence is not evidence of backfield certainty.",
  },
  {
    surface: "start_sit",
    fieldOrMechanism: "depthChartThreats",
    producerPath: "server/modules/startSitEngine.ts::scoreVolatility",
    producerFamily: "unknown",
    recommendationCritical: true,
    nativeStatus: "blocked_native",
    fallbackBehavior: "missing value becomes zero risk, then invertRisk maps it to maximum trust",
    replacementOwner: "CCF role/opportunity model",
    note: "Must be represented as coverage/missingness until sourced.",
  },
  {
    surface: "start_sit",
    fieldOrMechanism: "weatherImpact",
    producerPath: "server/modules/startSitEngine.ts::scoreMatchup",
    producerFamily: "unknown",
    recommendationCritical: true,
    nativeStatus: "blocked_native",
    fallbackBehavior: "missing value becomes zero impact, which maps to midpoint weather score",
    replacementOwner: "CCF Weather Intelligence System",
    note: "Only temporally eligible WIS evidence may become a native weather feature.",
  },
  {
    surface: "start_sit",
    fieldOrMechanism: "impliedTeamTotal",
    producerPath: "server/modules/startSitEngine.ts::scoreMatchup",
    producerFamily: "unknown",
    recommendationCritical: true,
    nativeStatus: "blocked_native",
    fallbackBehavior: "missing value becomes zero before scaling",
    replacementOwner: "CCF market/game-environment evidence layer",
    note: "Must preserve source, timestamp, market snapshot, and as-of eligibility.",
  },
  {
    surface: "start_sit",
    fieldOrMechanism: "injuryTag",
    producerPath: "server/modules/startSit/dataAssembler.ts::getInjuryStatus",
    producerFamily: "ccf_native_fact",
    recommendationCritical: true,
    nativeStatus: "pending_verification",
    fallbackBehavior: "no tag maps to maximum injury trust in legacy scorer",
    replacementOwner: "CCF Injury/Readiness System",
    note: "Fact can become native only after source/time contract verification; legacy missing-value treatment remains blocked.",
  },
  {
    surface: "start_sit",
    fieldOrMechanism: "targetShare",
    producerPath: "playerAdvanced2024 via server/modules/startSit/dataAssembler.ts",
    producerFamily: "ccf_native_fact",
    recommendationCritical: true,
    nativeStatus: "pending_verification",
    fallbackBehavior: "missing value becomes zero in usage scoring",
    replacementOwner: "CCF role/opportunity feature spine",
    note: "Current table/version is stale for 2026 authority; rebuild through governed current-season evidence.",
  },
  {
    surface: "start_sit",
    fieldOrMechanism: "Start Your Studs bias",
    producerPath: "server/modules/startSitEngine.ts::applyStudBias",
    producerFamily: "legacy_internal_heuristic",
    recommendationCritical: true,
    nativeStatus: "blocked_native",
    fallbackBehavior: "policy layer can bump totals and change verdicts after base scoring",
    replacementOwner: "CCF decision policy layer",
    note: "May later be an explicit calibrated policy; must not contaminate the native player outcome distribution.",
  },
] as const;

export function blockedCriticalDependencies(
  census: readonly CCFWeeklyDependencyRecord[] = CCF_WEEKLY_DEPENDENCY_CENSUS_V0,
): CCFWeeklyDependencyRecord[] {
  return census.filter(
    (record) => record.recommendationCritical && record.nativeStatus !== "eligible_native",
  );
}

export function canClaimCCFPrimary(
  census: readonly CCFWeeklyDependencyRecord[] = CCF_WEEKLY_DEPENDENCY_CENSUS_V0,
  migrationRegistry: readonly CCFTiberCapabilityMigrationRecord[] = CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0,
): boolean {
  return (
    blockedCriticalDependencies(census).length === 0 &&
    canClaimAllTiberCapabilityMigrationComplete(migrationRegistry)
  );
}

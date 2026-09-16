import type { CCFTiberCapabilityMigrationRecord } from "./tiberCapabilityMigration";
import { auditCCFUniversalAuthority } from "./authorityGraph";
import {
  CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0,
  allTiberCapabilityMigrationBlockers,
  canClaimAllTiberCapabilityMigrationComplete,
} from "./allTiberCapabilityMigration";
import {
  CCF_WEEKLY_DEPENDENCY_CENSUS_V0,
  blockedCriticalDependencies,
  type CCFWeeklyDependencyRecord,
} from "./weeklyDependencyCensus";
import {
  CCF_NATIVE_IMPLEMENTATION_EVIDENCE_V0,
  findCCFNativeImplementationEvidence,
  type CCFNativeImplementationEvidenceRecord,
} from "./nativeImplementationEvidence";

export type CCFReleaseChecklistState = "certified" | "partial" | "blocked" | "non_authoritative";

export interface CCFCapabilityReleaseChecklistItem {
  kind: "capability";
  id: string;
  label: string;
  state: CCFReleaseChecklistState;
  required: boolean;
  migrationStatus: CCFTiberCapabilityMigrationRecord["status"];
  implementation?: CCFNativeImplementationEvidenceRecord;
  owner: string;
  note: string;
}

export interface CCFDependencyReleaseChecklistItem {
  kind: "dependency";
  id: string;
  label: string;
  state: CCFReleaseChecklistState;
  required: boolean;
  producerPath: string;
  owner: string;
  note: string;
}

export interface CCFUniversalReleaseChecklist {
  version: "ccf-universal-release-checklist-v1";
  promotable: boolean;
  authority: ReturnType<typeof auditCCFUniversalAuthority>;
  summary: {
    capabilityBlockers: number;
    criticalDependencyBlockers: number;
    scaffoldedButUncertified: number;
    authoritySurfaceBlockers: number;
    trustedBindingSurfaceBlockers: number;
    uncertifiedModelSurfaces: number;
  };
  capabilities: CCFCapabilityReleaseChecklistItem[];
  dependencies: CCFDependencyReleaseChecklistItem[];
}

function capabilityState(record: CCFTiberCapabilityMigrationRecord): CCFReleaseChecklistState {
  if (!record.requiredForUniversalCCF) return "non_authoritative";
  if (record.status === "native_certified") return "certified";
  const implementation = findCCFNativeImplementationEvidence(record.id);
  if (implementation) return "partial";
  return "blocked";
}

function dependencyState(record: CCFWeeklyDependencyRecord): CCFReleaseChecklistState {
  if (!record.recommendationCritical) return "non_authoritative";
  if (blockedCriticalDependencies([record]).length === 0) return "certified";
  if (record.nativeStatus === "challenger_only") return "non_authoritative";
  return "blocked";
}

export function buildCCFUniversalReleaseChecklist(
  authorityGraphs: readonly unknown[] = [],
): CCFUniversalReleaseChecklist {
  const authority = auditCCFUniversalAuthority(authorityGraphs);
  const capabilities = CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0.map((record) => ({
    kind: "capability" as const,
    id: record.id,
    label: record.sourceCapability,
    state: capabilityState(record),
    required: record.requiredForUniversalCCF,
    migrationStatus: record.status,
    implementation: findCCFNativeImplementationEvidence(record.id),
    owner: record.ccfOwner,
    note: record.note,
  }));

  const dependencies = CCF_WEEKLY_DEPENDENCY_CENSUS_V0.map((record, index) => ({
    kind: "dependency" as const,
    id: `dependency-${index}-${record.fieldOrMechanism}`,
    label: `${record.surface}: ${record.fieldOrMechanism}`,
    state: dependencyState(record),
    required: record.recommendationCritical,
    producerPath: record.producerPath,
    owner: record.replacementOwner,
    note: record.note,
  }));

  const capabilityBlockers = allTiberCapabilityMigrationBlockers().length;
  const criticalDependencyBlockers = blockedCriticalDependencies().length;
  const scaffoldedButUncertified = CCF_NATIVE_IMPLEMENTATION_EVIDENCE_V0.filter(
    (record) => record.maturity !== "certified",
  ).length;

  return {
    version: "ccf-universal-release-checklist-v1",
    promotable: canClaimAllTiberCapabilityMigrationComplete()
      && criticalDependencyBlockers === 0
      && authority.trustedBindingsComplete
      && authority.modelCertificationComplete,
    authority,
    summary: {
      capabilityBlockers,
      criticalDependencyBlockers,
      scaffoldedButUncertified,
      authoritySurfaceBlockers: authority.surfaces.filter((surface) => !surface.lineageEligible).length,
      trustedBindingSurfaceBlockers: authority.surfaces.filter(
        (surface) => !surface.trustedBindingEligible,
      ).length,
      uncertifiedModelSurfaces: authority.surfaces.filter((surface) => !surface.modelCertificationEligible).length,
    },
    capabilities,
    dependencies,
  };
}

export function assertCCFUniversalReleaseReady(authorityGraphs: readonly unknown[] = []): void {
  const checklist = buildCCFUniversalReleaseChecklist(authorityGraphs);
  if (!checklist.promotable) {
    throw new Error(
      `CCF universal release blocked: ${checklist.summary.capabilityBlockers} capability blockers, ` +
        `${checklist.summary.criticalDependencyBlockers} critical dependency blockers, ` +
        `${checklist.summary.authoritySurfaceBlockers} surface lineage blockers, ` +
        `${checklist.summary.trustedBindingSurfaceBlockers} trusted-binding surface blockers, ` +
        `${checklist.summary.uncertifiedModelSurfaces} uncertified model surfaces`,
    );
  }
}

import {
  CCF_TIBER_CAPABILITY_MIGRATION_V0,
  type CCFTiberCapabilityMigrationRecord,
} from "./tiberCapabilityMigration";
import { CCF_TIBER_CAPABILITY_MIGRATION_EXTENSIONS_V0 } from "./tiberCapabilityMigrationExtensions";
import { CCF_TIBER_FANTASY_CAPABILITY_MIGRATION_EXTENSIONS_V0 } from "./tiberFantasyCapabilityMigrationExtensions";

export const CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0: readonly CCFTiberCapabilityMigrationRecord[] = [
  ...CCF_TIBER_CAPABILITY_MIGRATION_V0,
  ...CCF_TIBER_CAPABILITY_MIGRATION_EXTENSIONS_V0,
  ...CCF_TIBER_FANTASY_CAPABILITY_MIGRATION_EXTENSIONS_V0,
];

export function duplicateTiberCapabilityIds(
  registry: readonly CCFTiberCapabilityMigrationRecord[] = CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0,
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const record of registry) {
    if (seen.has(record.id)) duplicates.add(record.id);
    seen.add(record.id);
  }
  return Array.from(duplicates).sort();
}

export function allTiberCapabilityMigrationBlockers(
  registry: readonly CCFTiberCapabilityMigrationRecord[] = CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0,
): CCFTiberCapabilityMigrationRecord[] {
  return registry.filter(
    (record) => record.requiredForUniversalCCF && record.status !== "native_certified",
  );
}

export function canClaimAllTiberCapabilityMigrationComplete(
  registry: readonly CCFTiberCapabilityMigrationRecord[] = CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0,
): boolean {
  return duplicateTiberCapabilityIds(registry).length === 0 && allTiberCapabilityMigrationBlockers(registry).length === 0;
}

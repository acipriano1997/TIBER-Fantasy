import crypto from "crypto";
import {
  compareCCFSeasonWeek,
  validateCCFChronologicalSplitConfig,
  type CCFChronologicalSplitConfig,
  type CCFTemporalWindow,
} from "./chronologicalSplit";

export type CCFHistoricalDatasetSplit = "train" | "validation" | "test";
export type CCFHistoricalOutcomeAccess =
  | "available_for_training"
  | "available_for_validation"
  | "sealed_final_holdout";

export interface CCFHistoricalDatasetRowDescriptor {
  rowId: string;
  canonicalPlayerId: string;
  gameId: string;
  season: number;
  week: number;
  decisionAsOf: string;
  maxFeatureKnownAt: string;
  featureSnapshotFingerprint: string;
  sourceSnapshotRefs: string[];
  outcomeArtifactFingerprint: string;
  outcomeKnownAt: string;
  split: CCFHistoricalDatasetSplit;
  outcomeAccess: CCFHistoricalOutcomeAccess;
}

export interface CCFHistoricalDatasetExclusionSummary {
  reason: string;
  count: number;
}

export interface CCFHistoricalDatasetManifest {
  contractVersion: "ccf-historical-dataset-manifest-v1";
  datasetId: string;
  schemaVersion: string;
  frozenAt: string;
  sourcePlanFingerprint: string;
  scoringProfileFingerprint: string;
  featureSetFingerprint: string;
  decisionPolicyFingerprint: string;
  supportedPopulation: string;
  split: CCFChronologicalSplitConfig;
  candidateRowCount: number;
  exclusions: CCFHistoricalDatasetExclusionSummary[];
  rows: CCFHistoricalDatasetRowDescriptor[];
  finalHoldoutOutcomesSealed: true;
  finalHoldoutAccessCountAtFreeze: 0;
  outcomeValuesEmbeddedInManifest: false;
  notes: string[];
}

export interface CCFHistoricalDatasetManifestAudit {
  contractVersion: "ccf-historical-dataset-manifest-audit-v1";
  datasetId: string | null;
  valid: boolean;
  fingerprint: string | null;
  candidateRowCount: number;
  admittedRowCount: number;
  excludedRowCount: number;
  uniquePlayers: number;
  uniqueGames: number;
  uniqueDecisions: number;
  splitCounts: Record<CCFHistoricalDatasetSplit, number>;
  independentSeasonWeeks: number;
  blockers: string[];
}

export class CCFHistoricalDatasetManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFHistoricalDatasetManifestError";
  }
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFHistoricalDatasetManifestError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function requireFingerprint(label: string, value: string): void {
  if (!hasText(value)) throw new CCFHistoricalDatasetManifestError(`${label} is required`);
}

function inWindow(
  season: number,
  week: number,
  window: CCFTemporalWindow | undefined,
): boolean {
  if (!window) return false;
  const marker = { season, week };
  return (
    compareCCFSeasonWeek(marker, window.start) >= 0 &&
    compareCCFSeasonWeek(marker, window.end) <= 0
  );
}

function expectedSplit(
  row: Pick<CCFHistoricalDatasetRowDescriptor, "season" | "week">,
  split: CCFChronologicalSplitConfig,
): CCFHistoricalDatasetSplit | null {
  if (inWindow(row.season, row.week, split.train)) return "train";
  if (inWindow(row.season, row.week, split.validation)) return "validation";
  if (inWindow(row.season, row.week, split.test)) return "test";
  return null;
}

function expectedOutcomeAccess(split: CCFHistoricalDatasetSplit): CCFHistoricalOutcomeAccess {
  if (split === "train") return "available_for_training";
  if (split === "validation") return "available_for_validation";
  return "sealed_final_holdout";
}

function canonicalManifest(manifest: CCFHistoricalDatasetManifest) {
  return {
    ...manifest,
    exclusions: [...manifest.exclusions]
      .sort((left, right) => left.reason.localeCompare(right.reason)),
    rows: [...manifest.rows]
      .sort((left, right) => left.rowId.localeCompare(right.rowId))
      .map((row) => ({
        ...row,
        sourceSnapshotRefs: [...row.sourceSnapshotRefs].sort(),
      })),
    notes: [...manifest.notes].sort(),
  };
}

export function validateCCFHistoricalDatasetManifest(
  manifest: CCFHistoricalDatasetManifest,
): CCFHistoricalDatasetManifest {
  if (manifest.contractVersion !== "ccf-historical-dataset-manifest-v1") {
    throw new CCFHistoricalDatasetManifestError("unsupported historical dataset manifest version");
  }
  for (const [label, value] of [
    ["datasetId", manifest.datasetId],
    ["schemaVersion", manifest.schemaVersion],
    ["sourcePlanFingerprint", manifest.sourcePlanFingerprint],
    ["scoringProfileFingerprint", manifest.scoringProfileFingerprint],
    ["featureSetFingerprint", manifest.featureSetFingerprint],
    ["decisionPolicyFingerprint", manifest.decisionPolicyFingerprint],
    ["supportedPopulation", manifest.supportedPopulation],
  ] as const) {
    requireFingerprint(label, value);
  }

  const frozenAt = parseTimestamp("frozenAt", manifest.frozenAt);
  validateCCFChronologicalSplitConfig(manifest.split);
  if (!manifest.split.validation || !manifest.split.test) {
    throw new CCFHistoricalDatasetManifestError(
      "production historical dataset requires train, validation, and final test windows",
    );
  }
  if (!Number.isInteger(manifest.candidateRowCount) || manifest.candidateRowCount <= 0) {
    throw new CCFHistoricalDatasetManifestError("candidateRowCount must be a positive integer");
  }
  if (manifest.rows.length === 0) {
    throw new CCFHistoricalDatasetManifestError("rows must not be empty");
  }
  if (manifest.finalHoldoutOutcomesSealed !== true) {
    throw new CCFHistoricalDatasetManifestError("final holdout outcomes must be sealed at dataset freeze");
  }
  if (manifest.finalHoldoutAccessCountAtFreeze !== 0) {
    throw new CCFHistoricalDatasetManifestError(
      "finalHoldoutAccessCountAtFreeze must be zero before predictive protocol execution",
    );
  }
  if (manifest.outcomeValuesEmbeddedInManifest !== false) {
    throw new CCFHistoricalDatasetManifestError(
      "outcome values must not be embedded in the manifest",
    );
  }
  if (new Set(manifest.notes).size !== manifest.notes.length) {
    throw new CCFHistoricalDatasetManifestError("notes must not contain duplicates");
  }

  const exclusionReasons = new Set<string>();
  let excludedRows = 0;
  for (const exclusion of manifest.exclusions) {
    if (!hasText(exclusion.reason)) {
      throw new CCFHistoricalDatasetManifestError("exclusion reason is required");
    }
    if (exclusionReasons.has(exclusion.reason)) {
      throw new CCFHistoricalDatasetManifestError(`duplicate exclusion reason ${exclusion.reason}`);
    }
    exclusionReasons.add(exclusion.reason);
    if (!Number.isInteger(exclusion.count) || exclusion.count <= 0) {
      throw new CCFHistoricalDatasetManifestError(
        `exclusion ${exclusion.reason} count must be a positive integer`,
      );
    }
    excludedRows += exclusion.count;
  }
  if (manifest.rows.length + excludedRows !== manifest.candidateRowCount) {
    throw new CCFHistoricalDatasetManifestError(
      "candidateRowCount must equal admitted rows plus explicitly counted exclusions",
    );
  }

  const rowIds = new Set<string>();
  const decisionKeys = new Set<string>();
  let testRows = 0;
  for (const row of manifest.rows) {
    for (const [label, value] of [
      ["rowId", row.rowId],
      ["canonicalPlayerId", row.canonicalPlayerId],
      ["gameId", row.gameId],
      ["featureSnapshotFingerprint", row.featureSnapshotFingerprint],
      ["outcomeArtifactFingerprint", row.outcomeArtifactFingerprint],
    ] as const) {
      if (!hasText(value)) {
        throw new CCFHistoricalDatasetManifestError(`${row.rowId || "row"}.${label} is required`);
      }
    }
    if (rowIds.has(row.rowId)) {
      throw new CCFHistoricalDatasetManifestError(`duplicate rowId ${row.rowId}`);
    }
    rowIds.add(row.rowId);

    if (!Number.isInteger(row.season) || row.season < 1900) {
      throw new CCFHistoricalDatasetManifestError(`${row.rowId}.season is invalid`);
    }
    if (!Number.isInteger(row.week) || row.week < 1 || row.week > 25) {
      throw new CCFHistoricalDatasetManifestError(`${row.rowId}.week is invalid`);
    }

    const decisionAsOf = parseTimestamp(`${row.rowId}.decisionAsOf`, row.decisionAsOf);
    const featureKnownAt = parseTimestamp(`${row.rowId}.maxFeatureKnownAt`, row.maxFeatureKnownAt);
    const outcomeKnownAt = parseTimestamp(`${row.rowId}.outcomeKnownAt`, row.outcomeKnownAt);
    if (featureKnownAt > decisionAsOf) {
      throw new CCFHistoricalDatasetManifestError(
        `${row.rowId} contains feature evidence known after decisionAsOf`,
      );
    }
    if (outcomeKnownAt <= decisionAsOf) {
      throw new CCFHistoricalDatasetManifestError(
        `${row.rowId} outcome must become known strictly after decisionAsOf`,
      );
    }
    if (decisionAsOf > frozenAt) {
      throw new CCFHistoricalDatasetManifestError(
        `${row.rowId} decisionAsOf cannot occur after dataset freeze`,
      );
    }
    if (row.sourceSnapshotRefs.length === 0) {
      throw new CCFHistoricalDatasetManifestError(`${row.rowId} requires sourceSnapshotRefs`);
    }
    if (
      row.sourceSnapshotRefs.some((reference) => !hasText(reference)) ||
      new Set(row.sourceSnapshotRefs).size !== row.sourceSnapshotRefs.length
    ) {
      throw new CCFHistoricalDatasetManifestError(
        `${row.rowId} sourceSnapshotRefs must be unique non-empty references`,
      );
    }

    const expected = expectedSplit(row, manifest.split);
    if (expected == null) {
      throw new CCFHistoricalDatasetManifestError(
        `${row.rowId} falls outside every frozen chronological split`,
      );
    }
    if (row.split !== expected) {
      throw new CCFHistoricalDatasetManifestError(
        `${row.rowId} split does not match frozen chronological windows`,
      );
    }
    if (row.outcomeAccess !== expectedOutcomeAccess(row.split)) {
      throw new CCFHistoricalDatasetManifestError(
        `${row.rowId} outcomeAccess does not match ${row.split} split policy`,
      );
    }
    if (row.split === "test") testRows += 1;

    const decisionKey = [
      row.canonicalPlayerId,
      row.gameId,
      row.decisionAsOf,
    ].join("|");
    if (decisionKeys.has(decisionKey)) {
      throw new CCFHistoricalDatasetManifestError(
        `${row.rowId} duplicates an existing player/game/decision row`,
      );
    }
    decisionKeys.add(decisionKey);
  }
  if (testRows === 0) {
    throw new CCFHistoricalDatasetManifestError("final test split must contain at least one row");
  }

  return manifest;
}

export function fingerprintCCFHistoricalDatasetManifest(
  manifest: CCFHistoricalDatasetManifest,
): string {
  validateCCFHistoricalDatasetManifest(manifest);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalManifest(manifest)))
    .digest("hex");
}

export function auditCCFHistoricalDatasetManifest(
  manifest: CCFHistoricalDatasetManifest,
): CCFHistoricalDatasetManifestAudit {
  const blockers: string[] = [];
  let fingerprint: string | null = null;
  try {
    validateCCFHistoricalDatasetManifest(manifest);
    fingerprint = fingerprintCCFHistoricalDatasetManifest(manifest);
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : "invalid historical dataset manifest");
  }

  const rows = Array.isArray(manifest?.rows) ? manifest.rows : [];
  const exclusions = Array.isArray(manifest?.exclusions) ? manifest.exclusions : [];
  const splitCounts: Record<CCFHistoricalDatasetSplit, number> = {
    train: rows.filter((row) => row.split === "train").length,
    validation: rows.filter((row) => row.split === "validation").length,
    test: rows.filter((row) => row.split === "test").length,
  };
  const excludedRowCount = exclusions.reduce(
    (sum, exclusion) => sum + (Number.isInteger(exclusion.count) ? exclusion.count : 0),
    0,
  );

  return {
    contractVersion: "ccf-historical-dataset-manifest-audit-v1",
    datasetId: hasText(manifest?.datasetId) ? manifest.datasetId : null,
    valid: blockers.length === 0,
    fingerprint,
    candidateRowCount: Number.isInteger(manifest?.candidateRowCount) ? manifest.candidateRowCount : 0,
    admittedRowCount: rows.length,
    excludedRowCount,
    uniquePlayers: new Set(rows.map((row) => row.canonicalPlayerId).filter(hasText)).size,
    uniqueGames: new Set(rows.map((row) => row.gameId).filter(hasText)).size,
    uniqueDecisions: new Set(
      rows.map((row) => `${row.canonicalPlayerId}|${row.gameId}|${row.decisionAsOf}`),
    ).size,
    splitCounts,
    independentSeasonWeeks: new Set(rows.map((row) => `${row.season}-${row.week}`)).size,
    blockers,
  };
}

export function assertCCFHistoricalDatasetManifestValid(
  manifest: CCFHistoricalDatasetManifest,
): void {
  const audit = auditCCFHistoricalDatasetManifest(manifest);
  if (!audit.valid) {
    throw new CCFHistoricalDatasetManifestError(
      `historical dataset manifest is invalid: ${audit.blockers.join(", ")}`,
    );
  }
}

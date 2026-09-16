import crypto from "crypto";

export const CCF_LINEUP_RELEASE_GATE_VERSION = "ccf-lineup-release-gate-v0" as const;

export const CCF_LINEUP_REQUIRED_RELEASE_EVIDENCE = [
  "unified_league_context_adapter",
  "active_league_position_coverage",
  "frozen_roster_state_snapshot",
  "production_weekly_source_spine",
  "predictive_validation",
  "trusted_lineup_authority_binding",
  "chronological_lineup_decision_evaluation",
  "tiber_off_replay",
  "certified_route_cutover",
] as const;

export type CCFLineupReleaseEvidenceKind = typeof CCF_LINEUP_REQUIRED_RELEASE_EVIDENCE[number];

export interface CCFLineupReleaseEvidenceRecord {
  schemaVersion: "ccf-lineup-release-evidence-v0";
  evidenceKind: CCFLineupReleaseEvidenceKind;
  evidenceId: string;
  fingerprint: string;
  attestedAt: string;
  status: "certified" | "revoked";
  note: string;
}

/**
 * Operator-controlled production evidence only. This registry starts empty on
 * purpose. Tests may supply synthetic records to the pure audit function, but
 * the production release checklist reads this canonical registry directly.
 */
export const CCF_LINEUP_RELEASE_EVIDENCE_V0: readonly CCFLineupReleaseEvidenceRecord[] = [];

export interface CCFLineupReleaseGateAudit {
  version: typeof CCF_LINEUP_RELEASE_GATE_VERSION;
  asOf: string;
  ready: boolean;
  evidenceFingerprint: string | null;
  certifiedEvidenceKinds: CCFLineupReleaseEvidenceKind[];
  blockers: string[];
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function validTimestamp(value: string | null | undefined): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function fingerprint(records: readonly CCFLineupReleaseEvidenceRecord[]): string {
  const canonical = [...records]
    .sort((left, right) => left.evidenceKind.localeCompare(right.evidenceKind))
    .map((record) => ({ ...record }));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Audit production-readiness evidence for the complete legal-lineup path.
 *
 * Code existence is deliberately insufficient. Each required witness must have
 * exactly one active certified record, valid identity/fingerprint metadata, and
 * an attestation no later than the release as-of. Revoked, duplicate, missing,
 * future-known, or malformed witnesses fail closed.
 *
 * Position coverage is a separate witness because the initial native weekly
 * outcome contract is QB/RB/WR/TE-only. The frozen-roster witness separately
 * proves that availability/bye/lock state is content-addressed and bound to the
 * exact league/team/week/as-of/slot geometry/source plan before production use.
 */
export function auditCCFLineupReleaseGate(
  asOf: string,
  records: readonly CCFLineupReleaseEvidenceRecord[] = CCF_LINEUP_RELEASE_EVIDENCE_V0,
): CCFLineupReleaseGateAudit {
  const blockers = new Set<string>();
  const certifiedEvidenceKinds: CCFLineupReleaseEvidenceKind[] = [];

  if (!validTimestamp(asOf)) {
    return {
      version: CCF_LINEUP_RELEASE_GATE_VERSION,
      asOf,
      ready: false,
      evidenceFingerprint: null,
      certifiedEvidenceKinds,
      blockers: ["invalid_as_of"],
    };
  }

  for (const required of CCF_LINEUP_REQUIRED_RELEASE_EVIDENCE) {
    const matches = records.filter((record) => record.evidenceKind === required);
    if (matches.length === 0) {
      blockers.add(`${required}:missing`);
      continue;
    }
    if (matches.length > 1) {
      blockers.add(`${required}:duplicate`);
      continue;
    }

    const record = matches[0];
    if (record.schemaVersion !== "ccf-lineup-release-evidence-v0") {
      blockers.add(`${required}:schema_mismatch`);
    }
    if (!hasText(record.evidenceId)) blockers.add(`${required}:evidence_id_missing`);
    if (!hasText(record.fingerprint)) blockers.add(`${required}:fingerprint_missing`);
    if (!hasText(record.note)) blockers.add(`${required}:note_missing`);
    if (!validTimestamp(record.attestedAt)) {
      blockers.add(`${required}:attested_at_invalid`);
    } else if (Date.parse(record.attestedAt) > Date.parse(asOf)) {
      blockers.add(`${required}:future_known`);
    }
    if (record.status !== "certified") blockers.add(`${required}:not_certified`);

    const prefix = `${required}:`;
    if (!Array.from(blockers).some((blocker) => blocker.startsWith(prefix))) {
      certifiedEvidenceKinds.push(required);
    }
  }

  for (const record of records) {
    if (!CCF_LINEUP_REQUIRED_RELEASE_EVIDENCE.includes(record.evidenceKind)) {
      blockers.add(`unsupported_evidence_kind:${String(record.evidenceKind)}`);
    }
  }

  const sortedBlockers = Array.from(blockers).sort();
  const complete = certifiedEvidenceKinds.length === CCF_LINEUP_REQUIRED_RELEASE_EVIDENCE.length;
  return {
    version: CCF_LINEUP_RELEASE_GATE_VERSION,
    asOf,
    ready: complete && sortedBlockers.length === 0,
    evidenceFingerprint: records.length ? fingerprint(records) : null,
    certifiedEvidenceKinds: [...certifiedEvidenceKinds].sort(),
    blockers: sortedBlockers,
  };
}

export function assertCCFLineupReleaseReady(asOf: string): void {
  const audit = auditCCFLineupReleaseGate(asOf);
  if (!audit.ready) {
    throw new Error(`CCF lineup release blocked: ${audit.blockers.join(", ")}`);
  }
}

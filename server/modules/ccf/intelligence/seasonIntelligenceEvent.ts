import crypto from "crypto";

import type { CCFPosition } from "../outcomes/contract";

export type CCFSeasonIntelligenceEventType =
  | "role_change"
  | "usage_confirmation"
  | "depth_chart_change"
  | "personnel_change"
  | "coaching_change"
  | "quarterback_change"
  | "injury_state"
  | "teammate_availability"
  | "scheme_change"
  | "defensive_context";

export type CCFSeasonIntelligenceTransitionKind =
  | "none"
  | "role"
  | "personnel"
  | "coaching"
  | "quarterback"
  | "injury_recurrence"
  | "scheme"
  | "defensive";

export type CCFSeasonIntelligenceEvidenceState =
  | "available"
  | "conflicted"
  | "stale"
  | "unavailable";

export type CCFSeasonIntelligenceDirection = "up" | "down" | "neutral" | "uncertain";
export type CCFSeasonIntelligenceUncertaintyEffect = "narrow" | "hold" | "widen";

export type CCFSeasonIntelligenceMechanismFamily =
  | "role"
  | "opportunity"
  | "target_quality"
  | "availability"
  | "team_environment"
  | "scheme"
  | "opponent_environment"
  | "uncertainty";

export type CCFRolePriorTreatment = "preserve" | "discount" | "new_state";

export interface CCFSeasonIntelligenceVariableEffect {
  variableKey: string;
  mechanismFamily: CCFSeasonIntelligenceMechanismFamily;
  direction: CCFSeasonIntelligenceDirection;
  uncertaintyEffect: CCFSeasonIntelligenceUncertaintyEffect;
  note?: string;
}

export interface CCFSeasonIntelligenceEventV1 {
  eventVersion: "ccf-season-intelligence-event-v1";
  eventId: string;
  season: number;
  week: number;
  subjectType: "player" | "team" | "unit";
  playerIds: string[];
  teamId: string | null;
  eventType: CCFSeasonIntelligenceEventType;
  transitionKind: CCFSeasonIntelligenceTransitionKind;
  evidenceState: CCFSeasonIntelligenceEvidenceState;
  /** When the report/observation was published, when known. */
  reportedAt?: string;
  /** When CCF could first have used the evidence. */
  knownAt: string;
  /** When the underlying football change takes effect, if distinct from reporting time. */
  effectiveAt?: string;
  sourceRefs: string[];
  /**
   * Independent root evidence identifiers. Mirrored/aggregated reports that
   * trace to the same underlying report must share the same root reference.
   */
  evidenceRootRefs: string[];
  /** Week-to-week news may alter role priors, but never silently erase trait priors. */
  traitPriorTreatment: "preserve";
  rolePriorTreatment: CCFRolePriorTreatment;
  effects: CCFSeasonIntelligenceVariableEffect[];
  supersedesEventIds: string[];
  reason?: string;
}

export interface CCFSeasonIntelligenceReferenceState {
  status: "available" | "unavailable";
  ref?: string;
  reason?: string;
}

export interface CCFSeasonIntelligenceMissingInput {
  key: string;
  reason: string;
}

export interface CCFSeasonIntelligenceSnapshotV1 {
  snapshotVersion: "ccf-season-intelligence-snapshot-v1";
  snapshotId: string;
  playerId: string;
  position: CCFPosition;
  teamId: string;
  season: number;
  week: number;
  asOf: string;
  frozenAt: string;
  priorContext: {
    traitPrior: CCFSeasonIntelligenceReferenceState;
    rolePrior: CCFSeasonIntelligenceReferenceState;
    measurementRegime: CCFSeasonIntelligenceReferenceState;
  };
  events: CCFSeasonIntelligenceEventV1[];
  missingInputs: CCFSeasonIntelligenceMissingInput[];
  /** This packet is upstream evidence only. It cannot make a fantasy decision. */
  recommendationAuthority: "none";
}

export class CCFSeasonIntelligenceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFSeasonIntelligenceContractError";
  }
}

function requireText(label: string, value: string | null | undefined): string {
  if (!value?.trim()) {
    throw new CCFSeasonIntelligenceContractError(`${label} is required`);
  }
  return value;
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFSeasonIntelligenceContractError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function assertUniqueText(label: string, values: readonly string[]): void {
  values.forEach((value, index) => requireText(`${label}[${index}]`, value));
  if (new Set(values).size !== values.length) {
    throw new CCFSeasonIntelligenceContractError(`${label} must not contain duplicates`);
  }
}

function validateReferenceState(
  label: string,
  state: CCFSeasonIntelligenceReferenceState,
): void {
  if (state.status === "available") {
    requireText(`${label}.ref`, state.ref);
    if (state.reason != null) {
      throw new CCFSeasonIntelligenceContractError(
        `${label} available state must not carry an unavailable reason`,
      );
    }
    return;
  }

  requireText(`${label}.reason`, state.reason);
  if (state.ref != null) {
    throw new CCFSeasonIntelligenceContractError(
      `${label} unavailable state must not fabricate a reference`,
    );
  }
}

export function validateCCFSeasonIntelligenceEvent(
  event: CCFSeasonIntelligenceEventV1,
): CCFSeasonIntelligenceEventV1 {
  if (event.eventVersion !== "ccf-season-intelligence-event-v1") {
    throw new CCFSeasonIntelligenceContractError("unsupported season intelligence event version");
  }
  requireText("eventId", event.eventId);
  if (!Number.isInteger(event.season) || event.season < 2000) {
    throw new CCFSeasonIntelligenceContractError("season must be a valid integer season");
  }
  if (!Number.isInteger(event.week) || event.week < 1 || event.week > 25) {
    throw new CCFSeasonIntelligenceContractError("week must be an integer within [1, 25]");
  }

  assertUniqueText("playerIds", event.playerIds);
  if (event.subjectType === "player" && event.playerIds.length === 0) {
    throw new CCFSeasonIntelligenceContractError("player-scoped events require at least one playerId");
  }
  if (event.subjectType !== "player") {
    requireText("teamId", event.teamId);
  }

  const knownAtMs = parseTimestamp("knownAt", event.knownAt);
  if (event.reportedAt != null) {
    const reportedAtMs = parseTimestamp("reportedAt", event.reportedAt);
    if (reportedAtMs > knownAtMs) {
      throw new CCFSeasonIntelligenceContractError("reportedAt must not be after knownAt");
    }
  }
  if (event.effectiveAt != null) {
    parseTimestamp("effectiveAt", event.effectiveAt);
  }

  assertUniqueText("sourceRefs", event.sourceRefs);
  assertUniqueText("evidenceRootRefs", event.evidenceRootRefs);
  assertUniqueText("supersedesEventIds", event.supersedesEventIds);
  if (event.supersedesEventIds.includes(event.eventId)) {
    throw new CCFSeasonIntelligenceContractError("an event cannot supersede itself");
  }

  if (event.traitPriorTreatment !== "preserve") {
    throw new CCFSeasonIntelligenceContractError(
      "season intelligence news cannot silently replace the trait prior",
    );
  }

  const usableEvidence = event.evidenceState === "available" || event.evidenceState === "conflicted";
  if (usableEvidence) {
    if (event.sourceRefs.length === 0) {
      throw new CCFSeasonIntelligenceContractError(
        `${event.evidenceState} evidence requires at least one sourceRef`,
      );
    }
    if (event.evidenceRootRefs.length === 0) {
      throw new CCFSeasonIntelligenceContractError(
        `${event.evidenceState} evidence requires at least one evidenceRootRef`,
      );
    }
    if (event.reason != null) {
      throw new CCFSeasonIntelligenceContractError(
        `${event.evidenceState} evidence must not carry an unavailable/stale reason`,
      );
    }
  } else {
    requireText(`${event.evidenceState}.reason`, event.reason);
    if (event.effects.length > 0) {
      throw new CCFSeasonIntelligenceContractError(
        `${event.evidenceState} evidence cannot produce variable effects`,
      );
    }
  }

  const effectKeys = new Set<string>();
  for (const effect of event.effects) {
    requireText("effect.variableKey", effect.variableKey);
    const effectKey = `${effect.variableKey}:${effect.mechanismFamily}`;
    if (effectKeys.has(effectKey)) {
      throw new CCFSeasonIntelligenceContractError(
        `duplicate variable effect ${effectKey}`,
      );
    }
    effectKeys.add(effectKey);

    if (event.evidenceState === "conflicted") {
      if (effect.direction !== "uncertain" || effect.uncertaintyEffect !== "widen") {
        throw new CCFSeasonIntelligenceContractError(
          "conflicted evidence may only express uncertain direction with widened uncertainty",
        );
      }
    }
  }

  return event;
}

export function validateCCFSeasonIntelligenceSnapshot(
  snapshot: CCFSeasonIntelligenceSnapshotV1,
): CCFSeasonIntelligenceSnapshotV1 {
  if (snapshot.snapshotVersion !== "ccf-season-intelligence-snapshot-v1") {
    throw new CCFSeasonIntelligenceContractError("unsupported season intelligence snapshot version");
  }
  requireText("snapshotId", snapshot.snapshotId);
  requireText("playerId", snapshot.playerId);
  requireText("teamId", snapshot.teamId);
  if (!Number.isInteger(snapshot.season) || snapshot.season < 2000) {
    throw new CCFSeasonIntelligenceContractError("season must be a valid integer season");
  }
  if (!Number.isInteger(snapshot.week) || snapshot.week < 1 || snapshot.week > 25) {
    throw new CCFSeasonIntelligenceContractError("week must be an integer within [1, 25]");
  }
  if (snapshot.recommendationAuthority !== "none") {
    throw new CCFSeasonIntelligenceContractError(
      "season intelligence snapshots cannot hold recommendation authority",
    );
  }

  const frozenAtMs = parseTimestamp("frozenAt", snapshot.frozenAt);
  const asOfMs = parseTimestamp("asOf", snapshot.asOf);
  if (frozenAtMs > asOfMs) {
    throw new CCFSeasonIntelligenceContractError("frozenAt must not be after asOf");
  }

  validateReferenceState("priorContext.traitPrior", snapshot.priorContext.traitPrior);
  validateReferenceState("priorContext.rolePrior", snapshot.priorContext.rolePrior);
  validateReferenceState(
    "priorContext.measurementRegime",
    snapshot.priorContext.measurementRegime,
  );

  const eventIds = new Set<string>();
  for (const event of snapshot.events) {
    validateCCFSeasonIntelligenceEvent(event);
    if (eventIds.has(event.eventId)) {
      throw new CCFSeasonIntelligenceContractError(`duplicate eventId ${event.eventId}`);
    }
    eventIds.add(event.eventId);

    if (event.season !== snapshot.season || event.week !== snapshot.week) {
      throw new CCFSeasonIntelligenceContractError(
        `event ${event.eventId} does not match snapshot season/week`,
      );
    }
    if (parseTimestamp(`${event.eventId}.knownAt`, event.knownAt) > frozenAtMs) {
      throw new CCFSeasonIntelligenceContractError(
        `event ${event.eventId} violates temporal eligibility: knownAt > frozenAt`,
      );
    }

    const appliesToPlayer = event.playerIds.includes(snapshot.playerId);
    const appliesToTeam = event.teamId === snapshot.teamId;
    if (!appliesToPlayer && !appliesToTeam) {
      throw new CCFSeasonIntelligenceContractError(
        `event ${event.eventId} does not apply to snapshot player or team`,
      );
    }
  }

  const missingKeys = new Set<string>();
  for (const missing of snapshot.missingInputs) {
    requireText("missingInputs.key", missing.key);
    requireText(`missingInputs.${missing.key}.reason`, missing.reason);
    if (missingKeys.has(missing.key)) {
      throw new CCFSeasonIntelligenceContractError(
        `duplicate missing input ${missing.key}`,
      );
    }
    missingKeys.add(missing.key);
  }

  return snapshot;
}

export interface CCFSeasonIntelligenceEvidenceBreadth {
  sourceRefCount: number;
  independentRootCount: number;
}

/**
 * Source count and independent-root count are deliberately separate. Ten
 * mirrors of one report remain one root and therefore do not become ten votes.
 */
export function summarizeCCFSeasonIntelligenceEvidenceBreadth(
  snapshot: CCFSeasonIntelligenceSnapshotV1,
): CCFSeasonIntelligenceEvidenceBreadth {
  validateCCFSeasonIntelligenceSnapshot(snapshot);

  const sourceRefs = new Set<string>();
  const evidenceRoots = new Set<string>();
  for (const event of snapshot.events) {
    if (event.evidenceState !== "available" && event.evidenceState !== "conflicted") {
      continue;
    }
    event.sourceRefs.forEach((ref) => sourceRefs.add(ref));
    event.evidenceRootRefs.forEach((ref) => evidenceRoots.add(ref));
  }

  return {
    sourceRefCount: sourceRefs.size,
    independentRootCount: evidenceRoots.size,
  };
}

function canonicalEvent(event: CCFSeasonIntelligenceEventV1): object {
  return {
    ...event,
    playerIds: [...event.playerIds].sort(),
    sourceRefs: [...event.sourceRefs].sort(),
    evidenceRootRefs: [...event.evidenceRootRefs].sort(),
    supersedesEventIds: [...event.supersedesEventIds].sort(),
    effects: [...event.effects].sort((left, right) =>
      `${left.variableKey}:${left.mechanismFamily}`.localeCompare(
        `${right.variableKey}:${right.mechanismFamily}`,
      ),
    ),
  };
}

export function fingerprintCCFSeasonIntelligenceSnapshot(
  snapshot: CCFSeasonIntelligenceSnapshotV1,
): string {
  validateCCFSeasonIntelligenceSnapshot(snapshot);

  const canonical = JSON.stringify({
    ...snapshot,
    events: [...snapshot.events]
      .sort((left, right) => left.eventId.localeCompare(right.eventId))
      .map(canonicalEvent),
    missingInputs: [...snapshot.missingInputs].sort((left, right) =>
      left.key.localeCompare(right.key),
    ),
  });

  return crypto.createHash("sha256").update(canonical).digest("hex");
}

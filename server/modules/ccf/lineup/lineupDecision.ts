import crypto from "crypto";
import {
  assertCCFNativeIndependence,
  validateCCFPlayerOutcome,
  type CCFPlayerOutcome,
  type CCFPosition,
} from "../outcomes/contract";
import type { CCFWeeklySourceSpineAudit } from "../sources/weeklySourceSpine";

export const CCF_LINEUP_DECISION_VERSION = "ccf-lineup-decision-v0" as const;

export type CCFLineupPosture =
  | "unset"
  | "protect_downside"
  | "balanced"
  | "chase_spike";

export type CCFLineupAvailability = "eligible" | "ineligible" | "unknown";
export type CCFLineupLockState = "locked" | "unlocked" | "unknown";

export interface CCFLineupSlot {
  slotId: string;
  slotType: string;
  eligiblePositions: CCFPosition[];
  lockedPlayerId: string | null;
}

export interface CCFLineupRosterPlayer {
  playerId: string;
  position: CCFPosition;
  identityStatus: "canonical" | "resolved" | "unresolved";
  availability: CCFLineupAvailability;
  byeWeek: number | null;
  byeWeekKnown: boolean;
  observedStarterSlotId: string | null;
  lockState: CCFLineupLockState;
  lockAt: string | null;
}

export interface CCFLineupOutcomeEnvelope {
  playerId: string;
  outcome: CCFPlayerOutcome;
  calibrationVersion: string;
  predictiveValidationReceiptFingerprint: string;
  sourcePlanFingerprint: string;
  validUntil: string;
}

export interface CCFLineupDecisionInput {
  contractVersion: typeof CCF_LINEUP_DECISION_VERSION;
  decisionId: string;
  leagueRef: string;
  teamRef: string;
  season: number;
  week: number;
  asOf: string;
  scoringFingerprint: string;
  rosterSnapshotFingerprint: string;
  posture: CCFLineupPosture;
  slots: CCFLineupSlot[];
  roster: CCFLineupRosterPlayer[];
  outcomes: CCFLineupOutcomeEnvelope[];
  weeklySourceSpineAudit: CCFWeeklySourceSpineAudit;
}

export interface CCFLineupAssignment {
  slotId: string;
  slotType: string;
  playerId: string;
  position: CCFPosition;
  locked: boolean;
  expectedFpts: number;
}

export interface CCFLineupDecisionReceipt {
  contractVersion: typeof CCF_LINEUP_DECISION_VERSION;
  decisionId: string;
  leagueRef: string;
  teamRef: string;
  season: number;
  week: number;
  asOf: string;
  scoringFingerprint: string;
  rosterSnapshotFingerprint: string;
  sourcePlanFingerprint: string | null;
  posture: CCFLineupPosture;
  inputFingerprint: string;
}

export type CCFLineupDecisionResult =
  | {
      status: "comparison_available";
      finalActionAuthority: "human";
      objective: "expected_points";
      assignments: CCFLineupAssignment[];
      expectedPoints: number;
      lineupFingerprint: string;
      tiedAlternativeLineupFingerprint: null;
      correlationSensitiveWinProbability: null;
      warnings: string[];
      blockers: string[];
      missingInputs: string[];
      receipt: CCFLineupDecisionReceipt;
    }
  | {
      status: "structural_tie";
      finalActionAuthority: "human";
      objective: "expected_points";
      assignments: CCFLineupAssignment[];
      expectedPoints: number;
      lineupFingerprint: string;
      tiedAlternativeLineupFingerprint: string;
      correlationSensitiveWinProbability: null;
      warnings: string[];
      blockers: string[];
      missingInputs: string[];
      receipt: CCFLineupDecisionReceipt;
    }
  | {
      status: "operator_tiebreak_required" | "insufficient_evidence" | "unsupported_domain";
      finalActionAuthority: "human";
      objective: null;
      assignments: null;
      expectedPoints: null;
      lineupFingerprint: null;
      tiedAlternativeLineupFingerprint: null;
      correlationSensitiveWinProbability: null;
      warnings: string[];
      blockers: string[];
      missingInputs: string[];
      receipt: CCFLineupDecisionReceipt;
    };

type FlowEdge = {
  to: number;
  rev: number;
  capacity: number;
  cost: number;
  playerIndex?: number;
  slotIndex?: number;
};

type SolverCandidate = {
  player: CCFLineupRosterPlayer;
  envelope: CCFLineupOutcomeEnvelope;
};

type SolveResult = {
  complete: boolean;
  expectedPoints: number;
  assignments: CCFLineupAssignment[];
  unfilledSlotIds: string[];
};

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function validTimestamp(value: string | null | undefined): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function sha256(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalInputFingerprint(input: CCFLineupDecisionInput): string {
  return sha256({
    ...input,
    slots: [...input.slots]
      .map((slot) => ({ ...slot, eligiblePositions: [...slot.eligiblePositions].sort() }))
      .sort((left, right) => left.slotId.localeCompare(right.slotId)),
    roster: [...input.roster].sort((left, right) => left.playerId.localeCompare(right.playerId)),
    outcomes: [...input.outcomes]
      .map((envelope) => ({ ...envelope }))
      .sort((left, right) => left.playerId.localeCompare(right.playerId)),
  });
}

function buildReceipt(input: CCFLineupDecisionInput): CCFLineupDecisionReceipt {
  return {
    contractVersion: CCF_LINEUP_DECISION_VERSION,
    decisionId: input.decisionId,
    leagueRef: input.leagueRef,
    teamRef: input.teamRef,
    season: input.season,
    week: input.week,
    asOf: input.asOf,
    scoringFingerprint: input.scoringFingerprint,
    rosterSnapshotFingerprint: input.rosterSnapshotFingerprint,
    sourcePlanFingerprint: input.weeklySourceSpineAudit.planFingerprint,
    posture: input.posture,
    inputFingerprint: canonicalInputFingerprint(input),
  };
}

function withheld(
  input: CCFLineupDecisionInput,
  status: "operator_tiebreak_required" | "insufficient_evidence" | "unsupported_domain",
  options: {
    blockers?: string[];
    missingInputs?: string[];
    warnings?: string[];
  } = {},
): CCFLineupDecisionResult {
  return {
    status,
    finalActionAuthority: "human",
    objective: null,
    assignments: null,
    expectedPoints: null,
    lineupFingerprint: null,
    tiedAlternativeLineupFingerprint: null,
    correlationSensitiveWinProbability: null,
    warnings: options.warnings ?? [],
    blockers: options.blockers ?? [],
    missingInputs: options.missingInputs ?? [],
    receipt: buildReceipt(input),
  };
}

function addEdge(graph: FlowEdge[][], from: number, edge: Omit<FlowEdge, "rev">): void {
  const forward: FlowEdge = { ...edge, rev: graph[edge.to].length };
  const reverse: FlowEdge = {
    to: from,
    rev: graph[from].length,
    capacity: 0,
    cost: -edge.cost,
  };
  graph[from].push(forward);
  graph[edge.to].push(reverse);
}

function lineupFingerprint(assignments: readonly CCFLineupAssignment[]): string {
  return sha256(
    [...assignments]
      .map((assignment) => ({
        slotId: assignment.slotId,
        playerId: assignment.playerId,
      }))
      .sort((left, right) => left.slotId.localeCompare(right.slotId)),
  );
}

function solveExpectedLineup(args: {
  slots: CCFLineupSlot[];
  candidates: SolverCandidate[];
  excludedPlayerIds?: ReadonlySet<string>;
}): SolveResult {
  const excluded = args.excludedPlayerIds ?? new Set<string>();
  const playerById = new Map(args.candidates.map((candidate) => [candidate.player.playerId, candidate]));
  const fixedAssignments: CCFLineupAssignment[] = [];
  const fixedPlayerIds = new Set<string>();
  const unlockedSlots: CCFLineupSlot[] = [];

  for (const slot of args.slots) {
    if (!slot.lockedPlayerId) {
      unlockedSlots.push(slot);
      continue;
    }
    const candidate = playerById.get(slot.lockedPlayerId);
    if (!candidate || excluded.has(slot.lockedPlayerId)) {
      return {
        complete: false,
        expectedPoints: 0,
        assignments: [],
        unfilledSlotIds: [slot.slotId],
      };
    }
    fixedPlayerIds.add(slot.lockedPlayerId);
    fixedAssignments.push({
      slotId: slot.slotId,
      slotType: slot.slotType,
      playerId: candidate.player.playerId,
      position: candidate.player.position,
      locked: true,
      expectedFpts: candidate.envelope.outcome.meanFpts,
    });
  }

  const candidates = args.candidates
    .filter((candidate) => !fixedPlayerIds.has(candidate.player.playerId))
    .filter((candidate) => !excluded.has(candidate.player.playerId))
    .sort((left, right) => left.player.playerId.localeCompare(right.player.playerId));
  const slots = [...unlockedSlots].sort((left, right) => left.slotId.localeCompare(right.slotId));

  const playerCount = candidates.length;
  const slotCount = slots.length;
  const source = 0;
  const playerOffset = 1;
  const slotOffset = playerOffset + playerCount;
  const sink = slotOffset + slotCount;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);

  candidates.forEach((candidate, playerIndex) => {
    addEdge(graph, source, {
      to: playerOffset + playerIndex,
      capacity: 1,
      cost: 0,
    });
    slots.forEach((slot, slotIndex) => {
      if (!slot.eligiblePositions.includes(candidate.player.position)) return;
      addEdge(graph, playerOffset + playerIndex, {
        to: slotOffset + slotIndex,
        capacity: 1,
        cost: -candidate.envelope.outcome.meanFpts,
        playerIndex,
        slotIndex,
      });
    });
  });

  slots.forEach((_, slotIndex) => {
    addEdge(graph, slotOffset + slotIndex, {
      to: sink,
      capacity: 1,
      cost: 0,
    });
  });

  let flow = 0;
  let totalCost = 0;
  while (flow < slotCount) {
    const distance = Array(graph.length).fill(Number.POSITIVE_INFINITY);
    const previousNode = Array(graph.length).fill(-1);
    const previousEdge = Array(graph.length).fill(-1);
    distance[source] = 0;

    for (let iteration = 0; iteration < graph.length - 1; iteration += 1) {
      let changed = false;
      for (let node = 0; node < graph.length; node += 1) {
        if (!Number.isFinite(distance[node])) continue;
        for (let edgeIndex = 0; edgeIndex < graph[node].length; edgeIndex += 1) {
          const edge = graph[node][edgeIndex];
          if (edge.capacity <= 0) continue;
          const nextDistance = distance[node] + edge.cost;
          if (nextDistance < distance[edge.to] - 1e-9) {
            distance[edge.to] = nextDistance;
            previousNode[edge.to] = node;
            previousEdge[edge.to] = edgeIndex;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    if (!Number.isFinite(distance[sink])) break;

    let node = sink;
    while (node !== source) {
      const from = previousNode[node];
      const edgeIndex = previousEdge[node];
      const edge = graph[from][edgeIndex];
      edge.capacity -= 1;
      graph[node][edge.rev].capacity += 1;
      node = from;
    }
    flow += 1;
    totalCost += distance[sink];
  }

  const assignments: CCFLineupAssignment[] = [...fixedAssignments];
  const filledSlotIndexes = new Set<number>();
  candidates.forEach((candidate, playerIndex) => {
    const node = playerOffset + playerIndex;
    for (const edge of graph[node]) {
      if (edge.playerIndex === undefined || edge.slotIndex === undefined) continue;
      if (edge.capacity !== 0) continue;
      const slot = slots[edge.slotIndex];
      filledSlotIndexes.add(edge.slotIndex);
      assignments.push({
        slotId: slot.slotId,
        slotType: slot.slotType,
        playerId: candidate.player.playerId,
        position: candidate.player.position,
        locked: false,
        expectedFpts: candidate.envelope.outcome.meanFpts,
      });
    }
  });

  const unfilledSlotIds = slots
    .filter((_, index) => !filledSlotIndexes.has(index))
    .map((slot) => slot.slotId);
  const fixedExpected = fixedAssignments.reduce((sum, assignment) => sum + assignment.expectedFpts, 0);

  return {
    complete: flow === slotCount,
    expectedPoints: Number((fixedExpected - totalCost).toFixed(6)),
    assignments: assignments.sort((left, right) => left.slotId.localeCompare(right.slotId)),
    unfilledSlotIds,
  };
}

function inspectStructure(input: CCFLineupDecisionInput): {
  blockers: string[];
  missingInputs: string[];
  playerById: Map<string, CCFLineupRosterPlayer>;
} {
  const blockers: string[] = [];
  const missingInputs: string[] = [];
  const playerById = new Map<string, CCFLineupRosterPlayer>();

  if (input.contractVersion !== CCF_LINEUP_DECISION_VERSION) blockers.push("unsupported_contract_version");
  if (!hasText(input.decisionId)) missingInputs.push("decision_id");
  if (!hasText(input.leagueRef)) missingInputs.push("league_ref");
  if (!hasText(input.teamRef)) missingInputs.push("team_ref");
  if (!Number.isInteger(input.season) || input.season < 2000) missingInputs.push("season");
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 25) missingInputs.push("week");
  if (!validTimestamp(input.asOf)) missingInputs.push("as_of");
  if (!hasText(input.scoringFingerprint)) missingInputs.push("scoring_fingerprint");
  if (!hasText(input.rosterSnapshotFingerprint)) missingInputs.push("roster_snapshot_fingerprint");
  if (!input.slots.length) missingInputs.push("starter_slots");
  if (!input.roster.length) missingInputs.push("roster");

  const slotIds = new Set<string>();
  for (const slot of input.slots) {
    if (!hasText(slot.slotId)) missingInputs.push("slot_id");
    if (!hasText(slot.slotType)) missingInputs.push(`${slot.slotId || "unknown_slot"}:slot_type`);
    if (slotIds.has(slot.slotId)) blockers.push(`duplicate_slot:${slot.slotId}`);
    slotIds.add(slot.slotId);
    if (!slot.eligiblePositions.length) blockers.push(`slot_without_eligibility:${slot.slotId}`);
    if (new Set(slot.eligiblePositions).size !== slot.eligiblePositions.length) {
      blockers.push(`duplicate_slot_eligibility:${slot.slotId}`);
    }
  }

  for (const player of input.roster) {
    if (!hasText(player.playerId)) {
      missingInputs.push("player_id");
      continue;
    }
    if (playerById.has(player.playerId)) blockers.push(`duplicate_player:${player.playerId}`);
    playerById.set(player.playerId, player);
    if (player.identityStatus === "unresolved") missingInputs.push(`${player.playerId}:canonical_identity`);
    if (player.availability === "unknown") missingInputs.push(`${player.playerId}:availability`);
    if (!player.byeWeekKnown && player.byeWeek !== null) {
      blockers.push(`${player.playerId}:bye_week_present_while_unknown`);
    }
    if (player.byeWeekKnown && player.byeWeek !== null
        && (!Number.isInteger(player.byeWeek) || player.byeWeek < 1 || player.byeWeek > 25)) {
      blockers.push(`${player.playerId}:invalid_bye_week`);
    }
    if (player.lockAt !== null && !validTimestamp(player.lockAt)) {
      missingInputs.push(`${player.playerId}:lock_at`);
    }
    if (player.lockState === "locked" && player.lockAt === null) {
      missingInputs.push(`${player.playerId}:lock_at`);
    }
    if (player.observedStarterSlotId && !slotIds.has(player.observedStarterSlotId)) {
      blockers.push(`${player.playerId}:observed_starter_slot_not_found`);
    }
  }

  const seenLockedPlayers = new Set<string>();
  for (const slot of input.slots) {
    if (!slot.lockedPlayerId) continue;
    if (seenLockedPlayers.has(slot.lockedPlayerId)) blockers.push(`duplicate_locked_player:${slot.lockedPlayerId}`);
    seenLockedPlayers.add(slot.lockedPlayerId);
    const player = playerById.get(slot.lockedPlayerId);
    if (!player) {
      missingInputs.push(`${slot.slotId}:locked_player`);
      continue;
    }
    if (!slot.eligiblePositions.includes(player.position)) blockers.push(`${slot.slotId}:locked_player_ineligible_position`);
    if (player.observedStarterSlotId !== slot.slotId) blockers.push(`${slot.slotId}:locked_player_not_observed_in_slot`);
    if (player.availability !== "eligible") blockers.push(`${slot.slotId}:locked_player_not_eligible`);
    if (!player.byeWeekKnown) missingInputs.push(`${player.playerId}:bye_week_state`);
    if (player.byeWeekKnown && player.byeWeek === input.week) blockers.push(`${slot.slotId}:locked_player_on_bye`);
    if (player.lockState !== "locked") blockers.push(`${slot.slotId}:locked_player_state_${player.lockState}`);
  }

  for (const player of input.roster) {
    if (player.lockState !== "locked" || !player.observedStarterSlotId) continue;
    const slot = input.slots.find((candidate) => candidate.slotId === player.observedStarterSlotId);
    if (!slot || slot.lockedPlayerId !== player.playerId) {
      blockers.push(`${player.playerId}:locked_starter_not_bound_to_observed_slot`);
    }
  }

  return { blockers, missingInputs, playerById };
}

function inspectOutcomeEnvelope(args: {
  input: CCFLineupDecisionInput;
  player: CCFLineupRosterPlayer;
  envelope: CCFLineupOutcomeEnvelope | undefined;
}): string[] {
  const { input, player, envelope } = args;
  const gaps: string[] = [];
  if (!envelope) return [`${player.playerId}:ccf_outcome`];
  if (envelope.playerId !== player.playerId) gaps.push(`${player.playerId}:outcome_envelope_identity_mismatch`);
  if (!hasText(envelope.calibrationVersion)) gaps.push(`${player.playerId}:calibration_version`);
  if (!hasText(envelope.predictiveValidationReceiptFingerprint)) {
    gaps.push(`${player.playerId}:predictive_validation_receipt`);
  }
  if (!hasText(envelope.sourcePlanFingerprint)) gaps.push(`${player.playerId}:source_plan_fingerprint`);
  if (envelope.sourcePlanFingerprint !== input.weeklySourceSpineAudit.planFingerprint) {
    gaps.push(`${player.playerId}:source_plan_fingerprint_mismatch`);
  }
  if (!validTimestamp(envelope.validUntil)) {
    gaps.push(`${player.playerId}:valid_until`);
  } else if (validTimestamp(input.asOf) && Date.parse(envelope.validUntil) < Date.parse(input.asOf)) {
    gaps.push(`${player.playerId}:outcome_stale`);
  }

  try {
    validateCCFPlayerOutcome(envelope.outcome);
    assertCCFNativeIndependence(envelope.outcome);
  } catch (error) {
    gaps.push(`${player.playerId}:invalid_native_outcome:${error instanceof Error ? error.message : "unknown"}`);
    return gaps;
  }

  const outcome = envelope.outcome;
  if (outcome.playerId !== player.playerId) gaps.push(`${player.playerId}:outcome_player_mismatch`);
  if (outcome.position !== player.position) gaps.push(`${player.playerId}:outcome_position_mismatch`);
  if (outcome.season !== input.season) gaps.push(`${player.playerId}:outcome_season_mismatch`);
  if (outcome.week !== input.week) gaps.push(`${player.playerId}:outcome_week_mismatch`);
  if (outcome.scoringFingerprint !== input.scoringFingerprint) {
    gaps.push(`${player.playerId}:outcome_scoring_fingerprint_mismatch`);
  }
  if (!validTimestamp(outcome.asOf)) {
    gaps.push(`${player.playerId}:outcome_as_of`);
  } else if (validTimestamp(input.asOf) && Date.parse(outcome.asOf) > Date.parse(input.asOf)) {
    gaps.push(`${player.playerId}:outcome_known_after_decision`);
  }
  if (outcome.abstain) gaps.push(`${player.playerId}:native_outcome_abstained`);
  return gaps;
}

/**
 * Complete legal-lineup decision core for the CCF-native weekly path.
 *
 * It intentionally optimizes expected fantasy points only. Expected lineup
 * points are additive even when player outcomes are correlated. Downside and
 * spike-seeking postures require a governed joint-lineup outcome distribution;
 * summing marginal player P25/P90 values would falsely label a policy score as
 * a lineup quantile, so those postures fail closed until that producer exists.
 *
 * Bye and lock truth are explicit. Unknown bye/lock state blocks any otherwise
 * playable alternative; locked bench players are not insertable; locked
 * observed starters must remain bound to their exact frozen slot.
 *
 * This function never writes a lineup. Human action authority is invariant.
 */
export function evaluateCCFCompleteLegalLineup(
  input: CCFLineupDecisionInput,
): CCFLineupDecisionResult {
  const structure = inspectStructure(input);
  if (structure.blockers.length || structure.missingInputs.length) {
    return withheld(input, "insufficient_evidence", {
      blockers: structure.blockers,
      missingInputs: structure.missingInputs,
    });
  }

  if (!input.weeklySourceSpineAudit.productionReady || !input.weeklySourceSpineAudit.planFingerprint) {
    return withheld(input, "insufficient_evidence", {
      blockers: [
        "The native weekly source spine is not production-ready for recommendation-critical use.",
        ...input.weeklySourceSpineAudit.blockers,
      ],
      missingInputs: ["production_ready_weekly_source_spine"],
    });
  }
  if (!validTimestamp(input.weeklySourceSpineAudit.asOf)
      || input.weeklySourceSpineAudit.asOf !== input.asOf) {
    return withheld(input, "insufficient_evidence", {
      blockers: ["Weekly source-spine evidence must be evaluated at the exact frozen decision as-of."],
      missingInputs: ["same_as_of_weekly_source_spine"],
    });
  }

  if (input.posture === "unset") {
    return withheld(input, "operator_tiebreak_required", {
      blockers: ["An explicit operator posture is required; the optimizer will not infer risk preference."],
    });
  }
  if (input.posture === "protect_downside" || input.posture === "chase_spike") {
    return withheld(input, "insufficient_evidence", {
      blockers: [
        "A governed joint-lineup distribution is required for downside/ceiling optimization.",
        "Marginal player quantiles are not summed and relabeled as lineup P25/P90.",
      ],
      missingInputs: ["governed_joint_lineup_distribution"],
    });
  }

  const rosterPlayerIds = new Set(input.roster.map((player) => player.playerId));
  const orphanOutcomePlayerIds = input.outcomes
    .map((envelope) => envelope.playerId)
    .filter((playerId) => !rosterPlayerIds.has(playerId));
  if (orphanOutcomePlayerIds.length) {
    return withheld(input, "insufficient_evidence", {
      blockers: ["Outcome envelopes must be bound to the frozen roster snapshot."],
      missingInputs: Array.from(new Set(orphanOutcomePlayerIds))
        .sort()
        .map((playerId) => `${playerId}:orphan_outcome_envelope`),
    });
  }

  const outcomeByPlayerId = new Map(input.outcomes.map((envelope) => [envelope.playerId, envelope]));
  if (outcomeByPlayerId.size !== input.outcomes.length) {
    return withheld(input, "insufficient_evidence", {
      blockers: ["Duplicate CCF outcome envelopes are not allowed."],
      missingInputs: ["unique_ccf_outcome_envelopes"],
    });
  }

  const lockedPlayerIds = new Set(
    input.slots.map((slot) => slot.lockedPlayerId).filter((playerId): playerId is string => Boolean(playerId)),
  );
  const candidates: SolverCandidate[] = [];
  const stateGaps: string[] = [];
  const outcomeGaps: string[] = [];

  for (const player of input.roster) {
    if (player.availability === "ineligible") continue;
    if (player.availability === "unknown") {
      stateGaps.push(`${player.playerId}:availability`);
      continue;
    }
    if (!player.byeWeekKnown) {
      stateGaps.push(`${player.playerId}:bye_week_state`);
      continue;
    }
    if (player.byeWeek === input.week) continue;
    if (player.lockState === "unknown") {
      stateGaps.push(`${player.playerId}:lock_state`);
      continue;
    }

    const lockedStarter = lockedPlayerIds.has(player.playerId);
    if (player.lockState === "locked" && !lockedStarter) {
      // A player whose NFL game is already locked cannot be inserted from the bench.
      continue;
    }

    const envelope = outcomeByPlayerId.get(player.playerId);
    outcomeGaps.push(...inspectOutcomeEnvelope({ input, player, envelope }));
    if (envelope) candidates.push({ player, envelope });
  }

  if (stateGaps.length) {
    return withheld(input, "insufficient_evidence", {
      blockers: [
        "Bye/availability/lock truth is incomplete for at least one otherwise playable roster alternative.",
      ],
      missingInputs: Array.from(new Set(stateGaps)).sort(),
    });
  }

  if (outcomeGaps.length) {
    return withheld(input, "insufficient_evidence", {
      blockers: [
        "Every legal lineup alternative must have a compatible, temporally eligible CCF-native outcome before optimization.",
      ],
      missingInputs: Array.from(new Set(outcomeGaps)).sort(),
    });
  }

  const solved = solveExpectedLineup({ slots: input.slots, candidates });
  if (!solved.complete) {
    return withheld(input, "insufficient_evidence", {
      blockers: ["The roster cannot produce a complete legal lineup under the frozen slot and availability state."],
      missingInputs: solved.unfilledSlotIds.map((slotId) => `${slotId}:eligible_player`),
    });
  }

  const selectedUnlocked = solved.assignments.filter((assignment) => !assignment.locked);
  let tiedAlternative: SolveResult | null = null;
  for (const assignment of selectedUnlocked) {
    const alternative = solveExpectedLineup({
      slots: input.slots,
      candidates,
      excludedPlayerIds: new Set([assignment.playerId]),
    });
    if (!alternative.complete) continue;
    if (Math.abs(alternative.expectedPoints - solved.expectedPoints) <= 1e-9) {
      tiedAlternative = alternative;
      break;
    }
  }

  const fingerprint = lineupFingerprint(solved.assignments);
  const base = {
    finalActionAuthority: "human" as const,
    objective: "expected_points" as const,
    assignments: solved.assignments,
    expectedPoints: solved.expectedPoints,
    lineupFingerprint: fingerprint,
    correlationSensitiveWinProbability: null,
    warnings: [
      "No matchup win probability is emitted without a governed aligned joint distribution for both lineups/opponent outcomes.",
    ],
    blockers: [],
    missingInputs: [],
    receipt: buildReceipt(input),
  };

  if (tiedAlternative) {
    return {
      ...base,
      status: "structural_tie",
      tiedAlternativeLineupFingerprint: lineupFingerprint(tiedAlternative.assignments),
    };
  }

  return {
    ...base,
    status: "comparison_available",
    tiedAlternativeLineupFingerprint: null,
  };
}

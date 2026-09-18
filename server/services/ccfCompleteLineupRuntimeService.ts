import {
  bindUnifiedLeagueContextToCCFLineup,
  type CCFLineupLeagueBinding,
} from '../leagueContext/ccfLineupLeagueAdapter';
import {
  CCF_LINEUP_DECISION_VERSION,
  evaluateCCFCompleteLegalLineup,
  type CCFLineupDecisionInput,
  type CCFLineupDecisionResult,
  type CCFLineupOutcomeEnvelope,
  type CCFLineupPosture,
  type CCFLineupRosterPlayer,
  type CCFLineupSlot,
} from '../modules/ccf/lineup/lineupDecision';
import {
  CCF_ROSTER_STATE_SNAPSHOT_VERSION,
  verifyCCFFrozenRosterStateSnapshot,
  type CCFFrozenRosterStateSnapshot,
} from '../modules/ccf/lineup/rosterStateSnapshot';
import type { CCFWeeklySourceSpineAudit } from '../modules/ccf/sources/weeklySourceSpine';
import type { UnifiedLeagueContextV1 } from '../leagueContext/leagueContextV1';

export const CCF_COMPLETE_LINEUP_RUNTIME_VERSION = 'ccf-complete-lineup-runtime-v0' as const;

export interface CCFCompleteLineupRuntimeInput {
  decisionId: string;
  teamRef: string;
  week: number;
  asOf: string;
  posture: CCFLineupPosture;
  leagueContext: UnifiedLeagueContextV1;
  rosterSnapshot: CCFFrozenRosterStateSnapshot;
  outcomes: CCFLineupOutcomeEnvelope[];
  weeklySourceSpineAudit: CCFWeeklySourceSpineAudit;
}

export type CCFCompleteLineupRuntimeResult =
  | {
      schemaVersion: typeof CCF_COMPLETE_LINEUP_RUNTIME_VERSION;
      state: 'blocked';
      leagueBinding: CCFLineupLeagueBinding;
      blockers: string[];
      missingInputs: string[];
      decisionInput: null;
      decision: null;
    }
  | {
      schemaVersion: typeof CCF_COMPLETE_LINEUP_RUNTIME_VERSION;
      state: 'evaluated';
      leagueBinding: CCFLineupLeagueBinding;
      blockers: string[];
      missingInputs: string[];
      decisionInput: CCFLineupDecisionInput;
      decision: CCFLineupDecisionResult;
    };

function validTimestamp(value: string | null | undefined): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function blocked(
  leagueBinding: CCFLineupLeagueBinding,
  blockers: string[],
  missingInputs: string[],
): CCFCompleteLineupRuntimeResult {
  return {
    schemaVersion: CCF_COMPLETE_LINEUP_RUNTIME_VERSION,
    state: 'blocked',
    leagueBinding,
    blockers: Array.from(new Set(blockers)).sort(),
    missingInputs: Array.from(new Set(missingInputs)).sort(),
    decisionInput: null,
    decision: null,
  };
}

function bindLockedObservedStarters(args: {
  slots: CCFLineupSlot[];
  roster: CCFLineupRosterPlayer[];
}): { slots: CCFLineupSlot[]; blockers: string[] } {
  const slots = args.slots.map((slot) => ({ ...slot, eligiblePositions: [...slot.eligiblePositions] }));
  const slotById = new Map(slots.map((slot) => [slot.slotId, slot]));
  const blockers: string[] = [];
  const occupiedLockedSlots = new Set<string>();

  for (const player of args.roster) {
    if (!player.observedStarterSlotId) continue;
    const slot = slotById.get(player.observedStarterSlotId);
    if (!slot) {
      blockers.push(`${player.playerId}:observed_starter_slot_not_in_active_league_geometry`);
      continue;
    }
    if (!slot.eligiblePositions.includes(player.position)) {
      blockers.push(`${player.playerId}:observed_starter_position_illegal_for_${slot.slotId}`);
    }
    if (player.lockState !== 'locked') continue;
    if (occupiedLockedSlots.has(slot.slotId)) {
      blockers.push(`${slot.slotId}:multiple_locked_starters`);
      continue;
    }
    occupiedLockedSlots.add(slot.slotId);
    slot.lockedPlayerId = player.playerId;
  }

  return { slots, blockers };
}

/**
 * Compose authoritative league/scoring/slot truth with a self-authenticating
 * frozen roster-state snapshot and run the CCF complete legal-lineup core.
 *
 * This service deliberately performs no provider fetches and no lineup writes.
 * Platform sync, identity, availability/byes, explicit lock state,
 * source-spine qualification and native outcome production remain separately
 * governed upstream responsibilities. The roster snapshot fingerprint is
 * recomputed from its actual contents here; a caller cannot pair stale legality
 * state with a decorative fingerprint. The composer also requires exact
 * league/team/season/week/as-of/slot-geometry/source-plan binding.
 */
export function evaluateCCFCompleteLineupRuntime(
  input: CCFCompleteLineupRuntimeInput,
): CCFCompleteLineupRuntimeResult {
  const leagueBinding = bindUnifiedLeagueContextToCCFLineup(input.leagueContext);
  const blockers: string[] = [...leagueBinding.blockers];
  const missingInputs: string[] = [];
  const scoringFingerprint = leagueBinding.scoringFingerprint;
  const rosterSlotsFingerprint = leagueBinding.rosterSlotsFingerprint;
  const rosterSnapshot = input.rosterSnapshot;

  if (!input.decisionId.trim()) missingInputs.push('decision_id');
  if (!input.teamRef.trim()) missingInputs.push('team_ref');
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 25) missingInputs.push('week');
  if (!validTimestamp(input.asOf)) missingInputs.push('as_of');
  if (input.leagueContext.identity.season < 2000) blockers.push('active_league_season_invalid');

  if (rosterSnapshot.schemaVersion !== CCF_ROSTER_STATE_SNAPSHOT_VERSION) {
    blockers.push('roster_snapshot_schema_version_mismatch');
  }
  if (!verifyCCFFrozenRosterStateSnapshot(rosterSnapshot)) {
    blockers.push('roster_snapshot_fingerprint_mismatch');
  }
  if (!validTimestamp(rosterSnapshot.asOf)) missingInputs.push('roster_snapshot_as_of');
  if (!hasText(rosterSnapshot.producer.producerId)) missingInputs.push('roster_snapshot_producer_id');
  if (!hasText(rosterSnapshot.producer.producerVersion)) missingInputs.push('roster_snapshot_producer_version');
  if (!hasText(rosterSnapshot.producer.sourcePlanFingerprint)) {
    missingInputs.push('roster_snapshot_source_plan_fingerprint');
  }
  if (!hasText(rosterSnapshot.producer.sourceSnapshotRef)) missingInputs.push('roster_snapshot_source_ref');

  if (rosterSnapshot.leagueRef !== leagueBinding.leagueRef) blockers.push('roster_snapshot_league_ref_mismatch');
  if (rosterSnapshot.teamRef !== input.teamRef) blockers.push('roster_snapshot_team_ref_mismatch');
  if (rosterSnapshot.season !== input.leagueContext.identity.season) blockers.push('roster_snapshot_season_mismatch');
  if (rosterSnapshot.week !== input.week) blockers.push('roster_snapshot_week_mismatch');
  if (rosterSnapshot.asOf !== input.asOf) blockers.push('roster_snapshot_as_of_mismatch');
  if (rosterSlotsFingerprint && rosterSnapshot.rosterSlotsFingerprint !== rosterSlotsFingerprint) {
    blockers.push('roster_snapshot_slot_geometry_mismatch');
  }
  if (rosterSnapshot.producer.sourcePlanFingerprint !== input.weeklySourceSpineAudit.planFingerprint) {
    blockers.push('roster_snapshot_source_plan_fingerprint_mismatch');
  }

  if (!leagueBinding.ready || !scoringFingerprint || !rosterSlotsFingerprint) {
    missingInputs.push('certified_ccf_lineup_league_binding');
  }
  if (blockers.length || missingInputs.length || !scoringFingerprint || !rosterSlotsFingerprint) {
    return blocked(leagueBinding, blockers, missingInputs);
  }

  const lockBinding = bindLockedObservedStarters({
    slots: leagueBinding.slots,
    roster: rosterSnapshot.players,
  });
  blockers.push(...lockBinding.blockers);
  if (blockers.length) {
    return blocked(leagueBinding, blockers, missingInputs);
  }

  const decisionInput: CCFLineupDecisionInput = {
    contractVersion: CCF_LINEUP_DECISION_VERSION,
    decisionId: input.decisionId,
    leagueRef: leagueBinding.leagueRef,
    teamRef: input.teamRef,
    season: input.leagueContext.identity.season,
    week: input.week,
    asOf: input.asOf,
    scoringFingerprint,
    rosterSnapshotFingerprint: rosterSnapshot.fingerprint,
    posture: input.posture,
    slots: lockBinding.slots,
    roster: rosterSnapshot.players,
    outcomes: input.outcomes,
    weeklySourceSpineAudit: input.weeklySourceSpineAudit,
  };
  const decision = evaluateCCFCompleteLegalLineup(decisionInput);

  return {
    schemaVersion: CCF_COMPLETE_LINEUP_RUNTIME_VERSION,
    state: 'evaluated',
    leagueBinding,
    blockers: decision.blockers,
    missingInputs: decision.missingInputs,
    decisionInput,
    decision,
  };
}

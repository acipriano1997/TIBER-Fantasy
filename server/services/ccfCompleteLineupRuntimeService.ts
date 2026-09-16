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
  rosterSnapshotFingerprint: string;
  roster: CCFLineupRosterPlayer[];
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

function bindElapsedLocks(args: {
  slots: CCFLineupSlot[];
  roster: CCFLineupRosterPlayer[];
  asOf: string;
}): { slots: CCFLineupSlot[]; blockers: string[]; missingInputs: string[] } {
  const slots = args.slots.map((slot) => ({ ...slot, eligiblePositions: [...slot.eligiblePositions] }));
  const slotById = new Map(slots.map((slot) => [slot.slotId, slot]));
  const blockers: string[] = [];
  const missingInputs: string[] = [];
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
    if (player.lockAt === null) continue;
    if (!validTimestamp(player.lockAt)) {
      missingInputs.push(`${player.playerId}:lock_at`);
      continue;
    }
    if (Date.parse(player.lockAt) > Date.parse(args.asOf)) continue;
    if (occupiedLockedSlots.has(slot.slotId)) {
      blockers.push(`${slot.slotId}:multiple_elapsed_locked_starters`);
      continue;
    }
    occupiedLockedSlots.add(slot.slotId);
    slot.lockedPlayerId = player.playerId;
  }

  return { slots, blockers, missingInputs };
}

/**
 * Compose the authoritative league/scoring/slot binding with a separately
 * frozen roster/evidence packet and run the CCF complete legal-lineup core.
 *
 * This service deliberately performs no provider fetches and no lineup writes.
 * Platform sync, identity, availability/byes, lock evidence, source-spine
 * qualification and native outcome production remain separately governed
 * upstream responsibilities. That keeps one truth owner per variable and makes
 * the assembled packet replayable.
 */
export function evaluateCCFCompleteLineupRuntime(
  input: CCFCompleteLineupRuntimeInput,
): CCFCompleteLineupRuntimeResult {
  const leagueBinding = bindUnifiedLeagueContextToCCFLineup(input.leagueContext);
  const blockers: string[] = [...leagueBinding.blockers];
  const missingInputs: string[] = [];

  if (!input.decisionId.trim()) missingInputs.push('decision_id');
  if (!input.teamRef.trim()) missingInputs.push('team_ref');
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 25) missingInputs.push('week');
  if (!validTimestamp(input.asOf)) missingInputs.push('as_of');
  if (!input.rosterSnapshotFingerprint.trim()) missingInputs.push('roster_snapshot_fingerprint');
  if (input.leagueContext.identity.season < 2000) blockers.push('active_league_season_invalid');

  if (!leagueBinding.ready || !leagueBinding.scoringFingerprint || !leagueBinding.rosterSlotsFingerprint) {
    missingInputs.push('certified_ccf_lineup_league_binding');
  }
  if (blockers.length || missingInputs.length) {
    return blocked(leagueBinding, blockers, missingInputs);
  }

  const lockBinding = bindElapsedLocks({
    slots: leagueBinding.slots,
    roster: input.roster,
    asOf: input.asOf,
  });
  blockers.push(...lockBinding.blockers);
  missingInputs.push(...lockBinding.missingInputs);
  if (blockers.length || missingInputs.length) {
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
    scoringFingerprint: leagueBinding.scoringFingerprint,
    rosterSnapshotFingerprint: input.rosterSnapshotFingerprint,
    posture: input.posture,
    slots: lockBinding.slots,
    roster: input.roster,
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

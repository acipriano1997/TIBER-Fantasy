import { createHash } from 'node:crypto';
import type { CCFLineupRosterPlayer } from './lineupDecision';

export const CCF_ROSTER_STATE_SNAPSHOT_VERSION = 'ccf-roster-state-snapshot-v1' as const;

export interface CCFRosterStateSnapshotProducer {
  producerId: string;
  producerVersion: string;
  sourcePlanFingerprint: string;
  sourceSnapshotRef: string;
}

export interface CCFRosterStateSnapshotContent {
  schemaVersion: typeof CCF_ROSTER_STATE_SNAPSHOT_VERSION;
  leagueRef: string;
  teamRef: string;
  season: number;
  week: number;
  asOf: string;
  rosterSlotsFingerprint: string;
  producer: CCFRosterStateSnapshotProducer;
  players: CCFLineupRosterPlayer[];
}

export interface CCFFrozenRosterStateSnapshot extends CCFRosterStateSnapshotContent {
  fingerprint: string;
}

export type CreateCCFFrozenRosterStateSnapshotInput = Omit<
  CCFRosterStateSnapshotContent,
  'schemaVersion' | 'players'
> & {
  players: readonly CCFLineupRosterPlayer[];
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function clonePlayer(player: CCFLineupRosterPlayer): CCFLineupRosterPlayer {
  return {
    playerId: player.playerId,
    position: player.position,
    identityStatus: player.identityStatus,
    availability: player.availability,
    byeWeek: player.byeWeek,
    byeWeekKnown: player.byeWeekKnown,
    observedStarterSlotId: player.observedStarterSlotId,
    lockState: player.lockState,
    lockAt: player.lockAt,
  };
}

function canonicalSnapshotContent(
  snapshot: CCFRosterStateSnapshotContent | CCFFrozenRosterStateSnapshot,
): CCFRosterStateSnapshotContent {
  return {
    schemaVersion: snapshot.schemaVersion,
    leagueRef: snapshot.leagueRef,
    teamRef: snapshot.teamRef,
    season: snapshot.season,
    week: snapshot.week,
    asOf: snapshot.asOf,
    rosterSlotsFingerprint: snapshot.rosterSlotsFingerprint,
    producer: {
      producerId: snapshot.producer.producerId,
      producerVersion: snapshot.producer.producerVersion,
      sourcePlanFingerprint: snapshot.producer.sourcePlanFingerprint,
      sourceSnapshotRef: snapshot.producer.sourceSnapshotRef,
    },
    players: snapshot.players
      .map(clonePlayer)
      .sort((left, right) => left.playerId.localeCompare(right.playerId)),
  };
}

export function computeCCFRosterStateSnapshotFingerprint(
  snapshot: CCFRosterStateSnapshotContent | CCFFrozenRosterStateSnapshot,
): string {
  const canonical = canonicalize(canonicalSnapshotContent(snapshot));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Build the immutable roster/legality portion of the weekly lineup decision
 * packet. The fingerprint is derived from the actual roster contents and their
 * league/team/week/as-of/source binding; callers never provide it separately.
 * Player order is presentation-only and therefore canonicalized away.
 */
export function createCCFFrozenRosterStateSnapshot(
  input: CreateCCFFrozenRosterStateSnapshotInput,
): CCFFrozenRosterStateSnapshot {
  const content: CCFRosterStateSnapshotContent = {
    schemaVersion: CCF_ROSTER_STATE_SNAPSHOT_VERSION,
    leagueRef: input.leagueRef,
    teamRef: input.teamRef,
    season: input.season,
    week: input.week,
    asOf: input.asOf,
    rosterSlotsFingerprint: input.rosterSlotsFingerprint,
    producer: { ...input.producer },
    players: input.players.map(clonePlayer),
  };
  return {
    ...content,
    fingerprint: computeCCFRosterStateSnapshotFingerprint(content),
  };
}

export function verifyCCFFrozenRosterStateSnapshot(
  snapshot: CCFFrozenRosterStateSnapshot,
): boolean {
  return snapshot.schemaVersion === CCF_ROSTER_STATE_SNAPSHOT_VERSION
    && /^[a-f0-9]{64}$/.test(snapshot.fingerprint)
    && snapshot.fingerprint === computeCCFRosterStateSnapshotFingerprint(snapshot);
}

import { createHash } from 'node:crypto';
import {
  assessLeagueDecisionReadiness,
  type UnifiedLeagueContextV1,
} from './leagueContextV1';
import type { CCFLineupSlot } from '../modules/ccf/lineup/lineupDecision';
import {
  CCF_LINEUP_POSITION_COVERAGE_VERSION,
  auditCCFLineupPositionCoverage,
  type CCFLineupPositionCoverageAudit,
} from '../modules/ccf/lineup/positionCoverage';

const NON_STARTER_SLOT_TOKENS = new Set(['BN', 'IR', 'TAXI']);

type SlotResolution = {
  eligiblePositions: CCFLineupSlot['eligiblePositions'];
};

/**
 * Conservative Sleeper/Unified-League-Context starter-slot grammar for the
 * current CCF QB/RB/WR/TE outcome universe. Unknown slot tokens deliberately
 * fail closed instead of inheriting a guessed FLEX meaning.
 */
const SUPPORTED_STARTER_SLOT_GRAMMAR: Readonly<Record<string, SlotResolution>> = {
  QB: { eligiblePositions: ['QB'] },
  RB: { eligiblePositions: ['RB'] },
  WR: { eligiblePositions: ['WR'] },
  TE: { eligiblePositions: ['TE'] },
  FLEX: { eligiblePositions: ['RB', 'WR', 'TE'] },
  SUPER_FLEX: { eligiblePositions: ['QB', 'RB', 'WR', 'TE'] },
};

export interface CCFLineupLeagueBinding {
  schemaVersion: 'ccf-lineup-league-binding-v0';
  ready: boolean;
  leagueRef: string;
  season: number;
  scoringFingerprint: string | null;
  rosterSlotsFingerprint: string | null;
  slots: CCFLineupSlot[];
  positionCoverage: CCFLineupPositionCoverageAudit;
  blockers: string[];
  warnings: string[];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function normalizeSlotToken(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Bind Unified League Context v1 to the CCF complete-lineup geometry contract.
 *
 * This is deliberately only a league/slot adapter. Roster identity,
 * availability, byes, locks and native player outcomes remain separate frozen
 * decision-packet inputs owned by their authoritative producers.
 */
export function bindUnifiedLeagueContextToCCFLineup(
  context: UnifiedLeagueContextV1,
): CCFLineupLeagueBinding {
  const readiness = assessLeagueDecisionReadiness(context, { decisionType: 'lineup' });
  const blockers = [...readiness.blockers];
  const warnings = [...readiness.warnings];

  const scoringFingerprint = context.scoring.status === 'certified'
    ? context.scoring.fingerprint
    : null;
  if (!scoringFingerprint) blockers.push('Certified active-league scoring fingerprint is unavailable.');

  const normalizedRosterPositions = context.rosterPositions.map(normalizeSlotToken);
  if (!normalizedRosterPositions.length) blockers.push('Active league roster positions are unavailable.');

  const rosterSlotsFingerprint = normalizedRosterPositions.length
    ? fingerprint({
        platform: context.identity.platform,
        leagueId: context.identity.leagueId,
        season: context.identity.season,
        orderedRosterPositions: normalizedRosterPositions,
      })
    : null;

  const slotCounts = new Map<string, number>();
  const slots: CCFLineupSlot[] = [];
  const requiredPlayerPositions: string[] = [];

  for (const slotToken of normalizedRosterPositions) {
    if (NON_STARTER_SLOT_TOKENS.has(slotToken)) continue;

    const resolution = SUPPORTED_STARTER_SLOT_GRAMMAR[slotToken];
    if (!resolution) {
      blockers.push(`Unsupported active starter slot token: ${slotToken}.`);
      continue;
    }

    const ordinal = (slotCounts.get(slotToken) ?? 0) + 1;
    slotCounts.set(slotToken, ordinal);
    const eligiblePositions = [...resolution.eligiblePositions];
    requiredPlayerPositions.push(...eligiblePositions);
    slots.push({
      slotId: `${slotToken}:${ordinal}`,
      slotType: slotToken,
      eligiblePositions,
      lockedPlayerId: null,
    });
  }

  if (!slots.length) blockers.push('No supported active starter slots were resolved for this league.');

  const positionCoverage = auditCCFLineupPositionCoverage({
    contractVersion: CCF_LINEUP_POSITION_COVERAGE_VERSION,
    leagueRef: context.identity.leagueId,
    rosterSlotsFingerprint: rosterSlotsFingerprint ?? '',
    starterEligiblePositions: requiredPlayerPositions,
  });
  blockers.push(...positionCoverage.blockers.map((blocker) => `position_coverage:${blocker}`));

  const uniqueBlockers = Array.from(new Set(blockers)).sort();
  return {
    schemaVersion: 'ccf-lineup-league-binding-v0',
    ready: uniqueBlockers.length === 0 && positionCoverage.ready,
    leagueRef: context.identity.leagueId,
    season: context.identity.season,
    scoringFingerprint,
    rosterSlotsFingerprint,
    slots,
    positionCoverage,
    blockers: uniqueBlockers,
    warnings: Array.from(new Set(warnings)).sort(),
  };
}

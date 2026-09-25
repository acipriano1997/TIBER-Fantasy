/**
 * Next Man Up Service
 * 
 * Identifies opportunity shifts when starters go OUT/IR.
 * Used by FORGE Movers to show green arrows (gaining opportunity)
 * and red arrows (losing opportunity due to injury).
 */

import { db } from '../infra/db';
import { depthCharts, playerIdentityMap, playerLiveStatus } from '@shared/schema';
import { eq, and, inArray, sql, gt, desc, isNull } from 'drizzle-orm';
import {
  type NewsEvidenceEvent,
  shouldTriggerCcfReevaluation,
} from '../data/newsIntelligence';
import {
  buildOpportunityResegmentationRequest,
  type OpportunityResegmentationCandidate,
  type OpportunityResegmentationRequest,
} from './opportunityResegmentation';

export interface OpportunityShift {
  type: 'gaining' | 'losing';
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  depthOrder: number;
  reason: string;
  relatedPlayer: {
    playerId: string;
    playerName: string;
    injuryStatus: string;
    depthOrder: number;
  } | null;
}

export interface NextManUpResult {
  success: boolean;
  shifts: OpportunityShift[];
  generatedAt: string;
}


export class NextManUpService {
  /**
   * Translate decision-grade NEWS-001 injury evidence into a bounded
   * opportunity re-segmentation request. This queries existing canonical
   * identity/depth-chart state but never mutates usage, projections, rankings,
   * or lineup state.
   */
  async planFromNewsInjuryEvent(
    event: NewsEvidenceEvent,
    asOf: string = new Date().toISOString(),
  ): Promise<OpportunityResegmentationRequest | null> {
    if (event.family !== 'INJURY' || !shouldTriggerCcfReevaluation(event)) {
      return null;
    }

    const injuredPlayerId = event.playerIds?.[0];
    if (!injuredPlayerId) {
      return null;
    }

    const identity = await db
      .select({
        canonicalId: playerIdentityMap.canonicalId,
        fullName: playerIdentityMap.fullName,
        position: playerIdentityMap.position,
        nflTeam: playerIdentityMap.nflTeam,
      })
      .from(playerIdentityMap)
      .where(eq(playerIdentityMap.canonicalId, injuredPlayerId))
      .limit(1);

    if (identity.length === 0) {
      return {
        schemaVersion: 'opportunity-resegmentation.v0',
        triggerEventId: event.eventId,
        asOf,
        state: 'BLOCKED',
        blockers: ['canonical_injured_player_not_found'],
        injuredPlayer: {
          playerId: injuredPlayerId,
          playerName: event.headline ?? injuredPlayerId,
          team: event.teamIds?.[0] ?? '',
          position: '',
          depthOrder: null,
        },
        candidates: [],
        dependencyTags: [
          'role/usage',
          'projection/recompute',
          'lineup/reevaluate',
          'waiver/reevaluate',
          'tail-risk/reevaluate',
        ],
        directMutationAllowed: false,
      };
    }

    const player = identity[0];
    const team = event.teamIds?.[0] ?? player.nflTeam ?? '';
    const position = player.position ?? '';

    const depth = team && position
      ? await db
          .select({
            canonicalPlayerId: depthCharts.canonicalPlayerId,
            teamCode: depthCharts.teamCode,
            position: depthCharts.position,
            depthOrder: depthCharts.depthOrder,
            season: depthCharts.season,
            week: depthCharts.week,
            source: depthCharts.source,
            confidence: depthCharts.confidence,
            effectiveDate: depthCharts.effectiveDate,
          })
          .from(depthCharts)
          .where(and(
            eq(depthCharts.canonicalPlayerId, injuredPlayerId),
            eq(depthCharts.teamCode, team),
            eq(depthCharts.position, position),
            eq(depthCharts.isActive, true),
          ))
          .orderBy(
            desc(depthCharts.season),
            desc(depthCharts.week),
            desc(depthCharts.effectiveDate),
          )
          .limit(1)
      : [];

    const injuredDepthOrder = depth[0]?.depthOrder ?? null;
    const depthSnapshotCondition = depth[0]
      ? and(
          eq(depthCharts.season, depth[0].season),
          depth[0].week === null
            ? isNull(depthCharts.week)
            : eq(depthCharts.week, depth[0].week),
        )
      : undefined;

    const beneficiaryRows =
      team && position && injuredDepthOrder !== null && depthSnapshotCondition
        ? await db
            .select({
              canonicalId: depthCharts.canonicalPlayerId,
              fullName: playerIdentityMap.fullName,
              teamCode: depthCharts.teamCode,
              position: depthCharts.position,
              depthOrder: depthCharts.depthOrder,
              source: depthCharts.source,
              confidence: depthCharts.confidence,
              effectiveDate: depthCharts.effectiveDate,
            })
            .from(depthCharts)
            .innerJoin(
              playerIdentityMap,
              eq(depthCharts.canonicalPlayerId, playerIdentityMap.canonicalId),
            )
            .leftJoin(
              playerLiveStatus,
              eq(depthCharts.canonicalPlayerId, playerLiveStatus.canonicalId),
            )
            .where(and(
              eq(depthCharts.teamCode, team),
              eq(depthCharts.position, position),
              eq(depthCharts.isActive, true),
              depthSnapshotCondition,
              gt(depthCharts.depthOrder, injuredDepthOrder),
              sql`(${playerLiveStatus.isEligibleForForge} = true OR ${playerLiveStatus.isEligibleForForge} IS NULL)`,
            ))
            .orderBy(depthCharts.depthOrder)
            .limit(3)
        : [];

    const candidates: OpportunityResegmentationCandidate[] = beneficiaryRows.map(row => ({
      playerId: row.canonicalId,
      playerName: row.fullName || 'Unknown',
      team: row.teamCode,
      position: row.position,
      depthOrder: row.depthOrder,
      depthSource: String(row.source),
      depthConfidence: row.confidence ?? null,
      effectiveDate: row.effectiveDate.toISOString(),
    }));

    return buildOpportunityResegmentationRequest(
      event,
      {
        playerId: injuredPlayerId,
        playerName: player.fullName || event.headline || injuredPlayerId,
        team,
        position,
        depthOrder: injuredDepthOrder,
      },
      candidates,
      asOf,
    );
  }

  async planFromNewsInjuryEvents(
    events: NewsEvidenceEvent[],
    asOf: string = new Date().toISOString(),
  ): Promise<OpportunityResegmentationRequest[]> {
    const eligible = events.filter(
      event => event.family === 'INJURY' && shouldTriggerCcfReevaluation(event),
    );

    const planned = await Promise.all(
      eligible.map(event => this.planFromNewsInjuryEvent(event, asOf)),
    );

    return planned.filter(
      (request): request is OpportunityResegmentationRequest => request !== null,
    );
  }

  async getOpportunityShifts(): Promise<NextManUpResult> {
    try {
      const injuredStarters = await db
        .select({
          canonicalId: playerLiveStatus.canonicalId,
          fullName: playerIdentityMap.fullName,
          team: playerLiveStatus.currentTeam,
          position: playerIdentityMap.position,
          injuryStatus: playerLiveStatus.injuryStatus,
          depthOrder: depthCharts.depthOrder,
        })
        .from(playerLiveStatus)
        .innerJoin(playerIdentityMap, eq(playerLiveStatus.canonicalId, playerIdentityMap.canonicalId))
        .leftJoin(depthCharts, and(
          eq(playerLiveStatus.canonicalId, depthCharts.canonicalPlayerId),
          eq(playerLiveStatus.currentTeam, depthCharts.teamCode)
        ))
        .where(and(
          inArray(playerLiveStatus.injuryStatus, ['Out', 'IR']),
          inArray(playerIdentityMap.position, ['QB', 'RB', 'WR', 'TE']),
          sql`${playerLiveStatus.currentTeam} IS NOT NULL`
        ));

      const shifts: OpportunityShift[] = [];

      for (const injured of injuredStarters) {
        if (!injured.team || !injured.position) continue;

        shifts.push({
          type: 'losing',
          playerId: injured.canonicalId,
          playerName: injured.fullName || 'Unknown',
          team: injured.team,
          position: injured.position,
          depthOrder: injured.depthOrder || 1,
          reason: `${injured.injuryStatus} - missing games`,
          relatedPlayer: null,
        });

        const injuredDepthOrder = injured.depthOrder || 1;
        
        if (injuredDepthOrder <= 2) {
          const nextUp = await db
            .select({
              canonicalId: depthCharts.canonicalPlayerId,
              fullName: playerIdentityMap.fullName,
              position: depthCharts.position,
              depthOrder: depthCharts.depthOrder,
            })
            .from(depthCharts)
            .innerJoin(playerIdentityMap, eq(depthCharts.canonicalPlayerId, playerIdentityMap.canonicalId))
            .leftJoin(playerLiveStatus, eq(depthCharts.canonicalPlayerId, playerLiveStatus.canonicalId))
            .where(and(
              eq(depthCharts.teamCode, injured.team),
              eq(depthCharts.position, injured.position),
              gt(depthCharts.depthOrder, injuredDepthOrder),
              sql`(${playerLiveStatus.isEligibleForForge} = true OR ${playerLiveStatus.isEligibleForForge} IS NULL)`
            ))
            .orderBy(depthCharts.depthOrder)
            .limit(1);

          if (nextUp.length > 0) {
            const beneficiary = nextUp[0];
            shifts.push({
              type: 'gaining',
              playerId: beneficiary.canonicalId,
              playerName: beneficiary.fullName || 'Unknown',
              team: injured.team,
              position: beneficiary.position,
              depthOrder: beneficiary.depthOrder,
              reason: `Moving up - ${injured.fullName} is ${injured.injuryStatus}`,
              relatedPlayer: {
                playerId: injured.canonicalId,
                playerName: injured.fullName || 'Unknown',
                injuryStatus: injured.injuryStatus || 'Out',
                depthOrder: injuredDepthOrder,
              },
            });
          }
        }
      }

      const uniqueShifts = this.deduplicateShifts(shifts);

      return {
        success: true,
        shifts: uniqueShifts,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[NextManUp] Error getting opportunity shifts:', error);
      return {
        success: false,
        shifts: [],
        generatedAt: new Date().toISOString(),
      };
    }
  }

  private deduplicateShifts(shifts: OpportunityShift[]): OpportunityShift[] {
    const seen = new Set<string>();
    return shifts.filter(shift => {
      const key = `${shift.type}-${shift.playerId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async getShiftForPlayer(canonicalId: string): Promise<OpportunityShift | null> {
    const result = await this.getOpportunityShifts();
    return result.shifts.find(s => s.playerId === canonicalId) || null;
  }
}

export const nextManUpService = new NextManUpService();

/**
 * Injury & Usage Data Client
 * Addressing Grok's nfl-data-py gap with Node.js alternatives
 */

import axios from 'axios';
import {
  NflverseInjuryBuildOptions,
  buildNflverseInjuryCheck,
  nflverseInjuryClient,
} from './nflverseInjuryClient';

export interface InjuryStatus {
  playerId: string;
  playerName: string;
  team: string;
  status: 'Q' | 'D' | 'O' | 'IR' | 'Healthy';
  description?: string;
  expectedReturn?: string;
  lastUpdated: Date;
}

export interface DepthChartPosition {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  depthRank: number; // 1 = starter, 2 = backup, etc.
  lastUpdated: Date;
}

export interface UsageStats {
  playerId: string;
  week: number;
  season: number;
  snapPct: number;
  routes?: number;
  targets?: number;
  carries?: number;
  touches?: number;
}

// ========================================
// INJURY DATA SOURCES (Grok's Alternatives)
// ========================================

/**
 * SportsDataIO Injury Client
 * Grok's recommendation: "SportsDataIO's API (paid but robust for historical depth charts)"
 */
export class SportsDataIOClient {
  private readonly API_KEY = process.env.SPORTSDATA_API_KEY;
  private readonly API_BASE = 'https://api.sportsdata.io/v3/nfl';
  
  async getInjuries(week?: number): Promise<InjuryStatus[]> {
    if (!this.API_KEY) {
      console.warn('SportsDataIO API key not configured');
      return [];
    }
    
    try {
      const endpoint = week 
        ? `/injuries/${new Date().getFullYear()}/${week}`
        : `/injuries`;
        
      const response = await axios.get(`${this.API_BASE}${endpoint}`, {
        params: { key: this.API_KEY },
        timeout: 10000
      });
      
      return response.data.map((injury: any) => ({
        playerId: injury.PlayerID,
        playerName: injury.Name,
        team: injury.Team,
        status: this.mapInjuryStatus(injury.Status),
        description: injury.InjuryDescription,
        expectedReturn: injury.ExpectedReturn,
        lastUpdated: new Date(injury.Updated)
      }));
      
    } catch (error) {
      console.error('SportsDataIO injury fetch failed:', error);
      return [];
    }
  }
  
  async getDepthChart(team: string): Promise<DepthChartPosition[]> {
    if (!this.API_KEY) return [];
    
    try {
      const response = await axios.get(`${this.API_BASE}/depthcharts/${team}`, {
        params: { key: this.API_KEY },
        timeout: 10000
      });
      
      return response.data.flatMap((pos: any) => 
        pos.DepthCharts?.map((player: any, index: number) => ({
          playerId: player.PlayerID,
          playerName: player.Name,
          team: team,
          position: pos.Position,
          depthRank: index + 1,
          lastUpdated: new Date()
        })) || []
      );
      
    } catch (error) {
      console.error('SportsDataIO depth chart fetch failed:', error);
      return [];
    }
  }
  
  private mapInjuryStatus(status: string): InjuryStatus['status'] {
    const normalized = status?.toLowerCase();
    if (normalized?.includes('questionable')) return 'Q';
    if (normalized?.includes('doubtful')) return 'D';
    if (normalized?.includes('out')) return 'O';
    if (normalized?.includes('ir') || normalized?.includes('injured reserve')) return 'IR';
    return 'Healthy';
  }
}

/**
 * MySportsFeeds Client  
 * For injury reports and roster automation (already mentioned in replit.md)
 */
export class MySportsFeedsClient {
  private readonly API_KEY = process.env.MYSPORTSFEEDS_API_KEY;
  private readonly API_BASE = 'https://api.mysportsfeeds.com/v2.1/pull/nfl';
  
  async getInjuries(season: number, week?: number): Promise<InjuryStatus[]> {
    if (!this.API_KEY) {
      console.warn('MySportsFeeds API key not configured');
      return [];
    }
    
    try {
      const endpoint = week 
        ? `/current/week/${week}/injuries.json`
        : `/current/injuries.json`;
        
      const response = await axios.get(`${this.API_BASE}/${season}/regular${endpoint}`, {
        auth: {
          username: this.API_KEY,
          password: 'MYSPORTSFEEDS'
        },
        timeout: 10000
      });
      
      return response.data.injuries?.map((injury: any) => ({
        playerId: injury.player.id,
        playerName: `${injury.player.firstName} ${injury.player.lastName}`,
        team: injury.player.currentTeam?.abbreviation,
        status: this.mapInjuryStatus(injury.injuryStatus),
        description: injury.injuryDescription,
        lastUpdated: new Date(injury.asOf)
      })) || [];
      
    } catch (error) {
      console.error('MySportsFeeds injury fetch failed:', error);
      return [];
    }
  }
  
  private mapInjuryStatus(status: string): InjuryStatus['status'] {
    switch (status?.toUpperCase()) {
      case 'QUESTIONABLE': return 'Q';
      case 'DOUBTFUL': return 'D';
      case 'OUT': return 'O';
      case 'INJURED_RESERVE': return 'IR';
      default: return 'Healthy';
    }
  }
}

/**
 * Sleeper Enhanced Client
 * Leveraging existing Sleeper sync for usage data
 */
export class SleeperUsageClient {
  private readonly API_BASE = 'https://api.sleeper.app/v1';
  
  async getWeeklyUsage(season: number, week: number): Promise<UsageStats[]> {
    try {
      // Use Sleeper's player stats endpoint
      const response = await axios.get(`${this.API_BASE}/stats/nfl/regular/${season}/${week}`, {
        timeout: 10000
      });
      
      const stats = response.data;
      const usageStats: UsageStats[] = [];
      
      for (const [playerId, playerStats] of Object.entries(stats as Record<string, any>)) {
        if (!playerStats) continue;
        
        // Calculate snap percentage (if available)
        const snapPct = this.calculateSnapPercentage(playerStats);
        
        usageStats.push({
          playerId,
          week,
          season,
          snapPct,
          routes: playerStats.routes_run,
          targets: playerStats.rec_tgt,
          carries: playerStats.rush_att,
          touches: (playerStats.rec_tgt || 0) + (playerStats.rush_att || 0)
        });
      }
      
      return usageStats;
      
    } catch (error) {
      console.error('Sleeper usage fetch failed:', error);
      return [];
    }
  }
  
  private calculateSnapPercentage(stats: any): number {
    // Sleeper doesn't directly provide snap %, estimate from usage
    const touches = (stats.rec_tgt || 0) + (stats.rush_att || 0);
    const fantasyPoints = stats.pts_ppr || 0;
    
    // Simple estimation based on touches and fantasy points
    // This is approximate - real snap % would need specialized data source
    if (touches >= 20) return 80;
    if (touches >= 15) return 65;
    if (touches >= 10) return 50;
    if (touches >= 5) return 35;
    return 20;
  }
}

// ========================================
// OPPORTUNITY DETECTION SERVICE
// ========================================

/**
 * Opportunity Detection Service
 * Combines injury and depth chart data to detect opportunities
 */
export class OpportunityDetectionService {
  private sportsDataIO = new SportsDataIOClient();
  private mySportsFeeds = new MySportsFeedsClient();
  private sleeperUsage = new SleeperUsageClient();
  
  async detectOpportunities(playerId: string, playerTeam: string): Promise<{
    injuryOpening: boolean;
    depthChartMovement: number;
    opportunityScore: number;
  }> {
    try {
      // Get current injuries for team
      const injuries = await this.sportsDataIO.getInjuries();
      const teamInjuries = injuries.filter(inj => inj.team === playerTeam);
      
      // Get depth chart
      const depthChart = await this.sportsDataIO.getDepthChart(playerTeam);
      const playerDepth = depthChart.find(dc => dc.playerId === playerId);
      
      // Detect injury openings
      const injuryOpening = teamInjuries.some(inj => 
        inj.status !== 'Healthy' && 
        depthChart.some(dc => 
          dc.playerId === inj.playerId && 
          dc.depthRank < (playerDepth?.depthRank || 99)
        )
      );
      
      // Calculate depth chart movement (simplified)
      const depthChartMovement = injuryOpening ? 1 : 0;
      
      // Calculate opportunity score
      const opportunityScore = this.calculateOpportunityScore(
        injuryOpening,
        depthChartMovement,
        playerDepth?.depthRank || 5
      );
      
      return {
        injuryOpening,
        depthChartMovement,
        opportunityScore
      };
      
    } catch (error) {
      console.error('Opportunity detection failed:', error);
      return {
        injuryOpening: false,
        depthChartMovement: 0,
        opportunityScore: 0
      };
    }
  }
  
  private calculateOpportunityScore(
    injuryOpening: boolean, 
    depthMovement: number, 
    currentDepth: number
  ): number {
    let score = 0;
    
    // Injury opening bonus
    if (injuryOpening) score += 0.6;
    
    // Depth chart position impact
    if (currentDepth === 1) score += 0.3; // Already starter
    if (currentDepth === 2) score += 0.4; // First backup
    if (currentDepth === 3) score += 0.2; // Second backup
    
    // Movement bonus
    score += depthMovement * 0.2;
    
    return Math.min(1.0, score); // Cap at 1.0
  }
}

// ========================================
// STRUCTURED INJURY INTELLIGENCE (NEWS-001)
// ========================================

/**
 * Canonical structured injury refresh surface.
 *
 * This keeps injury-source ownership in injuryClient.ts. nflverse is a source
 * adapter; SportsDataIO/MySportsFeeds remain optional legacy/challenger
 * adapters. NEWS-001 consumers should use this service rather than reaching
 * directly into an individual provider.
 */
export class StructuredInjuryIntelligenceService {
  async getStructuredCheck(
    season: number,
    options: NflverseInjuryBuildOptions = {},
  ) {
    const retrievedAt = options.asOf ?? new Date().toISOString();
    const fetched = await nflverseInjuryClient.fetchSeason(season, retrievedAt);

    if (fetched.state === 'ERROR') {
      return buildNflverseInjuryCheck(fetched, options);
    }

    const targetWeek =
      options.week ??
      fetched.rows.reduce<number | undefined>((max, row) => {
        const week = Number(row.week);
        if (!Number.isInteger(week) || week <= 0) return max;
        return max === undefined || week > max ? week : max;
      }, undefined);

    const gsisIds = Array.from(
      new Set(
        fetched.rows
          .filter(row => !targetWeek || Number(row.week) === targetWeek)
          .map(row => row.gsis_id?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const { playerIdentityService } = await import('../services/PlayerIdentityService');
    const identityResolution =
      await playerIdentityService.resolveCanonicalIdsByGsis(gsisIds);

    return buildNflverseInjuryCheck(fetched, {
      ...options,
      asOf: retrievedAt,
      week: targetWeek,
      identityResolution,
    });
  }
}

// ========================================
// EXPORT MAIN INJURY/USAGE CLIENT
// ========================================

export const injuryClient = {
  sportsDataIO: new SportsDataIOClient(),
  mySportsFeeds: new MySportsFeedsClient(),
  sleeperUsage: new SleeperUsageClient(),
  opportunityDetection: new OpportunityDetectionService(),
  intelligence: new StructuredInjuryIntelligenceService()
};

export default injuryClient;
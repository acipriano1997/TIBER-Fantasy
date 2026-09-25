/**
 * News Client - Addressing Grok's API availability gaps
 * Uses RSS feeds instead of unavailable APIs
 */

import Parser from 'rss-parser';
import type { OpportunityResegmentationRequest } from '../services/nextManUpService';
import { cacheKey, getCache, setCache } from '../../src/data/cache';
import { calculateNewsWeight } from '../services/waiverHeat';
import {
  BuildNewsCheckOptions,
  DEFAULT_NEWS_CADENCE_MINUTES,
  NewsCadenceState,
  NewsEvidenceEvent,
  buildNewsIntelligenceCheck,
  composeNewsIntelligenceRefresh,
  newsTextObservationToEvent,
} from './newsIntelligence';
import type { NflverseInjuryBuildOptions } from './nflverseInjuryClient';
import { injuryClient } from './injuryClient';
import {
  BuildTeamTrendOptions,
  buildNflverseTeamTrendCheck,
  nflverseTeamTrendClient,
} from './nflverseTeamTrendClient';

const parser = new Parser();

export interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  author?: string;
  playerMentioned?: string;
  sourceId?: string;
}

export interface NewsWeight {
  coachQuotes: number;
  beatReports: number;
  roleClarity: number;
  corroborationGames: number;
}

export interface NewsFetchResult {
  items: NewsItem[];
  state: 'CURRENT' | 'PARTIAL' | 'ERROR';
}


export interface StructuredNewsRefreshResult {
  schemaVersion: 'news-check-v0';
  asOf: string;
  lanes: ReturnType<typeof buildNewsIntelligenceCheck>['lanes'];
  sources: ReturnType<typeof buildNewsIntelligenceCheck>['sources'];
  events: NewsEvidenceEvent[];
  opportunityResegmentationRequests: OpportunityResegmentationRequest[];
  refreshMeta: {
    cadenceState: NewsCadenceState;
    forced: boolean;
  };
}

// ========================================
// RSS NEWS SOURCES (Grok's Realistic Alternative)
// ========================================

/**
 * Rotoworld/NBC Sports RSS Feed Client
 * Grok's recommendation: "Rotoworld RSS for blurbs (easy ingestion, coach-heavy)"
 */
export class RotoworldNewsClient {
  private readonly RSS_FEEDS = {
    nfl: 'https://www.rotoworld.com/rss/feed/football/news/nfl',
    rookies: 'https://www.rotoworld.com/rss/feed/football/rookies',
    waiver: 'https://www.rotoworld.com/rss/feed/football/waivers'
  };

  async getPlayerNewsWithState(
    playerName: string,
    days: number = 7,
  ): Promise<NewsFetchResult> {
    const allNews: NewsItem[] = [];
    let successfulFeeds = 0;
    let failedFeeds = 0;

    for (const [feedType, feedUrl] of Object.entries(this.RSS_FEEDS)) {
      try {
        const feed = await parser.parseURL(feedUrl);
        successfulFeeds++;
        const recentNews = this.filterPlayerNews(feed.items, playerName, days);
        allNews.push(...recentNews);
      } catch (error) {
        failedFeeds++;
        console.error(`Failed to fetch ${feedType} feed:`, error);
      }
    }

    const items = allNews.sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
    );

    if (successfulFeeds === 0) return { items, state: 'ERROR' };
    if (failedFeeds > 0) return { items, state: 'PARTIAL' };
    return { items, state: 'CURRENT' };
  }

  async getPlayerNews(playerName: string, days: number = 7): Promise<NewsItem[]> {
    return (await this.getPlayerNewsWithState(playerName, days)).items;
  }

  private filterPlayerNews(items: any[], playerName: string, days: number): NewsItem[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return items
      .filter(item => {
        const itemDate = new Date(item.pubDate);
        const mentionsPlayer = this.mentionsPlayer(item.title + ' ' + item.contentSnippet, playerName);
        return itemDate >= cutoffDate && mentionsPlayer;
      })
      .map(item => ({
        title: item.title,
        description: item.contentSnippet || item.description,
        link: item.link,
        pubDate: item.pubDate,
        author: item.creator,
        playerMentioned: playerName,
        sourceId: 'rotoworld-rss'
      }));
  }

  private mentionsPlayer(text: string, playerName: string): boolean {
    const normalizedText = text.toLowerCase();
    const normalizedPlayer = playerName.toLowerCase();
    
    // Handle common name variations
    const nameParts = normalizedPlayer.split(' ');
    return nameParts.every(part => normalizedText.includes(part));
  }
}

/**
 * RotoBaller News Client
 * Grok's backup: "RotoBaller's free XML/JSON news feeds as a backup"
 */
export class RotoBallerNewsClient {
  private readonly API_BASE = 'https://www.rotoballer.com/rss';
  
  async getPlayerNewsWithState(playerName: string): Promise<NewsFetchResult> {
    try {
      const feedUrl = `${this.API_BASE}/nfl-news.xml`;
      const feed = await parser.parseURL(feedUrl);
      return {
        items: this.filterPlayerNews(feed.items, playerName, 7),
        state: 'CURRENT',
      };
    } catch (error) {
      console.error('RotoBaller news fetch failed:', error);
      return { items: [], state: 'ERROR' };
    }
  }

  async getPlayerNews(playerName: string): Promise<NewsItem[]> {
    return (await this.getPlayerNewsWithState(playerName)).items;
  }
  
  private filterPlayerNews(items: any[], playerName: string, days: number): NewsItem[] {
    // Similar filtering logic as Rotoworld
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return items
      .filter(item => {
        const itemDate = new Date(item.pubDate);
        const mentionsPlayer = this.mentionsPlayer(item.title + ' ' + item.description, playerName);
        return itemDate >= cutoffDate && mentionsPlayer;
      })
      .map(item => ({
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: item.pubDate,
        playerMentioned: playerName,
        sourceId: 'rotoballer-rss'
      }));
  }
  
  private mentionsPlayer(text: string, playerName: string): boolean {
    const normalizedText = text.toLowerCase();
    const normalizedPlayer = playerName.toLowerCase();
    const nameParts = normalizedPlayer.split(' ');
    return nameParts.every(part => normalizedText.includes(part));
  }
}

// ========================================
// NEWS WEIGHT CALCULATION SERVICE
// ========================================

/**
 * News Analysis Service - Extract signals from RSS feeds
 */
export class NewsAnalysisService {
  private rotoworldClient = new RotoworldNewsClient();
  private rotoballerClient = new RotoBallerNewsClient();

  /**
   * NEWS-001 structured check surface.
   *
   * Source adapters may continue to collect raw/RSS items, but decision-facing
   * consumers should receive explicit OFF_TREND, DEF_TREND, and INJURY lane
   * state rather than treating a coarse sentiment score as evidence authority.
   */
  buildStructuredCheck(
    events: NewsEvidenceEvent[],
    options: BuildNewsCheckOptions = {},
  ) {
    return buildNewsIntelligenceCheck(events, options);
  }

  /**
   * Safe bridge from the existing RSS collectors into NEWS-001.
   *
   * Text-derived events are RAW/M1 observations only. They are useful for
   * capture, digesting, and later corroboration, but cannot request CCF
   * reevaluation until a certified promotion path upgrades record quality.
   * Because these feeds do not prove complete league-wide trend coverage,
   * all three required lanes remain explicitly PARTIAL.
   */
  async getStructuredPlayerNewsCheck(
    playerName: string,
    playerId?: string,
    options: BuildNewsCheckOptions = {},
  ) {
    const retrievedAt = options.asOf ?? new Date().toISOString();
    const [rotoworldResult, rotoballerResult] = await Promise.all([
      this.rotoworldClient.getPlayerNewsWithState(playerName),
      this.rotoballerClient.getPlayerNewsWithState(playerName),
    ]);

    const events = [...rotoworldResult.items, ...rotoballerResult.items].map(item =>
      newsTextObservationToEvent(
        {
          sourceId: item.sourceId ?? 'legacy-rss',
          sourceClass: 'fantasy-news-rss',
          sourceRole: 'secondary',
          title: item.title,
          description: item.description,
          link: item.link,
          pubDate: item.pubDate,
          author: item.author,
          playerIds: playerId ? [playerId] : undefined,
        },
        retrievedAt,
      ),
    );

    const bothFailed =
      rotoworldResult.state === 'ERROR' && rotoballerResult.state === 'ERROR';

    return buildNewsIntelligenceCheck(events, {
      ...options,
      asOf: retrievedAt,
      sourceStates: [
        {
          sourceId: 'rotoworld-rss',
          state:
            rotoworldResult.state === 'ERROR'
              ? 'ERROR'
              : rotoworldResult.state === 'PARTIAL'
                ? 'PARTIAL'
                : 'CURRENT',
          checkedAt: retrievedAt,
          itemCount: rotoworldResult.items.length,
        },
        {
          sourceId: 'rotoballer-rss',
          state:
            rotoballerResult.state === 'ERROR'
              ? 'ERROR'
              : rotoballerResult.state === 'PARTIAL'
                ? 'PARTIAL'
                : 'CURRENT',
          checkedAt: retrievedAt,
          itemCount: rotoballerResult.items.length,
        },
        ...(options.sourceStates ?? []),
      ],
      laneStatuses: {
        OFF_TREND: bothFailed ? 'ERROR' : 'PARTIAL',
        DEF_TREND: bothFailed ? 'ERROR' : 'PARTIAL',
        INJURY: bothFailed ? 'ERROR' : 'PARTIAL',
        ...options.laneStatuses,
      },
    });
  }
  
  /**
   * Compatibility wrapper. Injury truth remains owned by injuryClient.ts;
   * News Intelligence consumes its structured surface rather than implementing
   * a second provider/identity path.
   */
  async getNflverseInjuryCheck(
    season: number,
    options: NflverseInjuryBuildOptions = {},
  ) {
    return injuryClient.intelligence.getStructuredCheck(season, options);
  }

  /**
   * Canonical NEWS-001 refresh surface for the required injury/offense/defense
   * checks. Optional player RSS adds contextual events but does not own lane
   * completeness or source authority.
   */
  async getStructuredNewsRefresh(args: {
    season: number;
    week?: number;
    asOf?: string;
    playerName?: string;
    playerId?: string;
    cadenceState?: NewsCadenceState;
    forceRefresh?: boolean;
  }): Promise<StructuredNewsRefreshResult> {
    const cadenceState = args.cadenceState ?? 'HOT';
    const useCache = !args.forceRefresh && !args.asOf;
    const key = cacheKey([
      'news-intelligence-refresh-v0',
      args.season,
      args.week,
      args.playerId,
      args.playerName,
      cadenceState,
    ]);

    if (useCache) {
      const cached = getCache<StructuredNewsRefreshResult>(key);
      if (cached) return cached;
    }

    const asOf = args.asOf ?? new Date().toISOString();

    const [injury, trends, supplementalPlayer] = await Promise.all([
      this.getNflverseInjuryCheck(args.season, {
        asOf,
        week: args.week,
      }),
      this.getNflverseTeamTrendCheck(args.season, {
        asOf,
        targetWeek: args.week,
      }),
      args.playerName
        ? this.getStructuredPlayerNewsCheck(
            args.playerName,
            args.playerId,
            { asOf },
          )
        : Promise.resolve(null),
    ]);

    const check = composeNewsIntelligenceRefresh({
      injury,
      trends,
      supplemental: supplementalPlayer ? [supplementalPlayer] : [],
      asOf,
    });

    const { nextManUpService } = await import('../services/nextManUpService');
    const opportunityResegmentationRequests =
      await nextManUpService.planFromNewsInjuryEvents(check.events, asOf);

    const result = {
      ...check,
      opportunityResegmentationRequests,
      refreshMeta: {
        cadenceState,
        forced: Boolean(args.forceRefresh),
      },
    };

    if (useCache) {
      const ttlMinutes =
        cadenceState === 'LIVE'
          ? 1
          : DEFAULT_NEWS_CADENCE_MINUTES[cadenceState];
      setCache(key, result, ttlMinutes * 60_000);
    }

    return result;
  }

  /**
   * NEWS-001 measured league/team trend refresh. This consumes nflverse weekly
   * team stats and intentionally emits NORMALIZED/M1 trend observations only;
   * threshold calibration must be certified before direct CCF reevaluation.
   */
  async getNflverseTeamTrendCheck(
    season: number,
    options: BuildTeamTrendOptions = {},
  ) {
    const retrievedAt = options.asOf ?? new Date().toISOString();
    const fetched = await nflverseTeamTrendClient.fetchSeason(season, retrievedAt);
    return buildNflverseTeamTrendCheck(fetched, season, {
      ...options,
      asOf: retrievedAt,
    });
  }

  async calculatePlayerNewsWeight(playerName: string): Promise<number> {
    try {
      // Get news from both sources
      const [rotoworldNews, rotoballerNews] = await Promise.all([
        this.rotoworldClient.getPlayerNews(playerName),
        this.rotoballerClient.getPlayerNews(playerName)
      ]);
      
      const allNews = [...rotoworldNews, ...rotoballerNews];
      
      // Analyze news content for signals
      const newsContext = this.analyzeNewsContent(allNews);
      
      // Use Waiver Heat service to calculate weight
      return calculateNewsWeight(newsContext);
      
    } catch (error) {
      console.error('News weight calculation failed:', error);
      return 0;
    }
  }
  
  private analyzeNewsContent(news: NewsItem[]): NewsWeight {
    let coachQuotes = 0;
    let beatReports = 0;
    let roleClarity = 0;
    let corroborationGames = 0;
    
    news.forEach(item => {
      const content = (item.title + ' ' + item.description).toLowerCase();
      
      // Coach quote detection
      if (this.containsCoachQuote(content)) {
        coachQuotes++;
      }
      
      // Beat report detection  
      if (this.isBeatReport(content, item.author)) {
        beatReports++;
      }
      
      // Role clarity indicators
      roleClarity += this.assessRoleClarity(content);
      
      // Game corroboration
      if (this.mentionsGamePerformance(content)) {
        corroborationGames++;
      }
    });
    
    return {
      coachQuotes: Math.min(coachQuotes, 5), // Cap at 5 mentions
      beatReports: Math.min(beatReports, 3), // Cap at 3 reports
      roleClarity: Math.min(roleClarity / news.length, 1), // Average clarity (0-1)
      corroborationGames: Math.min(corroborationGames, 3) // Cap at 3 games
    };
  }
  
  private containsCoachQuote(content: string): boolean {
    const coachIndicators = [
      'coach says', 'coach mentioned', 'according to coach',
      'coach told', 'coach expects', 'coach believes',
      'head coach', 'offensive coordinator'
    ];
    
    return coachIndicators.some(indicator => content.includes(indicator));
  }
  
  private isBeatReport(content: string, author?: string): boolean {
    const beatIndicators = [
      'beat reporter', 'team reporter', 'insider',
      'sources say', 'according to sources'
    ];
    
    const authorIndicators = author ? [
      'beat', 'reporter', 'insider', 'correspondent'
    ] : [];
    
    return beatIndicators.some(indicator => content.includes(indicator)) ||
           authorIndicators.some(indicator => author!.toLowerCase().includes(indicator));
  }
  
  private assessRoleClarity(content: string): number {
    const clarityIndicators = [
      'starting role', 'more snaps', 'increased role',
      'primary back', 'first option', 'leading receiver',
      'red zone', 'goal line', 'third down'
    ];
    
    const matches = clarityIndicators.filter(indicator => content.includes(indicator));
    return Math.min(matches.length * 0.2, 1); // Each match = 0.2 clarity
  }
  
  private mentionsGamePerformance(content: string): boolean {
    const performanceIndicators = [
      'yards', 'targets', 'carries', 'touchdowns',
      'snaps', 'routes', 'red zone', 'performance'
    ];
    
    return performanceIndicators.some(indicator => content.includes(indicator));
  }
}

// ========================================
// EXPORT MAIN NEWS CLIENT
// ========================================

export const newsClient = {
  rotoworld: new RotoworldNewsClient(),
  rotoballer: new RotoBallerNewsClient(),
  analysis: new NewsAnalysisService()
};

export default newsClient;
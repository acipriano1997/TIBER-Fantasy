/**
 * News Client - Addressing Grok's API availability gaps
 * Uses RSS feeds instead of unavailable APIs
 */

import Parser from 'rss-parser';
import { calculateNewsWeight } from '../services/waiverHeat';
import {
  BuildNewsCheckOptions,
  NewsEvidenceEvent,
  buildNewsIntelligenceCheck,
} from './newsIntelligence';

const parser = new Parser();

export interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  author?: string;
  playerMentioned?: string;
}

export interface NewsWeight {
  coachQuotes: number;
  beatReports: number;
  roleClarity: number;
  corroborationGames: number;
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

  async getPlayerNews(playerName: string, days: number = 7): Promise<NewsItem[]> {
    try {
      const allNews: NewsItem[] = [];
      
      // Fetch from multiple relevant feeds
      for (const [feedType, feedUrl] of Object.entries(this.RSS_FEEDS)) {
        try {
          const feed = await parser.parseURL(feedUrl);
          const recentNews = this.filterPlayerNews(feed.items, playerName, days);
          allNews.push(...recentNews);
        } catch (error) {
          console.error(`Failed to fetch ${feedType} feed:`, error);
        }
      }

      return allNews.sort((a, b) => 
        new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
      );
      
    } catch (error) {
      console.error('Rotoworld news fetch failed:', error);
      return [];
    }
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
        playerMentioned: playerName
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
  
  async getPlayerNews(playerName: string): Promise<NewsItem[]> {
    try {
      const feedUrl = `${this.API_BASE}/nfl-news.xml`;
      const feed = await parser.parseURL(feedUrl);
      
      return this.filterPlayerNews(feed.items, playerName, 7);
    } catch (error) {
      console.error('RotoBaller news fetch failed:', error);
      return [];
    }
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
        playerMentioned: playerName
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
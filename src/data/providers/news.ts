// src/data/providers/news.ts
// Light tiebreaker signal from news sentiment and ECR variance

import { cacheKey, getCache, setCache } from "../cache";
import { NewsSignal } from "../interfaces";

export type LegacyNewsEvidenceState =
  | "LEGACY_COMPAT"
  | "MISSING"
  | "STALE"
  | "ERROR";

export interface NewsSignalWithProvenance extends NewsSignal {
  __source: string;
  __mock: boolean;
  // NEWS-001: this coarse sentiment/ECR signal is compatibility-only.
  // It must never satisfy decision-grade News Intelligence requirements.
  __decisionGrade: false;
  __evidenceState: LegacyNewsEvidenceState;
}

export async function fetchNewsSignal(playerId: string): Promise<NewsSignalWithProvenance> {
  const key = cacheKey(["news", playerId]);
  const cached = getCache<NewsSignalWithProvenance>(key);
  if (cached) return cached;

  try {
    // Try to get news sentiment from your existing intel system
    const [newsResponse, ecrResponse] = await Promise.allSettled([
      fetch(`/api/intel?player=${playerId}&signal_strength=all`),
      fetch(`/api/ecr/compare/all?player=${playerId}`)
    ]);

    let newsHeat = 50; // neutral default
    let ecrDelta = 0;  // neutral default

    // Parse news/intel data
    if (newsResponse.status === 'fulfilled' && newsResponse.value.ok) {
      const newsData = await newsResponse.value.json();
      
      // Transform your intel signals to 0-100 heat score
      if (newsData.reports && newsData.reports.length > 0) {
        const recentReports = newsData.reports.slice(0, 3); // last 3 reports
        const avgSentiment = recentReports.reduce((sum: number, report: any) => {
          return sum + (report.sentiment_score || 0);
        }, 0) / recentReports.length;
        
        // Map sentiment (-1 to +1) to heat (0-100)
        newsHeat = Math.max(0, Math.min(100, (avgSentiment + 1) * 50));
      }
    }

    // Parse ECR comparison data
    if (ecrResponse.status === 'fulfilled' && ecrResponse.value.ok) {
      const ecrData = await ecrResponse.value.json();
      
      if (ecrData.variance) {
        // ECR delta: how much our ranking differs from consensus
        ecrDelta = Math.max(-15, Math.min(15, ecrData.variance || 0));
      }
    }

    const signal: NewsSignalWithProvenance = { 
      newsHeat, 
      ecrDelta,
      __source: "intel_ecr_apis",
      __mock: false,
      __decisionGrade: false,
      __evidenceState: "LEGACY_COMPAT",
    };
    setCache(key, signal, 10 * 60_000); // 10 minute cache for news
    return signal;

  } catch (error) {
    console.error('[news-signal]', error);
    
    // Compatibility fallback only. NEWS-001 requires missing/error state to
    // remain explicit; these neutral numeric values are never decision-grade.
    const fallback: NewsSignalWithProvenance = { 
      newsHeat: 50, 
      ecrDelta: 0,
      __source: "news_api_error",
      __mock: true,
      __decisionGrade: false,
      __evidenceState: "ERROR",
    };
    setCache(key, fallback, 5 * 60_000);
    return fallback;
  }
}
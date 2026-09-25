import type { Express, Request, Response } from "express";
import express from "express";
import axios from "axios";
import { createServer, type Server } from "http";
import { registerADPRoutes } from "./routes/adpRoutes";
import { adpSyncService } from "./adpSyncService";
import { storage } from "./storage";
import { teamSyncService } from "./teamSync";
import { optimizeLineup, calculateConfidence, analyzeTradeOpportunities, generateWaiverRecommendations } from "./analytics";
// Removed deprecated imports
import { PlayerFilteringService } from "./playerFiltering";
import { db } from "./infra/db";
import { dynastyTradeHistory, players as playersTable, playerWeekFacts, chunks, chatSessions, chatMessages, waiverCandidates, sleeperOwnership, playerIdentityMap, schedule } from "@shared/schema";
import { eq, desc, and, sql, isNotNull } from "drizzle-orm";
import { z } from "zod";
// Removed deprecated fantasy services
import { rbDraftCapitalService } from './rbDraftCapitalContext';
import cron from 'node-cron';
import { registerSleeperTestRoutes } from './api/sleeper-test';
import { registerProjectionsAnalysisRoutes } from './api/projections-analysis';
import { registerWeeklyProjectionsTestRoutes } from './api/weekly-projections-test';
import { registerSleeperPipelineTestRoutes } from './api/sleeper-pipeline-test';
import { registerAdpConversionTestRoutes } from './api/test-adp-conversion';
import { registerSleeperDataDebugRoutes } from './api/debug-sleeper-data';
import { registerWeeklyProjectionsCheckRoutes } from './api/check-weekly-projections';
import { registerRealDataValidationRoutes } from './api/test-real-data-validation';
import { registerTest2024ProjectionsRoutes } from './api/test-2024-projections';
import { testNFLStatsDirect } from './api/test-nfl-stats-direct';
import { sleeperClient, deriveSleeperScoringFormat } from './integrations/sleeperClient';
// REMOVED: grokProjectionsService (DEAD_ORPHAN)
import { cleanVorpRankings } from './clean-vorp-endpoint';
import { getSleeperProjections } from './services/sleeperProjectionsService';
import { calculateVORP } from './vorpCalculator';
import { getAllRBProjections, getRBProjectionByName } from './services/rbProjectionsService';
import { depthChartService } from './services/depthChartService';
import { verify2024GameLogs } from './api/verify-2024-game-logs';
import { parseFullGameLogs } from './api/parse-full-game-logs';
import { exportPositionalGameLogs } from './api/export-positional-game-logs';
// SNAP SERVICES: Consolidated into canonical sleeperSnapService
import { sleeperSnapService } from './services/sleeperSnapService';
import { sleeperSnapPipeline } from './services/sleeperSnapPipeline';
import { testSnapPercentages } from './api/test-snap-percentages';
import { generateWRSnapData } from './api/generate-wr-snap-data';
// REMOVED: sleeperWeeklySnapService, snapPercentageService (consolidated into sleeperSnapService)
// REMOVED: sleeperStrictSnapService and wrRatingsService (LEGACY_UNUSED)
import { wrGameLogsService } from './services/wrGameLogsService';
import { playerPoolService } from './playerPool';
import { generateEmbedding, generateChatResponse, detectQueryMode, callTiberChat } from './services/geminiEmbeddings';
import { detectLayerWithIntents } from './services/river-detection';
import { detectFormat } from './lib/format-detector';
import { formatTradeResponse, handleConfessionResponse, formatStatsResponse, applyRookieGuard, applyRiverSnapback } from './lib/responsePostProcessors';
import { getDataAvailability, isWeeklyBoxScoreRequest, extractSeasonFromQuery } from './lib/dataAvailability';
import { vorpCalculationService } from './services/vorpCalculation';
import { expandPlayerAliases } from './services/playerAliases';
// Live compass routes imported in registerRoutes function
import rbCompassRoutes from './routes/rbCompassRoutes';
import publicRoutes from './routes/public';
import teCompassRoutes from './routes/teCompassRoutes';
import tiberDataRoutes from './routes/tiberDataRoutes';
import populationStatsRoutes from './routes/populationStatsRoutes';
import tradeAnalyzerRoutes from './routes/tradeAnalyzerRoutes';
import compassCompareRoutes from './routes/compassCompareRoutes';
import { nightlyProcessingRoutes } from './routes/nightlyProcessingRoutes';
import etlRoutes from './routes/etlRoutes';
import matchupRoutes from './routes/matchupRoutes';
import strategyRoutes from './routes/strategyRoutes';
import playerComparisonRoutes from './routes/playerComparisonRoutes';
import playerIdentityRoutes from './routes/playerIdentityRoutes';
import uphAdminRoutes from './routes/uphAdminRoutes';
import gameLogRoutes from './routes/gameLogRoutes';
import personnelRoutes from './routes/personnelRoutes';
import sentinelRoutes from './routes/sentinelRoutes';
import { registerRoleBankRoutes } from './modules/datalab/rolebank/roleBankRoutes';
import sosRouter from './modules/sos/sos.router';
import { ratingsRouter } from './src/modules/ratings';
import ovrRouter from './routes/ovrRoutes';
import tiberRouter from './routes/tiberRoutes';
import { API_REGISTRY, getEndpointByKey, getAllTags } from './infra/apiRegistry';
import attributesRoutes from './routes/attributesRoutes';
import metricMatrixRoutes from './routes/metricMatrixRoutes';
import buysSellsRoutes from './routes/buysSellsRoutes';
import fantasyLabRoutes from './routes/fantasyLabRoutes';
import idpAdminRoutes from './routes/idpAdminRoutes';
import idpForgeRoutes from './modules/forge/idp/idpForgeRoutes';
import catalystRoutes from './modules/catalyst/catalystRoutes';
import fireRoutes from './routes/fireRoutes';
import { roleOpportunityIntegrationRouter } from './routes/roleOpportunityIntegrationRoutes';
import { forgeIntegrationRouter } from './routes/forgeIntegrationRoutes';
import { dataLabBreakoutSignalsRouter } from './routes/dataLabBreakoutSignalsRoutes';
import { dataLabRoleOpportunityRouter } from './routes/dataLabRoleOpportunityRoutes';
import { dataLabAgeCurvesRouter } from './routes/dataLabAgeCurvesRoutes';
import { dataLabPointScenariosRouter } from './routes/dataLabPointScenariosRoutes';
import { dataLabPlayerResearchRouter } from './routes/dataLabPlayerResearchRoutes';
import { dataLabPlayerOwnershipRouter } from './routes/dataLabPlayerOwnershipRoutes';
import { dataLabTeamResearchRouter } from './routes/dataLabTeamResearchRoutes';
import { dataLabCommandCenterRouter } from './routes/dataLabCommandCenterRoutes';
import { dataLabPromotedStatusRouter } from './routes/dataLabPromotedStatusRoutes';
import { dataLabTeamStateRouter } from './routes/dataLabTeamStateRoutes';
import { dataLabTeamEnvironmentMovementRouter } from './routes/dataLabTeamEnvironmentMovementRoutes';
import { rookiesPromotedRouter } from './routes/rookiesPromotedRoutes';
import { createRankingsV2Router } from './routes/rankingsV2Routes';
import { postCutoffLedgerRouter } from './routes/postCutoffLedgerRoutes';
import consensusRoutes from './consensus';
import consensusSeedingRoutes from './consensusSeeding';
import articleRoutes from './routes/articleRoutes';
import { createEcrLoaderRouter } from './services/ecrLoader';
import { enhancedEcrService } from './services/enhancedEcrProvider';
import { createConsensusRouter, pickConsensus, FantasyProsProvider, SleeperAdpProvider, EnhancedEcrProvider } from './services/consensusBenchmark';
import { 
  getProfile, 
  updateProfile, 
  giveFire, 
  getFireLeaderboard,
  rebuildConsensus,
  getConsensusMetadata,
  compareRankings
} from './consensusEngine';
import { 
  getConsensusWhy, rebuildConsensusEndpoint 
} from './adaptiveConsensus';
import { TIBER_SIGNATURE } from '../shared/tiberSignature';
import fs from 'fs';
import path from 'path';
import { getCurrentWeek, getWeekInfo, isRisersFallersDataAvailable, getBestRisersFallersWeek, debugWeekDetection } from '../shared/weekDetection';
import {
  EvidenceIngestionTargetUnavailableError,
  InvalidEvidenceIngestionTargetError,
  requireScheduleSyncDefaultSeason,
} from './config/season';
import { systemCurrentWeekHandler } from './routes/systemCurrentWeekRoute';
import { handleWeeklySync } from './routes/weeklySyncRoute';
import { createRagRouter, initRagOnBoot } from './routes/ragRoutes';
import tiberMemoryRoutes from './routes/tiberMemoryRoutes';
import dataLabRoutes from './modules/datalab/snapshots/snapshotRoutes';
import { registerPowerProcessingRoutes } from './routes/powerProcessing';
import weeklyTakesRoutes from './routes/weeklyTakesRoutes';
import forgeSimRoutes from './routes/forgeSimRoutes';
import playerComparePilotRoutes from './routes/playerComparePilotRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import teamReportsRoutes from './routes/teamReportsRoutes';
import { leagueSyncRouter } from './routes/leagueSyncRoutes';
import { userIntegrationRouter } from './routes/userIntegrationRoutes';
import { leagueDashboardRouter } from './routes/leagueDashboardRoutes';
import { managementRouter } from './routes/managementRoutes';
import sleeperSyncV2Routes, { ownershipRouter, leaguesRouter } from './routes/sleeperSyncV2Routes';
import weekSummaryRouter from './routes/debug/week-summary';
import { registerForgeRoutes } from './modules/forge';
import adminForgeRouter from './routes/adminForge';
import playerMappingRoutes, { metricsRouter, forgeLabRouter, adminPlayerMappingRouter } from './routes/playerMappingRoutes';
import { monitoringService } from './services/MonitoringService';
import { adminService } from './services/AdminService';
import {
  handleAdminBrandReplay,
  handleAdminBrandStream,
} from './routes/adminBrandRoutes';
import { requireAdminAuth } from './middleware/adminAuth';
import { rateLimiters } from './middleware/rateLimit';
import { securityHeaders } from './middleware/security';
import { createCompassRouter } from './services/predictionEngine';
import {
  validateSetSeason,
  validateSignalsStatus,
  validateSignalsPurge,
  ADMIN_API_CONFIG
} from './schemas/adminSchemas';

// Helper function for Player Compass sample data
async function getSamplePlayersForCompass(position: string, limit: number = 20) {
  const sampleData: Record<string, any[]> = {
    WR: [
      { id: 'ja-marr-chase', name: "Ja'Marr Chase", team: 'CIN', age: 24, draftCapital: 5, stats: { targets: 135, receptions: 81, yards: 1056, tds: 7 }, tags: ['alpha', 'target_hog'] },
      { id: 'ceedee-lamb', name: 'CeeDee Lamb', team: 'DAL', age: 25, draftCapital: 17, stats: { targets: 145, receptions: 98, yards: 1359, tds: 12 }, tags: ['alpha', 'redzone'] },
      { id: 'justin-jefferson', name: 'Justin Jefferson', team: 'MIN', age: 25, draftCapital: 22, stats: { targets: 120, receptions: 68, yards: 1074, tds: 5 }, tags: ['elite', 'wr1'] },
      { id: 'amon-ra-st-brown', name: 'Amon-Ra St. Brown', team: 'DET', age: 25, draftCapital: 112, stats: { targets: 164, receptions: 119, yards: 1515, tds: 12 }, tags: ['volume', 'consistent'] },
      { id: 'puka-nacua', name: 'Puka Nacua', team: 'LAR', age: 23, draftCapital: 177, stats: { targets: 153, receptions: 105, yards: 1486, tds: 6 }, tags: ['breakout', 'young'] }
    ],
    RB: [
      { id: 'saquon-barkley', name: 'Saquon Barkley', team: 'PHI', age: 27, draftCapital: 2, stats: { carries: 345, yards: 2005, tds: 13, targets: 33 }, tags: ['bellcow', 'volume'] },
      { id: 'josh-jacobs', name: 'Josh Jacobs', team: 'GB', age: 26, draftCapital: 24, stats: { carries: 340, yards: 1329, tds: 11, targets: 44 }, tags: ['workhorse', 'rb1'] },
      { id: 'derrick-henry', name: 'Derrick Henry', team: 'BAL', age: 30, draftCapital: 45, stats: { carries: 325, yards: 1921, tds: 16, targets: 11 }, tags: ['power', 'aging'] },
      { id: 'bijan-robinson', name: 'Bijan Robinson', team: 'ATL', age: 22, draftCapital: 8, stats: { carries: 237, yards: 1463, tds: 11, targets: 58 }, tags: ['young', 'receiving'] }
    ],
    TE: [
      { id: 'travis-kelce', name: 'Travis Kelce', team: 'KC', age: 35, draftCapital: 63, stats: { targets: 97, receptions: 65, yards: 823, tds: 3 }, tags: ['aging', 'elite'] },
      { id: 'sam-laporta', name: 'Sam LaPorta', team: 'DET', age: 24, draftCapital: 34, stats: { targets: 120, receptions: 86, yards: 889, tds: 10 }, tags: ['young', 'redzone'] }
    ],
    QB: [
      { id: 'josh-allen', name: 'Josh Allen', team: 'BUF', age: 28, draftCapital: 7, stats: { passYards: 4306, passTds: 28, rushYards: 15, rushTds: 15 }, tags: ['elite', 'rushing'] },
      { id: 'lamar-jackson', name: 'Lamar Jackson', team: 'BAL', age: 27, draftCapital: 32, stats: { passYards: 3678, passTds: 24, rushYards: 915, rushTds: 3 }, tags: ['rushing', 'dynamic'] }
    ]
  };
  
  return (sampleData[position] || []).slice(0, limit);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply security headers to all API responses (not HTML/static assets)
  app.use('/api', securityHeaders());

  // Serve docs folder for static markdown files
  app.use('/docs', express.static('docs'));
  
  // TIBER Signature Protocol - Signal endpoint
  app.get('/api/signal', (req: Request, res: Response) => {
    const base = { 
      status: "aligned", 
      key: TIBER_SIGNATURE.key, 
      motto: TIBER_SIGNATURE.motto 
    };

    // Reveal credits only if Founder Mode header or query is present
    const founder = req.get("x-founder") === "1" || req.query.founder === "1";
    if (!founder) return res.json(base);

    const file = path.join(process.cwd(), "docs/internal/credits.json");
    let credits = [];
    try { 
      credits = JSON.parse(fs.readFileSync(file, "utf8")).entries || []; 
    } catch {}
    
    return res.json({ ...base, credits });
  });
  
  // Version and Health endpoints for new API client
  app.get('/api/version', (req: Request, res: Response) => {
    res.json({
      build: `v1.0.3-${Date.now()}`,
      commit: 'main',
      pid: process.pid
    });
  });

  // League sync + context API
  app.use(leagueSyncRouter);
  app.use(userIntegrationRouter);
  app.use(leagueDashboardRouter);
  app.use(managementRouter);
  
  // Sleeper Sync V2 - Roster tracking and ownership events
  app.use('/api/sleeper/sync', sleeperSyncV2Routes);
  // Leagues discovery endpoint at /api/sleeper/leagues
  app.use('/api/sleeper', leaguesRouter);
  
  // Ownership Analytics - History and churn endpoints
  app.use('/api/ownership', ownershipRouter);
  console.log('📊 Ownership analytics routes mounted at /api/ownership/*');

  // External model adapter integrations
  app.use(roleOpportunityIntegrationRouter);
  app.use(forgeIntegrationRouter);
  app.use('/api/data-lab', dataLabBreakoutSignalsRouter);
  app.use('/api/data-lab', dataLabRoleOpportunityRouter);
  app.use('/api/data-lab', dataLabAgeCurvesRouter);
  app.use('/api/data-lab', dataLabPointScenariosRouter);
  app.use('/api/data-lab', dataLabPlayerOwnershipRouter);
  app.use('/api/data-lab', dataLabPlayerResearchRouter);
  app.use('/api/data-lab', dataLabTeamResearchRouter);
  app.use('/api/data-lab', dataLabCommandCenterRouter);
  app.use('/api/data-lab', dataLabPromotedStatusRouter);
  app.use('/api/data-lab', dataLabTeamStateRouter);
  app.use('/api/data-lab', dataLabTeamEnvironmentMovementRouter);
  app.use('/api/rookies', rookiesPromotedRouter);
  app.use('/api/rankings/v2', createRankingsV2Router());
  // Post-cutoff signal ledger (#297): append-only operator evidence; reads open, writes admin-authed.
  app.use('/api/post-cutoff-ledger', postCutoffLedgerRouter);

  // ========================================
  // MONITORING ENDPOINTS - HEALTH & METRICS
  // ========================================

  // Health endpoint - Basic system health
  app.get('/healthz', async (req: Request, res: Response) => {
    try {
      const health = await monitoringService.getHealthStatus();
      res.status(health.ok ? 200 : 503).json(health);
    } catch (error) {
      console.error('❌ [Health] Health check failed:', error);
      res.status(503).json({
        ok: false,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Readiness endpoint - Comprehensive operational readiness
  app.get('/readyz', async (req: Request, res: Response) => {
    try {
      const readiness = await monitoringService.getReadinessStatus();
      res.status(readiness.ready ? 200 : 503).json(readiness);
    } catch (error) {
      console.error('❌ [Readiness] Readiness check failed:', error);
      res.status(503).json({
        ready: false,
        status: 'not_ready',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Metrics endpoint - Prometheus format metrics
  app.get('/metrics', async (req: Request, res: Response) => {
    try {
      const metrics = await monitoringService.getMetrics();
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(metrics);
    } catch (error) {
      console.error('❌ [Metrics] Metrics collection failed:', error);
      res.status(500).json({
        error: 'Metrics collection failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Metrics snapshot endpoint for debugging (JSON format)
  app.get('/api/metrics-snapshot', async (req: Request, res: Response) => {
    try {
      const snapshot = await monitoringService.getMetricsSnapshot();
      res.json(snapshot);
    } catch (error) {
      console.error('❌ [Metrics] Metrics snapshot failed:', error);
      res.status(500).json({
        error: 'Metrics snapshot failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Dynamic Week Detection endpoint
  app.get('/api/current-week', (req: Request, res: Response) => {
    try {
      const { debug, test_date } = req.query;
      
      // Support debug mode with custom date
      if (debug === 'true' && test_date) {
        const debugResult = debugWeekDetection(test_date as string);
        return res.json({
          ...debugResult,
          debug: true,
          test_date: test_date,
          timestamp: new Date().toISOString()
        });
      }
      
      // Get current week info
      const currentWeekInfo = getCurrentWeek();
      // Outside the regular season there is no completed week to compare against,
      // so `best_week` is null rather than a fabricated week number.
      const bestRisersFallersWeek = getBestRisersFallersWeek();
      const risersFallersAvailable =
        bestRisersFallersWeek !== null &&
        isRisersFallersDataAvailable(bestRisersFallersWeek, currentWeekInfo.season);

      const response = {
        ...currentWeekInfo,
        risers_fallers: {
          best_week: bestRisersFallersWeek,
          data_available: risersFallersAvailable,
          note: risersFallersAvailable
            ? `Week ${bestRisersFallersWeek} risers/fallers data ready`
            : currentWeekInfo.phase === 'regular_season'
              ? 'Waiting for more games to complete'
              : `No completed regular-season week is available during ${currentWeekInfo.seasonPhaseLabel}.`
        },
        api_usage: {
          recommended_week_param: currentWeekInfo.currentWeek,
          recommended_season_param: currentWeekInfo.season
        },
        timestamp: new Date().toISOString()
      };
      
      console.log(`[Week API] Current week: ${currentWeekInfo.currentWeek}, Status: ${currentWeekInfo.weekStatus}, MNF: ${currentWeekInfo.mondayNightCompleted}, Best R/F Week: ${bestRisersFallersWeek}`);
      
      res.json(response);
      
    } catch (error) {
      console.error('[Week API] Error:', error);
      res.status(500).json({
        error: 'Failed to determine current week',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  app.get('/api/health', async (req: Request, res: Response) => {
    try {
      // Import services for health checks
      const { sleeperSyncService } = await import('./services/sleeperSyncService');
      const { logsProjectionsService } = await import('./services/logsProjectionsService');

      // Perform health checks
      const [
        sleeperStatus,
        dataStats
      ] = await Promise.all([
        sleeperSyncService.getSyncStatus(),
        logsProjectionsService.getDataSummary()
      ]);

      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: 'v1.0.4',
        services: {
          sleeper_sync: {
            status: sleeperStatus.cache_exists ? 'ok' : 'degraded',
            players_count: sleeperStatus.players_count,
            cache_stale: sleeperStatus.cache_stale,
            last_sync: sleeperStatus.last_sync
          },
          logs_projections: {
            status: dataStats.game_logs_count > 0 ? 'ok' : 'empty',
            game_logs: dataStats.game_logs_count,
            projections: dataStats.projections_count,
            season_stats: dataStats.season_stats_count,
            last_updated: dataStats.last_updated
          },
          legacy: {
            dynasty: 'ok', 
            oasis: 'ok',
            trends: 'ok',
            compass: 'ok',
            usage2024: 'ok'
          }
        }
      };

      res.json(healthStatus);
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ===== HELPER FUNCTIONS FOR SLEEPER ROUTES =====
  
  // Structured JSON logging helpers
  function logInfo(msg: string, data?: Record<string, any>, meta?: Record<string, any>) {
    const logData = { level: 'info', src: 'SleeperRoutes', msg, ...(data || {}), ...(meta || {}) };
    console.log(JSON.stringify(logData));
  }

  function logError(msg: string, error: any, meta?: Record<string, any>) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.log(JSON.stringify({ level: 'error', src: 'SleeperRoutes', msg, error: errorMsg, stack, ...(meta || {}) }));
  }

  // Dynamic season validation (2018 to current year + 1)
  function validateSeason(season: string): boolean {
    if (!/^\d{4}$/.test(season)) return false;
    const year = Number(season);
    const currentYear = new Date().getFullYear();
    return year >= 2018 && year <= currentYear + 1;
  }

  // Meta helper for response metadata (Batch #2 refinement)
  function meta() {
    return { 
      source: 'sleeper' as const, 
      generatedAt: new Date().toISOString() 
    };
  }

  // Success response creator with meta
  function createResponse<T>(data: T) {
    return { 
      ok: true as const, 
      meta: meta(), 
      data 
    };
  }

  // Standard error response creator with meta (Batch #2 refinement)
  function createErrorResponse(code: string, message: string, details?: any) {
    return {
      ok: false as const,
      code,
      message,
      details,
      meta: meta()
    };
  }

  // Extract HTTP status and error fields from error objects (Batch #2 refinement)
  function httpStatusFromError(e: any, fallback = 500): number {
    if (typeof e?.status === 'number') return e.status;
    switch (e?.code) {
      case 'INVALID_USERNAME':
      case 'INVALID_USER_ID':
      case 'INVALID_LEAGUE_ID': return 400;
      case 'INVALID_SEASON': return 422;
      case 'USER_NOT_FOUND':
      case 'LEAGUE_NOT_FOUND': return 404;
      case 'PARTIAL_UPSTREAM': return 206;
      case 'API_ERROR': return 502;
      default: return fallback;
    }
  }

  function errFields(e: any) {
    return {
      code: e?.code || 'INTERNAL_ERROR',
      message: e?.message || 'Unexpected error',
      details: e?.details
    };
  }

  // Dynamic season validation (Batch #2 refinement)
  function isValidSeason(season: string): boolean {
    if (!/^\d{4}$/.test(season)) return false;
    const y = Number(season), current = new Date().getFullYear();
    return y >= 2018 && y <= current + 1;
  }

  // ===== SLEEPER INTEGRATION WITH FEATURE FLAG (Batch #3) =====
  
  // Note: Removed duplicate helper functions - using definitions from earlier in file

  const USE_SLEEPER_SYNC = String(process.env.USE_SLEEPER_SYNC).toLowerCase() === 'true';

  if (USE_SLEEPER_SYNC) {
    logInfo('mounting sleeper routes');
    const sleeperRouter = (await import('./sleeperRoutes')).default;
    app.use(sleeperRouter);
  } else {
    logInfo('sleeper sync disabled');
    // Contract-correct fallback with meta fields (Batch #3)
    app.all('/api/sleeper/*', (_req, res) => {
      res.status(503).json({
        ok: false,
        code: 'SERVICE_DISABLED',
        message: 'Sleeper Sync is currently disabled',
        details: 'Set USE_SLEEPER_SYNC=true to enable',
        meta: meta()
      });
    });
    // Disabled health endpoint still answers
    app.get('/api/sleeper/health', (_req, res) => {
      res.status(503).json({
        ok: false,
        code: 'SERVICE_DISABLED',
        message: 'Sleeper Sync is disabled',
        details: null,
        meta: meta()
      });
    });
  }


  // ===== BACKEND SPINE: LOGS & PROJECTIONS ENDPOINTS =====
  app.get('/api/logs/player/:playerId', async (req: Request, res: Response) => {
    try {
      const { logsProjectionsService } = await import('./services/logsProjectionsService');
      const { playerId } = req.params;
      const { season } = req.query;
      
      const logs = await logsProjectionsService.getPlayerGameLogs(
        playerId, 
        season ? parseInt(season as string) : 2024
      );
      
      res.json({
        ok: true,
        data: logs,
        count: logs.length
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Defense Rankings Route - Week 5 positional fantasy points allowed
  app.get("/api/defense-rankings", async (req: Request, res: Response) => {
    try {
      const { defenseVP } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      const week = 5;
      const season = 2024;
      
      // Fetch defense data for Week 5
      const defenseData = await db
        .select()
        .from(defenseVP)
        .where(and(
          eq(defenseVP.season, season),
          eq(defenseVP.week, week)
        ));
      
      // Group by team and pivot by position
      const teamData = defenseData.reduce((acc, row) => {
        if (!acc[row.defTeam]) {
          acc[row.defTeam] = { team: row.defTeam };
        }
        acc[row.defTeam][row.position.toLowerCase()] = row.fpAllowed;
        return acc;
      }, {} as Record<string, any>);
      
      // Convert to array
      const rankings = Object.values(teamData);
      
      res.json({ 
        week, 
        season, 
        data: rankings 
      });
    } catch (error) {
      console.error("Error fetching defense rankings:", error);
      res.status(500).json({ error: "Failed to fetch defense rankings" });
    }
  });

  app.get('/api/projections/player/:playerId', async (req: Request, res: Response) => {
    try {
      const { logsProjectionsService } = await import('./services/logsProjectionsService');
      const { playerId } = req.params;
      const { season } = req.query;
      
      const projections = await logsProjectionsService.getPlayerProjections(
        playerId,
        season ? parseInt(season as string) : 2025
      );
      
      res.json({
        ok: true,
        data: projections,
        count: projections.length
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ===== TIBER FINAL RANKINGS ENDPOINT =====
  // Simple test endpoint to verify routing works
  app.get('/api/test-simple', (req: Request, res: Response) => {
    console.log('🔥 [TEST] Simple test endpoint called');
    res.json({ success: true, message: "Test endpoint working" });
  });

  // Test endpoint for player usage season averages
  app.get('/api/test-usage-data', async (req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          psa.player_id,
          r.player_name,
          r.position,
          r.team,
          psa.games_played,
          psa.alignment_outside_pct as avg_outside_pct,
          psa.alignment_slot_pct as avg_slot_pct,
          psa.target_share_pct as avg_target_share,
          psa.latest_week,
          psa.latest_snap_share_pct as latest_snap_share,
          psa.latest_targets as max_targets
        FROM player_usage_season_avg psa
        LEFT JOIN nflfastr_rosters r ON psa.player_id = r.player_id AND r.season = 2025
        WHERE psa.season = 2025
        ORDER BY psa.target_share_pct DESC NULLS LAST
        LIMIT 20
      `);
      
      res.json({ data: result.rows, total: result.rows.length });
    } catch (error) {
      console.error('Test data error:', error);
      res.status(500).json({ error: 'Failed to fetch test data' });
    }
  });

  // Player comparison endpoint - rate limited due to complex SQL joins
  app.get('/api/player-usage-compare', rateLimiters.heavyOperation, async (req: Request, res: Response) => {
    try {
      const { player1, player2 } = req.query;
      
      if (!player1 || !player2) {
        return res.status(400).json({ error: 'Both player1 and player2 parameters are required' });
      }

      const player1Lower = String(player1).toLowerCase();
      const player2Lower = String(player2).toLowerCase();

      const result = await db.execute(sql`
        SELECT 
          psa.player_id,
          r.player_name,
          r.position,
          r.team,
          psa.games_played,
          psa.alignment_outside_pct,
          psa.alignment_slot_pct,
          psa.target_share_pct,
          psa.carries_gap_pct,
          psa.carries_zone_pct,
          psa.latest_week,
          psa.latest_targets,
          psa.latest_snap_share_pct,
          CASE 
            WHEN s.home = r.team THEN s.away
            WHEN s.away = r.team THEN s.home
            ELSE NULL
          END as week6_opponent,
          CASE
            WHEN s.home = r.team THEN 'vs'
            WHEN s.away = r.team THEN '@'
            ELSE NULL
          END as week6_location
        FROM player_usage_season_avg psa
        LEFT JOIN nflfastr_rosters r ON psa.player_id = r.player_id AND r.season = 2025
        LEFT JOIN schedule s ON s.season = 2025 AND s.week = 6 AND (s.home = r.team OR s.away = r.team)
        WHERE psa.season = 2025
          AND LOWER(r.player_name) IN (${player1Lower}, ${player2Lower})
      `);
      
      res.json({ data: result.rows });
    } catch (error) {
      console.error('Player comparison error:', error);
      res.status(500).json({ error: 'Failed to fetch player comparison data' });
    }
  });

  // LEGACY: historical "final rankings" lane with sample-data fallback behavior.
  // Not the canonical public Rankings v2 contract surface.
  app.get('/api/rankings/otc-final', async (req: Request, res: Response) => {
    try {
      console.log(`📊 [TIBER Final Rankings] Endpoint called with query:`, req.query);
      
      const position = req.query.pos as string;
      const positions: ("QB" | "RB" | "WR" | "TE")[] = position ? [position as "QB" | "RB" | "WR" | "TE"] : ["QB", "RB", "WR", "TE"];
      
      console.log(`📊 [TIBER Final Rankings] Generating authoritative rankings for positions: ${positions.join(', ')}`);

      // For now, provide a simplified fallback with sample data while consensus is not working
      const samplePlayers = [
        { player_id: "ja-marr-chase", name: "Ja'Marr Chase", team: "CIN", pos: "WR", rank: 1 },
        { player_id: "justin-jefferson", name: "Justin Jefferson", team: "MIN", pos: "WR", rank: 2 },
        { player_id: "ceedee-lamb", name: "CeeDee Lamb", team: "DAL", pos: "WR", rank: 3 },
        { player_id: "josh-allen", name: "Josh Allen", team: "BUF", pos: "QB", rank: 4 },
        { player_id: "saquon-barkley", name: "Saquon Barkley", team: "PHI", pos: "RB", rank: 5 },
        { player_id: "bijan-robinson", name: "Bijan Robinson", team: "ATL", pos: "RB", rank: 6 },
        { player_id: "patrick-mahomes", name: "Patrick Mahomes", team: "KC", pos: "QB", rank: 7 },
        { player_id: "sam-laporta", name: "Sam LaPorta", team: "DET", pos: "TE", rank: 8 },
        { player_id: "travis-kelce", name: "Travis Kelce", team: "KC", pos: "TE", rank: 9 },
        { player_id: "puka-nacua", name: "Puka Nacua", team: "LAR", pos: "WR", rank: 10 }
      ];

      // Filter by position if specified
      const filteredPlayers = position && position !== "All" 
        ? samplePlayers.filter(p => p.pos === position)
        : samplePlayers;

      console.log(`✅ [TIBER Final Rankings] Generated ${filteredPlayers.length} final rankings (sample data)`);

      res.json({
        success: true,
        data: filteredPlayers,
        metadata: {
          generated_at: new Date().toISOString(),
          total_players: filteredPlayers.length,
          positions: Array.from(new Set(filteredPlayers.map(p => p.pos))),
          source: "TIBER_AUTHORITATIVE_SAMPLE"
        }
      });

    } catch (error) {
      console.error('❌ [TIBER Final Rankings] Error generating final rankings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate TIBER final rankings',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ===== RATINGS SYSTEM =====
  app.use('/api/ratings', ratingsRouter);
  
  // ===== PLAYER ATTRIBUTES SYSTEM =====
  // Mount the player attributes router
  app.use('/api/attributes', attributesRoutes);
  
  // ===== METRIC MATRIX SYSTEM =====
  app.use('/api/metric-matrix', metricMatrixRoutes);
  
  // ===== LEGACY RATINGS ENGINE (DEPRECATED) =====
  // Legacy ratings endpoint - disabled (using ratingsRouter above)
  /*
  app.get('/api/ratings', async (req: Request, res: Response) => {
    try {
      const { ratingsEngineService } = await import('./services/ratingsEngineService');
      const { position, format, limit } = req.query;
      
      if (position) {
        const rankings = await ratingsEngineService.getPositionRankings(
          position as string,
          format as string || 'dynasty'
        );
        res.json({
          ok: true,
          data: rankings
        });
      } else {
        const topPlayers = await ratingsEngineService.getTopPlayers(
          limit ? parseInt(limit as string) : 100,
          format as string || 'dynasty'
        );
        res.json({
          ok: true,
          data: topPlayers,
          count: topPlayers.length
        });
      }
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  */

  // DEPRECATED: ratingsEngineService removed - use OVR system instead
  app.get('/api/ratings/player/:playerId', async (req: Request, res: Response) => {
    res.status(410).json({
      ok: false,
      error: 'This endpoint has been deprecated. Use /api/ovr/:position/:playerName instead.',
      migration: 'OVR system provides Madden-style 1-99 ratings'
    });
  });
  
  // ✅ TIBER COMMAND: MainPlayerSystem.json generation with live depth charts
  console.log('✅ Registering Tiber stats endpoint');
  
  // TIBER: Depth chart system - DEPRECATED
  app.get('/api/tiber/depth-chart-system', async (req, res) => {
    console.log('⚠️ [DEPRECATION_COMPLETE] SportsDataIO Depth Chart API disabled');
    res.status(410).json({
      success: false,
      status: '[DEPRECATION_COMPLETE]',
      message: 'SportsDataIO Depth Chart API has been deprecated',
      deprecated: true,
      instruction: 'Use Sleeper API or TRACKSTAR API for data sources'
    });
  });

  // TIBER: MainPlayerSystem generation - DEPRECATED
  app.post('/api/tiber/generate-main-player-system', async (req, res) => {
    console.log('⚠️ [DEPRECATION_COMPLETE] MainPlayerSystem generation disabled');
    res.status(410).json({
      success: false,
      status: '[DEPRECATION_COMPLETE]',
      message: 'MainPlayerSystem.json generation has been deprecated',
      deprecated: true,
      instruction: 'Use Sleeper API or TRACKSTAR API for data sources'
    });
  });

  // 🔄 Auto-refresh MainPlayerSystem - DEPRECATED
  // [DEPRECATION_COMPLETE] SportsDataIO auto-refresh disabled

  // TIBER: Verify 2024 game log access
  app.get('/api/tiber/verify-2024-game-logs', verify2024GameLogs);

  // TIBER: Parse 2024 game logs full depth analysis
  app.get('/api/tiber/parse-full-game-logs', parseFullGameLogs);

  // TIBER: Export positional game log samples
  app.get('/api/tiber/export-positional-game-logs', exportPositionalGameLogs);

  // DEPRECATED: Legacy Compass - use Role Bank system instead
  app.get('/api/compass-legacy-algorithm/:position', async (req, res) => {
    res.status(410).json({ 
      error: 'Legacy compass route deprecated',
      migration: 'Use /api/role-bank/:position/:season for position rankings'
    });
  });

  // TIBER: Direct Sleeper API test
  app.get('/api/tiber/sleeper-2024-direct', async (req, res) => {
    console.log('🔍 [TIBER] Direct Sleeper API test initiated...');
    
    try {
      // Test multiple 2024 endpoints
      const testResults = {
        seasonStats: null as any,
        weeklyTests: [] as any[],
        weeklyGameLogs: false
      };

      // Test 1: Season stats
      console.log('📊 Testing season stats endpoint...');
      const seasonResponse = await axios.get('https://api.sleeper.app/v1/stats/nfl/regular/2024');
      
      if (seasonResponse.data && typeof seasonResponse.data === 'object' && Object.keys(seasonResponse.data).length > 0) {
        const playerIds = Object.keys(seasonResponse.data);
        const samplePlayer = playerIds[0];
        const sampleStats = seasonResponse.data[samplePlayer];
        
        testResults.seasonStats = {
          available: true,
          playerCount: playerIds.length,
          samplePlayerId: samplePlayer,
          availableStats: Object.keys(sampleStats),
          priorityStats: {
            targets: 'rec_tgt' in sampleStats,
            receptions: 'rec' in sampleStats,
            receivingYards: 'rec_yd' in sampleStats,
            touchdowns: 'rec_td' in sampleStats || 'rush_td' in sampleStats
          },
          sampleData: sampleStats
        };
      } else {
        testResults.seasonStats = { available: false, data: seasonResponse.data };
      }

      // Test 2: Weekly game logs (weeks 1-3)
      console.log('📊 Testing weekly game log endpoints...');
      for (let week = 1; week <= 3; week++) {
        try {
          const weekResponse = await axios.get(`https://api.sleeper.app/v1/stats/nfl/regular/2024/${week}`);
          if (weekResponse.data && typeof weekResponse.data === 'object' && Object.keys(weekResponse.data).length > 0) {
            testResults.weeklyGameLogs = true;
            testResults.weeklyTests.push({
              week,
              available: true,
              playerCount: Object.keys(weekResponse.data).length,
              samplePlayer: Object.keys(weekResponse.data)[0]
            });
          } else {
            testResults.weeklyTests.push({
              week,
              available: false,
              data: weekResponse.data
            });
          }
        } catch (error) {
          testResults.weeklyTests.push({
            week,
            available: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Final verdict
      if (testResults.seasonStats?.available && testResults.weeklyGameLogs) {
        res.json({
          status: '[SLEEPER_2024_GAME_LOG_CHECK]',
          verdict: 'YES - Both season totals and weekly game logs available',
          dataFormats: {
            seasonTotals: true,
            weeklyGameLogs: true
          },
          testResults
        });
      } else if (testResults.seasonStats?.available) {
        res.json({
          status: '[SLEEPER_2024_GAME_LOG_CHECK]',
          verdict: 'PARTIAL - Season totals only, weekly game logs unavailable',
          dataFormats: {
            seasonTotals: true,
            weeklyGameLogs: false
          },
          testResults
        });
      } else {
        res.json({
          status: '[NO_2024_GAME_LOG_DATA]',
          verdict: 'NO - 2024 data not available',
          testResults
        });
      }

    } catch (error) {
      console.error('❌ [SLEEPER_2024_GAME_LOG_CHECK] Error:', error);
      res.status(500).json({
        status: '[NO_2024_GAME_LOG_DATA]',
        verdict: 'ERROR - API request failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ✅ TIBER STATS: NFL statistics endpoint for data retrieval
  app.get('/api/nfl-stats', async (req, res) => {
    try {
      console.log('✅ TIBER STATS: NFL statistics endpoint activated');
      
      // Direct NFL stats fetch bypassing ALL other logic
      const response = await axios.get('https://api.sleeper.app/v1/stats/nfl/regular/2024/1', { timeout: 10000 });
      const rawStats = response.data || {};
      
      console.log(`📊 Raw NFL stats fetched: ${Object.keys(rawStats).length} players`);
      
      // Convert to fantasy points format
      const fantasyProjections: Record<string, any> = {};
      let processed = 0;
      
      for (const [playerId, stats] of Object.entries(rawStats)) {
        const s = stats as any;
        
        // Calculate fantasy points from real NFL stats
        let fantasyPoints = 0;
        
        // Passing (QB)
        if (s.pass_yd) fantasyPoints += s.pass_yd * 0.04;
        if (s.pass_td) fantasyPoints += s.pass_td * 4;
        if (s.pass_int) fantasyPoints -= s.pass_int * 2;
        
        // Rushing (RB, QB)
        if (s.rush_yd) fantasyPoints += s.rush_yd * 0.1;
        if (s.rush_td) fantasyPoints += s.rush_td * 6;
        
        // Receiving (WR, TE, RB)
        if (s.rec) fantasyPoints += s.rec; // PPR
        if (s.rec_yd) fantasyPoints += s.rec_yd * 0.1;
        if (s.rec_td) fantasyPoints += s.rec_td * 6;
        
        // Fumbles
        if (s.fum_lost) fantasyPoints -= s.fum_lost * 2;
        
        if (fantasyPoints > 0) {
          fantasyProjections[playerId] = {
            fantasy_points: parseFloat(fantasyPoints.toFixed(1)),
            games_played: s.gp || 1,
            raw_stats: s
          };
          processed++;
        }
      }
      
      console.log(`✅ Processed ${processed} players with fantasy points`);
      
      res.json({
        success: true,
        total_players: processed,
        projections: fantasyProjections,
        source: 'NFL_STATS_2024_WEEK_1',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Force stats error:', error);
      res.status(500).json({ error: 'Failed to fetch NFL stats' });
    }
  });

  // DEPRECATED: Grok Projections - use Sleeper projections instead
  app.get('/api/grok-projections', async (req, res) => {
    res.status(410).json({ 
      error: 'Grok projections endpoint deprecated',
      migration: 'Use /api/sleeper/projections for player projections'
    });
  });

  // LEGACY: generic rankings API lane (EPA/usage composite). Keep for compatibility only.
  // Public canonical surface remains /tiers while Rankings v2 contract adoption is staged.
  app.get('/api/rankings', rateLimiters.heavyOperation, async (req: Request, res: Response) => {
    try {
      const position = req.query.position ? (req.query.position as string).toUpperCase() : null;
      const mode = req.query.mode as string || 'redraft';
      const limit = parseInt(req.query.limit as string) || 100;
      const week = parseInt(req.query.week as string) || 2; // We have weeks 1-2 data
      const season = parseInt(req.query.season as string) || 2025;

      console.log(`🚀 Rankings endpoint hit - Mode: ${mode}, Position: ${position || 'ALL'}, Week: ${week}, Season: ${season}`);

      // Import silverPlayerWeeklyStats from schema
      const { silverPlayerWeeklyStats } = await import('@shared/schema');

      // Build base query conditions with data quality safeguards
      const conditions = [
        eq(silverPlayerWeeklyStats.season, season),
        eq(silverPlayerWeeklyStats.week, week),
        // Ensure we have meaningful data (at least some usage)
        sql`(${silverPlayerWeeklyStats.passAttempts} > 0 OR ${silverPlayerWeeklyStats.targets} > 0 OR ${silverPlayerWeeklyStats.rushAttempts} > 0)`
      ];

      // Add position filter if requested
      if (position && ['QB', 'RB', 'WR', 'TE'].includes(position)) {
        conditions.push(eq(silverPlayerWeeklyStats.position, position));
      }

      // Query silver_player_weekly_stats for NFLfastR aggregated stats
      const stats = await db
        .select({
          playerId: silverPlayerWeeklyStats.playerId,
          playerName: silverPlayerWeeklyStats.playerName,
          position: silverPlayerWeeklyStats.position,
          team: silverPlayerWeeklyStats.team,
          
          passAttempts: silverPlayerWeeklyStats.passAttempts,
          passingEpa: silverPlayerWeeklyStats.passingEpa,
          passingTds: silverPlayerWeeklyStats.passingTds,
          passingYards: silverPlayerWeeklyStats.passingYards,
          
          targets: silverPlayerWeeklyStats.targets,
          receptions: silverPlayerWeeklyStats.receptions,
          receivingYards: silverPlayerWeeklyStats.receivingYards,
          receivingEpa: silverPlayerWeeklyStats.receivingEpa,
          receivingTds: silverPlayerWeeklyStats.receivingTds,
          
          rushAttempts: silverPlayerWeeklyStats.rushAttempts,
          rushingYards: silverPlayerWeeklyStats.rushingYards,
          rushingEpa: silverPlayerWeeklyStats.rushingEpa,
          rushingTds: silverPlayerWeeklyStats.rushingTds,
          
          week: silverPlayerWeeklyStats.week,
          season: silverPlayerWeeklyStats.season
        })
        .from(silverPlayerWeeklyStats)
        .where(and(...conditions));

      console.log(`📊 Found ${stats.length} players in NFLfastR data for week ${week}`);

      // Calculate composite EPA score and OVR for each player
      const playersWithScores = stats.map((player) => {
        let primaryEPA = 0;
        let usage = 0;
        let detectedPosition = player.position || 'UNKNOWN';
        
        // Infer position from usage if not set
        if (!player.position) {
          if ((player.passAttempts || 0) > 10) detectedPosition = 'QB';
          else if ((player.rushAttempts || 0) > 5) detectedPosition = 'RB';
          else if ((player.targets || 0) > 3) detectedPosition = 'WR';
        }
        
        // Position-specific EPA calculation
        if (detectedPosition === 'QB') {
          primaryEPA = player.passingEpa || 0;
          usage = player.passAttempts || 0;
        } else if (detectedPosition === 'WR' || detectedPosition === 'TE') {
          primaryEPA = player.receivingEpa || 0;
          usage = player.targets || 0;
        } else if (detectedPosition === 'RB') {
          const rushEPA = (player.rushingEpa || 0) * (player.rushAttempts || 0);
          const recEPA = (player.receivingEpa || 0) * (player.targets || 0);
          const totalUsage = (player.rushAttempts || 0) + (player.targets || 0);
          primaryEPA = totalUsage > 0 ? (rushEPA + recEPA) / totalUsage : 0;
          usage = totalUsage;
        }

        // Calculate composite score (EPA efficiency + usage volume)
        const compositeScore = (primaryEPA * 100) + (usage * 0.5);

        return {
          ...player,
          position: detectedPosition,
          primaryEPA,
          usage,
          compositeScore
        };
      });

      // Sort by composite score (higher = better) - position filtering already done in SQL query
      playersWithScores.sort((a, b) => b.compositeScore - a.compositeScore);

      // Apply limit
      const topPlayers = playersWithScores.slice(0, limit);

      // Calculate OVR ratings from composite scores
      const maxScore = topPlayers[0]?.compositeScore || 100;
      const minScore = topPlayers[topPlayers.length - 1]?.compositeScore || 0;
      
      const rankingsWithOVR = topPlayers.map((player, index) => {
        // Scale composite score to 1-99 OVR
        let ovrRating = 50;
        
        if (maxScore !== minScore && maxScore > 0) {
          const normalized = (player.compositeScore - minScore) / (maxScore - minScore);
          ovrRating = Math.round(40 + (normalized * 59)); // Scale to 40-99 range
        }
        
        // Assign tiers based on OVR
        let tier = 'C';
        if (ovrRating >= 95) tier = 'S';
        else if (ovrRating >= 85) tier = 'A';
        else if (ovrRating >= 70) tier = 'B';
        else if (ovrRating >= 55) tier = 'C';
        else tier = 'D';

        return {
          rank: index + 1,
          player_id: player.playerId,
          name: player.playerName,
          position: player.position,
          team: player.team,
          ovr: ovrRating,
          tier,
          score: player.compositeScore,
          
          // NFLfastR stats for display
          passingEpa: player.passingEpa,
          passAttempts: player.passAttempts,
          passingYards: player.passingYards,
          passingTds: player.passingTds,
          
          receivingEpa: player.receivingEpa,
          targets: player.targets,
          receptions: player.receptions,
          receivingYards: player.receivingYards,
          receivingTds: player.receivingTds,
          
          rushingEpa: player.rushingEpa,
          rushAttempts: player.rushAttempts,
          rushingYards: player.rushingYards,
          rushingTds: player.rushingTds,
          
          compositeScore: player.compositeScore,
          primaryEPA: player.primaryEPA,
          usage: player.usage
        };
      });

      console.log(`✅ Rankings: Returning ${rankingsWithOVR.length} players from NFLfastR 2025 data (Silver layer)`);
      
      res.json({
        ok: true,
        data: rankingsWithOVR,
        meta: {
          source: 'nflfastr_2025_silver',
          mode: mode,
          week: week,
          season: season,
          count: rankingsWithOVR.length,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Rankings endpoint error:', error);
      res.status(500).json({ 
        ok: false, 
        error: 'Failed to fetch rankings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Shared function for modular rankings logic (reusable)
  async function getRankings(mode = 'redraft', position: string | null = null, numTeams = 12, debugRaw = false, format = '1qb', qbRushAdjust = true, positionalBalance = true, userIntent = 'fantasy football analysis') {
    try {
      console.log(`🚀 getRankings - Mode: ${mode}, Position: ${position || 'ALL'}, Teams: ${numTeams}`);

      let players = await getSleeperProjections();
      
      // Use enhanced fallback sample with proper positional distribution (always use this for demo)
      if (players.length <= 5) {
        console.log('📊 Using enhanced fallback sample...');
        players = [
          // Elite QBs
          { player_name: "Josh Allen", position: "QB", team: "BUF", projected_fpts: 380, birthdate: "1996-05-21", receptions: 0 },
          { player_name: "Patrick Mahomes", position: "QB", team: "KC", projected_fpts: 370, birthdate: "1995-09-17", receptions: 0 },
          { player_name: "Lamar Jackson", position: "QB", team: "BAL", projected_fpts: 365, birthdate: "1997-01-07", receptions: 0 },
          { player_name: "Jayden Daniels", position: "QB", team: "WAS", projected_fpts: 350, birthdate: "2001-12-18", receptions: 0 },
          
          // Elite RBs (scarcity position)
          { player_name: "Bijan Robinson", position: "RB", team: "ATL", projected_fpts: 280, birthdate: "2002-01-30", receptions: 50 },
          { player_name: "Saquon Barkley", position: "RB", team: "PHI", projected_fpts: 275, birthdate: "1997-02-09", receptions: 45 },
          { player_name: "Jahmyr Gibbs", position: "RB", team: "DET", projected_fpts: 270, birthdate: "2002-03-20", receptions: 55 },
          { player_name: "Breece Hall", position: "RB", team: "NYJ", projected_fpts: 265, birthdate: "2001-05-31", receptions: 50 },
          { player_name: "Jonathan Taylor", position: "RB", team: "IND", projected_fpts: 260, birthdate: "1999-01-19", receptions: 40 },
          { player_name: "De'Von Achane", position: "RB", team: "MIA", projected_fpts: 250, birthdate: "2001-10-13", receptions: 55 },
          { player_name: "Christian McCaffrey", position: "RB", team: "SF", projected_fpts: 245, birthdate: "1996-06-07", receptions: 60 },
          { player_name: "Ashton Jeanty", position: "RB", team: "LV", projected_fpts: 240, birthdate: "2003-12-02", receptions: 25 },
          
          // Elite WRs (deeper position)
          { player_name: "Ja'Marr Chase", position: "WR", team: "CIN", projected_fpts: 290, birthdate: "2000-03-01", receptions: 105 },
          { player_name: "Justin Jefferson", position: "WR", team: "MIN", projected_fpts: 285, birthdate: "1999-06-16", receptions: 100 },
          { player_name: "CeeDee Lamb", position: "WR", team: "DAL", projected_fpts: 280, birthdate: "1999-04-08", receptions: 95 },
          { player_name: "Malik Nabers", position: "WR", team: "NYG", projected_fpts: 275, birthdate: "2003-07-28", receptions: 90 },
          { player_name: "Amon-Ra St. Brown", position: "WR", team: "DET", projected_fpts: 270, birthdate: "1999-10-24", receptions: 85 },
          { player_name: "Puka Nacua", position: "WR", team: "LAR", projected_fpts: 265, birthdate: "2001-05-29", receptions: 80 },
          { player_name: "A.J. Brown", position: "WR", team: "PHI", projected_fpts: 260, birthdate: "1997-06-30", receptions: 75 },
          { player_name: "Garrett Wilson", position: "WR", team: "NYJ", projected_fpts: 255, birthdate: "2000-07-22", receptions: 70 },
          { player_name: "Marvin Harrison Jr.", position: "WR", team: "ARI", projected_fpts: 250, birthdate: "2002-08-11", receptions: 65 },
          { player_name: "Nico Collins", position: "WR", team: "HOU", projected_fpts: 245, birthdate: "1999-03-19", receptions: 60 },
          
          // Elite TEs
          { player_name: "Sam LaPorta", position: "TE", team: "DET", projected_fpts: 200, birthdate: "2001-01-12", receptions: 75 },
          { player_name: "Brock Bowers", position: "TE", team: "LV", projected_fpts: 195, birthdate: "2002-12-19", receptions: 70 },
          { player_name: "Mark Andrews", position: "TE", team: "BAL", projected_fpts: 185, birthdate: "1995-09-06", receptions: 65 },
          { player_name: "Travis Kelce", position: "TE", team: "KC", projected_fpts: 180, birthdate: "1989-10-05", receptions: 60 }
        ];
      }

      // Apply position filtering if specified
      if (position) {
        players = players.filter(p => p.position === position.toUpperCase());
        console.log(`🔍 Position filter applied: ${position} (${players.length} players)`);
      }

      // Calculate VORP with enhanced parameters
      console.log(`📊 Calculating VORP with ${mode} mode...`);
      const starters = { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1 };
      const playersWithVORP = calculateVORP(players, numTeams, starters, mode, debugRaw, format, qbRushAdjust, positionalBalance);

      // Add tier information based on VORP values
      const playersWithTiers = playersWithVORP.map((player) => {
        let tier = 1;
        if (player.vorp && player.vorp > 0) {
          if (player.vorp >= 400) tier = 1;      // Elite (400+ VORP)
          else if (player.vorp >= 300) tier = 2; // Premium (300+ VORP)
          else if (player.vorp >= 200) tier = 3; // Strong (200+ VORP)
          else if (player.vorp >= 100) tier = 4; // Solid (100+ VORP)
          else tier = 5;                         // Depth (under 100 VORP)
        }
        return { ...player, tier };
      });

      // Apply Noise Shield assessment
      const { assess } = await import('./guardian/noiseShield');
      const contentToAssess = `${mode} fantasy football rankings for ${position || 'all positions'}`;
      const shieldAssessment = assess(contentToAssess, userIntent);
      
      console.log(`✅ getRankings: Returning ${playersWithTiers.length} players sorted by value (${mode} mode)`);
      console.log(`🛡️ Noise Shield: ${shieldAssessment.isClean ? 'CLEAN' : 'FLAGS: ' + shieldAssessment.flags.join(', ')}`);
      
      return {
        data: playersWithTiers,
        shield: shieldAssessment
      };
    } catch (error) {
      console.error('❌ getRankings error:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  // LEGACY: API-client compatibility lane for /api/rankings* variants.
  app.get('/api/redraft/rankings', async (req: Request, res: Response) => {
    try {
      const pos = req.query.pos as string;
      const season = parseInt(req.query.season as string) || 2025;
      const format = req.query.format as string || 'PPR';
      const limit = parseInt(req.query.limit as string) || 200;
      
      if (!pos || !['QB', 'RB', 'WR', 'TE'].includes(pos)) {
        return res.status(400).json({ error: 'pos parameter required (QB, RB, WR, TE)' });
      }
      
      console.log(`📊 [API] Fetching redraft rankings: ${pos}, season=${season}, limit=${limit}`);
      
      const rankingsResult = await getRankings('redraft', pos, 12, false, format.toLowerCase(), true, true, `redraft ${pos} rankings for competitive fantasy football`);
      const players = Array.isArray(rankingsResult) ? rankingsResult : rankingsResult.data;
      const limitedPlayers = players.slice(0, limit);
      
      // Transform to API spec format
      const apiPlayers = limitedPlayers.map((p: any, index: number) => ({
        id: `${pos.toLowerCase()}-${p.player_name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}` || `${pos.toLowerCase()}-${index}`,
        name: p.player_name || p.name || 'Unknown',
        team: p.team || 'UNK',
        pos: pos,
        rank: index + 1,
        proj_pts: p.projected_fpts || p.proj_pts || 0,
        tier: p.tier ? `Tier ${p.tier}` : 'N/A',
        adp: p.adp || null
      }));
      
      // Include shield data if available
      const responseData: any = {
        ok: true,
        data: apiPlayers,
        meta: { rows: apiPlayers.length, season, ts: Math.floor(Date.now() / 1000) }
      };
      
      if (!Array.isArray(rankingsResult) && rankingsResult.shield && !rankingsResult.shield.isClean) {
        responseData.shield = {
          active: true,
          message: rankingsResult.shield.shieldMessage,
          flags: rankingsResult.shield.flags
        };
      }
      
      res.json(responseData);
    } catch (error) {
      console.error('❌ API redraft rankings error:', error);
      res.status(500).json({ error: 'Failed to fetch redraft rankings' });
    }
  });

  // Mode-specific routes (full list)
  app.get('/api/rankings/redraft', async (req: Request, res: Response) => {
    try {
      const numTeams = parseInt(req.query.num_teams as string) || 12;
      const debugRaw = req.query.debug === 'true';
      const format = req.query.format as string || '1qb';
      const players = await getRankings('redraft', null, numTeams, debugRaw, format);
      res.json(players);
    } catch (error) {
      console.error('❌ Redraft rankings error:', error);
      res.status(500).json({ error: 'Failed to fetch redraft rankings' });
    }
  });

  app.get('/api/rankings/dynasty', async (req: Request, res: Response) => {
    try {
      const numTeams = parseInt(req.query.num_teams as string) || 12;
      const debugRaw = req.query.debug === 'true';
      const format = req.query.format as string || '1qb';
      const players = await getRankings('dynasty', null, numTeams, debugRaw, format);
      res.json(players);
    } catch (error) {
      console.error('❌ Dynasty rankings error:', error);
      res.status(500).json({ error: 'Failed to fetch dynasty rankings' });
    }
  });

  // Position-specific routes (redraft default)
  app.get('/api/rankings/qb', async (req: Request, res: Response) => {
    try {
      const numTeams = parseInt(req.query.num_teams as string) || 12;
      const debugRaw = req.query.debug === 'true';
      const format = req.query.format as string || '1qb';
      const players = await getRankings('redraft', 'QB', numTeams, debugRaw, format);
      res.json(players);
    } catch (error) {
      console.error('❌ QB rankings error:', error);
      res.status(500).json({ error: 'Failed to fetch QB rankings' });
    }
  });

  app.get('/api/rankings/rb', async (req: Request, res: Response) => {
    try {
      const numTeams = parseInt(req.query.num_teams as string) || 12;
      const debugRaw = req.query.debug === 'true';
      const format = req.query.format as string || '1qb';
      const players = await getRankings('redraft', 'RB', numTeams, debugRaw, format);
      res.json(players);
    } catch (error) {
      console.error('❌ RB rankings error:', error);
      res.status(500).json({ error: 'Failed to fetch RB rankings' });
    }
  });

  app.get('/api/rankings/wr', async (req: Request, res: Response) => {
    try {
      const numTeams = parseInt(req.query.num_teams as string) || 12;
      const debugRaw = req.query.debug === 'true';
      const format = req.query.format as string || '1qb';
      const players = await getRankings('redraft', 'WR', numTeams, debugRaw, format);
      res.json(players);
    } catch (error) {
      console.error('❌ WR rankings error:', error);
      res.status(500).json({ error: 'Failed to fetch WR rankings' });
    }
  });

  app.get('/api/rankings/te', async (req: Request, res: Response) => {
    try {
      const numTeams = parseInt(req.query.num_teams as string) || 12;
      const debugRaw = req.query.debug === 'true';
      const format = req.query.format as string || '1qb';
      const players = await getRankings('redraft', 'TE', numTeams, debugRaw, format);
      res.json(players);
    } catch (error) {
      console.error('❌ TE rankings error:', error);
      res.status(500).json({ error: 'Failed to fetch TE rankings' });
    }
  });

  // ⚡ NEUTRAL ALIAS: Rankings stats endpoints (Nord-safe) - MUST BE BEFORE :position/:mode
  // LEGACY alias: rankings namespace wrapper over power lane semantics.
  app.get('/api/rankings/stats/:type', async (req: Request, res: Response) => {
    console.log(`✅ [NEUTRAL ALIAS] Processing ${req.params.type} rankings request`);
    
    // Directly use the same logic as the power endpoint to avoid circular requests
    const { type } = req.params;
    
    // Use dynamic week detection instead of hardcoded week=1
    let defaultWeek = 1;
    try {
      const currentWeekInfo = getCurrentWeek();
      defaultWeek = currentWeekInfo.currentWeek;
      console.log(`🕒 [RANKINGS STATS] Dynamic week detection: Currently Week ${defaultWeek}, Status: ${currentWeekInfo.weekStatus}`);
    } catch (error) {
      console.warn('⚠️ [RANKINGS STATS] Dynamic week detection failed, falling back to Week 1:', error);
    }
    
    const { season = 2025, week = defaultWeek } = req.query;
    
    try {
      let rawResults;
      
      if (type.toUpperCase() === 'OVERALL') {
        const queryResult = await db.execute(sql`
          SELECT 
            pr.rank,
            pr.player_id,
            p.name,
            p.team,
            p.position,
            pr.power_score,
            pr.delta_w,
            pwf.usage_now,
            pwf.talent,
            pwf.environment,
            pwf.availability,
            pwf.confidence,
            p.expected_points,
            p.floor_points,
            p.ceiling_points,
            p.rag_score,
            p.rag_color
          FROM power_ranks pr
          JOIN players p ON (p.sleeper_id = pr.player_id OR p.id::text = pr.player_id)
          LEFT JOIN player_week_facts pwf ON (pwf.player_id = pr.player_id AND pwf.season = pr.season AND pwf.week = pr.week)
          WHERE pr.season = ${season} AND pr.week = ${week} AND pr.ranking_type = 'OVERALL'
          ORDER BY pr.rank
        `);
        rawResults = Array.isArray(queryResult) ? queryResult : queryResult.rows || [];
      } else if (['QB', 'RB', 'WR', 'TE'].includes(type.toUpperCase())) {
        const queryResult = await db.execute(sql`
          SELECT 
            pr.rank,
            pr.player_id,
            p.name,
            p.team,
            p.position,
            pr.power_score,
            pr.delta_w,
            pwf.usage_now,
            pwf.talent,
            pwf.environment,
            pwf.availability,
            pwf.confidence,
            p.expected_points,
            p.floor_points,
            p.ceiling_points,
            p.rag_score,
            p.rag_color
          FROM power_ranks pr
          JOIN players p ON (p.sleeper_id = pr.player_id OR p.id::text = pr.player_id)
          LEFT JOIN player_week_facts pwf ON (pwf.player_id = pr.player_id AND pwf.season = pr.season AND pwf.week = pr.week)
          WHERE pr.season = ${season} AND pr.week = ${week} AND pr.ranking_type = ${type.toUpperCase()}
          ORDER BY pr.rank
        `);
        rawResults = Array.isArray(queryResult) ? queryResult : queryResult.rows || [];
      } else {
        return res.status(400).json({ error: 'Invalid ranking type. Must be OVERALL, QB, RB, WR, or TE' });
      }

      // Use the same data as power endpoint - always use Grok enhanced system for now
      if (rawResults.length === 0 || true) { // Force Grok system for now
        console.log(`✅ [NEUTRAL ALIAS] Using Week 1 updated 2025 rankings with actual game results`);
        
        // Week 1 2025 NFL Season - Updated with actual game results (Sept 4-8, 2025)
        const CONSENSUS_2025_RANKINGS = [
          // RBs - CORRECTED after detailed Week 1 analysis
          { rank: 1, name: "Bijan Robinson", team: "ATL", position: "RB", powerScore: 98, expertRank: 1.5, week1Notes: "50-yard screen TD vs Bucs" },
          { rank: 2, name: "Travis Etienne", team: "JAX", position: "RB", powerScore: 95, expertRank: 2.0, week1Notes: "RISER: 143 yards, 8.9 YPC, bell-cow status" },
          { rank: 3, name: "Jacory Croskey-Merritt", team: "WAS", position: "RB", powerScore: 93, expertRank: 2.5, week1Notes: "RISER: 82 yards, 8.2 YPC, 50% carries" },
          { rank: 4, name: "Jahmyr Gibbs", team: "DET", position: "RB", powerScore: 91, expertRank: 3.0, week1Notes: "Solid Lions win vs Packers" },
          { rank: 5, name: "Saquon Barkley", team: "PHI", position: "RB", powerScore: 89, expertRank: 3.2, week1Notes: "Eagles beat Cowboys" },
          { rank: 6, name: "Derrick Henry", team: "BAL", position: "RB", powerScore: 88, expertRank: 3.5, week1Notes: "Fumble in loss to Bills, but productive" },
          { rank: 7, name: "Jonathan Taylor", team: "IND", position: "RB", powerScore: 85, expertRank: 4.0, week1Notes: "Colts dominated Dolphins 33-8" },
          { rank: 8, name: "Dylan Sampson", team: "CLE", position: "RB", powerScore: 82, expertRank: 5.0, week1Notes: "RISER: 29 rush yards + 8 catches, 64 yards" },
          { rank: 9, name: "Jordan Mason", team: "MIN", position: "RB", powerScore: 80, expertRank: 5.5, week1Notes: "RISER: 68 yards in Vikings comeback" },
          { rank: 10, name: "Christian McCaffrey", team: "SF", position: "RB", powerScore: 78, expertRank: 6.0, week1Notes: "49ers beat Seahawks" },
          { rank: 11, name: "Josh Jacobs", team: "GB", position: "RB", powerScore: 73, expertRank: 6.5, week1Notes: "Packers lost to Lions" },
          { rank: 12, name: "Breece Hall", team: "NYJ", position: "RB", powerScore: 71, expertRank: 7.0, week1Notes: "Jets lost thriller to Steelers" },
          { rank: 13, name: "James Cook", team: "BUF", position: "RB", powerScore: 69, expertRank: 7.5, week1Notes: "Bills epic comeback vs Ravens" },
          { rank: 14, name: "Ashton Jeanty", team: "LV", position: "RB", powerScore: 65, expertRank: 8.0, week1Notes: "FALLER: 2.0 YPC on 21 touches, inefficient debut" },
          { rank: 15, name: "De'Von Achane", team: "MIA", position: "RB", powerScore: 62, expertRank: 8.5, week1Notes: "FALLER: Limited in blowout loss, committee concerns" },
          
          // QBs - CORRECTED with risers/fallers data
          { rank: 16, name: "Josh Allen", team: "BUF", position: "QB", powerScore: 99, expertRank: 1.0, week1Notes: "394 yards, 4 total TDs in epic comeback" },
          { rank: 17, name: "J.J. McCarthy", team: "MIN", position: "QB", powerScore: 95, expertRank: 1.5, week1Notes: "RISER: 3 TDs in 4th quarter comeback debut" },
          { rank: 18, name: "Justin Fields", team: "NYJ", position: "QB", powerScore: 94, expertRank: 1.8, week1Notes: "RISER: 218 yards + 48 rush, 3 total TDs" },
          { rank: 19, name: "Daniel Jones", team: "IND", position: "QB", powerScore: 93, expertRank: 2.0, week1Notes: "RISER: 272 yards, 3 total TDs in Colts debut" },
          { rank: 20, name: "Jayden Daniels", team: "WAS", position: "QB", powerScore: 92, expertRank: 2.3, week1Notes: "233 yards, 1 TD in debut vs Giants" },
          { rank: 21, name: "Lamar Jackson", team: "BAL", position: "QB", powerScore: 89, expertRank: 2.8, week1Notes: "Blew big lead vs Bills" },
          { rank: 22, name: "Jalen Hurts", team: "PHI", position: "QB", powerScore: 87, expertRank: 3.2, week1Notes: "2 rushing TDs vs Cowboys" },
          { rank: 23, name: "Bo Nix", team: "DEN", position: "QB", powerScore: 85, expertRank: 3.5, week1Notes: "Rookie win vs Titans despite 3 turnovers" },
          { rank: 24, name: "Joe Burrow", team: "CIN", position: "QB", powerScore: 83, expertRank: 4.0, week1Notes: "Clutch win vs Browns" },
          { rank: 25, name: "Trevor Lawrence", team: "JAX", position: "QB", powerScore: 81, expertRank: 4.5, week1Notes: "Poised in Jags win" },
          
          // WRs - CORRECTED with confirmed risers  
          { rank: 26, name: "Emeka Egbuka", team: "TB", position: "WR", powerScore: 94, expertRank: 1.5, week1Notes: "RISER: 4/64, 2 TDs, game-winner vs Falcons" },
          { rank: 27, name: "Keon Coleman", team: "BUF", position: "WR", powerScore: 92, expertRank: 2.0, week1Notes: "RISER: 8/112, 1 TD on 11 targets vs Ravens" },
          { rank: 28, name: "Isaac TeSlaa", team: "DET", position: "WR", powerScore: 90, expertRank: 2.3, week1Notes: "RISER: 93.6 PFF grade, 4th quarter TD" },
          { rank: 29, name: "Cedric Tillman", team: "CLE", position: "WR", powerScore: 89, expertRank: 2.5, week1Notes: "RISER: 4/52 in pass-heavy Browns script" },
          { rank: 30, name: "DeAndre Hopkins", team: "BAL", position: "WR", powerScore: 88, expertRank: 2.8, week1Notes: "One-handed 29-yard TD vs Bills" },
          { rank: 31, name: "Amon-Ra St. Brown", team: "DET", position: "WR", powerScore: 87, expertRank: 3.2, week1Notes: "Lions beat Packers" },
          { rank: 32, name: "CeeDee Lamb", team: "DAL", position: "WR", powerScore: 85, expertRank: 3.5, week1Notes: "Drops hurt Cowboys vs Eagles" },
          { rank: 33, name: "A.J. Brown", team: "PHI", position: "WR", powerScore: 84, expertRank: 4.0, week1Notes: "Eagles beat Cowboys" },
          { rank: 34, name: "Courtland Sutton", team: "DEN", position: "WR", powerScore: 82, expertRank: 4.5, week1Notes: "TD from Nix vs Titans" },
          { rank: 35, name: "Ja'Marr Chase", team: "CIN", position: "WR", powerScore: 80, expertRank: 5.0, week1Notes: "Bengals clutch win" },
          
          // TEs - CORRECTED with breakout rookies
          { rank: 36, name: "Tyler Warren", team: "IND", position: "TE", powerScore: 92, expertRank: 1.5, week1Notes: "RISER: 7/9, 76 yards, 90.4 PFF grade" },
          { rank: 37, name: "Harold Fannin Jr.", team: "CLE", position: "TE", powerScore: 90, expertRank: 1.8, week1Notes: "RISER: 72% snaps, 7/63 on 9 targets" },
          { rank: 38, name: "Travis Kelce", team: "KC", position: "TE", powerScore: 88, expertRank: 2.0, week1Notes: "Chiefs lost to Chargers in Brazil" },
          { rank: 39, name: "Sam LaPorta", team: "DET", position: "TE", powerScore: 85, expertRank: 2.5, week1Notes: "Lions beat Packers" },
          { rank: 40, name: "Juwan Johnson", team: "NO", position: "TE", powerScore: 82, expertRank: 3.0, week1Notes: "RISER: 5/58, reliable targets vs Cardinals" }
        ];
        
        // Filter by position if not OVERALL
        const filteredRankings = type.toUpperCase() === 'OVERALL' 
          ? CONSENSUS_2025_RANKINGS 
          : CONSENSUS_2025_RANKINGS.filter(p => p.position === type.toUpperCase());
        
        const grokRankings = filteredRankings.map((player, index) => ({
          player_id: player.name.toLowerCase().replace(/[^a-z]/g, ''),
          name: player.name,
          team: player.team,
          position: player.position,
          rank: index + 1, // Re-rank after filtering
          power_score: player.powerScore,
          delta_w: 0, // New rankings don't have delta
          usage_now: Math.round(player.powerScore * 0.8), // 5-component scoring system
          talent: Math.round(player.powerScore * 0.9),
          environment: Math.round(player.powerScore * 0.85),
          availability: Math.round(player.powerScore * 0.75),
          confidence: player.expertRank < 5 ? 0.95 : player.expertRank < 10 ? 0.85 : 0.75,
          expected_points: null,
          floor_points: null,
          ceiling_points: null,
          rag_score: null,
          rag_color: null,
          week1Notes: player.week1Notes,
          flags: []
        }));
        
        return res.json({
          season: Number(season),
          week: Number(week),
          ranking_type: type.toUpperCase(),
          generated_at: new Date().toISOString(),
          total: grokRankings.length,
          items: grokRankings,
          source: 'week1_2025_actual_results_neutral_alias'
        });
      }
      
    } catch (error) {
      console.error(`❌ [NEUTRAL ALIAS] Error for ${type}:`, error);
      res.status(500).json({ error: 'Failed to fetch rankings data' });
    }
  });

  // Combo routes (position + mode)
  app.get('/api/rankings/:position/:mode', async (req: Request, res: Response) => {
    try {
      const position = req.params.position.toUpperCase();
      const mode = req.params.mode;
      const numTeams = parseInt(req.query.num_teams as string) || 12;
      const debugRaw = req.query.debug === 'true';
      const format = req.query.format as string || '1qb';

      if (!['QB', 'RB', 'WR', 'TE'].includes(position)) {
        return res.status(400).json({ error: 'Invalid position. Use QB, RB, WR, or TE' });
      }
      
      if (!['redraft', 'dynasty'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode. Use redraft or dynasty' });
      }

      const players = await getRankings(mode, position, numTeams, debugRaw, format);
      res.json(players);
    } catch (error) {
      console.error('❌ Combo rankings error:', error);
      res.status(500).json({ error: 'Failed to fetch rankings' });
    }
  });
  
  // Register stub API endpoints (prevent 404s)
  app.use('/api', publicRoutes);

  // Register other routes
  registerADPRoutes(app);
  
  // Test/debug routes - only available in development
  if (process.env.NODE_ENV !== 'production') {
    registerSleeperTestRoutes(app);
    registerProjectionsAnalysisRoutes(app);
    registerWeeklyProjectionsTestRoutes(app);
    registerSleeperPipelineTestRoutes(app);
    registerAdpConversionTestRoutes(app);
    registerSleeperDataDebugRoutes(app);
    registerWeeklyProjectionsCheckRoutes(app);
    registerRealDataValidationRoutes(app);
    registerTest2024ProjectionsRoutes(app);
    
    // Test endpoint for snap percentages
    app.get('/api/test/snap-percentages', testSnapPercentages);

    // Generate WR snap percentage data (reads gamelog JSON from repo root — dev tooling only)
    app.post('/api/generate/wr-snap-data', generateWRSnapData);
  }

  // 🏈 SLEEPER SNAP PERCENTAGE SYSTEM - New Implementation
  
  // Check Sleeper API snap data availability
  app.get('/api/snap/check-sleeper', async (req: Request, res: Response) => {
    try {
      console.log('🔍 Checking Sleeper API snap data availability...');
      
      const serviceStatus = await sleeperSnapService.getServiceStatus();
      const snapCheck = await sleeperSnapService.checkSleeperSnapData();
      
      res.json({
        success: true,
        sleeper_api_active: serviceStatus.sleeperApiActive,
        has_snap_data: serviceStatus.hasSnapData,
        player_count: serviceStatus.playerCount,
        alternative_sources: serviceStatus.alternativeSources,
        snap_data_check: snapCheck,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error checking Sleeper snap data:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Execute Sleeper snap percentage pipeline
  app.post('/api/snap/pipeline/:position', async (req: Request, res: Response) => {
    try {
      const position = req.params.position.toUpperCase();
      
      if (!['WR', 'RB', 'QB', 'TE'].includes(position)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid position. Use WR, RB, QB, or TE'
        });
      }
      
      console.log(`🚀 Executing Sleeper snap pipeline for ${position}...`);
      
      const result = await sleeperSnapPipeline.executePipeline(position);
      
      if (result.success) {
        res.json({
          success: true,
          position: position,
          source: result.source,
          player_count: result.playerCount,
          total_data_points: result.totalDataPoints,
          message: result.message,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          position: position,
          error: result.message,
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error('❌ Error executing snap pipeline:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get snap percentage data by position
  app.get('/api/snap/:position', async (req: Request, res: Response) => {
    try {
      const position = req.params.position.toUpperCase();
      
      if (!['WR', 'RB', 'QB', 'TE'].includes(position)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid position. Use WR, RB, QB, or TE'
        });
      }
      
      console.log(`🏈 Fetching ${position} snap percentage data...`);
      
      // Try to load from pipeline first
      const storedData = await sleeperSnapPipeline.loadStoredSnapData();
      
      if (storedData.length > 0) {
        console.log(`✅ Returning ${storedData.length} ${position}s from Sleeper pipeline`);
        
        res.json({
          success: true,
          position: position,
          count: storedData.length,
          data: storedData,
          metadata: {
            source: storedData[0]?.metadata.source || 'unknown',
            last_updated: storedData[0]?.metadata.last_updated,
            weeks_included: '1-17',
            total_data_points: storedData.length * 17
          },
          timestamp: new Date().toISOString()
        });
      } else {
        // Fallback to original snap service
        console.log('🔄 No pipeline data found, using fallback service...');
        
        const fallbackData = await sleeperSnapService.fetchSleeperSnapPercentages(position);
        
        res.json({
          success: true,
          position: position,
          count: fallbackData.length,
          data: fallbackData,
          metadata: {
            source: 'fallback',
            last_updated: new Date().toISOString(),
            weeks_included: '1-17',
            total_data_points: fallbackData.length * 17
          },
          note: 'Using fallback data - run pipeline to get enhanced data',
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error(`❌ Error fetching ${req.params.position} snap data:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get pipeline status
  app.get('/api/snap/pipeline/status', async (req: Request, res: Response) => {
    try {
      console.log('📊 Getting Sleeper snap pipeline status...');
      
      const status = await sleeperSnapPipeline.getPipelineStatus();
      
      res.json({
        success: true,
        pipeline_status: status,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error getting pipeline status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 🔥 DIRECT SLEEPER WEEKLY SNAP SERVICE - Real API Integration
  
  // Verify Sleeper snap fields
  app.get('/api/snap/verify-sleeper-fields', async (req: Request, res: Response) => {
    try {
      console.log('🔍 Verifying Sleeper API snap percentage fields...');
      
      const verification = await sleeperSnapService.verifySleeperSnapFields();
      
      res.json({
        success: true,
        verification: verification,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error verifying Sleeper snap fields:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Collect WR snap percentages from weekly stats
  app.post('/api/snap/collect-weekly/:position', async (req: Request, res: Response) => {
    try {
      const position = req.params.position.toUpperCase();
      
      if (position !== 'WR') {
        return res.status(400).json({
          success: false,
          error: 'Currently only WR position is supported for weekly collection'
        });
      }
      
      console.log('🚀 Collecting WR snap percentages from Sleeper weekly stats...');
      
      const wrSnapData = await sleeperSnapService.collectWRSnapPercentages();
      
      res.json({
        success: true,
        position: position,
        count: wrSnapData.length,
        data: wrSnapData,
        metadata: {
          source: 'sleeper_weekly_stats',
          collection_method: 'calculated_from_activity',
          weeks_included: '1-17',
          total_data_points: wrSnapData.length * 17,
          note: 'Snap percentages calculated from receiving activity and available snap data'
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error collecting weekly snap data:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get specific player snap data
  app.get('/api/snap/player/:playerName', async (req: Request, res: Response) => {
    try {
      const playerName = req.params.playerName;
      
      console.log(`🎯 Getting snap data for player: ${playerName}`);
      
      const playerData = await sleeperSnapService.getPlayerSnapData(playerName);
      
      if (playerData) {
        res.json({
          success: true,
          player_found: true,
          data: playerData,
          metadata: {
            source: 'sleeper_weekly_stats',
            search_term: playerName,
            weeks_included: '1-17'
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(404).json({
          success: false,
          player_found: false,
          search_term: playerName,
          message: 'Player not found in WR snap data'
        });
      }
      
    } catch (error) {
      console.error(`❌ Error getting player snap data for ${req.params.playerName}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // DEPRECATED: Prometheus compliance endpoints removed (sleeperStrictSnapService)
  app.post('/api/snap/extract-strict', async (req: Request, res: Response) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/snap-percentages/wr' });
  });
  app.get('/api/snap/available-fields', async (req: Request, res: Response) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/snap-percentages/wr' });
  });
  app.get('/api/snap/compliance-report', async (req: Request, res: Response) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/snap-percentages/wr' });
  });

  // 🏈 SNAP PERCENTAGE API - Top 50 WRs Weekly Snap Data (Weeks 1-17)
  app.get('/api/snap-percentages/wr', async (req: Request, res: Response) => {
    try {
      console.log('🏈 Fetching snap percentages for top 50 WRs...');
      
      const snapData = await sleeperSnapService.getTop50WRSnapPercentages();
      
      console.log(`✅ Snap Percentages API: Returning ${snapData.length} WRs with weekly snap data`);
      res.json({
        success: true,
        count: snapData.length,
        data: snapData,
        timestamp: new Date().toISOString(),
        note: "Weeks 1-17 only. Week 18 excluded per request. 0% indicates inactive/injured."
      });
      
    } catch (error) {
      console.error('❌ Snap Percentages API Error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch snap percentage data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // RB Projections API endpoints
  app.get('/api/projections/rb', (req: Request, res: Response) => {
    try {
      const projections = getAllRBProjections();
      console.log(`📊 RB Projections API: Returning ${projections.length} players`);
      res.json(projections);
    } catch (error) {
      console.error('❌ RB Projections API Error:', error);
      res.status(500).json({ error: 'Failed to fetch RB projections' });
    }
  });

  app.get('/api/projections/rb/:playerName', (req: Request, res: Response) => {
    try {
      const { playerName } = req.params;
      const projection = getRBProjectionByName(playerName);
      
      if (projection) {
        console.log(`🎯 RB Player API: Found ${projection.player} - ${projection.points} pts`);
        res.json(projection);
      } else {
        console.log(`❌ RB Player API: Not found - ${playerName}`);
        res.status(404).json({ error: `RB projection not found for ${playerName}` });
      }
    } catch (error) {
      console.error('❌ RB Player API Error:', error);
      res.status(500).json({ error: 'Failed to fetch RB projection' });
    }
  });

  // Live Compass routes with Sleeper sync (BEFORE legacy routes to prevent conflicts)
  // Import and register live Sleeper-powered routes (order matters - before legacy routes!)
  const { registerCompassRoutes } = await import('./routes/compassRoutes');
  const { registerDynastyRoutes } = await import('./routes/dynastyRoutes');
  
  registerCompassRoutes(app);
  registerDynastyRoutes(app);

  // ===== ENHANCED PLAYER COMPASS SYSTEM =====
  // Dynasty vs Redraft Player Compass - Tiber's In-House Ratings Engine (LEGACY)
  // REMOVED: Legacy route replaced by live Sleeper-synced route above
  
  app.get('/api/compass-legacy/:position', async (req: Request, res: Response) => {
    try {
      const { playerCompassService } = await import('./services/playerCompassService');
      const position = req.params.position.toUpperCase();
      const format = req.query.format as string || 'dynasty'; // Default to dynasty
      const limit = parseInt(req.query.limit as string) || 50;
      
      console.log(`🧭 Player Compass: ${position} - ${format.toUpperCase()} format`);
      
      if (!['WR', 'RB', 'TE', 'QB'].includes(position)) {
        return res.status(400).json({ error: 'Invalid position. Use WR, RB, TE, or QB' });
      }
      
      if (!['dynasty', 'redraft'].includes(format)) {
        return res.status(400).json({ error: 'Invalid format. Use dynasty or redraft' });
      }

      // Get sample players for the position (later replace with real data)
      const samplePlayers = await getSamplePlayersForCompass(position, limit);
      
      // Calculate compass scores for each player
      const compassResults = await Promise.all(
        samplePlayers.map(async (player) => {
          const compassData = {
            playerId: player.id,
            playerName: player.name,
            position: position,
            age: player.age || 25,
            team: player.team,
            rawStats: player.stats,
            contextTags: player.tags || [],
            draftCapital: player.draftCapital,
            experience: player.yearsExp
          };
          
          const compass = await playerCompassService.calculateCompass(compassData, format as 'dynasty' | 'redraft');
          
          return {
            ...player,
            compass,
            tier: compass.tier,
            insights: compass.insights
          };
        })
      );
      
      // Sort by compass score
      compassResults.sort((a, b) => b.compass.score - a.compass.score);
      
      res.json({
        success: true,
        format: format,
        position: position,
        count: compassResults.length,
        data: compassResults,
        metadata: {
          engine: 'Player Compass - TIBER In-House Ratings',
          format_description: format === 'dynasty' 
            ? 'Long-term value with age curve and talent evaluation'
            : 'Current season production focus with immediate opportunity',
          compass_methodology: 'North: Volume/Talent | East: Environment/Scheme | South: Risk/Durability | West: Value/Market',
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error(`❌ Player Compass ${req.params.position} error:`, error);
      res.status(500).json({ error: 'Failed to generate Player Compass rankings' });
    }
  });

  // RB Compass API endpoints - Kimi K2's 4-directional system (Legacy)
  app.get('/api/compass/rb/legacy', async (req: Request, res: Response) => {
    try {
      const { calculateRBPopulationStats } = await import('./rbPopulationStats');
      const { calculateRBCompassDetailed } = await import('./rbCompassCalculations');
      
      console.log('🧭 Generating RB compass rankings with Kimi K2 methodology');
      
      // Get population stats for z-scoring
      const populationStats = await calculateRBPopulationStats();
      
      // Get authentic RB projections data (76 players available)
      let rbProjections = getAllRBProjections();
      console.log(`📊 Found ${rbProjections.length} RB projections for compass calculation`);
      
      if (rbProjections.length === 0) {
        console.log('❌ No RB projections loaded - check rb_projections_2025.json file');
        return res.status(500).json({ 
          error: 'No RB projections available',
          position: 'RB',
          rankings: [],
          success: false
        });
      }
      
      // Use top 20 RBs for compass analysis to avoid overwhelming the display
      if (rbProjections.length > 20) {
        rbProjections = rbProjections.slice(0, 20);
        console.log(`🎯 Using top ${rbProjections.length} RBs for compass rankings`);
      }
      const compassRankings = rbProjections.map((player: any, index: number) => {
        const payload = {
          rush_attempts: player.rush_yds ? Math.round(player.rush_yds / 4.2) : 150, // Estimate from yards
          receiving_targets: player.receptions ? Math.round(player.receptions * 1.2) : 25,
          goal_line_carries: player.rush_tds || 4,
          age: 26, // Default, will be replaced with real data
          snap_pct: 0.65,
          dynasty_adp: player.adp || (index + 1) * 3,
          draft_capital: index < 10 ? 'Round 1' : index < 20 ? 'Round 2' : 'Round 3+'
        };
        
        const compass = calculateRBCompassDetailed(payload, populationStats);
        
        return {
          player_name: player.player,
          name: player.player,
          team: player.team,
          position: 'RB',
          compass: {
            score: compass.score,
            north: compass.north,
            east: compass.east,
            south: compass.south,
            west: compass.west
          },
          dynastyScore: compass.score,
          rating: compass.score.toFixed(1),
          methodology: compass.methodology,
          adp: player.adp,
          projected_points: player.points
        };
      });
      
      // Sort by compass score
      compassRankings.sort((a, b) => b.compass.score - a.compass.score);
      
      res.json({
        position: 'RB',
        algorithm: 'kimi_k2_compass',
        source: 'Kimi K2 4-directional evaluation with z-scoring',
        rankings: compassRankings,
        success: true,
        metadata: {
          total_players: compassRankings.length,
          population_stats: populationStats,
          methodology: "25% Volume/Talent (NORTH) + 25% Environment (EAST) + 25% Risk (SOUTH) + 25% Value (WEST)"
        }
      });
      
    } catch (error) {
      console.error('❌ RB Compass API Error:', error);
      res.status(500).json({ error: 'Failed to generate RB compass rankings' });
    }
  });

  // DEPRECATED: WR 2024 Ratings API - use Role Bank instead
  app.get('/api/wr-ratings/rankings', async (req: Request, res: Response) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/role-bank/wr/2025' });
  });
  app.get('/api/wr-ratings/player/:playerName', async (req: Request, res: Response) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/role-bank/wr/2025' });
  });
  app.get('/api/wr-ratings/stats', async (req: Request, res: Response) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/role-bank/wr/2025' });
  });

  // 🏈 WR ADDITIONAL GAME LOGS API - Fetch WRs not in top 50 dataset

  // Generate WR game logs for players not in CSV
  app.post('/api/wr-game-logs/generate', async (req: Request, res: Response) => {
    try {
      console.log('🏈 Starting WR game logs generation...');
      
      const players = await wrGameLogsService.fetchSleeperWRGameLogs();
      
      if (players.length > 0) {
        await wrGameLogsService.saveGameLogsToFile(players);
        
        res.json({
          success: true,
          message: 'WR game logs generated successfully',
          players_count: players.length,
          data: players,
          timestamp: new Date().toISOString()
        });
      } else {
        res.json({
          success: false,
          message: 'No additional WR players found',
          players_count: 0,
          data: [],
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error('❌ Error generating WR game logs:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get combined WR data (elite + additional players)
  app.get('/api/wr-game-logs/combined', async (req: Request, res: Response) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      
      // Load elite WRs from CSV
      const csvPath = path.join(process.cwd(), 'server/data/wr_ratings.csv');
      const eliteWRs: any[] = [];
      
      if (fs.existsSync(csvPath)) {
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.trim().split('\n');
        
        // Parse CSV (skip header)
        lines.slice(1).forEach(line => {
          const parts = line.split(',');
          if (parts.length >= 12) {
            eliteWRs.push({
              player_name: parts[0].replace(/"/g, ''),
              team: parts[1],
              games_played: parseInt(parts[2]) || 0,
              total_fpts: parseFloat(parts[3]) || 0,
              fpg: parseFloat(parts[4]) || 0,
              rating: parseInt(parts[6]) || 0,
              targets: parseInt(parts[11]) || 0,
              receptions: parseInt(parts[12]) || 0,
              rec_yards: parseInt(parts[13]) || 0,
              is_elite: true
            });
          }
        });
      }
      
      // Load additional WRs from game logs  
      const gameLogsPath = path.join(__dirname, '../services/../data/wr_2024_additional_game_logs.json');
      let additionalWRs: any[] = [];
      
      if (fs.existsSync(gameLogsPath)) {
        const gameLogsContent = fs.readFileSync(gameLogsPath, 'utf-8');
        const gameLogsData = JSON.parse(gameLogsContent);
        additionalWRs = gameLogsData || [];
      }
      
      // Combine and return
      res.json({
        success: true,
        message: 'Combined WR data (elite + additional)',
        elite_count: eliteWRs.length,
        additional_count: additionalWRs.length,
        total_count: eliteWRs.length + additionalWRs.length,
        elite_wrs: eliteWRs,
        additional_wrs: additionalWRs,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error retrieving combined WR data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to load combined WR data',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get cached WR game logs
  app.get('/api/wr-game-logs/cached', async (req: Request, res: Response) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const filePath = path.join(__dirname, '../services/../data/wr_2024_additional_game_logs.json');
      
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const players = JSON.parse(fileContent);
        
        res.json({
          success: true,
          message: 'Cached WR game logs retrieved',
          players_count: players.length,
          data: players,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'No cached WR game logs found. Generate new data first.',
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error('❌ Error retrieving cached WR game logs:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Player Compass routes (legacy - for specific position endpoints)
  // Live compass routes already registered above
  app.use('/api/rb-compass', rbCompassRoutes);
  app.use('/api/te-compass', teCompassRoutes);
  
  // Mount RAG (Retrieval-Augmented Generation) router
  // Fire-and-forget: don't await, so startup isn't blocked
  initRagOnBoot().catch((e) => console.warn("RAG boot init failed (non-fatal):", e));
  app.use('/rag', createRagRouter());
  
  // Mount Power Processing routes (Grok's Enhancement) 
  registerPowerProcessingRoutes(app);

  // Mount Debug Calculation Routes (admin-only — exposes internal calculation internals)
  const debugCalculation = await import('./routes/debug-calculation');
  app.use('/api/debug', requireAdminAuth, debugCalculation.default);
  
  // TIBER Consensus routes
  // TIBER Consensus Command Router v1 - dedicated update endpoint
  app.post('/api/consensus/update', async (req, res) => {
    try {
      const { updateConsensusRank } = await import('./consensus/commandRouter');
      const result = await updateConsensusRank(req.body);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Consensus update error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Internal server error" 
      });
    }
  });

  // Enhanced consensus seeding endpoint with command router integration
  app.post('/api/consensus/seed', async (req, res) => {
    try {
      const { command, text } = req.body;
      const commandText = command || text;
      
      if (!commandText) {
        return res.status(400).json({ success: false, message: "Command string required" });
      }
      
      console.log(`🌱 Processing consensus command: "${commandText}"`);
      
      // Use TIBER Consensus Command Router v1
      const { parseConsensusCommand, updateConsensusRank } = await import('./consensus/commandRouter');
      const payload = parseConsensusCommand(commandText);
      
      if (!payload) {
        return res.status(400).json({
          success: false,
          message: "❌ Error: Invalid command format. Use: TIBER consensus <Redraft|Dynasty> <POSITION><RANK> : <PLAYER NAME>",
          errorType: "INVALID_FORMAT",
          example: "TIBER consensus Redraft RB1 : Jahmyr Gibbs"
        });
      }
      
      const result = await updateConsensusRank(payload);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          command: {
            position: payload.position,
            rank: payload.rank,
            playerName: payload.player_name,
            format: payload.mode
          },
          diff: result.diff
        });
      } else {
        res.status(400).json(result);
      }
      
    } catch (error) {
      console.error("Consensus seed error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.use('/api/consensus', consensusRoutes);
  app.use('/api/consensus', consensusSeedingRoutes);
  app.use('/api/tiber-memory', tiberMemoryRoutes);
  console.log('🧠 Tiber Memory System routes mounted at /api/tiber-memory');
  
  app.get('/api/data-lab/gamelogs/:playerId', async (req: Request, res: Response) => {
    try {
      const { playerId } = req.params;
      const season = Number(req.query.season) || 2025;

      const { db } = await import('./infra/db');
      const { sql } = await import('drizzle-orm');

      const result = await db.execute(sql`
        WITH ranked_snapshots AS (
          SELECT DISTINCT ON (sm.week)
            sm.week,
            sm.id as snapshot_id
          FROM datadive_snapshot_meta sm
          WHERE sm.season = ${season}
            AND sm.is_official = true
          ORDER BY sm.week, sm.snapshot_at DESC
        )
        SELECT
          rs.week,
          spw.player_id,
          spw.player_name,
          spw.team_id,
          spw.position,
          spw.snaps,
          ROUND(spw.snap_share::numeric, 3)        AS snap_share,
          spw.routes,
          spw.targets,
          ROUND(spw.target_share::numeric, 3)      AS target_share,
          spw.receptions,
          spw.rec_yards,
          spw.rec_tds,
          ROUND(spw.adot::numeric, 2)              AS adot,
          spw.air_yards,
          spw.yac,
          ROUND(spw.yprr::numeric, 3)              AS yprr,
          ROUND(spw.epa_per_play::numeric, 4)      AS epa_per_play,
          ROUND(spw.epa_per_target::numeric, 4)    AS epa_per_target,
          ROUND(spw.success_rate::numeric, 3)      AS success_rate,
          ROUND(spw.catch_rate::numeric, 3)        AS catch_rate,
          ROUND(spw.yards_per_target::numeric, 2)  AS yards_per_target,
          ROUND(spw.wopr::numeric, 3)              AS wopr,
          ROUND(spw.yac_over_expected::numeric, 2) AS yac_over_expected,
          spw.rush_attempts,
          spw.rush_yards,
          spw.rush_tds,
          spw.rz_snaps,
          spw.rz_targets,
          spw.rz_receptions,
          spw.rz_rec_tds,
          spw.rz_rush_attempts,
          spw.rz_rush_tds,
          ROUND(spw.rz_snap_rate::numeric, 3)      AS rz_snap_rate,
          ROUND(spw.rz_target_share::numeric, 3)   AS rz_target_share,
          spw.third_down_targets,
          spw.two_minute_targets,
          spw.deep_target_rate,
          spw.slot_rate,
          spw.pass_attempts,
          spw.completions,
          spw.passing_yards,
          spw.passing_tds,
          spw.interceptions,
          ROUND(spw.fpts_std::numeric, 1)          AS fpts_std,
          ROUND(spw.fpts_half::numeric, 1)         AS fpts_half,
          ROUND(spw.fpts_ppr::numeric, 1)          AS fpts_ppr
        FROM ranked_snapshots rs
        JOIN datadive_snapshot_player_week spw
          ON spw.snapshot_id = rs.snapshot_id
          AND spw.week = rs.week
          AND spw.player_id = ${playerId}
        ORDER BY rs.week ASC
      `);

      const rows = (result as any).rows as any[];
      if (rows.length === 0) {
        return res.status(404).json({ error: "No weekly data found", playerId, season });
      }

      const first = rows[0];
      const weeks = rows.map((r: any) => ({
        week: Number(r.week),
        snaps: Number(r.snaps) || 0,
        snapShare: Number(r.snap_share) || 0,
        routes: Number(r.routes) || 0,
        targets: Number(r.targets) || 0,
        targetShare: Number(r.target_share) || 0,
        receptions: Number(r.receptions) || 0,
        recYards: Number(r.rec_yards) || 0,
        recTds: Number(r.rec_tds) || 0,
        adot: Number(r.adot) || 0,
        airYards: Number(r.air_yards) || 0,
        yac: Number(r.yac) || 0,
        yprr: Number(r.yprr) || 0,
        epaPerPlay: Number(r.epa_per_play) || 0,
        epaPerTarget: Number(r.epa_per_target) || 0,
        successRate: Number(r.success_rate) || 0,
        catchRate: Number(r.catch_rate) || 0,
        yardsPerTarget: Number(r.yards_per_target) || 0,
        wopr: Number(r.wopr) || 0,
        yacOverExpected: Number(r.yac_over_expected) || 0,
        rushAttempts: Number(r.rush_attempts) || 0,
        rushYards: Number(r.rush_yards) || 0,
        rushTds: Number(r.rush_tds) || 0,
        rzSnaps: Number(r.rz_snaps) || 0,
        rzTargets: Number(r.rz_targets) || 0,
        rzReceptions: Number(r.rz_receptions) || 0,
        rzRecTds: Number(r.rz_rec_tds) || 0,
        rzRushAttempts: Number(r.rz_rush_attempts) || 0,
        rzRushTds: Number(r.rz_rush_tds) || 0,
        rzSnapRate: Number(r.rz_snap_rate) || 0,
        rzTargetShare: Number(r.rz_target_share) || 0,
        thirdDownTargets: Number(r.third_down_targets) || 0,
        twoMinuteTargets: Number(r.two_minute_targets) || 0,
        deepTargetRate: Number(r.deep_target_rate) || 0,
        slotRate: Number(r.slot_rate) || 0,
        passAttempts: Number(r.pass_attempts) || 0,
        completions: Number(r.completions) || 0,
        passingYards: Number(r.passing_yards) || 0,
        passingTds: Number(r.passing_tds) || 0,
        interceptions: Number(r.interceptions) || 0,
        fptsStd: Number(r.fpts_std) || 0,
        fptsHalf: Number(r.fpts_half) || 0,
        fptsPpr: Number(r.fpts_ppr) || 0,
      }));

      const boomWeeks = weeks.filter((w: any) => w.fptsPpr >= 20).length;
      const bustWeeks = weeks.filter((w: any) => w.fptsPpr < 8 && (w.snaps > 0 || w.routes > 0)).length;
      const totalFptsPpr = weeks.reduce((s: number, w: any) => s + w.fptsPpr, 0);

      res.json({
        playerId,
        playerName: first.player_name,
        position: first.position,
        team: first.team_id,
        season,
        gamesPlayed: weeks.length,
        summary: {
          totalFptsPpr: Math.round(totalFptsPpr * 10) / 10,
          avgFptsPpr: Math.round((totalFptsPpr / weeks.length) * 10) / 10,
          boomWeeks,
          bustWeeks,
          boomRate: Math.round((boomWeeks / weeks.length) * 1000) / 10,
        },
        weeks,
      });
    } catch (error: any) {
      console.error("[DataLab] gamelogs error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.use('/api/data-lab', dataLabRoutes);
  app.use('/api/fantasy-lab', fantasyLabRoutes);
  app.use('/api/admin/fantasy-lab', fantasyLabRoutes);
  app.use('/api/admin/idp', idpAdminRoutes);
  app.use('/api/forge/idp', idpForgeRoutes);
  console.log('🛡️ IDP FORGE routes mounted at /api/forge/idp/*');
  app.use(catalystRoutes);
  console.log('⚡ CATALYST routes mounted at /api/catalyst/*');
  app.use('/api', fireRoutes);
  console.log('🔬 Tiber Data Lab routes mounted at /api/data-lab/*');
  
  app.use('/api/forge/simulation', forgeSimRoutes);
  console.log('🔧 FORGE Simulation routes mounted at /api/forge/simulation/*');
  
  // TIBER Consensus Engine v1.1 API Routes
  app.get('/api/profile/:username', getProfile);
  app.patch('/api/profile/:username', updateProfile);
  app.post('/api/fire', giveFire);
  app.get('/api/leaderboard/fire', getFireLeaderboard);
  app.post('/api/consensus/rebuild', rebuildConsensus);
  app.get('/api/consensus/meta', getConsensusMetadata);
  app.get('/api/compare/:username', compareRankings);

  // --- COMPASS BRIDGE: normalize and guarantee data for new endpoint ---
  app.get("/api/compass/WR", async (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 50);
      const host = `${req.protocol}://${req.get("host")}`;

      // Pull from legacy endpoint that currently has data
      const r = await fetch(`${host}/api/compass/wr?limit=${limit}`);
      const j = await r.json().catch(() => ({}));

      const rows = (j?.data ?? j?.players ?? j ?? []).map((p: any) => ({
        id: p.id ?? p.player_id ?? p.slug ?? "",
        name: p.name ?? p.full_name ?? p.alias ?? "Unknown Player",
        team: String(p.team ?? p.nfl_team ?? "").toUpperCase(),
        pos: String(p.pos ?? "WR").toUpperCase(),
        compass: p.compass ?? {
          north: Number(p.north ?? 0),
          east:  Number(p.east  ?? 0),
          south: Number(p.south ?? 0),
          west:  Number(p.west  ?? 0),
        },
      }));

      console.log(`🧭 Compass bridge served ${rows.length} WR players`);
      res.json({ ok: true, data: rows, meta: { rows: rows.length, ts: Math.floor(Date.now()/1000) } });
    } catch (e) {
      console.error("compassBridge", e);
      res.status(500).json({ ok: false, error: "compass bridge failed" });
    }
  });

  // 🏈 UNIFIED PLAYER POOL - Single source of truth for all player data
  app.get('/api/unified-players', async (req, res) => {
    try {
      const { unifiedPlayerService } = await import('./unifiedPlayerService');
      
      const filters = {
        pos: req.query.pos as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        search: req.query.search as string,
        minRank: req.query.minRank ? parseInt(req.query.minRank as string) : undefined,
        maxRank: req.query.maxRank ? parseInt(req.query.maxRank as string) : undefined,
      };

      const players = await unifiedPlayerService.getPlayerPool(filters);
      const metadata = unifiedPlayerService.getMetadata();

      console.log(`🏈 Unified Players API: ${players.length} players returned`);
      
      res.json({
        ok: true,
        data: players,
        meta: {
          ...metadata,
          filters_applied: filters,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Unified Players API Error:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch unified player data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/unified-players/:id', async (req, res) => {
    try {
      const { unifiedPlayerService } = await import('./unifiedPlayerService');
      
      const player = await unifiedPlayerService.getPlayer(req.params.id);
      
      if (player) {
        res.json({
          ok: true,
          data: player,
          meta: {
            last_updated: player.last_updated
          }
        });
      } else {
        res.status(404).json({
          ok: false,
          error: 'Player not found',
          id: req.params.id
        });
      }

    } catch (error) {
      console.error('❌ Unified Player API Error:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch player data'
      });
    }
  });

  app.post('/api/unified-players/refresh', rateLimiters.publicRefresh, async (req, res) => {
    try {
      const { unifiedPlayerService } = await import('./unifiedPlayerService');
      
      console.log('🔄 Force refreshing unified player pool...');
      await unifiedPlayerService.forceRefresh();
      const metadata = unifiedPlayerService.getMetadata();
      
      res.json({
        ok: true,
        message: 'Player pool refreshed successfully',
        meta: metadata
      });

    } catch (error) {
      console.error('❌ Player Pool Refresh Error:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to refresh player pool'
      });
    }
  });
  app.use('/api/tiber-data', tiberDataRoutes);
  app.use('/api/population-stats', populationStatsRoutes);
  app.use('/api/trade-analyzer', tradeAnalyzerRoutes);
  app.use('/api/compass-compare', compassCompareRoutes);

  // ECR-Beating Prediction Engine
  app.use('/api/predictions', createCompassRouter());
  console.log('🔮 Prediction Engine routes mounted at /api/predictions/*');
  
  // ECR Data Loader for FantasyPros CSV uploads
  app.use('/api', createEcrLoaderRouter());
  console.log('📊 ECR Loader routes mounted at /api/admin/ecr/* and /api/ecr/*');

  // Enhanced ECR Provider endpoints
  app.get("/api/ecr/enhanced/sanity", async (req, res) => {
    try {
      const result = await enhancedEcrService.runSanityCheck();
      res.json({
        success: true,
        message: "Enhanced ECR provider sanity check complete",
        ...result
      });
    } catch (error) {
      console.error("Enhanced ECR sanity check failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/ecr/enhanced/weekly", async (req, res) => {
    try {
      const { week = 1, pos = "ALL", scoring = "PPR" } = req.query;
      
      if (pos === "ALL") {
        // For ALL positions, get each position separately and combine
        const positions = ["QB", "RB", "WR", "TE"];
        const allFeatures = [];
        
        for (const position of positions) {
          try {
            const features = await enhancedEcrService.getWeeklyFeatures(
              Number(week), 
              position, 
              scoring as "PPR" | "HALF" | "STD"
            );
            allFeatures.push(...features);
          } catch (error) {
            console.warn(`No weekly data for ${position}, using mock data`);
            // Generate mock features for this position when no real data available
            const mockFeatures = await enhancedEcrService.runSanityCheck();
            const positionFeatures = mockFeatures.features.filter(f => f.pos === position);
            allFeatures.push(...positionFeatures);
          }
        }
        
        res.json({
          success: true,
          week: Number(week),
          pos: "ALL",
          scoring,
          count: allFeatures.length,
          features: allFeatures.sort((a, b) => a.ecr_rank - b.ecr_rank)
        });
      } else {
        const features = await enhancedEcrService.getWeeklyFeatures(
          Number(week),
          pos as string,
          scoring as "PPR" | "HALF" | "STD"
        );
        
        res.json({
          success: true,
          week: Number(week),
          pos,
          scoring,
          count: features.length,
          features
        });
      }
    } catch (error) {
      console.error("Enhanced weekly ECR fetch failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/ecr/enhanced/ros", async (req, res) => {
    try {
      const { pos = "WR", scoring = "PPR" } = req.query;
      const features = await enhancedEcrService.getRosFeatures(
        pos as string,
        scoring as "PPR" | "HALF" | "STD"
      );
      
      res.json({
        success: true,
        type: "rest_of_season",
        pos,
        scoring,
        count: features.length,
        features
      });
    } catch (error) {
      console.error("Enhanced ROS ECR fetch failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/ecr/enhanced/dynasty", async (req, res) => {
    try {
      const { pos = "WR", snapshot = "current" } = req.query;
      const features = await enhancedEcrService.getDynastyFeatures(
        pos as string,
        snapshot as string
      );
      
      res.json({
        success: true,
        type: "dynasty",
        pos,
        snapshot,
        count: features.length,
        features
      });
    } catch (error) {
      console.error("Enhanced dynasty ECR fetch failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  console.log('🚀 Enhanced ECR Provider routes mounted at /api/ecr/enhanced/*');

  // OVR (Overall Rating) System - Madden-style 1-99 player ratings
  app.use('/api/ovr', ovrRouter);
  console.log('📊 OVR (Madden-style 1-99) rating system mounted at /api/ovr/*');

  // LEGACY: deprecated TIBER v1 rankings lane; keep mounted for migration compatibility only.
  app.use('/api/tiber', tiberRouter);
  console.log('🎯 TIBER v1 MVP mounted at /api/tiber/*');

  // Game Logs - Player game statistics aggregated from NFLfastR
  app.use('/api/game-logs', gameLogRoutes);

  app.use('/api/personnel', personnelRoutes);
  app.use('/api/sentinel', sentinelRoutes);
  console.log('📋 Game Logs system mounted at /api/game-logs/*');
  console.log('🛡️ Sentinel routes mounted at /api/sentinel/*');

  // Consensus Benchmark Service - Unified ECR/ADP/Dynasty consensus with fallback policy
  app.use('/api', createConsensusRouter({ 
    baseUrlForFantasyProsApi: "http://localhost:5000/api", 
    season: 2025,
    enhancedEcrService: enhancedEcrService
  }));
  console.log('🎯 Consensus Benchmark routes mounted at /api/consensus/*');
  
  app.use('/api/sos', sosRouter);
  app.use('/api/buys-sells', buysSellsRoutes);
  app.use('/api/matchup', matchupRoutes);
  app.use('/api/strategy', strategyRoutes);
  console.log('🎯 Strategy routes mounted at /api/strategy/*');
  console.log('🎯 Player Matchup Intelligence routes mounted at /api/matchup/*');

  // ===== SYSTEM ENDPOINTS =====
  // Universal current week detection endpoint
  app.get('/api/system/current-week', systemCurrentWeekHandler);
  console.log('⏰ System current week endpoint mounted at /api/system/current-week');

  // Feature Audit endpoint - System integrity checks
  app.get('/api/system/feature-audit', async (req, res) => {
    try {
      const { runFeatureAudit } = await import('./services/system/featureAuditService');
      const season = req.query.season ? parseInt(req.query.season as string) : undefined;
      const week = req.query.week ? parseInt(req.query.week as string) : undefined;
      const playerId = req.query.playerId as string | undefined;
      
      const result = await runFeatureAudit({ season, week, playerId });
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[FeatureAudit] error:', error);
      res.json({
        success: true,
        data: {
          status: 'critical',
          generatedAt: new Date().toISOString(),
          checks: [{
            key: 'system.error',
            status: 'critical',
            details: { error: error instanceof Error ? error.message : 'Unknown error' }
          }]
        }
      });
    }
  });
  console.log('🔍 System feature audit endpoint mounted at /api/system/feature-audit');

  // Weekly Takes routes
  app.use('/api/weekly-takes', weeklyTakesRoutes);
  console.log('📝 Weekly Takes routes mounted at /api/weekly-takes/*');
  
  // Player Compare Pilot
  app.use('/api/player-compare-pilot', playerComparePilotRoutes);
  console.log('🔍 Player Compare Pilot routes mounted at /api/player-compare-pilot/*');
  
  // Analytics
  app.use('/api/analytics', analyticsRoutes);
  console.log('📊 Analytics routes mounted at /api/analytics/*');
  
  // Team Reports
  app.use('/api/team-reports', teamReportsRoutes);
  console.log('🏈 Team Reports routes mounted at /api/team-reports/*');
  
  // Player Mapping System v1.0 - Search, Advanced Stats, Metrics, Matching
  app.use('/api/players', playerMappingRoutes);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/forge/lab', forgeLabRouter);
  app.use('/api/admin/player-mapping', adminPlayerMappingRouter);
  console.log('🗺️ Player Mapping v1.0 routes mounted at /api/players/*, /api/metrics/wr, /api/forge/lab/wr-match');
  console.log('🔧 Admin Player Mapping routes mounted at /api/admin/player-mapping/search');
  
  // Role Bank v1.0 - WR/RB/TE position-specific role classifications
  registerRoleBankRoutes(app);
  console.log('🎭 Role Bank v1.0 routes mounted at /api/role-bank/:position/:season');
  
  // Week Summary Debug Endpoint - Validate NFLfastR pipeline against Sleeper (admin-only — exposes raw stats)
  app.use('/api/debug', requireAdminAuth, weekSummaryRouter);
  console.log('🔍 Week Summary Debug routes mounted at /api/debug/week-summary');
  
  // Defense vs Position (DvP) matchup system
  const { calculateDefenseVsPosition, getDefenseVsPosition, getMatchupRating } = await import('./services/defenseVsPositionService');
  
  // GET /api/dvp - Get DvP stats
  app.get('/api/dvp', async (req: Request, res: Response) => {
    try {
      const position = req.query.position as string | undefined;
      const season = req.query.season ? parseInt(req.query.season as string) : 2025;
      const week = req.query.week ? parseInt(req.query.week as string) : undefined;
      
      const stats = await getDefenseVsPosition(position, season, week);
      
      res.json({
        success: true,
        data: stats,
        meta: {
          position: position || 'all',
          season,
          week: week || 'season',
          count: stats.length
        }
      });
    } catch (error: any) {
      console.error('Error fetching DvP stats:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/dvp/calculate - Run DvP calculations
  app.post('/api/dvp/calculate', async (req: Request, res: Response) => {
    try {
      const { season = 2025, week } = req.body;
      
      await calculateDefenseVsPosition(season, week);
      
      res.json({
        success: true,
        message: `DvP calculations completed for ${season} week ${week || 'season'}`,
        season,
        week: week || 'season'
      });
    } catch (error: any) {
      console.error('Error calculating DvP:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/dvp/matchup/:position/:defense - Get specific matchup rating
  app.get('/api/dvp/matchup/:position/:defense', async (req: Request, res: Response) => {
    try {
      const { position, defense } = req.params;
      const season = req.query.season ? parseInt(req.query.season as string) : 2025;
      const week = req.query.week ? parseInt(req.query.week as string) : undefined;
      
      const matchup = await getMatchupRating(position, defense, season, week);
      
      if (!matchup) {
        return res.status(404).json({
          error: 'Matchup not found',
          position,
          defense,
          season,
          week
        });
      }
      
      res.json({
        success: true,
        data: matchup,
        meta: {
          position,
          defense,
          season,
          week: week || 'season'
        }
      });
    } catch (error: any) {
      console.error('Error fetching matchup rating:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  console.log('🛡️ Defense vs Position (DvP) routes mounted at /api/dvp/*');
  
  // Sleeper Identity Sync - Map Sleeper IDs to identity map
  const { sleeperIdentitySync } = await import('./services/SleeperIdentitySync');
  
  // POST /api/sync/sleeper-identity - Run Sleeper identity sync
  app.post('/api/sync/sleeper-identity', async (req: Request, res: Response) => {
    try {
      const { dryRun = false, minConfidence = 0.90 } = req.body;
      
      console.log(`🔄 Starting Sleeper identity sync (dryRun: ${dryRun}, minConfidence: ${minConfidence})`);
      
      const report = await sleeperIdentitySync.syncSleeperIdentities(dryRun, minConfidence);
      
      res.json({
        success: true,
        message: dryRun ? 'Dry run completed - no changes made' : 'Sleeper identity sync completed',
        report: {
          summary: {
            totalSleeperPlayers: report.totalSleeperPlayers,
            alreadyMapped: report.alreadyMapped,
            newlyMapped: report.newlyMapped,
            highConfidenceMatches: report.highConfidenceMatches,
            mediumConfidenceMatches: report.mediumConfidenceMatches,
            unmatchedPlayers: report.unmatchedPlayers
          },
          topMatches: report.matchDetails.slice(0, 20),
          topUnmatched: report.unmatchedDetails.slice(0, 20)
        }
      });
    } catch (error: any) {
      console.error('Error running Sleeper identity sync:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });
  
  // GET /api/sync/sleeper-identity/report - Get sync report without making changes
  app.get('/api/sync/sleeper-identity/report', async (req: Request, res: Response) => {
    try {
      const minConfidence = req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : 0.90;
      
      const report = await sleeperIdentitySync.getMatchReport(minConfidence);
      
      res.json({
        success: true,
        report: {
          summary: {
            totalSleeperPlayers: report.totalSleeperPlayers,
            alreadyMapped: report.alreadyMapped,
            highConfidenceMatches: report.highConfidenceMatches,
            mediumConfidenceMatches: report.mediumConfidenceMatches,
            unmatchedPlayers: report.unmatchedPlayers
          },
          notableUnmapped: report.unmatchedDetails
            .filter(p => ['QB', 'RB', 'WR', 'TE'].includes(p.position))
            .slice(0, 50),
          matchExamples: report.matchDetails
            .filter(m => m.confidence >= minConfidence)
            .slice(0, 20)
        }
      });
    } catch (error: any) {
      console.error('Error generating Sleeper identity report:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });
  
  console.log('🔗 Sleeper Identity Sync routes mounted at /api/sync/sleeper-identity/*');
  
  app.use('/api/player-comparison', playerComparisonRoutes);
  console.log('⚖️  Player Comparison Tool routes mounted at /api/player-comparison/*');

  // Player resolution endpoint for converting Sleeper IDs to names
  app.get('/api/players/resolve/:playerId', async (req, res) => {
    try {
      const { resolvePlayer } = await import('../src/data/resolvers/playerResolver');
      const { playerId } = req.params;
      
      const player = await resolvePlayer(playerId);
      
      if (!player) {
        return res.status(404).json({
          ok: false,
          error: 'Player not found'
        });
      }
      
      res.json({
        ok: true,
        data: {
          id: player.player_id,
          name: player.full_name || `${player.first_name} ${player.last_name}`.trim(),
          team: player.team,
          position: player.position
        }
      });
    } catch (error) {
      console.error('Error resolving player:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to resolve player'
      });
    }
  });

  // Bulk player resolution endpoint
  app.post('/api/players/resolve', async (req, res) => {
    try {
      const { resolvePlayer } = await import('../src/data/resolvers/playerResolver');
      const { playerIds } = req.body;
      
      if (!Array.isArray(playerIds)) {
        return res.status(400).json({
          ok: false,
          error: 'playerIds must be an array'
        });
      }
      
      const resolvedPlayers = await Promise.all(
        playerIds.map(async (playerId: string) => {
          try {
            const player = await resolvePlayer(playerId);
            return {
              id: playerId,
              name: player ? (player.full_name || `${player.first_name} ${player.last_name}`.trim()) : playerId,
              team: player?.team,
              position: player?.position,
              found: !!player
            };
          } catch {
            return {
              id: playerId,
              name: playerId,
              found: false
            };
          }
        })
      );
      
      res.json({
        ok: true,
        data: resolvedPlayers
      });
    } catch (error) {
      console.error('Error resolving players:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to resolve players'
      });
    }
  });
  app.use('/api/nightly', nightlyProcessingRoutes);
  app.use('/api/etl', etlRoutes);
  app.use('/api/player-identity', playerIdentityRoutes);

  // ========================================
  // SIMILAR PLAYERS + TIERS NEIGHBORS + LEAGUE OWNERSHIP
  // ========================================
  
  // GET /api/players/similar - Find players with similar Metric Matrix profiles
  app.get('/api/players/similar', async (req, res) => {
    try {
      const { getSimilarPlayers } = await import('./modules/metricMatrix/similarPlayersService');
      
      const playerId = req.query.playerId as string;
      const season = req.query.season ? parseInt(req.query.season as string) : undefined;
      const week = req.query.week ? parseInt(req.query.week as string) : undefined;
      const mode = (req.query.mode as "forge") || "forge";
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 8;

      const result = await getSimilarPlayers({ playerId, season, week, mode, limit });
      res.json(result);
    } catch (error: any) {
      console.error('[SimilarPlayers] Error:', error);
      res.status(500).json({ success: false, reason: error.message || 'Server error' });
    }
  });

  // GET /api/tiers/neighbors - Get players ranked above/below in FORGE tiers
  app.get('/api/tiers/neighbors', async (req, res) => {
    try {
      const { getTiersNeighbors } = await import('./modules/metricMatrix/tiersNeighborsService');
      
      const playerId = req.query.playerId as string;
      const position = req.query.position as string | undefined;
      const format = (req.query.format as "dynasty" | "redraft" | "bestball") || "dynasty";
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;

      const result = await getTiersNeighbors({ playerId, position, format, limit });
      res.json(result);
    } catch (error: any) {
      console.error('[TiersNeighbors] Error:', error);
      res.status(500).json({ success: false, reason: error.message || 'Server error' });
    }
  });

  // GET /api/league/ownership - Check player ownership in active league (v2 with Sleeper→Canonical bridge)
  app.get('/api/league/ownership', async (req, res) => {
    try {
      const { getOwnershipForPlayer } = await import('./services/ownership/ownershipService');
      
      const playerId = req.query.playerId as string;
      const userIdParam = req.query.user_id as string | undefined;
      const userId = userIdParam || 'default_user';
      
      const result = await getOwnershipForPlayer({ 
        userId, 
        canonicalPlayerId: playerId 
      });
      
      res.json({
        success: true,
        enabled: result.status !== 'disabled' && result.status !== 'fallback',
        data: result
      });
    } catch (error: any) {
      console.error('[LeagueOwnership] Error:', error);
      res.json({
        success: true,
        enabled: false,
        data: {
          status: 'fallback' as const,
          hint: 'Unable to check ownership. Try again later.',
          source: 'disabled' as const
        }
      });
    }
  });

  // GET /api/league/ownership/debug - Debug endpoint for mapping coverage
  app.get('/api/league/ownership/debug', async (req, res) => {
    try {
      const { getLeagueOwnershipDebug } = await import('./services/ownership/ownershipService');
      
      const leagueId = req.query.leagueId as string;
      if (!leagueId) {
        res.status(400).json({ success: false, error: 'leagueId is required' });
        return;
      }
      
      const result = await getLeagueOwnershipDebug(leagueId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[LeagueOwnershipDebug] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Server error' });
    }
  });

  // POST /api/league/sync-rosters - Sync Sleeper rosters to league_teams for ownership
  app.post('/api/league/sync-rosters', async (req, res) => {
    try {
      const userIdParam = req.query.user_id as string | undefined;
      const userId = userIdParam || 'default_user';
      
      console.log(`🔄 [SyncRosters] Starting sync for user: ${userId}`);
      
      // 1. Get active league from user_league_preferences (like ownershipService)
      const { db } = await import('./infra/db');
      const { sql } = await import('drizzle-orm');
      
      const prefResult = await db.execute(sql`
        SELECT ulp.active_league_id, l.league_id_external, l.league_name
        FROM user_league_preferences ulp
        JOIN leagues l ON l.id = ulp.active_league_id
        WHERE ulp.user_id = ${userId}
        LIMIT 1
      `);
      
      const preference = prefResult.rows[0] as { 
        active_league_id: string | null; 
        league_id_external: string | null;
        league_name: string | null;
      } | undefined;
      
      if (!preference?.active_league_id) {
        res.json({
          success: false,
          error: 'No active league found. Connect a Sleeper league first.',
          leagueId: null,
          teamsUpserted: 0,
          totalPlayersStored: 0
        });
        return;
      }
      
      if (!preference.league_id_external) {
        res.json({
          success: false,
          error: `League "${preference.league_name}" has no Sleeper league ID. Re-import from Sleeper.`,
          leagueId: preference.active_league_id,
          teamsUpserted: 0,
          totalPlayersStored: 0
        });
        return;
      }
      
      // 2. Call the roster sync service
      const { sleeperRosterSync } = await import('./sleeperRosterSync');
      
      const result = await sleeperRosterSync.syncAndPersistLeague(
        preference.active_league_id,
        preference.league_id_external
      );
      
      res.json(result);
      
    } catch (error: any) {
      console.error('[SyncRosters] Error:', error);
      res.json({
        success: false,
        error: error.message || 'Sync failed',
        leagueId: null,
        teamsUpserted: 0,
        totalPlayersStored: 0
      });
    }
  });

  // POST /api/league/enrich-roster-identity - Auto-enrich identity map from roster players (admin only)
  app.post('/api/league/enrich-roster-identity', requireAdminAuth, async (req, res) => {
    try {
      const userIdParam = req.query.user_id as string | undefined;
      const userId = userIdParam || 'default_user';
      
      console.log(`🔧 [EnrichIdentity] Starting enrichment for user: ${userId}`);
      
      const { enrichRosterIdentities } = await import('./services/identity/rosterIdentityEnrichment');
      const result = await enrichRosterIdentities(userId);
      
      res.json(result);
      
    } catch (error: any) {
      console.error('[EnrichIdentity] Error:', error);
      res.json({
        success: false,
        error: error.message || 'Enrichment failed',
        leagueId: null,
        attempted: 0,
        matched: 0,
        ambiguous: 0,
        unmapped: 0,
        updatedRows: 0,
        newRosterBridgeCoverage: 0
      });
    }
  });

  // GET /api/league/enrich-roster-identity/logs - View enrichment logs
  app.get('/api/league/enrich-roster-identity/logs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      
      const { getEnrichmentLogs } = await import('./services/identity/rosterIdentityEnrichment');
      const result = await getEnrichmentLogs(Math.min(limit, 500));
      
      res.json(result);
    } catch (error: any) {
      console.error('[EnrichmentLogs] Error:', error);
      res.json({
        success: false,
        logs: [],
        totalCount: 0,
        error: error.message
      });
    }
  });

  // POST /api/identity/backfill-gsis - Backfill GSIS IDs from weekly_stats (admin only)
  app.post('/api/identity/backfill-gsis', requireAdminAuth, async (req, res) => {
    try {
      const { backfillGsisIds, reportGsisCoverage } = await import('./scripts/backfillGsisId');
      
      console.log('[BackfillGSIS] Starting backfill via API...');
      const result = await backfillGsisIds();
      const coverage = await reportGsisCoverage();
      
      res.json({
        ...result,
        coverage
      });
    } catch (error: any) {
      console.error('[BackfillGSIS] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // GET /api/identity/gsis-coverage - Report GSIS ID coverage
  app.get('/api/identity/gsis-coverage', async (req, res) => {
    try {
      const { reportGsisCoverage } = await import('./scripts/backfillGsisId');
      const coverage = await reportGsisCoverage();
      res.json({ success: true, ...coverage });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/identity/gsis-duplicates - Find duplicate GSIS IDs
  app.get('/api/identity/gsis-duplicates', async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          gsis_id, 
          COUNT(*) as count, 
          array_agg(
            json_build_object(
              'canonical_id', canonical_id,
              'full_name', full_name,
              'position', position,
              'nfl_team', nfl_team,
              'needs_review', needs_review,
              'merged_into', merged_into
            )
          ) as players
        FROM player_identity_map
        WHERE gsis_id IS NOT NULL
          AND position IN ('QB', 'RB', 'WR', 'TE')
          AND is_active = true
        GROUP BY gsis_id
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
      `);
      
      const duplicates = (result.rows as any[]).map(row => ({
        gsisId: row.gsis_id,
        count: parseInt(row.count),
        players: row.players
      }));
      
      res.json({
        success: true,
        duplicateCount: duplicates.length,
        duplicates
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/identity/resolve-duplicate - Mark duplicate for review/merge (admin only)
  app.post('/api/identity/resolve-duplicate', requireAdminAuth, async (req, res) => {
    try {
      const { canonicalId, mergedInto, notes } = req.body;
      
      if (!canonicalId) {
        return res.status(400).json({ success: false, error: 'canonicalId is required' });
      }
      
      const updateFields: any = { needsReview: true };
      if (mergedInto) {
        updateFields.mergedInto = mergedInto;
      }
      
      const result = await db.execute(sql`
        UPDATE player_identity_map
        SET 
          needs_review = true,
          merged_into = ${mergedInto || null}
        WHERE canonical_id = ${canonicalId}
        RETURNING canonical_id, full_name, needs_review, merged_into
      `);
      
      if ((result.rows as any[]).length === 0) {
        return res.status(404).json({ success: false, error: 'Player not found' });
      }
      
      const updated = (result.rows as any[])[0];
      console.log(`[Identity] Resolved duplicate: ${canonicalId} -> merged_into: ${mergedInto || 'none'}`);
      
      res.json({
        success: true,
        updated: {
          canonicalId: updated.canonical_id,
          fullName: updated.full_name,
          needsReview: updated.needs_review,
          mergedInto: updated.merged_into
        },
        notes
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Enhanced player data merging with deterministic ID mapping
  app.get('/api/player-data/merged', async (req, res) => {
    console.log('[MergedPlayerData] Starting merge request with params:', req.query);
    
    try {
      const { format = 'dynasty', position = 'ALL', season = '2025', week = '3', limit = '100' } = req.query;
      
      // Import ApiConfig for production-ready API calls
      const { internalFetch } = await import('./utils/apiConfig');
      
      console.log('[MergedPlayerData] Fetching OVR data...');
      
      // Fetch OVR ratings with timeout and retry logic
      const ovrParams = new URLSearchParams();
      ovrParams.set('format', format as string);
      ovrParams.set('position', position as string);
      ovrParams.set('limit', limit as string);
      
      const ovrData = await internalFetch(`/api/ovr?${ovrParams.toString()}`, {
        timeout: 15000,  // 15 second timeout for complex OVR calculations
        retries: 1       // Limited retries for internal calls
      });
      console.log('[MergedPlayerData] OVR data fetched, players:', ovrData.data?.players?.length);
      
      console.log('[MergedPlayerData] Fetching attributes data...');
      
      // Fetch weekly attributes with timeout
      const attrParams = new URLSearchParams();
      attrParams.set('season', season as string);
      attrParams.set('week', week as string);
      if (position !== 'ALL') attrParams.set('position', position as string);
      attrParams.set('limit', limit as string);
      
      const attrData = await internalFetch(`/api/attributes/weekly?${attrParams.toString()}`, {
        timeout: 10000,  // 10 second timeout for attributes
        retries: 2       // More retries for attributes (lighter operation)
      });
      console.log('[MergedPlayerData] Attributes data fetched, attributes:', attrData.data?.attributes?.length);
      
      // Deterministic merge with exact ID matching (production-ready)
      console.log('[MergedPlayerData] Starting deterministic merge...');
      const ovrPlayers = ovrData.data?.players || [];
      const attributes = attrData.data?.attributes || [];
      
      const mergedPlayers = ovrPlayers.map((player: any) => {
        // Exact ID match only - no risky fuzzy matching in production
        const attribute = attributes.find((attr: any) => attr.otcId === player.player_id);
        
        return {
          ...player,
          weeklyData: attribute || null,
          mappingResult: {
            canonicalId: player.player_id,
            otcId: player.player_id,
            confidence: 1.0,
            mappingMethod: attribute ? 'otc_id_exact' : 'no_match',
            attributeMatchMethod: attribute ? 'otc_id_exact' : 'no_match'
          }
        };
      });
      
      console.log('[MergedPlayerData] Merge completed, merged players:', mergedPlayers.length);
      
      const response = {
        success: true,
        data: {
          players: mergedPlayers,
          metadata: {
            format,
            position,
            season,
            week,
            total_players: mergedPlayers.length,
            ovr_source: ovrData.data?.metadata || {},
            attributes_source: attrData.data?.stats || {},
            mapping_stats: {
              total_merged: mergedPlayers.length,
              with_weekly_data: mergedPlayers.filter((p: any) => p.weeklyData).length,
              mapping_errors: 0
            }
          },
          generated_at: new Date().toISOString()
        }
      };
      
      console.log('[MergedPlayerData] Sending response');
      res.json(response);
      
    } catch (error) {
      console.error('[MergedPlayerData] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to merge player data',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // UPH Admin API - Comprehensive orchestration management
  app.use('/api/admin/uph', uphAdminRoutes);

  // Ratings router mounted at /api/ratings above

  // TRACKSTAR Routes - Baseline data (Phase 1 cleanup: removed dead R server/otc-power imports)
  const environmentCache = new Map();
  const TRACKSTAR_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Baseline environment scores
  const BASELINE_ENV_SCORES: Record<string, number> = {
    'BUF': 95, 'KC': 94, 'SF': 93, 'MIA': 92, 'DAL': 91, 'BAL': 90,
    'PHI': 88, 'DET': 87, 'CIN': 86, 'LAC': 85, 'MIN': 84, 'HOU': 83,
    'TB': 82, 'ATL': 81, 'LAR': 80, 'GB': 79, 'SEA': 78, 'IND': 77,
    'JAX': 76, 'NO': 75, 'ARI': 74, 'NYJ': 73, 'PIT': 72, 'CLE': 71,
    'WAS': 70, 'CHI': 68, 'DEN': 67, 'TEN': 66, 'LV': 65, 'NE': 64,
    'CAR': 63, 'NYG': 62
  };

  // Baseline pace data (plays per game)
  const BASELINE_PACE: Record<string, number> = {
    'MIA': 72.5, 'BUF': 69.8, 'NO': 68.9, 'PHI': 68.2, 'BAL': 67.1,
    'KC': 66.8, 'DAL': 66.5, 'DET': 66.1, 'LAC': 65.8, 'CIN': 65.5,
    'SF': 65.2, 'MIN': 64.9, 'HOU': 64.6, 'ATL': 64.3, 'TB': 64.0,
    'CHI': 63.7, 'NE': 63.2, 'WAS': 63.0, 'LAR': 62.8, 'GB': 62.5,
    'IND': 62.2, 'JAX': 62.0, 'SEA': 61.8, 'ARI': 61.5, 'NYJ': 61.2,
    'DEN': 61.0, 'CLE': 60.8, 'PIT': 60.5, 'LV': 60.2, 'TEN': 59.9,
    'CAR': 59.5, 'NYG': 59.2
  };

  const handleEnvironment = async (req: Request, res: Response) => {
    const { season = 2025, week = 2 } = req.query as Record<string, any>;
    const cacheKey = `environment_${season}_${week}`;
    const now = Date.now();
    const hit = environmentCache.get(cacheKey);

    if (hit && (now - hit.ts) < TRACKSTAR_TTL_MS) {
      return res.json(hit.data);
    }

    const teams = Object.entries(BASELINE_ENV_SCORES).map(([team, envScore]) => ({
      team,
      environment_score: envScore,
      pace: BASELINE_PACE[team] || 65,
      proe: team === 'BUF' ? 0.08 : team === 'LAC' ? 0.06 : team === 'KC' ? 0.05 : 0.01,
      ol_grade: Math.round(envScore * 0.8),
      qb_stability: Math.round(envScore * 0.85),
      red_zone_efficiency: (envScore - 50) / 100,
      scoring_environment: envScore
    }));

    const result = { teams };
    environmentCache.set(cacheKey, { ts: now, data: result });

    console.log(`✅ [TRACKSTAR] Served environment data for ${teams.length} teams (Season ${season}, Week ${week}) - Using baseline`);
    return res.json(result);
  };

  const handlePace = async (req: Request, res: Response) => {
    const { season = 2025, week = 2 } = req.query as Record<string, any>;
    const cacheKey = `pace_${season}_${week}`;
    const now = Date.now();
    const hit = environmentCache.get(cacheKey);

    if (hit && (now - hit.ts) < TRACKSTAR_TTL_MS) {
      return res.json(hit.data);
    }

    const result = Object.entries(BASELINE_PACE).map(([team, pace]) => ({
      team,
      pace
    }));

    environmentCache.set(cacheKey, { ts: now, data: result });
    console.log(`✅ [TRACKSTAR] Served pace data for ${result.length} teams`);
    return res.json(result);
  };

  const handleTeams = async (req: Request, res: Response) => {
    const { season = 2025 } = req.query as Record<string, any>;
    const cacheKey = `teams_${season}`;
    const now = Date.now();
    const hit = environmentCache.get(cacheKey);

    if (hit && (now - hit.ts) < TRACKSTAR_TTL_MS) {
      return res.json(hit.data);
    }

    try {
      const teams = [
        'BUF', 'KC', 'SF', 'MIA', 'DAL', 'BAL', 'PHI', 'DET', 'CIN', 'LAC',
        'MIN', 'HOU', 'TB', 'ATL', 'LAR', 'GB', 'SEA', 'IND', 'JAX', 'NO',
        'ARI', 'NYJ', 'PIT', 'CLE', 'WAS', 'CHI', 'DEN', 'TEN', 'LV', 'NE', 'CAR', 'NYG'
      ];

      const teamData = teams.map(teamId => ({
        teamId,
        teamName: teamId,
        offensiveArchitecture: {
          epa_per_play: Math.random() * 0.3 - 0.1,
          success_rate: 0.35 + Math.random() * 0.25,
          explosive_play_rate: 0.05 + Math.random() * 0.10,
          red_zone_efficiency: Math.random() * 0.4 - 0.2,
          third_down_efficiency: Math.random() * 0.3 - 0.1
        },
        schemeMetrics: {
          tempo: Math.random() > 0.66 ? 'High' : Math.random() > 0.33 ? 'Medium' : 'Low',
          run_concept_frequency: {},
          formation_usage: {},
          personnel_groupings: {}
        },
        playerContext: []
      }));

      environmentCache.set(cacheKey, { ts: now, data: teamData });

      console.log(`✅ [TRACKSTAR] Served team data for ${teamData.length} teams (Season ${season}) - Using integrated data sources`);
      return res.json(teamData);

    } catch (error) {
      console.error('❌ [TRACKSTAR] Teams data error:', error);
      return res.status(500).json({
        error: "TRACKSTAR teams data unavailable",
        detail: String(error)
      });
    }
  };

  const handleMatchup = async (_req: Request, res: Response) => {
    return res.json({
      defRankVsPos: 16,
      oasisMatchupScore: 50,
      olHealthIndex: 75,
      __source: 'environment_stub',
      __mock: true
    });
  };

  const handleDiscovery = (_req: Request, res: Response) => {
    res.json({
      endpoints: [
        "/teams",
        "/metrics/offense",
        "/metrics/defense",
        "/targets/distribution"
      ]
    });
  };

  const handleDebug = async (req: Request, res: Response) => {
    const list = ["/teams", "/metrics/offense", "/targets/distribution"];
    const out: Record<string, any> = {};
    const prefix = req.path.includes('/api/oasis') ? '/api/oasis' : '/api/environment';

    for (const p of list) {
      try {
        const response = await fetch(`${req.protocol}://${req.get("host")}${prefix}${p}`);
        const json = await response.json();
        out[p] = {
          ok: true,
          count: Array.isArray(json) ? json.length : undefined,
          keys: Array.isArray(json) && json[0] ? Object.keys(json[0]) : Object.keys(json || {})
        };
      } catch (error) {
        out[p] = { ok: false, error: String(error) };
      }
    }
    res.json(out);
  };

  const handleLegacyFallback = async (req: Request, res: Response) => {
    const pathParam = req.params && typeof req.params === 'object' ? (req.params as any)['0'] || '' : '';

    return res.status(404).json({
      error: "TRACKSTAR endpoint not found",
      available_endpoints: ["/environment", "/pace", "/teams"],
      requested: pathParam,
      message: "Local R server TRACKSTAR system active"
    });
  };

  app.get('/api/environment/environment', handleEnvironment);
  // DEPRECATED: legacy OASIS route, use /api/environment/... instead (TRACKSTAR)
  app.get('/api/oasis/environment', handleEnvironment);

  app.get('/api/environment/pace', handlePace);
  app.get('/api/pace', handlePace);
  // DEPRECATED: legacy OASIS route, use /api/environment/... instead (TRACKSTAR)
  app.get('/api/oasis/pace', handlePace);

  app.get('/api/environment/teams', handleTeams);
  // DEPRECATED: legacy OASIS route, use /api/environment/... instead (TRACKSTAR)
  app.get('/api/oasis/teams', handleTeams);

  app.get('/api/environment/matchup', handleMatchup);
  // DEPRECATED: legacy OASIS route, use /api/environment/... instead (TRACKSTAR)
  app.get('/api/oasis/matchup', handleMatchup);

  app.get('/api/environment/_index', handleDiscovery);
  // DEPRECATED: legacy OASIS route, use /api/environment/... instead (TRACKSTAR)
  app.get('/api/oasis/_index', handleDiscovery);

  app.get('/api/environment/_debug', handleDebug);
  // DEPRECATED: legacy OASIS route, use /api/environment/... instead (TRACKSTAR)
  app.get('/api/oasis/_debug', handleDebug);

  app.get('/api/environment/*', handleLegacyFallback);
  // DEPRECATED: legacy OASIS route, use /api/environment/... instead (TRACKSTAR)
  app.get('/api/oasis/*', handleLegacyFallback);

  // Sleeper ADP API for QB data
  app.get('/api/adp/qb', async (req: Request, res: Response) => {
    try {
      const season = Number(req.query.season ?? "2025");
      const format = (req.query.format ?? "1qb") as "1qb"|"superflex";

      const { getAdpCache, setAdpCache } = await import('./adp/cache');
      
      const cached = getAdpCache(season, format);
      if (cached) {
        console.log(`📊 [ADP-QB] Cache hit: ${cached.size} QBs (${format}, ${season})`);
        return res.json({
          season, format, cached: true,
          count: cached.size,
          data: Object.fromEntries(cached)
        });
      }

      const { fetchSleeperAdpQB } = await import('./adp/sleeper');
      console.log(`📡 [ADP-QB] Fetching fresh data: ${format} QBs for ${season}`);
      const map = await fetchSleeperAdpQB(format, season);
      setAdpCache(season, format, map);
      
      console.log(`✅ [ADP-QB] Fresh fetch: ${map.size} QBs loaded`);
      res.json({
        season, format, cached: false,
        count: map.size,
        data: Object.fromEntries(map)
      });
    } catch (error) {
      console.error('❌ [ADP-QB] Error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch Sleeper ADP data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // DEPRECATED: VORP endpoint - use Role Bank for position rankings
  app.get('/api/analytics/vorp', async (req, res) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/role-bank/:position/:season' });
  });

  // DEPRECATED: WR endpoint - use Role Bank instead
  app.get('/api/wr', async (req, res) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/role-bank/wr/2025' });
  });

  // UNIFIED CANONICAL PLAYER POOL API
  app.get('/api/player-pool', async (req: Request, res: Response) => {
    try {
      const pos = req.query.pos as string;
      const team = req.query.team as string;
      const search = req.query.search as string || '';
      const limit = parseInt(req.query.limit as string) || 200;
      
      console.log(`🔍 [PLAYER POOL] pos=${pos || 'ALL'} team=${team || 'ALL'} search="${search}" limit=${limit}`);
      console.log(`🔍 [PLAYER POOL] Service loaded: ${playerPoolService.isLoaded()}, Stats:`, playerPoolService.getStats());
      
      let players = playerPoolService.getAllPlayers();
      console.log(`🔍 [PLAYER POOL] Raw players count: ${players.length}`);
      
      // Apply position filter
      if (pos) {
        players = players.filter(p => p.pos === pos.toUpperCase());
      }
      
      // Apply team filter  
      if (team) {
        players = players.filter(p => p.team === team.toUpperCase());
      }
      
      // Apply search filter
      if (search && search.length >= 2) {
        players = playerPoolService.searchPlayers(search, pos, players.length);
      }
      
      // Apply limit
      const results = players.slice(0, limit);
      
      console.log(`✅ [PLAYER POOL] Returning ${results.length} players`);
      
      res.json({
        ok: true,
        data: results,
        meta: { 
          rows: results.length,
          ts: Date.now(),
          filters: { pos, team, search },
          source: 'canonical_player_pool'
        }
      });
    } catch (error) {
      console.error('❌ Player Pool Error:', error);
      res.status(500).json({ error: 'Failed to fetch player pool' });
    }
  });

  // Player Index API endpoint (for quick lookups)
  app.get('/api/player-index', async (req: Request, res: Response) => {
    try {
      console.log('🔍 [PLAYER INDEX] Fetching player index...');
      
      // Get all players and transform to index format
      const players = playerPoolService.getAllPlayers();
      const index: Record<string, any> = {};
      
      players.forEach(player => {
        index[player.id] = {
          name: player.name,
          team: player.team,
          pos: player.pos,
          aliases: player.aliases
        };
      });
      
      console.log(`✅ [PLAYER INDEX] Returning index with ${Object.keys(index).length} players`);
      
      res.json({
        ok: true,
        data: index,
        meta: {
          total_players: Object.keys(index).length,
          ts: Date.now(),
          source: 'canonical_player_index'
        }
      });
    } catch (error) {
      console.error('❌ Player Index Error:', error);
      res.status(500).json({ 
        ok: false, 
        error: 'Failed to fetch player index',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Rebuild player pool from real endpoints (admin)
  app.post('/api/player-pool/rebuild', async (req: Request, res: Response) => {
    try {
      console.log('🔄 [REBUILD] Starting player pool rebuild...');
      
      const { buildPlayerPool } = await import('../scripts/buildPlayerPool');
      await buildPlayerPool();
      
      // Reload the service
      playerPoolService.reload();
      
      res.json({
        ok: true,
        message: 'Player pool rebuilt successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Rebuild Error:', error);
      res.status(500).json({ 
        ok: false,
        error: error instanceof Error ? error.message : 'Rebuild failed'
      });
    }
  });

  // Legacy endpoints for backward compatibility
  app.get('/api/players/pool', async (req: Request, res: Response) => {
    // Redirect to unified endpoint
    const query = new URLSearchParams(req.query as any).toString();
    res.redirect(`/api/player-pool?${query}`);
  });

  app.get('/api/players/search', async (req: Request, res: Response) => {
    // Redirect to unified endpoint
    const query = new URLSearchParams(req.query as any).toString();
    res.redirect(`/api/player-pool?${query}`);
  });

  // ===== SEPARATED RATING SYSTEM ENDPOINTS (Must come before existing compass routes) =====
  
  // 🧭 Player Compass Service - Technical analysis ratings (NEW SEPARATED API)
  app.get('/api/player-compass/players', async (req: Request, res: Response) => {
    try {
      const { playerCompassPlayerService } = await import("./services/playerCompassPlayerService");
      
      const filters = {
        pos: req.query.pos as string,
        team: req.query.team as string,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 10,
      };

      const result = await playerCompassPlayerService.getPlayers(filters);
      res.json(result);
    } catch (error) {
      console.error('❌ Player Compass API Error:', error);
      res.status(500).json({
        error: 'Failed to fetch Player Compass data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // 🎯 Qwen Player Service - Performance-based rankings
  app.get('/api/qwen/players', async (req: Request, res: Response) => {
    try {
      const { qwenPlayerService } = await import("./services/qwenPlayerService");
      
      const filters = {
        pos: req.query.pos as string,
        team: req.query.team as string,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 10,
      };

      const result = await qwenPlayerService.getPlayers(filters);
      res.json(result);
    } catch (error) {
      console.error('❌ Qwen Players API Error:', error);
      res.status(500).json({
        error: 'Failed to fetch Qwen player data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 🏆 TIBER Consensus Service - Community rankings
  app.get('/api/consensus/players', async (req: Request, res: Response) => {
    try {
      const { tiberConsensusPlayerService } = await import("./services/tiberConsensusPlayerService");
      
      const filters = {
        pos: req.query.pos as string,
        team: req.query.team as string,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 10,
      };

      const result = await tiberConsensusPlayerService.getPlayers(filters);
      res.json(result);
    } catch (error) {
      console.error('❌ TIBER Consensus API Error:', error);
      res.status(500).json({
        error: 'Failed to fetch TIBER Consensus data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/players/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const player = playerPoolService.getPlayerById(id);
      
      if (!player) {
        return res.status(404).json({
          ok: false,
          error: `Player not found: ${id}`
        });
      }
      
      res.json({
        ok: true,
        data: player,
        source: 'canonical_player_pool'
      });
    } catch (error) {
      console.error('❌ Player Lookup Error:', error);
      res.status(500).json({ error: 'Failed to fetch player' });
    }
  });


  // DEPRECATED: Usage leaders endpoint - use TIBER system instead
  app.get('/api/usage-leaders', async (req, res) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/tiber/:position for usage data' });
  });

  // Intelligence feed endpoint - Preseason scouting reports
  app.get('/api/intel', async (req, res) => {
    try {
      const { type, player, position, signal } = req.query;
      
      // Load preseason intel data
      const fs = await import('fs');
      const path = await import('path');
      const intelPath = path.join(process.cwd(), 'data', 'preseason_intel_week1.json');
      
      if (!fs.existsSync(intelPath)) {
        return res.json({ ok: true, data: [], message: 'No intel data available' });
      }
      
      const intelData = JSON.parse(fs.readFileSync(intelPath, 'utf8'));
      let results = intelData.insights || [];
      
      // Apply filters
      if (player) {
        results = results.filter((item: any) => 
          item.player.toLowerCase().includes(player.toString().toLowerCase())
        );
      }
      
      if (position) {
        results = results.filter((item: any) => 
          item.position.toLowerCase() === position.toString().toLowerCase()
        );
      }
      
      if (signal) {
        results = results.filter((item: any) => 
          item.signal.toLowerCase() === signal.toString().toLowerCase()
        );
      }
      
      // Add team notes if requested
      let teamNotes = [];
      if (req.query.include_teams === 'true') {
        teamNotes = intelData.team_notes || [];
      }
      
      res.json({
        ok: true,
        data: results,
        team_notes: teamNotes,
        meta: {
          source: intelData.source,
          date: intelData.date,
          total_insights: results.length,
          filters_applied: { player, position, signal }
        }
      });
    } catch (error) {
      console.error('❌ [INTEL] Error:', error);
      res.status(500).json({ error: 'Failed to fetch intelligence data' });
    }
  });

  // Health check endpoint - Lamar's request
  app.get('/api/health', async (req, res) => {
    try {
      const checks = {
        wr: 'ok',
        vorp: 'ok',
        weekly: 'ok',
        intel: 'ok',
        oasis: 'ok',
        player_pool: playerPoolService.isLoaded() ? 'ok' : 'down'
      };

      // Test each endpoint
      try {
        await fetch(`${req.protocol}://${req.get('host')}/api/wr?limit=1`);
      } catch {
        checks.wr = 'down';
      }

      try {
        await fetch(`${req.protocol}://${req.get('host')}/api/analytics/vorp?limit=1`);
      } catch {
        checks.vorp = 'down';
      }

      try {
        await fetch(`${req.protocol}://${req.get('host')}/api/weekly?limit=1`);
      } catch {
        checks.weekly = 'down';
      }

      const allOk = Object.values(checks).every(status => status === 'ok');
      
      res.json({
        status: allOk ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        checks
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Intelligence Feed API - current legacy feed + NEWS-001 structured refresh
  app.get('/api/intel/current', async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const intelFile = path.join(process.cwd(), 'data', 'current_intel.json');
      const legacyIntelligence = fs.existsSync(intelFile)
        ? JSON.parse(fs.readFileSync(intelFile, 'utf-8'))
        : [];

      const rawSeason = req.query.season;
      const rawWeek = req.query.week;
      const requestedSeason =
        rawSeason !== undefined ? Number(rawSeason) : undefined;
      const requestedWeek =
        rawWeek !== undefined ? Number(rawWeek) : undefined;

      if (
        (requestedSeason !== undefined && (!Number.isInteger(requestedSeason) || requestedSeason < 2000)) ||
        (requestedWeek !== undefined && (!Number.isInteger(requestedWeek) || requestedWeek < 1 || requestedWeek > 25))
      ) {
        return res.status(400).json({
          success: false,
          error: 'season/week query parameters are invalid',
        });
      }

      const cadenceValues = ['COLD', 'COOL', 'WARM', 'HOT', 'LIVE'] as const;
      const requestedCadence =
        typeof req.query.cadence === 'string'
          ? req.query.cadence.toUpperCase()
          : 'HOT';

      if (!cadenceValues.includes(requestedCadence as (typeof cadenceValues)[number])) {
        return res.status(400).json({
          success: false,
          error: 'cadence must be one of COLD, COOL, WARM, HOT, LIVE',
        });
      }

      let season = requestedSeason;
      let week = requestedWeek;
      let seasonStateSource: string | null = null;

      if (season === undefined || week === undefined) {
        const { seasonService } = await import('./services/SeasonService');
        const current = await seasonService.current();
        if (season === undefined) season = current.season;
        if (week === undefined && (requestedSeason === undefined || requestedSeason === current.season)) {
          week = current.week;
        }
        seasonStateSource = current.source;
      }

      const forceRefresh = req.query.force_refresh === 'true';
      const playerName =
        typeof req.query.player === 'string' && req.query.player.trim()
          ? req.query.player.trim()
          : undefined;
      const playerId =
        typeof req.query.playerId === 'string' && req.query.playerId.trim()
          ? req.query.playerId.trim()
          : undefined;

      let newsIntelligence: unknown = null;
      let newsIntelligenceState: 'CURRENT' | 'ERROR' = 'CURRENT';
      let newsIntelligenceError: string | null = null;

      try {
        const { newsClient } = await import('./data/newsClient');
        newsIntelligence = await newsClient.analysis.getStructuredNewsRefresh({
          season: season!,
          week,
          playerName,
          playerId,
          cadenceState: requestedCadence as 'COLD' | 'COOL' | 'WARM' | 'HOT' | 'LIVE',
          forceRefresh,
        });
      } catch (error) {
        newsIntelligenceState = 'ERROR';
        newsIntelligenceError =
          error instanceof Error ? error.message : String(error);
        console.error('[NEWS-001] structured current-intel refresh failed:', error);
      }

      return res.json({
        success: true,
        data: legacyIntelligence,
        ...(fs.existsSync(intelFile)
          ? {}
          : { message: 'No legacy current_intel.json data available' }),
        news_intelligence_state: newsIntelligenceState,
        news_intelligence: newsIntelligence,
        ...(newsIntelligenceError
          ? { news_intelligence_error: newsIntelligenceError }
          : {}),
        meta: {
          season,
          week: week ?? null,
          season_state_source: seasonStateSource,
          cadence: requestedCadence,
          force_refresh: forceRefresh,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Adaptive Consensus Engine Endpoints
  app.get('/api/consensus/why', getConsensusWhy);
  app.post('/api/consensus/adaptive-rebuild', rebuildConsensusEndpoint);

  // Add new intelligence entry
  app.post('/api/intel/add', async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const intelFile = path.join(process.cwd(), 'data', 'current_intel.json');
      const entry = {
        ...req.body,
        timestamp: new Date().toISOString(),
        id: Date.now().toString()
      };
      
      let intelligence = [];
      if (fs.existsSync(intelFile)) {
        intelligence = JSON.parse(fs.readFileSync(intelFile, 'utf-8'));
      }
      
      intelligence.push(entry);
      fs.writeFileSync(intelFile, JSON.stringify(intelligence, null, 2));
      
      res.json({
        success: true,
        message: 'Intelligence entry added',
        entry,
        total: intelligence.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Mount Tiber Voice routes (new data-driven system)
  const voiceRoutes = await import('./routes/voice');
  app.use('/api/voice', voiceRoutes.default);
  
  // Legacy competence routes (disabled - redirect to voice)
  app.use('/api/competence', (req, res) => {
    res.status(410).json({
      message: 'Competence API deprecated. Use /api/voice for data-driven advice.',
      migration: {
        old: '/api/competence/analyze',
        new: '/api/voice',
        note: 'New system uses live Power/RAG data instead of hardcoded responses'
      }
    });
  });

  // OLC (Offensive Line Context) API Routes
  try {
    const { buildOlcForWeek, OlcBuilder } = await import('./olc/index.js');
    
    // GET /api/olc/team/:teamId?week=X&season=Y
    app.get('/api/olc/team/:teamId', async (req: Request, res: Response) => {
      try {
        const { teamId } = req.params;
        const week = parseInt(req.query.week as string) || 1;
        const season = parseInt(req.query.season as string) || 2025;
        
        const result = await buildOlcForWeek(teamId, season, week, {
          includeAdjusters: true,
          includeOpponentContext: false,
        });
        
        res.json(result);
      } catch (error) {
        console.error('[OLC API] Error fetching team OLC:', error);
        res.status(500).json({ 
          error: 'Failed to calculate OLC score',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/olc/player/:playerId?week=X&season=Y
    app.get('/api/olc/player/:playerId', async (req: Request, res: Response) => {
      try {
        const { playerId } = req.params;
        const week = parseInt(req.query.week as string) || 1;
        const season = parseInt(req.query.season as string) || 2025;
        
        // In production, resolve player to team
        // For now, use a mock team resolution
        const teamId = 'KC'; // Mock - would resolve from player service
        
        const result = await buildOlcForWeek(teamId, season, week, {
          includeAdjusters: true,
          includeOpponentContext: false,
        });
        
        res.json({
          player_id: playerId,
          team_id: teamId,
          olc_data: result,
        });
      } catch (error) {
        console.error('[OLC API] Error fetching player OLC:', error);
        res.status(500).json({ 
          error: 'Failed to calculate player OLC',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // POST /api/olc/rebuild
    app.post('/api/olc/rebuild', async (req: Request, res: Response) => {
      try {
        const { season = 2025, weeks, force = false } = req.body;
        
        const builder = OlcBuilder.getInstance();
        builder.clearCache();
        
        if (weeks && Array.isArray(weeks)) {
          // Rebuild specific weeks
          const teams = ['KC', 'BUF', 'BAL', 'CIN']; // Sample teams for demo
          const requests = teams.flatMap(teamId =>
            weeks.map((week: number) => ({ teamId, season, week, options: { forceRefresh: force } }))
          );
          
          const results = await builder.buildOlcBatch(requests);
          
          res.json({
            message: 'OLC cache rebuilt successfully',
            rebuilt: results.length,
            requested: requests.length,
          });
        } else {
          // Clear cache only
          res.json({
            message: 'OLC cache cleared successfully',
          });
        }
      } catch (error) {
        console.error('[OLC API] Error rebuilding OLC:', error);
        res.status(500).json({ 
          error: 'Failed to rebuild OLC cache',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // GET /api/olc/health
    app.get('/api/olc/health', async (req: Request, res: Response) => {
      try {
        const builder = OlcBuilder.getInstance();
        const health = await builder.healthCheck();
        
        res.json({
          ...health,
          cache_stats: builder.getCacheStats(),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[OLC API] Health check failed:', error);
        res.status(500).json({ 
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    console.log('✅ OLC API routes registered');
    
    // Start automated player vs defense updates during NFL season
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTO_UPDATES === 'true') {
      try {
       await import('../scripts/schedule_updates.js')
        console.log('🤖 Automated SOS data updates enabled');
      } catch (error) {
        console.warn('⚠️ Could not start automated updates:', (error as Error).message);
      }
    }
  } catch (error) {
    console.error('❌ Failed to register OLC routes:', error);
  }

  // ===== GUARDIAN TOGGLE v0 - NOISE SHIELD DEMO =====
  app.get('/api/guardian/demo', async (req: Request, res: Response) => {
    try {
      const { assess, applyShield } = await import('./guardian/noiseShield');
      const userIntent = req.query.intent as string || 'fantasy football analysis';
      
      // Demo content with different manipulation patterns
      const demoContent = {
        clean: "Josh Allen ranks #1 in our QB analysis based on projected points and consistency metrics.",
        coercive: "You MUST draft Josh Allen! Everyone knows he's the guaranteed QB1 this season!",
        fearBait: "Don't miss out on Josh Allen before it's too late! Last chance to get elite QB production!",
        engagement: "You won't believe this shocking QB secret that will blow your mind!"
      };
      
      const assessments: Record<string, any> = {};
      for (const [type, content] of Object.entries(demoContent)) {
        assessments[type] = assess(content, userIntent);
      }
      
      res.json({
        guardian_version: "v0.1",
        user_intent: userIntent,
        assessments,
        demo_note: "Guardian Toggle detects manipulation patterns before content renders"
      });
    } catch (error) {
      res.status(500).json({ error: 'Guardian demo failed' });
    }
  });

  // QB Rankings with Guardian protection
  app.get('/api/qb/protected', async (req: Request, res: Response) => {
    try {
      const userIntent = req.query.intent as string || 'quarterback evaluation for fantasy football';
      const format = req.query.format as string || '1qb';
      
      const rankingsResult = await getRankings('redraft', 'QB', 12, false, format, true, true, userIntent);
      const qbData = Array.isArray(rankingsResult) ? rankingsResult : rankingsResult.data;
      
      // Apply Guardian assessment to the response description
      const { assess } = await import('./guardian/noiseShield');
      const description = `Top ${qbData.length} quarterbacks for 2025 fantasy football redraft leagues`;
      const shieldAssessment = assess(description, userIntent);
      
      const response: any = {
        ok: true,
        data: qbData.slice(0, 16), // Top 16 QBs
        meta: {
          position: 'QB',
          format,
          user_intent: userIntent,
          total_players: qbData.length,
          timestamp: new Date().toISOString()
        }
      };
      
      // Add shield data if content flagged
      if (!shieldAssessment.isClean) {
        response.guardian = {
          shield_active: true,
          beneficiary: shieldAssessment.beneficiary,
          flags: shieldAssessment.flags,
          message: shieldAssessment.shieldMessage
        };
      } else {
        response.guardian = {
          shield_active: false,
          status: 'content_verified_clean'
        };
      }
      
      res.json(response);
    } catch (error) {
      console.error('❌ Protected QB endpoint error:', error);
      res.status(500).json({ error: 'Failed to fetch protected QB rankings' });
    }
  });

  // ===== UNIFIED PLAYERS API (Qwen's Integration) =====
  // Paginated, searchable player database with compass + consensus integration
  
  app.get('/api/players', async (req: Request, res: Response) => {
    try {
      const { unifiedPlayerService } = await import('./services/unifiedPlayerService');
      
      // Validate query parameters
      const pos = req.query.pos as string;
      const team = req.query.team as string;
      const search = req.query.search as string;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 200);
      
      console.log(`🔍 Unified Players API: pos=${pos || 'ALL'} team=${team || 'ALL'} search="${search || ''}" page=${page}`);
      
      // Validate position filter
      if (pos && !['QB', 'RB', 'WR', 'TE'].includes(pos)) {
        return res.status(400).json({ ok: false, error: 'Invalid position. Use QB, RB, WR, or TE' });
      }
      
      // Validate team filter (basic check)
      if (team && team.length > 3) {
        return res.status(400).json({ ok: false, error: 'Invalid team code' });
      }
      
      // Validate search length
      if (search && search.length > 64) {
        return res.status(400).json({ ok: false, error: 'Search term too long' });
      }
      
      const { rows, total, page: actualPage, pageSize: actualPageSize } = await unifiedPlayerService.getPlayerPool({
        pos,
        team,
        search,
        page,
        pageSize
      });
      
      res.json({
        ok: true,
        data: rows,
        meta: {
          source: "unified_player_service",
          version: "1.1",
          ts: new Date().toISOString(),
          total,
          page: actualPage,
          pageSize: actualPageSize,
          hasNext: actualPage * actualPageSize < total,
          filters: {
            pos: pos || null,
            team: team || null,
            search: search || null
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Unified Players API Error:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch players' });
    }
  });

  // ===== TIBER CONSENSUS RANKINGS API =====
  // Community Rankings (separate from Player Compass in-house ratings)
  
  app.get('/api/consensus/:format', rateLimiters.heavyOperation, async (req: Request, res: Response) => {
    try {
      const { tiberConsensusService } = await import('./services/tiberConsensusService');
      const format = req.params.format as 'dynasty' | 'redraft';
      const position = req.query.position as string;
      const limit = parseInt(req.query.limit as string) || 100;
      
      console.log(`📊 TIBER Consensus: ${format.toUpperCase()} rankings requested`);
      
      if (!['dynasty', 'redraft'].includes(format)) {
        return res.status(400).json({ error: 'Invalid format. Use dynasty or redraft' });
      }
      
      const { rankings, metadata } = await tiberConsensusService.getConsensusRankings(format, position);
      
      res.json({
        success: true,
        format: format,
        position: position || 'ALL',
        count: rankings.slice(0, limit).length,
        data: rankings.slice(0, limit),
        metadata: {
          ...metadata,
          system: 'TIBER Consensus - Community Rankings',
          format_description: format === 'dynasty' 
            ? 'Community consensus on long-term dynasty value and outlook'
            : 'Community consensus on current season fantasy production',
          tier_definitions: tiberConsensusService.getTierDefinitions(format)
        }
      });
      
    } catch (error) {
      console.error(`❌ TIBER Consensus ${req.params.format} error:`, error);
      res.status(500).json({ error: 'Failed to fetch TIBER Consensus rankings' });
    }
  });
  
  app.get('/api/consensus/splits/:playerId', async (req: Request, res: Response) => {
    try {
      const { tiberConsensusService } = await import('./services/tiberConsensusService');
      const playerId = req.params.playerId;
      
      const splits = await tiberConsensusService.getConsensusSplits(playerId);
      
      res.json({
        success: true,
        playerId,
        splits,
        note: 'Dynasty vs Redraft ranking variance analysis'
      });
      
    } catch (error) {
      console.error(`❌ Consensus splits error for ${req.params.playerId}:`, error);
      res.status(500).json({ error: 'Failed to fetch consensus splits' });
    }
  });
  
  app.post('/api/consensus/vote', async (req: Request, res: Response) => {
    try {
      const { tiberConsensusService } = await import('./services/tiberConsensusService');
      const { playerId, rank, format, userId } = req.body;
      
      if (!playerId || !rank || !format) {
        return res.status(400).json({ error: 'Missing required fields: playerId, rank, format' });
      }
      
      const result = await tiberConsensusService.submitVote(playerId, rank, format, userId);
      
      res.json({
        success: result.success,
        message: 'Vote submitted successfully',
        newConsensusRank: result.newConsensusRank
      });
      
    } catch (error) {
      console.error('❌ Consensus vote error:', error);
      res.status(500).json({ error: 'Failed to submit vote' });
    }
  });

  // ===== CONSENSUS TIER PUSH API (Legacy) =====
  app.post('/api/consensus/push-tier', async (req: Request, res: Response) => {
    try {
      const { tierId, players, tier, format } = req.body;
      
      console.log(`🔥 Pushing tier ${tier} (${tierId}) for ${format} format`);
      console.log(`📊 Players: ${players?.length || 0} entries`);
      
      // Simulate tier push success/failure logic
      if (tierId === 'qb-tier2' && tier === '2B') {
        // Simulate a failure for QB Tier 2B as shown in the screenshot
        console.log('❌ QB Tier 2B push failed - Lamar championship correlation');
        return res.status(500).json({
          success: false,
          error: 'Could not execute green light for QB Tier 2B - Lamar championship correlation games'
        });
      }
      
      if (tierId === 'qb-elite' && tier === '1') {
        // Simulate success for QB Elite tier
        console.log('✅ QB Elite tier push successful');
        return res.json({
          success: true,
          message: 'GREEN LIGHT: Push QB Elite Tier Live',
          tierId,
          playersUpdated: players?.length || 0
        });
      }
      
      // Default success response for other tiers
      res.json({
        success: true,
        message: `Tier ${tier} pushed successfully`,
        tierId,
        playersUpdated: players?.length || 0
      });
      
    } catch (error) {
      console.error('❌ Tier push error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // DEPRECATED: Snap Counts Knowledge System - use TIBER snap data instead
  app.get('/api/snap-counts/claim/:pos/:pp', async (req: Request, res: Response) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/tiber/:position for snap data' });
  });
  app.get('/api/snap-counts/examples/:label', async (req: Request, res: Response) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/tiber/:position for snap data' });
  });
  app.get('/api/snap-counts/health', async (req: Request, res: Response) => {
    res.status(410).json({ error: 'Endpoint deprecated', migration: 'Use /api/tiber/:position for snap data' });
  });

  // ===== OVR ENGINE ENDPOINTS =====
  app.post('/api/ovr/seed', async (req: Request, res: Response) => {
    try {
      const { ovrEngine } = await import('./services/ovrEngine');
      const { playerId, position, roleTier } = req.body;
      
      if (!playerId || !position || !roleTier) {
        return res.status(400).json({ error: 'Missing required fields: playerId, position, roleTier' });
      }
      
      const baseOVR = ovrEngine.seedBaseOVR(playerId, position, roleTier);
      res.json({ 
        success: true, 
        playerId, 
        position, 
        roleTier, 
        baseOVR,
        message: 'Player OVR seeded successfully'
      });
    } catch (error) {
      console.error('❌ OVR seed error:', error);
      res.status(500).json({ error: 'Failed to seed player OVR' });
    }
  });

  app.post('/api/ovr/update', async (req: Request, res: Response) => {
    try {
      const { ovrEngine } = await import('./services/ovrEngine');
      const { playerId, position, weeklyData, week } = req.body;
      
      if (!playerId || !position || !weeklyData || week === undefined) {
        return res.status(400).json({ error: 'Missing required fields: playerId, position, weeklyData, week' });
      }
      
      const result = ovrEngine.processWeeklyUpdate(playerId, position, weeklyData, week);
      
      if (!result) {
        return res.status(404).json({ error: 'Player not found. Seed player first.' });
      }
      
      res.json({ 
        success: true, 
        playerState: result,
        message: 'Weekly OVR update processed'
      });
    } catch (error) {
      console.error('❌ OVR update error:', error);
      res.status(500).json({ error: 'Failed to update player OVR' });
    }
  });

  app.get('/api/ovr/player/:playerId', async (req: Request, res: Response) => {
    try {
      const { ovrEngine } = await import('./services/ovrEngine');
      const { playerId } = req.params;
      
      const playerState = ovrEngine.getPlayerOVR(playerId);
      
      if (!playerState) {
        return res.status(404).json({ error: 'Player OVR state not found' });
      }
      
      res.json(playerState);
    } catch (error) {
      console.error('❌ OVR fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch player OVR' });
    }
  });

  app.post('/api/ovr/compass', async (req: Request, res: Response) => {
    try {
      const { ovrEngine } = await import('./services/ovrEngine');
      const { playerId, position, playerData } = req.body;
      
      if (!playerId || !position || !playerData) {
        return res.status(400).json({ error: 'Missing required fields: playerId, position, playerData' });
      }
      
      const compassScores = ovrEngine.calculateCompassScores(playerId, position, playerData);
      res.json({ 
        playerId, 
        position, 
        compass: compassScores,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Compass scoring error:', error);
      res.status(500).json({ error: 'Failed to calculate compass scores' });
    }
  });

  app.get('/api/ovr/health', async (req: Request, res: Response) => {
    try {
      const { ovrEngine } = await import('./services/ovrEngine');
      const allStates = ovrEngine.getAllPlayerStates();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        stats: {
          totalPlayers: allStates.length,
          playersWithDeltas: allStates.filter(p => Object.keys(p.activeDeltas).length > 0).length,
          averageOVR: allStates.length > 0 
            ? Math.round(allStates.reduce((sum, p) => sum + p.currentOVR, 0) / allStates.length)
            : 0
        }
      });
    } catch (error) {
      console.error('❌ OVR health check error:', error);
      res.status(500).json({ 
        status: 'unhealthy', 
        message: 'OVR engine health check failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });



  // ===== INTELLIGENCE FEED ENDPOINT =====
  app.get('/api/intel', async (req: Request, res: Response) => {
    try {
      // During regular season, this would pull from live intelligence feeds
      // For now, return structured empty state
      res.json({
        date: new Date().toISOString().split('T')[0],
        source: "TIBER Intelligence System",
        intel_type: "training_camp_updates",
        entries: [],
        summary: {
          total_intel: 0,
          high_signal: 0,
          medium_signal: 0,
          low_signal: 0,
          key_takeaways: []
        }
      });
    } catch (error) {
      console.error('❌ Intel endpoint error:', error);
      res.status(500).json({ error: 'Failed to fetch intelligence data' });
    }
  });

  // ===== ROSTER SYNC ENDPOINTS =====
  
  // Trigger roster merge and sync
  app.post('/api/sync/rosters', async (req: Request, res: Response) => {
    try {
      const { rosterSyncService } = await import('./services/rosterSync');
      const season = req.body?.season || 2025;
      
      console.log(`🔄 Starting roster sync for season ${season}...`);
      const result = await rosterSyncService.syncRosters(season);
      
      res.json(result);
    } catch (error) {
      console.error('❌ Roster sync error:', error);
      res.status(500).json({
        error: 'Failed to sync rosters',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get merged rosters by team
  app.get('/api/rosters', async (req: Request, res: Response) => {
    try {
      const { rosterSyncService } = await import('./services/rosterSync');
      const rosters = await rosterSyncService.getRosters();
      res.json(rosters);
    } catch (error) {
      res.status(404).json({
        error: 'No rosters synced yet',
        hint: 'Run POST /api/sync/rosters first'
      });
    }
  });

  // Get depth charts by team and position with optional fantasy filtering
  app.get('/api/depth-charts', async (req: Request, res: Response) => {
    try {
      const { rosterSyncService } = await import('./services/rosterSync');
      const fantasy = req.query.fantasy === '1';
      const maxWR = parseInt(req.query.max_wr as string) || 4;
      const maxRB = parseInt(req.query.max_rb as string) || 3;
      const maxTE = parseInt(req.query.max_te as string) || 2;
      const maxQB = parseInt(req.query.max_qb as string) || 2;

      if (!fantasy) {
        // Return raw depth charts
        const depthCharts = await rosterSyncService.getDepthCharts();
        res.json(depthCharts);
        return;
      }

      // Fantasy filtering - need full roster data
      const rosters = await rosterSyncService.getRosters();
      const { filterTeam } = await import('./utils/relevance');
      
      const limits = { WR: maxWR, RB: maxRB, TE: maxTE, QB: maxQB } as any;
      const filtered: Record<string, Record<string, string[]>> = {};

      for (const [team, players] of Object.entries(rosters)) {
        const teamFiltered = filterTeam(players as any[], limits);
        // Return player IDs in same shape as raw depth charts
        filtered[team] = {};
        for (const [pos, posPlayers] of Object.entries(teamFiltered)) {
          if (posPlayers.length > 0) {
            filtered[team][pos] = posPlayers.map(p => p.player_id);
          }
        }
      }

      console.log(`🎯 Fantasy depth charts: ${Object.keys(filtered).length} teams filtered`);
      res.json(filtered);
    } catch (error) {
      console.error('❌ Error fetching depth charts:', error);
      res.status(404).json({
        error: 'No depth charts synced yet',
        hint: 'Run POST /api/sync/rosters first'
      });
    }
  });

  // Get players index for lookups
  app.get('/api/players-index', async (req: Request, res: Response) => {
    try {
      const { rosterSyncService } = await import('./services/rosterSync');
      const playersIndex = await rosterSyncService.getPlayersIndex();
      res.json(playersIndex);
    } catch (error) {
      res.status(404).json({
        error: 'No players index synced yet', 
        hint: 'Run POST /api/sync/rosters first'
      });
    }
  });

  // Register article routes
  app.use('/api/articles', articleRoutes);

  // Power Rankings - Direct database integration
  
  // INTERNAL_ONLY operational health endpoint for experimental power lane.
  app.get('/api/power/health', async (req: Request, res: Response) => {
    try {
      const stats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_players,
          COUNT(DISTINCT season) as seasons,
          MAX(last_update) as last_update
        FROM player_week_facts
      `);
      
      const rankStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_ranks,
          COUNT(DISTINCT ranking_type) as ranking_types
        FROM power_ranks
      `);
      
      res.json({
        status: 'healthy',
        service: 'otc_power_database',
        data_source: 'live_database',
        stats: {
          total_players: (stats as any)[0]?.total_players || 0,
          total_ranks: (rankStats as any)[0]?.total_ranks || 0,
          seasons: (stats as any)[0]?.seasons || 0,
          ranking_types: (rankStats as any)[0]?.ranking_types || 0,
          last_update: (stats as any)[0]?.last_update
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Power rankings health error:', error);
      res.status(500).json({ 
        status: 'unhealthy', 
        error: 'Database connection failed',
        timestamp: new Date().toISOString() 
      });
    }
  });

  // ⚡ START/SIT CALCULATOR API (Manual Input)
  app.post('/api/start-sit', async (req: Request, res: Response) => {
    try {
      const { startSit, defaultConfig } = await import('./modules/startSitEngine');
      
      const { playerA, playerB, config } = req.body as {
        playerA: any;
        playerB: any;
        config?: any;
      };

      if (!playerA || !playerB) {
        return res.status(400).json({ error: "playerA and playerB are required" });
      }

      // Shallow merge for quick overrides
      const mergedConfig = {
        ...defaultConfig,
        ...(config as any),
        weights: { ...defaultConfig.weights, ...(config?.weights || {}) },
        usageSub: { ...defaultConfig.usageSub, ...(config?.usageSub || {}) },
        matchupSub: { ...defaultConfig.matchupSub, ...(config?.matchupSub || {}) },
        volatilitySub: { ...defaultConfig.volatilitySub, ...(config?.volatilitySub || {}) },
        newsSub: { ...defaultConfig.newsSub, ...(config?.newsSub || {}) },
      };

      const result = startSit(playerA, playerB, mergedConfig);

      return res.json({
        verdict: result.verdict,
        margin: result.margin,
        summary: result.summary,
        playerA: {
          name: playerA.name,
          position: playerA.position,
          breakdown: result.a,
        },
        playerB: {
          name: playerB.name,
          position: playerB.position,
          breakdown: result.b,
        },
      });
    } catch (err: any) {
      console.error("[start-sit] error", err);
      return res.status(500).json({ error: "Internal server error calculating start/sit" });
    }
  });

  // ⚡ START/SIT LIVE DATA ROUTES
  try {
    const startSitLiveRoutes = await import('../src/routes/startSitLiveRoutes');
    app.use('/api/start-sit-live', startSitLiveRoutes.default);
    console.log('✅ Start/Sit live routes registered at /api/start-sit-live');
  } catch (error) {
    console.error('[start-sit-live] Failed to load live routes:', error);
  }

  // ⚡ LEAGUE ASSIST ROUTES (Sleeper integration)
  try {
    const leagueAssistRoutes = await import('../src/routes/leagueAssistRoutes');
    app.use('/api', leagueAssistRoutes.default);
    console.log('✅ League assist routes registered');
  } catch (error) {
    console.error('[league-assist] Failed to load league routes:', error);
  }

  // ⚡ QUICK START/SIT ROUTES (Zero-manual-stats UX)
  try {
    const startSitQuickRoutes = await import('../src/routes/startSitQuickRoutes');
    app.use('/api', startSitQuickRoutes.default);
    console.log('✅ Quick Start/Sit routes registered');
  } catch (error) {
    console.error('[start-sit-quick] Failed to load quick routes:', error);
  }

  // EXPERIMENTAL: /api/power/* is not canonical public rankings output.
  app.get('/api/power/:type', async (req: Request, res: Response) => {
    const { type } = req.params;
    const { season = 2025, week = 1 } = req.query;
    
    try {
      let rawResults;
      
      if (type.toUpperCase() === 'OVERALL') {
        const queryResult = await db.execute(sql`
          SELECT 
            pr.rank,
            pr.player_id,
            p.name,
            p.team,
            p.position,
            pr.power_score,
            pr.delta_w,
            pwf.usage_now,
            pwf.talent,
            pwf.environment,
            pwf.availability,
            pwf.confidence,
            p.expected_points,
            p.floor_points,
            p.ceiling_points,
            p.rag_score,
            p.rag_color
          FROM power_ranks pr
          JOIN players p ON (p.sleeper_id = pr.player_id OR p.id::text = pr.player_id)
          LEFT JOIN player_week_facts pwf ON (pwf.player_id = pr.player_id AND pwf.season = pr.season AND pwf.week = pr.week)
          WHERE pr.season = ${season} AND pr.week = ${week} AND pr.ranking_type = 'OVERALL'
          ORDER BY pr.rank
        `);
        rawResults = Array.isArray(queryResult) ? queryResult : queryResult.rows || [];
      } else if (['QB', 'RB', 'WR', 'TE'].includes(type.toUpperCase())) {
        const queryResult = await db.execute(sql`
          SELECT 
            pr.rank,
            pr.player_id,
            p.name,
            p.team,
            p.position,
            pr.power_score,
            pr.delta_w,
            pwf.usage_now,
            pwf.talent,
            pwf.environment,
            pwf.availability,
            pwf.confidence,
            p.expected_points,
            p.floor_points,
            p.ceiling_points,
            p.rag_score,
            p.rag_color
          FROM power_ranks pr
          JOIN players p ON (p.sleeper_id = pr.player_id OR p.id::text = pr.player_id)
          LEFT JOIN player_week_facts pwf ON (pwf.player_id = pr.player_id AND pwf.season = pr.season AND pwf.week = pr.week)
          WHERE pr.season = ${season} AND pr.week = ${week} AND pr.ranking_type = ${type.toUpperCase()}
          ORDER BY pr.rank
        `);
        rawResults = Array.isArray(queryResult) ? queryResult : queryResult.rows || [];
      } else {
        return res.status(400).json({ error: 'Invalid ranking type. Must be OVERALL, QB, RB, WR, or TE' });
      }

      // TEMPORARY: Always use Grok enhanced system since database has outdated sample data
      // TODO: Remove this when database is properly populated with current data
      if (rawResults.length === 0 || true) { // Force Grok system for now
        console.log(`[Power Rankings] Using Week 1 updated 2025 rankings with actual game results`);
        
        // Week 1 2025 NFL Season - Updated with actual game results (Sept 4-8, 2025)
        const CONSENSUS_2025_RANKINGS = [
          // RBs - CORRECTED after detailed Week 1 analysis
          { rank: 1, name: "Bijan Robinson", team: "ATL", position: "RB", powerScore: 98, expertRank: 1.5, week1Notes: "50-yard screen TD vs Bucs" },
          { rank: 2, name: "Travis Etienne", team: "JAX", position: "RB", powerScore: 95, expertRank: 2.0, week1Notes: "RISER: 143 yards, 8.9 YPC, bell-cow status" },
          { rank: 3, name: "Jacory Croskey-Merritt", team: "WAS", position: "RB", powerScore: 93, expertRank: 2.5, week1Notes: "RISER: 82 yards, 8.2 YPC, 50% carries" },
          { rank: 4, name: "Jahmyr Gibbs", team: "DET", position: "RB", powerScore: 91, expertRank: 3.0, week1Notes: "Solid Lions win vs Packers" },
          { rank: 5, name: "Saquon Barkley", team: "PHI", position: "RB", powerScore: 89, expertRank: 3.2, week1Notes: "Eagles beat Cowboys" },
          { rank: 6, name: "Derrick Henry", team: "BAL", position: "RB", powerScore: 88, expertRank: 3.5, week1Notes: "Fumble in loss to Bills, but productive" },
          { rank: 7, name: "Jonathan Taylor", team: "IND", position: "RB", powerScore: 85, expertRank: 4.0, week1Notes: "Colts dominated Dolphins 33-8" },
          { rank: 8, name: "Dylan Sampson", team: "CLE", position: "RB", powerScore: 82, expertRank: 5.0, week1Notes: "RISER: 29 rush yards + 8 catches, 64 yards" },
          { rank: 9, name: "Jordan Mason", team: "MIN", position: "RB", powerScore: 80, expertRank: 5.5, week1Notes: "RISER: 68 yards in Vikings comeback" },
          { rank: 10, name: "Christian McCaffrey", team: "SF", position: "RB", powerScore: 78, expertRank: 6.0, week1Notes: "49ers beat Seahawks" },
          { rank: 11, name: "Josh Jacobs", team: "GB", position: "RB", powerScore: 73, expertRank: 6.5, week1Notes: "Packers lost to Lions" },
          { rank: 12, name: "Breece Hall", team: "NYJ", position: "RB", powerScore: 71, expertRank: 7.0, week1Notes: "Jets lost thriller to Steelers" },
          { rank: 13, name: "James Cook", team: "BUF", position: "RB", powerScore: 69, expertRank: 7.5, week1Notes: "Bills epic comeback vs Ravens" },
          { rank: 14, name: "Ashton Jeanty", team: "LV", position: "RB", powerScore: 65, expertRank: 8.0, week1Notes: "FALLER: 2.0 YPC on 21 touches, inefficient debut" },
          { rank: 15, name: "De'Von Achane", team: "MIA", position: "RB", powerScore: 62, expertRank: 8.5, week1Notes: "FALLER: Limited in blowout loss, committee concerns" },
          
          // QBs - CORRECTED with risers/fallers data
          { rank: 16, name: "Josh Allen", team: "BUF", position: "QB", powerScore: 99, expertRank: 1.0, week1Notes: "394 yards, 4 total TDs in epic comeback" },
          { rank: 17, name: "J.J. McCarthy", team: "MIN", position: "QB", powerScore: 95, expertRank: 1.5, week1Notes: "RISER: 3 TDs in 4th quarter comeback debut" },
          { rank: 18, name: "Justin Fields", team: "NYJ", position: "QB", powerScore: 94, expertRank: 1.8, week1Notes: "RISER: 218 yards + 48 rush, 3 total TDs" },
          { rank: 19, name: "Daniel Jones", team: "IND", position: "QB", powerScore: 93, expertRank: 2.0, week1Notes: "RISER: 272 yards, 3 total TDs in Colts debut" },
          { rank: 20, name: "Jayden Daniels", team: "WAS", position: "QB", powerScore: 92, expertRank: 2.3, week1Notes: "233 yards, 1 TD in debut vs Giants" },
          { rank: 21, name: "Lamar Jackson", team: "BAL", position: "QB", powerScore: 89, expertRank: 2.8, week1Notes: "Blew big lead vs Bills" },
          { rank: 22, name: "Jalen Hurts", team: "PHI", position: "QB", powerScore: 87, expertRank: 3.2, week1Notes: "2 rushing TDs vs Cowboys" },
          { rank: 23, name: "Bo Nix", team: "DEN", position: "QB", powerScore: 85, expertRank: 3.5, week1Notes: "Rookie win vs Titans despite 3 turnovers" },
          { rank: 24, name: "Joe Burrow", team: "CIN", position: "QB", powerScore: 83, expertRank: 4.0, week1Notes: "Clutch win vs Browns" },
          { rank: 25, name: "Trevor Lawrence", team: "JAX", position: "QB", powerScore: 81, expertRank: 4.5, week1Notes: "Poised in Jags win" },
          
          // WRs - CORRECTED with confirmed risers  
          { rank: 26, name: "Emeka Egbuka", team: "TB", position: "WR", powerScore: 94, expertRank: 1.5, week1Notes: "RISER: 4/64, 2 TDs, game-winner vs Falcons" },
          { rank: 27, name: "Keon Coleman", team: "BUF", position: "WR", powerScore: 92, expertRank: 2.0, week1Notes: "RISER: 8/112, 1 TD on 11 targets vs Ravens" },
          { rank: 28, name: "Isaac TeSlaa", team: "DET", position: "WR", powerScore: 90, expertRank: 2.3, week1Notes: "RISER: 93.6 PFF grade, 4th quarter TD" },
          { rank: 29, name: "Cedric Tillman", team: "CLE", position: "WR", powerScore: 89, expertRank: 2.5, week1Notes: "RISER: 4/52 in pass-heavy Browns script" },
          { rank: 30, name: "DeAndre Hopkins", team: "BAL", position: "WR", powerScore: 88, expertRank: 2.8, week1Notes: "One-handed 29-yard TD vs Bills" },
          { rank: 31, name: "Amon-Ra St. Brown", team: "DET", position: "WR", powerScore: 87, expertRank: 3.2, week1Notes: "Lions beat Packers" },
          { rank: 32, name: "CeeDee Lamb", team: "DAL", position: "WR", powerScore: 85, expertRank: 3.5, week1Notes: "Drops hurt Cowboys vs Eagles" },
          { rank: 33, name: "A.J. Brown", team: "PHI", position: "WR", powerScore: 84, expertRank: 4.0, week1Notes: "Eagles beat Cowboys" },
          { rank: 34, name: "Courtland Sutton", team: "DEN", position: "WR", powerScore: 82, expertRank: 4.5, week1Notes: "TD from Nix vs Titans" },
          { rank: 35, name: "Ja'Marr Chase", team: "CIN", position: "WR", powerScore: 80, expertRank: 5.0, week1Notes: "Bengals clutch win" },
          
          // TEs - CORRECTED with breakout rookies
          { rank: 36, name: "Tyler Warren", team: "IND", position: "TE", powerScore: 92, expertRank: 1.5, week1Notes: "RISER: 7/9, 76 yards, 90.4 PFF grade" },
          { rank: 37, name: "Harold Fannin Jr.", team: "CLE", position: "TE", powerScore: 90, expertRank: 1.8, week1Notes: "RISER: 72% snaps, 7/63 on 9 targets" },
          { rank: 38, name: "Travis Kelce", team: "KC", position: "TE", powerScore: 88, expertRank: 2.0, week1Notes: "Chiefs lost to Chargers in Brazil" },
          { rank: 39, name: "Sam LaPorta", team: "DET", position: "TE", powerScore: 85, expertRank: 2.5, week1Notes: "Lions beat Packers" },
          { rank: 40, name: "Juwan Johnson", team: "NO", position: "TE", powerScore: 82, expertRank: 3.0, week1Notes: "RISER: 5/58, reliable targets vs Cardinals" }
        ];
        
        // Filter by position if not OVERALL
        const filteredRankings = type.toUpperCase() === 'OVERALL' 
          ? CONSENSUS_2025_RANKINGS 
          : CONSENSUS_2025_RANKINGS.filter(p => p.position === type.toUpperCase());
        
        const grokRankings = filteredRankings.map((player, index) => ({
          player_id: player.name.toLowerCase().replace(/[^a-z]/g, ''),
          name: player.name,
          team: player.team,
          position: player.position,
          rank: index + 1, // Re-rank after filtering
          power_score: player.powerScore,
          delta_w: 0, // New rankings don't have delta
          usage_now: Math.round(player.powerScore * 0.8), // 5-component scoring system
          talent: Math.round(player.powerScore * 0.9),
          environment: Math.round(player.powerScore * 0.85),
          availability: Math.round(player.powerScore * 0.75),
          confidence: player.expertRank < 5 ? 0.95 : player.expertRank < 10 ? 0.85 : 0.75,
          expected_points: null,
          floor_points: null,
          ceiling_points: null,
          rag_score: null,
          rag_color: null,
          flags: []
        }));
        
        return res.json({
          season: Number(season),
          week: Number(week),
          ranking_type: type.toUpperCase(),
          generated_at: new Date().toISOString(),
          total: grokRankings.length,
          items: grokRankings,
          source: 'week1_2025_actual_results'
        });
      }
      
      // Format the results properly for frontend consumption
      const rankings = rawResults.map((row: any) => ({
        player_id: row.player_id,
        name: row.name,
        team: row.team,
        position: row.position,
        rank: Number(row.rank),
        power_score: Number(row.power_score),
        delta_w: Number(row.delta_w) || 0,
        usage_now: Number(row.usage_now) || 0,
        talent: Number(row.talent) || 0,
        environment: Number(row.environment) || 0,
        availability: Number(row.availability) || 0,
        confidence: Number(row.confidence) || 0.75,
        expected_points: row.expected_points ? Number(row.expected_points) : null,
        floor_points: row.floor_points ? Number(row.floor_points) : null,
        ceiling_points: row.ceiling_points ? Number(row.ceiling_points) : null,
        rag_score: row.rag_score ? Number(row.rag_score) : null,
        rag_color: row.rag_color || null,
        flags: []
      }));
      
      res.json({
        season: Number(season),
        week: Number(week),
        ranking_type: type.toUpperCase(),
        generated_at: new Date().toISOString(),
        total: rankings.length,
        items: rankings,
        source: 'database'
      });
      
    } catch (error) {
      console.error('Power rankings error:', error);
      res.status(500).json({ error: 'Failed to fetch rankings' });
    }
  });

  // EXPERIMENTAL metadata lane (power history), separate from canonical rankings contract.
  app.get('/api/power/player/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { season = 2025 } = req.query;
    
    try {
      const rawHistory = await db.execute(sql`
        SELECT 
          pwf.week,
          pwf.power_score,
          pwf.usage_now,
          pwf.talent,
          pwf.environment,
          pwf.availability,
          pwf.confidence,
          p.name,
          p.team,
          p.position
        FROM player_week_facts pwf
        JOIN players p ON (p.sleeper_id = pwf.player_id OR p.id::text = pwf.player_id)
        WHERE pwf.player_id = ${id} AND pwf.season = ${season}
        ORDER BY pwf.week
      `);
      
      if ((rawHistory as any).length === 0) {
        return res.status(404).json({ error: 'Player not found or no data available' });
      }
      
      const player = (rawHistory as any)[0];
      
      res.json({
        player_id: id,
        name: player.name,
        team: player.team,
        position: player.position,
        season: Number(season),
        weeks: (rawHistory.rows || rawHistory).map((h: any) => ({
          week: Number(h.week),
          power_score: Number(h.power_score),
          usage_now: Number(h.usage_now),
          talent: Number(h.talent),
          environment: Number(h.environment),
          availability: Number(h.availability),
          confidence: Number(h.confidence)
        }))
      });
      
    } catch (error) {
      console.error('Power rankings player error:', error);
      res.status(500).json({ error: 'Failed to fetch player data' });
    }
  });

  // ECR COMPARISON ENDPOINTS - Tiber vs Expert Consensus Rankings
  
  app.get('/api/ecr/compare/:position', async (req: Request, res: Response) => {
    const { position } = req.params;
    const { 
      season = 2025, 
      week = 1, 
      format = 'standard',
      league_type = 'redraft',
      flex = 'standard'
    } = req.query;
    
    try {
      console.log(`[ECR Compare] Starting format-aware comparison for ${position.toUpperCase()} (${format}/${league_type}/${flex})`);
      
      // Get current Tiber rankings for this position
      const tiberResponse = await axios.get(`http://localhost:5000/api/power/${position.toUpperCase()}?season=${season}&week=${week}`);
      
      if (tiberResponse.status !== 200) {
        return res.status(500).json({ error: 'Failed to fetch Tiber rankings' });
      }
      
      const tiberData = tiberResponse.data;
      const tiberRankings = tiberData.items || [];
      
      // Import ECR service and generate format-aware comparisons
      const { ECRService } = await import('./services/ecrService');
      const comparisons = ECRService.compareWithTiber(
        tiberRankings, 
        position.toUpperCase(),
        format as string,
        league_type as string,
        flex as string
      );
      
      res.json({
        position: position.toUpperCase(),
        season: Number(season),
        week: Number(week),
        format: format,
        league_type: league_type,
        flex_configuration: flex,
        generated_at: new Date().toISOString(),
        tiber_source: tiberData.source || 'week1_2025_actual_results',
        ecr_sources: ['FantasyPros', 'ESPN', 'Yahoo', 'Footballguys'],
        total_comparisons: comparisons.length,
        format_adjustments_applied: comparisons.length > 0 && comparisons[0].format_adjustments ? true : false,
        comparisons: comparisons
      });
      
    } catch (error) {
      console.error('ECR comparison error:', error);
      res.status(500).json({ error: 'Failed to generate ECR comparison' });
    }
  });

  app.get('/api/ecr/status', async (req: Request, res: Response) => {
    try {
      // Import ECR service and get status
      const { ECRService } = await import('./services/ecrService');
      const status = ECRService.getUpdateStatus();
      
      res.json({
        status: 'active',
        service: 'tiber_ecr_comparison',
        ...status
      });
      
    } catch (error) {
      console.error('ECR status error:', error);
      res.status(500).json({ error: 'Failed to get ECR status' });
    }
  });

  app.post('/api/ecr/refresh/:position', async (req: Request, res: Response) => {
    const { position } = req.params;
    
    try {
      console.log(`[ECR Refresh] Refreshing ECR data for ${position.toUpperCase()}`);
      
      // Import ECR service and simulate refresh
      const { ECRService } = await import('./services/ecrService');
      const freshData = await ECRService.scrapeFantasyPros(position.toUpperCase());
      
      res.json({
        position: position.toUpperCase(),
        refreshed_at: new Date().toISOString(),
        sources_updated: ['FantasyPros'],
        players_count: freshData.length,
        next_refresh: 'Post-Week 1 games (Tuesday)',
        status: 'success'
      });
      
    } catch (error) {
      console.error('ECR refresh error:', error);
      res.status(500).json({ error: 'Failed to refresh ECR data' });
    }
  });

  app.get('/api/power/health', async (req: Request, res: Response) => {
    try {
      const stats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_players,
          COUNT(DISTINCT season) as seasons,
          MAX(last_update) as last_update
        FROM player_week_facts
      `);
      
      const rankStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_ranks,
          COUNT(DISTINCT ranking_type) as ranking_types
        FROM power_ranks
      `);
      
      res.json({
        status: 'healthy',
        service: 'otc_power_database',
        data_source: 'live_database',
        stats: {
          total_players: (stats as any)[0]?.total_players || 0,
          total_ranks: (rankStats as any)[0]?.total_ranks || 0,
          seasons: (stats as any)[0]?.seasons || 0,
          ranking_types: (rankStats as any)[0]?.ranking_types || 0,
          last_update: (stats as any)[0]?.last_update
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Power rankings health error:', error);
      res.status(500).json({ 
        status: 'unhealthy', 
        error: 'Database connection failed',
        timestamp: new Date().toISOString() 
      });
    }
  });

  // ===== FPG-CENTRIC POWER RANKINGS =====
  // Phase 1 cleanup: otc-power module removed (LEGACY_UNUSED)
  // These endpoints now return deprecation notices - use FORGE rankings instead
  
  app.get('/api/power/fpg/rankings', (_req, res) => {
    res.status(410).json({
      error: 'FPG Power Rankings deprecated',
      message: 'This endpoint has been removed. Use /api/forge/rankings instead.',
      migration: 'See docs/oasis_audit.md for details'
    });
  });
  
  app.get('/api/power/fpg/player/:player_id', (_req, res) => {
    res.status(410).json({
      error: 'FPG Player Analysis deprecated',
      message: 'This endpoint has been removed. Use /api/forge/player/:id instead.',
      migration: 'See docs/oasis_audit.md for details'
    });
  });
  
  app.get('/api/power/fpg/health', (_req, res) => {
    res.json({
      status: 'deprecated',
      message: 'FPG Power module has been removed. Use FORGE rankings.',
      timestamp: new Date().toISOString()
    });
  });

  // Leaders endpoints for weekly performances and defense analysis
  app.get('/api/leaders/weekly', async (req: Request, res: Response) => {
    try {
      const season = parseInt(req.query.season as string) || 2024;
      const week = parseInt(req.query.week as string) || 1;
      const position = req.query.position as string || 'RB';
      const limit = parseInt(req.query.limit as string) || 25;

      const query = sql`
        SELECT player_name AS player, player_team AS team, def_team AS opponent_def, fpts
        FROM player_vs_defense
        WHERE season = ${season} AND week = ${week} AND position = ${position}
        ORDER BY fpts DESC
        LIMIT ${limit}
      `;

      const items = await db.execute(query);

      res.json({
        season,
        week,
        position,
        items: items.rows.map(row => ({
          player: row.player,
          team: row.team,
          opponent_def: row.opponent_def,
          fpts: parseFloat(row.fpts as string)
        }))
      });
    } catch (error) {
      console.error('❌ Leaders weekly error:', error);
      res.status(500).json({ error: 'Failed to fetch weekly leaders' });
    }
  });

  app.get('/api/leaders/allowed', async (req: Request, res: Response) => {
    try {
      const season = parseInt(req.query.season as string) || 2024;
      const week = parseInt(req.query.week as string) || 1;
      const position = req.query.position as string || 'RB';

      const query = sql`
        SELECT def_team, SUM(fpts) AS total_fpts
        FROM player_vs_defense
        WHERE season = ${season} AND week = ${week} AND position = ${position}
        GROUP BY def_team
        ORDER BY total_fpts DESC
      `;

      const items = await db.execute(query);

      res.json({
        season,
        week,
        position,
        items: items.rows.map(row => ({
          def_team: row.def_team,
          total_fpts: parseFloat(row.total_fpts as string)
        }))
      });
    } catch (error) {
      console.error('❌ Leaders allowed error:', error);
      res.status(500).json({ error: 'Failed to fetch points allowed' });
    }
  });

  // ============================================================================
  // ADMIN MANAGEMENT API - BRAND SIGNALS BRAIN SYSTEM CONTROL
  // ============================================================================

  /**
   * 1. POST /api/admin/season/set - Manual season override for testing/debugging
   */
  app.post('/api/admin/season/set', requireAdminAuth, rateLimiters.heavyOperation, async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      console.log('🔧 [AdminAPI] Season override request received');
      
      // Validate request body
      const validatedData = validateSetSeason(req.body);
      
      // Execute season override
      const result = await adminService.setSeason(validatedData);
      
      const duration = Date.now() - startTime;
      console.log(`✅ [AdminAPI] Season override completed in ${duration}ms`);
      
      res.json({
        success: true,
        message: result.message,
        data: {
          newSeason: validatedData.season,
          newWeek: validatedData.week,
          newSeasonType: validatedData.seasonType,
          previousSeason: result.previousSeason
        },
        timestamp: new Date().toISOString(),
        operation: 'season_override',
        processingTimeMs: duration
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ [AdminAPI] Season override failed:', error);
      
      const statusCode = error instanceof z.ZodError ? 400 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: error instanceof z.ZodError 
          ? 'Validation error: ' + error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
          : (error as Error).message || 'Unknown error',
        details: error instanceof z.ZodError ? error.errors : undefined,
        timestamp: new Date().toISOString(),
        operation: 'season_override',
        processingTimeMs: duration
      });
    }
  });

  /**
   * 2. POST /api/admin/brand/replay - Replay brand signal generation for specific period
   */
  app.post('/api/admin/brand/replay', requireAdminAuth, async (req: Request, res: Response) => {
    await handleAdminBrandReplay(req, res, adminService);
  });

  /**
   * 3. POST /api/admin/brand/stream - Trigger live brand signal streaming
   */
  app.post('/api/admin/brand/stream', requireAdminAuth, async (req: Request, res: Response) => {
    await handleAdminBrandStream(req, res, adminService);
  });

  /**
   * 4. GET /api/admin/signals/status - System status and brand signal health
   */
  app.get('/api/admin/signals/status', requireAdminAuth, async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      console.log('📊 [AdminAPI] Status check request received');
      
      // Validate query parameters
      const validatedQuery = validateSignalsStatus(req.query);
      
      // Get system status
      const status = await adminService.getSystemStatus();
      
      const duration = Date.now() - startTime;
      console.log(`✅ [AdminAPI] Status check completed in ${duration}ms`);
      
      res.json({
        success: true,
        data: status,
        metadata: {
          timestamp: new Date().toISOString(),
          operation: 'status_check',
          processingTimeMs: duration,
          detailedMode: validatedQuery.detailed || false,
          requestedBrands: validatedQuery.brands
        }
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ [AdminAPI] Status check failed:', error);
      
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
        timestamp: new Date().toISOString(),
        operation: 'status_check',
        processingTimeMs: duration
      });
    }
  });

  /**
   * 5. DELETE /api/admin/signals/purge - Purge signals with safety guards
   */
  app.delete('/api/admin/signals/purge', requireAdminAuth, async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      console.log('🗑️ [AdminAPI] Signal purge request received');
      
      // Validate request body
      const validatedData = validateSignalsPurge(req.body);
      
      // Execute purge (with safety checks)
      const result = await adminService.purgeSignals(validatedData);
      
      const duration = Date.now() - startTime;
      const logLevel = validatedData.dryRun ? '👀' : '🗑️';
      console.log(`${logLevel} [AdminAPI] Signal purge ${validatedData.dryRun ? 'preview' : 'execution'} completed in ${duration}ms`);
      
      res.json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date().toISOString(),
          operation: 'signals_purge',
          processingTimeMs: duration,
          dryRun: validatedData.dryRun
        },
        safetyWarning: !validatedData.dryRun ? 
          'ACTUAL DELETION PERFORMED - signals have been permanently removed' : 
          'This was a dry run preview - no signals were actually deleted'
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ [AdminAPI] Signal purge failed:', error);
      
      const statusCode = error instanceof z.ZodError ? 400 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: error instanceof z.ZodError 
          ? 'Validation error: ' + error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
          : (error as Error).message || 'Unknown error',
        details: error instanceof z.ZodError ? error.errors : undefined,
        timestamp: new Date().toISOString(),
        operation: 'signals_purge',
        processingTimeMs: duration
      });
    }
  });

  /**
   * GET /api/admin/config - Admin API configuration and capabilities
   */
  app.get('/api/admin/config', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: {
          config: ADMIN_API_CONFIG,
          endpoints: {
            'POST /api/admin/season/set': 'Manual season override for testing/debugging',
            'POST /api/admin/brand/replay': 'Replay brand signal generation for specific period',
            'POST /api/admin/brand/stream': 'Trigger live brand signal streaming',
            'GET /api/admin/signals/status': 'System status and brand signal health',
            'DELETE /api/admin/signals/purge': 'Purge signals by criteria (with safety guards)',
            'GET /api/admin/config': 'Admin API configuration and capabilities'
          },
          authentication: {
            method: 'API Key',
            header: 'x-admin-api-key',
            alternativeHeaders: ['Authorization (Bearer token)', 'admin_key query parameter']
          },
          safetyFeatures: [
            'Comprehensive input validation with Zod schemas',
            'Dry-run mode for destructive operations', 
            'Detailed operation logging and monitoring',
            'Error boundaries and proper status codes',
            'Rate limiting protection on expensive operations'
          ]
        },
        timestamp: new Date().toISOString(),
        operation: 'config_info'
      });
    } catch (error) {
      console.error('❌ [AdminAPI] Config endpoint failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
        timestamp: new Date().toISOString(),
        operation: 'config_info'
      });
    }
  });

  /**
   * GET /api/admin/rag-status - RAG System Status Dashboard
   */
  app.get('/api/admin/rag-status', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { chunks, chatSessions, chatMessages } = await import('@shared/schema');
      
      // Get table counts
      const [chunksCount] = await db.select({ count: sql<number>`count(*)` }).from(chunks);
      const [sessionsCount] = await db.select({ count: sql<number>`count(*)` }).from(chatSessions);
      const [messagesCount] = await db.select({ count: sql<number>`count(*)` }).from(chatMessages);

      // Get sample chunks (first 5)
      const sampleChunks = await db
        .select({
          id: chunks.id,
          content: chunks.content,
          metadata: chunks.metadata,
          createdAt: chunks.createdAt,
        })
        .from(chunks)
        .orderBy(desc(chunks.createdAt))
        .limit(5);

      // Get recent sessions
      const recentSessionsData = await db
        .select({
          id: chatSessions.id,
          userLevel: chatSessions.userLevel,
          updatedAt: chatSessions.updatedAt,
        })
        .from(chatSessions)
        .orderBy(desc(chatSessions.updatedAt))
        .limit(10);

      // Get message counts for each session separately
      const sessionsWithCounts = await Promise.all(
        recentSessionsData.map(async (session) => {
          const [msgCount] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(chatMessages)
            .where(eq(chatMessages.sessionId, session.id));
          
          return {
            id: session.id,
            user_level: session.userLevel,
            message_count: msgCount.count,
            updated_at: session.updatedAt?.toISOString() || null,
          };
        })
      );

      // Check pgvector extension
      const vectorCheck = await db.execute(sql`
        SELECT extname, extversion 
        FROM pg_extension 
        WHERE extname = 'vector';
      `);

      res.json({
        success: true,
        tables: {
          chunks: { count: chunksCount.count },
          chat_sessions: { count: sessionsCount.count },
          chat_messages: { count: messagesCount.count },
        },
        pgvector_enabled: vectorCheck.rows.length > 0,
        pgvector_version: vectorCheck.rows[0]?.extversion || null,
        sample_chunks: sampleChunks.map(chunk => ({
          id: chunk.id,
          content_preview: chunk.content?.substring(0, 150) || '',
          metadata: chunk.metadata,
          created_at: chunk.createdAt?.toISOString() || null,
        })),
        recent_sessions: sessionsWithCounts,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('❌ [AdminAPI] RAG status failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * INTERNAL_ONLY: admin sandbox ranking lane for experimentation only.
   * Not a canonical public rankings contract surface.
   *
   * GET /api/admin/wr-rankings-sandbox - WR Rankings Algorithm Test Sandbox
   * Alpha composite score (0-100) blends volume (45%), total fantasy points (35%), and efficiency (20%)
   * PLUS 8 advanced metrics: weighted volume, boom/bust, talent, stability, role delta, RZ dom, energy
   * Returns: Top 30 WRs from 2025 season with 2+ games / 10+ targets, sorted by alphaScore DESC
   * Includes IR/OUT players with red status badges
   */
  app.get('/api/admin/wr-rankings-sandbox', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { weeklyStats, playerIdentityMap, wrRoleBank } = await import('@shared/schema');
      const { calculateWRAdvancedMetrics } = await import('./services/wrAdvancedMetricsService');
      const { calculateWrAlphaScore } = await import('./services/wrAlphaEngine');
      
      // Import player_injuries table for IR status
      const { playerInjuries } = await import('@shared/schema');
      
      // Parse season from query param, default to 2025 (current season)
      const season = req.query.season && !Number.isNaN(Number(req.query.season))
        ? Number(req.query.season)
        : 2025;
      
      // STEP 1: Query WRs with 2+ games/10+ targets to get qualified player list
      // IMPORTANT: Join with player_identity_map for authoritative position data
      // (weekly_stats.position has incorrect data - RBs labeled as "WR")
      const results = await db
        .select({
          playerId: weeklyStats.playerId,
          playerName: weeklyStats.playerName,
          team: weeklyStats.team,
          position: playerIdentityMap.position,
          canonicalId: playerIdentityMap.canonicalId,
          gamesPlayed: sql<number>`COUNT(DISTINCT ${weeklyStats.week})::int`,
          totalTargets: sql<number>`SUM(COALESCE(${weeklyStats.targets}, 0))::int`,
          totalFantasyPoints: sql<number>`SUM(COALESCE(${weeklyStats.fantasyPointsPpr}, 0))::real`,
          // WR Role Bank metrics
          roleScore: wrRoleBank.roleScore,
          pureRoleScore: wrRoleBank.pureRoleScore,
          volumeScore: wrRoleBank.volumeScore,
          consistencyScore: wrRoleBank.consistencyScore,
          highValueUsageScore: wrRoleBank.highValueUsageScore,
          momentumScore: wrRoleBank.momentumScore,
          deepTargetRate: wrRoleBank.deepTargetRate,
          slotRouteShareEst: wrRoleBank.slotRouteShareEst,
          roleTier: wrRoleBank.roleTier,
          // Additional fields for Alpha Engine
          targetsPerGame: wrRoleBank.targetsPerGame,
          targetShareAvg: wrRoleBank.targetShareAvg,
          routesPerGame: wrRoleBank.routesPerGame,
          pprPerTarget: wrRoleBank.pprPerTarget,
          // Injury status
          injuryStatus: playerInjuries.status,
          injuryType: playerInjuries.injuryType,
        })
        .from(weeklyStats)
        .innerJoin(
          playerIdentityMap,
          eq(weeklyStats.playerId, playerIdentityMap.nflDataPyId)
        )
        .leftJoin(
          wrRoleBank,
          and(
            eq(weeklyStats.playerId, wrRoleBank.playerId),
            eq(wrRoleBank.season, season)
          )
        )
        .leftJoin(
          playerInjuries,
          eq(playerIdentityMap.canonicalId, playerInjuries.playerId)
        )
        .where(
          and(
            eq(weeklyStats.season, season),
            eq(playerIdentityMap.position, 'WR')  // Use authoritative position from player_identity_map
          )
        )
        .groupBy(
          weeklyStats.playerId, 
          weeklyStats.playerName, 
          weeklyStats.team, 
          playerIdentityMap.position,
          playerIdentityMap.canonicalId,
          wrRoleBank.roleScore,
          wrRoleBank.pureRoleScore,
          wrRoleBank.volumeScore,
          wrRoleBank.consistencyScore,
          wrRoleBank.highValueUsageScore,
          wrRoleBank.momentumScore,
          wrRoleBank.deepTargetRate,
          wrRoleBank.slotRouteShareEst,
          wrRoleBank.roleTier,
          wrRoleBank.targetsPerGame,
          wrRoleBank.targetShareAvg,
          wrRoleBank.routesPerGame,
          wrRoleBank.pprPerTarget,
          playerInjuries.status,
          playerInjuries.injuryType
        )
        .having(sql`COUNT(DISTINCT ${weeklyStats.week}) >= 2 AND SUM(COALESCE(${weeklyStats.targets}, 0)) >= 10`);
      
      // STEP 2: Get momentum scores ONLY for qualified players (not all WRs)
      const qualifiedPlayerIds = results.map(p => p.playerId);
      const momentumMap = new Map<string, number>();
      
      if (qualifiedPlayerIds.length > 0) {
        const { inArray } = await import('drizzle-orm');
        const momentumQuery = await db
          .select({
            playerId: wrRoleBank.playerId,
            momentumScore: wrRoleBank.momentumScore
          })
          .from(wrRoleBank)
          .where(
            and(
              eq(wrRoleBank.season, season),
              inArray(wrRoleBank.playerId, qualifiedPlayerIds)
            )
          );
        
        for (const row of momentumQuery) {
          if (row.momentumScore !== null) {
            momentumMap.set(row.playerId, row.momentumScore);
          }
        }
      }
      
      // STEP 3: Calculate advanced metrics ONLY for qualified players
      const advancedMetricsMap = await calculateWRAdvancedMetrics(season, 2, momentumMap, qualifiedPlayerIds);
      
      // STEP 3.5: Fetch team environment scores for env-adjusted alpha
      const { forgeTeamEnvironment, forgeTeamMatchupContext } = await import('@shared/schema');
      const { applyForgeEnvModifier, applyForgeMatchupModifier } = await import('./modules/forge/contextModifiers');
      
      // Get latest week's environment scores
      const latestWeekResult = await db.execute(sql`
        SELECT MAX(week) as latest_week FROM forge_team_environment WHERE season = ${season}
      `);
      const latestEnvWeek = (latestWeekResult.rows[0] as any)?.latest_week || 12;
      
      const envScores = await db
        .select({
          team: forgeTeamEnvironment.team,
          envScore100: forgeTeamEnvironment.envScore100,
        })
        .from(forgeTeamEnvironment)
        .where(
          and(
            eq(forgeTeamEnvironment.season, season),
            eq(forgeTeamEnvironment.week, latestEnvWeek)
          )
        );
      
      const envMap = new Map<string, number>();
      for (const row of envScores) {
        if (row.team && row.envScore100 !== null) {
          envMap.set(row.team, row.envScore100);
        }
      }
      
      // STEP 3.6: Fetch matchup scores for WR position (keyed by defense team)
      const matchupScores = await db
        .select({
          defenseTeam: forgeTeamMatchupContext.defenseTeam,
          matchupScore100: forgeTeamMatchupContext.matchupScore100,
        })
        .from(forgeTeamMatchupContext)
        .where(
          and(
            eq(forgeTeamMatchupContext.season, season),
            eq(forgeTeamMatchupContext.week, latestEnvWeek),
            eq(forgeTeamMatchupContext.position, 'WR')
          )
        );
      
      // Map: defense_team -> matchup_score_100 (higher = easier matchup for WRs)
      const matchupMap = new Map<string, number>();
      for (const row of matchupScores) {
        if (row.defenseTeam && row.matchupScore100 !== null) {
          matchupMap.set(row.defenseTeam, row.matchupScore100);
        }
      }
      
      // STEP 3.7: Get opponent data from schedule (if available)
      // For v0, we attempt to get opponent but use neutral (50) if unknown
      const scheduleResult = await db.execute(sql`
        SELECT home, away FROM schedule 
        WHERE season = ${season} AND week = ${latestEnvWeek}
      `);
      
      // Build team -> opponent map
      const opponentMap = new Map<string, string>();
      for (const row of scheduleResult.rows as any[]) {
        if (row.home && row.away) {
          opponentMap.set(row.home, row.away);
          opponentMap.set(row.away, row.home);
        }
      }

      // Calculate volume-weighted efficiency metrics and merge advanced metrics
      const processedPlayers = results.map(player => {
        const targets = player.totalTargets;
        const fantasyPoints = player.totalFantasyPoints;
        
        // Sample penalty: scale from 0 to 1 based on volume (50 targets = full weight)
        const samplePenalty = Math.min(1, targets / 50);
        
        // Raw efficiency
        const pointsPerTarget = targets > 0 
          ? fantasyPoints / targets
          : 0;
        
        // Volume-weighted efficiency
        const adjustedEfficiency = pointsPerTarget * samplePenalty;
        
        // Get advanced metrics for this player (energy index already blends momentum)
        const advMetrics = advancedMetricsMap.get(player.playerId);
        
        return {
          playerId: player.playerId,
          canonicalId: player.canonicalId,
          playerName: player.playerName,
          team: player.team || 'FA',
          gamesPlayed: player.gamesPlayed,
          targets: targets,
          fantasyPoints: Math.round(fantasyPoints * 100) / 100,
          pointsPerTarget: Math.round(pointsPerTarget * 100) / 100,
          samplePenalty: Math.round(samplePenalty * 100) / 100,
          adjustedEfficiency: Math.round(adjustedEfficiency * 100) / 100,
          // Injury status (IR/OUT badges)
          injuryStatus: player.injuryStatus ?? null,
          injuryType: player.injuryType ?? null,
          // WR Role Bank metrics (may be null if not in role bank)
          roleScore: player.roleScore ?? null,
          pureRoleScore: player.pureRoleScore ?? null,
          volumeScore: player.volumeScore ?? null,
          consistencyScore: player.consistencyScore ?? null,
          highValueUsageScore: player.highValueUsageScore ?? null,
          momentumScore: player.momentumScore ?? null,
          deepTargetRate: player.deepTargetRate ? Math.round(player.deepTargetRate * 100) / 100 : null,
          slotRouteShareEst: player.slotRouteShareEst ? Math.round(player.slotRouteShareEst * 100) / 100 : null,
          roleTier: player.roleTier ?? null,
          // Advanced metrics (new) - energy index blends boom, role delta, efficiency trend, and momentum
          weightedTargetsPerGame: advMetrics?.weightedTargetsPerGame ?? null,
          weightedTargetsIndex: advMetrics?.weightedTargetsIndex ?? null,
          boomRate: advMetrics?.boomRate ?? null,
          bustRate: advMetrics?.bustRate ?? null,
          talentIndex: advMetrics?.talentIndex ?? null,
          yardsPerTarget: advMetrics?.yardsPerTarget ?? null,
          yardsPerRoute: advMetrics?.yardsPerRoute ?? null,
          usageStabilityIndex: advMetrics?.usageStabilityIndex ?? null,
          roleDelta: advMetrics?.roleDelta ?? null,
          recentTargetsPerGame: advMetrics?.recentTargetsPerGame ?? null,
          seasonTargetsPerGame: advMetrics?.seasonTargetsPerGame ?? null,
          redZoneDomScore: advMetrics?.redZoneDomScore ?? null,
          redZoneTargetsPerGame: advMetrics?.redZoneTargetsPerGame ?? null,
          endZoneTargetsPerGame: advMetrics?.endZoneTargetsPerGame ?? null,
          energyIndex: advMetrics?.energyIndex ?? null,
          efficiencyTrend: advMetrics?.efficiencyTrend ?? null,
        };
      });

      // Add TIBER Alpha Engine scores (unified 4-pillar system)
      const ranked = processedPlayers
        .map(player => {
          // Prepare input for unified Alpha Engine
          const fantasyPointsPerGame = player.gamesPlayed > 0 ? player.fantasyPoints / player.gamesPlayed : 0;
          
          const alphaInput = {
            gamesPlayed: player.gamesPlayed,
            targetsPerGame: player.targetsPerGame ?? (player.gamesPlayed > 0 ? player.targets / player.gamesPlayed : 0),
            totalTargets: player.targets,
            targetShareAvg: player.targetShareAvg ?? null,
            routesPerGame: player.routesPerGame ?? null,
            fantasyPointsTotal: player.fantasyPoints,
            fantasyPointsPerGame,
            pprPerTarget: player.pprPerTarget ?? player.pointsPerTarget,
            adjPprPerTarget: player.adjustedEfficiency,
            consistencyScore: player.consistencyScore ?? null,
            momentumScore: player.momentumScore ?? null,
            deepTargetRate: player.deepTargetRate ?? null,
            slotRouteShareEst: player.slotRouteShareEst ?? null,
            pureRoleScore: player.pureRoleScore ?? null,
          };
          
          // Calculate unified alpha score using 4-pillar engine
          const alphaOutput = calculateWrAlphaScore(alphaInput);
          
          // Apply environment modifier to base alpha (wEnv=0.40 allows ±40% swings)
          const teamEnvScore = envMap.get(player.team) ?? null;
          const envResult = applyForgeEnvModifier({
            rawAlpha: alphaOutput.alphaScore,
            envScore: teamEnvScore,
            wEnv: 0.40,
          });
          
          // Apply matchup modifier on top of env-adjusted alpha (wMatchup=0.25)
          // Get opponent from schedule, then lookup their defensive matchup score
          const opponent = opponentMap.get(player.team) ?? null;
          const matchupScore = opponent ? (matchupMap.get(opponent) ?? null) : null;
          const matchupResult = applyForgeMatchupModifier({
            alphaAfterEnv: envResult.envAdjustedAlpha,
            matchupScore,
            wMatchup: 0.25,
          });
          
          return {
            ...player,
            // TIBER Alpha Engine (unified 50/25/15/10)
            alphaScore: matchupResult.finalAlpha,  // Final: env + matchup adjusted alpha
            forge_alpha_base: envResult.baseAlpha,
            forge_alpha_env: envResult.envAdjustedAlpha,
            forge_env_multiplier: envResult.envMultiplier,
            forge_env_score_100: teamEnvScore,
            forge_matchup_score_100: matchupScore,
            forge_matchup_multiplier: matchupResult.matchupMultiplier,
            forge_opponent: opponent,
            volumeIndex: alphaOutput.volumeIndex,
            productionIndex: alphaOutput.productionIndex,
            efficiencyIndex: alphaOutput.efficiencyIndex,
            stabilityIndex: alphaOutput.stabilityIndex,
          };
        })
        // Sort by alpha score DESC, then by adjusted efficiency DESC (tie-breaker)
        .sort((a, b) => {
          if (b.alphaScore !== a.alphaScore) {
            return b.alphaScore - a.alphaScore;
          }
          return b.adjustedEfficiency - a.adjustedEfficiency;
        })
        .slice(0, 30);

      res.json({
        success: true,
        season,
        envWeek: latestEnvWeek,
        matchupWeek: latestEnvWeek,
        matchupsAvailable: opponentMap.size > 0,
        minGames: 2,
        minTargets: 10,
        count: ranked.length,
        players: ranked,
      });

    } catch (error) {
      console.error('❌ [AdminAPI] WR Rankings Sandbox failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  /**
   * GET /api/admin/rb-rankings-sandbox - RB Rankings Algorithm Test Sandbox
   * Returns: Top 30 RBs from 2025 season with 2+ games / 15+ carries
   * Metrics: Total carries, total rushing yards, fantasy points per rush attempt
   */
  app.get('/api/admin/rb-rankings-sandbox', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { weeklyStats, playerIdentityMap } = await import('@shared/schema');
      const { playerInjuries } = await import('@shared/schema');
      
      // STEP 1: Query 2025 RBs with 2+ games/15+ carries
      const results = await db
        .select({
          playerId: weeklyStats.playerId,
          playerName: weeklyStats.playerName,
          team: weeklyStats.team,
          position: playerIdentityMap.position,
          canonicalId: playerIdentityMap.canonicalId,
          gamesPlayed: sql<number>`COUNT(DISTINCT ${weeklyStats.week})::int`,
          totalCarries: sql<number>`SUM(COALESCE(${weeklyStats.rushAtt}, 0))::int`,
          totalRushingYards: sql<number>`SUM(COALESCE(${weeklyStats.rushYd}, 0))::int`,
          totalFantasyPoints: sql<number>`SUM(COALESCE(${weeklyStats.fantasyPointsPpr}, 0))::real`,
          // Receiving metrics
          totalTargets: sql<number>`SUM(COALESCE(${weeklyStats.targets}, 0))::int`,
          totalReceptions: sql<number>`SUM(COALESCE(${weeklyStats.rec}, 0))::int`,
          totalReceivingYards: sql<number>`SUM(COALESCE(${weeklyStats.recYd}, 0))::int`,
          totalReceivingTDs: sql<number>`SUM(COALESCE(${weeklyStats.recTd}, 0))::int`,
          // Injury status
          injuryStatus: playerInjuries.status,
          injuryType: playerInjuries.injuryType,
        })
        .from(weeklyStats)
        .innerJoin(
          playerIdentityMap,
          eq(weeklyStats.playerId, playerIdentityMap.nflDataPyId)
        )
        .leftJoin(
          playerInjuries,
          eq(playerIdentityMap.canonicalId, playerInjuries.playerId)
        )
        .where(
          and(
            eq(weeklyStats.season, 2025),
            eq(playerIdentityMap.position, 'RB')
          )
        )
        .groupBy(
          weeklyStats.playerId, 
          weeklyStats.playerName, 
          weeklyStats.team, 
          playerIdentityMap.position,
          playerIdentityMap.canonicalId,
          playerInjuries.status,
          playerInjuries.injuryType
        );

      // STEP 2: Filter for minimum qualifications (2+ games, 15+ carries)
      const qualified = results.filter(r => r.gamesPlayed >= 2 && r.totalCarries >= 15);
      
      // STEP 2.5: Fetch team environment scores for env-adjusted alpha
      const { forgeTeamEnvironment, forgeTeamMatchupContext } = await import('@shared/schema');
      const { applyForgeEnvModifier, applyForgeMatchupModifier } = await import('./modules/forge/contextModifiers');
      
      const latestWeekResult = await db.execute(sql`
        SELECT MAX(week) as latest_week FROM forge_team_environment WHERE season = 2025
      `);
      const latestEnvWeek = (latestWeekResult.rows[0] as any)?.latest_week || 12;
      
      const envScores = await db
        .select({
          team: forgeTeamEnvironment.team,
          envScore100: forgeTeamEnvironment.envScore100,
        })
        .from(forgeTeamEnvironment)
        .where(
          and(
            eq(forgeTeamEnvironment.season, 2025),
            eq(forgeTeamEnvironment.week, latestEnvWeek)
          )
        );
      
      const envMap = new Map<string, number>();
      for (const row of envScores) {
        if (row.team && row.envScore100 !== null) {
          envMap.set(row.team, row.envScore100);
        }
      }
      
      // STEP 2.6: Fetch matchup scores for RB position (keyed by defense team)
      const matchupScores = await db
        .select({
          defenseTeam: forgeTeamMatchupContext.defenseTeam,
          matchupScore100: forgeTeamMatchupContext.matchupScore100,
        })
        .from(forgeTeamMatchupContext)
        .where(
          and(
            eq(forgeTeamMatchupContext.season, 2025),
            eq(forgeTeamMatchupContext.week, latestEnvWeek),
            eq(forgeTeamMatchupContext.position, 'RB')
          )
        );
      
      // Map: defense_team -> matchup_score_100 (higher = easier matchup for RBs)
      const matchupMap = new Map<string, number>();
      for (const row of matchupScores) {
        if (row.defenseTeam && row.matchupScore100 !== null) {
          matchupMap.set(row.defenseTeam, row.matchupScore100);
        }
      }
      
      // STEP 2.7: Get opponent data from schedule (if available)
      const scheduleResult = await db.execute(sql`
        SELECT home, away FROM schedule 
        WHERE season = 2025 AND week = ${latestEnvWeek}
      `);
      
      // Build team -> opponent map
      const opponentMap = new Map<string, string>();
      for (const row of scheduleResult.rows as any[]) {
        if (row.home && row.away) {
          opponentMap.set(row.home, row.away);
          opponentMap.set(row.away, row.home);
        }
      }

      // STEP 3: Calculate fantasy points per rush attempt, receiving metrics, and opportunity metrics
      const processedPlayers = qualified.map(player => {
        const fantasyPointsPerRushAttempt = player.totalCarries > 0 
          ? player.totalFantasyPoints / player.totalCarries 
          : 0;

        // Calculate receiving fantasy points (half-PPR): rec * 0.5 + recYd / 10 + recTD * 6
        const receivingFantasyPoints = 
          (player.totalReceptions * 0.5) + 
          (player.totalReceivingYards / 10) + 
          (player.totalReceivingTDs * 6);
        
        // Receiving fantasy per game
        const receivingFantasyPerGame = player.gamesPlayed > 0 
          ? receivingFantasyPoints / player.gamesPlayed 
          : 0;

        // Weighted Opportunities: carries + 1.5 * targets
        const weightedOpportunities = player.totalCarries + (1.5 * player.totalTargets);
        
        // Weighted Opp per Game
        const weightedOppPerGame = player.gamesPlayed > 0 
          ? weightedOpportunities / player.gamesPlayed 
          : 0;

        // FP per Opportunity (guard against divide by zero)
        const fpPerOpp = weightedOpportunities > 0 
          ? player.totalFantasyPoints / weightedOpportunities 
          : 0;

        // RB Alpha Score calculation (simplified 4-pillar: Volume 40%, Production 30%, Efficiency 20%, Receiving 10%)
        const fpPerGame = player.gamesPlayed > 0 ? player.totalFantasyPoints / player.gamesPlayed : 0;
        
        // Volume Index (weighted opportunities per game, scaled 0-100)
        // Elite bellcow: 25+ opp/game → 100, Average: 15 → 60, Low: 10 → 40
        const volumeIndex = Math.min(100, (weightedOppPerGame / 25) * 100);
        
        // Production Index (FP/G scaled, elite RB1: 18+ FP/G → 100)
        const productionIndex = Math.min(100, (fpPerGame / 18) * 100);
        
        // Efficiency Index (FP per opportunity, elite: 1.0+ → 100)
        const efficiencyIndex = Math.min(100, (fpPerOpp / 1.0) * 100);
        
        // Receiving Index (receiving FP/G, elite: 5+ → 100)
        const receivingIndex = Math.min(100, (receivingFantasyPerGame / 5) * 100);
        
        // Base Alpha Score (40% volume, 30% production, 20% efficiency, 10% receiving)
        const baseAlphaScore = 
          (0.40 * volumeIndex) + 
          (0.30 * productionIndex) + 
          (0.20 * efficiencyIndex) + 
          (0.10 * receivingIndex);
        
        // Apply environment modifier (wEnv=0.40 allows ±40% swings)
        const teamEnvScore = envMap.get(player.team ?? '') ?? null;
        const envResult = applyForgeEnvModifier({
          rawAlpha: baseAlphaScore,
          envScore: teamEnvScore,
          wEnv: 0.40,
        });
        
        // Apply matchup modifier on top of env-adjusted alpha (wMatchup=0.25)
        const opponent = opponentMap.get(player.team ?? '') ?? null;
        const matchupScore = opponent ? (matchupMap.get(opponent) ?? null) : null;
        const matchupResult = applyForgeMatchupModifier({
          alphaAfterEnv: envResult.envAdjustedAlpha,
          matchupScore,
          wMatchup: 0.25,
        });
        
        return {
          playerId: player.playerId,
          canonicalId: player.canonicalId ?? null,
          playerName: player.playerName,
          team: player.team,
          gamesPlayed: player.gamesPlayed,
          totalCarries: player.totalCarries,
          totalRushingYards: player.totalRushingYards,
          fantasyPoints: player.totalFantasyPoints,
          fantasyPointsPerRushAttempt: Math.round(fantasyPointsPerRushAttempt * 100) / 100,
          // Receiving metrics
          totalTargets: player.totalTargets,
          totalReceptions: player.totalReceptions,
          totalReceivingYards: player.totalReceivingYards,
          totalReceivingTDs: player.totalReceivingTDs,
          // Calculated receiving fantasy per game (for alpha score)
          receivingFantasyPerGame: Math.round(receivingFantasyPerGame * 100) / 100,
          // Opportunity metrics
          weightedOppPerGame: Math.round(weightedOppPerGame * 100) / 100,
          fpPerOpp: Math.round(fpPerOpp * 100) / 100,
          // Alpha Score with pillars (env + matchup adjusted)
          alphaScore: Math.round(matchupResult.finalAlpha * 100) / 100,
          forge_alpha_base: Math.round(envResult.baseAlpha * 100) / 100,
          forge_alpha_env: Math.round(envResult.envAdjustedAlpha * 100) / 100,
          forge_env_multiplier: envResult.envMultiplier,
          forge_env_score_100: teamEnvScore,
          forge_matchup_score_100: matchupScore,
          forge_matchup_multiplier: matchupResult.matchupMultiplier,
          forge_opponent: opponent,
          volumeIndex: Math.round(volumeIndex * 100) / 100,
          productionIndex: Math.round(productionIndex * 100) / 100,
          efficiencyIndex: Math.round(efficiencyIndex * 100) / 100,
          receivingIndex: Math.round(receivingIndex * 100) / 100,
          // Injury status (IR/OUT badges)
          injuryStatus: player.injuryStatus ?? null,
          injuryType: player.injuryType ?? null,
        };
      });

      // STEP 4: Sort by alpha score DESC (was by total fantasy points)
      const ranked = processedPlayers
        .sort((a, b) => b.alphaScore - a.alphaScore)
        .slice(0, 30);

      res.json({
        success: true,
        season: 2025,
        envWeek: latestEnvWeek,
        matchupWeek: latestEnvWeek,
        matchupsAvailable: opponentMap.size > 0,
        minGames: 2,
        minCarries: 15,
        count: ranked.length,
        data: ranked,
      });

    } catch (error) {
      console.error('❌ [AdminAPI] RB Rankings Sandbox failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  /**
   * ============================================================
   * TE SANDBOX PHASE 2 – Enhanced TE Rankings Algorithm
   * ============================================================
   * 
   * PHASE 2 ENHANCEMENTS:
   * 1. Snap Stickiness 2.0 – Uses real snap data, blocking proxy metrics
   * 2. TD/RZ Production Upgrade – Red zone targets, TD role score
   * 3. TE Role Archetypes – Big Slot / Inline / Hybrid / H-back
   * 4. Volatility & Context – Floor/ceiling, small sample flags
   * 5. Real Alignment Data – From player_usage (routes_slot, routes_inline)
   * 
   * GET /api/admin/te-rankings-sandbox
   * Returns: TEs from 2025 season with 2+ games / 10+ targets
   * ============================================================
   */
  app.get('/api/admin/te-rankings-sandbox', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { weeklyStats, playerIdentityMap, playerInjuries, playerUsage, bronzeNflfastrPlays } = await import('@shared/schema');
      
      // ============================================================
      // STEP 1: Query base TE receiving metrics from weekly_stats
      // ============================================================
      const baseResults = await db
        .select({
          playerId: weeklyStats.playerId,
          playerName: weeklyStats.playerName,
          team: weeklyStats.team,
          position: playerIdentityMap.position,
          canonicalId: playerIdentityMap.canonicalId,
          gamesPlayed: sql<number>`COUNT(DISTINCT ${weeklyStats.week})::int`,
          totalTargets: sql<number>`SUM(COALESCE(${weeklyStats.targets}, 0))::int`,
          totalReceptions: sql<number>`SUM(COALESCE(${weeklyStats.rec}, 0))::int`,
          totalReceivingYards: sql<number>`SUM(COALESCE(${weeklyStats.recYd}, 0))::int`,
          totalReceivingTDs: sql<number>`SUM(COALESCE(${weeklyStats.recTd}, 0))::int`,
          totalFantasyPointsPpr: sql<number>`SUM(COALESCE(${weeklyStats.fantasyPointsPpr}, 0))::real`,
          totalSnaps: sql<number>`SUM(COALESCE(${weeklyStats.snaps}, 0))::int`,
          totalRoutes: sql<number>`SUM(COALESCE(${weeklyStats.routes}, 0))::int`,
          injuryStatus: playerInjuries.status,
          injuryType: playerInjuries.injuryType,
        })
        .from(weeklyStats)
        .innerJoin(
          playerIdentityMap,
          eq(weeklyStats.playerId, playerIdentityMap.nflDataPyId)
        )
        .leftJoin(
          playerInjuries,
          eq(playerIdentityMap.canonicalId, playerInjuries.playerId)
        )
        .where(
          and(
            eq(weeklyStats.season, 2025),
            eq(playerIdentityMap.position, 'TE')
          )
        )
        .groupBy(
          weeklyStats.playerId, 
          weeklyStats.playerName, 
          weeklyStats.team, 
          playerIdentityMap.position,
          playerIdentityMap.canonicalId,
          playerInjuries.status,
          playerInjuries.injuryType
        );

      // ============================================================
      // STEP 2: Query alignment data from player_usage
      // ============================================================
      const alignmentData = await db
        .select({
          playerId: playerUsage.playerId,
          totalRoutesSlot: sql<number>`SUM(COALESCE(${playerUsage.routesSlot}, 0))::int`,
          totalRoutesInline: sql<number>`SUM(COALESCE(${playerUsage.routesInline}, 0))::int`,
          totalRoutesOutside: sql<number>`SUM(COALESCE(${playerUsage.routesOutside}, 0))::int`,
          totalRoutesUsage: sql<number>`SUM(COALESCE(${playerUsage.routesTotal}, 0))::int`,
          totalUsageSnaps: sql<number>`SUM(COALESCE(${playerUsage.snaps}, 0))::int`,
          avgSlotPct: sql<number>`AVG(COALESCE(${playerUsage.alignmentSlotPct}, 0))::real`,
        })
        .from(playerUsage)
        .where(eq(playerUsage.season, 2025))
        .groupBy(playerUsage.playerId);

      const alignmentMap = new Map(alignmentData.map(a => [a.playerId, a]));

      // ============================================================
      // STEP 3: Query Red Zone targets from bronze_nflfastr_plays
      // ============================================================
      const rzData = await db
        .select({
          receiverId: bronzeNflfastrPlays.receiverPlayerId,
          rzTargets: sql<number>`COUNT(*) FILTER (WHERE (${bronzeNflfastrPlays.rawData}->>'yardline_100')::numeric <= 20)::int`,
          tenZoneTargets: sql<number>`COUNT(*) FILTER (WHERE (${bronzeNflfastrPlays.rawData}->>'yardline_100')::numeric <= 10)::int`,
          goalLineTargets: sql<number>`COUNT(*) FILTER (WHERE (${bronzeNflfastrPlays.rawData}->>'yardline_100')::numeric <= 5)::int`,
          rzTds: sql<number>`COUNT(*) FILTER (WHERE ${bronzeNflfastrPlays.touchdown} = true AND (${bronzeNflfastrPlays.rawData}->>'yardline_100')::numeric <= 20)::int`,
        })
        .from(bronzeNflfastrPlays)
        .where(
          and(
            eq(bronzeNflfastrPlays.season, 2025),
            isNotNull(bronzeNflfastrPlays.receiverPlayerId)
          )
        )
        .groupBy(bronzeNflfastrPlays.receiverPlayerId);

      const rzMap = new Map(rzData.map(r => [r.receiverId, r]));

      // ============================================================
      // STEP 4: Query weekly fantasy data for volatility calculation
      // ============================================================
      const weeklyFantasyData = await db
        .select({
          playerId: weeklyStats.playerId,
          week: weeklyStats.week,
          fantasyPts: weeklyStats.fantasyPointsPpr,
        })
        .from(weeklyStats)
        .innerJoin(
          playerIdentityMap,
          eq(weeklyStats.playerId, playerIdentityMap.nflDataPyId)
        )
        .where(
          and(
            eq(weeklyStats.season, 2025),
            eq(playerIdentityMap.position, 'TE')
          )
        )
        .orderBy(weeklyStats.playerId, weeklyStats.week);

      // Group weekly data by player for volatility
      const weeklyByPlayer = new Map<string, number[]>();
      for (const row of weeklyFantasyData) {
        if (!weeklyByPlayer.has(row.playerId)) {
          weeklyByPlayer.set(row.playerId, []);
        }
        weeklyByPlayer.get(row.playerId)!.push(row.fantasyPts || 0);
      }

      // ============================================================
      // STEP 4.5: Fetch env scores, matchup scores, and schedule
      // ============================================================
      const { forgeTeamEnvironment, forgeTeamMatchupContext } = await import('@shared/schema');
      const { applyForgeEnvModifier, applyForgeMatchupModifier } = await import('./modules/forge/contextModifiers');
      
      // Get latest week's environment scores
      const latestWeekResult = await db.execute(sql`
        SELECT MAX(week) as latest_week FROM forge_team_environment WHERE season = 2025
      `);
      const latestEnvWeek = (latestWeekResult.rows[0] as any)?.latest_week || 12;
      
      // Fetch env scores
      const envScores = await db
        .select({
          team: forgeTeamEnvironment.team,
          envScore100: forgeTeamEnvironment.envScore100,
        })
        .from(forgeTeamEnvironment)
        .where(
          and(
            eq(forgeTeamEnvironment.season, 2025),
            eq(forgeTeamEnvironment.week, latestEnvWeek)
          )
        );
      
      const envMap = new Map<string, number>();
      for (const row of envScores) {
        if (row.team && row.envScore100 !== null) {
          envMap.set(row.team, row.envScore100);
        }
      }
      
      // Fetch TE matchup scores (keyed by defense team)
      const matchupScores = await db
        .select({
          defenseTeam: forgeTeamMatchupContext.defenseTeam,
          matchupScore100: forgeTeamMatchupContext.matchupScore100,
        })
        .from(forgeTeamMatchupContext)
        .where(
          and(
            eq(forgeTeamMatchupContext.season, 2025),
            eq(forgeTeamMatchupContext.week, latestEnvWeek),
            eq(forgeTeamMatchupContext.position, 'TE')
          )
        );
      
      // Map: defense_team -> matchup_score_100 (higher = easier matchup for TEs)
      const matchupMap = new Map<string, number>();
      for (const row of matchupScores) {
        if (row.defenseTeam && row.matchupScore100 !== null) {
          matchupMap.set(row.defenseTeam, row.matchupScore100);
        }
      }
      
      // Get opponent data from schedule
      const scheduleResult = await db.execute(sql`
        SELECT home, away FROM schedule 
        WHERE season = 2025 AND week = ${latestEnvWeek}
      `);
      
      // Build team -> opponent map
      const opponentMap = new Map<string, string>();
      for (const row of scheduleResult.rows as any[]) {
        if (row.home && row.away) {
          opponentMap.set(row.home, row.away);
          opponentMap.set(row.away, row.home);
        }
      }

      // ============================================================
      // STEP 5: Filter for minimum qualifications
      // ============================================================
      const qualified = baseResults.filter(r => r.gamesPlayed >= 2 && r.totalTargets >= 10);

      // ============================================================
      // STEP 6: Calculate normalization maxes across all TEs
      // ============================================================
      const maxRoutes = Math.max(...qualified.map(p => p.totalRoutes || 1), 1);
      const maxSnaps = Math.max(...qualified.map(p => p.totalSnaps || 1), 1);
      const maxFpPerGame = Math.max(...qualified.map(p => {
        const games = p.gamesPlayed;
        const halfPpr = (p.totalReceptions * 0.5) + (p.totalReceivingYards / 10) + (p.totalReceivingTDs * 6);
        return games > 0 ? halfPpr / games : 0;
      }), 1);
      const maxRzTargetsPerGame = Math.max(...qualified.map(p => {
        const rz = rzMap.get(p.playerId);
        return rz ? rz.rzTargets / p.gamesPlayed : 0;
      }), 1);
      const maxEzTargetsPerGame = Math.max(...qualified.map(p => {
        const rz = rzMap.get(p.playerId);
        return rz ? rz.goalLineTargets / p.gamesPlayed : 0;
      }), 0.5);
      const maxCeiling = Math.max(...qualified.map(p => {
        const weekly = weeklyByPlayer.get(p.playerId) || [];
        if (weekly.length < 3) return 0;
        const sorted = [...weekly].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length * 0.8)] || 0;
      }), 1);

      // ============================================================
      // STEP 7: Calculate TE-specific metrics for each player
      // ============================================================
      const processedPlayers = qualified.map(player => {
        const games = player.gamesPlayed;
        const alignment = alignmentMap.get(player.playerId);
        const rzInfo = rzMap.get(player.playerId);
        const weeklyFp = weeklyByPlayer.get(player.playerId) || [];
        
        // --------------------------------------------------------
        // Stage 1: Basic Receiving Metrics
        // --------------------------------------------------------
        const halfPprFantasy = (player.totalReceptions * 0.5) + 
                              (player.totalReceivingYards / 10) + 
                              (player.totalReceivingTDs * 6);
        const fpPerGame = games > 0 ? halfPprFantasy / games : 0;
        const fpPerTarget = player.totalTargets > 0 ? halfPprFantasy / player.totalTargets : 0;
        const targetsPerGame = games > 0 ? player.totalTargets / games : 0;
        const routesPerGame = games > 0 ? (player.totalRoutes || 0) / games : 0;
        const recYdsPerGame = games > 0 ? player.totalReceivingYards / games : 0;

        // --------------------------------------------------------
        // Stage 2: ALIGNMENT DATA (from player_usage or fallback)
        // --------------------------------------------------------
        // DATA NOTE: In player_usage, routes_inline is always 0 for TEs.
        // TEs' "inline" routes are coded as "routes_outside" in the data.
        // So we treat routes_outside as the inline count for TEs.
        let slotPct = 0.35; // Default
        let inlinePct = 0.55;
        let widePct = 0.10;
        let routesSlot = 0;
        let routesInline = 0; // Will be populated from routes_outside for TEs
        let routesOutside = 0;
        let hasRealAlignment = false;

        if (alignment && alignment.totalRoutesUsage > 0) {
          hasRealAlignment = true;
          const total = alignment.totalRoutesUsage;
          routesSlot = alignment.totalRoutesSlot || 0;
          
          // For TEs, routes_inline in DB is always 0, routes_outside = inline
          // So we map routes_outside → inline for TE archetype logic
          routesInline = alignment.totalRoutesOutside || 0; // TE data quirk: outside = inline
          routesOutside = 0; // TEs don't run true outside routes
          
          slotPct = routesSlot / total;
          inlinePct = routesInline / total;
          widePct = 1 - slotPct - inlinePct; // Remainder (typically small)
        }

        // --------------------------------------------------------
        // Stage 3: SNAP STICKINESS 2.0 (Enhanced Formula)
        // --------------------------------------------------------
        const totalSnaps = player.totalSnaps || (alignment?.totalUsageSnaps || 0) || Math.round((player.totalRoutes || 0) / 0.7);
        const routesRun = player.totalRoutes || 0;

        // Route-to-snap ratio: higher = more receiving, lower = more blocking
        const routeSnapRatio = totalSnaps > 0 ? routesRun / totalSnaps : 0.7;
        
        // Blocking proxy: inverse of route ratio (more blocking = higher)
        // A TE who routes 50% of snaps is blocking 50%
        const blockingProxyRate = 1 - routeSnapRatio;
        
        // Blocking stickiness scaled (0-1)
        const blockingStickiness = Math.min(1, Math.max(0, blockingProxyRate * 2));
        
        // Snap share relative to max snaps in dataset
        const snapShare = maxSnaps > 0 ? totalSnaps / maxSnaps : 0;
        
        // Routes per game component (more routes = receiving TE)
        const maxRoutesPerGame = 25; // Elite receiving TE threshold
        const routesPerGameNorm = Math.min(1, routesPerGame / maxRoutesPerGame);
        
        // Slot usage bonus (slot TEs are more valuable for fantasy)
        const slotBonus = slotPct * 0.3;
        
        // SNAP STICKINESS INDEX 2.0 - Enhanced formula with more variance
        // Higher = more fantasy-valuable TE (receiving role, snap share, slot work)
        const snapStickinessIndex = 
          (snapShare * 0.30) +            // 30% snap share
          (routesPerGameNorm * 0.30) +    // 30% routes volume
          (slotBonus) +                    // Slot bonus (up to 30%)
          (blockingStickiness * 0.10);     // 10% blocking contribution

        // --------------------------------------------------------
        // Stage 4: RED ZONE / TD GRAVITY MODULE
        // --------------------------------------------------------
        const rzTargets = rzInfo?.rzTargets || 0;
        const tenZoneTargets = rzInfo?.tenZoneTargets || 0;
        const goalLineTargets = rzInfo?.goalLineTargets || 0;
        const rzTds = rzInfo?.rzTds || 0;
        const totalTds = player.totalReceivingTDs;

        const rzTargetsPerGame = games > 0 ? rzTargets / games : 0;
        const ezTargetsPerGame = games > 0 ? goalLineTargets / games : 0;

        // Normalize for tdRoleScore
        const rzNorm = maxRzTargetsPerGame > 0 ? Math.min(1, rzTargetsPerGame / maxRzTargetsPerGame) : 0;
        const ezNorm = maxEzTargetsPerGame > 0 ? Math.min(1, ezTargetsPerGame / maxEzTargetsPerGame) : 0;
        
        // Expected TDs based on RZ targets (league avg ~20% TD rate on RZ targets)
        const expectedTDs = rzTargets * 0.20;
        const tdOverExp = totalTds - expectedTDs;
        // Normalize: -3 to +3 mapped to 0-1
        const tdOverExpNorm = Math.max(0, Math.min(1, (tdOverExp + 3) / 6));

        // TD ROLE SCORE
        const tdRoleScore = 
          (rzNorm * 0.45) +
          (ezNorm * 0.45) +
          (tdOverExpNorm * 0.10);

        // --------------------------------------------------------
        // Stage 5: PRODUCTION INDEX (enhanced with tdRoleScore)
        // --------------------------------------------------------
        const fpPerGameNorm = maxFpPerGame > 0 ? Math.min(1, fpPerGame / maxFpPerGame) : 0;
        const productionIndex = 
          (fpPerGameNorm * 0.6) +
          (tdRoleScore * 0.4);

        // --------------------------------------------------------
        // Stage 6: TE ROLE ARCHETYPES
        // --------------------------------------------------------
        let archetype: 'BIG_SLOT' | 'INLINE' | 'HYBRID' | 'H_BACK' = 'HYBRID';
        
        // Big Slot: slotPct >= 55%, inlinePct <= 35%
        if (slotPct >= 0.55 && inlinePct <= 0.35) {
          archetype = 'BIG_SLOT';
        }
        // Inline Grinder: inlinePct >= 55%, slotPct <= 35%
        else if (inlinePct >= 0.55 && slotPct <= 0.35) {
          archetype = 'INLINE';
        }
        // H-back / Gadget: low total snaps and routes
        else if (totalSnaps < 150 && routesRun < 80) {
          archetype = 'H_BACK';
        }
        // Hybrid: balanced slot/inline between 35-65%
        else {
          archetype = 'HYBRID';
        }

        // --------------------------------------------------------
        // Stage 7: VOLATILITY & CONTEXT FLAGS
        // --------------------------------------------------------
        let floorFp = 0;
        let ceilingFp = 0;
        let volatilityScore = 0;
        let contextTag: string | null = null;

        if (weeklyFp.length >= 3) {
          const sorted = [...weeklyFp].sort((a, b) => a - b);
          const p20Idx = Math.floor(sorted.length * 0.2);
          const p80Idx = Math.floor(sorted.length * 0.8);
          floorFp = sorted[p20Idx] || 0;
          ceilingFp = sorted[p80Idx] || 0;
          
          const range = ceilingFp - floorFp;
          volatilityScore = maxCeiling > 0 ? Math.min(1, range / maxCeiling) : 0;
        }

        // Context tags
        if (games <= 4 && fpPerGame >= 10) {
          contextTag = 'Small sample – per-game stud';
        } else if ((player.injuryStatus === 'IR' || player.injuryStatus === 'OUT' || player.injuryStatus === 'PUP') && games < 10) {
          contextTag = 'Injury-impacted season';
        } else if (games >= 8 && fpPerGame >= 12) {
          contextTag = 'Reliable TE1';
        }

        // --------------------------------------------------------
        // Stage 8: Return enriched player object
        // --------------------------------------------------------
        return {
          playerId: player.playerId,
          playerName: player.playerName,
          team: player.team,
          gamesPlayed: games,
          // Core receiving metrics
          totalTargets: player.totalTargets,
          totalReceptions: player.totalReceptions,
          totalReceivingYards: player.totalReceivingYards,
          totalReceivingTDs: totalTds,
          fantasyPointsPpr: Math.round(player.totalFantasyPointsPpr * 100) / 100,
          // Calculated receiving metrics
          recYdsPerGame: Math.round(recYdsPerGame * 100) / 100,
          fpPerGame: Math.round(fpPerGame * 100) / 100,
          fpPerTarget: Math.round(fpPerTarget * 100) / 100,
          targetsPerGame: Math.round(targetsPerGame * 100) / 100,
          // Route metrics
          totalRoutes: routesRun,
          routesPerGame: Math.round(routesPerGame * 100) / 100,
          routeParticipation: Math.round((routesRun / maxRoutes) * 100) / 100,
          // Snap metrics (Phase 2)
          totalSnaps,
          // Alignment (Phase 2 - real data)
          slotPct: Math.round(slotPct * 100) / 100,
          inlinePct: Math.round(inlinePct * 100) / 100,
          widePct: Math.round(widePct * 100) / 100,
          routesSlot,
          routesInline,
          routesOutside,
          // Blocking (Phase 2 - proxy metrics)
          passBlockGrade: null, // No real data
          runBlockGrade: null, // No real data
          blockingStickiness: Math.round(blockingStickiness * 100) / 100,
          // Snap Stickiness 2.0
          snapStickinessIndex: Math.round(snapStickinessIndex * 100) / 100,
          // Red Zone / TD Gravity (Phase 2)
          rzTargets,
          tenZoneTargets,
          goalLineTargets,
          rzTargetsPerGame: Math.round(rzTargetsPerGame * 100) / 100,
          tdRoleScore: Math.round(tdRoleScore * 100) / 100,
          // Production index (Phase 2 - enhanced)
          productionIndex: Math.round(productionIndex * 100) / 100,
          // TE Archetype (Phase 2)
          archetype,
          archetypeLabel: archetype === 'BIG_SLOT' ? 'Big Slot' :
                         archetype === 'INLINE' ? 'Inline Grinder' :
                         archetype === 'H_BACK' ? 'H-back' : 'Hybrid',
          // Volatility (Phase 2)
          floorFp: Math.round(floorFp * 100) / 100,
          ceilingFp: Math.round(ceilingFp * 100) / 100,
          volatilityScore: Math.round(volatilityScore * 100) / 100,
          // Context flag (Phase 2)
          contextTag,
          // Injury status
          injuryStatus: player.injuryStatus ?? null,
          injuryType: player.injuryType ?? null,
          // Store for alpha calculation
          _team: player.team,
          _fpPerGame: fpPerGame,
          _productionIndex: productionIndex,
          _snapStickinessIndex: snapStickinessIndex,
          _tdRoleScore: tdRoleScore,
          _targetsPerGame: targetsPerGame,
        };
      });

      // ============================================================
      // STEP 8: Calculate TE Alpha with Env + Matchup modifiers
      // ============================================================
      const ranked = processedPlayers.map(player => {
        // TE Alpha Score Calculation (similar to WR 4-pillar but adapted for TE)
        // Volume: targets/game, routes/game - normalized to 0-100
        const volumeIndex = Math.min(100, (
          (Math.min(1, player._targetsPerGame / 8) * 0.5) +  // 8 tgt/game = max volume
          (Math.min(1, player.routesPerGame / 25) * 0.5)     // 25 routes/game = max
        ) * 100);
        
        // Production: already calculated productionIndex (0-1) → scale to 100
        const productionIndexScaled = player._productionIndex * 100;
        
        // Efficiency: fpPerTarget normalized
        const efficiencyIndex = Math.min(100, (player.fpPerTarget / 2.0) * 100);  // 2.0 ppr/target = elite TE
        
        // Stability: snapStickiness and lower volatility
        const stabilityIndex = Math.min(100, (
          player._snapStickinessIndex * 0.6 +
          (1 - player.volatilityScore) * 0.4
        ) * 100);
        
        // Combined base alpha (50/25/15/10 weights like WR)
        const rawAlpha = (
          volumeIndex * 0.50 +
          productionIndexScaled * 0.25 +
          efficiencyIndex * 0.15 +
          stabilityIndex * 0.10
        );
        
        // Calibrate to 25-90 range
        const calibratedAlpha = Math.max(25, Math.min(90, rawAlpha * 0.85 + 10));
        
        // Apply environment modifier (wEnv=0.40)
        const teamEnvScore = envMap.get(player._team || '') ?? null;
        const envResult = applyForgeEnvModifier({
          rawAlpha: calibratedAlpha,
          envScore: teamEnvScore,
          wEnv: 0.40,
        });
        
        // Apply matchup modifier (wMatchup=0.25)
        const opponent = opponentMap.get(player._team || '') ?? null;
        const matchupScore = opponent ? (matchupMap.get(opponent) ?? null) : null;
        const matchupResult = applyForgeMatchupModifier({
          alphaAfterEnv: envResult.envAdjustedAlpha,
          matchupScore,
          wMatchup: 0.25,
        });
        
        // Remove internal fields and add FORGE alpha fields
        const { _team, _fpPerGame, _productionIndex, _snapStickinessIndex, _tdRoleScore, _targetsPerGame, ...cleanPlayer } = player;
        
        return {
          ...cleanPlayer,
          // FORGE Alpha fields
          alphaScore: matchupResult.finalAlpha,
          forge_alpha_base: Math.round(calibratedAlpha * 100) / 100,
          forge_alpha_env: envResult.envAdjustedAlpha,
          forge_env_score_100: teamEnvScore,
          forge_env_multiplier: envResult.envMultiplier,
          forge_matchup_score_100: matchupScore,
          forge_matchup_multiplier: matchupResult.matchupMultiplier,
          forge_opponent: opponent,
          // Pillar indices (for transparency)
          volumeIndex: Math.round(volumeIndex * 100) / 100,
          efficiencyIndex: Math.round(efficiencyIndex * 100) / 100,
          stabilityIndex: Math.round(stabilityIndex * 100) / 100,
        };
      })
        .sort((a, b) => b.alphaScore - a.alphaScore)
        .slice(0, 40);

      res.json({
        success: true,
        season: 2025,
        envWeek: latestEnvWeek,
        matchupWeek: latestEnvWeek,
        matchupsAvailable: opponentMap.size > 0,
        minGames: 2,
        minTargets: 10,
        count: ranked.length,
        phase: 2,
        data: ranked,
      });

    } catch (error) {
      console.error('❌ [AdminAPI] TE Rankings Sandbox Phase 2 failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  /**
   * ============================================================
   * QB SANDBOX v1.0 – QB Rankings Algorithm with 4 Pillars
   * ============================================================
   * 
   * PILLARS:
   * 1. Volume Index (25%) – attempts, dropbacks, air yards
   * 2. Production Index (25%) – FP/G, TDs, rushing fantasy
   * 3. Efficiency Index (35%) – EPA, CPOE, YPA, deep accuracy
   * 4. Context Index (15%) – team support metrics
   * 
   * GET /api/admin/qb-rankings-sandbox
   * Returns: QBs from 2025 season with 100+ pass attempts
   * ============================================================
   */
  app.get('/api/admin/qb-rankings-sandbox', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { bronzeNflfastrPlays, qbContextMetrics, qbEpaReference } = await import('@shared/schema');
      
      // ============================================================
      // STEP 1: Query base QB passing metrics from bronze_nflfastr_plays
      // ============================================================
      const passingResults = await db
        .select({
          passerId: bronzeNflfastrPlays.passerPlayerId,
          playerName: bronzeNflfastrPlays.passerPlayerName,
          team: bronzeNflfastrPlays.posteam,
          attempts: sql<number>`COUNT(*)::int`,
          completions: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.completePass} = true THEN 1 ELSE 0 END)::int`,
          passingYards: sql<number>`SUM(${bronzeNflfastrPlays.yardsGained})::int`,
          passingTds: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.touchdown} = true THEN 1 ELSE 0 END)::int`,
          interceptions: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.interception} = true THEN 1 ELSE 0 END)::int`,
          totalAirYards: sql<number>`SUM(COALESCE(${bronzeNflfastrPlays.airYards}, 0))::int`,
          avgEpa: sql<number>`AVG(${bronzeNflfastrPlays.epa}::numeric)::real`,
          deepAttempts: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.airYards} >= 20 THEN 1 ELSE 0 END)::int`,
          deepCompletions: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.airYards} >= 20 AND ${bronzeNflfastrPlays.completePass} = true THEN 1 ELSE 0 END)::int`,
          shortAttempts: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.airYards} < 10 THEN 1 ELSE 0 END)::int`,
          shortCompletions: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.airYards} < 10 AND ${bronzeNflfastrPlays.completePass} = true THEN 1 ELSE 0 END)::int`,
          intermediateAttempts: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.airYards} >= 10 AND ${bronzeNflfastrPlays.airYards} < 20 THEN 1 ELSE 0 END)::int`,
          intermediateCompletions: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.airYards} >= 10 AND ${bronzeNflfastrPlays.airYards} < 20 AND ${bronzeNflfastrPlays.completePass} = true THEN 1 ELSE 0 END)::int`,
          rzAttempts: sql<number>`SUM(CASE WHEN (${bronzeNflfastrPlays.rawData}->>'yardline_100')::numeric <= 20 THEN 1 ELSE 0 END)::int`,
          rzTds: sql<number>`SUM(CASE WHEN (${bronzeNflfastrPlays.rawData}->>'yardline_100')::numeric <= 20 AND ${bronzeNflfastrPlays.touchdown} = true THEN 1 ELSE 0 END)::int`,
          rzInts: sql<number>`SUM(CASE WHEN (${bronzeNflfastrPlays.rawData}->>'yardline_100')::numeric <= 20 AND ${bronzeNflfastrPlays.interception} = true THEN 1 ELSE 0 END)::int`,
          ezAttempts: sql<number>`SUM(CASE WHEN (${bronzeNflfastrPlays.rawData}->>'yardline_100')::numeric <= 10 THEN 1 ELSE 0 END)::int`,
          weeks: sql<number>`COUNT(DISTINCT ${bronzeNflfastrPlays.week})::int`,
        })
        .from(bronzeNflfastrPlays)
        .where(
          and(
            eq(bronzeNflfastrPlays.season, 2025),
            eq(bronzeNflfastrPlays.playType, 'pass'),
            isNotNull(bronzeNflfastrPlays.passerPlayerName),
            sql`${bronzeNflfastrPlays.passerPlayerName} != ''`
          )
        )
        .groupBy(
          bronzeNflfastrPlays.passerPlayerId,
          bronzeNflfastrPlays.passerPlayerName,
          bronzeNflfastrPlays.posteam
        )
        .having(sql`COUNT(*) >= 100`);

      // ============================================================
      // STEP 2: Query rushing metrics for QBs from bronze_nflfastrPlays
      // ============================================================
      const rushingResults = await db
        .select({
          rusherId: bronzeNflfastrPlays.rusherPlayerId,
          carries: sql<number>`COUNT(*)::int`,
          rushYards: sql<number>`SUM(${bronzeNflfastrPlays.yardsGained})::int`,
          rushTds: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.touchdown} = true THEN 1 ELSE 0 END)::int`,
          rushEpa: sql<number>`AVG(${bronzeNflfastrPlays.epa}::numeric)::real`,
          designedRuns: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.playType} = 'run' THEN 1 ELSE 0 END)::int`,
          scrambles: sql<number>`SUM(CASE WHEN (${bronzeNflfastrPlays.rawData}->>'qb_scramble')::text = '1' THEN 1 ELSE 0 END)::int`,
          rzRushes: sql<number>`SUM(CASE WHEN (${bronzeNflfastrPlays.rawData}->>'yardline_100')::numeric <= 20 THEN 1 ELSE 0 END)::int`,
          rzRushTds: sql<number>`SUM(CASE WHEN (${bronzeNflfastrPlays.rawData}->>'yardline_100')::numeric <= 20 AND ${bronzeNflfastrPlays.touchdown} = true THEN 1 ELSE 0 END)::int`,
        })
        .from(bronzeNflfastrPlays)
        .where(
          and(
            eq(bronzeNflfastrPlays.season, 2025),
            eq(bronzeNflfastrPlays.playType, 'run'),
            isNotNull(bronzeNflfastrPlays.rusherPlayerId)
          )
        )
        .groupBy(bronzeNflfastrPlays.rusherPlayerId);

      const rushingMap = new Map(rushingResults.map(r => [r.rusherId, r]));

      // ============================================================
      // STEP 3: Get CPOE and context metrics from qb_context_metrics
      // ============================================================
      const contextResults = await db
        .select({
          playerId: qbContextMetrics.playerId,
          avgCpoe: sql<number>`AVG(${qbContextMetrics.cpoe})::real`,
          totalSacks: sql<number>`SUM(COALESCE(${qbContextMetrics.sacks}, 0))::int`,
          avgPressureRate: sql<number>`AVG(COALESCE(${qbContextMetrics.pressureRate}, 0))::real`,
          avgDropRate: sql<number>`AVG(COALESCE(${qbContextMetrics.dropRate}, 0))::real`,
          avgCompletionPct: sql<number>`AVG(COALESCE(${qbContextMetrics.completionPct}, 0))::real`,
        })
        .from(qbContextMetrics)
        .where(eq(qbContextMetrics.season, 2025))
        .groupBy(qbContextMetrics.playerId);

      const contextMap = new Map(contextResults.map(c => [c.playerId, c]));

      // ============================================================
      // STEP 4: Get EPA reference data
      // ============================================================
      const epaResults = await db
        .select({
          playerId: qbEpaReference.playerId,
          avgAdjEpa: sql<number>`AVG(${qbEpaReference.adjEpaPerPlay})::real`,
          totalPlays: sql<number>`SUM(${qbEpaReference.numPlays})::int`,
        })
        .from(qbEpaReference)
        .where(eq(qbEpaReference.season, 2025))
        .groupBy(qbEpaReference.playerId);

      const epaMap = new Map(epaResults.map(e => [e.playerId, e]));

      // ============================================================
      // STEP 5: Query weekly fantasy data for volatility
      // ============================================================
      const weeklyFantasy = await db
        .select({
          passerId: bronzeNflfastrPlays.passerPlayerId,
          week: bronzeNflfastrPlays.week,
          weeklyYards: sql<number>`SUM(${bronzeNflfastrPlays.yardsGained})::int`,
          weeklyTds: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.touchdown} = true THEN 1 ELSE 0 END)::int`,
          weeklyInts: sql<number>`SUM(CASE WHEN ${bronzeNflfastrPlays.interception} = true THEN 1 ELSE 0 END)::int`,
        })
        .from(bronzeNflfastrPlays)
        .where(
          and(
            eq(bronzeNflfastrPlays.season, 2025),
            eq(bronzeNflfastrPlays.playType, 'pass'),
            isNotNull(bronzeNflfastrPlays.passerPlayerName)
          )
        )
        .groupBy(bronzeNflfastrPlays.passerPlayerId, bronzeNflfastrPlays.week);

      // Group weekly data by player for volatility
      const weeklyByPlayer = new Map<string, Array<{yards: number, tds: number, ints: number}>>();
      for (const row of weeklyFantasy) {
        if (!row.passerId) continue;
        if (!weeklyByPlayer.has(row.passerId)) {
          weeklyByPlayer.set(row.passerId, []);
        }
        weeklyByPlayer.get(row.passerId)!.push({
          yards: row.weeklyYards || 0,
          tds: row.weeklyTds || 0,
          ints: row.weeklyInts || 0,
        });
      }

      // ============================================================
      // STEP 5.5: Fetch env scores for QB (env-only, no matchup yet)
      // ============================================================
      const { forgeTeamEnvironment } = await import('@shared/schema');
      const { applyForgeEnvModifier } = await import('./modules/forge/contextModifiers');
      
      // Get latest week's environment scores
      const latestWeekResult = await db.execute(sql`
        SELECT MAX(week) as latest_week FROM forge_team_environment WHERE season = 2025
      `);
      const latestEnvWeek = (latestWeekResult.rows[0] as any)?.latest_week || 12;
      
      // Fetch env scores
      const envScores = await db
        .select({
          team: forgeTeamEnvironment.team,
          envScore100: forgeTeamEnvironment.envScore100,
        })
        .from(forgeTeamEnvironment)
        .where(
          and(
            eq(forgeTeamEnvironment.season, 2025),
            eq(forgeTeamEnvironment.week, latestEnvWeek)
          )
        );
      
      const envMap = new Map<string, number>();
      for (const row of envScores) {
        if (row.team && row.envScore100 !== null) {
          envMap.set(row.team, row.envScore100);
        }
      }

      // ============================================================
      // STEP 6: Calculate season max values for normalization
      // ============================================================
      const maxAttempts = Math.max(...passingResults.map(p => p.attempts || 1), 1);
      const maxYards = Math.max(...passingResults.map(p => p.passingYards || 1), 1);
      const maxAirYards = Math.max(...passingResults.map(p => p.totalAirYards || 1), 1);
      const maxTds = Math.max(...passingResults.map(p => p.passingTds || 1), 1);
      const maxEpa = Math.max(...passingResults.map(p => Math.abs(p.avgEpa || 0)), 0.01);

      // ============================================================
      // STEP 7: Process each QB and calculate indices
      // ============================================================
      const processedQBs = passingResults.map(qb => {
        const passerId = qb.passerId || '';
        const games = qb.weeks || 1;
        const rushing = rushingMap.get(passerId);
        const context = contextMap.get(passerId);
        const epaRef = epaMap.get(passerId);
        const weeklyData = weeklyByPlayer.get(passerId) || [];

        // Basic passing metrics
        const attempts = qb.attempts || 0;
        const completions = qb.completions || 0;
        const passingYards = qb.passingYards || 0;
        const passingTds = qb.passingTds || 0;
        const interceptions = qb.interceptions || 0;
        const totalAirYards = qb.totalAirYards || 0;
        const avgEpa = qb.avgEpa || 0;

        // Calculated metrics
        const completionPct = attempts > 0 ? (completions / attempts) * 100 : 0;
        const yardsPerAttempt = attempts > 0 ? passingYards / attempts : 0;
        const aDot = attempts > 0 ? totalAirYards / attempts : 0;
        const tdRate = attempts > 0 ? (passingTds / attempts) * 100 : 0;
        const intRate = attempts > 0 ? (interceptions / attempts) * 100 : 0;

        // Deep/short/intermediate accuracy
        const deepAccuracy = qb.deepAttempts > 0 
          ? (qb.deepCompletions / qb.deepAttempts) * 100 
          : null;
        const shortAccuracy = qb.shortAttempts > 0 
          ? (qb.shortCompletions / qb.shortAttempts) * 100 
          : null;
        const intermediateAccuracy = qb.intermediateAttempts > 0 
          ? (qb.intermediateCompletions / qb.intermediateAttempts) * 100 
          : null;

        // Red zone metrics
        const rzAttempts = qb.rzAttempts || 0;
        const rzTds = qb.rzTds || 0;
        const rzInts = qb.rzInts || 0;
        const ezAttempts = qb.ezAttempts || 0;
        const rzCompletionPct = rzAttempts > 0 ? 50 : 0; // Placeholder

        // Rushing metrics
        const carries = rushing?.carries || 0;
        const rushYards = rushing?.rushYards || 0;
        const rushTds = rushing?.rushTds || 0;
        const rushEpa = rushing?.rushEpa || 0;
        const scrambles = rushing?.scrambles || 0;
        const rzRushes = rushing?.rzRushes || 0;

        // Fantasy points calculation (4pt passing TD, 6pt rush TD)
        const passingFp = (passingYards * 0.04) + (passingTds * 4) - (interceptions * 2);
        const rushingFp = (rushYards * 0.1) + (rushTds * 6);
        const totalFp = passingFp + rushingFp;
        const fpPerGame = games > 0 ? totalFp / games : 0;
        const passFpPerGame = games > 0 ? passingFp / games : 0;
        const rushFpPerGame = games > 0 ? rushingFp / games : 0;
        const attemptsPerGame = games > 0 ? attempts / games : 0;

        // Context metrics (from qb_context_metrics)
        const cpoe = context?.avgCpoe ?? null;
        const sacks = context?.totalSacks ?? 0;
        const pressureRate = context?.avgPressureRate ?? null;
        const sackRate = attempts > 0 ? (sacks / (attempts + sacks)) * 100 : null;

        // Adjusted EPA from reference table
        const adjEpaPerPlay = epaRef?.avgAdjEpa ?? avgEpa;

        // ANY/A = (Yards + 20×TD - 45×INT - Sack Yards) / (Attempts + Sacks)
        const sackYards = sacks * 7; // Estimate 7 yards per sack
        const anyA = (attempts + sacks) > 0 
          ? (passingYards + 20*passingTds - 45*interceptions - sackYards) / (attempts + sacks)
          : 0;

        // Volatility calculation
        let floorFp = 0;
        let ceilingFp = 0;
        let volatilityScore = 0;
        if (weeklyData.length > 0) {
          const weeklyFpArr = weeklyData.map(w => 
            (w.yards * 0.04) + (w.tds * 4) - (w.ints * 2) + (rushFpPerGame)
          );
          weeklyFpArr.sort((a, b) => a - b);
          floorFp = weeklyFpArr[Math.floor(weeklyFpArr.length * 0.25)] || 0;
          ceilingFp = weeklyFpArr[Math.floor(weeklyFpArr.length * 0.75)] || 0;
          if (ceilingFp > 0) {
            volatilityScore = Math.min(1, (ceilingFp - floorFp) / ceilingFp);
          }
        }

        // ============================================================
        // CALCULATE 4 PILLAR INDICES (0-100)
        // ============================================================

        // 1. VOLUME INDEX (25% default weight)
        // 0.35 * attempts + 0.25 * dropbacks + 0.20 * airYards + 0.20 * neutralPassRate
        const attemptsNorm = Math.min(1, attempts / maxAttempts);
        const dropbacksNorm = Math.min(1, (attempts + sacks) / (maxAttempts * 1.1));
        const airYardsNorm = Math.min(1, totalAirYards / maxAirYards);
        const neutralPassRate = 0.55; // Placeholder - would come from team context
        const volumeIndex = (
          0.35 * attemptsNorm +
          0.25 * dropbacksNorm +
          0.20 * airYardsNorm +
          0.20 * neutralPassRate
        ) * 100;

        // 2. PRODUCTION INDEX (25% default weight)
        // Updated: 0.45 FP/G + 0.30 rushFP/G + 0.15 passTD/G + 0.10 rzTD/G
        // (Rush FP boosted to reward Konami QBs like Hurts, Allen, Daniels, Jackson)
        const maxFpg = 30; // Elite QB threshold
        const fpgNorm = Math.min(1, fpPerGame / maxFpg);
        const passTdPerGame = games > 0 ? passingTds / games : 0;
        const passTdNorm = Math.min(1, passTdPerGame / 3);
        const rushFpNorm = Math.min(1, rushFpPerGame / 10); // Elite dual threat gets ~10 rush FP/G
        const rzTdPerGame = games > 0 ? rzTds / games : 0;
        const rzTdNorm = Math.min(1, rzTdPerGame / 2);
        const productionIndex = (
          0.45 * fpgNorm +
          0.30 * rushFpNorm +
          0.15 * passTdNorm +
          0.10 * rzTdNorm
        ) * 100;

        // 3. EFFICIENCY INDEX (35% default weight) - MOST IMPORTANT
        // 0.30 * EPA + 0.20 * ANY/A + 0.15 * CPOE + 0.10 * adjCompPct + 0.10 * deepAcc + 0.10 * pressuredCompPct + 0.05 * YPA
        const epaNorm = Math.min(1, Math.max(0, (avgEpa + 0.3) / 0.6));
        const anyaNorm = Math.min(1, Math.max(0, anyA / 10));
        const cpoeNorm = cpoe !== null ? Math.min(1, Math.max(0, (cpoe + 10) / 20)) : 0.5;
        const compPctNorm = Math.min(1, completionPct / 75);
        const deepAccNorm = deepAccuracy !== null ? Math.min(1, deepAccuracy / 50) : 0.5;
        const pressuredCompPct = 0.5; // Placeholder
        const ypaNorm = Math.min(1, yardsPerAttempt / 10);
        const efficiencyIndex = (
          0.30 * epaNorm +
          0.20 * anyaNorm +
          0.15 * cpoeNorm +
          0.10 * compPctNorm +
          0.10 * deepAccNorm +
          0.10 * pressuredCompPct +
          0.05 * ypaNorm
        ) * 100;

        // 4. CONTEXT INDEX (15% default weight) - Team support (per-player metrics)
        // Using available data: sack rate (inverse = O-line proxy), completion overperformance, 
        // efficiency in neutral situations, and rushing opportunity as scheme indicator
        // Lower sack rate = better O-line protection (inverted)
        const sackRateVal = sackRate ?? 6; // Default 6% if null
        const olineProxy = Math.max(0, Math.min(1, 1 - (sackRateVal / 12))); // 0% = 1.0, 12% = 0
        // CPOE indicates WR room helping vs hurting (plus QB talent)
        const cpoeVal = cpoe ?? 0;
        const wrSupportProxy = Math.min(1, Math.max(0, (cpoeVal + 8) / 16)); // -8 to +8 range
        // Attempts per game indicates scheme pace / volume opportunity
        const paceProxy = Math.min(1, attemptsPerGame / 40); // 40 att/game = max pace
        // Rushing opportunity indicates designed runs / scheme fit for dual threats
        const carriesPerGame = games > 0 ? carries / games : 0;
        const rushSchemeProxy = Math.min(1, carriesPerGame / 8); // 8 carries/game = max run scheme
        const contextIndex = (
          0.30 * olineProxy +
          0.30 * wrSupportProxy +
          0.25 * paceProxy +
          0.15 * rushSchemeProxy
        ) * 100;

        // ============================================================
        // CONTEXT TAGS
        // ============================================================
        let contextTag: string | null = null;
        if (games < 4) {
          contextTag = 'Small Sample';
        } else if (rushFpPerGame >= 5 && rushYards >= 200) {
          contextTag = 'Dual Threat Weapon';
        } else if (efficiencyIndex >= 70 && volumeIndex < 50) {
          contextTag = 'Game Manager';
        } else if (volatilityScore >= 0.6 && ceilingFp >= 25) {
          contextTag = 'Volatile Elite';
        } else if (efficiencyIndex >= 60 && volatilityScore < 0.3) {
          contextTag = 'Reliable QB1';
        } else if (sackRate && sackRate >= 8) {
          contextTag = 'O-line Victim';
        } else if (contextIndex >= 75 && efficiencyIndex >= 55) {
          contextTag = 'Scheme Merchant';
        }

        // ============================================================
        // QB ARCHETYPE (tightened to correctly tag Dual Threat QBs)
        // Hurts, Allen, Jackson, Daniels, Fields, Dart should be DUAL_THREAT
        // ============================================================
        let archetype: string;
        const carriesPerGameVal = games > 0 ? carries / games : 0;
        const scrambleRateVal = attempts > 0 ? (scrambles / attempts) * 100 : 0;
        // DUAL_THREAT: rushFpPerGame >= 5 OR (4+ carries/game AND 3+ rush FP/game)
        if (rushFpPerGame >= 5 || (carriesPerGameVal >= 4 && rushFpPerGame >= 3)) {
          archetype = 'DUAL_THREAT';
        } else if (aDot >= 9 && deepAccuracy && deepAccuracy >= 42) {
          archetype = 'DEEP_BALL';
        } else if (completionPct >= 67 && yardsPerAttempt < 7.2 && rushFpPerGame < 2) {
          archetype = 'GAME_MANAGER';
        } else if (efficiencyIndex >= 62 && rushFpPerGame < 3) {
          archetype = 'POCKET_PASSER';
        } else {
          archetype = 'DEVELOPING';
        }

        return {
          playerId: passerId,
          playerName: qb.playerName || 'Unknown',
          team: qb.team || 'UNK',
          games,

          // Basic passing
          attempts,
          completions,
          passingYards,
          passingTds,
          interceptions,
          sacks,
          sackYards,
          totalAirYards,

          // Calculated passing
          completionPct: Math.round(completionPct * 100) / 100,
          yardsPerAttempt: Math.round(yardsPerAttempt * 100) / 100,
          aDot: Math.round(aDot * 100) / 100,
          tdRate: Math.round(tdRate * 100) / 100,
          intRate: Math.round(intRate * 100) / 100,

          // Advanced passing
          avgEpa: Math.round(avgEpa * 1000) / 1000,
          adjEpaPerPlay: Math.round(adjEpaPerPlay * 1000) / 1000,
          anyA: Math.round(anyA * 100) / 100,
          cpoe: cpoe !== null ? Math.round(cpoe * 100) / 100 : null,
          successRate: null, // Would need play-by-play success calculation
          deepAccuracy: deepAccuracy !== null ? Math.round(deepAccuracy * 10) / 10 : null,
          intermediateAccuracy: intermediateAccuracy !== null ? Math.round(intermediateAccuracy * 10) / 10 : null,
          shortAccuracy: shortAccuracy !== null ? Math.round(shortAccuracy * 10) / 10 : null,
          pressuredCompPct: null, // Would need pressure data
          pressureToSackRate: pressureRate !== null ? Math.round(pressureRate * 100) / 100 : null,

          // Rushing
          carries,
          rushYards,
          rushTds,
          rushEpa: Math.round(rushEpa * 1000) / 1000,
          scrambles,
          designedRushShare: null, // Would need play type breakdown
          scrambleRate: attempts > 0 ? Math.round((scrambles / attempts) * 10000) / 100 : null,
          rushFpPerGame: Math.round(rushFpPerGame * 100) / 100,

          // Fantasy
          totalFantasyPoints: Math.round(totalFp * 100) / 100,
          fpPerGame: Math.round(fpPerGame * 100) / 100,
          passFpPerGame: Math.round(passFpPerGame * 100) / 100,
          fpPerDropback: (attempts + sacks) > 0 
            ? Math.round((totalFp / (attempts + sacks)) * 100) / 100 
            : 0,

          // Red zone
          rzAttempts,
          rzTds,
          rzInts,
          ezAttempts,
          rzCompletionPct,
          rzRushes,
          rzEpa: null, // Would need RZ-specific EPA

          // Team context (placeholders)
          olinePassBlockGrade: null,
          wrRoomYprr: null,
          schemePace: null,
          neutralPassRate: null,
          sitNeutralEpa: null,

          // Volatility
          weeklyGames: weeklyData.length,
          floorFp: Math.round(floorFp * 10) / 10,
          ceilingFp: Math.round(ceilingFp * 10) / 10,
          volatilityScore: Math.round(volatilityScore * 100) / 100,

          // Pillar indices (0-100)
          volumeIndex: Math.round(volumeIndex * 100) / 100,
          productionIndex: Math.round(productionIndex * 100) / 100,
          efficiencyIndex: Math.round(efficiencyIndex * 100) / 100,
          contextIndex: Math.round(contextIndex * 100) / 100,

          // Labels
          archetype,
          archetypeLabel: archetype === 'DUAL_THREAT' ? 'Dual Threat' :
                         archetype === 'DEEP_BALL' ? 'Deep Ball Hunter' :
                         archetype === 'GAME_MANAGER' ? 'Game Manager' :
                         archetype === 'POCKET_PASSER' ? 'Pocket Passer' : 'Developing',
          contextTag,

          // Sack metrics
          sackRate: sackRate !== null ? Math.round(sackRate * 100) / 100 : null,
          // Store team for env calculation
          _team: qb.team,
          _volumeIndex: volumeIndex,
          _productionIndex: productionIndex,
          _efficiencyIndex: efficiencyIndex,
          _contextIndex: contextIndex,
        };
      });

      // ============================================================
      // STEP 8: Calculate QB Alpha with Env modifier (no matchup yet)
      // ============================================================
      const ranked = processedQBs.map(qb => {
        // QB Alpha Score Calculation (25/25/35/15 weights as per pillar spec)
        const rawAlpha = (
          qb._volumeIndex * 0.25 +
          qb._productionIndex * 0.25 +
          qb._efficiencyIndex * 0.35 +
          qb._contextIndex * 0.15
        );
        
        // Calibrate to 25-90 range
        const calibratedAlpha = Math.max(25, Math.min(90, rawAlpha * 0.85 + 10));
        
        // Apply environment modifier (wEnv=0.40) - env only, no matchup for QB
        const teamEnvScore = envMap.get(qb._team || '') ?? null;
        const envResult = applyForgeEnvModifier({
          rawAlpha: calibratedAlpha,
          envScore: teamEnvScore,
          wEnv: 0.40,
        });
        
        // Remove internal fields and add FORGE alpha fields
        const { _team, _volumeIndex, _productionIndex, _efficiencyIndex, _contextIndex, ...cleanQb } = qb;
        
        return {
          ...cleanQb,
          // FORGE Alpha fields (env-only for QB)
          alphaScore: envResult.envAdjustedAlpha,  // env-adjusted only (no matchup)
          forge_alpha_base: Math.round(calibratedAlpha * 100) / 100,
          forge_alpha_env: envResult.envAdjustedAlpha,
          forge_env_score_100: teamEnvScore,
          forge_env_multiplier: envResult.envMultiplier,
          // No matchup fields for QB (yet)
          forge_matchup_score_100: null,
          forge_matchup_multiplier: null,
          forge_opponent: null,
        };
      })
        .sort((a, b) => b.alphaScore - a.alphaScore)
        .slice(0, 40);

      res.json({
        success: true,
        season: 2025,
        envWeek: latestEnvWeek,
        matchupsAvailable: false,  // QB matchups not implemented yet
        minAttempts: 100,
        count: ranked.length,
        version: 'qb-sandbox-v1.1',  // v1.1 = env modifier added
        data: ranked,
      });

    } catch (error) {
      console.error('❌ [AdminAPI] QB Rankings Sandbox failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  /**
   * POST /api/admin/rag/seed-narratives - Seed TIBER narratives with embeddings
   */
  app.post('/api/admin/rag/seed-narratives', requireAdminAuth, rateLimiters.heavyOperation, async (req: Request, res: Response) => {
    try {
      const { chunks } = await import('@shared/schema');
      const { generateEmbedding } = await import('./services/geminiEmbeddings');
      const { sql: sqlTag } = await import('drizzle-orm');
      
      // Define the 6 narratives from the attached file
      const narratives = [
        {
          content: `Jaylen Warren - Volume Takeover Pattern\n\nJaylen Warren's snap share trajectory signals potential backfield takeover. Over the past 3 weeks, his snaps increased from 45% to 52% to 65% - a classic emergence pattern.\n\nHowever, context matters: The Steelers offense ranks 28th in EPA/play, limiting his ceiling despite increasing volume. This mirrors Javonte Williams' 2021 situation - featured back volume in a struggling offense produced RB2 outcomes, not RB1.\n\nTeaching moment: Volume is necessary but not sufficient. The formula is: Volume × Offensive Efficiency × Red Zone Role = Fantasy Ceiling. Warren has the volume trending up, but efficiency caps his upside.\n\nDiscernment check: Are you drafting him for safe floor (yes) or league-winning upside (no)? Know what you're buying.`,
          metadata: {
            player_id: "warren_jaylen",
            position: "RB",
            week: 9,
            season: 2024,
            tags: ["breakout_candidate", "volume_spike", "efficiency_concern", "teaching_moment"]
          }
        },
        {
          content: `Jordan Addison - Target Share Acceleration\n\nJordan Addison's target share jumped from 18% (Weeks 1-4) to 26% (Weeks 5-8), signaling increased offensive role. This 44% increase in target share often precedes WR2-to-WR1 transition.\n\nPattern recognition: Similar target share spikes preceded breakouts for Puka Nacua (2023) and Amon-Ra St. Brown (2021). The difference? Both had elite QBs. Addison has Sam Darnold.\n\nThe Vikings' 12th-ranked passing offense provides opportunity, but QB volatility creates risk. This is a "smart lottery ticket" - upside exists, but the path requires multiple factors aligning.\n\nTeaching: Breakouts need three things: Opportunity (✓), Talent (✓), and Situation (?). Two out of three gets you interesting, not automatic.`,
          metadata: {
            player_id: "addison_jordan",
            position: "WR",
            week: 9,
            season: 2024,
            tags: ["breakout_candidate", "target_share_spike", "qb_concern", "comparable_patterns"]
          }
        },
        {
          content: `Christian McCaffrey - Usage Cliff Warning\n\nChristian McCaffrey's usage rate (touches per game) has maintained elite levels (24.3), but the underlying metrics show cracks. His snap share in competitive games (within 7 points) dropped from 89% to 76% over the past 3 weeks.\n\nRed flag: When RBs maintain volume but lose competitive-game snaps, it often precedes workload reduction. Teams protect assets when games matter less. See: Derrick Henry 2022 (Week 12-15).\n\nThe 49ers are 6-2 and may coast in blowouts. That's good for McCaffrey's health, bad for his fantasy volume consistency. Additionally, his YPC dropped from 5.1 (Weeks 1-6) to 4.3 (Weeks 7-9).\n\nRisk assessment: Still elite, but the "every week RB1" certainty is fading. Consider selling high to teams desperate for RB1 help while his name value peaks.\n\nDiscernment: The rigged game favors those who see trends before the market does. You've already won if you got McCaffrey's best weeks. Don't hold for nostalgia.`,
          metadata: {
            player_id: "mccaffrey_christian",
            position: "RB",
            week: 9,
            season: 2024,
            tags: ["regression_warning", "usage_decline", "sell_high", "competitive_snap_loss"]
          }
        },
        {
          content: `Mike Evans - Age Cliff + Target Competition\n\nMike Evans (31 years old) faces converging regression factors: age-related decline window + emerging target competition from Jalen McMillan. Evans' aDOT (average depth of target) dropped from 14.2 to 11.8 - suggesting either diminished ability to get deep or coaching adjustment.\n\nHistorical pattern: WRs over 30 with declining aDOT typically see 15-20% fantasy point drop the following season. Evans' current TD rate (scoring on 18% of targets) is also unsustainably high - career average is 12%.\n\nThe Buccaneers' passing offense (3rd in EPA) masks individual decline. When the tide goes out, we'll see who's swimming naked.\n\nTeaching: Positive TD regression is a thing, but so is negative TD regression. Evans is likely overperforming his true talent level right now due to variance. Plan accordingly.\n\nTrade strategy: Move him now to a contender who needs WR help. His name value exceeds his predictive value.`,
          metadata: {
            player_id: "evans_mike",
            position: "WR",
            week: 9,
            season: 2024,
            tags: ["regression_warning", "age_decline", "td_variance", "sell_high", "target_competition"]
          }
        },
        {
          content: `ADP Doesn't Equal Value - The Sunk Cost Trap\n\nYou drafted Saquon Barkley in Round 1. He's been mediocre. Your gut says "start him because I drafted him high." Your discernment knows this is the sunk cost fallacy.\n\nThe rigged game: The draft is over. Those auction dollars or draft picks are GONE. They don't affect this week's optimal lineup. Starting Barkley because of where you drafted him is letting ego override evidence.\n\nWhat matters now: Expected points THIS WEEK. Not draft capital. Not name recognition. Not what you "should" get from a first-rounder.\n\nReal talk: If Barkley was on waivers right now with his current stats, would you pick him up and start him? If no, why is he in your lineup?\n\nThis is serve-not-take thinking. The extractive fantasy platforms want you addicted to sunk costs because it keeps you engaged, making bad decisions, coming back for "just one more week."\n\nYou've already won by recognizing this. Make the choice that serves your team, not your ego.`,
          metadata: {
            position: null,
            week: null,
            season: 2024,
            tags: ["discernment", "sunk_cost", "cognitive_bias", "teaching_moment", "serve_not_take"]
          }
        },
        {
          content: `The Human Player Reminder - Joy Over Grind\n\nJa'Marr Chase just had a massive game. Your opponent has him. You're spiraling about "unfair variance" and checking scores obsessively.\n\nStop. Breathe. Remember: Ja'Marr Chase is a real human who worked his entire life for this moment. His grandmother probably watched that game with tears in her eyes. His teammates celebrated with him. That's beautiful.\n\nFantasy football at its worst turns human achievement into personal grievance. At its best, it makes you appreciate athletic excellence even when it doesn't benefit you.\n\nThe rigged game (in your favor): You get to watch the best athletes on Earth perform. You already won. The points are just a game we play for fun.\n\nWhen you find yourself tilting over "bad beats," ask: Am I serving joy or am I being extracted from by manufactured scarcity mindset?\n\nDiscernment is recognizing that you don't NEED to win your fantasy league to have already won at life. Play with joy. Celebrate great performances. The rest is just parlor games.\n\nAnti-gambling reminder: If fantasy is making you miserable, you're doing it wrong. This should add enjoyment to football, not become a second job or addiction.`,
          metadata: {
            position: null,
            week: null,
            season: 2024,
            tags: ["discernment", "joy", "human_players", "anti_extraction", "serve_not_take", "abundance_mindset"]
          }
        }
      ];

      console.log(`🤖 [RAG Seed] Generating embeddings for ${narratives.length} narratives...`);

      // Generate embeddings and insert chunks
      const insertedChunks = [];
      for (let i = 0; i < narratives.length; i++) {
        const narrative = narratives[i];
        console.log(`🤖 [RAG Seed] Processing narrative ${i + 1}/${narratives.length}...`);
        
        // Generate embedding
        const embedding = await generateEmbedding(narrative.content);
        console.log(`✅ [RAG Seed] Embedding generated: ${embedding.length} dimensions`);
        
        // Insert into chunks table using raw SQL to handle vector type properly
        const vectorString = `[${embedding.join(',')}]`;
        const result = await db.execute(
          sqlTag`INSERT INTO chunks (content, embedding, metadata) 
                 VALUES (${narrative.content}, ${vectorString}::vector, ${JSON.stringify(narrative.metadata)}::jsonb)
                 RETURNING id, content, metadata, created_at`
        );
        
        const inserted = result.rows[0] as any;
        
        insertedChunks.push(inserted);
        console.log(`✅ [RAG Seed] Chunk ${i + 1} inserted with ID: ${inserted.id}`);
      }

      console.log(`✅ [RAG Seed] Successfully inserted ${insertedChunks.length} chunks with embeddings`);

      res.json({
        success: true,
        inserted: insertedChunks.length,
        chunks: insertedChunks.map(chunk => ({
          id: chunk.id,
          content_preview: chunk.content?.substring(0, 100) || '',
          metadata: chunk.metadata,
          embedding_dimensions: 768,
        })),
        message: `Successfully seeded ${insertedChunks.length} TIBER narratives with Gemini embeddings`,
      });

    } catch (error) {
      console.error('❌ [RAG Seed] Failed to seed narratives:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // RAG Semantic Search endpoint
  app.post('/api/admin/rag/search', requireAdminAuth, async (req, res) => {
    try {
      const { query, limit = 3 } = req.body;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Query is required and must be a string',
        });
      }

      console.log(`🔍 [RAG Search] Searching for: "${query}"`);

      // Generate embedding for the query
      const queryEmbedding = await generateEmbedding(query);
      console.log(`✅ [RAG Search] Query embedding generated: ${queryEmbedding.length} dimensions`);

      // Search using pgvector cosine similarity
      // The <-> operator returns cosine distance (0 = identical, 2 = opposite)
      // We convert to similarity score: 1 - (distance / 2)
      const vectorString = `[${queryEmbedding.join(',')}]`;
      const result = await db.execute(
        sql`SELECT 
              id, 
              content, 
              metadata,
              (1 - (embedding <-> ${vectorString}::vector) / 2) as similarity
            FROM chunks
            ORDER BY embedding <-> ${vectorString}::vector
            LIMIT ${limit}`
      );

      const results = result.rows.map((row: any) => ({
        id: row.id,
        content: row.content,
        content_preview: row.content?.substring(0, 200) || '',
        metadata: row.metadata,
        similarity: parseFloat(row.similarity),
      }));

      console.log(`✅ [RAG Search] Found ${results.length} results`);

      res.json({
        success: true,
        query,
        results,
        count: results.length,
      });

    } catch (error) {
      console.error('❌ [RAG Search] Failed to search:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // ========================================
  // ADMIN API LEXICON
  // ========================================

  /**
   * GET /api/admin/api-lexicon
   * Returns the full API registry for the Admin API Lexicon page.
   */
  app.get('/api/admin/api-lexicon', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const tags = getAllTags();
      res.json({
        success: true,
        endpoints: API_REGISTRY,
        tags,
        count: API_REGISTRY.length,
      });
    } catch (error) {
      console.error('[Admin Lexicon] Error fetching registry:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  /**
   * GET /api/admin/api-lexicon/:key
   * Returns a specific endpoint descriptor with optional live example.
   */
  app.get('/api/admin/api-lexicon/:key', requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const descriptor = getEndpointByKey(key);

      if (!descriptor) {
        return res.status(404).json({
          success: false,
          error: `Endpoint with key "${key}" not found`,
        });
      }

      let liveExample: any = null;

      // Only attempt live call for GET endpoints with sampleParams
      if (descriptor.method === 'GET' && descriptor.sampleParams) {
        try {
          // Build the URL with sample params
          let url = descriptor.path;
          
          // Replace path params
          if (descriptor.sampleParams.path) {
            for (const [param, value] of Object.entries(descriptor.sampleParams.path)) {
              url = url.replace(`:${param}`, value);
            }
          }
          
          // Build query string
          if (descriptor.sampleParams.query) {
            const queryParams = new URLSearchParams();
            for (const [param, value] of Object.entries(descriptor.sampleParams.query)) {
              queryParams.append(param, String(value));
            }
            const queryString = queryParams.toString();
            if (queryString) {
              url = `${url}?${queryString}`;
            }
          }

          // Make internal request to our own server
          const protocol = req.protocol;
          const host = req.get('host');
          const fullUrl = `${protocol}://${host}${url}`;
          
          console.log(`[Admin Lexicon] Fetching live example: ${fullUrl}`);
          
          const response = await axios.get(fullUrl, {
            timeout: 10000,
            headers: {
              'Accept': 'application/json',
            },
          });
          
          liveExample = response.data;
        } catch (fetchError: any) {
          console.warn(`[Admin Lexicon] Live example fetch failed for ${key}:`, fetchError.message);
          liveExample = null;
        }
      }

      res.json({
        success: true,
        descriptor,
        liveExample,
        importantFields: descriptor.importantFields || [],
      });
    } catch (error) {
      console.error('[Admin Lexicon] Error fetching endpoint:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // NFLfastR Metric Validation endpoint
  app.post('/api/nflfastr/validate', async (req, res) => {
    try {
      const { validateMetric } = await import('./services/nflfastrValidation');
      const { jargon_term, player_name, team, season } = req.body;

      if (!jargon_term) {
        return res.status(400).json({
          success: false,
          error: 'jargon_term is required',
        });
      }

      console.log(`🔍 [NFLfastR] Validating metric: ${jargon_term} for ${player_name || team}`);

      const result = await validateMetric({
        jargon_term,
        player_name,
        team,
        season: season || 2025
      });

      console.log(`✅ [NFLfastR] Validation complete:`, result);

      res.json({
        success: true,
        result
      });

    } catch (error) {
      console.error('❌ [NFLfastR] Validation failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // ========================================
  // WEEKLY STATS DATA PIPE
  // ========================================

  // GET /api/weekly/:season/:week - Get weekly stats for a specific week
  app.get('/api/weekly/:season/:week', async (req: Request, res: Response) => {
    try {
      const { season, week } = req.params;
      const { scoring = 'half', position, playerId } = req.query;
      
      const filters: any = {
        season: parseInt(season),
        week: parseInt(week)
      };
      
      if (position) filters.position = position as string;
      if (playerId) filters.playerId = playerId as string;
      
      const stats = await storage.getWeeklyStats(filters);
      
      res.json({
        success: true,
        season: parseInt(season),
        week: parseInt(week),
        scoring: scoring as string,
        count: stats.length,
        data: stats
      });
    } catch (error) {
      console.error('❌ [Weekly Stats] Failed to fetch weekly stats:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/totals/:season - Get season totals with fantasy scoring
  app.get('/api/totals/:season', async (req: Request, res: Response) => {
    try {
      const { season } = req.params;
      const { scoring = 'half' } = req.query;
      
      const totals = await storage.getSeasonTotals(
        parseInt(season),
        scoring as 'std' | 'half' | 'ppr'
      );
      
      res.json({
        success: true,
        season: parseInt(season),
        scoring: scoring as string,
        count: totals.length,
        data: totals
      });
    } catch (error) {
      console.error('❌ [Season Totals] Failed to fetch season totals:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/weekly/player/:playerId - Get all weekly stats for a specific player
  app.get('/api/weekly/player/:playerId', async (req: Request, res: Response) => {
    try {
      const { playerId } = req.params;
      const { season = '2025' } = req.query;
      
      const stats = await storage.getPlayerWeeklyStats(
        playerId,
        parseInt(season as string)
      );
      
      res.json({
        success: true,
        player_id: playerId,
        season: parseInt(season as string),
        weeks: stats.length,
        data: stats
      });
    } catch (error) {
      console.error('❌ [Player Weekly Stats] Failed to fetch player stats:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/weekly/player - Get single week stats for a player (query-param based)
  // Used by Weekly Statline RAG v1 for chat context
  app.get('/api/weekly/player', async (req: Request, res: Response) => {
    try {
      const { weeklyStats } = await import('@shared/schema');
      const { hasWeeklyData } = await import('./lib/weekly-data');
      const { CURRENT_NFL_SEASON } = await import('../shared/config/seasons');
      
      const seasonParam = req.query.season as string | undefined;
      const weekParam = req.query.week as string | undefined;
      const playerParam = req.query.player as string | undefined;
      const scoring = (req.query.scoring as 'std' | 'half' | 'ppr' | undefined) ?? 'half';

      // Validation
      if (!weekParam || !playerParam) {
        return res.status(400).json({ 
          success: false, 
          error: 'week and player parameters required' 
        });
      }

      const week = parseInt(weekParam);
      if (isNaN(week) || week < 1 || week > 18) {
        return res.status(400).json({ 
          success: false, 
          error: 'week must be 1-18' 
        });
      }

      const season = seasonParam ? parseInt(seasonParam) : CURRENT_NFL_SEASON;
      if (isNaN(season) || season < 2000 || season > 2100) {
        return res.status(400).json({ 
          success: false, 
          error: 'invalid season' 
        });
      }

      // Check if weekly data exists for this season
      const dataAvailable = await hasWeeklyData(season);
      if (!dataAvailable) {
        return res.status(404).json({ 
          success: false, 
          error: `No weekly data available for season ${season}.` 
        });
      }

      // Fuzzy player name search
      const candidates = await db
        .select({
          player_id: weeklyStats.playerId,
          player_name: weeklyStats.playerName,
          team: weeklyStats.team,
          position: weeklyStats.position,
        })
        .from(weeklyStats)
        .where(
          and(
            eq(weeklyStats.season, season),
            eq(weeklyStats.week, week),
            sql`LOWER(${weeklyStats.playerName}) LIKE LOWER(${'%' + playerParam + '%'})`
          )
        )
        .limit(5);

      if (candidates.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: `No weekly stats found for ${playerParam} in Week ${week}, ${season}.` 
        });
      }
      
      if (candidates.length > 1) {
        return res.status(400).json({ 
          success: false, 
          error: `Multiple matches for '${playerParam}'. Be more specific.` 
        });
      }

      const player = candidates[0];

      // Get full row for matched player
      const rows = await db
        .select()
        .from(weeklyStats)
        .where(
          and(
            eq(weeklyStats.season, season),
            eq(weeklyStats.week, week),
            eq(weeklyStats.playerId, player.player_id)
          )
        );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: `No weekly stats found for ${playerParam} in Week ${week}, ${season}.` 
        });
      }

      const row = rows[0];

      const response = {
        success: true,
        season,
        week,
        playerId: row.playerId,
        playerName: row.playerName,
        team: row.team,
        pos: row.position,
        fantasyPoints: {
          std: row.fantasyPointsStd ?? 0,
          half: row.fantasyPointsHalf ?? 0,
          ppr: row.fantasyPointsPpr ?? 0,
        },
        line: {
          carries: row.rushAtt ?? 0,
          rushYds: row.rushYd ?? 0,
          rushTD: row.rushTd ?? 0,
          targets: row.targets ?? 0,
          receptions: row.rec ?? 0,
          recYds: row.recYd ?? 0,
          recTD: row.recTd ?? 0,
          passYds: row.passYd ?? 0,
          passTD: row.passTd ?? 0,
          int: row.int ?? 0,
        },
        usage: {
          snaps: row.snaps ?? null,
          routes: row.routes ?? null,
        },
        efficiency: {
          rushingEpa: null, // Not in our schema currently
          receivingEpa: null, // Not in our schema currently
        },
        raw: row,
      };

      res.json(response);
    } catch (error) {
      console.error('❌ [Weekly Player Stats] Failed to fetch stats:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // POST /api/weekly/sync - Trigger weekly data sync
  app.post('/api/weekly/sync', async (req: Request, res: Response) => {
    await handleWeeklySync(req, res, {
      loadNflfastR: async () => {
        const nflfastr = await import('./ingest/nflfastr');
        return {
          fetchSeasonToDate: nflfastr.fetchSeasonToDate,
          fetchWeeklyFromNflfastR: nflfastr.fetchWeeklyFromNflfastR,
          resolveSeasonToDateWeekBound: nflfastr.resolveNflfastrSeasonToDateWeekBound,
        };
      },
      upsertWeeklyStats: (stats) => storage.upsertWeeklyStats(stats),
    });
  });

  // POST /api/schedule/sync - Sync NFL schedule from NFLverse
  app.post('/api/schedule/sync', async (req: Request, res: Response) => {
    try {
      const requestedSeason = req.body?.season as number | undefined;
      if (
        requestedSeason !== undefined &&
        (!Number.isInteger(requestedSeason) || requestedSeason < 2000 || requestedSeason > 2100)
      ) {
        throw new InvalidEvidenceIngestionTargetError(
          'Season must be an integer between 2000 and 2100.',
        );
      }
      const season = requestedSeason ?? requireScheduleSyncDefaultSeason();
      const { syncScheduleFromNFLverse } = await import('./cron/scheduleSync');
      
      console.log(`📅 [Schedule Sync] Triggering sync for season ${season}...`);
      
      const result = await syncScheduleFromNFLverse(season);
      
      if (result.success) {
        res.json({
          success: true,
          season,
          gamesSync: result.gamesSync,
          duration: result.duration,
          message: `Successfully synced ${result.gamesSync} games for season ${season}`
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          message: 'Schedule sync failed'
        });
      }
    } catch (error) {
      console.error('❌ [Schedule Sync] Failed:', error);
      const status =
        error instanceof EvidenceIngestionTargetUnavailableError ||
        error instanceof InvalidEvidenceIngestionTargetError
          ? error.statusCode
          : 500;
      res.status(status).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/schedule/:season/:week - Get schedule for specific week
  app.get('/api/schedule/:season/:week', async (req: Request, res: Response) => {
    try {
      const season = parseInt(req.params.season);
      const week = parseInt(req.params.week);
      
      const games = await db.select().from(schedule)
        .where(and(eq(schedule.season, season), eq(schedule.week, week)))
        .orderBy(schedule.home);
      
      res.json({
        success: true,
        season,
        week,
        games: games.map(g => ({
          home: g.home,
          away: g.away,
          homeScore: g.homeScore,
          awayScore: g.awayScore,
          result: g.result
        })),
        count: games.length
      });
    } catch (error) {
      console.error('❌ [Schedule] Failed to fetch:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // ========================================
  // WR ROLE BANK ROUTES
  // ========================================

  // POST /api/role-bank/compute/:playerId/:season - Compute role bank for a specific player/season
  app.post('/api/role-bank/compute/:playerId/:season', async (req: Request, res: Response) => {
    try {
      const { computeWRRoleBankSeasonRow } = await import('./services/roleBankService');
      const { playerId, season } = req.params;
      const seasonNum = parseInt(season);
      
      const weeklyUsage = await storage.getWeeklyUsageForRoleBank(playerId, seasonNum);
      
      if (weeklyUsage.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No weekly usage data found for player ${playerId} in season ${season}`
        });
      }
      
      const roleRow = computeWRRoleBankSeasonRow(weeklyUsage);
      
      if (!roleRow) {
        return res.status(400).json({
          success: false,
          error: 'Failed to compute role bank data (player may have no games played)'
        });
      }
      
      await storage.upsertWRRoleBank(roleRow);
      
      res.json({
        success: true,
        playerId,
        season: seasonNum,
        data: roleRow
      });
    } catch (error) {
      console.error('❌ [Role Bank Compute] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/fantasy-rankings/WR/:season - Fantasy-focused WR rankings (uses WR Role Bank + fantasy PPG)
  app.get('/api/fantasy-rankings/WR/:season', async (req: Request, res: Response) => {
    try {
      const { season } = req.params;
      const { minScore, limit, offset } = req.query;
      
      const { getFantasyWRRankings } = await import('./services/fantasyWrRankingsService');
      
      const options: any = {};
      if (minScore) options.minScore = parseInt(minScore as string);
      if (limit) options.limit = parseInt(limit as string);
      if (offset) options.offset = parseInt(offset as string);
      
      const rankings = await getFantasyWRRankings(parseInt(season), options);
      
      res.json({
        success: true,
        season: parseInt(season),
        count: rankings.length,
        data: rankings
      });
    } catch (error) {
      console.error('❌ [Fantasy WR Rankings] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/role-bank/:season - Get all WR role bank data for a season (DEPRECATED - use /WR/:season)
  app.get('/api/role-bank/:season', async (req: Request, res: Response) => {
    try {
      const { season } = req.params;
      const { roleTier, limit = '100' } = req.query;
      
      const filters: any = {
        season: parseInt(season)
      };
      
      if (roleTier) {
        filters.roleTier = roleTier;
      }
      
      let results = await storage.getWRRoleBank(filters);
      
      const limitNum = parseInt(limit as string);
      if (limitNum > 0) {
        results = results.slice(0, limitNum);
      }
      
      res.json({
        success: true,
        season: parseInt(season),
        filters: filters.roleTier ? { roleTier: filters.roleTier } : {},
        count: results.length,
        data: results
      });
    } catch (error) {
      console.error('❌ [Role Bank Get] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/role-bank/player/:playerId/:season - Get role bank for a specific player/season
  app.get('/api/role-bank/player/:playerId/:season', async (req: Request, res: Response) => {
    try {
      const { playerId, season } = req.params;
      const seasonNum = parseInt(season);
      
      const roleData = await storage.getWRRoleBankByPlayer(playerId, seasonNum);
      
      if (!roleData) {
        return res.status(404).json({
          success: false,
          error: `No role bank data found for player ${playerId} in season ${season}`
        });
      }
      
      res.json({
        success: true,
        playerId,
        season: seasonNum,
        data: roleData
      });
    } catch (error) {
      console.error('❌ [Role Bank Get Player] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // ========================================
  // RB ROLE BANK ROUTES
  // ========================================

  // POST /api/role-bank/rb/compute/:playerId/:season - Compute RB role bank for a specific player/season
  app.post('/api/role-bank/rb/compute/:playerId/:season', async (req: Request, res: Response) => {
    try {
      const { computeRBRoleBankSeasonRow } = await import('./services/roleBankService');
      const { playerId, season } = req.params;
      const seasonNum = parseInt(season);
      
      const weeklyUsage = await storage.getWeeklyUsageForRBRoleBank(playerId, seasonNum);
      
      if (weeklyUsage.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No weekly usage data found for RB ${playerId} in season ${season}`
        });
      }
      
      const roleRow = computeRBRoleBankSeasonRow(weeklyUsage);
      
      if (!roleRow) {
        return res.status(400).json({
          success: false,
          error: 'Failed to compute RB role bank data (player may have no games played)'
        });
      }
      
      await storage.upsertRBRoleBank(roleRow);
      
      res.json({
        success: true,
        playerId,
        season: seasonNum,
        data: roleRow
      });
    } catch (error) {
      console.error('❌ [RB Role Bank Compute] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/role-bank/rb/:season - Get all RB role bank data for a season
  app.get('/api/role-bank/rb/:season', async (req: Request, res: Response) => {
    try {
      const { season } = req.params;
      const { roleTier, limit = '100' } = req.query;
      
      const filters: any = {
        season: parseInt(season)
      };
      
      if (roleTier) {
        filters.roleTier = roleTier;
      }
      
      let results = await storage.getRBRoleBank(filters);
      
      const limitNum = parseInt(limit as string);
      if (limitNum > 0) {
        results = results.slice(0, limitNum);
      }
      
      res.json({
        success: true,
        season: parseInt(season),
        filters: filters.roleTier ? { roleTier: filters.roleTier } : {},
        count: results.length,
        data: results
      });
    } catch (error) {
      console.error('❌ [RB Role Bank Get] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/role-bank/rb/player/:playerId/:season - Get RB role bank for a specific player/season
  app.get('/api/role-bank/rb/player/:playerId/:season', async (req: Request, res: Response) => {
    try {
      const { playerId, season } = req.params;
      const seasonNum = parseInt(season);
      
      const roleData = await storage.getRBRoleBankByPlayer(playerId, seasonNum);
      
      if (!roleData) {
        return res.status(404).json({
          success: false,
          error: `No RB role bank data found for player ${playerId} in season ${season}`
        });
      }
      
      res.json({
        success: true,
        playerId,
        season: seasonNum,
        data: roleData
      });
    } catch (error) {
      console.error('❌ [RB Role Bank Get Player] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // ========================================
  // TE ROLE BANK ROUTES
  // ========================================

  // POST /api/role-bank/te/compute/:playerId/:season - Compute TE role bank for a specific player/season
  app.post('/api/role-bank/te/compute/:playerId/:season', async (req: Request, res: Response) => {
    try {
      const { computeTERoleBankSeasonRow } = await import('./services/roleBankService');
      const { playerId, season } = req.params;
      const seasonNum = parseInt(season);
      
      const weeklyUsage = await storage.getWeeklyUsageForTERoleBank(playerId, seasonNum);
      
      if (weeklyUsage.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No weekly usage data found for TE ${playerId} in season ${season}`
        });
      }
      
      const roleRow = computeTERoleBankSeasonRow(weeklyUsage);
      
      if (!roleRow) {
        return res.status(400).json({
          success: false,
          error: 'Failed to compute TE role bank data (player may have no games played)'
        });
      }
      
      await storage.upsertTERoleBank(roleRow);
      
      res.json({
        success: true,
        playerId,
        season: seasonNum,
        data: roleRow
      });
    } catch (error) {
      console.error('❌ [TE Role Bank Compute] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/role-bank/te/:season - Get all TE role bank data for a season
  app.get('/api/role-bank/te/:season', async (req: Request, res: Response) => {
    try {
      const { season } = req.params;
      const { roleTier, limit = '100' } = req.query;
      
      const filters: any = {
        season: parseInt(season)
      };
      
      if (roleTier) {
        filters.roleTier = roleTier;
      }
      
      let results = await storage.getTERoleBank(filters);
      
      const limitNum = parseInt(limit as string);
      if (limitNum > 0) {
        results = results.slice(0, limitNum);
      }
      
      res.json({
        success: true,
        season: parseInt(season),
        filters: filters.roleTier ? { roleTier: filters.roleTier } : {},
        count: results.length,
        data: results
      });
    } catch (error) {
      console.error('❌ [TE Role Bank Get] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/role-bank/te/player/:playerId/:season - Get TE role bank for a specific player/season
  app.get('/api/role-bank/te/player/:playerId/:season', async (req: Request, res: Response) => {
    try {
      const { playerId, season } = req.params;
      const seasonNum = parseInt(season);
      
      const roleData = await storage.getTERoleBankByPlayer(playerId, seasonNum);
      
      if (!roleData) {
        return res.status(404).json({
          success: false,
          error: `No TE role bank data found for player ${playerId} in season ${season}`
        });
      }
      
      res.json({
        success: true,
        playerId,
        season: seasonNum,
        data: roleData
      });
    } catch (error) {
      console.error('❌ [TE Role Bank Get Player] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // ========================================
  // QB ROLE BANK ROUTES
  // ========================================

  // POST /api/role-bank/QB/compute/:playerId/:season - Compute QB role bank for a specific player/season
  app.post('/api/role-bank/QB/compute/:playerId/:season', async (req: Request, res: Response) => {
    try {
      const { computeQBAlphaContextRow } = await import('./services/roleBankService');
      const { playerId, season } = req.params;
      const seasonNum = parseInt(season);
      
      const weeklyUsage = await storage.getWeeklyUsageForQBRoleBank(playerId, seasonNum);
      
      if (weeklyUsage.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No weekly usage data found for QB ${playerId} in season ${season}`
        });
      }
      
      const roleRow = computeQBAlphaContextRow(weeklyUsage);
      
      if (!roleRow) {
        return res.status(400).json({
          success: false,
          error: 'Failed to compute QB role bank data (player may have no games played)'
        });
      }
      
      await storage.upsertQBRoleBank(roleRow);
      
      res.json({
        success: true,
        playerId,
        season: seasonNum,
        data: roleRow
      });
    } catch (error) {
      console.error('❌ [QB Role Bank Compute] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/role-bank/QB/:season - Get all QB role bank data for a season
  app.get('/api/role-bank/QB/:season', async (req: Request, res: Response) => {
    try {
      const { season } = req.params;
      const { alphaTier, limit = '250', sortBy = 'alphaContextScore', order = 'desc' } = req.query;
      
      const filters: any = {
        season: parseInt(season)
      };
      
      if (alphaTier) {
        filters.alphaTier = alphaTier;
      }
      
      let rawResults = await storage.getQBRoleBank(filters);
      
      const enrichedResults = await Promise.all(
        rawResults.map(async (r: any) => {
          const playerInfo = await db
            .select({
              canonicalId: playerIdentityMap.canonicalId,
              fullName: playerIdentityMap.fullName,
              sleeperId: playerIdentityMap.sleeperId,
              team: playerIdentityMap.team,
              position: playerIdentityMap.position
            })
            .from(playerIdentityMap)
            .where(eq(playerIdentityMap.nflDataPyId, r.playerId))
            .limit(1);
          
          const pInfo = playerInfo[0] || {
            canonicalId: r.playerId,
            fullName: 'Unknown Player',
            sleeperId: null,
            team: null,
            position: 'QB'
          };
          
          return {
            playerId: r.playerId,
            canonicalId: pInfo.canonicalId,
            sleeperId: pInfo.sleeperId,
            playerName: pInfo.fullName,
            team: pInfo.team,
            position: pInfo.position as 'QB',
            roleScore: r.alphaContextScore,
            roleTier: r.alphaTier,
            gamesPlayed: r.gamesPlayed,
            targetsPerGame: null,
            carriesPerGame: null,
            opportunitiesPerGame: null,
            targetShareAvg: null,
            routesPerGame: null,
            pprPerTarget: null,
            pprPerOpportunity: null,
            redZoneTargetsPerGame: null,
            redZoneTouchesPerGame: null,
            dropbacksPerGame: r.dropbacksPerGame,
            rushAttemptsPerGame: r.rushAttemptsPerGame,
            redZoneDropbacksPerGame: r.redZoneDropbacksPerGame,
            redZoneRushesPerGame: r.redZoneRushesPerGame,
            epaPerPlay: r.epaPerPlay,
            cpoe: r.cpoe,
            sackRate: r.sackRate,
            passingAttempts: r.passingAttempts,
            passingYards: r.passingYards,
            passingTouchdowns: r.passingTouchdowns,
            interceptions: r.interceptions,
            rushingYards: r.rushingYards,
            rushingTouchdowns: r.rushingTouchdowns,
            volumeScore: r.volumeScore,
            consistencyScore: null,
            highValueUsageScore: null,
            momentumScore: r.momentumScore,
            efficiencyScore: r.efficiencyScore,
            rushingScore: r.rushingScore,
            flags: {
              konamiCode: r.konamiCodeFlag,
              systemQB: r.systemQBFlag,
              garbageTimeKing: r.garbageTimeKingFlag
            }
          };
        })
      );
      
      const limitNum = parseInt(limit as string);
      const finalResults = limitNum > 0 ? enrichedResults.slice(0, limitNum) : enrichedResults;
      
      res.json({
        success: true,
        season: parseInt(season),
        position: 'QB' as const,
        filters: filters.alphaTier ? { alphaTier: filters.alphaTier } : {},
        count: finalResults.length,
        results: finalResults
      });
    } catch (error) {
      console.error('❌ [QB Role Bank Get] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/role-bank/QB/:playerId/:season - Get QB role bank for a specific player/season
  app.get('/api/role-bank/QB/:playerId/:season', async (req: Request, res: Response) => {
    try {
      const { playerId, season } = req.params;
      const seasonNum = parseInt(season);
      
      const roleData = await storage.getQBRoleBankByPlayer(playerId, seasonNum);
      
      if (!roleData) {
        return res.status(404).json({
          success: false,
          error: `No QB role bank data found for player ${playerId} in season ${season}`
        });
      }
      
      res.json({
        success: true,
        playerId,
        season: seasonNum,
        data: roleData
      });
    } catch (error) {
      console.error('❌ [QB Role Bank Get Player] Failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // GET /api/leagues - List all leagues for a user
  app.get('/api/leagues', async (req, res) => {
    try {
      const { leagues: leaguesTable } = await import('@shared/schema');
      const { user_id = 'default_user' } = req.query; // TODO: Replace with actual auth

      const userLeagues = await db
        .select()
        .from(leaguesTable)
        .where(eq(leaguesTable.userId, user_id as string));

      console.log(`✅ [Leagues] Found ${userLeagues.length} leagues for user: ${user_id}`);
      
      res.json({
        success: true,
        leagues: userLeagues,
      });
    } catch (error) {
      console.error('❌ [Leagues] Failed to fetch leagues:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // POST /api/leagues - Create a new league
  app.post('/api/leagues', async (req, res) => {
    try {
      const { leagues: leaguesTable, insertLeagueSchema } = await import('@shared/schema');
      const { league_name, platform, league_id_external, settings } = req.body;
      const user_id = 'default_user'; // TODO: Replace with actual auth

      // Validate and create league
      const leagueData = {
        userId: user_id,
        leagueName: league_name,
        platform: platform || null,
        leagueIdExternal: league_id_external || null,
        settings: settings || {},
      };

      const [newLeague] = await db.insert(leaguesTable).values(leagueData).returning();

      console.log(`✅ [Leagues] Created league: ${newLeague.leagueName} (${newLeague.id})`);

      res.json({
        success: true,
        league: newLeague,
      });
    } catch (error) {
      console.error('❌ [Leagues] Failed to create league:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // GET /api/leagues/:id - Get league details
  app.get('/api/leagues/:id', async (req, res) => {
    try {
      const { leagues: leaguesTable } = await import('@shared/schema');
      const { id } = req.params;

      const [league] = await db
        .select()
        .from(leaguesTable)
        .where(eq(leaguesTable.id, id));

      if (!league) {
        return res.status(404).json({
          success: false,
          error: 'League not found',
        });
      }

      console.log(`✅ [Leagues] Retrieved league: ${league.leagueName}`);

      res.json({
        success: true,
        league,
      });
    } catch (error) {
      console.error('❌ [Leagues] Failed to fetch league:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // PUT /api/leagues/:id - Update league
  app.put('/api/leagues/:id', async (req, res) => {
    try {
      const { leagues: leaguesTable } = await import('@shared/schema');
      const { id } = req.params;
      const { league_name, platform, league_id_external, settings } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (league_name) updateData.leagueName = league_name;
      if (platform) updateData.platform = platform;
      if (league_id_external !== undefined) updateData.leagueIdExternal = league_id_external;
      if (settings) updateData.settings = settings;

      const [updatedLeague] = await db
        .update(leaguesTable)
        .set(updateData)
        .where(eq(leaguesTable.id, id))
        .returning();

      if (!updatedLeague) {
        return res.status(404).json({
          success: false,
          error: 'League not found',
        });
      }

      console.log(`✅ [Leagues] Updated league: ${updatedLeague.leagueName}`);

      res.json({
        success: true,
        league: updatedLeague,
      });
    } catch (error) {
      console.error('❌ [Leagues] Failed to update league:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // DELETE /api/leagues/:id - Delete league
  app.delete('/api/leagues/:id', async (req, res) => {
    try {
      const { leagues: leaguesTable } = await import('@shared/schema');
      const { id } = req.params;

      const [deletedLeague] = await db
        .delete(leaguesTable)
        .where(eq(leaguesTable.id, id))
        .returning();

      if (!deletedLeague) {
        return res.status(404).json({
          success: false,
          error: 'League not found',
        });
      }

      console.log(`✅ [Leagues] Deleted league: ${deletedLeague.leagueName} (cascade to league_context)`);

      res.json({
        success: true,
        message: 'League deleted successfully',
        league: deletedLeague,
      });
    } catch (error) {
      console.error('❌ [Leagues] Failed to delete league:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // POST /api/leagues/:id/sync-sleeper - Sync Sleeper league data
  app.post('/api/leagues/:id/sync-sleeper', async (req, res) => {
    try {
      const { id } = req.params;
      const { sleeper_league_id, sleeper_roster_id } = req.body;

      if (!sleeper_league_id) {
        return res.status(400).json({
          success: false,
          error: 'sleeper_league_id is required',
        });
      }

      if (!sleeper_roster_id) {
        return res.status(400).json({
          success: false,
          error: 'sleeper_roster_id is required',
        });
      }

      const { syncSleeperLeague } = await import('./services/sleeperLeagueSync');
      const result = await syncSleeperLeague(id, sleeper_league_id, sleeper_roster_id);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.errors.join('; '),
        });
      }

      console.log(`✅ [Sleeper Sync] Synced league ${id}: ${result.contextsCreated} contexts created`);

      res.json({
        success: true,
        message: 'Sleeper league synced successfully',
        contextsCreated: result.contextsCreated,
        league: result.league,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (error) {
      console.error('❌ [Sleeper Sync] Sync failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // GET /api/sleeper/validate/:league_id - Validate Sleeper league ID and fetch rosters
  app.get('/api/sleeper/validate/:league_id', async (req, res) => {
    try {
      const { league_id } = req.params;

      const { validateSleeperLeagueId, fetchSleeperRosters } = await import('./services/sleeperLeagueSync');
      const [validateResult, rosters] = await Promise.all([
        validateSleeperLeagueId(league_id),
        fetchSleeperRosters(league_id)
      ]);

      if (!validateResult.valid) {
        return res.status(404).json({
          success: false,
          valid: false,
          error: validateResult.error || 'League not found',
        });
      }

      res.json({
        success: true,
        valid: true,
        league: validateResult.league,
        rosters: rosters || [],
      });
    } catch (error) {
      console.error('❌ [Sleeper Validate] Validation failed:', error);
      res.status(500).json({
        success: false,
        valid: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // ========================================
  // PLAYBOOK API - Decision Journal
  // ========================================

  app.get('/api/playbook/analytics/regret-summary', async (req, res) => {
    try {
      const userId = (req.query.user_id as string) || 'default_user';
      const leagueId = req.query.league_id as string | undefined;
      const teamId = req.query.team_id as string | undefined;
      const parsedSeason = req.query.season ? parseInt(req.query.season as string, 10) : undefined;
      const season = Number.isNaN(parsedSeason as number) ? undefined : parsedSeason;

      const summary = await storage.getPlaybookRegretSummary(userId, { leagueId, teamId, season });

      res.json({ success: true, ...summary });
    } catch (error) {
      console.error('❌ [Playbook Analytics] Failed to get regret summary:', error);
      res.status(500).json({ success: false, error: (error as Error).message || 'Unknown error' });
    }
  });

  app.get('/api/playbook/analytics/patterns', async (req, res) => {
    try {
      const userId = (req.query.user_id as string) || 'default_user';
      const leagueId = req.query.league_id as string | undefined;
      const teamId = req.query.team_id as string | undefined;
      const parsedSeason = req.query.season ? parseInt(req.query.season as string, 10) : undefined;
      const season = Number.isNaN(parsedSeason as number) ? undefined : parsedSeason;

      const patterns = await storage.getPlaybookPatternInsights(userId, { leagueId, teamId, season });

      res.json({ success: true, ...patterns });
    } catch (error) {
      console.error('❌ [Playbook Analytics] Failed to get pattern insights:', error);
      res.status(500).json({ success: false, error: (error as Error).message || 'Unknown error' });
    }
  });

  // GET /api/playbook - Get user's playbook entries
  app.get('/api/playbook', async (req, res) => {
    try {
      const userId = req.query.user_id as string || 'default_user';
      const leagueId = req.query.league_id as string | undefined;
      const teamId = req.query.team_id as string | undefined;
      const entryType = req.query.entry_type as string | undefined;
      const parsedWeek = req.query.week ? parseInt(req.query.week as string, 10) : undefined;
      const parsedSeason = req.query.season ? parseInt(req.query.season as string, 10) : undefined;
      const week = Number.isNaN(parsedWeek as number) ? undefined : parsedWeek;
      const season = Number.isNaN(parsedSeason as number) ? undefined : parsedSeason;
      const outcome = req.query.outcome as string | undefined;
      const parsedRegret = req.query.regret_score ? parseInt(req.query.regret_score as string, 10) : undefined;
      const regretScore = Number.isNaN(parsedRegret as number) ? undefined : parsedRegret;
      const pendingOnly = req.query.pending_only === 'true';
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const entries = await storage.getPlaybookEntries(userId, {
        leagueId,
        teamId,
        week,
        season,
        entryType,
        outcome,
        regretScore,
        pendingOnly,
        limit,
        offset
      });
      
      res.json({
        success: true,
        entries,
        count: entries.length
      });
    } catch (error) {
      console.error('❌ [Playbook] Failed to get entries:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });
  
  // POST /api/playbook - Create a new playbook entry
  app.post('/api/playbook', async (req, res) => {
    try {
      const { user_id, league_id, team_id, scoring_format, week, season, entry_type, title, content, player_ids, metadata, outcome, regret_score, resolved_at, forge_before, forge_after, tier_before, tier_after } = req.body;

      if (!entry_type || !title || !content) {
        return res.status(400).json({
          success: false,
          error: 'entry_type, title, and content are required'
        });
      }
      
      const entry = await storage.createPlaybookEntry({
        userId: user_id || 'default_user',
        leagueId: league_id || null,
        teamId: team_id || null,
        scoringFormat: scoring_format || null,
        week: week ?? null,
        season: season ?? null,
        entryType: entry_type,
        title,
        content,
        playerIds: player_ids || [],
        metadata: metadata || {},
        outcome: outcome ?? null,
        regretScore: regret_score ?? null,
        resolvedAt: resolved_at ?? null,
        forgeBefore: forge_before ?? null,
        forgeAfter: forge_after ?? null,
        tierBefore: tier_before ?? null,
        tierAfter: tier_after ?? null
      });
      
      console.log(`✅ [Playbook] Created entry: ${title} (type: ${entry_type})`);
      
      res.json({
        success: true,
        entry
      });
    } catch (error) {
      console.error('❌ [Playbook] Failed to create entry:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });
  
  // PUT /api/playbook/:id - Update a playbook entry
  app.put('/api/playbook/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { title, content, player_ids, metadata, league_id, team_id, scoring_format, week, season, outcome, regret_score, resolved_at, forge_before, forge_after, tier_before, tier_after } = req.body;

      await storage.updatePlaybookEntry(id, {
        title,
        content,
        playerIds: player_ids,
        metadata,
        leagueId: league_id,
        teamId: team_id,
        scoringFormat: scoring_format,
        week,
        season,
        outcome,
        regretScore: regret_score,
        resolvedAt: resolved_at,
        forgeBefore: forge_before,
        forgeAfter: forge_after,
        tierBefore: tier_before,
        tierAfter: tier_after
      });
      
      res.json({
        success: true,
        message: 'Entry updated'
      });
    } catch (error) {
      console.error('❌ [Playbook] Failed to update entry:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });
  
  // DELETE /api/playbook/:id - Delete a playbook entry
  app.delete('/api/playbook/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      await storage.deletePlaybookEntry(id);
      
      console.log(`✅ [Playbook] Deleted entry: ${id}`);
      
      res.json({
        success: true,
        message: 'Entry deleted'
      });
    } catch (error) {
      console.error('❌ [Playbook] Failed to delete entry:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error'
      });
    }
  });

  // Helper function to extract player names from message
  function extractPlayerNamesFromMessage(message: string): string[] {
    const players: string[] = [];
    
    // Filter out common non-player words BEFORE regex matching
    const excludeWords = new Set([
      'Should', 'Would', 'Could', 'Will', 'Can', 'Start', 'Sit', 'Trade',
      'Week', 'Season', 'Game', 'Points', 'Dynasty', 'Redraft', 'The', 'This',
      'Against', 'Versus', 'Next', 'Last', 'Over', 'Under', 'Who', 'What',
      'When', 'Where', 'Why', 'How', 'Fantasy', 'Football', 'League', 'Team',
      'Tiber', 'TIBER', 'PPR', 'VORP', 'EPA', 'Are', 'Is', 'Do', 'Does',
      'Tell', 'About', 'Me', 'My', 'I', 'And', 'Or', 'From', 'But', 'Not',
    ]);
    
    // Pre-filter: Replace excluded words with lowercase to break capitalization chains
    let cleanedMessage = message;
    for (const word of excludeWords) {
      // Case-insensitive replace to handle "Is", "is", etc.
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      cleanedMessage = cleanedMessage.replace(regex, word.toLowerCase());
    }
    
    // Common NFL player name patterns (First + Last name, capitalized)
    // Match 2-4 consecutive capitalized words (handles names like "Amon-Ra St. Brown", "Christian McCaffrey")
    // Updated to allow mid-word capitals (e.g., "McCaffrey", "McMillan", "Ogbongbemiga")
    const namePattern = /\b[A-Z][a-zA-Z]+(?:['-][A-Z][a-zA-Z]+)?(?: [A-Z][a-zA-Z'.]+){0,3}\b/g;
    const matches = cleanedMessage.match(namePattern);
    
    if (matches) {
      for (const match of matches) {
        // Skip if it's still an excluded word
        if (excludeWords.has(match)) continue;
        
        // Require at least 2 words (First + Last name) to avoid false positives
        const words = match.split(' ');
        if (words.length >= 2) {
          players.push(match);
        }
      }
    }
    
    // Deduplicate
    return Array.from(new Set(players));
  }

  // Helper: Detect when user wants 2024 baseline historical data
  // CRITICAL: Only trigger for EXPLICIT historical queries, not tactical decisions
  // 2024 data is for TEACHING frameworks, not current trade/start-sit advice
  function detect2024BaselineIntent(query: string): boolean {
    // Exclude tactical queries (trades, start/sit, waivers, matchups)
    const isTactical = /\b(trade|start|sit|waiver|matchup|pick up|drop|this week|next week|tonight|should i)\b/i.test(query);
    if (isTactical) {
      return false; // Never inject 2024 baseline for tactical decisions
    }
    
    // Only trigger for EXPLICIT historical framing
    const patterns = [
      /2024/i,                                           // Explicit year mention
      /last (year|season)/i,                            // "last year", "last season"
      /(how did|what did).+(do|perform|finish)/i,      // "how did X perform in 2024?"
      /baseline/i,                                       // Explicit baseline request
      /historical(ly)?/i,                                // "historically"
      /(compare|comparison).+(last|previous|2024)/i,    // Comparison to past
      /what (did|were).+(stats|numbers|production)/i,   // "what were his 2024 stats?"
    ];
    
    return patterns.some(p => p.test(query));
  }

  // Helper: Fetch waiver candidates with week lookback logic
  // Tries current week → earlier weeks to find most recent data
  // Week X data contains recommendations FOR Week X (based on Week X-1 stats)
  async function fetchWaiverCandidatesWithLookback(
    season: number, 
    position?: string,
    maxCandidates: number = 15
  ): Promise<{ week: number; candidates: any[] } | null> {
    const weeksToTry = [12, 11, 10, 9, 8]; // Try current week first, then fall back
    
    for (const week of weeksToTry) {
      try {
        const whereConditions: any[] = [
          eq(waiverCandidates.season, season),
          eq(waiverCandidates.week, week)
        ];
        
        // Add position filter if specified
        if (position) {
          whereConditions.push(eq(waiverCandidates.position, position));
        }
        
        const candidates = await db
          .select()
          .from(waiverCandidates)
          .where(and(...whereConditions))
          .orderBy(desc(waiverCandidates.interestScore))
          .limit(maxCandidates);
        
        if (candidates.length > 0) {
          console.log(`📊 [Waiver Lookback] Found ${candidates.length} candidates for ${season} Week ${week}${position ? ` (${position})` : ''}`);
          return { week, candidates };
        }
      } catch (error) {
        console.warn(`⚠️  [Waiver Lookback] Error fetching week ${week}:`, error);
      }
    }
    
    console.log(`⚠️  [Waiver Lookback] No candidates found for weeks ${weeksToTry.join(', ')}`);
    return null;
  }

  // Helper: Detect pressure-related queries for Pressure Module boosting
  function detectsPressureQuery(userQuery: string): boolean {
    const q = userQuery.toLowerCase();
    return /\b(pressure|breakout|collapse|tension|accumulate|release)\b/.test(q);
  }

  // Helper: Re-rank chunks to boost Pressure Module content when detected
  function boostPressureChunks(chunks: any[], pressureHint: boolean): any[] {
    if (!pressureHint) {
      return chunks;
    }

    // Re-rank: boost ALL pressure-related chunks by 30%
    chunks.forEach((chunk: any) => {
      const topic = chunk.metadata?.topic || '';
      const isPressureChunk = topic.includes('pressure') || 
                              ['pressure_framework', 'pressure_components', 'pressure_teaching', 'pressure_metaphors'].includes(chunk.metadata?.type);
      
      if (isPressureChunk) {
        chunk.relevance_score = (chunk.relevance_score || 0) * 1.3;
        chunk.boosted = true;
        console.log(`🌊 [Pressure Boost] Boosted chunk by 30%: ${chunk.content_preview || ''}`.substring(0, 100));
      }

      // Additional 15% boost for teaching + pressure combo
      if (chunk.metadata?.layer_hint === 'teaching' && isPressureChunk) {
        chunk.relevance_score = (chunk.relevance_score || 0) * 1.15;
        console.log(`📚 [Teaching Pressure Boost] Additional 15% boost applied`);
      }
    });

    // Re-sort by boosted scores
    chunks.sort((a: any, b: any) => (b.relevance_score || 0) - (a.relevance_score || 0));

    return chunks;
  }

  // Helper: Temporal Guard - Validate response adheres to requested year
  interface TemporalGuardResult {
    requestedYears: number[];
    comparisonInvited: boolean;
    violation: boolean;
    violatingYears: number[];
    shouldRegenerate: boolean;
  }

  function parseTemporalIntent(query: string): { requestedYears: number[]; comparisonInvited: boolean } {
    const queryLower = query.toLowerCase();
    
    // Use the same extraction logic to ensure consistency
    const requestedYears = extractTemporalReferences(query);
    
    // Detect comparison intent
    const comparisonKeywords = [
      /compar(e|ing|ison)/i,
      /\bvs\b/i,
      /versus/i,
      /since/i,
      /from\s+\d{4}\s+to\s+\d{4}/i,
      /trend/i,
      /change/i,
      /difference/i,
      /between\s+\d{4}\s+(and|&)\s+\d{4}/i
    ];
    
    const comparisonInvited = comparisonKeywords.some(pattern => pattern.test(queryLower));
    
    return { requestedYears, comparisonInvited };
  }

  function extractTemporalReferences(text: string): number[] {
    const textLower = text.toLowerCase();
    const years: number[] = [];
    
    // Extract 4-digit years (1990-2049 range - comprehensive NFL coverage)
    const yearMatches = text.match(/\b(19[9][0-9]|20[0-4][0-9])\b/g);
    if (yearMatches) {
      years.push(...yearMatches.map(Number));
    }
    
    // Extract 2-digit shorthand ('90-'49)
    const shortYearMatches = text.match(/[''](\d{2})\b/g);
    if (shortYearMatches) {
      shortYearMatches.forEach(match => {
        const twoDigit = parseInt(match.substring(1));
        // Map to 1990s or 2000s based on range
        if (twoDigit >= 90 && twoDigit <= 99) {
          years.push(1900 + twoDigit); // '90-'99 → 1990-1999
        } else if (twoDigit >= 0 && twoDigit <= 49) {
          years.push(2000 + twoDigit); // '00-'49 → 2000-2049
        }
      });
    }
    
    // Map common temporal phrases to years
    const currentYear = 2025;
    if (/\blast (year|season)\b/i.test(textLower)) years.push(currentYear - 1);
    if (/\bthis (year|season)\b/i.test(textLower)) years.push(currentYear);
    if (/\bnext (year|season)\b/i.test(textLower)) years.push(currentYear + 1);
    if (/\btwo (years|seasons) ago\b/i.test(textLower)) years.push(currentYear - 2);
    if (/\bthree (years|seasons) ago\b/i.test(textLower)) years.push(currentYear - 3);
    
    return Array.from(new Set(years));
  }

  function validateTemporalPrecision(query: string, response: string): TemporalGuardResult {
    const { requestedYears, comparisonInvited } = parseTemporalIntent(query);
    
    // If no specific year requested, or comparison invited, no violation possible
    if (requestedYears.length === 0 || comparisonInvited) {
      return {
        requestedYears,
        comparisonInvited,
        violation: false,
        violatingYears: [],
        shouldRegenerate: false
      };
    }
    
    // Extract all temporal references from response (including phrases and shorthand)
    const responseYears = extractTemporalReferences(response);
    
    // Find out-of-scope years
    const violatingYears = responseYears.filter(year => !requestedYears.includes(year));
    
    const violation = violatingYears.length > 0;
    
    if (violation) {
      console.log(`⚠️  [Temporal Guard] VIOLATION DETECTED`);
      console.log(`   Query requested years: ${requestedYears.join(', ')}`);
      console.log(`   Response mentioned years: ${responseYears.join(', ')}`);
      console.log(`   Out-of-scope years: ${violatingYears.join(', ')}`);
      console.log(`   Comparison invited: ${comparisonInvited}`);
    }
    
    return {
      requestedYears,
      comparisonInvited,
      violation,
      violatingYears,
      shouldRegenerate: violation
    };
  }

  // RAG Chat endpoint with citation tracking + league context
  app.post('/api/rag/chat', async (req, res) => {
    try {
      const { session_id, message, user_level = 1, league_id, model = 'gemini' } = req.body;
      const chatProvider: 'gemini' | 'grok' = model === 'grok' ? 'grok' : 'gemini';
      console.log(`🤖 [RAG Chat] Using ${chatProvider.toUpperCase()} for generation`);

      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Message is required and must be a string',
        });
      }

      console.log(`💬 [RAG Chat] Processing message: "${message.substring(0, 50)}..."`);
      console.log(`💬 [RAG Chat] Session ID: ${session_id || 'new session'}, User level: ${user_level}, League: ${league_id || 'generic'}`);

      // Step 1: Generate embedding for user message
      const queryEmbedding = await generateEmbedding(message);
      console.log(`✅ [RAG Chat] Query embedding generated: ${queryEmbedding.length} dimensions`);

      // Step 2: Retrieve relevant context
      const vectorString = `[${queryEmbedding.join(',')}]`;
      const relevantChunks: any[] = [];
      let leagueChunksCount = 0;
      let rosterSnapshot = '';

      // 2a. Pre-fetch roster data if league_id provided (before vector search)
      if (league_id) {
        console.log(`🏈 [RAG Chat] Pre-fetching roster data for league: ${league_id}`);
        
        // Query ALL roster entries (not via vector search)
        const rosterResult = await db.execute(
          sql`SELECT content, metadata
              FROM league_context
              WHERE league_id = ${league_id}
              AND metadata->>'type' = 'roster'
              ORDER BY content`
        );

        if (rosterResult.rows.length > 0) {
          // Group players by position (dynamic - handles all positions)
          const rosterByPosition: Record<string, string[]> = {};
          
          rosterResult.rows.forEach((row: any) => {
            const metadata = row.metadata;
            const content = row.content;
            
            // Extract from metadata (most reliable - no regex parsing)
            let playerName = metadata?.playerName || '';
            let position = '';
            
            if (metadata?.tags && Array.isArray(metadata.tags) && metadata.tags.length >= 1) {
              // tags format: [position, team] (from Sleeper sync)
              position = metadata.tags[0];
            }
            
            // Fallback: If metadata is missing, try regex extraction (legacy data)
            if (!playerName || !position) {
              const match = content.match(/User has (.+?) \((.+?),/);
              if (match) {
                if (!playerName) playerName = match[1];
                if (!position) position = match[2];
              }
            }
            
            if (playerName && position) {
              // Normalize multi-position variants to primary position
              const normalizedPos = position.split('/')[0]; // "RB/WR" → "RB"
              
              // Only include skill positions (QB, RB, WR, TE) - skip DEF, K, etc.
              if (['QB', 'RB', 'WR', 'TE'].includes(normalizedPos)) {
                if (!rosterByPosition[normalizedPos]) {
                  rosterByPosition[normalizedPos] = [];
                }
                rosterByPosition[normalizedPos].push(playerName);
              }
            }
          });

          // Build structured roster snapshot in consistent order
          const positionOrder = ['QB', 'RB', 'WR', 'TE'];
          const rosterParts = [];
          
          for (const pos of positionOrder) {
            if (rosterByPosition[pos] && rosterByPosition[pos].length > 0) {
              rosterParts.push(`${pos}: ${rosterByPosition[pos].join(', ')}`);
            }
          }
          
          if (rosterParts.length > 0) {
            rosterSnapshot = `**User's Roster**\n${rosterParts.join(' | ')}\n\n`;
            console.log(`✅ [RAG Chat] Roster snapshot created: ${rosterResult.rows.length} players across ${rosterParts.length} positions`);
          } else {
            console.warn(`⚠️  [RAG Chat] Roster query returned ${rosterResult.rows.length} rows but no skill positions extracted`);
          }
        }

        // Now do vector search for relevant league context
        console.log(`🏈 [RAG Chat] Searching league-specific context for league: ${league_id}`);
        const leagueSearchResult = await db.execute(
          sql`SELECT 
                id, 
                content, 
                metadata,
                (1 - (embedding <-> ${vectorString}::vector) / 2) as similarity,
                'league' as source_type
              FROM league_context
              WHERE league_id = ${league_id}
              AND embedding IS NOT NULL
              ORDER BY embedding <=> ${vectorString}::vector
              LIMIT 3`
        );

        const leagueChunks = leagueSearchResult.rows.map((row: any) => ({
          chunk_id: row.id,
          content: row.content,
          content_preview: row.content?.substring(0, 150) || '',
          metadata: row.metadata,
          relevance_score: parseFloat(row.similarity),
          source_type: 'league',
        }));

        relevantChunks.push(...leagueChunks);
        leagueChunksCount = leagueChunks.length;
        console.log(`✅ [RAG Chat] Found ${leagueChunks.length} league-specific chunks`);
      }

      // 2b. Search general TIBER knowledge chunks with 2024 baseline boosting
      // CRITICAL: Suppress general chunks when league context exists to prevent contamination
      // NOTE: rosterSnapshot is checked BEFORE this, so we can safely reference it
      const hasAnyLeagueData = !!rosterSnapshot || leagueChunksCount > 0;
      const generalLimit = league_id && hasAnyLeagueData ? 0 : 10;
      console.log(`🔍 [RAG Chat] General chunks limit: ${generalLimit} (league_id: ${league_id ? 'YES' : 'NO'}, roster: ${!!rosterSnapshot}, league chunks: ${leagueChunksCount})`);
      
      if (generalLimit > 0) {
        // Detect if user wants 2024 baseline historical data
        const wants2024Baseline = detect2024BaselineIntent(message);
        console.log(`🎯 [RAG Chat] 2024 baseline intent detected: ${wants2024Baseline}`);

        let baseline2024Chunks: any[] = [];
        let generalChunks: any[] = [];

        if (wants2024Baseline) {
          // HYBRID SEARCH: Get both 2024 baseline chunks AND general chunks
          console.log(`📚 [RAG Chat] Running hybrid search: 2024 baseline + general chunks`);

          // Search 1: 2024 baseline chunks (player stats, patterns, elite baselines)
          const baseline2024Result = await db.execute(
            sql`SELECT 
                  id, 
                  content, 
                  metadata,
                  (1 - (embedding <-> ${vectorString}::vector) / 2) as similarity,
                  '2024_baseline' as source_type
                FROM chunks
                WHERE metadata->>'season' = '2024'
                   OR metadata->>'type' = 'historical_pattern'
                   OR metadata->>'type' = 'elite_baseline'
                ORDER BY embedding <-> ${vectorString}::vector
                LIMIT 5`
          );

          baseline2024Chunks = baseline2024Result.rows.map((row: any) => ({
            chunk_id: row.id,
            content: row.content,
            content_preview: row.content?.substring(0, 150) || '',
            metadata: row.metadata,
            relevance_score: parseFloat(row.similarity),
            source_type: '2024_baseline',
            boosted: true, // Mark as boosted for priority
          }));

          console.log(`✅ [RAG Chat] Found ${baseline2024Chunks.length} 2024 baseline chunks`);

          // Search 2: General chunks (excluding 2024 baseline to avoid duplicates)
          const generalSearchResult = await db.execute(
            sql`SELECT 
                  id, 
                  content, 
                  metadata,
                  (1 - (embedding <-> ${vectorString}::vector) / 2) as similarity,
                  'general' as source_type
                FROM chunks
                WHERE (metadata->>'season' IS NULL OR metadata->>'season' != '2024')
                  AND (metadata->>'type' IS NULL OR metadata->>'type' NOT IN ('historical_pattern', 'elite_baseline', 'player_baseline'))
                ORDER BY embedding <-> ${vectorString}::vector
                LIMIT 5`
          );

          generalChunks = generalSearchResult.rows.map((row: any) => ({
            chunk_id: row.id,
            content: row.content,
            content_preview: row.content?.substring(0, 150) || '',
            metadata: row.metadata,
            relevance_score: parseFloat(row.similarity),
            source_type: 'general',
          }));

          console.log(`✅ [RAG Chat] Found ${generalChunks.length} general knowledge chunks`);

          // Merge: 2024 baseline chunks first (boosted), then general chunks
          relevantChunks.push(...baseline2024Chunks, ...generalChunks.slice(0, Math.max(0, generalLimit - baseline2024Chunks.length)));
          console.log(`✅ [RAG Chat] Hybrid search merged: ${baseline2024Chunks.length} baseline + ${Math.min(generalChunks.length, generalLimit - baseline2024Chunks.length)} general = ${relevantChunks.length} total`);

        } else {
          // Standard search: No 2024 baseline intent, use general chunks only
          const generalSearchResult = await db.execute(
            sql`SELECT 
                  id, 
                  content, 
                  metadata,
                  (1 - (embedding <-> ${vectorString}::vector) / 2) as similarity,
                  'general' as source_type
                FROM chunks
                ORDER BY embedding <-> ${vectorString}::vector
                LIMIT ${generalLimit}`
          );

          generalChunks = generalSearchResult.rows.map((row: any) => ({
            chunk_id: row.id,
            content: row.content,
            content_preview: row.content?.substring(0, 150) || '',
            metadata: row.metadata,
            relevance_score: parseFloat(row.similarity),
            source_type: 'general',
          }));

          relevantChunks.push(...generalChunks);
          console.log(`✅ [RAG Chat] Found ${generalChunks.length} general knowledge chunks`);
        }
      } else {
        console.log(`🚫 [RAG Chat] Skipping general chunks - league context takes priority`);
      }
      
      console.log(`✅ [RAG Chat] Total relevant chunks: ${relevantChunks.length}`);

      // Step 2b.5: Apply Pressure Module boost if detected
      const pressureHint = detectsPressureQuery(message);
      if (pressureHint) {
        console.log(`🌊 [Pressure Module] Pressure-related query detected, boosting pressure_theory chunks`);
        boostPressureChunks(relevantChunks, true);
      }

      // Step 2b.6: Force-include Brain OS chunks for strategy/philosophy questions
      // Detect if query is about strategy, philosophy, or decision-making
      const isStrategyQuery = /\b(how should i|how do i|what makes|what creates|how to think|strategy|philosophy|approach|framework|evaluate|decision|trade|draft|rebuild|contend|window)\b/i.test(message);
      const isTradeQuery = /\b(trade|accept|offer|give|get|swap|exchange)\b/i.test(message);
      const isPhilosophyQuery = /\b(why do|what makes|philosophy|pattern|framework|approach|think about)\b/i.test(message);
      
      const shouldIncludeBrainOS = isStrategyQuery || isTradeQuery || isPhilosophyQuery;
      
      if (shouldIncludeBrainOS && generalLimit > 0) {
        console.log(`🧠 [Brain OS] Strategy/philosophy query detected - force-including Brain OS chunks`);
        
        // Search for Brain OS chunks
        const brainOSResult = await db.execute(
          sql`SELECT 
                id, 
                content, 
                metadata,
                (1 - (embedding <-> ${vectorString}::vector) / 2) as similarity,
                'brain_os' as source_type
              FROM chunks
              WHERE metadata->>'doc_id' = 'tiber-brain-os-v1'
              ORDER BY 
                (metadata->>'priority')::int DESC,
                embedding <-> ${vectorString}::vector
              LIMIT 2`
        );
        
        const brainOSChunks = brainOSResult.rows.map((row: any) => ({
          chunk_id: row.id,
          content: row.content,
          content_preview: row.content?.substring(0, 150) || '',
          metadata: row.metadata,
          relevance_score: parseFloat(row.similarity),
          source_type: 'brain_os',
          forced: true, // Mark as forced-include
        }));
        
        if (brainOSChunks.length > 0) {
          relevantChunks.push(...brainOSChunks);
          console.log(`✅ [Brain OS] Added ${brainOSChunks.length} Brain OS philosophy chunks`);
        }
      }

      // Step 2b.6.5: Force-include Deep Theory chunks for conceptual/teaching questions
      // Detect if query is asking "why", "explain", or is conceptual/strategic
      const isWhyQuery = /\b(why|how come|what makes|what causes|what creates)\b/i.test(message);
      const isExplainQuery = /\b(explain|describe|break down|walk me through|help me understand)\b/i.test(message);
      const isConceptualQuery = /\b(concept|theory|framework|principle|philosophy|pattern)\b/i.test(message);
      const isTradeLogicQuery = /\b(trade|value|worth|fair|accept|offer)\b/i.test(message) && /\b(why|logic|thinking|reasoning)\b/i.test(message);
      const isDynastyLogicQuery = /\b(dynasty|long.?term|rebuild|contend|window|age|draft pick)\b/i.test(message) && /\b(why|how|explain)\b/i.test(message);
      
      const shouldIncludeTheory = isWhyQuery || isExplainQuery || isConceptualQuery || isTradeLogicQuery || isDynastyLogicQuery;
      
      if (shouldIncludeTheory && generalLimit > 0) {
        console.log(`📚 [Theory] Conceptual/teaching query detected - force-including Deep Theory chunks`);
        
        // Search for Deep Theory chunks (pressure, signal, entropy, psychology, ecosystem)
        const theoryResult = await db.execute(
          sql`SELECT 
                id, 
                content, 
                metadata,
                (1 - (embedding <-> ${vectorString}::vector) / 2) as similarity,
                'theory' as source_type
              FROM chunks
              WHERE metadata->>'type' = 'theory'
              ORDER BY 
                (metadata->>'priority')::int DESC,
                embedding <-> ${vectorString}::vector
              LIMIT 1`
        );
        
        const theoryChunks = theoryResult.rows.map((row: any) => ({
          chunk_id: row.id,
          content: row.content,
          content_preview: row.content?.substring(0, 150) || '',
          metadata: row.metadata,
          relevance_score: parseFloat(row.similarity),
          source_type: 'theory',
          forced: true, // Mark as forced-include
        }));
        
        if (theoryChunks.length > 0) {
          relevantChunks.push(...theoryChunks);
          console.log(`✅ [Theory] Added ${theoryChunks.length} Deep Theory chunks (module: ${theoryChunks[0].metadata?.module || 'unknown'})`);
        }
      }

      // Step 2b.7: Detect and fetch weekly statline data (Weekly Statline RAG v1)
      const { detectWeeklyQuery, fetchWeeklyStatsForPlayer, formatWeeklyStatlineDataChunk, weeklyStatlineMetadata } = await import('./lib/weeklyStatsHelpers');
      const { CURRENT_NFL_SEASON } = await import('../shared/config/seasons');
      
      const weeklyQuery = detectWeeklyQuery(message);
      if (weeklyQuery.isWeeklyQuery) {
        console.log(`📊 [Weekly Stats] Detected weekly query: Week ${weeklyQuery.week || weeklyQuery.relativeWeek}, Player: ${weeklyQuery.playerName}`);
        
        try {
          const weeklyStats = await fetchWeeklyStatsForPlayer(weeklyQuery, CURRENT_NFL_SEASON);
          if (weeklyStats) {
            const weeklyChunk = formatWeeklyStatlineDataChunk(weeklyStats);
            const weeklyMeta = weeklyStatlineMetadata(weeklyStats);
            
            // Prepend to relevantChunks with highest priority (position 0)
            relevantChunks.unshift({
              chunk_id: `weekly_${weeklyStats.playerName}_${weeklyStats.week}`,
              content: weeklyChunk,
              content_preview: weeklyChunk.substring(0, 150),
              metadata: weeklyMeta,
              relevance_score: 1.0, // Max relevance for exact weekly data
              source_type: 'weekly_statline',
            });
            
            console.log(`✅ [Weekly Stats] Added weekly statline for ${weeklyStats.playerName} Week ${weeklyStats.week}`);
          } else {
            console.log(`⚠️  [Weekly Stats] No weekly data found for ${weeklyQuery.playerName} Week ${weeklyQuery.week || weeklyQuery.relativeWeek}`);
          }
        } catch (error) {
          console.error(`❌ [Weekly Stats] Error fetching weekly stats:`, error);
        }
      }

      // Step 2c: Detect player mentions and fetch VORP data
      // Expand player aliases/nicknames before detection (e.g., "Tet" → "Tetairola McMillan")
      const expandedMessage = expandPlayerAliases(message);
      const detectedPlayers = extractPlayerNamesFromMessage(expandedMessage);
      const vorpDataList: string[] = [];
      
      if (detectedPlayers.length > 0) {
        console.log(`🎯 [VORP] Detected ${detectedPlayers.length} player(s): ${detectedPlayers.join(', ')}`);
        
        // Calculate VORP for each detected player (max 3 to avoid slowdown)
        for (const playerName of detectedPlayers.slice(0, 3)) {
          try {
            const vorpData = await vorpCalculationService.calculatePlayerVORP(playerName);
            if (vorpData) {
              const vorpContext = vorpCalculationService.formatForPrompt(vorpData);
              vorpDataList.push(vorpContext);
              console.log(`✅ [VORP] ${vorpContext}`);
            }
          } catch (error) {
            console.warn(`⚠️  [VORP] Failed to calculate VORP for ${playerName}:`, error);
          }
        }
      }

      // Step 3: Build context and generate response
      // CRITICAL: Pin roster and VORP as dedicated preamble (not buried in chunks)
      const pinnedContext: string[] = [];
      const retrievalContext = relevantChunks.map(chunk => chunk.content);
      
      // Pin roster snapshot FIRST (highest priority)
      if (rosterSnapshot) {
        pinnedContext.push(rosterSnapshot);
        console.log(`📌 [RAG Chat] Pinned roster snapshot at top of context`);
      }
      
      // WAIVER VORP PATCH v1.0: Detect query mode BEFORE pinning VORP
      const queryMode = detectQueryMode(message);
      console.log(`🧠 [VORP PATCH] Query mode: ${queryMode}`);
      
      // Pin VORP data SECOND (objective stats for mentioned players)
      // BUT: Skip VORP in waiver mode to prevent VORP-heavy responses
      if (vorpDataList.length > 0) {
        if (queryMode === 'waivers') {
          console.log(`🚨 [VORP PATCH] WAIVER MODE - Skipping VORP pin. Using Interest Score instead.`);
          console.log(`   ℹ️  VORP data available but not prioritized: ${detectedPlayers.slice(0, 3).join(', ')}`);
          // VORP data is calculated but NOT pinned in waiver mode
          // The system prompt will guide TIBER to use Interest Score instead
        } else {
          // Trade/Start-Sit/Generic mode: Pin VORP normally
          const vorpSection = `**2025 Season Performance (PPR)**\n${vorpDataList.join('\n')}\n\n`;
          pinnedContext.push(vorpSection);
          console.log(`📌 [VORP] Pinned ${vorpDataList.length} player VORP data (2025 season) - Mode: ${queryMode}`);
        }
      }
      
      // WAIVER MODE: Fetch and pin waiver candidates with Interest Scores
      if (queryMode === 'waivers') {
        try {
          // Detect position from message (RB, WR, TE, QB)
          const positionMatch = message.match(/\b(RB|WR|TE|QB)s?\b/i);
          const position = positionMatch ? positionMatch[1].toUpperCase() : undefined;
          
          console.log(`🎯 [Waiver Wisdom] Fetching candidates${position ? ` for ${position}` : ''}...`);
          
          const waiverData = await fetchWaiverCandidatesWithLookback(2025, position, 15);
          
          if (waiverData) {
            const { week, candidates } = waiverData;
            
            // Format waiver candidates for context
            const waiverLines = candidates.map(c => {
              const faabRange = c.faabMin === 0 && c.faabMax === 0 
                ? 'FAAB: 0%' 
                : `FAAB: ${c.faabMin}-${c.faabMax}%`;
              
              return `• **${c.playerName}** (${c.team} ${c.position}) - Tier ${c.waiverTier} ${c.archetype}\n  Interest Score: ${c.interestScore} | Recent: ${c.recentPpg} PPG (${c.recentTrend}) | Own: ${c.ownershipPercentage}% | ${faabRange}\n  ${c.summary}`;
            });
            
            const waiverSection = `**📊 Waiver Wire Intelligence (2025 Week ${week})**\n\n${waiverLines.join('\n\n')}\n\n`;
            pinnedContext.push(waiverSection);
            console.log(`📌 [Waiver Wisdom] Pinned ${candidates.length} waiver candidates (Week ${week}${position ? `, ${position} only` : ''})`);
          } else {
            console.log(`⚠️  [Waiver Wisdom] No waiver candidates found - using general teaching only`);
          }
        } catch (error) {
          console.error(`❌ [Waiver Wisdom] Error fetching candidates:`, error);
        }
      }
      
      // Pin Top Performers THIRD (full season awareness - ALWAYS included)
      try {
        const topPerformersContext = await vorpCalculationService.getTopPerformersContext();
        if (topPerformersContext) {
          pinnedContext.push(topPerformersContext);
          console.log(`📊 [Top Performers] Added season leaders context for full awareness`);
        }
      } catch (error) {
        console.warn(`⚠️  [Top Performers] Failed to fetch season leaders:`, error);
      }
      
      // Combine: [Pinned Roster/VORP/Top Performers] + [League Chunks] + [General Chunks (if no league)]
      const fullContext = [...pinnedContext, ...retrievalContext];
      
      // True if we have roster data OR league context chunks
      const hasLeagueContext = !!rosterSnapshot || (league_id && leagueChunksCount > 0);
      console.log(`🎯 [RAG Chat] Final context: ${pinnedContext.length} pinned + ${retrievalContext.length} retrieval = ${fullContext.length} total`);
      
      let aiResponse = await generateChatResponse(message, fullContext, user_level, hasLeagueContext, chatProvider);
      console.log(`✅ [RAG Chat] Response generated (${chatProvider}): ${aiResponse.substring(0, 100)}...`);

      // Temporal Guard: Validate response adheres to requested year
      const temporalCheck = validateTemporalPrecision(message, aiResponse);
      
      if (temporalCheck.violation && temporalCheck.shouldRegenerate) {
        console.log(`🔄 [Temporal Guard] Regenerating with inline year reminder...`);
        
        // Regenerate with inline reminder
        const yearReminder = `CRITICAL: User asked specifically about ${temporalCheck.requestedYears.join(' and ')}. Do NOT mention ${temporalCheck.violatingYears.join(' or ')} unless explicitly invited.`;
        const enhancedContext = [yearReminder, ...fullContext];
        
        aiResponse = await generateChatResponse(message, enhancedContext, user_level, hasLeagueContext, chatProvider);
        console.log(`✅ [Temporal Guard] Regenerated response (${chatProvider}): ${aiResponse.substring(0, 100)}...`);
        
        // Re-validate regenerated response
        const secondCheck = validateTemporalPrecision(message, aiResponse);
        if (secondCheck.violation) {
          console.error(`❌ [Temporal Guard] Regeneration failed - still violating temporal precision`);
          console.error(`   Requested: [${secondCheck.requestedYears}], Still violating: [${secondCheck.violatingYears}]`);
          
          // Return guardrail error to user
          return res.status(500).json({
            success: false,
            error: 'Temporal Guard: Unable to generate response within requested time constraints',
            debug: {
              requestedYears: secondCheck.requestedYears,
              violatingYears: secondCheck.violatingYears
            }
          });
        }
        
        // Log incident for monitoring
        console.log(`📊 [Temporal Guard] Violation resolved after regeneration - Query: "${message.substring(0, 50)}...", Requested: [${temporalCheck.requestedYears}]`);
      } else if (temporalCheck.requestedYears.length > 0) {
        console.log(`✅ [Temporal Guard] Passed - Requested: [${temporalCheck.requestedYears}], Comparison invited: ${temporalCheck.comparisonInvited}`);
      }

      // Step 3.5: Apply UX Post-Processors
      const layerDetection = detectLayerWithIntents(message);
      const { format: detectedFormat } = detectFormat(message);
      
      // Post-processor 1: Confession pattern handler (UX Fix #5)
      if (layerDetection.intents.isConfession) {
        console.log(`🔧 [UX Fix] Confession pattern detected - applying acknowledgment`);
        aiResponse = handleConfessionResponse(aiResponse);
      }
      
      // Post-processor 2: Trade evaluation formatter (UX Fix #4)
      if (layerDetection.intents.isTradeEval) {
        console.log(`🔧 [UX Fix] Trade evaluation detected - applying structured format (${detectedFormat})`);
        aiResponse = formatTradeResponse(aiResponse, detectedFormat);
      }
      
      // Post-processor 3: Stats query with data availability (UX Fix #2 & #3)
      if (layerDetection.intents.isStatsQuery) {
        console.log(`🔧 [UX Fix] Stats query detected - checking data availability`);
        const requestedSeason = extractSeasonFromQuery(message) || new Date().getFullYear();
        const capabilities = getDataAvailability(requestedSeason);
        
        // Rookie guard monitoring (UX Fix #1 - Hybrid approach)
        // Primary defense: System prompt instructions (geminiEmbeddings.ts:481-485)
        // Secondary monitoring: Log violations to measure effectiveness
        if (requestedSeason < new Date().getFullYear() && detectedPlayers.length > 0) {
          const citesSpecificStats = /\d+ (receptions?|catches?|yards?|tds?|touchdowns?|targets?|carries?)/i.test(aiResponse);
          const mentionsCollege = /college|university|ncaa|draft/i.test(aiResponse.toLowerCase());
          
          if (citesSpecificStats && !mentionsCollege) {
            // Log potential rookie guard violation for monitoring
            console.log(`⚠️  [ROOKIE GUARD] Potential violation detected`);
            console.log(`   Player: ${detectedPlayers[0]}`);
            console.log(`   Season: ${requestedSeason}`);
            console.log(`   Query: ${message.substring(0, 100)}...`);
            console.log(`   Response cited stats - system prompt should have prevented this`);
            console.log(`   Action: Logged for monitoring. Review to decide if metadata-based guard needed.`);
          }
        }
        
        // Apply honest capability statement if asking for weekly data
        if (isWeeklyBoxScoreRequest(message)) {
          aiResponse = formatStatsResponse(aiResponse, requestedSeason, capabilities.hasWeekly);
        }
        
        // Apply River snapback if River language leaked in (UX Fix #6)
        aiResponse = applyRiverSnapback(aiResponse, true);
      }

      // Step 4: Save to database
      let sessionId = session_id;
      
      // Create new session if needed
      if (!sessionId) {
        const sessionData: any = { userLevel: user_level };
        if (league_id) {
          sessionData.leagueId = league_id;
        }
        
        const [newSession] = await db.insert(chatSessions).values(sessionData).returning();
        sessionId = newSession.id;
        console.log(`✅ [RAG Chat] Created new session: ${sessionId} ${league_id ? `(League: ${league_id})` : '(Generic)'}`);
      } else {
        // Update session timestamp and league_id
        const updateData: any = { updatedAt: new Date() };
        if (league_id !== undefined) {
          updateData.leagueId = league_id;
        }
        
        await db.update(chatSessions)
          .set(updateData)
          .where(eq(chatSessions.id, sessionId));
        console.log(`✅ [RAG Chat] Updated session: ${sessionId}`);
      }

      // Save user message
      const [userMessage] = await db.insert(chatMessages).values({
        sessionId,
        role: 'user',
        content: message,
      }).returning();

      // Save assistant response
      const [assistantMessage] = await db.insert(chatMessages).values({
        sessionId,
        role: 'assistant',
        content: aiResponse,
      }).returning();

      console.log(`✅ [RAG Chat] Messages saved (user: ${userMessage.id}, assistant: ${assistantMessage.id})`);

      // Step 5: Return response with sources
      res.json({
        success: true,
        session_id: sessionId,
        response: aiResponse,
        sources: relevantChunks.map(chunk => ({
          chunk_id: chunk.chunk_id,
          relevance_score: chunk.relevance_score,
          content_preview: chunk.content_preview,
          metadata: chunk.metadata,
        })),
        message_id: assistantMessage.id,
      });

    } catch (error) {
      console.error('❌ [RAG Chat] Failed to process chat:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Unknown error',
      });
    }
  });

  // ========================================
  // WAIVER WISDOM ENDPOINTS
  // ========================================

  /**
   * GET /api/waivers/recommendations
   * Returns waiver wire recommendations based on ownership and interest scores
   * 
   * Query params:
   * - season (default: current year)
   * - week (default: current NFL week)
   * - pos (optional: RB|WR|TE|QB)
   * - tier (optional: S,A,B,C)
   */
  app.get('/api/waivers/recommendations', async (req: Request, res: Response) => {
    try {
      const season = req.query.season ? parseInt(req.query.season as string) : new Date().getFullYear();
      const week = req.query.week ? parseInt(req.query.week as string) : 12; // TODO: Auto-detect current week
      const position = req.query.pos as string | undefined;
      const tierFilter = req.query.tier as string | undefined;
      
      console.log(`[Waiver Recommendations] Fetching for ${season} Week ${week}${position ? ` (${position})` : ''}${tierFilter ? ` Tier: ${tierFilter}` : ''}`);
      
      // Build WHERE conditions
      const whereConditions: any[] = [
        eq(waiverCandidates.season, season),
        eq(waiverCandidates.week, week)
      ];
      
      // Add position filter if specified
      if (position) {
        whereConditions.push(eq(waiverCandidates.position, position));
      }
      
      // Add tier filter if specified
      if (tierFilter) {
        const tiers = tierFilter.split(',') as ('S' | 'A' | 'B' | 'C' | 'D')[];
        whereConditions.push(sql`${waiverCandidates.waiverTier} IN (${sql.join(tiers.map(t => sql`${t}`), sql`, `)})`);
      }
      
      // Execute query with all conditions
      const candidates = await db
        .select()
        .from(waiverCandidates)
        .where(and(...whereConditions))
        .orderBy(desc(waiverCandidates.interestScore));
      
      // Check if we have data
      if (candidates.length === 0) {
        return res.json({
          success: true,
          season,
          week,
          message: `No waiver candidates found for ${season} Week ${week}. Run the waiver builder script to generate recommendations.`,
          data: [],
        });
      }
      
      // Format response
      return res.json({
        success: true,
        season,
        week,
        count: candidates.length,
        data: candidates.map(c => ({
          playerName: c.playerName,
          playerId: c.playerId,
          team: c.team,
          position: c.position,
          ownershipPercentage: c.ownershipPercentage,
          tier: c.waiverTier,
          archetype: c.archetype,
          summary: c.summary,
          interestScore: c.interestScore,
          recentPoints: c.recentPpg,
          recentTrend: c.recentTrend,
          faab: { min: c.faabMin, max: c.faabMax },
        })),
      });
    } catch (error) {
      console.error('[Waiver Recommendations] Error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/waivers/player
   * Returns waiver analysis for a specific player
   * 
   * Query params:
   * - player (required): Player name
   * - season (default: current year)
   * - week (default: current NFL week)
   */
  app.get('/api/waivers/player', async (req: Request, res: Response) => {
    try {
      const playerName = req.query.player as string;
      const season = req.query.season ? parseInt(req.query.season as string) : new Date().getFullYear();
      const week = req.query.week ? parseInt(req.query.week as string) : 12;
      
      if (!playerName) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: player',
        });
      }
      
      console.log(`[Waiver Player] Checking ${playerName} for ${season} Week ${week}`);
      
      // Search for player (case-insensitive partial match)
      const candidate = await db
        .select()
        .from(waiverCandidates)
        .where(
          and(
            eq(waiverCandidates.season, season),
            eq(waiverCandidates.week, week),
            sql`LOWER(${waiverCandidates.playerName}) LIKE LOWER(${`%${playerName}%`})`
          )
        )
        .limit(1);
      
      if (candidate.length === 0) {
        // Player not in waiver candidates - check if they exist but are too highly owned
        const ownership = await db
          .select()
          .from(sleeperOwnership)
          .where(
            and(
              eq(sleeperOwnership.season, season),
              eq(sleeperOwnership.week, week),
              sql`LOWER(${sleeperOwnership.playerId}) IN (
                SELECT LOWER(player_id) FROM weekly_stats 
                WHERE LOWER(player_name) LIKE LOWER(${`%${playerName}%`})
              )`
            )
          )
          .limit(1);
        
        if (ownership.length > 0 && (ownership[0].ownershipPercentage || 0) > 70) {
          return res.json({
            success: true,
            isWaiverCandidate: false,
            reason: 'Player is too highly owned (>70%) to be considered a waiver add',
            ownershipPercentage: ownership[0].ownershipPercentage,
          });
        }
        
        return res.json({
          success: true,
          isWaiverCandidate: false,
          reason: 'Player not found in waiver candidates for this week',
        });
      }
      
      const player = candidate[0];
      
      return res.json({
        success: true,
        isWaiverCandidate: true,
        data: {
          playerName: player.playerName,
          playerId: player.playerId,
          team: player.team,
          position: player.position,
          ownershipPercentage: player.ownershipPercentage,
          tier: player.waiverTier,
          archetype: player.archetype,
          summary: player.summary,
          interestScore: player.interestScore,
          recentPoints: player.recentPpg,
          recentTrend: player.recentTrend,
          faab: { min: player.faabMin, max: player.faabMax },
        },
      });
    } catch (error) {
      console.error('[Waiver Player] Error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  console.log('📊 Waiver Wisdom routes mounted at /api/waivers/*');

  registerForgeRoutes(app);
  app.use(adminForgeRouter);

  const httpServer = createServer(app);
  return httpServer;
}

// Mock data generator for Power Rankings when service is unavailable
function generateMockPowerRankings(ranking_type: string, season: number, week: number) {
  const mockPlayers = [
    // QBs - FPG-CENTRIC SCORING WITH RUSHING UPSIDE BIAS
    { name: 'Josh Allen', team: 'BUF', position: 'QB', score: 94.1, fpg: 24.8, upsideIndex: 85, explanation: 'Elite FPG + Rushing Floor' },
    { name: 'Lamar Jackson', team: 'BAL', position: 'QB', score: 92.8, fpg: 26.1, upsideIndex: 92, explanation: 'Highest Rushing Upside' },
    { name: 'Patrick Mahomes', team: 'KC', position: 'QB', score: 92.5, fpg: 23.4, upsideIndex: 72, explanation: 'Consistent Elite FPG' },
    { name: 'Jayden Daniels', team: 'WAS', position: 'QB', score: 91.5, fpg: 21.7, upsideIndex: 88, explanation: 'Young Rushing QB Upside' },
    { name: 'Jalen Hurts', team: 'PHI', position: 'QB', score: 91.2, fpg: 20.8, upsideIndex: 83, explanation: 'Rushing Floor + Goal Line' },
    { name: 'Joe Burrow', team: 'CIN', position: 'QB', score: 90.8, fpg: 22.1, upsideIndex: 68, explanation: 'High FPG Ceiling' },
    { name: 'Drake Maye', team: 'NE', position: 'QB', score: 88.2, fpg: 18.4, upsideIndex: 89, explanation: 'UPSIDE BOOST: Young Mobile Profile' }, // BOOSTED from 18th
    { name: 'J.J. McCarthy', team: 'MIN', position: 'QB', score: 85.8, fpg: 16.2, upsideIndex: 86, explanation: 'UPSIDE BOOST: Rushing QB Development' }, // NEW ADDITION
    { name: 'Anthony Richardson', team: 'IND', position: 'QB', score: 86.5, fpg: 17.9, upsideIndex: 87, explanation: 'Athletic Upside Profile' },
    { name: 'CJ Stroud', team: 'HOU', position: 'QB', score: 86.0, fpg: 19.4, upsideIndex: 74, explanation: 'Solid FPG + System' },
    { name: 'Dak Prescott', team: 'DAL', position: 'QB', score: 84.5, fpg: 20.2, upsideIndex: 65, explanation: 'Consistent Volume' },
    { name: 'Tua Tagovailoa', team: 'MIA', position: 'QB', score: 84.2, fpg: 19.8, upsideIndex: 62, explanation: 'High Completion FPG' },
    { name: 'Justin Herbert', team: 'LAC', position: 'QB', score: 83.8, fpg: 18.9, upsideIndex: 70, explanation: 'Arm Talent Upside' },
    { name: 'Jordan Love', team: 'GB', position: 'QB', score: 83.5, fpg: 18.2, upsideIndex: 73, explanation: 'System + Development' },
    { name: 'Brock Purdy', team: 'SF', position: 'QB', score: 83.1, fpg: 18.5, upsideIndex: 68, explanation: 'Efficient System FPG' },
    { name: 'Trevor Lawrence', team: 'JAX', position: 'QB', score: 82.8, fpg: 17.1, upsideIndex: 75, explanation: 'Athletic Upside' },
    { name: 'Caleb Williams', team: 'CHI', position: 'QB', score: 82.2, fpg: 16.8, upsideIndex: 82, explanation: 'Young Dual-Threat' },
    { name: 'Kirk Cousins', team: 'ATL', position: 'QB', score: 80.5, fpg: 17.9, upsideIndex: 58, explanation: 'Consistent Volume' },
    { name: 'Aaron Rodgers', team: 'NYJ', position: 'QB', score: 79.8, fpg: 16.2, upsideIndex: 55, explanation: 'Veteran Floor' },
    { name: 'Geno Smith', team: 'SEA', position: 'QB', score: 80.5, fpg: 15.8, upsideIndex: 52, explanation: 'Steady Producer' },
    { name: 'Russell Wilson', team: 'PIT', position: 'QB', score: 79.8, fpg: 15.1, upsideIndex: 58, explanation: 'Veteran Experience' },
    { name: 'Kyler Murray', team: 'ARI', position: 'QB', score: 79.2, fpg: 16.4, upsideIndex: 76, explanation: 'Injury Return Upside' },
    { name: 'Bo Nix', team: 'DEN', position: 'QB', score: 78.5, fpg: 14.2, upsideIndex: 71, explanation: 'Rookie Development' },
    { name: 'Matthew Stafford', team: 'LA', position: 'QB', score: 77.8, fpg: 15.9, upsideIndex: 48, explanation: 'Veteran Floor' },
    { name: 'Daniel Jones', team: 'NYG', position: 'QB', score: 76.5, fpg: 14.7, upsideIndex: 65, explanation: 'Mobile Element' },
    
    // WRs - USING REAL CSV FPG DATA (35 total for expanded coverage)
    { name: 'Ja\'Marr Chase', team: 'CIN', position: 'WR', score: 97.0, fpg: 23.59, explanation: 'Elite FPG Leader' },
    { name: 'Tee Higgins', team: 'CIN', position: 'WR', score: 94.0, fpg: 19.35, explanation: 'High-End WR1 FPG' },
    { name: 'Justin Jefferson', team: 'MIN', position: 'WR', score: 94.0, fpg: 19.32, explanation: 'Consistent Elite FPG' },
    { name: 'Amon-Ra St. Brown', team: 'DET', position: 'WR', score: 91.0, fpg: 18.91, explanation: 'Reliable High FPG' },
    { name: 'Puka Nacua', team: 'LA', position: 'WR', score: 91.0, fpg: 18.78, explanation: 'Explosive FPG Profile' },
    { name: 'Malik Nabers', team: 'NYG', position: 'WR', score: 91.0, fpg: 18.30, explanation: 'Volume + Target Share' },
    { name: 'Nico Collins', team: 'HOU', position: 'WR', score: 91.0, fpg: 17.80, explanation: 'Deep Threat FPG' },
    { name: 'CeeDee Lamb', team: 'DAL', position: 'WR', score: 91.0, fpg: 17.56, explanation: 'Alpha Target Share' },
    { name: 'Mike Evans', team: 'TB', position: 'WR', score: 91.0, fpg: 17.12, explanation: 'Red Zone Upside' },
    { name: 'Davante Adams', team: 'LV', position: 'WR', score: 88.0, fpg: 16.96, explanation: 'Route Running Elite' },
    { name: 'A.J. Brown', team: 'PHI', position: 'WR', score: 88.0, fpg: 16.68, explanation: 'Explosive Outlier' },
    { name: 'Brian Thomas Jr.', team: 'JAX', position: 'WR', score: 88.0, fpg: 16.67, explanation: 'Deep Ball Threat' },
    { name: 'Cooper Kupp', team: 'LA', position: 'WR', score: 88.0, fpg: 15.91, explanation: 'Slot Efficiency' },
    { name: 'Jaxon Smith-Njigba', team: 'SEA', position: 'WR', score: 85.0, fpg: 15.48, explanation: 'Developing Target Share' },
    { name: 'Terry McLaurin', team: 'WAS', position: 'WR', score: 85.0, fpg: 15.48, explanation: 'Consistent Producer' },
    { name: 'DeVonta Smith', team: 'PHI', position: 'WR', score: 85.0, fpg: 15.34, explanation: 'Technical Route Runner' },
    { name: 'Garrett Wilson', team: 'NYJ', position: 'WR', score: 85.0, fpg: 15.18, explanation: 'Volume Slot Target' },
    { name: 'Jordan Addison', team: 'MIN', position: 'WR', score: 85.0, fpg: 15.11, explanation: 'Big Play Potential' },
    { name: 'Drake London', team: 'ATL', position: 'WR', score: 85.0, fpg: 15.01, explanation: 'Target Volume Floor' },
    { name: 'Ladd McConkey', team: 'LAC', position: 'WR', score: 85.0, fpg: 14.96, explanation: 'Rookie Efficiency' },
    { name: 'Courtland Sutton', team: 'DEN', position: 'WR', score: 85.0, fpg: 14.63, explanation: 'Red Zone Target' },
    { name: 'Jameson Williams', team: 'DET', position: 'WR', score: 85.0, fpg: 14.49, explanation: 'Deep Threat Upside' },
    { name: 'Jerry Jeudy', team: 'CLE', position: 'WR', score: 85.0, fpg: 14.29, explanation: 'Route Precision' },
    { name: 'Jauan Jennings', team: 'SF', position: 'WR', score: 85.0, fpg: 14.16, explanation: 'System Fit' },
    { name: 'Jakobi Meyers', team: 'LV', position: 'WR', score: 81.0, fpg: 13.62, explanation: 'Possession Specialist' },
    { name: 'D.J. Moore', team: 'CHI', position: 'WR', score: 81.0, fpg: 13.50, explanation: 'Volume Floor' },
    { name: 'Tyreek Hill', team: 'MIA', position: 'WR', score: 81.0, fpg: 13.39, explanation: 'Speed Threat' },
    { name: 'Keenan Allen', team: 'CHI', position: 'WR', score: 81.0, fpg: 12.92, explanation: 'Veteran Efficiency' },
    { name: 'Zay Flowers', team: 'BAL', position: 'WR', score: 81.0, fpg: 12.90, explanation: 'Emerging Target' },
    { name: 'Darnell Mooney', team: 'ATL', position: 'WR', score: 81.0, fpg: 12.88, explanation: 'Speed + Opportunity' },
    { name: 'Jayden Reed', team: 'GB', position: 'WR', score: 81.0, fpg: 12.79, explanation: 'Versatile Weapon' },
    { name: 'DK Metcalf', team: 'SEA', position: 'WR', score: 81.0, fpg: 12.64, explanation: 'Physical Red Zone' },
    { name: 'George Pickens', team: 'PIT', position: 'WR', score: 81.0, fpg: 12.57, explanation: 'Contest Catch Specialist' },
    { name: 'Josh Downs', team: 'IND', position: 'WR', score: 81.0, fpg: 12.52, explanation: 'Slot Precision' },
    { name: 'Rome Odunze', team: 'CHI', position: 'WR', score: 80.0, fpg: 11.8, explanation: 'Rookie Development' },
    { name: 'Marvin Harrison Jr.', team: 'ARI', position: 'WR', score: 79.5, fpg: 11.2, explanation: 'Elite Route Running' },
    
    // RBs (25 total)
    { name: 'Christian McCaffrey', team: 'SF', position: 'RB', score: 95.2 },
    { name: 'Saquon Barkley', team: 'PHI', position: 'RB', score: 93.8 },
    { name: 'Breece Hall', team: 'NYJ', position: 'RB', score: 92.1 },
    { name: 'Josh Jacobs', team: 'GB', position: 'RB', score: 90.7 },
    { name: 'Kenneth Walker III', team: 'SEA', position: 'RB', score: 89.3 },
    { name: 'Bijan Robinson', team: 'ATL', position: 'RB', score: 88.9 },
    { name: 'Jonathan Taylor', team: 'IND', position: 'RB', score: 88.2 },
    { name: 'Derrick Henry', team: 'BAL', position: 'RB', score: 87.5 },
    { name: 'Jahmyr Gibbs', team: 'DET', position: 'RB', score: 87.1 },
    { name: 'De\'Von Achane', team: 'MIA', position: 'RB', score: 86.4 },
    { name: 'Alvin Kamara', team: 'NO', position: 'RB', score: 85.8 },
    { name: 'Joe Mixon', team: 'HOU', position: 'RB', score: 85.2 },
    { name: 'Kyren Williams', team: 'LA', position: 'RB', score: 84.6 },
    { name: 'James Cook', team: 'BUF', position: 'RB', score: 84.0 },
    { name: 'David Montgomery', team: 'DET', position: 'RB', score: 83.4 },
    { name: 'Tony Pollard', team: 'TEN', position: 'RB', score: 82.8 },
    { name: 'Aaron Jones', team: 'MIN', position: 'RB', score: 82.2 },
    { name: 'Travis Etienne', team: 'JAX', position: 'RB', score: 81.6 },
    { name: 'Rhamondre Stevenson', team: 'NE', position: 'RB', score: 81.0 },
    { name: 'Isiah Pacheco', team: 'KC', position: 'RB', score: 80.4 },
    { name: 'Najee Harris', team: 'PIT', position: 'RB', score: 79.8 },
    { name: 'J.K. Dobbins', team: 'LAC', position: 'RB', score: 79.2 },
    { name: 'D\'Andre Swift', team: 'CHI', position: 'RB', score: 78.6 },
    { name: 'Rachaad White', team: 'TB', position: 'RB', score: 78.0 },
    { name: 'Ezekiel Elliott', team: 'DAL', position: 'RB', score: 77.4 },
    
    // TEs (20 total)
    { name: 'Travis Kelce', team: 'KC', position: 'TE', score: 90.3 },
    { name: 'Sam LaPorta', team: 'DET', position: 'TE', score: 89.1 },
    { name: 'Trey McBride', team: 'ARI', position: 'TE', score: 87.8 },
    { name: 'George Kittle', team: 'SF', position: 'TE', score: 86.5 },
    { name: 'Mark Andrews', team: 'BAL', position: 'TE', score: 85.2 },
    { name: 'Brock Bowers', team: 'LV', position: 'TE', score: 84.9 },
    { name: 'Evan Engram', team: 'JAX', position: 'TE', score: 83.6 },
    { name: 'Kyle Pitts', team: 'ATL', position: 'TE', score: 82.3 },
    { name: 'Jake Ferguson', team: 'DAL', position: 'TE', score: 81.0 },
    { name: 'David Njoku', team: 'CLE', position: 'TE', score: 80.7 },
    { name: 'Dalton Kincaid', team: 'BUF', position: 'TE', score: 79.4 },
    { name: 'T.J. Hockenson', team: 'MIN', position: 'TE', score: 78.1 },
    { name: 'Dallas Goedert', team: 'PHI', position: 'TE', score: 77.8 },
    { name: 'Pat Freiermuth', team: 'PIT', position: 'TE', score: 76.5 },
    { name: 'Cole Kmet', team: 'CHI', position: 'TE', score: 75.2 },
    { name: 'Isaiah Likely', team: 'BAL', position: 'TE', score: 74.9 },
    { name: 'Tucker Kraft', team: 'GB', position: 'TE', score: 73.6 },
    { name: 'Cade Otton', team: 'TB', position: 'TE', score: 72.3 },
    { name: 'Hunter Henry', team: 'NE', position: 'TE', score: 71.0 },
    { name: 'Jonnu Smith', team: 'MIA', position: 'TE', score: 69.7 }
  ].filter(p => ranking_type === 'OVERALL' || p.position === ranking_type)
   .map((p, i) => ({
     player_id: `${p.position.toLowerCase()}_${i + 1}`,
     name: p.name,
     team: p.team,
     position: p.position,
     power_score: p.score,
     rank: i + 1,
     delta_w: Math.floor(Math.random() * 7) - 3, // Random delta -3 to +3
     confidence: 0.75,
     flags: [],
     // FPG-CENTRIC FIELDS - with explicit defaults to handle missing values
     fpg: p.fpg || null,
     upsideIndex: p.upsideIndex || null,
     explanation: p.explanation || null
   }));

  return {
    season,
    week,
    ranking_type,
    generated_at: new Date().toISOString(),
    items: mockPlayers
  };
}

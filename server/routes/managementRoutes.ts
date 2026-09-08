import express from 'express';
import { storage } from '../storage';
import { computeLeagueDashboard } from '../services/leagueDashboardService';
import { classifyTeamDirection } from '../services/teamDirectionClassifier';
import { buildStrategyTemplateDiagnostics } from '@shared/strategyTemplateDiagnostics';
import { buildManagementStrategyContext } from '@shared/managementStrategyContext';
import { buildStrategyContextActivationDiagnostics } from '../modules/management/strategyContextActivationDiagnostics';
import { buildForgeEvidenceActivationDiagnostics } from '../modules/management/forgeEvidenceActivationDiagnostics';
import { buildTeamDirectionForgeFreshnessReceipt } from '../modules/management/forgeTeamDirectionFreshnessPolicy';
import { espnDraftBridgeStore } from '../services/espnDraftBridge';
import { fetchEspnDraftMarket, type EspnDraftScoring } from '../services/espnDraftMarket';

type ManagementDeps = {
  storage: typeof storage;
  computeLeagueDashboard: typeof computeLeagueDashboard;
  classifyTeamDirection: typeof classifyTeamDirection;
  now?: () => Date;
};

const defaultDeps: ManagementDeps = {
  storage,
  computeLeagueDashboard,
  classifyTeamDirection,
};

function isLoopbackAddress(value: string | undefined): boolean {
  const address = (value ?? '').toLowerCase();
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1';
}

function requireLocalDraftBridge(req: express.Request, res: express.Response, next: express.NextFunction) {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  const hostIsLocal = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host);
  const socketIsLocal = isLoopbackAddress(req.socket.remoteAddress);
  if (!hostIsLocal || !socketIsLocal) {
    return res.status(403).json({
      success: false,
      error: 'ESPN draft execution is local-only. Open TIBER through localhost on the draft computer.',
    });
  }
  res.setHeader('Cache-Control', 'no-store');
  return next();
}

export function createManagementRouter(deps: ManagementDeps = defaultDeps) {
  const router = express.Router();

  router.get('/api/management/espn-draft-market', requireLocalDraftBridge, async (req, res) => {
    try {
      const season = Number(req.query.season ?? 2026);
      const scoring = String(req.query.scoring ?? 'PPR').toUpperCase() as EspnDraftScoring;
      const position = String(req.query.position ?? '').toUpperCase();
      if (!Number.isInteger(season) || season < 2020 || season > 2100) {
        return res.status(400).json({ success: false, error: 'Invalid season.' });
      }
      if (!['PPR', 'HALF_PPR', 'STANDARD'].includes(scoring)) {
        return res.status(400).json({ success: false, error: 'Invalid scoring type.' });
      }
      if (position && !['QB', 'RB', 'WR', 'TE'].includes(position)) {
        return res.status(400).json({ success: false, error: 'Invalid draft position.' });
      }

      const snapshot = await fetchEspnDraftMarket({ season, scoring });
      const rows = position ? snapshot.rows.filter((row) => row.position === position) : snapshot.rows;
      return res.json({
        success: true,
        ...snapshot,
        rows,
        marketOnly: true,
        footballValueAuthority: false,
      });
    } catch (error) {
      return res.status(503).json({ success: false, error: (error as Error).message });
    }
  });

  router.get('/api/management/espn-draft-bridge/status', requireLocalDraftBridge, (_req, res) => {
    res.json({ success: true, ...espnDraftBridgeStore.getStatus() });
  });

  router.post('/api/management/espn-draft-bridge/heartbeat', requireLocalDraftBridge, express.json({ limit: '8kb' }), (req, res) => {
    try {
      const status = espnDraftBridgeStore.ingestHeartbeat(req.body ?? {});
      res.json({ success: true, ...status });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  });

  router.post('/api/management/espn-draft-bridge/request', requireLocalDraftBridge, express.json({ limit: '4kb' }), (req, res) => {
    try {
      const action = espnDraftBridgeStore.requestPick(req.body ?? {});
      res.status(202).json({ success: true, action });
    } catch (error) {
      res.status(409).json({ success: false, error: (error as Error).message });
    }
  });

  router.get('/api/management/espn-draft-bridge/next', requireLocalDraftBridge, (req, res) => {
    const pageInstanceId = typeof req.query.page_instance_id === 'string' ? req.query.page_instance_id : '';
    res.json({ success: true, action: espnDraftBridgeStore.nextAction(pageInstanceId) });
  });

  router.post('/api/management/espn-draft-bridge/result', requireLocalDraftBridge, express.json({ limit: '4kb' }), (req, res) => {
    try {
      const action = espnDraftBridgeStore.resolveAction(req.body ?? {});
      res.json({ success: true, action });
    } catch (error) {
      res.status(409).json({ success: false, error: (error as Error).message });
    }
  });

  router.delete('/api/management/espn-draft-bridge/action', requireLocalDraftBridge, (_req, res) => {
    try {
      espnDraftBridgeStore.clearResolvedAction();
      res.json({ success: true });
    } catch (error) {
      res.status(409).json({ success: false, error: (error as Error).message });
    }
  });

  router.get('/api/management/team-direction', async (req, res) => {
    try {
      const { user_id = 'default_user', league_id } = req.query;

      if (!league_id) {
        return res.status(400).json({ success: false, error: 'league_id is required' });
      }

      const context = await deps.storage.getUserLeagueContext(user_id as string);
      const activeTeam = context.activeTeam;

      if (!activeTeam) {
        return res.json({
          success: true,
          available: false,
          direction: null,
          reason: 'No active team set. Connect a team to unlock team direction.',
        });
      }

      let dashboardPayload;
      try {
        dashboardPayload = await deps.computeLeagueDashboard({
          userId: user_id as string,
          leagueId: league_id as string,
          refresh: true,
        });
      } catch (err) {
        return res.status(404).json({
          success: false,
          error: (err as Error).message || 'League not found or inaccessible',
        });
      }

      const teamData = dashboardPayload.teams.find((t) => t.team_id === activeTeam.id);

      if (!teamData) {
        return res.json({
          success: true,
          available: false,
          direction: null,
          reason: 'Active team not found in this league. Re-sync the league or select a different team.',
        });
      }

      const allPicks = await deps.storage.getLeagueFuturePicks(league_id as string);
      const externalRosterId =
        (activeTeam as any).external_roster_id ?? (activeTeam as any).externalRosterId ?? null;
      const teamPicks = externalRosterId
        ? allPicks.filter((p: any) => {
            const curr = p.current_roster_id ?? p.currentRosterId ?? null;
            return curr === externalRosterId;
          })
        : [];

      const leagueSettings = dashboardPayload.leagueSettings ?? dashboardPayload.settings ?? null;
      const rosterPositions: string[] =
        (leagueSettings as any)?.roster_positions ??
        (leagueSettings as any)?.rosterPositions ??
        [];
      const superflex = rosterPositions.some(
        (p: string) => String(p).toUpperCase() === 'SUPER_FLEX'
      );

      const forgeFreshnessReceipt = buildTeamDirectionForgeFreshnessReceipt({
        artifact: dashboardPayload.diagnostics?.forgeArtifact ?? null,
        rosterPlayers: teamData.roster ?? [],
        now: deps.now?.() ?? new Date(),
      });
      const result = deps.classifyTeamDirection(teamData.roster ?? [], teamPicks, {
        superflex,
        forgeFreshnessReceipt,
      });
      const strategyTemplateDiagnostics = buildStrategyTemplateDiagnostics(
        dashboardPayload.diagnostics
          ? {
              artifact: dashboardPayload.diagnostics.strategyOntologyArtifact,
              templates: dashboardPayload.diagnostics.strategyOntologyTemplates ?? [],
            }
          : null,
        result,
      );
      const managementStrategyContext = buildManagementStrategyContext({
        teamDirection: result,
        rosterVisibility: dashboardPayload.diagnostics?.rosterVisibility,
        diagnostics: dashboardPayload.diagnostics,
        strategyTemplateDiagnostics,
      });
      const strategyContextActivation = buildStrategyContextActivationDiagnostics(managementStrategyContext);
      const forgeEvidenceActivation = buildForgeEvidenceActivationDiagnostics({
        forgeArtifact: dashboardPayload.diagnostics?.forgeArtifact,
        rosterMatching: dashboardPayload.diagnostics?.forgeRosterMatching,
        forgeCoverage: result.forgeCoverage,
        freshnessReceipt: forgeFreshnessReceipt,
        classifierFreshnessEnforced: true,
      });

      res.json({
        success: true,
        available: true,
        teamId: activeTeam.id,
        teamName: (activeTeam as any).displayName ?? (activeTeam as any).display_name ?? 'Team',
        forgeDiagnostics: {
          artifact: dashboardPayload.diagnostics?.forgeArtifact ?? null,
          rosterMatching: dashboardPayload.diagnostics?.forgeRosterMatching ?? null,
          rosterVisibility: dashboardPayload.diagnostics?.rosterVisibility ?? null,
          strategyOntology: dashboardPayload.diagnostics?.strategyOntologyArtifact ?? null,
          strategyTemplateDiagnostics,
          managementStrategyContext,
          strategyContextActivation,
          forgeEvidenceActivation,
          forgeFreshnessReceipt,
        },
        strategy_template_diagnostics: strategyTemplateDiagnostics,
        management_strategy_context: managementStrategyContext,
        strategy_context_activation: strategyContextActivation,
        forge_evidence_activation: forgeEvidenceActivation,
        forge_freshness_receipt: forgeFreshnessReceipt,
        ...result,
      });
    } catch (error) {
      console.error('[Management/team-direction] failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message || 'Failed to classify team direction',
      });
    }
  });

  return router;
}

export const managementRouter = createManagementRouter();

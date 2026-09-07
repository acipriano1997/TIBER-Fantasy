import express from 'express';
import { storage } from '../storage';
import { computeTruthBoundLeagueDashboard } from '../services/managementTruthService';
import { classifyTeamDirection } from '../services/teamDirectionClassifier';
import { buildStrategyTemplateDiagnostics } from '@shared/strategyTemplateDiagnostics';
import { buildManagementStrategyContext } from '@shared/managementStrategyContext';
import { buildStrategyContextActivationDiagnostics } from '../modules/management/strategyContextActivationDiagnostics';
import { buildForgeEvidenceActivationDiagnostics } from '../modules/management/forgeEvidenceActivationDiagnostics';
import { buildTeamDirectionForgeFreshnessReceipt } from '../modules/management/forgeTeamDirectionFreshnessPolicy';

type ManagementDeps = {
  storage: typeof storage;
  computeLeagueDashboard: typeof computeTruthBoundLeagueDashboard;
  classifyTeamDirection: typeof classifyTeamDirection;
  now?: () => Date;
};

const defaultDeps: ManagementDeps = {
  storage,
  computeLeagueDashboard: computeTruthBoundLeagueDashboard,
  classifyTeamDirection,
};

export function createManagementRouter(deps: ManagementDeps = defaultDeps) {
  const router = express.Router();

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

      // Derive Superflex from league roster_positions if available
      const leagueSettings = dashboardPayload.leagueSettings ?? dashboardPayload.settings ?? null;
      const rosterPositions: string[] =
        (leagueSettings as any)?.roster_positions ??
        (leagueSettings as any)?.rosterPositions ??
        [];
      const superflex = rosterPositions.some(
        (p: string) => String(p).toUpperCase() === 'SUPER_FLEX'
      );

      // W6 / G6: evaluate the named Fantasy-owned policy on every Team
      // Direction request. The receipt is constructed once and consumed by the
      // classifier, backend diagnostics, Management UI response, and export.
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
      // Slice 3: additive, read-only diagnostic visibility of Strategy Context
      // activation readiness. Does not activate templates or change any behavior.
      const strategyContextActivation = buildStrategyContextActivationDiagnostics(managementStrategyContext);
      // Slice 4: additive, read-only FORGE evidence activation/citation metadata.
      // Citation only — does not change the Team Direction classifier or output.
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
          managementTruth: {
            version: (dashboardPayload.meta as any)?.management_truth_version ?? null,
            rosterBinding: (dashboardPayload.meta as any)?.roster_binding ?? null,
          },
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

import {
  adaptSignalValidationExports,
  isAffirmativeBreakoutLabel,
} from './signalValidationAdapter';
import { SignalValidationClient } from './signalValidationClient';
import {
  SignalValidationIntegrationError,
  TiberBreakoutDraftTag,
  TiberWrBreakoutLab,
} from './types';

export class SignalValidationService {
  private readonly startupConfigLogged: boolean;

  constructor(private readonly client: SignalValidationClient = new SignalValidationClient()) {
    const config = this.client.getConfig();
    console.info(
      `[SignalValidationIntegration] ${config.enabled && config.configured ? 'enabled' : 'disabled'} ` +
        `(configured=${config.configured}, exportsDir=${config.exportsDir})`,
    );
    this.startupConfigLogged = true;
  }

  getStatus() {
    const config = this.client.getConfig();
    return {
      ...config,
      readiness: config.enabled && config.configured ? 'ready' : 'not_ready',
      startupConfigLogged: this.startupConfigLogged,
    };
  }

  async getWrBreakoutLab(
    season?: number,
    options: { includeRawCanonical?: boolean } = {},
  ): Promise<TiberWrBreakoutLab> {
    try {
      const exports = await this.client.readWrBreakoutExports(season);
      return adaptSignalValidationExports(exports, {
        includeRawCanonical: options.includeRawCanonical,
        exportDirectory: this.client.getConfig().exportsDir,
      });
    } catch (error) {
      if (error instanceof SignalValidationIntegrationError) {
        throw error;
      }

      throw new SignalValidationIntegrationError(
        'upstream_unavailable',
        'Signal Validation integration failed unexpectedly.',
        503,
        error,
      );
    }
  }

  async getWrBreakoutDraftTags(targetSeason: number): Promise<{
    lab: TiberWrBreakoutLab;
    tags: TiberBreakoutDraftTag[];
  }> {
    try {
      const exports = await this.client.readWrBreakoutExportsForTargetSeason(targetSeason);
      const lab = adaptSignalValidationExports(exports, {
        exportDirectory: this.client.getConfig().exportsDir,
      });

      if (!lab.promotion?.draftTagEligible) {
        throw new SignalValidationIntegrationError(
          'not_promoted',
          `Signal Validation WR breakout evidence for ${targetSeason} has not passed the explicit promotion gate. ` +
            'Draft tags require upstream promoted status plus successful backtest and prescriptive validation.',
          409,
        );
      }

      const tags = lab.rows
        .filter((row) => isAffirmativeBreakoutLabel(row.breakoutLabelDefault))
        .map((row) => ({
          playerId: row.playerId,
          playerName: row.playerName,
          team: row.team,
          targetSeason,
          label: `${targetSeason} Breakout`,
          candidateRank: row.candidateRank,
          finalSignalScore: row.finalSignalScore,
          breakoutContext: row.breakoutContext,
          modelVersion: lab.bestRecipeSummary.modelVersion,
          generatedAt: lab.bestRecipeSummary.generatedAt,
        }));

      return { lab, tags };
    } catch (error) {
      if (error instanceof SignalValidationIntegrationError) {
        throw error;
      }

      throw new SignalValidationIntegrationError(
        'upstream_unavailable',
        'Signal Validation draft-tag integration failed unexpectedly.',
        503,
        error,
      );
    }
  }
}

export const signalValidationService = new SignalValidationService();

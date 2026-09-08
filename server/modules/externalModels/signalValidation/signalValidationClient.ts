import { promises as fs } from 'fs';
import path from 'path';
import {
  CanonicalSignalValidationExports,
  SignalValidationClientConfig,
  SignalValidationIntegrationError,
  signalValidationExportManifestSchema,
} from './types';

const DEFAULT_EXPORTS_DIR = path.join(process.cwd(), 'data', 'signal-validation');
const WR_SIGNAL_FILE_PREFIX = 'wr_player_signal_cards_';
const WR_SIGNAL_FILE_SUFFIX = '.csv';
const WR_BEST_RECIPE_FILE = 'wr_best_recipe_summary.json';
const WR_EXPORT_MANIFEST_FILE = 'export_manifest.json';

function parseSeasonFromFilename(filename: string): number | null {
  const match = filename.match(/^wr_player_signal_cards_(\d{4})\.csv$/);
  return match ? Number(match[1]) : null;
}

export class SignalValidationClient {
  private readonly exportsDir: string;
  private readonly enabled: boolean;

  constructor(config: SignalValidationClientConfig = {}) {
    this.exportsDir = config.exportsDir ?? process.env.SIGNAL_VALIDATION_EXPORTS_DIR ?? DEFAULT_EXPORTS_DIR;
    this.enabled = config.enabled ?? process.env.SIGNAL_VALIDATION_EXPORTS_ENABLED !== '0';
  }

  getConfig() {
    return {
      enabled: this.enabled,
      configured: Boolean(this.exportsDir),
      exportsDir: this.exportsDir,
    };
  }

  async listAvailableSeasons(): Promise<number[]> {
    if (!this.enabled) {
      throw new SignalValidationIntegrationError('config_error', 'Signal Validation exports are disabled by configuration.', 503);
    }

    try {
      const entries = await fs.readdir(this.exportsDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => parseSeasonFromFilename(entry.name))
        .filter((season): season is number => season != null)
        .sort((a, b) => b - a);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return [];
      }

      throw new SignalValidationIntegrationError(
        'upstream_unavailable',
        'Unable to inspect Signal Validation export files.',
        503,
        error,
      );
    }
  }

  private async readExportManifest(required: boolean): Promise<unknown | undefined> {
    const manifestPath = path.join(this.exportsDir, WR_EXPORT_MANIFEST_FILE);

    try {
      return JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === 'ENOENT' && !required) {
        return undefined;
      }

      if (nodeError.code === 'ENOENT') {
        throw new SignalValidationIntegrationError(
          'not_found',
          `Signal Validation ${WR_EXPORT_MANIFEST_FILE} is required for promoted draft tags.`,
          404,
          error,
        );
      }

      if (error instanceof SyntaxError) {
        throw new SignalValidationIntegrationError(
          'malformed_export',
          'Signal Validation export manifest JSON is not valid JSON.',
          502,
          error,
        );
      }

      throw new SignalValidationIntegrationError(
        'upstream_unavailable',
        'Unable to read the Signal Validation export manifest.',
        503,
        error,
      );
    }
  }

  async readWrBreakoutExports(requestedSeason?: number): Promise<CanonicalSignalValidationExports> {
    const availableSeasons = await this.listAvailableSeasons();

    if (!availableSeasons.length) {
      throw new SignalValidationIntegrationError(
        'not_found',
        `No Signal Validation WR player signal card exports were found in SIGNAL_VALIDATION_EXPORTS_DIR (${this.exportsDir}). ` +
          `Expected files: ${WR_SIGNAL_FILE_PREFIX}{season}${WR_SIGNAL_FILE_SUFFIX} and ${WR_BEST_RECIPE_FILE}.`,
        404,
      );
    }

    const season = requestedSeason ?? availableSeasons[0];

    if (!availableSeasons.includes(season)) {
      const availableList = availableSeasons.join(', ');
      throw new SignalValidationIntegrationError(
        'not_found',
        `Signal Validation exports for season ${season} were not found. Available export seasons: ${availableList}. ` +
          'The WR export filename uses the feature season token (wr_player_signal_cards_{feature_season}.csv).',
        404,
        undefined,
        availableSeasons,
      );
    }

    const csvPath = path.join(this.exportsDir, `${WR_SIGNAL_FILE_PREFIX}${season}${WR_SIGNAL_FILE_SUFFIX}`);
    const summaryPath = path.join(this.exportsDir, WR_BEST_RECIPE_FILE);

    try {
      const [playerSignalCardsCsv, bestRecipeSummaryRaw, exportManifest] = await Promise.all([
        fs.readFile(csvPath, 'utf8'),
        fs.readFile(summaryPath, 'utf8'),
        this.readExportManifest(false),
      ]);

      return {
        season,
        availableSeasons,
        playerSignalCardsCsv,
        bestRecipeSummary: JSON.parse(bestRecipeSummaryRaw),
        exportManifest,
      };
    } catch (error) {
      if (error instanceof SignalValidationIntegrationError) {
        throw error;
      }

      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === 'ENOENT') {
        throw new SignalValidationIntegrationError(
          'not_found',
          `Signal Validation exports for season ${season} are incomplete in SIGNAL_VALIDATION_EXPORTS_DIR (${this.exportsDir}). ` +
            `Expected ${WR_SIGNAL_FILE_PREFIX}${season}${WR_SIGNAL_FILE_SUFFIX} and ${WR_BEST_RECIPE_FILE}.`,
          404,
          error,
        );
      }

      if (error instanceof SyntaxError) {
        throw new SignalValidationIntegrationError(
          'malformed_export',
          'Signal Validation best recipe summary JSON is not valid JSON.',
          502,
          error,
        );
      }

      throw new SignalValidationIntegrationError(
        'upstream_unavailable',
        'Unable to read Signal Validation export files.',
        503,
        error,
      );
    }
  }

  async readWrBreakoutExportsForTargetSeason(targetSeason: number): Promise<CanonicalSignalValidationExports> {
    const exportManifest = await this.readExportManifest(true);
    const parsed = signalValidationExportManifestSchema.safeParse(exportManifest);

    if (!parsed.success) {
      throw new SignalValidationIntegrationError(
        'invalid_payload',
        'Signal Validation export manifest does not match the promoted-signal contract.',
        502,
        parsed.error.flatten(),
      );
    }

    if (parsed.data.outcome_season !== targetSeason) {
      throw new SignalValidationIntegrationError(
        'not_found',
        `No promoted Signal Validation WR export targets season ${targetSeason}. ` +
          `The current manifest targets ${parsed.data.outcome_season}.`,
        404,
        undefined,
        [parsed.data.outcome_season],
      );
    }

    const exports = await this.readWrBreakoutExports(parsed.data.feature_season);
    return {
      ...exports,
      exportManifest,
      requestedTargetSeason: targetSeason,
    };
  }
}

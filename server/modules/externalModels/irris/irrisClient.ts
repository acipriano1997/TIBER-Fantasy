import { IrrisClientConfig, IrrisIntegrationError } from './types';

const DEFAULT_TIMEOUT_MS = 5000;

export class IrrisClient {
  private readonly baseUrl?: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly enabled: boolean;

  constructor(config: IrrisClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? process.env.FORECAST_IRRIS_BASE_URL ?? process.env.FORECAST_MODEL_BASE_URL;
    this.apiKey = config.apiKey ?? process.env.FORECAST_IRRIS_API_KEY ?? process.env.FORECAST_API_KEY;
    this.timeoutMs = config.timeoutMs ?? Number(process.env.FORECAST_IRRIS_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.enabled = config.enabled ?? process.env.FORECAST_IRRIS_ENABLED !== '0';
  }

  getConfig() {
    return {
      enabled: this.enabled,
      configured: Boolean(this.baseUrl && this.apiKey),
      baseUrl: this.baseUrl,
      timeoutMs: this.timeoutMs,
    };
  }

  async assess(request: unknown): Promise<unknown> {
    if (!this.enabled) {
      throw new IrrisIntegrationError('config_error', 'IRRIS integration is disabled by configuration.', 503);
    }
    if (!this.baseUrl || !this.apiKey) {
      throw new IrrisIntegrationError('config_error', 'IRRIS requires a Forecast base URL and API key.', 503);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = new URL('/api/irris/assess', this.baseUrl);
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (response.status >= 500) {
        throw new IrrisIntegrationError('upstream_unavailable', 'IRRIS upstream service is unavailable.', 503);
      }
      if (!response.ok) {
        throw new IrrisIntegrationError('invalid_payload', `IRRIS upstream returned HTTP ${response.status}.`, 502);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof IrrisIntegrationError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new IrrisIntegrationError('upstream_timeout', `IRRIS upstream timed out after ${this.timeoutMs}ms.`, 504, error);
      }
      throw new IrrisIntegrationError('upstream_unavailable', 'IRRIS upstream request failed.', 503, error);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

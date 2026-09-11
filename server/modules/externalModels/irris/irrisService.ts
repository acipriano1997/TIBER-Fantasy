import { IrrisClient } from './irrisClient';
import { adaptIrrisAssessment } from './irrisAdapter';
import { IrrisIntegrationError, TiberIrrisServiceResult } from './types';

export class IrrisService {
  constructor(private readonly client = new IrrisClient()) {}

  getStatus() {
    return this.client.getConfig();
  }

  async assess(request: unknown): Promise<TiberIrrisServiceResult> {
    try {
      const payload = await this.client.assess(request);
      return { ok: true, insight: adaptIrrisAssessment(payload) };
    } catch (error) {
      const mapped = error instanceof IrrisIntegrationError
        ? error
        : new IrrisIntegrationError('upstream_unavailable', 'IRRIS integration failed.', 503, error);
      return {
        ok: false,
        error: { code: mapped.code, message: mapped.message, status: mapped.status },
      };
    }
  }
}

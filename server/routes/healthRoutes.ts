import express, { type Request, type Response } from 'express';

export type DatabaseReadinessCode =
  | 'database_ready'
  | 'database_url_missing'
  | 'database_unavailable';

export type DatabaseReadiness = {
  ready: boolean;
  code: DatabaseReadinessCode;
};

export type HealthRouterDeps = {
  checkDatabaseReadiness?: () => Promise<DatabaseReadiness>;
  serviceName?: string;
};

/**
 * Keep database readiness lazy so liveness remains available even when the
 * private database is missing, disabled, or unreachable. Raw provider error
 * text is logged server-side but never returned to normal health consumers.
 */
export async function checkDatabaseReadiness(): Promise<DatabaseReadiness> {
  if (!process.env.DATABASE_URL) {
    return { ready: false, code: 'database_url_missing' };
  }

  try {
    const { pingDb } = await import('../infra/db');
    const ready = await pingDb();
    return ready
      ? { ready: true, code: 'database_ready' }
      : { ready: false, code: 'database_unavailable' };
  } catch (error) {
    console.error(
      '[health] database readiness check failed:',
      error instanceof Error ? error.message : String(error),
    );
    return { ready: false, code: 'database_unavailable' };
  }
}

export function createHealthRouter(deps: HealthRouterDeps = {}) {
  const router = express.Router();
  const serviceName = deps.serviceName ?? 'TiberClaw';
  const dbCheck = deps.checkDatabaseReadiness ?? checkDatabaseReadiness;

  const livenessPayload = () => ({
    ok: true,
    status: 'live' as const,
    service: serviceName,
  });

  // Backward-compatible infrastructure probe used by existing deployment
  // surfaces. It must remain instant and dependency-free.
  router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json(livenessPayload());
  });

  // Canonical API liveness endpoint for release/runtime certification.
  router.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json(livenessPayload());
  });

  // Database readiness is deliberately separate from app liveness. A DB outage
  // must not make the process itself look dead, and a live process must not be
  // mistaken for a database-ready private Command Center runtime.
  router.get('/api/health/db', async (_req: Request, res: Response) => {
    const database = await dbCheck();
    res.status(database.ready ? 200 : 503).json({
      ok: database.ready,
      status: database.ready ? 'ready' : 'unavailable',
      service: serviceName,
      database,
    });
  });

  return router;
}

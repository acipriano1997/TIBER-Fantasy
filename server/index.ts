// server/index.ts
import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import fs from "node:fs";
import { attachSignatureHeader } from "./middleware/signature";
import { baselineSecurityHeaders } from "./middleware/security";
import { createPersonalUserScopeMiddleware } from "./middleware/personalUserScope";
import { draftReviewRouter } from "./routes/draftReviewRoutes";
import { createHealthRouter } from "./routes/healthRoutes";
import { sleeperUsageTruthBoundaryRouter } from "./routes/sleeperUsageTruthBoundary";
import {
  createRuntimeProfileRouter,
  installPublicApiBoundary,
  PUBLIC_DRAFT_REVIEW_PROFILE,
  resolveRuntimeProfile,
} from "./runtimeProfile";

const log = (...args: any[]) => console.log(...args);

// In production, never leak raw internal error detail (DB/schema/stack messages)
// for unexpected 5xx failures. Deliberate client errors (4xx) keep their message,
// and full detail is preserved in non-production for debugging.
function sanitizeErrorMessage(err: any, status: number): string {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && status >= 500) {
    return "Internal server error";
  }
  return err?.message ?? "Internal Server Error";
}

// Exported so bootstrap.mjs can use it as the request handler.
export const app = express();
export const runtimeProfile = resolveRuntimeProfile();

// Deployed behind a single proxy hop (Railway), which sets X-Forwarded-For.
// Without this, req.ip is the proxy address, so IP-keyed rate limiting would
// throttle all users as one client.
app.set("trust proxy", 1);

type ProductionFrontendMountResult =
  | { mounted: true; publicDir: string; indexHtml: string }
  | { mounted: false; reason: "public_dir_missing" | "index_missing"; publicDir: string; indexHtml: string };

export function mountProductionFrontend(appToMount: express.Express, publicDir: string): ProductionFrontendMountResult {
  const indexHtml = path.join(publicDir, "index.html");

  if (!fs.existsSync(publicDir)) {
    return { mounted: false, reason: "public_dir_missing", publicDir, indexHtml };
  }

  if (!fs.existsSync(indexHtml)) {
    return { mounted: false, reason: "index_missing", publicDir, indexHtml };
  }

  appToMount.use(express.static(publicDir));

  // SPA fallback for non-API routes.
  appToMount.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || req.originalUrl.startsWith("/api") || req.path === "/health") {
      return next();
    }
    res.sendFile(indexHtml);
  });

  return { mounted: true, publicDir, indexHtml };
}

// ── Core middleware ────────────────────────────────────────────────────────────
// Baseline security headers first — registered BEFORE the body parsers so that
// parser-generated error responses (malformed JSON → 400, oversized payload →
// 413) still carry the headers. No CSP here; the API keeps its own restrictive
// CSP via securityHeaders() on /api.
app.use(baselineSecurityHeaders());
// Health must remain reachable even if private runtime/database initialization
// is unavailable. Database readiness is lazy and separate from liveness.
app.use(createHealthRouter());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Personal release isolation boundary: legacy clients may still send
// `default_user`, but shared state must never be keyed by that value.
app.use(createPersonalUserScopeMiddleware());
app.use(attachSignatureHeader);

// A tiny non-stateful capability response lets the SPA render the same runtime
// profile the server is enforcing. It is mounted before the public boundary.
app.use(createRuntimeProfileRouter(runtimeProfile));

// Public, state-isolated redraft context compiler. Mount this before the
// database-backed background router so the pilot remains available when
// dynasty Management dependencies are unavailable.
app.use(draftReviewRouter);

// The legacy Sleeper stats route fabricates usage data. Personal v1 quarantines
// it before the private route graph is imported; public containment does not
// expose the private endpoint at all.
if (runtimeProfile !== PUBLIC_DRAFT_REVIEW_PROFILE) {
  app.use(sleeperUsageTruthBoundaryRouter);
}

// Tiny API request logger
app.use((req, res, next) => {
  const start = Date.now();
  const pathStr = req.path;
  let captured: unknown;
  const origJson = res.json.bind(res);
  // @ts-expect-error preserve signature
  res.json = (body: unknown, ...rest: unknown[]) => { captured = body; return origJson(body, ...rest); };
  res.on("finish", () => {
    if (!pathStr.startsWith("/api")) return;
    const ms = Date.now() - start;
    let line = `${req.method} ${pathStr} ${res.statusCode} in ${ms}ms`;
    // The containment profile never logs response bodies. Public Sleeper
    // display strings are untrusted/user-selected data and private route bodies
    // must never become reachable or observable through this deployment.
    try {
      if (captured && runtimeProfile !== PUBLIC_DRAFT_REVIEW_PROFILE) {
        line += ` :: ${JSON.stringify(captured)}`;
      }
    } catch {/* */}
    if (line.length > 160) line = line.slice(0, 159) + "…";
    log(line);
  });
  next();
});

// In production / serves SPA shell when available; otherwise returns JSON fallback.
// In dev the next() falls through to Vite which serves index.html.
app.get("/", (req, res, next) => {
  if (process.env.NODE_ENV === "development") return next();
  const indexHtml = path.resolve(process.cwd(), "dist", "public", "index.html");
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  res.status(200).json({ status: "ok", service: "TiberClaw API", version: "1.0" });
});

// ── initBackground — exported so bootstrap.mjs can call it after hand-off ────
export async function initBackground(): Promise<void> {
  const t = () => `[+${((Date.now() - _initStart) / 1000).toFixed(1)}s]`;
  const _initStart = Date.now();
  log(`🚀 Tiber Fantasy – loading routes in background`);

  if (runtimeProfile === PUBLIC_DRAFT_REVIEW_PROFILE) {
    // Containment profile: Draft Review, runtime profile, health, and static SPA
    // only. Do not import the database-backed route graph or initialize any
    // migration, scheduler, integration, synchronization, or cron surface.
    installPublicApiBoundary(app);

    if (process.env.NODE_ENV !== "development") {
      const publicDir = path.resolve(process.cwd(), "dist", "public");
      const mountedFrontend = mountProductionFrontend(app, publicDir);
      if (mountedFrontend.mounted) {
        log(`🗂️  Public Draft Review assets → ${mountedFrontend.publicDir}`);
      } else {
        log(`⚠️  Public Draft Review frontend unavailable (${mountedFrontend.reason})`);
      }
    }

    log("🔒 Public Draft Review containment profile active; private runtime not loaded");
    return;
  }

  // Step 1: LLM provider — fire-and-forget, never blocks route mounting.
  // In production the LLM import can stall indefinitely (no error, no resolve),
  // which previously caused steps 2-4 (API routes) to never register.
  import("./llm")
    .then(({ logProviderStatus }) => { logProviderStatus(); log(`${t()} step 1: done`); })
    .catch(() => { /* non-fatal */ });
  log(`${t()} step 1: fired (non-blocking)`);

  log(`${t()} step 2: loading v1 router`);
  const { default: v1Router } = await import("./api/v1/routes");
  app.use("/api/v1", v1Router);
  log(`${t()} step 2: done`);

  log(`${t()} step 3: importing routes module`);
  const { registerRoutes } = await import("./routes");
  log(`${t()} step 3: done`);

  log(`${t()} step 4: calling registerRoutes`);
  await registerRoutes(app);
  log(`${t()} step 4: done`);

  // API 404 catch-all (after all real routes are mounted)
  app.all("/api/*", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status ?? err?.statusCode ?? 500;
    res.status(status).json({ message: sanitizeErrorMessage(err, status) });
    console.error("Unhandled error:", err);
  });

  // Static assets (production only — dev uses Vite)
  if (process.env.NODE_ENV !== "development") {
    const publicDir = path.resolve(process.cwd(), "dist", "public");
    const mountedFrontend = mountProductionFrontend(app, publicDir);
    if (mountedFrontend.mounted) {
      log(`🗂️  Static assets → ${mountedFrontend.publicDir}`);
    } else {
      log(`⚠️  Static frontend unavailable (${mountedFrontend.reason}) → root will return JSON health-style fallback`);
    }
  }

  // DB migrations — fire-and-forget
  import("drizzle-orm/node-postgres/migrator").then(async ({ migrate }) => {
    const { db } = await import("./infra/db");
    await migrate(db, { migrationsFolder: "migrations" });
    log("✅ DB migrations applied");
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    log(msg.includes("already exists") ? "ℹ️  DB schema up-to-date" : `⚠️  Migration: ${msg}`);
  });

  // DB ping — fire-and-forget
  import("./infra/db").then(async ({ pingDb }) => {
    const ok = await pingDb();
    log(ok ? "✅ DB ping ok" : "⚠️  DB ping failed");
  }).catch(() => {});

  // Sleeper scheduler
  try {
    const { startScheduler } = await import("./services/sleeperSyncV2/scheduler");
    startScheduler();
  } catch { /* non-fatal */ }

  // Cron jobs — nightly buys/sells, injury sync, schedule sync, RB context check, weekly recompute
  try {
    const { setupAllCronJobs } = await import("./cron/weeklyUpdate");
    setupAllCronJobs();
  } catch (e) {
    log(`⚠️  Cron init failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }

  log("✅ Background init complete");
}

// ── Dev-only startup ──────────────────────────────────────────────────────────
// Production uses bootstrap.mjs (dist/index.mjs) which imports dist/app.mjs
// and calls initBackground() after handing the socket to Express.
if (process.env.NODE_ENV === "development") {
  const PORT = Number(process.env.PORT ?? 5000);
  (async () => {
    if (runtimeProfile === PUBLIC_DRAFT_REVIEW_PROFILE) {
      const { createServer } = await import("node:http");
      installPublicApiBoundary(app);
      const httpServer = createServer(app);
      const { setupVite } = await import("./vite");
      await setupVite(app, httpServer);
      httpServer.listen(PORT, "0.0.0.0", () => {
        log(`[express] public Draft Review profile serving on port ${PORT}`);
      });
      return;
    }

    const { default: v1Router } = await import("./api/v1/routes");
    app.use("/api/v1", v1Router);

    const { registerRoutes } = await import("./routes");
    const httpServer = await registerRoutes(app);

    app.all("/api/*", (_req: Request, res: Response) => {
      res.status(404).json({ error: "Not found" });
    });

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err?.status ?? err?.statusCode ?? 500;
      res.status(status).json({ message: sanitizeErrorMessage(err, status) });
      console.error("Unhandled error:", err);
    });

    const { setupVite } = await import("./vite");
    await setupVite(app, httpServer);

    httpServer.listen(PORT, "0.0.0.0", () => {
      log(`[express] serving on port ${PORT}`);
    });
  })().catch(console.error);
}

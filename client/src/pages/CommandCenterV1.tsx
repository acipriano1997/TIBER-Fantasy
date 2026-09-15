import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  COMMAND_CENTER_V1_SURFACES,
  type CommandCenterV1SurfaceId,
  type CommandCenterV1SurfaceRecord,
} from "@shared/commandCenterV1SurfaceManifest";

type FailClosedSurfaceId =
  | "home_what_changed"
  | "weekly_decisions"
  | "waivers"
  | "trades";

type DecisionReadiness = {
  ready: boolean;
  blockers: string[];
  warnings: string[];
};

type CommandCenterLeagueContext = {
  schemaVersion: 'command-center-league-context.v1';
  status: 'ready' | 'not_connected' | 'source_unavailable';
  league: null | {
    internalLeagueId: string | null;
    externalLeagueId: string | null;
    name: string;
    season: number | null;
    platform: string;
  };
  health: null | {
    league: string;
    scoring: string;
    contractWorkbook: string;
    devyRights: string;
    blockingIssueCount: number;
    warningCount: number;
  };
  scoring: null | {
    status: string;
    fingerprint: string | null;
    asOf: string | null;
  };
  capabilities: string[];
  readiness: Partial<Record<'lineup' | 'waiver' | 'trade' | 'contract', DecisionReadiness>>;
  issues: Array<{ code: string; severity: 'warning' | 'blocking'; message: string; source?: string }>;
  sourceError: string | null;
};

type LeagueContextEnvelope = {
  success: boolean;
  commandCenterLeagueContext?: CommandCenterLeagueContext;
};

const outcomeCopy: Record<
  NonNullable<CommandCenterV1SurfaceRecord["releaseOutcome"]>,
  { eyebrow: string; title: string; detail: string }
> = {
  insufficient_evidence: {
    eyebrow: "INSUFFICIENT EVIDENCE",
    title: "No recommendation is being issued.",
    detail:
      "The release boundary is withholding a verdict until the governed inputs required for this workflow are complete and compatible.",
  },
  unsupported_domain: {
    eyebrow: "UNSUPPORTED DOMAIN",
    title: "This decision engine is intentionally unavailable in v1.",
    detail:
      "Legacy heuristic authority is quarantined. The Command Center will not substitute an older score, ranking, or confidence label for a certified decision contract.",
  },
  inspection_only: {
    eyebrow: "INSPECTION ONLY",
    title: "Research is available without decision authority.",
    detail: "Use the evidence for context; the product is not promoting it as an action recommendation.",
  },
  read_only_context: {
    eyebrow: "READ ONLY",
    title: "Verified context is available.",
    detail: "This surface may display certified state but never takes a fantasy action for the operator.",
  },
};

const workflowLinks: Array<{ id: FailClosedSurfaceId; href: string }> = [
  { id: "weekly_decisions", href: "/command-center/weekly" },
  { id: "waivers", href: "/command-center/waivers" },
  { id: "trades", href: "/command-center/trades" },
];

function StatusCard({ surface }: { surface: CommandCenterV1SurfaceRecord }) {
  const outcome = surface.releaseOutcome ? outcomeCopy[surface.releaseOutcome] : null;

  return (
    <section
      aria-live="polite"
      style={{
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 14,
        padding: 20,
        background: "rgba(255,255,255,0.035)",
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: "0.12em", opacity: 0.68, marginBottom: 8 }}>
        {outcome?.eyebrow ?? "RELEASE STATUS"}
      </div>
      <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.25 }}>
        {outcome?.title ?? surface.label}
      </h2>
      {outcome && (
        <p style={{ margin: "10px 0 0", maxWidth: 760, lineHeight: 1.6, opacity: 0.82 }}>
          {outcome.detail}
        </p>
      )}
      <p style={{ margin: "12px 0 0", maxWidth: 760, lineHeight: 1.6, opacity: 0.82 }}>
        {surface.reason}
      </p>
      <div style={{ marginTop: 16, fontSize: 13, opacity: 0.72 }}>
        Final action authority: <strong style={{ opacity: 1 }}>you</strong>
      </div>
    </section>
  );
}

function healthLabel(value: string | undefined) {
  if (!value) return 'Unavailable';
  if (value === 'not_applicable') return 'N/A';
  return value.replace(/_/g, ' ');
}

function LeagueTruthCard({
  context,
  loading,
  surfaceId,
}: {
  context?: CommandCenterLeagueContext;
  loading: boolean;
  surfaceId: FailClosedSurfaceId;
}) {
  const decisionType = surfaceId === 'weekly_decisions'
    ? 'lineup'
    : surfaceId === 'waivers'
      ? 'waiver'
      : surfaceId === 'trades'
        ? 'trade'
        : null;
  const readiness = decisionType ? context?.readiness?.[decisionType] : null;

  return (
    <section
      aria-label="League truth and source health"
      style={{
        marginTop: 18,
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding: 18,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', opacity: 0.62 }}>LEAGUE TRUTH</div>
          <h2 style={{ margin: '5px 0 0', fontSize: 18 }}>Source health & decision context</h2>
        </div>
        <Link href="/management" className="tmd-topbar-link">Manage league context</Link>
      </div>

      {loading ? (
        <p style={{ opacity: 0.7 }}>Checking the active league and its authoritative scoring source…</p>
      ) : !context || context.status === 'not_connected' || !context.league ? (
        <p style={{ marginBottom: 0, opacity: 0.76 }}>
          No active league is selected. Connect or select a league in Management before a league-specific decision can be certified.
        </p>
      ) : (
        <>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div><small style={{ opacity: 0.6 }}>League</small><div><strong>{context.league.name}</strong></div></div>
            <div><small style={{ opacity: 0.6 }}>Scoring</small><div><strong>{healthLabel(context.health?.scoring)}</strong></div></div>
            <div><small style={{ opacity: 0.6 }}>Contract workbook</small><div><strong>{healthLabel(context.health?.contractWorkbook)}</strong></div></div>
            <div><small style={{ opacity: 0.6 }}>Devy rights</small><div><strong>{healthLabel(context.health?.devyRights)}</strong></div></div>
          </div>

          {context.scoring?.fingerprint && (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.62 }}>
              Certified scoring fingerprint: <code>{context.scoring.fingerprint.slice(0, 16)}…</code>
              {context.scoring.asOf ? ` · as of ${context.scoring.asOf}` : ''}
            </div>
          )}

          {decisionType && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: readiness?.ready ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.025)' }}>
              <strong>League-context readiness for {decisionType}: {readiness?.ready ? 'ready' : 'blocked'}</strong>
              <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5, opacity: 0.7 }}>
                This certifies league/scoring/source inputs only. It does not activate a withheld decision engine or create a recommendation.
              </div>
              {readiness && !readiness.ready && readiness.blockers.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.5, opacity: 0.76 }}>
                  {readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
              )}
            </div>
          )}

          {context.sourceError && (
            <p style={{ margin: '10px 0 0', fontSize: 12, opacity: 0.72 }}>Platform source unavailable: {context.sourceError}</p>
          )}
          {(context.health?.blockingIssueCount ?? 0) > 0 && (
            <p style={{ margin: '10px 0 0', fontSize: 12, opacity: 0.72 }}>
              {context.health?.blockingIssueCount} blocking league-context issue{context.health?.blockingIssueCount === 1 ? '' : 's'}; FFCC will abstain rather than substitute defaults.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function HomeSurface({ context, loading }: { context?: CommandCenterLeagueContext; loading: boolean }) {
  const surface = COMMAND_CENTER_V1_SURFACES.home_what_changed;

  return (
    <>
      <StatusCard surface={surface} />
      <LeagueTruthCard context={context} loading={loading} surfaceId="home_what_changed" />

      <section style={{ marginTop: 24 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Decision workflows</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
            gap: 12,
          }}
        >
          {workflowLinks.map(({ id, href }) => {
            const workflow = COMMAND_CENTER_V1_SURFACES[id];
            return (
              <Link
                key={id}
                href={href}
                style={{
                  display: "block",
                  minHeight: 112,
                  padding: 16,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  textDecoration: "none",
                  color: "inherit",
                  background: "rgba(255,255,255,0.025)",
                }}
              >
                <div style={{ fontWeight: 700 }}>{workflow.label}</div>
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, opacity: 0.72 }}>
                  {workflow.releaseOutcome === "unsupported_domain"
                    ? "Safely withheld; legacy authority remains quarantined."
                    : "Safely withheld until governed evidence is complete."}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Certified context</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/management" className="tmd-topbar-link">League / Roster Context</Link>
          <Link href="/draft-review" className="tmd-topbar-link">Draft Review</Link>
        </div>
      </section>
    </>
  );
}

export default function CommandCenterV1({ surfaceId }: { surfaceId: FailClosedSurfaceId }) {
  const surface = COMMAND_CENTER_V1_SURFACES[surfaceId];
  const contextQuery = useQuery<LeagueContextEnvelope>({
    queryKey: ['/api/league-context?user_id=default_user'],
    retry: false,
  });
  const leagueContext = contextQuery.data?.commandCenterLeagueContext;

  return (
    <div style={{ width: "100%", maxWidth: 980, margin: "0 auto", padding: "20px clamp(14px, 3vw, 28px) 40px" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", opacity: 0.58 }}>COMMAND CENTER V1</div>
        <h1 style={{ margin: "6px 0 0", fontSize: "clamp(28px, 6vw, 42px)", lineHeight: 1.1 }}>
          {surface.label}
        </h1>
        <p style={{ margin: "10px 0 0", maxWidth: 780, lineHeight: 1.6, opacity: 0.72 }}>
          Release-safe means the product may abstain. It never fills an evidence gap with a legacy heuristic just to produce an answer.
        </p>
      </header>

      {surfaceId === "home_what_changed" ? (
        <HomeSurface context={leagueContext} loading={contextQuery.isLoading} />
      ) : (
        <>
          <StatusCard surface={surface} />
          <LeagueTruthCard context={leagueContext} loading={contextQuery.isLoading} surfaceId={surfaceId} />
        </>
      )}

      {surfaceId === "weekly_decisions" && (
        <p style={{ marginTop: 16, maxWidth: 780, lineHeight: 1.6, opacity: 0.72 }}>
          The typed weekly decision contract is active as the authority boundary. Its scoring identity must now match the certified active-league fingerprint. Until exact legal lineup geometry and compatible calibrated weekly tail packets are supplied, its truthful outcome remains <code>insufficient_evidence</code>.
        </p>
      )}

      {surfaceId !== "home_what_changed" && (
        <div style={{ marginTop: 24 }}>
          <Link href="/command-center" className="tmd-topbar-link">Back to Command Center</Link>
        </div>
      )}
    </div>
  );
}
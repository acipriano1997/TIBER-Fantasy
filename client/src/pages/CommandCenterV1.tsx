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

function HomeSurface() {
  const surface = COMMAND_CENTER_V1_SURFACES.home_what_changed;

  return (
    <>
      <StatusCard surface={surface} />

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

      {surfaceId === "home_what_changed" ? <HomeSurface /> : <StatusCard surface={surface} />}

      {surfaceId === "weekly_decisions" && (
        <p style={{ marginTop: 16, maxWidth: 780, lineHeight: 1.6, opacity: 0.72 }}>
          The typed weekly decision contract is active as the authority boundary. Until exact legal lineup geometry and compatible calibrated weekly tail packets are supplied, its truthful outcome is <code>insufficient_evidence</code>.
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

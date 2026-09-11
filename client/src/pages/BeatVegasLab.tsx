const surfaces = [
  ["Market Tape", "FEED REQUIRED", "Book-level open/current history, best usable price, de-vigged probability dispersion, line ranges, and stale-book handling are implemented at the contract layer. Real quotes remain unavailable until an approved feed passes source-use gates."],
  ["Value Props", "MATH READY", "CCF fair odds, market fair probability, probability edge, EV/ROI, and exact bet-to price are defined. The layer emits evidence, not a pick."],
  ["Game Markets", "MATH READY", "The same pricing and audit foundation can support eligible totals, team totals, spreads, and moneylines once real evidence is validated."],
  ["Correlated Markets", "BLOCKED", "Same-game and multi-leg promotion requires a certified joint CCF outcome model. Independent marginal multiplication is not an acceptable substitute."],
  ["DFS Lab", "BLOCKED", "Promotion requires validated ownership, contest rules, joint outcomes, field generation, payout simulation, duplication modeling, and portfolio risk controls."],
  ["Tracker / Audit", "FOUNDATION", "Frozen decisions can be scored for Brier/log loss, market-relative accuracy, outcome-implied return, closing movement, and price quality without claiming a wager occurred."],
] as const;

export default function BeatVegasLab() {
  return (
    <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto", padding: "20px clamp(14px, 3vw, 28px) 48px" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.12em", opacity: 0.58 }}>COMMAND CENTER · MARKET VALIDATION LAB</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <h1 style={{ margin: 0, fontSize: "clamp(30px, 6vw, 46px)", lineHeight: 1.08 }}>Beat Vegas</h1>
          <span style={{ border: "1px solid rgba(255,255,255,0.2)", borderRadius: 999, padding: "5px 9px", fontSize: 11, letterSpacing: "0.1em", fontWeight: 700 }}>
            RESEARCH ONLY
          </span>
        </div>
        <p style={{ margin: "12px 0 0", maxWidth: 840, lineHeight: 1.65, opacity: 0.76 }}>
          CCF owns the football forecast. Sportsbook markets, DFS fields, and external signals are challengers and validation evidence—not hidden recommendation engines. Missing, ineligible, or stale evidence fails closed.
        </p>
      </header>

      <section aria-live="polite" style={{ border: "1px solid rgba(255,255,255,0.16)", borderRadius: 14, padding: 18, background: "rgba(255,255,255,0.035)", marginBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.12em", opacity: 0.64 }}>RECOMMENDATION AUTHORITY</div>
        <h2 style={{ margin: "7px 0 0", fontSize: 21 }}>Locked by design.</h2>
        <p style={{ margin: "9px 0 0", maxWidth: 840, lineHeight: 1.6, opacity: 0.76 }}>
          This surface does not claim a validated live odds feed, historical market replay, closing-line capture, calibrated market edge, or certified DFS field simulation. Those are promotion evidence, not assumptions.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Decision surfaces</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 12 }}>
          {surfaces.map(([title, status, detail]) => (
            <article key={title} style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.025)", minHeight: 168 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <h3 style={{ margin: 0, fontSize: 17 }}>{title}</h3>
                <span style={{ fontSize: 10, letterSpacing: "0.08em", opacity: 0.62, whiteSpace: "nowrap" }}>{status}</span>
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.6, opacity: 0.74 }}>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Promotion ladder</h2>
        {[
          ["RESEARCH", "Current. Contracts, deterministic math, tests, disconnected states, and historical research are allowed; action recommendations are not."],
          ["SHADOW", "Validated live evidence may run in parallel and be scored, but recommendation authority remains locked."],
          ["CERTIFIED", "Only surface-specific replay, calibration, provenance, and model gates can unlock recommendationAllowed=true."],
        ].map(([mode, detail], index) => (
          <div key={mode} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 120px) 1fr", gap: 14, padding: 14, marginBottom: 10, borderRadius: 10, border: index === 0 ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.09)", background: index === 0 ? "rgba(255,255,255,0.04)" : "transparent" }}>
            <strong style={{ fontSize: 12, letterSpacing: "0.08em" }}>{mode}</strong>
            <span style={{ fontSize: 13, lineHeight: 1.55, opacity: index === 0 ? 0.82 : 0.62 }}>{detail}</span>
          </div>
        ))}
      </section>

      <section>
        <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Inspect the whole price chain</h2>
        <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 16, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12, lineHeight: 1.7, opacity: 0.78, overflowX: "auto" }}>
          CCF probability → CCF fair odds → market de-vigged probability → offered odds → probability edge → expected ROI → bet-to price
        </div>
      </section>
    </div>
  );
}

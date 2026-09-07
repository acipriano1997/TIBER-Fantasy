import { Switch, Route, useLocation, Redirect } from "wouter";
import { useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import TiberLayout from "@/components/TiberLayout";
import Dashboard from "@/pages/Dashboard";
import TiberTiers from "@/pages/TiberTiers";
import SchedulePage from "@/pages/SchedulePage";
import DataLabHub from "@/pages/DataLabHub";
import ChatHomepage from "@/pages/ChatHomepage";
import PlayerPage from "@/pages/PlayerPage";
import ForgeTransparency from "@/pages/ForgeTransparency";
import ForgeLanding from "@/pages/ForgeLanding";
import ForgeHub from "@/pages/admin/ForgeHub";
import PlayerMapping from "@/pages/admin/PlayerMapping";
import PlayerMappingTest from "@/pages/admin/PlayerMappingTest";
import PlayerResearch from "@/pages/admin/PlayerResearch";
import ApiLexicon from "@/pages/admin/ApiLexicon";
import ForgeSimulation from "@/pages/admin/ForgeSimulation";
import ForgeLab from "@/pages/ForgeLab";
import RagStatus from "@/pages/RagStatus";
import WRRankingsSandbox from "@/pages/WRRankingsSandbox";
import QBRankingsSandbox from "@/pages/QBRankingsSandbox";
import XIntelligence from "@/pages/XIntelligence";
import Architecture from "@/pages/Architecture";
import MetricsDictionary from "@/pages/MetricsDictionary";
import ForgeWorkbench from "@/pages/ForgeWorkbench";
import PersonnelUsage from "@/pages/PersonnelUsage";
import RoleContextRankings from "@/pages/RoleContextRankings";
import SentinelDashboard from "@/pages/SentinelDashboard";
import ReceivingLab from "@/pages/ReceivingLab";
import RushingLab from "@/pages/RushingLab";
import QBLab from "@/pages/QBLab";
import SituationalLab from "@/pages/SituationalLab";
import BreakoutSignalsLab from "@/pages/BreakoutSignalsLab";
import RoleOpportunityLab from "@/pages/RoleOpportunityLab";
import AgeCurvesLab from "@/pages/AgeCurvesLab";
import PointScenariosLab from "@/pages/PointScenariosLab";
import PlayerResearchLab from "@/pages/PlayerResearchLab";
import TeamResearchLab from "@/pages/TeamResearchLab";
import DataLabCommandCenterLab from "@/pages/DataLabCommandCenterLab";
import TiberManagementDashboard from "@/pages/TiberManagementDashboard";
import TiberDraftReview from "@/pages/TiberDraftReview";
import CommandCenterV1 from "@/pages/CommandCenterV1";
import RecordsPage from "@/pages/RecordsPage";
import StressLab from "@/pages/StressLab";
import PostCutoffLedger from "@/pages/PostCutoffLedger";
import FantasyLab from "@/pages/FantasyLab";
import IdpLab from "@/pages/IdpLab";
import CatalystLab from "@/pages/CatalystLab";
import RookieBoard from "@/pages/RookieBoard";
import TiberClawPage from "@/pages/TiberClawPage";
import NotFound from "@/pages/not-found";

type RuntimeProfile = "full" | "public-draft-review";

function Router({ runtimeProfile }: { runtimeProfile: RuntimeProfile }) {
  if (runtimeProfile === "public-draft-review") {
    return (
      <Switch>
        <Route>
          {() => (
            <TiberLayout publicDraftReviewOnly>
              <Switch>
                <Route path="/draft-review" component={TiberDraftReview} />
                <Route>{() => <Redirect to="/draft-review" />}</Route>
              </Switch>
            </TiberLayout>
          )}
        </Route>
      </Switch>
    );
  }

  return (
    <Switch>
      {/* All routes share the unified dark TiberLayout shell */}
      <Route>
        {() => (
          <TiberLayout>
            <Switch>
              <Route path="/management" component={TiberManagementDashboard} />
              <Route path="/team-management" component={TiberManagementDashboard} />
              <Route path="/draft-review" component={TiberDraftReview} />
              <Route path="/records" component={RecordsPage} />
              <Route path="/command-center/weekly">
                {() => <CommandCenterV1 surfaceId="weekly_decisions" />}
              </Route>
              <Route path="/command-center/waivers">
                {() => <CommandCenterV1 surfaceId="waivers" />}
              </Route>
              <Route path="/command-center/trades">
                {() => <CommandCenterV1 surfaceId="trades" />}
              </Route>
              <Route path="/command-center">
                {() => <CommandCenterV1 surfaceId="home_what_changed" />}
              </Route>
              {/*
                Observatory surface (user-facing name). The implementation component is
                still named `StressLab` (legacy/internal name retained — see the naming
                boundary note in StressLab.tsx). `/`, `/observatory`, and `/stress-lab`
                (below) intentionally resolve to the same Observatory surface today;
                `/stress-lab` is a legacy alias. PR A (#264) is naming/route/copy-label
                hygiene only — no route rewrite.
              */}
              <Route path="/" component={StressLab} />
              <Route path="/observatory" component={StressLab} />
              {/* Observatory sub-surface: post-cutoff signal ledger intake/review (#297). */}
              <Route path="/observatory/post-cutoff-ledger" component={PostCutoffLedger} />
              <Route path="/dashboard" component={Dashboard} />
              {/* CANONICAL (current): user-visible rankings surface until Rankings v2 route wiring lands. */}
              <Route path="/tiers" component={TiberTiers} />
              <Route path="/rookies" component={RookieBoard} />
              <Route path="/tiber-data-lab" component={DataLabHub} />
              <Route path="/tiber-data-lab/personnel" component={PersonnelUsage} />
              <Route path="/tiber-data-lab/role-banks" component={RoleContextRankings} />
              <Route path="/tiber-data-lab/receiving" component={ReceivingLab} />
              <Route path="/tiber-data-lab/rushing" component={RushingLab} />
              <Route path="/tiber-data-lab/qb" component={QBLab} />
              <Route path="/tiber-data-lab/situational" component={SituationalLab} />
              <Route path="/tiber-data-lab/breakout-signals" component={BreakoutSignalsLab} />
              <Route path="/tiber-data-lab/role-opportunity" component={RoleOpportunityLab} />
              <Route path="/tiber-data-lab/age-curves" component={AgeCurvesLab} />
              <Route path="/tiber-data-lab/point-scenarios" component={PointScenariosLab} />
              <Route path="/tiber-data-lab/player-research" component={PlayerResearchLab} />
              <Route path="/tiber-data-lab/team-research" component={TeamResearchLab} />
              <Route path="/tiber-data-lab/command-center" component={DataLabCommandCenterLab} />
              {/* Legacy alias for the Observatory surface (see route note above). */}
              <Route path="/stress-lab" component={StressLab} />
              <Route path="/personnel">
                {() => <Redirect to="/tiber-data-lab/personnel" />}
              </Route>
              <Route path="/schedule" component={SchedulePage} />
              <Route path="/legacy-chat" component={ChatHomepage} />
              <Route path="/player/:playerId" component={PlayerPage} />
              <Route path="/forge" component={ForgeLanding} />
              <Route path="/forge/inspect" component={ForgeTransparency} />
              {/* CANONICAL alias: preserve legacy /rankings links while routing public traffic to /tiers. */}
              <Route path="/rankings">
                {() => <Redirect to="/tiers" />}
              </Route>
              <Route path="/x-intel" component={XIntelligence} />
              <Route path="/architecture" component={Architecture} />
              <Route path="/metrics-dictionary" component={MetricsDictionary} />
              <Route path="/forge-workbench" component={ForgeWorkbench} />
              <Route path="/fantasy-lab" component={FantasyLab} />
              <Route path="/idp-lab" component={IdpLab} />
              <Route path="/catalyst-lab" component={CatalystLab} />
              <Route path="/tiberclaw" component={TiberClawPage} />
              <Route path="/sentinel" component={SentinelDashboard} />
              <Route path="/admin/forge-hub" component={ForgeHub} />
              <Route path="/admin/player-mapping" component={PlayerMapping} />
              <Route path="/admin/player-mapping-test" component={PlayerMappingTest} />
              <Route path="/admin/player-research" component={PlayerResearch} />
              <Route path="/admin/api-lexicon" component={ApiLexicon} />
              <Route path="/admin/rag-status" component={RagStatus} />
              <Route path="/admin/forge-lab" component={ForgeLab} />
              <Route path="/admin/forge-simulation" component={ForgeSimulation} />
              {/* INTERNAL_ONLY: admin ranking formula sandboxes, not public rankings contract surfaces. */}
              <Route path="/admin/wr-rankings-sandbox" component={WRRankingsSandbox} />
              <Route path="/admin/qb-rankings-sandbox" component={QBRankingsSandbox} />
              <Route path="/dev/forge">
                {() => <Redirect to="/admin/forge-lab" />}
              </Route>
              <Route path="/admin">
                {() => <Redirect to="/admin/forge-hub" />}
              </Route>
              <Route component={NotFound} />
            </Switch>
          </TiberLayout>
        )}
      </Route>
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  const [runtimeProfile, setRuntimeProfile] = useState<RuntimeProfile | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/runtime-profile", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`runtime profile returned ${response.status}`);
        const body = await response.json() as { profile?: unknown };
        if (body.profile !== "full" && body.profile !== "public-draft-review") {
          throw new Error("runtime profile response was invalid");
        }
        if (active) setRuntimeProfile(body.profile);
      })
      // Fail closed to the public-only shell if the local capability endpoint is
      // unavailable or malformed. The server remains the security boundary.
      .catch(() => {
        if (active) setRuntimeProfile("public-draft-review");
      });
    return () => {
      active = false;
    };
  }, []);
  
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log(JSON.stringify({ src:'router', path: location, ts: Date.now() }));
    }
  }, [location]);
  
  return (
    <TooltipProvider>
      {runtimeProfile == null ? (
        <main className="tiber-main" aria-busy="true">Loading TIBER…</main>
      ) : (
        <Router runtimeProfile={runtimeProfile} />
      )}
      <Toaster />
    </TooltipProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
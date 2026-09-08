import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentNFLWeek } from '@/hooks/useCurrentNFLWeek';
import { BreakoutSignalBadge } from '@/components/BreakoutSignalBadge';
import {
  fetchBreakoutDraftTags,
  type BreakoutDraftTag,
} from '@/lib/breakoutDraftTags';
import { fetchForgeBatch } from '../api/forge';
import AlphaRankingsLayout from '../components/AlphaRankingsLayout';
import WRFormulaWeightsPanel from '../components/WRFormulaWeightsPanel';
import ForgeRankingsTable, { ForgeRow } from '../components/ForgeRankingsTable';
import ForgeTransparencyPanel from '../components/ForgeTransparencyPanel';
import type { ForgeScore } from '../types/forge';

interface WRSandboxPlayer {
  playerId: string;
  canonicalId: string;
  playerName: string;
  team: string;
  gamesPlayed: number;
  targets: number;
  fantasyPoints: number;
  pointsPerTarget: number;
  samplePenalty: number;
  adjustedEfficiency: number;
  volumeIndex: number;
  productionIndex: number;
  efficiencyIndex: number;
  stabilityIndex: number;
  alphaScore: number;
  forge_alpha_base: number;
  forge_alpha_env: number;
  forge_env_multiplier: number;
  forge_env_score_100: number | null;
  forge_matchup_score_100: number | null;
  forge_matchup_multiplier: number;
  forge_opponent: string | null;
  injuryStatus: string | null;
  injuryType: string | null;
  roleScore: number | null;
  roleTier: string | null;
  weightedTargetsPerGame: number | null;
  boomRate: number | null;
  bustRate: number | null;
}

interface SandboxResponse {
  success: boolean;
  players: WRSandboxPlayer[];
  season: number;
  count: number;
}

interface WRWeights {
  volume: number;
  production: number;
  efficiency: number;
  stability: number;
}

const DEFAULT_WEIGHTS: WRWeights = {
  volume: 50,
  production: 25,
  efficiency: 15,
  stability: 10,
};

export default function WRRankings() {
  const { season: currentSeason } = useCurrentNFLWeek();
  const [season, setSeason] = useState(new Date().getFullYear());

  useEffect(() => {
    setSeason(currentSeason);
  }, [currentSeason]);
  const [week, setWeek] = useState<number | null>(10);
  const [weights, setWeights] = useState<WRWeights>(DEFAULT_WEIGHTS);
  const [draftSignals, setDraftSignals] = useState<BreakoutDraftTag[]>([]);
  const [draftSignalSource, setDraftSignalSource] = useState<'certified' | 'provisional' | null>(null);
  
  const [forgeByPlayerId, setForgeByPlayerId] = useState<Record<string, ForgeScore>>({});
  const [forgeLoading, setForgeLoading] = useState(false);
  const [forgeError, setForgeError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<SandboxResponse>({
    queryKey: ['/api/admin/wr-rankings-sandbox', { season }],
    queryFn: () => fetch(`/api/admin/wr-rankings-sandbox?season=${season}`).then(res => res.json()),
  });

  useEffect(() => {
    let cancelled = false;
    const targetSeason = currentSeason;
    setDraftSignals([]);
    setDraftSignalSource(null);

    void fetchBreakoutDraftTags(targetSeason)
      .then((result) => {
        if (cancelled || result.status !== 'active' || result.targetSeason !== targetSeason) return;
        setDraftSignals(result.tags.slice().sort((a, b) =>
          (a.candidateRank ?? Number.MAX_SAFE_INTEGER) - (b.candidateRank ?? Number.MAX_SAFE_INTEGER),
        ));
        setDraftSignalSource(result.source);
      })
      .catch(() => {
        if (!cancelled) {
          setDraftSignals([]);
          setDraftSignalSource(null);
        }
      });

    return () => { cancelled = true; };
  }, [currentSeason]);

  useEffect(() => {
    const loadForge = async () => {
      try {
        setForgeLoading(true);
        setForgeError(null);
        const res = await fetchForgeBatch({ 
          position: 'WR', 
          limit: 500, 
          season, 
          week: week ?? 17 
        });
        const map: Record<string, ForgeScore> = {};
        for (const s of res.scores) {
          map[s.playerId] = s;
        }
        setForgeByPlayerId(map);
      } catch (err: any) {
        setForgeError(err.message ?? 'Failed to load FORGE WR scores');
      } finally {
        setForgeLoading(false);
      }
    };

    loadForge();
  }, [season, week]);

  const rows: ForgeRow[] = useMemo(() => {
    if (!data?.players) return [];
    
    const totalWeight = weights.volume + weights.production + weights.efficiency + weights.stability;
    const normalize = totalWeight > 0 ? 100 / totalWeight : 1;
    
    return data.players.map((player) => {
      const forge = forgeByPlayerId[player.canonicalId];
      
      const customAlpha = (
        (player.volumeIndex * weights.volume +
         player.productionIndex * weights.production +
         player.efficiencyIndex * weights.efficiency +
         player.stabilityIndex * weights.stability) * normalize / 100
      );
      
      return {
        playerId: player.playerId,
        canonicalId: player.canonicalId,
        playerName: player.playerName,
        team: player.team,
        gamesPlayed: player.gamesPlayed,
        sandboxAlpha: Math.round(customAlpha * 10) / 10,
        forgeAlpha: player.alphaScore ?? forge?.alpha,
        forgeAlphaBase: forge?.alphaBase,
        forgeRawAlpha: player.forge_alpha_base ?? forge?.rawAlpha,
        forgeConfidence: forge?.confidence,
        forgeTrajectory: forge?.trajectory,
        forgeEnvScore: player.forge_env_score_100,
        forgeEnvMultiplier: player.forge_env_multiplier,
        forgeMatchupScore: player.forge_matchup_score_100,
        forgeMatchupMultiplier: player.forge_matchup_multiplier,
        forgeOpponent: player.forge_opponent,
        sosRos: forge?.sosRos,
        sosNext3: forge?.sosNext3,
        sosPlayoffs: forge?.sosPlayoffs,
        sosMultiplier: forge?.sosMultiplier,
        injuryStatus: player.injuryStatus,
        extraColumns: {
          targets: player.targets,
          fp: player.fantasyPoints,
        },
      };
    });
  }, [data, forgeByPlayerId, weights]);

  if (error) {
    return (
      <AlphaRankingsLayout position="WR">
        <div className="bg-red-900/30 border border-red-500 rounded-lg p-4">
          <p className="text-red-400">Failed to load WR rankings data</p>
        </div>
      </AlphaRankingsLayout>
    );
  }

  return (
    <AlphaRankingsLayout 
      position="WR" 
      onRefresh={() => refetch()}
      isRefreshing={isLoading}
    >
      <WRFormulaWeightsPanel
        weights={weights}
        onWeightsChange={setWeights}
        defaultCollapsed={true}
      />

      {draftSignals.length > 0 ? (
        <section className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4" data-testid="draft-night-tier-jump-signals">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Draft-night evidence</div>
              <h2 className="mt-1 text-lg font-semibold text-white">2026 WR tier-jump signals</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
                Keep this panel open beside the ESPN draft room. Percentages are frozen model probabilities of moving into a better WR PPG tier in 2026; they are evidence, not automatic pick instructions.
              </p>
            </div>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
              draftSignalSource === 'certified'
                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                : 'border-dashed border-amber-300/50 bg-amber-400/10 text-amber-200'
            }`}>
              {draftSignalSource === 'certified' ? 'Certified' : 'Provisional research'}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {draftSignals.map((tag) => (
              <div key={`${tag.playerId ?? tag.playerName}-${tag.targetSeason}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-700/70 bg-slate-900/50 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{tag.playerName}</div>
                  <div className="text-[11px] text-slate-500">{tag.team ?? 'Team unavailable'} · signal #{tag.candidateRank ?? '—'}</div>
                </div>
                <BreakoutSignalBadge tag={tag} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ForgeRankingsTable
        position="WR"
        rows={rows}
        isLoading={isLoading}
        forgeLoading={forgeLoading}
        forgeError={forgeError}
        season={season}
        week={week}
        onSeasonChange={setSeason}
        onWeekChange={setWeek}
        extraColumnDefs={[
          { key: 'targets', label: 'Tgt' },
          { key: 'fp', label: 'FP', format: (v) => v?.toFixed(1) ?? '—' },
        ]}
      />

      <ForgeTransparencyPanel position="WR" />
    </AlphaRankingsLayout>
  );
}

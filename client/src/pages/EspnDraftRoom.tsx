import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Radio, ShieldCheck, WifiOff, X } from 'lucide-react';
import { BreakoutSignalBadge } from '@/components/BreakoutSignalBadge';
import { DraftBustSignalBadge } from '@/components/DraftBustSignalBadge';
import {
  fetchBreakoutDraftTags,
  findBreakoutDraftTag,
  type BreakoutDraftTag,
} from '@/lib/breakoutDraftTags';
import {
  fetchDraftBustTags,
  findDraftBustTag,
  type DraftBustTag,
} from '@/lib/draftBustTags';
import {
  clearEspnDraftBridgeAction,
  fetchEspnDraftBridgeStatus,
  requestEspnDraftPick,
  type EspnDraftBridgeStatus,
} from '@/lib/espnDraftBridge';
import {
  validateRankingsV2WeeklyResponse,
  type Position,
  type RankingsV2Item,
} from './tiberTiersV2Mapper';

const DRAFT_SEASON = 2026;
const POSITIONS: Position[] = ['WR', 'RB', 'TE', 'QB'];

function bridgeBlocker(status: EspnDraftBridgeStatus | null): string | null {
  if (!status?.connected || !status.page) return 'Open the ESPN draft room in Chrome with the TIBER Draft Bridge extension enabled.';
  if (status.page.draftPaused) return 'The ESPN draft is paused.';
  if (status.page.autopickEnabled) return 'Disable ESPN Autopick before using Command Center draft execution.';
  if (!status.page.onClock) return 'Waiting for your ESPN team to be on the clock.';
  if (status.page.secondsRemaining === null) return 'ESPN draft clock is unreadable. Use ESPN directly until the clock is visible.';
  if (status.page.secondsRemaining < status.minimumDraftSeconds) {
    return `Fewer than ${status.minimumDraftSeconds} seconds remain. Use ESPN directly for this pick.`;
  }
  if (status.page.enabledDraftButtons < 1) return 'ESPN is not exposing an enabled Draft control.';
  if (status.activeAction?.status === 'pending') return `Submitting ${status.activeAction.player.name} to ESPN…`;
  if (status.activeAction?.status === 'uncertain') return 'Previous pick is uncertain. Verify/complete that pick in ESPN before rearming Command Center.';
  return status.readyToDraft ? null : 'ESPN draft state is not ready for a guarded pick.';
}

function actionTone(status: EspnDraftBridgeStatus['activeAction']) {
  if (!status) return 'border-slate-700 bg-slate-950/60 text-slate-300';
  if (status.status === 'confirmed') return 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200';
  if (status.status === 'uncertain') return 'border-red-700/70 bg-red-950/45 text-red-100';
  if (status.status === 'pending') return 'border-amber-700/60 bg-amber-950/40 text-amber-100';
  return 'border-slate-700 bg-slate-950/60 text-slate-300';
}

export default function EspnDraftRoom() {
  const [position, setPosition] = useState<Position>('WR');
  const [players, setPlayers] = useState<RankingsV2Item[]>([]);
  const [rankingsLoading, setRankingsLoading] = useState(true);
  const [rankingsError, setRankingsError] = useState('');
  const [bridge, setBridge] = useState<EspnDraftBridgeStatus | null>(null);
  const [bridgeError, setBridgeError] = useState('');
  const [breakoutTags, setBreakoutTags] = useState<BreakoutDraftTag[]>([]);
  const [bustTags, setBustTags] = useState<DraftBustTag[]>([]);
  const [search, setSearch] = useState('');
  const [stagedPlayer, setStagedPlayer] = useState<RankingsV2Item | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const refresh = async () => {
      try {
        const status = await fetchEspnDraftBridgeStatus();
        if (!cancelled) {
          setBridge(status);
          setBridgeError('');
        }
      } catch (error) {
        if (!cancelled) {
          setBridge(null);
          setBridgeError(error instanceof Error ? error.message : 'ESPN draft bridge is unavailable.');
        }
      }
    };

    void refresh();
    timer = window.setInterval(() => { void refresh(); }, 500);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRankingsLoading(true);
    setRankingsError('');
    setPlayers([]);

    const params = new URLSearchParams({
      position,
      limit: '75',
      season: String(DRAFT_SEASON),
    });

    fetch(`/api/rankings/v2/weekly?${params.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? `Rankings returned HTTP ${response.status}.`);
        return validateRankingsV2WeeklyResponse(body);
      })
      .then((payload) => {
        if (!cancelled) setPlayers(payload.items);
      })
      .catch((error) => {
        if (!cancelled) setRankingsError(error instanceof Error ? error.message : 'Rankings are unavailable.');
      })
      .finally(() => {
        if (!cancelled) setRankingsLoading(false);
      });

    return () => { cancelled = true; };
  }, [position]);

  useEffect(() => {
    let cancelled = false;
    void fetchBreakoutDraftTags(DRAFT_SEASON)
      .then((result) => {
        if (!cancelled) setBreakoutTags(result.status === 'active' ? result.tags : []);
      })
      .catch(() => {
        if (!cancelled) setBreakoutTags([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchDraftBustTags(DRAFT_SEASON)
      .then((result) => {
        if (!cancelled) setBustTags(result.status === 'active' ? result.tags : []);
      })
      .catch(() => {
        if (!cancelled) setBustTags([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const action = bridge?.activeAction;
    if (!action || action.status === 'pending') return;
    if (action.status === 'confirmed') setStagedPlayer(null);
  }, [bridge?.activeAction?.actionId, bridge?.activeAction?.status]);

  const blocker = bridgeBlocker(bridge);
  const visiblePlayers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return players;
    return players.filter((player) => (
      player.playerName.toLowerCase().includes(needle)
      || (player.team ?? '').toLowerCase().includes(needle)
    ));
  }, [players, search]);

  function breakoutTagFor(player: RankingsV2Item) {
    return findBreakoutDraftTag(
      { canonicalPlayerId: player.playerId, name: player.playerName, team: player.team ?? null },
      breakoutTags,
    );
  }

  function bustTagFor(player: RankingsV2Item) {
    return findDraftBustTag(player.playerId, bustTags);
  }

  async function confirmDraft() {
    if (!stagedPlayer || blocker || submitting) return;
    setSubmitting(true);
    setActionError('');
    try {
      await requestEspnDraftPick({
        name: stagedPlayer.playerName,
        team: stagedPlayer.team ?? null,
        position: stagedPlayer.position ?? position,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'ESPN draft request failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function clearResolved() {
    setActionError('');
    try {
      await clearEspnDraftBridgeAction();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not clear ESPN draft state.');
    }
  }

  const stagedBustTag = stagedPlayer ? bustTagFor(stagedPlayer) : null;

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-7">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-2xl border border-slate-800 bg-[#111827] p-5 shadow-xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">Command Center · ESPN Draft</div>
              <h1 className="mt-1 text-3xl font-bold">Draft from Command Center.</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Keep the authenticated ESPN draft room open in a separate Chrome window. Command Center never receives your ESPN password or session cookies; the local bridge only validates and clicks ESPN&apos;s native Draft button after your explicit confirmation.
              </p>
            </div>
            <a
              href="https://fantasy.espn.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
            >
              Open ESPN <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className={`rounded-xl border p-4 ${bridge?.connected ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-red-800/60 bg-red-950/25'}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              {bridge?.connected ? <Radio className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}
              Bridge
            </div>
            <div className="mt-2 text-lg font-bold">{bridge?.connected ? 'Connected' : 'Disconnected'}</div>
            <div className="mt-1 text-xs text-slate-400">Local only · credentials retained: no</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">ESPN pick</div>
            <div className="mt-2 text-2xl font-bold">{bridge?.page?.currentPick ?? '—'}</div>
            <div className="mt-1 text-xs text-slate-400">{bridge?.page?.leagueId ? `League ${bridge.page.leagueId}` : 'League not detected'}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Clock</div>
            <div className={`mt-2 text-2xl font-bold ${(bridge?.page?.secondsRemaining ?? 99) < (bridge?.minimumDraftSeconds ?? 8) ? 'text-red-300' : ''}`}>
              {bridge?.page?.secondsRemaining ?? '—'}{bridge?.page?.secondsRemaining != null ? 's' : ''}
            </div>
            <div className="mt-1 text-xs text-slate-400">Execution locks below {bridge?.minimumDraftSeconds ?? 8}s</div>
          </div>
          <div className={`rounded-xl border p-4 ${bridge?.readyToDraft ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-slate-800 bg-[#111827]'}`}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
              <ShieldCheck className="h-4 w-4" /> Guard state
            </div>
            <div className="mt-2 text-lg font-bold">{bridge?.readyToDraft ? 'Armed for your pick' : 'Fail-closed'}</div>
            <div className="mt-1 text-xs text-slate-400">{bridge?.page?.onClock ? 'ESPN says you are on the clock' : 'Not on the clock'}</div>
          </div>
        </section>

        {(blocker || bridgeError) && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-700/60 bg-amber-950/35 px-4 py-3 text-sm text-amber-100" role="status">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{bridgeError || blocker}</span>
          </div>
        )}

        {bridge?.activeAction && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${actionTone(bridge.activeAction)}`} data-testid="espn-draft-action-status">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <strong>{bridge.activeAction.status.toUpperCase()}</strong> · Pick {bridge.activeAction.pickNumber} · {bridge.activeAction.player.name}
                {bridge.activeAction.reason ? <div className="mt-1 text-xs opacity-90">{bridge.activeAction.reason}</div> : null}
              </div>
              {bridge.activeAction.status !== 'pending' && bridge.activeAction.status !== 'uncertain' ? (
                <button type="button" onClick={() => void clearResolved()} className="rounded-lg border border-current/30 px-3 py-1.5 text-xs font-semibold">Clear</button>
              ) : null}
            </div>
          </div>
        )}

        {actionError && (
          <div className="rounded-xl border border-red-800/70 bg-red-950/35 px-4 py-3 text-sm text-red-100" role="alert">{actionError}</div>
        )}

        <section className="rounded-2xl border border-slate-800 bg-[#111827] p-4 md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {POSITIONS.map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => { setPosition(option); setStagedPlayer(null); }}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${position === option ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
                >
                  {option}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search player or team"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-purple-500 lg:w-80"
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
            {rankingsLoading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Loading 2026 {position} board…</div>
            ) : rankingsError ? (
              <div className="p-10 text-center text-red-300">{rankingsError}</div>
            ) : (
              <table className="w-full min-w-[860px]" data-testid="espn-draft-board">
                <thead className="bg-slate-950 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-3 text-center">#</th>
                    <th className="px-3 py-3 text-left">Player</th>
                    <th className="px-3 py-3 text-center">Team</th>
                    <th className="px-3 py-3 text-center">TIBER</th>
                    <th className="px-3 py-3 text-center">Value</th>
                    <th className="px-3 py-3 text-center">Signal</th>
                    <th className="px-3 py-3 text-right">ESPN action</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlayers.map((player, index) => {
                    const breakoutTag = breakoutTagFor(player);
                    const bustTag = bustTagFor(player);
                    const pending = bridge?.activeAction?.status === 'pending';
                    const unsafe = Boolean(blocker || pending || submitting || bridge?.activeAction?.status === 'uncertain');
                    return (
                      <tr key={`${player.identity?.sourceId ?? player.playerName}-${player.team ?? 'FA'}`} className="border-t border-slate-800 hover:bg-slate-900/35">
                        <td className="px-3 py-3 text-center font-mono text-sm text-slate-500">{index + 1}</td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-white">{player.playerName}</div>
                          <div className="text-xs text-slate-500">{player.position ?? position}{player.tier ? ` · ${player.tier}` : ''}</div>
                        </td>
                        <td className="px-3 py-3 text-center text-sm text-slate-300">{player.team ?? 'FA'}</td>
                        <td className="px-3 py-3 text-center font-mono text-sm text-slate-100">{player.score?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-3 text-center font-mono text-sm text-slate-100">{player.value?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            <BreakoutSignalBadge tag={breakoutTag} />
                            <DraftBustSignalBadge tag={bustTag} playerName={player.playerName} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            disabled={unsafe}
                            onClick={() => { setActionError(''); setStagedPlayer(player); }}
                            className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                            data-testid={`stage-espn-pick-${player.identity?.sourceId ?? index}`}
                          >
                            Draft
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {stagedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Confirm ESPN draft pick">
          <div className="w-full max-w-lg rounded-2xl border border-purple-700/60 bg-[#111827] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">Final confirmation</div>
                <h2 className="mt-1 text-2xl font-bold">Draft {stagedPlayer.playerName}?</h2>
                <p className="mt-1 text-sm text-slate-400">{stagedPlayer.team ?? 'FA'} · {stagedPlayer.position ?? position} · ESPN pick {bridge?.page?.currentPick ?? '—'}</p>
                {stagedBustTag ? (
                  <div className="mt-2">
                    <DraftBustSignalBadge tag={stagedBustTag} playerName={stagedPlayer.playerName} />
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={() => setStagedPlayer(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Cancel draft confirmation"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-4 rounded-xl border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-100">
              Confirming will send one local action to the ESPN bridge. It will re-check that you are on the clock, re-check this exact player, and click ESPN&apos;s native Draft button once. TIBER cannot undo an ESPN pick.
            </div>

            {blocker ? <div className="mt-3 text-sm text-red-300">{blocker}</div> : null}

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setStagedPlayer(null)} className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-semibold text-slate-200">Cancel</button>
              <button
                type="button"
                disabled={Boolean(blocker || submitting)}
                onClick={() => void confirmDraft()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                data-testid="confirm-espn-pick"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm ESPN Pick
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

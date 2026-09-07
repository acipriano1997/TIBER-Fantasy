import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Crown, Flame, History, Medal, RefreshCw, ShieldCheck, Trophy, Users } from 'lucide-react';

type Tab = 'legacy' | 'records' | 'managers' | 'rivalries' | 'seasons' | 'achievements';

type Career = {
  managerId: string;
  displayName: string;
  seasons: number;
  championships: number;
  finals: number;
  playoffAppearances: number;
  regularSeasonTitles: number;
  pointsTitles: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number | null;
  pointsFor: number;
  pointsAgainst: number;
  bestWeeklyScore: number | null;
  longestWinStreak: number;
  currentWinStreak: number;
};

type RecordOccurrence = {
  recordId: string;
  label: string;
  scope: 'league_series' | 'scoring_era';
  scoringEraId: string | null;
  value: number;
  unit: 'points' | 'games' | 'count';
  managerId: string | null;
  displayName: string | null;
  opponentManagerId: string | null;
  season: string | null;
  week: number | null;
  leagueId: string | null;
  matchupId: number | null;
  provenance: { definition: string; source: 'sleeper' };
};

type Achievement = {
  achievementId: string;
  label: string;
  description: string;
  managerId: string;
  displayName: string;
  season: string | null;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  earnedByManagers: number;
  eligibleManagers: number;
};

type Rivalry = {
  managerAId: string;
  managerBId: string;
  managerAName: string;
  managerBName: string;
  games: number;
  managerAWins: number;
  managerBWins: number;
  ties: number;
  managerAPoints: number;
  managerBPoints: number;
  playoffGames: number;
  closestMargin: number | null;
  largestMargin: number | null;
  firstMeeting: { season: string; week: number } | null;
  lastMeeting: { season: string; week: number } | null;
};

type Almanac = {
  leagueId: string;
  season: string;
  name: string;
  scoringEraId: string;
  championManagerId: string | null;
  championName: string | null;
  runnerUpName: string | null;
  regularSeasonChampionName: string | null;
  pointsLeaderName: string | null;
  highestWeeklyScore: number | null;
  highestWeeklyScoreManagerName: string | null;
  coverageComplete: boolean;
};

type RecordsPayload = {
  success: true;
  generatedAt: string;
  currentLeagueId: string;
  leagueName: string;
  managers: Array<{ userId: string; displayName: string; seasons: string[] }>;
  careers: Career[];
  records: RecordOccurrence[];
  rivalries: Rivalry[];
  achievements: Achievement[];
  almanac: Almanac[];
  recordWatch: Array<{
    recordId: string;
    label: string;
    managerId: string;
    displayName: string;
    currentValue: number;
    recordValue: number;
    distance: number;
    scoringEraId: string | null;
  }>;
  scoringEras: Array<{ id: string; fingerprint: string; seasons: string[]; isCurrent: boolean }>;
  coverage: {
    complete: boolean;
    seasonsRequested: number;
    seasonsLoaded: number;
    diagnostics: Array<{ leagueId: string; season?: string; code: string; message: string }>;
  };
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'legacy', label: 'My Legacy' },
  { id: 'records', label: 'Record Book' },
  { id: 'managers', label: 'Managers' },
  { id: 'rivalries', label: 'Rivalries' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'achievements', label: 'Achievements' },
];

function fmtNumber(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtPct(value: number | null) {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function recordValue(record: RecordOccurrence) {
  if (record.unit === 'points') return fmtNumber(record.value);
  return String(record.value);
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export default function RecordsPage() {
  const [leagueId, setLeagueId] = useState(() => localStorage.getItem('tiber.records.leagueId') ?? '');
  const [loadedLeagueId, setLoadedLeagueId] = useState('');
  const [data, setData] = useState<RecordsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('legacy');
  const [managerId, setManagerId] = useState('');
  const [eraId, setEraId] = useState('');

  const load = async (targetLeagueId: string, refresh = false) => {
    const normalized = targetLeagueId.trim();
    if (!normalized) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/league-records?league_id=${encodeURIComponent(normalized)}${refresh ? '&refresh=1' : ''}`, {
        headers: { Accept: 'application/json' },
      });
      const body = await response.json();
      if (!response.ok || !body?.success) throw new Error(body?.error || `Records API returned ${response.status}`);
      const payload = body as RecordsPayload;
      setData(payload);
      setLoadedLeagueId(normalized);
      localStorage.setItem('tiber.records.leagueId', normalized);
      setManagerId((current) => current && payload.careers.some((row) => row.managerId === current) ? current : payload.careers[0]?.managerId ?? '');
      setEraId(payload.scoringEras.find((era) => era.isCurrent)?.id ?? payload.scoringEras[0]?.id ?? '');
    } catch (err) {
      setError((err as Error).message || 'Unable to load Sleeper league records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leagueId) void load(leagueId);
    // Intentionally load the persisted league only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCareer = data?.careers.find((row) => row.managerId === managerId) ?? null;
  const selectedAchievements = useMemo(
    () => data?.achievements.filter((achievement) => achievement.managerId === managerId) ?? [],
    [data, managerId],
  );
  const selectedRivalries = useMemo(() => {
    if (!data || !managerId) return [];
    return data.rivalries
      .filter((rivalry) => rivalry.managerAId === managerId || rivalry.managerBId === managerId)
      .sort((a, b) => b.games - a.games);
  }, [data, managerId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void load(leagueId);
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 pb-14">
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-950 to-amber-950/20 p-5 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">
              <Trophy size={15} /> Fantasy History & Legacy
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Records</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              A reconstructable record book built from Sleeper league history. Manager identity follows Sleeper user IDs, while roster ownership remains season-specific so orphan takeovers never inherit another manager's accomplishments.
            </p>
          </div>
          <form onSubmit={submit} className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="records-league-id">Sleeper league ID</label>
            <input
              id="records-league-id"
              value={leagueId}
              onChange={(event) => setLeagueId(event.target.value)}
              placeholder="Current Sleeper league ID"
              className="min-h-11 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
            />
            <button
              type="submit"
              disabled={loading || !leagueId.trim()}
              className="min-h-11 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Loading history…' : 'Load record book'}
            </button>
          </form>
        </div>
      </section>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <div><div className="font-semibold">History unavailable</div><div className="mt-1 text-red-200/75">{error}</div></div>
        </div>
      ) : null}

      {!data ? (
        <EmptyState>Enter the current Sleeper league ID. The server will follow its historical league lineage backward and build the available record book.</EmptyState>
      ) : (
        <>
          <section className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-100">{data.leagueName}</div>
              <div className="mt-1 text-xs text-slate-500">
                {data.coverage.seasonsLoaded} reconstructed season{data.coverage.seasonsLoaded === 1 ? '' : 's'} · generated {new Date(data.generatedAt).toLocaleString()}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="text-xs uppercase tracking-[0.12em] text-slate-500" htmlFor="records-manager">View manager</label>
              <select
                id="records-manager"
                value={managerId}
                onChange={(event) => setManagerId(event.target.value)}
                className="min-h-10 min-w-52 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-slate-200"
              >
                {data.careers.map((career) => <option key={career.managerId} value={career.managerId}>{career.displayName}</option>)}
              </select>
              <button
                onClick={() => void load(loadedLeagueId, true)}
                disabled={loading}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </section>

          {!data.coverage.complete ? (
            <section className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-200"><AlertTriangle size={16} /> Partial historical coverage</div>
              <p className="mt-1 text-xs leading-5 text-amber-100/65">Records are derived only from Sleeper facts that were actually available. Missing weeks or seasons are not imputed.</p>
              <div className="mt-3 space-y-1 text-xs text-amber-100/55">
                {data.coverage.diagnostics.slice(0, 5).map((diagnostic, index) => <div key={`${diagnostic.leagueId}-${index}`}>{diagnostic.season ? `${diagnostic.season}: ` : ''}{diagnostic.message}</div>)}
              </div>
            </section>
          ) : (
            <div className="flex items-center gap-2 text-xs text-emerald-400/80"><ShieldCheck size={15} /> Sleeper history loaded without detected coverage gaps.</div>
          )}

          {data.recordWatch.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><Flame size={16} className="text-orange-400" /> Record Watch</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {data.recordWatch.slice(0, 4).map((item) => (
                  <div key={`${item.recordId}-${item.managerId}`} className="rounded-xl border border-orange-400/15 bg-orange-500/[0.045] p-4">
                    <div className="text-xs uppercase tracking-[0.12em] text-orange-300/70">{item.label}</div>
                    <div className="mt-2 font-semibold text-slate-100">{item.displayName}</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{fmtNumber(item.currentValue)}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.distance === 0 ? 'Current record holder' : `${fmtNumber(item.distance)} away from ${fmtNumber(item.recordValue)}`}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="overflow-x-auto border-b border-white/10">
            <div className="flex min-w-max gap-1">
              {tabs.map((item) => (
                <button key={item.id} onClick={() => setTab(item.id)} className={`border-b-2 px-4 py-3 text-sm transition ${tab === item.id ? 'border-amber-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {tab === 'legacy' && selectedCareer ? (
            <section className="space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div><div className="text-xs uppercase tracking-[0.14em] text-slate-500">Manager legacy</div><h2 className="mt-1 text-2xl font-semibold text-white">{selectedCareer.displayName}</h2></div>
                <div className="text-sm text-slate-500">{selectedCareer.seasons} season{selectedCareer.seasons === 1 ? '' : 's'} reconstructed</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                <Stat label="Championships" value={selectedCareer.championships} />
                <Stat label="Finals" value={selectedCareer.finals} />
                <Stat label="Playoffs" value={selectedCareer.playoffAppearances} />
                <Stat label="Career record" value={`${selectedCareer.wins}-${selectedCareer.losses}${selectedCareer.ties ? `-${selectedCareer.ties}` : ''}`} sub={fmtPct(selectedCareer.winPct)} />
                <Stat label="Best week" value={fmtNumber(selectedCareer.bestWeeklyScore)} />
                <Stat label="Win streak" value={selectedCareer.longestWinStreak} />
              </div>
              <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Trophy size={16} className="text-amber-400" /> Trophy cabinet</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {selectedAchievements.length ? selectedAchievements.slice(0, 12).map((achievement, index) => (
                      <div key={`${achievement.achievementId}-${achievement.season ?? 'career'}-${index}`} className="rounded-lg border border-white/10 p-3">
                        <div className="flex items-start justify-between gap-3"><div className="font-medium text-slate-100">{achievement.label}</div><span className="text-[10px] uppercase tracking-wider text-amber-300/70">{achievement.rarity}</span></div>
                        <div className="mt-1 text-xs text-slate-500">{achievement.season ?? 'Career'} · {achievement.description}</div>
                      </div>
                    )) : <div className="text-sm text-slate-500">No qualifying achievements in reconstructed history yet.</div>}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
                  <div className="text-sm font-semibold text-slate-200">Career context</div>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-slate-500">Points scored</dt><dd className="font-medium text-slate-200">{fmtNumber(selectedCareer.pointsFor)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-slate-500">Points against</dt><dd className="font-medium text-slate-200">{fmtNumber(selectedCareer.pointsAgainst)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-slate-500">Regular-season titles</dt><dd className="font-medium text-slate-200">{selectedCareer.regularSeasonTitles}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-slate-500">Points titles</dt><dd className="font-medium text-slate-200">{selectedCareer.pointsTitles}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-slate-500">Current win streak</dt><dd className="font-medium text-slate-200">{selectedCareer.currentWinStreak}</dd></div>
                  </dl>
                </div>
              </div>
            </section>
          ) : null}

          {tab === 'records' ? (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div><div className="text-xs uppercase tracking-[0.14em] text-slate-500">League record book</div><h2 className="mt-1 text-2xl font-semibold text-white">All-time & era records</h2></div>
                <div><label className="mb-1 block text-xs text-slate-500" htmlFor="records-era">Scoring era for weekly scores</label><select id="records-era" value={eraId} onChange={(event) => setEraId(event.target.value)} className="min-h-10 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-slate-200">{data.scoringEras.map((era) => <option key={era.id} value={era.id}>{era.seasons.join('–')}{era.isCurrent ? ' · current' : ''}</option>)}</select></div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02]">
                {(data.records.filter((record) => record.scope === 'league_series' || record.scoringEraId === eraId)).map((record) => (
                  <div key={`${record.recordId}-${record.scoringEraId ?? 'series'}`} className="grid gap-2 border-b border-white/5 px-4 py-4 last:border-0 sm:grid-cols-[1.35fr_.8fr_.55fr] sm:items-center">
                    <div><div className="font-medium text-slate-200">{record.label}</div><div className="mt-1 text-xs text-slate-600">{record.scope === 'scoring_era' ? 'Scoring-era record' : 'League-series record'} · {record.provenance.definition}</div></div>
                    <div className="text-sm text-slate-400">{record.displayName ?? 'Unknown manager'}{record.season ? <span className="text-slate-600"> · {record.season} W{record.week}</span> : null}</div>
                    <div className="text-left text-xl font-semibold text-white sm:text-right">{recordValue(record)}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-5 text-slate-600">Raw weekly-point records are scoped to a scoring era fingerprint. Career counting records span the reconstructed league series. This prevents a scoring-settings change from silently rewriting historical comparability.</p>
            </section>
          ) : null}

          {tab === 'managers' ? (
            <section className="space-y-4">
              <div className="flex items-center gap-2"><Users size={17} className="text-sky-400" /><h2 className="text-xl font-semibold text-white">All-time managers</h2></div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[850px] text-sm">
                  <thead className="bg-white/[0.035] text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Manager</th><th>Seasons</th><th>Titles</th><th>Finals</th><th>Playoffs</th><th>Record</th><th>Win %</th><th className="pr-4 text-right">PF</th></tr></thead>
                  <tbody>{data.careers.map((career) => <tr key={career.managerId} onClick={() => { setManagerId(career.managerId); setTab('legacy'); }} className="cursor-pointer border-t border-white/5 text-slate-300 hover:bg-white/[0.025]"><td className="px-4 py-3 font-medium text-slate-100">{career.displayName}</td><td>{career.seasons}</td><td>{career.championships}</td><td>{career.finals}</td><td>{career.playoffAppearances}</td><td>{career.wins}-{career.losses}{career.ties ? `-${career.ties}` : ''}</td><td>{fmtPct(career.winPct)}</td><td className="pr-4 text-right">{fmtNumber(career.pointsFor)}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="text-xs text-slate-600">Click a manager to open that manager's Legacy view. Rankings are factual columns rather than a hidden composite legacy score.</div>
            </section>
          ) : null}

          {tab === 'rivalries' ? (
            <section className="space-y-4">
              <div><div className="text-xs uppercase tracking-[0.14em] text-slate-500">Head-to-head history</div><h2 className="mt-1 text-2xl font-semibold text-white">{selectedCareer?.displayName ?? 'Manager'} rivalries</h2></div>
              {selectedRivalries.length ? <div className="grid gap-3 lg:grid-cols-2">{selectedRivalries.map((rivalry) => {
                const selectedIsA = rivalry.managerAId === managerId;
                const opponent = selectedIsA ? rivalry.managerBName : rivalry.managerAName;
                const wins = selectedIsA ? rivalry.managerAWins : rivalry.managerBWins;
                const losses = selectedIsA ? rivalry.managerBWins : rivalry.managerAWins;
                const pointsFor = selectedIsA ? rivalry.managerAPoints : rivalry.managerBPoints;
                const pointsAgainst = selectedIsA ? rivalry.managerBPoints : rivalry.managerAPoints;
                return <div key={`${rivalry.managerAId}-${rivalry.managerBId}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-xs uppercase tracking-wider text-slate-500">vs.</div><div className="mt-1 text-lg font-semibold text-slate-100">{opponent}</div></div><div className="text-right"><div className="text-2xl font-semibold text-white">{wins}-{losses}{rivalry.ties ? `-${rivalry.ties}` : ''}</div><div className="text-xs text-slate-500">{rivalry.games} meetings</div></div></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div className="rounded-lg bg-black/15 p-3 text-slate-500">Points<div className="mt-1 text-sm font-medium text-slate-200">{fmtNumber(pointsFor)}–{fmtNumber(pointsAgainst)}</div></div><div className="rounded-lg bg-black/15 p-3 text-slate-500">Playoff meetings<div className="mt-1 text-sm font-medium text-slate-200">{rivalry.playoffGames}</div></div><div className="rounded-lg bg-black/15 p-3 text-slate-500">Closest<div className="mt-1 text-sm font-medium text-slate-200">{fmtNumber(rivalry.closestMargin)}</div></div><div className="rounded-lg bg-black/15 p-3 text-slate-500">Largest margin<div className="mt-1 text-sm font-medium text-slate-200">{fmtNumber(rivalry.largestMargin)}</div></div></div>{rivalry.firstMeeting && rivalry.lastMeeting ? <div className="mt-3 text-xs text-slate-600">First: {rivalry.firstMeeting.season} W{rivalry.firstMeeting.week} · Latest: {rivalry.lastMeeting.season} W{rivalry.lastMeeting.week}</div> : null}</div>;
              })}</div> : <EmptyState>No head-to-head games found for this manager in reconstructed history.</EmptyState>}
            </section>
          ) : null}

          {tab === 'seasons' ? (
            <section className="space-y-4">
              <div className="flex items-center gap-2"><History size={17} className="text-violet-400" /><h2 className="text-xl font-semibold text-white">Season Almanac</h2></div>
              <div className="grid gap-3 xl:grid-cols-2">{data.almanac.map((season) => <div key={season.leagueId} className="rounded-xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-2xl font-semibold text-white">{season.season}</div><div className="text-xs text-slate-600">Sleeper league {season.leagueId}</div></div>{season.coverageComplete ? <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-300">complete</span> : <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-wider text-amber-300">partial</span>}</div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-black/15 p-3"><div className="text-xs text-slate-500">Champion</div><div className="mt-1 font-medium text-amber-200">{season.championName ?? 'Unavailable'}</div></div><div className="rounded-lg bg-black/15 p-3"><div className="text-xs text-slate-500">Runner-up</div><div className="mt-1 font-medium text-slate-200">{season.runnerUpName ?? 'Unavailable'}</div></div><div className="rounded-lg bg-black/15 p-3"><div className="text-xs text-slate-500">Regular-season leader</div><div className="mt-1 font-medium text-slate-200">{season.regularSeasonChampionName ?? 'Unavailable'}</div></div><div className="rounded-lg bg-black/15 p-3"><div className="text-xs text-slate-500">Points leader</div><div className="mt-1 font-medium text-slate-200">{season.pointsLeaderName ?? 'Unavailable'}</div></div></div><div className="mt-3 text-xs text-slate-500">High week: <span className="text-slate-300">{fmtNumber(season.highestWeeklyScore)}</span>{season.highestWeeklyScoreManagerName ? ` · ${season.highestWeeklyScoreManagerName}` : ''}</div></div>)}</div>
            </section>
          ) : null}

          {tab === 'achievements' ? (
            <section className="space-y-4">
              <div className="flex items-center gap-2"><Medal size={17} className="text-amber-400" /><h2 className="text-xl font-semibold text-white">Achievement ledger</h2></div>
              <p className="text-sm text-slate-500">Achievements commemorate reconstructed events; rarity is based on how many historical managers earned the achievement, not an arbitrary badge tier.</p>
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{data.achievements.map((achievement, index) => <button key={`${achievement.achievementId}-${achievement.managerId}-${achievement.season ?? 'career'}-${index}`} onClick={() => { setManagerId(achievement.managerId); setTab('legacy'); }} className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.04]"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-2"><Crown size={15} className="text-amber-400" /><span className="font-medium text-slate-100">{achievement.label}</span></div><span className="text-[10px] uppercase tracking-wider text-amber-300/70">{achievement.rarity}</span></div><div className="mt-3 text-sm font-medium text-slate-300">{achievement.displayName}{achievement.season ? ` · ${achievement.season}` : ''}</div><div className="mt-1 text-xs leading-5 text-slate-500">{achievement.description}</div><div className="mt-3 text-[11px] text-slate-600">Earned by {achievement.earnedByManagers} of {achievement.eligibleManagers} reconstructed managers</div></button>)}</div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

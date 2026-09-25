// server/data/newsIntelligence.ts
//
// NEWS-001 structured news-intelligence contracts and fail-closed helpers.
// This module is an evidence/normalization layer only. It does not own
// projections, rankings, lineup decisions, or other CCF recommendation logic.

import { createHash } from 'node:crypto';

export type NewsEventFamily =
  | 'PLAYER_TEAM_NEWS'
  | 'OFF_TREND'
  | 'DEF_TREND'
  | 'INJURY'
  | 'ROLE_OPPORTUNITY'
  | 'TRANSACTION'
  | 'SOURCE_CORRECTION';

export type NewsCheckLane = 'OFF_TREND' | 'DEF_TREND' | 'INJURY';

export type EvidenceState =
  | 'CURRENT'
  | 'MISSING'
  | 'STALE'
  | 'ERROR'
  | 'CONFLICTED';

export type NewsCheckStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'MISSING'
  | 'STALE'
  | 'ERROR'
  | 'CONFLICTED';

export type ConfirmationState =
  | 'CONFIRMED_OFFICIAL'
  | 'CONFIRMED_MULTI_SOURCE'
  | 'CREDIBLE_SINGLE_SOURCE'
  | 'COACH_STATEMENT'
  | 'MEDIA_REPORT'
  | 'SPECULATIVE'
  | 'CONFLICTED';

export type MaterialityTier = 'M0' | 'M1' | 'M2' | 'M3';

export type RecordQuality =
  | 'RAW'
  | 'VALIDATED'
  | 'NORMALIZED'
  | 'DECISION_GRADE'
  | 'QUARANTINED'
  | 'REJECTED';

export type TrendRegimeState =
  | 'OBSERVATION'
  | 'DEVELOPING'
  | 'ESTABLISHED'
  | 'REGIME_CHANGE_CANDIDATE';

export type PracticeParticipation = 'DNP' | 'LP' | 'FP' | null;
export type GameDesignation = 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'NONE' | null;
export type AvailabilityState =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'IR'
  | 'PUP'
  | 'NFI'
  | 'UNKNOWN'
  | null;

export interface NewsSourceRef {
  sourceId: string;
  sourceClass: string;
  sourceRole?: string;
  sourceAncestryId?: string;
}

export interface NewsEvidenceEvent {
  eventId: string;
  schemaVersion: 'news-intel-v0';
  family: NewsEventFamily;

  playerIds?: string[];
  teamIds?: string[];
  gameIds?: string[];

  headline?: string;
  summary?: string;

  metric?: string;
  previousState?: unknown;
  currentState?: unknown;
  direction?: 'UP' | 'DOWN' | 'MIXED' | 'UNCHANGED' | 'UNKNOWN';

  source: NewsSourceRef;

  observedAt?: string;
  publishedAt?: string;
  updatedAt?: string;
  retrievedAt: string;
  knownAt: string;
  validFrom?: string;
  validTo?: string;

  evidenceState: EvidenceState;
  confirmation: ConfirmationState;
  recordQuality: RecordQuality;
  confidence?: number;
  conflictState?: string;

  sampleGames?: number;
  opponentContext?: string;
  gameScriptContext?: string;
  trendRegime?: TrendRegimeState;

  affectedEntities?: string[];
  dependencyTags?: string[];
  materiality: MaterialityTier;

  rawTraceRef?: string;
  replayEligible: boolean;
}

export interface InjuryState {
  injuryEvent?: string | null;
  bodyArea?: string | null;
  practiceParticipation?: PracticeParticipation;
  gameDesignation?: GameDesignation;
  availability?: AvailabilityState;
  inGameStatus?: 'EXITED' | 'RETURNED' | 'LIMITED' | 'UNKNOWN' | null;
  procedureOrImaging?: string | null;
  expectedReturnWindow?: string | null;
  workloadRestriction?: string | null;
}

export interface NewsCheckLaneResult {
  lane: NewsCheckLane;
  checkedAt: string;
  status: NewsCheckStatus;
  eventIds: string[];
  eventCount: number;
  materialEventCount: number;
  decisionGradeEventCount: number;
  highestMateriality: MaterialityTier;
}

export interface NewsIntelligenceCheck {
  schemaVersion: 'news-check-v0';
  asOf: string;
  lanes: Record<NewsCheckLane, NewsCheckLaneResult>;
  events: NewsEvidenceEvent[];
}

export interface BuildNewsCheckOptions {
  asOf?: string;
  laneStatuses?: Partial<Record<NewsCheckLane, NewsCheckStatus>>;
}

export type NewsCadenceState = 'COLD' | 'COOL' | 'WARM' | 'HOT' | 'LIVE';

export const DEFAULT_NEWS_CADENCE_MINUTES: Readonly<
  Record<Exclude<NewsCadenceState, 'LIVE'>, number>
> = {
  COLD: 360,
  COOL: 60,
  WARM: 15,
  HOT: 5,
};

const MATERIALITY_ORDER: Record<MaterialityTier, number> = {
  M0: 0,
  M1: 1,
  M2: 2,
  M3: 3,
};

function highestMateriality(events: NewsEvidenceEvent[]): MaterialityTier {
  return events.reduce<MaterialityTier>((highest, event) => {
    return MATERIALITY_ORDER[event.materiality] > MATERIALITY_ORDER[highest]
      ? event.materiality
      : highest;
  }, 'M0');
}

function laneForFamily(family: NewsEventFamily): NewsCheckLane | null {
  if (family === 'OFF_TREND') return 'OFF_TREND';
  if (family === 'DEF_TREND') return 'DEF_TREND';
  if (family === 'INJURY') return 'INJURY';
  return null;
}

export function buildNewsIntelligenceCheck(
  events: NewsEvidenceEvent[],
  options: BuildNewsCheckOptions = {},
): NewsIntelligenceCheck {
  const asOf = options.asOf ?? new Date().toISOString();
  const dedupedEvents = dedupeNewsEventsByAncestry(events);

  const lanes = (['OFF_TREND', 'DEF_TREND', 'INJURY'] as NewsCheckLane[]).reduce(
    (result, lane) => {
      const laneEvents = dedupedEvents.filter(event => laneForFamily(event.family) === lane);
      result[lane] = {
        lane,
        checkedAt: asOf,
        status: options.laneStatuses?.[lane] ?? 'COMPLETE',
        eventIds: laneEvents.map(event => event.eventId),
        eventCount: laneEvents.length,
        materialEventCount: laneEvents.filter(event => event.materiality === 'M2' || event.materiality === 'M3').length,
        decisionGradeEventCount: laneEvents.filter(event => event.recordQuality === 'DECISION_GRADE').length,
        highestMateriality: highestMateriality(laneEvents),
      };
      return result;
    },
    {} as Record<NewsCheckLane, NewsCheckLaneResult>,
  );

  return {
    schemaVersion: 'news-check-v0',
    asOf,
    lanes,
    events: dedupedEvents,
  };
}

function eventSortTimestamp(event: NewsEvidenceEvent): number {
  const raw = event.updatedAt ?? event.publishedAt ?? event.knownAt ?? event.retrievedAt;
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : 0;
}

export function dedupeNewsEventsByAncestry(
  events: NewsEvidenceEvent[],
): NewsEvidenceEvent[] {
  const byRoot = new Map<string, NewsEvidenceEvent>();

  for (const event of events) {
    const root = event.source.sourceAncestryId ?? event.eventId;
    const existing = byRoot.get(root);
    if (!existing || eventSortTimestamp(event) >= eventSortTimestamp(existing)) {
      byRoot.set(root, event);
    }
  }

  return [...byRoot.values()].sort((a, b) => eventSortTimestamp(a) - eventSortTimestamp(b));
}

export function filterReplayEligibleNews(
  events: NewsEvidenceEvent[],
  replayAsOf: string,
): NewsEvidenceEvent[] {
  const replayTime = Date.parse(replayAsOf);
  if (!Number.isFinite(replayTime)) return [];

  return events.filter(event => {
    if (!event.replayEligible) return false;
    const knownAt = Date.parse(event.knownAt);
    return Number.isFinite(knownAt) && knownAt <= replayTime;
  });
}

export function deriveTrendRegime(sampleGames: number): TrendRegimeState {
  if (!Number.isFinite(sampleGames) || sampleGames <= 1) return 'OBSERVATION';
  if (sampleGames === 2) return 'DEVELOPING';
  return 'ESTABLISHED';
}

export function deriveInjuryMateriality(
  previous: InjuryState | null,
  current: InjuryState,
): MaterialityTier {
  if (
    current.availability === 'INACTIVE' ||
    current.availability === 'IR' ||
    current.availability === 'PUP' ||
    current.availability === 'NFI' ||
    current.gameDesignation === 'OUT'
  ) {
    return 'M3';
  }

  if (
    current.gameDesignation === 'DOUBTFUL' ||
    current.practiceParticipation === 'DNP' ||
    (previous?.practiceParticipation === 'FP' && current.practiceParticipation === 'LP')
  ) {
    return 'M2';
  }

  if (
    current.gameDesignation === 'QUESTIONABLE' ||
    current.practiceParticipation === 'LP' ||
    previous?.practiceParticipation !== current.practiceParticipation ||
    previous?.gameDesignation !== current.gameDesignation
  ) {
    return 'M1';
  }

  return 'M0';
}

export function sortNewsEventsChronologically(
  events: NewsEvidenceEvent[],
): NewsEvidenceEvent[] {
  return [...events].sort((a, b) => {
    const aKnown = Date.parse(a.knownAt);
    const bKnown = Date.parse(b.knownAt);
    const safeA = Number.isFinite(aKnown) ? aKnown : 0;
    const safeB = Number.isFinite(bKnown) ? bKnown : 0;
    return safeA - safeB;
  });
}

export function shouldTriggerCcfReevaluation(event: NewsEvidenceEvent): boolean {
  return (
    event.evidenceState === 'CURRENT' &&
    event.recordQuality === 'DECISION_GRADE' &&
    event.confirmation !== 'SPECULATIVE' &&
    event.confirmation !== 'CONFLICTED' &&
    (event.materiality === 'M2' || event.materiality === 'M3')
  );
}


export interface NewsTextObservationInput {
  sourceId: string;
  sourceClass: string;
  sourceRole?: string;
  title: string;
  description?: string;
  link: string;
  pubDate?: string;
  author?: string;
  playerIds?: string[];
  teamIds?: string[];
}

const INJURY_TEXT_PATTERNS = [
  'injury',
  'injured',
  'hamstring',
  'ankle',
  'knee',
  'shoulder',
  'concussion',
  'did not practice',
  'dnp',
  'limited practice',
  'ruled out',
  'questionable',
  'doubtful',
  'injured reserve',
  'surgery',
  'mri',
];

const OFFENSIVE_TREND_PATTERNS = [
  'under center',
  'shotgun',
  'play action',
  'pre-snap motion',
  'motion rate',
  'neutral pass',
  'pass rate over expectation',
  'situation-neutral pass',
  'offensive pace',
  '12 personnel',
  '13 personnel',
  '21 personnel',
  'route depth',
  'pass protection',
  'explosive-play',
  'red-zone usage',
  'goal-line usage',
  'run concept',
  'outside zone',
  'inside zone',
  'gap scheme',
];

const DEFENSIVE_TREND_PATTERNS = [
  'blitz rate',
  'blitzed',
  'pressure rate',
  'four-man rush',
  'four man rush',
  'simulated pressure',
  'creeper pressure',
  'single-high',
  'two-high',
  'split-safety',
  'man coverage',
  'zone coverage',
  'coverage shell',
  'defensive front',
  'run defense',
  'missed tackle',
  'tackling rate',
];

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some(pattern => text.includes(pattern));
}

export function classifyNewsTextFamily(text: string): NewsEventFamily {
  const normalized = text.toLowerCase();

  // Injury/availability takes precedence because it has the clearest direct
  // state semantics and should not be hidden by scheme language in the same blurb.
  if (includesAny(normalized, INJURY_TEXT_PATTERNS)) return 'INJURY';
  if (includesAny(normalized, OFFENSIVE_TREND_PATTERNS)) return 'OFF_TREND';
  if (includesAny(normalized, DEFENSIVE_TREND_PATTERNS)) return 'DEF_TREND';
  return 'PLAYER_TEAM_NEWS';
}

function normalizePublishedAt(raw?: string): string | undefined {
  if (!raw) return undefined;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function textObservationFingerprint(input: NewsTextObservationInput): string {
  return createHash('sha256')
    .update([input.sourceId, input.link, input.pubDate ?? '', input.title].join('|'))
    .digest('hex');
}

export function newsTextObservationToEvent(
  input: NewsTextObservationInput,
  retrievedAt: string = new Date().toISOString(),
): NewsEvidenceEvent {
  const combinedText = `${input.title} ${input.description ?? ''}`;
  const normalizedText = combinedText.toLowerCase();
  const family = classifyNewsTextFamily(combinedText);
  const fingerprint = textObservationFingerprint(input);
  const trendFamily = family === 'OFF_TREND' || family === 'DEF_TREND';

  const dependencyTags =
    family === 'INJURY'
      ? ['health/readiness', 'role/usage']
      : trendFamily
        ? ['scheme/matchup', 'role/usage']
        : [];

  return {
    eventId: `rss-${fingerprint.slice(0, 24)}`,
    schemaVersion: 'news-intel-v0',
    family,
    playerIds: input.playerIds,
    teamIds: input.teamIds,
    headline: input.title,
    summary: input.description,
    direction: 'UNKNOWN',
    source: {
      sourceId: input.sourceId,
      sourceClass: input.sourceClass,
      sourceRole: input.sourceRole,
      sourceAncestryId: `rss-root-${createHash('sha256')
        .update([input.sourceId, input.link].join('|'))
        .digest('hex')
        .slice(0, 24)}`,
    },
    publishedAt: normalizePublishedAt(input.pubDate),
    retrievedAt,
    knownAt: retrievedAt,
    evidenceState: 'CURRENT',
    confirmation:
      normalizedText.includes('coach said') ||
      normalizedText.includes('coach says') ||
      normalizedText.includes('head coach')
        ? 'COACH_STATEMENT'
        : 'MEDIA_REPORT',
    recordQuality: 'RAW',
    sampleGames: trendFamily ? 1 : undefined,
    trendRegime: trendFamily ? 'OBSERVATION' : undefined,
    affectedEntities: [...(input.playerIds ?? []), ...(input.teamIds ?? [])],
    dependencyTags,
    materiality: 'M1',
    rawTraceRef: input.link,
    replayEligible: true,
  };
}

import { injuryClient } from '../injuryClient';
import {
  NflverseInjuryClient,
  buildNflverseInjuryCheck,
  injuryStateFromNflverseRow,
  latestRowsByPlayerWeek,
  nflverseInjuryRowToEvent,
  normalizeGameDesignation,
  normalizePracticeParticipation,
} from '../nflverseInjuryClient';
import {
  NewsAnalysisService,
  RotoBallerNewsClient,
  RotoworldNewsClient,
} from '../newsClient';
import {
  buildNewsIntelligenceCheck,
  classifyNewsTextFamily,
  composeNewsIntelligenceRefresh,
  dedupeNewsEventsByAncestry,
  deriveInjuryMateriality,
  deriveTrendRegime,
  filterReplayEligibleNews,
  newsTextObservationToEvent,
  NewsEvidenceEvent,
  sortNewsEventsChronologically,
  shouldTriggerCcfReevaluation,
} from '../newsIntelligence';

function makeEvent(
  overrides: Partial<NewsEvidenceEvent> = {},
): NewsEvidenceEvent {
  return {
    eventId: 'event-1',
    schemaVersion: 'news-intel-v0',
    family: 'INJURY',
    source: {
      sourceId: 'official-team',
      sourceClass: 'official',
      sourceRole: 'primary',
      sourceAncestryId: 'root-1',
    },
    retrievedAt: '2026-09-25T16:00:00.000Z',
    knownAt: '2026-09-25T16:00:00.000Z',
    evidenceState: 'CURRENT',
    confirmation: 'CONFIRMED_OFFICIAL',
    recordQuality: 'DECISION_GRADE',
    materiality: 'M2',
    replayEligible: true,
    ...overrides,
  };
}

test('completed structured refresh always exposes OFF_TREND, DEF_TREND, and INJURY lanes', () => {
  const check = buildNewsIntelligenceCheck([], {
    asOf: '2026-09-25T17:00:00.000Z',
    laneStatuses: {
      OFF_TREND: 'COMPLETE',
      DEF_TREND: 'COMPLETE',
      INJURY: 'COMPLETE',
    },
  });

  expect(Object.keys(check.lanes).sort()).toEqual(
    ['DEF_TREND', 'INJURY', 'OFF_TREND'].sort(),
  );
  expect(check.lanes.OFF_TREND.status).toBe('COMPLETE');
  expect(check.lanes.DEF_TREND.eventCount).toBe(0);
  expect(check.lanes.INJURY.highestMateriality).toBe('M0');
});

test('unreported lane state fails closed to MISSING', () => {
  const check = buildNewsIntelligenceCheck([], {
    asOf: '2026-09-25T17:00:00.000Z',
  });

  expect(check.lanes.OFF_TREND.status).toBe('MISSING');
  expect(check.lanes.DEF_TREND.status).toBe('MISSING');
  expect(check.lanes.INJURY.status).toBe('MISSING');
});

test('provider failure remains explicit instead of becoming neutral decision-grade evidence', () => {
  const check = buildNewsIntelligenceCheck([], {
    asOf: '2026-09-25T17:00:00.000Z',
    laneStatuses: {
      OFF_TREND: 'ERROR',
      DEF_TREND: 'STALE',
      INJURY: 'MISSING',
    },
  });

  expect(check.lanes.OFF_TREND.status).toBe('ERROR');
  expect(check.lanes.DEF_TREND.status).toBe('STALE');
  expect(check.lanes.INJURY.status).toBe('MISSING');
});

test('syndicated reports sharing one root ancestry collapse to one causal event', () => {
  const earlier = makeEvent({
    eventId: 'copy-a',
    publishedAt: '2026-09-25T15:00:00.000Z',
  });
  const later = makeEvent({
    eventId: 'copy-b',
    publishedAt: '2026-09-25T15:05:00.000Z',
  });

  const deduped = dedupeNewsEventsByAncestry([earlier, later]);

  expect(deduped).toHaveLength(1);
  expect(deduped[0].eventId).toBe('copy-b');
});

test('known_at replay excludes information learned after the replay timestamp', () => {
  const eligible = makeEvent({
    eventId: 'eligible',
    source: { sourceId: 'a', sourceClass: 'official', sourceAncestryId: 'a' },
    knownAt: '2026-09-25T15:00:00.000Z',
  });
  const future = makeEvent({
    eventId: 'future',
    source: { sourceId: 'b', sourceClass: 'official', sourceAncestryId: 'b' },
    knownAt: '2026-09-25T18:00:00.000Z',
  });

  const replay = filterReplayEligibleNews(
    [eligible, future],
    '2026-09-25T16:00:00.000Z',
  );

  expect(replay.map(event => event.eventId)).toEqual(['eligible']);
});

test('injury chronology preserves DNP -> LP -> FP sequence', () => {
  const events = [
    makeEvent({ eventId: 'fp', knownAt: '2026-09-25T17:00:00.000Z' }),
    makeEvent({ eventId: 'dnp', knownAt: '2026-09-23T17:00:00.000Z' }),
    makeEvent({ eventId: 'lp', knownAt: '2026-09-24T17:00:00.000Z' }),
  ];

  expect(sortNewsEventsChronologically(events).map(event => event.eventId)).toEqual([
    'dnp',
    'lp',
    'fp',
  ]);
});

test('confirmed OUT or inactive state is urgent while routine improvement is bounded', () => {
  expect(
    deriveInjuryMateriality(
      { practiceParticipation: 'LP' },
      { gameDesignation: 'OUT', availability: 'INACTIVE' },
    ),
  ).toBe('M3');

  expect(
    deriveInjuryMateriality(
      { practiceParticipation: 'LP' },
      { practiceParticipation: 'FP', gameDesignation: 'NONE', availability: 'ACTIVE' },
    ),
  ).toBe('M1');
});

test('one-game trend stays observation rather than becoming a durable baseline', () => {
  expect(deriveTrendRegime(1)).toBe('OBSERVATION');
  expect(deriveTrendRegime(2)).toBe('DEVELOPING');
  expect(deriveTrendRegime(3)).toBe('ESTABLISHED');
});

test('material current evidence may request CCF reevaluation without becoming recommendation authority', () => {
  expect(shouldTriggerCcfReevaluation(makeEvent({ materiality: 'M2' }))).toBe(true);
  expect(
    shouldTriggerCcfReevaluation(
      makeEvent({ materiality: 'M3', confirmation: 'SPECULATIVE' }),
    ),
  ).toBe(false);
  expect(
    shouldTriggerCcfReevaluation(
      makeEvent({ materiality: 'M3', evidenceState: 'STALE' }),
    ),
  ).toBe(false);
  expect(
    shouldTriggerCcfReevaluation(
      makeEvent({ materiality: 'M3', recordQuality: 'NORMALIZED' }),
    ),
  ).toBe(false);
});


test('RSS text capture classifies injury and scheme news only as provisional raw evidence', () => {
  expect(
    classifyNewsTextFamily('Team increased play action and snaps under center this week'),
  ).toBe('OFF_TREND');
  expect(
    classifyNewsTextFamily('Defense blitzed more often and changed its coverage shell'),
  ).toBe('DEF_TREND');
  expect(
    classifyNewsTextFamily('Receiver did not practice because of a hamstring injury'),
  ).toBe('INJURY');

  const event = newsTextObservationToEvent(
    {
      sourceId: 'rotoworld-rss',
      sourceClass: 'fantasy-news-rss',
      sourceRole: 'secondary',
      title: 'Team using more 12 personnel and play action',
      description: 'The offense has leaned into under-center play action.',
      link: 'https://example.com/story',
      pubDate: '2026-09-25T15:00:00Z',
      playerIds: ['player-1'],
    },
    '2026-09-25T16:00:00.000Z',
  );

  expect(event.family).toBe('OFF_TREND');
  expect(event.recordQuality).toBe('RAW');
  expect(event.materiality).toBe('M1');
  expect(event.trendRegime).toBe('OBSERVATION');
  expect(shouldTriggerCcfReevaluation(event)).toBe(false);
});


test('structured RSS bridge distinguishes provider failure from a successful no-news result', async () => {
  jest
    .spyOn(RotoworldNewsClient.prototype, 'getPlayerNewsWithState')
    .mockResolvedValue({ items: [], state: 'ERROR' });
  jest
    .spyOn(RotoBallerNewsClient.prototype, 'getPlayerNewsWithState')
    .mockResolvedValue({ items: [], state: 'CURRENT' });

  const check = await new NewsAnalysisService().getStructuredPlayerNewsCheck(
    'Test Player',
    'player-1',
    { asOf: '2026-09-25T17:00:00.000Z' },
  );

  expect(check.sources).toEqual([
    {
      sourceId: 'rotoworld-rss',
      state: 'ERROR',
      checkedAt: '2026-09-25T17:00:00.000Z',
      itemCount: 0,
    },
    {
      sourceId: 'rotoballer-rss',
      state: 'CURRENT',
      checkedAt: '2026-09-25T17:00:00.000Z',
      itemCount: 0,
    },
  ]);
  expect(check.lanes.INJURY.status).toBe('PARTIAL');
  expect(check.lanes.OFF_TREND.status).toBe('PARTIAL');

  jest.restoreAllMocks();
});

test('structured RSS bridge reports lane ERROR when every configured legacy feed fails', async () => {
  jest
    .spyOn(RotoworldNewsClient.prototype, 'getPlayerNewsWithState')
    .mockResolvedValue({ items: [], state: 'ERROR' });
  jest
    .spyOn(RotoBallerNewsClient.prototype, 'getPlayerNewsWithState')
    .mockResolvedValue({ items: [], state: 'ERROR' });

  const check = await new NewsAnalysisService().getStructuredPlayerNewsCheck(
    'Test Player',
    'player-1',
    { asOf: '2026-09-25T17:00:00.000Z' },
  );

  expect(check.lanes.OFF_TREND.status).toBe('ERROR');
  expect(check.lanes.DEF_TREND.status).toBe('ERROR');
  expect(check.lanes.INJURY.status).toBe('ERROR');

  jest.restoreAllMocks();
});


test('nflverse injury normalization maps official practice and game-report states without inventing availability', () => {
  expect(normalizePracticeParticipation('Did Not Participate In Practice')).toBe('DNP');
  expect(normalizePracticeParticipation('Limited Participation')).toBe('LP');
  expect(normalizePracticeParticipation('Full Participation')).toBe('FP');
  expect(normalizeGameDesignation('Out')).toBe('OUT');
  expect(normalizeGameDesignation('Questionable')).toBe('QUESTIONABLE');

  const state = injuryStateFromNflverseRow({
    report_primary_injury: 'Hamstring',
    report_status: 'Questionable',
    practice_status: 'Limited Participation in Practice',
  });

  expect(state).toEqual({
    injuryEvent: 'Hamstring',
    bodyArea: 'Hamstring',
    practiceParticipation: 'LP',
    gameDesignation: 'QUESTIONABLE',
    availability: null,
    procedureOrImaging: null,
    expectedReturnWindow: null,
    workloadRestriction: null,
  });
});

test('nflverse injury rows retain the latest upstream row per GSIS/week', () => {
  const rows = latestRowsByPlayerWeek([
    {
      season: '2026',
      week: '3',
      gsis_id: '00-0000001',
      practice_status: 'DNP',
      date_modified: '2026-09-23T16:00:00Z',
    },
    {
      season: '2026',
      week: '3',
      gsis_id: '00-0000001',
      practice_status: 'LP',
      date_modified: '2026-09-24T16:00:00Z',
    },
    {
      season: '2026',
      week: '3',
      gsis_id: '00-0000002',
      practice_status: 'FP',
      date_modified: '2026-09-24T16:00:00Z',
    },
  ]);

  expect(rows).toHaveLength(2);
  expect(
    rows.find(row => row.gsis_id === '00-0000001')?.practice_status,
  ).toBe('LP');
});

test('resolved official-report-derived injury row can become decision-grade while unresolved identity is quarantined', () => {
  const row = {
    season: '2026',
    week: '3',
    team: 'DET',
    gsis_id: '00-0000001',
    full_name: 'Test Receiver',
    report_primary_injury: 'Hamstring',
    report_status: 'Questionable',
    practice_status: 'Limited Participation in Practice',
    date_modified: '2026-09-25T15:00:00Z',
  };

  const resolved = nflverseInjuryRowToEvent(
    row,
    'canonical-player-1',
    'resolved',
    '2026-09-25T16:00:00.000Z',
  );
  expect(resolved.recordQuality).toBe('DECISION_GRADE');
  expect(resolved.confirmation).toBe('CONFIRMED_OFFICIAL');
  expect(resolved.playerIds).toEqual(['canonical-player-1']);
  expect(resolved.knownAt).toBe('2026-09-25T16:00:00.000Z');
  expect(resolved.updatedAt).toBe('2026-09-25T15:00:00.000Z');
  expect(shouldTriggerCcfReevaluation(resolved)).toBe(false);

  const unresolved = nflverseInjuryRowToEvent(
    row,
    undefined,
    'not_found',
    '2026-09-25T16:00:00.000Z',
  );
  expect(unresolved.recordQuality).toBe('QUARANTINED');
  expect(unresolved.conflictState).toBe('GSIS_IDENTITY_NOT_FOUND');
  expect(shouldTriggerCcfReevaluation(unresolved)).toBe(false);
});

test('nflverse injury check is complete only when current-week rows resolve cleanly', () => {
  const fetched = {
    state: 'CURRENT' as const,
    retrievedAt: '2026-09-25T16:00:00.000Z',
    rows: [
      {
        season: '2026',
        week: '3',
        team: 'DET',
        gsis_id: '00-0000001',
        full_name: 'Test Receiver',
        report_primary_injury: 'Hamstring',
        report_status: 'Out',
        practice_status: 'DNP',
        date_modified: '2026-09-25T15:00:00Z',
      },
    ],
  };

  const complete = buildNflverseInjuryCheck(fetched, {
    week: 3,
    identityResolution: {
      lookupStatus: 'available',
      resolved: new Map([['00-0000001', 'canonical-player-1']]),
      ambiguous: new Set(),
    },
  });

  expect(complete.lanes.INJURY.status).toBe('COMPLETE');
  expect(complete.lanes.INJURY.decisionGradeEventCount).toBe(1);
  expect(complete.lanes.INJURY.highestMateriality).toBe('M3');

  const partial = buildNflverseInjuryCheck(fetched, {
    week: 3,
    identityResolution: {
      lookupStatus: 'available',
      resolved: new Map(),
      ambiguous: new Set(),
    },
  });

  expect(partial.lanes.INJURY.status).toBe('PARTIAL');
  expect(partial.lanes.INJURY.decisionGradeEventCount).toBe(0);
  expect(partial.events[0].recordQuality).toBe('QUARANTINED');
});

test('nflverse injury source failure stays an injury-lane ERROR', () => {
  const check = buildNflverseInjuryCheck({
    state: 'ERROR',
    retrievedAt: '2026-09-25T16:00:00.000Z',
    rows: [],
    error: 'network failure',
  });

  expect(check.sources[0].state).toBe('ERROR');
  expect(check.lanes.INJURY.status).toBe('ERROR');
  expect(check.lanes.OFF_TREND.status).toBe('MISSING');
  expect(check.lanes.DEF_TREND.status).toBe('MISSING');
});

test('nflverse client fetches the documented season CSV and parses report rows', async () => {
  const csv = [
    'season,season_type,team,week,gsis_id,position,full_name,report_primary_injury,report_status,practice_primary_injury,practice_status,date_modified',
    '2026,REG,DET,3,00-0000001,WR,Test Receiver,Hamstring,Questionable,Hamstring,Limited Participation in Practice,2026-09-25T15:00:00Z',
  ].join('\n');

  const fetchImpl = jest.fn(async () =>
    new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv',
        'last-modified': 'Fri, 25 Sep 2026 15:30:00 GMT',
      },
    }),
  ) as unknown as typeof fetch;

  const client = new NflverseInjuryClient({
    fetchImpl,
    baseUrl: 'https://example.test/injuries',
  });
  const result = await client.fetchSeason(
    2026,
    '2026-09-25T16:00:00.000Z',
  );

  expect(fetchImpl).toHaveBeenCalledWith(
    'https://example.test/injuries/injuries_2026.csv',
    expect.any(Object),
  );
  expect(result.state).toBe('CURRENT');
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].practice_status).toBe('Limited Participation in Practice');
});


test('missing requested injury week stays MISSING rather than certifying zero injuries', () => {
  const check = buildNflverseInjuryCheck(
    {
      state: 'CURRENT',
      retrievedAt: '2026-09-25T16:00:00.000Z',
      rows: [
        {
          season: '2026',
          week: '2',
          team: 'DET',
          gsis_id: '00-0000001',
          full_name: 'Test Receiver',
          report_primary_injury: 'Hamstring',
          report_status: 'Questionable',
          practice_status: 'LP',
          date_modified: '2026-09-18T15:00:00Z',
        },
      ],
    },
    {
      week: 3,
      identityResolution: {
        lookupStatus: 'available',
        resolved: new Map([['00-0000001', 'canonical-player-1']]),
        ambiguous: new Set(),
      },
    },
  );

  expect(check.lanes.INJURY.status).toBe('MISSING');
  expect(check.events).toHaveLength(0);
});

test('composed NEWS-001 refresh keeps lane authority with owning checks while retaining supplemental evidence', () => {
  const injury = buildNewsIntelligenceCheck(
    [makeEvent({ eventId: 'injury-owner', family: 'INJURY' })],
    {
      asOf: '2026-09-25T16:00:00.000Z',
      sourceStates: [
        {
          sourceId: 'injury-owner',
          state: 'CURRENT',
          checkedAt: '2026-09-25T16:00:00.000Z',
          itemCount: 1,
        },
      ],
      laneStatuses: {
        INJURY: 'COMPLETE',
        OFF_TREND: 'MISSING',
        DEF_TREND: 'MISSING',
      },
    },
  );

  const trends = buildNewsIntelligenceCheck(
    [
      makeEvent({
        eventId: 'off-trend-owner',
        family: 'OFF_TREND',
        source: {
          sourceId: 'trend-owner',
          sourceClass: 'measured',
          sourceAncestryId: 'trend-off',
        },
        recordQuality: 'NORMALIZED',
        materiality: 'M1',
      }),
    ],
    {
      asOf: '2026-09-25T16:00:00.000Z',
      sourceStates: [
        {
          sourceId: 'trend-owner',
          state: 'CURRENT',
          checkedAt: '2026-09-25T16:00:00.000Z',
          itemCount: 1,
        },
      ],
      laneStatuses: {
        INJURY: 'MISSING',
        OFF_TREND: 'PARTIAL',
        DEF_TREND: 'PARTIAL',
      },
    },
  );

  const supplemental = buildNewsIntelligenceCheck(
    [
      makeEvent({
        eventId: 'rss-extra',
        family: 'INJURY',
        source: {
          sourceId: 'rss-extra',
          sourceClass: 'secondary',
          sourceAncestryId: 'rss-extra-root',
        },
        recordQuality: 'RAW',
        materiality: 'M1',
      }),
    ],
    {
      asOf: '2026-09-25T16:00:00.000Z',
      sourceStates: [
        {
          sourceId: 'rss-extra',
          state: 'PARTIAL',
          checkedAt: '2026-09-25T16:00:00.000Z',
          itemCount: 1,
        },
      ],
      laneStatuses: {
        INJURY: 'PARTIAL',
        OFF_TREND: 'PARTIAL',
        DEF_TREND: 'PARTIAL',
      },
    },
  );

  const combined = composeNewsIntelligenceRefresh({
    injury,
    trends,
    supplemental: [supplemental],
  });

  expect(combined.lanes.INJURY.status).toBe('COMPLETE');
  expect(combined.lanes.OFF_TREND.status).toBe('PARTIAL');
  expect(combined.lanes.DEF_TREND.status).toBe('PARTIAL');
  expect(combined.events.map(event => event.eventId).sort()).toEqual(
    ['injury-owner', 'off-trend-owner', 'rss-extra'].sort(),
  );
  expect(combined.sources.map(source => source.sourceId).sort()).toEqual(
    ['injury-owner', 'trend-owner', 'rss-extra'].sort(),
  );
});


test('News Intelligence delegates structured injury truth to the canonical injury service', async () => {
  const expected = buildNewsIntelligenceCheck([], {
    asOf: '2026-09-25T17:00:00.000Z',
    sourceStates: [
      {
        sourceId: 'canonical-injury-owner',
        state: 'CURRENT',
        checkedAt: '2026-09-25T17:00:00.000Z',
        itemCount: 0,
      },
    ],
    laneStatuses: {
      INJURY: 'COMPLETE',
      OFF_TREND: 'MISSING',
      DEF_TREND: 'MISSING',
    },
  });

  const spy = jest
    .spyOn(injuryClient.intelligence, 'getStructuredCheck')
    .mockResolvedValue(expected);

  const result = await new NewsAnalysisService().getNflverseInjuryCheck(2026, {
    asOf: '2026-09-25T17:00:00.000Z',
    week: 3,
  });

  expect(spy).toHaveBeenCalledWith(2026, {
    asOf: '2026-09-25T17:00:00.000Z',
    week: 3,
  });
  expect(result).toBe(expected);

  spy.mockRestore();
});

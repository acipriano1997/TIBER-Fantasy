import {
  buildNewsIntelligenceCheck,
  classifyNewsTextFamily,
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

test('manual structured check always exposes OFF_TREND, DEF_TREND, and INJURY lanes', () => {
  const check = buildNewsIntelligenceCheck([], {
    asOf: '2026-09-25T17:00:00.000Z',
  });

  expect(Object.keys(check.lanes).sort()).toEqual(
    ['DEF_TREND', 'INJURY', 'OFF_TREND'].sort(),
  );
  expect(check.lanes.OFF_TREND.status).toBe('COMPLETE');
  expect(check.lanes.DEF_TREND.eventCount).toBe(0);
  expect(check.lanes.INJURY.highestMateriality).toBe('M0');
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

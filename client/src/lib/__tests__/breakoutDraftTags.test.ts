import {
  fetchBreakoutDraftTags,
  findBreakoutDraftTag,
  type BreakoutDraftTag,
} from '../breakoutDraftTags';

const provisionalTag: BreakoutDraftTag = {
  playerId: '00-0040124',
  playerName: 'Tetairoa McMillan',
  team: 'CAR',
  targetSeason: 2026,
  label: '2026 Breakout Research',
  displayLabel: '2026 Breakout · 41%',
  probability: { value: 0.4065, percent: 41, target: 'ros_tier_jump' },
  probabilities: {
    primary: 0.4065,
    primaryTarget: 'ros_tier_jump',
    top12Next4w: null,
    top24Next4w: null,
    rosTierJump: 0.4065,
    adpOutperformance12Slots: null,
    roleExpansion: null,
  },
  candidateRank: 1,
  finalSignalScore: null,
  breakoutContext: 'Frozen research probability.',
  modelVersion: 'breakout_v1_4_frozen_2026_09_08',
  generatedAt: '2026-09-08T16:21:03Z',
  evidenceStatus: 'provisional_research_only',
  signalKind: 'breakout',
};

const certifiedTag: BreakoutDraftTag = {
  ...provisionalTag,
  label: '2026 Breakout',
  displayLabel: '2026 Breakout · 41%',
  evidenceStatus: 'certified_promoted',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchBreakoutDraftTags', () => {
  test('falls back to the provisional 2026 lane only after certified evidence is inactive', async () => {
    const fetchImpl = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: false, code: 'not_promoted' }, 409))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: {
          targetSeason: 2026,
          tags: [provisionalTag],
          validation: { certified: false },
        },
      }));

    const result = await fetchBreakoutDraftTags(2026, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/data-lab/breakout-signals/draft-tags?season=2026');
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/data-lab/breakout-signals/draft-tags/provisional?season=2026');
    expect(result.status).toBe('active');
    if (result.status === 'active') {
      expect(result.source).toBe('provisional');
      expect(result.tags).toEqual([provisionalTag]);
    }
  });

  test('never consults provisional evidence when certified evidence is active', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({
      success: true,
      data: {
        targetSeason: 2026,
        tags: [certifiedTag],
        promotion: { status: 'promoted' },
        freshness: { stale: false },
      },
    }));

    const result = await fetchBreakoutDraftTags(2026, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('active');
    if (result.status === 'active') {
      expect(result.source).toBe('certified');
      expect(result.tags[0].evidenceStatus).toBe('certified_promoted');
    }
  });

  test('fails closed when a probability percent disagrees with its decimal', async () => {
    const badTag = {
      ...provisionalTag,
      probability: { ...provisionalTag.probability, percent: 99 },
    };
    const fetchImpl = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: false, code: 'not_promoted' }, 409))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: { targetSeason: 2026, tags: [badTag] },
      }));

    const result = await fetchBreakoutDraftTags(2026, fetchImpl);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.code).toBe('invalid_payload');
  });
});

describe('findBreakoutDraftTag', () => {
  test('allows unique name-only fallback only for provisional evidence', () => {
    expect(findBreakoutDraftTag(
      { name: 'Tetairoa McMillan', team: 'NYG' },
      [provisionalTag],
    )).toEqual(provisionalTag);

    expect(findBreakoutDraftTag(
      { name: 'Tetairoa McMillan', team: 'NYG' },
      [certifiedTag],
    )).toBeNull();
  });

  test('does not override a conflicting supplied canonical id with fuzzy matching', () => {
    expect(findBreakoutDraftTag(
      { canonicalPlayerId: 'different-id', name: 'Tetairoa McMillan', team: 'CAR' },
      [provisionalTag],
    )).toBeNull();
  });
});

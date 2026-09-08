import {
  fetchBreakoutDraftTags,
  findBreakoutDraftTag,
  type BreakoutDraftTag,
} from '@/lib/breakoutDraftTags';

const tags: BreakoutDraftTag[] = [
  {
    playerId: '00-0042051',
    playerName: 'Malik Nabers',
    team: 'NYG',
    targetSeason: 2026,
    label: '2026 Breakout',
    candidateRank: 1,
    finalSignalScore: 91.2,
    breakoutContext: 'Promoted test evidence',
    modelVersion: 'wr-breakout-v1',
    generatedAt: '2026-09-01T00:00:00Z',
  },
];

describe('breakout draft tags', () => {
  it('prefers an exact canonical id when the caller supplies a compatible namespace', () => {
    expect(findBreakoutDraftTag({
      canonicalPlayerId: '00-0042051',
      name: 'Different Display Name',
      team: 'NYG',
    }, tags)).toEqual(tags[0]);
  });

  it('uses a unique guarded name+team fallback when no canonical id is available', () => {
    expect(findBreakoutDraftTag({ name: 'Malik Nabers', team: 'nyg' }, tags)).toEqual(tags[0]);
    expect(findBreakoutDraftTag({ name: 'Malik Nabers', team: 'DAL' }, tags)).toBeNull();
    expect(findBreakoutDraftTag({ name: 'Malik Nabers' }, tags)).toBeNull();
  });

  it('fails closed on ambiguous fallback identities', () => {
    const ambiguous = [...tags, { ...tags[0], playerId: null }];
    expect(findBreakoutDraftTag({ name: 'Malik Nabers', team: 'NYG' }, ambiguous)).toBeNull();
  });

  it('does not let a conflicting canonical id fall through to name matching', () => {
    expect(findBreakoutDraftTag({
      canonicalPlayerId: 'different-canonical-id',
      name: 'Malik Nabers',
      team: 'NYG',
    }, tags)).toBeNull();
  });

  it('treats not-found, not-promoted, and unavailable responses as inactive evidence', async () => {
    for (const [status, code] of [[404, 'not_found'], [409, 'not_promoted'], [503, 'upstream_unavailable']] as const) {
      const fetchImpl = (async () => new Response(JSON.stringify({ code }), {
        status,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

      const result = await fetchBreakoutDraftTags(2026, fetchImpl);
      expect(result.status).toBe('inactive');
    }
  });

  it('returns only structurally valid promoted tags from an active response', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      success: true,
      data: {
        targetSeason: 2026,
        tags: [tags[0], { playerName: 'missing required fields' }],
        promotion: { status: 'promoted' },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;

    const result = await fetchBreakoutDraftTags(2026, fetchImpl);
    expect(result.status).toBe('active');
    if (result.status === 'active') expect(result.tags).toEqual(tags);
  });
});

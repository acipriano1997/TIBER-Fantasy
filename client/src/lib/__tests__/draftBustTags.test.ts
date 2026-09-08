import {
  fetchDraftBustTags,
  findDraftBustTag,
  formatDraftBustTag,
  type DraftBustTag,
} from '../draftBustTags';

const tag: DraftBustTag = {
  playerId: 'canonical-player-1',
  targetSeason: 2026,
  probability: { value: 0.314, percent: 31 },
  severityExpected: 18.5,
  mechanisms: ['role_collapse'],
  modelVersion: 'draft_bust_v1',
  calibrationVersion: 'draft_bust_cal_v1',
  labelDefinitionVersion: 'draft_bust_label_v1',
  asOf: '2026-09-08T16:00:00Z',
  provenance: [{ artifact: 'frozen-replay' }],
  freshnessContext: { stale: false },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('draft bust display contract', () => {
  test('renders the calibrated decimal as BUST NN% while preserving full precision in the tag', () => {
    expect(formatDraftBustTag(tag.probability.value)).toBe('BUST 31%');
    expect(tag.probability.value).toBe(0.314);
  });

  test('never creates a zero or invalid bust label', () => {
    expect(formatDraftBustTag(0)).toBeNull();
    expect(formatDraftBustTag(Number.NaN)).toBeNull();
    expect(formatDraftBustTag(1.1)).toBeNull();
  });

  test('matches only exact canonical player identity', () => {
    expect(findDraftBustTag('canonical-player-1', [tag])).toEqual(tag);
    expect(findDraftBustTag('espn-12345', [tag])).toBeNull();
    expect(findDraftBustTag(null, [tag])).toBeNull();
  });
});

describe('fetchDraftBustTags', () => {
  test('accepts promoted probability-bearing evidence', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({
      success: true,
      data: { targetSeason: 2026, tags: [tag], source: { provider: 'signal-validation-model' } },
    }));

    const result = await fetchDraftBustTags(2026, fetchImpl);
    expect(result.status).toBe('active');
    if (result.status === 'active') expect(result.tags[0].probability).toEqual({ value: 0.314, percent: 31 });
  });

  test('treats missing or unpromoted upstream evidence as inactive, not as a zero-probability tag', async () => {
    for (const [status, code, reason] of [
      [404, 'not_found', 'not_found'],
      [409, 'not_promoted', 'not_promoted'],
      [503, 'upstream_unavailable', 'upstream_unavailable'],
    ] as const) {
      const fetchImpl = jest.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ success: false, code }, status));
      const result = await fetchDraftBustTags(2026, fetchImpl);
      expect(result).toEqual({ status: 'inactive', targetSeason: 2026, reason });
    }
  });

  test('fails closed when display percent disagrees with the full-precision probability', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({
      success: true,
      data: {
        targetSeason: 2026,
        tags: [{ ...tag, probability: { value: 0.314, percent: 99 } }],
      },
    }));

    const result = await fetchDraftBustTags(2026, fetchImpl);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.code).toBe('invalid_payload');
  });
});

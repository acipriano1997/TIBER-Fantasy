import { resolveEspnDraftIdentities } from '../identity/espnDraftIdentityResolver';

describe('resolveEspnDraftIdentities', () => {
  test('resolves only exact ESPN provider ids to canonical ids', async () => {
    const result = await resolveEspnDraftIdentities(['123', '456'], {
      lookup: async () => [{ espnId: '123', canonicalId: 'canonical-123' }],
    });

    expect(result.identities.get('123')).toMatchObject({
      status: 'resolved',
      canonicalPlayerId: 'canonical-123',
      reason: 'espn_exact_crosswalk',
    });
    expect(result.identities.get('456')).toMatchObject({
      status: 'unresolved',
      canonicalPlayerId: null,
      reason: 'espn_not_in_identity_map',
    });
    expect(result.coverage).toEqual({
      total: 2,
      resolved: 1,
      unresolved: 1,
      unavailable: 0,
      ambiguous: 0,
      coverageRatio: 0.5,
    });
  });

  test('refuses duplicate crosswalk owners instead of choosing one', async () => {
    const result = await resolveEspnDraftIdentities(['123'], {
      lookup: async () => [
        { espnId: '123', canonicalId: 'canonical-a' },
        { espnId: '123', canonicalId: 'canonical-b' },
      ],
    });

    expect(result.identities.get('123')).toMatchObject({
      status: 'ambiguous',
      canonicalPlayerId: null,
      reason: 'espn_ambiguous_duplicate_crosswalk_rows',
    });
  });

  test('distinguishes an identity-store outage from a valid not-found result', async () => {
    const result = await resolveEspnDraftIdentities(['123'], {
      lookup: async () => { throw new Error('database offline'); },
    });

    expect(result.identities.get('123')).toMatchObject({
      status: 'unavailable',
      canonicalPlayerId: null,
      reason: 'espn_identity_lookup_unavailable',
    });
    expect(result.coverage.unavailable).toBe(1);
  });

  test('deduplicates repeated ESPN ids before lookup and coverage measurement', async () => {
    const lookup = jest.fn(async () => [{ espnId: '123', canonicalId: 'canonical-123' }]);
    const result = await resolveEspnDraftIdentities(['123', '123'], { lookup });

    expect(lookup).toHaveBeenCalledWith(['123']);
    expect(result.coverage.total).toBe(1);
    expect(result.coverage.resolved).toBe(1);
  });
});

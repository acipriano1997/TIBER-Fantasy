import {
  assertUsrRecordDigest,
  digestUsrRecord,
  digestUsrValue,
  withUsrRecordDigest,
} from '../canonicalization';
import { makeDefinition } from '../fixtures/usr0Fixtures';

describe('USR-0 canonicalization', () => {
  test('equivalent RFC3339 instants normalize to one digest', () => {
    expect(digestUsrValue({ knownAt: '2026-09-16T08:00:00-04:00' }))
      .toBe(digestUsrValue({ knownAt: '2026-09-16T12:00:00Z' }));
  });

  test('set-like arrays do not depend on input ordering', () => {
    const definition = makeDefinition({ id: 'canonical_order' });
    const { recordDigest: _digest, ...content } = definition;
    const reordered = {
      ...content,
      identity: { ...content.identity, playerIds: [...content.identity.playerIds].reverse() },
      impactDefinition: {
        ...content.impactDefinition,
        affectedPlayerIds: [...content.impactDefinition.affectedPlayerIds].reverse(),
        affectedDecisionSurfaces: [...content.impactDefinition.affectedDecisionSurfaces].reverse(),
      },
      competingStates: [...content.competingStates].reverse(),
      resolutionWitnesses: [...content.resolutionWitnesses].reverse(),
    };
    expect(digestUsrValue(content)).toBe(digestUsrValue(reordered));
  });

  test('record digest excludes the digest field itself', () => {
    const definition = makeDefinition({ id: 'record_digest' });
    expect(digestUsrRecord(definition)).toBe(definition.recordDigest);
    expect(() => assertUsrRecordDigest(definition)).not.toThrow();
  });

  test('redigesting a record replaces stale digest deterministically', () => {
    const definition = makeDefinition({ id: 'redigest' });
    const updated = withUsrRecordDigest({ ...definition, question: 'Changed semantic question' });
    expect(updated.recordDigest).not.toBe(definition.recordDigest);
    expect(() => assertUsrRecordDigest(updated)).not.toThrow();
  });

  test('duplicate semantic set members are rejected', () => {
    expect(() => digestUsrValue({ warnings: ['same', 'same'] })).toThrow('duplicate semantic member');
  });

  test('non-finite numbers are rejected', () => {
    expect(() => digestUsrValue({ value: Number.NaN })).toThrow('non-finite');
  });
});

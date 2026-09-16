import {
  canonicalUsrJson,
  digestUsrValue,
  verifyUsrDigest,
  withUsrDigest,
} from '../canonicalization';
import { FIXTURE_PLAYER_A, FIXTURE_PLAYER_B } from '../fixtures/usr0Fixtures';

describe('USR-0 canonicalization', () => {
  test('set-like player ordering does not change the fingerprint', () => {
    const left = { playerIds: [FIXTURE_PLAYER_A, FIXTURE_PLAYER_B], question: 'same' };
    const right = { question: 'same', playerIds: [FIXTURE_PLAYER_B, FIXTURE_PLAYER_A] };
    expect(digestUsrValue(left)).toBe(digestUsrValue(right));
  });

  test('recordDigest is excluded from its own digest input', () => {
    const base = { schemaVersion: 'fixture', recordId: 'fixture-1', playerIds: [FIXTURE_PLAYER_A] };
    const digested = withUsrDigest(base);
    expect(digestUsrValue(digested)).toBe(digested.recordDigest);
    expect(verifyUsrDigest(digested)).toBe(true);
  });

  test('semantic mutation invalidates a digest', () => {
    const digested = withUsrDigest({ schemaVersion: 'fixture', recordId: 'fixture-2', question: 'before' });
    const tampered = { ...digested, question: 'after' };
    expect(verifyUsrDigest(tampered)).toBe(false);
  });

  test('rejects non-finite numbers', () => {
    expect(() => canonicalUsrJson({ bad: Number.NaN })).toThrow('non-finite');
    expect(() => canonicalUsrJson({ bad: Number.POSITIVE_INFINITY })).toThrow('non-finite');
  });
});

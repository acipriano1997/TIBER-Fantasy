import { resolveDatabaseSslConfig } from '../databaseSsl';

describe('resolveDatabaseSslConfig', () => {
  test('preserves the historical production TLS default when no override is supplied', () => {
    expect(resolveDatabaseSslConfig({ nodeEnv: 'production' })).toEqual({
      rejectUnauthorized: false,
    });
  });

  test('keeps non-production PostgreSQL non-TLS by default', () => {
    expect(resolveDatabaseSslConfig({ nodeEnv: 'test' })).toBe(false);
    expect(resolveDatabaseSslConfig({ nodeEnv: 'development' })).toBe(false);
  });

  test('allows an explicit non-TLS PostgreSQL endpoint in a production runtime', () => {
    expect(resolveDatabaseSslConfig({
      nodeEnv: 'production',
      databaseSsl: 'disable',
    })).toBe(false);
    expect(resolveDatabaseSslConfig({
      nodeEnv: 'production',
      databaseSsl: 'false',
    })).toBe(false);
  });

  test('allows TLS to be explicitly required outside production', () => {
    expect(resolveDatabaseSslConfig({
      nodeEnv: 'test',
      databaseSsl: 'require',
    })).toEqual({ rejectUnauthorized: false });
  });

  test('fails fast on an unknown override instead of guessing transport security', () => {
    expect(() => resolveDatabaseSslConfig({
      nodeEnv: 'production',
      databaseSsl: 'maybe',
    })).toThrow('Unsupported DATABASE_SSL value');
  });
});

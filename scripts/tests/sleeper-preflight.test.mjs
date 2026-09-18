import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../test-sleeper-sync.sh', import.meta.url));

function portfolio(statuses = ['GREEN']) {
  const leagues = statuses.map((status, index) => ({
    leagueId: `synthetic-league-${index}`,
    scoringSettings: { pass_td: status === 'GREEN' ? 4 : 6 },
    rosterPositions: ['QB', 'BN'],
    settings: {},
    scoringCoverage: {
      status,
      recommendationAuthorityUnlocked: status === 'GREEN',
      coveragePct: status === 'GREEN' ? 100 : 0,
      unsupportedKeys: [],
      coefficientMismatches: status === 'GREEN' ? [] : ['pass_td'],
      invalidKeys: [],
    },
  }));
  const redLeagueIds = leagues.filter(l => l.scoringCoverage.status === 'RED').map(l => l.leagueId);
  return { success: true, data: {
    userId: 'synthetic-user', season: 2026, count: leagues.length, leagues,
    scoringCertification: {
      status: redLeagueIds.length ? 'RED' : 'GREEN',
      greenLeagueCount: leagues.length - redLeagueIds.length,
      redLeagueCount: redLeagueIds.length, redLeagueIds,
      productionAuthorityUnlocked: redLeagueIds.length === 0,
    },
    provenance: {
      source: 'sleeper', mode: 'live', complete: true,
      syntheticFallbackAllowed: false, fetchedAt: '2026-09-01T12:00:00.000Z',
    },
  } };
}

// Exercise the real shell + jq assertions, replacing only HTTP transport.
// Synthetic fixtures are never presented as live certification evidence.
function smoke(body, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sleeper-smoke-'));
  try {
    writeFileSync(join(dir, 'responses.json'), JSON.stringify({ body, ...overrides }));
    writeFileSync(join(dir, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
const responses = JSON.parse(fs.readFileSync(process.env.SMOKE_RESPONSES, 'utf8'));
const args = process.argv.slice(2);
const missing = args.includes('username=tiber_preflight_missing_user_9f3c2d1a');
const malformed = args.includes('season=not-a-season');
const body = missing ? (responses.missingBody ?? {success:false,code:'USER_NOT_FOUND'})
  : malformed ? (responses.malformedBody ?? {success:false,code:'INVALID_PORTFOLIO_QUERY'}) : responses.body;
const status = missing ? (responses.missingStatus ?? 404) : malformed ? 400 : (responses.status ?? 200);
process.stdout.write(JSON.stringify(body, null, 2) + '\\n' + status);
`, { mode: 0o755 });
    const result = spawnSync('bash', [script, 'http://synthetic.invalid', 'synthetic-user'], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SLEEPER_SEASON: '2026', SMOKE_RESPONSES: join(dir, 'responses.json') },
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a valid portfolio reaches scoring and negative-query checks on the actual shell', () => {
  const result = smoke(portfolio());
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /unknown user fails closed/);
  assert.match(result.output, /malformed portfolio query is rejected/);
  assert.match(result.output, /does not grant CCF recommendation authority/);
});

test('mixed portfolios preserve aggregate RED and only exact league compatibility', () => {
  const result = smoke(portfolio(['GREEN', 'RED']));
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /portfolio aggregate remains RED/);
});

test('all-RED portfolios fail at the scoring gate, not a jq contract error', () => {
  const result = smoke(portfolio(['RED', 'RED']));
  assert.equal(result.status, 1);
  assert.match(result.output, /no league currently qualifies for exact Forecast scoring compatibility/);
  assert.match(result.output, /pass_td/);
  assert.doesNotMatch(result.output, /Cannot index array/);
});

test('incorrect portfolio counts fail before scoring', () => {
  const body = portfolio();
  body.data.count = 2;
  const result = smoke(body);
  assert.equal(result.status, 1);
  assert.match(result.output, /violated identity\/raw-rule\/scoring\/provenance contract/);
});

test('missing provenance and malformed upstream payloads fail closed', () => {
  const body = portfolio();
  body.data.provenance.complete = false;
  assert.equal(smoke(body).status, 1);
  assert.equal(smoke({ success: true, data: [] }).status, 1);
  assert.equal(smoke(portfolio([])).status, 1);
});

test('RED league and aggregate authority cannot be relabeled as unlocked', () => {
  const body = portfolio(['GREEN', 'RED']);
  body.data.leagues[1].scoringCoverage.recommendationAuthorityUnlocked = true;
  assert.equal(smoke(body).status, 1);
  body.data.leagues[1].scoringCoverage.recommendationAuthorityUnlocked = false;
  body.data.scoringCertification.productionAuthorityUnlocked = true;
  assert.equal(smoke(body).status, 1);
});

test('upstream errors and wrong unknown-user behavior never pass', () => {
  assert.equal(smoke({ success: false, code: 'SLEEPER_UPSTREAM_ERROR' }, { status: 502 }).status, 1);
  assert.equal(smoke(portfolio(), { missingStatus: 200 }).status, 1);
  assert.equal(smoke(portfolio(), { missingBody: { success: false, code: 'WRONG_CODE' } }).status, 1);
  assert.equal(smoke(portfolio(), { malformedBody: { success: true } }).status, 1);
});

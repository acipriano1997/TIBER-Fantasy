import {
  assessLeagueDecisionReadiness,
  buildUnifiedLeagueContextV1,
  summarizeLeagueContextHealth,
} from '../leagueContextV1';
import { createContractWorkbookSnapshot } from '../contractWorkbookSnapshot';
import { certifyScoringSettings } from '../scoringCertification';

const NOW = '2026-09-15T15:30:00.000Z';

const sixPointPassingScoring = {
  pass_yd: 0.04,
  pass_td: 6,
  int: -1,
  rush_yd: 0.1,
  rush_td: 6,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  fum_lost: -2,
  bonus_pass_yd_300: 3,
};

const fourPointPassingScoring = {
  ...sixPointPassingScoring,
  pass_td: 4,
  int: -2,
};

describe('Unified League Context v1', () => {
  test('preserves custom six-point passing TD scoring without defaulting it to four', () => {
    const certification = certifyScoringSettings({
      platform: 'sleeper',
      leagueId: 'devy',
      rawSettings: sixPointPassingScoring,
      asOf: NOW,
      checkedAt: NOW,
    });

    expect(certification.status).toBe('certified');
    expect(certification.settings.pass_td).toBe(6);
    expect(certification.settings.bonus_pass_yd_300).toBe(3);
    expect(certification.noSilentDefaults).toBe(true);
  });

  test('fails closed when scoring is missing instead of manufacturing defaults', () => {
    const certification = certifyScoringSettings({
      platform: 'sleeper',
      leagueId: 'missing-scoring',
      rawSettings: null,
      asOf: null,
      checkedAt: NOW,
    });

    expect(certification.status).toBe('unavailable');
    expect(certification.settings).toEqual({});
    expect(certification.issues.join(' ')).toMatch(/unavailable/i);
  });

  test('resolves the Devy supplemental source without activating contract rules', async () => {
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: '1383497639848341504',
      leagueName: 'Devy and Big Boobs',
      season: 2026,
      rawScoringSettings: sixPointPassingScoring,
      scoringAsOf: NOW,
      builtAt: NOW,
    });

    expect(context.capabilities).toContain('devy_rights');
    expect(context.capabilities).not.toContain('contracts');
    expect(context.contractProfile).toBeNull();
    expect(context.devyRightsSource?.spreadsheetId).toBe('1xzg7FHcBTSJoXq6JiIApBsJ3upXLjG5a3KK77mml6qc');
    expect(context.invariants.collegeProspectsNeverBecomePlatformNflRosterPlayers).toBe(true);
    expect(assessLeagueDecisionReadiness(context, { decisionType: 'lineup' }).ready).toBe(true);
    expect(assessLeagueDecisionReadiness(context, { decisionType: 'devy_rights' }).ready).toBe(false);
  });

  test('keeps 4th and Long contract context separate and blocks its unresolved re-sign term rule', async () => {
    const snapshot = createContractWorkbookSnapshot({
      leagueName: '4th and Long',
      workbookId: '1htufwr5A8L2TB8AFquI8tGnMNZpjyQma',
      season: 2026,
      salaryCap: 250_000_000,
      asOf: NOW,
      checkedAt: NOW,
      maxAgeMs: 86_400_000,
    });
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: 'fourth-long-test',
      leagueName: '4th and Long',
      season: 2026,
      rawScoringSettings: fourPointPassingScoring,
      scoringAsOf: NOW,
      contractWorkbookSnapshot: snapshot,
      builtAt: NOW,
    });

    expect(context.contractProfile?.verifiedCore.rookieDraftRounds).toBe(3);
    expect(context.contractWorkbookSnapshot?.profileId).toBe('4th-and-long');
    expect(assessLeagueDecisionReadiness(context, { decisionType: 'trade' }).ready).toBe(true);

    const conflicted = assessLeagueDecisionReadiness(context, {
      decisionType: 'contract',
      contractRule: 'contract_re_sign_term_length',
    });
    expect(conflicted.ready).toBe(false);
    expect(conflicted.blockers.join(' ')).toMatch(/abstain until clarified/i);
  });

  test('keeps Dynasty Nerds independent and exposes its four-round rookie draft', async () => {
    const snapshot = createContractWorkbookSnapshot({
      leagueName: 'Dynasty Nerds',
      workbookId: '1ooXfcjmikTjeZpHsHG216UvGUveFul9a',
      season: 2026,
      salaryCap: 250_000_000,
      asOf: NOW,
      checkedAt: NOW,
      maxAgeMs: 86_400_000,
    });
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: 'dynasty-nerds-test',
      leagueName: 'Dynasty Nerds',
      season: 2026,
      rawScoringSettings: fourPointPassingScoring,
      scoringAsOf: NOW,
      contractWorkbookSnapshot: snapshot,
      builtAt: NOW,
    });

    expect(context.contractProfile?.id).toBe('dynasty-nerds');
    expect(context.contractProfile?.verifiedCore.rookieDraftRounds).toBe(4);
    expect(context.contractProfile?.unknownOrUnverified.join(' ')).toMatch(/Do not inherit 4th and Long/i);
    expect(context.contractProfile?.leagueSpecificPolicy).not.toHaveProperty('restructures');
  });

  test('rejects a workbook from the other contract league', () => {
    expect(() => createContractWorkbookSnapshot({
      leagueName: 'Dynasty Nerds',
      workbookId: '1htufwr5A8L2TB8AFquI8tGnMNZpjyQma',
      season: 2026,
      salaryCap: 250_000_000,
      asOf: NOW,
      checkedAt: NOW,
    })).toThrow(/identity conflict/i);
  });

  test('blocks live contract decisions when the workbook has not been refreshed', async () => {
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: 'dynasty-nerds-test',
      leagueName: 'Dynasty Nerds',
      season: 2026,
      rawScoringSettings: fourPointPassingScoring,
      scoringAsOf: NOW,
      builtAt: NOW,
    });

    const readiness = assessLeagueDecisionReadiness(context, { decisionType: 'contract' });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.join(' ')).toMatch(/Fresh contract workbook snapshot is required/i);
    expect(summarizeLeagueContextHealth(context).contractWorkbook).toBe('unavailable');
  });

  test('blocks stale contract snapshots', async () => {
    const snapshot = createContractWorkbookSnapshot({
      leagueName: '4th and Long',
      workbookId: '1htufwr5A8L2TB8AFquI8tGnMNZpjyQma',
      season: 2026,
      salaryCap: 250_000_000,
      asOf: '2026-09-10T15:30:00.000Z',
      checkedAt: NOW,
      maxAgeMs: 86_400_000,
    });
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: 'fourth-long-test',
      leagueName: '4th and Long',
      season: 2026,
      rawScoringSettings: fourPointPassingScoring,
      scoringAsOf: NOW,
      contractWorkbookSnapshot: snapshot,
      builtAt: NOW,
    });

    expect(snapshot.completeForDecisionUse).toBe(false);
    expect(assessLeagueDecisionReadiness(context, { decisionType: 'contract' }).ready).toBe(false);
  });
});

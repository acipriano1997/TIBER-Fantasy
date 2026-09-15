import {
  assertContractRuleUsable,
  clearContractLeagueRuleProfiles,
  listContractLeagueRuleProfiles,
  registerContractLeagueRuleProfile,
  resolveContractLeagueRuleProfile,
} from '../contractLeagueRegistry';

function registerSyntheticProfiles() {
  registerContractLeagueRuleProfile({
    id: 'synthetic-alpha',
    leagueName: 'Synthetic Alpha',
    aliases: ['Alpha Contract Lab'],
    sourceFiles: {
      operationalWorkbook: { driveFileId: 'synthetic-workbook-alpha' },
      rulesSource: { sourceId: 'synthetic-rules-alpha' },
    },
    verifiedCore: { salaryCap: 500, rookieDraftRounds: 3 },
    knownConflicts: [{ rule: 're_sign_term', sources: ['synthetic constitution', 'synthetic calculator'] }],
    unknownOrUnverified: [],
    leagueSpecificPolicy: { tags: { enabled: true } },
  });
  registerContractLeagueRuleProfile({
    id: 'synthetic-beta',
    leagueName: 'Synthetic Beta',
    sourceFiles: {
      operationalWorkbook: { driveFileId: 'synthetic-workbook-beta' },
      rulesSource: null,
    },
    verifiedCore: { salaryCap: 600, rookieDraftRounds: 4 },
    knownConflicts: [],
    unknownOrUnverified: ['re_sign_term is unavailable; do not inherit another league policy.'],
    leagueSpecificPolicy: {},
  });
}

describe('contract league rule registry', () => {
  beforeEach(() => {
    clearContractLeagueRuleProfiles();
    registerSyntheticProfiles();
  });

  afterEach(() => clearContractLeagueRuleProfiles());

  test('is empty by default until an authorized caller registers profiles', () => {
    clearContractLeagueRuleProfiles();
    expect(listContractLeagueRuleProfiles()).toEqual([]);
  });

  test('resolves synthetic profiles by league name, alias, and workbook id', () => {
    expect(resolveContractLeagueRuleProfile({ leagueName: 'Synthetic Alpha' })?.id).toBe('synthetic-alpha');
    expect(resolveContractLeagueRuleProfile({ leagueName: 'Alpha Contract Lab' })?.id).toBe('synthetic-alpha');
    expect(resolveContractLeagueRuleProfile({ workbookId: 'synthetic-workbook-beta' })?.id).toBe('synthetic-beta');
  });

  test('keeps rule profiles independent', () => {
    expect(resolveContractLeagueRuleProfile({ leagueName: 'Synthetic Alpha' })?.verifiedCore.rookieDraftRounds).toBe(3);
    expect(resolveContractLeagueRuleProfile({ leagueName: 'Synthetic Beta' })?.verifiedCore.rookieDraftRounds).toBe(4);
  });

  test('fails closed on conflicting or unknown rules', () => {
    const alpha = resolveContractLeagueRuleProfile({ leagueName: 'Synthetic Alpha' })!;
    const beta = resolveContractLeagueRuleProfile({ leagueName: 'Synthetic Beta' })!;
    expect(() => assertContractRuleUsable(alpha, 're_sign_term')).toThrow(/abstain until clarified/i);
    expect(() => assertContractRuleUsable(beta, 're_sign_term')).toThrow(/unknown or unverified/i);
  });

  test('rejects mismatched name and workbook identities', () => {
    expect(() => resolveContractLeagueRuleProfile({
      leagueName: 'Synthetic Alpha',
      workbookId: 'synthetic-workbook-beta',
    })).toThrow(/identity conflict/i);
  });

  test('rejects duplicate workbook identities', () => {
    expect(() => registerContractLeagueRuleProfile({
      id: 'synthetic-duplicate',
      leagueName: 'Synthetic Duplicate',
      sourceFiles: { operationalWorkbook: { driveFileId: 'synthetic-workbook-alpha' }, rulesSource: null },
      verifiedCore: { salaryCap: 500, rookieDraftRounds: 2 },
      knownConflicts: [],
      unknownOrUnverified: [],
      leagueSpecificPolicy: {},
    })).toThrow(/workbook identity conflict/i);
  });
});

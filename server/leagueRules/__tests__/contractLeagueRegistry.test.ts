import {
  assertContractRuleUsable,
  dynastyNerdsProfile,
  fourthAndLongProfile,
  resolveContractLeagueRuleProfile,
} from '../contractLeagueRegistry';

describe('contract league rule registry', () => {
  test('resolves 4th and Long by league name and workbook id', () => {
    expect(resolveContractLeagueRuleProfile({ leagueName: '4th and Long' })?.id).toBe('4th-and-long');
    expect(
      resolveContractLeagueRuleProfile({ workbookId: '1htufwr5A8L2TB8AFquI8tGnMNZpjyQma' })?.id,
    ).toBe('4th-and-long');
  });

  test('resolves Dynasty Nerds by league name and workbook id', () => {
    expect(resolveContractLeagueRuleProfile({ leagueName: 'Dynasty Nerds' })?.id).toBe('dynasty-nerds');
    expect(
      resolveContractLeagueRuleProfile({ workbookId: '1ooXfcjmikTjeZpHsHG216UvGUveFul9a' })?.id,
    ).toBe('dynasty-nerds');
  });

  test('does not flatten rookie draft rules across the two contract leagues', () => {
    expect(fourthAndLongProfile.verifiedCore.rookieDraftRounds).toBe(3);
    expect(dynastyNerdsProfile.verifiedCore.rookieDraftRounds).toBe(4);
  });

  test('does not flatten current rate tables across the two contract leagues', () => {
    expect(fourthAndLongProfile.currentRateSnapshot.reSignAavByPositionAndFinishBucket.QB.top5).toBe(
      44_500_000,
    );
    expect(dynastyNerdsProfile.currentRateSnapshot.reSignAavByPositionAndFinishBucket.QB.top5).toBe(
      39_000_000,
    );
    expect(fourthAndLongProfile.currentRateSnapshot.franchiseTagAav.WR).toBe(67_000_000);
    expect(dynastyNerdsProfile.currentRateSnapshot.franchiseTagAav.WR).toBe(54_000_000);
  });

  test('fails closed on the 4th and Long re-sign term-length conflict', () => {
    expect(() => assertContractRuleUsable(fourthAndLongProfile, 'contract_re_sign_term_length')).toThrow(
      /abstain until clarified/i,
    );
  });

  test('preserves Dynasty Nerds unknown policy instead of inheriting 4th and Long rules', () => {
    expect(dynastyNerdsProfile.sourceFiles.writtenConstitution).toBeNull();
    expect(dynastyNerdsProfile.unknownOrUnverified.join(' ')).toMatch(/Do not inherit 4th and Long/i);
  });

  test('rejects mismatched league-name and workbook identities', () => {
    expect(() =>
      resolveContractLeagueRuleProfile({
        leagueName: 'Dynasty Nerds',
        workbookId: '1htufwr5A8L2TB8AFquI8tGnMNZpjyQma',
      }),
    ).toThrow(/identity conflict/i);
  });
});

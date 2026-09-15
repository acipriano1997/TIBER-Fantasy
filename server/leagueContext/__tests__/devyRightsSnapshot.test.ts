import { createDevyRightsSnapshot } from '../devyRightsSnapshot';
import { assessLeagueDecisionReadiness, buildUnifiedLeagueContextV1 } from '../leagueContextV1';
import { toDecisionPacketLeagueContext } from '../decisionPacketLeagueContext';

const NOW = '2026-09-15T15:30:00.000Z';
const scoring = {
  pass_yd: 0.04,
  pass_td: 6,
  int: -1,
  rush_yd: 0.1,
  rush_td: 6,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  fum_lost: -2,
};

describe('DevyRightsSnapshotV1', () => {
  test('turns the linked sheet into explicit ownership evidence without touching the NFL roster', async () => {
    const snapshot = await createDevyRightsSnapshot({
      leagueId: '1383497639848341504',
      spreadsheetId: '1xzg7FHcBTSJoXq6JiIApBsJ3upXLjG5a3KK77mml6qc',
      sheetName: 'Sheet1',
      ownerHandle: 'Cippy97',
      asOf: NOW,
      checkedAt: NOW,
      extractionComplete: true,
      rights: [
        { playerName: 'Sam Leavitt', school: 'LSU', classYear: 2027 },
        { playerName: 'Dylan Raiola', school: 'Oregon', classYear: 2028 },
      ],
    });

    expect(snapshot.completeForDecisionUse).toBe(true);
    expect(snapshot.ownerHandle).toBe('cippy97');
    expect(snapshot.invariants.neverPromoteToPlatformNflRoster).toBe(true);

    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: '1383497639848341504',
      leagueName: 'Devy and Big Boobs',
      season: 2026,
      rawScoringSettings: scoring,
      scoringAsOf: NOW,
      devyRightsSnapshot: snapshot,
      builtAt: NOW,
    });

    expect(assessLeagueDecisionReadiness(context, { decisionType: 'devy_rights' }).ready).toBe(true);
    expect(context.devyRightsSnapshot?.rights).toHaveLength(2);

    const packet = toDecisionPacketLeagueContext(context, { decisionType: 'devy_rights' });
    expect(packet.devyRights?.rightCount).toBe(2);
    expect(packet.devyRights?.unresolvedIdentityCount).toBe(2);
  });

  test('rejects the wrong spreadsheet identity', async () => {
    await expect(createDevyRightsSnapshot({
      leagueId: '1383497639848341504',
      spreadsheetId: 'wrong-sheet',
      sheetName: 'Sheet1',
      ownerHandle: '@cippy97',
      asOf: NOW,
      checkedAt: NOW,
      extractionComplete: true,
      rights: [],
    })).rejects.toThrow(/source identity mismatch/i);
  });

  test('preserves unresolved player identity instead of guessing a join', async () => {
    const snapshot = await createDevyRightsSnapshot({
      leagueId: '1383497639848341504',
      spreadsheetId: '1xzg7FHcBTSJoXq6JiIApBsJ3upXLjG5a3KK77mml6qc',
      sheetName: 'Sheet1',
      ownerHandle: '@cippy97',
      asOf: NOW,
      checkedAt: NOW,
      extractionComplete: true,
      rights: [{ playerName: 'Unmatched Prospect', school: 'Unknown' }],
    });

    expect(snapshot.rights[0].identityStatus).toBe('unresolved');
  });
});

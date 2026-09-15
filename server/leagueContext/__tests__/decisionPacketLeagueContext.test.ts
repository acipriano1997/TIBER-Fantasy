import {
  assertDecisionPacketLeagueContextReady,
  toDecisionPacketLeagueContext,
} from '../decisionPacketLeagueContext';
import { buildUnifiedLeagueContextV1 } from '../leagueContextV1';

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

describe('Decision Packet league context projection', () => {
  test('is deterministic for identical frozen league evidence', async () => {
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: '1383497639848341504',
      leagueName: 'Devy and Big Boobs',
      season: 2026,
      rawScoringSettings: scoring,
      scoringAsOf: NOW,
      builtAt: NOW,
    });

    const first = toDecisionPacketLeagueContext(context, { decisionType: 'lineup' });
    const second = toDecisionPacketLeagueContext(context, { decisionType: 'lineup' });

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.scoring.settings.pass_td).toBe(6);
    expect(first.scoring.fingerprint).toBe(context.scoring.fingerprint);
    expect(first.readiness.ready).toBe(true);
    expect(() => assertDecisionPacketLeagueContextReady(first)).not.toThrow();
  });

  test('carries fail-closed blockers into the frozen projection', async () => {
    const context = await buildUnifiedLeagueContextV1({
      platform: 'sleeper',
      leagueId: 'missing',
      leagueName: 'Example',
      season: 2026,
      rawScoringSettings: null,
      scoringAsOf: null,
      builtAt: NOW,
    });

    const packet = toDecisionPacketLeagueContext(context, { decisionType: 'lineup' });
    expect(packet.readiness.ready).toBe(false);
    expect(packet.readiness.blockers.join(' ')).toMatch(/not certified/i);
    expect(() => assertDecisionPacketLeagueContextReady(packet)).toThrow(/abstain/i);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Command Center legacy decision-engine quarantine', () => {
  test('CommandCenterV1 does not import legacy start/sit, waiver, or trade heuristics', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'client/src/pages/CommandCenterV1.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/voice\/deciders\/startSit/);
    expect(source).not.toMatch(/voice\/deciders\/waiver/);
    expect(source).not.toMatch(/services\/trade\/tradeLogic/);
    expect(source).not.toMatch(/optimizeLineup|generateWaiverRecommendations|analyzeTradeOpportunities/);
  });
});

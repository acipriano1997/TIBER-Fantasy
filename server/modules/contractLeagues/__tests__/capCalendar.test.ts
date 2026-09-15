import { buildContractDecisionQueue } from '../capCalendar';
import { makeBoundaryPolicy } from './decisionBoundaryFixtures';

describe('contract lifecycle decision queue', () => {
  it('orders exact-date decisions by the next manager action without inventing a clock time', () => {
    const policy = makeBoundaryPolicy();
    policy.lifecycle.windows = [
      {
        id: 'restructure-window',
        action: 'RESTRUCTURE',
        opens: { kind: 'DATE', date: '2026-09-01' },
        closes: { kind: 'DATE', date: '2026-09-20' },
      },
      {
        id: 'trade-window',
        action: 'TRADE',
        opens: { kind: 'DATE', date: '2026-08-01' },
        closes: { kind: 'DATE', date: '2026-10-01' },
      },
    ];

    const result = buildContractDecisionQueue(policy, '2026-09-15');

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.items.map((item) => item.windowId)).toEqual([
      'restructure-window',
      'trade-window',
    ]);
    expect(result.items[0]).toMatchObject({
      status: 'OPEN',
      timingConfidence: 'EXACT_DATE',
      nextEvent: { type: 'CLOSE', exactDate: '2026-09-20', daysUntil: 5 },
    });
  });

  it('keeps event-based timing explicit instead of guessing a date', () => {
    const policy = makeBoundaryPolicy();
    policy.lifecycle.windows = [{
      id: 'rookie-window',
      action: 'ROOKIE_DRAFT',
      opens: { kind: 'NFL_EVENT', event: 'NFL_DRAFT_END' },
      closes: null,
    }];

    const result = buildContractDecisionQueue(policy, '2026-09-15');

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.items[0]).toMatchObject({
      status: 'UNKNOWN',
      timingConfidence: 'EVENT_DEFINED',
      nextEvent: { type: 'OPEN', exactDate: null, daysUntil: null },
    });
  });
});

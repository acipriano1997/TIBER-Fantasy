import { contractLeaguePolicySchema, type ContractLeaguePolicy } from './policy';

export const CONTRACT_DECISION_QUEUE_VERSION = 'contract-decision-queue.v1' as const;

type Window = ContractLeaguePolicy['lifecycle']['windows'][number];
type Trigger = NonNullable<Window['opens']>;

export type ContractDecisionQueueItem = {
  windowId: string;
  action: Window['action'];
  status: 'BEFORE_OPEN' | 'OPEN' | 'CLOSED' | 'UNKNOWN';
  opens: Trigger | null;
  closes: Trigger | null;
  nextEvent: {
    type: 'OPEN' | 'CLOSE';
    trigger: Trigger;
    exactDate: string | null;
    daysUntil: number | null;
  } | null;
  timingConfidence: 'EXACT_DATE' | 'EVENT_DEFINED' | 'UNRESOLVED';
};

export type ContractDecisionQueueResult =
  | {
    status: 'ABSTAIN';
    version: typeof CONTRACT_DECISION_QUEUE_VERSION;
    reasonCodes: string[];
    details: string[];
  }
  | {
    status: 'READY';
    version: typeof CONTRACT_DECISION_QUEUE_VERSION;
    asOfDate: string;
    items: ContractDecisionQueueItem[];
  };

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function compareDate(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function daysBetween(from: string, to: string) {
  const fromMs = new Date(`${from}T00:00:00.000Z`).valueOf();
  const toMs = new Date(`${to}T00:00:00.000Z`).valueOf();
  return Math.round((toMs - fromMs) / 86_400_000);
}

function exactDate(trigger: Trigger | null) {
  return trigger?.kind === 'DATE' ? trigger.date : null;
}

function statusFor(window: Window, asOfDate: string): ContractDecisionQueueItem['status'] {
  const opens = exactDate(window.opens);
  const closes = exactDate(window.closes);
  if (opens !== null && compareDate(asOfDate, opens) < 0) return 'BEFORE_OPEN';
  if (closes !== null && compareDate(asOfDate, closes) > 0) return 'CLOSED';
  if ((window.opens === null || opens !== null) && (window.closes === null || closes !== null)) return 'OPEN';
  return 'UNKNOWN';
}

function nextEvent(window: Window, asOfDate: string): ContractDecisionQueueItem['nextEvent'] {
  const opens = exactDate(window.opens);
  if (opens !== null && compareDate(asOfDate, opens) < 0 && window.opens) {
    return {
      type: 'OPEN',
      trigger: window.opens,
      exactDate: opens,
      daysUntil: daysBetween(asOfDate, opens),
    };
  }
  const closes = exactDate(window.closes);
  if (closes !== null && compareDate(asOfDate, closes) <= 0 && window.closes) {
    return {
      type: 'CLOSE',
      trigger: window.closes,
      exactDate: closes,
      daysUntil: daysBetween(asOfDate, closes),
    };
  }
  if (window.opens !== null && opens === null) {
    return { type: 'OPEN', trigger: window.opens, exactDate: null, daysUntil: null };
  }
  if (window.closes !== null && closes === null) {
    return { type: 'CLOSE', trigger: window.closes, exactDate: null, daysUntil: null };
  }
  return null;
}

export function buildContractDecisionQueue(
  policyInput: unknown,
  asOfDate: string,
): ContractDecisionQueueResult {
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);
  if (!policyResult.success) {
    return {
      status: 'ABSTAIN',
      version: CONTRACT_DECISION_QUEUE_VERSION,
      reasonCodes: ['POLICY_INVALID'],
      details: ['Contract policy failed schema validation.'],
    };
  }
  if (!validDate(asOfDate)) {
    return {
      status: 'ABSTAIN',
      version: CONTRACT_DECISION_QUEUE_VERSION,
      reasonCodes: ['AS_OF_DATE_INVALID'],
      details: ['Decision queue requires an explicit YYYY-MM-DD league-local calendar date.'],
    };
  }
  const policy = policyResult.data;
  if (policy.validation.status !== 'VALID') {
    return {
      status: 'ABSTAIN',
      version: CONTRACT_DECISION_QUEUE_VERSION,
      reasonCodes: ['POLICY_NOT_DECISION_READY'],
      details: ['Only a VALID league policy may drive the contract decision queue.'],
    };
  }

  const items = policy.lifecycle.windows.map((window): ContractDecisionQueueItem => {
    const event = nextEvent(window, asOfDate);
    const datesOnly = (window.opens === null || window.opens.kind === 'DATE')
      && (window.closes === null || window.closes.kind === 'DATE');
    return {
      windowId: window.id,
      action: window.action,
      status: statusFor(window, asOfDate),
      opens: window.opens,
      closes: window.closes,
      nextEvent: event,
      timingConfidence: datesOnly
        ? 'EXACT_DATE'
        : event === null ? 'UNRESOLVED' : 'EVENT_DEFINED',
    };
  }).sort((a, b) => {
    const aDays = a.nextEvent?.daysUntil;
    const bDays = b.nextEvent?.daysUntil;
    if (aDays !== null && aDays !== undefined && bDays !== null && bDays !== undefined) return aDays - bDays;
    if (aDays !== null && aDays !== undefined) return -1;
    if (bDays !== null && bDays !== undefined) return 1;
    return a.windowId.localeCompare(b.windowId);
  });

  return {
    status: 'READY',
    version: CONTRACT_DECISION_QUEUE_VERSION,
    asOfDate,
    items,
  };
}

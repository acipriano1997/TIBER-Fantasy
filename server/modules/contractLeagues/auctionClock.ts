import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { contractLeaguePolicySchema } from './policy';
import { resolveAuctionStateForDecision } from './freeAgentAuctionState';

export const CONTRACT_AUCTION_CLOCK_VERSION = 'contract-auction-clock.v1' as const;

type AuctionClockResult =
  | { status: 'ABSTAIN'; reasonCodes: string[]; details: string[]; fingerprint: string }
  | { status: 'READY'; accepted: boolean; violations: { code: string; detail: string }[]; priorClosesAt: string; projectedClosesAt: string; resetApplied: boolean; fingerprint: string };

function parseTime(value: string | null | undefined) { if (!value) return null; const parsed = new Date(value).valueOf(); return Number.isFinite(parsed) ? parsed : null; }
function fp(value: unknown) { const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null'; return `sha256:${createHash('sha256').update(canonical).digest('hex')}`; }

export function projectAuctionClockAfterBid(
  auctionInput: unknown,
  policyInput: unknown,
  context: { leagueKey: string; decisionAt: string; bidSubmittedAt: string },
): AuctionClockResult {
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);
  if (!policyResult.success) return { status: 'ABSTAIN', reasonCodes: ['POLICY_INVALID'], details: ['Contract policy failed schema validation.'], fingerprint: fp({ auctionInput, policyInput, context }) };
  const policy = policyResult.data;
  if (policy.validation.status !== 'VALID') return { status: 'ABSTAIN', reasonCodes: ['POLICY_NOT_DECISION_READY'], details: ['Only VALID policy may project an auction clock.'], fingerprint: fp({ auctionInput, policy, context }) };
  const stateResult = resolveAuctionStateForDecision(auctionInput, { leagueKey: context.leagueKey, decisionAt: context.decisionAt });
  if (stateResult.status === 'ABSTAIN') return stateResult;
  const state = stateResult.state;
  if (state.status !== 'OPEN') return { status: 'ABSTAIN', reasonCodes: ['AUCTION_NOT_OPEN'], details: [`Auction status is ${state.status}; bid-clock projection requires OPEN state.`], fingerprint: fp({ state, policy, context }) };
  if (policy.freeAgency.bidWindowHours === null || policy.freeAgency.resetsOnNewBid === null) return { status: 'ABSTAIN', reasonCodes: ['AUCTION_CLOCK_POLICY_UNAVAILABLE'], details: ['Bid window duration and reset behavior must both be authoritative.'], fingerprint: fp({ state, policy, context }) };
  const priorCloseMs = parseTime(state.timing.closesAt);
  const bidMs = parseTime(context.bidSubmittedAt);
  const decisionMs = parseTime(context.decisionAt);
  if (priorCloseMs === null) return { status: 'ABSTAIN', reasonCodes: ['AUCTION_CLOSE_TIME_UNAVAILABLE'], details: ['Open auction lacks an authoritative close time.'], fingerprint: fp({ state, policy, context }) };
  if (bidMs === null || decisionMs === null) return { status: 'ABSTAIN', reasonCodes: ['AUCTION_BID_TIME_INVALID'], details: ['Bid and decision timestamps must be valid.'], fingerprint: fp({ state, policy, context }) };
  if (bidMs > decisionMs) return { status: 'ABSTAIN', reasonCodes: ['AUCTION_BID_AFTER_DECISION'], details: ['Bid submission occurs after the frozen decision timestamp.'], fingerprint: fp({ state, policy, context }) };

  const violations: { code: string; detail: string }[] = [];
  if (bidMs > priorCloseMs) violations.push({ code: 'AUCTION_WINDOW_CLOSED', detail: 'Bid submission occurs after the authoritative close time.' });
  const projectedMs = policy.freeAgency.resetsOnNewBid
    ? bidMs + policy.freeAgency.bidWindowHours * 60 * 60 * 1000
    : priorCloseMs;
  return {
    status: 'READY',
    accepted: violations.length === 0,
    violations,
    priorClosesAt: new Date(priorCloseMs).toISOString(),
    projectedClosesAt: new Date(projectedMs).toISOString(),
    resetApplied: policy.freeAgency.resetsOnNewBid && violations.length === 0,
    fingerprint: fp({ state, policy, context }),
  };
}

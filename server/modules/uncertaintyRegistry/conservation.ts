import { z } from 'zod';
import { TIBER_PLAYER_ID_PATTERN } from '../../services/identity/tiberPlayerId';

const playerId = z.string().regex(TIBER_PLAYER_ID_PATTERN);
const opaque = z.string().min(1).max(512);

export const OpportunityConservationConstraintV0Schema = z.object({
  constraintId: z.string().regex(/^constraint:[A-Za-z0-9._-]{1,128}$/),
  resourceKey: opaque,
  participantPlayerIds: z.array(playerId).min(2),
  capacity: z.number().finite().positive(),
  mode: z.enum(['SUM_EQ', 'SUM_LTE']),
  tolerance: z.number().finite().min(0).max(0.25),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.participantPlayerIds).size !== value.participantPlayerIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate conservation participant' });
  }
});
export type OpportunityConservationConstraintV0 = z.infer<typeof OpportunityConservationConstraintV0Schema>;

export const OpportunityAllocationV0Schema = z.object({
  constraintId: z.string().regex(/^constraint:[A-Za-z0-9._-]{1,128}$/),
  allocations: z.array(z.object({
    playerId,
    value: z.number().finite().min(0),
  }).strict()).min(1),
}).strict().superRefine((value, ctx) => {
  const ids = value.allocations.map((allocation) => allocation.playerId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate allocation participant' });
  }
});
export type OpportunityAllocationV0 = z.infer<typeof OpportunityAllocationV0Schema>;

export type OpportunityConservationValidationV0 = {
  valid: boolean;
  reasonCodes: string[];
  total: number | null;
};

export function validateOpportunityConservationV0(
  constraint: OpportunityConservationConstraintV0,
  allocation: OpportunityAllocationV0,
): OpportunityConservationValidationV0 {
  const reasons: string[] = [];
  const parsedConstraint = OpportunityConservationConstraintV0Schema.safeParse(constraint);
  const parsedAllocation = OpportunityAllocationV0Schema.safeParse(allocation);
  if (!parsedConstraint.success) reasons.push('constraint_schema_invalid');
  if (!parsedAllocation.success) reasons.push('allocation_schema_invalid');
  if (reasons.length) return { valid: false, reasonCodes: reasons, total: null };

  if (allocation.constraintId !== constraint.constraintId) reasons.push('constraint_id_mismatch');
  const participants = new Set(constraint.participantPlayerIds);
  const allocatedPlayers = allocation.allocations.map((entry) => entry.playerId);
  if (allocatedPlayers.some((id) => !participants.has(id))) reasons.push('allocation_contains_undeclared_participant');
  if (constraint.participantPlayerIds.some((id) => !allocatedPlayers.includes(id))) reasons.push('allocation_missing_declared_participant');

  const total = allocation.allocations.reduce((sum, entry) => sum + entry.value, 0);
  if (constraint.mode === 'SUM_EQ' && Math.abs(total - constraint.capacity) > constraint.tolerance) {
    reasons.push('allocation_violates_sum_eq_capacity');
  }
  if (constraint.mode === 'SUM_LTE' && total > constraint.capacity + constraint.tolerance) {
    reasons.push('allocation_exceeds_capacity');
  }

  return { valid: reasons.length === 0, reasonCodes: Array.from(new Set(reasons)).sort(), total };
}

import type {
  ScenarioBranchBindingV0,
  SituationDefinitionV0,
} from './contracts';
import type { ScenarioBranchValidationV0 } from './policyCore';
import { validateScenarioBranchBindingV0 as validateBaseScenarioBindingV0 } from './policyCore';

/**
 * Scenario branches are version-bound. A binding that names the right
 * situation but a different definition version is stale/ambiguous and must
 * fail closed before CCF can ever consume the reference seam.
 */
export function validateScenarioBranchBindingV0(
  definition: SituationDefinitionV0,
  binding: ScenarioBranchBindingV0,
): ScenarioBranchValidationV0 {
  const base = validateBaseScenarioBindingV0(definition, binding);
  const reasons = [...base.reasonCodes];
  if (
    binding.definitionRef.schemaVersion !== definition.schemaVersion
    || binding.definitionRef.recordId !== definition.recordId
    || binding.definitionRef.recordDigest !== definition.recordDigest
  ) {
    reasons.push('scenario_definition_ref_mismatch');
  }
  const reasonCodes = Array.from(new Set(reasons)).sort();
  return { valid: reasonCodes.length === 0, reasonCodes };
}

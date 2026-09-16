import crypto from "crypto";

export type CCFFeatureAblationMode = "full" | "leave_one_family_out" | "single_family_only";

export interface CCFFeatureAblationVariant {
  variantId: string;
  mode: CCFFeatureAblationMode;
  includedFamilies: string[];
  excludedFamilies: string[];
}

export interface CCFFeatureAblationPlan {
  contractVersion: "ccf-feature-ablation-plan-v1";
  featureSetFingerprint: string;
  featureFamilies: string[];
  includeLeaveOneFamilyOut: boolean;
  includeSingleFamilyOnly: boolean;
  variants: CCFFeatureAblationVariant[];
}

function normalizedFamilies(featureFamilies: readonly string[]): string[] {
  const families = featureFamilies.map((family) => family.trim()).filter(Boolean).sort();
  if (families.length === 0) throw new Error("at least one feature family is required");
  if (new Set(families).size !== families.length) {
    throw new Error("feature families must be unique");
  }
  return families;
}

export function buildCCFFeatureAblationPlan(
  featureSetFingerprint: string,
  featureFamilies: readonly string[],
  options: { includeLeaveOneFamilyOut?: boolean; includeSingleFamilyOnly?: boolean } = {},
): CCFFeatureAblationPlan {
  if (!featureSetFingerprint.trim()) throw new Error("featureSetFingerprint is required");
  const families = normalizedFamilies(featureFamilies);
  const includeLeaveOneFamilyOut = options.includeLeaveOneFamilyOut ?? true;
  const includeSingleFamilyOnly = options.includeSingleFamilyOnly ?? true;

  const variants: CCFFeatureAblationVariant[] = [
    {
      variantId: "full",
      mode: "full",
      includedFamilies: [...families],
      excludedFamilies: [],
    },
  ];

  if (includeLeaveOneFamilyOut) {
    for (const family of families) {
      variants.push({
        variantId: `without:${family}`,
        mode: "leave_one_family_out",
        includedFamilies: families.filter((candidate) => candidate !== family),
        excludedFamilies: [family],
      });
    }
  }

  if (includeSingleFamilyOnly) {
    for (const family of families) {
      variants.push({
        variantId: `only:${family}`,
        mode: "single_family_only",
        includedFamilies: [family],
        excludedFamilies: families.filter((candidate) => candidate !== family),
      });
    }
  }

  return {
    contractVersion: "ccf-feature-ablation-plan-v1",
    featureSetFingerprint,
    featureFamilies: families,
    includeLeaveOneFamilyOut,
    includeSingleFamilyOnly,
    variants,
  };
}

export function validateCCFFeatureAblationPlan(plan: CCFFeatureAblationPlan): CCFFeatureAblationPlan {
  if (plan.contractVersion !== "ccf-feature-ablation-plan-v1") {
    throw new Error("unsupported feature ablation plan version");
  }
  if (!plan.featureSetFingerprint.trim()) throw new Error("featureSetFingerprint is required");
  const families = normalizedFamilies(plan.featureFamilies);
  const familySet = new Set(families);
  const variantIds = new Set<string>();

  if (!plan.variants.some((variant) => variant.mode === "full")) {
    throw new Error("ablation plan requires a full-model control variant");
  }

  for (const variant of plan.variants) {
    if (!variant.variantId.trim()) throw new Error("variantId is required");
    if (variantIds.has(variant.variantId)) throw new Error(`duplicate variantId ${variant.variantId}`);
    variantIds.add(variant.variantId);

    if (new Set(variant.includedFamilies).size !== variant.includedFamilies.length) {
      throw new Error(`${variant.variantId} includedFamilies contains duplicates`);
    }
    if (new Set(variant.excludedFamilies).size !== variant.excludedFamilies.length) {
      throw new Error(`${variant.variantId} excludedFamilies contains duplicates`);
    }
    for (const family of [...variant.includedFamilies, ...variant.excludedFamilies]) {
      if (!familySet.has(family)) throw new Error(`${variant.variantId} contains unknown feature family ${family}`);
    }
    if (variant.includedFamilies.some((family) => variant.excludedFamilies.includes(family))) {
      throw new Error(`${variant.variantId} cannot include and exclude the same feature family`);
    }
    if (variant.includedFamilies.length + variant.excludedFamilies.length !== families.length) {
      throw new Error(`${variant.variantId} must partition the complete feature-family set`);
    }
  }

  return plan;
}

export function fingerprintCCFFeatureAblationPlan(plan: CCFFeatureAblationPlan): string {
  validateCCFFeatureAblationPlan(plan);
  const canonical = JSON.stringify({
    ...plan,
    featureFamilies: [...plan.featureFamilies].sort(),
    variants: [...plan.variants]
      .map((variant) => ({
        ...variant,
        includedFamilies: [...variant.includedFamilies].sort(),
        excludedFamilies: [...variant.excludedFamilies].sort(),
      }))
      .sort((left, right) => left.variantId.localeCompare(right.variantId)),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

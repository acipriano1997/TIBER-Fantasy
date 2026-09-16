## Purpose

<!-- One semantic purpose. Keep the change narrow and reversible. -->

## Throughput risk tier

- [ ] `DOCS_ONLY`
- [ ] `TEST_ONLY`
- [ ] `HELD_PREWORK`
- [ ] `SCOPED`
- [ ] `CRITICAL`

If the automated router disagrees, use the more conservative tier unless the classifier itself is being corrected with explicit evidence.

## Smallest proof

<!-- List the focused test, guard, build, replay, or other evidence that proves this change. -->

## Broader / dedicated gates

<!-- List any domain-specific or promotion-boundary checks that still apply. "Skipped" is not a PASS. -->

## Runtime / contract activation

- [ ] No runtime activation or recommendation-authority change
- [ ] Runtime/contract activation is intentional and covered by the applicable broad/dedicated gates

For held prework, confirm that no runtime source imports/re-exports the prework and no activation surface is changed.

## Evidence classification

- [ ] Product/build evidence is separated from verifier/infrastructure evidence
- [ ] Any `NOT_RUN` state is not represented as product PASS/FAIL

## Repository guardrails

- [ ] Scope is minimal and directly tied to the request
- [ ] Existing routes/contracts reviewed before additions
- [ ] No silent API shape drift
- [ ] No fabricated data/readiness continuity
- [ ] Upstream ownership boundaries respected
- [ ] Commands/tests run are listed with outcomes
- [ ] Integration fallback/unavailable behavior is documented when applicable

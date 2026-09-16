# Development Throughput Architecture

## Purpose

TIBER-Fantasy should move faster by removing duplicated validation, idle waiting, and unnecessary serialization — not by weakening correctness gates.

The operating rule is:

> **Parallelize uncertainty; serialize commitment.**

Research, fixtures, tests, inert prework, and implementation preparation may proceed in parallel. Runtime activation, recommendation-authority changes, contract promotion, and `main` promotion remain narrow, explicit, and fully validated.

This document governs development throughput only. It does not change fantasy recommendation logic, CCF authority, data ownership, provenance requirements, abstention behavior, or human-in-the-loop product doctrine.

## Risk tiers

The change router in `scripts/throughput/classify-change.mjs` assigns one of five tiers.

| Tier | Typical change | Default validation |
| --- | --- | --- |
| `DOCS_ONLY` | Markdown, operator notes, reports | No generic build on PR; throughput contract still runs |
| `TEST_ONLY` | Tests and fixtures only | Run changed tests; avoid unrelated generic build on PR |
| `HELD_PREWORK` | `prework_*` implementation plus tests/docs | Prove no runtime import/activation; run focused tests when present |
| `SCOPED` | Known non-critical implementation surface | Run related Jest tests plus applicable dedicated gates/core build |
| `CRITICAL` | Contracts, routes, platform sync, identity, scoring, migrations, CI workflows, unknown paths | Fail closed to broad/dedicated validation |

Unknown paths are always `CRITICAL`. The router is an optimization layer, never a waiver mechanism.

## Promotion boundary

Every push to `main` is treated as a promotion boundary. The throughput router forces `CRITICAL` classification for promotion events regardless of the changed-file mix.

PR-only optimizations may skip redundant generic work for inert changes, but the broad `Core Build` and `Command Center Certification` workflows continue to run on `main` promotion. Dedicated path-scoped domain gates remain authoritative wherever they apply.

## Held-prework contract

Held prework exists to prepare future work without activating it. A held-prework change must satisfy all of the following:

1. The implementation is named under a `prework_` path/name convention.
2. Runtime production code does not import, require, or re-export that prework.
3. The same change does not touch runtime activation surfaces such as route registration, cron/scheduling, platform sync, middleware, app registration, or package activation.
4. Tests, fixtures, and documentation may accompany the prework.
5. Promotion requires a separate explicit change that accepts the normal runtime/contract gates.

`scripts/throughput/verify-held-prework.mjs` enforces items 2 and 3. This makes it safe for generic PR build workflows to ignore genuinely inert prework while still failing closed if the seam becomes live.

## Focused validation

For `TEST_ONLY`, `HELD_PREWORK`, and `SCOPED` changes, the throughput workflow prefers the smallest meaningful proof:

- directly changed Jest tests for test-only/prework work;
- Jest `--findRelatedTests` for scoped implementation changes;
- dedicated domain workflows whenever their owned paths change;
- generic build/certification only when they add information rather than duplicating the same proof.

The intent is to reuse existing certification primitives rather than invent parallel test suites.

## Workflow evidence states

A failed GitHub workflow is not automatically product evidence. Use `scripts/throughput/classify-workflow-evidence.mjs` to keep these states distinct:

- `PASS / PRODUCT_EVIDENCE` — workflow actually executed and passed.
- `NOT_RUN / INFRASTRUCTURE` — jobs contain no executed steps/runner evidence; do not blame product code.
- `FAIL / VERIFIER` — only verification/guard machinery failed.
- `FAIL / PRODUCT_OR_BUILD` — an executed build/test/product-validation step failed.
- `NOT_RUN / INFRASTRUCTURE_OR_UNRESOLVED` — failure/cancellation without enough executed-step evidence; inspect before assigning blame.

The classifier intentionally refuses to turn missing evidence into a product failure.

## Small-commit rule

Prefer one semantic purpose and one proof per PR/commit slice. A throughput-friendly change should make it easy to answer:

- What single behavior or development contract changed?
- Which risk tier owns it?
- What is the smallest proof that demonstrates correctness?
- Which broader/dedicated gate still applies at commitment time?

This improves rollback, review, failure attribution, and parallel work preparation.

## What this architecture must not do

Do not use throughput optimization to:

- skip a dedicated domain certification gate;
- activate prework implicitly;
- merge larger changes to reduce CI count;
- reinterpret missing/failed infrastructure as successful product evidence;
- weaken point-in-time provenance, leakage protection, uncertainty handling, abstention, or human decision authority;
- allow test/build failures to be relabeled as infrastructure without step-level evidence.

## Local-first workflow

The preferred development loop remains:

```text
local/spec preparation
→ focused implementation
→ smallest relevant proof
→ broader/dedicated validation at commitment boundary
→ clean commit
→ deliberate GitHub PR/sync
→ promotion validation on main
```

The throughput layer reduces repeated work inside that loop; it does not replace the loop.

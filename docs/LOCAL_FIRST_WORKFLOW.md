# Local-First Development Workflow

## Authority

The local filesystem and local Git repository are the primary working authority.

GitHub is the deliberate remote backup, review, and integration surface. It is not the primary development workspace.

## Standard Workflow

1. Work locally.
2. Inspect the working tree.
3. Run focused tests.
4. Run broad regression tests.
5. Run local preflight.
6. Review the complete diff.
7. Create a local commit.
8. Record the exact tested revision.
9. Push deliberately to GitHub.
10. Merge only after applicable certification gates pass.

## Branch Policy

- `main` = approved/stable work.
- `integration/*`, `feature/*`, `fix/*`, and `chore/*` = active work.
- Do not weaken active certification gates to permit a merge.

## Evidence States

Evidence must use only:

- PASS
- FAIL
- NOT RUN

A hosted job that cannot execute because of runner or infrastructure failure is NOT RUN, not FAIL.

## Local Evidence

Local-only evidence belongs under:

`.local-dev/evidence/`

unless an active certification gate explicitly requires the artifact to be committed.

## Revision Reporting

Every readiness or certification statement must identify the exact Git revision that was tested.

Use:

`git rev-parse HEAD`

Do not imply that untested work is covered by evidence from an earlier revision.

## GitHub Sync

Before pushing:

1. Confirm the branch.
2. Confirm the working tree.
3. Review the diff.
4. Run required tests and gates.
5. Record the exact revision.
6. Push intentionally.

Local success and GitHub synchronization are separate states and must be reported separately.

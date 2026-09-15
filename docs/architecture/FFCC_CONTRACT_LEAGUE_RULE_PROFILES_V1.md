# FFCC Contract League Rule Profiles v1

## Purpose

FFCC supports two separate contract dynasty leagues: **4th and Long** and **Dynasty Nerds**. They may share contract-calculator mechanics, but league-specific rules must never be silently inherited across leagues.

Canonical code: `server/leagueRules/contractLeagueRegistry.ts`.

## Source precedence

1. Use the resolved league profile first.
2. Refresh the linked operational workbook before any cap, contract, tag, re-sign, dead-cap, or rookie-pick decision.
3. The workbook owns live numeric tables (current cap, contracts, re-sign values, franchise-tag values, rookie-pick ledger).
4. A written constitution owns non-numeric policy only when it does not conflict with a newer operational source.
5. A material source conflict causes abstention; FFCC must not choose whichever rule is more convenient.
6. Missing policy in one league must remain `unknown/unverified`; it must never be filled from the other league.

## 4th and Long

Sources:
- `4th and Long Constitution` — Drive file `1XHsLPN2qwbw4DZ_I75hBGEffMvAPRRBXwhWTHxjcrPs`
- `4th and Long 2026 Rosters.xlsx` — Drive file `1htufwr5A8L2TB8AFquI8tGnMNZpjyQma`

Verified distinguishing rules include:
- 14 teams, $250M cap.
- Current workbook carries **3 rookie-draft rounds**.
- 25-player in-season roster / 30-player offseason roster; five IR slots, with two season-ending IR slots that save half salary and three normal IR slots.
- Superflex, full PPR, +0.75 TE reception premium; lineup is 1 QB / 2 RB / 3 WR / 1 TE / 2 FLEX / 1 SUPER_FLEX.
- Four restructures per rolling five-year period; optional-to-guaranteed conversion uses 0.67x annual cap hit and must finish at least 50% guaranteed.
- Eight re-signs per rolling five-year period.
- One lifetime amnesty per team.
- One franchise and one transition tag per offseason.
- Future rookie picks may move two drafts ahead; conditional picks are prohibited; dead cap may be traded only in full amounts; up to 50% of guaranteed salary may be retained per year and optional money cannot be retained.

### Known conflict

The written constitution says contract re-signs may be **2–4 years**, while the 2026 workbook Re-Sign Values tab says **3–5 years** and Fully Guaranteed/Heavily Guaranteed. FFCC must abstain on the term-length rule until the league clarifies which source is current.

## Dynasty Nerds

Source located:
- `Dynasty Nerds 2026 Rosters.xlsx` — Drive file `1ooXfcjmikTjeZpHsHG216UvGUveFul9a`

No separate Dynasty Nerds constitution/rules document was located in connected Drive as of 2026-09-15.

Verified operational distinctions include:
- 14 teams, $250M cap.
- Current workbook carries **4 rookie-draft rounds**, not three.
- Re-sign worksheet explicitly permits **3–5 year** Fully Guaranteed or Heavily Guaranteed contracts.
- Franchise tags are one-year fully guaranteed contracts.
- 2026 re-sign and franchise-tag values differ materially from 4th and Long and must be loaded from the Dynasty Nerds workbook.

Unverified until a Dynasty Nerds-specific policy source is found or Sleeper settings resolve it:
- scoring and lineup rules;
- roster/offseason/IR rules;
- restructure allowance and mechanics;
- amnesty rules;
- transition-tag mechanics;
- trade salary-retention/dead-cap rules;
- future-pick and fee rules;
- re-sign quota/rolling window.

## 2026 live numeric differences

Examples that prove the profiles cannot be flattened:
- Top-5 QB re-sign AAV: 4th and Long $44.5M; Dynasty Nerds $39M.
- WR franchise tag: 4th and Long $67M; Dynasty Nerds $54M.
- RB franchise tag: 4th and Long $40M; Dynasty Nerds $45.5M.
- Rookie draft: 4th and Long 3 rounds; Dynasty Nerds 4 rounds.

These are snapshots, not eternal constants. The linked workbook must be refreshed before a real decision.

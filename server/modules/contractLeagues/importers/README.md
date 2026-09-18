# Contract-League Workbook Importers

## Purpose

Transform authorized private workbook data into `contract-league-snapshot.v1` without making workbook layout, labels, or formulas authoritative outside the import boundary.

The importer code is public. Private workbook IDs/URLs, roster contents, contract values, league-specific season mappings, and identity bindings are not.

## Three-row workbook family

`threeRowWorkbook.ts` supports the workbook family currently used by the two private contract leagues audited for FFCC. The source structure uses:

- one team per roster sheet;
- a league marker plus contract-season headers at the top of the team sheet;
- three rows per rostered player: guaranteed money, optional money, then cap hit;
- explicit roster-state labels such as `IR` and `SEASON ENDING IR`;
- a side-table for dead cap;
- authoritative team rows for Total Guaranteed, Total Cap Hit, Cap after Guarantees, and Cap Remaining;
- valid negative `Cap Remaining` values.

The parser consumes a sheet matrix (`ContractWorkbook`) rather than a Google Drive or Excel SDK object. Source acquisition is deliberately outside this module so the same parser can be fed by an authorized Drive integration, a private Excel loader, or another secure source without committing credentials or source identifiers.

## Fail-closed rules

The importer must never infer:

- calendar seasons from ordinal headers (`1`, `2`, `3`, ...);
- canonical player IDs from name similarity;
- league scoring when an authoritative scoring source is absent;
- lineup rules when an authoritative lineup source is absent;
- missing cap totals from a generic salary-cap formula.

Ordinal seasons require an explicit per-sheet mapping. Canonical IDs require a governed exact-name binding supplied by the identity/platform layer. Missing scoring or lineup authority is recorded explicitly in snapshot validation.

A sheet with unresolved season structure is quarantined rather than imported with guessed years. If every candidate team sheet requires guessed structure, the import fails.

## Reconciliation

For each imported season the parser compares:

```text
sum(player cap hits) + sum(dead cap)
```

against the workbook's authoritative `Total Cap Hit` row. A mismatch becomes an explicit unresolved validation item instead of being silently corrected. This protects special league mechanics—IR treatment, commissioner adjustments, or other rules—from being overwritten by generic arithmetic.

## Privacy

Tests must use synthetic fixtures only. Never paste real roster rows, team names, contract values, Drive IDs, spreadsheet URLs, or private league rules into repository fixtures, logs, comments, or examples.

Runtime source references should be opaque private tokens. The persistence layer stores them privately with the snapshot lineage; repository code does not know the user's concrete Drive file IDs.

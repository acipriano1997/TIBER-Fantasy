# CCF Market Intelligence Source Audit — 2026-09-15

## Purpose

Point-in-time source-admission record for CCF Market Perception Intelligence (MPI). Technical accessibility is not authorization. A source is not production-eligible until intended use, provenance, temporal semantics, operational reliability and storage rights are understood.

This audit is deliberately conservative and does not grant recommendation authority to any source.

## KeepTradeCut (KTC)

**State: REJECTED FOR AUTOMATED INGESTION UNDER CURRENT PUBLIC TERMS.**

Public references:
- https://keeptradecut.com/frequently-asked-questions
- https://keeptradecut.com/terms-and-conditions

Observed public constraints as of this audit:
- KTC says it does not currently provide an API or CSV export for rankings/values.
- Its FAQ says scraping player values/data, using full KTC values in tools/resources, or reproducing rankings/values in their entirety is expressly forbidden.
- Its Terms prohibit automated collection including scraping, mining, extraction, bots/crawlers and systematic automated collection.

CCF treatment:
- do not build a KTC scraper;
- do not use full KTC rankings/values as a production data feed;
- individual manually referenced values can remain human-readable external context where permitted, but not a hidden dataset;
- reopen admission only if KTC provides an API/license or explicit permission compatible with FFCC's intended use.

## Sleeper official API

**State: PERMISSION / LICENSING GATED; TECHNICALLY RELEVANT FOR LEAGUE-LOCAL MARKET EVIDENCE.**

Public reference:
- https://docs.sleeper.com/

Observed public capabilities/constraints as of this audit:
- official read-only API;
- exposes leagues, rosters, drafts, draft picks and transactions including completed trades;
- public docs describe free API use for non-commercial purposes;
- public docs instruct commercial users to contact Sleeper about licensing.

CCF treatment:
- useful candidate for league-local transaction history, draft behavior and local-market feasibility;
- do not infer commercial/right-to-store/use permissions from endpoint accessibility;
- existing FFCC Sleeper permission/licensing work remains the admission gate;
- when admitted, preserve exact transaction/draft timestamps and original league/format context rather than converting them directly into a universal market value.

## FantasyCalc

**State: PROMISING CANDIDATE; FORMAL TERMS / TECHNICAL AUDIT REQUIRED BEFORE ADMISSION.**

Public references:
- https://fantasycalc.com/
- https://fantasycalc.com/frequently-asked-questions

Observed public characteristics as of this audit:
- rankings/values are generated from trades from real fantasy leagues;
- public FAQ describes recency-weighted trade-value modeling and league-setting adjustments;
- public FAQ says integration with its data for a tool/sheet/app is allowed with restrictions and directs integrators to its Terms of Usage;
- public site exposes API documentation/data surfaces and trend concepts.

Required before admission:
- read and record exact current Terms of Usage applicable to FFCC;
- verify allowed commercial/non-commercial use, caching, storage, redistribution and attribution;
- verify rate limits and endpoint stability;
- verify historical-data semantics and whether historical values are reconstructable point-in-time without hindsight;
- validate format support (PPR, QB count, league size, TEP where relevant);
- validate player identity mapping and correction behavior;
- determine whether underlying trade samples can produce source-independence/coverage diagnostics.

Do not promote based only on the existence of an endpoint.

## DynastyProcess open data

**State: OPEN-DATA RESEARCH CANDIDATE; PROVENANCE / LICENSE-COMPATIBILITY / CADENCE AUDIT REQUIRED.**

Public reference:
- https://github.com/dynastyprocess/data

Observed public characteristics as of this audit:
- repository describes itself as open fantasy-football data supporting apps/developers;
- repository is licensed GPL-3.0;
- includes player-ID data and value/ranking-oriented files and is updated on an automated cadence.

Required before admission:
- identify the upstream source and license/provenance of every candidate column rather than assuming the repository license grants rights to all upstream content;
- evaluate GPL obligations for the intended integration boundary;
- determine whether weekly cadence is sufficient for a market-velocity use case;
- determine whether archived versions can create a faithful point-in-time historical series;
- evaluate format specificity, correction semantics and player-ID stability.

## DD Fantasy Football / ADV

**State: RESEARCH INSPIRATION; NOT A DEPENDENCY OR ADMITTED DATA SOURCE.**

Public references studied:
- https://www.ddfantasyfootball.com/
- https://podscan.fm/podcasts/dd-fantasy-football-radio/episodes/the-dynasty-fantasy-football-secret-weapon-you-should-be-using

CCF treatment:
- adopt reusable public concepts such as perception direction, frequency, velocity, independent corroboration and market neighborhood;
- do not reproduce/reverse-engineer a proprietary ADV formula;
- do not scrape protected/paywalled ADV data;
- if DD later provides compatible licensed/API access, ADV may enter only as an external `market_challenger` unless an independently owned CCF feature passes CCF promotion rules;
- CCF must remain fully operable with DD/ADV unavailable.

## Minimum source-admission receipt — future contract

Each production source should eventually have a frozen receipt containing at least:
- `source_id` / provider identity;
- admission state (`candidate`, `research_only`, `licensed`, `rejected`, `suspended`);
- intended-use scope;
- terms/license reference and reviewed-at timestamp;
- attribution obligations;
- commercial-use state;
- storage/cache/redistribution rights;
- rate limits / access constraints;
- format/scoring coverage;
- source timestamp semantics;
- CCF `knownAt` semantics;
- historical availability and correction behavior;
- raw trace strategy;
- player identity mapping;
- provenance/original-vs-derivative classification;
- missingness/reliability expectations;
- expiry/re-review date where terms may change.

Until that receipt exists and passes admission review, technical access is **not** source promotion.

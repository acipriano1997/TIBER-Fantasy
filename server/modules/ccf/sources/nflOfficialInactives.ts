import { load } from "cheerio";

export interface CCFNflOfficialInactiveRow {
  teamHeading: string;
  position: string | null;
  playerName: string;
  rawLabel: string;
  emergencyThirdQb: boolean;
}

export interface CCFNflOfficialInactiveProvenance {
  provider: "NFL.com";
  product: "Inactive Reports";
  sourceUrl: string;
  retrievedAt: string;
  knownAt: string;
  upstreamPublishedAt: string | null;
  upstreamUpdatedAt: string | null;
  parserVersion: "ccf-nfl-official-inactives-candidate-v1";
  temporalMode: "current_snapshot_only";
  termsStatus: "candidate_review_required";
  rawTraceStatus: "not_archived";
}

export interface CCFNflOfficialInactiveSnapshot {
  expectedTeams: string[];
  rows: CCFNflOfficialInactiveRow[];
  provenance: CCFNflOfficialInactiveProvenance;
}

export interface ParseNflOfficialInactivesOptions {
  expectedTeams: string[];
}

export interface FetchNflOfficialInactivesOptions extends ParseNflOfficialInactivesOptions {
  sourceUrl: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: () => Date;
}

export class CCFNflOfficialInactivesSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflOfficialInactivesSourceError";
  }
}

const POSITION_TOKENS = new Set([
  "QB",
  "RB",
  "FB",
  "WR",
  "TE",
  "OT",
  "T",
  "G",
  "C",
  "OL",
  "DL",
  "DT",
  "DE",
  "NT",
  "LB",
  "ILB",
  "OLB",
  "EDGE",
  "CB",
  "DB",
  "S",
  "FS",
  "SS",
  "K",
  "P",
  "LS",
]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeTeamHeading(value: string): string {
  return normalizeWhitespace(value).toUpperCase();
}

function parseOptionalTimestamp(value: string | undefined | null): string | null {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function firstTimestamp(
  candidates: Array<string | undefined | null>,
): string | null {
  for (const candidate of candidates) {
    const parsed = parseOptionalTimestamp(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function parseInactiveLabel(raw: string, teamHeading: string): CCFNflOfficialInactiveRow | null {
  const rawLabel = normalizeWhitespace(raw);
  if (!rawLabel) return null;

  const emergencyThirdQb = /\bemergency\s+(?:third|3rd)\s+qb\b/i.test(rawLabel);
  const withoutParenthetical = normalizeWhitespace(rawLabel.replace(/\s*\([^)]*\)\s*$/, ""));
  const [firstToken, ...rest] = withoutParenthetical.split(" ");
  const upperToken = firstToken?.toUpperCase() ?? "";
  const hasPosition = POSITION_TOKENS.has(upperToken);
  const playerName = normalizeWhitespace(hasPosition ? rest.join(" ") : withoutParenthetical);
  if (!playerName) return null;

  return {
    teamHeading,
    position: hasPosition ? upperToken : null,
    playerName,
    rawLabel,
    emergencyThirdQb,
  };
}

function extractArticleTimestamps(html: string): {
  publishedAt: string | null;
  updatedAt: string | null;
} {
  const $ = load(html);
  const publishedAt = firstTimestamp([
    $('meta[property="article:published_time"]').attr("content"),
    $('meta[name="article-publishedDate"]').attr("content"),
    $('meta[name="publish-date"]').attr("content"),
    $('meta[name="date"]').attr("content"),
    $('time[itemprop="datePublished"]').attr("datetime"),
  ]);
  const updatedAt = firstTimestamp([
    $('meta[property="article:modified_time"]').attr("content"),
    $('meta[name="article-modifiedDate"]').attr("content"),
    $('meta[name="last-modified"]').attr("content"),
    $('time[itemprop="dateModified"]').attr("datetime"),
  ]);
  return { publishedAt, updatedAt };
}

export function parseNflOfficialInactivesHtml(
  html: string,
  options: ParseNflOfficialInactivesOptions,
): CCFNflOfficialInactiveRow[] {
  if (!html.trim()) {
    throw new CCFNflOfficialInactivesSourceError("inactive-report HTML must not be empty");
  }
  if (options.expectedTeams.length === 0) {
    throw new CCFNflOfficialInactivesSourceError("expectedTeams must contain at least one team heading");
  }

  const expected = new Map<string, string>();
  for (const team of options.expectedTeams) {
    const normalized = normalizeTeamHeading(team);
    if (!normalized) {
      throw new CCFNflOfficialInactivesSourceError("expectedTeams cannot contain blank headings");
    }
    if (expected.has(normalized)) {
      throw new CCFNflOfficialInactivesSourceError(`duplicate expected team heading ${normalized}`);
    }
    expected.set(normalized, normalized);
  }

  const $ = load(html);
  const rows: CCFNflOfficialInactiveRow[] = [];
  const seenTeams = new Set<string>();
  const seenRows = new Set<string>();
  let currentTeam: string | null = null;

  // NFL article markup has changed over time. Avoid brittle CSS-class coupling:
  // consume headings/list items in document order and require caller-supplied team
  // headings plus complete non-empty lists for every expected team.
  $("h2,h3,h4,li").each((_, element) => {
    const tagName = element.tagName.toLowerCase();
    const text = normalizeWhitespace($(element).text());

    if (tagName === "h2" || tagName === "h3" || tagName === "h4") {
      const normalizedHeading = normalizeTeamHeading(text);
      currentTeam = expected.get(normalizedHeading) ?? null;
      if (currentTeam) seenTeams.add(currentTeam);
      return;
    }

    if (tagName !== "li" || !currentTeam) return;
    const row = parseInactiveLabel(text, currentTeam);
    if (!row) return;
    const key = `${row.teamHeading}\u0000${row.rawLabel}`;
    if (seenRows.has(key)) {
      throw new CCFNflOfficialInactivesSourceError(
        `duplicate inactive row for ${row.teamHeading}: ${row.rawLabel}`,
      );
    }
    seenRows.add(key);
    rows.push(row);
  });

  for (const team of expected.keys()) {
    if (!seenTeams.has(team)) {
      throw new CCFNflOfficialInactivesSourceError(
        `inactive report missing expected team heading ${team}`,
      );
    }
    if (!rows.some((row) => row.teamHeading === team)) {
      throw new CCFNflOfficialInactivesSourceError(
        `inactive report contains no inactive players for expected team ${team}`,
      );
    }
  }

  return rows;
}

export async function fetchNflOfficialInactives(
  options: FetchNflOfficialInactivesOptions,
): Promise<CCFNflOfficialInactiveSnapshot> {
  if (!/^https:\/\/(?:amp\.)?nfl\.com\//i.test(options.sourceUrl)) {
    throw new CCFNflOfficialInactivesSourceError(
      "inactive-report candidate sourceUrl must use an official nfl.com HTTPS host",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const response = await fetchImpl(options.sourceUrl, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      "User-Agent": "CCF/1.0 (+Fantasy Football Command Center)",
    },
    signal: options.signal,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new CCFNflOfficialInactivesSourceError(
      `NFL inactive-report fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  const rows = parseNflOfficialInactivesHtml(html, options);
  const timestamps = extractArticleTimestamps(html);
  const retrievedAt = now().toISOString();

  return {
    expectedTeams: options.expectedTeams.map(normalizeTeamHeading),
    rows,
    provenance: {
      provider: "NFL.com",
      product: "Inactive Reports",
      sourceUrl: options.sourceUrl,
      retrievedAt,
      knownAt: retrievedAt,
      upstreamPublishedAt: timestamps.publishedAt,
      upstreamUpdatedAt: timestamps.updatedAt,
      parserVersion: "ccf-nfl-official-inactives-candidate-v1",
      temporalMode: "current_snapshot_only",
      termsStatus: "candidate_review_required",
      rawTraceStatus: "not_archived",
    },
  };
}

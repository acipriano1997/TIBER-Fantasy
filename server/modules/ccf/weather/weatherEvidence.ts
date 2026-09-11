export type CCFWeatherRoofType = "open_air" | "fixed_dome" | "retractable" | "unknown";
export type CCFWeatherRoofStatus = "open" | "closed" | "partial" | "unknown" | "not_applicable";
export type CCFWeatherEvidenceKind = "forecast" | "observation" | "analysis" | "radar_estimate" | "alert";
export type CCFWeatherSourceRole =
  | "official_forecast"
  | "probabilistic_blend"
  | "rapid_refresh_model"
  | "observation"
  | "radar"
  | "surface_analysis"
  | "global_model"
  | "roof_status"
  | "alert"
  | "other";
export type CCFPrecipitationType = "none" | "rain" | "snow" | "sleet" | "freezing_rain" | "mixed" | "unknown";

export interface CCFWeatherGame {
  gameId: string;
  season: number;
  week: number;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
}

export interface CCFWeatherVenue {
  venueId: string;
  stadiumName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  fieldAxisBearingDeg: number | null;
  roofType: CCFWeatherRoofType;
  surfaceType: string | null;
}

export interface CCFWeatherMeasurements {
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  dewPointC: number | null;
  relativeHumidity: number | null;
  pressureHpa: number | null;
  visibilityM: number | null;
  sustainedWindMps: number | null;
  windGustMps: number | null;
  windDirectionDeg: number | null;
  precipitationProbability: number | null;
  precipitationRateMmPerHr: number | null;
  precipitationType: CCFPrecipitationType;
  lightningProbability: number | null;
}

export interface CCFFieldRelativeWind {
  parallelToFieldMps: number;
  crossFieldMps: number;
  fieldAxisBearingDeg: number;
  derivation: "deterministic_vector_decomposition";
}

export interface CCFWeatherSourceEvidence {
  evidenceId: string;
  provider: string;
  providerProduct: string;
  sourceRole: CCFWeatherSourceRole;
  evidenceKind: CCFWeatherEvidenceKind;
  sourceRecordId: string | null;
  sourceLocator: string | null;
  issuedAt: string | null;
  validStart: string;
  validEnd: string;
  retrievedAt: string;
  knownAt: string;
  locationLatitude: number;
  locationLongitude: number;
  measurements: CCFWeatherMeasurements;
  fieldRelativeWind: CCFFieldRelativeWind | null;
  providerConfidence: number | null;
  rawTraceRef: string;
  notes: string[];
}

export interface CCFRoofStateEvidence {
  evidenceId: string;
  provider: string;
  status: CCFWeatherRoofStatus;
  effectiveAt: string;
  retrievedAt: string;
  knownAt: string;
  rawTraceRef: string;
  notes: string[];
}

export interface CCFWeatherEvidenceBundle {
  contractVersion: "ccf-game-weather-evidence-v1";
  generatedAt: string;
  asOf: string;
  availability: "available" | "unavailable";
  game: CCFWeatherGame;
  venue: CCFWeatherVenue;
  weatherEvidence: CCFWeatherSourceEvidence[];
  roofEvidence: CCFRoofStateEvidence[];
  warnings: string[];
}

export class CCFWeatherEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFWeatherEvidenceError";
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new CCFWeatherEvidenceError(`${label} must be a valid timestamp`);
  return parsed;
}

function finiteInRange(label: string, value: number, min: number, max: number, maxInclusive = true): void {
  if (!Number.isFinite(value) || value < min || (maxInclusive ? value > max : value >= max)) {
    throw new CCFWeatherEvidenceError(`${label} must be in ${maxInclusive ? "[" : "["}${min}, ${max}${maxInclusive ? "]" : ")"}`);
  }
}

function validateProbability(label: string, value: number | null): void {
  if (value != null) finiteInRange(label, value, 0, 1);
}

function validateNonNegative(label: string, value: number | null): void {
  if (value != null && (!Number.isFinite(value) || value < 0)) {
    throw new CCFWeatherEvidenceError(`${label} must be a non-negative finite number`);
  }
}

export function decomposeCCFFieldRelativeWind(
  windSpeedMps: number,
  windDirectionDeg: number,
  fieldAxisBearingDeg: number,
): CCFFieldRelativeWind {
  validateNonNegative("windSpeedMps", windSpeedMps);
  finiteInRange("windDirectionDeg", windDirectionDeg, 0, 360, false);
  finiteInRange("fieldAxisBearingDeg", fieldAxisBearingDeg, 0, 180, false);

  const radians = ((windDirectionDeg - fieldAxisBearingDeg) * Math.PI) / 180;
  return {
    parallelToFieldMps: Math.abs(windSpeedMps * Math.cos(radians)),
    crossFieldMps: Math.abs(windSpeedMps * Math.sin(radians)),
    fieldAxisBearingDeg,
    derivation: "deterministic_vector_decomposition",
  };
}

function validateMeasurements(measurements: CCFWeatherMeasurements): void {
  validateProbability("relativeHumidity", measurements.relativeHumidity);
  validateProbability("precipitationProbability", measurements.precipitationProbability);
  validateProbability("lightningProbability", measurements.lightningProbability);
  validateNonNegative("pressureHpa", measurements.pressureHpa);
  validateNonNegative("visibilityM", measurements.visibilityM);
  validateNonNegative("sustainedWindMps", measurements.sustainedWindMps);
  validateNonNegative("windGustMps", measurements.windGustMps);
  validateNonNegative("precipitationRateMmPerHr", measurements.precipitationRateMmPerHr);

  if (measurements.windDirectionDeg != null) {
    finiteInRange("windDirectionDeg", measurements.windDirectionDeg, 0, 360, false);
  }
  if (
    measurements.sustainedWindMps != null &&
    measurements.windGustMps != null &&
    measurements.windGustMps < measurements.sustainedWindMps
  ) {
    throw new CCFWeatherEvidenceError("windGustMps cannot be lower than sustainedWindMps");
  }
  if (
    measurements.precipitationRateMmPerHr != null &&
    measurements.precipitationRateMmPerHr > 0 &&
    measurements.precipitationType === "none"
  ) {
    throw new CCFWeatherEvidenceError("positive precipitation rate cannot have precipitationType none");
  }
}

export function validateCCFWeatherEvidenceBundle(
  bundle: CCFWeatherEvidenceBundle,
): CCFWeatherEvidenceBundle {
  if (bundle.contractVersion !== "ccf-game-weather-evidence-v1") {
    throw new CCFWeatherEvidenceError("unsupported weather contractVersion");
  }
  const asOf = parseTimestamp("asOf", bundle.asOf);
  const generatedAt = parseTimestamp("generatedAt", bundle.generatedAt);
  if (generatedAt < asOf) throw new CCFWeatherEvidenceError("generatedAt cannot precede asOf");

  parseTimestamp("game.kickoffAt", bundle.game.kickoffAt);
  finiteInRange("venue.latitude", bundle.venue.latitude, -90, 90);
  finiteInRange("venue.longitude", bundle.venue.longitude, -180, 180);
  if (bundle.venue.fieldAxisBearingDeg != null) {
    finiteInRange("venue.fieldAxisBearingDeg", bundle.venue.fieldAxisBearingDeg, 0, 180, false);
  }

  if (bundle.availability === "available" && bundle.weatherEvidence.length === 0) {
    throw new CCFWeatherEvidenceError("available weather bundle requires at least one evidence row");
  }
  if (bundle.availability === "unavailable" && bundle.weatherEvidence.length !== 0) {
    throw new CCFWeatherEvidenceError("unavailable weather bundle must not carry weather evidence rows");
  }

  for (const evidence of bundle.weatherEvidence) {
    const validStart = parseTimestamp(`${evidence.evidenceId}.validStart`, evidence.validStart);
    const validEnd = parseTimestamp(`${evidence.evidenceId}.validEnd`, evidence.validEnd);
    const retrievedAt = parseTimestamp(`${evidence.evidenceId}.retrievedAt`, evidence.retrievedAt);
    const knownAt = parseTimestamp(`${evidence.evidenceId}.knownAt`, evidence.knownAt);
    if (evidence.issuedAt != null) parseTimestamp(`${evidence.evidenceId}.issuedAt`, evidence.issuedAt);
    if (validEnd < validStart) throw new CCFWeatherEvidenceError(`${evidence.evidenceId} validEnd precedes validStart`);
    if (knownAt < retrievedAt) throw new CCFWeatherEvidenceError(`${evidence.evidenceId} knownAt precedes retrievedAt`);
    if (knownAt > asOf) throw new CCFWeatherEvidenceError(`${evidence.evidenceId} knownAt is later than bundle asOf`);
    finiteInRange(`${evidence.evidenceId}.locationLatitude`, evidence.locationLatitude, -90, 90);
    finiteInRange(`${evidence.evidenceId}.locationLongitude`, evidence.locationLongitude, -180, 180);
    validateProbability(`${evidence.evidenceId}.providerConfidence`, evidence.providerConfidence);
    validateMeasurements(evidence.measurements);
    if (!evidence.rawTraceRef.trim()) throw new CCFWeatherEvidenceError(`${evidence.evidenceId} rawTraceRef is required`);
  }

  for (const evidence of bundle.roofEvidence) {
    parseTimestamp(`${evidence.evidenceId}.effectiveAt`, evidence.effectiveAt);
    const retrievedAt = parseTimestamp(`${evidence.evidenceId}.retrievedAt`, evidence.retrievedAt);
    const knownAt = parseTimestamp(`${evidence.evidenceId}.knownAt`, evidence.knownAt);
    if (knownAt < retrievedAt) throw new CCFWeatherEvidenceError(`${evidence.evidenceId} knownAt precedes retrievedAt`);
    if (knownAt > asOf) throw new CCFWeatherEvidenceError(`${evidence.evidenceId} knownAt is later than bundle asOf`);
    if (!evidence.rawTraceRef.trim()) throw new CCFWeatherEvidenceError(`${evidence.evidenceId} rawTraceRef is required`);
  }

  return bundle;
}

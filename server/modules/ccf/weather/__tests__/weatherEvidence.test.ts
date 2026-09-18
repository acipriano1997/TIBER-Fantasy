import {
  decomposeCCFFieldRelativeWind,
  validateCCFWeatherEvidenceBundle,
  type CCFWeatherEvidenceBundle,
} from "../weatherEvidence";

function bundle(): CCFWeatherEvidenceBundle {
  return {
    contractVersion: "ccf-game-weather-evidence-v1",
    generatedAt: "2026-09-11T12:05:00Z",
    asOf: "2026-09-11T12:00:00Z",
    availability: "available",
    game: {
      gameId: "2026-W1-A-B",
      season: 2026,
      week: 1,
      kickoffAt: "2026-09-13T17:00:00Z",
      homeTeam: "AAA",
      awayTeam: "BBB",
    },
    venue: {
      venueId: "v1",
      stadiumName: "Example Stadium",
      latitude: 40.0,
      longitude: -74.0,
      timezone: "America/New_York",
      fieldAxisBearingDeg: 0,
      roofType: "open_air",
      surfaceType: "grass",
    },
    weatherEvidence: [
      {
        evidenceId: "wx1",
        provider: "provider",
        providerProduct: "forecast",
        sourceRole: "official_forecast",
        evidenceKind: "forecast",
        sourceRecordId: "r1",
        sourceLocator: "provider://r1",
        issuedAt: "2026-09-11T11:00:00Z",
        validStart: "2026-09-13T16:00:00Z",
        validEnd: "2026-09-13T20:00:00Z",
        retrievedAt: "2026-09-11T11:30:00Z",
        knownAt: "2026-09-11T11:30:00Z",
        locationLatitude: 40.0,
        locationLongitude: -74.0,
        measurements: {
          temperatureC: 20,
          apparentTemperatureC: 20,
          dewPointC: 10,
          relativeHumidity: 0.5,
          pressureHpa: 1012,
          visibilityM: 16000,
          sustainedWindMps: 8,
          windGustMps: 12,
          windDirectionDeg: 90,
          precipitationProbability: 0.2,
          precipitationRateMmPerHr: 0,
          precipitationType: "none",
          lightningProbability: 0.01,
        },
        fieldRelativeWind: decomposeCCFFieldRelativeWind(8, 90, 0),
        providerConfidence: 0.8,
        rawTraceRef: "sha256:abc",
        notes: [],
      },
    ],
    roofEvidence: [],
    warnings: [],
  };
}

describe("CCF weather evidence", () => {
  it("validates temporally eligible source evidence without assigning fantasy impact", () => {
    expect(validateCCFWeatherEvidenceBundle(bundle())).toEqual(bundle());
  });

  it("computes deterministic field-relative wind magnitudes", () => {
    const wind = decomposeCCFFieldRelativeWind(10, 90, 0);
    expect(wind.parallelToFieldMps).toBeCloseTo(0);
    expect(wind.crossFieldMps).toBeCloseTo(10);
  });

  it("rejects evidence that became known after the decision as-of", () => {
    const candidate = bundle();
    candidate.weatherEvidence[0].knownAt = "2026-09-11T12:01:00Z";
    expect(() => validateCCFWeatherEvidenceBundle(candidate)).toThrow(/later than bundle asOf/);
  });

  it("supports explicit unavailable semantics without fabricating neutral weather", () => {
    const candidate = bundle();
    candidate.availability = "unavailable";
    candidate.weatherEvidence = [];
    candidate.warnings = ["provider evidence unavailable"];
    expect(() => validateCCFWeatherEvidenceBundle(candidate)).not.toThrow();
  });

  it("rejects contradictory precipitation and gust evidence", () => {
    const candidate = bundle();
    candidate.weatherEvidence[0].measurements.precipitationRateMmPerHr = 2;
    expect(() => validateCCFWeatherEvidenceBundle(candidate)).toThrow(/precipitationType none/);

    const gustCandidate = bundle();
    gustCandidate.weatherEvidence[0].measurements.windGustMps = 4;
    expect(() => validateCCFWeatherEvidenceBundle(gustCandidate)).toThrow(/windGustMps/);
  });
});

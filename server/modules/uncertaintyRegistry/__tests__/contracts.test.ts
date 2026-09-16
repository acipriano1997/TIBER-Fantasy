import {
  SituationDefinitionV0Schema,
  WitnessObservationV0Schema,
  ScenarioBranchBindingV0Schema,
} from '../contracts';
import {
  FIXTURE_PLAYER_A,
  USR0_GOLDEN_TRACES,
  makeDefinition,
} from '../fixtures/usr0Fixtures';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('USR-0 contracts', () => {
  test('ships exactly the 15 frozen synthetic golden traces', () => {
    expect(USR0_GOLDEN_TRACES).toHaveLength(15);
    expect(new Set(USR0_GOLDEN_TRACES.map((trace) => trace.id)).size).toBe(15);
  });

  test('all golden definitions, observations, and branch bindings parse strictly', () => {
    for (const trace of USR0_GOLDEN_TRACES) {
      expect(SituationDefinitionV0Schema.safeParse(trace.definition).success).toBe(true);
      for (const observation of trace.observations) {
        expect(WitnessObservationV0Schema.safeParse(observation).success).toBe(true);
      }
      if (trace.scenarioBinding) {
        expect(ScenarioBranchBindingV0Schema.safeParse(trace.scenarioBinding).success).toBe(true);
      }
    }
  });

  test('rejects unknown top-level fields', () => {
    const definition = clone(makeDefinition('strict01')) as Record<string, unknown>;
    definition.surprise = true;
    expect(SituationDefinitionV0Schema.safeParse(definition).success).toBe(false);
  });

  test('rejects duplicate competing state IDs', () => {
    const definition = clone(makeDefinition('dupe001'));
    definition.competingStates[1].stateId = definition.competingStates[0].stateId;
    expect(SituationDefinitionV0Schema.safeParse(definition).success).toBe(false);
  });

  test('rejects duplicate witness IDs', () => {
    const definition = clone(makeDefinition('dupe002', { witnessCount: 2 }));
    definition.resolutionWitnesses[1].witnessId = definition.resolutionWitnesses[0].witnessId;
    expect(SituationDefinitionV0Schema.safeParse(definition).success).toBe(false);
  });

  test('rejects witness effects that reference undeclared states', () => {
    const definition = clone(makeDefinition('badstate'));
    definition.resolutionWitnesses[0].stateEffects[0].stateId = 'state:not_declared';
    expect(SituationDefinitionV0Schema.safeParse(definition).success).toBe(false);
  });

  test('rejects impacted players that are not part of shared situation identity', () => {
    const definition = clone(makeDefinition('badplayr'));
    definition.impactDefinition.affectedPlayers = ['tbr_p_01H00000000000000000000009'];
    expect(SituationDefinitionV0Schema.safeParse(definition).success).toBe(false);
  });

  test('rejects malformed canonical player identity', () => {
    const definition = clone(makeDefinition('badident'));
    definition.identity.playerIds[0] = 'sleeper:123';
    definition.impactDefinition.affectedPlayers = [FIXTURE_PLAYER_A];
    expect(SituationDefinitionV0Schema.safeParse(definition).success).toBe(false);
  });

  test('rejects invalid timestamp format', () => {
    const definition = clone(makeDefinition('badtime1'));
    definition.knownAt = 'tomorrow';
    expect(SituationDefinitionV0Schema.safeParse(definition).success).toBe(false);
  });

  test('enforces definition predecessor invariants', () => {
    const definition = clone(makeDefinition('pred001'));
    definition.versionOrdinal = 2;
    expect(SituationDefinitionV0Schema.safeParse(definition).success).toBe(false);
  });
});

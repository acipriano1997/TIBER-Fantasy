import { SituationDefinitionV0Schema } from '../contracts';
import { withUsrRecordDigest } from '../canonicalization';
import { FIXTURE_PLAYERS, makeDefinition } from '../fixtures/usr0Fixtures';

function redigest<T extends Record<string, unknown>>(value: T) {
  return withUsrRecordDigest(value);
}

describe('USR-0 contracts', () => {
  test('valid definition parses', () => {
    expect(SituationDefinitionV0Schema.parse(makeDefinition({ id: 'contract_valid' })).situationId).toBe('usr_sit_contract_valid');
  });

  test('wrong schema version fails', () => {
    const definition = makeDefinition({ id: 'wrong_version' });
    expect(SituationDefinitionV0Schema.safeParse({ ...definition, schemaVersion: 'ffcc.usr.situation-definition.v9' }).success).toBe(false);
  });

  test('duplicate state IDs fail even when state content differs', () => {
    const definition = makeDefinition({ id: 'dup_states' });
    const { recordDigest: _digest, ...content } = definition;
    const second = { ...definition.competingStates[1], stateId: definition.competingStates[0].stateId, label: 'Different content, same state ID' };
    const duplicate = redigest({ ...content, competingStates: [definition.competingStates[0], second] });
    expect(SituationDefinitionV0Schema.safeParse(duplicate).success).toBe(false);
  });

  test('duplicate witness IDs fail even when witness content differs', () => {
    const definition = makeDefinition({ id: 'dup_witness' });
    const { recordDigest: _digest, ...content } = definition;
    const second = { ...definition.resolutionWitnesses[0], question: 'Different witness content, same witness ID' };
    const duplicate = redigest({ ...content, resolutionWitnesses: [definition.resolutionWitnesses[0], second] });
    expect(SituationDefinitionV0Schema.safeParse(duplicate).success).toBe(false);
  });

  test('witness effect cannot reference undeclared state', () => {
    const definition = makeDefinition({ id: 'bad_effect_state' });
    const { recordDigest: _digest, ...content } = definition;
    const mutatedWitness = {
      ...definition.resolutionWitnesses[0],
      stateEffects: [...definition.resolutionWitnesses[0].stateEffects, {
        stateId: 'state_never_declared',
        observedPresent: 'supports' as const,
        observedAbsent: 'indeterminate' as const,
      }],
    };
    const candidate = redigest({ ...content, resolutionWitnesses: [mutatedWitness] });
    expect(SituationDefinitionV0Schema.safeParse(candidate).success).toBe(false);
  });

  test('invalid canonical player identity fails', () => {
    const definition = makeDefinition({ id: 'bad_player' });
    const { recordDigest: _digest, ...content } = definition;
    const candidate = redigest({
      ...content,
      identity: { ...definition.identity, playerIds: ['sleeper:123'] },
      impactDefinition: { ...definition.impactDefinition, affectedPlayerIds: ['sleeper:123'] },
      competingStates: definition.competingStates.map((state, index) => index === 0 ? {
        ...state,
        consequences: {
          ...state.consequences,
          playerRoleChanges: state.consequences.playerRoleChanges.map((change) => ({ ...change, playerId: 'sleeper:123' })),
        },
      } : state),
    });
    expect(SituationDefinitionV0Schema.safeParse(candidate).success).toBe(false);
  });

  test('invalid RFC3339 timestamp fails', () => {
    const definition = makeDefinition({ id: 'bad_time' });
    expect(SituationDefinitionV0Schema.safeParse({ ...definition, knownAt: 'yesterday' }).success).toBe(false);
  });

  test('unsupported situation class fails closed', () => {
    const definition = makeDefinition({ id: 'bad_class' });
    expect(SituationDefinitionV0Schema.safeParse({
      ...definition,
      classification: { ...definition.classification, primaryClass: 'OTHER' },
    }).success).toBe(false);
  });

  test('unknown top-level fields fail closed', () => {
    const definition = makeDefinition({ id: 'unknown_field' });
    expect(SituationDefinitionV0Schema.safeParse({ ...definition, magicConfidenceScore: 0.93 }).success).toBe(false);
  });

  test('definition version lineage is explicit', () => {
    const definition = makeDefinition({ id: 'lineage01' });
    expect(SituationDefinitionV0Schema.safeParse({ ...definition, versionOrdinal: 2, predecessorDefinitionRef: null }).success).toBe(false);
    expect(FIXTURE_PLAYERS.alpha).toMatch(/^tbr_p_/);
  });
});

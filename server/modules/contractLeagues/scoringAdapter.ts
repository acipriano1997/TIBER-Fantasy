import type { FantasyScoringSettings } from '../../enrichment/fantasyBox';
import type { ContractLeagueSnapshot } from './contracts';

type SnapshotScoring = NonNullable<ContractLeagueSnapshot['league']['scoring']>;

export type LeagueScoringResolution =
  | { status: 'READY'; scoring: FantasyScoringSettings }
  | { status: 'UNAVAILABLE'; missingFields: string[] };

const REQUIRED_FIELDS: Array<keyof SnapshotScoring> = [
  'passYardsPerPoint',
  'passTd',
  'interceptionThrown',
  'rushYardsPerPoint',
  'rushTd',
  'reception',
  'receivingYardsPerPoint',
  'receivingTd',
  'teReceptionBonus',
  'fumbleLost',
  'twoPointConversion',
];

/**
 * Resolve snapshot scoring into the generic scoring translator.
 *
 * This intentionally has no PPR fallback. A league decision must abstain when
 * scoring is missing rather than quietly borrowing a generic profile.
 */
export function resolveLeagueScoring(
  scoring: ContractLeagueSnapshot['league']['scoring'],
): LeagueScoringResolution {
  if (!scoring) {
    return { status: 'UNAVAILABLE', missingFields: [...REQUIRED_FIELDS] };
  }

  const missingFields = REQUIRED_FIELDS.filter((field) => scoring[field] == null);
  if (missingFields.length > 0) {
    return { status: 'UNAVAILABLE', missingFields };
  }

  return {
    status: 'READY',
    scoring: {
      passingYard: 1 / scoring.passYardsPerPoint!,
      passingTd: scoring.passTd!,
      interceptionThrown: scoring.interceptionThrown!,
      rushingYard: 1 / scoring.rushYardsPerPoint!,
      rushingTd: scoring.rushTd!,
      reception: scoring.reception!,
      receivingYard: 1 / scoring.receivingYardsPerPoint!,
      receivingTd: scoring.receivingTd!,
      twoPointConversion: scoring.twoPointConversion!,
      fumbleLost: scoring.fumbleLost!,
      teReceptionBonus: scoring.teReceptionBonus!,
    },
  };
}

export type ContractRuleConflict = {
  rule: string;
  sources: string[];
  detail?: string | null;
};

export type ContractLeagueRuleProfile = {
  id: string;
  leagueName: string;
  aliases?: string[];
  sourceFiles: {
    operationalWorkbook: {
      driveFileId: string;
      displayName?: string | null;
    };
    rulesSource?: {
      sourceId: string;
      displayName?: string | null;
    } | null;
  };
  verifiedCore: {
    salaryCap: number;
    rookieDraftRounds: number;
  };
  knownConflicts: ContractRuleConflict[];
  unknownOrUnverified: string[];
  leagueSpecificPolicy: Record<string, unknown>;
};

export type ResolveContractLeagueRuleProfileInput = {
  leagueName?: string | null;
  workbookId?: string | null;
};

const profilesById = new Map<string, ContractLeagueRuleProfile>();

function normalizeName(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized || null;
}

function cloneProfile(profile: ContractLeagueRuleProfile): ContractLeagueRuleProfile {
  return {
    ...profile,
    aliases: profile.aliases ? [...profile.aliases] : undefined,
    sourceFiles: {
      operationalWorkbook: { ...profile.sourceFiles.operationalWorkbook },
      rulesSource: profile.sourceFiles.rulesSource ? { ...profile.sourceFiles.rulesSource } : profile.sourceFiles.rulesSource,
    },
    verifiedCore: { ...profile.verifiedCore },
    knownConflicts: profile.knownConflicts.map((conflict) => ({ ...conflict, sources: [...conflict.sources] })),
    unknownOrUnverified: [...profile.unknownOrUnverified],
    leagueSpecificPolicy: { ...profile.leagueSpecificPolicy },
  };
}

function validateProfile(profile: ContractLeagueRuleProfile): void {
  if (!profile.id.trim()) throw new Error('Contract league profile id is required.');
  if (!profile.leagueName.trim()) throw new Error('Contract league profile leagueName is required.');
  if (!profile.sourceFiles.operationalWorkbook.driveFileId.trim()) {
    throw new Error('Contract league profile operational workbook id is required.');
  }
  if (!Number.isFinite(profile.verifiedCore.salaryCap) || profile.verifiedCore.salaryCap < 0) {
    throw new Error('Contract league profile salary cap must be a finite non-negative number.');
  }
  if (!Number.isInteger(profile.verifiedCore.rookieDraftRounds) || profile.verifiedCore.rookieDraftRounds < 0) {
    throw new Error('Contract league profile rookie draft rounds must be a non-negative integer.');
  }
}

/**
 * Registers a contract-league rule profile supplied by an authorized runtime
 * source. The public registry is intentionally empty by default so private
 * workbook ids, league names, and rule values are not embedded in source.
 */
export function registerContractLeagueRuleProfile(profile: ContractLeagueRuleProfile): void {
  validateProfile(profile);
  const next = cloneProfile(profile);
  const nameTokens = [next.leagueName, ...(next.aliases ?? [])].map((value) => normalizeName(value));

  for (const existing of profilesById.values()) {
    if (existing.id === next.id) continue;
    if (existing.sourceFiles.operationalWorkbook.driveFileId === next.sourceFiles.operationalWorkbook.driveFileId) {
      throw new Error(`Contract league registry workbook identity conflict for profile ${next.id}.`);
    }
    const existingNames = [existing.leagueName, ...(existing.aliases ?? [])].map((value) => normalizeName(value));
    if (nameTokens.some((name) => name && existingNames.includes(name))) {
      throw new Error(`Contract league registry league-name identity conflict for profile ${next.id}.`);
    }
  }

  profilesById.set(next.id, next);
}

export function unregisterContractLeagueRuleProfile(profileId: string): void {
  profilesById.delete(profileId);
}

/** Test/private-runtime helper. Public production code should not seed profiles. */
export function clearContractLeagueRuleProfiles(): void {
  profilesById.clear();
}

export function listContractLeagueRuleProfiles(): ContractLeagueRuleProfile[] {
  return [...profilesById.values()].map(cloneProfile);
}

export function resolveContractLeagueRuleProfile(
  input: ResolveContractLeagueRuleProfileInput,
): ContractLeagueRuleProfile | null {
  const leagueName = normalizeName(input.leagueName);
  const workbookId = input.workbookId?.trim() || null;
  const profiles = [...profilesById.values()];

  const nameMatch = leagueName
    ? profiles.find((profile) => [profile.leagueName, ...(profile.aliases ?? [])]
      .map((value) => normalizeName(value))
      .includes(leagueName)) ?? null
    : null;
  const workbookMatch = workbookId
    ? profiles.find((profile) => profile.sourceFiles.operationalWorkbook.driveFileId === workbookId) ?? null
    : null;

  if (leagueName && workbookId) {
    if (nameMatch && workbookMatch && nameMatch.id !== workbookMatch.id) {
      throw new Error('Contract league identity conflict: league name and workbook resolve to different profiles.');
    }
    if (nameMatch && !workbookMatch) {
      throw new Error('Contract league identity conflict: workbook does not match the resolved league profile.');
    }
    if (!nameMatch && workbookMatch) {
      throw new Error('Contract league identity conflict: league name does not match the resolved workbook profile.');
    }
    return nameMatch && workbookMatch ? cloneProfile(nameMatch) : null;
  }

  return cloneProfile(nameMatch ?? workbookMatch) ?? null;
}

export function assertContractRuleUsable(
  profile: ContractLeagueRuleProfile,
  rule: string,
): void {
  const normalizedRule = rule.trim().toLowerCase();
  const conflict = profile.knownConflicts.find((item) => item.rule.trim().toLowerCase() === normalizedRule);
  if (conflict) {
    const sourceDetail = conflict.sources.length ? ` Sources: ${conflict.sources.join(' | ')}.` : '';
    throw new Error(`Contract rule ${rule} has conflicting authoritative evidence; abstain until clarified.${sourceDetail}`);
  }

  const unresolved = profile.unknownOrUnverified.find((item) => item.toLowerCase().includes(normalizedRule));
  if (unresolved) {
    throw new Error(`Contract rule ${rule} is unknown or unverified; abstain. ${unresolved}`);
  }
}

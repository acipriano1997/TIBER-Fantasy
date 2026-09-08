export type EspnDraftBridgeAction = {
  actionId: string;
  requestedAt: string;
  expiresAt: string;
  pickNumber: number;
  player: { name: string; team: string | null; position: string | null };
  status: 'pending' | 'confirmed' | 'rejected' | 'uncertain' | 'expired';
  reason: string | null;
  espnPlayerId: string | null;
};

export type EspnDraftBridgeStatus = {
  schemaVersion: 'espn_draft_bridge_v1';
  connected: boolean;
  readyToDraft: boolean;
  minimumDraftSeconds: number;
  page: null | {
    leagueId: string | null;
    teamId: string | null;
    onClock: boolean;
    autopickEnabled: boolean;
    draftPaused: boolean;
    currentPick: number | null;
    secondsRemaining: number | null;
    rosterCount: number;
    enabledDraftButtons: number;
    availablePlayerCount: number;
    urlPath: string;
  };
  activeAction: EspnDraftBridgeAction | null;
  credentialsRetained: false;
};

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export async function fetchEspnDraftBridgeStatus(): Promise<EspnDraftBridgeStatus> {
  const response = await fetch('/api/management/espn-draft-bridge/status', { cache: 'no-store' });
  const payload = await readJson(response);
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || `ESPN draft bridge status returned HTTP ${response.status}.`);
  }
  return payload as EspnDraftBridgeStatus;
}

export async function requestEspnDraftPick(player: {
  name: string;
  team: string | null;
  position: string | null;
}): Promise<EspnDraftBridgeAction> {
  const response = await fetch('/api/management/espn-draft-bridge/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(player),
  });
  const payload = await readJson(response);
  if (!response.ok || payload?.success !== true || !payload?.action) {
    throw new Error(payload?.error || `ESPN draft request returned HTTP ${response.status}.`);
  }
  return payload.action as EspnDraftBridgeAction;
}

export async function clearEspnDraftBridgeAction(): Promise<void> {
  const response = await fetch('/api/management/espn-draft-bridge/action', {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const payload = await readJson(response);
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || `Could not clear ESPN draft action (HTTP ${response.status}).`);
  }
}

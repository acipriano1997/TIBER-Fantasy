import { randomUUID } from 'crypto';

export type EspnDraftBridgeHeartbeat = {
  pageInstanceId: string;
  leagueId: string | null;
  teamId: string | null;
  visible: boolean;
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

export type EspnDraftBridgePlayer = {
  name: string;
  team: string | null;
  position: string | null;
};

export type EspnDraftBridgeActionStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'uncertain'
  | 'expired';

export type EspnDraftBridgeAction = {
  actionId: string;
  requestedAt: string;
  expiresAt: string;
  player: EspnDraftBridgePlayer;
  status: EspnDraftBridgeActionStatus;
  reason: string | null;
  espnPlayerId: string | null;
};

type HeartbeatRecord = EspnDraftBridgeHeartbeat & { receivedAtMs: number };

const HEARTBEAT_MAX_AGE_MS = 2_500;
const ACTION_TTL_MS = 15_000;
const MAX_STRING = 120;

function cleanString(value: unknown, max = MAX_STRING): string {
  if (typeof value !== 'string') return '';
  if (/[\u0000-\u001F\u007F]/.test(value)) return '';
  return value.trim().slice(0, max);
}

function cleanNullableString(value: unknown, max = MAX_STRING): string | null {
  const cleaned = cleanString(value, max);
  return cleaned || null;
}

function finiteInt(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export class EspnDraftBridgeStore {
  private heartbeat: HeartbeatRecord | null = null;
  private action: EspnDraftBridgeAction | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  ingestHeartbeat(raw: Partial<EspnDraftBridgeHeartbeat>) {
    const pageInstanceId = cleanString(raw.pageInstanceId, 80);
    if (!pageInstanceId) throw new Error('pageInstanceId is required');

    this.heartbeat = {
      pageInstanceId,
      leagueId: cleanNullableString(raw.leagueId, 40),
      teamId: cleanNullableString(raw.teamId, 40),
      visible: raw.visible === true,
      onClock: raw.onClock === true,
      autopickEnabled: raw.autopickEnabled === true,
      draftPaused: raw.draftPaused === true,
      currentPick: finiteInt(raw.currentPick),
      secondsRemaining: finiteInt(raw.secondsRemaining),
      rosterCount: finiteInt(raw.rosterCount) ?? 0,
      enabledDraftButtons: finiteInt(raw.enabledDraftButtons) ?? 0,
      availablePlayerCount: finiteInt(raw.availablePlayerCount) ?? 0,
      urlPath: cleanString(raw.urlPath, 240),
      receivedAtMs: this.now(),
    };

    this.expireActionIfNeeded();
    return this.getStatus();
  }

  private expireActionIfNeeded() {
    if (!this.action || this.action.status !== 'pending') return;
    if (this.now() >= Date.parse(this.action.expiresAt)) {
      this.action = { ...this.action, status: 'expired', reason: 'Draft request expired before ESPN confirmed it.' };
    }
  }

  private bridgeConnected() {
    return Boolean(this.heartbeat && this.now() - this.heartbeat.receivedAtMs <= HEARTBEAT_MAX_AGE_MS);
  }

  getStatus() {
    this.expireActionIfNeeded();
    const connected = this.bridgeConnected();
    const heartbeat = connected ? this.heartbeat : null;
    return {
      schemaVersion: 'espn_draft_bridge_v1',
      connected,
      readyToDraft: Boolean(
        heartbeat?.visible
        && heartbeat.onClock
        && !heartbeat.autopickEnabled
        && !heartbeat.draftPaused
        && heartbeat.enabledDraftButtons > 0
      ),
      page: heartbeat ? {
        leagueId: heartbeat.leagueId,
        teamId: heartbeat.teamId,
        onClock: heartbeat.onClock,
        autopickEnabled: heartbeat.autopickEnabled,
        draftPaused: heartbeat.draftPaused,
        currentPick: heartbeat.currentPick,
        secondsRemaining: heartbeat.secondsRemaining,
        rosterCount: heartbeat.rosterCount,
        enabledDraftButtons: heartbeat.enabledDraftButtons,
        availablePlayerCount: heartbeat.availablePlayerCount,
        urlPath: heartbeat.urlPath,
      } : null,
      activeAction: this.action,
      credentialsRetained: false,
    };
  }

  requestPick(raw: Partial<EspnDraftBridgePlayer>) {
    this.expireActionIfNeeded();
    if (!this.bridgeConnected() || !this.heartbeat) throw new Error('ESPN draft bridge is not connected.');
    if (!this.heartbeat.visible) throw new Error('ESPN draft room is not visible.');
    if (!this.heartbeat.onClock) throw new Error('ESPN does not show your team on the clock.');
    if (this.heartbeat.autopickEnabled) throw new Error('Disable ESPN Autopick before drafting from TIBER.');
    if (this.heartbeat.draftPaused) throw new Error('The ESPN draft is paused.');
    if (this.heartbeat.enabledDraftButtons <= 0) throw new Error('ESPN has no enabled Draft buttons right now.');
    if (this.action?.status === 'pending') throw new Error('A draft request is already pending.');
    if (this.action?.status === 'uncertain') throw new Error('The previous ESPN draft action is uncertain. Verify ESPN before another pick.');

    const name = cleanString(raw.name, 100);
    const team = cleanNullableString(raw.team, 12);
    const position = cleanNullableString(raw.position, 12);
    if (!name) throw new Error('Player name is required.');
    if (!position) throw new Error('Player position is required.');

    const now = this.now();
    this.action = {
      actionId: randomUUID(),
      requestedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ACTION_TTL_MS).toISOString(),
      player: { name, team, position },
      status: 'pending',
      reason: null,
      espnPlayerId: null,
    };
    return this.action;
  }

  nextAction(pageInstanceId: string) {
    this.expireActionIfNeeded();
    if (!this.bridgeConnected() || !this.heartbeat) return null;
    if (this.heartbeat.pageInstanceId !== cleanString(pageInstanceId, 80)) return null;
    return this.action?.status === 'pending' ? this.action : null;
  }

  resolveAction(input: {
    pageInstanceId?: unknown;
    actionId?: unknown;
    status?: unknown;
    reason?: unknown;
    espnPlayerId?: unknown;
  }) {
    this.expireActionIfNeeded();
    if (!this.heartbeat || cleanString(input.pageInstanceId, 80) !== this.heartbeat.pageInstanceId) {
      throw new Error('Bridge page instance does not match the active ESPN draft room.');
    }
    if (!this.action || cleanString(input.actionId, 80) !== this.action.actionId) {
      throw new Error('Draft action is stale or unknown.');
    }
    if (this.action.status !== 'pending') return this.action;

    const status = cleanString(input.status, 20) as EspnDraftBridgeActionStatus;
    if (!['confirmed', 'rejected', 'uncertain'].includes(status)) {
      throw new Error('Invalid draft action result status.');
    }

    this.action = {
      ...this.action,
      status,
      reason: cleanNullableString(input.reason, 240),
      espnPlayerId: cleanNullableString(input.espnPlayerId, 40),
    };
    return this.action;
  }

  clearResolvedAction() {
    this.expireActionIfNeeded();
    if (this.action?.status === 'pending') throw new Error('Cannot clear a pending draft action.');
    this.action = null;
  }
}

export const espnDraftBridgeStore = new EspnDraftBridgeStore();

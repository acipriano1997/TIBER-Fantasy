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
  draftedPlayerNames: string[];
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
  pageInstanceId: string;
  requestedAt: string;
  expiresAt: string;
  pickNumber: number;
  player: EspnDraftBridgePlayer;
  status: EspnDraftBridgeActionStatus;
  reason: string | null;
  espnPlayerId: string | null;
};

type HeartbeatRecord = EspnDraftBridgeHeartbeat & { receivedAtMs: number };

const HEARTBEAT_MAX_AGE_MS = 2_500;
const ACTION_TTL_MS = 15_000;
export const ESPN_DRAFT_MIN_SECONDS = 8;
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

function cleanNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value.slice(0, 300)) {
    const name = cleanString(raw, 100);
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

function finiteInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
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
      draftedPlayerNames: cleanNameList(raw.draftedPlayerNames),
      urlPath: cleanString(raw.urlPath, 240),
      receivedAtMs: this.now(),
    };

    this.expireActionIfNeeded();
    if (
      this.action?.status === 'pending'
      && this.action.pageInstanceId === pageInstanceId
      && this.heartbeat.currentPick !== null
      && this.heartbeat.currentPick !== this.action.pickNumber
    ) {
      this.action = {
        ...this.action,
        status: 'expired',
        reason: `ESPN advanced from pick ${this.action.pickNumber} before the bound action executed.`,
      };
    }
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
    const clockSafe = heartbeat?.secondsRemaining !== null
      && heartbeat?.secondsRemaining !== undefined
      && heartbeat.secondsRemaining >= ESPN_DRAFT_MIN_SECONDS;
    const pickReadable = heartbeat?.currentPick !== null
      && heartbeat?.currentPick !== undefined
      && heartbeat.currentPick >= 1;
    return {
      schemaVersion: 'espn_draft_bridge_v1',
      connected,
      readyToDraft: Boolean(
        heartbeat?.visible
        && heartbeat.onClock
        && !heartbeat.autopickEnabled
        && !heartbeat.draftPaused
        && heartbeat.enabledDraftButtons > 0
        && pickReadable
        && clockSafe
      ),
      minimumDraftSeconds: ESPN_DRAFT_MIN_SECONDS,
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
        draftedPlayerNames: heartbeat.draftedPlayerNames,
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
    if (this.heartbeat.currentPick === null || this.heartbeat.currentPick < 1) throw new Error('ESPN current pick could not be verified.');
    if (this.heartbeat.secondsRemaining === null || this.heartbeat.secondsRemaining < ESPN_DRAFT_MIN_SECONDS) {
      throw new Error(`Fewer than ${ESPN_DRAFT_MIN_SECONDS} readable seconds remain. Use ESPN directly for this pick.`);
    }
    if (this.action?.status === 'pending') throw new Error('A draft request is already pending.');
    if (this.action?.status === 'uncertain') throw new Error('The previous ESPN draft action is uncertain. Verify ESPN before another pick.');

    const name = cleanString(raw.name, 100);
    const team = cleanNullableString(raw.team, 12);
    const position = cleanNullableString(raw.position, 12);
    if (!name) throw new Error('Player name is required.');
    if (!position) throw new Error('Player position is required.');

    const drafted = new Set(this.heartbeat.draftedPlayerNames.map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, '')));
    if (drafted.has(name.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
      throw new Error(`${name} already appears in ESPN draft history.`);
    }

    const now = this.now();
    this.action = {
      actionId: randomUUID(),
      pageInstanceId: this.heartbeat.pageInstanceId,
      requestedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ACTION_TTL_MS).toISOString(),
      pickNumber: this.heartbeat.currentPick,
      player: { name, team, position },
      status: 'pending',
      reason: null,
      espnPlayerId: null,
    };
    return this.action;
  }

  nextAction(pageInstanceId: string) {
    this.expireActionIfNeeded();
    const cleanedPageInstanceId = cleanString(pageInstanceId, 80);
    if (!this.action || this.action.status !== 'pending') return null;
    if (!cleanedPageInstanceId || this.action.pageInstanceId !== cleanedPageInstanceId) return null;
    return this.action;
  }

  resolveAction(input: {
    pageInstanceId?: unknown;
    actionId?: unknown;
    status?: unknown;
    reason?: unknown;
    espnPlayerId?: unknown;
  }) {
    this.expireActionIfNeeded();
    if (!this.action || cleanString(input.actionId, 80) !== this.action.actionId) {
      throw new Error('Draft action is stale or unknown.');
    }
    if (cleanString(input.pageInstanceId, 80) !== this.action.pageInstanceId) {
      throw new Error('Bridge page instance does not match the draft action that was armed.');
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
    if (this.action?.status === 'uncertain') {
      if (
        !this.bridgeConnected()
        || !this.heartbeat
        || this.heartbeat.pageInstanceId !== this.action.pageInstanceId
      ) {
        throw new Error('Reconnect the ESPN draft room that owns the uncertain action before clearing it.');
      }
      if (this.heartbeat.currentPick === this.action.pickNumber) {
        throw new Error('ESPN is still on the uncertain pick. Verify or complete that pick in ESPN before rearming TIBER.');
      }
    }
    this.action = null;
  }
}

export const espnDraftBridgeStore = new EspnDraftBridgeStore();

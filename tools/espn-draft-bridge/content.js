(() => {
  'use strict';

  if (window.top !== window || window.__tiberEspnDraftBridgeLoaded) return;
  window.__tiberEspnDraftBridgeLoaded = true;

  const pageInstanceId = crypto.randomUUID();
  const handledActions = new Set();
  let actionInFlight = false;
  let uncertainPick = null;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (el) => el?.textContent?.trim() || '';
  const normalizeName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const positionKey = (value) => {
    const raw = String(value || '').toUpperCase();
    return raw === 'D/ST' || raw === 'DEF' ? 'DST' : raw;
  };
  const teamKey = (value) => ({ JAX: 'JAC', WAS: 'WSH' })[String(value || '').toUpperCase()] || String(value || '').toUpperCase();

  function currentPick() {
    const scope = document.querySelector('.current-pick-module-container') || document.body;
    const match = text(scope).match(/On the Clock:\s*Pick\s*(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function secondsRemaining() {
    const match = text(document.querySelector('.clock__content, .clock__digits')).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    return seconds < 60 ? minutes * 60 + seconds : null;
  }

  function onClock() {
    return /You are on the clock!/i.test(text(document.querySelector('.pickArea')));
  }

  function autopickEnabled() {
    return /You(?:'|’| a)re on Autopick|Disable Autopick to draft players/i.test(text(document.querySelector('.pickArea')));
  }

  function draftPaused() {
    return /Draft (?:is )?Paused|Resume Draft/i.test(text(document.body));
  }

  function rosterPlayers() {
    return [...document.querySelectorAll('.roster-module tbody tr, .roster-module [role="row"]')]
      .map((row) => {
        const playerColumn = row.querySelector('.player-column');
        const name = playerColumn?.getAttribute('title') || text(row.querySelector('.playerinfo__playername, .player-link-container a, .player-link-container'));
        const cells = [...row.querySelectorAll('td, [role="cell"], [role="gridcell"]')].map(text);
        const suffix = text(row.querySelector('.player-link-container')).match(/\((QB|RB|WR|TE|D\/ST|DST|K)\)\s*$/)?.[1];
        const position = suffix || cells[0] || '';
        return name && name !== 'Empty' ? { name, position } : null;
      })
      .filter(Boolean);
  }

  function draftedPlayerNames() {
    const names = [];
    const seen = new Set();
    const add = (name) => {
      const cleaned = String(name || '').trim();
      const key = normalizeName(cleaned);
      if (!cleaned || !key || key === 'empty' || seen.has(key)) return;
      seen.add(key);
      names.push(cleaned.slice(0, 100));
    };

    document.querySelectorAll('.pick-message__container .playerinfo__playername, .pick-history .playerinfo__playername')
      .forEach((element) => add(text(element)));
    document.querySelectorAll('.draft-board-grid-pick-cell.completedPick').forEach((cell) => {
      const first = text(cell.querySelector('.playerFirstName'));
      const last = text(cell.querySelector('.playerLastName'));
      add(`${first} ${last}`.trim());
    });
    return names.slice(0, 300);
  }

  function availableRows() {
    return [...document.querySelectorAll('.draft-players .players-table tbody tr, .draft-players .players-table [role="row"]')];
  }

  function rowIdentity(row) {
    const button = row?.querySelector('button[data-player-id]');
    return {
      playerId: button?.dataset.playerId || row?.dataset?.playerSearchPlayerid || '',
      name: row?.dataset?.playerSearchPlayername || text(row?.querySelector('.playerinfo__playername')),
      team: text(row?.querySelector('.playerinfo__playerteam')),
      position: text(row?.querySelector('.playerinfo__playerpos')),
    };
  }

  function identityMatches(identity, target) {
    const positionMatches = positionKey(identity.position) === positionKey(target.position);
    const teamMatches = !target.team || target.team === 'FA' || teamKey(identity.team) === teamKey(target.team);
    const nameMatches = normalizeName(identity.name) === normalizeName(target.name);
    const defenseMatches = positionKey(target.position) === 'DST' && teamMatches;
    return Boolean(identity.playerId) && positionMatches && teamMatches && (nameMatches || defenseMatches);
  }

  function enabledDraftButton(row) {
    if (!row?.isConnected) return null;
    return [...row.querySelectorAll('button')].find((button) => text(button).toLowerCase() === 'draft' && !button.disabled) || null;
  }

  function playerSearchInput() {
    return document.querySelector('.draft-players .playersSearch input, .draft-players .player--search input, .draft-players input[placeholder="Player Name"]');
  }

  function setReactInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function clearSearch() {
    const input = playerSearchInput();
    if (!input) return;
    setReactInputValue(input, '');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    input.blur();
  }

  async function waitFor(getValue, timeoutMs = 2500, intervalMs = 80) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = getValue();
      if (value) return value;
      await sleep(intervalMs);
    }
    return null;
  }

  function findVisibleTarget(target, espnPlayerId = '') {
    return availableRows().find((row) => {
      const identity = rowIdentity(row);
      return espnPlayerId
        ? identity.playerId === espnPlayerId && identityMatches(identity, target)
        : identityMatches(identity, target);
    }) || null;
  }

  async function locateDraftControl(target) {
    const visible = findVisibleTarget(target);
    const visibleButton = enabledDraftButton(visible);
    if (visibleButton) return { row: visible, button: visibleButton, identity: rowIdentity(visible) };

    const input = playerSearchInput();
    if (!input) return null;
    const prior = input.value;
    setReactInputValue(input, target.name);

    const match = await waitFor(() => {
      const candidates = [...document.querySelectorAll('.draft-players .player--search--match, .draft-players [data-player-search-playername]')]
        .filter((row) => identityMatches(rowIdentity(row), target));
      return candidates.length === 1 ? candidates[0] : null;
    }, 1800);

    if (!match) {
      setReactInputValue(input, prior);
      input.blur();
      return null;
    }

    const matchIdentity = rowIdentity(match);
    if (!matchIdentity.playerId) return null;
    match.click();

    return waitFor(() => {
      const row = findVisibleTarget(target, matchIdentity.playerId);
      const button = enabledDraftButton(row);
      return button ? { row, button, identity: rowIdentity(row) } : null;
    }, 2200);
  }

  function snapshot() {
    const url = new URL(location.href);
    const enabledDraftButtons = availableRows().reduce((count, row) => count + (enabledDraftButton(row) ? 1 : 0), 0);
    return {
      pageInstanceId,
      leagueId: url.searchParams.get('leagueId'),
      teamId: url.searchParams.get('teamId'),
      visible: document.visibilityState === 'visible',
      onClock: onClock(),
      autopickEnabled: autopickEnabled(),
      draftPaused: draftPaused(),
      currentPick: currentPick(),
      secondsRemaining: secondsRemaining(),
      rosterCount: rosterPlayers().length,
      enabledDraftButtons,
      availablePlayerCount: availableRows().length,
      draftedPlayerNames: draftedPlayerNames(),
      urlPath: `${location.pathname}${location.search}`.slice(0, 240),
    };
  }

  function samePreflight(a, b) {
    return a.visible === b.visible
      && a.onClock === b.onClock
      && a.autopickEnabled === b.autopickEnabled
      && a.draftPaused === b.draftPaused
      && a.currentPick === b.currentPick
      && a.rosterCount === b.rosterCount
      && a.draftedPlayerNames.join('|') === b.draftedPlayerNames.join('|');
  }

  async function stableSnapshot() {
    const first = snapshot();
    await sleep(180);
    const second = snapshot();
    return samePreflight(first, second) ? second : null;
  }

  async function sendResult(action, status, reason, espnPlayerId = null) {
    await chrome.runtime.sendMessage({
      type: 'tiber:result',
      payload: {
        pageInstanceId,
        actionId: action.actionId,
        status,
        reason,
        espnPlayerId,
      },
    }).catch(() => null);
  }

  async function executeAction(action) {
    if (actionInFlight || handledActions.has(action.actionId)) return;
    handledActions.add(action.actionId);
    actionInFlight = true;
    let clicked = false;

    try {
      const first = await stableSnapshot();
      if (!first) return void await sendResult(action, 'rejected', 'ESPN draft state was changing during preflight.');
      if (!first.visible) return void await sendResult(action, 'rejected', 'ESPN draft tab is not visible.');
      if (!first.onClock) return void await sendResult(action, 'rejected', 'ESPN does not show your team on the clock.');
      if (first.autopickEnabled) return void await sendResult(action, 'rejected', 'Disable ESPN Autopick first.');
      if (first.draftPaused) return void await sendResult(action, 'rejected', 'The ESPN draft is paused.');
      if (!first.currentPick) return void await sendResult(action, 'rejected', 'Current ESPN pick could not be read.');
      if (uncertainPick === first.currentPick) return void await sendResult(action, 'rejected', 'Previous pick is uncertain; verify ESPN before another action.');
      if (!Number.isFinite(first.secondsRemaining) || first.secondsRemaining < 8) {
        return void await sendResult(action, 'rejected', 'Fewer than 8 readable seconds remain; use ESPN directly for this pick.');
      }

      const target = action.player || {};
      const control = await locateDraftControl(target);
      if (!control || !identityMatches(control.identity, target)) {
        clearSearch();
        return void await sendResult(action, 'rejected', `Could not find one exact enabled ESPN Draft control for ${target.name}.`);
      }

      const second = await stableSnapshot();
      const liveIdentity = rowIdentity(control.row);
      if (!second || !samePreflight(first, second)
        || second.currentPick !== first.currentPick
        || !second.onClock
        || second.autopickEnabled
        || second.draftPaused
        || liveIdentity.playerId !== control.identity.playerId
        || !identityMatches(liveIdentity, target)
        || !control.button.isConnected
        || control.button.disabled) {
        clearSearch();
        return void await sendResult(action, 'rejected', 'ESPN changed before submission; no pick was made.');
      }

      clicked = true;
      control.button.click();
      clearSearch();

      const confirmed = await waitFor(() => {
        const nowPick = currentPick();
        const onRoster = rosterPlayers().some((player) => (
          normalizeName(player.name) === normalizeName(target.name)
          && positionKey(player.position) === positionKey(target.position)
        ));
        return nowPick !== first.currentPick && onRoster;
      }, 4500, 120);

      if (confirmed) {
        uncertainPick = null;
        await sendResult(action, 'confirmed', `ESPN confirmed ${target.name} at pick ${first.currentPick}.`, control.identity.playerId);
      } else {
        uncertainPick = first.currentPick;
        await sendResult(action, 'uncertain', `ESPN click occurred for ${target.name}, but roster/pick confirmation was not observed. Do not retry until you verify ESPN.`, control.identity.playerId);
      }
    } catch (error) {
      if (clicked) {
        uncertainPick = currentPick();
        await sendResult(action, 'uncertain', 'ESPN changed after the Draft click. Verify the ESPN room before another action.');
      } else {
        await sendResult(action, 'rejected', error instanceof Error ? error.message : String(error));
      }
    } finally {
      actionInFlight = false;
    }
  }

  async function tick() {
    const state = snapshot();
    if (uncertainPick && state.currentPick !== uncertainPick) uncertainPick = null;

    await chrome.runtime.sendMessage({ type: 'tiber:heartbeat', payload: state }).catch(() => null);
    if (!state.visible || !state.onClock || state.autopickEnabled || state.draftPaused) return;

    const response = await chrome.runtime.sendMessage({ type: 'tiber:poll', pageInstanceId }).catch(() => null);
    const action = response?.ok ? response.payload?.action : null;
    if (action?.actionId) void executeAction(action);
  }

  const indicator = document.createElement('div');
  indicator.textContent = 'TIBER draft bridge';
  indicator.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#111827;color:#d1fae5;border:1px solid #065f46;border-radius:999px;padding:6px 10px;font:600 12px system-ui;opacity:.82;pointer-events:none';
  document.body.appendChild(indicator);

  setInterval(() => { void tick(); }, 450);
  void tick();
})();

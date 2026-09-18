# TIBER ESPN Draft Bridge

The ESPN Draft Bridge is a **local-only Chrome Manifest V3 extension** that connects the TIBER Command Center draft room to ESPN's native fantasy-football draft page.

It is intentionally not a general browser automation layer and is not published to the Chrome Web Store. The supported personal-beta path is to run TIBER locally and load this folder as an unpacked Chrome extension.

## Current status

- Extension implementation: present on `main`
- Manifest: MV3
- TIBER endpoint target: `http://127.0.0.1:5000` or `http://localhost:5000`
- ESPN host access: `https://fantasy.espn.com/*`
- Credentials/cookies: remain in ESPN/Chrome; the bridge does not copy them into TIBER
- Draft action authority: guarded, human-initiated flow only
- Distribution: unpacked personal beta; not Chrome Web Store distributed

The bridge fails closed when the ESPN state is stale, ambiguous, off-clock, paused, on Autopick, below the safety-floor clock threshold, or changes during preflight.

## Run the local Command Center

From the repository root:

```bash
npm ci
npm run dev
```

Development defaults to port `5000` when `PORT` is not set. The default runtime profile is `full` unless `TIBER_RUNTIME_PROFILE` overrides it.

Open:

```text
http://localhost:5000/command-center/draft
```

Keep that Command Center draft room available while using ESPN.

## Install the extension in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this folder: `tools/espn-draft-bridge`.
5. Confirm **TIBER ESPN Draft Bridge** appears in the extension list.
6. If the extension was already loaded before a code change, use Chrome's **Reload** control for the extension.

No additional extension permission should be required beyond the hosts declared in `manifest.json`.

## Verify the ESPN side

1. Sign in to ESPN normally in Chrome.
2. Open the ESPN fantasy-football draft room for the intended league/team.
3. Reload the ESPN draft page after installing or reloading the extension.
4. Confirm the small **TIBER draft bridge** indicator appears at the bottom-right of the ESPN draft page.
5. In TIBER, open `/command-center/draft` and confirm the bridge state is current before attempting any action.

The content script only activates on ESPN football draft URLs. Seeing the extension installed in Chrome is not, by itself, proof that the live draft-page bridge is active.

## Safety contract

Before a TIBER-triggered ESPN Draft click, the bridge requires all of the following:

- ESPN draft tab is visible
- ESPN reports the user's team on the clock
- Autopick is disabled
- draft is not paused
- current pick number is readable and matches the armed TIBER action
- at least 8 readable seconds remain on both preflight snapshots
- target player resolves to one exact enabled ESPN Draft control
- ESPN state remains stable through immediate pre-click revalidation
- no unresolved prior uncertain click exists for the current pick

After a click, the bridge expects both the pick number to advance and the selected player to appear on the roster. If confirmation is not observed, the result becomes **uncertain** and the bridge blocks an automatic retry until ESPN state advances/has been verified.

There is no auto-draft loop.

## Troubleshooting

### TIBER says the bridge is unavailable

- Confirm `npm run dev` is still running.
- Confirm TIBER is reachable at `http://localhost:5000`.
- Confirm the local runtime is not set to the public-only Draft Review profile.
- Reload the extension from `chrome://extensions`.
- Reload the ESPN draft page.

### No `TIBER draft bridge` indicator on ESPN

- Confirm the page is the ESPN football **draft** route, not a league home/roster page.
- Confirm the extension is enabled.
- Reload the extension, then reload ESPN.
- Inspect the extension/service-worker errors from `chrome://extensions` if Chrome reports any.

### Action is rejected

Treat rejection as a safety result, not as a reason to bypass the guard. Check the Command Center/ESPN state and make the pick directly in ESPN if the clock is short or identity/state is unclear.

### Action becomes uncertain

Do **not** resubmit from TIBER. Verify the ESPN roster and draft history first. The bridge intentionally refuses blind retries after an observed click with unconfirmed outcome.

## Certification

The dedicated GitHub workflow runs focused bridge, extension-contract, and ESPN-market tests; checks the changed production TypeScript surface against repository baseline debt; and builds the production application.

Relevant changes should be certified both on pull requests and again after they land on `main`.

## What remains manual

The repository can certify contracts and browser-facing code, but it cannot prove the user's personal Chrome/ESPN session is active. Final personal-beta validation still requires one real Chrome session with:

1. local TIBER running,
2. this unpacked extension enabled,
3. the ESPN draft room open,
4. bridge indicator visible,
5. Command Center bridge heartbeat current,
6. a non-destructive/live-session check or intentionally controlled draft action when appropriate.

Until that session check is completed, describe the extension as **implemented and repository-certified, but not yet verified on the current personal Chrome/ESPN session**.

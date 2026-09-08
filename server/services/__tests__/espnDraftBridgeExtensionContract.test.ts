import fs from 'fs';
import path from 'path';

describe('ESPN draft bridge extension source contract', () => {
  const root = path.join(process.cwd(), 'tools', 'espn-draft-bridge');
  const manifest = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
  const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  const all = `${manifest}\n${background}\n${content}`;

  test('is bounded to ESPN Fantasy plus localhost and contains no credential handling', () => {
    const parsed = JSON.parse(manifest) as { host_permissions?: string[]; permissions?: string[] };
    expect(parsed.host_permissions).toEqual([
      'https://fantasy.espn.com/*',
      'http://127.0.0.1:5000/*',
      'http://localhost:5000/*',
    ]);
    expect(parsed.permissions).toEqual([]);
    expect(all).not.toMatch(/espn_s2|\bSWID\b|username|password|document\.cookie|cookies\./i);
  });

  test('requires ESPN on-clock state, autopick off, an eight-second floor, and stable preflight', () => {
    expect(content).toContain("if (!first.onClock)");
    expect(content).toContain("if (first.autopickEnabled)");
    expect(content).toContain("if (first.draftPaused)");
    expect(content).toContain('first.secondsRemaining < 8');
    expect(content).toContain('const first = await stableSnapshot()');
    expect(content).toContain('const second = await stableSnapshot()');
  });

  test('sends observed ESPN draft history so Command Center can hide drafted players', () => {
    expect(content).toContain('function draftedPlayerNames()');
    expect(content).toContain(".pick-message__container .playerinfo__playername, .pick-history .playerinfo__playername");
    expect(content).toContain('.draft-board-grid-pick-cell.completedPick');
    expect(content).toContain('draftedPlayerNames: draftedPlayerNames()');
  });

  test('uses ESPN native Draft controls and treats a post-click ambiguity as uncertain with no retry loop', () => {
    expect(content).toContain("text(button).toLowerCase() === 'draft' && !button.disabled");
    expect(content).toContain('control.button.click();');
    expect(content.match(/control\.button\.click\(\);/g)).toHaveLength(1);
    expect(content).toContain("handledActions.add(action.actionId)");
    expect(content).toContain("await sendResult(action, 'uncertain'");
    expect(content).not.toMatch(/auto[-_ ]?draft|automaticDraft|retryAction|retryPick/i);
  });

  test('background transport talks only to the local Command Center bridge endpoints', () => {
    expect(background).toContain("const LOCAL_BASES = ['http://127.0.0.1:5000', 'http://localhost:5000']");
    expect(background).toContain('/api/management/espn-draft-bridge/heartbeat');
    expect(background).toContain('/api/management/espn-draft-bridge/next');
    expect(background).toContain('/api/management/espn-draft-bridge/result');
    expect(background).not.toMatch(/fantasy\.espn\.com.*fetch|espnapi|kona_player_info|mDraftDetail/i);
  });
});

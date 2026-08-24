import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const arena = readFileSync(
  new URL('../src/world3d/prefabs/arenaHall.tsx', import.meta.url),
  'utf8',
);
const contract = readFileSync(
  new URL('../../shared/src/venueSpatialContracts.ts', import.meta.url),
  'utf8',
);
const smoke = readFileSync(new URL('../../scripts/smoke.mjs', import.meta.url), 'utf8');
const evidence = readFileSync(new URL('../../scripts/validate-evidence.mjs', import.meta.url), 'utf8');

describe('电竞馆中央赛台与多人导播屏', () => {
  it('uses two equal four-player rows at the arena centre', () => {
    expect(contract).toContain('x: [-3.3, -1.1, 1.1, 3.3] as const');
    expect(contract).toContain('rowZ: [-2.25, 2.25] as const');
    expect(arena).toContain('arena-central-four-v-four-benches');
    expect(arena).not.toContain('arena-five-player-bench');
    expect(contract).toContain('endStands: {');
    expect(contract).toContain('z: [-1, 1] as const');
    expect(arena).toContain('endStands.z.flatMap');
    expect(arena).toContain('for (const end of endStands.z)');
  });

  it('renders eight independent live-share panels on the suspended jumbotron', () => {
    expect(contract).toContain('panelsPerFace: 2');
    expect(contract).toContain('visibleSlots: 8');
    expect(arena).toContain('arena-eight-share-jumbotron');
    expect(arena).toContain('function BroadcastSharePanel');
    expect(arena).toContain('function broadcastLabelTexture');
    expect(arena).toContain('const video = useSessionVideo(sessionId)');
    expect(arena).toContain('slot={index * 2}');
    expect(arena).toContain('slot={index * 2 + 1}');
    expect(arena).not.toContain('overheadScreenTexture(index)');
  });

  it('pages overflow sharers and resolves the local stream by session id', () => {
    expect(arena).toContain('(current + 1) % pageCount');
    expect(arena).toContain('12_000');
    expect(arena).toContain('profile.userId === selfUserId');
    expect(arena).toContain('sessionId === selfSessionId');
    expect(arena).toContain('sharedVideoTextures.get(stream)');
    expect(arena).toContain('existing.refs += 1');
  });

  it('requires a dedicated upward-looking jumbotron screenshot', () => {
    expect(smoke).toContain("'arena-jumbotron-desktop.png'");
    expect(smoke).toContain('camera.pitch = -0.32');
    expect(evidence).toContain("['arena-jumbotron-desktop.png', desktop]");
  });
});

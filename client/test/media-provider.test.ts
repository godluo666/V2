import { describe, expect, it } from 'vitest';
import {
  planProviderSync, SYNC_POLICY, youtubeVideoId,
} from '../src/world3d/media/provider';

const plan = (overrides: Partial<Parameters<typeof planProviderSync>[0]> = {}) =>
  planProviderSync({
    current: 10,
    target: 10,
    playing: true,
    buffering: false,
    supportsFineRate: true,
    baseRate: 1,
    nowMs: 5_000,
    lastSeekAtMs: 0,
    ...overrides,
  });

describe('provider-neutral room playback correction', () => {
  it('keeps normal rate within 150ms', () => {
    expect(SYNC_POLICY.DEAD_SECONDS).toBe(0.15);
    expect(plan({ current: 10.149 }).mode).toBe('idle');
  });

  it('uses only a 3% temporary adjustment between 150ms and 500ms', () => {
    expect(plan({ current: 9.7 })).toEqual(expect.objectContaining({ mode: 'rate', rate: 1.03 }));
    expect(plan({ current: 10.3 })).toEqual(expect.objectContaining({ mode: 'rate', rate: 0.97 }));
  });

  it('seeks above 500ms and aligns paused media above 150ms', () => {
    expect(plan({ current: 9.49 })).toEqual(expect.objectContaining({ mode: 'seek', target: 10 }));
    expect(plan({ current: 10.2, playing: false })).toEqual(expect.objectContaining({ mode: 'seek' }));
  });

  it('does not seek while buffering or during seek cooldown', () => {
    expect(plan({ current: 8, buffering: true }).mode).toBe('buffer');
    expect(plan({ current: 8, nowMs: 900, lastSeekAtMs: 0 }).mode).toBe('idle');
  });

  it('allows the first mount to align immediately', () => {
    expect(plan({
      current: 0,
      target: 40,
      nowMs: 20,
      lastSeekAtMs: Number.NEGATIVE_INFINITY,
    }).mode).toBe('seek');
  });

  it('uses seek rather than rate adjustment for coarse providers', () => {
    expect(plan({ current: 10.3, supportsFineRate: false }).mode).toBe('idle');
    expect(plan({ current: 10.6, supportsFineRate: false }).mode).toBe('seek');
  });
});

describe('YouTube provider URL normalization', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('extracts %s', (url, expected) => {
    expect(youtubeVideoId(url)).toBe(expected);
  });

  it('rejects non-YouTube and malformed URLs', () => {
    expect(youtubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeVideoId('not a url')).toBeNull();
  });
});

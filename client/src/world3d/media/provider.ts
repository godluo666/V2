/**
 * Provider-neutral playback correction. New timed providers implement the
 * adapter capabilities below and reuse the same room-authoritative policy.
 */
export interface VideoProviderAdapter {
  readonly supportsFineRate: boolean;
  currentTime(): number;
  duration(): number;
  isPaused(): boolean;
  isBuffering(): boolean;
  playbackRate(): number;
  seek(seconds: number): void;
  setPlaybackRate(rate: number): void;
  play(): void | Promise<void>;
  pause(): void;
}

export const SYNC_POLICY = {
  DEAD_SECONDS: 0.15,
  RATE_LIMIT_SECONDS: 0.5,
  RATE_ADJUSTMENT: 0.03,
  SEEK_COOLDOWN_MS: 1_200,
  TICK_MS: 250,
} as const;

/** Normalize the YouTube URL forms accepted by the media input. */
export function youtubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let candidate: string | null = null;
    if (host === 'youtu.be') {
      candidate = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (
      host === 'youtube.com'
      || host.endsWith('.youtube.com')
      || host === 'youtube-nocookie.com'
      || host.endsWith('.youtube-nocookie.com')
    ) {
      if (url.pathname === '/watch') {
        candidate = url.searchParams.get('v');
      } else {
        const [kind, id] = url.pathname.split('/').filter(Boolean);
        if (kind === 'embed' || kind === 'shorts' || kind === 'live') candidate = id ?? null;
      }
    }
    return candidate && /^[A-Za-z0-9_-]{6,}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export type SyncPlan =
  | { mode: 'buffer'; drift: number; rate: number }
  | { mode: 'idle'; drift: number; rate: number }
  | { mode: 'rate'; drift: number; rate: number }
  | { mode: 'seek'; drift: number; rate: number; target: number };

export function planProviderSync(args: {
  current: number;
  target: number;
  playing: boolean;
  buffering: boolean;
  supportsFineRate: boolean;
  baseRate: number;
  nowMs: number;
  lastSeekAtMs: number;
}): SyncPlan {
  const drift = args.current - args.target;
  const distance = Math.abs(drift);
  if (args.buffering) return { mode: 'buffer', drift, rate: args.baseRate };
  if (distance <= SYNC_POLICY.DEAD_SECONDS) {
    return { mode: 'idle', drift, rate: args.baseRate };
  }
  if (args.playing && args.supportsFineRate && distance <= SYNC_POLICY.RATE_LIMIT_SECONDS) {
    return {
      mode: 'rate',
      drift,
      rate: args.baseRate * (1 - Math.sign(drift) * SYNC_POLICY.RATE_ADJUSTMENT),
    };
  }
  if (
    distance > SYNC_POLICY.RATE_LIMIT_SECONDS
    || (!args.playing && distance > SYNC_POLICY.DEAD_SECONDS)
  ) {
    if (args.nowMs - args.lastSeekAtMs >= SYNC_POLICY.SEEK_COOLDOWN_MS) {
      return { mode: 'seek', drift, rate: args.baseRate, target: args.target };
    }
  }
  return { mode: 'idle', drift, rate: args.baseRate };
}

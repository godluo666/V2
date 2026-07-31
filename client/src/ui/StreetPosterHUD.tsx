import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CITY_BOUNDS, SPACE, VENUES, type CityVenue,
} from '@nexuspark/shared';
import { hot } from '../state/hot';
import { useWorld } from '../state/stores';
import { audio } from '../audio/engine';
import './StreetPosterHUD.css';

type VenueKey = CityVenue['key'];

const VENUE_COPY: Record<VenueKey, {
  index: string;
  eyebrow: string;
  detail: string;
  action: string;
}> = {
  cinema: {
    index: '01',
    eyebrow: 'AURORA SCREEN',
    detail: '巨幕放映 / 同步观影',
    action: '沿一番街向东',
  },
  gameroom: {
    index: '02',
    eyebrow: 'DANGO CLUB',
    detail: '象棋 / 飞行棋 / 社团活动',
    action: '穿过北侧商店街',
  },
  netcafe: {
    index: '03',
    eyebrow: 'MIRROR ARENA',
    detail: '电竞直播 / 团队观战',
    action: '由南口转入',
  },
};

function mapPoint([x, z]: [number, number]): [number, number] {
  const px = ((x - CITY_BOUNDS.minX) / (CITY_BOUNDS.maxX - CITY_BOUNDS.minX)) * 100;
  const py = ((z - CITY_BOUNDS.minZ) / (CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ)) * 100;
  return [px, py];
}

function nearestRouteFrom(player: [number, number], venue: CityVenue): Array<[number, number]> {
  let bestIndex = 0;
  let bestDistance = Infinity;
  venue.route.forEach((point, index) => {
    const distance = Math.hypot(point[0] - player[0], point[1] - player[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return [player, ...venue.route.slice(bestIndex)];
}

export default function StreetPosterHUD() {
  const spaceKey = useWorld((state) => state.spaceKey);
  const rootRef = useRef<HTMLElement>(null);
  const [targetKey, setTargetKey] = useState<VenueKey>('cinema');
  const [player, setPlayer] = useState<[number, number]>([hot.local.x, hot.local.z]);

  useEffect(() => {
    if (spaceKey !== SPACE.PLAZA) return undefined;
    const update = () => setPlayer([hot.local.x, hot.local.z]);
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [spaceKey]);

  useEffect(() => {
    if (spaceKey !== SPACE.PLAZA) return undefined;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;
    const onMove = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const x = (event.clientX / window.innerWidth - 0.5) * 8;
      const y = (event.clientY / window.innerHeight - 0.5) * 6;
      root.style.setProperty('--poster-x', `${x.toFixed(2)}px`);
      root.style.setProperty('--poster-y', `${y.toFixed(2)}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [spaceKey]);

  const selected = useMemo(
    () => VENUES.find((venue) => venue.key === targetKey) ?? VENUES[0],
    [targetKey],
  );
  const route = useMemo(() => nearestRouteFrom(player, selected), [player, selected]);
  const routePoints = useMemo(
    () => route.map((point) => mapPoint(point).join(',')).join(' '),
    [route],
  );
  const [playerMapX, playerMapY] = mapPoint(player);
  const distance = Math.round(Math.hypot(selected.approach[0] - player[0], selected.approach[1] - player[1]));
  const selectedCopy = VENUE_COPY[selected.key];

  if (spaceKey !== SPACE.PLAZA) return null;

  return (
    <aside ref={rootRef} className="street-poster-ui" aria-label="一番街地点导航">
      <div className="street-poster-ink" aria-hidden="true" />
      <div className="street-poster-speed" aria-hidden="true" />

      <div className="street-edition" aria-hidden="true">
        <span>07</span>
        <b>ICHIBAN</b>
        <i>STREET</i>
      </div>

      <section className="street-objective" aria-label="当前任务">
        <span className="street-objective-kicker">TODAY&apos;S MOVE</span>
        <strong>在十字街口选择目的地</strong>
        <small>目标已标记 · 徒步前往场馆入口</small>
      </section>

      <svg className="street-route-map" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <pattern id="street-halftone" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r=".65" fill="currentColor" />
          </pattern>
        </defs>
        <path className="street-map-district street-map-district-a" d="M2 7 L35 2 43 32 27 49 3 42Z" />
        <path className="street-map-district street-map-district-b" d="M49 3 L98 12 90 48 57 43 43 31Z" />
        <path className="street-map-district street-map-district-c" d="M5 56 L40 45 55 98 4 92Z" />
        <path className="street-map-district street-map-district-d" d="M55 48 L94 54 99 96 58 99Z" />
        <path className="street-map-rail" d="M-5 79 C22 62 39 68 58 51 S87 24 106 31" />
        <polyline className="street-route-shadow" points={routePoints} />
        <polyline className="street-route-line" points={routePoints} />
        <circle className="street-player-pulse" cx={playerMapX} cy={playerMapY} r="2.4" />
        <circle className="street-player-dot" cx={playerMapX} cy={playerMapY} r="1.2" />
      </svg>

      <div className="street-venue-layer" aria-label="地点">
        {VENUES.map((venue) => {
          const copy = VENUE_COPY[venue.key];
          const active = venue.key === selected.key;
          return (
            <button
              key={venue.key}
              type="button"
              className={`street-venue street-venue-${venue.key}${active ? ' is-active' : ''}`}
              aria-pressed={active}
              aria-label={`标记路线：${venue.label}`}
              onClick={() => {
                setTargetKey(venue.key);
                audio.click();
              }}
            >
              <span className="street-venue-index">{copy.index}</span>
              <span className="street-venue-label">{venue.label}</span>
              <span className="street-venue-arrow" aria-hidden="true">➜</span>
            </button>
          );
        })}
      </div>

      <section className="street-route-detail" aria-live="polite">
        <span className="street-detail-index">{selectedCopy.index}</span>
        <div>
          <span className="street-detail-kicker">{selectedCopy.eyebrow}</span>
          <strong>{selected.label}</strong>
          <small>{selectedCopy.detail}</small>
        </div>
        <div className="street-detail-distance">
          <b>{distance}</b>
          <span>M</span>
          <small>{selectedCopy.action}</small>
        </div>
      </section>

      <div className="street-coordinate" aria-hidden="true">
        35.68°N / 139.70°E<br />
        BLOCK 07 — LIVE
      </div>
    </aside>
  );
}

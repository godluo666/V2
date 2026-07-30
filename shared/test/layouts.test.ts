import { describe, it, expect } from 'vitest';
import {
  CITY_BOUNDS, ROADS, CROSSING, CROSSWALKS, SIDEWALKS, BUILDINGS,
  VENUES, ANOMALY_POINTS,
} from '../src/cityplan';
import { LAYOUTS, floorHeightAt } from '../src/layouts';
import type { SpaceLayout } from '../src/layouts';
import { resolveCollisions, clampToBounds } from '../src/math';
import { SPACE } from '../src/constants';

const city = LAYOUTS[SPACE.PLAZA];

function march(layout: SpaceLayout, waypoints: Array<[number, number]>): [number, number] {
  let [x, z] = waypoints[0];
  for (const [tx, tz] of waypoints.slice(1)) {
    for (let i = 0; i < 800; i++) {
      const dx = tx - x;
      const dz = tz - z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.22) break;
      x += (dx / distance) * 0.2;
      z += (dz / distance) * 0.2;
      [x, z] = clampToBounds(x, z, layout.bounds);
      [x, z] = resolveCollisions(x, z, 0.34, layout.colliders);
    }
  }
  return [x, z];
}

const near = (p: [number, number], x: number, z: number, tolerance = 0.8) =>
  Math.hypot(p[0] - x, p[1] - z) < tolerance;

describe('月汐町一番街坐标契约', () => {
  it('只有一条 58m 主街，整个可玩区保持紧凑', () => {
    expect(CITY_BOUNDS).toEqual({ minX: -31, maxX: 31, minZ: -23, maxZ: 23 });
    expect(city.bounds).toEqual(CITY_BOUNDS);
    expect(ROADS).toEqual([{ x: 0, z: 0, w: 58, d: 8 }]);
    expect(CROSSING).toEqual({ x: 0, z: 0, w: 7, d: 8 });
    expect(CROSSWALKS).toHaveLength(1);
    expect(CITY_BOUNDS.maxX - CITY_BOUNDS.minX).toBe(62);
    expect(CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ).toBe(46);
    expect(ANOMALY_POINTS.map((a) => a.id).sort()).toEqual([
      'a-cinema-poster', 'b-crossing-glow', 'c-club-alley',
    ]);
  });

  it('街上严格只开放电影院、电竞观战馆和团子轰趴馆', () => {
    expect(VENUES.map((v) => v.key).sort()).toEqual(['cinema', 'gameroom', 'netcafe']);
    const targets: Record<string, string> = {
      cinema: SPACE.CINEMA,
      netcafe: SPACE.NETCAFE,
      gameroom: SPACE.GAMEROOM,
    };
    const plazaDoors = city.interactables.filter((i) => i.kind === 'door');
    expect(plazaDoors).toHaveLength(3);
    for (const venue of VENUES) {
      const door = plazaDoors.find((i) => i.id === `d-${venue.key}`);
      expect(door, venue.key).toBeTruthy();
      expect(door?.data?.target).toBe(targets[venue.key]);
      expect(door?.pos[0]).toBe(venue.x);
      expect(door?.pos[2]).toBe(venue.z);
    }
  });

  it('住宅与场馆不压住道路和步道', () => {
    const walkways = [...ROADS, CROSSING, ...CROSSWALKS, ...SIDEWALKS];
    for (const building of BUILDINGS) {
      if (building.style === 'silhouette') continue;
      expect(building.x - building.w / 2).toBeGreaterThanOrEqual(CITY_BOUNDS.minX);
      expect(building.x + building.w / 2).toBeLessThanOrEqual(CITY_BOUNDS.maxX);
      expect(building.z - building.d / 2).toBeGreaterThanOrEqual(CITY_BOUNDS.minZ);
      expect(building.z + building.d / 2).toBeLessThanOrEqual(CITY_BOUNDS.maxZ);
      for (const walkway of walkways) {
        const overlap = Math.abs(building.x - walkway.x) < (building.w + walkway.w) / 2 - 0.01
          && Math.abs(building.z - walkway.z) < (building.d + walkway.d) / 2 - 0.01;
        expect(overlap, `building(${building.x},${building.z}) vs walkway(${walkway.x},${walkway.z})`).toBe(false);
      }
    }
  });

  it('近景剪影只做视觉背景，不生成碰撞', () => {
    const silhouettes = BUILDINGS.filter((b) => b.style === 'silhouette');
    expect(silhouettes).toHaveLength(14);
    for (const silhouette of silhouettes) {
      expect(
        silhouette.x < CITY_BOUNDS.minX
          || silhouette.x > CITY_BOUNDS.maxX
          || silhouette.z < CITY_BOUNDS.minZ
          || silhouette.z > CITY_BOUNDS.maxZ,
      ).toBe(true);
      expect(city.colliders.some(
        (c) => c.kind === 'box' && c.x === silhouette.x && c.z === silhouette.z && c.w === silhouette.w,
      )).toBe(false);
    }
  });
});

describe('一番街可走性', () => {
  it('出生点和三个门前站位没有卡进碰撞体', () => {
    const standSpots: Array<[number, number]> = [
      [city.spawn[0], city.spawn[2]],
      [-19, -7.45],
      [0, 7.45],
      [19, -7.45],
    ];
    for (const [sx, sz] of standSpots) {
      const [x, z] = resolveCollisions(sx, sz, 0.34, city.colliders);
      expect(Math.hypot(x - sx, z - sz), `(${sx},${sz})`).toBeLessThan(0.01);
    }
  });

  it.each([
    ['电影院', -19, -7.45],
    ['电竞观战馆', 0, 7.45],
    ['团子轰趴馆', 19, -7.45],
  ])('出生点能沿单街走到%s门前', (_label, targetX, targetZ) => {
    const sideZ = targetZ < 0 ? -5.7 : 5.7;
    const p = march(city, [
      [city.spawn[0], city.spawn[2]],
      [targetX, city.spawn[2]],
      [targetX, sideZ],
      [targetX, targetZ],
    ]);
    expect(near(p, targetX, targetZ)).toBe(true);
  });

  it('户外不再有天桥高度区', () => {
    expect(city.heightZones).toEqual([]);
    expect(floorHeightAt(city, -19, -7.45)).toBe(0);
    expect(floorHeightAt(city, 0, 0)).toBe(0);
  });
});

describe('三个场馆室内基线', () => {
  it('影院座椅、台阶和坐下点共用同一高度契约', () => {
    const cinema = LAYOUTS[SPACE.CINEMA];
    const seats = cinema.props.filter((p) => p.type === 'cinema_seat');
    const seatSnaps = cinema.interactables.filter((i) => i.kind === 'seat' && i.id.startsWith('cine-s'));
    const risers = cinema.props.filter((p) => p.type === 'cinema_riser');
    expect(seats).toHaveLength(50);
    expect(seatSnaps).toHaveLength(50);
    expect(risers).toHaveLength(4);
    expect(cinema.heightZones).toHaveLength(4);
    seats.forEach((seat, index) => {
      expect(seatSnaps[index].pos[1] - seat.pos[1]).toBeCloseTo(0.47, 6);
      expect(floorHeightAt(cinema, seat.pos[0], seat.pos[2])).toBeCloseTo(seat.pos[1], 6);
    });
    risers.forEach((riser) => {
      expect(floorHeightAt(cinema, riser.pos[0], riser.pos[2])).toBeCloseTo(
        riser.data?.h as number,
        6,
      );
    });
  });

  it('电竞观战馆保留 8 个机位、观战沙发和共享大屏', () => {
    const arena = LAYOUTS[SPACE.NETCAFE];
    expect(arena.mediaPolicy).toBe('everyone');
    expect(arena.props.filter((p) => p.type === 'nc_station')).toHaveLength(8);
    expect(arena.interactables.filter((i) => /^nc-s\d+$/.test(i.id))).toHaveLength(8);
    expect(arena.interactables.filter((i) => i.id.startsWith('nc-sofa-'))).toHaveLength(2);
    expect(arena.interactables.find((i) => i.id === 'nc-wall')?.kind).toBe('screen');
  });

  it('团子轰趴馆是温馨社团活动室，含象棋与飞行棋围坐区', () => {
    const club = LAYOUTS[SPACE.GAMEROOM];
    expect(club.bounds).toEqual({ minX: -12, maxX: 12, minZ: -9, maxZ: 9 });
    expect(club.interactables.filter((i) => i.kind === 'riichi')).toHaveLength(0);
    expect(club.interactables.find((i) => i.id === 'gr-xq')?.kind).toBe('xiangqi');
    expect(club.interactables.filter((i) => i.id.startsWith('gr-flight-s'))).toHaveLength(4);
    expect(club.props.filter((p) => p.type === 'club_sofa')).toHaveLength(2);
    for (const prop of ['club_rug', 'club_stage', 'club_flying_chess', 'club_trophy_wall']) {
      expect(club.props.some((p) => p.type === prop), prop).toBe(true);
    }
  });

  it('三个室内出口都回到安全的街边落点', () => {
    for (const key of [SPACE.CINEMA, SPACE.NETCAFE, SPACE.GAMEROOM]) {
      const exit = LAYOUTS[key].interactables.find((i) => i.kind === 'door');
      const spawn = exit?.data?.spawn as [number, number, number, number];
      expect(exit?.data?.target).toBe(SPACE.PLAZA);
      const [x, z] = resolveCollisions(spawn[0], spawn[2], 0.34, city.colliders);
      expect(Math.hypot(x - spawn[0], z - spawn[2]), key).toBeLessThan(0.01);
    }
  });
});

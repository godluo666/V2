import { describe, it, expect } from 'vitest';
import {
  CITY_BOUNDS, ROADS, CROSSING, CROSSWALKS, SIDEWALKS, BUILDINGS,
  VENUES, ANOMALY_POINTS,
} from '../src/cityplan';
import { LAYOUTS, floorHeightAt } from '../src/layouts';
import type { SpaceLayout } from '../src/layouts';
import { resolveCollisions, clampToBounds } from '../src/math';
import { SPACE } from '../src/constants';
import { ARENA_SPATIAL_CONTRACT, CINEMA_SPATIAL_CONTRACT } from '../src/venueSpatialContracts';

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
  it('以紧凑十字路口替代空旷直街，边界没有扩大', () => {
    expect(CITY_BOUNDS).toEqual({ minX: -29, maxX: 29, minZ: -23, maxZ: 23 });
    expect(city.bounds).toEqual(CITY_BOUNDS);
    expect(ROADS).toEqual([
      { x: 2, z: 1, w: 54, d: 7.2 },
      { x: -8, z: 0, w: 7.2, d: 42 },
    ]);
    expect(CROSSING).toEqual({ x: -8, z: 1, w: 10, d: 7.2 });
    expect(CROSSWALKS).toHaveLength(4);
    expect(SIDEWALKS).toHaveLength(8);
    expect(new Set(CROSSWALKS.map((crosswalk) => crosswalk.dir))).toEqual(new Set(['x', 'z']));
    expect(CITY_BOUNDS.maxX - CITY_BOUNDS.minX).toBe(58);
    expect(CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ).toBe(46);
    expect(ANOMALY_POINTS.map((a) => a.id).sort()).toEqual([
      'a-cinema-poster', 'b-crossing-glow', 'c-club-alley',
    ]);
  });

  it('四个街角由高层与数据化招牌压紧，不留下大型空地', () => {
    const active = BUILDINGS.filter((building) => building.style !== 'silhouette');
    expect(active.filter((building) => building.h >= 28)).toHaveLength(6);
    expect(Math.max(...active.map((building) => building.h))).toBe(48);
    expect(active.filter((building) => building.style === 'mediaTower')).toHaveLength(1);
    expect(active.flatMap((building) => building.facadeSigns ?? []).length).toBeGreaterThanOrEqual(24);
    expect(active.some((building) => building.x < -15 && building.z < -7)).toBe(true);
    expect(active.some((building) => building.x > -1 && building.z < -7)).toBe(true);
    expect(active.some((building) => building.x < -15 && building.z > 8)).toBe(true);
    expect(active.some((building) => building.x > -1 && building.z > 8)).toBe(true);
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
      expect(venue.route.at(-1)).toEqual(venue.approach);
    }
    const cinema = VENUES.find((venue) => venue.key === 'cinema')!;
    const cinemaFramingPoint = cinema.route.at(-2)!;
    expect(cinemaFramingPoint[0]).toBeCloseTo(cinema.approach[0], 6);
    expect(cinemaFramingPoint[1]).toBeGreaterThan(cinema.approach[1]);
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
    expect(silhouettes).toHaveLength(18);
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
      ...VENUES.map((venue) => venue.approach),
    ];
    for (const [sx, sz] of standSpots) {
      const [x, z] = resolveCollisions(sx, sz, 0.34, city.colliders);
      expect(Math.hypot(x - sx, z - sz), `(${sx},${sz})`).toBeLessThan(0.01);
    }
  });

  it.each(VENUES)('出生点能沿共享路线走到$label门前', (venue) => {
    const p = march(city, [
      [city.spawn[0], city.spawn[2]],
      ...venue.route,
    ]);
    expect(near(p, venue.approach[0], venue.approach[1])).toBe(true);
  });

  it('户外不再有天桥高度区', () => {
    expect(city.heightZones).toEqual([]);
    expect(floorHeightAt(city, VENUES[0].approach[0], VENUES[0].approach[1])).toBe(0);
    expect(floorHeightAt(city, 0, 0)).toBe(0);
  });
});

describe('三个场馆室内基线', () => {
  it('影院座椅、台阶和坐下点共用同一高度契约', () => {
    const cinema = LAYOUTS[SPACE.CINEMA];
    const seats = cinema.props.filter((p) => p.type === 'cinema_seat');
    const seatSnaps = cinema.interactables.filter((i) => i.kind === 'seat' && /^cine-s\d+$/.test(i.id));
    const risers = cinema.props.filter((p) => p.type === 'cinema_riser');
    expect(cinema.bounds).toEqual(CINEMA_SPATIAL_CONTRACT.bounds);
    expect(seats).toHaveLength(72);
    expect(seatSnaps).toHaveLength(72);
    expect(risers).toHaveLength(5);
    expect(cinema.heightZones).toHaveLength(15);
    const cinemaScreen = cinema.interactables.find((item) => item.id === CINEMA_SPATIAL_CONTRACT.screen.id)!;
    expect(cinemaScreen.pos).toEqual(CINEMA_SPATIAL_CONTRACT.screen.position);
    expect(cinemaScreen.data).toMatchObject({
      width: CINEMA_SPATIAL_CONTRACT.screen.width,
      height: CINEMA_SPATIAL_CONTRACT.screen.height,
    });
    expect(floorHeightAt(cinema, 0, -12)).toBeCloseTo(0.58, 6);
    expect(floorHeightAt(cinema, 0, -10.55)).toBeCloseTo(0.2, 6);
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

  it('电竞观战馆扩建为 42 × 34 米赛事空间，保留 8 个机位和共享大屏', () => {
    const arena = LAYOUTS[SPACE.NETCAFE];
    expect(arena.bounds).toEqual(ARENA_SPATIAL_CONTRACT.bounds);
    expect(arena.mediaPolicy).toBe('everyone');
    expect(arena.props.filter((p) => p.type === 'nc_station')).toHaveLength(8);
    expect(arena.interactables.filter((i) => /^nc-s\d+$/.test(i.id))).toHaveLength(8);
    const arenaScreen = arena.interactables.find((i) => i.id === ARENA_SPATIAL_CONTRACT.screen.id)!;
    expect(arenaScreen.kind).toBe('screen');
    expect(arenaScreen.pos).toEqual(ARENA_SPATIAL_CONTRACT.screen.position);
    expect(arenaScreen.data).toMatchObject({
      width: ARENA_SPATIAL_CONTRACT.screen.width,
      height: ARENA_SPATIAL_CONTRACT.screen.height,
    });
    expect(arena.heightZones).toHaveLength(12);

    // 主舞台三层完成面和入口三段踏步必须与 ArenaHallArchitecture 的
    // BoxGeometry 顶面完全一致，避免角色脚底在近景中悬空。
    expect(floorHeightAt(arena, 0, 0)).toBeCloseTo(0.6, 6);
    expect(floorHeightAt(arena, 0, 0.5)).toBeCloseTo(0.55, 6);
    expect(floorHeightAt(arena, 0, 0.95)).toBeCloseTo(0.51, 6);
    expect(floorHeightAt(arena, 0, 1.35)).toBeCloseTo(0.36, 6);
    expect(floorHeightAt(arena, 0, 1.65)).toBeCloseTo(0.24, 6);
    for (const station of arena.props.filter((p) => p.type === 'nc_station')) {
      expect(floorHeightAt(arena, station.pos[0], station.pos[2])).toBeCloseTo(station.pos[1], 6);
    }

    // 主屏背壳有碰撞，但主持台后仍保留一条真实可走的检修通道；
    // 玩家无需穿模即可进入客户端 3.4m / 服务端 5m 的互动范围。
    const screen = arenaScreen;
    const screenApproach: [number, number] = [0, -15.75];
    const resolvedApproach = resolveCollisions(...screenApproach, 0.34, arena.colliders);
    expect(resolvedApproach).toEqual(screenApproach);
    expect(Math.hypot(screen.pos[0] - screenApproach[0], screen.pos[2] - screenApproach[1])).toBeLessThan(3.4);
    const reachedScreen = march(arena, [
      [arena.spawn[0], arena.spawn[2]],
      [8.8, 2.2],
      [8.8, -15.75],
      screenApproach,
    ]);
    expect(near(reachedScreen, ...screenApproach)).toBe(true);
  });

  it('团子轰趴馆是温馨社团活动室，含象棋与飞行棋围坐区', () => {
    const club = LAYOUTS[SPACE.GAMEROOM];
    expect(club.bounds).toEqual({ minX: -12, maxX: 12, minZ: -9, maxZ: 9 });
    expect(club.interactables.filter((i) => i.kind === 'riichi')).toHaveLength(0);
    expect(club.interactables.find((i) => i.id === 'gr-xq')?.kind).toBe('xiangqi');
    expect(club.interactables.filter((i) => i.id.startsWith('gr-flight-s'))).toHaveLength(4);
    expect(club.interactables.filter((i) => i.id.startsWith('gr-craft-s'))).toHaveLength(2);
    expect(club.props.filter((p) => p.type === 'club_sofa')).toHaveLength(2);
    for (const prop of [
      'club_rug',
      'club_stage',
      'club_flying_chess',
      'club_craft_table',
      'club_trophy_wall',
      'club_storage',
      'club_reading_nook',
    ]) {
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

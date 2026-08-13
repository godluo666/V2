import { describe, it, expect } from 'vitest';
import {
  ALLEY_W, CITY_BOUNDS, ROAD_W, ROADS, CROSSINGS, CROSSWALKS, SIDEWALKS, BUILDINGS,
  VENUES,
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
  it('一条窄主街连接两条错位短巷，边界没有扩大', () => {
    expect(CITY_BOUNDS).toEqual({ minX: -29, maxX: 29, minZ: -23, maxZ: 23 });
    expect(city.bounds).toEqual(CITY_BOUNDS);
    expect(ROADS).toEqual([
      { x: 0, z: 0, w: 58, d: 6.4 },
      { x: -8, z: -13.1, w: 3.4, d: 19.8 },
      { x: 9.1, z: 13.1, w: 3.4, d: 19.8 },
    ]);
    expect(ROAD_W).toBe(6.4);
    expect(ALLEY_W).toBe(3.4);
    expect(CROSSINGS).toEqual([
      { x: -8, z: -1.6, w: 3.4, d: 3.2, ry: 0 },
      { x: 9.1, z: 1.6, w: 3.4, d: 3.2, ry: Math.PI },
    ]);
    expect(CROSSWALKS).toHaveLength(2);
    expect(SIDEWALKS).toHaveLength(4);
    expect(SIDEWALKS.some((walk) => Math.abs(walk.z + 4.2) < 0.01
      && Math.abs(walk.x + 8) < walk.w / 2)).toBe(false);
    expect(SIDEWALKS.some((walk) => Math.abs(walk.z - 4.2) < 0.01
      && Math.abs(walk.x - 9.1) < walk.w / 2)).toBe(false);
    expect(CROSSWALKS.every((crosswalk) => crosswalk.dir === 'x')).toBe(true);
    expect(CROSSWALKS.map((crosswalk) => crosswalk.x).sort((a, b) => a - b)).toEqual([-8, 9.1]);
    expect(CITY_BOUNDS.maxX - CITY_BOUNDS.minX).toBe(58);
    expect(CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ).toBe(46);
    expect(city.props.filter((prop) => prop.type === 'c_drain')).toHaveLength(8);
    const alleyWallLights = city.props.filter((prop) => prop.type === 'c_wall_light');
    expect(alleyWallLights).toHaveLength(4);
    expect(alleyWallLights.every((light) => light.pos[1] === 2.45)).toBe(true);
    expect(alleyWallLights.every((light) => (
      Math.abs(Math.abs(light.pos[0] + 8) - ALLEY_W / 2) < 0.08
        || Math.abs(Math.abs(light.pos[0] - 9.1) - ALLEY_W / 2) < 0.08
    ))).toBe(true);
    for (const light of alleyWallLights) {
      expect(city.colliders.some((collider) => (
        collider.kind === 'circle'
          && collider.x === light.pos[0]
          && collider.z === light.pos[2]
      ))).toBe(false);
    }
  });

  it('中低层建筑形成连续街墙，招牌不再压过建筑本身', () => {
    const active = BUILDINGS.filter((building) => building.style !== 'silhouette' && !building.backdrop);
    expect(active).toHaveLength(17);
    expect(active.filter((building) => building.h <= 22)).toHaveLength(17);
    expect(Math.min(...active.map((building) => building.w))).toBeLessThanOrEqual(2.5);
    expect(Math.max(...active.map((building) => building.w))).toBe(18);
    expect(active.filter((building) => building.style === 'mediaTower')).toHaveLength(0);
    expect(active.flatMap((building) => building.facadeSigns ?? []).length).toBeLessThanOrEqual(10);
    const ordinaryShopfronts = active.filter(
      (building) => building.style === 'shopfront' && !building.venue,
    );
    expect(ordinaryShopfronts).toHaveLength(8);
    expect(ordinaryShopfronts.every((building) => building.groundUse && building.businessState)).toBe(true);
    expect(ordinaryShopfronts.filter((building) => building.businessState === 'closed')).toHaveLength(1);
    expect(ordinaryShopfronts.every((building) => building.businessNotice)).toBe(true);
    expect(new Set(ordinaryShopfronts.map((building) => building.businessNotice))).toHaveLength(8);

    const northWall = active
      .filter((building) => building.z === -10.7)
      .sort((a, b) => a.x - b.x);
    const southWall = active
      .filter((building) => building.z === 10.7)
      .sort((a, b) => a.x - b.x);
    expect(northWall).toHaveLength(7);
    expect(southWall).toHaveLength(6);
    expect(northWall.every((building) => building.ry === 0)).toBe(true);
    expect(southWall.every((building) => building.ry === Math.PI)).toBe(true);
    const northGaps = northWall.slice(1).map((building, index) => (
      building.x - building.w / 2 - (northWall[index].x + northWall[index].w / 2)
    ));
    const southGaps = southWall.slice(1).map((building, index) => (
      building.x - building.w / 2 - (southWall[index].x + southWall[index].w / 2)
    ));
    expect(northGaps.filter((gap) => gap > 0.01)).toHaveLength(1);
    expect(northGaps.find((gap) => gap > 0.01)).toBeCloseTo(ALLEY_W, 6);
    expect(southGaps.filter((gap) => gap > 0.01)).toHaveLength(1);
    expect(southGaps.find((gap) => gap > 0.01)).toBeCloseTo(ALLEY_W, 6);
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
    const walkways = [...ROADS, ...CROSSINGS, ...CROSSWALKS, ...SIDEWALKS];
    for (const building of BUILDINGS) {
      if (building.style === 'silhouette' || building.backdrop) continue;
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
    expect(silhouettes).toHaveLength(17);
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

    const eastWestBackground = silhouettes.filter(
      (building) => Math.abs(building.x) > CITY_BOUNDS.maxX,
    );
    expect(eastWestBackground.length).toBeGreaterThan(0);
    for (const building of eastWestBackground) {
      // Account for the whole footprint, not just its centre: distant masses
      // must leave the carriageway visible behind both detailed termini.
      expect(Math.abs(building.z) - building.d / 2).toBeGreaterThanOrEqual(ROAD_W / 2);
    }
  });

  it('两条尽端巷都由边界外的细化建筑收口，且不生成碰撞', () => {
    const termini = BUILDINGS.filter(
      (building) => building.backdrop && Math.abs(building.z) > CITY_BOUNDS.maxZ,
    );
    expect(termini).toHaveLength(2);
    expect(termini.map((building) => building.x).sort((a, b) => a - b)).toEqual([-8, 9.1]);
    for (const terminus of termini) {
      expect(Math.abs(terminus.z) - terminus.d / 2).toBeCloseTo(CITY_BOUNDS.maxZ, 6);
      expect(terminus.style).not.toBe('silhouette');
      expect(city.colliders.some(
        (collider) => collider.kind === 'box'
          && collider.x === terminus.x && collider.z === terminus.z,
      )).toBe(false);
    }
  });

  it('主街东西两端也有边界外的正常建筑端景', () => {
    const termini = BUILDINGS.filter(
      (building) => building.backdrop && Math.abs(building.x) > CITY_BOUNDS.maxX,
    );
    expect(termini).toHaveLength(2);
    expect(termini.map((building) => building.z)).toEqual([0, 0]);
    for (const terminus of termini) {
      expect(Math.abs(terminus.x) - terminus.w / 2).toBeCloseTo(CITY_BOUNDS.maxX, 6);
      expect(city.colliders.some(
        (collider) => collider.kind === 'box'
          && collider.x === terminus.x && collider.z === terminus.z,
      )).toBe(false);
    }
  });

  it('巷口反光镜、服务表箱与街端反光柱使用显式安全位置', () => {
    const mirrors = city.props.filter((prop) => prop.type === 'c_convex_mirror');
    expect(mirrors).toHaveLength(2);
    expect(mirrors.map((mirror) => mirror.pos[0]).sort((a, b) => a - b)).toEqual([-9.43, 10.53]);
    for (const mirror of mirrors) {
      expect(city.colliders.some((collider) => (
        collider.kind === 'circle'
          && collider.x === mirror.pos[0]
          && collider.z === mirror.pos[2]
          && collider.r === 0.14
      ))).toBe(true);
    }

    const meters = city.props.filter((prop) => prop.type === 'c_service_meters');
    expect(meters).toHaveLength(2);
    expect(meters.every((meter) => meter.pos[1] === 1.18)).toBe(true);
    expect(meters.every((meter) => (
      Math.abs(Math.abs(meter.pos[0] + 8) - ALLEY_W / 2) < 0.08
        || Math.abs(Math.abs(meter.pos[0] - 9.1) - ALLEY_W / 2) < 0.08
    ))).toBe(true);

    const reflectorPosts = city.props.filter((prop) => prop.type === 'c_reflector_post');
    expect(reflectorPosts).toHaveLength(4);
    expect(reflectorPosts.every((post) => Math.abs(post.pos[0]) === 28.15)).toBe(true);
    expect(reflectorPosts.every((post) => Math.abs(post.pos[2]) === 2.58)).toBe(true);
    expect(reflectorPosts.every((post) => Math.abs(post.pos[2]) >= 2.3)).toBe(true);
    for (const post of reflectorPosts) {
      expect(city.colliders.some((collider) => (
        collider.kind === 'circle'
          && collider.x === post.pos[0]
          && collider.z === post.pos[2]
          && collider.r === 0.11
      ))).toBe(true);
    }

    const recyclingStations = city.props.filter((prop) => prop.type === 'c_recycling_station');
    expect(recyclingStations).toHaveLength(1);
    expect(recyclingStations[0].pos).toEqual([-23.2, 0, 4.84]);
    expect(city.colliders.some((collider) => (
      collider.kind === 'box'
        && collider.x === -23.2
        && collider.z === 4.84
        && collider.w === 2.1
        && collider.d === 0.62
    ))).toBe(true);
    expect(VENUES.every((venue) => (
      Math.hypot(venue.approach[0] + 23.2, venue.approach[1] - 4.84) > 3
    ))).toBe(true);
  });

  it('高街具复用共享碰撞并标注相机遮挡高度，低街具不会强制缩短镜头', () => {
    const expectedHighProps = new Map<string, number>([
      ['c_recycling_station', 1.58],
      ['c_locker', 1.78],
      ['c_phone', 2.25],
      ['c_convex_mirror', 2.75],
    ]);
    for (const [type, expectedHeight] of expectedHighProps) {
      for (const prop of city.props.filter((candidate) => candidate.type === type)) {
        const collider = city.colliders.find((candidate) => (
          candidate.x === prop.pos[0] && candidate.z === prop.pos[2]
        ));
        expect(collider, type).toBeDefined();
        expect(collider?.cameraHeight, type).toBe(expectedHeight);
      }
    }

    for (const type of ['c_bench', 'c_planter', 'c_bike', 'c_reflector_post']) {
      for (const prop of city.props.filter((candidate) => candidate.type === type)) {
        const collider = city.colliders.find((candidate) => (
          candidate.x === prop.pos[0] && candidate.z === prop.pos[2]
            && (type === 'c_planter' ? candidate.kind === 'box' && candidate.w === 0.9 && candidate.d === 0.9
              : type === 'c_bike' ? candidate.kind === 'circle' && candidate.r === 0.35
                : type === 'c_reflector_post' ? candidate.kind === 'circle' && candidate.r === 0.11
                  : candidate.kind === 'box' && Math.max(candidate.w, candidate.d) === 1.9)
        ));
        expect(collider, type).toBeDefined();
        expect(collider?.cameraHeight, type).toBeUndefined();
      }
    }

    for (const id of ['city-board', 'v-vend1', 'v-vend2']) {
      const interactable = city.interactables.find((candidate) => candidate.id === id)!;
      const collider = city.colliders.find((candidate) => (
        candidate.x === interactable.pos[0] && candidate.z === interactable.pos[2]
      ));
      expect(collider?.cameraHeight, id).toBeGreaterThan(1.9);
    }

    for (const wires of city.props.filter((prop) => prop.type === 'c_wires')) {
      const len = wires.data?.len as number;
      const anchors = [
        [wires.pos[0], wires.pos[2]],
        [wires.pos[0] + Math.sin(wires.ry) * len, wires.pos[2] + Math.cos(wires.ry) * len],
      ];
      for (const [x, z] of anchors) {
        expect(city.colliders.some((collider) => (
          collider.kind === 'circle'
            && Math.abs(collider.x - x) < 1e-6
            && Math.abs(collider.z - z) < 1e-6
            && collider.r === 0.18
            && collider.cameraHeight === 7.4
        )), `wire support (${x},${z})`).toBe(true);
      }
    }
  });

  it('高街具相机遮挡体之间不重叠', () => {
    const streetBlockers = city.colliders.filter((collider) => (
      collider.cameraHeight != null && collider.cameraHeight <= 7.4
    ));
    const overlaps = (a: (typeof streetBlockers)[number], b: (typeof streetBlockers)[number]) => {
      if (a.kind === 'circle' && b.kind === 'circle') {
        return Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r - 0.01;
      }
      if (a.kind === 'box' && b.kind === 'box') {
        return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.01
          && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 0.01;
      }
      const circle = a.kind === 'circle' ? a : b.kind === 'circle' ? b : null;
      const box = a.kind === 'box' ? a : b.kind === 'box' ? b : null;
      if (!circle || !box) return false;
      const nearestX = Math.max(box.x - box.w / 2, Math.min(circle.x, box.x + box.w / 2));
      const nearestZ = Math.max(box.z - box.d / 2, Math.min(circle.z, box.z + box.d / 2));
      return Math.hypot(circle.x - nearestX, circle.z - nearestZ) < circle.r - 0.01;
    };
    for (let i = 0; i < streetBlockers.length; i++) {
      for (let j = i + 1; j < streetBlockers.length; j++) {
        expect(
          overlaps(streetBlockers[i], streetBlockers[j]),
          `${JSON.stringify(streetBlockers[i])} vs ${JSON.stringify(streetBlockers[j])}`,
        ).toBe(false);
      }
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
    const rearTransition = CINEMA_SPATIAL_CONTRACT.rearAisleTransition;
    expect(cinema.heightZones).toHaveLength(15 + rearTransition.x.length * rearTransition.steps);
    const cinemaScreen = cinema.interactables.find((item) => item.id === CINEMA_SPATIAL_CONTRACT.screen.id)!;
    expect(cinema.props.filter((prop) => prop.type === 'cinema_ticket_gate')).toHaveLength(2);
    const admissionGap = cinema.props
      .filter((prop) => prop.type === 'cinema_ticket_gate')
      .map((prop) => Math.abs(prop.pos[0]))
      .sort((a, b) => a - b);
    expect(admissionGap[0] * 2 - 0.52).toBeGreaterThanOrEqual(2.5);
    expect(admissionGap[0] + 0.26).toBeLessThan(2.05);
    expect(cinema.spawn[2]).toBeGreaterThan(12.5);
    expect(cinema.spawn[2]).toBeGreaterThan(
      Math.max(...cinema.props
        .filter((prop) => prop.type === 'cinema_ticket_gate')
        .map((prop) => prop.pos[2])),
    );
    const concession = cinema.props.find((prop) => prop.type === 'concession')!;
    expect(concession.ry).toBeCloseTo(-Math.PI / 2, 6);
    expect(concession.pos[0]).toBeGreaterThan(15);
    expect(concession.pos[2] + 1.7).toBeLessThan(14.48);
    const cinemaVending = cinema.interactables.find((item) => item.id === 'cine-vend')!;
    expect(cinemaVending.pos[2] + 0.45).toBeLessThan(concession.pos[2] - 1.7);
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
    for (const x of rearTransition.x) {
      for (let step = 0; step < rearTransition.steps; step++) {
        const z = rearTransition.frontZ + (step + 0.5) * rearTransition.stepDepth;
        expect(floorHeightAt(cinema, x, z)).toBeCloseTo(
          (rearTransition.steps - step) * rearTransition.stepRise,
          6,
        );
      }
      expect(floorHeightAt(
        cinema,
        x,
        rearTransition.frontZ + rearTransition.steps * rearTransition.stepDepth + 0.05,
      )).toBe(0);
    }
  });

  it('电竞观战馆扩建为 42 × 34 米赛事空间，保留 8 个机位和共享大屏', () => {
    const arena = LAYOUTS[SPACE.NETCAFE];
    expect(arena.bounds).toEqual(ARENA_SPATIAL_CONTRACT.bounds);
    expect(arena.mediaPolicy).toBe('everyone');
    expect(arena.props.filter((p) => p.type === 'nc_station')).toHaveLength(8);
    expect(arena.props.filter((p) => p.type === 'arena_staff_desk')).toHaveLength(1);
    expect(arena.props.filter((p) => p.type === 'arena_service_bar')).toHaveLength(1);
    expect(arena.props
      .filter((p) => ['arena_staff_desk', 'arena_service_bar'].includes(p.type))
      .every((p) => Math.abs(p.pos[0]) > 10.5 && p.pos[2] > 2.5)).toBe(true);
    expect(arena.interactables.filter((i) => /^nc-s\d+$/.test(i.id))).toHaveLength(8);
    const arenaScreen = arena.interactables.find((i) => i.id === ARENA_SPATIAL_CONTRACT.screen.id)!;
    expect(arenaScreen.kind).toBe('screen');
    expect(arenaScreen.pos).toEqual(ARENA_SPATIAL_CONTRACT.screen.position);
    expect(arenaScreen.data).toMatchObject({
      width: ARENA_SPATIAL_CONTRACT.screen.width,
      height: ARENA_SPATIAL_CONTRACT.screen.height,
    });
    const standAisles = ARENA_SPATIAL_CONTRACT.sideStandAisles;
    expect(arena.heightZones).toHaveLength(12 + standAisles.x.length * standAisles.rows);

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
    for (const side of standAisles.x) {
      for (let row = 0; row < standAisles.rows; row++) {
        expect(floorHeightAt(
          arena,
          side * (standAisles.firstCenterX + row * standAisles.rowSpacing),
          standAisles.centerZ,
        )).toBeCloseTo(standAisles.firstRise + row * standAisles.rowRise, 6);
      }
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
    expect(club.props.find((p) => p.type === 'club_storage')?.data).toMatchObject({
      zone: 'entry', usage: 'shoes-coats-personal-items',
    });
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

  it('三个场馆的大型实体为第三人称镜头声明真实高度', () => {
    for (const key of [SPACE.CINEMA, SPACE.NETCAFE, SPACE.GAMEROOM]) {
      const boxes = LAYOUTS[key].colliders.filter((collider) => collider.kind === 'box');
      expect(boxes.length, key).toBeGreaterThan(0);
      for (const collider of boxes) {
        expect(collider.cameraHeight, `${key} ${JSON.stringify(collider)}`).toBeTypeOf('number');
        expect(collider.cameraHeight, `${key} ${JSON.stringify(collider)}`).toBeGreaterThan(0);
      }
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

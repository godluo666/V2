import { describe, it, expect } from 'vitest';
import {
  ALLEY_W, CITY_BOUNDS, ROAD_W, ROADS, BUILDINGS, VENUES, streetCenterZ, streetHeight,
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

describe('月汐町·结缘坂坐标契约', () => {
  it('是一条 84×36 米、视野开阔但仍保持人尺度的窄弯坡地生活街', () => {
    expect(city.label).toBe('月汐町·结缘坂');
    expect(city.bounds).toEqual(CITY_BOUNDS);
    expect(city.bounds.maxX - city.bounds.minX).toBe(84);
    expect(city.bounds.maxZ - city.bounds.minZ).toBe(36);
    expect(ROAD_W).toBe(5.2);
    expect(ALLEY_W).toBe(3);
    expect(ROADS).toHaveLength(2);
    expect(ROADS[0]).toMatchObject({ w: 84, d: ROAD_W });
    expect(ROADS[1]).toMatchObject({ x: -12.4, w: ALLEY_W });
  });

  it('旧高楼、剪影和仓库端景已全部退出地图数据', () => {
    expect(BUILDINGS).toHaveLength(21);
    expect(BUILDINGS.every((building) => (
      ['shopfront', 'apartment', 'backstreet'].includes(building.style)
      && !building.backdrop
      && building.h >= 6.6
      && building.h <= 9.5
    ))).toBe(true);
    expect(BUILDINGS.some((building) => ['tower', 'mediaTower', 'silhouette'].includes(building.style))).toBe(false);
    expect(city.hasBall).toBe(false);
    for (const building of BUILDINGS) {
      expect(building.x - building.w / 2).toBeGreaterThanOrEqual(CITY_BOUNDS.minX);
      expect(building.x + building.w / 2).toBeLessThanOrEqual(CITY_BOUNDS.maxX);
      expect(building.z - building.d / 2).toBeGreaterThanOrEqual(CITY_BOUNDS.minZ);
      expect(building.z + building.d / 2).toBeLessThanOrEqual(CITY_BOUNDS.maxZ);
      const centreDistance = Math.abs(building.z - streetCenterZ(building.x));
      expect(centreDistance - building.d / 2).toBeGreaterThanOrEqual(ROAD_W / 2 + 0.8);
      expect(city.colliders.some((collider) => (
        collider.kind === 'box'
        && collider.x === building.x
        && collider.z === building.z
        && collider.w === building.w
        && collider.d === building.d
      ))).toBe(true);
    }
  });

  it('北侧留出真实台阶巷，南侧留出树下飞行棋院落', () => {
    const north = BUILDINGS.filter((building) => building.z < streetCenterZ(building.x));
    const stairLeft = north.filter((building) => building.x < -12.4).sort((a, b) => b.x - a.x)[0];
    const stairRight = north.filter((building) => building.x > -12.4).sort((a, b) => a.x - b.x)[0];
    const stairGap = stairRight.x - stairRight.w / 2 - (stairLeft.x + stairLeft.w / 2);
    expect(stairGap).toBeGreaterThan(ALLEY_W);

    const south = BUILDINGS.filter((building) => building.z > streetCenterZ(building.x));
    const yardLeft = south.filter((building) => building.x < -2.5).sort((a, b) => b.x - a.x)[0];
    const yardRight = south.filter((building) => building.x > -2.5).sort((a, b) => a.x - b.x)[0];
    const yardGap = yardRight.x - yardRight.w / 2 - (yardLeft.x + yardLeft.w / 2);
    expect(yardGap).toBeGreaterThan(6.2);

    expect(city.interactables.some((item) => item.id === 'gr-flight' && item.kind === 'flying')).toBe(true);
    expect(city.interactables.filter((item) => item.id.startsWith('street-flight-s'))).toHaveLength(4);
    expect(city.props.some((prop) => prop.type === 'club_flying_chess')).toBe(true);
    expect(Object.values(LAYOUTS).flatMap((layout) => layout.props)
      .filter((prop) => prop.type === 'club_flying_chess')).toHaveLength(1);
    const flight = city.interactables.find((item) => item.id === 'gr-flight')!;
    expect(city.colliders.some((collider) => (
      collider.kind === 'box'
      && Math.abs(collider.x - flight.pos[0]) < 0.1
      && Math.abs(collider.z - flight.pos[2]) < 0.1
    ))).toBe(false);
  });

  it('街上严格只开放原有三个场馆入口，门和新街路线共用坐标', () => {
    expect(VENUES.map((venue) => venue.key).sort()).toEqual(['cinema', 'gameroom', 'netcafe']);
    const targets: Record<string, string> = {
      cinema: SPACE.CINEMA,
      netcafe: SPACE.NETCAFE,
      gameroom: SPACE.GAMEROOM,
    };
    const doors = city.interactables.filter((item) => item.kind === 'door');
    expect(doors).toHaveLength(3);
    for (const venue of VENUES) {
      const building = BUILDINGS.find((candidate) => candidate.venue === venue.key);
      const door = doors.find((item) => item.id === `d-${venue.key}`);
      expect(building).toBeTruthy();
      expect(door?.data?.target).toBe(targets[venue.key]);
      expect(door?.pos[0]).toBe(venue.x);
      expect(door?.pos[2]).toBe(venue.z);
      expect(venue.route.at(-1)).toEqual(venue.approach);
      expect(venue.route.every(([x]) => x >= CITY_BOUNDS.minX && x <= CITY_BOUNDS.maxX)).toBe(true);
    }
  });

  it('自行车、盆栽、树荫、长椅与电线杆都贴着弯街边缘布置', () => {
    expect(city.props.filter((prop) => prop.type === 'tree')).toHaveLength(9);
    expect(city.props.filter((prop) => prop.type === 'c_bike')).toHaveLength(8);
    expect(city.props.filter((prop) => prop.type === 'c_planter')).toHaveLength(8);
    expect(city.props.filter((prop) => prop.type === 'c_bench')).toHaveLength(4);
    expect(city.props.filter((prop) => prop.type === 'c_wires')).toHaveLength(6);

    const physicalProps = ['tree', 'c_bike', 'c_planter', 'c_bench'];
    for (const prop of city.props.filter((candidate) => physicalProps.includes(candidate.type))) {
      expect(Math.abs(prop.pos[2] - streetCenterZ(prop.pos[0])), `${prop.type}@${prop.pos}`).toBeGreaterThan(3.8);
      expect(city.colliders.some((collider) => (
        Math.hypot(collider.x - prop.pos[0], collider.z - prop.pos[2]) < 0.05
      ))).toBe(true);
    }
  });

  it('主街缓坡与十二级石阶都提供服务器可走高度', () => {
    const ramp = city.heightZones.filter((zone) => zone.kind === 'ramp');
    const steps = city.heightZones.filter((zone) => zone.kind === 'deck');
    expect(ramp).toHaveLength(1);
    expect(steps).toHaveLength(13);
    expect(city.heightZones.some((zone) => zone.kind === 'bridgeZ')).toBe(false);
    expect(floorHeightAt(city, -42, streetCenterZ(-42))).toBeCloseTo(0, 5);
    expect(floorHeightAt(city, 0, streetCenterZ(0))).toBeCloseTo(1.4, 5);
    expect(floorHeightAt(city, 42, streetCenterZ(42))).toBeCloseTo(2.8, 5);
    const stairSteps = steps.filter((step) => step.maxX - step.minX < 3);
    expect(stairSteps).toHaveLength(12);
    stairSteps.forEach((step, index) => {
      expect(step.y).toBeCloseTo(streetHeight(-12.4) + index * 0.18, 5);
      expect(floorHeightAt(city, -12.4, (step.minZ + step.maxZ) / 2)).toBeCloseTo(step.y, 5);
    });
    const topStep = stairSteps.at(-1)!;
    expect(topStep.maxZ - topStep.minZ).toBeCloseTo(1.08, 5);
    expect(floorHeightAt(city, -12.4, topStep.minZ + 0.03)).toBeCloseTo(topStep.y, 5);
    const flight = city.interactables.find((item) => item.id === 'gr-flight')!;
    expect(floorHeightAt(city, flight.pos[0], flight.pos[2])).toBeCloseTo(flight.pos[1] - 0.14, 5);
  });

  it('店前、石阶和树下棋摊都有可抵达的生活角色与对话停留点', () => {
    expect(city.npcs.map((npc) => npc.dialogueId).sort()).toEqual([
      'flight_regular', 'florist', 'greeter', 'stairwatcher', 'walker',
    ]);
    expect(new Set(city.npcs.map((npc) => npc.id)).size).toBe(city.npcs.length);
    for (const npc of city.npcs) {
      expect(npc.id).toBeLessThan(0);
      expect(npc.waypoints.length).toBeGreaterThan(0);
      for (const [x, z] of npc.waypoints) {
        expect(x).toBeGreaterThanOrEqual(CITY_BOUNDS.minX);
        expect(x).toBeLessThanOrEqual(CITY_BOUNDS.maxX);
        expect(z).toBeGreaterThanOrEqual(CITY_BOUNDS.minZ);
        expect(z).toBeLessThanOrEqual(CITY_BOUNDS.maxZ);
        const [resolvedX, resolvedZ] = resolveCollisions(x, z, 0.28, city.colliders);
        expect(Math.hypot(resolvedX - x, resolvedZ - z), `${npc.name}@${x},${z}`).toBeLessThan(0.08);
      }
    }
  });

  it('留言板、售货机、长椅和树下棋局都留有真实无碰撞操作站位', () => {
    const pauseKinds = new Set(['board', 'vending', 'seat', 'flying']);
    const pausePoints = city.interactables.filter((item) => pauseKinds.has(item.kind));
    expect(pausePoints.length).toBeGreaterThanOrEqual(12);
    for (const item of pausePoints) {
      const hasFreeApproach = [1.35, 1.7, 2.05].some((radius) => (
        Array.from({ length: 24 }, (_, index) => index * Math.PI * 2 / 24).some((angle) => {
          const x = item.pos[0] + Math.cos(angle) * radius;
          const z = item.pos[2] + Math.sin(angle) * radius;
          if (x < city.bounds.minX || x > city.bounds.maxX || z < city.bounds.minZ || z > city.bounds.maxZ) return false;
          const resolved = resolveCollisions(x, z, 0.34, city.colliders);
          return Math.hypot(resolved[0] - x, resolved[1] - z) < 0.01
            && Math.hypot(x - item.pos[0], z - item.pos[2]) <= 2.1;
        })
      ));
      expect(hasFreeApproach, `${item.kind}:${item.id}`).toBe(true);
    }
  });
});

describe('结缘坂可走性', () => {
  it('从西口沿窄弯坡主街可连续走到东口，新增生活设施没有封死视线与通行带', () => {
    const throughRoute: Array<[number, number]> = Array.from(
      { length: 22 },
      (_, index) => {
        const x = CITY_BOUNDS.minX + index * 4;
        return [x, streetCenterZ(x)];
      },
    );
    const reached = march(city, throughRoute);
    expect(near(reached, CITY_BOUNDS.maxX, streetCenterZ(CITY_BOUNDS.maxX), 0.45)).toBe(true);

    // Sample the entire centre band, not just the authored route nodes. This
    // catches an attractive prop whose collider accidentally projects into the
    // 5.2m carriageway between tests.
    for (let x = CITY_BOUNDS.minX; x <= CITY_BOUNDS.maxX; x += 1) {
      const z = streetCenterZ(x);
      const resolved = resolveCollisions(x, z, 0.34, city.colliders);
      expect(Math.hypot(resolved[0] - x, resolved[1] - z), `road centre @ x=${x}`).toBeLessThan(0.01);
    }
  });

  it('煤气瓶笼、消防箱和后院门都具有与可见实体一致的紧凑碰撞', () => {
    const physicalFixtures = [
      [26.1, streetCenterZ(26.1) - 4.72, 1.12, 0.58],
      [-28.9, streetCenterZ(-28.9) + 4.68, 0.82, 0.4],
      [24, streetCenterZ(24) + 13.08, 1.05, 0.14],
    ] as const;
    for (const [x, z, w, d] of physicalFixtures) {
      expect(city.colliders.some((collider) => (
        collider.kind === 'box'
        && collider.x === x && collider.z === z
        && collider.w === w && collider.d === d
      )), `${x},${z}`).toBe(true);
    }
  });

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

  it.each(VENUES)('出生点能沿弯街路线走到$label门前', (venue) => {
    const p = march(city, [
      [city.spawn[0], city.spawn[2]],
      ...venue.route,
    ]);
    expect(near(p, venue.approach[0], venue.approach[1])).toBe(true);
  });

  it('药房与游戏屋之间的服务小巷可以走到后院门前', () => {
    const left = BUILDINGS.find((building) => building.x === 20 && building.z > streetCenterZ(20))!;
    const right = BUILDINGS.find((building) => building.x === 28 && building.z > streetCenterZ(28))!;
    const clearWidth = right.x - right.w / 2 - (left.x + left.w / 2);
    expect(clearWidth).toBeGreaterThanOrEqual(1.3);
    const centreZ = streetCenterZ(24);
    const p = march(city, [[24, centreZ + 3.9], [24, centreZ + 12.25]]);
    expect(near(p, 24, centreZ + 12.25, 0.45)).toBe(true);
    const gate = city.colliders.find((collider) => (
      collider.kind === 'box' && collider.x === 24 && Math.abs(collider.z - (centreZ + 13.08)) < 0.01
    ));
    expect(gate).toBeDefined();
  });

  it('树下超大棋毯、四席与十二级坡梯顶端都能从主街真实走到', () => {
    const flight = city.interactables.find((item) => item.id === 'gr-flight')!;
    const flightSeats = city.interactables.filter((item) => item.id.startsWith('street-flight-s'));
    const streetEntry: [number, number] = [flight.pos[0], streetCenterZ(flight.pos[0]) + 5.75];
    for (const seat of flightSeats) {
      const sideStep: [number, number] = [
        flight.pos[0] + (seat.pos[0] >= flight.pos[0] ? 2.35 : -2.35),
        flight.pos[2] - 2.4,
      ];
      const p = march(city, [
        [city.spawn[0], city.spawn[2]],
        [-10, streetCenterZ(-10)],
        [flight.pos[0], streetCenterZ(flight.pos[0])],
        streetEntry,
        sideStep,
        [seat.pos[0], seat.pos[2]],
      ]);
      expect(near(p, seat.pos[0], seat.pos[2], 0.5), seat.id).toBe(true);
    }
    const rugCentre = march(city, [
      [city.spawn[0], city.spawn[2]],
      [flight.pos[0], streetCenterZ(flight.pos[0])],
      streetEntry,
      [flight.pos[0], flight.pos[2]],
    ]);
    expect(near(rugCentre, flight.pos[0], flight.pos[2], 0.45)).toBe(true);

    const stairX = -12.4;
    const firstStepZ = streetCenterZ(stairX) - 4.7;
    const stairRoute: Array<[number, number]> = [
      [city.spawn[0], city.spawn[2]],
      [-20, streetCenterZ(-20)],
      [stairX, streetCenterZ(stairX)],
      ...Array.from({ length: 12 }, (_, index): [number, number] => [stairX, firstStepZ - index * 0.9]),
    ];
    const stairTop = stairRoute.at(-1)!;
    const reachedTop = march(city, stairRoute);
    expect(near(reachedTop, stairTop[0], stairTop[1], 0.45)).toBe(true);
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

  it('电竞观战馆是四面看台包围中央 4v4 赛台，并为每位共享者提供导播大屏', () => {
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
    const stations = arena.props.filter((p) => p.type === 'nc_station');
    expect(stations.filter((station) => station.pos[2] === ARENA_SPATIAL_CONTRACT.stations.rowZ[0]))
      .toHaveLength(4);
    expect(stations.filter((station) => station.pos[2] === ARENA_SPATIAL_CONTRACT.stations.rowZ[1]))
      .toHaveLength(4);
    expect([...new Set(stations.map((station) => station.pos[0]))].sort((a, b) => a - b))
      .toEqual([...ARENA_SPATIAL_CONTRACT.stations.x]);
    expect(ARENA_SPATIAL_CONTRACT.stations.rowZ[0] + ARENA_SPATIAL_CONTRACT.stations.rowZ[1]).toBe(0);
    expect(ARENA_SPATIAL_CONTRACT.overheadBroadcast.visibleSlots).toBe(8);
    expect(ARENA_SPATIAL_CONTRACT.overheadBroadcast.panelsPerFace).toBe(2);
    expect(ARENA_SPATIAL_CONTRACT.endStands.z).toEqual([-1, 1]);
    expect(ARENA_SPATIAL_CONTRACT.endStands.rows).toBe(4);
    const arenaScreen = arena.interactables.find((i) => i.id === ARENA_SPATIAL_CONTRACT.screen.id)!;
    expect(arenaScreen.kind).toBe('screen');
    expect(arenaScreen.pos).toEqual(ARENA_SPATIAL_CONTRACT.screen.position);
    expect(arenaScreen.data).toMatchObject({
      width: ARENA_SPATIAL_CONTRACT.screen.width,
      height: ARENA_SPATIAL_CONTRACT.screen.height,
    });
    const standAisles = ARENA_SPATIAL_CONTRACT.sideStandAisles;
    expect(arena.heightZones).toHaveLength(3 + 6 + standAisles.x.length * standAisles.rows);

    // 中央主舞台三层完成面和南北双向登台踏步必须与客户端几何一致。
    expect(floorHeightAt(arena, 0, 0)).toBeCloseTo(0.6, 6);
    expect(floorHeightAt(arena, 0, 4.45)).toBeCloseTo(0.55, 6);
    expect(floorHeightAt(arena, 0, 4.85)).toBeCloseTo(0.4, 6);
    expect(floorHeightAt(arena, 0, 5.4)).toBeCloseTo(0.24, 6);
    expect(floorHeightAt(arena, 0, -5.4)).toBeCloseTo(0.24, 6);
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
    for (const end of ARENA_SPATIAL_CONTRACT.endStands.z) {
      const z = end * 13;
      expect(resolveCollisions(-10.65, z, 0.34, arena.colliders)).not.toEqual([-10.65, z]);
      expect(resolveCollisions(0, z, 0.34, arena.colliders)).toEqual([0, z]);
    }

    // 主屏背壳有碰撞，但北看台中轴仍保留一条真实可走的检修通道；
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

  it('团子轰趴馆保留室内象棋，并且不再重复摆放飞行棋', () => {
    const club = LAYOUTS[SPACE.GAMEROOM];
    expect(club.bounds).toEqual({ minX: -12, maxX: 12, minZ: -9, maxZ: 9 });
    expect(club.interactables.filter((i) => i.kind === 'riichi')).toHaveLength(0);
    expect(club.interactables.find((i) => i.id === 'gr-xq')?.kind).toBe('xiangqi');
    expect(club.interactables.filter((i) => i.kind === 'flying' || i.id.startsWith('gr-flight'))).toHaveLength(0);
    expect(club.interactables.filter((i) => i.id.startsWith('gr-craft-s'))).toHaveLength(2);
    expect(club.props.filter((p) => p.type === 'club_sofa')).toHaveLength(2);
    expect(club.props.find((p) => p.type === 'club_storage')?.data).toMatchObject({
      zone: 'entry', usage: 'shoes-coats-personal-items',
    });
    for (const prop of [
      'club_rug',
      'club_stage',
      'club_craft_table',
      'club_trophy_wall',
      'club_storage',
      'club_reading_nook',
    ]) {
      expect(club.props.some((p) => p.type === prop), prop).toBe(true);
    }
    expect(club.props.some((p) => p.type === 'club_flying_chess')).toBe(false);
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

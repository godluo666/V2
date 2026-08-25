/**
 * Static world layouts, shared verbatim by server (interaction validation,
 * collision, NPC routes) and client (rendering). Personal rooms are dynamic
 * and stored in the database; only their shell is defined here.
 *
 * 户外图 = 「月汐町·晴日生活街」(docs/art-direction.md §4):布局数据全部来自
 * shared/src/cityplan.ts,本文件只负责把它翻译成碰撞/交互/道具/高度区。
 */
import type { Bounds, Collider } from './math';
import type { AvatarConfig } from './types';
import { SPACE } from './constants';
import {
  BUILDINGS, CITY_BOUNDS, VENUES, cityBuildingLocalSize, streetCenterZ, streetHeight,
} from './cityplan';
import { ARENA_SPATIAL_CONTRACT, CINEMA_SPATIAL_CONTRACT } from './venueSpatialContracts';

export type InteractKind =
  | 'seat' | 'door' | 'switch' | 'board' | 'whiteboard' | 'screen' | 'jukebox'
  | 'ttt' | 'lightsout' | 'vending' | 'kiosk' | 'bookshelf' | 'elevator'
  | 'xiangqi' | 'mahjong' | 'riichi' | 'flying';

export interface Interactable {
  id: string;
  kind: InteractKind;
  pos: [number, number, number];
  ry: number;
  label: string;
  data?: Record<string, unknown>;
}

export interface Prop {
  type: string;
  pos: [number, number, number];
  ry: number;
  /** Prefab-specific extra (variant index, size, color...). */
  data?: Record<string, unknown>;
}

export interface NpcDef {
  id: number; // negative, globally unique
  name: string;
  avatar: AvatarConfig;
  /** [x, z] waypoints walked in a loop; single waypoint = stationary. */
  waypoints: [number, number][];
  speed: number;
  /** Seconds paused at each waypoint. */
  pause: number;
  dialogueId: string;
}

interface HeightZoneBase { minX: number; maxX: number; minZ: number; maxZ: number }
/** 高度区:bridgeZ = 抛物线小桥(沿 z);ramp = 线性坡道;deck = 平台。 */
export type HeightZone =
  | (HeightZoneBase & { kind: 'bridgeZ'; cx: number; half: number; peak: number })
  | (HeightZoneBase & { kind: 'ramp'; dir: 'n' | 's' | 'e' | 'w'; y: number })
  | (HeightZoneBase & { kind: 'deck'; y: number });

export interface SpaceLayout {
  key: string;
  label: string;
  indoor: boolean;
  bounds: Bounds;
  spawn: [number, number, number, number];
  colliders: Collider[];
  interactables: Interactable[];
  props: Prop[];
  npcs: NpcDef[];
  heightZones: HeightZone[];
  /** Space has a synchronized media screen; policy 'everyone' | 'none'. */
  mediaPolicy?: 'everyone' | 'none';
  hasBall?: boolean;
}

// Dango NPCs: blush = blush tint, sprout = top sprout, body = body color,
// scarf = scarf color (see client Avatar.tsx for the field mapping).
const npcAvatar = (blush: string, sprout: string, body: string, scarf: string, hat = 0, hatColor = '#333333', hairStyle = 0): AvatarConfig => ({
  skin: blush, hair: sprout, shirt: body, pants: scarf, shoes: '#8a7a6f', hat, hatColor, glasses: false, hairStyle,
});

// ── Layout builder helper ───────────────────────────────────────────────────
class B {
  colliders: Collider[] = [];
  interactables: Interactable[] = [];
  props: Prop[] = [];
  npcs: NpcDef[] = [];
  heightZones: HeightZone[] = [];

  box(x: number, z: number, w: number, d: number, cameraHeight?: number) {
    this.colliders.push({ kind: 'box', x, z, w, d, cameraHeight }); return this;
  }
  circle(x: number, z: number, r: number, cameraHeight?: number) {
    this.colliders.push({ kind: 'circle', x, z, r, cameraHeight }); return this;
  }
  prop(type: string, x: number, y: number, z: number, ry = 0, data?: Record<string, unknown>) {
    this.props.push({ type, pos: [x, y, z], ry, data }); return this;
  }
  inter(id: string, kind: InteractKind, x: number, y: number, z: number, ry: number, label: string, data?: Record<string, unknown>) {
    this.interactables.push({ id, kind, pos: [x, y, z], ry, label, data }); return this;
  }
  /** Street bench: prop + 2 seats + collider. Bench faces +Z at ry=0. */
  bench(id: string, x: number, z: number, ry: number, type = 'c_bench', y = 0) {
    this.prop(type, x, y, z, ry);
    const cos = Math.cos(ry), sin = Math.sin(ry);
    for (let i = 0; i < 2; i++) {
      const lx = i === 0 ? -0.55 : 0.55;
      this.inter(`${id}-s${i}`, 'seat', x + lx * cos, y + 0.46, z - lx * sin, ry, '坐下');
    }
    this.box(x, z, Math.abs(cos) * 1.9 + Math.abs(sin) * 0.65, Math.abs(sin) * 1.9 + Math.abs(cos) * 0.65);
    return this;
  }
  /** Café-style round table with N chairs around it. */
  tableRound(id: string, x: number, z: number, chairs: number, r = 0.85) {
    this.prop('table_round', x, 0, z);
    this.circle(x, z, 0.5);
    for (let i = 0; i < chairs; i++) {
      const a = (i / chairs) * Math.PI * 2 + 0.4;
      const cx = x + Math.sin(a) * r;
      const cz = z + Math.cos(a) * r;
      const ry = Math.atan2(x - cx, z - cz);
      this.prop('chair', cx, 0, cz, ry);
      this.inter(`${id}-c${i}`, 'seat', cx, 0.47, cz, ry, '坐下');
    }
    return this;
  }
  /** 街灯:视觉 prop + 小圆碰撞(渲染归 P3)。 */
  lamp(x: number, z: number) { this.prop('c_lamp', x, 0, z); this.circle(x, z, 0.22, 4.8); return this; }
}

/** Safe fallback used by archived rooms that no longer have a public façade. */
/** 从生活主街西段进入；出生镜头沿街看向连续店面而不是正对大路口。 */
const STREET_SPAWN: [number, number, number, number] = [-38, streetHeight(-38) + 0.08, streetCenterZ(-38), Math.PI / 2];

function streetReturnFor(key: (typeof VENUES)[number]['key']): [number, number, number, number] {
  const venue = VENUES.find((candidate) => candidate.key === key);
  if (!venue) return STREET_SPAWN;
  return [venue.approach[0], streetHeight(venue.approach[0]), venue.approach[1], venue.ry + Math.PI];
}

// ═══════════════════════ 月汐町·结缘坂（户外） ═══════════════════════════════
function cozyStreetHeight(x: number): number {
  return streetHeight(x);
}

function cozyStreetZ(x: number): number {
  return streetCenterZ(x);
}

function buildCity(): SpaceLayout {
  const b = new B();
  const bounds: Bounds = { ...CITY_BOUNDS };

  // Detailed two- and three-storey street walls follow the long S bend. The
  // south row intentionally opens around x=-2 for the tree-shaded game stall.
  for (const building of BUILDINGS) {
    const { frontage, depth } = cityBuildingLocalSize(building);
    b.box(building.x, building.z, frontage, depth, building.h);
  }

  for (const venue of VENUES) {
    b.inter(
      `d-${venue.key}`, 'door', venue.x, cozyStreetHeight(venue.x), venue.z,
      venue.ry, `进入${venue.label}`, { target: venue.key },
    );
  }

  // The only flying-chess board in the world is this outdoor street stall.
  // Its five-metre cloth is intentionally collider-free so avatars can walk
  // onto the physical circuit and operate the die and pieces at close range.
  const flightX = -2.5, flightZ = cozyStreetZ(flightX) + 9.25, flightY = cozyStreetHeight(flightX);
  const flightSurfaceY = flightY + 0.055;
  b.prop('club_flying_chess', flightX, flightSurfaceY, flightZ, -0.06);
  b.inter('gr-flight', 'flying', flightX, flightSurfaceY + 0.14, flightZ, 0, '走上超大棋毯玩飞行棋');
  for (const [x, z, ry, colour] of [
    [flightX, flightZ - 2.8, Math.PI, 0], [flightX + 2.8, flightZ, -Math.PI / 2, 1],
    [flightX, flightZ + 2.8, 0, 2], [flightX - 2.8, flightZ, Math.PI / 2, 3],
  ] as const) {
    b.prop('chair', x, flightSurfaceY, z, ry, { style: 'floor', accent: colour });
    b.inter(`street-flight-s${colour}`, 'seat', x, flightSurfaceY + 0.3, z, ry, '围坐飞行棋');
  }

  // Everyday interaction pockets: board by the grocery, vending machine by
  // the laundry, and two shaded benches away from the moving lane.
  b.inter('city-board', 'board', -35.5, cozyStreetHeight(-35.5), cozyStreetZ(-35.5) + 4.55, Math.PI, '结缘坂留言板', {});
  b.box(-35.5, cozyStreetZ(-35.5) + 4.55, 1.55, 0.42, 2.2);
  b.inter('v-vend1', 'vending', 15.0, cozyStreetHeight(15), cozyStreetZ(15) - 4.55, 0, '橘子汽水机', { items: ['soda', 'pizza'] });
  b.box(15.0, cozyStreetZ(15) - 4.55, 0.8, 0.8, 1.95);
  b.inter('v-vend2', 'vending', 29.5, cozyStreetHeight(29.5), cozyStreetZ(29.5) + 4.5, Math.PI, '牛奶与咖啡机', { items: ['soda'] });
  b.box(29.5, cozyStreetZ(29.5) + 4.5, 0.8, 0.8, 1.95);
  b.bench('sb0', -29.5, cozyStreetZ(-29.5) + 4.45, Math.PI, 'c_bench', cozyStreetHeight(-29.5));
  b.bench('sb1', 3.8, cozyStreetZ(3.8) - 4.45, 0, 'c_bench', cozyStreetHeight(3.8));
  b.bench('sb2', 25.5, cozyStreetZ(25.5) + 4.45, Math.PI, 'c_bench', cozyStreetHeight(25.5));
  b.bench('sb3', 37.5, cozyStreetZ(37.5) - 4.45, 0, 'c_bench', cozyStreetHeight(37.5));

  // Dense but human-scale shade, bikes, pots, tiny signs and utility poles.
  for (const [x, z, variant, scale] of [
    [-40, cozyStreetZ(-40) - 4.55, 0, 1.08], [-31, cozyStreetZ(-31) + 4.6, 1, 1.12],
    [-20.5, cozyStreetZ(-20.5) - 4.55, 2, 1.04], [-12.3, cozyStreetZ(-12.3) + 4.7, 0, 1.1],
    [-2.7, flightZ + 3.25, 2, 1.3], [7.4, cozyStreetZ(7.4) + 4.55, 1, 1.02],
    [18.5, cozyStreetZ(18.5) - 4.55, 0, 1.08], [30.5, cozyStreetZ(30.5) - 4.6, 2, 1.14],
    [40.5, cozyStreetZ(40.5) + 4.5, 1, 1.16],
  ] as const) {
    b.prop('tree', x, cozyStreetHeight(x), z, 0, { variant, scale });
    b.circle(x, z, 0.42, 4.8 * scale);
  }
  for (const [x, z, ry] of [
    [-37, cozyStreetZ(-37) - 4.4, 0.2], [-27, cozyStreetZ(-27) + 4.45, 2.8],
    [-16.2, cozyStreetZ(-16.2) - 4.4, 0.15], [-7.0, cozyStreetZ(-7) + 4.42, 2.9],
    [5.5, cozyStreetZ(5.5) - 4.4, 0.3], [14, cozyStreetZ(14) + 4.4, 2.7],
    [25, cozyStreetZ(25) - 4.42, 0.2], [35.5, cozyStreetZ(35.5) + 4.4, 2.8],
  ] as const) {
    b.prop('c_bike', x, cozyStreetHeight(x), z, ry); b.circle(x, z, 0.32);
  }
  for (const [x, z] of [
    [-34, cozyStreetZ(-34) - 4.45], [-23.5, cozyStreetZ(-23.5) + 4.42],
    [-15.5, cozyStreetZ(-15.5) - 4.45], [-7.4, cozyStreetZ(-7.4) + 4.42],
    [1.5, cozyStreetZ(1.5) - 4.45], [11.5, cozyStreetZ(11.5) + 4.42],
    [22.5, cozyStreetZ(22.5) - 4.45], [34, cozyStreetZ(34) + 4.42],
  ] as const) {
    b.prop('c_planter', x, cozyStreetHeight(x), z); b.box(x, z, 0.8, 0.8);
  }
  for (const [x, z] of [
    [-38, cozyStreetZ(-38) + 4.25], [-28, cozyStreetZ(-28) - 4.25],
    [-18, cozyStreetZ(-18) + 4.25], [-8, cozyStreetZ(-8) - 4.25],
    [2, cozyStreetZ(2) + 4.25], [12, cozyStreetZ(12) - 4.25],
    [22, cozyStreetZ(22) + 4.25], [32, cozyStreetZ(32) - 4.25], [40, cozyStreetZ(40) + 4.2],
  ] as const) {
    b.prop('c_lamp', x, cozyStreetHeight(x), z);
    b.circle(x, z, 0.22, 4.8);
  }
  for (const [x, z, ry] of [
    [-33, cozyStreetZ(-33) - 4.8, 0], [-19, cozyStreetZ(-19) + 4.8, Math.PI],
    [-5.5, cozyStreetZ(-5.5) - 4.8, 0], [10, cozyStreetZ(10) + 4.8, Math.PI],
    [24, cozyStreetZ(24) - 4.8, 0], [37, cozyStreetZ(37) + 4.8, Math.PI],
  ] as const) {
    b.prop('c_poster', x, cozyStreetHeight(x) + 1.35, z, ry);
  }
  for (const [x, z, ry, len] of [
    [-38, cozyStreetZ(-38) - 5.2, Math.PI / 2, 12],
    [-24, cozyStreetZ(-24) + 5.2, Math.PI / 2, 12],
    [-10, cozyStreetZ(-10) - 5.2, Math.PI / 2, 12],
    [5, cozyStreetZ(5) + 5.2, Math.PI / 2, 12],
    [20, cozyStreetZ(20) - 5.2, Math.PI / 2, 12],
    [35, cozyStreetZ(35) + 5.2, Math.PI / 2, 12],
  ] as const) {
    b.prop('c_wires', x, cozyStreetHeight(x) + 7.2, z, ry, { len, sag: 0.72, strands: 3 });
    b.circle(x, z, 0.16, 7.6);
  }

  // Building-service layer: meters, exterior lamps, bins, mirrors and utility
  // hardware sit at real facade/curb heights instead of being painted details.
  for (const [x, side, ry] of [
    [-34.8, 1, Math.PI], [-21.4, -1, 0], [-14.9, 1, Math.PI], [-7.9, -1, 0],
    [5.7, 1, Math.PI], [13.5, -1, 0], [26.3, 1, Math.PI], [35.2, -1, 0],
  ] as const) {
    b.prop('c_service_meters', x, cozyStreetHeight(x) + 1.08, cozyStreetZ(x) + side * 5.12, ry);
  }
  for (const [x, side, ry] of [
    [-39.5, -1, 0], [-31.2, 1, Math.PI], [-24.8, -1, 0], [-17.2, 1, Math.PI],
    [-6.2, -1, 0], [0.8, -1, 0], [8.5, -1, 0], [16.1, -1, 0],
    [20.5, 1, Math.PI], [28.4, 1, Math.PI], [36.8, 1, Math.PI],
  ] as const) {
    b.prop('c_wall_light', x, cozyStreetHeight(x) + 2.65, cozyStreetZ(x) + side * 5.05, ry);
  }
  for (const [x, side, ry, type] of [
    [-37, 1, Math.PI, 'c_trash'], [-22.8, -1, 0, 'c_recycling_station'],
    [-8.6, 1, Math.PI, 'c_trash'], [14.5, -1, 0, 'c_recycling_station'],
    [27.2, 1, Math.PI, 'c_trash'], [39, -1, 0, 'c_trash'],
  ] as const) {
    const z = cozyStreetZ(x) + side * 4.62;
    b.prop(type, x, cozyStreetHeight(x), z, ry, { crow: false });
    b.box(x, z, type === 'c_recycling_station' ? 1.1 : 0.65, 0.65, 1.25);
  }
  for (const [x, side, ry] of [
    [-14.2, -1, 0], [3.2, 1, Math.PI], [23.8, -1, 0], [38.7, 1, Math.PI],
  ] as const) {
    const z = cozyStreetZ(x) + side * 4.15;
    b.prop('c_convex_mirror', x, cozyStreetHeight(x), z, ry);
    b.circle(x, z, 0.16, 2.7);
  }
  for (const [x, side] of [[-40.3, 1], [-13.8, -1], [9.5, 1], [33.2, -1]] as const) {
    b.prop('c_reflector_post', x, cozyStreetHeight(x), cozyStreetZ(x) + side * 3.95, side > 0 ? Math.PI : 0);
  }
  for (const [x, side, ry] of [
    [-27.8, -1, 0], [-4.8, 1, Math.PI], [18.2, -1, 0], [32, 1, Math.PI],
  ] as const) {
    b.prop('c_ac', x, cozyStreetHeight(x) + 1.05, cozyStreetZ(x) + side * 5.05, ry);
  }
  for (const [x, side, ry] of [
    [-35, -1, 0], [-18, 1, Math.PI], [1, -1, 0], [21, 1, Math.PI], [38, -1, 0],
  ] as const) {
    b.prop('c_drain', x, cozyStreetHeight(x) + 0.07, cozyStreetZ(x) + side * 2.78, ry);
  }
  for (const [x, offset] of [[-26, -0.7], [-8, 0.65], [11, -0.6], [30, 0.7]] as const) {
    b.prop('c_manhole', x, cozyStreetHeight(x) + 0.03, cozyStreetZ(x) + offset);
  }

  // Code-native foreground architecture in CozyResidentialStreet is also
  // authoritative physical space. These compact colliders keep players from
  // walking through visible courtyard walls, closed residential gates, shop
  // crates or the parked delivery scooter.
  b.box(flightX - 3.22, flightZ + 0.8, 0.28, 4.75, 1.0);
  b.box(flightX + 3.22, flightZ + 0.8, 0.28, 4.75, 1.0);
  b.box(flightX, flightZ + 3.18, 6.7, 0.32, 1.0);
  for (const [x, side] of [[-32.8, -1], [23.1, -1], [4.2, 1], [36.3, 1]] as const) {
    const z = cozyStreetZ(x) + side * 4.55;
    b.box(x - 1.05, z + side * 0.28, 0.92, 0.28, 0.95);
    b.box(x + 1.05, z + side * 0.28, 0.92, 0.28, 0.95);
    b.box(x, z + side * 0.25, 1.02, 0.12, 1.35);
  }
  b.box(16.8, cozyStreetZ(16.8) - 3.95, 1.6, 0.58, 1.45);
  // The visible LPG cage and neighbourhood fire cabinet are physical street
  // furniture. Their compact footprints preserve the clear sidewalk band.
  b.box(26.1, cozyStreetZ(26.1) - 4.72, 1.12, 0.58, 1.5);
  b.box(-28.9, cozyStreetZ(-28.9) + 4.68, 0.82, 0.4, 1.6);
  for (const [x, side] of [[-18.1, -1], [-9.1, 1], [32.3, -1]] as const) {
    b.box(x, cozyStreetZ(x) + side * 4.62, 1.9, 0.66, 0.9);
  }
  b.box(24, cozyStreetZ(24) + 13.08, 1.05, 0.14, 2.05);

  // The borrowed yard is a level 5.5cm slab laid over the street slope. Its
  // visual top, props, seat snaps and authoritative feet share one height.
  b.heightZones.push({
    minX: flightX - 3.05, maxX: flightX + 3.05,
    minZ: flightZ - 3.0, maxZ: flightZ + 3.0,
    kind: 'deck', y: flightSurfaceY,
  });

  // Twelve shallow stone steps climb north between retaining walls. Step zones
  // precede the broad street ramp so this small branch has real walkable height.
  const stairX = -12.4;
  const stairBase = cozyStreetHeight(stairX);
  const stairStartZ = cozyStreetZ(stairX) - 4.25;
  for (let step = 0; step < 12; step += 1) {
    const maxZ = stairStartZ - step * 0.9;
    b.heightZones.push({
      minX: stairX - 1.28, maxX: stairX + 1.28,
      // The final tread includes the small landing up to the closed gate.
      minZ: maxZ - (step === 11 ? 1.08 : 0.9), maxZ,
      kind: 'deck', y: stairBase + step * 0.18,
    });
  }
  const stairWallZ = stairStartZ - 5.25;
  b.box(stairX - 1.62, stairWallZ, 0.3, 11.5, 2.2);
  b.box(stairX + 1.62, stairWallZ, 0.3, 11.5, 2.2);
  b.box(stairX, cozyStreetZ(stairX) - 15.35, 2.35, 0.28, 2.2);
  b.heightZones.push({ ...CITY_BOUNDS, kind: 'ramp', dir: 'w', y: 2.8 });

  const npcs: NpcDef[] = [
    {
      id: -1, name: 'Momo', dialogueId: 'greeter', speed: 0.65, pause: 7,
      avatar: npcAvatar('#df8a78', '#705341', '#f0b7a8', '#554032', 1, '#65523d', 0),
      waypoints: [[-35, cozyStreetZ(-35) + 3.95], [-32.8, cozyStreetZ(-32.8) + 4.0]],
    },
    {
      id: -2, name: 'Sora', dialogueId: 'walker', speed: 0.82, pause: 3.5,
      avatar: npcAvatar('#7596a3', '#4b5352', '#d6b49b', '#3d4140', 3, '#66735d', 2),
      waypoints: [
        [-29, cozyStreetZ(-29)], [-18, cozyStreetZ(-18)], [-6, cozyStreetZ(-6)],
        [7, cozyStreetZ(7)], [19, cozyStreetZ(19)], [31, cozyStreetZ(31)],
        [20, cozyStreetZ(20)], [5, cozyStreetZ(5)], [-12, cozyStreetZ(-12)],
      ],
    },
    {
      id: -3, name: 'Hana', dialogueId: 'florist', speed: 0.42, pause: 8,
      avatar: npcAvatar('#a78273', '#65705d', '#e0bda4', '#574c43', 2, '#806c58', 1),
      waypoints: [
        [-7.2, cozyStreetZ(-7.2) - 4.02], [-5.6, cozyStreetZ(-5.6) - 4.05],
      ],
    },
    {
      id: -4, name: 'Yui', dialogueId: 'stairwatcher', speed: 0.5, pause: 6,
      avatar: npcAvatar('#7e8797', '#61594f', '#d9b59d', '#4d463f', 0, '#706b58', 3),
      waypoints: [
        [stairX, stairStartZ - 1.2], [stairX, stairStartZ - 4.8], [stairX, stairStartZ - 8.6],
      ],
    },
    {
      id: -5, name: 'Ren', dialogueId: 'flight_regular', speed: 0.36, pause: 9,
      avatar: npcAvatar('#70918a', '#69594c', '#d6af94', '#4b443e', 3, '#8b7458', 2),
      waypoints: [
        [flightX - 2.45, flightZ - 0.7], [flightX - 2.2, flightZ + 1.1],
      ],
    },
  ];

  return {
    key: SPACE.PLAZA, label: '月汐町·结缘坂', indoor: false, bounds,
    spawn: STREET_SPAWN,
    colliders: b.colliders, interactables: b.interactables, props: b.props,
    npcs, heightZones: b.heightZones, hasBall: false,
  };
}

// ═════════════════════════════ CAFÉ ═════════════════════════════════════════
function buildCafe(): SpaceLayout {
  const b = new B();
  const bounds: Bounds = { minX: -9, maxX: 9, minZ: -7, maxZ: 7 };

  b.inter('cafe-exit', 'door', 0, 0, 6.7, 0, '返回一番街', { target: SPACE.PLAZA, spawn: STREET_SPAWN });
  b.inter('cafe-lights', 'switch', 1.7, 1.2, 6.85, 0, '电灯开关', { switchId: 'cafe-lights' });

  // Counter along north wall
  b.prop('cafe_counter', 0, 0, -5.6);
  b.box(0, -5.6, 6.4, 1.1);
  // Espresso machine + pastry display are part of the counter prefab.

  // Round tables
  b.tableRound('ct0', -5.1, -1.5, 3, 1.0);
  b.tableRound('ct1', 5.1, -1.5, 3, 1.0);

  // 棋牌角:象棋桌(西)+ 福州麻将桌(东)
  b.inter('cafe-xq', 'xiangqi', -4.7, 0, 3.8, 0, '象棋桌');
  b.box(-4.7, 3.8, 1.0, 1.0);
  for (const [sx, sry, i] of [[-1.05, Math.PI / 2, 0], [1.05, -Math.PI / 2, 1]] as const) {
    b.prop('chair', -4.7 + sx, 0, 3.8, sry);
    b.inter(`cafe-xq-s${i}`, 'seat', -4.7 + sx, 0.47, 3.8, sry, '坐下');
  }
  b.inter('cafe-mj', 'mahjong', 4.7, 0, 3.8, 0, '福州麻将桌');
  b.box(4.7, 3.8, 1.15, 1.15);
  const mjSeats: Array<[number, number, number]> = [
    [0, 1.1, Math.PI],      // 南(面向北)
    [1.1, 0, -Math.PI / 2], // 东
    [0, -1.1, 0],           // 北
    [-1.1, 0, Math.PI / 2], // 西
  ];
  mjSeats.forEach(([ox, oz, sry], i) => {
    b.prop('chair', 4.7 + ox, 0, 3.8 + oz, sry);
    b.inter(`cafe-mj-s${i}`, 'seat', 4.7 + ox, 0.47, 3.8 + oz, sry, '坐下');
  });

  // Sofa corner (west)
  b.prop('sofa', -8.0, 0, 0.8, Math.PI / 2);
  b.box(-8.0, 0.8, 0.95, 2.1);
  b.inter('cafe-sofa-s0', 'seat', -7.95, 0.44, 0.28, Math.PI / 2, '坐下');
  b.inter('cafe-sofa-s1', 'seat', -7.95, 0.44, 1.38, Math.PI / 2, '坐下');

  // Jukebox (west wall, north corner)
  b.inter('cafe-jukebox', 'jukebox', -8.4, 0, -3.4, Math.PI / 2, '点歌机');
  b.box(-8.4, -3.4, 0.8, 0.6);

  // Bookshelf + whiteboard (east wall)
  b.inter('cafe-books', 'bookshelf', 8.55, 0, -2.8, -Math.PI / 2, '书架');
  b.box(8.55, -2.8, 0.45, 1.3);
  b.inter('cafe-wb', 'whiteboard', 8.8, 1.5, 1.8, -Math.PI / 2, '今日推荐板', { boardId: 'cafe-wb' });

  // Fireplace south-west
  b.prop('fireplace', -5.4, 0, 6.75, Math.PI);
  b.box(-5.4, 6.7, 1.5, 0.5);

  b.prop('window', -9, 1.5, 2.5, Math.PI / 2, { w: 2.4 });
  b.prop('plant', 8.2, 0, 5.7); b.circle(8.2, 5.7, 0.3);
  b.prop('plant', -2.8, 0, 6.3); b.circle(-2.8, 6.3, 0.3);

  const npcs: NpcDef[] = [{
    id: -3, name: 'Bea', dialogueId: 'barista', speed: 0.8, pause: 4,
    avatar: npcAvatar('#e88ba0', '#8c3b24', '#f3c3cc', '#7a2e1f', 2, '#7a2e1f', 1),
    waypoints: [[-1.6, -6.3], [1.6, -6.3]],
  }];

  return {
    key: SPACE.CAFE, label: '研磨咖啡馆', indoor: true, bounds,
    spawn: [0, 0, 5.2, Math.PI],
    colliders: b.colliders, interactables: b.interactables, props: b.props,
    npcs, heightZones: [],
  };
}

// ═════════════════════════════ CINEMA ═══════════════════════════════════════
function buildCinema(): SpaceLayout {
  // 34×30m 高规格巨幕厅：银幕前墙、双侧过道、六级阶梯观众席和后部集散区。
  // 业务 ID 沿用 cine-*，但旧 30×24 平面不再作为布局约束。
  const b = new B();
  const bounds: Bounds = { ...CINEMA_SPATIAL_CONTRACT.bounds };

  const [exitX, exitY, exitZ] = CINEMA_SPATIAL_CONTRACT.exit.position;
  b.inter('cine-exit', 'door', exitX, exitY, exitZ, 0, '返回一番街', {
    target: SPACE.PLAZA, spawn: streetReturnFor('cinema'),
  });
  const cinemaScreen = CINEMA_SPATIAL_CONTRACT.screen;
  b.inter(
    cinemaScreen.id,
    'screen',
    ...cinemaScreen.position,
    0,
    '极光巨幕',
    { width: cinemaScreen.width, height: cinemaScreen.height },
  );

  // Architectural collision follows cinemaHall.tsx's actual inner faces.
  // The front wall blocks the recessed screen/proscenium, side leaves protect
  // acoustic panels and sconces, and rear returns preserve the 7.1m exit bay.
  b.box(0, -14.28, 30.4, 1.0, 13.5);
  b.box(-16.55, 0, 1.1, 29.4, 13.5);
  b.box(16.55, 0, 1.1, 29.4, 13.5);
  b.box(-10.25, 14.55, 13.4, 0.5, 10.8);
  b.box(10.25, 14.55, 13.4, 0.5, 10.8);
  b.box(-2.05, 14.43, 0.28, 0.72, 2.9);
  b.box(2.05, 14.43, 0.28, 0.72, 2.9);
  // Subwoofer cabinets project beyond the proscenium wall onto the stage.
  b.box(-14.15, -13.15, 1.75, 1.0, 2.25);
  b.box(14.15, -13.15, 1.75, 1.0, 2.25);
  // The six central low-frequency cabinets form one continuous physical bank.
  // Keep the screen approach around z=-11 clear while preventing players from
  // walking through the visible enclosures at the foot of the giant screen.
  b.box(0, -13.22, 22.12, 0.76, 1.82);

  // 六排 × 十二座，按 3-6-3 分区。双主过道中心位于 x=±6.3，和实体导视灯一致。
  const seatX = CINEMA_SPATIAL_CONTRACT.seating.x;
  let seatIdx = 0;
  for (let row = 0; row < CINEMA_SPATIAL_CONTRACT.seating.rows; row++) {
    const z = CINEMA_SPATIAL_CONTRACT.seating.firstZ + row * CINEMA_SPATIAL_CONTRACT.seating.rowSpacing;
    const lift = CINEMA_SPATIAL_CONTRACT.seating.rowRise * row;
    if (lift > 0) {
      b.prop('cinema_riser', 0, 0, z, 0, { w: 29.2, d: 2.55, h: lift, row });
      b.heightZones.push({
        minX: -14.6, maxX: 14.6, minZ: z - 1.275, maxZ: z + 1.275,
        kind: 'deck', y: lift,
      });
    }
    for (const x of seatX) {
      b.prop('cinema_seat', x, lift, z, Math.PI, { row, seatIdx });
      b.inter(`cine-s${seatIdx++}`, 'seat', x, 0.47 + lift, z, Math.PI, '坐下');
    }
    const seatBackHeight = lift + 1.12;
    b.box(-10.8, z, 4.2, 0.66, seatBackHeight);
    b.box(0, z, 7.2, 0.66, seatBackHeight);
    b.box(10.8, z, 4.2, 0.66, seatBackHeight);
  }

  // Connect the rear base-floor concourse to both 1.9m auditorium aisles with
  // five physical treads.  The stepped zones match the client boxes exactly;
  // the existing seating decks continue forward from the top tread.
  const rearTransition = CINEMA_SPATIAL_CONTRACT.rearAisleTransition;
  for (const x of rearTransition.x) {
    for (let step = 0; step < rearTransition.steps; step++) {
      const minZ = rearTransition.frontZ + step * rearTransition.stepDepth;
      b.heightZones.push({
        minX: x - rearTransition.width / 2,
        maxX: x + rearTransition.width / 2,
        minZ,
        maxZ: minZ + rearTransition.stepDepth,
        kind: 'deck',
        y: (rearTransition.steps - step) * rearTransition.stepRise,
      });
    }
  }

  // The bowed 0.58m stage is walkable so approaching the shared screen never
  // sinks the avatar into visible geometry. Five bands approximate its curve
  // closely without turning height lookup into mesh collision code.
  for (const [minX, maxX, maxZ] of [
    [-14, -10, -11.55], [-10, -5, -11.1], [-5, 5, -10.72],
    [5, 10, -11.1], [10, 14, -11.55],
  ] as const) {
    b.heightZones.push({ minX, maxX, minZ: -14.7, maxZ, kind: 'deck', y: 0.58 });
  }
  for (const [minX, maxX, minZ, maxZ] of [
    [-11.7, -10, -11.54, -11.2], [-10, -5, -11.09, -10.55],
    [-5, 5, -10.71, -10.4], [5, 10, -11.09, -10.55],
    [10, 11.7, -11.54, -11.2],
  ] as const) {
    b.heightZones.push({ minX, maxX, minZ, maxZ, kind: 'deck', y: 0.2 });
  }

  // 后部集散区与小卖部收在两侧，中轴保持 6m 净宽，进场镜头直接看向巨幕。
  // The concession runs parallel to the east wall and faces west into its
  // approach bay. The previous east-west bar exposed only its narrow end to
  // arriving players and did not read as a staffed service counter.
  b.prop('concession', 15.4, 0, 12.45, -Math.PI / 2);
  b.box(15.4, 12.45, 1.1, 3.4, 1.9);
  // Two narrow ticket pedestals sit inside the 4.1m rear door opening. Their
  // 2.58m clear centre supports two abreast arrivals without disappearing
  // behind the architectural jambs.
  for (const side of [-1, 1] as const) {
    b.prop('cinema_ticket_gate', side * 1.55, 0, 11.75, 0, { side });
    b.box(side * 1.55, 11.75, 0.52, 1.25, 1.28);
  }
  b.inter('cine-vend', 'vending', 16.2, 0, 10.1, -Math.PI / 2, '零食贩卖机', { items: ['soda', 'pizza'] });
  b.box(16.2, 10.1, 0.8, 0.9, 1.95);
  b.prop('sofa', -13.3, 0, 12.8, Math.PI); b.box(-13.3, 12.8, 2.1, 0.95, 1.0);
  b.inter('cine-sofa-s0', 'seat', -13.85, 0.44, 12.75, Math.PI, '等候入场');
  b.inter('cine-sofa-s1', 'seat', -12.75, 0.44, 12.75, Math.PI, '等候入场');
  b.prop('coffee_table', -13.3, 0, 11.25); b.circle(-13.3, 11.25, 0.5);
  b.prop('rope_barrier', -8.8, 0, 13.1, 0);
  for (const [x, z] of [[-16.1, 14.1], [16.1, 14.1], [-16.1, -13.8], [16.1, -13.8]] as const) {
    b.prop('plant', x, 0, z); b.circle(x, z, 0.3);
  }

  return {
    key: SPACE.CINEMA, label: '极光影院·巨幕厅', indoor: true, bounds,
    // Arrive in the rear lobby buffer, then pass between the two admission
    // pedestals at z=11.75 before entering the auditorium proper.
    spawn: [0, 0, 13.25, Math.PI],
    colliders: b.colliders, interactables: b.interactables, props: b.props,
    npcs: [], heightZones: b.heightZones, mediaPolicy: 'everyone',
  };
}

// ═════════════════════════════ ARCADE ═══════════════════════════════════════
function buildArcade(): SpaceLayout {
  const b = new B();
  const bounds: Bounds = { minX: -8, maxX: 8, minZ: -7, maxZ: 7 };

  b.inter('arc-exit', 'door', -7.7, 0, 0, Math.PI / 2, '返回一番街', { target: SPACE.PLAZA, spawn: STREET_SPAWN });
  b.inter('arcade-neon', 'switch', -7.85, 1.2, 1.8, Math.PI / 2, '霓虹开关', { switchId: 'arcade-neon' });

  // Playable machines along north wall
  b.inter('ttt1', 'ttt', -5.1, 0, -6.2, 0, 'VERSUS·井字棋');
  b.inter('lo1', 'lightsout', -1.7, 0, -6.2, 0, '关灯谜题机');
  b.inter('ttt2', 'ttt', 1.7, 0, -6.2, 0, 'VERSUS·井字棋');
  b.inter('lo2', 'lightsout', 5.1, 0, -6.2, 0, '关灯谜题机');
  b.box(0, -6.3, 13.4, 1.0);

  // Decorative attract-mode cabinets (east wall)
  b.prop('arcade_deco', 7.5, 0, -2.3, -Math.PI / 2, { variant: 0 });
  b.prop('arcade_deco', 7.5, 0, 0.0, -Math.PI / 2, { variant: 1 });
  b.prop('arcade_deco', 7.5, 0, 2.3, -Math.PI / 2, { variant: 2 });
  b.box(7.5, 0, 0.9, 5.8);

  // Whiteboard (west wall) + vending
  b.inter('arcade-wb', 'whiteboard', -7.8, 1.5, -2.9, Math.PI / 2, '涂鸦板', { boardId: 'arcade-wb' });
  b.inter('arcade-vend', 'vending', -7.5, 0, 4.4, Math.PI / 2, '饮料贩卖机', { items: ['soda'] });
  b.box(-7.5, 4.4, 0.8, 0.9);

  // Sofa corner (south)
  b.prop('sofa', 4.2, 0, 6.4, Math.PI);
  b.box(4.2, 6.4, 2.1, 0.95);
  b.inter('arc-sofa-s0', 'seat', 3.65, 0.44, 6.35, Math.PI, '坐下');
  b.inter('arc-sofa-s1', 'seat', 4.75, 0.44, 6.35, Math.PI, '坐下');
  b.prop('coffee_table', 4.2, 0, 4.8);
  b.circle(4.2, 4.8, 0.5);
  b.prop('plant', 7.2, 0, 6.2); b.circle(7.2, 6.2, 0.3);

  return {
    key: SPACE.ARCADE, label: '像素宫游戏厅', indoor: true, bounds,
    spawn: [-6.2, 0, 0, -Math.PI / 2],
    colliders: b.colliders, interactables: b.interactables, props: b.props,
    npcs: [], heightZones: [],
  };
}

// ═════════════════════════════ SHOP ═════════════════════════════════════════
function buildShop(): SpaceLayout {
  const b = new B();
  const bounds: Bounds = { minX: -8, maxX: 8, minZ: -7, maxZ: 7 };

  b.inter('shop-exit', 'door', 7.7, 0, 0, -Math.PI / 2, '返回一番街', { target: SPACE.PLAZA, spawn: STREET_SPAWN });
  b.inter('shop-lights', 'switch', 7.85, 1.2, 1.8, -Math.PI / 2, '电灯开关', { switchId: 'shop-lights' });

  // Furniture kiosk (center)
  b.inter('shop-kiosk', 'kiosk', 0, 0, -1.8, 0, '家具购买台');
  b.circle(0, -1.8, 0.7);

  // Vending machines (north wall)
  b.inter('shop-vend1', 'vending', -3.5, 0, -6.5, 0, '零食贩卖机', { items: ['soda', 'pizza'] });
  b.inter('shop-vend2', 'vending', -1.5, 0, -6.5, 0, '咖啡机', { items: ['coffee', 'book_poems'] });
  b.box(-2.5, -6.5, 3, 0.9);

  // Shelving (visual) + counter with shopkeeper
  b.prop('shop_shelf', 3.5, 0, -6.4, 0); b.box(3.5, -6.4, 3.2, 0.6);
  b.prop('shop_shelf', -7.5, 0, -1.8, Math.PI / 2); b.box(-7.5, -1.8, 0.6, 3.2);
  b.prop('shop_counter', -5.2, 0, 4.6, Math.PI); b.box(-5.2, 4.6, 2.6, 0.9);
  b.prop('mirror_standing', 6.6, 0, -4.9, -Math.PI / 4);
  b.circle(6.6, -4.9, 0.4);
  b.prop('plant', -7.2, 0, 6.2); b.circle(-7.2, 6.2, 0.3);
  b.prop('plant', 6.9, 0, 6.2); b.circle(6.9, 6.2, 0.3);

  const npcs: NpcDef[] = [{
    id: -4, name: 'Zed', dialogueId: 'shopkeeper', speed: 0.7, pause: 5,
    avatar: npcAvatar('#f2a5b5', '#111111', '#8fc7c4', '#33383f', 0, '#333333', 2),
    waypoints: [[-5.2, 5.9], [-3.8, 5.9]],
  }];

  return {
    key: SPACE.SHOP, label: '团子百货', indoor: true, bounds,
    spawn: [6.2, 0, 0, Math.PI / 2],
    colliders: b.colliders, interactables: b.interactables, props: b.props,
    npcs, heightZones: [],
  };
}

// ═════════════════════════════ LOBBY ════════════════════════════════════════
function buildLobby(): SpaceLayout {
  const b = new B();
  const bounds: Bounds = { minX: -9, maxX: 9, minZ: -7, maxZ: 7 };

  b.inter('lobby-exit', 'door', 0, 0, 6.7, 0, '返回一番街', { target: SPACE.PLAZA, spawn: STREET_SPAWN });
  b.inter('lobby-lights', 'switch', 1.7, 1.2, 6.85, 0, '电灯开关', { switchId: 'lobby-lights' });

  // Elevator bank (north wall): two doors + call panel
  b.prop('elevator_doors', -2, 0, -6.85, 0);
  b.prop('elevator_doors', 2, 0, -6.85, 0);
  b.box(-2, -6.9, 2.2, 0.4); b.box(2, -6.9, 2.2, 0.4);
  b.inter('lobby-elevator', 'elevator', 0, 1.2, -6.8, 0, '电梯 · 拜访房间');

  // Directory board + mailboxes
  b.prop('directory', -7.1, 0, -6.6, 0); b.box(-7.1, -6.6, 1.6, 0.4);
  b.prop('mailboxes', -8.7, 1.1, -1.5, Math.PI / 2);
  b.inter('lobby-board', 'board', 8.7, 0, -1.5, -Math.PI / 2, '住户留言板', {});

  // Waiting area
  b.prop('sofa', 6.2, 0, 5.9, Math.PI); b.box(6.2, 5.9, 2.1, 0.95);
  b.inter('lob-sofa-s0', 'seat', 5.65, 0.44, 5.85, Math.PI, '坐下');
  b.inter('lob-sofa-s1', 'seat', 6.75, 0.44, 5.85, Math.PI, '坐下');
  b.prop('coffee_table', 6.2, 0, 4.3); b.circle(6.2, 4.3, 0.5);
  b.prop('plant', -8.1, 0, 6.1); b.circle(-8.1, 6.1, 0.3);
  b.prop('plant', 8.1, 0, -6.2); b.circle(8.1, -6.2, 0.3);
  b.inter('lobby-vend', 'vending', -7.6, 0, 4.8, Math.PI / 2, '饮料贩卖机', { items: ['soda', 'coffee'] });
  b.box(-7.6, 4.8, 0.8, 0.9);

  return {
    key: SPACE.LOBBY, label: '团子塔大堂', indoor: true, bounds,
    spawn: [0, 0, 5.2, Math.PI],
    colliders: b.colliders, interactables: b.interactables, props: b.props,
    npcs: [], heightZones: [],
  };
}

// ═════════════════════════ 网吧 NEXUS(新室内) ═════════════════════════════
function buildNetcafe(): SpaceLayout {
  const b = new B();
  // 42×34m 大型赛事观战馆：旧 20×15m 网吧平面被完全替换。
  const bounds: Bounds = { ...ARENA_SPATIAL_CONTRACT.bounds };

  const [exitX, exitY, exitZ] = ARENA_SPATIAL_CONTRACT.exit.position;
  b.inter('nc-exit', 'door', exitX, exitY, exitZ, 0, '返回一番街', {
    target: SPACE.PLAZA, spawn: streetReturnFor('netcafe'),
  });
  b.inter('nc-lights', 'switch', 2.1, 1.2, 16.85, 0, '赛事灯光', { switchId: 'nc-lights' });

  const arenaScreen = ARENA_SPATIAL_CONTRACT.screen;
  b.inter(
    arenaScreen.id,
    'screen',
    ...arenaScreen.position,
    0,
    '赛事主屏',
    { width: arenaScreen.width, height: arenaScreen.height },
  );

  // 八个业务机位改为中央 4v4 背靠背赛台；两队完全等量，不再把三席
  // 降格成靠后的“替补排”。保留 nc-s0..7 和 seatIdx 协议。
  const teamCols = ARENA_SPATIAL_CONTRACT.stations.x;
  teamCols.forEach((x, i) => {
    b.prop('nc_station', x, ARENA_SPATIAL_CONTRACT.stations.deckY, ARENA_SPATIAL_CONTRACT.stations.rowZ[0], 0, { row: 0, seatIdx: i });
    b.box(x, ARENA_SPATIAL_CONTRACT.stations.rowZ[0], 1.85, 0.9, 2.5);
    b.inter(`nc-s${i}`, 'seat', x, ARENA_SPATIAL_CONTRACT.stations.seatY, ARENA_SPATIAL_CONTRACT.stations.seatZ[0], Math.PI, '进入选手席');
  });
  teamCols.forEach((x, i) => {
    b.prop('nc_station', x, ARENA_SPATIAL_CONTRACT.stations.deckY, ARENA_SPATIAL_CONTRACT.stations.rowZ[1], Math.PI, { row: 1, seatIdx: 4 + i });
    b.box(x, ARENA_SPATIAL_CONTRACT.stations.rowZ[1], 1.85, 0.9, 2.5);
    b.inter(`nc-s${4 + i}`, 'seat', x, ARENA_SPATIAL_CONTRACT.stations.seatY, ARENA_SPATIAL_CONTRACT.stations.seatZ[1], 0, '进入选手席');
  });

  // CompetitionFloor 的真实可行走顶面。floorHeightAt 按声明顺序命中，
  // 因此从高到低登记重叠体块，始终得到画面中实际露出的最高表面。
  // index 0 固定为场馆正中心的 0.60m 完成面；外缘依次降至
  // 0.55 / 0.40m，并在南北两侧各留三组 0.24m 登台踏步。
  b.heightZones.push({ minX: -9.3, maxX: 9.3, minZ: -4.25, maxZ: 4.25, kind: 'deck', y: 0.6 });
  b.heightZones.push({ minX: -9.75, maxX: 9.75, minZ: -4.65, maxZ: 4.65, kind: 'deck', y: 0.55 });
  b.heightZones.push({ minX: -10.1, maxX: 10.1, minZ: -5.05, maxZ: 5.05, kind: 'deck', y: 0.4 });
  for (const side of [-1, 1]) {
    for (const x of [-5.4, 0, 5.4]) {
      b.heightZones.push({
        minX: x - 1.8,
        maxX: x + 1.8,
        minZ: side < 0 ? -5.8 : 5.05,
        maxZ: side < 0 ? -5.05 : 5.8,
        kind: 'deck',
        y: 0.24,
      });
    }
  }
  // The visible east/west evacuation stairs are walkable architecture, not
  // decorative stand faces. Register every tread so server movement and the
  // third-person lens land on the same top surfaces as ArenaHallArchitecture.
  const standAisles = ARENA_SPATIAL_CONTRACT.sideStandAisles;
  for (const side of standAisles.x) {
    for (let row = 0; row < standAisles.rows; row++) {
      const centerX = side * (standAisles.firstCenterX + row * standAisles.rowSpacing);
      b.heightZones.push({
        minX: centerX - standAisles.treadWidth / 2,
        maxX: centerX + standAisles.treadWidth / 2,
        minZ: standAisles.centerZ - standAisles.treadDepth / 2,
        maxZ: standAisles.centerZ + standAisles.treadDepth / 2,
        kind: 'deck',
        y: standAisles.firstRise + row * standAisles.rowRise,
      });
    }
  }

  // 赛事建筑实体碰撞：与 ArenaHallArchitecture 的看台/后勤体块一一对应。
  // 东西看台在 z=-1.0..1.7 留出 2.7m 横向疏散口，外侧保留维护通道。
  for (const x of [-15.875, 15.875]) {
    b.box(x, -4.55, 5.35, 7.1, 3.45);
    b.box(x, 6.05, 5.35, 8.7, 3.45);
  }
  // 后看台与两侧解说/控制平台在实体上连续，左右各合并成一个碰撞体；
  // 中央 x=-1.7..1.7 保留从入口通往赛台的 3.4m 主疏散轴。
  b.box(-10.65, 13.0, 17.9, 5.3, 3.35);
  b.box(10.65, 13.0, 17.9, 5.3, 3.35);
  // 北侧补齐与南侧镜像的逐级看台；中轴同样留出 3.4m 主屏检修与
  // 疏散通道，形成真正四周包围中央选手区的赛事碗体。
  b.box(-10.65, -13.0, 17.9, 5.3, 3.35);
  b.box(10.65, -13.0, 17.9, 5.3, 3.35);

  // 主屏墙仅封闭 0.28m 厚的背壳；北看台中央轴直达屏前检修带，
  // 玩家无需穿过座席即可进入 nc-wall 的 5m 服务端互动范围。
  b.box(0, -16.84, 24.6, 0.28, 13.0);
  for (const x of [-12.15, 12.15]) b.box(x, -16.72, 0.7, 1.05, 12.0);
  // 折角侧屏只为落地检修柱生成旋转后的紧 AABB，不封死屏幕下方空间。
  for (const x of [-15.86, 15.86]) b.box(x, -14.83, 0.6, 0.96, 10.0);
  // CompetitionFloor 两侧的实体设备机柜。
  for (const x of [-10.6, 10.6]) b.box(x, 0, 1.45, 2.1, 1.7);

  // 后场解说席、控制室和机柜由赛事建筑模块统一建模，中轴保持入口至赛台净空。
  // Staff and refreshment services occupy the two narrow side bands between
  // the competition deck and stands.  Neither crosses the 3.4m centre axis or
  // the east/west vomitory at z≈0.6.
  b.prop('arena_staff_desk', -11.65, 0, 5.25, Math.PI / 2);
  b.box(-11.65, 5.25, 1.15, 3.2, 1.85);
  b.prop('arena_service_bar', 11.65, 0, 5.25, -Math.PI / 2);
  b.box(11.65, 5.25, 1.15, 3.2, 2.1);

  return {
    key: SPACE.NETCAFE, label: '镜界电竞观战馆·主赛场', indoor: true, bounds,
    // Enter one bay inside the rear concourse.  The central 3.4m aisle remains
    // clear, while the real third-person lens sits in front of the portal frame
    // and establishes the full stage/screen/stand volume on arrival.
    spawn: [0, 0, 10.4, Math.PI],
    colliders: b.colliders, interactables: b.interactables, props: b.props,
    npcs: [], heightZones: b.heightZones, mediaPolicy: 'everyone',
  };
}

// ═════════════════════════ 团子轰趴馆·社团活动室 ═══════════════════════════
function buildGameroom(): SpaceLayout {
  const b = new B();
  const bounds: Bounds = { minX: -12, maxX: 12, minZ: -9, maxZ: 9 };
  const clubSeatPosition = (
    x: number,
    y: number,
    z: number,
    ry: number,
    localX: number,
    localZ: number,
  ): [number, number, number] => [
    x + localX * Math.cos(ry) + localZ * Math.sin(ry),
    y,
    z - localX * Math.sin(ry) + localZ * Math.cos(ry),
  ];
  const addClubChair = (
    id: string,
    x: number,
    z: number,
    ry: number,
    accent: number,
    label: string,
  ) => {
    b.prop('chair', x, 0, z, ry, { style: 'club', accent });
    // The Dango body is 0.8m deep.  A small local-forward offset and the real
    // cushion-top height keep it clear of both the padded back and table edge.
    const [seatX, seatY, seatZ] = clubSeatPosition(x, 0.61, z, ry, 0, 0.18);
    b.inter(id, 'seat', seatX, seatY, seatZ, ry, label);
  };

  b.inter('gr-exit', 'door', 0, 0, 8.7, 0, '返回一番街', {
    target: SPACE.PLAZA, spawn: streetReturnFor('gameroom'),
  });
  b.inter('gr-lights', 'switch', 1.7, 1.2, 8.85, 0, '活动室灯光', { switchId: 'gr-lights' });

  // 主客厅与桌游区向中轴收拢，家具自身围出约 3m 的连续主通道；
  // 不再依赖两块超大空地毯制造“宽敞”，入场便能同时读到围坐区和桌游区。
  b.prop('club_rug', -3.55, 0.012, 1.05, 0, { w: 6.9, d: 5.9 });
  b.prop('club_rug', 4.25, 0.012, -0.15, 0, { w: 6.6, d: 7.35 });
  const westSofa = { x: -6.35, z: 1.05, ry: Math.PI / 2 };
  b.prop('club_sofa', westSofa.x, 0, westSofa.z, westSofa.ry); b.box(westSofa.x, westSofa.z, 1.05, 3.8, 1.18);
  [1.15, 0, -1.15].forEach((localX, i) => {
    const [x, y, z] = clubSeatPosition(westSofa.x, 0.6, westSofa.z, westSofa.ry, localX, 0.2);
    b.inter(`gr-sofa-w${i}`, 'seat', x, y, z, westSofa.ry, '窝进沙发');
  });
  const northSofa = { x: -3.35, z: -1.55, ry: 0 };
  b.prop('club_sofa', northSofa.x, 0, northSofa.z, northSofa.ry); b.box(northSofa.x, northSofa.z, 3.8, 1.05, 1.18);
  [-1.15, 0, 1.15].forEach((localX, i) => {
    const [x, y, z] = clubSeatPosition(northSofa.x, 0.6, northSofa.z, northSofa.ry, localX, 0.2);
    b.inter(`gr-sofa-n${i}`, 'seat', x, y, z, northSofa.ry, '窝进沙发');
  });
  b.prop('coffee_table', -3.45, 0, 1.0); b.circle(-3.45, 1.0, 0.55);

  // 社团活动室只保留适合室内围坐的实体象棋。飞行棋唯一可玩实例
  // 已迁到街道树下的超大地摊棋毯，避免出现看似可玩却重复的小棋盘。
  b.inter('gr-xq', 'xiangqi', 4.35, 0, 2.45, 0, '社团象棋桌');
  b.box(4.35, 2.45, 1.0, 1.0, 0.78);
  for (const [x, z, ry, i] of [
    [3.17, 2.45, Math.PI / 2, 0], [5.53, 2.45, -Math.PI / 2, 1],
  ] as const) {
    addClubChair(`gr-xq-s${i}`, x, z, ry, i, '坐下下棋');
  }
  // 中央后段的社团筹备桌把两个功能区串成一体；桌体阻挡与实体一致，
  // 左右仍各保留超过 1.5m 的绕行空间，不堵入口主轴。
  b.prop('club_craft_table', 0.35, 0, -5.05, 0);
  b.box(0.35, -5.05, 1.9, 1.05, 0.86);
  for (const [x, ry, i] of [[-1.23, Math.PI / 2, 0], [1.93, -Math.PI / 2, 1]] as const) {
    addClubChair(`gr-craft-s${i}`, x, -5.05, ry, i + 2, '一起筹备活动');
  }

  // 小舞台、点歌机、茶水零食台、社团墙与安静阅读角。
  b.prop('club_stage', -5.2, 0, -7.3, 0); b.box(-5.2, -7.3, 7.4, 2.2, 0.42);
  b.inter('gr-jukebox', 'jukebox', -10.9, 0, -5.7, Math.PI / 2, '社团点歌机');
  b.box(-10.9, -5.7, 0.8, 0.6, 1.75);
  b.prop('gr_tea', 10.9, 0, 5.7, -Math.PI / 2); b.box(10.9, 5.7, 0.8, 2.2, 1.72);
  b.prop('club_trophy_wall', 11.85, 1.8, -0.2, -Math.PI / 2);
  b.prop('club_storage', 6.8, 0, 7.95, Math.PI, {
    zone: 'entry', usage: 'shoes-coats-personal-items',
  });
  b.box(6.8, 7.95, 3.7, 0.72, 2.15);
  b.prop('club_reading_nook', -9.25, 0, 5.15, Math.PI / 2);
  b.box(-9.25, 5.15, 1.3, 4.5, 1.6);
  b.inter('gr-books', 'bookshelf', -11.55, 0, 5.8, Math.PI / 2, '社团书架');
  b.box(-11.55, 5.8, 0.45, 1.3, 2.25);
  b.inter('gr-wb', 'whiteboard', 2.5, 1.55, -8.85, 0, '社团活动板', { boardId: 'gr-wb' });
  b.prop('gr_lantern', -8.8, 2.5, 7.6);
  b.prop('gr_lantern', 8.8, 2.5, 7.6);
  for (const [x, z] of [[-10.9, -8], [10.9, -8], [-10.9, 8], [10.9, 8]] as const) {
    b.prop('plant', x, 0, z); b.circle(x, z, 0.3);
  }

  return {
    key: SPACE.GAMEROOM, label: '团子轰趴馆·社团活动室', indoor: true, bounds,
    // Slightly right-biased real entry composition includes both game tables
    // and the lounge; the central worktable splits circulation into two clear aisles.
    spawn: [0.35, 0, 2.2, Math.PI - 0.08],
    colliders: b.colliders, interactables: b.interactables, props: b.props,
    npcs: [], heightZones: [],
  };
}

// ═════════════════════════ PERSONAL ROOM SHELL ══════════════════════════════
export const ROOM_BOUNDS: Bounds = { minX: -7, maxX: 7, minZ: -6, maxZ: 6 };
export const ROOM_SPAWN: [number, number, number, number] = [0, 0, 4.6, Math.PI];
export const ROOM_DOOR: Interactable = {
  id: 'room-exit', kind: 'door', pos: [1.9, 0, 5.85], ry: 0, label: '返回大堂',
  data: { target: SPACE.LOBBY, spawn: [0, 0, -5.6, 0] },
};
export const ROOM_SWITCH: Interactable = {
  id: 'room-lights', kind: 'switch', pos: [0.6, 1.2, 5.9], ry: 0, label: '电灯开关',
  data: { switchId: 'room-lights' },
};

// ── Registry ────────────────────────────────────────────────────────────────
export const LAYOUTS: Record<string, SpaceLayout> = {};
for (const l of [
  buildCity(), buildCafe(), buildCinema(), buildArcade(), buildShop(), buildLobby(),
  buildNetcafe(), buildGameroom(),
]) {
  LAYOUTS[l.key] = l;
}

export function floorHeightAt(layout: SpaceLayout | null, x: number, z: number): number {
  if (!layout) return 0;
  for (const hz of layout.heightZones) {
    if (x < hz.minX || x > hz.maxX || z < hz.minZ || z > hz.maxZ) continue;
    switch (hz.kind) {
      case 'bridgeZ': {
        const t = (z - hz.cx) / hz.half;
        return Math.max(0, hz.peak * (1 - t * t));
      }
      case 'deck':
        return hz.y;
      case 'ramp': {
        // dir = 下坡朝向:'n' 向北(-z)降到 0,'s' 向南(+z),'e' 向东(+x),'w' 向西(-x)
        const tx = (x - hz.minX) / (hz.maxX - hz.minX || 1);
        const tz = (z - hz.minZ) / (hz.maxZ - hz.minZ || 1);
        const f = hz.dir === 'n' ? tz : hz.dir === 's' ? 1 - tz : hz.dir === 'e' ? 1 - tx : tx;
        return hz.y * f;
      }
    }
  }
  return 0;
}

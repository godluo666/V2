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
  BUILDINGS, CITY_BOUNDS, OVERPASS, STATION, VENUES,
} from './cityplan';

export type InteractKind =
  | 'seat' | 'door' | 'switch' | 'board' | 'whiteboard' | 'screen' | 'jukebox'
  | 'ttt' | 'lightsout' | 'vending' | 'kiosk' | 'bookshelf' | 'elevator'
  | 'xiangqi' | 'mahjong' | 'riichi';

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

  box(x: number, z: number, w: number, d: number) { this.colliders.push({ kind: 'box', x, z, w, d }); return this; }
  circle(x: number, z: number, r: number) { this.colliders.push({ kind: 'circle', x, z, r }); return this; }
  prop(type: string, x: number, y: number, z: number, ry = 0, data?: Record<string, unknown>) {
    this.props.push({ type, pos: [x, y, z], ry, data }); return this;
  }
  inter(id: string, kind: InteractKind, x: number, y: number, z: number, ry: number, label: string, data?: Record<string, unknown>) {
    this.interactables.push({ id, kind, pos: [x, y, z], ry, label, data }); return this;
  }
  /** Street bench: prop + 2 seats + collider. Bench faces +Z at ry=0. */
  bench(id: string, x: number, z: number, ry: number, type = 'c_bench') {
    this.prop(type, x, 0, z, ry);
    const cos = Math.cos(ry), sin = Math.sin(ry);
    for (let i = 0; i < 2; i++) {
      const lx = i === 0 ? -0.55 : 0.55;
      this.inter(`${id}-s${i}`, 'seat', x + lx * cos, 0.46, z - lx * sin, ry, '坐下');
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
  lamp(x: number, z: number) { this.prop('c_lamp', x, 0, z); this.circle(x, z, 0.22); return this; }
}

// ═══════════════════════ 月汐町·晴日生活街(户外) ════════════════════════════
function buildCity(): SpaceLayout {
  const b = new B();
  const bounds: Bounds = { ...CITY_BOUNDS };

  // ── 建筑碰撞(非剪影全部实心;剪影楼在雾里,不可达也不必碰撞)──
  for (const bd of BUILDINGS) {
    if (bd.style === 'silhouette') continue;
    b.box(bd.x, bd.z, bd.w, bd.d);
  }

  // ── 场馆门(七个,全部在主街一层;门位由 cityplan.VENUES 精排)──
  const doorTarget: Record<string, { target: string; label: string }> = {
    cinema: { target: SPACE.CINEMA, label: '进入电影院' },
    netcafe: { target: SPACE.NETCAFE, label: '进入网吧 NEXUS' },
    gameroom: { target: SPACE.GAMEROOM, label: '进入雀庄·东风阁' },
    cafe: { target: SPACE.CAFE, label: '进入咖啡馆' },
    shop: { target: SPACE.SHOP, label: '进入便利店' },
    arcade: { target: SPACE.ARCADE, label: '进入游戏厅' },
    tower: { target: SPACE.LOBBY, label: '进入团子塔' },
  };
  for (const v of VENUES) {
    const t = doorTarget[v.key];
    b.inter(`d-${v.key}`, 'door', v.x, 0, v.z, v.ry, t.label, { target: t.target });
  }

  // ── 小型高架天桥(北街;heightZones:4 条线性坡道 + 平台)──
  const dk = OVERPASS.deck;
  b.heightZones.push({
    minX: dk.x - dk.w / 2, maxX: dk.x + dk.w / 2,
    minZ: dk.z - dk.d / 2, maxZ: dk.z + dk.d / 2, kind: 'deck', y: dk.y,
  });
  for (const r of OVERPASS.ramps) {
    b.heightZones.push({
      minX: r.x - r.w / 2, maxX: r.x + r.w / 2,
      minZ: r.z - r.d / 2, maxZ: r.z + r.d / 2, kind: 'ramp', dir: r.dir, y: dk.y,
    });
  }
  // 桥面栏杆兼桥下柔性封条:短街不留压迫的长距离桥体。
  const railW = 10.4;
  const railNorthZ = dk.z - dk.d / 2 - 0.25;
  const railSouthZ = dk.z + dk.d / 2 + 0.25;
  b.box(0, railNorthZ, railW, 0.5);
  b.box(0, railSouthZ, railW, 0.5);
  b.prop('c_fence', 0, 0, railNorthZ, 0, { w: railW, bridge: true });
  b.prop('c_fence', 0, 0, railSouthZ, 0, { w: railW, bridge: true });
  // 桥墩 4 根
  for (const [px, pz] of [[-4, -23.8], [4, -23.8], [-4, -26.2], [4, -26.2]] as const) {
    b.circle(px, pz, 0.45);
    b.prop('c_pier', px, 0, pz);
  }

  // ── 封闭旧电车口(口袋广场西侧)──
  b.box(STATION.x, STATION.z, 7, 4.5);

  // ── 口袋广场家什:边缘有内容，中线保持宽敞出生/集合通道 ──
  b.inter('city-board', 'board', 10.5, 0, 35.5, -Math.PI / 2 - 0.18, '月汐町留言板', {});
  b.box(10.5, 35.5, 0.5, 1.6);
  b.inter('v-vend1', 'vending', -11.3, 0, 29.2, 0, '晴日汽水机', { items: ['soda', 'pizza'] });
  b.box(-11.3, 29.2, 0.8, 0.9);
  b.inter('v-vend2', 'vending', 34.5, 0, -6.7, Math.PI, '蓝莓汽水机', { items: ['soda', 'pizza'] });
  b.box(34.5, -6.7, 0.8, 0.9);

  // 街边长椅 ×5:以小组分布，保证门口和主通道净宽
  b.bench('sb0', 8.8, 29.5, Math.PI);
  b.bench('sb1', -8.5, 37, 0);
  b.bench('sb2', 17.5, 6.7, Math.PI);
  b.bench('sb3', -15.5, 6.7, Math.PI);
  b.bench('sb4', -6.75, -37.5, -Math.PI / 2);

  // ── 路灯(8-14m 错落;短街密度高但不排成走廊)──
  const lamps: Array<[number, number]> = [
    [-11.5, 37.5], [11.5, 38], [-11.2, 28], [11.2, 24],
    [16, -6.8], [31, -6.7], [17.5, 6.8], [33, 6.7],
    [-16, -6.8], [-31, -6.7], [-17, 6.8], [-34, 6.7],
    [-6.8, -13], [6.8, -15], [-6.8, -36], [6.8, -39],
  ];
  for (const [lx, lz] of lamps) b.lamp(lx, lz);

  // ── 生活事件组:每组 2-4 件，靠边组织，中央动线不堆物 ──
  // 广场:储物柜、电话、三组花槽形成温柔边界
  b.prop('c_locker', 12.2, 0, 31.2, -Math.PI / 2);
  b.prop('c_locker', 12.2, 0, 32.6, -Math.PI / 2);
  b.box(12.2, 31.9, 0.6, 3);
  b.prop('c_phone', -12.1, 0, 36.5, Math.PI / 2);
  b.box(-12.1, 36.5, 0.9, 0.9);
  for (const [x, z] of [[-12.2, 31.5], [-12, 34], [12, 38.3]] as const) {
    b.prop('c_planter', x, 0, z);
    b.box(x, z, 0.9, 0.9);
  }
  // 咖啡馆与雀庄之间:自行车、海报、消防栓
  b.prop('c_bike', -8.1, 0, 20.8, 1.35); b.circle(-8.1, 20.8, 0.35);
  b.prop('c_poster', -9.05, 1.45, 18.5, -Math.PI / 2);
  b.prop('c_hydrant', 6.7, 0, 20.5); b.circle(6.7, 20.5, 0.25);
  b.prop('c_manhole', 2.2, 0, 18);
  // 东巷:单车与少量杂物，巷底仍留 2m 回转空间
  b.prop('c_trash', 25.5, 0, 25.5); b.circle(25.5, 25.5, 0.34);
  b.prop('c_bike', 32.4, 0, 33.3, 2.75); b.circle(32.4, 33.3, 0.35);
  b.prop('c_ac', 33.9, 2.35, 28.2, -Math.PI / 2);
  // 西巷:绿植花槽替代大堆垃圾，让生活感更温和
  b.prop('c_planter', -25.2, 0, 25.5); b.box(-25.2, 25.5, 0.9, 0.9);
  b.prop('c_bike', -32.4, 0, 33.5, -2.7); b.circle(-32.4, 33.5, 0.35);
  b.prop('c_poster', -33.9, 1.45, 29, Math.PI / 2);
  // 电线杆/井盖与小路口信号
  for (const [x, z] of [[15, 7.9], [33, 8], [-15, -7.9], [-33, -8]] as const) {
    b.prop('c_wires', x, 0, z);
    b.circle(x, z, 0.18);
  }
  b.prop('c_manhole', -2, 0, -17);
  for (const [x, z, ry] of [
    [8.6, 8.6, -Math.PI * 0.75], [-8.6, 8.6, Math.PI * 0.75],
    [8.6, -8.6, -Math.PI * 0.25], [-8.6, -8.6, Math.PI * 0.25],
  ] as const) {
    b.prop('c_signal', x, 0, z, ry);
    b.circle(x, z, 0.2);
  }
  // 场馆门前只放轻量识别物，门口 2.4m 范围保持无碰撞
  b.prop('c_vend', -17.5, 0, -7.2, 0, { variant: 'blue' }); b.box(-17.5, -7.2, 0.7, 0.8);
  b.prop('c_bike', 8.2, 0, -35.5, 0.35); b.circle(8.2, -35.5, 0.35);

  const npcs: NpcDef[] = [
    {
      id: -1, name: 'Yuki', dialogueId: 'greeter', speed: 1.1, pause: 6,
      avatar: npcAvatar('#f2a5b5', '#5a3b8c', '#cbb8d9', '#5a3b8c', 1, '#5a3b8c', 1),
      waypoints: [[7, 32], [-7, 36], [-3, 28]],
    },
    {
      id: -2, name: 'Kaito', dialogueId: 'walker', speed: 1.4, pause: 3,
      avatar: npcAvatar('#f5b8c4', '#3f7d44', '#b7cf8f', '#4a4a55', 0, '#333333', 0),
      waypoints: [[13, 6.7], [25, 6.7], [36, 6.6], [24, 6.8]],
    },
    {
      id: -5, name: 'Rin', dialogueId: 'walker', speed: 1.2, pause: 4,
      avatar: npcAvatar('#f2a5b5', '#2f3b5c', '#9fb3d9', '#33383f', 0, '#333333', 2),
      waypoints: [[-13, -6.7], [-25, -6.7], [-35, -6.6], [-23, -6.8]],
    },
  ];

  return {
    key: SPACE.PLAZA, label: '月汐町·晴日生活街', indoor: false, bounds,
    spawn: [0, 0, 32, Math.PI],
    colliders: b.colliders, interactables: b.interactables, props: b.props,
    npcs, heightZones: b.heightZones, hasBall: true,
  };
}

// ═════════════════════════════ CAFÉ ═════════════════════════════════════════
function buildCafe(): SpaceLayout {
  const b = new B();
  const bounds: Bounds = { minX: -9, maxX: 9, minZ: -7, maxZ: 7 };

  b.inter('cafe-exit', 'door', 0, 0, 6.7, 0, '返回街区', { target: SPACE.PLAZA, spawn: [-7.7, 0, 15, Math.PI / 2] });
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
  // 巨幕厅:30×24 大厅、24×10 米银幕、5 排 50 座、双主过道和完整后撤区。
  const b = new B();
  const bounds: Bounds = { minX: -15, maxX: 15, minZ: -12, maxZ: 12 };

  b.inter('cine-exit', 'door', 0, 0, 11.7, 0, '返回街区', { target: SPACE.PLAZA, spawn: [22, 0, -7.6, 0] });
  // 巨幕:互动锚点在银幕下沿中线;视觉尺寸(24×10)在客户端 registry 里定义
  b.inter('cine-screen', 'screen', 0, 5.8, -11.4, 0, '影院银幕');

  // 5 排 × 10 座(3-4-3 三段):2.4m 排距、2.6m 主过道、两侧均可绕行。
  const seatX = [-8.6, -7.4, -6.2, -1.8, -0.6, 0.6, 1.8, 6.2, 7.4, 8.6];
  let seatIdx = 0;
  for (let row = 0; row < 5; row++) {
    const z = -3.4 + row * 2.4;
    const lift = 0.32 * row;
    for (const x of seatX) {
      b.prop('cinema_seat', x, lift, z, Math.PI);
      b.inter(`cine-s${seatIdx++}`, 'seat', x, 0.47 + lift, z, Math.PI, '坐下');
    }
    b.box(-7.4, z, 3.2, 0.55);
    b.box(0, z, 4.4, 0.55);
    b.box(7.4, z, 3.2, 0.55);
  }

  // 后部休息区:小卖部在东侧、沙发在西侧，中间 5m 保持集合/重连安全区。
  b.prop('concession', 10.5, 0, 10, Math.PI);
  b.box(10.5, 10, 3.4, 1.0);
  b.inter('cine-vend', 'vending', 13.9, 0, 8, -Math.PI / 2, '零食贩卖机', { items: ['soda', 'pizza'] });
  b.box(13.9, 8, 0.8, 0.9);
  b.prop('sofa', -10.5, 0, 10.5, Math.PI); b.box(-10.5, 10.5, 2.1, 0.95);
  b.inter('cine-sofa-s0', 'seat', -11.05, 0.44, 10.45, Math.PI, '坐下');
  b.inter('cine-sofa-s1', 'seat', -9.95, 0.44, 10.45, Math.PI, '坐下');
  b.prop('coffee_table', -10.5, 0, 9); b.circle(-10.5, 9, 0.5);
  b.prop('rope_barrier', -6.8, 0, 10.6, 0);
  b.prop('plant', -14.2, 0, 11.2); b.circle(-14.2, 11.2, 0.3);
  b.prop('plant', 14.2, 0, 11.2); b.circle(14.2, 11.2, 0.3);
  b.prop('plant', -14.2, 0, -10.8); b.circle(-14.2, -10.8, 0.3);
  b.prop('plant', 14.2, 0, -10.8); b.circle(14.2, -10.8, 0.3);

  return {
    key: SPACE.CINEMA, label: '极光影院·巨幕厅', indoor: true, bounds,
    spawn: [0, 0, 10, Math.PI],
    colliders: b.colliders, interactables: b.interactables, props: b.props,
    npcs: [], heightZones: [], mediaPolicy: 'everyone',
  };
}

// ═════════════════════════════ ARCADE ═══════════════════════════════════════
function buildArcade(): SpaceLayout {
  const b = new B();
  const bounds: Bounds = { minX: -8, maxX: 8, minZ: -7, maxZ: 7 };

  b.inter('arc-exit', 'door', -7.7, 0, 0, Math.PI / 2, '返回街区', { target: SPACE.PLAZA, spawn: [39, 0, -7.6, 0] });
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

  b.inter('shop-exit', 'door', 7.7, 0, 0, -Math.PI / 2, '返回街区', { target: SPACE.PLAZA, spawn: [-39, 0, -7.6, 0] });
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

  b.inter('lobby-exit', 'door', 0, 0, 6.7, 0, '返回街区', { target: SPACE.PLAZA, spawn: [7.7, 0, -32, -Math.PI / 2] });
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
  const bounds: Bounds = { minX: -10, maxX: 10, minZ: -7.5, maxZ: 7.5 };

  b.inter('nc-exit', 'door', 0, 0, 7.2, 0, '返回街区', { target: SPACE.PLAZA, spawn: [-22, 0, -7.6, 0] });
  b.inter('nc-lights', 'switch', 1.7, 1.2, 7.35, 0, '电灯开关', { switchId: 'nc-lights' });

  // 墙上 7.2m 联赛大屏(北墙;共享画面/媒体都可投上来)
  b.inter('nc-wall', 'screen', 0, 2.6, -7.35, 0, '联赛大屏');

  // 两排各 4 位:横向 4.2m 节奏，纵向留 4m 中央通道和完整后部休息带。
  const cols = [-6.3, -2.1, 2.1, 6.3];
  cols.forEach((x, i) => {
    b.prop('nc_station', x, 0, -4.6, 0, { row: 0, seatIdx: i });
    b.box(x, -4.6, 1.5, 0.7);
    b.inter(`nc-s${i}`, 'seat', x, 0.47, -3.65, Math.PI, '坐下');
  });
  cols.forEach((x, i) => {
    b.prop('nc_station', x, 0, 0.6, 0, { row: 1, seatIdx: 4 + i });
    b.box(x, 0.6, 1.5, 0.7);
    b.inter(`nc-s${4 + i}`, 'seat', x, 0.47, 1.55, Math.PI, '坐下');
  });

  // 后部休息带:西侧沙发/售货机，东侧前台，中线 4m 净空直达出口。
  b.inter('nc-vend', 'vending', -9.3, 0, 4.7, Math.PI / 2, '饮料贩卖机', { items: ['soda'] });
  b.box(-9.3, 4.7, 0.8, 0.9);
  b.prop('sofa', -6.6, 0, 6.8, Math.PI); b.box(-6.6, 6.8, 2.1, 0.95);
  b.inter('nc-sofa-s0', 'seat', -7.15, 0.44, 6.75, Math.PI, '坐下');
  b.inter('nc-sofa-s1', 'seat', -6.05, 0.44, 6.75, Math.PI, '坐下');
  b.prop('coffee_table', -6.6, 0, 5.25); b.circle(-6.6, 5.25, 0.5);
  b.prop('nc_counter', 7.8, 0, 6.1, Math.PI); b.box(7.8, 6.1, 2.4, 0.9);
  b.prop('plant', 9.1, 0, 3.8); b.circle(9.1, 3.8, 0.3);

  return {
    key: SPACE.NETCAFE, label: '镜界电竞馆 NEXUS', indoor: true, bounds,
    spawn: [0, 0, 5.8, Math.PI],
    colliders: b.colliders, interactables: b.interactables, props: b.props,
    npcs: [], heightZones: [], mediaPolicy: 'everyone',
  };
}

// ═════════════════════════ 雀庄「东风阁」(新室内) ══════════════════════════
function buildGameroom(): SpaceLayout {
  const b = new B();
  const bounds: Bounds = { minX: -9, maxX: 9, minZ: -7, maxZ: 7 };

  b.inter('gr-exit', 'door', 0, 0, 6.7, 0, '返回街区', { target: SPACE.PLAZA, spawn: [7.7, 0, 15, -Math.PI / 2] });
  b.inter('gr-lights', 'switch', 1.7, 1.2, 6.85, 0, '电灯开关', { switchId: 'gr-lights' });

  // 2 张全自动日麻桌(引擎/面板归 P6;这里只出桌位数据)
  const riichiSeats: Array<[number, number, number]> = [
    [0, 1.15, Math.PI],      // 南
    [1.15, 0, -Math.PI / 2], // 东
    [0, -1.15, 0],           // 北
    [-1.15, 0, Math.PI / 2], // 西
  ];
  ([['gr-rj1', -4.1, -1.8], ['gr-rj2', 4.1, -1.8]] as const).forEach(([id, tx, tz]) => {
    b.inter(id, 'riichi', tx, 0, tz, 0, '立直麻将桌');
    b.box(tx, tz, 1.3, 1.3);
    riichiSeats.forEach(([ox, oz, sry], i) => {
      b.prop('chair', tx + ox, 0, tz + oz, sry);
      b.inter(`${id}-s${i}`, 'seat', tx + ox, 0.47, tz + oz, sry, '坐下');
    });
  });

  // 1 张象棋桌
  b.inter('gr-xq', 'xiangqi', 0, 0, 4.3, 0, '象棋桌');
  b.box(0, 4.3, 1.0, 1.0);
  for (const [sx, sry, i] of [[-1.05, Math.PI / 2, 0], [1.05, -Math.PI / 2, 1]] as const) {
    b.prop('chair', sx, 0, 4.3, sry);
    b.inter(`gr-xq-s${i}`, 'seat', sx, 0.47, 4.3, sry, '坐下');
  }

  // 茶水台(西)+ 点棒柜台(东北)+ 灯笼
  b.prop('gr_tea', -8.2, 0, 4.2, Math.PI / 2); b.box(-8.2, 4.2, 0.8, 2.2);
  b.prop('gr_counter', 8.2, 0, -5.5, -Math.PI / 2); b.box(8.2, -5.5, 1.2, 2.0);
  b.prop('gr_lantern', -8.2, 2.3, -6.2);
  b.prop('gr_lantern', 8.2, 2.3, 6.2);
  b.prop('plant', -8.1, 0, -5.3); b.circle(-8.1, -5.3, 0.3);
  b.prop('plant', 8.1, 0, 3.2); b.circle(8.1, 3.2, 0.3);

  return {
    key: SPACE.GAMEROOM, label: '雀庄·东风阁', indoor: true, bounds,
    spawn: [2.6, 0, 5.6, Math.PI],
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

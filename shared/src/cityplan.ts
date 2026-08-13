/**
 * 月汐町·一番街平面数据。
 *
 * 坐标系：x 向东，z 向南。当前阶段开放一条东西向生活商业街，以及分别向
 * 北、向南延伸的两条短巷。三座可进入场馆嵌在连续街墙中；
 * 服务端碰撞、客户端渲染与云端旅程共享这份坐标契约。
 */
import { seededRandom } from './math';

export interface CityRect { x: number; z: number; w: number; d: number }
export interface CityCrosswalk extends CityRect { dir: 'x' | 'z' }
export interface CityRoadMark extends CityRect { ry: number }
export type CityGroundUse =
  | 'general-store' | 'florist' | 'cafe' | 'stationery'
  | 'fishmonger' | 'watch-repair' | 'pharmacy' | 'restaurant';
export interface CityFacadeSign {
  text: string;
  color: string;
  /** -0.5..0.5 across the street-facing façade. */
  anchor: number;
  y: number;
  w: number;
  h: number;
  vertical?: boolean;
  /** Blade sign perpendicular to the façade, readable down the street canyon. */
  projecting?: boolean;
}
export interface CityBuilding extends CityRect {
  h: number;
  ry?: number;
  style: 'shopfront' | 'mediaTower' | 'tower' | 'apartment' | 'backstreet' | 'silhouette';
  sign?: { text: string; color: string };
  facadeSigns?: CityFacadeSign[];
  venue?: CityVenue['key'];
  /** Detailed visual closure outside the playable bounds; never a collider. */
  backdrop?: boolean;
  /** Street-level business program used to build a recognisable frontage. */
  groundUse?: CityGroundUse;
  businessState?: 'open' | 'closed';
  /** Small street-level notice: hours, service, delivery or regular closure. */
  businessNotice?: string;
}
export interface CityVenue {
  key: 'cinema' | 'netcafe' | 'gameroom';
  x: number; z: number; ry: number; label: string;
  /** Street-side point where a player can reach the façade interaction. */
  approach: [number, number];
  /** Collision-valid route from the shared street spawn to the approach point. */
  route: Array<[number, number]>;
}

/** 58×46m 可玩边界保持不变；密度来自围合而非扩大地图。 */
export const CITY_BOUNDS = { minX: -29, maxX: 29, minZ: -23, maxZ: 23 };
export const ROAD_W = 6.4;
export const ALLEY_W = 3.4;
export const SIDEWALK_W = 2.0;

/**
 * 一条东西向主街 + 两条错开的尽端短巷。巷口不会连成规则十字路口，玩家
 * 需要经过转角才能看见巷底，避免站在一点读完整张地图。
 */
export const ROADS: CityRect[] = [
  { x: 0, z: 0, w: 58, d: ROAD_W },
  { x: -8, z: -13.1, w: ALLEY_W, d: 19.8 },
  { x: 9.1, z: 13.1, w: ALLEY_W, d: 19.8 },
];

/** 两处错位巷口各有一枚道路停止提示；不扩成十字路口或广场。 */
export const CROSSINGS: CityRoadMark[] = [
  { x: -8, z: -1.6, w: ALLEY_W, d: 3.2, ry: 0 },
  { x: 9.1, z: 1.6, w: ALLEY_W, d: 3.2, ry: Math.PI },
];
export const CROSSWALKS: CityCrosswalk[] = [
  { x: -8, z: -4.45, w: ALLEY_W, d: 1.8, dir: 'x' },
  { x: 9.1, z: 4.45, w: ALLEY_W, d: 1.8, dir: 'x' },
];

/** 主街两侧 2m 人行带直接贴住店面；3.4m 小巷使用共享路面，不再硬塞路缘。 */
export const SIDEWALKS: CityRect[] = [
  { x: -19.35, z: -4.2, w: 19.3, d: SIDEWALK_W },
  { x: 11.35, z: -4.2, w: 35.3, d: SIDEWALK_W },
  { x: -10.8, z: 4.2, w: 36.4, d: SIDEWALK_W },
  { x: 19.9, z: 4.2, w: 18.2, d: SIDEWALK_W },
];

const b = (
  x: number, z: number, w: number, d: number, h: number,
  style: CityBuilding['style'], extra?: Partial<CityBuilding>,
): CityBuilding => ({ x, z, w, d, h, style, ...extra });

/**
 * 连续街墙夹住主街。建筑开间从 3m 小店到 18m 场馆不等，高度以 2～7 层为主；
 * 两条 3.4m 短巷是街墙中唯一有意保留的间断。
 */
const ACTIVE_BUILDINGS: CityBuilding[] = [
  // 北侧街墙（面向南）。
  b(-24, -10.7, 10, 11, 16, 'shopfront', {
    ry: 0,
    venue: 'gameroom', sign: { text: '团子 CLUB', color: '#ff704d' },
    facadeSigns: [
      { text: '社团活动室', color: '#c85f45', anchor: 0.05, y: 4.2, w: 4.6, h: 0.62 },
      { text: 'DANGO', color: '#d5a438', anchor: -0.4, y: 6.4, w: 0.72, h: 2.7, vertical: true, projecting: true },
    ],
  }),
  b(-15.5, -10.7, 7, 11, 10, 'shopfront', {
    ry: 0,
    groundUse: 'general-store', businessState: 'open', businessNotice: '9:00–20:00',
    sign: { text: '潮路商店', color: '#446f78' },
    facadeSigns: [
      { text: '日用品', color: '#446f78', anchor: 0.08, y: 3.9, w: 2.7, h: 0.54 },
    ],
  }),
  b(-10.85, -10.7, 2.3, 11, 8, 'shopfront', {
    ry: 0,
    groundUse: 'florist', businessState: 'open', businessNotice: '切花・鉢植え', sign: { text: '花房', color: '#8a7051' },
  }),
  b(-2.65, -10.7, 7.3, 11, 18, 'apartment', {
    ry: 0,
    sign: { text: '月影荘', color: '#755c4d' },
  }),
  b(4, -10.7, 6, 11, 12, 'shopfront', {
    ry: 0,
    groundUse: 'cafe', businessState: 'open', businessNotice: '珈琲 8:00–18:00',
    sign: { text: '喫茶 汐音', color: '#8f5b42' },
    facadeSigns: [{ text: '珈琲・軽食', color: '#8f5b42', anchor: 0, y: 4.15, w: 3.2, h: 0.55 }],
  }),
  b(9, -10.7, 4, 11, 9, 'shopfront', {
    ry: 0,
    groundUse: 'stationery', businessState: 'open', businessNotice: '印刷・文具',
    sign: { text: '山田文具', color: '#557263' },
  }),
  b(20, -10.7, 18, 11, 22, 'shopfront', {
    ry: 0,
    venue: 'cinema', sign: { text: '星汐 CINEMA', color: '#ff3f6c' },
    facadeSigns: [
      { text: '上映案内', color: '#c74f55', anchor: 0.06, y: 4.5, w: 5.4, h: 0.7 },
      { text: 'CINEMA', color: '#b34b53', anchor: -0.43, y: 8.2, w: 0.82, h: 3.4, vertical: true, projecting: true },
    ],
  }),

  // 南侧街墙（面向北）。
  b(-23, 10.7, 12, 11, 20, 'apartment', {
    ry: Math.PI, sign: { text: '夕凪住宅', color: '#8a6d4f' },
  }),
  b(-13.5, 10.7, 7, 11, 9, 'shopfront', {
    ry: Math.PI, groundUse: 'fishmonger', businessState: 'open', businessNotice: '本日入荷', sign: { text: '魚政', color: '#426c78' },
  }),
  b(-3.5, 10.7, 13, 11, 18, 'shopfront', {
    ry: Math.PI,
    venue: 'netcafe', sign: { text: '镜界 ARENA', color: '#3db7ff' },
    facadeSigns: [
      { text: '电竞观战・预约制', color: '#3d7380', anchor: 0.02, y: 4.4, w: 5.8, h: 0.64 },
      { text: 'ARENA', color: '#3d7380', anchor: 0.42, y: 7.2, w: 0.78, h: 3.1, vertical: true, projecting: true },
    ],
  }),
  b(5.2, 10.7, 4.4, 11, 11, 'shopfront', {
    ry: Math.PI, groundUse: 'watch-repair', businessState: 'closed', businessNotice: '水曜定休', sign: { text: '藤井時計', color: '#75634f' },
  }),
  b(14.4, 10.7, 7.2, 11, 17, 'apartment', {
    ry: Math.PI, sign: { text: '潮风公寓', color: '#8a704d' },
  }),
  b(23.5, 10.7, 11, 11, 13, 'shopfront', {
    ry: Math.PI, groundUse: 'pharmacy', businessState: 'open', businessNotice: '処方せん受付', sign: { text: '青海薬局', color: '#4f7464' },
  }),

  // 两条巷道的尽端侧墙继续围合视线，巷宽保持 3.4m。
  b(-12.2, -19.6, 5, 6.8, 13, 'backstreet', { ry: Math.PI / 2, sign: { text: '月汐荘', color: '#796552' } }),
  b(-3.8, -19.6, 5, 6.8, 10, 'shopfront', {
    ry: -Math.PI / 2, groundUse: 'restaurant', businessState: 'open', businessNotice: '夜 17:00–23:00', sign: { text: '小料理 凪', color: '#875448' },
    facadeSigns: [
      { text: '小料理 凪', color: '#875448', anchor: -0.08, y: 3.62, w: 2.4, h: 0.48 },
    ],
  }),
  b(4.9, 19.6, 5, 6.8, 12, 'backstreet', { ry: -Math.PI / 2, sign: { text: '栄荘', color: '#6d675d' } }),
  b(13.3, 19.6, 5, 6.8, 15, 'apartment', { ry: Math.PI / 2, sign: { text: '南町住宅', color: '#74644f' } }),
];

/** 四周近距离天际线封住街端透视，不形成可到达的第二片地图。 */
function createSilhouettes(count: number): CityBuilding[] {
  const rnd = seededRandom(7707);
  const silhouettes: CityBuilding[] = [];
  for (let i = 0; i < count; i++) {
    const edge = i % 4;
    let along = -52 + rnd() * 104;
    // Keep the three playable street axes legible. A background block must
    // never sit directly behind a human-scale terminus and turn the whole
    // vista into one black slab (the old west seed did exactly that).
    if ((edge === 0 || edge === 1) && Math.abs(along) < 12) {
      along += along < 0 ? -22 : 22;
    }
    // The north alley has its own detailed residential terminus.
    if (edge === 2 && Math.abs(along + 8) < 18) along += along < -8 ? -22 : 22;
    const depth = 34 + rnd() * 22;
    const x = edge === 0 ? -depth : edge === 1 ? depth : along;
    const z = edge === 2 ? -depth : edge === 3 ? depth : along;
    const w = 9 + Math.round(rnd() * 13);
    const d = 8 + Math.round(rnd() * 10);
    const h = 28 + Math.round(rnd() * 36);
    silhouettes.push(b(x, z, w, d, h, 'silhouette', { ry: (rnd() - 0.5) * 0.18 }));
  }
  return silhouettes;
}

// 用普通街区体量封住北巷消失点，不再使用巨型媒体立面。
const ALLEY_TERMINI: CityBuilding[] = [
  b(-8, -27.8, 6.2, 9.6, 11, 'backstreet', {
    ry: 0, backdrop: true, sign: { text: '月汐荘', color: '#796552' },
  }),
  b(9.1, 27.8, 6.6, 9.6, 9, 'backstreet', {
    ry: Math.PI, backdrop: true, sign: { text: '南町倉庫', color: '#6d675d' },
  }),
];

const STREET_TERMINI: CityBuilding[] = [
  b(-34, 0, 10, 15, 13, 'backstreet', {
    ry: Math.PI / 2, backdrop: true,
    sign: { text: '西一番倉庫', color: '#6f6658' },
    facadeSigns: [
      { text: '西一番倉庫', color: '#6f6658', anchor: 0.12, y: 3.15, w: 2.5, h: 0.5 },
    ],
  }),
  b(34, 0, 10, 16, 16, 'apartment', {
    ry: -Math.PI / 2, backdrop: true,
    sign: { text: '朝日ビル', color: '#6a735f' },
    facadeSigns: [
      { text: '朝日ビル', color: '#6a735f', anchor: -0.12, y: 2.2, w: 2.2, h: 0.44 },
    ],
  }),
];

export const BUILDINGS: CityBuilding[] = [
  ...ACTIVE_BUILDINGS,
  ...ALLEY_TERMINI,
  ...STREET_TERMINI,
  ...createSilhouettes(17),
];

/** 唯一三个可进入场馆；入口分布在主街两侧的连续街墙中。 */
export const VENUES: CityVenue[] = [
  {
    key: 'cinema', x: 16.0, z: -5.2, ry: 0, label: '星汐电影院',
    approach: [16.0, -4.45],
    route: [[-17, 1.2], [-8, 1.2], [4, 1.2], [16, 1.2], [16.0, -4.45]],
  },
  {
    key: 'netcafe', x: -3.5, z: 5.2, ry: Math.PI, label: '镜界电竞观战馆',
    approach: [-3.5, 4.45],
    route: [[-17, 1.2], [-9, 1.2], [-3.5, 1.2], [-3.5, 4.45]],
  },
  {
    key: 'gameroom', x: -24, z: -5.2, ry: 0, label: '团子轰趴馆',
    approach: [-24, -4.45],
    route: [[-17, 1.2], [-24, 1.2], [-24, -4.45]],
  },
];

/** World-space collider dimensions become local frontage/depth after a quarter turn. */
export function cityBuildingLocalSize(building: CityBuilding): { frontage: number; depth: number } {
  const quarterTurns = Math.round((building.ry ?? 0) / (Math.PI / 2));
  return Math.abs(quarterTurns) % 2 === 1
    ? { frontage: building.d, depth: building.w }
    : { frontage: building.w, depth: building.d };
}

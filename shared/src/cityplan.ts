/**
 * 月汐町·一番街平面数据。
 *
 * 坐标系：x 向东，z 向南。首阶段开放一个紧凑的十字街头节点：东西向一番街
 * 与南北短街在漫画化四向路口汇合。三座可进入场馆嵌在连续高层立面中；
 * 服务端碰撞、客户端渲染与云端旅程共享这份坐标契约。
 */
import { seededRandom } from './math';

export interface CityRect { x: number; z: number; w: number; d: number }
export interface CityCrosswalk extends CityRect { dir: 'x' | 'z' }
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
}
export interface CityVenue {
  key: 'cinema' | 'netcafe' | 'gameroom';
  x: number; z: number; ry: number; label: string;
  /** Street-side point where a player can reach the façade interaction. */
  approach: [number, number];
  /** Collision-valid route from the shared street spawn to the approach point. */
  route: Array<[number, number]>;
}
export interface CityAnomaly { id: string; x: number; z: number; r: number }

/** 58×46m 可玩边界，比旧直街更窄；密度来自围合而非扩大地图。 */
export const CITY_BOUNDS = { minX: -29, maxX: 29, minZ: -23, maxZ: 23 };
export const ROAD_W = 7.2;
export const SIDEWALK_W = 3.5;

/**
 * 一条东西向主街 + 一条仅贯穿当前街区的南北短街，形成紧凑十字街角。
 * 它不是四向大广场：四个街角立刻由建筑围合，所有入口都在一个街区内。
 */
export const ROADS: CityRect[] = [
  { x: 2, z: 1, w: 54, d: ROAD_W },
  { x: -8, z: 0, w: ROAD_W, d: 42 },
];

/** 四向路口的漫画化墨切构图区；只覆盖道路本身，不做空旷大广场。 */
export const CROSSING: CityRect = { x: -8, z: 1, w: 10, d: ROAD_W };
export const CROSSWALKS: CityCrosswalk[] = [
  { x: -13, z: 1, w: 3, d: ROAD_W, dir: 'z' },
  { x: -3, z: 1, w: 3, d: ROAD_W, dir: 'z' },
  { x: -8, z: -4.2, w: ROAD_W, d: 3, dir: 'x' },
  { x: -8, z: 5.2, w: ROAD_W, d: 3, dir: 'x' },
];

/** 八段短步道贴住四个街角，转身即可看到店面、住宅与招牌。 */
export const SIDEWALKS: CityRect[] = [
  { x: -18.3, z: -5.35, w: 13.4, d: SIDEWALK_W },
  { x: 12.3, z: -5.35, w: 33.4, d: SIDEWALK_W },
  { x: -18.3, z: 6.35, w: 13.4, d: SIDEWALK_W },
  { x: 12.3, z: 6.35, w: 33.4, d: SIDEWALK_W },
  { x: -13.35, z: -14.05, w: SIDEWALK_W, d: 13.9 },
  { x: -2.65, z: -14.05, w: SIDEWALK_W, d: 13.9 },
  { x: -13.35, z: 15.05, w: SIDEWALK_W, d: 13.9 },
  { x: -2.65, z: 15.05, w: SIDEWALK_W, d: 13.9 },
];

const b = (
  x: number, z: number, w: number, d: number, h: number,
  style: CityBuilding['style'], extra?: Partial<CityBuilding>,
): CityBuilding => ({ x, z, w, d, h, style, ...extra });

/**
 * 连续高层街墙围住十字节点。窄开间住宅、街角高楼和三座场馆同时进入视野；
 * 高密度来自短视距、四角贴边建筑与垂直招牌，不靠扩大地图。
 */
const ACTIVE_BUILDINGS: CityBuilding[] = [
  // 北街西侧：团子轰趴馆沿纵向立面成为进入街谷后的第一视觉锚点。
  b(-22.05, -14.55, 13.9, 14.9, 34, 'shopfront', {
    ry: Math.PI / 2,
    venue: 'gameroom', sign: { text: '团子 CLUB', color: '#ff704d' },
    facadeSigns: [
      { text: 'DANGO', color: '#ffd34f', anchor: -0.34, y: 8.2, w: 1.05, h: 4.8, vertical: true, projecting: true },
      { text: '社团活动室', color: '#ff704d', anchor: 0.12, y: 5.8, w: 4.8, h: 0.82 },
      { text: 'PLAY · TALK · MUSIC', color: '#42d7c7', anchor: 0.27, y: 10.5, w: 5.8, h: 0.72 },
      { text: 'DANGO CLUB', color: '#ff3f6c', anchor: 0.02, y: 16.3, w: 8.6, h: 2.4 },
    ],
  }),

  // 北街东侧：放大的转角媒体楼直接占据路口天际线。它与电影院连续咬合，
  // 首屏就能看见低位巨幕，而不是藏在一栋小店后面。
  b(5.35, -14.55, 12.1, 14.9, 48, 'mediaTower', {
    ry: 0,
    sign: { text: '月汐 LIVE', color: '#ff3f6c' },
    facadeSigns: [
      { text: 'MOON//7', color: '#ff3f6c', anchor: -0.29, y: 19.2, w: 5.4, h: 2.4 },
      { text: 'MOON VISION', color: '#ff3f6c', anchor: 0.02, y: 35.5, w: 10.8, h: 3.7 },
      { text: 'DAY//NIGHT', color: '#42d7c7', anchor: 0.18, y: 28.6, w: 7.8, h: 1.15 },
      { text: 'LIVE', color: '#ffd34f', anchor: 0.43, y: 12.2, w: 1.05, h: 4.5, vertical: true, projecting: true },
      { text: 'MUSIC', color: '#3db7ff', anchor: -0.43, y: 8.4, w: 1.0, h: 4.2, vertical: true, projecting: true },
      { text: 'MOON MARKET · OPEN', color: '#ff3f6c', anchor: 0, y: 3.72, w: 9.6, h: 0.86 },
      { text: 'CITY FEED // 35.68N', color: '#ffd34f', anchor: 0.05, y: 14.2, w: 8.8, h: 0.9 },
      { text: 'STREET WAVE', color: '#42d7c7', anchor: -0.18, y: 23.4, w: 6.2, h: 0.95 },
    ],
  }),
  b(21.15, -14.5, 14.7, 14.8, 32, 'shopfront', {
    venue: 'cinema', sign: { text: '星汐 CINEMA', color: '#ff3f6c' },
    facadeSigns: [
      { text: 'NOW SHOWING', color: '#ffd34f', anchor: 0, y: 7.1, w: 7.6, h: 1.0 },
      { text: 'CINEMA', color: '#ff3f6c', anchor: -0.39, y: 11.5, w: 1.15, h: 5.6, vertical: true, projecting: true },
      { text: 'AURORA SCREEN', color: '#3db7ff', anchor: 0.29, y: 13.6, w: 5.8, h: 0.8 },
      { text: 'STAR TIDE', color: '#ff3f6c', anchor: 0.02, y: 22, w: 10.8, h: 3.5 },
    ],
  }),

  // 南侧：高层住宅首层夹住电竞观战馆，四角都紧贴步道而非退成广场。
  b(-22.05, 15.05, 13.9, 13.9, 36, 'tower', {
    ry: Math.PI / 2,
    sign: { text: '夕凪住宅', color: '#ffd34f' },
    facadeSigns: [
      { text: 'YUNAGI', color: '#ffd34f', anchor: 0.02, y: 23.5, w: 9.4, h: 3.8 },
      { text: '月汐 07', color: '#ff3f6c', anchor: -0.34, y: 13.8, w: 1.1, h: 5.6, vertical: true, projecting: true },
    ],
  }),
  b(4.05, 15.05, 9.9, 13.9, 28, 'shopfront', {
    ry: -Math.PI / 2,
    venue: 'netcafe', sign: { text: '镜界 ARENA', color: '#3db7ff' },
    facadeSigns: [
      { text: 'MATCH LIVE', color: '#42d7c7', anchor: -0.18, y: 7.5, w: 6.2, h: 1.0 },
      { text: 'ARENA', color: '#3db7ff', anchor: 0.39, y: 10.2, w: 1.05, h: 5.0, vertical: true, projecting: true },
      { text: 'WATCH · PLAY', color: '#ffd34f', anchor: 0.18, y: 12.2, w: 5.2, h: 0.72 },
      { text: 'FINAL ROUND', color: '#3db7ff', anchor: 0, y: 20, w: 9.6, h: 2.8 },
    ],
  }),
  b(18.5, 15.05, 19, 13.9, 34, 'apartment', {
    sign: { text: '潮风公寓', color: '#ffcf66' },
    facadeSigns: [
      { text: 'SHIOKAZE', color: '#42d7c7', anchor: 0.1, y: 22.5, w: 10.6, h: 2.4 },
      { text: 'MOON TIDE', color: '#ff3f6c', anchor: -0.36, y: 13, w: 1.1, h: 5.4, vertical: true, projecting: true },
    ],
  }),
];

/** 四周近距离天际线封住街端透视，不形成可到达的第二片地图。 */
function createSilhouettes(count: number): CityBuilding[] {
  const rnd = seededRandom(7707);
  const silhouettes: CityBuilding[] = [];
  for (let i = 0; i < count; i++) {
    const edge = i % 4;
    let along = -52 + rnd() * 104;
    // Reserve the north vanishing point for one intentional media façade.
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

// Close the north street only one metre beyond the playable boundary.  Keeping
// this as a visual-only silhouette preserves walkability while avoiding a long,
// empty road tunnel in the entry composition.
const VISTA_BUILDING = b(-8, -30, 24, 12, 52, 'silhouette', {
  ry: 0,
  facadeSigns: [
    { text: 'NORTH GATE // 07', color: '#ffd34f', anchor: 0, y: 6.5, w: 20, h: 9.6 },
    { text: 'CITY PULSE · 07', color: '#42d7c7', anchor: 0, y: 13, w: 15.5, h: 1.5 },
  ],
});

export const BUILDINGS: CityBuilding[] = [
  ...ACTIVE_BUILDINGS,
  VISTA_BUILDING,
  ...createSilhouettes(17),
];

/** 唯一三个可进入场馆；入口分布在北、西、南三侧的近距离街墙。 */
export const VENUES: CityVenue[] = [
  {
    key: 'cinema', x: 21.15, z: -6.92, ry: 0, label: '星汐电影院',
    approach: [21.15, -6.5],
    route: [[-8, 5.2], [-3, 1], [-3.2, -6.55], [21.15, -6.55], [21.15, -6.5]],
  },
  {
    key: 'netcafe', x: -1.08, z: 15.05, ry: -Math.PI / 2, label: '镜界电竞观战馆',
    approach: [-1.45, 15.05],
    route: [[-8, 5.2], [-3, 5.2], [-2.65, 15.05], [-1.45, 15.05]],
  },
  {
    key: 'gameroom', x: -14.92, z: -14.55, ry: Math.PI / 2, label: '团子轰趴馆',
    // Stop on the widened sidewalk outside the rotated frontage. The approach
    // point is kept separate from the door so the player is never pushed
    // sideways by the venue's own facade collider.
    approach: [-13.8, -14.55],
    route: [[-8, 5.2], [-11.7, 5.2], [-11.7, -14.55], [-13.8, -14.55]],
  },
];

/** 低频原创都市异象点，贴在三条视觉轴边缘，不扩张动线。 */
export const ANOMALY_POINTS: CityAnomaly[] = [
  { id: 'a-cinema-poster', x: 26.5, z: -4.8, r: 2.8 },
  { id: 'b-crossing-glow', x: -8, z: 1, r: 3.2 },
  { id: 'c-club-alley', x: -13.2, z: -20, r: 2.8 },
];

/** World-space collider dimensions become local frontage/depth after a quarter turn. */
export function cityBuildingLocalSize(building: CityBuilding): { frontage: number; depth: number } {
  const quarterTurns = Math.round((building.ry ?? 0) / (Math.PI / 2));
  return Math.abs(quarterTurns) % 2 === 1
    ? { frontage: building.d, depth: building.w }
    : { frontage: building.w, depth: building.d };
}

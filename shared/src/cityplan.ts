/**
 * 月汐町·一番街平面数据。
 *
 * 坐标系：x 向东，z 向南。首阶段只开放一条 58m 的生活街，三座可进入
 * 场馆嵌在连续住宅立面中；服务端碰撞与客户端渲染共享这份坐标契约。
 */
import { seededRandom } from './math';

export interface CityRect { x: number; z: number; w: number; d: number }
export interface CityCrosswalk extends CityRect { dir: 'x' | 'z' }
export interface CityBuilding extends CityRect {
  h: number;
  ry?: number;
  style: 'shopfront' | 'tower' | 'apartment' | 'backstreet' | 'silhouette';
  sign?: { text: string; color: string };
  venue?: CityVenue['key'];
}
export interface CityVenue {
  key: 'cinema' | 'netcafe' | 'gameroom';
  x: number; z: number; ry: number; label: string;
  /** Street-side point where a player can reach the façade interaction. */
  approach: [number, number];
}
export interface CityAnomaly { id: string; x: number; z: number; r: number }

/** 62×46m 可玩边界；主街本体仅 58m。 */
export const CITY_BOUNDS = { minX: -31, maxX: 31, minZ: -23, maxZ: 23 };
export const ROAD_W = 8;
export const SIDEWALK_W = 3.5;

/** 单轴双向生活街，不再使用十字路口和四条空旷支路。 */
export const ROADS: CityRect[] = [
  { x: 0, z: 0, w: 58, d: ROAD_W },
];

/** 中段漫画化路面构图区，仍属于同一条街。 */
export const CROSSING: CityRect = { x: 0, z: 0, w: 7, d: ROAD_W };
export const CROSSWALKS: CityCrosswalk[] = [
  { x: 0, z: 0, w: 3.6, d: ROAD_W, dir: 'z' },
];

/** 两侧连续步道 + 三处入口前的小型拓宽区。 */
export const SIDEWALKS: CityRect[] = [
  { x: 0, z: -5.75, w: 58, d: SIDEWALK_W },
  { x: 0, z: 5.75, w: 58, d: SIDEWALK_W },
  { x: -17, z: -6.95, w: 10, d: 1.8 },
  { x: 0, z: 6.95, w: 10, d: 1.8 },
  { x: 17, z: -6.95, w: 10, d: 1.8 },
];

const b = (
  x: number, z: number, w: number, d: number, h: number,
  style: CityBuilding['style'], extra?: Partial<CityBuilding>,
): CityBuilding => ({ x, z, w, d, h, style, ...extra });

/**
 * 连续住宅街墙：三座场馆与三栋住宅交错，首层有橱窗与门棚，上层是阳台、
 * 外廊和暖窗。密度来自立面层次，不靠扩大地图。
 */
const ACTIVE_BUILDINGS: CityBuilding[] = [
  // 北侧：影院—住宅—轰趴馆
  b(-19, -13.1, 19, 10.2, 14, 'shopfront', {
    venue: 'cinema', sign: { text: '星汐 CINEMA', color: '#ff3f6c' },
  }),
  b(0, -13.1, 14.5, 10.2, 18, 'apartment', {
    sign: { text: '月汐荘', color: '#ffd34f' },
  }),
  b(19, -13.1, 19, 10.2, 13, 'shopfront', {
    venue: 'gameroom', sign: { text: '团子 CLUB', color: '#ff704d' },
  }),
  // 南侧：住宅—电竞馆—住宅
  b(-20.5, 13.1, 17, 10.2, 16, 'backstreet', {
    sign: { text: '一番住宅', color: '#42d7c7' },
  }),
  b(0, 13.1, 19, 10.2, 12, 'shopfront', {
    venue: 'netcafe', sign: { text: '镜界 ARENA', color: '#3db7ff' },
  }),
  b(20.5, 13.1, 17, 10.2, 17, 'apartment', {
    sign: { text: '潮风公寓', color: '#ffcf66' },
  }),
];

/** 近距离天际线只承担街端层叠透视，不形成可到达的第二片地图。 */
function createSilhouettes(count: number): CityBuilding[] {
  const rnd = seededRandom(7707);
  const silhouettes: CityBuilding[] = [];
  let guard = 0;
  while (silhouettes.length < count && guard++ < count * 24) {
    const side = rnd() > 0.5 ? 1 : -1;
    const x = -48 + rnd() * 96;
    const z = side * (34 + rnd() * 24);
    const w = 9 + Math.round(rnd() * 13);
    const d = 8 + Math.round(rnd() * 10);
    const h = 18 + Math.round(rnd() * 28);
    silhouettes.push(b(x, z, w, d, h, 'silhouette', { ry: (rnd() - 0.5) * 0.18 }));
  }
  return silhouettes;
}

export const BUILDINGS: CityBuilding[] = [
  ...ACTIVE_BUILDINGS,
  ...createSilhouettes(14),
];

/** 唯一三个可进入场馆，全部在同一条街的一层。 */
export const VENUES: CityVenue[] = [
  { key: 'cinema', x: -19, z: -7.82, ry: 0, label: '星汐电影院', approach: [-19, -7.45] },
  { key: 'netcafe', x: 0, z: 7.82, ry: Math.PI, label: '镜界电竞观战馆', approach: [0, 7.45] },
  { key: 'gameroom', x: 19, z: -7.82, ry: 0, label: '团子轰趴馆', approach: [19, -7.45] },
];

/** 低频原创都市异象点，均贴在单街边缘，不扩张动线。 */
export const ANOMALY_POINTS: CityAnomaly[] = [
  { id: 'a-cinema-poster', x: -27, z: -6.2, r: 2.8 },
  { id: 'b-crossing-glow', x: 0, z: 0, r: 3.2 },
  { id: 'c-club-alley', x: 27, z: -6.2, r: 2.8 },
];

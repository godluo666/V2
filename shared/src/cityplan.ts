/**
 * 月汐町·晴日生活街平面数据 —— 服务端碰撞与客户端渲染共享的唯一坐标契约。
 * 坐标系:x 向东,z 向南(北 = -z)。所有矩形均为「中心 + 全宽全深」。
 *
 * 首段可玩区严格收在 96×84m 内，真正的逛街动线约 70m；远景楼只承担构图，
 * 不把玩家引向几百米外。中央小路口、站前口袋广场、两条生活巷和天桥形成
 * “几步就有内容”的短街节奏，同时保留七个既有场馆入口。
 */
import { seededRandom } from './math';

export interface CityRect { x: number; z: number; w: number; d: number }
export interface CityCrosswalk extends CityRect { dir: 'x' | 'z' }
export interface CityBuilding extends CityRect {
  h: number;
  ry?: number;
  style: 'shopfront' | 'tower' | 'apartment' | 'backstreet' | 'silhouette';
  sign?: { text: string; color: string };
  /** 填场馆 key 时 = 带门店面(门位见 VENUES)。 */
  venue?: string;
}
export interface CityRamp extends CityRect {
  /** 坡道下坡朝向(下坡指向的罗盘方向;n = -z)。 */
  dir: 'n' | 's' | 'e' | 'w';
}
export interface CityVenue {
  key: 'cinema' | 'netcafe' | 'gameroom' | 'cafe' | 'shop' | 'arcade' | 'tower';
  x: number; z: number; ry: number; label: string;
}
export interface CityAnomaly { id: string; x: number; z: number; r: number }

export const CITY_BOUNDS = { minX: -48, maxX: 48, minZ: -42, maxZ: 42 };

/** 双向生活街 10m，两侧 3.5m 人行道；路口压缩为 16×16m。 */
export const ROAD_W = 10;
export const SIDEWALK_W = 3.5;

/** 沥青路面矩形:路口四臂(东西南北)。 */
export const ROADS: CityRect[] = [
  { x: 27, z: 0, w: 38, d: ROAD_W },   // 东街 x 8..46
  { x: -27, z: 0, w: 38, d: ROAD_W },  // 西街 x -46..-8
  { x: 0, z: -25, w: ROAD_W, d: 34 },  // 北街 z -42..-8
  { x: 0, z: 25, w: ROAD_W, d: 34 },   // 南街 z 8..42
];

/** 中央大十字路口(斑马线区)。 */
export const CROSSING: CityRect = { x: 0, z: 0, w: 16, d: 16 };

/** 斑马线条纹带;dir = 行人穿行方向('z' 跨东西向车道,'x' 跨南北向车道)。 */
export const CROSSWALKS: CityCrosswalk[] = [
  { x: 0, z: -6.5, w: ROAD_W, d: 3, dir: 'z' },
  { x: 0, z: 6.5, w: ROAD_W, d: 3, dir: 'z' },
  { x: -6.5, z: 0, w: 3, d: ROAD_W, dir: 'x' },
  { x: 6.5, z: 0, w: 3, d: ROAD_W, dir: 'x' },
];

/** 人行道砖区(含站前广场铺装与窄巷地面)。 */
export const SIDEWALKS: CityRect[] = [
  // 东街两侧
  { x: 27, z: -6.75, w: 38, d: SIDEWALK_W },
  { x: 27, z: 6.75, w: 38, d: SIDEWALK_W },
  // 西街两侧
  { x: -27, z: -6.75, w: 38, d: SIDEWALK_W },
  { x: -27, z: 6.75, w: 38, d: SIDEWALK_W },
  // 北街两侧
  { x: -6.75, z: -25, w: SIDEWALK_W, d: 34 },
  { x: 6.75, z: -25, w: SIDEWALK_W, d: 34 },
  // 南街两侧
  { x: -6.75, z: 25, w: SIDEWALK_W, d: 34 },
  { x: 6.75, z: 25, w: SIDEWALK_W, d: 34 },
  // 站前口袋广场(出生点):只做 28×12m，不再铺成空旷大广场
  { x: 0, z: 33, w: 28, d: 12 },
  // 东/西两条短生活巷，给照片构图和近距离探索，不做迷宫
  { x: 21.5, z: 25.5, w: 25, d: 2.4 },
  { x: 33, z: 30, w: 2.4, d: 11.4 },
  { x: -21.5, z: 25.5, w: 25, d: 2.4 },
  { x: -33, z: 30, w: 2.4, d: 11.4 },
];

// ── 建筑 ────────────────────────────────────────────────────────────────────
const b = (x: number, z: number, w: number, d: number, h: number,
  style: CityBuilding['style'], extra?: Partial<CityBuilding>): CityBuilding =>
  ({ x, z, w, d, h, style, ...extra });

/** 视觉建筑体;非 silhouette 全部参与碰撞(layouts.ts 逐一 box)。 */
export const BUILDINGS: CityBuilding[] = [
  // 北侧沿街:大门面之间留出 2-3m 立面节奏，入口一眼可见
  b(22, -14.5, 18, 11, 12, 'shopfront', { venue: 'cinema', sign: { text: 'AURORA', color: '#d96f82' } }),
  b(-22, -14.5, 18, 11, 10, 'shopfront', { venue: 'netcafe', sign: { text: 'NEXUS', color: '#72a7d8' } }),
  b(-39, -14, 10, 10, 9, 'shopfront', { venue: 'shop', sign: { text: '团子百货', color: '#79cdb8' } }),
  b(39, -14, 10, 10, 10, 'shopfront', { venue: 'arcade', sign: { text: '像素宫', color: '#cf685f' } }),
  // 南街两侧:咖啡与雀庄面对面，构成最短的日常社交环
  b(-14.5, 15, 11, 12, 8, 'shopfront', { venue: 'cafe', sign: { text: '研磨咖啡', color: '#efc878' } }),
  b(14.5, 15, 11, 12, 9, 'shopfront', { venue: 'gameroom', sign: { text: '东风阁', color: '#d49a54' } }),
  // 北街终点的个人房间塔，不再需要步行一百多米
  b(14.5, -32, 11, 14, 25, 'tower', { venue: 'tower', sign: { text: '团子塔', color: '#efc878' } }),
  b(-14.5, -32, 11, 14, 15, 'apartment', { sign: { text: '月汐公寓', color: '#8eb7c8' } }),
  // 两条短巷的围合体:密度来自近景细节，不来自无尽重复街墙
  b(24, 31.8, 15.6, 10, 12, 'backstreet'),
  b(39.2, 28.5, 8.8, 17, 13, 'backstreet'),
  b(-24, 31.8, 15.6, 10, 11, 'backstreet'),
  b(-39.2, 28.5, 8.8, 17, 12, 'backstreet'),
  // 东西街端头用小体量收景，避免道路直通空无天际
  b(45, 14, 6, 10, 12, 'apartment'),
  b(-45, 14, 6, 10, 11, 'apartment'),
];

// 近距离远景楼群(r=62..108m):纯视觉、零碰撞；短街尽头仍有完整天际线。
{
  const rnd = seededRandom(7707);
  let guard = 0;
  while (BUILDINGS.filter((x) => x.style === 'silhouette').length < 18 && guard++ < 400) {
    const a = rnd() * Math.PI * 2;
    const r = 62 + rnd() * 46;
    const x = Math.round(Math.cos(a) * r);
    const z = Math.round(Math.sin(a) * r);
    // 让开主街走廊,保住街道尽头的天际线视线
    if (Math.abs(x) < 18 || Math.abs(z) < 18) continue;
    const w = 12 + Math.round(rnd() * 16);
    const d = 12 + Math.round(rnd() * 15);
    const h = 18 + Math.round(rnd() * 30);
    BUILDINGS.push(b(x, z, w, d, h, 'silhouette', { ry: (rnd() - 0.5) * 0.5 }));
  }
}

/** 小型高架人行天桥:桥面横跨北街，坡道完全收在短街内。 */
export const OVERPASS: { deck: CityRect & { y: number }; ramps: CityRamp[] } = {
  deck: { x: 0, z: -25, w: 18, d: 4, y: 4.2 },
  ramps: [
    { x: -6.75, z: -17.5, w: 3, d: 11, dir: 's' },
    { x: 6.75, z: -17.5, w: 3, d: 11, dir: 's' },
    { x: -6.75, z: -32.5, w: 3, d: 11, dir: 'n' },
    { x: 6.75, z: -32.5, w: 3, d: 11, dir: 'n' },
  ],
};

/** 封闭的旧电车入口，位于站前口袋广场西侧。 */
export const STATION: { x: number; z: number; ry: number } = { x: -20, z: 34, ry: Math.PI / 2 };

/** 七个场馆门位(全部在主街一层;tower = 个人房间塔入口)。 */
export const VENUES: CityVenue[] = [
  { key: 'cinema', x: 22, z: -8.9, ry: Math.PI, label: '极光影院 AURORA' },
  { key: 'netcafe', x: -22, z: -8.9, ry: Math.PI, label: '镜界电竞馆 NEXUS' },
  { key: 'gameroom', x: 8.9, z: 15, ry: Math.PI / 2, label: '雀庄·东风阁' },
  { key: 'cafe', x: -8.9, z: 15, ry: -Math.PI / 2, label: '研磨咖啡馆' },
  { key: 'shop', x: -39, z: -8.9, ry: Math.PI, label: '团子百货' },
  { key: 'arcade', x: 39, z: -8.9, ry: Math.PI, label: '像素宫游戏厅' },
  { key: 'tower', x: 8.9, z: -32, ry: Math.PI / 2, label: '团子塔' },
];

/** 低频事件点:两条短巷与天桥下。 */
export const ANOMALY_POINTS: CityAnomaly[] = [
  { id: 'a-alley-mouth', x: -10.5, z: 25.5, r: 3.2 },
  { id: 'b-alley-end', x: 33, z: 34.5, r: 3.5 },
  { id: 'c-overpass', x: 0, z: -21.8, r: 4 },
];

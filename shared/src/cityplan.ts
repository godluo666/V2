/**
 * 月汐町·结缘坂：完整重建后的坡地住宅街坐标契约。
 *
 * 旧一番街的宽直路、错位双巷、高楼剪影与端景仓库已全部退役。这里仅保留
 * 三个场馆入口的业务键，其余道路、建筑和路线均属于新的窄弯坡地街区。
 */

export interface CityRect { x: number; z: number; w: number; d: number }
export interface CityCrosswalk extends CityRect { dir: 'x' | 'z' }
export interface CityRoadMark extends CityRect { ry: number }
export type CityGroundUse =
  | 'general-store' | 'florist' | 'cafe' | 'laundry'
  | 'residence' | 'stationery' | 'fishmonger' | 'watch-repair'
  | 'pharmacy' | 'restaurant';

export interface CityFacadeSign {
  text: string;
  color: string;
  anchor: number;
  y: number;
  w: number;
  h: number;
  vertical?: boolean;
  projecting?: boolean;
}

export interface CityBuilding extends CityRect {
  h: number;
  ry?: number;
  /** Rebuilt street contract: only human-scale two/three-storey forms exist. */
  style: 'shopfront' | 'apartment' | 'backstreet';
  sign?: { text: string; color: string };
  facadeSigns?: CityFacadeSign[];
  venue?: CityVenue['key'];
  backdrop?: boolean;
  groundUse?: CityGroundUse;
  businessState?: 'open' | 'closed';
  businessNotice?: string;
}

export interface CityVenue {
  key: 'cinema' | 'netcafe' | 'gameroom';
  x: number; z: number; ry: number; label: string;
  approach: [number, number];
  route: Array<[number, number]>;
}

export const CITY_BOUNDS = { minX: -42, maxX: 42, minZ: -18, maxZ: 18 };
export const ROAD_W = 5.2;
export const ALLEY_W = 3;
export const SIDEWALK_W = 1.1;

/** Main route is visually curved by the client ribbon; these rectangles remain
 * the compact debug/automation footprint and the northern stair-lane branch. */
export const ROADS: CityRect[] = [
  { x: 0, z: 0, w: 84, d: ROAD_W },
  { x: -12.4, z: -10.8, w: ALLEY_W, d: 14.4 },
];
export const CROSSINGS: CityRoadMark[] = [];
export const CROSSWALKS: CityCrosswalk[] = [];
export const SIDEWALKS: CityRect[] = [
  { x: 0, z: -3.25, w: 84, d: SIDEWALK_W },
  { x: 0, z: 3.25, w: 84, d: SIDEWALK_W },
];

/** S-shaped centre line and gentle west-to-east rise, shared by layout/tests. */
export function streetCenterZ(x: number): number {
  return Math.sin((x + 4) / 18) * 3.2 + x * 0.025;
}

export function streetHeight(x: number): number {
  return ((x - CITY_BOUNDS.minX) / (CITY_BOUNDS.maxX - CITY_BOUNDS.minX)) * 2.8;
}

const b = (
  x: number, side: -1 | 1, w: number, h: number,
  style: CityBuilding['style'], extra: Partial<CityBuilding> = {},
): CityBuilding => ({
  x,
  z: streetCenterZ(x) + side * 8.2,
  w,
  d: 6,
  h,
  ry: -Math.atan(Math.cos((x + 4) / 18) * (3.2 / 18) + 0.025) + (side > 0 ? Math.PI : 0),
  style,
  ...extra,
});

/**
 * Entirely new two/three-storey street wall. The north row opens at x≈-6 for
 * the climbable stone stair lane; the south row opens at x≈-4 for the game
 * stall courtyard. No old tower, silhouette, station or warehouse survives.
 */
export const BUILDINGS: CityBuilding[] = [
  b(-39, -1, 5.5, 6.6, 'shopfront', {
    groundUse: 'general-store', businessState: 'open', businessNotice: '8:30–19:00',
    sign: { text: '结缘杂货', color: '#806b50' },
  }),
  b(-32.8, -1, 6.5, 9.1, 'apartment', {
    groundUse: 'residence', sign: { text: '朝雾荘', color: '#746a5c' },
  }),
  b(-25.5, -1, 6.8, 7.2, 'shopfront', {
    venue: 'gameroom', sign: { text: '团子活动室', color: '#aa705d' },
  }),
  b(-18.4, -1, 6.2, 6.8, 'shopfront', {
    groundUse: 'stationery', businessState: 'open', businessNotice: '纸与笔 9:00–18:30',
    sign: { text: '青空文具', color: '#6f7d70' },
  }),
  // x=-12.4 intentionally left open for the stair lane.
  b(-6.7, -1, 6.5, 6.7, 'shopfront', {
    groundUse: 'florist', businessState: 'open', businessNotice: '花と鉢植え',
    sign: { text: '小春花房', color: '#71806b' },
  }),
  b(0.5, -1, 7.2, 7.1, 'shopfront', {
    groundUse: 'cafe', businessState: 'open', businessNotice: '珈琲 9:00–18:00',
    sign: { text: '木漏日珈琲', color: '#8e654e' },
  }),
  b(8.1, -1, 7, 9.2, 'shopfront', {
    venue: 'cinema', sign: { text: '星汐小剧场', color: '#9d6967' },
  }),
  b(15.7, -1, 6.8, 6.8, 'shopfront', {
    groundUse: 'laundry', businessState: 'open', businessNotice: '自助洗衣 24H',
    sign: { text: '白云洗衣', color: '#6f8991' },
  }),
  b(23.1, -1, 7.4, 9.4, 'apartment', {
    groundUse: 'residence', sign: { text: '夕风住宅', color: '#71695d' },
  }),
  b(31, -1, 7.5, 7.0, 'shopfront', {
    groundUse: 'restaurant', businessState: 'open', businessNotice: '定食 11:30–20:00',
    sign: { text: '坂上食堂', color: '#8a6752' },
  }),
  b(38.8, -1, 5.8, 8.9, 'apartment', { groundUse: 'residence' }),

  b(-39, 1, 5.8, 6.7, 'backstreet', { groundUse: 'residence' }),
  b(-32.5, 1, 6.5, 9.3, 'apartment', { groundUse: 'residence' }),
  b(-25.2, 1, 6.7, 6.9, 'shopfront', {
    groundUse: 'watch-repair', businessState: 'open', businessNotice: '時計修理',
    sign: { text: '三日月時計店', color: '#756b58' },
  }),
  b(-17.5, 1, 7.2, 9.5, 'apartment', { groundUse: 'residence' }),
  b(-9.3, 1, 6.6, 6.6, 'shopfront', {
    groundUse: 'fishmonger', businessState: 'open', businessNotice: '本日入荷',
    sign: { text: '汐见鲜鱼', color: '#627d83' },
  }),
  // x≈-2 courtyard is reserved for the physical flying-chess stall.
  b(4.2, 1, 7.2, 7.2, 'backstreet', { groundUse: 'residence' }),
  b(12, 1, 7.5, 9.2, 'apartment', { groundUse: 'residence' }),
  b(20, 1, 6.6, 9.4, 'shopfront', {
    venue: 'netcafe', sign: { text: '镜界游戏屋', color: '#687f86' },
  }),
  b(28, 1, 6.7, 7.0, 'shopfront', {
    groundUse: 'pharmacy', businessState: 'open', businessNotice: '9:00–19:00',
    sign: { text: '若叶药房', color: '#6c806e' },
  }),
  b(36.3, 1, 7, 9.1, 'apartment', { groundUse: 'residence' }),
];

function venueFromBuilding(key: CityVenue['key'], label: string): CityVenue {
  const building = BUILDINGS.find((candidate) => candidate.venue === key);
  if (!building) throw new Error(`missing entrance building ${key}`);
  const ry = building.ry ?? 0;
  const normalX = Math.sin(ry);
  const normalZ = Math.cos(ry);
  const front = building.d / 2 + 0.08;
  const x = building.x + normalX * front;
  const z = building.z + normalZ * front;
  const approach: [number, number] = [x + normalX * 0.82, z + normalZ * 0.82];
  const route = ([
    [-38, streetCenterZ(-38)],
    [-30, streetCenterZ(-30)],
    [-22, streetCenterZ(-22)],
    [-14, streetCenterZ(-14)],
    [-6, streetCenterZ(-6)],
    [0, streetCenterZ(0)],
    [8, streetCenterZ(8)],
    [16, streetCenterZ(16)],
    [24, streetCenterZ(24)],
    [32, streetCenterZ(32)],
  ] satisfies Array<[number, number]>).filter(([x]) => x <= building.x + 1.5);
  route.push([building.x, streetCenterZ(building.x)], approach);
  return { key, x, z, ry, label, approach, route };
}

/** The only data retained from the previous map is the three entrance keys. */
export const VENUES: CityVenue[] = [
  venueFromBuilding('cinema', '星汐小剧场'),
  venueFromBuilding('netcafe', '镜界游戏屋'),
  venueFromBuilding('gameroom', '团子活动室'),
];

export function cityBuildingLocalSize(building: CityBuilding): { frontage: number; depth: number } {
  return { frontage: building.w, depth: building.d };
}

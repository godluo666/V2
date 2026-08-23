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
  /** Legacy style names remain in the renderer type surface, but the rebuilt
   * map data below intentionally instantiates only human-scale styles. */
  style: 'shopfront' | 'apartment' | 'backstreet' | 'mediaTower' | 'tower' | 'silhouette';
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

export const CITY_BOUNDS = { minX: -24, maxX: 24, minZ: -12, maxZ: 12 };
export const ROAD_W = 4.2;
export const ALLEY_W = 2.6;
export const SIDEWALK_W = 0.9;

/** Main route is visually curved by the client ribbon; these rectangles remain
 * the compact debug/automation footprint and the northern stair-lane branch. */
export const ROADS: CityRect[] = [
  { x: 0, z: 0, w: 48, d: ROAD_W },
  { x: -6.2, z: -7.4, w: ALLEY_W, d: 9.2 },
];
export const CROSSINGS: CityRoadMark[] = [];
export const CROSSWALKS: CityCrosswalk[] = [];
export const SIDEWALKS: CityRect[] = [
  { x: 0, z: -2.55, w: 48, d: SIDEWALK_W },
  { x: 0, z: 2.55, w: 48, d: SIDEWALK_W },
];

/** S-shaped centre line and gentle west-to-east rise, shared by layout/tests. */
export function streetCenterZ(x: number): number {
  return Math.sin(x / 12) * 1.35 + x * 0.045;
}

export function streetHeight(x: number): number {
  return ((x - CITY_BOUNDS.minX) / (CITY_BOUNDS.maxX - CITY_BOUNDS.minX)) * 1.6;
}

const b = (
  x: number, side: -1 | 1, w: number, h: number,
  style: CityBuilding['style'], extra: Partial<CityBuilding> = {},
): CityBuilding => ({
  x,
  z: streetCenterZ(x) + side * 5.65,
  w,
  d: 4.35,
  h,
  ry: -Math.atan(Math.cos(x / 12) * (1.35 / 12) + 0.045),
  style,
  ...extra,
});

/**
 * Entirely new two/three-storey street wall. The north row opens at x≈-6 for
 * the climbable stone stair lane; the south row opens at x≈-4 for the game
 * stall courtyard. No old tower, silhouette, station or warehouse survives.
 */
export const BUILDINGS: CityBuilding[] = [
  b(-21.4, -1, 4.5, 5.4, 'shopfront', {
    groundUse: 'general-store', businessState: 'open', businessNotice: '8:30–19:00',
    sign: { text: '结缘杂货', color: '#806b50' },
  }),
  b(-16.3, -1, 5.1, 5.8, 'shopfront', {
    venue: 'gameroom', sign: { text: '团子活动室', color: '#aa705d' },
  }),
  b(-11.3, -1, 4.2, 7.8, 'apartment', {
    groundUse: 'residence', sign: { text: '雨音荘', color: '#746a5c' },
  }),
  // x=-6.2 intentionally left open for the stair lane.
  b(-1.8, -1, 4.5, 5.6, 'shopfront', {
    groundUse: 'florist', businessState: 'open', businessNotice: '花と鉢植え',
    sign: { text: '小春花房', color: '#71806b' },
  }),
  b(3.2, -1, 4.7, 5.7, 'shopfront', {
    groundUse: 'cafe', businessState: 'open', businessNotice: '珈琲 9:00–18:00',
    sign: { text: '木漏日珈琲', color: '#8e654e' },
  }),
  b(8.4, -1, 5.5, 8.0, 'shopfront', {
    venue: 'cinema', sign: { text: '星汐小剧场', color: '#9d6967' },
  }),
  b(14.2, -1, 4.8, 5.5, 'shopfront', {
    groundUse: 'laundry', businessState: 'open', businessNotice: '自助洗衣 24H',
    sign: { text: '白云洗衣', color: '#6f8991' },
  }),
  b(19.6, -1, 5.3, 7.7, 'apartment', {
    groundUse: 'residence', sign: { text: '夕风住宅', color: '#71695d' },
  }),

  b(-21.0, 1, 5.1, 5.6, 'backstreet', { groundUse: 'residence' }),
  b(-15.4, 1, 4.8, 7.9, 'apartment', { groundUse: 'residence' }),
  b(-10.2, 1, 4.7, 5.5, 'backstreet', { groundUse: 'residence' }),
  // x≈-4 courtyard is reserved for the physical flying-chess stall.
  b(3.8, 1, 4.8, 5.7, 'backstreet', { groundUse: 'residence' }),
  b(9.1, 1, 5.0, 5.6, 'backstreet', { groundUse: 'residence' }),
  b(15.2, 1, 6.0, 8.1, 'shopfront', {
    venue: 'netcafe', sign: { text: '镜界游戏屋', color: '#687f86' },
  }),
  b(21.2, 1, 4.3, 5.4, 'backstreet', { groundUse: 'residence' }),
];

function venueFromBuilding(key: CityVenue['key'], label: string): CityVenue {
  const building = BUILDINGS.find((candidate) => candidate.venue === key);
  if (!building) throw new Error(`missing entrance building ${key}`);
  const side = building.z < streetCenterZ(building.x) ? -1 : 1;
  const z = building.z - side * (building.d / 2 + 0.08);
  const approach: [number, number] = [building.x, z - side * 0.72];
  const route = ([
    [-21.5, streetCenterZ(-21.5)],
    [-15, streetCenterZ(-15)],
    [-8, streetCenterZ(-8)],
    [0, streetCenterZ(0)],
    [8, streetCenterZ(8)],
    [15, streetCenterZ(15)],
  ] satisfies Array<[number, number]>).filter(([x]) => x <= building.x + 1.5);
  route.push([building.x, streetCenterZ(building.x)], approach);
  return { key, x: building.x, z, ry: side < 0 ? 0 : Math.PI, label, approach, route };
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

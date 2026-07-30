/**
 * 「月汐町·晴日生活街」全局色板。
 * 基底采用柔和蓝天、暖白墙、浅石板和新鲜植物色；夜雨仍由昼夜系统动态压暗，
 * 不再把黄昏灰蓝当成白天默认色。
 */

/** 十六进制颜色字符串('#rrggbb')。 */
export type HexColor = `#${string}`;

// ── §2.1 环境低饱和组(约 80% 画面) ────────────────────────────────────────
export const ENV = {
  /** 晴日下午的蓝天顶。 */
  skyTopDusk: '#63b7e8',
  /** 深夜蓝，保留日夜事件但不污染白天。 */
  skyTopNight: '#1b2942',
  /** 日间空气感地平线。 */
  skyHorizon: '#dceff6',
  /** 傍晚的桃金色残照。 */
  skyAfterglow: '#f0b99c',
  /** 远景楼第 1 层(最近)。 */
  bgSilhouetteA: '#7895a4',
  /** 远景楼第 2 层。 */
  bgSilhouetteB: '#91aab5',
  /** 远景楼第 3 层(融入空气透视)。 */
  bgSilhouetteC: '#adc1c8',
  /** 晴日中性沥青，避免大片黑灰。 */
  roadAsphalt: '#68757d',
  /** 暖浅灰人行道砖。 */
  sidewalk: '#c8c2b4',
  /** 人行道砖缝。 */
  sidewalkSeam: '#aaa699',
  /** 建筑主墙面 A:浅蓝白灰泥。 */
  wallA: '#b7cad0',
  /** 建筑主墙面 B:暖粉灰旧公寓。 */
  wallB: '#c9b8b1',
  /** 建筑主墙面 C:低饱和鼠尾草青。 */
  wallC: '#9fb8ae',
  /** 沿街小店暖白墙。 */
  wallPale: '#ded4c4',
  /** 金属(栏杆/灯杆/空调外机)。 */
  metal: '#68747a',
  /** 全场统一描边色:柔和深蓝灰。 */
  outline: '#344a58',
  /** 分层雾近端。 */
  fogNear: '#b7d4df',
  /** 分层雾远端。 */
  fogFar: '#deedf1',
} as const satisfies Record<string, HexColor>;

// ── §2.2 强调组(约 20% 画面,小面积、克制) ────────────────────────────────
export const ACCENT = {
  /** 钠灯路灯光:脏黄,全图主要暖光源。 */
  lampSodium: '#efb65e',
  /** 室内窗光:暖黄,零散亮窗自发光。 */
  windowWarm: '#f6d594',
  /** 便利店招牌:青绿,唯一大块亮色。 */
  konbiniSign: '#7fd1c0',
  /** 电影院招牌 AURORA:暗玫红霓虹(亮度克制,禁止过曝)。 */
  cinemaSign: '#d96f82',
  /** 网吧招牌 NEXUS:蓝青霓虹。 */
  netcafeSign: '#72a7d8',
  /** 雀庄灯笼「东风阁」:暖橙。 */
  mahjongLantern: '#d49a54',
  /** 自动售货机(红款),城市生活感锚点。 */
  vendingRed: '#c85f58',
  /** 自动售货机(蓝款)。 */
  vendingBlue: '#4f83bd',
  /** 交通信号红灯(路口慢周期切换)。 */
  trafficRed: '#c94f4f',
  /** 交通信号绿灯。 */
  trafficGreen: '#4fc97a',
  /** 超自然强调(蓝紫):只用于异常现象,小面积、低频。 */
  anomalyViolet: '#7a4fd1',
  /** 超自然强调(青绿):同上。 */
  anomalyTeal: '#43d1a4',
} as const satisfies Record<string, HexColor>;

/** ENV 组颜色键名。 */
export type EnvColorName = keyof typeof ENV;
/** ACCENT 组颜色键名。 */
export type AccentColorName = keyof typeof ACCENT;
/** 全色板任意键名。 */
export type CityColorName = EnvColorName | AccentColorName;

/** 合并视图:按键名取任意城市颜色(只读)。 */
export const CITY_PALETTE: Readonly<Record<CityColorName, HexColor>> = {
  ...ENV,
  ...ACCENT,
};

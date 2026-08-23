/**
 * 「月汐町·结缘坂」原创暖色住宅街色板。
 * 以晴空、暖白住宅、灰绿植物和柔和蓝紫阴影建立下午层次；红/青/黄色只
 * 落在小招牌、雨棚和灯光焦点上，保持低饱和、奶油橙阳光的生活街气质。
 */

/** 十六进制颜色字符串('#rrggbb')。 */
export type HexColor = `#${string}`;

// ── §2.1 环境低饱和组(约 80% 画面) ────────────────────────────────────────
export const ENV = {
  /** 晴日下午的蓝天顶。 */
  skyTopDusk: '#78b6d1',
  /** 深夜蓝，保留日夜事件但不污染白天。 */
  skyTopNight: '#1b2942',
  /** 日间空气感地平线。 */
  skyHorizon: '#f5e6d2',
  /** 傍晚的桃金色残照。 */
  skyAfterglow: '#edc5a4',
  /** 远景楼第 1 层(最近)。 */
  bgSilhouetteA: '#6f7d83',
  /** 远景楼第 2 层。 */
  bgSilhouetteB: '#8b9899',
  /** 远景楼第 3 层(融入空气透视)。 */
  bgSilhouetteC: '#b4bdbc',
  /** 晴日中性沥青，避免大片黑灰。 */
  roadAsphalt: '#656965',
  /** 暖浅灰人行道砖。 */
  sidewalk: '#e4ddd0',
  /** 人行道砖缝。 */
  sidewalkSeam: '#b9b1a4',
  /** 建筑主墙面 A:浅蓝白灰泥。 */
  wallA: '#e4ded1',
  /** 建筑主墙面 B:暖粉灰旧公寓。 */
  wallB: '#cbb9ad',
  /** 建筑主墙面 C:低饱和鼠尾草青。 */
  wallC: '#a9b5a2',
  /** 沿街小店暖白墙。 */
  wallPale: '#f0e6d4',
  /** 金属(栏杆/灯杆/空调外机)。 */
  metal: '#596166',
  /** 全场统一描边色:柔和深蓝灰。 */
  outline: '#464e53',
  /** 分层雾近端。 */
  fogNear: '#c6d7dc',
  /** 分层雾远端。 */
  fogFar: '#f3e9db',
} as const satisfies Record<string, HexColor>;

// ── §2.2 强调组(约 20% 画面,小面积、克制) ────────────────────────────────
export const ACCENT = {
  /** 钠灯路灯光:脏黄,全图主要暖光源。 */
  lampSodium: '#f6cb81',
  /** 室内窗光:暖黄,零散亮窗自发光。 */
  windowWarm: '#f2c887',
  /** 便利店招牌:青绿,唯一大块亮色。 */
  konbiniSign: '#78a99c',
  /** 电影院招牌 AURORA:暗玫红霓虹(亮度克制,禁止过曝)。 */
  cinemaSign: '#b86f70',
  /** 网吧招牌 NEXUS:蓝青霓虹。 */
  netcafeSign: '#6c94a5',
  /** 雀庄灯笼「东风阁」:暖橙。 */
  mahjongLantern: '#c77d5c',
  /** 自动售货机(红款),城市生活感锚点。 */
  vendingRed: '#b9635f',
  /** 自动售货机(蓝款)。 */
  vendingBlue: '#5e829a',
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

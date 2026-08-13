/**
 * 「月汐町·一番街」原创漫画都市色板。
 * 以晴空、暖白住宅和深墨结构建立强明暗，红/青/黄色只落在招牌、雨棚和
 * 路面图形上，形成绚烂但仍可读的都市街头。
 */

/** 十六进制颜色字符串('#rrggbb')。 */
export type HexColor = `#${string}`;

// ── §2.1 环境低饱和组(约 80% 画面) ────────────────────────────────────────
export const ENV = {
  /** 晴日下午的蓝天顶。 */
  skyTopDusk: '#47bdf2',
  /** 深夜蓝，保留日夜事件但不污染白天。 */
  skyTopNight: '#1b2942',
  /** 日间空气感地平线。 */
  skyHorizon: '#ecf8ff',
  /** 傍晚的桃金色残照。 */
  skyAfterglow: '#f0b99c',
  /** 远景楼第 1 层(最近)。 */
  bgSilhouetteA: '#314258',
  /** 远景楼第 2 层。 */
  bgSilhouetteB: '#536f89',
  /** 远景楼第 3 层(融入空气透视)。 */
  bgSilhouetteC: '#8fa6b7',
  /** 晴日中性沥青，避免大片黑灰。 */
  roadAsphalt: '#414448',
  /** 暖浅灰人行道砖。 */
  sidewalk: '#e4ddd0',
  /** 人行道砖缝。 */
  sidewalkSeam: '#b9b1a4',
  /** 建筑主墙面 A:浅蓝白灰泥。 */
  wallA: '#dedbd2',
  /** 建筑主墙面 B:暖粉灰旧公寓。 */
  wallB: '#8a6573',
  /** 建筑主墙面 C:低饱和鼠尾草青。 */
  wallC: '#4d777a',
  /** 沿街小店暖白墙。 */
  wallPale: '#eee1c8',
  /** 金属(栏杆/灯杆/空调外机)。 */
  metal: '#252a33',
  /** 全场统一描边色:柔和深蓝灰。 */
  outline: '#11131a',
  /** 分层雾近端。 */
  fogNear: '#b8e0ef',
  /** 分层雾远端。 */
  fogFar: '#eef8fb',
} as const satisfies Record<string, HexColor>;

// ── §2.2 强调组(约 20% 画面,小面积、克制) ────────────────────────────────
export const ACCENT = {
  /** 钠灯路灯光:脏黄,全图主要暖光源。 */
  lampSodium: '#ffd34f',
  /** 室内窗光:暖黄,零散亮窗自发光。 */
  windowWarm: '#ffd98a',
  /** 便利店招牌:青绿,唯一大块亮色。 */
  konbiniSign: '#42d7c7',
  /** 电影院招牌 AURORA:暗玫红霓虹(亮度克制,禁止过曝)。 */
  cinemaSign: '#ff3f6c',
  /** 网吧招牌 NEXUS:蓝青霓虹。 */
  netcafeSign: '#3db7ff',
  /** 雀庄灯笼「东风阁」:暖橙。 */
  mahjongLantern: '#ff704d',
  /** 自动售货机(红款),城市生活感锚点。 */
  vendingRed: '#e83d56',
  /** 自动售货机(蓝款)。 */
  vendingBlue: '#247bc7',
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

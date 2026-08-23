/**
 * 月汐町昼夜光照关键帧。
 * 晴朗白天是默认主画面:高亮蓝天、暖白太阳、清晰柔影；黄昏、夜晚、阴雨仍保留
 * 为动态状态，但不会再把整段白天压成灰蓝黄昏。
 */
import * as THREE from 'three';
import { ENV } from '../city/palette';
import type { Weather } from '@nexuspark/shared';

export interface EnvSample {
  sunDir: THREE.Vector3;
  sunIntensity: number;
  sunColor: THREE.Color;
  moonIntensity: number;
  hemiIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  fogColor: THREE.Color;
  fogDensityMul: number;
  starOpacity: number;
  lampsOn: boolean;
  cloudTint: THREE.Color;
}

/** 新建一份可复用的采样输出(供 SkySystem 之外的订阅者各持一份,避免共享 scratch 冲突)。 */
export function createEnvSample(): EnvSample {
  return {
    sunDir: new THREE.Vector3(0, 1, 0),
    sunIntensity: 2.1,
    sunColor: new THREE.Color(),
    moonIntensity: 0,
    hemiIntensity: 0.82,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    skyTop: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    fogColor: new THREE.Color(),
    fogDensityMul: 1,
    starOpacity: 0,
    lampsOn: true,
    cloudTint: new THREE.Color(),
  };
}

interface Key {
  t: number;
  skyTop: string; skyHorizon: string;
  sun: number; sunColor: string;
  hemi: number; hemiSky: string; hemiGround: string;
  stars: number;
}

// 日间太阳保持 1.9-2.35 的清晰主光；夜间用低强度月光和半球光托住轮廓。
const KEYS: Key[] = [
  { t: 0.0,  skyTop: '#1b2942', skyHorizon: '#536a82', sun: 0.34, sunColor: '#9eb6df', hemi: 0.38, hemiSky: '#405578', hemiGround: '#283449', stars: 1 },
  { t: 0.22, skyTop: '#1b2942', skyHorizon: '#536a82', sun: 0.34, sunColor: '#9eb6df', hemi: 0.38, hemiSky: '#405578', hemiGround: '#283449', stars: 1 },
  // 海边金色黎明
  { t: 0.28, skyTop: '#8bc9ed', skyHorizon: '#f5d7ad', sun: 1.15, sunColor: '#ffe2ac', hemi: 0.7, hemiSky: '#a9d7ee', hemiGround: '#78836f', stars: 0.18 },
  // 明媚晴日(默认服务器从 0.35 开始)
  { t: 0.36, skyTop: '#47bdf2', skyHorizon: '#ecf8ff', sun: 2.2, sunColor: '#fff1c8', hemi: 0.92, hemiSky: '#c7e8f5', hemiGround: '#87996f', stars: 0 },
  { t: 0.5,  skyTop: '#38afe8', skyHorizon: '#f2fbff', sun: 2.45, sunColor: '#fff4ce', hemi: 1, hemiSky: '#d0edf7', hemiGround: '#8ca076', stars: 0 },
  { t: 0.66, skyTop: '#76b6dc', skyHorizon: '#fff1d8', sun: 1.95, sunColor: '#ffe2ad', hemi: 0.88, hemiSky: '#c9d9eb', hemiGround: '#8f8da4', stars: 0 },
  // 奶油橙晚光：保持蓝紫阴影，不进入戏剧化的通红晚霞。
  { t: 0.74, skyTop: '#75aeda', skyHorizon: '#efd7c6', sun: 1.35, sunColor: '#ffd7a5', hemi: 0.7, hemiSky: '#a5bfd2', hemiGround: '#827f99', stars: 0.08 },
  { t: 0.8,  skyTop: '#657fa8', skyHorizon: '#ddc9c1', sun: 0.82, sunColor: '#f6c9a2', hemi: 0.56, hemiSky: '#7f91ae', hemiGround: '#67677f', stars: 0.42 },
  { t: 0.88, skyTop: '#1b2942', skyHorizon: '#536a82', sun: 0.34, sunColor: '#9eb6df', hemi: 0.38, hemiSky: '#405578', hemiGround: '#283449', stars: 1 },
  { t: 1.0,  skyTop: '#1b2942', skyHorizon: '#536a82', sun: 0.34, sunColor: '#9eb6df', hemi: 0.38, hemiSky: '#405578', hemiGround: '#283449', stars: 1 },
];

/** 夜间也保留可读轮廓。 */
const HEMI_FLOOR = 0.36;

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function lerpKeyColor(a: string, b: string, f: number, out: THREE.Color): THREE.Color {
  tmpA.set(a); tmpB.set(b);
  return out.copy(tmpA).lerp(tmpB, f);
}

const scratch: EnvSample = createEnvSample();

// 阴雨覆盖色仍保持清亮空气感，而不是回到黑灰滤镜。
const GRAY_TOP = new THREE.Color('#8aa7b8');
const GRAY_HORIZON = new THREE.Color('#c9d6d9');
// 分层雾双端
const FOG_NEAR = new THREE.Color(ENV.fogNear);
const FOG_FAR = new THREE.Color(ENV.fogFar);
const WHITE = new THREE.Color('#ffffff');

export function sampleEnv(tod: number, weather: Weather, out: EnvSample = scratch): EnvSample {
  const t = ((tod % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t < t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const f = THREE.MathUtils.clamp((t - a.t) / Math.max(1e-5, b.t - a.t), 0, 1);

  // 方向:白天沿黄道走;夜里(太阳落山后)这就是"月光"的方位,
  // SkySystem 对灯位 y 做了 max(6,·) 抬升,方向感保留、光不会从地下打。
  const theta = (t - 0.25) * Math.PI * 2;
  out.sunDir.set(Math.cos(theta), Math.sin(theta), 0.35).normalize();

  out.sunIntensity = THREE.MathUtils.lerp(a.sun, b.sun, f);
  lerpKeyColor(a.sunColor, b.sunColor, f, out.sunColor);
  out.hemiIntensity = THREE.MathUtils.lerp(a.hemi, b.hemi, f);
  lerpKeyColor(a.hemiSky, b.hemiSky, f, out.hemiSky);
  lerpKeyColor(a.hemiGround, b.hemiGround, f, out.hemiGround);
  lerpKeyColor(a.skyTop, b.skyTop, f, out.skyTop);
  lerpKeyColor(a.skyHorizon, b.skyHorizon, f, out.skyHorizon);
  out.starOpacity = THREE.MathUtils.lerp(a.stars, b.stars, f);
  out.fogDensityMul = 1;

  // Weather overrides
  if (weather === 'cloudy') {
    out.sunIntensity *= 0.72;
    out.skyTop.lerp(GRAY_TOP, 0.3);
    out.skyHorizon.lerp(GRAY_HORIZON, 0.24);
    out.hemiIntensity *= 0.94;
    out.starOpacity *= 0.35;
    out.fogDensityMul = 1.2;
  } else if (weather === 'rain') {
    out.sunIntensity *= 0.48;
    out.skyTop.lerp(GRAY_TOP, 0.55);
    out.skyHorizon.lerp(GRAY_HORIZON, 0.44);
    out.hemiIntensity *= 0.9;
    out.starOpacity = 0;
    out.fogDensityMul = 1.55;
  }

  // 夜间可读性下限(§3):hemi 不低于 0.3,天气也压不穿。
  out.hemiIntensity = Math.max(out.hemiIntensity, HEMI_FLOOR);

  // 夜里再补一盏反向弱月(填充,不投影)
  out.moonIntensity = 0.22 * out.starOpacity;
  // 路灯/招牌点亮窗口:黄昏→夜 + 雨天全天
  out.lampsOn = t < 0.3 || t > 0.7 || weather === 'rain';

  // 分层雾近似:白天偏远端亮灰 #585d73,夜里滑向近端 #3d4257;
  // 再向天空地平线拉 35% 避免穹顶接缝。
  out.fogColor.copy(FOG_FAR).lerp(FOG_NEAR, out.starOpacity * 0.85).lerp(out.skyHorizon, 0.35);

  // 云染色:阴天城市上空的云只比天光稍亮;夜里几乎融进天色(不发亮)。
  const dayness = 1 - out.starOpacity;
  out.cloudTint
    .copy(out.skyHorizon)
    .lerp(WHITE, (weather === 'clear' ? 0.3 : 0.14) * (0.25 + 0.75 * dayness));
  return out;
}

/** Client-side extrapolated time-of-day from the last env message. */
export function currentTod(env: { timeOfDay: number; at: number; dayLengthSec: number }): number {
  return (env.timeOfDay + (Date.now() - env.at) / 1000 / env.dayLengthSec) % 1;
}

/**
 * 「月汐町·晴日生活街」参数化赛璐璐建筑(工单 P3-2,总纲 §2/§4/§5)。
 *
 * 按 cityplan.BUILDINGS 的 style 渲染:
 * - shopfront:一层骑楼店面(卷帘门/玻璃窗/门棚/竖招牌 canvas 霓虹,venue 留门洞)
 *   + 二层住家窗(少量暖窗自发光)+ 女儿墙;
 * - mediaTower:路口椭圆媒体塔、低位巨幕与错层冠部，建立非对称城市地标;
 * - tower:路口高楼,分段体块错落 + 屋顶水塔/天线剪影 + 零星亮窗点阵(禁止整面亮);
 * - apartment / backstreet:阳台 / 外走廊 / 空调位;
 * - silhouette:纯色块二阶 toon,不描边(§4.2 背景三层)。
 *
 * 性能(§10):全部体块经 MergeBag 合并 + 顶点色(per-building 色相±3%/明度±6%
 * 种子抖动),分近景/远景两大合并网格 + 卷帘 / 暖窗 / 高楼 / 剪影各自合并;
 * 全图建筑合计 ≤ 120 draw call,silhouette 合并为 ≤ 6 mesh。
 * 构建经 BuildQueue 分帧执行,出生点 80m 半径优先(§10 加载)。
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seededRandom } from '@nexuspark/shared';
import {
  BUILDINGS, ROADS, VENUES, cityBuildingLocalSize,
} from '@nexuspark/shared/src/cityplan';
import { ENV, ACCENT } from './palette';
import { toonMat } from './toon';
import { addOutline } from './outline';
import { SPAWN_PRIORITY_RADIUS } from './quality';
import type { BuildQueue } from './progressive';
import { MergeBag, unitBox, unitCylinder, vertexToonMat, makeCanvas, canvasTexture, shade, cssShade, jitterColor } from './streets';
import { shutterTexture } from './props2';
import { surfaceMaterial } from './materials';

type Building = (typeof BUILDINGS)[number];

let _uPlane: THREE.PlaneGeometry | null = null;
function unitPlane(): THREE.PlaneGeometry {
  if (!_uPlane) _uPlane = new THREE.PlaneGeometry(1, 1);
  return _uPlane;
}

// Primary facade mass: an extruded, chamfered profile with real corner faces.
// It is intentionally separate from unitBox so the major silhouettes do not
// collapse into sharp-edged rectangular prisms when MergeBag batches them.
let _uFacade: THREE.ExtrudeGeometry | null = null;
function unitFacade(): THREE.ExtrudeGeometry {
  if (_uFacade) return _uFacade;
  const shape = new THREE.Shape();
  const c = 0.08;
  shape.moveTo(-0.5 + c, -0.5);
  shape.lineTo(0.5 - c, -0.5);
  shape.lineTo(0.5, -0.5 + c);
  shape.lineTo(0.5, 0.5 - c);
  shape.lineTo(0.5 - c, 0.5);
  shape.lineTo(-0.5 + c, 0.5);
  shape.lineTo(-0.5, 0.5 - c);
  shape.lineTo(-0.5, -0.5 + c);
  shape.closePath();
  _uFacade = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 1,
  });
  _uFacade.translate(0, 0, -0.5);
  _uFacade.computeVertexNormals();
  return _uFacade;
}

let _uWindowFrame: THREE.ExtrudeGeometry | null = null;
function unitWindowFrame(): THREE.ExtrudeGeometry {
  if (_uWindowFrame) return _uWindowFrame;
  const outer = new THREE.Shape();
  outer.moveTo(-0.5, -0.5); outer.lineTo(0.5, -0.5); outer.lineTo(0.5, 0.5);
  outer.lineTo(-0.5, 0.5); outer.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.34, -0.31); hole.lineTo(0.34, -0.31); hole.lineTo(0.34, 0.31);
  hole.lineTo(-0.34, 0.31); hole.closePath();
  outer.holes.push(hole);
  _uWindowFrame = new THREE.ExtrudeGeometry(outer, {
    depth: 0.14, bevelEnabled: true, bevelSegments: 1,
    bevelSize: 0.018, bevelThickness: 0.018, curveSegments: 1,
  });
  _uWindowFrame.translate(0, 0, -0.07);
  _uWindowFrame.computeVertexNormals();
  return _uWindowFrame;
}

// ── 朝向:显式 ry 优先,否则面向最近的马路(P3 不自造坐标,只按数据推导)────
function facingRy(b: Building): number {
  if (b.ry !== undefined) return b.ry;
  let best = Infinity;
  let dirX = 0, dirZ = 1;
  for (const r of ROADS) {
    const cx = Math.max(r.x - r.w / 2, Math.min(b.x, r.x + r.w / 2));
    const cz = Math.max(r.z - r.d / 2, Math.min(b.z, r.z + r.d / 2));
    const dd = (cx - b.x) ** 2 + (cz - b.z) ** 2;
    if (dd < best) { best = dd; dirX = cx - b.x; dirZ = cz - b.z; }
  }
  if (dirX === 0 && dirZ === 0) return 0;
  const ry = Math.atan2(dirX, dirZ);
  return Math.round(ry / (Math.PI / 2)) * (Math.PI / 2);
}

/** 局部 → 世界(局部 +z 为立面正面)。 */
function l2w(b: Building, ry: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
}
/** 世界 → 局部 x(找 venue 门位所在开间用)。 */
function w2lx(b: Building, ry: number, wx: number, wz: number): number {
  const c = Math.cos(ry), s = Math.sin(ry);
  return (wx - b.x) * c - (wz - b.z) * s;
}

/** MergeBag.box 的局部坐标版。 */
function put(
  bag: MergeBag, b: Building, ry: number,
  lx: number, y: number, lz: number,
  w: number, h: number, d: number,
  color: THREE.ColorRepresentation, extra?: { rx?: number; rz?: number; lry?: number; profile?: 'facade' | 'window' }
): void {
  const [x, z] = l2w(b, ry, lx, lz);
  const profile = extra?.profile === 'facade'
    ? unitFacade()
    : extra?.profile === 'window' ? unitWindowFrame() : unitBox();
  bag.add(profile, {
    x, y, z, ry: ry + (extra?.lry ?? 0), rx: extra?.rx, rz: extra?.rz,
    sx: w, sy: h, sz: d, color,
  });
}

/** 竖直面片(局部,面向局部 +z 方向,lry 可翻转)。 */
function putPlane(
  bag: MergeBag, b: Building, ry: number,
  lx: number, y: number, lz: number, w: number, h: number,
  color: THREE.ColorRepresentation, lry = 0
): void {
  const [x, z] = l2w(b, ry, lx, lz);
  bag.add(unitPlane(), { x, y, z, ry: ry + lry, sx: w, sy: h, sz: 1, color });
}

// ── 招牌(canvas 霓虹,全部文字程序化)──────────────────────────────────────
interface SignSpec {
  text: string; color: string;
  x: number; y: number; z: number; ry: number;
  w: number; h: number; vertical: boolean;
  projecting?: boolean;
}

const signTexCache = new Map<string, THREE.CanvasTexture>();
function signTexture(text: string, color: string, vertical: boolean): THREE.CanvasTexture {
  const key = `${text}|${color}|${vertical ? 'v' : 'h'}`;
  const hit = signTexCache.get(key);
  if (hit) return hit;
  const chars = [...text];
  const cw = vertical ? 128 : Math.max(256, chars.length * 72 + 64);
  const ch = vertical ? chars.length * 108 + 40 : 128;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.fillStyle = cssShade(ENV.outline, 0.015);
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = cssShade(color, -0.04);
  ctx.lineWidth = 6;
  ctx.strokeRect(7, 7, cw - 14, ch - 14);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.fillStyle = cssShade(color, 0.12);
  if (vertical) {
    ctx.font = 'bold 78px "Noto Sans SC", sans-serif';
    chars.forEach((chr, i) => {
      ctx.shadowBlur = 22;
      ctx.fillText(chr, cw / 2, 74 + i * 108);
      ctx.shadowBlur = 6;
      ctx.fillText(chr, cw / 2, 74 + i * 108);
    });
  } else {
    ctx.font = 'bold 72px "Noto Sans SC", sans-serif';
    ctx.shadowBlur = 22;
    ctx.fillText(text, cw / 2, ch / 2 + 4);
    ctx.shadowBlur = 6;
    ctx.fillText(text, cw / 2, ch / 2 + 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  signTexCache.set(key, tex);
  return tex;
}

function makeSignMesh(s: SignSpec): THREE.Mesh {
  const tex = signTexture(s.text, s.color, s.vertical);
  // 亮度克制(§2.2 禁止过曝):自发光 ≤ 0.8,霓虹光晕交给 P4 Bloom
  const mat = toonMat(0xffffff, {
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.78, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 0.16), mat);
  mesh.position.set(s.x, s.y, s.z);
  mesh.rotation.y = s.ry + (s.projecting ? Math.PI / 2 : 0);
  return mesh;
}

let _mediaTowerTex: THREE.CanvasTexture | null = null;
function mediaTowerTexture(): THREE.CanvasTexture {
  if (_mediaTowerTex) return _mediaTowerTex;
  const [canvas, ctx] = makeCanvas(1024);
  canvas.height = 576;
  ctx.fillStyle = '#f4eddd';
  ctx.fillRect(0, 0, 1024, 576);

  // 原创错位印刷海报：借用黑/白/红的抽象原则，不复刻任何游戏素材。
  ctx.fillStyle = '#151820';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(468, 0);
  ctx.lineTo(300, 576);
  ctx.lineTo(0, 576);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ee3657';
  ctx.beginPath();
  ctx.moveTo(390, -40);
  ctx.lineTo(1024, 70);
  ctx.lineTo(1024, 438);
  ctx.lineTo(254, 548);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd84f';
  ctx.beginPath();
  ctx.moveTo(790, 0);
  ctx.lineTo(1024, 0);
  ctx.lineTo(1024, 220);
  ctx.lineTo(872, 182);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#38d3d0';
  ctx.fillRect(0, 498, 1024, 42);

  ctx.save();
  ctx.translate(534, 280);
  ctx.rotate(-0.055);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 116px "Arial Black", "Segoe UI", sans-serif';
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#151820';
  ctx.strokeText('MOON//VISION', 7, 8);
  ctx.fillStyle = '#fff9ea';
  ctx.fillText('MOON//VISION', 0, 0);
  ctx.restore();

  ctx.fillStyle = '#fff9ea';
  ctx.font = '900 42px "Arial Black", "Segoe UI", sans-serif';
  ctx.fillText('LIVE CITY FEED', 46, 72);
  ctx.fillStyle = '#151820';
  ctx.font = '900 54px "Arial Black", "Segoe UI", sans-serif';
  ctx.fillText('07', 896, 500);
  ctx.font = '700 26px "Segoe UI", sans-serif';
  ctx.fillText('SHIOHAMA CROSS / 35.68 N', 502, 560);

  // 右下漫画网点只参与主屏构图，不作为全局重复背景。
  ctx.fillStyle = 'rgba(21,24,32,.55)';
  for (let y = 374; y < 492; y += 18) {
    for (let x = 720 + ((y / 18) % 2) * 9; x < 970; x += 18) {
      ctx.beginPath();
      ctx.arc(x, y, 4.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  _mediaTowerTex = canvasTexture(canvas, false);
  return _mediaTowerTex;
}

/** Project shared façade-sign data onto any building style. */
function appendFacadeSigns(
  b: Building,
  signs: SignSpec[],
  ry: number,
  frontage: number,
  depth: number,
): void {
  for (const sign of b.facadeSigns ?? []) {
    const lx = Math.max(-0.46, Math.min(0.46, sign.anchor)) * frontage;
    const [sx, sz] = l2w(b, ry, lx, depth / 2 + (sign.projecting ? 0.5 : 0.3));
    signs.push({
      text: sign.text,
      color: sign.color,
      x: sx,
      y: Math.min(b.h - sign.h / 2 - 0.3, sign.y),
      z: sz,
      ry,
      w: sign.w,
      h: sign.h,
      vertical: sign.vertical ?? false,
      projecting: sign.projecting,
    });
  }
}

// ── 高楼亮窗点阵贴图(共享一张,per-face UV 偏移;禁止整面亮)────────────────
let _towerDotTex: THREE.CanvasTexture | null = null;
function towerDotTexture(): THREE.CanvasTexture {
  if (_towerDotTex) return _towerDotTex;
  const rnd = seededRandom(7100);
  const [c, ctx] = makeCanvas(256);
  ctx.clearRect(0, 0, 256, 256);
  // 8×8 窗格(1 tile ≈ 8m),亮窗 ~7%,冷暖混
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const r = rnd();
      if (r > 0.09) continue;
      const warm = rnd() > 0.3;
      ctx.globalAlpha = 0.55 + rnd() * 0.45;
      ctx.fillStyle = warm
        ? cssShade(ACCENT.windowWarm, (rnd() - 0.5) * 0.08)
        : cssShade(ACCENT.konbiniSign, -0.1 + (rnd() - 0.5) * 0.06);
      ctx.fillRect(gx * 32 + 8, gy * 32 + 6, 15, 19);
    }
  }
  ctx.globalAlpha = 1;
  _towerDotTex = canvasTexture(c);
  return _towerDotTex;
}

// ── 各 style 构建器(局部坐标,front = +z)──────────────────────────────────
interface Bags {
  walls: MergeBag;      // 主体块(顶点色)
  detail: MergeBag;     // 挤出立面与带孔窗框
  shutters: MergeBag;   // 卷帘门(横纹贴图 × 顶点色)
  warm: MergeBag;       // 暖窗自发光
  signs: SignSpec[];
}

const AWNING_COLORS = [
  () => shade(ENV.wallC, -0.02),
  () => shade(ACCENT.vendingRed, -0.16, 0, -0.18),
  () => shade(ACCENT.netcafeSign, -0.18, 0, -0.2),
  () => shade(ACCENT.mahjongLantern, -0.16, 0, -0.2),
];

const WALL_BASES = [ENV.wallA, ENV.wallB, ENV.wallPale];

function buildShopfront(b: Building, out: Bags, rnd: () => number): void {
  const ry = facingRy(b);
  const wall = jitterColor(WALL_BASES[Math.floor(rnd() * WALL_BASES.length)], rnd);
  const wallDark = wall.clone().offsetHSL(0, 0, -0.05);
  const glass = shade(ENV.skyTopDusk, 0.025, 0, 0.02);
  const { frontage: w, depth: d } = cityBuildingLocalSize(b);
  const { h } = b;
  const groundH = 3.2;
  const sideFloors = Math.max(2, Math.floor((h - groundH) / 2.65));

  // 上层主体(带前后进退,破"方盒感")
  // 上层不再是一整块长方体：三段错层体块用不同退进量形成真实施工缝。
  put(out.detail, b, ry, -w * 0.31, (groundH + h) / 2, -0.22, w * 0.38, h - groundH, d - 0.65, wall, { profile: 'facade' });
  put(out.detail, b, ry, 0, (groundH + h) / 2, 0.05, w * 0.28, h - groundH - 0.22, d - 0.42, wall.clone().offsetHSL(0, 0, 0.018), { profile: 'facade' });
  put(out.detail, b, ry, w * 0.31, (groundH + h) / 2 + 0.14, -0.08, w * 0.38, h - groundH - 0.48, d - 0.82, wall.clone().offsetHSL(0, 0, -0.018), { profile: 'facade' });
  const reliefs = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < reliefs; i++) {
    const rw = w * (0.2 + rnd() * 0.22);
    const rx = (rnd() - 0.5) * (w - rw) * 0.8;
    put(out.walls, b, ry, rx, (groundH + h) / 2 + 0.1, d / 2 - 0.06, rw, h - groundH - 0.4, 0.28, wall.clone().offsetHSL(0, 0, 0.02));
  }
  // 一层骑楼:后墙 + 立柱 + 过梁
  put(out.walls, b, ry, 0, groundH / 2, d / 2 - 0.5, w, groundH, 0.3, wallDark);
  put(out.walls, b, ry, 0, groundH - 0.22, d / 2 - 0.05, w, 0.45, 0.6, wall.clone().offsetHSL(0, 0, -0.02));
  put(out.walls, b, ry, 0, 0.1, d / 2 - 0.3, w, 0.2, 0.9, shade(ENV.sidewalk, -0.03)); // 门前台基
  put(out.walls, b, ry, 0, 0.11, -d / 2 + 0.03, w + 0.18, 0.22, 0.26, wallDark);

  // 店面开间
  const nBays = Math.max(1, Math.round((w - 1) / 3.2));
  const bayW = (w - 0.8) / nBays;
  let doorBay = -1;
  if (b.venue) {
    const v = VENUES.find((vv) => vv.key === b.venue);
    const lx = v ? w2lx(b, ry, v.x, v.z) : 0;
    doorBay = Math.max(0, Math.min(nBays - 1, Math.floor((lx + (w - 0.8) / 2) / bayW)));
  }
  for (let i = 0; i < nBays; i++) {
    const bx = -(w - 0.8) / 2 + (i + 0.5) * bayW;
    // 开间立柱
    put(out.walls, b, ry, bx - bayW / 2, groundH / 2, d / 2 - 0.12, 0.34, groundH, 0.45, wall);
    if (i === nBays - 1) put(out.walls, b, ry, bx + bayW / 2, groundH / 2, d / 2 - 0.12, 0.34, groundH, 0.45, wall);
    if (i === doorBay) {
      // venue 门洞:留空 + 深色门廊(实际门/传送由 layout interactable 提供)
      put(out.walls, b, ry, bx, 2.72, d / 2 - 0.2, bayW - 0.4, 0.5, 0.24, wallDark);
      put(out.walls, b, ry, bx - (bayW - 0.5) / 2, 1.25, d / 2 - 0.2, 0.16, 2.5, 0.24, wallDark);
      put(out.walls, b, ry, bx + (bayW - 0.5) / 2, 1.25, d / 2 - 0.2, 0.16, 2.5, 0.24, wallDark);
      // 门内暖光(店还开着)
      putPlane(out.warm, b, ry, bx, 1.3, d / 2 - 0.42, bayW - 0.7, 2.3, shade(ACCENT.windowWarm, -0.04));
    } else if (rnd() < 0.5) {
      // 卷帘门(打烊)
      put(out.shutters, b, ry, bx, 1.28, d / 2 - 0.24, bayW - 0.42, 2.56, 0.07, jitterColor(ENV.wallC, rnd));
    } else {
      // 玻璃橱窗:暗色玻璃,少数里头亮着
      put(out.walls, b, ry, bx, 1.42, d / 2 - 0.26, bayW - 0.42, 2.3, 0.08, glass);
      put(out.walls, b, ry, bx, 0.14, d / 2 - 0.24, bayW - 0.42, 0.28, 0.12, wallDark);
      if (rnd() < 0.3) putPlane(out.warm, b, ry, bx, 1.35, d / 2 - 0.34, bayW - 0.8, 1.7, shade(ACCENT.windowWarm, -0.08));
    }
  }
  // 门棚(雨棚)
  if (b.venue || rnd() < 0.6) {
    const ac = AWNING_COLORS[Math.floor(rnd() * AWNING_COLORS.length)]();
    put(out.walls, b, ry, 0, groundH - 0.05, d / 2 + 0.42, w * 0.92, 0.06, 0.95, ac, { rx: -0.22 });
  }
  // 二层以上住家窗(§4.1 二层以上渐简;少量暖窗)
  const floors = Math.max(1, Math.round((h - groundH) / 2.9));
  const nw = Math.max(1, Math.floor((w - 1.2) / 1.8));
  for (let f = 0; f < floors; f++) {
    const wy = groundH + 1.4 + f * ((h - groundH - 1.2) / floors);
    if (wy > h - 1) break;
    for (let i = 0; i < nw; i++) {
      const wx = -(w - 1.6) / 2 + (i + 0.5) * ((w - 1.6) / nw);
      if (rnd() < 0.2) {
        putPlane(out.warm, b, ry, wx, wy, d / 2 + 0.03, 1.05, 1.25, shade(ACCENT.windowWarm, (rnd() - 0.5) * 0.06));
      } else {
        put(out.walls, b, ry, wx, wy, d / 2 + 0.01, 1.05, 1.25, 0.05, glass);
      }
      // 窗洞四周是一体挤出的带孔窗框，拥有内侧窗洞、压边和可观察厚度。
      put(out.detail, b, ry, wx, wy, d / 2 + 0.1, 1.22, 1.32, 0.14, wallDark, { profile: 'window' });
      // 窗台
      put(out.walls, b, ry, wx, wy - 0.72, d / 2 + 0.06, 1.2, 0.08, 0.16, wall.clone().offsetHSL(0, 0, 0.03));
    }
  }
  // 楼层压条与不等距竖向构造缝，给大面积上层墙面增加真实结构阴影。
  for (let f = 0; f <= floors; f++) {
    const fy = groundH + f * ((h - groundH) / floors);
    put(out.walls, b, ry, 0, fy, d / 2 + 0.07, w + 0.2, 0.11, 0.16, wallDark);
    put(out.walls, b, ry, -w / 2 - 0.07, fy, 0, 0.16, 0.11, d + 0.2, wallDark);
    put(out.walls, b, ry, w / 2 + 0.07, fy, 0, 0.16, 0.11, d + 0.2, wallDark);
  }
  for (const lx of [-w * 0.34, w * 0.18, w * 0.43]) {
    put(out.walls, b, ry, lx, (groundH + h) / 2, d / 2 + 0.09, 0.08, h - groundH - 0.32, 0.1, wallDark);
  }
  // 场馆/住宅外墙的空调机组与冷媒管，使用实体盒体和圆柱风扇而非贴图符号。
  for (let i = 0; i < Math.min(4, sideFloors); i++) {
    const wy = groundH + 1.05 + i * 2.75;
    const sx = i % 2 ? 1 : -1;
    const lx = sx * (w / 2 + 0.22);
    const lz = d * 0.22 - (i % 3) * 1.8;
    put(out.walls, b, ry, lx, wy, lz, 0.5, 0.42, 0.38, ENV.metal);
    const [cx, cz] = l2w(b, ry, lx + sx * 0.27, lz);
    out.walls.add(unitCylinder(), { x: cx, y: wy, z: cz, sx: 0.13, sy: 0.13, sz: 0.05, color: shade(ENV.metal, 0.06) });
  }
  // 女儿墙
  const pw = 0.22, ph = 0.55;
  put(out.walls, b, ry, 0, h + ph / 2, d / 2 - pw / 2 - 0.02, w, ph, pw, wallDark);
  put(out.walls, b, ry, 0, h + ph / 2, -d / 2 + pw / 2 + 0.02, w, ph, pw, wallDark);
  put(out.walls, b, ry, -w / 2 + pw / 2 + 0.02, h + ph / 2, 0, pw, ph, d, wallDark);
  put(out.walls, b, ry, w / 2 - pw / 2 - 0.02, h + ph / 2, 0, pw, ph, d, wallDark);

  // 竖招牌(sign 文案 canvas 霓虹)
  if (b.sign) {
    const [sx, sz] = l2w(b, ry, -w / 2 + 0.55, d / 2 + 0.42);
    out.signs.push({
      text: b.sign.text, color: b.sign.color,
      x: sx, y: Math.min(h - 0.8, 4.6), z: sz, ry,
      w: 0.6, h: Math.min(3.1, 0.62 * (b.sign.text.length + 1)), vertical: true,
    });
  }
  // 转角立面不再是纯色盲墙：沿两侧切出窄窗带、消防梯和少量冷暖错位窗，
  // 让街口视线在斜向透视里持续获得“高楼夹缝”的细节。
  const sideRows = Math.min(5, Math.max(2, Math.floor(d / 2.8)));
  for (let f = 0; f < sideFloors; f++) {
    const wy = groundH + 1.35 + f * ((h - groundH - 1.4) / sideFloors);
    for (const sx of [-1, 1]) {
      for (let j = 0; j < sideRows; j++) {
        if ((f + j + (sx > 0 ? 1 : 0)) % 4 === 0) continue;
        const wz = -(d - 1.4) / 2 + (j + 0.5) * ((d - 1.4) / sideRows);
        const lit = (f * 3 + j + (sx > 0 ? 2 : 0)) % 5 === 0;
        put(lit ? out.warm : out.walls, b, ry, sx * (w / 2 + 0.04), wy, wz,
          0.12, 1.1, 0.9, lit ? shade(ACCENT.windowWarm, -0.06) : glass);
      }
    }
  }
  // 影院与电竞馆门头增加横向灯箱和斜切遮檐，入口从远处即可辨认。
  if (b.venue) {
    const venueColor = b.venue === 'cinema' ? ACCENT.cinemaSign : ACCENT.netcafeSign;
    put(out.walls, b, ry, 0, groundH + 0.25, d / 2 + 0.42, w * 0.82, 0.12, 0.12, venueColor);
    put(out.walls, b, ry, -w * 0.34, groundH + 0.62, d / 2 + 0.5, 0.16, 1.1, 0.16, venueColor, { rx: -0.18 });
  }
  // 数据驱动的多层招牌：贴墙大牌与垂直刀牌共用 cityplan，不在组件里散落坐标。
  appendFacadeSigns(b, out.signs, ry, w, d);
  // venue 横招牌(门头)
  if (b.venue) {
    const v = VENUES.find((vv) => vv.key === b.venue);
    const label = b.sign?.text ?? v?.label ?? b.venue;
    const color = b.sign?.color ?? ACCENT.konbiniSign;
    const bx = doorBay >= 0 ? -(w - 0.8) / 2 + (doorBay + 0.5) * bayW : 0;
    const [sx, sz] = l2w(b, ry, bx, d / 2 + 0.3);
    out.signs.push({
      text: label, color,
      x: sx, y: 3.55, z: sz, ry,
      w: Math.min(bayW + 0.4, 4.6), h: 0.78, vertical: false,
    });
  }
}

/** 路口原创媒体塔：巨幕、窗带和转角体块共同构成可进入商业街的一部分。 */
function buildMediaTower(b: Building, group: THREE.Group, signs: SignSpec[]): void {
  const ry = facingRy(b);
  const { frontage: w, depth: d } = cityBuildingLocalSize(b);
  const local = new THREE.Group();
  local.position.set(b.x, 0, b.z);
  local.rotation.y = ry;

  const podiumMat = surfaceMaterial('oldConcrete');
  const inkMat = surfaceMaterial('metal');
  const bodyMat = surfaceMaterial('paintedConcrete');
  const glassMat = surfaceMaterial('darkGlass');
  glassMat.emissive.set('#1a6370'); glassMat.emissiveIntensity = 0.22;
  const warmGlassMat = surfaceMaterial('glass');
  warmGlassMat.color.set('#e5a557'); warmGlassMat.emissive.set('#ffb858'); warmGlassMat.emissiveIntensity = 0.2;

  const podiumGeo = unitFacade().clone();
  podiumGeo.scale(w, 4.8, d);
  const podium = new THREE.Mesh(podiumGeo, podiumMat);
  podium.position.y = 2.4;
  podium.castShadow = true;
  podium.receiveShadow = true;
  addOutline(podium);
  local.add(podium);
  // 首层石材板缝与转角压条，避免巨幕塔底座退化成一整块无纹理方盒。
  for (let i = -4; i <= 4; i++) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.035, 4.5, 0.03), inkMat);
    seam.position.set(i * w * 0.105, 2.35, d / 2 + 0.03);
    local.add(seam);
  }
  for (const side of [-1, 1] as const) {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.6, d + 0.12), inkMat);
    corner.position.set(side * (w / 2 - 0.08), 2.35, 0);
    local.add(corner);
  }

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 16), bodyMat);
  body.position.set(-w * 0.04, 4.8 + (b.h - 4.8) / 2, -d * 0.03);
  body.scale.set(w * 0.94, b.h - 4.8, d * 0.94);
  body.castShadow = true;
  body.receiveShadow = true;
  addOutline(body);
  local.add(body);

  // 沿椭圆前缘的深色竖向肋条，让高楼不是一整块光滑圆柱。
  for (let i = -5; i <= 5; i++) {
    const x = i * (w * 0.076);
    const z = d / 2 + 0.08 - Math.abs(i) * 0.045;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, b.h - 17, 0.16), inkMat);
    fin.position.set(x, 26, z);
    local.add(fin);
  }

  // 首层连续橱窗、暖门厅与檐口，把地标落到真实商业街尺度。
  for (let i = -4; i <= 4; i++) {
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.09, 2.55, 0.12),
      i === 1 ? warmGlassMat : glassMat,
    );
    pane.position.set(i * w * 0.105, 1.55, d / 2 + 0.08);
    local.add(pane);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.18, 1.18), inkMat);
  canopy.position.set(0, 4.7, d / 2 + 0.38);
  canopy.rotation.x = -0.12;
  local.add(canopy);

  // 主屏从首层檐口直接起跳，默认镜头内占据右上视觉焦点。
  const displayW = w * 0.94;
  const displayH = 7.05;
  const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(displayW + 0.34, displayH + 0.34, 0.38), inkMat);
  screenFrame.position.set(0, 8.35, d / 2 + 0.15);
  local.add(screenFrame);
  const tex = mediaTowerTexture();
  const screenMat = toonMat(0xffffff, {
    map: tex,
    emissiveMap: tex,
    emissive: 0xffffff,
    emissiveIntensity: 0.48,
    fog: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(displayW, displayH), screenMat);
  screen.position.set(0, 8.35, d / 2 + 0.36);
  local.add(screen);
  // 转角包屏：在斜向路口镜头里也能看到连续的广告动势，不让主屏只像一面贴墙海报。
  for (const side of [-1, 1] as const) {
    const sideScreen = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.72, 4.9), screenMat);
    sideScreen.position.set(side * (w / 2 + 0.12), 8.65, 0.2);
    sideScreen.rotation.y = side * Math.PI / 2;
    local.add(sideScreen);
    const sideFrame = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.2, d * 0.76), inkMat);
    sideFrame.position.set(side * (w / 2 + 0.02), 8.65, 0.2);
    local.add(sideFrame);
  }

  // 三层办公室窗带参与中段构图，避免巨幕上方退化成一块黑盒。
  for (let row = 0; row < 3; row++) {
    const y = 17.5 + row * 5.8;
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(w * (row === 1 ? 0.78 : 0.88), 0.3, 0.25),
      row === 1 ? toonMat(ACCENT.cinemaSign) : inkMat,
    );
    band.position.set((row - 1) * w * 0.035, y - 1.15, d / 2 + 0.16);
    local.add(band);
    for (let col = -4; col <= 4; col++) {
      if ((row + col + 9) % 4 === 0) continue;
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.075, 1.45, 0.12),
        (row + col) % 3 === 0 ? warmGlassMat : glassMat,
      );
      pane.position.set(col * w * 0.092 + (row - 1) * 0.18, y, d / 2 + 0.17);
      local.add(pane);
    }
  }

  // 顶冠错层、天线与色带，形成强烈但原创的不对称轮廓。
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 16), inkMat);
  crown.position.set(-w * 0.1, b.h + 1.1, -d * 0.04);
  crown.scale.set(w * 0.78, 2.2, d * 0.78);
  local.add(crown);
  const crownBand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.55, 0.26), toonMat(ACCENT.cinemaSign));
  crownBand.position.set(0, b.h - 3.2, d / 2 + 0.18);
  local.add(crownBand);
  for (const [x, height] of [[-w * 0.2, 6.2], [w * 0.18, 4.5]] as const) {
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, height, 6), inkMat);
    antenna.position.set(x, b.h + 2.2 + height / 2, 0);
    local.add(antenna);
  }

  group.add(local);
  appendFacadeSigns(b, signs, ry, w, d);
}

function buildApartment(b: Building, out: Bags, rnd: () => number, backstreet: boolean): void {
  const ry = facingRy(b);
  const wall = jitterColor(backstreet ? ENV.wallB : WALL_BASES[Math.floor(rnd() * 2) + 1], rnd);
  const wallDark = wall.clone().offsetHSL(0, 0, -0.05);
  const glass = shade(ENV.skyTopDusk, 0.025, 0, 0.02);
  const { frontage: w, depth: d } = cityBuildingLocalSize(b);
  const { h } = b;
  // 住宅主体由两段错位核心组成，阳台和压条在缝隙处产生真实投影。
  put(out.detail, b, ry, -w * 0.22, h / 2, -0.12, w * 0.58, h, d - 0.45, wall, { profile: 'facade' });
  put(out.detail, b, ry, w * 0.27, h / 2 + 0.1, 0.16, w * 0.44, h - 0.2, d - 0.78, wall.clone().offsetHSL(0, 0, 0.018), { profile: 'facade' });
  put(out.walls, b, ry, 0, 0.12, 0, w + 0.26, 0.24, d + 0.24, wallDark);
  // 住宅楼的楼板边缘和首层檐口先建立真实的层级，再叠加阳台、窗和设备。
  const apartmentBandCount = Math.max(3, Math.round(h / 3.0));
  for (let f = 1; f < apartmentBandCount; f++) {
    const fy = (f * h) / apartmentBandCount;
    put(out.walls, b, ry, 0, fy, d / 2 + 0.07, w + 0.18, 0.14, 0.18, wallDark);
    put(out.walls, b, ry, 0, fy, -d / 2 - 0.07, w + 0.18, 0.14, 0.18, wallDark);
  }
  for (const lx of [-w * 0.36, -w * 0.05, w * 0.31]) {
    put(out.walls, b, ry, lx, h * 0.53, d / 2 + 0.08, 0.09, h * 0.92, 0.12, wallDark);
  }
  // 屋顶:女儿墙 + 楼梯间小盒 + 晾衣杆位
  const ph = 0.5;
  put(out.walls, b, ry, 0, h + ph / 2, 0, w, ph, 0.2, wallDark);
  put(out.walls, b, ry, 0, h + ph / 2, -d + 0.1, w, ph, 0.2, wallDark);
  put(out.walls, b, ry, (rnd() - 0.5) * w * 0.4, h + 1.0, -d * 0.15, 2.4, 2.0, 2.6, wallDark);
  const floors = Math.max(2, Math.round(h / 2.9));
  const fh = h / floors;
  const nUnit = Math.max(1, Math.floor((w - 1.5) / 2.6));
  for (let f = 1; f < floors; f++) {
    const fy = f * fh;
    if (backstreet) {
      // 外走廊:通长挑板 + 栏杆 + 各户门
      put(out.walls, b, ry, 0, fy + 0.05, d / 2 + 0.5, w - 0.4, 0.1, 1.0, wallDark);
      put(out.walls, b, ry, 0, fy + 0.6, d / 2 + 0.96, w - 0.4, 0.05, 0.05, ENV.metal);
      put(out.walls, b, ry, 0, fy + 0.35, d / 2 + 0.96, w - 0.4, 0.45, 0.02, shade(ENV.metal, -0.045));
      for (let u = 0; u < nUnit; u++) {
        const ux = -(w - 2) / 2 + (u + 0.5) * ((w - 2) / nUnit);
        put(out.walls, b, ry, ux, fy + 1.0, d / 2 + 0.02, 0.85, 1.9, 0.06, shade(ENV.wallC, -0.02 + (rnd() - 0.5) * 0.03));
        if (rnd() < 0.14) putPlane(out.warm, b, ry, ux + 1.0, fy + 1.25, d / 2 + 0.03, 0.7, 0.9, shade(ACCENT.windowWarm, -0.03));
      }
    } else {
      // 阳台组
      for (let u = 0; u < nUnit; u++) {
        const ux = -(w - 2) / 2 + (u + 0.5) * ((w - 2) / nUnit);
        put(out.walls, b, ry, ux, fy + 0.05, d / 2 + 0.42, 2.0, 0.1, 0.85, wallDark);
        put(out.walls, b, ry, ux, fy + 0.5, d / 2 + 0.8, 2.0, 0.85, 0.06, wall.clone().offsetHSL(0, 0, -0.025));
        put(out.detail, b, ry, ux, fy + 1.35, d / 2 + 0.1, 1.56, 1.32, 0.14, wallDark, { profile: 'window' });
        if (rnd() < 0.2) {
          putPlane(out.warm, b, ry, ux, fy + 1.35, d / 2 + 0.03, 1.4, 1.15, shade(ACCENT.windowWarm, (rnd() - 0.5) * 0.06));
        } else {
          put(out.walls, b, ry, ux, fy + 1.35, d / 2 + 0.01, 1.4, 1.15, 0.05, glass);
        }
        // 空调位(§4.3)
        if (rnd() < 0.4) put(out.walls, b, ry, ux + 0.75, fy + 0.35, d / 2 + 0.62, 0.5, 0.4, 0.24, jitterColor(ENV.metal, rnd));
      }
    }
  }
  // 侧墙落水管
  for (const sx of [-1, 1]) {
    if (rnd() < 0.6) {
      const [px, pz] = l2w(b, ry, sx * (w / 2 - 0.2), d / 2 - 0.4);
      out.walls.add(unitCylinder(), { x: px, y: h / 2, z: pz, sx: 0.12, sy: h, sz: 0.12, color: wallDark });
    }
  }
  appendFacadeSigns(b, out.signs, ry, w, d);
}

function buildTower(
  b: Building,
  walls: MergeBag,
  details: MergeBag,
  glow: THREE.BufferGeometry[],
  signs: SignSpec[],
  rnd: () => number,
): void {
  const ry = facingRy(b);
  const wall = jitterColor(WALL_BASES[Math.floor(rnd() * 2)], rnd);
  const { frontage: w, depth: d } = cityBuildingLocalSize(b);
  const { h } = b;
  // 分段体块错落(2-3 段收分)
  const secs = h > 52 ? 3 : 2;
  const fr = secs === 3 ? [0.5, 0.34, 0.16] : [0.62, 0.38];
  let y0 = 0;
  const secDims: { y: number; sh: number; sw: number; sd: number; ox: number; oz: number }[] = [];
  for (let i = 0; i < secs; i++) {
    const sh = h * fr[i];
    const k = 1 - i * 0.16;
    const sw = w * k, sd = d * k;
    const ox = i === 0 ? 0 : (rnd() - 0.5) * (w - sw) * 0.7;
    const oz = i === 0 ? 0 : (rnd() - 0.5) * (d - sd) * 0.7;
    put(details, b, ry, ox, y0 + sh / 2, oz, sw, sh, sd, wall.clone().offsetHSL(0, 0, i * 0.012), { profile: 'facade' });
    // 分段檐口
    put(walls, b, ry, ox, y0 + sh - 0.15, oz, sw + 0.5, 0.3, sd + 0.5, wall.clone().offsetHSL(0, 0, -0.04));
    secDims.push({ y: y0, sh, sw, sd, ox, oz });
    y0 += sh;
  }
  // 屋顶剪影:水塔 + 天线(§4.1)
  const top = secDims[secs - 1];
  const roofY = top.y + top.sh;
  const dark = shade(ENV.bgSilhouetteA, -0.01);
  const [tx, tz] = l2w(b, ry, top.ox + top.sw * 0.22, top.oz - top.sd * 0.18);
  walls.add(unitCylinder(), { x: tx, y: roofY + 1.6, z: tz, sx: 2.2, sy: 2.2, sz: 2.2, color: dark });
  walls.add(unitCylinder(), { x: tx, y: roofY + 0.35, z: tz, sx: 0.4, sy: 0.7, sz: 0.4, color: dark });
  const nAnt = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < nAnt; i++) {
    const [ax, az] = l2w(b, ry, top.ox + (rnd() - 0.5) * top.sw * 0.6, top.oz + (rnd() - 0.5) * top.sd * 0.6);
    const ah = 3.5 + rnd() * 4;
    walls.add(unitCylinder(), { x: ax, y: roofY + ah / 2, z: az, sx: 0.12, sy: ah, sz: 0.12, color: dark });
  }
  put(walls, b, ry, top.ox, roofY + 0.3, top.oz, top.sw, 0.6, 0.18, dark); // 女儿墙正面
  // 亮窗点阵:四面各贴一张点阵面片(共享贴图 + 每面随机 UV 偏移)
  for (const s of secDims) {
    const faces: { lx: number; lz: number; fw: number; lry: number }[] = [
      { lx: s.ox, lz: s.oz + s.sd / 2 + 0.06, fw: s.sw, lry: 0 },
      { lx: s.ox, lz: s.oz - s.sd / 2 - 0.06, fw: s.sw, lry: Math.PI },
      { lx: s.ox + s.sw / 2 + 0.06, lz: s.oz, fw: s.sd, lry: Math.PI / 2 },
      { lx: s.ox - s.sw / 2 - 0.06, lz: s.oz, fw: s.sd, lry: -Math.PI / 2 },
    ];
    for (const f of faces) {
      const g = unitPlane().clone();
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const ou = rnd(), ov = rnd();
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, ou + uv.getX(i) * (f.fw / 8), ov + uv.getY(i) * (s.sh / 8));
      }
      const [x, z] = l2w(b, ry, f.lx, f.lz);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, s.y + s.sh / 2, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry + f.lry, 0)),
        new THREE.Vector3(f.fw * 0.96, s.sh * 0.94, 1)
      );
      g.applyMatrix4(m);
      // MergeBag 之外的裸合并列表(材质不吃顶点色,补齐 color 属性以便与 walls 混用工具)
      glow.push(g);
    }
  }
  appendFacadeSigns(b, signs, ry, w, d);
}

// ── 组装(BuildQueue 分帧)──────────────────────────────────────────────────
let buildingsGroup: THREE.Group | null = null;

export function enqueueBuildings(queue: BuildQueue, spawn: [number, number]): THREE.Group {
  if (buildingsGroup) return buildingsGroup;
  const group = new THREE.Group();
  group.name = 'city-buildings';
  buildingsGroup = group;

  const near: Bags = { walls: new MergeBag(), detail: new MergeBag(), shutters: new MergeBag(), warm: new MergeBag(), signs: [] };
  const far: Bags = { walls: new MergeBag(), detail: new MergeBag(), shutters: new MergeBag(), warm: new MergeBag(), signs: [] };
  const towerWalls = new MergeBag();
  const towerDetails = new MergeBag();
  const towerGlow: THREE.BufferGeometry[] = [];
  const allSigns: SignSpec[] = [];
  const landmarkGroup = new THREE.Group();
  landmarkGroup.name = 'city-media-landmark';
  group.add(landmarkGroup);

  const playable = BUILDINGS
    .map((b, i) => ({ b, i, dd: (b.x - spawn[0]) ** 2 + (b.z - spawn[1]) ** 2 }))
    .filter((e) => e.b.style !== 'silhouette')
    .sort((a, z) => a.dd - z.dd);

  // 分块生成(每块 ~6 栋,出生点 80m 半径优先,§10)
  const CHUNK = 6;
  for (let c = 0; c < playable.length; c += CHUNK) {
    const slice = playable.slice(c, c + CHUNK);
    const isNear = slice[0].dd <= SPAWN_PRIORITY_RADIUS ** 2;
    queue.add('建筑', () => {
      for (const { b, i } of slice) {
        const rnd = seededRandom(910_000 + i * 97);
        const bags = isNear ? near : far;
        switch (b.style) {
          case 'shopfront': buildShopfront(b, bags, rnd); break;
          case 'mediaTower': buildMediaTower(b, landmarkGroup, allSigns); break;
          case 'apartment': buildApartment(b, bags, rnd, false); break;
          case 'backstreet': buildApartment(b, bags, rnd, true); break;
          case 'tower': buildTower(b, towerWalls, towerDetails, towerGlow, allSigns, rnd); break;
          default: break;
        }
        allSigns.push(...bags.signs.splice(0));
      }
    }, isNear ? 60 : 40);
  }

  const finishBags = (bags: Bags, label: string, priority: number): void => {
    queue.add(label, () => {
      const wallGeo = bags.walls.build();
      if (wallGeo) {
        const mesh = new THREE.Mesh(wallGeo, vertexToonMat(4));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        addOutline(mesh); // 近/中景才描边(§5);背景剪影不走这里
        group.add(mesh);
      }
      const detailGeo = bags.detail.build();
      if (detailGeo) {
        const mesh = new THREE.Mesh(detailGeo, vertexToonMat(4));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        addOutline(mesh);
        group.add(mesh);
      }
      const shGeo = bags.shutters.build();
      if (shGeo) {
        const m = surfaceMaterial('brushedMetal', true);
        m.map = shutterTexture();
        const shutterMesh = new THREE.Mesh(shGeo, m);
        shutterMesh.castShadow = true; shutterMesh.receiveShadow = true;
        group.add(shutterMesh);
      }
      const warmGeo = bags.warm.build();
      if (warmGeo) {
        const m = surfaceMaterial('glass', true);
        m.emissive.set(ACCENT.windowWarm); m.emissiveIntensity = 0.42;
        const warmMesh = new THREE.Mesh(warmGeo, m);
        warmMesh.castShadow = true; warmMesh.receiveShadow = true;
        group.add(warmMesh);
      }
    }, priority);
  };
  finishBags(near, '建筑合并·近景', 34);
  finishBags(far, '建筑合并·远景', 32);

  queue.add('路口高楼', () => {
    const geo = towerWalls.build();
    if (geo) {
      const mesh = new THREE.Mesh(geo, vertexToonMat(4));
      mesh.castShadow = true;
      addOutline(mesh);
      group.add(mesh);
    }
    const detailGeo = towerDetails.build();
    if (detailGeo) {
      const mesh = new THREE.Mesh(detailGeo, vertexToonMat(4));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      addOutline(mesh);
      group.add(mesh);
    }
    if (towerGlow.length > 0) {
      const merged = mergeGlowPlanes(towerGlow);
      if (merged) {
        const tex = towerDotTexture();
        const m = toonMat(0xffffff, {
          map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.7, transparent: true,
        });
        m.depthWrite = false;
        const mesh = new THREE.Mesh(merged, m);
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    }
  }, 30);

  queue.add('招牌', () => {
    for (const s of allSigns) group.add(makeSignMesh(s));
  }, 28);

  queue.add('背景剪影', () => buildSilhouettes(group), 26);

  return group;
}

/** 裸平面列表合并(自带 uv 偏移,不走 MergeBag 顶点色路径)。 */
function mergeGlowPlanes(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  parts.length = 0;
  return merged;
}

/** §4.2 三层背景剪影:按半径分三档着色,合并为 ≤6 mesh,二阶 toon、不描边。 */
function buildSilhouettes(group: THREE.Group): void {
  const silos = BUILDINGS.filter((b) => b.style === 'silhouette');
  if (silos.length === 0) return;
  const radii = silos.map((b) => Math.hypot(b.x, b.z)).sort((a, b) => a - b);
  const t1 = radii[Math.floor(radii.length / 3)] ?? 300;
  const t2 = radii[Math.floor((radii.length * 2) / 3)] ?? 380;
  const layers = [new MergeBag(), new MergeBag(), new MergeBag()];
  const layerColors = [ENV.bgSilhouetteA, ENV.bgSilhouetteB, ENV.bgSilhouetteC];
  const glow = new MergeBag();
  const vistaSigns: SignSpec[] = [];
  const rnd = seededRandom(940_001);
  for (const b of silos) {
    const r = Math.hypot(b.x, b.z);
    const li = r <= t1 ? 0 : r <= t2 ? 1 : 2;
    const bag = layers[li];
    const color = jitterColor(layerColors[li], rnd);
    const ry = b.ry ?? (rnd() - 0.5) * 0.2;
    bag.add(unitBox(), { x: b.x, y: b.h / 2, z: b.z, sx: b.w, sy: b.h, sz: b.d, ry, color });
    // 高低错落的顶部体块 / 水塔剪影
    if (rnd() < 0.55) {
      bag.add(unitBox(), {
        x: b.x + (rnd() - 0.5) * b.w * 0.4, y: b.h + (b.h * 0.08) / 2, z: b.z + (rnd() - 0.5) * b.d * 0.4,
        sx: b.w * (0.3 + rnd() * 0.3), sy: b.h * 0.08 + 1, sz: b.d * (0.3 + rnd() * 0.3), ry, color,
      });
    }
    if (rnd() < 0.2) {
      bag.add(unitCylinder(), {
        x: b.x + (rnd() - 0.5) * b.w * 0.5, y: b.h + 1.1, z: b.z + (rnd() - 0.5) * b.d * 0.5,
        sx: 1.8, sy: 2.2, sz: 1.8, color,
      });
    }
    // 零星亮窗(自发光点,面向市中心)
    if (li < 2 && rnd() < 0.5) {
      const fry = Math.atan2(-b.x, -b.z);
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const wx = b.x + Math.sin(fry) * (b.d / 2 + 0.2) + Math.cos(fry) * (rnd() - 0.5) * b.w * 0.7;
        const wz = b.z + Math.cos(fry) * (b.d / 2 + 0.2) - Math.sin(fry) * (rnd() - 0.5) * b.w * 0.7;
        glow.add(unitPlane(), {
          x: wx, y: b.h * (0.25 + rnd() * 0.65), z: wz, ry: fry,
          sx: 0.7 + rnd() * 0.5, sy: 0.9 + rnd() * 0.5, sz: 1,
          color: rnd() > 0.3 ? ACCENT.windowWarm : shade(ACCENT.konbiniSign, -0.06),
        });
      }
    }
    if (b.facadeSigns?.length) {
      const ry = facingRy(b);
      const { frontage, depth } = cityBuildingLocalSize(b);
      appendFacadeSigns(b, vistaSigns, ry, frontage, depth);
    }
  }
  layers.forEach((bag) => {
    const geo = bag.build();
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, vertexToonMat(2)); // 二阶 toon,不描边(§5)
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  });
  const glowGeo = glow.build();
  if (glowGeo) {
    const m = vertexToonMat(2).clone();
    m.emissive = new THREE.Color(ACCENT.windowWarm);
    m.emissiveIntensity = 0.5;
    m.fog = true;
    group.add(new THREE.Mesh(glowGeo, m));
  }
  for (const sign of vistaSigns) group.add(makeSignMesh(sign));
  // 合计:3 层剪影 + 1 亮窗 + 最多 2 个消失点招牌 = 6 mesh(§10)
}

/** 建筑总组件:enqueue 一次,组模块级缓存。 */
export function Buildings({ queue, spawn }: { queue: BuildQueue; spawn: [number, number] }) {
  const group = useMemo(() => enqueueBuildings(queue, spawn), [queue, spawn]);
  return <primitive object={group} />;
}

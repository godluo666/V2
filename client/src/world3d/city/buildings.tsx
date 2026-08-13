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
import { applyPhysicalUv } from './physicalUv';

type Building = (typeof BUILDINGS)[number];

let _uPlane: THREE.PlaneGeometry | null = null;
function unitPlane(): THREE.PlaneGeometry {
  if (!_uPlane) _uPlane = new THREE.PlaneGeometry(1, 1);
  return _uPlane;
}

let _uDisplaySphere: THREE.SphereGeometry | null = null;
function unitDisplaySphere(): THREE.SphereGeometry {
  if (!_uDisplaySphere) _uDisplaySphere = new THREE.SphereGeometry(0.5, 10, 7);
  return _uDisplaySphere;
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
    // Only solid facade profiles opt in here. Window/glass planes, signs and
    // screen content retain their authored UVs.
    physicalUv: extra?.profile === 'facade',
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
  lit?: boolean;
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
      ctx.shadowBlur = 6;
      ctx.fillText(chr, cw / 2, 74 + i * 108);
      ctx.shadowBlur = 1;
      ctx.fillText(chr, cw / 2, 74 + i * 108);
    });
  } else {
    ctx.font = 'bold 72px "Noto Sans SC", sans-serif';
    ctx.shadowBlur = 6;
    ctx.fillText(text, cw / 2, ch / 2 + 4);
    ctx.shadowBlur = 1;
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
  const mat = toonMat(0xffffff, s.lit === false ? { map: tex } : {
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.3, fog: false,
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
  ctx.fillStyle = '#121722';
  ctx.fillRect(0, 0, 1024, 576);

  // Original editorial collage: a dark field carries one paper wedge and one
  // red action zone.  This keeps the tower vivid without turning the entire
  // mobile viewport into a uniformly emissive red rectangle.
  ctx.fillStyle = '#f3ecdc';
  ctx.beginPath();
  ctx.moveTo(42, 70);
  ctx.lineTo(720, 18);
  ctx.lineTo(650, 402);
  ctx.lineTo(16, 530);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ee3657';
  ctx.beginPath();
  ctx.moveTo(612, -28);
  ctx.lineTo(1024, 48);
  ctx.lineTo(1024, 314);
  ctx.lineTo(552, 364);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd84f';
  ctx.beginPath();
  ctx.moveTo(884, 0);
  ctx.lineTo(1024, 0);
  ctx.lineTo(1024, 146);
  ctx.lineTo(936, 124);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#38d3d0';
  ctx.fillRect(0, 524, 1024, 26);
  ctx.fillStyle = '#ee3657';
  ctx.save();
  ctx.translate(480, 478);
  ctx.rotate(-0.075);
  ctx.fillRect(-430, -9, 680, 18);
  ctx.restore();

  ctx.save();
  ctx.translate(92, 264);
  ctx.rotate(-0.045);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '900 104px "Arial Black", "Segoe UI", sans-serif';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#f3ecdc';
  ctx.strokeText('MOON', 4, 5);
  ctx.fillStyle = '#151820';
  ctx.fillText('MOON', 0, 0);
  ctx.font = '900 48px "Arial Black", "Segoe UI", sans-serif';
  ctx.fillStyle = '#ee3657';
  ctx.fillText('VISION / 07', 16, 82);
  ctx.restore();

  ctx.save();
  ctx.translate(775, 190);
  ctx.rotate(-0.09);
  ctx.textAlign = 'center';
  ctx.font = '900 34px "Arial Black", "Segoe UI", sans-serif';
  ctx.fillStyle = '#fff9ea';
  ctx.fillText('CITY SIGNAL', 0, 0);
  ctx.font = '700 22px "Segoe UI", sans-serif';
  ctx.fillText('LIVE / EAST LOOP', 0, 42);
  ctx.restore();

  ctx.save();
  ctx.translate(754, 430);
  ctx.rotate(0.035);
  ctx.textAlign = 'left';
  ctx.font = '900 50px "Arial Black", "Segoe UI", sans-serif';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#121722';
  ctx.strokeText('35.68 N', 3, 3);
  ctx.fillStyle = '#f3ecdc';
  ctx.fillText('35.68 N', 0, 0);
  ctx.restore();

  ctx.fillStyle = '#f3ecdc';
  ctx.font = '800 25px "Segoe UI", sans-serif';
  ctx.fillText('SHIOHAMA CROSS / 35.68 N', 38, 568);

  // Halftone is confined to the lower-right information field rather than
  // repeated over the city or used to disguise a flat building surface.
  ctx.fillStyle = 'rgba(243,236,220,.38)';
  for (let y = 342; y < 492; y += 18) {
    for (let x = 704 + ((y / 18) % 2) * 9; x < 994; x += 18) {
      ctx.beginPath();
      ctx.arc(x, y, 4.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  _mediaTowerTex = canvasTexture(canvas, false);
  return _mediaTowerTex;
}

const _mediaTowerSideTex = new Map<-1 | 1, THREE.CanvasTexture>();
function mediaTowerSideTexture(side: -1 | 1): THREE.CanvasTexture {
  const cached = _mediaTowerSideTex.get(side);
  if (cached) return cached;
  const [canvas, ctx] = makeCanvas(768);
  canvas.height = 640;
  const accent = side < 0 ? '#39d7d2' : '#f0c94e';
  const opposing = side < 0 ? '#f0c94e' : '#39d7d2';

  ctx.fillStyle = '#111722';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Side elevations use their own compressed editorial rhythm. They are not
  // scaled copies of the 16:9 hero display, so the corner reads as a wrapped
  // media volume from an oblique street camera.
  ctx.fillStyle = '#f2ecdf';
  ctx.beginPath();
  ctx.moveTo(side < 0 ? 18 : 146, 50);
  ctx.lineTo(side < 0 ? 612 : 750, 8);
  ctx.lineTo(side < 0 ? 694 : 636, 456);
  ctx.lineTo(side < 0 ? 88 : 24, 526);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(side < 0 ? 526 : 0, -12);
  ctx.lineTo(side < 0 ? 768 : 244, 22);
  ctx.lineTo(side < 0 ? 768 : 304, 244);
  ctx.lineTo(side < 0 ? 474 : 0, 302);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = opposing;
  ctx.fillRect(0, 572, 768, 24);
  ctx.save();
  ctx.translate(side < 0 ? 92 : 676, 316);
  ctx.rotate(side < 0 ? -0.07 : 0.07);
  ctx.fillStyle = '#eb3c5d';
  ctx.fillRect(-64, -248, 128, 496);
  ctx.restore();

  ctx.save();
  ctx.translate(side < 0 ? 142 : 626, 250);
  ctx.rotate(side < 0 ? -0.08 : 0.08);
  ctx.textAlign = side < 0 ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  ctx.font = '900 94px "Arial Black", "Segoe UI", sans-serif';
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#f2ecdf';
  ctx.strokeText('CITY', side < 0 ? 4 : -4, 5);
  ctx.fillStyle = '#141923';
  ctx.fillText('CITY', 0, 0);
  ctx.font = '900 42px "Arial Black", "Segoe UI", sans-serif';
  ctx.fillStyle = '#e83c5b';
  ctx.fillText(side < 0 ? 'PULSE / A' : 'LOOP / B', 0, 82);
  ctx.restore();

  ctx.fillStyle = '#f2ecdf';
  ctx.font = '800 22px "Segoe UI", sans-serif';
  ctx.textAlign = side < 0 ? 'left' : 'right';
  ctx.fillText('35.68 N / SIGNAL 07', side < 0 ? 28 : 740, 628);
  ctx.fillStyle = 'rgba(17,23,34,.38)';
  for (let y = 360; y < 516; y += 17) {
    for (let x = 214 + ((y / 17) % 2) * 8; x < 566; x += 17) {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = canvasTexture(canvas, false);
  _mediaTowerSideTex.set(side, texture);
  return texture;
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
  glass: MergeBag;      // 独立玻璃表面，避免与混凝土共用材质
  shopGlass: MergeBag;  // 可透出营业层的首层橱窗/玻璃门
  metal: MergeBag;      // 设备、窗台与金属构件
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

const SHOP_PROFILES: Record<NonNullable<Building['groundUse']>, {
  doorSide: -1 | 1;
  awning: THREE.ColorRepresentation;
  warm: boolean;
  noren?: boolean;
  displayBase?: boolean;
}> = {
  'general-store': { doorSide: 1, awning: '#4f7778', warm: true, displayBase: true },
  florist: { doorSide: 1, awning: '#7b7354', warm: true, displayBase: true },
  cafe: { doorSide: -1, awning: '#8b5a43', warm: true, displayBase: true },
  stationery: { doorSide: 1, awning: '#5e7466', warm: true, displayBase: true },
  fishmonger: { doorSide: 1, awning: '#426b77', warm: false, displayBase: true },
  'watch-repair': { doorSide: -1, awning: '#716653', warm: false },
  pharmacy: { doorSide: 1, awning: '#567562', warm: true, displayBase: true },
  restaurant: { doorSide: -1, awning: '#855444', warm: true, noren: true },
};

function buildShopfront(b: Building, out: Bags, rnd: () => number): void {
  const ry = facingRy(b);
  const wall = jitterColor(WALL_BASES[Math.floor(rnd() * WALL_BASES.length)], rnd);
  const wallDark = wall.clone().offsetHSL(0, 0, -0.05);
  const glass = shade(ENV.skyTopDusk, 0.025, 0, 0.02);
  const { frontage: w, depth: d } = cityBuildingLocalSize(b);
  const { h } = b;
  const groundH = 3.2;
  const sideFloors = Math.max(2, Math.floor((h - groundH) / 2.65));
  const hasHeroVenue = b.venue != null;
  const shopProfile = b.groundUse ? SHOP_PROFILES[b.groundUse] : null;

  // 上层主体(带前后进退,破"方盒感")
  // 上层不再是一整块长方体：三段错层体块用不同退进量形成真实施工缝。
  put(out.detail, b, ry, -w * 0.31, (groundH + h) / 2, -0.22, w * 0.38, h - groundH, d - 0.65, wall, { profile: 'facade' });
  put(out.detail, b, ry, 0, (groundH + h) / 2, 0.05, w * 0.28, h - groundH - 0.22, d - 0.42, wall.clone().offsetHSL(0, 0, 0.018), { profile: 'facade' });
  put(out.detail, b, ry, w * 0.31, (groundH + h) / 2 + 0.14, -0.08, w * 0.38, h - groundH - 0.48, d - 0.82, wall.clone().offsetHSL(0, 0, -0.018), { profile: 'facade' });
  // Venue hero modules own their public facade. Random legacy reliefs can land
  // directly in a lobby opening, so keep them on ordinary shopfronts only.
  const reliefs = hasHeroVenue ? 0 : 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < reliefs; i++) {
    const rw = w * (0.2 + rnd() * 0.22);
    const rx = (rnd() - 0.5) * (w - rw) * 0.8;
    put(out.walls, b, ry, rx, (groundH + h) / 2 + 0.1, d / 2 - 0.06, rw, h - groundH - 0.4, 0.28, wall.clone().offsetHSL(0, 0, 0.02));
  }
  // 一层骑楼:后墙 + 立柱 + 过梁。三座场馆的英雄门厅需要真正的
  // 0.8-1.2m进深；把旧通长后墙与过梁退到内侧，避免和新玻璃/门框
  // 只差几厘米而形成贴片感或深度闪烁。普通店铺继续使用原骑楼结构。
  const arcadeBack = hasHeroVenue ? d / 2 - 1.28 : d / 2 - 0.5;
  const arcadeHeader = hasHeroVenue ? d / 2 - 0.82 : d / 2 - 0.05;
  put(out.walls, b, ry, 0, groundH / 2, arcadeBack, hasHeroVenue ? w - 0.5 : w, groundH, 0.3, wallDark);
  put(out.walls, b, ry, 0, groundH - 0.22, arcadeHeader, w, 0.45, hasHeroVenue ? 0.34 : 0.6, wall.clone().offsetHSL(0, 0, -0.02));
  put(out.walls, b, ry, 0, 0.1, d / 2 - 0.3, w, 0.2, 0.9, shade(ENV.sidewalk, -0.03)); // 门前台基
  put(out.walls, b, ry, 0, 0.11, -d / 2 + 0.03, w + 0.18, 0.22, 0.26, wallDark);

  // 店面开间
  const facadeInnerW = w - 0.48;
  const nBays = b.groundUse
    ? Math.max(2, Math.round(facadeInnerW / 2.35))
    : Math.max(1, Math.round((w - 1) / 3.2));
  const bayW = facadeInnerW / nBays;
  let doorBay = -1;
  if (b.venue) {
    const v = VENUES.find((vv) => vv.key === b.venue);
    const lx = v ? w2lx(b, ry, v.x, v.z) : 0;
    doorBay = Math.max(0, Math.min(nBays - 1, Math.floor((lx + facadeInnerW / 2) / bayW)));
  } else if (shopProfile) {
    doorBay = shopProfile.doorSide < 0 ? 0 : nBays - 1;
  }
  if (!hasHeroVenue) {
    for (let i = 0; i < nBays; i++) {
      const bx = -facadeInnerW / 2 + (i + 0.5) * bayW;
      // 开间立柱
      put(out.walls, b, ry, bx - bayW / 2, groundH / 2, d / 2 - 0.12, 0.34, groundH, 0.45, wall);
      if (i === nBays - 1) put(out.walls, b, ry, bx + bayW / 2, groundH / 2, d / 2 - 0.12, 0.34, groundH, 0.45, wall);
      if (i === doorBay) {
        const openingW = Math.min(1.5, Math.max(0.58, bayW - 0.3));
        // venue 门洞:留空 + 深色门廊(实际门/传送由 layout interactable 提供)
        put(out.walls, b, ry, bx, 2.72, d / 2 - 0.2, openingW + 0.2, 0.5, 0.24, wallDark);
        put(out.walls, b, ry, bx - openingW / 2, 1.25, d / 2 - 0.2, 0.14, 2.5, 0.24, wallDark);
        put(out.walls, b, ry, bx + openingW / 2, 1.25, d / 2 - 0.2, 0.14, 2.5, 0.24, wallDark);
        if (b.businessState !== 'closed') {
          putPlane(out.warm, b, ry, bx, 1.3, d / 2 - 0.42, openingW - 0.12, 2.3, shade(ACCENT.windowWarm, -0.04));
        }
        put(out.shopGlass, b, ry, bx, 1.32, d / 2 - 0.14, openingW - 0.1, 2.34, 0.07, '#d5dfdc');
        put(out.metal, b, ry, bx, 1.32, d / 2 - 0.07, 0.07, 2.34, 0.11, ENV.metal);
        put(out.metal, b, ry, bx + Math.min(0.28, bayW * 0.12), 1.28, d / 2 + 0.01, 0.045, 0.46, 0.08, shade(ENV.metal, 0.08));
        if (b.groundUse === 'watch-repair' && b.businessState === 'closed') {
          // A closed repair shop still has a physical door: a ribbed lower
          // kickplate and small paper notice avoid a full-height black void.
          put(out.detail, b, ry, bx, 0.52, d / 2 - 0.025,
            openingW - 0.18, 0.82, 0.035, '#65706d');
          for (let rib = 0; rib < 4; rib++) {
            put(out.detail, b, ry, bx, 0.25 + rib * 0.18, d / 2 + 0.002,
              openingW - 0.3, 0.025, 0.025, '#88908a');
          }
          put(out.detail, b, ry, bx - openingW * 0.2, 1.63, d / 2 + 0.002,
            0.25, 0.34, 0.025, '#c8c2ab', { rz: -0.035 });
        }
      } else if (b.businessState === 'closed' || (!shopProfile && rnd() < 0.5)) {
        if (b.groundUse === 'watch-repair') {
          // Regular closure, not abandonment: the upper security shutter is
          // lowered while the lower window still exposes a quiet repair bench.
          const windowW = Math.max(0.5, bayW - 0.34);
          put(out.walls, b, ry, bx, 1.18, d / 2 - 0.66,
            windowW, 1.84, 0.1, shade(ENV.wallPale, -0.08));
          put(out.shopGlass, b, ry, bx, 0.92, d / 2 - 0.26,
            windowW, 1.34, 0.08, '#cbd5d1');
          put(out.detail, b, ry, bx, 0.57, d / 2 - 0.38,
            bayW - 0.64, 0.16, 0.38, '#776b56');
          put(out.detail, b, ry, bx - bayW * 0.18, 0.77, d / 2 - 0.34,
            0.3, 0.24, 0.2, '#596569');
          put(out.detail, b, ry, bx + bayW * 0.16, 0.73, d / 2 - 0.33,
            0.22, 0.16, 0.18, '#8b7557');
          put(out.shutters, b, ry, bx, 2.04, d / 2 - 0.19,
            bayW - 0.42, 1.05, 0.07, '#707673');
          for (let slat = 0; slat < 5; slat++) {
            put(out.detail, b, ry, bx, 1.58 + slat * 0.22, d / 2 - 0.145,
              bayW - 0.54, 0.035, 0.025, slat % 2 ? '#69716f' : '#828987');
          }
        } else {
          // 卷帘门(打烊)
          put(out.shutters, b, ry, bx, 1.28, d / 2 - 0.24, bayW - 0.42, 2.56, 0.07, jitterColor(ENV.wallC, rnd));
        }
      } else {
        // 开放店铺有真实可见的浅色营业层；橱窗是半透明表面，背后再按
        // 业态放置货架/冷柜/陈列，而不是用一整块黑玻璃代替室内。
        const windowW = Math.max(0.5, bayW - 0.34);
        put(out.walls, b, ry, bx, 1.42, d / 2 - 0.66, windowW, 2.32, 0.1,
          shade(ENV.wallPale, b.groundUse === 'fishmonger' ? -0.06 : -0.015));
        put(out.shopGlass, b, ry, bx, 1.42, d / 2 - 0.26, windowW, 2.3, 0.08, '#d5dfdc');
        put(out.walls, b, ry, bx, 0.14, d / 2 - 0.24, windowW, 0.28, 0.12, wallDark);
        if (shopProfile?.warm || (!shopProfile && rnd() < 0.3)) {
          putPlane(out.warm, b, ry, bx, 1.35, d / 2 - 0.34, bayW - 0.8, 1.7, shade(ACCENT.windowWarm, -0.08));
        }
        if (shopProfile?.displayBase) {
          const displayBaseColor = b.groundUse === 'fishmonger' ? '#71868a' : wallDark;
          put(out.walls, b, ry, bx, 0.52, d / 2 - 0.39,
            bayW - 0.65, 0.58, 0.34, displayBaseColor);
          const displayCount = Math.max(1, Math.min(3, Math.floor(bayW / 0.72)));
          for (let display = 0; display < displayCount; display++) {
            const displayX = bx - (displayCount - 1) * 0.32 + display * 0.64;
            const displayColor = b.groundUse === 'florist'
              ? [ '#8a7654', '#697552', '#8b6559' ][display % 3]
              : b.groundUse === 'fishmonger' ? '#71828a' : '#8a7b62';
            const displayHeight = b.groundUse === 'florist' ? 0.28 + display * 0.12 : 0.28;
            put(out.detail, b, ry, displayX, 0.78 + displayHeight / 2, d / 2 - 0.3,
              0.42, displayHeight, 0.22, displayColor);
          }
        }
        if (b.groundUse === 'general-store' || b.groundUse === 'stationery' || b.groundUse === 'pharmacy') {
          const productColors = b.groundUse === 'pharmacy'
            ? ['#d9ded1', '#829f8d', '#c8b99c']
            : b.groundUse === 'stationery'
              ? ['#8d9a87', '#c4aa78', '#6f8293']
              : ['#b39468', '#758d82', '#a97c72'];
          for (let shelf = 0; shelf < 3; shelf++) {
            const shelfY = 0.46 + shelf * 0.48;
            put(out.metal, b, ry, bx, shelfY, d / 2 - 0.36,
              bayW - 0.7, 0.055, 0.2, shade(ENV.metal, 0.08));
            const productCount = Math.max(2, Math.min(5, Math.floor(bayW / 0.38)));
            for (let product = 0; product < productCount; product++) {
              const px = bx - (productCount - 1) * 0.19 + product * 0.38;
              put(out.detail, b, ry, px, shelfY + 0.16, d / 2 - 0.31,
                0.22, 0.27 + (product % 2) * 0.07, 0.12,
                productColors[(shelf + product) % productColors.length]);
            }
          }
        } else if (b.groundUse === 'fishmonger') {
          // Pale enamel-and-steel cold counters remain readable under the
          // south facade's noon backlight. Keeping them in the concrete/detail
          // batch also avoids multiplying them by the dark brushed-metal map.
          put(out.detail, b, ry, bx, 0.67, d / 2 - 0.34,
            bayW - 0.68, 0.72, 0.34, '#9cafaf');
          const traySpan = Math.min(1, bayW * 0.3);
          for (const [trayIndex, offset] of [-0.32, 0.32].entries()) {
            const trayX = bx + offset * traySpan;
            const trayW = Math.min(0.55, bayW * 0.24);
            put(out.detail, b, ry, trayX, 1.08, d / 2 - 0.29,
              trayW, 0.13, 0.18, '#e4e8e1');
            // Crushed ice, two restrained fish silhouettes and a small price
            // card make the counter legible as a fish display, not a pale box.
            for (let ice = 0; ice < 4; ice++) {
              put(out.detail, b, ry,
                trayX - trayW * 0.34 + ice * trayW * 0.22,
                1.17 + (ice % 2) * 0.018,
                d / 2 - 0.205 + (ice % 2) * 0.035,
                0.1, 0.055, 0.075, ice % 2 ? '#d9ecee' : '#eef4ee',
                { rz: (ice % 2 ? 1 : -1) * 0.18 });
            }
            for (let fish = 0; fish < 2; fish++) {
              const fishX = trayX + (fish === 0 ? -0.13 : 0.14) * Math.min(1, trayW / 0.45);
              const [fishWorldX, fishWorldZ] = l2w(b, ry, fishX, d / 2 - 0.185 + fish * 0.025);
              out.detail.add(unitDisplaySphere(), {
                x: fishWorldX, y: 1.205 + fish * 0.015, z: fishWorldZ,
                ry, sx: 0.28, sy: 0.075, sz: 0.09,
                color: fish === 0 ? '#657b80' : '#879296',
              });
              put(out.detail, b, ry, fishX - 0.17, 1.205 + fish * 0.015,
                d / 2 - 0.185 + fish * 0.025,
                0.09, 0.075, 0.025, fish === 0 ? '#657b80' : '#879296',
                { rz: Math.PI / 4 });
            }
            put(out.detail, b, ry, trayX + trayW * 0.32, 1.32, d / 2 - 0.16,
              0.14, 0.2, 0.025, trayIndex === 0 ? '#d8ccaa' : '#c9d5bd',
              { rz: trayIndex === 0 ? -0.07 : 0.06 });
          }
        }
      }
    }
  }
  // 门棚(雨棚)
  if (!hasHeroVenue && (shopProfile || rnd() < 0.6)) {
    const ac = shopProfile?.awning ?? AWNING_COLORS[Math.floor(rnd() * AWNING_COLORS.length)]();
    put(out.walls, b, ry, 0, groundH - 0.05, d / 2 + 0.42, w * 0.92, 0.06, 0.95, ac, { rx: -0.22 });
  }
  if (!hasHeroVenue && shopProfile?.noren) {
      const bx = -facadeInnerW / 2 + (doorBay + 0.5) * bayW;
    for (const offset of [-0.5, 0, 0.5]) {
      putPlane(out.walls, b, ry, bx + offset * Math.min(0.8, bayW * 0.22), 2.15, d / 2 + 0.08,
        Math.min(0.68, bayW * 0.2), 0.82, shopProfile.awning);
    }
  }
  if (!hasHeroVenue && b.groundUse === 'florist') {
    const doorX = -facadeInnerW / 2 + (doorBay + 0.5) * bayW;
    const side = doorX > 0 ? -1 : 1;
    for (let item = 0; item < 3; item++) {
      const flowerX = doorX + side * (0.54 + item * 0.38);
      const flowerY = 0.3 + item * 0.08;
      put(out.detail, b, ry, flowerX, flowerY, d / 2 + 0.12,
        0.3, 0.42 + item * 0.11, 0.3,
        ['#7b7654', '#687a58', '#8d675e'][item]);
      const stemHeight = 0.24 + item * 0.055;
      for (let stem = 0; stem < 3; stem++) {
        const stemX = flowerX + (stem - 1) * 0.065;
        const stemZ = d / 2 + 0.12 + ((stem + item) % 2 ? 0.035 : -0.025);
        const [stemWorldX, stemWorldZ] = l2w(b, ry, stemX, stemZ);
        out.detail.add(unitCylinder(), {
          x: stemWorldX, y: flowerY + 0.22 + stemHeight / 2, z: stemWorldZ,
          ry, sx: 0.025, sy: stemHeight, sz: 0.025, color: '#526b4d',
        });
        const flowerColor = ['#8f6d63', '#c0a66c', '#7c8870'][(item + stem) % 3];
        const flowerTop = flowerY + 0.24 + stemHeight;
        for (let petal = 0; petal < 3; petal++) {
          const angle = petal * Math.PI * 2 / 3 + stem * 0.35;
          const petalX = stemX + Math.cos(angle) * 0.065;
          const petalZ = stemZ + Math.sin(angle) * 0.05;
          const [petalWorldX, petalWorldZ] = l2w(b, ry, petalX, petalZ);
          out.detail.add(unitDisplaySphere(), {
            x: petalWorldX, y: flowerTop, z: petalWorldZ,
            ry: ry + angle, sx: 0.105, sy: 0.05, sz: 0.075,
            color: flowerColor,
          });
        }
        out.detail.add(unitDisplaySphere(), {
          x: stemWorldX, y: flowerTop + 0.012, z: stemWorldZ,
          ry, sx: 0.07, sy: 0.052, sz: 0.07, color: '#b59b62',
        });
        const [leafWorldX, leafWorldZ] = l2w(b, ry, stemX + (stem % 2 ? 0.07 : -0.06), stemZ);
        out.detail.add(unitDisplaySphere(), {
          x: leafWorldX, y: flowerY + 0.31 + stem * 0.035, z: leafWorldZ,
          ry: ry + (stem % 2 ? 0.45 : -0.45), sx: 0.13, sy: 0.055, sz: 0.09,
          color: stem % 2 ? '#5c7553' : '#71835d',
        });
      }
    }
  }
  // 二层以上住家窗(§4.1 二层以上渐简;少量暖窗)
  const floors = Math.max(1, Math.round((h - groundH) / 2.9));
  const nw = Math.max(1, Math.floor((w - 1.2) / 1.8));
  for (let f = 0; f < floors; f++) {
    const wy = groundH + 1.4 + f * ((h - groundH - 1.2) / floors);
    if (wy > h - 1) break;
    for (let i = 0; i < nw; i++) {
      const wx = -(w - 1.6) / 2 + (i + 0.5) * ((w - 1.6) / nw);
      const warmWindow = rnd() < 0.2;
      if (warmWindow) {
        putPlane(out.warm, b, ry, wx, wy, d / 2 + 0.03, 1.05, 1.25, shade(ACCENT.windowWarm, (rnd() - 0.5) * 0.06));
      } else {
        put(out.glass, b, ry, wx, wy, d / 2 + 0.01, 1.05, 1.25, 0.05, glass);
        if ((f * nw + i + Math.round(Math.abs(b.x) * 2)) % 4 === 0) {
          const curtain = (f + i) % 2 ? '#b6aa95' : '#a6afa5';
          for (const side of [-1, 1] as const) {
            putPlane(out.walls, b, ry, wx + side * 0.32, wy, d / 2 - 0.035,
              0.28, 1.08, curtain);
          }
        }
      }
      // 窗洞四周是一体挤出的带孔窗框，拥有内侧窗洞、压边和可观察厚度。
      put(out.detail, b, ry, wx, wy, d / 2 + 0.1, 1.22, 1.32, 0.14, wallDark, { profile: 'window' });
      const sashOffset = (f + i) % 2 ? -0.1 : 0.1;
      put(out.detail, b, ry, wx + sashOffset, wy, d / 2 + 0.18,
        0.035, 1.18, 0.04, wallDark);
      // 窗台
      put(out.walls, b, ry, wx, wy - 0.72, d / 2 + 0.06, 1.2, 0.08, 0.16, wall.clone().offsetHSL(0, 0, 0.03));
      if ((f * 3 + i + Math.round(Math.abs(b.x))) % 9 === 0) {
        for (const side of [-1, 1] as const) {
          const potX = wx + side * 0.22;
          const [potWorldX, potWorldZ] = l2w(b, ry, potX, d / 2 + 0.16);
          out.detail.add(unitCylinder(), {
            x: potWorldX, y: wy - 0.58, z: potWorldZ,
            ry, sx: 0.14, sy: 0.16, sz: 0.14, color: '#7d6755',
          });
          out.detail.add(unitDisplaySphere(), {
            x: potWorldX, y: wy - 0.43, z: potWorldZ,
            ry, sx: 0.2, sy: 0.12, sz: 0.17,
            color: side < 0 ? '#607653' : '#71805b',
          });
        }
      }
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
    put(out.metal, b, ry, lx, wy, lz, 0.5, 0.42, 0.38, ENV.metal);
    const [cx, cz] = l2w(b, ry, lx + sx * 0.27, lz);
    out.metal.add(unitCylinder(), { x: cx, y: wy, z: cz, sx: 0.13, sy: 0.13, sz: 0.05, color: shade(ENV.metal, 0.06) });
  }
  // 女儿墙
  const pw = 0.22, ph = 0.55;
  put(out.walls, b, ry, 0, h + ph / 2, d / 2 - pw / 2 - 0.02, w, ph, pw, wallDark);
  put(out.walls, b, ry, 0, h + ph / 2, -d / 2 + pw / 2 + 0.02, w, ph, pw, wallDark);
  put(out.walls, b, ry, -w / 2 + pw / 2 + 0.02, h + ph / 2, 0, pw, ph, d, wallDark);
  put(out.walls, b, ry, w / 2 - pw / 2 - 0.02, h + ph / 2, 0, pw, ph, d, wallDark);
  // Flat-roof shop-houses still need rainwater and service silhouettes. Use
  // one deterministic variant per building instead of the same roof kit on
  // every frontage.
  if (!b.venue) {
    const serviceSide = (Math.round(Math.abs(b.x) * 10) + Math.round(Math.abs(b.z))) % 2 ? 1 : -1;
    const gutterX = serviceSide * (w / 2 - 0.28);
    const [gutterWorldX, gutterWorldZ] = l2w(b, ry, 0, d / 2 + 0.17);
    out.metal.add(unitCylinder(), {
      x: gutterWorldX, y: h - 0.12, z: gutterWorldZ,
      ry, rz: Math.PI / 2, sx: 0.075, sy: w * 0.94, sz: 0.075,
      color: shade(ENV.metal, -0.02),
    });
    const [pipeWorldX, pipeWorldZ] = l2w(b, ry, gutterX, d / 2 + 0.18);
    out.metal.add(unitCylinder(), {
      x: pipeWorldX, y: h / 2, z: pipeWorldZ,
      ry, sx: 0.085, sy: h - 0.18, sz: 0.085,
      color: shade(ENV.metal, -0.025),
    });
    const roofVariant = (Math.round(Math.abs(b.x) * 2) + Math.round(b.h)) % 3;
    if (roofVariant === 0) {
      const antennaX = -serviceSide * w * 0.18;
      const antennaZ = -d * 0.12;
      const [antennaWorldX, antennaWorldZ] = l2w(b, ry, antennaX, antennaZ);
      out.metal.add(unitCylinder(), {
        x: antennaWorldX, y: h + 1.15, z: antennaWorldZ,
        ry, sx: 0.045, sy: 2.3, sz: 0.045, color: ENV.metal,
      });
      for (const y of [h + 1.45, h + 1.88]) {
        out.metal.add(unitCylinder(), {
          x: antennaWorldX, y, z: antennaWorldZ,
          ry, rz: Math.PI / 2, sx: 0.035, sy: 1.05, sz: 0.035, color: ENV.metal,
        });
      }
    } else if (roofVariant === 1) {
      put(out.metal, b, ry, serviceSide * w * 0.17, h + 0.46, -d * 0.14,
        0.58, 0.62, 0.58, shade(ENV.metal, 0.04));
      const [ventWorldX, ventWorldZ] = l2w(b, ry, serviceSide * w * 0.17, -d * 0.14);
      out.metal.add(unitCylinder(), {
        x: ventWorldX, y: h + 0.82, z: ventWorldZ,
        ry, sx: 0.36, sy: 0.1, sz: 0.36, color: shade(ENV.metal, -0.02),
      });
    }
  }

  // 竖招牌(sign 文案 canvas 霓虹)
  if (b.sign && !b.venue) {
    const [sx, sz] = l2w(b, ry, -w / 2 + 0.55, d / 2 + 0.42);
    out.signs.push({
      text: b.sign.text, color: b.sign.color,
      x: sx, y: Math.min(h - 0.8, 4.6), z: sz, ry,
      w: 0.48, h: Math.min(2.45, 0.5 * (b.sign.text.length + 1)), vertical: true, lit: false,
    });
  }
  if (!hasHeroVenue && b.groundUse) {
    const businessPlate = b.businessNotice
      ?? (b.businessState === 'closed' ? '定休日' : '営業中');
    const [plateX, plateZ] = l2w(b, ry, w * 0.22, d / 2 + 0.2);
    out.signs.push({
      text: businessPlate,
      color: typeof shopProfile?.awning === 'string' ? shopProfile.awning : '#6b675f',
      x: plateX, y: 2.38, z: plateZ, ry,
      w: Math.min(1.8, w * 0.36), h: 0.34, vertical: false, lit: false,
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
        put(lit ? out.warm : out.glass, b, ry, sx * (w / 2 + 0.04), wy, wz,
          0.12, 1.1, 0.9, lit ? shade(ACCENT.windowWarm, -0.06) : glass);
      }
    }
  }
  // Venue-specific portals now own the structural canopy and entrance accent;
  // do not lay the old full-width light strip across those deep openings.
  // 数据驱动的多层招牌：贴墙大牌与垂直刀牌共用 cityplan，不在组件里散落坐标。
  appendFacadeSigns(b, out.signs, ry, w, d);
  // venue 横招牌(门头)
  if (b.venue) {
    const v = VENUES.find((vv) => vv.key === b.venue);
    const label = b.sign?.text ?? v?.label ?? b.venue;
    const color = b.sign?.color ?? ACCENT.konbiniSign;
    const bx = doorBay >= 0 ? -facadeInnerW / 2 + (doorBay + 0.5) * bayW : 0;
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

  // The podium is a recessed service core, not a full-width street wall. The
  // surrounding columns and transfer slabs leave genuine arcade voids for the
  // deep storefronts supplied by HeroStreetStructures; from an oblique camera
  // the side elevation now exposes the same 0.9-1.3m reveal as the front.
  const podiumGeo = unitFacade().clone();
  applyPhysicalUv(podiumGeo, new THREE.Vector3(w - 1.8, 4.45, d - 1.9));
  podiumGeo.scale(w - 1.8, 4.45, d - 1.9);
  const podium = new THREE.Mesh(podiumGeo, podiumMat);
  podium.position.set(0, 2.225, -0.35);
  podium.castShadow = true;
  podium.receiveShadow = true;
  addOutline(podium);
  local.add(podium);
  const structuralParts = [
    // continuous base and roof transfer the tower load into the arcade frame
    { position: [0, 0.14, 0] as const, size: [w + 0.12, 0.28, d + 0.12] as const, material: podiumMat },
    { position: [0, 4.58, 0] as const, size: [w + 0.24, 0.42, d + 0.24] as const, material: inkMat },
    // closed rear service wall; the three public-facing elevations remain open
    { position: [0, 2.25, -d / 2 + 0.18] as const, size: [w, 4.5, 0.36] as const, material: podiumMat },
    ...([-1, 1] as const).flatMap((sx) => ([-1, 1] as const).map((sz) => ({
      position: [sx * (w / 2 - 0.38), 2.3, sz * (d / 2 - 0.38)] as const,
      size: [0.72, 4.6, 0.72] as const,
      material: podiumMat,
    }))),
  ];
  for (const part of structuralParts) {
    const geometry = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
    applyPhysicalUv(geometry);
    const mesh = new THREE.Mesh(
      geometry,
      part.material,
    );
    mesh.position.set(part.position[0], part.position[1], part.position[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    local.add(mesh);
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
    emissiveIntensity: 0.4,
    fog: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(displayW, displayH), screenMat);
  screen.position.set(0, 8.35, d / 2 + 0.36);
  local.add(screen);
  // 转角包屏：在斜向路口镜头里也能看到连续的广告动势，不让主屏只像一面贴墙海报。
  for (const side of [-1, 1] as const) {
    const sideTex = mediaTowerSideTexture(side);
    const sideMat = toonMat(0xffffff, {
      map: sideTex,
      emissiveMap: sideTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.34,
      fog: false,
    });
    const sideScreen = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.72, 4.9), sideMat);
    // The display surface sits 2 cm beyond the 28 cm-deep housing. The old
    // 12 cm offset left it inside the shell's outer face and could disappear
    // under depth testing at an oblique angle.
    sideScreen.position.set(side * (w / 2 + 0.18), 8.65, 0.2);
    sideScreen.rotation.y = side * Math.PI / 2;
    local.add(sideScreen);
    const sideFrame = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.2, d * 0.76), inkMat);
    sideFrame.position.set(side * (w / 2 + 0.02), 8.65, 0.2);
    local.add(sideFrame);
  }

  // 三层办公室窗带参与中段构图，避免巨幕上方退化成一块黑盒。
  const officeBands = [
    toonMat('#31bfc9', { emissive: '#31bfc9', emissiveIntensity: 0.22 }),
    toonMat(ACCENT.cinemaSign, { emissive: ACCENT.cinemaSign, emissiveIntensity: 0.24 }),
    toonMat('#e6ba51', { emissive: '#e6ba51', emissiveIntensity: 0.18 }),
  ];
  for (let row = 0; row < 3; row++) {
    const y = 17.5 + row * 5.8;
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(w * (row === 1 ? 0.78 : 0.88), 0.3, 0.25),
      officeBands[row],
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
  // Ground-floor access is explicit even on purely residential/backstreet
  // buildings. A recessed vestibule, real door leaf, glazing, handle and
  // service cabinet give the alley a human datum instead of a blank wall.
  const entryX = backstreet ? -w * 0.26 : w * 0.3;
  const entryW = Math.min(1.25, Math.max(0.82, w * 0.22));
  put(out.walls, b, ry, entryX, 1.25, d / 2 - 0.22, entryW + 0.34, 2.5, 0.32, wallDark);
  put(out.walls, b, ry, entryX, 1.2, d / 2 + 0.03, entryW, 2.32, 0.1, shade(ENV.wallC, -0.08));
  put(out.glass, b, ry, entryX, 1.62, d / 2 + 0.09, entryW * 0.58, 1.15, 0.05, glass);
  put(out.metal, b, ry, entryX + entryW * 0.3, 1.15, d / 2 + 0.15, 0.04, 0.42, 0.07, shade(ENV.metal, 0.08));
  put(out.walls, b, ry, entryX, 2.56, d / 2 + 0.2, entryW + 0.5, 0.12, 0.68, wallDark, { rx: -0.12 });
  const serviceX = entryX > 0 ? entryX - entryW * 0.9 : entryX + entryW * 0.9;
  put(out.metal, b, ry, serviceX, 0.9, d / 2 + 0.04, 0.52, 0.74, 0.24, ENV.metal);
  for (let grille = 0; grille < 3; grille++) {
    put(out.metal, b, ry, serviceX, 0.72 + grille * 0.16, d / 2 + 0.18, 0.35, 0.035, 0.04, wallDark);
  }
  if (backstreet) {
    // Service windows break up the long ground-floor blind wall at alley and
    // street termini. They stay cool and barred rather than reading as a shop.
    for (const utilityX of [w * 0.08, w * 0.34]) {
      const utilityW = Math.min(1.35, Math.max(0.78, w * 0.18));
      put(out.detail, b, ry, utilityX, 1.38, d / 2 + 0.04,
        utilityW + 0.18, 1.15, 0.14, wallDark, { profile: 'window' });
      put(out.glass, b, ry, utilityX, 1.38, d / 2 + 0.09,
        utilityW, 0.92, 0.05, glass);
      for (const bar of [-0.28, 0, 0.28]) {
        put(out.metal, b, ry, utilityX + bar * utilityW, 1.38, d / 2 + 0.16,
          0.035, 0.96, 0.05, ENV.metal);
      }
      put(out.walls, b, ry, utilityX, 0.74, d / 2 + 0.13,
        utilityW + 0.28, 0.09, 0.2, wallDark);
    }
  } else {
    // A single cool, barred service-room window keeps an apartment base from
    // becoming a blank concrete plinth when its entrance sits off-centre.
    const utilityX = -w * 0.14;
    const utilityW = Math.min(1.4, Math.max(0.9, w * 0.16));
    put(out.detail, b, ry, utilityX, 1.32, d / 2 + 0.04,
      utilityW + 0.18, 1.08, 0.14, wallDark, { profile: 'window' });
    put(out.glass, b, ry, utilityX, 1.32, d / 2 + 0.09,
      utilityW, 0.86, 0.05, glass);
    for (const bar of [-0.3, 0, 0.3]) {
      put(out.metal, b, ry, utilityX + bar * utilityW, 1.32, d / 2 + 0.16,
        0.035, 0.9, 0.05, ENV.metal);
    }
    put(out.walls, b, ry, utilityX, 0.72, d / 2 + 0.13,
      utilityW + 0.24, 0.09, 0.2, wallDark);
  }
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
  const roofServiceVariant = (Math.round(Math.abs(b.x) * 2) + Math.round(Math.abs(b.z)) + Math.round(h)) % 3;
  if (roofServiceVariant === 0) {
    const antennaX = w * 0.2;
    const antennaZ = -d * 0.18;
    const [antennaWorldX, antennaWorldZ] = l2w(b, ry, antennaX, antennaZ);
    out.metal.add(unitCylinder(), {
      x: antennaWorldX, y: h + 1.25, z: antennaWorldZ,
      ry, sx: 0.05, sy: 2.5, sz: 0.05, color: ENV.metal,
    });
    for (const y of [h + 1.55, h + 2.02]) {
      out.metal.add(unitCylinder(), {
        x: antennaWorldX, y, z: antennaWorldZ,
        ry, rz: Math.PI / 2, sx: 0.04, sy: 1.2, sz: 0.04, color: ENV.metal,
      });
    }
  } else if (roofServiceVariant === 1) {
    put(out.metal, b, ry, -w * 0.18, h + 0.38, -d * 0.22,
      0.68, 0.52, 0.68, shade(ENV.metal, 0.04));
    const [ventWorldX, ventWorldZ] = l2w(b, ry, -w * 0.18, -d * 0.22);
    out.metal.add(unitCylinder(), {
      x: ventWorldX, y: h + 0.69, z: ventWorldZ,
      ry, sx: 0.4, sy: 0.1, sz: 0.4, color: shade(ENV.metal, -0.03),
    });
  }
  const floors = Math.max(2, Math.round(h / 2.9));
  const fh = h / floors;
  const nUnit = Math.max(1, Math.floor((w - 1.5) / 2.6));
  // Side elevations face the short alleys at several key corners. They need
  // real openings just as much as the street facade; a full-height plain box
  // becomes an overwhelming blind wall at the 3.4m alley camera distance.
  const sideWindowRows = Math.max(2, Math.min(3, Math.floor((d - 1.2) / 2.5)));
  for (const sx of [-1, 1] as const) {
    for (let f = 0; f < floors; f++) {
      const wy = Math.min(h - 1.0, 1.55 + f * fh);
      for (let row = 0; row < sideWindowRows; row++) {
        if ((f + row + (sx > 0 ? 1 : 0)) % 4 === 0) continue;
        const wz = -(d - 1.5) / 2 + (row + 0.5) * ((d - 1.5) / sideWindowRows);
        const lit = (f * 3 + row + (sx > 0 ? 2 : 0)) % 6 === 0;
        put(out.detail, b, ry, sx * (w / 2 + 0.025), wy, wz,
          0.11, 1.28, 1.12, wallDark, { profile: 'window' });
        put(lit ? out.warm : out.glass, b, ry, sx * (w / 2 + 0.09), wy, wz,
          0.045, 1.02, 0.88, lit ? shade(ACCENT.windowWarm, -0.08) : glass);
        put(out.metal, b, ry, sx * (w / 2 + 0.13), wy, wz,
          0.035, 1.06, 0.045, wallDark);
        put(out.walls, b, ry, sx * (w / 2 + 0.11), wy - 0.68, wz,
          0.2, 0.1, 1.24, wallDark);
      }
    }
    const cableZ = d * (sx > 0 ? 0.18 : -0.22);
    put(out.metal, b, ry, sx * (w / 2 + 0.12), h * 0.46, cableZ,
      0.055, h * 0.82, 0.055, shade(ENV.metal, -0.04));
  }
  for (let f = 1; f < floors; f++) {
    const fy = f * fh;
    if (backstreet) {
      // 外走廊:通长挑板 + 栏杆 + 各户门. Boundary closures are viewed
      // almost head-on down a 3.4m alley; a full one-metre slab reads as a
      // black bridge across the lane. Give those non-playable termini a
      // shallower maintenance ledge and a lighter underside.
      const corridorDepth = b.backdrop ? 0.48 : 1.0;
      const corridorCentre = d / 2 + corridorDepth / 2 - 0.02;
      const railZ = d / 2 + corridorDepth - 0.06;
      put(out.walls, b, ry, 0, fy + 0.05, corridorCentre, w - 0.4, 0.1, corridorDepth,
        b.backdrop ? wall.clone().offsetHSL(0, 0, -0.018) : wallDark);
      put(out.metal, b, ry, 0, fy + 0.6, railZ, w - 0.4, 0.05, 0.05, ENV.metal);
      put(out.metal, b, ry, 0, fy + 0.32, railZ, w - 0.4, 0.04, 0.04, shade(ENV.metal, -0.025));
      const corridorPosts = Math.max(3, Math.min(7, Math.ceil((w - 0.8) / 1.55)));
      for (let post = 0; post < corridorPosts; post++) {
        const postX = -(w - 0.7) / 2 + post * ((w - 0.7) / Math.max(1, corridorPosts - 1));
        put(out.metal, b, ry, postX, fy + 0.34, railZ,
          0.04, 0.56, 0.045, shade(ENV.metal, -0.025));
      }
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
        const metalBalcony = (f + u + Math.round(Math.abs(b.x))) % 3 === 0;
        if (metalBalcony) {
          put(out.metal, b, ry, ux, fy + 0.86, d / 2 + 0.8, 2.0, 0.06, 0.07, ENV.metal);
          put(out.metal, b, ry, ux, fy + 0.56, d / 2 + 0.8, 2.0, 0.045, 0.055, ENV.metal);
          for (const railX of [-0.92, -0.46, 0, 0.46, 0.92]) {
            put(out.metal, b, ry, ux + railX, fy + 0.52, d / 2 + 0.8,
              0.04, 0.7, 0.055, ENV.metal);
          }
        } else {
          put(out.walls, b, ry, ux, fy + 0.42, d / 2 + 0.8, 2.0, 0.68, 0.06,
            wall.clone().offsetHSL(0, 0, -0.025));
          put(out.metal, b, ry, ux, fy + 0.78, d / 2 + 0.81, 1.88, 0.045, 0.05, ENV.metal);
        }
        put(out.detail, b, ry, ux, fy + 1.35, d / 2 + 0.1, 1.56, 1.32, 0.14, wallDark, { profile: 'window' });
        const warmUnit = rnd() < 0.2;
        if (warmUnit) {
          putPlane(out.warm, b, ry, ux, fy + 1.35, d / 2 + 0.03, 1.4, 1.15, shade(ACCENT.windowWarm, (rnd() - 0.5) * 0.06));
        } else {
          put(out.glass, b, ry, ux, fy + 1.35, d / 2 + 0.01, 1.4, 1.15, 0.05, glass);
          if ((f + u + Math.round(Math.abs(b.z))) % 3 === 0) {
            const curtain = (f + u) % 2 ? '#b8aa94' : '#a6aea3';
            for (const side of [-1, 1] as const) {
              putPlane(out.walls, b, ry, ux + side * 0.41, fy + 1.35, d / 2 - 0.04,
                0.32, 1.02, curtain);
            }
          }
        }
        // Sliding window rails and meeting stile make every opening read as a
        // domestic sash rather than a single dark rectangle.
        const sashOffset = (f + u) % 2 ? -0.12 : 0.12;
        put(out.detail, b, ry, ux + sashOffset, fy + 1.35, d / 2 + 0.17,
          0.04, 1.16, 0.045, wallDark);
        const livedIn = (f * nUnit + u + Math.round(Math.abs(b.x))) % 4 === 0;
        if (livedIn) {
          put(out.metal, b, ry, ux, fy + 1.04, d / 2 + 0.87,
            1.48, 0.035, 0.035, shade(ENV.metal, 0.04));
          for (const [clothIndex, clothX] of [-0.4, 0.1, 0.45].entries()) {
            if (clothIndex === 2 && (u + f) % 2 === 0) continue;
            putPlane(out.walls, b, ry, ux + clothX, fy + 0.78,
              d / 2 + 0.89, clothIndex === 1 ? 0.46 : 0.34,
              clothIndex === 1 ? 0.48 : 0.38,
              ['#a9b8b0', '#c2b49d', '#889ca3'][clothIndex]);
          }
        } else if ((f + u) % 3 === 1) {
          for (const side of [-1, 1] as const) {
            const potX = ux + side * 0.55;
            const [potWorldX, potWorldZ] = l2w(b, ry, potX, d / 2 + 0.72);
            out.detail.add(unitCylinder(), {
              x: potWorldX, y: fy + 0.26, z: potWorldZ,
              ry, sx: 0.22, sy: 0.25, sz: 0.22, color: '#796454',
            });
            out.detail.add(unitDisplaySphere(), {
              x: potWorldX, y: fy + 0.7, z: potWorldZ,
              ry, sx: 0.24, sy: 0.26, sz: 0.2,
              color: side < 0 ? '#627653' : '#73815b',
            });
            out.detail.add(unitCylinder(), {
              x: potWorldX, y: fy + 0.56, z: potWorldZ,
              ry, sx: 0.035, sy: 0.48, sz: 0.035, color: '#536a49',
            });
            for (const branch of [-1, 1] as const) {
              const [leafWorldX, leafWorldZ] = l2w(
                b, ry, potX + branch * 0.11, d / 2 + 0.72,
              );
              out.detail.add(unitDisplaySphere(), {
                x: leafWorldX, y: fy + 0.82 + branch * 0.05, z: leafWorldZ,
                ry: ry + branch * 0.5, sx: 0.2, sy: 0.1, sz: 0.14,
                color: branch < 0 ? '#5d734f' : '#70815a',
              });
            }
          }
        }
        // 空调位(§4.3)
        if (rnd() < 0.4) put(out.metal, b, ry, ux + 0.75, fy + 0.35, d / 2 + 0.62, 0.5, 0.4, 0.24, jitterColor(ENV.metal, rnd));
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
  const frame = wall.clone().offsetHSL(0, 0, -0.085);
  const reveal = wall.clone().offsetHSL(0, -0.015, 0.04);
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

  // Four-sided floor bands and corner piers turn the active intersection
  // tower into a constructed high-rise.  All parts remain in the existing
  // concrete/metal batches; no sign, emissive plane or new draw call is used.
  for (const section of secDims) {
    const front = section.oz + section.sd / 2;
    const rear = section.oz - section.sd / 2;
    const left = section.ox - section.sw / 2;
    const right = section.ox + section.sw / 2;
    const floorCount = Math.max(2, Math.floor(section.sh / 2.85));
    for (let floor = 1; floor < floorCount; floor += 1) {
      const fy = section.y + (floor * section.sh) / floorCount;
      put(walls, b, ry, section.ox, fy, front + 0.09, section.sw + 0.22, 0.12, 0.24, frame);
      put(walls, b, ry, section.ox, fy, rear - 0.09, section.sw + 0.22, 0.12, 0.24, frame);
      put(walls, b, ry, left - 0.09, fy, section.oz, 0.24, 0.12, section.sd + 0.22, frame);
      put(walls, b, ry, right + 0.09, fy, section.oz, 0.24, 0.12, section.sd + 0.22, frame);
    }

    for (const xFactor of [-0.33, 0, 0.33]) {
      put(walls, b, ry, section.ox + section.sw * xFactor, section.y + section.sh / 2,
        front + 0.12, 0.11, section.sh - 0.55, 0.22, xFactor === 0 ? reveal : frame);
      put(walls, b, ry, section.ox + section.sw * xFactor, section.y + section.sh / 2,
        rear - 0.12, 0.11, section.sh - 0.55, 0.22, frame);
    }
    for (const zFactor of [-0.3, 0, 0.3]) {
      put(walls, b, ry, left - 0.12, section.y + section.sh / 2,
        section.oz + section.sd * zFactor, 0.22, section.sh - 0.55, 0.11, frame);
      put(walls, b, ry, right + 0.12, section.y + section.sh / 2,
        section.oz + section.sd * zFactor, 0.22, section.sh - 0.55, 0.11, frame);
    }
  }

  // An offset maintenance balcony supplies a human-scale datum on the broad
  // west return.  It is high above navigation and physically tied to the wall.
  const serviceY = Math.min(h * 0.46, 16.4);
  put(walls, b, ry, -w / 2 - 0.48, serviceY, 0.65, 0.92, 0.14, Math.min(5.1, d * 0.46), frame);
  put(walls, b, ry, -w / 2 - 0.9, serviceY + 0.62, 0.65, 0.08, 1.24, Math.min(5.0, d * 0.44), frame);
  for (const zOffset of [-1.8, 0, 1.8]) {
    put(walls, b, ry, -w / 2 - 0.9, serviceY + 0.6, 0.65 + zOffset, 0.08, 1.2, 0.08, frame);
  }
  put(walls, b, ry, -w / 2 - 0.94, serviceY + 0.9, 0.65, 0.07, 0.08, Math.min(4.85, d * 0.42), shade(ACCENT.lampSodium, -0.22));
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

  const near: Bags = {
    walls: new MergeBag(), detail: new MergeBag(), glass: new MergeBag(), shopGlass: new MergeBag(), metal: new MergeBag(),
    shutters: new MergeBag(), warm: new MergeBag(), signs: [],
  };
  const far: Bags = {
    walls: new MergeBag(), detail: new MergeBag(), glass: new MergeBag(), shopGlass: new MergeBag(), metal: new MergeBag(),
    shutters: new MergeBag(), warm: new MergeBag(), signs: [],
  };
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
      const glassGeo = bags.glass.build();
      if (glassGeo) {
        const glassMat = surfaceMaterial('darkGlass', true);
        glassMat.color.set('#35596a');
        glassMat.emissive.set('#0b2632');
        glassMat.emissiveIntensity = 0.18;
        const mesh = new THREE.Mesh(glassGeo, glassMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      const shopGlassGeo = bags.shopGlass.build();
      if (shopGlassGeo) {
        const shopGlassMat = surfaceMaterial('glass', true);
        shopGlassMat.color.set('#ffffff');
        shopGlassMat.roughness = 0.28;
        shopGlassMat.metalness = 0.08;
        shopGlassMat.transparent = true;
        shopGlassMat.opacity = 0.48;
        shopGlassMat.depthWrite = false;
        const mesh = new THREE.Mesh(shopGlassGeo, shopGlassMat);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.renderOrder = 2;
        group.add(mesh);
      }
      const metalGeo = bags.metal.build();
      if (metalGeo) {
        const metalMat = surfaceMaterial('brushedMetal', true);
        const mesh = new THREE.Mesh(metalGeo, metalMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
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
      const structuralMaterial = surfaceMaterial('metal', true, false);
      structuralMaterial.roughness = 0.62;
      structuralMaterial.metalness = 0.58;
      const mesh = new THREE.Mesh(geo, structuralMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      addOutline(mesh);
      group.add(mesh);
    }
    const detailGeo = towerDetails.build();
    if (detailGeo) {
      const towerConcrete = surfaceMaterial('paintedConcrete', true);
      const mesh = new THREE.Mesh(detailGeo, towerConcrete);
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

/** §4.2 三层背景街墙:退台体量 + 低对比窗带,合并批次,二阶 toon、不描边。 */
function buildSilhouettes(group: THREE.Group): void {
  const silos = BUILDINGS.filter((b) => b.style === 'silhouette');
  if (silos.length === 0) return;
  const radii = silos.map((b) => Math.hypot(b.x, b.z)).sort((a, b) => a - b);
  const t1 = radii[Math.floor(radii.length / 3)] ?? 300;
  const t2 = radii[Math.floor((radii.length * 2) / 3)] ?? 380;
  const layers = [new MergeBag(), new MergeBag(), new MergeBag()];
  const layerColors = [ENV.bgSilhouetteA, ENV.bgSilhouetteB, ENV.bgSilhouetteC];
  const windowBands = new MergeBag();
  const glow = new MergeBag();
  const vistaSigns: SignSpec[] = [];
  const rnd = seededRandom(940_001);
  for (const b of silos) {
    const r = Math.hypot(b.x, b.z);
    const li = r <= t1 ? 0 : r <= t2 ? 1 : 2;
    const bag = layers[li];
    const color = jitterColor(layerColors[li], rnd);
    const ry = b.ry ?? (rnd() - 0.5) * 0.2;
    // A single full-height cuboid becomes a giant blank slab whenever the
    // player looks up. Split every mass into a street datum and a recessed
    // upper volume while preserving the authored overall height/footprint.
    const lowerH = b.h * (0.62 + rnd() * 0.08);
    const upperH = b.h - lowerH;
    const upperW = b.w * (0.66 + rnd() * 0.18);
    const upperD = b.d * (0.68 + rnd() * 0.17);
    const upperLocalX = (rnd() - 0.5) * Math.max(0, b.w - upperW) * 0.7;
    const upperLocalZ = (rnd() - 0.5) * Math.max(0, b.d - upperD) * 0.55;
    const [upperX, upperZ] = l2w(b, ry, upperLocalX, upperLocalZ);
    bag.add(unitFacade(), {
      x: b.x, y: lowerH / 2, z: b.z,
      sx: b.w, sy: lowerH, sz: b.d, ry, color,
    });
    bag.add(unitFacade(), {
      x: upperX, y: lowerH + upperH / 2, z: upperZ,
      sx: upperW, sy: upperH, sz: upperD, ry,
      color: new THREE.Color(color).offsetHSL(0, 0, li === 0 ? 0.012 : -0.008),
    });
    bag.add(unitBox(), {
      x: b.x, y: lowerH - 0.12, z: b.z,
      sx: b.w + 0.28, sy: 0.24, sz: b.d + 0.28, ry,
      color: new THREE.Color(color).offsetHSL(0, 0, -0.025),
    });
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
    // Low-contrast, non-emissive domestic/office windows keep the near two
    // background layers architectural in daylight without competing with the
    // active street. Use the actual oriented facade planes: the nearest layer
    // gets a narrower return band on its second-visible face, while the middle
    // layer keeps one face and the far layer remains a quiet silhouette.
    if (li < 2) {
      const rows = Math.max(3, Math.min(7, Math.floor(lowerH / 4.4)));
      const windowColor = new THREE.Color(color).offsetHSL(
        -0.005, 0.015, li === 0 ? -0.075 : -0.055,
      );
      const centreLength = Math.max(0.001, Math.hypot(b.x, b.z));
      const centreX = -b.x / centreLength;
      const centreZ = -b.z / centreLength;
      const sinRy = Math.sin(ry);
      const cosRy = Math.cos(ry);
      const faces = [
        { lry: 0, width: b.w, lx: 0, lz: b.d / 2 + 0.18, ax: 1, az: 0, nx: sinRy, nz: cosRy },
        { lry: Math.PI, width: b.w, lx: 0, lz: -b.d / 2 - 0.18, ax: 1, az: 0, nx: -sinRy, nz: -cosRy },
        { lry: Math.PI / 2, width: b.d, lx: b.w / 2 + 0.18, lz: 0, ax: 0, az: 1, nx: cosRy, nz: -sinRy },
        { lry: -Math.PI / 2, width: b.d, lx: -b.w / 2 - 0.18, lz: 0, ax: 0, az: 1, nx: -cosRy, nz: sinRy },
      ].sort((a, c) => (c.nx * centreX + c.nz * centreZ) - (a.nx * centreX + a.nz * centreZ));
      const visibleFaces = faces.slice(0, li === 0 ? 2 : 1);
      visibleFaces.forEach((face, faceIndex) => {
        const span = faceIndex === 0 ? 0.66 : 0.48;
        const maxCols = faceIndex === 0 ? 4 : 3;
        const cols = Math.max(2, Math.min(maxCols, Math.floor(face.width / 3.2)));
        const windowW = Math.min(faceIndex === 0 ? 1.35 : 1.15, face.width / (cols + 0.8) * 0.54);
        for (let row = 0; row < rows; row++) {
          const windowY = 3.1 + row * ((lowerH - 5.2) / Math.max(1, rows - 1));
          if (windowY >= lowerH - 1.2) continue;
          for (let col = 0; col < cols; col++) {
            if ((row * cols + col + faceIndex * 3 + Math.round(Math.abs(b.x + b.z))) % 7 === 0) continue;
            const along = -(face.width * span) / 2 + col * ((face.width * span) / Math.max(1, cols - 1));
            const [wx, wz] = l2w(b, ry, face.lx + face.ax * along, face.lz + face.az * along);
            windowBands.add(unitPlane(), {
              x: wx, y: windowY, z: wz, ry: ry + face.lry,
              sx: windowW, sy: 1.08, sz: 1, color: windowColor,
            });
          }
        }
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
  const windowBandGeo = windowBands.build();
  if (windowBandGeo) {
    const windows = new THREE.Mesh(windowBandGeo, vertexToonMat(2));
    windows.castShadow = false;
    windows.receiveShadow = false;
    group.add(windows);
  }
  const glowGeo = glow.build();
  if (glowGeo) {
    const m = vertexToonMat(2).clone();
    m.emissive = new THREE.Color(ACCENT.windowWarm);
    m.emissiveIntensity = 0.5;
    m.fog = true;
    group.add(new THREE.Mesh(glowGeo, m));
  }
  for (const sign of vistaSigns) group.add(makeSignMesh(sign));
  // 合计:3 层体量 + 1 窗带 + 1 亮窗 + 少量消失点招牌。
}

/** 建筑总组件:enqueue 一次,组模块级缓存。 */
export function Buildings({ queue, spawn }: { queue: BuildQueue; spawn: [number, number] }) {
  const group = useMemo(() => enqueueBuildings(queue, spawn), [queue, spawn]);
  return <primitive object={group} />;
}

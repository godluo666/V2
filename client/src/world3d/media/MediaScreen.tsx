/**
 * Synchronized media screen (3D 侧).
 * 播放器实例不在这里 —— 全客户端只有 MediaLayer(常驻 DOM)里的那一个
 * (任务书:全屏必须复用同一播放器,禁止双播放器)。本组件负责:
 *  - 屏框/待机面/氛围光(Canvas 内的 3D 部分)
 *  - 认领"谁是画面持有屏"(多屏镜像同一媒体时,最宽的屏胜出)
 *  - 每帧把 drei Html transform 的同款 CSS3D 矩阵推给 MediaLayer,
 *    让那个唯一的 DOM 播放器"贴"在这块 3D 屏幕上
 * 全屏时 MediaLayer 自己切成 fixed 覆盖层,这里熄成暗面即可。
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useWorld } from '../../state/stores';
import { mediaRuntime } from './runtime';
import { useFullscreenMedia } from './fullscreen';

export { mediaTargetPosition } from './players';

/** CSS pixel width of the single screen overlay (MediaLayer 使用同一常量). */
export const PX = 720;

const idleTextureCache = new Map<'cinema' | 'standard', THREE.CanvasTexture>();

function idleTexture(cinema = false): THREE.CanvasTexture {
  const cacheKey = cinema ? 'cinema' : 'standard';
  const cached = idleTextureCache.get(cacheKey);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 288;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 512, 288);
  grad.addColorStop(0, cinema ? '#35202f' : '#101828');
  grad.addColorStop(0.52, cinema ? '#211d29' : '#15142c');
  grad.addColorStop(1, cinema ? '#142131' : '#1a1030');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 288);
  if (cinema) {
    ctx.fillStyle = '#85314f';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(190, 0); ctx.lineTo(92, 288); ctx.lineTo(0, 288); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#75a8c8';
    ctx.fillRect(0, 270, 512, 5);
    ctx.strokeStyle = 'rgba(255,235,207,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, 476, 252);
    ctx.strokeStyle = 'rgba(255,220,166,0.24)';
    ctx.lineWidth = 1;
    ctx.strokeRect(29, 29, 454, 230);
    ctx.fillStyle = 'rgba(246,222,188,0.68)';
    ctx.font = '700 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HOUSE 01  /  GRAND FORMAT  /  READY', 304, 66);
  }
  ctx.fillStyle = cinema ? '#f5e0c6' : '#5b8cff';
  ctx.font = cinema ? '800 42px "Segoe UI", sans-serif' : '700 34px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(cinema ? 'AURORA SCREEN' : '团子影像', 256, 130);
  ctx.fillStyle = cinema ? '#ddb375' : '#9aa7bd';
  ctx.font = '18px "Segoe UI", sans-serif';
  ctx.fillText(cinema ? '巨幕厅 · 等待下一场放映' : '走近按 E,把网页或视频放上屏幕', 256, 172);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  idleTextureCache.set(cacheKey, texture);
  return texture;
}

// ── drei Html transform 的同款 CSS3D 数学(与 @react-three/drei web/Html.js 一致)──
const epsilon = (v: number) => (Math.abs(v) < 1e-10 ? 0 : v);
function getCSSMatrix(matrix: THREE.Matrix4, multipliers: number[], prepend = ''): string {
  let m = 'matrix3d(';
  for (let i = 0; i !== 16; i++) m += epsilon(multipliers[i] * matrix.elements[i]) + (i !== 15 ? ',' : ')');
  return prepend + m;
}
const CAM_MUL = [1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1];
const OBJ_MUL = [1, 1, 1, 1, -1, -1, -1, -1, 1, 1, 1, 1, 1, 1, 1, 1];
const getCameraCSSMatrix = (m: THREE.Matrix4) => getCSSMatrix(m, CAM_MUL);
const getObjectCSSMatrix = (m: THREE.Matrix4) => getCSSMatrix(m, OBJ_MUL, 'translate(-50%,-50%)');

const V_OBJ = new THREE.Vector3();
const V_CAM = new THREE.Vector3();
const V_DIR = new THREE.Vector3();

/* ── The screen assembly ─────────────────────────────────────────────────── */
export default function MediaScreen({ position, rotation, width, height, frame = true }: {
  position: [number, number, number];
  rotation: number;
  width: number;
  height: number;
  frame?: boolean;
}) {
  const media = useWorld((s) => s.media);
  const fsOpen = useFullscreenMedia((s) => s.open);
  const active = !!media && (!!media.url || media.kind === 'share');
  const idle = useMemo(() => idleTexture(width >= 12), [width]);
  const anchorRef = useRef<THREE.Group>(null);
  const id = useMemo(() => `scr_${position.join(',')}_${width}`, [position, width]);
  // 渲染像素密度按屏宽走:巨幕(≥12m)用 1440px 面,近看不发虚;
  // 常规屏保持 720px(iframe 渲染成本与清晰度的折衷)
  const px = width >= 12 ? 1440 : PX;
  const py = Math.round(px * (height / width));

  useEffect(() => { if (!active) mediaRuntime.reset(); }, [active]);

  // 认领画面持有权(最宽的屏胜出);卸载/换空间时释放并熄灭图层
  useEffect(() => {
    mediaRuntime.claim(id, width);
    return () => {
      mediaRuntime.release(id);
      if (mediaRuntime._owner === null) mediaRuntime.pushLayerFrame(null);
    };
  }, [id, width]);

  useFrame(({ camera, size }) => {
    if (!mediaRuntime.isOwner(id)) return;
    if (!active || fsOpen) {
      // 全屏/无媒体时不驱动世界内图层(MediaLayer 自己处理全屏样式)
      if (!fsOpen) mediaRuntime.pushLayerFrame(null);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchor.updateWorldMatrix(true, false);
    // 可见性:锚点在相机前方且 35m 内
    V_OBJ.setFromMatrixPosition(anchor.matrixWorld);
    V_CAM.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(V_DIR);
    const toObj = V_OBJ.clone().sub(V_CAM);
    const visible = toObj.dot(V_DIR) > 0 && toObj.length() < 35;

    const heightHalf = size.height / 2;
    const fovPx = (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5] * heightHalf;
    mediaRuntime.pushLayerFrame({
      fovPx,
      cameraCss: `translateZ(${fovPx}px)${getCameraCSSMatrix(camera.matrixWorldInverse)}translate(${size.width / 2}px,${heightHalf}px)`,
      objectCss: getObjectCSSMatrix(anchor.matrixWorld),
      w: size.width,
      h: size.height,
      px,
      py,
      visible,
    });
  });

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {frame && (
        <mesh castShadow>
          <boxGeometry args={[width + 0.22, height + 0.22, 0.09]} />
          <meshStandardMaterial color="#292c35" roughness={0.56} metalness={0.28} />
        </mesh>
      )}
      {!active && (
        <mesh position={[0, 0, 0.012]}>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial
            map={idle}
            emissive="#ffffff"
            emissiveMap={idle}
            emissiveIntensity={0.62}
            roughness={0.48}
          />
        </mesh>
      )}
      {active && (
        /* 画面本体在 MediaLayer(DOM);3D 侧铺一块暗面作为底(播放层culled/
           全屏/非持有屏时看到的就是它) */
        <mesh position={[0, 0, 0.012]}>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial
            map={idle}
            color="#8b919d"
            emissive="#4b505c"
            emissiveMap={idle}
            emissiveIntensity={0.24}
            roughness={0.62}
          />
        </mesh>
      )}
      {/* 播放层锚点:scale 使 px 个 CSS 像素 = width 米(drei distanceFactor=400 等价) */}
      <group ref={anchorRef} position={[0, 0, 0.03]} scale={width / px} />
    </group>
  );
}

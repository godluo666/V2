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

type IdleVariant = 'cinema' | 'arena' | 'standard';

const idleTextureCache = new Map<IdleVariant, THREE.CanvasTexture>();
const screenBackingMaterial = new THREE.MeshStandardMaterial({
  color: '#111923', roughness: 0.62, metalness: 0.24,
});
const screenFrameMaterial = new THREE.MeshStandardMaterial({
  color: '#667180', roughness: 0.42, metalness: 0.58,
});
const screenBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

function screenVariant(width: number, height: number): IdleVariant {
  if (width >= 20 && height < 9) return 'arena';
  if (width >= 20 && height >= 9) return 'cinema';
  return 'standard';
}

function idleTexture(variant: IdleVariant): THREE.CanvasTexture {
  const cached = idleTextureCache.get(variant);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 768; c.height = 432;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 768, 432);
  if (variant === 'cinema') {
    grad.addColorStop(0, '#53233b');
    grad.addColorStop(0.42, '#181d2b');
    grad.addColorStop(1, '#17364b');
  } else if (variant === 'arena') {
    grad.addColorStop(0, '#082b3d');
    grad.addColorStop(0.5, '#11162d');
    grad.addColorStop(1, '#32164e');
  } else {
    grad.addColorStop(0, '#101d2d');
    grad.addColorStop(0.55, '#17182e');
    grad.addColorStop(1, '#28163b');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 768, 432);

  // These graphics are display content, not decoration pretending to be
  // geometry. They keep a venue legible while the sole DOM player is absent,
  // reconnecting or between sources.
  if (variant === 'cinema') {
    ctx.fillStyle = '#8d294d';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(236, 0); ctx.lineTo(118, 432); ctx.lineTo(0, 432); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(113,190,218,.16)';
    ctx.beginPath(); ctx.arc(584, 226, 164, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#83c4d9';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(584, 226, 120, -1.1, 1.95); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,232,199,.88)';
    ctx.lineWidth = 4;
    ctx.strokeRect(28, 28, 712, 376);
    ctx.strokeStyle = 'rgba(255,220,166,.24)';
    ctx.lineWidth = 2;
    ctx.strokeRect(43, 43, 682, 346);
    ctx.fillStyle = '#f6dec0';
    ctx.font = '800 16px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HOUSE 01  /  24M GRAND FORMAT  /  READY', 430, 83);
    ctx.font = '900 64px "Segoe UI", sans-serif';
    ctx.fillText('AURORA', 404, 203);
    ctx.font = '800 34px "Segoe UI", sans-serif';
    ctx.fillStyle = '#e3bd80';
    ctx.fillText('GRAND SCREEN', 404, 250);
    ctx.font = '700 16px "Segoe UI", sans-serif';
    ctx.fillStyle = '#c3d9e4';
    ctx.fillText('FEATURE PRESENTATION  //  STANDBY', 404, 320);
    ctx.fillStyle = '#83c4d9';
    ctx.fillRect(0, 407, 768, 7);
  } else if (variant === 'arena') {
    ctx.fillStyle = 'rgba(39,211,235,.2)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(290, 0); ctx.lineTo(212, 432); ctx.lineTo(0, 432); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(151,80,239,.22)';
    ctx.beginPath(); ctx.moveTo(768, 0); ctx.lineTo(536, 0); ctx.lineTo(610, 432); ctx.lineTo(768, 432); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3edff0';
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, 720, 384);
    ctx.strokeStyle = '#8a5cf0';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 40, 688, 352);
    for (let y = 72; y < 390; y += 28) {
      ctx.strokeStyle = 'rgba(115,198,231,.08)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(42, y); ctx.lineTo(726, y); ctx.stroke();
    }
    ctx.fillStyle = '#dffaff';
    ctx.textAlign = 'center';
    ctx.font = '900 66px "Segoe UI", sans-serif';
    ctx.fillText('NEXUS ARENA', 384, 198);
    ctx.fillStyle = '#7fe9f1';
    ctx.font = '800 22px "Segoe UI", sans-serif';
    ctx.fillText('LIVE EVENT SYSTEM  //  MAIN STAGE', 384, 247);
    ctx.fillStyle = '#c7b5ff';
    ctx.font = '700 17px "Segoe UI", sans-serif';
    ctx.fillText('MATCH CONTROL READY  /  8 STATIONS ONLINE', 384, 326);
    ctx.fillStyle = '#3edff0';
    ctx.fillRect(42, 358, 310, 7);
    ctx.fillStyle = '#8a5cf0';
    ctx.fillRect(416, 358, 310, 7);
  } else {
    ctx.strokeStyle = '#5b8cff';
    ctx.lineWidth = 5;
    ctx.strokeRect(24, 24, 720, 384);
    ctx.fillStyle = '#dce7ff';
    ctx.textAlign = 'center';
    ctx.font = '800 54px "Segoe UI", sans-serif';
    ctx.fillText('DANGO MEDIA', 384, 198);
    ctx.fillStyle = '#9aa7bd';
    ctx.font = '600 23px "Segoe UI", sans-serif';
    ctx.fillText('PRESS E TO OPEN MEDIA', 384, 254);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  idleTextureCache.set(variant, texture);
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
  const variant = useMemo(() => screenVariant(width, height), [height, width]);
  const idle = useMemo(() => idleTexture(variant), [variant]);
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
        <group>
          {/* A shallow equipment back and four real rails. The previous single
              BoxGeometry was a solid slab in front of the display surface. */}
          <mesh
            dispose={null}
            geometry={screenBoxGeometry}
            scale={[width + 0.34, height + 0.34, 0.11]}
            position={[0, 0, -0.055]}
            material={screenBackingMaterial}
            castShadow
            receiveShadow
          />
          {[-1, 1].map((side) => (
            <mesh
              dispose={null}
              key={`v-${side}`}
              geometry={screenBoxGeometry}
              scale={[0.21, height + 0.42, 0.18]}
              position={[side * (width / 2 + 0.105), 0, 0.035]}
              material={screenFrameMaterial}
              castShadow
            />
          ))}
          {[-1, 1].map((side) => (
            <mesh
              dispose={null}
              key={`h-${side}`}
              geometry={screenBoxGeometry}
              scale={[width + 0.42, 0.21, 0.18]}
              position={[0, side * (height / 2 + 0.105), 0.035]}
              material={screenFrameMaterial}
              castShadow
            />
          ))}
        </group>
      )}
      {!active && (
        <mesh position={[0, 0, 0.075]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial
            map={idle}
            toneMapped={false}
          />
        </mesh>
      )}
      {active && (
        /* 画面本体在 MediaLayer(DOM);3D 侧保留可读的待机底图，供播放层
           culled、全屏或临时失主时显示。 */
        <mesh position={[0, 0, 0.075]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial
            map={idle}
            color="#b8bec8"
            toneMapped={false}
          />
        </mesh>
      )}
      {/* 播放层锚点:scale 使 px 个 CSS 像素 = width 米(drei distanceFactor=400 等价) */}
      <group ref={anchorRef} position={[0, 0, 0.1]} scale={width / px} />
    </group>
  );
}

/**
 * 镜界电竞观战馆：42 × 34m 的大型赛事空间。
 *
 * 这个模块只负责“实体建筑/设备”层：多层比赛台、屏幕承重结构、吊装桁架、
 * 阶梯看台、广播控制区和八个共享画面机位。互动点与碰撞仍由 shared/layouts
 * 维护，避免把业务坐标散落在美术组件里。
 *
 * 所有重复几何共享 BufferGeometry；观众座椅使用 InstancedMesh。屏幕显示面是
 * 唯一允许使用薄面的部位，其余边框、护栏、灯架、桥架均有可观察厚度。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ARENA_SPATIAL_CONTRACT } from '@nexuspark/shared';
import { useSession, useVoice, useWorld } from '../../state/stores';
import { voice } from '../../voice/voice';
import { surfaceMaterial, type SurfaceKind } from '../city/materials';

type P3 = [number, number, number];
type R3 = [number, number, number];

interface FinishTuning {
  roughness?: number;
  metalness?: number;
  bumpScale?: number;
}

function finish(
  kind: SurfaceKind,
  color: string,
  tuning: FinishTuning = {},
): THREE.MeshStandardMaterial {
  const material = surfaceMaterial(kind);
  material.color.set(color);
  if (tuning.roughness !== undefined) material.roughness = tuning.roughness;
  if (tuning.metalness !== undefined) material.metalness = tuning.metalness;
  if (tuning.bumpScale !== undefined) material.bumpScale = tuning.bumpScale;
  return material;
}

function illuminated(kind: SurfaceKind, color: string, intensity: number): THREE.MeshStandardMaterial {
  const material = finish(kind, color);
  material.emissive.set(color);
  material.emissiveIntensity = intensity;
  return material;
}

const MATERIAL = {
  // Neutral albedo separation remains readable on the real low-tier cloud path
  // without relying on Bloom: mineral risers, powder-coated shells, brushed
  // load-bearing steel, rubber deck and woven finishes all respond differently.
  concrete: finish('oldConcrete', '#555960', { roughness: 0.94, metalness: 0.01, bumpScale: 0.15 }),
  painted: finish('paintedConcrete', '#747b84', { roughness: 0.82, metalness: 0.025, bumpScale: 0.075 }),
  blackMetal: finish('metal', '#18232d', { roughness: 0.58, metalness: 0.7, bumpScale: 0.045 }),
  equipmentPolymer: finish('metal', '#3d4652', { roughness: 0.76, metalness: 0.2, bumpScale: 0.025 }),
  steel: finish('brushedMetal', '#9ba8b2', { roughness: 0.32, metalness: 0.88, bumpScale: 0.032 }),
  darkSteel: finish('brushedMetal', '#455560', { roughness: 0.43, metalness: 0.82, bumpScale: 0.036 }),
  glass: finish('darkGlass', '#19364a', { roughness: 0.2, metalness: 0.46, bumpScale: 0.01 }),
  rubber: finish('wetAsphalt', '#252c34', { roughness: 0.8, metalness: 0.04, bumpScale: 0.055 }),
  floorJoint: finish('wetAsphalt', '#11171c', { roughness: 0.9, metalness: 0.02, bumpScale: 0.04 }),
  stageDeck: finish('paintedConcrete', '#4b5262', { roughness: 0.7, metalness: 0.08, bumpScale: 0.065 }),
  deskTop: finish('brushedMetal', '#697682', { roughness: 0.46, metalness: 0.54, bumpScale: 0.025 }),
  acoustic: finish('acousticFabric', '#51485f', { roughness: 0.98, metalness: 0, bumpScale: 0.095 }),
  seat: finish('seatFabric', '#59677b', { roughness: 0.95, metalness: 0, bumpScale: 0.105 }),
  seatAccent: finish('seatFabric', '#76526f', { roughness: 0.95, metalness: 0, bumpScale: 0.105 }),
  cyan: illuminated('plasticLightbox', '#39d9f2', 0.82),
  cyanDim: illuminated('plasticLightbox', '#26758a', 0.28),
  violet: illuminated('plasticLightbox', '#7656ef', 0.78),
  violetDim: illuminated('plasticLightbox', '#45347f', 0.24),
  pink: illuminated('plasticLightbox', '#e34fb4', 0.68),
  pinkDim: illuminated('plasticLightbox', '#7a3566', 0.2),
  warning: illuminated('plasticLightbox', '#efc557', 0.48),
};

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 10);
const OCTAGON = new THREE.CylinderGeometry(1, 1, 1, 8);

interface PartProps {
  position: P3;
  scale: P3;
  material: THREE.Material;
  rotation?: R3;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

function Part({
  position,
  scale,
  material,
  rotation = [0, 0, 0],
  castShadow = true,
  receiveShadow = true,
}: PartProps) {
  return (
    <mesh
      dispose={null}
      geometry={BOX}
      position={position}
      scale={scale}
      rotation={rotation}
      material={material}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}

function CylinderPart({
  position,
  scale,
  rotation = [0, 0, 0],
  material,
}: Omit<PartProps, 'castShadow' | 'receiveShadow'>) {
  return (
    <mesh
      dispose={null}
      geometry={CYLINDER}
      position={position}
      scale={scale}
      rotation={rotation}
      material={material}
      castShadow
      receiveShadow
    />
  );
}

interface InstanceSpec {
  position: P3;
  rotation?: R3;
  scale: P3;
}

function InstancedParts({
  specs,
  material,
  castShadow = true,
  receiveShadow = true,
}: {
  specs: InstanceSpec[];
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    specs.forEach((spec, index) => {
      object.position.set(...spec.position);
      object.rotation.set(...(spec.rotation ?? [0, 0, 0]));
      object.scale.set(...spec.scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [specs]);

  return (
    <instancedMesh
      dispose={null}
      ref={ref}
      args={[BOX, material, specs.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}

/* ───────────────────────────── 赛事机位 ───────────────────────────── */

let stationIdle: THREE.CanvasTexture | null = null;

function stationIdleTexture(): THREE.CanvasTexture {
  if (stationIdle) return stationIdle;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 640, 360);
  gradient.addColorStop(0, '#10182a');
  gradient.addColorStop(0.52, '#20214b');
  gradient.addColorStop(1, '#0c2734');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 640, 360);
  ctx.strokeStyle = 'rgba(78,221,240,.12)';
  ctx.lineWidth = 2;
  for (let x = -360; x < 760; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 360);
    ctx.lineTo(x + 360, 0);
    ctx.stroke();
  }
  ctx.strokeStyle = '#43dff1';
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, 600, 320);
  ctx.fillStyle = '#edf8ff';
  ctx.font = '800 54px "Segoe UI", "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEXUS ARENA', 320, 164);
  ctx.fillStyle = '#9bb3ca';
  ctx.font = '600 22px "Noto Sans SC", "Segoe UI", sans-serif';
  ctx.fillText('PLAYER STATION · READY', 320, 211);
  stationIdle = new THREE.CanvasTexture(canvas);
  stationIdle.colorSpace = THREE.SRGBColorSpace;
  stationIdle.anisotropy = 4;
  return stationIdle;
}

const sideDisplayTextures = new Map<-1 | 1, THREE.CanvasTexture>();

function sideDisplayTexture(side: -1 | 1): THREE.CanvasTexture {
  const cached = sideDisplayTextures.get(side);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 420;
  canvas.height = 640;
  const ctx = canvas.getContext('2d')!;
  const accent = side < 0 ? '#44e4f1' : '#9a68ff';
  const gradient = ctx.createLinearGradient(0, 0, 420, 640);
  gradient.addColorStop(0, side < 0 ? '#073446' : '#241641');
  gradient.addColorStop(0.55, '#10182b');
  gradient.addColorStop(1, side < 0 ? '#17203c' : '#351b46');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 420, 640);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(22, 22, 376, 596);
  ctx.strokeStyle = 'rgba(220,244,255,.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(42, 42, 336, 556);
  ctx.fillStyle = accent;
  ctx.fillRect(42, 76, 336, 12);
  ctx.fillRect(42, 548, 336, 12);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e9f9ff';
  ctx.font = '900 54px "Segoe UI", sans-serif';
  ctx.fillText(side < 0 ? 'ALPHA' : 'OMEGA', 210, 218);
  ctx.font = '900 116px "Segoe UI", sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText('00', 210, 364);
  ctx.font = '800 24px "Segoe UI", sans-serif';
  ctx.fillStyle = '#c6d5e4';
  ctx.fillText('MATCH STANDBY', 210, 430);
  ctx.font = '700 18px "Segoe UI", sans-serif';
  ctx.fillStyle = '#90a9bd';
  ctx.fillText('NEXUS LIVE SYSTEM', 210, 502);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  sideDisplayTextures.set(side, texture);
  return texture;
}

function SideEventDisplay({ side, active }: { side: -1 | 1; active: boolean }) {
  const texture = useMemo(() => sideDisplayTexture(side), [side]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: texture,
    color: active ? '#ffffff' : '#414a58',
    toneMapped: false,
  }), [active, texture]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh position={[0, 0, 0.35]} material={material}>
      <planeGeometry args={[3.9, 5.62]} />
    </mesh>
  );
}

function useStationVideo(seatIdx: number): THREE.VideoTexture | null {
  const occupantId = useWorld((state) => state.seats[`nc-s${seatIdx}`]);
  const selfId = useSession((state) => state.self?.userId);
  const screenVersion = useVoice((state) => state.screenVersion);
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);

  const stream = useMemo(() => {
    if (occupantId === undefined) return null;
    return occupantId === selfId
      ? voice.localScreenStream
      : voice.screenStreams.get(occupantId) ?? null;
  }, [occupantId, selfId, screenVersion]);

  useEffect(() => {
    if (!stream) {
      setTexture(null);
      return;
    }
    const element = document.createElement('video');
    element.srcObject = stream;
    element.muted = true;
    element.playsInline = true;
    void element.play().catch(() => undefined);
    const next = new THREE.VideoTexture(element);
    next.colorSpace = THREE.SRGBColorSpace;
    setTexture(next);
    return () => {
      next.dispose();
      element.srcObject = null;
    };
  }, [stream]);

  return texture;
}

function StationScreen({ seatIdx }: { seatIdx: number }) {
  const video = useStationVideo(seatIdx);
  const idle = useMemo(() => stationIdleTexture(), []);
  const material = useMemo(() => {
    if (video) return new THREE.MeshBasicMaterial({ map: video, toneMapped: false });
    return new THREE.MeshStandardMaterial({
      map: idle,
      emissive: '#ffffff',
      emissiveMap: idle,
      emissiveIntensity: 1.15,
      roughness: 0.34,
      metalness: 0.1,
    });
  }, [idle, video]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh position={[0, 1.48, -0.18]} material={material}>
      <planeGeometry args={[1.08, 0.58]} />
    </mesh>
  );
}

const stationBackTextures = new Map<number, THREE.CanvasTexture>();

function stationBackTexture(seatIdx: number): THREE.CanvasTexture {
  const cached = stationBackTextures.get(seatIdx);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  const alphaTeam = seatIdx < 5;
  const accent = alphaTeam ? '#39d9f2' : '#8d65f4';
  const gradient = ctx.createLinearGradient(0, 0, 384, 192);
  gradient.addColorStop(0, alphaTeam ? '#092936' : '#251638');
  gradient.addColorStop(1, '#121a2a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 384, 192);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 368, 176);
  ctx.fillStyle = accent;
  ctx.fillRect(24, 30, 7, 132);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#edf8ff';
  ctx.font = '900 56px "Segoe UI", sans-serif';
  ctx.fillText(`P${String(seatIdx + 1).padStart(2, '0')}`, 212, 96);
  ctx.fillStyle = '#9fb3c8';
  ctx.font = '700 22px "Segoe UI", sans-serif';
  ctx.fillText(alphaTeam ? 'ALPHA STATION' : 'OMEGA STATION', 212, 137);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  stationBackTextures.set(seatIdx, texture);
  return texture;
}

/**
 * Tournament-facing status panel on the physical monitor back. The two rows
 * face opposite directions, so this makes all eight existing stations legible
 * from the spectator camera without moving any seat or business coordinate.
 */
function StationBackStatus({ seatIdx, active }: { seatIdx: number; active: boolean }) {
  const texture = useMemo(() => stationBackTexture(seatIdx), [seatIdx]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: texture,
    color: active ? '#ffffff' : '#46505d',
    toneMapped: false,
  }), [active, texture]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh position={[0, 1.48, -0.438]} rotation={[0, Math.PI, 0]} material={material}>
      <planeGeometry args={[0.54, 0.25]} />
    </mesh>
  );
}

function StationCable({ side }: { side: -1 | 1 }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.48, 0.61, -0.28),
      new THREE.Vector3(side * 0.55, 0.35, -0.42),
      new THREE.Vector3(side * 0.32, 0.12, -0.38),
      new THREE.Vector3(side * 0.24, 0.04, -0.04),
    ]);
    return new THREE.TubeGeometry(curve, 12, 0.012, 5, false);
  }, [side]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={side < 0 ? MATERIAL.cyanDim : MATERIAL.violetDim} />;
}

const STATION_MONITOR_FINS: InstanceSpec[] = [-0.47, -0.31, -0.15, 0.15, 0.31, 0.47]
  .map((x): InstanceSpec => ({ position: [x, 1.48, -0.382], scale: [0.035, 0.35, 0.018] }));
const STATION_KEYCAPS: InstanceSpec[] = Array.from({ length: 7 }, (_, index): InstanceSpec => ({
  position: [-0.22 + index * 0.073, 0.856, 0.12],
  scale: [0.045, 0.008, 0.13],
}));
const STATION_TOWER_VENTS: InstanceSpec[] = [-0.16, -0.06, 0.04, 0.14].map((y): InstanceSpec => ({
  position: [0.62, 0.35 + y, 0.22],
  scale: [0.16, 0.018, 0.012],
}));
const STATION_CABLE_GUIDES: InstanceSpec[] = [
  { position: [0, 0.56, -0.31], scale: [1.08, 0.06, 0.08] },
  ...[-0.46, 0, 0.46].map((x): InstanceSpec => ({
    position: [x, 0.49, -0.31],
    scale: [0.07, 0.18, 0.12],
  })),
];

/**
 * 可供 registry 的 nc_station 分支直接使用。局部原点与旧 NcStation 一致：
 * 机位朝本地 -Z，座位交互点应放在本地 +Z 约 1.25m。
 */
export function ArenaPlayerStation({
  position,
  ry,
  seatIdx,
  lightsOn,
}: {
  position: P3;
  ry: number;
  seatIdx: number;
  lightsOn?: boolean;
}) {
  const switchedOn = useWorld((state) => state.switches['nc-lights'] ?? true);
  const stationLightsOn = lightsOn ?? switchedOn;
  // The five starters are one contiguous team bench. Seats 5–7 are the rear
  // reserve row; keeping that split here makes the architecture and business
  // contract communicate the same grouping in every camera direction.
  const teamMaterial = seatIdx < 5
    ? (stationLightsOn ? MATERIAL.cyan : MATERIAL.cyanDim)
    : (stationLightsOn ? MATERIAL.violet : MATERIAL.violetDim);

  return (
    <group position={position} rotation={[0, ry, 0]}>
      {/* 具有前后折面的桌体和贯通式金属底架。 */}
      <Part position={[0, 0.76, 0]} scale={[1.78, 0.1, 0.8]} material={MATERIAL.deskTop} />
      <Part position={[0, 0.81, 0.33]} scale={[1.66, 0.035, 0.09]} material={teamMaterial} castShadow={false} />
      {[-0.72, 0.72].map((x) => (
        <group key={x}>
          <Part
            position={[x, 0.39, -0.02]}
            scale={[0.11, 0.76, 0.62]}
            rotation={[0, 0, x < 0 ? -0.12 : 0.12]}
            material={MATERIAL.darkSteel}
          />
          <Part position={[x, 0.08, 0.02]} scale={[0.34, 0.08, 0.68]} material={MATERIAL.steel} />
        </group>
      ))}
      <Part position={[0, 0.4, -0.34]} scale={[1.35, 0.54, 0.08]} material={MATERIAL.darkSteel} />

      {/* 双层显示器外壳、散热背板和实体支架。 */}
      <Part position={[0, 1.48, -0.27]} scale={[1.24, 0.72, 0.16]} material={MATERIAL.equipmentPolymer} />
      <Part position={[0, 1.48, -0.355]} scale={[1.08, 0.5, 0.045]} material={MATERIAL.steel} />
      <StationScreen seatIdx={seatIdx} />
      <InstancedParts specs={STATION_MONITOR_FINS} material={MATERIAL.blackMetal} />
      <Part position={[0, 1.48, -0.405]} scale={[0.68, 0.34, 0.06]} material={MATERIAL.equipmentPolymer} />
      <StationBackStatus seatIdx={seatIdx} active={stationLightsOn} />
      <CylinderPart position={[0, 1.03, -0.28]} scale={[0.045, 0.24, 0.045]} material={MATERIAL.steel} />
      <Part position={[0, 0.83, -0.26]} scale={[0.4, 0.04, 0.28]} material={MATERIAL.steel} />
      <InstancedParts specs={STATION_CABLE_GUIDES} material={MATERIAL.darkSteel} />

      {/* 键鼠、耳机挂架和带进风格栅的主机。 */}
      <Part position={[0, 0.835, 0.12]} scale={[0.58, 0.035, 0.2]} material={MATERIAL.glass} />
      <InstancedParts specs={STATION_KEYCAPS} material={teamMaterial} />
      <mesh position={[0.43, 0.855, 0.13]} material={MATERIAL.equipmentPolymer} castShadow>
        <sphereGeometry args={[0.07, 10, 7]} />
      </mesh>
      <Part position={[0.62, 0.35, -0.09]} scale={[0.28, 0.58, 0.56]} material={MATERIAL.equipmentPolymer} />
      <Part position={[0.62, 0.35, 0.202]} scale={[0.21, 0.47, 0.025]} material={MATERIAL.glass} />
      <InstancedParts specs={STATION_TOWER_VENTS} material={teamMaterial} />
      <Part position={[-0.86, 1.12, 0.03]} scale={[0.035, 0.55, 0.22]} material={MATERIAL.steel} />
      <mesh position={[-0.86, 1.33, 0.05]} rotation={[Math.PI / 2, 0, 0]} material={MATERIAL.equipmentPolymer} castShadow>
        <torusGeometry args={[0.11, 0.027, 6, 14, Math.PI * 1.45]} />
      </mesh>
      <StationCable side={-1} />
      <StationCable side={1} />

      {/* 地板接线盒和队伍编号标记具有实体外壳。 */}
      <Part position={[0, 0.045, -0.02]} scale={[0.62, 0.09, 0.44]} material={MATERIAL.darkSteel} />
      <Part position={[0, 0.096, -0.02]} scale={[0.46, 0.018, 0.3]} material={teamMaterial} castShadow={false} />

      {/* 互动座位对应的高背电竞椅；坐面中心为本地 +Z 1.25m。 */}
      <group position={[0, 0, 1.25]}>
        <Part position={[0, 0.47, 0]} scale={[0.72, 0.14, 0.62]} material={MATERIAL.seatAccent} />
        <Part position={[0, 0.86, 0.27]} scale={[0.76, 0.72, 0.16]} rotation={[-0.08, 0, 0]} material={MATERIAL.seat} />
        <Part position={[0, 1.19, 0.23]} scale={[0.5, 0.18, 0.18]} rotation={[-0.08, 0, 0]} material={MATERIAL.seatAccent} />
        {[-0.43, 0.43].map((x) => (
          <group key={x}>
            <Part position={[x, 0.59, -0.02]} scale={[0.07, 0.35, 0.08]} material={MATERIAL.steel} />
            <Part position={[x, 0.77, -0.03]} scale={[0.12, 0.07, 0.48]} material={MATERIAL.blackMetal} />
          </group>
        ))}
        <CylinderPart position={[0, 0.25, 0]} scale={[0.065, 0.35, 0.065]} material={MATERIAL.steel} />
        {[0, Math.PI / 2].map((angle) => (
          <Part key={angle} position={[0, 0.09, 0]} scale={[0.78, 0.06, 0.08]} rotation={[0, angle, 0]} material={MATERIAL.darkSteel} />
        ))}
        {([-1, 1] as const).flatMap((x) => ([-1, 1] as const).map((z) => (
          <CylinderPart key={`${x}-${z}`} position={[x * 0.36, 0.055, z * 0.36]} scale={[0.055, 0.055, 0.055]} rotation={[Math.PI / 2, 0, 0]} material={MATERIAL.blackMetal} />
        )))}
      </group>
    </group>
  );
}

/* ───────────────────────────── 看台系统 ───────────────────────────── */

/**
 * Five starters share one physical competition bench. The individual station
 * props remain the interaction anchors, while this recessed spine, cable
 * chase and five service bays make the team read as one broadcast desk.
 */
function CentralTeamBench({ lightsOn }: { lightsOn: boolean }) {
  const accents = [MATERIAL.cyan, MATERIAL.cyan, MATERIAL.cyan, MATERIAL.cyan, MATERIAL.cyan];
  const accentDim = [MATERIAL.cyanDim, MATERIAL.cyanDim, MATERIAL.cyanDim, MATERIAL.cyanDim, MATERIAL.cyanDim];
  const activeAccents = lightsOn ? accents : accentDim;
  const bayX = [-4.4, -2.2, 0, 2.2, 4.4];
  return (
    <group name="arena-five-player-bench">
      <Part position={[0, 0.34, -6.34]} scale={[10.85, 0.5, 0.82]} material={MATERIAL.concrete} />
      <Part position={[0, 0.61, -6.34]} scale={[10.66, 0.1, 0.9]} material={MATERIAL.deskTop} />
      <Part position={[0, 0.48, -6.805]} scale={[10.46, 0.38, 0.1]} material={MATERIAL.equipmentPolymer} />
      <Part position={[0, 1.03, -6.72]} scale={[10.72, 0.18, 0.18]} material={MATERIAL.darkSteel} />
      <Part position={[0, 0.72, -6.865]} scale={[10.42, 0.045, 0.055]} material={lightsOn ? MATERIAL.cyan : MATERIAL.cyanDim} castShadow={false} />
      {bayX.map((x, index) => (
        <group key={x}>
          <Part position={[x, 0.69, -6.8]} scale={[1.52, 0.06, 0.1]} material={activeAccents[index]} castShadow={false} />
          <Part position={[x - 0.92, 0.42, -6.35]} scale={[0.08, 0.46, 0.72]} material={MATERIAL.steel} />
          <Part position={[x + 0.92, 0.42, -6.35]} scale={[0.08, 0.46, 0.72]} material={MATERIAL.steel} />
        </group>
      ))}
    </group>
  );
}

function buildAudienceInstances() {
  const cushions: InstanceSpec[] = [];
  const backs: InstanceSpec[] = [];
  const legs: InstanceSpec[] = [];
  const arms: InstanceSpec[] = [];

  const addPart = (
    target: InstanceSpec[],
    base: THREE.Matrix4,
    localPosition: P3,
    localScale: P3,
  ) => {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...localPosition),
      new THREE.Quaternion(),
      new THREE.Vector3(...localScale),
    );
    const matrix = base.clone().multiply(local);
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, rotation, scale);
    const euler = new THREE.Euler().setFromQuaternion(rotation);
    target.push({
      position: [position.x, position.y, position.z],
      rotation: [euler.x, euler.y, euler.z],
      scale: [scale.x, scale.y, scale.z],
    });
  };

  const addSeat = (x: number, y: number, z: number, ry: number) => {
    const base = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    addPart(cushions, base, [0, 0.42, -0.03], [0.92, 0.18, 0.62]);
    addPart(backs, base, [0, 0.75, 0.29], [0.92, 0.62, 0.15]);
    addPart(legs, base, [-0.31, 0.2, 0.12], [0.09, 0.4, 0.09]);
    addPart(legs, base, [0.31, 0.2, 0.12], [0.09, 0.4, 0.09]);
    addPart(arms, base, [-0.51, 0.58, 0.02], [0.08, 0.36, 0.62]);
    addPart(arms, base, [0.51, 0.58, 0.02], [0.08, 0.36, 0.62]);
  };

  for (const side of [-1, 1] as const) {
    for (let row = 0; row < 4; row += 1) {
      const x = side * (13.9 + row * 1.35);
      const y = 0.35 + row * 0.62;
      for (const [start, count] of [[-7.6, 6], [2.35, 7]] as const) {
        for (let seat = 0; seat < count; seat += 1) {
          addSeat(x, y, start + seat * 1.28, side < 0 ? -Math.PI / 2 : Math.PI / 2);
        }
      }
    }
  }

  for (let row = 0; row < 4; row += 1) {
    const z = 11.0 + row * 1.25;
    const y = 0.35 + row * 0.58;
    for (const [start, count] of [[-11.4, 8], [2.45, 8]] as const) {
      for (let seat = 0; seat < count; seat += 1) {
        addSeat(start + seat * 1.28, y, z, 0);
      }
    }
  }

  // The upper bowl shares these four InstancedMeshes with the lower seats, so
  // the venue gains a second visible audience tier without per-seat draw calls.
  for (const side of [-1, 1] as const) {
    for (let row = 0; row < 4; row += 1) {
      const x = side * (16.2 + row * 1.05);
      // Match the lower bowl's 7cm leg embed: enough contact to avoid floating,
      // without the previous 22cm sink that swallowed the lower chair frame.
      const y = 3.79 + row * 0.67;
      for (const [start, count] of [[-9.0, 7], [1.55, 7]] as const) {
        for (let seat = 0; seat < count; seat += 1) {
          addSeat(x, y, start + seat * 1.25, side < 0 ? -Math.PI / 2 : Math.PI / 2);
        }
      }
    }
  }

  return { cushions, backs, legs, arms };
}

const AUDIENCE = buildAudienceInstances();

function ArenaAudienceSeats() {
  return (
    <group>
      <InstancedParts specs={AUDIENCE.cushions} material={MATERIAL.seatAccent} />
      <InstancedParts specs={AUDIENCE.backs} material={MATERIAL.seat} />
      <InstancedParts specs={AUDIENCE.legs} material={MATERIAL.darkSteel} />
      <InstancedParts specs={AUDIENCE.arms} material={MATERIAL.blackMetal} />
    </group>
  );
}

const FLOOR_JOINTS: InstanceSpec[] = [
  ...[-11.6, -7.7, 3.0, 8.8].map((z): InstanceSpec => ({
    position: [0, 0.017, z],
    scale: [40.1, 0.009, 0.035],
  })),
  ...[-11.8, 11.8].map((x): InstanceSpec => ({
    position: [x, 0.018, 2.4],
    scale: [0.035, 0.01, 28.0],
  })),
];

/** A real matte arena floor hides the generic neon debug-grid floor. The few
 * recessed expansion joints preserve scale without turning it into another
 * glowing checkerboard. */
function ArenaFloorFinish() {
  return (
    <group>
      <Part
        position={[0, 0.006, 0]}
        scale={[40.55, 0.012, 33.5]}
        material={MATERIAL.rubber}
        castShadow={false}
      />
      <InstancedParts specs={FLOOR_JOINTS} material={MATERIAL.floorJoint} />
    </group>
  );
}

function RailRun({
  position,
  length,
  axis,
}: {
  position: P3;
  length: number;
  axis: 'x' | 'z';
}) {
  const posts = Math.max(2, Math.floor(length / 1.8));
  return (
    <group position={position}>
      <Part
        position={[0, 0.92, 0]}
        scale={axis === 'x' ? [length, 0.1, 0.1] : [0.1, 0.1, length]}
        material={MATERIAL.steel}
      />
      <Part
        position={[0, 0.47, 0]}
        scale={axis === 'x' ? [length, 0.055, 0.055] : [0.055, 0.055, length]}
        material={MATERIAL.darkSteel}
      />
      {Array.from({ length: posts + 1 }, (_, index) => {
        const offset = -length / 2 + (index * length) / posts;
        return (
          <Part
            key={index}
            position={axis === 'x' ? [offset, 0.46, 0] : [0, 0.46, offset]}
            scale={[0.08, 0.92, 0.08]}
            material={MATERIAL.steel}
          />
        );
      })}
    </group>
  );
}

function buildUpperBowlInstances() {
  const concrete: InstanceSpec[] = [];
  const painted: InstanceSpec[] = [];
  const rubber: InstanceSpec[] = [];
  const acoustic: InstanceSpec[] = [];
  const steel: InstanceSpec[] = [];
  const glass: InstanceSpec[] = [];
  const segments = [
    { center: -5.1, length: 8.8 },
    { center: 5.8, length: 9.4 },
  ];

  for (const side of [-1, 1] as const) {
    for (const segment of segments) {
      // Deep balcony slab, visible inner fascia and four independently stepped
      // upper rows. Nothing here changes the lower-bowl navigation collider.
      concrete.push({
        position: [side * 17.78, 3.22, segment.center],
        scale: [4.62, 0.3, segment.length],
      });
      acoustic.push({
        position: [side * 15.51, 3.18, segment.center],
        scale: [0.24, 1.42, segment.length - 0.16],
      });

      for (let row = 0; row < 4; row += 1) {
        const top = 3.86 + row * 0.67;
        const height = top - 3.36;
        const target = row % 2 === 0 ? concrete : painted;
        target.push({
          position: [side * (16.2 + row * 1.05), 3.36 + height / 2, segment.center],
          scale: [1.03, height, segment.length - 0.12],
        });
        rubber.push({
          position: [side * (16.2 + row * 1.05), top + 0.025, segment.center],
          scale: [0.95, 0.05, segment.length - 0.24],
        });
      }

      // Balcony guard, posts and underside ribs form one instanced steel batch.
      steel.push(
        { position: [side * 15.34, 4.48, segment.center], scale: [0.1, 0.11, segment.length] },
        { position: [side * 15.34, 4.02, segment.center], scale: [0.07, 0.07, segment.length] },
      );
      const postCount = Math.max(3, Math.floor(segment.length / 1.65));
      for (let post = 0; post <= postCount; post += 1) {
        const z = segment.center - segment.length / 2 + (post * segment.length) / postCount;
        steel.push(
          { position: [side * 15.34, 4.02, z], scale: [0.09, 0.94, 0.09] },
          { position: [side * 17.78, 3.0, z], scale: [4.45, 0.12, 0.12] },
        );
      }
    }

    // A row of physically recessed VIP/control suites gives the high wall a
    // second occupied scale datum instead of another uninterrupted black slab.
    for (const z of [-7.25, -3.65, 3.35, 7.25]) {
      glass.push({ position: [side * 19.73, 8.58, z], scale: [0.12, 1.88, 3.05] });
      acoustic.push({ position: [side * 20.05, 8.58, z], scale: [0.35, 2.24, 3.42] });
      steel.push(
        { position: [side * 19.58, 7.5, z], scale: [0.32, 0.16, 3.42] },
        { position: [side * 19.58, 9.66, z], scale: [0.32, 0.16, 3.42] },
        { position: [side * 19.58, 8.58, z - 1.66], scale: [0.32, 2.32, 0.14] },
        { position: [side * 19.58, 8.58, z + 1.66], scale: [0.32, 2.32, 0.14] },
      );
    }
  }

  return { concrete, painted, rubber, acoustic, steel, glass };
}

const UPPER_BOWL = buildUpperBowlInstances();

function UpperArenaBowl() {
  return (
    <group>
      <InstancedParts specs={UPPER_BOWL.concrete} material={MATERIAL.concrete} />
      <InstancedParts specs={UPPER_BOWL.painted} material={MATERIAL.painted} />
      <InstancedParts specs={UPPER_BOWL.rubber} material={MATERIAL.rubber} />
      <InstancedParts specs={UPPER_BOWL.acoustic} material={MATERIAL.acoustic} />
      <InstancedParts specs={UPPER_BOWL.steel} material={MATERIAL.steel} />
      <InstancedParts specs={UPPER_BOWL.glass} material={MATERIAL.glass} />
    </group>
  );
}

function TieredStands({ lightsOn }: { lightsOn: boolean }) {
  const edgeLight = lightsOn ? MATERIAL.cyan : MATERIAL.cyanDim;
  const rearLight = lightsOn ? MATERIAL.violet : MATERIAL.violetDim;
  const sideSegments = [
    { center: -4.55, length: 7.1 },
    { center: 6.05, length: 8.7 },
  ];
  const rearSegments = [
    { center: -7.05, length: 10.7 },
    { center: 7.05, length: 10.7 },
  ];

  return (
    <group>
      {/* 东西两侧：看台在中部断开，形成真实横向疏散通道。 */}
      {([-1, 1] as const).flatMap((side) => Array.from({ length: 4 }, (_, row) => {
        const height = 0.42 + row * 0.62;
        const x = side * (13.85 + row * 1.35);
        return sideSegments.map((segment) => (
          <group key={`${side}-${row}-${segment.center}`}>
            <Part
              position={[x, height / 2, segment.center]}
              scale={[1.3, height, segment.length]}
              material={row % 2 ? MATERIAL.concrete : MATERIAL.painted}
            />
            <Part
              position={[x - side * 0.61, height + 0.035, segment.center]}
              scale={[0.08, 0.07, segment.length - 0.14]}
              material={edgeLight}
              castShadow={false}
            />
            <Part
              position={[x, height - 0.14, segment.center]}
              scale={[1.18, 0.14, segment.length - 0.22]}
              material={MATERIAL.acoustic}
            />
          </group>
        ));
      }))}

      {/* 南后场看台：中央 3.4m 保留入口与主疏散楼梯。 */}
      {Array.from({ length: 4 }, (_, row) => {
        const height = 0.42 + row * 0.58;
        const z = 10.95 + row * 1.25;
        return rearSegments.map((segment) => (
          <group key={`${row}-${segment.center}`}>
            <Part
              position={[segment.center, height / 2, z]}
              scale={[segment.length, height, 1.2]}
              material={row % 2 ? MATERIAL.painted : MATERIAL.concrete}
            />
            <Part
              position={[segment.center, height + 0.035, z - 0.55]}
              scale={[segment.length - 0.15, 0.07, 0.08]}
              material={rearLight}
              castShadow={false}
            />
          </group>
        ));
      })}

      {/* 两侧横向通道的阶梯；每级对应一层平台，不再靠隐形高度区。 */}
      {([-1, 1] as const).flatMap((side) => Array.from({ length: 4 }, (_, step) => {
        const height = 0.42 + step * 0.62;
        return (
          <group key={`aisle-${side}-${step}`}>
            <Part
              position={[side * (13.85 + step * 1.35), height / 2, 0.58]}
              scale={[1.32, height, 2.2]}
              material={MATERIAL.concrete}
            />
            <Part
              position={[side * (13.85 + step * 1.35), height + 0.04, -0.48]}
              scale={[1.18, 0.08, 0.08]}
              material={lightsOn ? MATERIAL.warning : MATERIAL.darkSteel}
              castShadow={false}
            />
          </group>
        );
      }))}

      <UpperArenaBowl />
      <ArenaAudienceSeats />
      <RailRun position={[-19.1, 2.72, -4.55]} length={7.1} axis="z" />
      <RailRun position={[-19.1, 2.72, 6.05]} length={8.7} axis="z" />
      <RailRun position={[19.1, 2.72, -4.55]} length={7.1} axis="z" />
      <RailRun position={[19.1, 2.72, 6.05]} length={8.7} axis="z" />
      <RailRun position={[-7.05, 2.55, 15.3]} length={10.7} axis="x" />
      <RailRun position={[7.05, 2.55, 15.3]} length={10.7} axis="x" />
    </group>
  );
}

function ArenaBowlRibbon({ lightsOn }: { lightsOn: boolean }) {
  const cyan = lightsOn ? MATERIAL.cyan : MATERIAL.cyanDim;
  const violet = lightsOn ? MATERIAL.violet : MATERIAL.violetDim;
  const pink = lightsOn ? MATERIAL.pink : MATERIAL.pinkDim;
  const sideSegments = [
    { center: -5.1, length: 8.8 },
    { center: 5.8, length: 9.4 },
  ];
  return (
    <group name="arena-bowl-event-ribbon">
      {([-1, 1] as const).flatMap((side) => sideSegments.map((segment, index) => (
        <group key={`${side}-${segment.center}`} position={[side * 15.18, 4.86, segment.center]}>
          <Part position={[0, 0, 0]} scale={[0.3, 0.48, segment.length]} material={MATERIAL.blackMetal} />
          <Part
            position={[-side * 0.17, 0.03, 0]}
            scale={[0.055, 0.15, segment.length - 0.42]}
            material={index === 0 ? cyan : violet}
            castShadow={false}
          />
          {Array.from({ length: 4 }, (_, bay) => (
            <Part
              key={bay}
              position={[-side * 0.19, -0.16, -segment.length / 2 + 1.15 + bay * ((segment.length - 2.3) / 3)]}
              scale={[0.07, 0.16, 0.5]}
              material={bay % 2 ? pink : MATERIAL.warning}
              castShadow={false}
            />
          ))}
        </group>
      )))}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 7.05, 3.08, 15.2]}>
          <Part position={[0, 0, 0]} scale={[10.7, 0.44, 0.28]} material={MATERIAL.blackMetal} />
          <Part position={[0, 0.04, -0.17]} scale={[10.15, 0.14, 0.055]} material={side < 0 ? violet : cyan} castShadow={false} />
        </group>
      ))}
      <Part position={[0, 6.78, -10.12]} scale={[17.8, 0.42, 0.3]} material={MATERIAL.darkSteel} />
      <Part position={[0, 6.8, -9.94]} scale={[17.2, 0.12, 0.055]} material={pink} castShadow={false} />
    </group>
  );
}

function ArenaVomitoryPortals({ lightsOn }: { lightsOn: boolean }) {
  const cyan = lightsOn ? MATERIAL.cyan : MATERIAL.cyanDim;
  const violet = lightsOn ? MATERIAL.violet : MATERIAL.violetDim;
  return (
    <group name="arena-vomitory-portals">
      {([-1, 1] as const).map((side) => {
        const accent = side < 0 ? cyan : violet;
        return (
          <group key={side}>
            {[-0.72, 1.92].map((z) => (
              <group key={z} position={[side * 13.02, 1.35, z]}>
                <Part position={[0, 0, 0]} scale={[0.72, 2.7, 0.46]} material={MATERIAL.concrete} />
                <Part position={[-side * 0.4, 0.08, 0]} scale={[0.09, 2.16, 0.3]} material={MATERIAL.steel} />
              </group>
            ))}
            <Part position={[side * 13.02, 2.82, 0.6]} scale={[0.72, 0.48, 3.1]} material={MATERIAL.blackMetal} />
            <Part position={[side * 12.6, 2.82, 0.6]} scale={[0.08, 0.17, 2.62]} material={accent} castShadow={false} />
            <Part position={[side * 13.18, 3.18, 0.6]} scale={[1.05, 0.16, 3.35]} material={MATERIAL.darkSteel} />
            <Part position={[side * 12.57, 1.24, 0.6]} scale={[0.07, 1.66, 0.1]} material={MATERIAL.warning} castShadow={false} />
          </group>
        );
      })}
    </group>
  );
}

function ArenaBroadcastPerch({ lightsOn }: { lightsOn: boolean }) {
  const tally = lightsOn ? MATERIAL.pink : MATERIAL.pinkDim;
  return (
    <group name="arena-asymmetric-broadcast-perch">
      <Part position={[-17.7, 6.08, 0.2]} scale={[3.65, 0.3, 2.3]} material={MATERIAL.darkSteel} />
      <Part position={[-17.7, 6.28, 0.2]} scale={[3.35, 0.1, 2.05]} material={MATERIAL.rubber} />
      {([-1, 1] as const).flatMap((xSide) => ([-1, 1] as const).map((zSide) => (
        <Part
          key={`${xSide}-${zSide}`}
          position={[-17.7 + xSide * 1.52, 4.75, 0.2 + zSide * 0.88]}
          scale={[0.14, 2.65, 0.14]}
          material={MATERIAL.steel}
        />
      )))}
      <RailRun position={[-17.7, 6.28, -0.92]} length={3.35} axis="x" />
      <RailRun position={[-16.05, 6.28, 0.2]} length={2.05} axis="z" />
      <group position={[-16.75, 6.36, 0.48]} rotation={[0, -Math.PI / 2.35, 0]}>
        <CylinderPart position={[-0.38, 0.48, 0]} scale={[0.055, 0.92, 0.055]} material={MATERIAL.steel} />
        <CylinderPart position={[0.38, 0.48, 0]} scale={[0.055, 0.92, 0.055]} material={MATERIAL.steel} />
        <CylinderPart position={[0, 0.48, 0.48]} scale={[0.055, 0.92, 0.055]} material={MATERIAL.steel} />
        <Part position={[0, 1.02, 0.06]} scale={[1.05, 0.56, 0.62]} material={MATERIAL.equipmentPolymer} />
        <Part position={[0, 1.08, -0.34]} scale={[0.62, 0.32, 0.08]} material={MATERIAL.glass} castShadow={false} />
        <CylinderPart position={[0, 1.02, 0.55]} rotation={[Math.PI / 2, 0, 0]} scale={[0.24, 0.52, 0.24]} material={MATERIAL.darkSteel} />
        <Part position={[-0.43, 1.18, -0.36]} scale={[0.12, 0.12, 0.08]} material={tally} castShadow={false} />
        <Part position={[0, 0.72, 0.08]} scale={[0.16, 0.42, 0.16]} material={MATERIAL.steel} />
      </group>
      <Part position={[-19.22, 8.08, 0.2]} rotation={[0, 0, -0.12]} scale={[0.3, 3.7, 2.1]} material={MATERIAL.blackMetal} />
      <Part position={[-19.03, 8.12, 0.2]} rotation={[0, 0, -0.12]} scale={[0.06, 3.12, 1.65]} material={tally} castShadow={false} />
      {[-0.65, 0, 0.65].map((z, index) => (
        <Part key={z} position={[-18.98, 7.28 + index * 0.82, 0.2 + z]} scale={[0.07, 0.18, 0.36]} material={index === 1 ? MATERIAL.cyan : MATERIAL.warning} castShadow={false} />
      ))}
    </group>
  );
}

/* ─────────────────────────── 比赛台与大屏 ─────────────────────────── */

const STARTER_BAY_BOUNDARIES = [-5.5, -3.3, -1.1, 1.1, 3.3, 5.5];
const COMPETITION_DECK_JOINTS: InstanceSpec[] = STARTER_BAY_BOUNDARIES.map((x) => ({
  position: [x, 0.3, -4.25],
  scale: [0.1, 0.34, 9.7],
}));
const STARTER_BAY_GUIDES: InstanceSpec[] = STARTER_BAY_BOUNDARIES.map((x) => ({
  position: [x, 0.62, -4.75],
  scale: [0.055, 0.035, 3.8],
}));

function CompetitionFloor({ lightsOn }: { lightsOn: boolean }) {
  const cyan = lightsOn ? MATERIAL.cyan : MATERIAL.cyanDim;
  return (
    <group>
      {/*
       * 20 × 10m 主赛台：承重基座、浮筑层、设备沟和三段入口台阶。
       * 可行走顶面由 shared/layouts 精确镜像：主体依次为 0.40 / 0.55 /
       * 0.60m，三组入口踏步依次为 0.24 / 0.36 / 0.51m。
       */}
      <Part position={[0, 0.2, -4.25]} scale={[20.2, 0.4, 10.7]} material={MATERIAL.concrete} />
      <Part position={[0, 0.46, -4.25]} scale={[19.5, 0.18, 10.05]} material={MATERIAL.stageDeck} />
      <Part position={[0, 0.575, -4.25]} scale={[18.6, 0.05, 9.25]} material={MATERIAL.rubber} />
      {/* Six physical deck joints frame the five 2.2m starter bays. The old
          four-way cyan/violet split contradicted the contiguous five-player
          bench and made the stage read like two mirrored exhibition teams. */}
      <InstancedParts specs={COMPETITION_DECK_JOINTS} material={MATERIAL.darkSteel} />
      <InstancedParts
        specs={STARTER_BAY_GUIDES}
        material={cyan}
        castShadow={false}
        receiveShadow={false}
      />
      {[-5.4, 0, 5.4].map((x) => (
        <group key={x}>
          <Part position={[x, 0.12, 1.45]} scale={[3.6, 0.24, 0.65]} material={MATERIAL.concrete} />
          <Part position={[x, 0.3, 1.18]} scale={[3.2, 0.12, 0.62]} material={MATERIAL.painted} />
          <Part position={[x, 0.44, 0.91]} scale={[2.8, 0.14, 0.62]} material={MATERIAL.rubber} />
        </group>
      ))}

      {/* 北端颁奖/主持台以八角体块打破整片方盒轮廓。 */}
      <mesh geometry={OCTAGON} position={[0, 0.62, -12.15]} scale={[5.6, 0.62, 3.2]} material={MATERIAL.blackMetal} castShadow receiveShadow />
      <mesh geometry={OCTAGON} position={[0, 1.07, -12.15]} scale={[5.05, 0.32, 2.75]} material={MATERIAL.acoustic} castShadow receiveShadow />
      <Part position={[0, 1.28, -9.85]} scale={[5.2, 0.12, 0.18]} material={cyan} castShadow={false} />
      {[-3.2, 3.2].map((x) => (
        <group key={x} position={[x, 1.22, -12.05]}>
          <Part position={[0, 0.44, 0]} scale={[1.15, 0.88, 0.75]} material={MATERIAL.darkSteel} />
          <Part position={[0, 0.93, 0.12]} scale={[1.28, 0.1, 0.9]} material={MATERIAL.steel} />
          <Part position={[0, 0.62, 0.4]} scale={[0.78, 0.25, 0.04]} material={x < 0 ? cyan : violet} castShadow={false} />
        </group>
      ))}

      {/* 舞台下方可见的电缆桥架、检修盖板与两侧设备机柜。 */}
      <Part position={[0, 0.1, -8.95]} scale={[16.8, 0.18, 0.52]} material={MATERIAL.darkSteel} />
      {Array.from({ length: 12 }, (_, index) => (
        <Part
          key={index}
          position={[-7.7 + index * 1.4, 0.205, -8.95]}
          scale={[0.06, 0.05, 0.42]}
          material={MATERIAL.steel}
        />
      ))}
      {[-10.6, 10.6].map((x) => (
        <group key={x} position={[x, 0, -7.1]}>
          <Part position={[0, 0.7, 0]} scale={[1.45, 1.4, 2.1]} material={MATERIAL.blackMetal} />
          {[-0.38, -0.12, 0.14, 0.4].map((y) => (
            <Part key={y} position={[0, 0.72 + y, 1.06]} scale={[1.05, 0.06, 0.035]} material={MATERIAL.steel} castShadow={false} />
          ))}
          <Part position={[0, 0.3, 1.09]} scale={[0.08, 0.16, 0.035]} material={x < 0 ? cyan : violet} castShadow={false} />
        </group>
      ))}
    </group>
  );
}

/** A single-draw-call header truss for the main display. The long chords,
 * uprights and alternating braces share one InstancedMesh instead of adding
 * dozens of individual scene nodes to an already detailed arena. */
function ScreenHeaderTruss({ position, length }: { position: P3; length: number }) {
  const specs = useMemo<InstanceSpec[]>(() => {
    const bayCount = Math.max(4, Math.round(length / 2.1));
    const bay = length / bayCount;
    const height = 0.68;
    const depth = 0.58;
    const diagonalLength = Math.sqrt(bay * bay + height * height);
    const diagonalAngle = Math.atan2(height, bay);
    const parts: InstanceSpec[] = [
      { position: [0, -height / 2, -depth / 2], scale: [length, 0.1, 0.1] },
      { position: [0, -height / 2, depth / 2], scale: [length, 0.1, 0.1] },
      { position: [0, height / 2, -depth / 2], scale: [length, 0.1, 0.1] },
      { position: [0, height / 2, depth / 2], scale: [length, 0.1, 0.1] },
    ];
    for (let index = 0; index <= bayCount; index++) {
      const x = -length / 2 + index * bay;
      parts.push(
        { position: [x, 0, -depth / 2], scale: [0.08, height, 0.08] },
        { position: [x, 0, depth / 2], scale: [0.08, height, 0.08] },
      );
    }
    for (let index = 0; index < bayCount; index++) {
      const x = -length / 2 + bay * (index + 0.5);
      const direction = index % 2 ? -1 : 1;
      parts.push(
        {
          position: [x, 0, -depth / 2],
          rotation: [0, 0, direction * diagonalAngle],
          scale: [diagonalLength, 0.07, 0.07],
        },
        {
          position: [x, 0, depth / 2],
          rotation: [0, 0, -direction * diagonalAngle],
          scale: [diagonalLength, 0.07, 0.07],
        },
      );
    }
    return parts;
  }, [length]);
  return (
    <group position={position}>
      <InstancedParts specs={specs} material={MATERIAL.steel} />
    </group>
  );
}

function MainScreenStructure({ lightsOn }: { lightsOn: boolean }) {
  const cyan = lightsOn ? MATERIAL.cyan : MATERIAL.cyanDim;
  const violet = lightsOn ? MATERIAL.violet : MATERIAL.violetDim;
  const screen = ARENA_SPATIAL_CONTRACT.screen;
  const [screenX, screenY, screenZ] = screen.position;
  const shellY = screenY - 0.1;
  const shellZ = screenZ - 0.29;
  const rearFaceZ = screenZ - 0.13;
  const trimZ = screenZ + 0.09;
  const edgeX = screen.width / 2 + 0.95;
  const topBeamY = screenY + screen.height / 2 + 0.34;
  const lowerBeamY = screenY - screen.height / 2 - 0.54;
  const serviceFrontZ = screenZ + 1.09;
  return (
    <group position={[screenX, 0, 0]}>
      {/* The media surface and this physical housing read from one shared
          contract, keeping art aligned with interaction and collision. */}
      <Part position={[0, shellY, shellZ]} scale={[screen.width + 2.2, screen.height + 1.3, 0.28]} material={MATERIAL.blackMetal} />
      {/* 深色保护层留在媒体显示面后方，避免遮住唯一播放器。 */}
      <Part position={[0, shellY, rearFaceZ]} scale={[screen.width + 0.5, screen.height + 0.35, 0.05]} material={MATERIAL.glass} />
      <Part position={[0, topBeamY, trimZ]} scale={[screen.width + 2.3, 0.36, 0.38]} material={MATERIAL.steel} />
      <Part position={[0, lowerBeamY, trimZ]} scale={[screen.width + 2.3, 0.36, 0.38]} material={MATERIAL.steel} />
      {[-edgeX, edgeX].map((x) => (
        <group key={x}>
          <Part position={[x, shellY, trimZ]} scale={[0.42, screen.height + 1.2, 0.38]} material={MATERIAL.steel} />
          <Part position={[x, shellY, screenZ + 0.35]} scale={[0.09, screen.height + 0.4, 0.08]} material={x < 0 ? cyan : violet} castShadow={false} />
          {/* 侧向承重柱落到地坪，避免主屏框架在近景中悬空。 */}
          <Part position={[x, (screenY + 3.5) / 2, screenZ - 0.17]} scale={[0.7, screenY + 3.5, 1.05]} material={MATERIAL.concrete} />
        </group>
      ))}

      {/* 屏幕后真实背架：立柱、横梁和交叉抗侧力支撑。 */}
      {[-10.8, -7.2, -3.6, 0, 3.6, 7.2, 10.8].map((x) => (
        <Part key={`screen-post-${x}`} position={[x, screenY - 0.3, screenZ - 0.23]} scale={[0.18, screen.height + 3.2, 0.18]} material={MATERIAL.darkSteel} />
      ))}
      {[3.4, 6.2, 9.0, 11.7].map((y) => (
        <Part key={`screen-beam-${y}`} position={[0, y, screenZ - 0.23]} scale={[screen.width + 1.6, 0.18, 0.18]} material={MATERIAL.darkSteel} />
      ))}
      {[-8.8, -1.8, 5.2].map((x) => (
        <group key={x} position={[x, screenY + 0.3, screenZ - 0.27]}>
          <Part position={[0, 0, 0]} scale={[7.3, 0.13, 0.13]} rotation={[0, 0, 0.72]} material={MATERIAL.steel} />
          <Part position={[0, 0, 0]} scale={[7.3, 0.13, 0.13]} rotation={[0, 0, -0.72]} material={MATERIAL.steel} />
        </group>
      ))}

      {/* Front service bridge establishes the screen's scale and gives the
          housing a maintainable lower edge. It stays above head height and
          below the 3.4m image bottom, so it changes no navigation collider. */}
      <Part position={[0, lowerBeamY - 0.44, screenZ + 0.55]} scale={[screen.width + 0.6, 0.22, 1.15]} material={MATERIAL.darkSteel} />
      <Part position={[0, lowerBeamY - 0.28, serviceFrontZ]} scale={[screen.width + 0.3, 0.1, 0.12]} material={MATERIAL.steel} />
      <Part position={[0, lowerBeamY + 0.22, serviceFrontZ]} scale={[screen.width + 0.3, 0.11, 0.11]} material={MATERIAL.steel} />
      {[-11, -8.25, -5.5, -2.75, 0, 2.75, 5.5, 8.25, 11].map((x) => (
        <Part
          key={`service-rail-${x}`}
          position={[x, lowerBeamY - 0.03, serviceFrontZ]}
          scale={[0.08, 0.5, 0.08]}
          material={MATERIAL.darkSteel}
        />
      ))}
      <ScreenHeaderTruss position={[0, topBeamY + 0.88, screenZ + 0.2]} length={screen.width + 2.8} />

      {/* 向观众席折出的两块侧屏，均有厚外壳和后部检修支臂。 */}
      {([-1, 1] as const).map((side) => (
        <group
          key={side}
          position={[side * (screen.width / 2 + 4.45), screenY - 0.2, screenZ + 2.3]}
          rotation={[0, side * -0.34, 0]}
        >
          <Part position={[0, 0, 0]} scale={[4.4, 6.2, 0.5]} material={MATERIAL.blackMetal} />
          <Part position={[0, 0, 0.28]} scale={[3.92, 5.65, 0.07]} material={MATERIAL.glass} />
          <SideEventDisplay side={side} active={lightsOn} />
          <Part position={[0, 3.18, 0.28]} scale={[4.05, 0.08, 0.08]} material={side < 0 ? cyan : violet} castShadow={false} />
          {/* 落地检修柱连接侧屏全高；共享碰撞只包住这根实体柱。 */}
          <Part position={[0, -1.95, -0.62]} scale={[0.3, 10.1, 0.9]} material={MATERIAL.steel} />
          <Part position={[side * -1.4, 0, -0.86]} scale={[3.0, 0.22, 0.22]} rotation={[0, side * 0.28, 0]} material={MATERIAL.darkSteel} />
        </group>
      ))}
    </group>
  );
}

/* ─────────────────────────── 吊装与灯光 ─────────────────────────── */

function TrussSpan({ position, length, axis }: { position: P3; length: number; axis: 'x' | 'z' }) {
  const rotation: R3 = axis === 'x' ? [0, 0, 0] : [0, Math.PI / 2, 0];
  const bays = Math.max(2, Math.round(length / 2.2));
  const bayLength = length / bays;
  const diagonalLength = Math.sqrt(bayLength * bayLength + 0.72 * 0.72);
  const diagonalAngle = Math.atan2(0.72, bayLength);

  return (
    <group position={position} rotation={rotation}>
      {([-1, 1] as const).flatMap((y) => ([-1, 1] as const).map((z) => (
        <Part
          key={`${y}-${z}`}
          position={[0, y * 0.36, z * 0.36]}
          scale={[length, 0.11, 0.11]}
          material={MATERIAL.steel}
        />
      )))}
      {Array.from({ length: bays + 1 }, (_, index) => {
        const x = -length / 2 + index * bayLength;
        return (
          <group key={index} position={[x, 0, 0]}>
            <Part position={[0, 0, -0.36]} scale={[0.1, 0.72, 0.1]} material={MATERIAL.darkSteel} />
            <Part position={[0, 0, 0.36]} scale={[0.1, 0.72, 0.1]} material={MATERIAL.darkSteel} />
            <Part position={[0, -0.36, 0]} scale={[0.1, 0.1, 0.72]} material={MATERIAL.darkSteel} />
            <Part position={[0, 0.36, 0]} scale={[0.1, 0.1, 0.72]} material={MATERIAL.darkSteel} />
          </group>
        );
      })}
      {Array.from({ length: bays }, (_, index) => {
        const x = -length / 2 + bayLength * (index + 0.5);
        const direction = index % 2 ? -1 : 1;
        return (
          <group key={`brace-${index}`} position={[x, 0, 0]}>
            <Part
              position={[0, 0, -0.37]}
              scale={[diagonalLength, 0.07, 0.07]}
              rotation={[0, 0, direction * diagonalAngle]}
              material={MATERIAL.darkSteel}
            />
            <Part
              position={[0, 0, 0.37]}
              scale={[diagonalLength, 0.07, 0.07]}
              rotation={[0, 0, -direction * diagonalAngle]}
              material={MATERIAL.darkSteel}
            />
          </group>
        );
      })}
    </group>
  );
}

function ArenaLuminaire({
  position,
  color,
  active,
}: {
  position: P3;
  color: 'cyan' | 'violet' | 'pink';
  active: boolean;
}) {
  const lit = color === 'cyan'
    ? (active ? MATERIAL.cyan : MATERIAL.cyanDim)
    : color === 'violet'
      ? (active ? MATERIAL.violet : MATERIAL.violetDim)
      : (active ? MATERIAL.pink : MATERIAL.pinkDim);
  return (
    <group position={position}>
      <CylinderPart position={[0, 0.22, 0]} scale={[0.12, 0.42, 0.12]} material={MATERIAL.darkSteel} />
      <mesh position={[0, -0.1, 0]} material={MATERIAL.blackMetal} castShadow>
        <cylinderGeometry args={[0.22, 0.14, 0.34, 10]} />
      </mesh>
      <mesh position={[0, -0.29, 0]} rotation={[Math.PI / 2, 0, 0]} material={lit}>
        <circleGeometry args={[0.12, 12]} />
      </mesh>
    </group>
  );
}

const overheadScreenTextures = new Map<number, THREE.CanvasTexture>();
function ScreenCable({ points }: { points: P3[] }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), 0.035, 5, false);
  }, [points]);
  return <mesh geometry={geometry} material={MATERIAL.darkSteel} castShadow receiveShadow />;
}

function overheadScreenTexture(index: number): THREE.CanvasTexture {
  const cached = overheadScreenTextures.get(index);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;
  const colors = ['#25d7e8', '#a67bff', '#ff4f9a', '#ffd25a'];
  const accent = colors[index % colors.length];
  const gradient = ctx.createLinearGradient(0, 0, 640, 360);
  gradient.addColorStop(0, '#101724');
  gradient.addColorStop(0.48, index % 2 ? '#271b43' : '#12343e');
  gradient.addColorStop(1, '#080b12');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 640, 360);
  ctx.strokeStyle = `${accent}66`;
  ctx.lineWidth = 5;
  for (let x = -360; x < 760; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 360);
    ctx.lineTo(x + 360, 0);
    ctx.stroke();
  }
  ctx.fillStyle = accent;
  ctx.fillRect(36, 38, 150, 9);
  ctx.font = '700 30px Arial';
  ctx.fillText(`LIVE FEED 0${index + 1}`, 36, 94);
  ctx.font = '700 58px Arial';
  ctx.fillText(index % 2 ? 'VS' : 'ON AIR', 36, 177);
  ctx.font = '700 22px Arial';
  ctx.fillStyle = '#e9f4ff';
  ctx.fillText('MOONLIGHT CUP / STAGE CAM', 36, 226);
  ctx.strokeStyle = `${accent}bb`;
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, 584, 302);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  overheadScreenTextures.set(index, texture);
  return texture;
}

function OverheadScreenArray({ lightsOn }: { lightsOn: boolean }) {
  const screens: Array<{ position: P3; ry: number }> = [
    { position: [0, 9.55, -0.55], ry: 0 },
    { position: [3.9, 9.55, -2.5], ry: Math.PI / 2 },
    { position: [0, 9.55, -4.45], ry: Math.PI },
    { position: [-3.9, 9.55, -2.5], ry: -Math.PI / 2 },
  ];
  return (
    <group name="arena-four-sided-scoreboard">
      {/* A four-sided suspended scoreboard serves the U-shaped audience bowl.
          Each face has a dedicated housing/content layer, while a rectangular
          carrier ring and four corner drops provide an observable load path. */}
      {[-3.9, 3.9].map((x) => (
        <Part key={`carrier-x-${x}`} position={[x, 11.55, -2.5]} scale={[0.22, 0.22, 4.1]} material={MATERIAL.steel} />
      ))}
      {[-4.45, -0.55].map((z) => (
        <Part key={`carrier-z-${z}`} position={[0, 11.55, z]} scale={[8.0, 0.22, 0.22]} material={MATERIAL.steel} />
      ))}
      <Part position={[0, 11.72, -2.5]} scale={[8.25, 0.14, 0.34]} material={MATERIAL.darkSteel} />
      <Part position={[0, 11.72, -2.5]} rotation={[0, Math.PI / 2, 0]} scale={[4.25, 0.14, 0.34]} material={MATERIAL.darkSteel} />
      {([-1, 1] as const).flatMap((xSide) => ([-1, 1] as const).map((zSide) => (
        <group key={`scoreboard-drop-${xSide}-${zSide}`}>
          <CylinderPart
            position={[xSide * 3.82, 12.12, -2.5 + zSide * 1.88]}
            scale={[0.055, 1.14, 0.055]}
            material={MATERIAL.steel}
          />
          <Part
            position={[xSide * 3.82, 12.66, -2.5 + zSide * 1.88]}
            scale={[0.42, 0.12, 0.42]}
            material={MATERIAL.darkSteel}
          />
        </group>
      )))}
      <Part position={[0, 9.55, -2.5]} scale={[7.16, 2.9, 3.5]} material={MATERIAL.blackMetal} />
      {screens.map((screen, index) => {
        const accent = index % 2 === 0 ? (lightsOn ? MATERIAL.cyan : MATERIAL.cyanDim) : (lightsOn ? MATERIAL.violet : MATERIAL.violetDim);
        return (
          <group key={`scoreboard-face-${index}`} position={screen.position} rotation={[0, screen.ry, 0]}>
            <group rotation={[0.1, 0, 0]}>
              <Part position={[0, 0, 0]} scale={[7.62, 3.62, 0.42]} material={MATERIAL.blackMetal} />
              <Part position={[0, 1.87, 0.08]} scale={[7.82, 0.14, 0.28]} material={MATERIAL.steel} />
              <Part position={[0, -1.87, 0.08]} scale={[7.82, 0.14, 0.28]} material={MATERIAL.steel} />
              {[-3.86, 3.86].map((x) => (
                <Part key={x} position={[x, 0, 0.08]} scale={[0.14, 3.66, 0.28]} material={MATERIAL.steel} />
              ))}
              <mesh position={[0, 0, 0.235]} castShadow={false}>
                <planeGeometry args={[7.24, 3.22]} />
                <meshBasicMaterial map={overheadScreenTexture(index)} toneMapped={false} side={THREE.DoubleSide} />
              </mesh>
              <Part position={[0, -2.13, 0.02]} scale={[3.1, 0.14, 0.22]} material={MATERIAL.darkSteel} />
              {[-0.9, 0, 0.9].map((x) => (
                <Part key={x} position={[x, -2.14, 0.145]} scale={[0.56, 0.05, 0.05]} material={accent} castShadow={false} />
              ))}
            </group>
          </group>
        );
      })}
      {([-1, 1] as const).flatMap((xSide) => ([-1, 1] as const).map((zSide) => (
        <ScreenCable
          key={`screen-cable-${xSide}-${zSide}`}
          points={[
            [xSide * 3.82, 12.72, -2.5 + zSide * 1.88],
            [xSide * 3.82, 11.5, -2.5 + zSide * 1.88],
            [xSide * 3.72, 10.95, -2.5 + zSide * 1.78],
          ]}
        />
      ))}
    </group>
  );
}

function OverheadRig({ lightsOn }: { lightsOn: boolean }) {
  const mounts: Array<{ position: P3; color: 'cyan' | 'violet' | 'pink' }> = [
    { position: [-8, 11.35, -8.0], color: 'cyan' },
    { position: [-3, 11.35, -8.0], color: 'violet' },
    { position: [3, 11.35, -8.0], color: 'cyan' },
    { position: [8, 11.35, -8.0], color: 'pink' },
    { position: [-8, 11.62, 4.6], color: 'violet' },
    { position: [-3, 11.62, 4.6], color: 'cyan' },
    { position: [3, 11.62, 4.6], color: 'pink' },
    { position: [8, 11.62, 4.6], color: 'violet' },
  ];
  return (
    <group>
      <TrussSpan position={[0, 12.0, -8.0]} length={20} axis="x" />
      <TrussSpan position={[0, 12.27, 4.6]} length={20} axis="x" />
      <TrussSpan position={[-10, 12.14, -1.7]} length={12.6} axis="z" />
      <TrussSpan position={[10, 12.14, -1.7]} length={12.6} axis="z" />

      {/* 吊杆、吊点夹具与安全链一直连接到 12.6m 顶棚。 */}
      {([-10, 10] as const).flatMap((x) => [-8.0, 4.6].map((z) => (
        <group key={`${x}-${z}`}>
          <CylinderPart position={[x, 12.56, z]} scale={[0.055, 0.78, 0.055]} material={MATERIAL.steel} />
          <Part position={[x, 12.92, z]} scale={[0.5, 0.14, 0.5]} material={MATERIAL.darkSteel} />
          <mesh position={[x + 0.18, 12.18, z]} rotation={[0, 0, 0.08]} material={MATERIAL.steel}>
            <torusGeometry args={[0.16, 0.025, 6, 12]} />
          </mesh>
        </group>
      )))}
      {mounts.map((mount) => (
        <ArenaLuminaire key={mount.position.join('-')} {...mount} active={lightsOn} />
      ))}

      {/* 顶部双路电缆桥架，包含实体侧帮、横撑和下引线。 */}
      {[-1.05, 1.05].map((x) => (
        <group key={x} position={[x, 12.66, -1.7]}>
          <Part position={[-0.28, 0, 0]} scale={[0.08, 0.18, 12.4]} material={MATERIAL.darkSteel} />
          <Part position={[0.28, 0, 0]} scale={[0.08, 0.18, 12.4]} material={MATERIAL.darkSteel} />
          {Array.from({ length: 8 }, (_, index) => (
            <Part key={index} position={[0, -0.06, -5.75 + index * 1.64]} scale={[0.56, 0.06, 0.08]} material={MATERIAL.steel} />
          ))}
        </group>
      ))}

    </group>
  );
}

/* ───────────────────── 广播、控制与墙面结构 ───────────────────── */

function ConsoleDesk({ position, ry, accent }: { position: P3; ry: number; accent: THREE.Material }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <Part position={[0, 0.55, 0]} scale={[3.6, 1.1, 0.9]} material={MATERIAL.blackMetal} />
      <Part position={[0, 1.13, -0.06]} scale={[3.8, 0.12, 1.05]} material={MATERIAL.deskTop} />
      {[-1.1, 0, 1.1].map((x) => (
        <group key={x} position={[x, 1.52, -0.18]}>
          <Part position={[0, 0, 0]} scale={[0.92, 0.54, 0.12]} material={MATERIAL.blackMetal} />
          <Part position={[0, 0, 0.07]} scale={[0.78, 0.4, 0.03]} material={MATERIAL.glass} />
          <CylinderPart position={[0, -0.42, -0.02]} scale={[0.035, 0.28, 0.035]} material={MATERIAL.steel} />
        </group>
      ))}
      {Array.from({ length: 11 }, (_, index) => (
        <Part
          key={index}
          position={[-1.5 + index * 0.3, 1.215, 0.2]}
          scale={[0.08, 0.025, 0.08]}
          material={index % 3 === 0 ? accent : MATERIAL.cyanDim}
          castShadow={false}
        />
      ))}
    </group>
  );
}

function BroadcastAndControl({ lightsOn }: { lightsOn: boolean }) {
  const cyan = lightsOn ? MATERIAL.cyan : MATERIAL.cyanDim;
  const violet = lightsOn ? MATERIAL.violet : MATERIAL.violetDim;
  return (
    <group>
      {/* 西南解说席：抬高地台、隔音后墙和双层玻璃框。 */}
      <Part position={[-15.8, 0.22, 13.05]} scale={[7.6, 0.44, 5.2]} material={MATERIAL.concrete} />
      <Part position={[-15.8, 0.51, 13.05]} scale={[7.15, 0.14, 4.75]} material={MATERIAL.rubber} />
      <Part position={[-19.45, 2.5, 13.05]} scale={[0.36, 4.8, 5.15]} material={MATERIAL.acoustic} />
      <Part position={[-15.8, 3.15, 10.58]} scale={[7.3, 0.22, 0.22]} material={MATERIAL.steel} />
      {[-19.35, -17.0, -14.65, -12.3].map((x) => (
        <Part key={x} position={[x, 1.95, 10.58]} scale={[0.16, 2.6, 0.22]} material={MATERIAL.steel} />
      ))}
      <Part position={[-15.8, 1.95, 10.6]} scale={[6.85, 2.55, 0.08]} material={MATERIAL.glass} />
      <ConsoleDesk position={[-15.8, 0.56, 11.95]} ry={0} accent={cyan} />

      {/* 东南技术控制区：机柜、观察窗和独立走线平台。 */}
      <Part position={[15.8, 0.22, 13.05]} scale={[7.6, 0.44, 5.2]} material={MATERIAL.concrete} />
      <Part position={[15.8, 0.51, 13.05]} scale={[7.15, 0.14, 4.75]} material={MATERIAL.rubber} />
      <Part position={[19.45, 2.5, 13.05]} scale={[0.36, 4.8, 5.15]} material={MATERIAL.acoustic} />
      <Part position={[15.8, 3.15, 10.58]} scale={[7.3, 0.22, 0.22]} material={MATERIAL.steel} />
      {([12.3, 14.65, 17.0, 19.35] as const).map((x) => (
        <Part key={x} position={[x, 1.95, 10.58]} scale={[0.16, 2.6, 0.22]} material={MATERIAL.steel} />
      ))}
      <Part position={[15.8, 1.95, 10.6]} scale={[6.85, 2.55, 0.08]} material={MATERIAL.glass} />
      <ConsoleDesk position={[14.4, 0.56, 11.95]} ry={0} accent={violet} />
      {[17.5, 18.55, 19.6].map((x, index) => (
        <group key={x} position={[x, 0.55, 14.5]}>
          <Part position={[0, 0.95, 0]} scale={[0.82, 1.9, 0.92]} material={MATERIAL.blackMetal} />
          {Array.from({ length: 5 }, (_, slot) => (
            <Part
              key={slot}
              position={[0, 0.35 + slot * 0.28, -0.47]}
              scale={[0.62, 0.09, 0.04]}
              material={(slot + index) % 3 === 0 ? violet : MATERIAL.steel}
              castShadow={false}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

function WallArchitecture({ lightsOn }: { lightsOn: boolean }) {
  const cyan = lightsOn ? MATERIAL.cyan : MATERIAL.cyanDim;
  const violet = lightsOn ? MATERIAL.violet : MATERIAL.violetDim;
  return (
    <group>
      {/* 周边承重柱、吸音板和检修腰线，使 13m 高墙不再是单一大平面。 */}
      {([-20.45, 20.45] as const).flatMap((x) => [-13.5, -8.5, -3.5, 1.5, 6.5].map((z) => (
        <group key={`${x}-${z}`}>
          <Part position={[x, 5.2, z]} scale={[0.72, 10.4, 0.82]} material={MATERIAL.concrete} />
          <Part position={[x + (x < 0 ? 0.41 : -0.41), 5.2, z]} scale={[0.08, 8.8, 0.64]} material={x < 0 ? cyan : violet} castShadow={false} />
        </group>
      )))}
      {([-20.0, 20.0] as const).flatMap((x) => [-11.0, -6.0, -1.0, 4.0, 8.0].map((z, index) => (
        <Part
          key={`panel-${x}-${z}`}
          position={[x, 5.1 + (index % 2) * 0.3, z]}
          scale={[0.24, 4.3, 3.6]}
          material={index % 2 ? MATERIAL.acoustic : MATERIAL.painted}
        />
      )))}
      {[-20.1, 20.1].map((x) => (
        <group key={`wall-tray-${x}`}>
          <Part position={[x, 8.3, -0.5]} scale={[0.4, 0.42, 24.5]} material={MATERIAL.darkSteel} />
          {Array.from({ length: 13 }, (_, index) => (
            <Part key={index} position={[x + (x < 0 ? 0.23 : -0.23), 8.3, -12 + index * 2]} scale={[0.08, 0.55, 0.1]} material={MATERIAL.steel} />
          ))}
        </group>
      ))}

      {/* 后部入口门楼：边柱、上部门楣和侧窗围出净开口，不遮挡互动滑门。 */}
      {[-1.82, 1.82].map((x) => (
        <Part key={`portal-jamb-${x}`} position={[x, 4.5, 16.52]} scale={[0.36, 9.0, 0.55]} material={MATERIAL.blackMetal} />
      ))}
      <Part position={[0, 6.6, 16.52]} scale={[3.3, 5.2, 0.55]} material={MATERIAL.blackMetal} />
      {[-1.43, 1.43].map((x) => (
        <Part key={`portal-glass-${x}`} position={[x, 1.42, 16.22]} scale={[0.58, 2.72, 0.12]} material={MATERIAL.glass} />
      ))}
      <Part position={[0, 2.85, 16.22]} scale={[2.25, 0.22, 0.12]} material={MATERIAL.glass} />
      <Part position={[0, 3.12, 16.15]} scale={[3.7, 0.18, 0.26]} material={MATERIAL.warning} castShadow={false} />
      <Part position={[0, 7.25, 14.9]} scale={[20.5, 0.48, 2.4]} material={MATERIAL.darkSteel} />
      <Part position={[0, 7.55, 14.9]} scale={[19.7, 0.14, 2.05]} material={MATERIAL.rubber} />
      <RailRun position={[0, 7.62, 13.82]} length={19.7} axis="x" />
      {[-9.4, -4.7, 4.7, 9.4].map((x) => (
        <Part key={x} position={[x, 5.15, 14.9]} scale={[0.32, 4.2, 0.32]} material={MATERIAL.steel} />
      ))}
    </group>
  );
}

/**
 * 电竞观战馆主体。目标布局：bounds x[-21,21] / z[-17,17]，顶棚约 13m；
 * 主屏 MediaScreen 在北墙独立挂载，八个 ArenaPlayerStation 由 layout props 挂载。
 */
export function ArenaHallArchitecture({
  lightsOn,
  lightBudget = 4,
}: {
  lightsOn: boolean;
  lightBudget?: number;
}) {
  return (
    <group>
      <ArenaFloorFinish />
      <CompetitionFloor lightsOn={lightsOn} />
      <MainScreenStructure lightsOn={lightsOn} />
      <CentralTeamBench lightsOn={lightsOn} />
      <OverheadScreenArray lightsOn={lightsOn} />
      <TieredStands lightsOn={lightsOn} />
      <ArenaBowlRibbon lightsOn={lightsOn} />
      <ArenaVomitoryPortals lightsOn={lightsOn} />
      <ArenaBroadcastPerch lightsOn={lightsOn} />
      <OverheadRig lightsOn={lightsOn} />
      <BroadcastAndControl lightsOn={lightsOn} />
      <WallArchitecture lightsOn={lightsOn} />

      {/*
       * 低画质也保留体积：这两盏结构光不投影、不依赖 Bloom/SSAO，
       * 只把深色钢架、看台踏步和主屏外壳从黑背景中分离出来。
       */}
      <hemisphereLight
        color="#c7d0d6"
        groundColor="#292d32"
        intensity={lightsOn ? 0.7 : 0.14}
      />
      <directionalLight
        position={[9, 15, 9]}
        color="#f0eee8"
        intensity={lightsOn ? 1.24 : 0.18}
        castShadow={false}
      />

      {/* 非霓虹主照明：比赛区、观众区与后场均保留可读暗部。 */}
      {lightsOn && lightBudget > 0 && (
        <>
          <pointLight position={[0, 10.8, -2.4]} color="#eef1ee" intensity={24} distance={34} decay={1.68} />
          {(lightBudget === 2 || lightBudget >= 4) && (
            <pointLight position={[0, 8.8, 11.6]} color="#e5d9cb" intensity={9} distance={19} decay={1.9} />
          )}
          {lightBudget >= 3 && (
            <>
              <pointLight position={[-14.5, 7.2, 2]} color="#adc2ce" intensity={10} distance={20} decay={1.9} />
              <pointLight position={[14.5, 7.2, 2]} color="#c0b8cd" intensity={10} distance={20} decay={1.9} />
            </>
          )}
        </>
      )}
    </group>
  );
}

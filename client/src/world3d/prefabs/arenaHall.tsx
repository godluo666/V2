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
import { useSession, useVoice, useWorld } from '../../state/stores';
import { voice } from '../../voice/voice';
import { surfaceMaterial, type SurfaceKind } from '../city/materials';

type P3 = [number, number, number];
type R3 = [number, number, number];

function finish(kind: SurfaceKind, color: string): THREE.MeshStandardMaterial {
  const material = surfaceMaterial(kind);
  material.color.set(color);
  return material;
}

function illuminated(kind: SurfaceKind, color: string, intensity: number): THREE.MeshStandardMaterial {
  const material = finish(kind, color);
  material.emissive.set(color);
  material.emissiveIntensity = intensity;
  return material;
}

const MATERIAL = {
  // Calibrated for the real low-tier cloud path (no shadows/post FX).  These
  // remain dark arena finishes, but their albedo steps are far enough apart for
  // truss, rail, equipment shell and riser silhouettes to survive without Bloom.
  concrete: finish('oldConcrete', '#343d4b'),
  painted: finish('paintedConcrete', '#48566a'),
  blackMetal: finish('metal', '#1d2938'),
  steel: finish('brushedMetal', '#8796aa'),
  darkSteel: finish('brushedMetal', '#3d4b60'),
  glass: finish('darkGlass', '#172b40'),
  deck: finish('cinemaCarpet', '#292d46'),
  acoustic: finish('acousticFabric', '#403a58'),
  seat: finish('seatFabric', '#505976'),
  seatAccent: finish('seatFabric', '#704482'),
  cyan: illuminated('plasticLightbox', '#39d9f2', 0.82),
  cyanDim: illuminated('plasticLightbox', '#26758a', 0.28),
  violet: illuminated('plasticLightbox', '#7656ef', 0.78),
  violetDim: illuminated('plasticLightbox', '#45347f', 0.24),
  pink: illuminated('plasticLightbox', '#e34fb4', 0.68),
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

function InstancedParts({ specs, material }: { specs: InstanceSpec[]; material: THREE.Material }) {
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
      castShadow
      receiveShadow
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
  const teamMaterial = seatIdx < 4
    ? (stationLightsOn ? MATERIAL.cyan : MATERIAL.cyanDim)
    : (stationLightsOn ? MATERIAL.violet : MATERIAL.violetDim);

  return (
    <group position={position} rotation={[0, ry, 0]}>
      {/* 具有前后折面的桌体和贯通式金属底架。 */}
      <Part position={[0, 0.76, 0]} scale={[1.78, 0.1, 0.8]} material={MATERIAL.blackMetal} />
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
      <Part position={[0, 1.48, -0.27]} scale={[1.24, 0.72, 0.16]} material={MATERIAL.blackMetal} />
      <Part position={[0, 1.48, -0.355]} scale={[1.08, 0.5, 0.045]} material={MATERIAL.steel} />
      <StationScreen seatIdx={seatIdx} />
      {[-0.47, -0.31, -0.15, 0.15, 0.31, 0.47].map((x) => (
        <Part key={x} position={[x, 1.48, -0.382]} scale={[0.035, 0.35, 0.018]} material={MATERIAL.blackMetal} castShadow={false} />
      ))}
      <CylinderPart position={[0, 1.03, -0.28]} scale={[0.045, 0.24, 0.045]} material={MATERIAL.steel} />
      <Part position={[0, 0.83, -0.26]} scale={[0.4, 0.04, 0.28]} material={MATERIAL.steel} />

      {/* 键鼠、耳机挂架和带进风格栅的主机。 */}
      <Part position={[0, 0.835, 0.12]} scale={[0.58, 0.035, 0.2]} material={MATERIAL.glass} />
      {Array.from({ length: 7 }, (_, index) => (
        <Part
          key={index}
          position={[-0.22 + index * 0.073, 0.856, 0.12]}
          scale={[0.045, 0.008, 0.13]}
          material={teamMaterial}
          castShadow={false}
        />
      ))}
      <mesh position={[0.43, 0.855, 0.13]} material={MATERIAL.blackMetal} castShadow>
        <sphereGeometry args={[0.07, 10, 7]} />
      </mesh>
      <Part position={[0.62, 0.35, -0.09]} scale={[0.28, 0.58, 0.56]} material={MATERIAL.blackMetal} />
      <Part position={[0.62, 0.35, 0.202]} scale={[0.21, 0.47, 0.025]} material={MATERIAL.glass} />
      {[-0.16, -0.06, 0.04, 0.14].map((y) => (
        <Part key={y} position={[0.62, 0.35 + y, 0.22]} scale={[0.16, 0.018, 0.012]} material={teamMaterial} castShadow={false} />
      ))}
      <Part position={[-0.86, 1.12, 0.03]} scale={[0.035, 0.55, 0.22]} material={MATERIAL.steel} />
      <mesh position={[-0.86, 1.33, 0.05]} rotation={[Math.PI / 2, 0, 0]} material={MATERIAL.blackMetal} castShadow>
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

/* ─────────────────────────── 比赛台与大屏 ─────────────────────────── */

function CompetitionFloor({ lightsOn }: { lightsOn: boolean }) {
  const cyan = lightsOn ? MATERIAL.cyan : MATERIAL.cyanDim;
  const violet = lightsOn ? MATERIAL.violet : MATERIAL.violetDim;
  return (
    <group>
      {/*
       * 20 × 10m 主赛台：承重基座、浮筑层、设备沟和三段入口台阶。
       * 可行走顶面由 shared/layouts 精确镜像：主体依次为 0.40 / 0.55 /
       * 0.60m，三组入口踏步依次为 0.24 / 0.36 / 0.51m。
       */}
      <Part position={[0, 0.2, -4.25]} scale={[20.2, 0.4, 10.7]} material={MATERIAL.concrete} />
      <Part position={[0, 0.46, -4.25]} scale={[19.5, 0.18, 10.05]} material={MATERIAL.deck} />
      <Part position={[0, 0.575, -4.25]} scale={[18.6, 0.05, 9.25]} material={MATERIAL.acoustic} />
      {[-6.6, -2.2, 2.2, 6.6].map((x, index) => (
        <group key={x}>
          <Part position={[x, 0.62, -4.25]} scale={[0.055, 0.035, 8.8]} material={index < 2 ? cyan : violet} castShadow={false} />
          <Part position={[x, 0.3, -4.25]} scale={[0.12, 0.34, 9.7]} material={MATERIAL.darkSteel} />
        </group>
      ))}
      {[-5.4, 0, 5.4].map((x) => (
        <group key={x}>
          <Part position={[x, 0.12, 1.45]} scale={[3.6, 0.24, 0.65]} material={MATERIAL.concrete} />
          <Part position={[x, 0.3, 1.18]} scale={[3.2, 0.12, 0.62]} material={MATERIAL.painted} />
          <Part position={[x, 0.44, 0.91]} scale={[2.8, 0.14, 0.62]} material={MATERIAL.deck} />
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

function MainScreenStructure({ lightsOn }: { lightsOn: boolean }) {
  const cyan = lightsOn ? MATERIAL.cyan : MATERIAL.cyanDim;
  const violet = lightsOn ? MATERIAL.violet : MATERIAL.violetDim;
  return (
    <group>
      {/* 24m 屏幕外壳；MediaScreen 应放在 [0, 7.2, -16.55]、约 22.4 × 7.6m。 */}
      <Part position={[0, 7.1, -16.84]} scale={[24.6, 8.9, 0.28]} material={MATERIAL.blackMetal} />
      {/* 深色保护层留在媒体显示面后方，避免遮住唯一播放器。 */}
      <Part position={[0, 7.1, -16.68]} scale={[22.9, 7.95, 0.05]} material={MATERIAL.glass} />
      <Part position={[0, 11.34, -16.46]} scale={[24.7, 0.36, 0.38]} material={MATERIAL.steel} />
      <Part position={[0, 2.86, -16.46]} scale={[24.7, 0.36, 0.38]} material={MATERIAL.steel} />
      {[-12.15, 12.15].map((x) => (
        <group key={x}>
          <Part position={[x, 7.1, -16.46]} scale={[0.42, 8.8, 0.38]} material={MATERIAL.steel} />
          <Part position={[x, 7.1, -16.2]} scale={[0.09, 8.0, 0.08]} material={x < 0 ? cyan : violet} castShadow={false} />
          {/* 侧向承重柱落到地坪，避免主屏框架在近景中悬空。 */}
          <Part position={[x, 5.35, -16.72]} scale={[0.7, 10.7, 1.05]} material={MATERIAL.concrete} />
        </group>
      ))}

      {/* 屏幕后真实背架：立柱、横梁和交叉抗侧力支撑。 */}
      {[-10.8, -7.2, -3.6, 0, 3.6, 7.2, 10.8].map((x) => (
        <Part key={`screen-post-${x}`} position={[x, 6.9, -16.78]} scale={[0.18, 10.8, 0.18]} material={MATERIAL.darkSteel} />
      ))}
      {[3.4, 6.2, 9.0, 11.7].map((y) => (
        <Part key={`screen-beam-${y}`} position={[0, y, -16.78]} scale={[24.0, 0.18, 0.18]} material={MATERIAL.darkSteel} />
      ))}
      {[-8.8, -1.8, 5.2].map((x) => (
        <group key={x} position={[x, 7.5, -16.82]}>
          <Part position={[0, 0, 0]} scale={[7.3, 0.13, 0.13]} rotation={[0, 0, 0.72]} material={MATERIAL.steel} />
          <Part position={[0, 0, 0]} scale={[7.3, 0.13, 0.13]} rotation={[0, 0, -0.72]} material={MATERIAL.steel} />
        </group>
      ))}

      {/* 向观众席折出的两块侧屏，均有厚外壳和后部检修支臂。 */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * 15.65, 7.0, -14.25]} rotation={[0, side * -0.34, 0]}>
          <Part position={[0, 0, 0]} scale={[4.4, 6.2, 0.5]} material={MATERIAL.blackMetal} />
          <Part position={[0, 0, 0.28]} scale={[3.92, 5.65, 0.07]} material={MATERIAL.glass} />
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

function ArenaLuminaire({ position, color }: { position: P3; color: 'cyan' | 'violet' | 'pink' }) {
  const lit = color === 'cyan' ? MATERIAL.cyan : color === 'violet' ? MATERIAL.violet : MATERIAL.pink;
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

function OverheadRig({ lightsOn }: { lightsOn: boolean }) {
  const mounts: Array<{ position: P3; color: 'cyan' | 'violet' | 'pink' }> = [
    { position: [-8, 9.95, -8.3], color: 'cyan' },
    { position: [-3, 9.95, -8.3], color: 'violet' },
    { position: [3, 9.95, -8.3], color: 'cyan' },
    { position: [8, 9.95, -8.3], color: 'pink' },
    { position: [-8, 9.95, 0.2], color: 'violet' },
    { position: [-3, 9.95, 0.2], color: 'cyan' },
    { position: [3, 9.95, 0.2], color: 'pink' },
    { position: [8, 9.95, 0.2], color: 'violet' },
  ];
  return (
    <group>
      <TrussSpan position={[0, 10.45, -8.3]} length={20} axis="x" />
      <TrussSpan position={[0, 10.45, 0.2]} length={20} axis="x" />
      <TrussSpan position={[-10, 10.45, -4.05]} length={8.5} axis="z" />
      <TrussSpan position={[10, 10.45, -4.05]} length={8.5} axis="z" />

      {/* 吊杆、吊点夹具与安全链一直连接到 12.6m 顶棚。 */}
      {([-10, 10] as const).flatMap((x) => [-8.3, 0.2].map((z) => (
        <group key={`${x}-${z}`}>
          <CylinderPart position={[x, 11.55, z]} scale={[0.055, 1.45, 0.055]} material={MATERIAL.steel} />
          <Part position={[x, 12.58, z]} scale={[0.5, 0.14, 0.5]} material={MATERIAL.darkSteel} />
          <mesh position={[x + 0.18, 10.55, z]} rotation={[0, 0, 0.08]} material={MATERIAL.steel}>
            <torusGeometry args={[0.16, 0.025, 6, 12]} />
          </mesh>
        </group>
      )))}
      {mounts.map((mount) => (
        <ArenaLuminaire key={mount.position.join('-')} {...mount} />
      ))}

      {/* 顶部双路电缆桥架，包含实体侧帮、横撑和下引线。 */}
      {[-1.05, 1.05].map((x) => (
        <group key={x} position={[x, 11.7, -4.05]}>
          <Part position={[-0.28, 0, 0]} scale={[0.08, 0.24, 16.5]} material={MATERIAL.darkSteel} />
          <Part position={[0.28, 0, 0]} scale={[0.08, 0.24, 16.5]} material={MATERIAL.darkSteel} />
          {Array.from({ length: 10 }, (_, index) => (
            <Part key={index} position={[0, -0.09, -7.7 + index * 1.7]} scale={[0.56, 0.06, 0.08]} material={MATERIAL.steel} />
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
      <Part position={[0, 1.13, -0.06]} scale={[3.8, 0.12, 1.05]} material={MATERIAL.steel} />
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
      <Part position={[-15.8, 0.51, 13.05]} scale={[7.15, 0.14, 4.75]} material={MATERIAL.deck} />
      <Part position={[-19.45, 2.5, 13.05]} scale={[0.36, 4.8, 5.15]} material={MATERIAL.acoustic} />
      <Part position={[-15.8, 3.15, 10.58]} scale={[7.3, 0.22, 0.22]} material={MATERIAL.steel} />
      {[-19.35, -17.0, -14.65, -12.3].map((x) => (
        <Part key={x} position={[x, 1.95, 10.58]} scale={[0.16, 2.6, 0.22]} material={MATERIAL.steel} />
      ))}
      <Part position={[-15.8, 1.95, 10.6]} scale={[6.85, 2.55, 0.08]} material={MATERIAL.glass} />
      <ConsoleDesk position={[-15.8, 0.56, 11.95]} ry={0} accent={cyan} />

      {/* 东南技术控制区：机柜、观察窗和独立走线平台。 */}
      <Part position={[15.8, 0.22, 13.05]} scale={[7.6, 0.44, 5.2]} material={MATERIAL.concrete} />
      <Part position={[15.8, 0.51, 13.05]} scale={[7.15, 0.14, 4.75]} material={MATERIAL.deck} />
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
      <Part position={[0, 7.55, 14.9]} scale={[19.7, 0.14, 2.05]} material={MATERIAL.deck} />
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
      <CompetitionFloor lightsOn={lightsOn} />
      <MainScreenStructure lightsOn={lightsOn} />
      <TieredStands lightsOn={lightsOn} />
      <OverheadRig lightsOn={lightsOn} />
      <BroadcastAndControl lightsOn={lightsOn} />
      <WallArchitecture lightsOn={lightsOn} />

      {/*
       * 低画质也保留体积：这两盏结构光不投影、不依赖 Bloom/SSAO，
       * 只把深色钢架、看台踏步和主屏外壳从黑背景中分离出来。
       */}
      <hemisphereLight
        color="#a9c0d7"
        groundColor="#201d2b"
        intensity={lightsOn ? 0.62 : 0.14}
      />
      <directionalLight
        position={[10, 14, 8]}
        color="#e4edf5"
        intensity={lightsOn ? 1.18 : 0.18}
        castShadow={false}
      />

      {/* 非霓虹主照明：比赛区、观众区与后场均保留可读暗部。 */}
      {lightsOn && lightBudget > 0 && (
        <>
          <pointLight position={[0, 9.2, -3.0]} color="#cbdbe9" intensity={21} distance={30} decay={1.65} />
          {(lightBudget === 2 || lightBudget >= 4) && (
            <pointLight position={[0, 8.0, 12.0]} color="#ddcfbf" intensity={9} distance={18} decay={1.9} />
          )}
          {lightBudget >= 3 && (
            <>
              <pointLight position={[-14.5, 6.0, 2]} color="#83a8c4" intensity={10} distance={19} decay={1.9} />
              <pointLight position={[14.5, 6.0, 2]} color="#9891c9" intensity={10} distance={19} decay={1.9} />
            </>
          )}
        </>
      )}
    </group>
  );
}

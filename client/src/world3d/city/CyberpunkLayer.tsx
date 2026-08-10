import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useSettings } from '../../state/stores';
import { toonMat } from './toon';
import { surfaceMaterial } from './materials';

type P3 = [number, number, number];

const metal = surfaceMaterial('brushedMetal');
const cyan = toonMat('#39d7e8', { emissive: '#39d7e8', emissiveIntensity: 0.68 });
const yellow = toonMat('#ffd34f', { emissive: '#ffb52e', emissiveIntensity: 0.9 });
const violet = toonMat('#7a5fff', { emissive: '#7a5fff', emissiveIntensity: 0.85 });
const supportMetal = surfaceMaterial('brushedMetal');
supportMetal.color.set('#9ca8b0');
supportMetal.metalness = 0.54;
supportMetal.roughness = 0.5;
const fxPink = toonMat('#ff3f83', { emissive: '#ff176b', emissiveIntensity: 1.15 });
const fxAqua = toonMat('#37e8f1', { emissive: '#13c9e5', emissiveIntensity: 1.1 });
const fxGold = toonMat('#ffd34f', { emissive: '#ff9e2e', emissiveIntensity: 1.05 });
const FX_BOX = new THREE.BoxGeometry(1, 1, 1);

const ROAD_EDGE_RUNS: Array<{
  position: P3;
  scale: P3;
  accent: THREE.Material;
}> = [
  { position: [-20.5, 0.035, -4.18], scale: [8.2, 0.07, 0.16], accent: fxPink },
  { position: [4.5, 0.035, -4.18], scale: [6.8, 0.07, 0.16], accent: fxAqua },
  { position: [18.2, 0.035, -4.18], scale: [5.4, 0.07, 0.16], accent: fxGold },
  { position: [-20.5, 0.035, 6.18], scale: [8.2, 0.07, 0.16], accent: fxAqua },
  { position: [4.5, 0.035, 6.18], scale: [6.8, 0.07, 0.16], accent: fxGold },
  { position: [18.2, 0.035, 6.18], scale: [5.4, 0.07, 0.16], accent: fxPink },
  { position: [-13.18, 0.035, -14.2], scale: [0.16, 0.07, 7.6], accent: fxGold },
  { position: [-13.18, 0.035, 14.2], scale: [0.16, 0.07, 7.6], accent: fxPink },
  { position: [-2.82, 0.035, -14.2], scale: [0.16, 0.07, 7.6], accent: fxAqua },
  { position: [-2.82, 0.035, 14.2], scale: [0.16, 0.07, 7.6], accent: fxGold },
];

/**
 * Raised road-edge markers bind the saturated palette to the physical street
 * instead of adding more floating signs.  A dark metal carrier remains visible
 * when emissive rendering is reduced, and the broken runs keep every crossing
 * and venue approach clear.
 */
function StreetColorRunways() {
  return (
    <group name="street-colour-runways">
      {ROAD_EDGE_RUNS.map((run, index) => (
        <group key={index} position={run.position}>
          <mesh dispose={null} geometry={FX_BOX} position={[0, -0.018, 0]} scale={[run.scale[0] + 0.14, 0.055, run.scale[2] + 0.14]} material={supportMetal} receiveShadow />
          <mesh dispose={null} geometry={FX_BOX} scale={run.scale} material={run.accent} castShadow={false} />
          {index % 3 === 0 && (
            <mesh
              position={run.scale[0] > run.scale[2] ? [run.scale[0] * 0.32, 0.07, 0] : [0, 0.07, run.scale[2] * 0.32]}
              scale={run.scale[0] > run.scale[2] ? [0.72, 0.025, 0.24] : [0.24, 0.025, 0.72]}
              material={fxAqua}
              castShadow={false}
              dispose={null}
              geometry={FX_BOX}
            />
          )}
        </group>
      ))}
    </group>
  );
}

function Cable({ points, color = '#11131a', radius = 0.035 }: { points: P3[]; color?: string; radius?: number }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 5, false);
  }, [points, radius]);
  const mat = useMemo(() => toonMat(color), [color]);
  return <mesh geometry={geo} material={mat} />;
}

function StreetFX() {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const pulse = useRef<THREE.Group>(null);
  const t = useRef(0);
  const reduceMotion = useSettings((state) => state.reduceMotion);
  useFrame((_, delta) => {
    t.current += delta;
    if (left.current) left.current.position.y = reduceMotion ? 0 : Math.sin(t.current * 2.1) * 0.06;
    if (right.current) right.current.position.y = reduceMotion ? 0 : Math.sin(t.current * 1.8 + 1.4) * 0.05;
    if (pulse.current) {
      pulse.current.children.forEach((child, index) => {
        const baseY = (child.userData.baseY as number | undefined) ?? child.position.y;
        const baseRz = (child.userData.baseRz as number | undefined) ?? child.rotation.z;
        child.userData.baseY = baseY;
        child.userData.baseRz = baseRz;
        child.position.y = baseY + (reduceMotion ? 0 : Math.sin(t.current * 2.7 + index * 0.55) * 0.045);
        child.rotation.z = baseRz + (reduceMotion ? 0 : Math.sin(t.current * 0.8 + index) * 0.035);
      });
    }
  });
  const bars = [-2.8, -1.4, 0, 1.4, 2.8];
  return (
    <group name="street-saturated-fx">
      <StreetColorRunways />
      <group ref={left} position={[-18.4, 5.0, -8.8]} rotation={[0, 0.08, -0.12]}>
        {bars.map((x, i) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, i % 2 ? -0.3 : 0.3]} material={i % 2 ? fxAqua : fxPink}>
            <boxGeometry args={[0.12, 2.4 + (i % 3) * 0.55, 0.12]} />
          </mesh>
        ))}
        <mesh position={[0, -1.35, 0]} material={supportMetal}><boxGeometry args={[7.4, 0.12, 0.14]} /></mesh>
      </group>
      <group ref={right} position={[15.5, 4.0, 2.5]} rotation={[0, -0.12, 0.16]}>
        {bars.slice(0, 4).map((x, i) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, i % 2 ? 0.24 : -0.24]} material={i === 1 ? fxGold : fxAqua}>
            <boxGeometry args={[0.14, 1.8 + (i % 2) * 0.7, 0.14]} />
          </mesh>
        ))}
        <mesh position={[0, -1.1, 0]} material={supportMetal}><boxGeometry args={[6.2, 0.1, 0.14]} /></mesh>
      </group>
      {/* Short, anchored light rails add motion and colour at the sides of the
          crossroads without placing another opaque billboard across entrances. */}
      <group ref={pulse} position={[20.6, 3.75, -6.8]} rotation={[0, -0.16, 0.08]}>
        <mesh position={[0, -1.7, 0]} material={supportMetal} castShadow><boxGeometry args={[5.4, 0.12, 0.18]} /></mesh>
        {[-2.1, -1.4, -0.7, 0, 0.7, 1.4, 2.1].map((x, index) => (
          <mesh key={x} position={[x, 0, 0]} material={index % 2 ? fxAqua : fxPink} castShadow>
            <boxGeometry args={[0.24, 2.7 + (index % 3) * 0.28, 0.12]} />
          </mesh>
        ))}
        <mesh position={[-2.72, -0.7, 0]} material={metal} castShadow><boxGeometry args={[0.14, 2.05, 0.16]} /></mesh>
        <mesh position={[2.72, -0.7, 0]} material={metal} castShadow><boxGeometry args={[0.14, 2.05, 0.16]} /></mesh>
      </group>
      <group position={[-20.2, 3.45, 6.2]} rotation={[0, 0.18, -0.08]}>
        <mesh position={[0, -1.45, 0]} material={supportMetal} castShadow><boxGeometry args={[4.8, 0.12, 0.18]} /></mesh>
        {[-1.8, -1.1, -0.4, 0.3, 1.0, 1.7].map((x, index) => (
          <mesh key={x} position={[x, 0, 0]} material={index % 2 ? fxGold : fxAqua} castShadow>
            <boxGeometry args={[0.2, 2.2 + (index % 2) * 0.3, 0.12]} />
          </mesh>
        ))}
      </group>
      <Cable points={[[-22.5, 6.8, -11.2], [-15.0, 7.4, -10.7], [-7.4, 6.9, -10.4]]} color="#ff3f83" radius={0.055} />
      <Cable points={[[8.8, 7.1, 7.2], [15.2, 7.8, 6.6], [22.4, 7.0, 5.8]]} color="#37e8f1" radius={0.05} />
    </group>
  );
}

/**
 * 赛博街头层：不是 HUD，而是可被相机看到并参与透视的实体构件——立面检修平台、
 * 电缆、消防梯和受控局部灯光。它们只占现有街区，不扩张可玩地图或横切地标。
 */
export default function CyberpunkLayer() {
  return (
    <group name="cyberpunk-street-layer">
      <StreetFX />
      {/*
       * Keep the media-tower sightline open. The former 31m bridge occupied the
       * same depth and height as the tower screen, physically cutting through
       * both its display and casing. Facade fire escapes and connected cable
       * runs below provide the elevated service layer without spanning the
       * landmark or dropping another large box across the crossroads.
       */}

      {/* 建筑侧面的实体消防梯与冷凝机组，给平整的高墙增加可辨识的尺度参照。 */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 25.8, 0, 7.8]}>
          {[3.2, 6.6, 10.0, 13.4].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={metal} castShadow receiveShadow>
              <boxGeometry args={[2.8, 0.12, 3.0]} />
            </mesh>
          ))}
          <mesh position={[side * 0.95, 8.3, 0]} material={metal} castShadow><boxGeometry args={[0.12, 11.2, 0.12]} /></mesh>
          <mesh position={[side * 0.95, 8.3, 1.15]} material={metal} castShadow><boxGeometry args={[0.12, 11.2, 0.12]} /></mesh>
          {[4.9, 8.3, 11.7].map((y) => (
            <mesh key={y} position={[side * 1.1, y, 0]} rotation={[0, 0, side * 0.15]} material={yellow} castShadow>
              <boxGeometry args={[0.08, 2.5, 0.08]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 交通与机电电缆：用轻量 TubeGeometry 画出头顶的真实连接关系。 */}
      <Cable points={[[-25, 12.8, -5.8], [-12, 14.2, -5.3], [3, 15.0, -5.7], [23, 14.6, -5.2]]} />
      <Cable points={[[-20, 13.2, 5.5], [-10, 14.1, 1.0], [5, 13.6, -1.8], [20, 14.4, -5.3]]} />
      <Cable points={[[-2, 10.4, -20], [-4, 11.7, -10], [-8, 10.8, 0], [-12, 12.1, 16]]} color="#243343" radius={0.045} />

      {/* 路口信号柱只保留一个有实体撑杆的识别环。早期三只无支撑
          圆环既遮挡建筑，也在近景里像悬浮装饰。 */}
      <group position={[-8, 0, 1]}>
        <mesh position={[0, 2.8, 0]} material={metal}><cylinderGeometry args={[0.16, 0.22, 5.6, 8]} /></mesh>
        <mesh position={[0, 3.1, 0]} rotation={[Math.PI / 2, 0, 0]} material={cyan}>
          <torusGeometry args={[0.66, 0.055, 7, 28]} />
        </mesh>
        {[0, Math.PI * 2 / 3, Math.PI * 4 / 3].map((angle) => (
          <mesh
            key={angle}
            position={[Math.cos(angle) * 0.33, 3.1, Math.sin(angle) * 0.33]}
            rotation={[0, -angle, 0]}
            material={supportMetal}
            castShadow
          >
            <boxGeometry args={[0.66, 0.085, 0.085]} />
          </mesh>
        ))}
        <mesh position={[0, 5.65, 0]} material={violet}><boxGeometry args={[0.9, 0.16, 0.9]} /></mesh>
      </group>
      <pointLight position={[-8, 3.0, 1]} color="#40e8ff" intensity={3.2} distance={9} decay={2} />
      <pointLight position={[12, 5.2, -6]} color="#ff3f83" intensity={3.8} distance={13} decay={2} />
      <pointLight position={[-16, 5.8, -7]} color="#7a5fff" intensity={2.6} distance={10} decay={2} />
    </group>
  );
}

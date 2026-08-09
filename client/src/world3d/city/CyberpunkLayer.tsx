import { useMemo } from 'react';
import * as THREE from 'three';
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

function Cable({ points, color = '#11131a', radius = 0.035 }: { points: P3[]; color?: string; radius?: number }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 5, false);
  }, [points, radius]);
  const mat = useMemo(() => toonMat(color), [color]);
  return <mesh geometry={geo} material={mat} />;
}

/**
 * 赛博街头层：不是 HUD，而是可被相机看到并参与透视的实体构件——立面检修平台、
 * 电缆、消防梯和受控局部灯光。它们只占现有街区，不扩张可玩地图或横切地标。
 */
export default function CyberpunkLayer() {
  return (
    <group name="cyberpunk-street-layer">
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

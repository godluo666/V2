/** Small, layout-driven props that belong to the Dango activity room. */
import * as THREE from 'three';
import { ACCENT, ENV } from '../city/palette';
import { surfaceMaterial, type SurfaceKind } from '../city/materials';
import { toonMat } from '../city/toon';

type P3 = [number, number, number];

function surface(kind: SurfaceKind, color: string): THREE.MeshStandardMaterial {
  const material = surfaceMaterial(kind);
  material.color.set(color);
  return material;
}

const wood = surface('wood', '#67462f');
const darkWood = surface('wood', '#35261d');
const brushedMetal = surface('brushedMetal', ENV.metal);
const ceramic = surface('plasticLightbox', '#e7dfd1');
const drawerFront = surface('paintedConcrete', '#c68468');
const teaBucket = surface('metal', '#9a5b47');
const lanternShell = toonMat(ACCENT.mahjongLantern, {
  emissive: ACCENT.mahjongLantern,
  emissiveIntensity: 0.72,
});
const lanternFrame = surface('metal', '#34251f');
const tassel = surface('seatFabric', '#893d32');

/**
 * A physically layered tea cabinet: raised feet, framed doors, drawers,
 * handles, backsplash, shelf and utensils remain readable in a close camera.
 */
export function GrTea({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      {[-0.82, 0.82].flatMap((x) => [-0.2, 0.2].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.12, z]} material={darkWood} castShadow>
          <boxGeometry args={[0.1, 0.24, 0.1]} />
        </mesh>
      )))}
      <mesh position={[0, 0.57, 0]} material={wood} castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.9, 0.58]} />
      </mesh>
      <mesh position={[0, 1.04, 0]} material={darkWood} castShadow>
        <boxGeometry args={[2.12, 0.08, 0.68]} />
      </mesh>
      {[-0.5, 0.5].map((x) => (
        <group key={`door-${x}`} position={[x, 0.52, 0.305]}>
          <mesh material={drawerFront} castShadow><boxGeometry args={[0.82, 0.55, 0.055]} /></mesh>
          <mesh position={[0, 0, 0.035]} material={darkWood}><boxGeometry args={[0.68, 0.42, 0.035]} /></mesh>
          <mesh position={[x < 0 ? 0.25 : -0.25, 0, 0.075]} material={brushedMetal}>
            <boxGeometry args={[0.06, 0.24, 0.06]} />
          </mesh>
        </group>
      ))}
      {[-0.52, 0.52].map((x) => (
        <group key={`drawer-${x}`} position={[x, 0.9, 0.32]}>
          <mesh material={drawerFront}><boxGeometry args={[0.84, 0.18, 0.06]} /></mesh>
          <mesh position={[0, 0, 0.065]} material={brushedMetal}><boxGeometry args={[0.3, 0.035, 0.05]} /></mesh>
        </group>
      ))}

      <mesh position={[0, 1.57, -0.26]} material={wood} castShadow>
        <boxGeometry args={[2.0, 0.92, 0.1]} />
      </mesh>
      <mesh position={[0, 1.42, -0.13]} material={darkWood} castShadow>
        <boxGeometry args={[1.72, 0.08, 0.38]} />
      </mesh>
      {[-0.82, 0.82].map((x) => (
        <mesh key={`shelf-bracket-${x}`} position={[x, 1.25, -0.13]} material={brushedMetal}>
          <boxGeometry args={[0.06, 0.34, 0.3]} />
        </mesh>
      ))}

      <group position={[-0.62, 1.18, 0]}>
        <mesh material={brushedMetal} castShadow><cylinderGeometry args={[0.1, 0.12, 0.22, 12]} /></mesh>
        <mesh position={[0, 0.14, 0]} material={brushedMetal}><cylinderGeometry args={[0.04, 0.06, 0.06, 8]} /></mesh>
        <mesh position={[0.12, -0.01, 0]} rotation={[0, 0, -0.72]} material={brushedMetal}>
          <cylinderGeometry args={[0.016, 0.022, 0.14, 8]} />
        </mesh>
      </group>
      <mesh position={[0.02, 1.22, 0.04]} material={ceramic} castShadow><sphereGeometry args={[0.085, 12, 8]} /></mesh>
      {[0.32, 0.48, 0.64].map((x, index) => (
        <mesh key={x} position={[x, 1.19, index % 2 ? 0.09 : -0.05]} material={ceramic} castShadow>
          <cylinderGeometry args={[0.036, 0.03, 0.065, 10]} />
        </mesh>
      ))}
      <mesh position={[0.86, 1.28, -0.02]} material={teaBucket} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.28, 12]} />
      </mesh>
      <mesh position={[0.86, 1.43, -0.02]} material={darkWood}>
        <cylinderGeometry args={[0.08, 0.1, 0.035, 12]} />
      </mesh>
    </group>
  );
}

/** Thick paper lantern with a frame, suspension cable, cap and cloth tassel. */
export function GrLantern({ position }: { position: P3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.55, 0]} material={lanternFrame}>
        <cylinderGeometry args={[0.01, 0.01, 0.7, 6]} />
      </mesh>
      <mesh position={[0, 0.22, 0]} material={lanternFrame} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.06, 12]} />
      </mesh>
      <mesh material={lanternShell} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.31, 16]} />
      </mesh>
      {[-0.12, 0.12].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={lanternFrame}>
          <torusGeometry args={[0.178, 0.012, 6, 16]} />
        </mesh>
      ))}
      <mesh position={[0, -0.2, 0]} material={lanternFrame} castShadow>
        <cylinderGeometry args={[0.11, 0.085, 0.06, 12]} />
      </mesh>
      <mesh position={[0, -0.33, 0]} material={tassel} castShadow>
        <cylinderGeometry args={[0.022, 0.04, 0.2, 8]} />
      </mesh>
    </group>
  );
}

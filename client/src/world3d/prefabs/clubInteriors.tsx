/** Cozy, asset-free furniture for the Dango party hall activity room. */
import * as THREE from 'three';
import { toonMat } from '../city/toon';

type P3 = [number, number, number];

const cream = toonMat('#f5dfc8');
const red = toonMat('#cf5d58');
const gold = toonMat('#f4c66b');
const green = toonMat('#6b9a72');
const blue = toonMat('#5f87b8');
const pink = toonMat('#e69aaa');
const rug = toonMat('#d97966');
const wood = toonMat('#765138');
const darkWood = toonMat('#432f28');
const glowGold = toonMat('#f4c66b', { emissive: '#ef9f4d', emissiveIntensity: 0.55 });

export function ClubRug({ position, ry, w, d }: {
  position: P3; ry: number; w: number; d: number;
}) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh receiveShadow material={rug}><boxGeometry args={[w, 0.025, d]} /></mesh>
      <mesh position={[0, 0.016, 0]} material={cream}><boxGeometry args={[w * 0.72, 0.012, d * 0.72]} /></mesh>
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} material={gold}>
        <ringGeometry args={[Math.min(w, d) * 0.17, Math.min(w, d) * 0.23, 32]} />
      </mesh>
      {[-1, 1].flatMap((side) =>
        Array.from({ length: 12 }, (_, i) => (
          <mesh
            key={`${side}-${i}`}
            position={[-w / 2 + 0.3 + i * ((w - 0.6) / 11), 0.012, side * (d / 2 + 0.08)]}
            rotation={[Math.PI / 2, 0, 0]}
            material={cream}
          >
            <cylinderGeometry args={[0.012, 0.012, 0.16, 5]} />
          </mesh>
        )),
      )}
    </group>
  );
}

export function ClubSofa({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.32, 0]} castShadow material={red}><boxGeometry args={[3.5, 0.48, 0.9]} /></mesh>
      <mesh position={[0, 0.75, -0.38]} castShadow material={pink}><boxGeometry args={[3.5, 0.78, 0.28]} /></mesh>
      {[-1.15, 0, 1.15].map((x) => (
        <mesh key={x} position={[x, 0.51, 0.08]} castShadow material={cream}>
          <boxGeometry args={[1.02, 0.18, 0.7]} />
        </mesh>
      ))}
      {[-1.82, 1.82].map((x) => (
        <mesh key={x} position={[x, 0.55, 0]} material={darkWood}>
          <boxGeometry args={[0.14, 0.55, 0.94]} />
        </mesh>
      ))}
    </group>
  );
}

export function ClubStage({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow material={wood}>
        <boxGeometry args={[7.2, 0.36, 2]} />
      </mesh>
      <mesh position={[0, 0.38, 0.92]} material={glowGold}><boxGeometry args={[7.2, 0.04, 0.07]} /></mesh>
      <mesh position={[0, 1.75, -0.96]} material={red}><boxGeometry args={[7.2, 2.8, 0.08]} /></mesh>
      {[-2.1, 0, 2.1].map((x) => (
        <mesh key={x} position={[x, 1.75, -0.9]} rotation={[0, 0, 0.08 * Math.sign(x)]} material={pink}>
          <boxGeometry args={[0.12, 2.7, 0.1]} />
        </mesh>
      ))}
      <mesh position={[0, 1.55, -0.84]} material={cream}><circleGeometry args={[0.62, 32]} /></mesh>
      <pointLight position={[0, 2.4, 0.2]} color="#ffd590" intensity={2.4} distance={6} />
    </group>
  );
}

export function FlyingChessTable({ position, ry }: { position: P3; ry: number }) {
  const colors = [red, blue, gold, green];
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.65, 0]} castShadow material={wood}><boxGeometry args={[1.3, 0.1, 1.3]} /></mesh>
      <mesh position={[0, 0.712, 0]} material={cream}><boxGeometry args={[1.18, 0.025, 1.18]} /></mesh>
      {[
        [-0.42, -0.42], [0.42, -0.42], [0.42, 0.42], [-0.42, 0.42],
      ].map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, 0.73, z]} rotation={[-Math.PI / 2, 0, 0]} material={colors[i]}>
            <circleGeometry args={[0.23, 20]} />
          </mesh>
          <mesh position={[x, 0.79, z]} material={colors[i]}><sphereGeometry args={[0.065, 12, 8]} /></mesh>
        </group>
      ))}
      {[-0.48, 0.48].flatMap((x) => [-0.48, 0.48].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.31, z]} material={darkWood}>
          <cylinderGeometry args={[0.04, 0.04, 0.62, 8]} />
        </mesh>
      )))}
    </group>
  );
}

export function ClubTrophyWall({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh material={darkWood}><boxGeometry args={[3.8, 2.4, 0.12]} /></mesh>
      <mesh position={[0, 0.7, 0.08]} material={cream}><boxGeometry args={[3.55, 0.78, 0.05]} /></mesh>
      {[[-1.15, red], [0, blue], [1.15, green]].map(([x, material], i) => (
        <mesh key={i} position={[x as number, 0.74, 0.13]} material={material as THREE.Material}>
          <boxGeometry args={[0.82, 0.55, 0.03]} />
        </mesh>
      ))}
      {[-1.05, 0, 1.05].map((x, i) => (
        <group key={x} position={[x, -0.45, 0.14]}>
          <mesh position={[0, -0.22, 0]} material={gold}><cylinderGeometry args={[0.2, 0.28, 0.08, 16]} /></mesh>
          <mesh material={i === 1 ? red : gold}><sphereGeometry args={[0.22, 16, 12]} /></mesh>
          <mesh position={[0, 0.26, 0]} material={gold}><coneGeometry args={[0.11, 0.25, 8]} /></mesh>
        </group>
      ))}
    </group>
  );
}

export function ClubExtras({ lightsOn }: { lightsOn: boolean }) {
  const strip = lightsOn ? glowGold : darkWood;
  return (
    <group>
      <mesh position={[0, 3.85, -8.88]} material={strip}><boxGeometry args={[9.5, 0.08, 0.06]} /></mesh>
      <mesh position={[0, 3.55, -8.82]} material={pink}><boxGeometry args={[4.2, 0.58, 0.05]} /></mesh>
      {[-9.5, 9.5].map((x) => (
        <group key={x} position={[x, 2.1, -8.78]}>
          <mesh material={cream}><boxGeometry args={[1.3, 1.5, 0.05]} /></mesh>
          <mesh position={[0, 0, 0.04]} material={x < 0 ? blue : green}><circleGeometry args={[0.38, 24]} /></mesh>
        </group>
      ))}
    </group>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CITY_BOUNDS, streetCenterZ, streetHeight,
} from '@nexuspark/shared';
import { MergeBag, unitBox } from './streets';
import { surfaceMaterial } from './materials';
import { useWorld } from '../../state/stores';

type P3 = [number, number, number];

const C = {
  cream: '#eee7d8', warmWhite: '#f5eddf', grey: '#c7c5bc',
  wood: '#86664c', darkWood: '#59483a', sage: '#87977d', leaf: '#65805f',
  leafDark: '#4e6b4e', flower: '#e4b493', blueShadow: '#8a8fa8', glass: '#8ca6a8',
  orange: '#d49353', roof: '#686866', ink: '#4d4d49', linen: '#e8ded2', stone: '#aaa89d',
};

const material = (color: string, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });
// The large circulation surfaces use original deterministic micro maps for
// aggregate and casting grain; seams, repairs, grates and curb chips remain
// modeled geometry, so the surface never depends on a flat downloaded image.
const roadMat = surfaceMaterial('dryAsphalt');
const walkMat = surfaceMaterial('sidewalk');
walkMat.color.set('#d5d0c5'); walkMat.roughness = 0.92;
const dryRoadColor = new THREE.Color('#656862');
const wetRoadColor = new THREE.Color('#464c4d');
const dryWalkColor = new THREE.Color('#d5d0c5');
const wetWalkColor = new THREE.Color('#b7b8b2');
const puddleMat = new THREE.MeshStandardMaterial({
  color: '#788c91', roughness: 0.2, metalness: 0.08,
  transparent: true, opacity: 0, depthWrite: false,
});
const curbMat = material('#aaa89f');
const darkWoodMat = material(C.darkWood);
const leafMat = material(C.leaf);
const leafDarkMat = material(C.leafDark);
const flowerMat = material(C.flower);
const metalMat = material('#686b69', 0.7);
const stoneMat = material(C.stone, 1);
const leafLitterMats = ['#92784f', '#b08b55', '#7f8557'].map((color) => material(color, 1));
const clayPotMats = [material('#9e775d'), material('#8b7967')];
const scooterPaintMat = material('#8c9d93', 0.7);
const bottleAmberMat = material('#b89265', 0.82);
const gasBottleMat = material('#b7b8ae', 0.7);
const extinguisherMat = material('#b84e42', 0.62);
const bowlWaterMat = new THREE.MeshStandardMaterial({
  color: '#8ca9a8', roughness: 0.18, metalness: 0.04,
  transparent: true, opacity: 0.72, depthWrite: false,
});
const ridgeHillGeo = new THREE.DodecahedronGeometry(1, 2);
const ridgeTrunkGeo = new THREE.CylinderGeometry(0.13, 0.18, 3.4, 7);
const ridgeCanopyGeo = new THREE.DodecahedronGeometry(1, 1);
const backgroundVertexMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
const backgroundWindowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.03 });
const windowMat = new THREE.MeshStandardMaterial({ color: C.glass, roughness: 0.34, metalness: 0.04 });
const warmWindowMat = new THREE.MeshStandardMaterial({
  color: '#f1ca82', emissive: '#d98d45', emissiveIntensity: 0.22, roughness: 0.58,
});
const laundryMats = [C.linen, '#b7c2b1', '#d6b3a5', '#c4c7cd'].map((color) => material(color, 0.96));

function roadYaw(x: number): number {
  return -Math.atan(Math.cos((x + 4) / 18) * (3.2 / 18) + 0.025);
}

function PaintedBox({ position, scale, color, material: meshMaterial, rotation = [0, 0, 0], cast = true }: {
  position: P3; scale: P3; color?: string; material?: THREE.Material; rotation?: P3; cast?: boolean;
}) {
  return (
    <mesh position={position} scale={scale} rotation={rotation} material={meshMaterial} castShadow={cast} receiveShadow>
      <boxGeometry />
      {!meshMaterial && <meshStandardMaterial color={color ?? C.cream} roughness={0.92} />}
    </mesh>
  );
}

function CanvasSign({ text, color, position, rotation = [0, 0, 0], size = [1.8, 0.48] }: {
  text: string; color: string; position: P3; rotation?: P3; size?: [number, number];
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.fillStyle = color; context.fillRect(0, 0, 512, 128);
    context.strokeStyle = 'rgba(75,64,52,.5)'; context.lineWidth = 10; context.strokeRect(5, 5, 502, 118);
    context.fillStyle = '#fff8ea'; context.font = '700 58px sans-serif';
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 256, 67);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [color, text]);
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={[size[0], size[1], 0.07]} />
      <meshStandardMaterial map={texture} roughness={0.76} />
    </mesh>
  );
}

function CylBetween({ from, to, radius = 0.025, mat = metalMat }: {
  from: P3; to: P3; radius?: number; mat?: THREE.Material;
}) {
  const data = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const mid = a.clone().lerp(b, 0.5);
    const direction = b.clone().sub(a);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    return { mid, quaternion, length: direction.length() };
  }, [from, to]);
  return (
    <mesh position={data.mid} quaternion={data.quaternion} material={mat} castShadow>
      <cylinderGeometry args={[radius, radius, data.length, 7]} />
    </mesh>
  );
}

function GabledRoof({ w, d, h }: { w: number; d: number; h: number }) {
  return (
    <group>
      <PaintedBox
        position={[0, h + 0.42, -d * 0.235]}
        scale={[w + 0.38, 0.16, d * 0.58]}
        rotation={[-0.32, 0, 0]}
        color={C.roof}
      />
      <PaintedBox
        position={[0, h + 0.42, d * 0.235]}
        scale={[w + 0.38, 0.16, d * 0.58]}
        rotation={[0.32, 0, 0]}
        color="#74716c"
      />
      <CylBetween from={[-w / 2 - 0.16, h + 0.84, 0]} to={[w / 2 + 0.16, h + 0.84, 0]} radius={0.055} mat={darkWoodMat} />
    </group>
  );
}

const TONES = ['#eee6d8', '#d8d0c2', '#e7ddcf', '#d6d8cd', '#e8dfd1', '#cfd3cc'];

function RoadRibbon() {
  const raining = useWorld((state) => state.env.weather === 'rain');
  useFrame((_, delta) => {
    const amount = 1 - Math.exp(-delta * 1.8);
    roadMat.color.lerp(raining ? wetRoadColor : dryRoadColor, amount);
    walkMat.color.lerp(raining ? wetWalkColor : dryWalkColor, amount);
    roadMat.roughness = THREE.MathUtils.lerp(roadMat.roughness, raining ? 0.7 : 0.96, amount);
    roadMat.metalness = THREE.MathUtils.lerp(roadMat.metalness, raining ? 0.045 : 0.015, amount);
    walkMat.roughness = THREE.MathUtils.lerp(walkMat.roughness, raining ? 0.78 : 0.92, amount);
  });
  const points = [-42, -38, -34, -30, -26, -22, -18, -14, -10, -6, -2, 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42];
  return (
    <group>
      {points.slice(0, -1).map((x0, index) => {
        const x1 = points[index + 1];
        const z0 = streetCenterZ(x0), z1 = streetCenterZ(x1);
        const y0 = streetHeight(x0), y1 = streetHeight(x1);
        const dx = x1 - x0, dz = z1 - z0, dy = y1 - y0;
        const horizontal = Math.hypot(dx, dz);
        const yaw = -Math.atan2(dz, dx);
        const pitch = Math.atan2(dy, horizontal);
        return (
          <group key={x0} position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} rotation={[0, yaw, pitch]}>
            <PaintedBox position={[0, -0.055, 0]} scale={[horizontal + 0.18, 0.11, 5.2]} material={roadMat} />
            {[-1, 1].map((side) => (
              <group key={side} position={[0, -0.065, side * 3.25]}>
                <PaintedBox position={[0, 0, 0]} scale={[horizontal + 0.2, 0.13, 1.1]} material={walkMat} />
                <PaintedBox position={[0, 0.05, -side * 0.6]} scale={[horizontal + 0.18, 0.17, 0.1]} material={curbMat} />
                <PaintedBox position={[0, 0.085, side * 0.59]} scale={[horizontal + 0.18, 0.035, 0.2]} color="#777b74" />
              </group>
            ))}
            {/* Worn repair strip follows the road instead of a graphic centre line. */}
            <PaintedBox position={[0, 0.01, index % 2 ? 0.48 : -0.42]} scale={[horizontal * 0.56, 0.018, 0.24]} color={index % 2 ? '#5b5e59' : '#73756e'} cast={false} />
          </group>
        );
      })}
    </group>
  );
}

function RoadMicroDetails() {
  const grateXs = [-38, -30, -22, -14, -6, 2, 10, 18, 26, 34, 40];
  const covers = [-32, -17, -1, 14, 29];
  return (
    <group name="street-drainage-and-repairs">
      {grateXs.flatMap((x, index) => [-1, 1].map((side) => {
        const tangent = -Math.atan(Math.cos((x + 4) / 18) * (3.2 / 18) + 0.025);
        const z = streetCenterZ(x) + side * 2.76;
        return (
          <group key={`${x}-${side}`} position={[x, streetHeight(x) + 0.018, z]} rotation={[0, tangent, 0]}>
            <PaintedBox position={[0, 0, 0]} scale={[0.78, 0.035, 0.3]} color="#595d5b" cast={false} />
            {[-0.26, -0.13, 0, 0.13, 0.26].map((bar) => (
              <PaintedBox key={bar} position={[bar, 0.023, 0]} scale={[0.032, 0.012, 0.25]} color="#979892" cast={false} />
            ))}
            {index % 3 === 0 && <PaintedBox position={[0, 0.018, side * 0.24]} scale={[1.15, 0.015, 0.08]} color="#8c8d85" cast={false} />}
          </group>
        );
      }))}
      {covers.map((x, index) => (
        <group key={x} position={[x, streetHeight(x) + 0.025, streetCenterZ(x) + (index % 2 ? 0.72 : -0.66)]}>
          <mesh material={metalMat} receiveShadow><cylinderGeometry args={[0.46, 0.46, 0.035, 24]} /></mesh>
          <mesh position={[0, 0.024, 0]} rotation={[Math.PI / 2, 0, index * 0.4]} material={curbMat}>
            <torusGeometry args={[0.27, 0.025, 6, 20]} />
          </mesh>
        </group>
      ))}
      {[-29, -11, 6, 24, 37].map((x, index) => (
        <group key={`patch-${x}`} position={[x, streetHeight(x) + 0.03, streetCenterZ(x)]} rotation={[0, index % 2 ? 0.18 : -0.14, 0]}>
          <PaintedBox position={[0, 0, 0]} scale={[2.7 + (index % 2), 0.018, 0.18]} color="#555a56" cast={false} />
          <PaintedBox position={[0.7, 0.006, 0.28]} scale={[1.2, 0.015, 0.11]} color="#777a73" rotation={[0, 0.45, 0]} cast={false} />
        </group>
      ))}
    </group>
  );
}

/** Shallow water collects beside failed repairs and curb drains only while it
 * rains. These are small physical surfaces, not a wet-road decal: their
 * opacity and scale rise gradually with the same weather state as the road. */
function RainWaterDetails() {
  const raining = useWorld((state) => state.env.weather === 'rain');
  const root = useRef<THREE.Group>(null);
  const wetness = useRef(0);
  useFrame((_, delta) => {
    wetness.current = THREE.MathUtils.lerp(
      wetness.current,
      raining ? 1 : 0,
      1 - Math.exp(-delta * (raining ? 0.72 : 0.42)),
    );
    puddleMat.opacity = wetness.current * 0.42;
    if (root.current) root.current.scale.y = Math.max(0.001, wetness.current);
  });
  const puddles = [
    [-29, -0.45, 1.05, 0.34, -0.12],
    [-17, 0.62, 0.72, 0.24, 0.18],
    [-6, -2.55, 0.82, 0.18, -0.08],
    [6, 0.38, 1.18, 0.31, 0.1],
    [18, 2.52, 0.65, 0.17, -0.15],
    [30, -0.72, 0.9, 0.26, 0.2],
    [39, 2.5, 0.68, 0.16, -0.06],
  ] as const;
  return (
    <group ref={root} name="rainwater-collection">
      {puddles.map(([x, offsetZ, width, depth, angle], index) => (
        <group
          key={x}
          position={[x, streetHeight(x) + 0.045, streetCenterZ(x) + offsetZ]}
          rotation={[0, roadYaw(x) + angle, 0]}
          scale={[width, 1, depth]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]} material={puddleMat} receiveShadow renderOrder={1}>
            <circleGeometry args={[1, 18]} />
          </mesh>
          {index % 2 === 0 && (
            <mesh position={[0.26, 0.003, -0.04]} rotation={[-Math.PI / 2, 0, 0]} material={puddleMat} scale={[0.36, 0.44, 1]} renderOrder={1}>
              <circleGeometry args={[1, 12]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function TactilePaving({ x, side, width = 1.45 }: { x: number; side: -1 | 1; width?: number }) {
  const z = streetCenterZ(x) + side * 3.28;
  return (
    <group position={[x, streetHeight(x) + 0.014, z]} rotation={[0, roadYaw(x), 0]}>
      <PaintedBox position={[0, 0, 0]} scale={[width, 0.025, 0.34]} color="#c9aa62" cast={false} />
      {[-0.48, -0.24, 0, 0.24, 0.48].filter((dot) => Math.abs(dot) < width / 2).flatMap((dot) => [-0.1, 0, 0.1].map((row) => (
        <mesh key={`${dot}-${row}`} position={[dot, 0.026, row]} material={stoneMat} receiveShadow>
          <cylinderGeometry args={[0.028, 0.034, 0.016, 8]} />
        </mesh>
      )))}
    </group>
  );
}

function ThresholdStory({ x, side, number, variant = 0 }: {
  x: number; side: -1 | 1; number: string; variant?: number;
}) {
  const z = streetCenterZ(x) + side * 4.55;
  const towardStreet = side > 0 ? Math.PI : 0;
  return (
    <group position={[x, streetHeight(x), z]} rotation={[0, roadYaw(x), 0]} name={`residential-threshold-${number}`}>
      {/* A narrow setback between public pavement and private home: walls, gate and worn stones. */}
      {[-1.05, 1.05].map((wallX) => (
        <group key={wallX} position={[wallX, 0, side * 0.28]}>
          <PaintedBox position={[0, 0.43, 0]} scale={[0.92, 0.82, 0.28]} color={variant % 2 ? '#b3ad9f' : '#c2baaa'} />
          <PaintedBox position={[0, 0.88, 0]} scale={[0.98, 0.1, 0.34]} color="#ddd4c3" />
        </group>
      ))}
      {[-0.58, 0.58].map((postX) => (
        <PaintedBox key={postX} position={[postX, 0.82, side * 0.25]} scale={[0.12, 1.52, 0.12]} material={darkWoodMat} />
      ))}
      {/* A genuinely supported rain canopy: wall plates and diagonal braces
          carry the shallow roof, while its gutter continues down one post to
          a gravel splash dish. */}
      <PaintedBox
        position={[0, 1.64, side * 0.18]}
        scale={[1.42, 0.1, 0.72]}
        color={variant % 2 ? '#747571' : '#82766a'}
        rotation={[side * -0.07, 0, 0]}
      />
      {[-0.54, 0.54].map((braceX) => (
        <CylBetween
          key={`canopy-brace-${braceX}`}
          from={[braceX, 1.22, side * 0.24]}
          to={[braceX, 1.6, -side * 0.12]}
          radius={0.022}
          mat={metalMat}
        />
      ))}
      <CylBetween from={[-0.72, 1.58, -side * 0.17]} to={[0.72, 1.58, -side * 0.17]} radius={0.025} mat={metalMat} />
      <CylBetween from={[0.66, 1.58, -side * 0.17]} to={[0.66, 0.14, -side * 0.17]} radius={0.018} mat={metalMat} />
      <mesh position={[0.66, 0.045, -side * 0.17]} scale={[0.2, 0.04, 0.16]} material={stoneMat} receiveShadow>
        <cylinderGeometry args={[1, 1.12, 1, 14]} />
      </mesh>
      <PaintedBox position={[0, 0.72, side * 0.25]} scale={[1.02, 1.16, 0.08]} material={metalMat} />
      {[-0.39, -0.19, 0.01, 0.21, 0.41].map((bar) => (
        <PaintedBox key={bar} position={[bar, 0.72, side * 0.2]} scale={[0.025, 1.05, 0.035]} color="#777a73" />
      ))}
      <CanvasSign
        text={number}
        color={variant % 2 ? '#778274' : '#8a6d55'}
        position={[0.83, 1.15, side * 0.08]}
        rotation={[0, towardStreet, 0]}
        size={[0.48, 0.22]}
      />
      {/* A wired doorbell plate and convex push button give the closed gate a
          believable everyday use instead of leaving it as decorative bars. */}
      <PaintedBox position={[-0.7, 1.05, side * 0.16]} scale={[0.16, 0.24, 0.055]} color="#817c72" />
      <mesh position={[-0.7, 1.04, side * 0.12]} rotation={[Math.PI / 2, 0, 0]} material={warmWindowMat}>
        <cylinderGeometry args={[0.035, 0.035, 0.025, 10]} />
      </mesh>
      <CylBetween from={[-0.7, 1.17, side * 0.18]} to={[-0.7, 1.42, side * 0.19]} radius={0.009} mat={metalMat} />
      {[-0.42, 0.02, 0.43].map((stone, index) => (
        <PaintedBox
          key={stone}
          position={[stone, 0.045, -side * (0.22 + index * 0.22)]}
          scale={[0.42, 0.06, 0.34]}
          color={index % 2 ? '#b8b3a8' : '#cbc5b7'}
          rotation={[0, (index - 1) * 0.08, 0]}
          cast={false}
        />
      ))}
      {/* Parcels, an umbrella jar and small planting keep the gate from feeling staged. */}
      <PaintedBox position={[-1.23, 0.17, -side * 0.1]} scale={[0.42, 0.3, 0.38]} color="#967b5c" />
      <mesh position={[1.25, 0.28, -side * 0.08]} material={stoneMat} castShadow>
        <cylinderGeometry args={[0.17, 0.2, 0.5, 10]} />
      </mesh>
      <CylBetween from={[1.25, 0.46, -side * 0.08]} to={[1.31, 1.34, -side * 0.15]} radius={0.018} mat={darkWoodMat} />
      <mesh position={[1.31, 1.36, -side * 0.15]} rotation={[Math.PI / 2, 0, 0]} material={darkWoodMat}>
        <torusGeometry args={[0.12, 0.018, 5, 12, Math.PI]} />
      </mesh>
      {[-1.46, 1.5].map((plantX, index) => (
        <group key={plantX} position={[plantX, 0, side * 0.42]}>
          <mesh position={[0, 0.2, 0]} material={clayPotMats[index]} castShadow>
            <cylinderGeometry args={[0.2, 0.16, 0.38, 10]} />
          </mesh>
          <mesh position={[0, 0.58, 0]} material={index ? leafDarkMat : leafMat} castShadow>
            <dodecahedronGeometry args={[0.34, 0]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DeliveryScooter({ x, side }: { x: number; side: -1 | 1 }) {
  const z = streetCenterZ(x) + side * 3.95;
  return (
    <group position={[x, streetHeight(x) + 0.08, z]} rotation={[0, roadYaw(x) + 0.22, 0]} name="neighborhood-delivery-scooter">
      {[-0.62, 0.63].map((wheelX) => (
        <group key={wheelX} position={[wheelX, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh material={metalMat} castShadow><torusGeometry args={[0.31, 0.07, 8, 18]} /></mesh>
          <mesh material={stoneMat}><cylinderGeometry args={[0.07, 0.07, 0.11, 12]} /></mesh>
        </group>
      ))}
      <PaintedBox position={[0, 0.53, 0]} scale={[1.02, 0.18, 0.22]} material={scooterPaintMat} rotation={[0, 0, 0.04]} />
      <PaintedBox position={[-0.08, 0.78, 0]} scale={[0.65, 0.22, 0.34]} material={scooterPaintMat} />
      <PaintedBox position={[-0.14, 0.94, 0]} scale={[0.52, 0.12, 0.31]} material={darkWoodMat} />
      <CylBetween from={[0.48, 0.5, 0]} to={[0.68, 1.28, 0]} radius={0.035} mat={metalMat} />
      <CylBetween from={[0.52, 1.28, 0]} to={[0.86, 1.28, 0]} radius={0.032} mat={metalMat} />
      <PaintedBox position={[0.74, 1.03, 0]} scale={[0.36, 0.36, 0.25]} material={scooterPaintMat} />
      <mesh position={[0.84, 1.11, -0.14]} rotation={[Math.PI / 2, 0, 0]} material={warmWindowMat}>
        <cylinderGeometry args={[0.09, 0.09, 0.035, 12]} />
      </mesh>
      <PaintedBox position={[-0.58, 1.14, 0]} scale={[0.62, 0.5, 0.48]} color="#b59c70" />
      {[-0.78, -0.58, -0.38].map((bar) => <PaintedBox key={bar} position={[bar, 1.14, -0.25]} scale={[0.035, 0.42, 0.03]} color="#765f46" />)}
      <CylBetween from={[-0.05, 0.44, 0.11]} to={[-0.22, 0.04, 0.3]} radius={0.022} mat={metalMat} />
    </group>
  );
}

function ShopDoorClutter({ x, side, variant }: { x: number; side: -1 | 1; variant: number }) {
  const z = streetCenterZ(x) + side * 4.62;
  return (
    <group position={[x, streetHeight(x), z]} rotation={[0, roadYaw(x), 0]}>
      {[-0.32, 0.28].map((crateX, index) => (
        <group key={crateX} position={[crateX, 0.18 + index * 0.09, 0]}>
          <PaintedBox position={[0, 0, 0]} scale={[0.52, 0.34, 0.45]} color={variant % 2 ? '#8b7457' : '#a2825e'} />
          {[-0.16, 0, 0.16].map((slat) => <PaintedBox key={slat} position={[slat, 0.01, -side * 0.24]} scale={[0.025, 0.27, 0.025]} color="#705c47" />)}
        </group>
      ))}
      {[0, 1, 2, 3, 4].map((bottle) => (
        <group key={bottle} position={[-0.45 + bottle * 0.22, 0.56 + (bottle % 2) * 0.03, side * 0.02]}>
          <mesh material={bottle % 2 ? leafDarkMat : bottleAmberMat} castShadow><cylinderGeometry args={[0.045, 0.055, 0.26, 8]} /></mesh>
          <mesh position={[0, 0.15, 0]} material={metalMat}><cylinderGeometry args={[0.03, 0.03, 0.035, 8]} /></mesh>
        </group>
      ))}
      <PaintedBox position={[0.82, 0.42, side * 0.02]} scale={[0.48, 0.8, 0.08]} color="#6c665b" rotation={[0, 0, -0.05]} />
      <PaintedBox position={[0.82, 0.43, -side * 0.045]} scale={[0.36, 0.62, 0.02]} color="#d5c9ad" rotation={[0, 0, -0.05]} cast={false} />
    </group>
  );
}

/** A small LPG installation tells a complete utility story: bottles sit on a
 * concrete plinth, a ventilated cage protects them, and the regulator really
 * continues into the facade. It is deliberately attached to one residence,
 * rather than scattered as generic street clutter. */
function GasCylinderRack({ x, side }: { x: number; side: -1 | 1 }) {
  const z = streetCenterZ(x) + side * 4.72;
  const y = streetHeight(x);
  return (
    <group position={[x, y, z]} rotation={[0, roadYaw(x), 0]} name="residential-lpg-service">
      <PaintedBox position={[0, 0.035, 0]} scale={[1.12, 0.07, 0.58]} color="#aaa69b" cast={false} />
      {[-0.27, 0.27].map((bottleX) => (
        <group key={bottleX} position={[bottleX, 0.52, side * 0.02]}>
          <mesh material={gasBottleMat} castShadow><cylinderGeometry args={[0.17, 0.19, 0.78, 12]} /></mesh>
          <mesh position={[0, 0.43, 0]} material={metalMat} castShadow><sphereGeometry args={[0.13, 10, 6]} /></mesh>
          <mesh position={[0, 0.55, 0]} material={metalMat}><cylinderGeometry args={[0.055, 0.055, 0.14, 8]} /></mesh>
          <mesh position={[0, 0.63, 0]} rotation={[Math.PI / 2, 0, 0]} material={darkWoodMat}>
            <torusGeometry args={[0.085, 0.018, 6, 12]} />
          </mesh>
        </group>
      ))}
      {/* Open cage: four uprights, two belts and a shallow rain cap. */}
      {[-0.54, 0.54].flatMap((px) => [-0.28, 0.28].map((pz) => (
        <CylBetween key={`${px}-${pz}`} from={[px, 0.06, pz]} to={[px, 1.34, pz]} radius={0.018} mat={metalMat} />
      )))}
      {[0.32, 1.08].flatMap((height) => [-0.28, 0.28].map((pz) => (
        <CylBetween key={`${height}-${pz}`} from={[-0.54, height, pz]} to={[0.54, height, pz]} radius={0.016} mat={metalMat} />
      )))}
      <PaintedBox position={[0, 1.4, 0]} scale={[1.2, 0.08, 0.68]} color="#777b76" />
      <PaintedBox position={[0, 1.02, side * 0.33]} scale={[0.3, 0.2, 0.1]} color="#767a72" />
      <CylBetween from={[0, 1.02, side * 0.34]} to={[0.44, 1.55, side * 0.6]} radius={0.018} mat={metalMat} />
      <CylBetween from={[0.44, 1.55, side * 0.6]} to={[0.44, 2.18, side * 0.6]} radius={0.018} mat={metalMat} />
    </group>
  );
}

/** Neighbourhood fire box with legs, weather hood, glazed door and a visible
 * extinguisher cylinder. This is safety infrastructure, not a floating icon. */
function NeighborhoodSafetyBox({ x, side }: { x: number; side: -1 | 1 }) {
  const z = streetCenterZ(x) + side * 4.68;
  const y = streetHeight(x);
  return (
    <group position={[x, y, z]} rotation={[0, roadYaw(x), 0]} name="neighborhood-fire-safety-box">
      {[-0.33, 0.33].map((leg) => <CylBetween key={leg} from={[leg, 0.02, 0]} to={[leg, 0.42, 0]} radius={0.025} mat={metalMat} />)}
      <PaintedBox position={[0, 0.95, 0]} scale={[0.82, 1.1, 0.4]} color="#a9584c" />
      <PaintedBox position={[0, 1.54, 0]} scale={[0.94, 0.09, 0.5]} color="#7e4b43" />
      <PaintedBox position={[0, 0.99, -side * 0.22]} scale={[0.66, 0.72, 0.025]} color="#ddd8c9" />
      <PaintedBox position={[0, 1.34, -side * 0.24]} scale={[0.5, 0.13, 0.026]} color="#9d5148" />
      <CanvasSign text="消火器" color="#a9584c" position={[0, 1.34, -side * 0.265]} rotation={[0, side > 0 ? Math.PI : 0, 0]} size={[0.48, 0.12]} />
      <mesh position={[0, 0.86, -side * 0.245]} material={extinguisherMat} castShadow>
        <cylinderGeometry args={[0.13, 0.15, 0.48, 10]} />
      </mesh>
      <PaintedBox position={[0.3, 0.98, -side * 0.25]} scale={[0.035, 0.12, 0.035]} material={metalMat} />
    </group>
  );
}

/** Fine expansion joints, grass in failed seams and a few curb chips keep the
 * sloped walk from reading as one freshly extruded ribbon. */
function SidewalkAgeDetails() {
  const joints = [-38, -34, -29, -23, -17, -10, -4, 3, 9, 15, 22, 28, 35, 40];
  return (
    <group name="sidewalk-age-and-weeds">
      {joints.flatMap((x, index) => ([-1, 1] as const).map((side) => {
        const z = streetCenterZ(x) + side * 3.55;
        const y = streetHeight(x);
        return (
          <group key={`${x}-${side}`} position={[x, y, z]} rotation={[0, roadYaw(x), 0]}>
            <PaintedBox position={[0, 0.018, 0]} scale={[0.035, 0.022, 0.82]} color="#9c9b93" cast={false} rotation={[0, (index % 3 - 1) * 0.035, 0]} />
            {(index + side) % 3 === 0 && (
              <group position={[0.04, 0.08, side * 0.27]}>
                {[-0.06, 0, 0.06].map((blade, bladeIndex) => (
                  <PaintedBox key={blade} position={[blade, 0.055 + bladeIndex * 0.012, 0]} scale={[0.018, 0.14 + bladeIndex * 0.025, 0.025]} color={bladeIndex % 2 ? C.leafDark : C.leaf} rotation={[0, 0, blade * 2.3]} cast={false} />
                ))}
              </group>
            )}
          </group>
        );
      }))}
    </group>
  );
}

function BatchedBackgroundHouses() {
  const group = useMemo(() => {
    const walls = new MergeBag();
    const windows = new MergeBag();
    const warmWindows = new MergeBag();
    const xs = [-39, -31, -23, -15, -7, 1, 9, 17, 25, 33, 40];
    const addLocal = (
      bag: MergeBag, angle: number, originX: number, originY: number, originZ: number,
      lx: number, ly: number, lz: number, sx: number, sy: number, sz: number,
      color: THREE.ColorRepresentation, rx = 0, rz = 0,
    ) => {
      const c = Math.cos(angle), s = Math.sin(angle);
      bag.add(unitBox(), {
        x: originX + lx * c + lz * s,
        y: originY + ly,
        z: originZ - lx * s + lz * c,
        rx, ry: angle, rz, sx, sy, sz, color,
      });
    };
    ([-1, 1] as const).forEach((side) => xs.forEach((x, index) => {
      // Keep the stair-top gate and the flying-chess tree against open sky;
      // distant houses frame these vistas instead of occupying their voids.
      if ((side === -1 && x === -15) || (side === 1 && x === 1)) return;
      const z = streetCenterZ(x) + side * (15.2 + (index % 3) * 0.8);
      const base = streetHeight(x) - 0.18;
      const w = 5.4 + (index % 3) * 0.75;
      const d = 4.8 + (index % 2) * 0.5;
      const h = 5.8 + (index % 4) * 0.65;
      const angle = roadYaw(x) + (side > 0 ? Math.PI : 0);
      const facadeZ = d / 2;
      const tone = TONES[(index + (side > 0 ? 2 : 0)) % TONES.length];
      addLocal(walls, angle, x, base, z, -w * 0.12, h / 2, 0, w * 0.78, h, d, tone);
      addLocal(walls, angle, x, base, z, w * 0.34, h * 0.48, -0.24, w * 0.32, h * 0.82, d * 0.78, TONES[(index + 3) % TONES.length]);
      addLocal(walls, angle, x, base, z, 0, h + 0.42, -d * 0.235, w + 0.38, 0.16, d * 0.58, C.roof, -0.32);
      addLocal(walls, angle, x, base, z, 0, h + 0.42, d * 0.235, w + 0.38, 0.16, d * 0.58, '#74716c', 0.32);
      addLocal(walls, angle, x, base, z, -w * 0.28, 0.95, facadeZ + 0.08, 0.72, 1.8, 0.1, C.darkWood);
      [1.75, 4.15].filter((y) => y < h - 0.55).forEach((y, row) => {
        [-0.27, 0.04, 0.3].forEach((portion) => addLocal(
          (index + row) % 5 === 0 ? warmWindows : windows,
          angle, x, base, z, w * portion, y, facadeZ + 0.03,
          0.72, 0.82, 0.08, (index + row) % 5 === 0 ? '#f1ca82' : C.glass,
        ));
      });
      addLocal(walls, angle, x, base, z, -w * 0.44, h / 2, facadeZ + 0.13, 0.065, h - 0.3, 0.065, '#686b69');
      if (h > 6.25) {
        addLocal(walls, angle, x, base, z, w * 0.14, 3.62, facadeZ + 0.33, Math.min(2.1, w * 0.38), 0.11, 0.62, '#aaa79e');
        [-0.72, -0.36, 0, 0.36, 0.72].forEach((rail) => addLocal(
          walls, angle, x, base, z, w * 0.14 + rail, 3.95, facadeZ + 0.61,
          0.025, 0.62, 0.025, '#686b69',
        ));
        addLocal(walls, angle, x, base, z, w * 0.14, 4.2, facadeZ + 0.61, 1.72, 0.035, 0.035, '#686b69');
      }
      if (index % 2 === 0) {
        addLocal(walls, angle, x, base, z, w * 0.16, h + 1.42, 0, 0.055, 1.45, 0.055, '#686b69');
        addLocal(walls, angle, x, base, z, w * 0.16, h + 1.65, 0, 0.92, 0.035, 0.035, '#686b69');
      } else {
        addLocal(walls, angle, x, base, z, -w * 0.16, h + 0.55, 0.2, 0.48, 0.78, 0.48, '#aaa79f');
      }
    }));
    const root = new THREE.Group();
    const wallGeo = walls.build();
    const windowGeo = windows.build();
    const warmGeo = warmWindows.build();
    if (wallGeo) {
      const mesh = new THREE.Mesh(wallGeo, backgroundVertexMat);
      mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    }
    if (windowGeo) root.add(new THREE.Mesh(windowGeo, backgroundWindowMat));
    if (warmGeo) {
      const mesh = new THREE.Mesh(warmGeo, warmWindowMat);
      mesh.castShadow = false; root.add(mesh);
    }
    root.name = 'batched-background-houses';
    return root;
  }, []);
  return <primitive object={group} />;
}

function HillRidge({ side }: { side: -1 | 1 }) {
  const group = useMemo(() => {
    const ridgeXs = [-46, -38, -29, -20, -10, 0, 10, 20, 30, 39, 47];
    const hillMatrices: [THREE.Matrix4[], THREE.Matrix4[]] = [[], []];
    const canopyMatrices: [THREE.Matrix4[], THREE.Matrix4[]] = [[], []];
    const trunkMatrices: THREE.Matrix4[] = [];
    const compose = (position: THREE.Vector3, scale: THREE.Vector3) => new THREE.Matrix4().compose(
      position, new THREE.Quaternion(), scale,
    );
    ridgeXs.forEach((x, index) => {
      const z = side * (33.5 + (index % 3) * 1.8);
      const y = 1.8 + streetHeight(Math.max(-42, Math.min(42, x))) + (index % 4) * 0.25;
      hillMatrices[index % 2].push(compose(
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(8.6 + (index % 2) * 1.5, 4.4 + (index % 3) * 0.7, 8.2),
      ));
      [-3.2, -0.8, 2.4].forEach((treeX, treeIndex) => {
        const treeY = y + 3.4 + treeIndex * 0.45;
        const treeZ = z - side * (1.1 + treeIndex * 0.5);
        trunkMatrices.push(compose(
          new THREE.Vector3(x + treeX, treeY - 1.7, treeZ),
          new THREE.Vector3(1, 1, 1),
        ));
        canopyMatrices[(index + treeIndex) % 2].push(compose(
          new THREE.Vector3(x + treeX, treeY, treeZ),
          new THREE.Vector3(1.6 + treeIndex * 0.15, 1.45, 1.5),
        ));
      });
    });
    const root = new THREE.Group();
    root.name = side < 0 ? 'south-hillside-depth' : 'north-hillside-depth';
    const addInstances = (geometry: THREE.BufferGeometry, meshMaterial: THREE.Material, matrices: THREE.Matrix4[], shadows: boolean) => {
      const instances = new THREE.InstancedMesh(geometry, meshMaterial, matrices.length);
      matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix));
      instances.instanceMatrix.needsUpdate = true;
      instances.castShadow = shadows;
      instances.receiveShadow = !shadows;
      instances.computeBoundingSphere();
      root.add(instances);
    };
    addInstances(ridgeHillGeo, leafMat, hillMatrices[0], false);
    addInstances(ridgeHillGeo, leafDarkMat, hillMatrices[1], false);
    addInstances(ridgeTrunkGeo, darkWoodMat, trunkMatrices, true);
    addInstances(ridgeCanopyGeo, leafMat, canopyMatrices[0], true);
    addInstances(ridgeCanopyGeo, leafDarkMat, canopyMatrices[1], true);
    return root;
  }, [side]);
  return <primitive object={group} />;
}

function DistantNeighborhood() {
  return (
    <group name="layered-residential-background">
      <BatchedBackgroundHouses />
      <HillRidge side={-1} />
      <HillRidge side={1} />
    </group>
  );
}

function ServiceAlley() {
  const x = 24;
  const base = streetHeight(x);
  const centre = streetCenterZ(x);
  const z = centre + 8.55;
  return (
    <group name="east-service-alley">
      <PaintedBox position={[x, base - 0.0375, z]} scale={[1.32, 0.075, 8.9]} color="#aaa79d" cast={false} />
      <PaintedBox position={[x - 0.53, base + 0.0175, z]} scale={[0.14, 0.035, 8.7]} color="#666a67" cast={false} />
      {Array.from({ length: 8 }, (_, index) => (
        <group key={index} position={[x - 0.53, base + 0.037, centre + 4.9 + index * 0.95]}>
          <PaintedBox position={[0, 0, 0]} scale={[0.22, 0.02, 0.34]} color="#5d615f" cast={false} />
          {[-0.1, 0, 0.1].map((bar) => <PaintedBox key={bar} position={[0, 0.014, bar]} scale={[0.18, 0.012, 0.018]} color="#949690" cast={false} />)}
        </group>
      ))}
      {/* Back gate, wall lamp, buckets and leaning broom make the branch a
          service passage rather than a texture strip between colliders. */}
      <PaintedBox position={[x - 0.56, base + 1.08, centre + 13.08]} scale={[0.1, 2.05, 0.12]} material={darkWoodMat} />
      <PaintedBox position={[x + 0.56, base + 1.08, centre + 13.08]} scale={[0.1, 2.05, 0.12]} material={darkWoodMat} />
      <PaintedBox position={[x, base + 1.02, centre + 13.08]} scale={[1.05, 1.82, 0.08]} color="#7e837c" />
      {[-0.36, -0.18, 0, 0.18, 0.36].map((bar) => (
        <PaintedBox key={bar} position={[x + bar, base + 1.02, centre + 13.02]} scale={[0.025, 1.66, 0.025]} color="#565d5b" />
      ))}
      {[-0.34, 0.34].map((bucket, index) => (
        <group key={bucket} position={[x + bucket, base + 0.24, centre + 11.85 - index * 0.3]}>
          <mesh material={index ? metalMat : clayPotMats[1]} castShadow><cylinderGeometry args={[0.16, 0.13, 0.42, 10]} /></mesh>
          <mesh position={[0, 0.24, 0]} rotation={[Math.PI / 2, 0, 0]} material={metalMat}><torusGeometry args={[0.14, 0.012, 6, 14, Math.PI]} /></mesh>
        </group>
      ))}
      <CylBetween from={[x + 0.48, base + 0.05, centre + 11.55]} to={[x + 0.4, base + 1.75, centre + 11.35]} radius={0.018} mat={darkWoodMat} />
      <PaintedBox position={[x + 0.48, base + 0.17, centre + 11.55]} scale={[0.34, 0.18, 0.13]} color="#8d7654" rotation={[0, 0.1, -0.08]} />
      {/* The alley light has a real wall plate, arm, enamel shade and bulb;
          its illumination no longer reads as an unsupported glow in space. */}
      <PaintedBox position={[x + 0.59, base + 2.5, centre + 11.5]} scale={[0.06, 0.28, 0.22]} material={darkWoodMat} />
      <CylBetween
        from={[x + 0.56, base + 2.56, centre + 11.5]}
        to={[x + 0.24, base + 2.56, centre + 11.5]}
        radius={0.025}
        mat={metalMat}
      />
      <mesh position={[x + 0.22, base + 2.46, centre + 11.5]} material={metalMat} castShadow>
        <coneGeometry args={[0.19, 0.12, 14, 1, true]} />
      </mesh>
      <mesh position={[x + 0.22, base + 2.39, centre + 11.5]} material={warmWindowMat}>
        <sphereGeometry args={[0.055, 10, 7]} />
      </mesh>
      <pointLight position={[x + 0.22, base + 2.37, centre + 11.5]} color="#ffd6a0" intensity={0.38} distance={4.2} decay={2} />
    </group>
  );
}

function HillStairLane() {
  const stairX = -12.4;
  const baseY = streetHeight(stairX);
  const startZ = streetCenterZ(stairX) - 4.7;
  const stepDepth = 0.9;
  return (
    <group name="walkable-hill-stairs">
      {Array.from({ length: 12 }, (_, index) => {
        const z = startZ - index * stepDepth;
        return (
          <group key={index}>
            <PaintedBox
              position={[stairX, baseY + index * 0.18 - 0.09, z]}
              scale={[2.5, 0.18, stepDepth + 0.03]}
              material={index % 2 ? walkMat : stoneMat}
            />
            <PaintedBox position={[stairX, baseY + index * 0.18 + 0.015, z + 0.42]} scale={[2.5, 0.03, 0.12]} color="#8f8d85" />
          </group>
        );
      })}
      {/* Mossy retaining walls and a continuous handrail make the branch human-scale. */}
      {[stairX - 1.63, stairX + 1.63].map((x, sideIndex) => (
        <group key={x}>
          <PaintedBox position={[x, baseY + 1.05, startZ - 5.15]} scale={[0.3, 2.25, 11.4]} color={sideIndex ? '#a7a394' : '#99998f'} />
          {Array.from({ length: 10 }, (_, moss) => (
            <mesh key={moss} position={[x + (sideIndex ? -0.18 : 0.18), baseY + 0.28 + moss * 0.17, startZ + 0.2 - moss * 1.05]} material={moss % 2 ? leafMat : leafDarkMat}>
              <dodecahedronGeometry args={[0.2 + (moss % 3) * 0.04, 0]} />
            </mesh>
          ))}
          <CylBetween from={[x + (sideIndex ? -0.24 : 0.24), baseY + 0.9, startZ + 0.3]} to={[x + (sideIndex ? -0.24 : 0.24), baseY + 2.9, startZ - 10.4]} radius={0.035} />
          {Array.from({ length: 6 }, (_, railPost) => {
            const amount = railPost / 5;
            const postZ = startZ + 0.3 - amount * 10.7;
            const stepTop = baseY + amount * 1.98 + 0.08;
            const railY = baseY + 0.9 + amount * 2;
            return (
              <CylBetween
                key={`rail-support-${railPost}`}
                from={[x + (sideIndex ? -0.24 : 0.24), stepTop, postZ]}
                to={[x + (sideIndex ? -0.24 : 0.24), railY, postZ]}
                radius={0.025}
                mat={metalMat}
              />
            );
          })}
        </group>
      ))}
      {/* Quiet courtyard gate at the top turns the view before the map edge. */}
      <PaintedBox position={[stairX - 0.95, baseY + 3.1, startZ - 10.65]} scale={[0.16, 2.2, 0.16]} material={darkWoodMat} />
      <PaintedBox position={[stairX + 0.95, baseY + 3.1, startZ - 10.65]} scale={[0.16, 2.2, 0.16]} material={darkWoodMat} />
      <PaintedBox position={[stairX, baseY + 4.13, startZ - 10.65]} scale={[2.35, 0.18, 0.26]} material={darkWoodMat} />
      <CanvasSign text="坂上 6" color="#81735f" position={[stairX, baseY + 4.18, startZ - 10.49]} size={[0.78, 0.2]} />
      {[-0.48, 0.48].map((leaf, sideIndex) => (
        <group key={`stair-gate-leaf-${leaf}`} position={[stairX + leaf, baseY + 3.02, startZ - 10.53]}>
          <PaintedBox position={[0, 0, 0]} scale={[0.84, 1.75, 0.08]} color={sideIndex ? '#6e6657' : '#766d5c'} />
          {[-0.28, -0.09, 0.1, 0.29].map((slat) => (
            <PaintedBox key={slat} position={[slat, 0, -0.055]} scale={[0.055, 1.58, 0.035]} material={darkWoodMat} />
          ))}
          <PaintedBox position={[sideIndex ? -0.31 : 0.31, 0.08, -0.09]} scale={[0.07, 0.07, 0.045]} material={metalMat} />
        </group>
      ))}
    </group>
  );
}

function ShrubsAndFlowers({ x, z, count = 5 }: { x: number; z: number; count?: number }) {
  return (
    <group position={[x, streetHeight(x), z]}>
      {Array.from({ length: count }, (_, index) => (
        <group key={index} position={[(index - (count - 1) / 2) * 0.42, 0, Math.sin(index * 2.3) * 0.14]}>
          <mesh position={[0, 0.28, 0]} material={index % 2 ? leafDarkMat : leafMat} castShadow>
            <dodecahedronGeometry args={[0.35 + (index % 3) * 0.05, 0]} />
          </mesh>
          <mesh position={[0.1, 0.58, 0.04]} material={flowerMat}><sphereGeometry args={[0.075, 7, 5]} /></mesh>
        </group>
      ))}
    </group>
  );
}

function StreetTreePit({ x, z, large = false }: { x: number; z: number; large?: boolean }) {
  const size = large ? 1.75 : 1.18;
  const edge = large ? 0.16 : 0.11;
  return (
    <group position={[x, streetHeight(x), z]} rotation={[0, roadYaw(x), 0]} name="street-tree-root-zone">
      <PaintedBox position={[0, -0.015, 0]} scale={[size, 0.055, size]} color="#766c57" cast={false} />
      {[-1, 1].map((side) => (
        <group key={`pit-edge-${side}`}>
          <PaintedBox position={[side * size / 2, 0.035, 0]} scale={[edge, 0.11, size + edge]} color="#b7b0a2" />
          <PaintedBox position={[0, 0.035, side * size / 2]} scale={[size - edge, 0.11, edge]} color="#b7b0a2" />
        </group>
      ))}
      {[-0.39, -0.2, 0.2, 0.39].map((bar, index) => (
        <PaintedBox key={bar} position={[bar * size, 0.024, 0]} scale={[0.026, 0.026, size * 0.72]} color={index % 2 ? '#62645f' : '#777873'} cast={false} />
      ))}
      {Array.from({ length: large ? 12 : 7 }, (_, index) => {
        const angle = index * 2.399;
        const radius = size * (0.34 + (index % 3) * 0.12);
        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * radius, 0.045, Math.sin(angle) * radius]}
            rotation={[-Math.PI / 2, 0, angle]}
            scale={[0.1 + (index % 2) * 0.035, 0.065, 0.018]}
            material={leafLitterMats[index % leafLitterMats.length]}
            receiveShadow
          >
            <circleGeometry args={[1, 5]} />
          </mesh>
        );
      })}
      {large && [-0.72, 0.72].map((postX) => (
        <group key={postX}>
          <CylBetween from={[postX, 0.02, 0]} to={[postX, 1.42, 0]} radius={0.025} mat={metalMat} />
          <CylBetween from={[postX, 1.24, 0]} to={[0, 1.02, 0]} radius={0.018} mat={metalMat} />
        </group>
      ))}
    </group>
  );
}

function WallVine({ x, z, side = 1, height = 2.4 }: { x: number; z: number; side?: -1 | 1; height?: number }) {
  return (
    <group position={[x, streetHeight(x), z]}>
      <CylBetween from={[0, 0.08, 0]} to={[0.18, height, 0]} radius={0.012} mat={leafDarkMat} />
      {Array.from({ length: 11 }, (_, index) => {
        const y = 0.24 + index * (height - 0.3) / 10;
        const sway = Math.sin(index * 1.7) * 0.18;
        return (
          <group key={index} position={[sway, y, -side * 0.03]} rotation={[0, index * 0.55, (index % 2 ? -1 : 1) * 0.22]}>
            <mesh material={index % 3 ? leafMat : leafDarkMat} castShadow scale={[0.17, 0.075, 0.12]}>
              <sphereGeometry args={[1, 8, 5]} />
            </mesh>
            {index % 4 === 0 && <mesh position={[0.08, 0.07, 0]} material={flowerMat}><sphereGeometry args={[0.04, 6, 4]} /></mesh>}
          </group>
        );
      })}
    </group>
  );
}

function DriftingLeaves() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const leaves = useMemo(() => Array.from({ length: 22 }, (_, index) => {
    const x = -39 + ((index * 17.37) % 78);
    return {
      x,
      z: streetCenterZ(x) + (index % 2 ? 3.8 : -3.9) + Math.sin(index * 2.1) * 0.9,
      phase: (index * 0.137) % 1,
      height: 2.4 + (index % 5) * 0.62,
      spin: 0.7 + (index % 4) * 0.22,
    };
  }), []);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const time = clock.elapsedTime;
    leaves.forEach((leaf, index) => {
      const cycle = (time * 0.055 * leaf.spin + leaf.phase) % 1;
      dummy.position.set(
        leaf.x + Math.sin(time * 0.42 + index) * 0.45,
        streetHeight(leaf.x) + 0.18 + leaf.height * (1 - cycle),
        leaf.z + Math.cos(time * 0.31 + index * 1.7) * 0.3,
      );
      dummy.rotation.set(time * leaf.spin + index, time * 0.55 + index * 0.4, Math.sin(time + index) * 0.8);
      const scale = 0.72 + (index % 4) * 0.1;
      dummy.scale.set(scale, scale * 0.58, scale);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, leaves.length]} castShadow={false} frustumCulled={false}>
      <circleGeometry args={[0.085, 5]} />
      <meshStandardMaterial color="#a18a58" roughness={1} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

function Mailbox({ x, z, ry = 0 }: { x: number; z: number; ry?: number }) {
  return (
    <group position={[x, streetHeight(x), z]} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.72, 0]} material={metalMat}><cylinderGeometry args={[0.035, 0.045, 1.44, 8]} /></mesh>
      <mesh position={[0, 0.04, 0]} material={metalMat}><cylinderGeometry args={[0.13, 0.17, 0.08, 10]} /></mesh>
      <PaintedBox position={[0, 1.36, 0]} scale={[0.48, 0.48, 0.3]} color="#b96e54" />
      <PaintedBox position={[0, 1.62, 0]} scale={[0.54, 0.08, 0.35]} color="#8d5d4b" />
      <PaintedBox position={[0, 1.33, -0.165]} scale={[0.39, 0.3, 0.025]} color="#a9634f" />
      <PaintedBox position={[0, 1.42, -0.16]} scale={[0.28, 0.045, 0.025]} color="#efe4cf" />
      <PaintedBox position={[0, 1.22, -0.185]} scale={[0.12, 0.035, 0.035]} material={metalMat} />
      <CylBetween from={[0.26, 1.42, 0]} to={[0.26, 1.79, 0]} radius={0.018} mat={metalMat} />
      <PaintedBox position={[0.35, 1.77, 0]} scale={[0.18, 0.12, 0.035]} color="#d7c28c" rotation={[0, 0, -0.08]} />
    </group>
  );
}

function LaundryLine({ x, z, ry }: { x: number; z: number; ry: number }) {
  const clothRefs = useRef<Array<THREE.Group | null>>([]);
  useFrame(({ clock }) => {
    clothRefs.current.forEach((cloth, index) => {
      if (!cloth) return;
      cloth.rotation.z = Math.sin(clock.elapsedTime * (1.15 + index * 0.08) + index * 1.7) * 0.035;
      cloth.rotation.x = Math.sin(clock.elapsedTime * 0.82 + index) * 0.018;
    });
  });
  return (
    <group position={[x, streetHeight(x) + 2.9, z]} rotation={[0, ry, 0]}>
      <CylBetween from={[-1.6, 0, 0]} to={[1.6, 0, 0]} radius={0.018} />
      {[-1.6, 1.6].map((end) => (
        <group key={`laundry-bracket-${end}`}>
          <PaintedBox position={[end, -0.35, 0.2]} scale={[0.13, 0.28, 0.07]} material={metalMat} />
          <CylBetween from={[end, -0.46, 0.17]} to={[end, 0, 0]} radius={0.025} mat={metalMat} />
        </group>
      ))}
      {[-1.08, -0.35, 0.42, 1.08].map((px, index) => {
        const height = 0.68 + (index % 2) * 0.14;
        const shirt = index === 1 || index === 2;
        return (
          <group
            key={px}
            ref={(node) => { clothRefs.current[index] = node; }}
            position={[px, -0.04 - height / 2, 0]}
          >
            <mesh material={laundryMats[index]} castShadow>
              <boxGeometry args={[shirt ? 0.38 : 0.48, height, 0.025]} />
            </mesh>
            {shirt && [-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.25, height * 0.26, 0]} rotation={[0, 0, side * -0.42]} material={laundryMats[index]} castShadow>
                <boxGeometry args={[0.24, 0.22, 0.025]} />
              </mesh>
            ))}
            {[-0.15, 0.15].map((pinX) => (
              <PaintedBox key={pinX} position={[pinX, height / 2 + 0.025, 0.005]} scale={[0.035, 0.09, 0.045]} color="#b28754" rotation={[0, 0, pinX * 0.4]} cast={false} />
            ))}
          </group>
        );
      })}
    </group>
  );
}

function Cat({ x, z }: { x: number; z: number }) {
  const tail = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const eyes = useRef<Array<THREE.Group | null>>([]);
  useFrame(({ clock }) => {
    if (tail.current) tail.current.rotation.z = -0.9 + Math.sin(clock.elapsedTime * 1.35) * 0.18;
    if (head.current) head.current.rotation.y = Math.sin(clock.elapsedTime * 0.34) * 0.16;
    if (body.current) body.current.scale.y = 0.27 * (1 + Math.sin(clock.elapsedTime * 1.55) * 0.018);
    // Two quick blinks followed by a long open interval avoid the mechanical
    // regularity of a looping animation while keeping both eyes synchronized.
    const phase = clock.elapsedTime % 6.7;
    const blink = (start: number, duration: number) => (
      phase < start || phase > start + duration
        ? 1
        : 0.08 + Math.abs(((phase - start) / duration) * 2 - 1) * 0.92
    );
    const lid = Math.min(blink(0, 0.15), blink(0.27, 0.12));
    eyes.current.forEach((eye) => { if (eye) eye.scale.y = lid; });
  });
  return (
    <group position={[x, streetHeight(x) + 0.18, z]} rotation={[0, -0.8, 0]}>
      <mesh ref={body} scale={[0.42, 0.27, 0.6]} material={darkWoodMat} castShadow><sphereGeometry args={[0.5, 12, 8]} /></mesh>
      {[-0.15, 0.15].flatMap((px) => [-0.18, 0.2].map((pz) => (
        <mesh key={`${px}-${pz}`} position={[px, -0.11, pz]} material={darkWoodMat} castShadow>
          <capsuleGeometry args={[0.055, 0.18, 4, 8]} />
        </mesh>
      )))}
      <group ref={head} position={[0, 0.18, -0.32]}>
        <mesh material={darkWoodMat} castShadow><sphereGeometry args={[0.22, 12, 8]} /></mesh>
        {[-0.1, 0.1].map((px) => (
          <group key={px} position={[px, 0.19, 0]} rotation={[0, 0, px * 2]}>
            <mesh material={darkWoodMat}><coneGeometry args={[0.09, 0.2, 4]} /></mesh>
            <mesh position={[0, -0.015, -0.025]} scale={0.54} material={flowerMat}><coneGeometry args={[0.09, 0.2, 4]} /></mesh>
          </group>
        ))}
        {[-0.078, 0.078].map((px) => (
          <group
            key={`eye-${px}`}
            ref={(node) => { eyes.current[px < 0 ? 0 : 1] = node; }}
            position={[px, 0.035, -0.202]}
          >
            <mesh material={warmWindowMat}><sphereGeometry args={[0.029, 8, 5]} /></mesh>
            <mesh position={[0, 0, -0.026]} material={metalMat} scale={[0.3, 0.9, 0.35]}><sphereGeometry args={[0.025, 6, 4]} /></mesh>
          </group>
        ))}
        <mesh position={[0, -0.025, -0.218]} material={flowerMat}><sphereGeometry args={[0.027, 7, 5]} /></mesh>
        {[-1, 1].flatMap((side) => [-0.035, 0.025].map((yOffset) => (
          <CylBetween
            key={`${side}-${yOffset}`}
            from={[side * 0.03, yOffset, -0.205]}
            to={[side * 0.27, yOffset + 0.025, -0.245]}
            radius={0.004}
            mat={curbMat}
          />
        )))}
      </group>
      <mesh ref={tail} position={[0.28, 0.12, 0.28]} rotation={[0.1, 0, -1]} material={darkWoodMat}><torusGeometry args={[0.3, 0.045, 6, 16, Math.PI * 1.25]} /></mesh>
    </group>
  );
}

function CatFeedingCorner({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, streetHeight(x), z]} rotation={[0, roadYaw(x) + 0.08, 0]} name="street-cat-feeding-corner">
      <PaintedBox position={[0, 0.012, 0]} scale={[0.92, 0.024, 0.58]} color="#9a8b72" cast={false} />
      {[-0.22, 0.22].map((bowlX, bowl) => (
        <group key={bowlX} position={[bowlX, 0.075, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.15, 0.11, 0.1, 12]} />
            <meshStandardMaterial color={bowl ? '#7f9694' : '#a97b62'} roughness={0.72} metalness={bowl ? 0.22 : 0.04} />
          </mesh>
          <mesh position={[0, 0.058, 0]} rotation={[Math.PI / 2, 0, 0]} material={metalMat}>
            <torusGeometry args={[0.13, 0.014, 6, 16]} />
          </mesh>
          {bowl === 0 && [-0.055, 0, 0.055].map((piece, index) => (
            <mesh key={piece} position={[piece, 0.07, (index % 2 ? -1 : 1) * 0.025]} material={bottleAmberMat}>
              <sphereGeometry args={[0.027, 6, 4]} />
            </mesh>
          ))}
          {bowl === 1 && (
            <mesh position={[0, 0.069, 0]} rotation={[-Math.PI / 2, 0, 0]} material={bowlWaterMat} renderOrder={1}>
              <circleGeometry args={[0.105, 18]} />
            </mesh>
          )}
        </group>
      ))}
      <PaintedBox position={[0.56, 0.18, 0.06]} scale={[0.22, 0.34, 0.12]} color="#d1c3a6" rotation={[0, -0.06, 0.04]} />
      <PaintedBox position={[0.56, 0.2, -0.008]} scale={[0.13, 0.035, 0.015]} color="#786b58" rotation={[0, -0.06, 0.04]} cast={false} />
    </group>
  );
}

function FlightCourtyard() {
  const x = -2.5;
  const z = streetCenterZ(x) + 9.25;
  const y = streetHeight(x);
  return (
    <group position={[x, y, z]} name="flying-chess-courtyard">
      {/* Mixed old stone and repaired concrete establish a real borrowed yard. */}
      <PaintedBox position={[0, 0.015, 0]} scale={[6.25, 0.08, 6.5]} color="#bdb6a6" cast={false} />
      {[-2.35, -0.8, 0.85, 2.3].map((px, index) => (
        <PaintedBox key={px} position={[px, 0.061, -2.55 + (index % 2) * 0.12]} scale={[1.15, 0.018, 0.62]} color={index % 2 ? '#d0c8b6' : '#c6beac'} cast={false} rotation={[0, (index - 1.5) * 0.025, 0]} />
      ))}
      {/* Low garden walls, cap stones and a timber gate frame the game without enclosing it. */}
      <PaintedBox position={[-3.22, 0.43, 0.8]} scale={[0.28, 0.82, 4.75]} material={stoneMat} />
      <PaintedBox position={[3.22, 0.43, 0.8]} scale={[0.28, 0.82, 4.75]} material={stoneMat} />
      <PaintedBox position={[0, 0.46, 3.18]} scale={[6.7, 0.88, 0.32]} material={stoneMat} />
      <PaintedBox position={[-3.22, 0.88, 0.8]} scale={[0.39, 0.12, 4.9]} color="#d4ccba" />
      <PaintedBox position={[3.22, 0.88, 0.8]} scale={[0.39, 0.12, 4.9]} color="#d4ccba" />
      <PaintedBox position={[0, 0.92, 3.18]} scale={[6.85, 0.12, 0.42]} color="#d4ccba" />
      {[-2.45, 2.45].map((post) => (
        <PaintedBox key={post} position={[post, 1.56, -3.02]} scale={[0.13, 2.9, 0.13]} material={darkWoodMat} />
      ))}
      <CylBetween from={[-2.45, 2.78, -3.02]} to={[2.45, 2.78, -3.02]} radius={0.025} mat={darkWoodMat} />
      {[-1.95, -1.3, -0.65, 0, 0.65, 1.3, 1.95].map((px, index) => (
        <PaintedBox key={px} position={[px, 2.52 - (index % 2) * 0.07, -3.01]} scale={[0.42, 0.42, 0.025]} color={FLIGHT_COLORS_LOCAL[index % 4]} rotation={[0, 0, (index % 2 ? -1 : 1) * 0.08]} cast={false} />
      ))}
      <CanvasSign text="树下飞行棋" color="#7c6a50" position={[2.52, 1.52, -2.92]} rotation={[0, 0, 0]} size={[1.18, 0.34]} />
      {/* A weatherproof visual rules plaque: four coloured routes converge on
          a die, so passers-by understand the activity before opening any UI. */}
      <PaintedBox position={[-0.62, 1.55, 2.98]} scale={[2.1, 1.12, 0.11]} material={darkWoodMat} />
      <PaintedBox position={[-0.62, 1.55, 2.91]} scale={[1.88, 0.9, 0.035]} color="#eee4cf" cast={false} />
      {FLIGHT_COLORS_LOCAL.map((color, index) => {
        const angle = index * Math.PI / 2;
        return (
          <group key={`yard-rule-${color}`} position={[-0.62, 1.55, 2.85]} rotation={[0, 0, -angle]}>
            <PaintedBox position={[0, 0.29, 0]} scale={[0.08, 0.34, 0.025]} color={color} cast={false} />
            <mesh position={[0, 0.42, -0.02]} material={flightTokenMats[index]} castShadow={false}>
              <coneGeometry args={[0.08, 0.16, 3]} />
            </mesh>
          </group>
        );
      })}
      <PaintedBox position={[-0.62, 1.55, 2.82]} scale={[0.27, 0.27, 0.08]} color="#fffaf0" cast={false} />
      {[[-0.69, 1.62], [-0.55, 1.48]].map(([px, py], index) => (
        <mesh key={`yard-die-pip-${index}`} position={[px, py, 2.765]} material={darkWoodMat} castShadow={false}>
          <sphereGeometry args={[0.027, 7, 5]} />
        </mesh>
      ))}
      {/* The board has a real rain plan: a rolled waxed cover hangs above the
          back wall with two straps and can be pulled over the low table. */}
      <CylBetween from={[-2.3, 2.45, 2.86]} to={[1.02, 2.45, 2.86]} radius={0.11} mat={flightCoverMat} />
      {[-1.85, 0.55].map((strap) => (
        <mesh key={`yard-cover-strap-${strap}`} position={[strap, 2.45, 2.86]} rotation={[0, 0, Math.PI / 2]} material={darkWoodMat}>
          <torusGeometry args={[0.12, 0.018, 6, 14]} />
        </mesh>
      ))}
      <CylBetween from={[1.02, 2.45, 2.86]} to={[1.02, 1.72, 2.86]} radius={0.012} mat={darkWoodMat} />
      <mesh position={[1.02, 1.67, 2.86]} material={darkWoodMat}><sphereGeometry args={[0.045, 8, 6]} /></mesh>
      {/* Everyday storage: chalk box, folded mat and watering can stay off the play area. */}
      <PaintedBox position={[-2.65, 0.25, 2.5]} scale={[0.72, 0.42, 0.55]} material={darkWoodMat} />
      <PaintedBox position={[-2.65, 0.49, 2.5]} scale={[0.76, 0.08, 0.59]} color="#927f62" />
      <mesh position={[2.55, 0.3, 2.35]} material={metalMat} castShadow><cylinderGeometry args={[0.2, 0.25, 0.45, 10]} /></mesh>
      <CylBetween from={[2.68, 0.42, 2.32]} to={[2.98, 0.52, 2.08]} radius={0.045} mat={metalMat} />
    </group>
  );
}

const FLIGHT_COLORS_LOCAL = ['#b75d61', '#638ea4', '#d0a952', '#70906d'];
const flightTokenMats = FLIGHT_COLORS_LOCAL.map((color) => material(color, 0.82));
const flightCoverMat = material('#899688', 0.96);

function VistaClosure({ east }: { east: boolean }) {
  const x = east ? CITY_BOUNDS.maxX + 6 : CITY_BOUNDS.minX - 6;
  const z = streetCenterZ(east ? CITY_BOUNDS.maxX : CITY_BOUNDS.minX) + (east ? 3.8 : -3.8);
  return (
    <group position={[x, streetHeight(east ? 42 : -42), z]} rotation={[0, east ? -0.72 : 0.72, 0]}>
      <PaintedBox position={[0, 3.8, 0]} scale={[9.2, 7.6, 6.2]} color={east ? '#d8d2c5' : '#e8dfd0'} />
      <GabledRoof w={9.2} d={6.2} h={7.6} />
      {[-2.8, -0.95, 0.95, 2.8].map((windowX) => <PaintedBox key={windowX} position={[windowX, 4.1, -3.13]} scale={[1.15, 1.2, 0.1]} material={windowMat} />)}
    </group>
  );
}

export default function CozyResidentialStreet() {
  return (
    <group name="tsukishio-musubizaka-rebuild">
      <DistantNeighborhood />
      <DriftingLeaves />
      <RoadRibbon />
      <RoadMicroDetails />
      <RainWaterDetails />
      <SidewalkAgeDetails />
      <TactilePaving x={-12.4} side={-1} width={1.85} />
      <TactilePaving x={-2.5} side={1} width={1.45} />
      <TactilePaving x={19.8} side={1} width={1.2} />
      <ServiceAlley />
      <HillStairLane />
      <FlightCourtyard />
      <VistaClosure east={false} />
      <VistaClosure east />

      {/* Lived-in thresholds stop the façades from meeting the pavement like a stage set. */}
      <ThresholdStory x={-32.8} side={-1} number="12-3" />
      <ThresholdStory x={23.1} side={-1} number="24-1" variant={1} />
      <ThresholdStory x={4.2} side={1} number="7-2" variant={2} />
      <ThresholdStory x={36.3} side={1} number="31-4" variant={3} />
      <DeliveryScooter x={16.8} side={-1} />
      <GasCylinderRack x={26.1} side={-1} />
      <NeighborhoodSafetyBox x={-28.9} side={1} />
      <ShopDoorClutter x={-18.1} side={-1} variant={0} />
      <ShopDoorClutter x={-9.1} side={1} variant={1} />
      <ShopDoorClutter x={32.3} side={-1} variant={2} />

      {/* Every canopy meets a constructed root zone with soil, grate, leaf litter and edging. */}
      <StreetTreePit x={-40} z={streetCenterZ(-40) - 4.55} />
      <StreetTreePit x={-31} z={streetCenterZ(-31) + 4.6} />
      <StreetTreePit x={-20.5} z={streetCenterZ(-20.5) - 4.55} />
      <StreetTreePit x={-12.3} z={streetCenterZ(-12.3) + 4.7} />
      <StreetTreePit x={-2.7} z={streetCenterZ(-2.5) + 12.5} large />
      <StreetTreePit x={7.4} z={streetCenterZ(7.4) + 4.55} />
      <StreetTreePit x={18.5} z={streetCenterZ(18.5) - 4.55} />
      <StreetTreePit x={30.5} z={streetCenterZ(30.5) - 4.6} />
      <StreetTreePit x={40.5} z={streetCenterZ(40.5) + 4.5} />
      <WallVine x={-4.7} z={streetCenterZ(-2.5) + 12.38} height={2.05} />
      <WallVine x={-0.4} z={streetCenterZ(-2.5) + 12.38} height={2.35} />
      <WallVine x={-14.05} z={streetCenterZ(-12.4) - 6.8} side={-1} height={2.6} />

      {/* Layered greenery replaces the old city filler and softens every pause pocket. */}
      <ShrubsAndFlowers x={-34} z={streetCenterZ(-34) - 4.75} count={7} />
      <ShrubsAndFlowers x={-20} z={streetCenterZ(-20) + 4.72} count={6} />
      <ShrubsAndFlowers x={-7} z={streetCenterZ(-7) - 4.75} count={8} />
      <ShrubsAndFlowers x={-2.7} z={streetCenterZ(-2.7) + 12.2} count={9} />
      <ShrubsAndFlowers x={8} z={streetCenterZ(8) + 4.72} count={6} />
      <ShrubsAndFlowers x={19} z={streetCenterZ(19) - 4.75} count={8} />
      <ShrubsAndFlowers x={31} z={streetCenterZ(31) + 4.72} count={7} />
      <ShrubsAndFlowers x={40} z={streetCenterZ(40) - 4.7} count={6} />

      <Mailbox x={-36.5} z={streetCenterZ(-36.5) + 4.6} ry={Math.PI} />
      <Mailbox x={-14.5} z={streetCenterZ(-14.5) - 4.6} />
      <Mailbox x={11} z={streetCenterZ(11) + 4.6} ry={Math.PI} />
      <Mailbox x={33} z={streetCenterZ(33) - 4.6} />
      <LaundryLine x={16} z={streetCenterZ(16) - 7.0} ry={-0.12} />
      <LaundryLine x={-31} z={streetCenterZ(-31) + 7.1} ry={Math.PI + 0.08} />
      <Cat x={2.5} z={streetCenterZ(2.5) + 4.4} />
      <CatFeedingCorner x={3.15} z={streetCenterZ(3.15) + 4.25} />

      {/* Shop warmth comes from recessed windows and the eleven supported,
          day/night-aware c_wall_light fixtures in the shared layout. */}
    </group>
  );
}

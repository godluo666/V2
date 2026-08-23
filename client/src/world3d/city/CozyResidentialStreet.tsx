import { useMemo } from 'react';
import * as THREE from 'three';
import {
  BUILDINGS, CITY_BOUNDS, streetCenterZ, streetHeight, type CityBuilding,
} from '@nexuspark/shared';

type P3 = [number, number, number];

const C = {
  road: '#656862', cream: '#eee7d8', warmWhite: '#f5eddf', grey: '#c7c5bc',
  wood: '#86664c', darkWood: '#59483a', sage: '#87977d', leaf: '#65805f',
  leafDark: '#4e6b4e', flower: '#e4b493', blueShadow: '#8a8fa8', glass: '#8ca6a8',
  orange: '#d49353', roof: '#686866', ink: '#4d4d49', linen: '#e8ded2', stone: '#aaa89d',
};

const material = (color: string, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });
const roadMat = material(C.road, 0.98);
const walkMat = material('#d5d0c5');
const curbMat = material('#aaa89f');
const darkWoodMat = material(C.darkWood);
const leafMat = material(C.leaf);
const leafDarkMat = material(C.leafDark);
const flowerMat = material(C.flower);
const metalMat = material('#686b69', 0.7);
const stoneMat = material(C.stone, 1);
const windowMat = new THREE.MeshStandardMaterial({ color: C.glass, roughness: 0.34, metalness: 0.04 });
const warmWindowMat = new THREE.MeshStandardMaterial({
  color: '#f1ca82', emissive: '#d98d45', emissiveIntensity: 0.22, roughness: 0.58,
});

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

function StreetHouse({ building, index }: { building: CityBuilding; index: number }) {
  const side: -1 | 1 = building.z < streetCenterZ(building.x) ? -1 : 1;
  const facadeZ = -side * building.d / 2;
  const faceRy = side < 0 ? 0 : Math.PI;
  const shop = building.groundUse && building.groundUse !== 'residence';
  const venue = building.venue != null;
  const tone = TONES[index % TONES.length];
  const floors = building.h > 7 ? 3 : 2;
  const sign = building.sign;
  const doorwayX = venue ? 0 : building.x % 2 > 0 ? building.w * 0.26 : -building.w * 0.26;

  return (
    <group position={[building.x, streetHeight(building.x), building.z]} rotation={[0, building.ry ?? 0, 0]}>
      <PaintedBox position={[0, building.h / 2, 0]} scale={[building.w, building.h, building.d]} color={tone} />
      <PaintedBox position={[0, 0.18, facadeZ]} scale={[building.w + 0.08, 0.36, 0.22]} material={darkWoodMat} />
      <GabledRoof w={building.w} d={building.d} h={building.h} />

      {/* Recessed entrance, stone threshold and small canopy form a real pause pocket. */}
      <PaintedBox position={[doorwayX, 1.05, facadeZ - side * 0.07]} scale={[venue ? 1.15 : 0.82, 2.08, 0.14]} material={darkWoodMat} />
      <PaintedBox position={[doorwayX, 1.08, facadeZ - side * 0.16]} scale={[venue ? 0.82 : 0.55, 1.72, 0.045]} material={venue ? warmWindowMat : material('#ad9479')} />
      <PaintedBox position={[doorwayX, 0.11, facadeZ - side * 0.44]} scale={[venue ? 1.7 : 1.35, 0.2, 0.72]} color="#beb3a1" />
      <PaintedBox position={[doorwayX, 2.23, facadeZ - side * 0.42]} scale={[venue ? 2.0 : 1.35, 0.14, 0.78]} color={venue ? C.orange : C.sage} />

      {(shop || venue) && (
        <>
          <PaintedBox
            position={[doorwayX > 0 ? -building.w * 0.22 : building.w * 0.22, 1.25, facadeZ - side * 0.06]}
            scale={[building.w * 0.42, 1.65, 0.12]}
            material={windowMat}
          />
          {sign && (
            <CanvasSign
              text={sign.text}
              color={sign.color}
              position={[0, 2.76, facadeZ - side * 0.18]}
              rotation={[0, faceRy, 0]}
              size={[Math.min(2.7, building.w * 0.72), 0.5]}
            />
          )}
        </>
      )}

      {/* Windows, deep frames and balconies break the old flat-box façade. */}
      {Array.from({ length: floors - 1 }, (_, floor) => floor + 1).flatMap((floor) => [-0.27, 0.27].map((offset, windowIndex) => {
        const x = building.w * offset;
        const y = floor * 2.48 + 1.13;
        return (
          <group key={`${floor}-${windowIndex}`} position={[x, y, facadeZ - side * 0.08]}>
            <PaintedBox position={[0, 0, 0]} scale={[Math.min(1.15, building.w * 0.28), 1.05, 0.11]} material={(index + floor + windowIndex) % 4 === 0 ? warmWindowMat : windowMat} />
            <PaintedBox position={[0, -0.65, -side * 0.23]} scale={[Math.min(1.5, building.w * 0.34), 0.1, 0.48]} material={metalMat} />
            {[-0.46, 0.46].map((railX) => (
              <CylBetween key={railX} from={[railX, -0.58, -side * 0.46]} to={[railX, -0.1, -side * 0.46]} radius={0.015} />
            ))}
          </group>
        );
      }))}

      {/* Wall-mounted AC, drainpipe, service meter and climbing vine. */}
      <group position={[building.w * 0.36, floors === 3 ? 4.25 : 3.7, facadeZ - side * 0.27]}>
        <PaintedBox position={[0, 0, 0]} scale={[0.7, 0.5, 0.32]} color="#b9bab3" />
        <mesh position={[0, 0, -side * 0.18]} rotation={[Math.PI / 2, 0, 0]} material={metalMat}>
          <torusGeometry args={[0.17, 0.022, 6, 16]} />
        </mesh>
      </group>
      <CylBetween
        from={[-building.w * 0.43, 0.18, facadeZ - side * 0.2]}
        to={[-building.w * 0.43, building.h - 0.35, facadeZ - side * 0.2]}
        radius={0.035}
      />
      {(building.groundUse === 'residence' || building.groundUse === 'florist') && Array.from({ length: 9 }, (_, vine) => (
        <mesh
          key={vine}
          position={[-building.w / 2 + 0.18 + (vine % 2) * 0.16, 0.48 + vine * 0.43, facadeZ - side * 0.2]}
          material={vine % 2 ? leafMat : leafDarkMat}
          castShadow
        >
          <sphereGeometry args={[0.18 + (vine % 3) * 0.035, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}

function RoadRibbon() {
  const points = [-24, -20, -16, -12, -8, -4, 0, 4, 8, 12, 16, 20, 24];
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
            <PaintedBox position={[0, -0.055, 0]} scale={[horizontal + 0.18, 0.11, 4.2]} material={roadMat} />
            {[-1, 1].map((side) => (
              <group key={side} position={[0, 0.025, side * 2.58]}>
                <PaintedBox position={[0, 0, 0]} scale={[horizontal + 0.2, 0.13, 0.92]} material={walkMat} />
                <PaintedBox position={[0, 0.05, -side * 0.5]} scale={[horizontal + 0.18, 0.17, 0.1]} material={curbMat} />
                <PaintedBox position={[0, 0.085, side * 0.49]} scale={[horizontal + 0.18, 0.035, 0.18]} color="#777b74" />
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

function HillStairLane() {
  const baseY = streetHeight(-6.2);
  const stepDepth = 0.9;
  return (
    <group name="walkable-hill-stairs">
      {Array.from({ length: 9 }, (_, index) => {
        const z = -3.7 - index * stepDepth;
        return (
          <group key={index}>
            <PaintedBox
              position={[-6.2, baseY + index * 0.16 - 0.055, z]}
              scale={[2.05, 0.16, stepDepth + 0.03]}
              material={index % 2 ? walkMat : stoneMat}
            />
            <PaintedBox position={[-6.2, baseY + index * 0.16 + 0.035, z + 0.42]} scale={[2.05, 0.1, 0.12]} color="#8f8d85" />
          </group>
        );
      })}
      {/* Mossy retaining walls and a continuous handrail make the branch human-scale. */}
      {[-7.48, -4.92].map((x, sideIndex) => (
        <group key={x}>
          <PaintedBox position={[x, baseY + 0.72, -7.3]} scale={[0.3, 1.55, 8.6]} color={sideIndex ? '#a7a394' : '#99998f'} />
          {Array.from({ length: 7 }, (_, moss) => (
            <mesh key={moss} position={[x + (sideIndex ? -0.18 : 0.18), baseY + 0.28 + moss * 0.18, -4.1 - moss * 0.95]} material={moss % 2 ? leafMat : leafDarkMat}>
              <dodecahedronGeometry args={[0.2 + (moss % 3) * 0.04, 0]} />
            </mesh>
          ))}
          <CylBetween from={[x + (sideIndex ? -0.24 : 0.24), baseY + 0.9, -3.3]} to={[x + (sideIndex ? -0.24 : 0.24), baseY + 2.2, -11.0]} radius={0.035} />
        </group>
      ))}
      {/* Quiet courtyard gate at the top turns the view before the map edge. */}
      <PaintedBox position={[-7.05, baseY + 2.45, -11.25]} scale={[0.16, 2.2, 0.16]} material={darkWoodMat} />
      <PaintedBox position={[-5.35, baseY + 2.45, -11.25]} scale={[0.16, 2.2, 0.16]} material={darkWoodMat} />
      <PaintedBox position={[-6.2, baseY + 3.48, -11.25]} scale={[2.15, 0.18, 0.26]} material={darkWoodMat} />
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

function Mailbox({ x, z, ry = 0 }: { x: number; z: number; ry?: number }) {
  return (
    <group position={[x, streetHeight(x), z]} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.72, 0]} material={metalMat}><cylinderGeometry args={[0.035, 0.045, 1.44, 8]} /></mesh>
      <PaintedBox position={[0, 1.36, 0]} scale={[0.48, 0.48, 0.3]} color="#b96e54" />
      <PaintedBox position={[0, 1.42, -0.16]} scale={[0.28, 0.045, 0.025]} color="#efe4cf" />
    </group>
  );
}

function LaundryLine({ x, z, ry }: { x: number; z: number; ry: number }) {
  return (
    <group position={[x, streetHeight(x) + 2.9, z]} rotation={[0, ry, 0]}>
      <CylBetween from={[-1.6, 0, 0]} to={[1.6, 0, 0]} radius={0.018} />
      {[-1.08, -0.35, 0.42, 1.08].map((px, index) => (
        <PaintedBox key={px} position={[px, -0.38 - (index % 2) * 0.08, 0]} scale={[0.48, 0.68 + (index % 2) * 0.14, 0.025]} color={[C.linen, '#b7c2b1', '#d6b3a5', '#c4c7cd'][index]} cast={false} />
      ))}
    </group>
  );
}

function Cat({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, streetHeight(x) + 0.18, z]} rotation={[0, -0.8, 0]}>
      <mesh scale={[0.42, 0.27, 0.6]} material={darkWoodMat} castShadow><sphereGeometry args={[0.5, 12, 8]} /></mesh>
      <mesh position={[0, 0.18, -0.32]} material={darkWoodMat} castShadow><sphereGeometry args={[0.22, 10, 7]} /></mesh>
      {[-0.1, 0.1].map((px) => <mesh key={px} position={[px, 0.37, -0.32]} rotation={[0, 0, px * 2]} material={darkWoodMat}><coneGeometry args={[0.09, 0.2, 4]} /></mesh>)}
      <mesh position={[0.28, 0.12, 0.28]} rotation={[0.1, 0, -1]} material={darkWoodMat}><torusGeometry args={[0.3, 0.045, 6, 16, Math.PI * 1.25]} /></mesh>
    </group>
  );
}

function VistaClosure({ east }: { east: boolean }) {
  const x = east ? CITY_BOUNDS.maxX + 3.2 : CITY_BOUNDS.minX - 3.2;
  const z = streetCenterZ(east ? CITY_BOUNDS.maxX : CITY_BOUNDS.minX) + (east ? 2.2 : -2.2);
  return (
    <group position={[x, streetHeight(east ? 24 : -24), z]} rotation={[0, east ? -0.72 : 0.72, 0]}>
      <PaintedBox position={[0, 3.0, 0]} scale={[7.2, 6.0, 4.8]} color={east ? '#d8d2c5' : '#e8dfd0'} />
      <GabledRoof w={7.2} d={4.8} h={6.0} />
      {[-1.8, 0, 1.8].map((windowX) => <PaintedBox key={windowX} position={[windowX, 3.35, -2.43]} scale={[1.0, 1.05, 0.1]} material={windowMat} />)}
    </group>
  );
}

export default function CozyResidentialStreet() {
  return (
    <group name="tsukishio-musubizaka-rebuild">
      <RoadRibbon />
      <HillStairLane />
      {BUILDINGS.map((building, index) => <StreetHouse key={`${building.x}-${building.z}`} building={building} index={index} />)}
      <VistaClosure east={false} />
      <VistaClosure east />

      {/* Layered greenery replaces the old city filler and softens every pause pocket. */}
      <ShrubsAndFlowers x={-12.2} z={streetCenterZ(-12.2) - 3.35} count={6} />
      <ShrubsAndFlowers x={2.2} z={streetCenterZ(2.2) + 3.35} count={5} />
      <ShrubsAndFlowers x={12.7} z={streetCenterZ(12.7) - 3.28} count={7} />
      <ShrubsAndFlowers x={-4.2} z={8.0} count={8} />
      <ShrubsAndFlowers x={19.8} z={streetCenterZ(19.8) + 3.25} count={5} />

      <Mailbox x={-18.2} z={streetCenterZ(-18.2) + 3.25} ry={Math.PI} />
      <Mailbox x={10.8} z={streetCenterZ(10.8) - 3.25} />
      <LaundryLine x={14.0} z={streetCenterZ(14) - 4.6} ry={-0.08} />
      <Cat x={1.1} z={streetCenterZ(1.1) + 3.15} />

      {/* Cream-orange late-afternoon shop pools; no theatrical red sunset. */}
      <pointLight position={[-16.2, streetHeight(-16.2) + 3.1, streetCenterZ(-16.2) - 3.4]} color="#ffd6a0" intensity={1.0} distance={6.5} decay={2} />
      <pointLight position={[3.2, streetHeight(3.2) + 3.0, streetCenterZ(3.2) - 3.35]} color="#ffd5a0" intensity={0.9} distance={6} decay={2} />
      <pointLight position={[14.2, streetHeight(14.2) + 3.0, streetCenterZ(14.2) - 3.3]} color="#ffd6a0" intensity={0.75} distance={5.5} decay={2} />
    </group>
  );
}

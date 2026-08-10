/**
 * Aurora Grand Screen Hall — physical architecture for the 34 x 30 metre
 * cinema layout.  Media playback remains owned by MediaScreen; this module
 * supplies the structure around it and never creates a second player.
 *
 * Coordinate contract:
 *   bounds       x [-17, 17], z [-15, 15]
 *   screen       centre [0, 6.8, -14.35], visible size 24 x 10 m
 *   rear / entry z ~= 13 / 15
 *   ceiling      y ~= 13.5
 */
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CINEMA_SPATIAL_CONTRACT } from '@nexuspark/shared';
import { surfaceMaterial, type SurfaceKind } from '../city/materials';

type P3 = [number, number, number];

/** Backward-compatible art export; gameplay and architecture now share one
 * authoritative coordinate contract. */
export const CINEMA_HALL_METRICS = CINEMA_SPATIAL_CONTRACT;

function tinted(kind: SurfaceKind, color: string, micro = true) {
  const material = surfaceMaterial(kind, false, micro);
  material.color.set(color);
  return material;
}

// The auditorium stays dark, but no structural material starts at digital
// black. These values were calibrated against the cloud SwiftShader captures,
// where the earlier #10-#24 albedos erased roughness and edge response.
const concrete = tinted('oldConcrete', '#3c3941');
const paintedSteel = tinted('metal', '#3a3f49');
const brushedSteel = tinted('brushedMetal', '#8a8790');
const blackSteel = tinted('metal', '#1e222b');
const darkGlass = tinted('darkGlass', '#263341');
const wallFabric = tinted('acousticFabric', '#443440');
const burgundyFabric = tinted('acousticFabric', '#702c43');
const curtainVelvet = tinted('seatFabric', '#7b203d');
const cinemaCarpet = tinted('cinemaCarpet', '#38242f');
const stageCarpet = tinted('cinemaCarpet', '#59283d');
const walnut = tinted('wood', '#6b493b');
const speakerCone = tinted('seatFabric', '#302b34');
const speakerDustCap = tinted('darkGlass', '#06070a');

// Indoor metallic surfaces have no environment map to reflect. Keep painted
// housings partially dielectric so their broad faces retain diffuse form in
// SwiftShader instead of collapsing to black between specular highlights.
paintedSteel.metalness = 0.34;
paintedSteel.roughness = 0.64;
blackSteel.metalness = 0.38;
blackSteel.roughness = 0.66;
brushedSteel.metalness = 0.58;
brushedSteel.roughness = 0.46;

const guideOn = new THREE.MeshStandardMaterial({
  color: '#ffd2a0', emissive: '#ff7a42', emissiveIntensity: 1.5,
  roughness: 0.38, metalness: 0.14,
});
const guideOff = new THREE.MeshStandardMaterial({
  color: '#5b3c35', emissive: '#3a1415', emissiveIntensity: 0.08,
  roughness: 0.7, metalness: 0.1,
});
const exitOn = new THREE.MeshStandardMaterial({
  color: '#bfe9cc', emissive: '#48d878', emissiveIntensity: 1.15,
  roughness: 0.42, metalness: 0.06,
});
const exitOff = new THREE.MeshStandardMaterial({
  color: '#405649', emissive: '#16351f', emissiveIntensity: 0.12,
  roughness: 0.7,
});

/** Bevelled solid used for panels and upholstery; unlike a Plane it exposes
 * a side wall and catches a readable highlight around every edge. */
function bevelledSolid(w: number, h: number, d: number, cut: number, bevel = 0.025) {
  const hw = w / 2;
  const hh = h / 2;
  const c = Math.min(cut, hw * 0.42, hh * 0.42);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + c, -hh);
  shape.lineTo(hw - c, -hh);
  shape.lineTo(hw, -hh + c);
  shape.lineTo(hw, hh - c);
  shape.lineTo(hw - c, hh);
  shape.lineTo(-hw + c, hh);
  shape.lineTo(-hw, hh - c);
  shape.lineTo(-hw, -hh + c);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
  });
  geometry.translate(0, 0, -d / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** Horizontal stage footprint with a bowed front apron. */
function stageGeometry(height: number, inset = 0) {
  const shape = new THREE.Shape();
  const half = 14.1 - inset;
  const rear = 14.7 - inset * 0.2; // shape-y becomes -world-z after rotation
  const sideFront = 11.8 - inset * 0.08;
  const centreFront = 10.7 - inset * 0.12;
  shape.moveTo(-half, rear);
  shape.lineTo(half, rear);
  shape.lineTo(half, sideFront);
  // Two segments make centreFront an actual point on the apron. A single
  // quadratic would only approach its control point, breaking floor-height
  // agreement at the centre aisle.
  shape.quadraticCurveTo(half * 0.48, centreFront, 0, centreFront);
  shape.quadraticCurveTo(-half * 0.48, centreFront, -half, sideFront);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.05,
    bevelThickness: 0.04,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

const acousticPanelGeometry = bevelledSolid(2.62, 4.65, 0.24, 0.16, 0.035);
const upperPanelGeometry = bevelledSolid(2.62, 1.48, 0.25, 0.13, 0.028);
const speakerCabinetGeometry = bevelledSolid(1.38, 1.82, 0.72, 0.11, 0.045);
const seatCushionGeometry = bevelledSolid(0.72, 0.15, 0.58, 0.075, 0.04);
const seatBackGeometry = bevelledSolid(0.74, 0.74, 0.17, 0.09, 0.035);
const seatHeadGeometry = bevelledSolid(0.54, 0.2, 0.08, 0.06, 0.025);
const seatRearInsertGeometry = bevelledSolid(0.58, 0.55, 0.055, 0.07, 0.018);
const mainStageGeometry = stageGeometry(0.58);
const lowerStageGeometry = stageGeometry(0.2, 2.4);

function transformGeometry(
  source: THREE.BufferGeometry,
  position: P3,
  rotation: P3 = [0, 0, 0],
  scale: P3 = [1, 1, 1],
) {
  let geometry = source.clone();
  if (geometry.index) {
    const expanded = geometry.toNonIndexed();
    geometry.dispose();
    geometry = expanded;
  }
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  ));
  return geometry;
}

function mergeParts(parts: Array<{
  geometry: THREE.BufferGeometry;
  position: P3;
  rotation?: P3;
  scale?: P3;
}>) {
  const geometries = parts.map((part) => transformGeometry(
    part.geometry,
    part.position,
    part.rotation,
    part.scale,
  ));
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error('Failed to merge premium cinema seat geometry');
  merged.computeBoundingSphere();
  return merged;
}

// One chair renders as four material layers instead of twenty independent
// meshes.  Every row reuses these buffers, keeping the close-up model detailed
// without multiplying draw calls by every bolt and cup holder.
const seatBox = new THREE.BoxGeometry(1, 1, 1);
const seatCylinder = new THREE.CylinderGeometry(1, 1, 1, 14);
const seatCapsule = new THREE.CapsuleGeometry(0.065, 0.38, 5, 10);
const seatCupRing = new THREE.TorusGeometry(0.075, 0.014, 8, 18);
const fixedBackTilt = -0.09;

const seatFabricGeometry = mergeParts([
  { geometry: seatCushionGeometry, position: [0, 0.48, 0.03] },
  { geometry: seatBackGeometry, position: [0, 0.85, -0.31], rotation: [fixedBackTilt, 0, 0] },
  { geometry: seatHeadGeometry, position: [0, 1.12, -0.136], rotation: [fixedBackTilt, 0, 0] },
  // A real rear upholstery insert sits proud of the painted back shell. It is
  // what the normal auditorium camera sees, leaving a solid metal perimeter.
  { geometry: seatRearInsertGeometry, position: [0, 0.85, -0.475], rotation: [fixedBackTilt, 0, 0] },
  { geometry: seatCapsule, position: [-0.43, 0.7, 0.02], rotation: [Math.PI / 2, 0, 0] },
  { geometry: seatCapsule, position: [0.43, 0.7, 0.02], rotation: [Math.PI / 2, 0, 0] },
]);
const seatMetalGeometry = mergeParts([
  { geometry: seatBox, position: [0, 0.035, -0.035], scale: [0.48, 0.07, 0.38] },
  { geometry: seatBox, position: [-0.19, 0.2, -0.03], scale: [0.095, 0.34, 0.13] },
  { geometry: seatBox, position: [0.19, 0.2, -0.03], scale: [0.095, 0.34, 0.13] },
  { geometry: seatBox, position: [0, 0.34, -0.04], scale: [0.56, 0.09, 0.16] },
  { geometry: seatBackGeometry, position: [0, 0.85, -0.365], rotation: [fixedBackTilt, 0, 0], scale: [1.08, 1.08, 1] },
  { geometry: seatBox, position: [-0.43, 0.46, -0.06], scale: [0.095, 0.56, 0.49] },
  { geometry: seatBox, position: [0.43, 0.46, -0.06], scale: [0.095, 0.56, 0.49] },
  { geometry: seatBox, position: [-0.43, 0.31, -0.3], scale: [0.08, 0.43, 0.12] },
  { geometry: seatBox, position: [0.43, 0.31, -0.3], scale: [0.08, 0.43, 0.12] },
]);
const seatTrimGeometry = mergeParts([
  { geometry: seatCylinder, position: [-0.19, 0.39, -0.03], rotation: [0, 0, Math.PI / 2], scale: [0.07, 0.11, 0.07] },
  { geometry: seatCylinder, position: [0.19, 0.39, -0.03], rotation: [0, 0, Math.PI / 2], scale: [0.07, 0.11, 0.07] },
  { geometry: seatCylinder, position: [-0.19, 0.035, -0.03], scale: [0.028, 0.076, 0.028] },
  { geometry: seatCylinder, position: [0.19, 0.035, -0.03], scale: [0.028, 0.076, 0.028] },
  { geometry: seatBox, position: [0, 0.455, 0.325], scale: [0.57, 0.035, 0.035] },
  { geometry: seatBox, position: [0, 0.692, -0.143], rotation: [fixedBackTilt, 0, 0], scale: [0.56, 0.028, 0.025] },
  { geometry: seatBox, position: [0, 0.855, -0.51], rotation: [fixedBackTilt, 0, 0], scale: [0.42, 0.026, 0.018] },
  { geometry: seatCupRing, position: [-0.43, 0.73, 0.185], rotation: [Math.PI / 2, 0, 0] },
  { geometry: seatCupRing, position: [0.43, 0.73, 0.185], rotation: [Math.PI / 2, 0, 0] },
  { geometry: seatCylinder, position: [0.482, 0.5, -0.1], rotation: [0, 0, Math.PI / 2], scale: [0.035, 0.018, 0.035] },
  { geometry: seatBox, position: [0.39, 0.54, -0.345], scale: [0.12, 0.085, 0.025] },
]);
const seatCupGeometry = mergeParts([
  { geometry: seatCylinder, position: [-0.43, 0.703, 0.185], scale: [0.054, 0.052, 0.054] },
  { geometry: seatCylinder, position: [0.43, 0.703, 0.185], scale: [0.054, 0.052, 0.054] },
]);

const subwooferX = [-9.5, -5.7, -1.9, 1.9, 5.7, 9.5];
const subDriverSource = new THREE.CylinderGeometry(0.19, 0.23, 0.06, 14);
const subPortSource = new THREE.CylinderGeometry(0.11, 0.11, 0.07, 12);
const subShellGeometry = mergeParts(subwooferX.map((x) => ({
  geometry: seatBox, position: [x, 1.02, -13.22] as P3, scale: [3.12, 0.76, 0.76] as P3,
})));
const subGrilleGeometry = mergeParts(subwooferX.map((x) => ({
  geometry: seatBox, position: [x, 1.02, -12.815] as P3, scale: [2.82, 0.54, 0.08] as P3,
})));
const subDriverGeometry = mergeParts(subwooferX.flatMap((x) => [-0.78, 0].map((offset) => ({
  geometry: subDriverSource,
  position: [x + offset, 1.02, -12.755] as P3,
  rotation: [Math.PI / 2, 0, 0] as P3,
}))));
const subPortGeometry = mergeParts(subwooferX.map((x) => ({
  geometry: subPortSource,
  position: [x + 0.88, 1.02, -12.75] as P3,
  rotation: [Math.PI / 2, 0, 0] as P3,
})));
const subWalnutBaseGeometry = mergeParts(subwooferX.filter((_, index) => index % 2 === 1).map((x) => ({
  geometry: seatBox, position: [x, 0.59, -13.22] as P3, scale: [2.35, 0.1, 0.58] as P3,
})));
const subSteelBaseGeometry = mergeParts(subwooferX.filter((_, index) => index % 2 === 0).map((x) => ({
  geometry: seatBox, position: [x, 0.59, -13.22] as P3, scale: [2.35, 0.1, 0.58] as P3,
})));

function SubwooferBank() {
  return (
    <group dispose={null}>
      <mesh geometry={subShellGeometry} material={blackSteel} castShadow receiveShadow />
      <mesh geometry={subGrilleGeometry} material={speakerCone} castShadow />
      <mesh geometry={subDriverGeometry} material={speakerDustCap} />
      <mesh geometry={subPortGeometry} material={speakerDustCap} />
      <mesh geometry={subWalnutBaseGeometry} material={walnut} castShadow />
      <mesh geometry={subSteelBaseGeometry} material={brushedSteel} castShadow />
    </group>
  );
}

function SpeakerCabinet({ position, scale = 1, yaw = 0 }: {
  position: P3;
  scale?: number;
  yaw?: number;
}) {
  return (
    <group position={position} rotation={[0, yaw, 0]} scale={scale}>
      <mesh geometry={speakerCabinetGeometry} material={paintedSteel} castShadow receiveShadow />
      <mesh position={[0, 0, 0.374]} material={blackSteel}>
        <boxGeometry args={[1.16, 1.56, 0.035]} />
      </mesh>
      {[-0.43, 0.43].map((y, i) => (
        <group key={y} position={[0, y, 0.41]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={speakerCone} castShadow>
            <cylinderGeometry args={[i ? 0.27 : 0.3, i ? 0.19 : 0.21, 0.085, 20, 1, false]} />
          </mesh>
          <mesh position={[0, 0, 0.052]} rotation={[Math.PI / 2, 0, 0]} material={speakerDustCap}>
            <cylinderGeometry args={[0.1, 0.13, 0.035, 18]} />
          </mesh>
        </group>
      ))}
      {[-0.59, 0.59].map((x) => [-0.79, 0.79].map((y) => (
        <mesh key={`${x}-${y}`} position={[x, y, 0.402]} material={brushedSteel}>
          <cylinderGeometry args={[0.022, 0.022, 0.018, 8]} />
        </mesh>
      )))}
    </group>
  );
}

function LineArray({ side }: { side: -1 | 1 }) {
  return (
    <group>
      {[2.35, 4.25, 6.15, 8.05, 9.95].map((y, index) => (
        <SpeakerCabinet
          key={y}
          position={[side * (14.3 + index * 0.055), y, -13.82 + index * 0.055]}
          yaw={side * (0.025 + index * 0.012)}
          scale={index === 4 ? 0.88 : 1}
        />
      ))}
      {/* Array suspension yoke and safety cable are physical, not floating boxes. */}
      <mesh position={[side * 14.35, 11.45, -13.9]} material={brushedSteel} castShadow>
        <boxGeometry args={[1.75, 0.16, 0.7]} />
      </mesh>
      {[-0.55, 0.55].map((offset) => (
        <mesh key={offset} position={[side * 14.35 + offset, 11.95, -13.9]} material={blackSteel}>
          <cylinderGeometry args={[0.025, 0.025, 1, 8]} />
        </mesh>
      ))}
      <SpeakerCabinet position={[side * 14.15, 1.05, -13.15]} scale={1.18} />
    </group>
  );
}

function ScreenProscenium({ lightsOn }: { lightsOn: boolean }) {
  const guide = lightsOn ? guideOn : guideOff;
  return (
    <group>
      {/* Deep rear pocket: the MediaScreen sits 0.25 m in front of this face. */}
      <mesh position={[0, 6.72, -14.74]} material={concrete} castShadow receiveShadow>
        <boxGeometry args={[29.9, 12.95, 0.55]} />
      </mesh>
      <mesh position={[0, 6.8, -14.59]} material={blackSteel} receiveShadow>
        <boxGeometry args={[25.15, 10.85, 0.42]} />
      </mesh>
      {/* Load-bearing proscenium and stepped inner reveal. */}
      {[-13.15, 13.15].map((x) => (
        <group key={x}>
          <mesh position={[x, 6.6, -14.14]} material={paintedSteel} castShadow receiveShadow>
            <boxGeometry args={[0.94, 12.1, 1.08]} />
          </mesh>
          <mesh position={[x < 0 ? x + 0.47 : x - 0.47, 6.8, -13.9]} material={brushedSteel} castShadow>
            <boxGeometry args={[0.16, 10.55, 0.38]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 12.66, -14.14]} material={paintedSteel} castShadow receiveShadow>
        <boxGeometry args={[27.25, 0.95, 1.08]} />
      </mesh>
      <mesh position={[0, 12.1, -13.9]} material={brushedSteel} castShadow>
        <boxGeometry args={[24.55, 0.16, 0.38]} />
      </mesh>
      <mesh position={[0, 1.5, -13.9]} material={brushedSteel} castShadow>
        <boxGeometry args={[24.55, 0.18, 0.4]} />
      </mesh>

      {/* Motor track, velvet returns and individually modelled curtain pleats. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 12.68, 11.92, -13.68]} material={brushedSteel} castShadow>
            <boxGeometry args={[1.24, 0.18, 0.46]} />
          </mesh>
          <mesh position={[side * 12.72, 6.78, -13.73]} material={curtainVelvet} castShadow receiveShadow>
            <boxGeometry args={[1.28, 10.16, 0.2]} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => (
            <mesh
              key={i}
              position={[side * (12.22 + i * 0.19), 6.78, -13.52 - (i % 2) * 0.045]}
              material={curtainVelvet}
              castShadow
            >
              <cylinderGeometry args={[0.105, 0.105, 10.08, 10]} />
            </mesh>
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <mesh key={`wheel-${i}`} position={[side * (12.28 + i * 0.22), 11.94, -13.48]} material={blackSteel}>
              <cylinderGeometry args={[0.045, 0.045, 0.055, 10]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Bowed stage and its lower step have substantial carpeted volume. */}
      <mesh geometry={mainStageGeometry} material={stageCarpet} castShadow receiveShadow />
      <mesh geometry={lowerStageGeometry} material={cinemaCarpet} castShadow receiveShadow />
      <mesh position={[0, 0.61, -11.35]} material={guide}>
        <boxGeometry args={[18.2, 0.055, 0.075]} />
      </mesh>
      <mesh position={[0, 0.215, -10.52]} material={guide}>
        <boxGeometry args={[12.8, 0.04, 0.07]} />
      </mesh>

      {/* The screen base is a real low-frequency array, not an empty black
          strip. Each cabinet has a deep shell, recessed grille, drivers and
          reflex port; its top remains below the 1.8m bottom of the image. */}
      <SubwooferBank />

      <LineArray side={-1} />
      <LineArray side={1} />
    </group>
  );
}

function AcousticWallBay({ side, z, index, lightsOn }: {
  side: -1 | 1;
  z: number;
  index: number;
  lightsOn: boolean;
}) {
  const panel = index % 3 === 1 ? burgundyFabric : wallFabric;
  return (
    <group position={[side * 16.54, 0, z]} rotation={[0, -side * Math.PI / 2, 0]}>
      <mesh position={[0, 4.05, 0.04]} geometry={acousticPanelGeometry} material={paintedSteel} castShadow receiveShadow />
      <mesh position={[0, 4.05, 0.205]} scale={[0.9, 0.92, 0.58]} geometry={acousticPanelGeometry} material={panel} castShadow receiveShadow />
      {/* Lower impact rail and real timber diffuser fins. */}
      <mesh position={[0, 1.25, 0.19]} material={walnut} castShadow>
        <boxGeometry args={[2.72, 0.34, 0.2]} />
      </mesh>
      {[-0.94, -0.56, -0.18, 0.2, 0.58, 0.96].map((x, fin) => (
        <mesh
          key={x}
          position={[x, 4.05 + ((fin + index) % 2) * 0.08, 0.39 + (fin % 3) * 0.018]}
          material={fin % 2 ? walnut : brushedSteel}
          castShadow
        >
          <boxGeometry args={[0.075, 3.95 - (fin % 3) * 0.18, 0.11]} />
        </mesh>
      ))}
      <mesh position={[0, 8.35, 0.05]} geometry={upperPanelGeometry} material={paintedSteel} castShadow receiveShadow />
      <mesh position={[0, 8.35, 0.205]} scale={[0.9, 0.76, 0.6]} geometry={upperPanelGeometry} material={panel} castShadow />

      {index % 2 === 0 && (
        <group position={[0, 6.92, 0.52]}>
          <mesh position={[0, 0, -0.14]} material={blackSteel} castShadow>
            <boxGeometry args={[0.42, 0.72, 0.28]} />
          </mesh>
          <mesh position={[0, 0, 0.025]} material={lightsOn ? guideOn : guideOff}>
            <boxGeometry args={[0.26, 0.5, 0.08]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function SideWallSystem({ lightsOn }: { lightsOn: boolean }) {
  // The final bay shifts rearward to create a genuine service niche around
  // the east-wall vending machine at z=10.8 instead of cutting through it.
  const bays = [-10.4, -7.15, -3.9, -0.65, 2.6, 5.85, 9.1, 13];
  return (
    <group>
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          {/* Structural inner leaf and service plinth make the side wall thick. */}
          <mesh position={[side * 16.72, 5.55, 0]} material={concrete} castShadow receiveShadow>
            <boxGeometry args={[0.42, 11.1, 29.4]} />
          </mesh>
          <mesh position={[side * 16.4, 0.62, 0]} material={paintedSteel} castShadow receiveShadow>
            <boxGeometry args={[0.3, 1.24, 28.9]} />
          </mesh>
          {bays.map((z, index) => (
            <AcousticWallBay key={z} side={side} z={z} index={index} lightsOn={lightsOn} />
          ))}
          {/* Corner bass trap and overhead cable tray. */}
          <mesh position={[side * 16.22, 5.3, -13.65]} rotation={[0, Math.PI / 4, 0]} material={burgundyFabric} castShadow>
            <boxGeometry args={[0.72, 9.6, 0.72]} />
          </mesh>
          <mesh position={[side * 16.18, 10.65, 0]} material={blackSteel} castShadow>
            <boxGeometry args={[0.45, 0.38, 28.2]} />
          </mesh>
          {[-10, -5, 0, 5, 10].map((z) => (
            <mesh key={z} position={[side * 16.18, 10.39, z]} material={brushedSteel}>
              <boxGeometry args={[0.65, 0.08, 0.08]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function CinemaSideGalleries({ lightsOn }: { lightsOn: boolean }) {
  const accent = lightsOn ? guideOn : guideOff;
  return (
    <group name="cinema-side-galleries">
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <mesh position={[side * 15.72, 9.62, 1.1]} material={paintedSteel} castShadow receiveShadow>
            <boxGeometry args={[1.08, 0.34, 18.6]} />
          </mesh>
          <mesh position={[side * 15.18, 9.37, 1.1]} material={side < 0 ? burgundyFabric : wallFabric} castShadow receiveShadow>
            <boxGeometry args={[0.18, 0.64, 18.1]} />
          </mesh>
          <mesh position={[side * 15.06, 9.52, 1.1]} material={accent} castShadow={false}>
            <boxGeometry args={[0.055, 0.085, 17.55]} />
          </mesh>
          <mesh position={[side * 15.04, 10.72, 1.1]} material={brushedSteel} castShadow>
            <boxGeometry args={[0.1, 0.1, 17.7]} />
          </mesh>
          {[-7.3, -3.1, 1.1, 5.3, 9.5].map((z, index) => (
            <group key={z}>
              <mesh position={[side * 15.04, 10.18, z]} material={brushedSteel} castShadow>
                <boxGeometry args={[0.1, 1.1, 0.1]} />
              </mesh>
              <mesh
                position={[side * 15.42, 9.05, z]}
                rotation={[0, 0, side * (index % 2 ? 0.52 : -0.52)]}
                material={blackSteel}
                castShadow
              >
                <boxGeometry args={[0.09, 1.18, 0.12]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function CeilingTruss({ z, lightsOn }: { z: number; lightsOn: boolean }) {
  const spans = Array.from({ length: 8 }, (_, i) => -14 + i * 4);
  return (
    <group position={[0, 0, z]}>
      {[-0.34, 0.34].map((depth) => (
        <group key={depth} position={[0, 0, depth]}>
          <mesh position={[0, 12.7, 0]} rotation={[0, 0, Math.PI / 2]} material={brushedSteel} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 31.7, 8]} />
          </mesh>
          <mesh position={[0, 12.14, 0]} rotation={[0, 0, Math.PI / 2]} material={brushedSteel} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 31.7, 8]} />
          </mesh>
          {spans.map((x, i) => (
            <mesh
              key={x}
              position={[x + 2, 12.42, 0]}
              rotation={[0, 0, i % 2 ? -0.139 : 0.139]}
              material={blackSteel}
              castShadow
            >
              <boxGeometry args={[4.04, 0.07, 0.07]} />
            </mesh>
          ))}
        </group>
      ))}
      {[-12, -4, 4, 12].map((x) => (
        <mesh key={x} position={[x, 12.42, 0]} rotation={[Math.PI / 2, 0, 0]} material={brushedSteel}>
          <cylinderGeometry args={[0.045, 0.045, 0.74, 8]} />
        </mesh>
      ))}
      {[-10, 0, 10].map((x) => (
        <group key={x} position={[x, 11.88, 0]}>
          <mesh material={blackSteel} castShadow>
            <cylinderGeometry args={[0.22, 0.29, 0.42, 12]} />
          </mesh>
          <mesh position={[0, -0.23, 0]} material={lightsOn ? guideOn : guideOff}>
            <cylinderGeometry args={[0.13, 0.17, 0.06, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * R3F's dashed `target-position` updates the target's local position, but a
 * Three SpotLight target must be in the scene graph for matrixWorld updates.
 * This small wrapper makes every retained house light direction deterministic.
 */
function DirectedSpotLight({
  position,
  target,
  color,
  intensity,
  angle,
  penumbra,
  distance,
  decay,
}: {
  position: P3;
  target: P3;
  color: string;
  intensity: number;
  angle: number;
  penumbra: number;
  distance: number;
  decay: number;
}) {
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  useLayoutEffect(() => {
    const light = lightRef.current;
    const targetObject = targetRef.current;
    if (!light || !targetObject) return;
    light.target = targetObject;
    targetObject.updateMatrixWorld(true);
  }, []);
  return (
    <>
      <spotLight
        ref={lightRef}
        position={position}
        color={color}
        intensity={intensity}
        angle={angle}
        penumbra={penumbra}
        distance={distance}
        decay={decay}
      />
      <object3D ref={targetRef} position={target} />
    </>
  );
}

function ProjectionBooth({ lightsOn }: { lightsOn: boolean }) {
  return (
    <group>
      <mesh position={[0, 11.15, 14.18]} material={concrete} castShadow receiveShadow>
        <boxGeometry args={[8.8, 4.25, 1.48]} />
      </mesh>
      <mesh position={[0, 8.95, 13.55]} material={paintedSteel} castShadow>
        <boxGeometry args={[9.25, 0.25, 0.5]} />
      </mesh>
      {[-2.15, 0, 2.15].map((x) => (
        <group key={x}>
          <mesh position={[x, 11.25, 13.405]} material={brushedSteel} castShadow>
            <boxGeometry args={[1.72, 1.32, 0.17]} />
          </mesh>
          <mesh position={[x, 11.25, 13.305]} material={darkGlass}>
            <boxGeometry args={[1.47, 1.07, 0.08]} />
          </mesh>
        </group>
      ))}
      {/* Twin projector bodies, ventilation ribs, lenses and suspension feet. */}
      {[-1.3, 1.3].map((x) => (
        <group key={x} position={[x, 10.6, 12.9]}>
          <mesh material={paintedSteel} castShadow receiveShadow>
            <boxGeometry args={[0.9, 0.52, 1.05]} />
          </mesh>
          {[-0.28, -0.14, 0, 0.14, 0.28].map((rib) => (
            <mesh key={rib} position={[rib, 0.18, 0]} material={brushedSteel}>
              <boxGeometry args={[0.035, 0.08, 0.82]} />
            </mesh>
          ))}
          <mesh position={[0, 0, -0.59]} rotation={[Math.PI / 2, 0, 0]} material={blackSteel} castShadow>
            <cylinderGeometry args={[0.2, 0.27, 0.22, 18]} />
          </mesh>
          <mesh position={[0, 0, -0.72]} rotation={[Math.PI / 2, 0, 0]} material={lightsOn ? darkGlass : blackSteel}>
            <cylinderGeometry args={[0.13, 0.16, 0.06, 18]} />
          </mesh>
          {[-0.3, 0.3].map((foot) => (
            <mesh key={foot} position={[foot, -0.39, 0]} material={blackSteel}>
              <cylinderGeometry args={[0.035, 0.035, 0.28, 8]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function RearArchitecture({ lightsOn }: { lightsOn: boolean }) {
  const exitMaterial = lightsOn ? exitOn : exitOff;
  return (
    <group>
      {/* Rear wall returns leave a real central entrance opening. */}
      {[-10.25, 10.25].map((x) => (
        <mesh key={x} position={[x, 5.4, 14.74]} material={concrete} castShadow receiveShadow>
          <boxGeometry args={[13.4, 10.8, 0.52]} />
        </mesh>
      ))}
      <mesh position={[0, 7.2, 14.72]} material={paintedSteel} castShadow>
        <boxGeometry args={[7.1, 6.8, 0.65]} />
      </mesh>
      <mesh position={[-2.05, 1.45, 14.43]} material={paintedSteel} castShadow>
        <boxGeometry args={[0.28, 2.9, 0.72]} />
      </mesh>
      <mesh position={[2.05, 1.45, 14.43]} material={paintedSteel} castShadow>
        <boxGeometry args={[0.28, 2.9, 0.72]} />
      </mesh>
      <mesh position={[0, 3.03, 14.42]} material={paintedSteel} castShadow>
        <boxGeometry args={[4.38, 0.26, 0.74]} />
      </mesh>
      <mesh position={[0, 3.45, 14.05]} material={exitMaterial}>
        <boxGeometry args={[1.75, 0.32, 0.14]} />
      </mesh>
      <ProjectionBooth lightsOn={lightsOn} />
    </group>
  );
}

function AisleGuidance({ lightsOn }: { lightsOn: boolean }) {
  const material = lightsOn ? guideOn : guideOff;
  // Mirrors the six authoritative row bands in shared/src/layouts.ts. Lights
  // are mounted on the current deck top, never buried at the base floor.
  const aisleLights: Array<[number, number]> = [
    [-8.8, 0], [-6.6, 0], [-4.4, 0],
    [-3.2, 0.38], [-2, 0.38],
    [-0.9, 0.76], [0.3, 0.76],
    [1.5, 1.14], [2.7, 1.14],
    [3.9, 1.52], [5.1, 1.52],
    [6.4, 1.9], [7.6, 1.9], [8.75, 1.9],
    [10.6, 0], [12.4, 0],
  ];
  return (
    <group>
      {/* Flush housings sit 25 mm above the carpet and remain readable without
          pretending to replace layout-owned stair geometry. */}
      {[-6.3, 6.3].flatMap((x) => aisleLights.map(([z, deckY]) => (
        <group key={`${x}-${z}`} position={[x, deckY + 0.03, z]}>
          <mesh material={blackSteel} receiveShadow>
            <boxGeometry args={[0.38, 0.055, 0.22]} />
          </mesh>
          <mesh position={[0, 0.032, 0]} material={material}>
            <boxGeometry args={[0.25, 0.018, 0.11]} />
          </mesh>
        </group>
      )))}
      {/* Outer escape route marker is wall-mounted at human ankle height. */}
      {([-1, 1] as const).flatMap((side) => [-8, -4, 0, 4, 8, 12].map((z) => (
        <group key={`${side}-${z}`} position={[side * 16.25, 0.42, z]} rotation={[0, -side * Math.PI / 2, 0]}>
          <mesh material={blackSteel} castShadow><boxGeometry args={[0.46, 0.25, 0.14]} /></mesh>
          <mesh position={[0, 0, 0.085]} material={material}><boxGeometry args={[0.31, 0.12, 0.045]} /></mesh>
        </group>
      )))}
    </group>
  );
}

function GrandCeilingCrown({ lightsOn }: { lightsOn: boolean }) {
  const accent = lightsOn ? guideOn : guideOff;
  const frames = [
    { width: 22.8, depth: 17.6, y: 12.56, material: brushedSteel },
    { width: 16.4, depth: 11.4, y: 12.36, material: burgundyFabric },
    { width: 10.2, depth: 6.2, y: 12.2, material: walnut },
  ];
  return (
    <group name="cinema-grand-ceiling-crown">
      {frames.map((frame, index) => (
        <group key={frame.width} position={[0, frame.y, 0]}>
          {([-1, 1] as const).map((side) => (
            <mesh key={`x-${side}`} position={[side * frame.width / 2, 0, 0]} material={frame.material} castShadow receiveShadow>
              <boxGeometry args={[0.24 + index * 0.035, 0.26, frame.depth]} />
            </mesh>
          ))}
          {([-1, 1] as const).map((side) => (
            <mesh key={`z-${side}`} position={[0, 0, side * frame.depth / 2]} material={frame.material} castShadow receiveShadow>
              <boxGeometry args={[frame.width, 0.26, 0.24 + index * 0.035]} />
            </mesh>
          ))}
          <mesh position={[0, -0.145, frame.depth / 2 - 0.18]} material={accent} castShadow={false}>
            <boxGeometry args={[frame.width - 0.7, 0.045, 0.09]} />
          </mesh>
        </group>
      ))}
      {([-1, 1] as const).flatMap((xSide) => ([-1, 1] as const).map((zSide) => (
        <group key={`${xSide}-${zSide}`} position={[xSide * 7.9, 12.86, zSide * 5.3]}>
          <mesh material={blackSteel} castShadow><cylinderGeometry args={[0.055, 0.055, 0.92, 8]} /></mesh>
          <mesh position={[0, -0.48, 0]} material={brushedSteel} castShadow><boxGeometry args={[0.52, 0.12, 0.52]} /></mesh>
        </group>
      )))}
      <mesh position={[0, 12.07, 0]} material={lightsOn ? burgundyFabric : wallFabric} castShadow receiveShadow>
        <cylinderGeometry args={[2.2, 2.2, 0.24, 24]} />
      </mesh>
      <mesh position={[0, 11.93, 0]} rotation={[Math.PI / 2, 0, 0]} material={accent} castShadow={false}>
        <torusGeometry args={[1.72, 0.075, 10, 40]} />
      </mesh>
    </group>
  );
}

/**
 * Complete architectural layer for the rebuilt giant-screen auditorium.
 * Mount once from Interior when spaceKey === 'cinema'.  The room shell and
 * layout-owned seats/risers remain separate so collision and seat interaction
 * stay authoritative in shared/src/layouts.ts.
 */
export function CinemaHallArchitecture({
  lightsOn,
  lightBudget = 4,
}: {
  lightsOn: boolean;
  lightBudget?: number;
}) {
  return (
    <group>
      <ScreenProscenium lightsOn={lightsOn} />
      <SideWallSystem lightsOn={lightsOn} />
      <CinemaSideGalleries lightsOn={lightsOn} />
      <RearArchitecture lightsOn={lightsOn} />
      <AisleGuidance lightsOn={lightsOn} />
      <GrandCeilingCrown lightsOn={lightsOn} />

      {/* Layered ceiling: side soffits, acoustic clouds, then supported trusses. */}
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          position={[side * 13.8, 12.25, 0]}
          rotation={[0, 0, side * 0.11]}
          material={wallFabric}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[5.6, 0.62, 28.8]} />
        </mesh>
      ))}
      {[-7.2, 0, 7.2].map((z, index) => (
        <mesh key={z} position={[0, 13.05 - (index % 2) * 0.12, z]} material={index === 1 ? burgundyFabric : wallFabric} castShadow receiveShadow>
          <boxGeometry args={[13.6, 0.28, 4.3]} />
        </mesh>
      ))}
      {[-9, -3, 3, 9].map((z) => <CeilingTruss key={z} z={z} lightsOn={lightsOn} />)}

      {lightsOn && lightBudget > 0 && (
        <>
          {/* Rear house key survives every tier and reveals the stepped seating
              and screen in a single broad, directional composition. */}
          <DirectedSpotLight
            position={[0, 9.8, 12.2]}
            target={[0, 1.4, -1.5]}
            color="#ffd0a6"
            intensity={118}
            angle={0.76}
            penumbra={0.8}
            distance={27}
            decay={1.7}
          />
          {lightBudget >= 2 && (
            <DirectedSpotLight
              position={[0, 9.2, -12.7]}
              target={[0, 1.35, 3.8]}
              color="#9eb8d4"
              intensity={92}
              angle={0.83}
              penumbra={0.82}
              distance={28}
              decay={1.65}
            />
          )}
          {/* At four lights use a balanced side pair. At three, a single
              overhead fill avoids an asymmetric half-pair. No local light
              casts a six-face point shadow. */}
          {lightBudget === 3 && (
            <pointLight position={[0, 11.9, 7.2]} color="#ffd0a2" intensity={18} distance={20} decay={1.9} />
          )}
          {lightBudget >= 4 && (
            <>
              <pointLight position={[-14.2, 6.3, 1.5]} color="#d06a77" intensity={11} distance={12} decay={1.85} />
              <pointLight position={[14.2, 6.3, 1.5]} color="#718db9" intensity={10} distance={12} decay={1.85} />
            </>
          )}
          {lightBudget >= 5 && (
            <pointLight position={[0, 11.9, 7.2]} color="#ffd0a2" intensity={18} distance={20} decay={1.9} />
          )}
        </>
      )}
    </group>
  );
}

const seatFabrics = [
  tinted('seatFabric', '#b34865'),
  tinted('seatFabric', '#a83d5b'),
  tinted('seatFabric', '#963650'),
];
seatFabrics.forEach((material) => {
  material.emissive.set('#280913');
  material.emissiveIntensity = 0.12;
  material.roughness = 0.91;
});
const seatMetal = tinted('metal', '#555b68');
seatMetal.metalness = 0.28;
seatMetal.roughness = 0.66;
const seatTrim = tinted('brushedMetal', '#aaa6ad');
seatTrim.metalness = 0.5;
seatTrim.roughness = 0.48;
const cupInterior = tinted('darkGlass', '#313844');
cupInterior.metalness = 0.16;
cupInterior.roughness = 0.42;

/**
 * Grounded premium cinema chair.  `position.y` is the exact deck contact
 * plane, matching seat snap points and height zones.  `variant` (or seat row
 * index modulo three) provides restrained fabric/pillow variation.
 */
export function PremiumCinemaSeat({ position, rotation, variant = 0 }: {
  position: P3;
  rotation: number;
  variant?: number;
}) {
  const fabric = seatFabrics[Math.abs(variant) % seatFabrics.length];
  return (
    <group position={position} rotation={[0, rotation, 0]} dispose={null}>
      <mesh geometry={seatMetalGeometry} material={seatMetal} castShadow receiveShadow />
      <mesh geometry={seatFabricGeometry} material={fabric} castShadow receiveShadow />
      <mesh geometry={seatTrimGeometry} material={seatTrim} castShadow receiveShadow />
      <mesh geometry={seatCupGeometry} material={cupInterior} castShadow receiveShadow />
    </group>
  );
}

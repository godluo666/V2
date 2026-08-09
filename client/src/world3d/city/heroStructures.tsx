/**
 * Hero-scale street structures for the compact Tsukishio crossroads.
 *
 * These meshes deliberately sit above the repeated facade language in
 * buildings.tsx: each venue gets a different load-bearing silhouette, deep
 * entrance reveal and service anatomy.  The screens and accent colours are
 * secondary; the portals, canopies, trusses and platforms still read when all
 * emissive output is disabled.
 *
 * The module is kept independent from the city build queue so it can be mounted
 * after <Buildings /> and remain a small, reviewable piece of the city assembly.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BUILDINGS,
  CROSSWALKS,
  VENUES,
  cityBuildingLocalSize,
} from '@nexuspark/shared/src/cityplan';
import { surfaceMaterial } from './materials';
import { ACCENT, ENV } from './palette';

type MaterialSlot =
  | 'concrete'
  | 'paleConcrete'
  | 'brick'
  | 'inkMetal'
  | 'brightMetal'
  | 'darkGlass'
  | 'warmGlass'
  | 'cinemaAccent'
  | 'arenaAccent'
  | 'clubWood';

type HeroMaterials = Record<MaterialSlot, THREE.MeshStandardMaterial>;
type VenueKey = (typeof VENUES)[number]['key'];

interface VenueEnvelope {
  building: (typeof BUILDINGS)[number];
  localDoorX: number;
  rotation: number;
  front: number;
  frontage: number;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDERS = new Map<number, THREE.CylinderGeometry>();
const UP = new THREE.Vector3(0, 1, 0);

/** Resolve every hero anchor from the shared collision/route contract. */
function venueEnvelope(key: VenueKey): VenueEnvelope {
  const venue = VENUES.find((item) => item.key === key);
  const building = BUILDINGS.find((item) => item.venue === key);
  if (!venue || !building) throw new Error(`Missing cityplan envelope for ${key}`);
  const rotation = building.ry ?? 0;
  const dx = venue.x - building.x;
  const dz = venue.z - building.z;
  const size = cityBuildingLocalSize(building);
  return {
    building,
    rotation,
    localDoorX: dx * Math.cos(rotation) - dz * Math.sin(rotation),
    front: size.depth / 2,
    frontage: size.frontage,
  };
}

function mediaTowerEnvelope(): {
  building: (typeof BUILDINGS)[number];
  rotation: number;
  front: number;
  frontage: number;
  depth: number;
} {
  const building = BUILDINGS.find((item) => item.style === 'mediaTower');
  if (!building) throw new Error('Missing media tower in cityplan');
  const size = cityBuildingLocalSize(building);
  return {
    building,
    rotation: building.ry ?? 0,
    front: size.depth / 2,
    frontage: size.frontage,
    depth: size.depth,
  };
}

function unitCylinder(segments = 8): THREE.CylinderGeometry {
  const hit = UNIT_CYLINDERS.get(segments);
  if (hit) return hit;
  const geometry = new THREE.CylinderGeometry(1, 1, 1, segments, 1, false);
  UNIT_CYLINDERS.set(segments, geometry);
  return geometry;
}

function materials(): HeroMaterials {
  const concrete = surfaceMaterial('oldConcrete');
  concrete.color.set('#85837f');

  const paleConcrete = surfaceMaterial('paintedConcrete');
  paleConcrete.color.set('#d8d0c2');

  const brick = surfaceMaterial('brick');
  brick.color.set('#76504b');

  const inkMetal = surfaceMaterial('metal');
  inkMetal.color.set(ENV.outline);
  inkMetal.roughness = 0.48;

  const brightMetal = surfaceMaterial('brushedMetal');
  brightMetal.color.set('#76818a');

  const darkGlass = surfaceMaterial('darkGlass');
  darkGlass.color.set('#102632');
  darkGlass.emissive.set('#0b2631');
  darkGlass.emissiveIntensity = 0.08;

  const warmGlass = surfaceMaterial('glass');
  warmGlass.color.set('#caa66e');
  warmGlass.emissive.set('#6e421c');
  warmGlass.emissiveIntensity = 0.14;

  const cinemaAccent = surfaceMaterial('plasticLightbox');
  cinemaAccent.color.set(ACCENT.cinemaSign);
  cinemaAccent.emissive.set('#7c122f');
  cinemaAccent.emissiveIntensity = 0.12;

  const arenaAccent = surfaceMaterial('plasticLightbox');
  arenaAccent.color.set(ACCENT.netcafeSign);
  arenaAccent.emissive.set('#073d62');
  arenaAccent.emissiveIntensity = 0.14;

  const clubWood = surfaceMaterial('wood');
  clubWood.color.set('#6b422c');

  return {
    concrete,
    paleConcrete,
    brick,
    inkMetal,
    brightMetal,
    darkGlass,
    warmGlass,
    cinemaAccent,
    arenaAccent,
    clubWood,
  };
}

/**
 * A tiny material-aware geometry batch.  Hero structures remain authored as
 * readable modules, but repeated columns, braces and mullions collapse to one
 * mesh per material instead of one draw call per part.
 */
class HeroBatch {
  private readonly parts = new Map<MaterialSlot, THREE.BufferGeometry[]>();

  private addTransformed(
    slot: MaterialSlot,
    source: THREE.BufferGeometry,
    position: THREE.Vector3,
    scale: THREE.Vector3,
    quaternion: THREE.Quaternion,
  ): void {
    // BufferGeometryUtils requires every input in a merge to share the same
    // indexed/non-indexed layout. Boxes and cylinders are indexed while
    // ExtrudeGeometry is not guaranteed to be, so normalise all hero pieces.
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    geometry.applyMatrix4(new THREE.Matrix4().compose(position, quaternion, scale));
    const list = this.parts.get(slot) ?? [];
    list.push(geometry);
    this.parts.set(slot, list);
  }

  box(
    slot: MaterialSlot,
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    rx = 0, ry = 0, rz = 0,
  ): void {
    this.addTransformed(
      slot,
      UNIT_BOX,
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(w, h, d),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    );
  }

  cylinder(
    slot: MaterialSlot,
    x: number, y: number, z: number,
    radius: number, height: number,
    segments = 8,
    rx = 0, ry = 0, rz = 0,
  ): void {
    this.addTransformed(
      slot,
      unitCylinder(segments),
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(radius, height, radius),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    );
  }

  beam(
    slot: MaterialSlot,
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
    segments = 8,
  ): void {
    const direction = b.clone().sub(a);
    const length = direction.length();
    if (length < 0.001) return;
    this.addTransformed(
      slot,
      unitCylinder(segments),
      a.clone().lerp(b, 0.5),
      new THREE.Vector3(radius, length, radius),
      new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()),
    );
  }

  geometry(
    slot: MaterialSlot,
    source: THREE.BufferGeometry,
    position = new THREE.Vector3(),
    scale = new THREE.Vector3(1, 1, 1),
    rotation = new THREE.Euler(),
  ): void {
    this.addTransformed(
      slot,
      source,
      position,
      scale,
      new THREE.Quaternion().setFromEuler(rotation),
    );
  }

  build(name: string, palette: HeroMaterials): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [slot, geometries] of this.parts) {
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((geometry) => geometry.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, palette[slot]);
      mesh.name = `${name}-${slot}`;
      mesh.castShadow = slot !== 'darkGlass' && slot !== 'warmGlass';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

/** Concave, chamfered U-frame with a real opening and extruded side faces. */
function portalGeometry(width: number, height: number, opening: number, top: number, depth: number): THREE.ExtrudeGeometry {
  const outerHalf = width / 2;
  const innerHalf = opening / 2;
  const chamfer = Math.min(0.8, width * 0.08);
  const shape = new THREE.Shape();
  shape.moveTo(-outerHalf, 0);
  shape.lineTo(-outerHalf, height - chamfer);
  shape.lineTo(-outerHalf + chamfer, height);
  shape.lineTo(outerHalf - chamfer, height);
  shape.lineTo(outerHalf, height - chamfer);
  shape.lineTo(outerHalf, 0);
  shape.lineTo(innerHalf, 0);
  shape.lineTo(innerHalf, height - top);
  shape.lineTo(-innerHalf, height - top);
  shape.lineTo(-innerHalf, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.055,
    bevelThickness: 0.055,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** A shallow chamfered slab used for marquees and screen casings. */
function chamferedSlab(width: number, height: number, depth: number, cut: number): THREE.ExtrudeGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const c = Math.min(cut, hw * 0.45, hh * 0.45);
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
    depth,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function cinemaStructure(palette: HeroMaterials): THREE.Group {
  // The asymmetric portal occupies the entrance side of the shared cinema
  // envelope and turns the whole facade into a recognisable hall.
  const envelope = venueEnvelope('cinema');
  const root = new THREE.Group();
  root.name = 'hero-cinema';
  root.position.set(envelope.building.x, 0, envelope.building.z);
  root.rotation.y = envelope.rotation;
  const batch = new HeroBatch();
  const doorX = envelope.localDoorX;
  const portalX = doorX + 1.05;
  const facadeZ = envelope.front - 0.05;
  const roofY = envelope.building.h;

  // Keep the entrance crown inside the normal 42° approach framing; the much
  // taller roof silhouette remains separate above the main building mass.
  const portal = portalGeometry(7.25, 9.7, 5.05, 1.25, 0.72);
  batch.geometry('paleConcrete', portal, new THREE.Vector3(portalX, 0.08, facadeZ + 0.12));
  batch.box('cinemaAccent', portalX, 9.18, facadeZ + 0.54, 5.25, 0.24, 0.34);

  // The authoritative interaction marker sits 1.7m in front of the old wall
  // plane. A projecting vestibule physically joins that marker back to the
  // main portal, so the usable door does not appear detached from the lobby.
  const vestibule = portalGeometry(4.0, 4.35, 3.15, 0.58, 0.42);
  batch.geometry('brightMetal', vestibule, new THREE.Vector3(doorX, 0.08, 8.84));
  for (const side of [-1, 1]) {
    batch.box('inkMetal', doorX + side * 1.82, 2.1, 8.12, 0.24, 4.08, 1.42);
  }
  batch.box('darkGlass', doorX, 4.0, 8.12, 3.55, 0.18, 1.42);
  batch.box('paleConcrete', doorX, 0.1, 8.58, 3.9, 0.2, 1.75);

  // A two-storey recessed lobby.  Every pane has a casing and the actual door
  // sits in a 0.75m reveal, rather than floating on the main wall plane.
  batch.box('concrete', portalX, 5.05, facadeZ - 0.58, 5.35, 9.0, 0.42);
  const lobbyPanes = [
    { x: -6.0, w: 1.05 },
    { x: -4.82, w: 1.05 },
    { x: -3.25, w: 1.7 },
    { x: -1.86, w: 0.72 },
  ];
  for (const pane of lobbyPanes) {
    batch.box('darkGlass', pane.x, 2.2, facadeZ - 0.32, pane.w, 3.55, 0.14);
    batch.box('inkMetal', pane.x, 0.43, facadeZ - 0.2, pane.w + 0.12, 0.13, 0.28);
    batch.box('inkMetal', pane.x, 3.97, facadeZ - 0.2, pane.w + 0.12, 0.13, 0.28);
  }
  for (const x of [-6.62, -5.43, -4.2, -2.35, -1.47]) {
    batch.box('brightMetal', x, 2.2, facadeZ - 0.15, 0.12, 3.7, 0.24);
  }
  batch.box('brightMetal', doorX, 3.78, 8.78, 3.5, 0.11, 0.2);

  // Cantilevered marquee: thick chamfered shell, underside ribs and diagonal
  // tension rods. It projects over the pavement but leaves the approach open.
  const marquee = chamferedSlab(8.1, 0.64, 2.25, 0.28);
  batch.geometry('cinemaAccent', marquee, new THREE.Vector3(-3.9, 4.8, facadeZ + 1.0));
  batch.box('inkMetal', -3.9, 4.48, facadeZ + 0.9, 7.45, 0.12, 1.86);
  for (const x of [-6.85, -5.35, -3.85, -2.35, -0.85]) {
    batch.box('brightMetal', x, 4.39, facadeZ + 0.9, 0.08, 0.12, 1.72);
  }
  for (const x of [-6.65, -1.15]) {
    batch.beam('brightMetal', new THREE.Vector3(x, 4.68, facadeZ + 1.88), new THREE.Vector3(x, 7.35, facadeZ + 0.05), 0.055, 8);
  }

  // Second-storey balcony and deep mullions make the foyer height readable.
  batch.box('brightMetal', portalX, 5.7, facadeZ + 0.16, 5.25, 0.16, 0.62);
  batch.box('darkGlass', portalX, 7.5, facadeZ - 0.28, 4.95, 2.78, 0.14);
  for (const x of [-6.4, -5.25, -4.1, -2.95, -1.8]) {
    batch.box('inkMetal', x, 7.5, facadeZ - 0.04, 0.1, 2.95, 0.28);
  }

  // The opposite half is a stepped acoustic/circulation tower rather than a
  // continuation of the same flat facade.
  batch.box('concrete', 2.15, 7.2, facadeZ - 0.36, 3.8, 13.8, 1.05);
  batch.box('paleConcrete', 3.0, 15.1, facadeZ - 0.58, 2.15, 2.35, 1.55);
  batch.box('inkMetal', 0.18, 8.2, facadeZ + 0.1, 0.3, 15.6, 0.48);
  batch.box('inkMetal', 4.16, 8.0, facadeZ - 0.06, 0.34, 14.7, 0.52);
  for (const y of [6.1, 9.1, 12.1]) {
    batch.box('cinemaAccent', 2.15, y, facadeZ + 0.22, 3.35, 0.18, 0.34);
  }

  // Cinema crown and projection-room silhouette. The existing cinema shell is
  // 32m tall and reaches local z=7.4; these volumes intentionally cross both
  // limits so they are visible instead of being buried inside the legacy mass.
  batch.box('inkMetal', -1.4, 23.8, facadeZ - 0.5, 10.2, 0.38, 1.15);
  batch.box('concrete', 1.55, roofY + 0.45, 3.9, 5.2, 8.7, 7.2);
  batch.box('brightMetal', 1.55, roofY + 5.02, 3.9, 5.55, 0.42, 7.55);
  for (const x of [-0.2, 1.25, 2.7]) {
    batch.box('inkMetal', x, roofY + 1.0, 7.58, 0.17, 7.25, 0.32);
  }
  for (const x of [0.25, 2.65]) {
    batch.box('brightMetal', x, roofY + 6.35, 3.9, 0.24, 2.4, 0.24);
  }

  // East service platform, guardrails and connected drain/HVAC anatomy.
  const serviceX = envelope.frontage / 2 - 0.27;
  for (const y of [9.0, 15.0, 21.0]) {
    batch.box('brightMetal', serviceX, y, 0.3, 0.92, 0.18, 3.0);
    batch.box('inkMetal', serviceX + 0.43, y + 0.58, 0.3, 0.08, 1.16, 3.0);
    for (const z of [-1.08, 0, 1.08]) {
      batch.box('inkMetal', serviceX + 0.43, y + 0.58, z, 0.09, 1.16, 0.09);
    }
  }
  batch.cylinder('inkMetal', 6.76, 15.4, -1.6, 0.1, 23.0, 8);
  for (let i = 0; i < 12; i++) {
    const y = 8.0 + i * 1.15;
    batch.box('brightMetal', serviceX - 0.2, y, 1.55 - (i % 2) * 2.5, 0.85, 0.07, 0.12, 0, 0, i % 2 ? -0.5 : 0.5);
  }

  root.add(batch.build('hero-cinema-batch', palette));
  return root;
}

function arenaStructure(palette: HeroMaterials): THREE.Group {
  const envelope = venueEnvelope('netcafe');
  const root = new THREE.Group();
  root.name = 'hero-arena';
  root.position.set(envelope.building.x, 0, envelope.building.z);
  root.rotation.y = envelope.rotation;
  const batch = new HeroBatch();
  const facadeZ = envelope.front + 0.07;
  const roofY = envelope.building.h;

  // Flared event shell: two deep pylons, a chamfered outer portal and diagonal
  // buttresses. Its width and 17m height break the original shopfront outline.
  const portal = portalGeometry(12.25, 16.8, 9.35, 1.05, 0.92);
  batch.geometry('inkMetal', portal, new THREE.Vector3(0, 0.1, facadeZ + 0.18));
  batch.box('concrete', -5.55, 8.1, facadeZ - 0.55, 1.25, 15.4, 1.5);
  batch.box('concrete', 5.55, 8.1, facadeZ - 0.55, 1.25, 15.4, 1.5);
  batch.box('arenaAccent', -5.92, 9.0, facadeZ + 0.42, 0.24, 12.6, 0.48, 0, 0, -0.045);
  batch.box('arenaAccent', 5.92, 9.0, facadeZ + 0.42, 0.24, 12.6, 0.48, 0, 0, 0.045);

  // Recessed public entrance with thick turnstile bays and an upper concourse.
  batch.box('concrete', 0, 2.3, facadeZ - 0.72, 8.6, 4.45, 0.4);
  for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) {
    batch.box('darkGlass', x, 2.25, facadeZ - 0.38, 1.35, 3.65, 0.15);
    batch.box('brightMetal', x - 0.74, 2.25, facadeZ - 0.17, 0.1, 3.82, 0.26);
  }
  batch.box('brightMetal', 0, 0.42, facadeZ - 0.1, 8.6, 0.15, 0.34);
  batch.box('brightMetal', 0, 4.1, facadeZ - 0.1, 8.6, 0.18, 0.34);
  for (const x of [-2.4, 0, 2.4]) {
    batch.box('inkMetal', x, 0.76, facadeZ + 0.38, 1.25, 0.2, 0.65);
  }

  // Exterior match screen: screen, rear casing, side ventilation ribs and a
  // complete truss that visibly transfers the load into both pylons.
  const screenShell = chamferedSlab(10.35, 6.85, 0.62, 0.42);
  batch.geometry('inkMetal', screenShell, new THREE.Vector3(0, 9.0, facadeZ + 0.05));
  const screenFace = chamferedSlab(9.65, 6.2, 0.2, 0.3);
  batch.geometry('darkGlass', screenFace, new THREE.Vector3(0, 9.0, facadeZ + 0.47));
  for (const x of [-4.55, -3.05, -1.52, 0, 1.52, 3.05, 4.55]) {
    batch.box('brightMetal', x, 5.92, facadeZ + 0.58, 0.1, 0.26, 0.24);
    batch.box('brightMetal', x, 12.08, facadeZ + 0.58, 0.1, 0.26, 0.24);
  }
  for (const side of [-1, 1]) {
    const wingX = side * 5.55;
    batch.box('inkMetal', wingX, 9.1, facadeZ - 0.12, 1.55, 6.1, 0.48, 0, side * 0.28, 0);
    batch.box('darkGlass', wingX + side * 0.18, 9.1, facadeZ + 0.22, 1.12, 5.45, 0.15, 0, side * 0.28, 0);
    batch.beam('brightMetal', new THREE.Vector3(side * 5.4, 4.4, facadeZ - 0.45), new THREE.Vector3(side * 4.85, 12.65, facadeZ + 0.05), 0.09, 10);
    batch.beam('brightMetal', new THREE.Vector3(side * 3.75, 4.45, facadeZ - 0.5), new THREE.Vector3(side * 5.45, 12.5, facadeZ - 0.1), 0.075, 10);
  }

  // Rear truss cage. The z-depth and diagonals remain visible from oblique
  // street views instead of reading as a floating luminous rectangle.
  const trussBackZ = facadeZ - 0.86;
  for (const y of [5.35, 12.65]) {
    batch.box('brightMetal', 0, y, trussBackZ, 10.4, 0.15, 0.15);
  }
  for (const x of [-5.05, 5.05]) {
    batch.box('brightMetal', x, 9.0, trussBackZ, 0.15, 7.45, 0.15);
  }
  for (let i = 0; i < 5; i++) {
    const x0 = -5.0 + i * 2.0;
    const x1 = x0 + 2.0;
    batch.beam('brightMetal', new THREE.Vector3(x0, 5.48, trussBackZ), new THREE.Vector3(x1, 12.52, trussBackZ), 0.055, 8);
    batch.beam('brightMetal', new THREE.Vector3(x0, 12.52, trussBackZ), new THREE.Vector3(x1, 5.48, trussBackZ), 0.055, 8);
  }

  // Upper event-hall volume, roof catwalk and broadcast equipment produce a
  // larger silhouette without widening the playable street. The old arena is
  // 28m tall with a local front at z=4.95; the event volume rises above it and
  // advances to z=5.4 so both the roofline and front step remain observable.
  batch.box('concrete', 0.7, roofY - 1.0, 1.6, 10.6, 10.5, 7.6);
  batch.box('inkMetal', -1.0, roofY + 4.45, 1.3, 13.0, 0.5, 8.5);
  batch.box('arenaAccent', 0.8, roofY - 6.0, 5.42, 9.5, 0.32, 0.48);
  for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) {
    batch.box('inkMetal', x, roofY - 1.6, 5.38, 0.16, 8.1, 0.34);
  }
  // Rooftop broadcast cage with dish, cable risers and service railings.
  batch.box('brightMetal', 1.3, roofY + 5.15, 1.3, 6.0, 0.2, 4.0);
  for (const x of [-1.5, 1.3, 4.1]) {
    for (const z of [-0.55, 3.15]) {
      batch.box('brightMetal', x, roofY + 5.85, z, 0.1, 1.35, 0.1);
    }
  }
  batch.cylinder('inkMetal', 2.0, roofY + 7.45, 1.4, 0.65, 0.25, 16, Math.PI / 2, 0, 0);
  batch.cylinder('brightMetal', 2.0, roofY + 6.35, 1.4, 0.09, 2.0, 8);
  for (const x of [-2.4, 0.3, 3.0]) {
    batch.box('inkMetal', x, roofY + 5.85, 0.6, 1.45, 1.15, 1.1);
    batch.box('brightMetal', x, roofY + 6.45, 0.6, 1.58, 0.1, 1.2);
  }

  const body = batch.build('hero-arena-batch', palette);
  body.position.x = envelope.localDoorX;
  root.add(body);
  return root;
}

function clubStructure(palette: HeroMaterials): THREE.Group {
  const envelope = venueEnvelope('gameroom');
  const root = new THREE.Group();
  root.name = 'hero-dango-club';
  root.position.set(envelope.building.x, 0, envelope.building.z);
  root.rotation.y = envelope.rotation;
  const batch = new HeroBatch();
  const facadeZ = envelope.front + 0.53;
  const roofY = envelope.building.h;

  // Warm, human-scale post-and-beam entrance nested in the tall urban shell.
  const portal = portalGeometry(6.15, 6.3, 4.45, 0.82, 0.56);
  batch.geometry('clubWood', portal, new THREE.Vector3(0, 0.06, facadeZ + 0.06));
  batch.box('brick', 0, 3.2, facadeZ - 0.55, 5.25, 5.95, 0.5);
  batch.box('warmGlass', -1.45, 2.2, facadeZ - 0.24, 1.25, 3.55, 0.14);
  batch.box('warmGlass', 1.45, 2.2, facadeZ - 0.24, 1.25, 3.55, 0.14);
  batch.box('warmGlass', 0, 2.05, facadeZ - 0.18, 1.35, 3.25, 0.15);
  for (const x of [-2.35, -1.98, -0.73, 0.73, 1.98, 2.35]) {
    batch.box('clubWood', x, 2.35, facadeZ + 0.02, 0.13, 4.1, 0.24);
  }
  batch.box('clubWood', 0, 4.35, facadeZ + 0.02, 5.0, 0.16, 0.24);
  batch.box('clubWood', 0, 0.38, facadeZ + 0.02, 5.0, 0.16, 0.24);

  // A gabled, two-leaf canopy with actual thickness and timber brackets.
  const roofAngle = 0.24;
  const roofDepth = 2.2;
  const roofHalf = roofDepth / 2;
  const roofRise = Math.tan(roofAngle) * roofHalf;
  const roofSlope = Math.hypot(roofHalf, roofRise);
  batch.box('clubWood', 0, 5.35, facadeZ + 0.25, 6.45, 0.18, roofSlope, roofAngle, 0, 0);
  batch.box('clubWood', 0, 5.35, facadeZ + 1.31, 6.45, 0.18, roofSlope, -roofAngle, 0, 0);
  batch.box('inkMetal', 0, 5.56 + roofRise * 0.25, facadeZ + 0.78, 6.62, 0.12, 0.12);
  for (const x of [-2.25, 2.25]) {
    batch.beam('clubWood', new THREE.Vector3(x, 4.62, facadeZ + 0.12), new THREE.Vector3(x, 5.28, facadeZ + 1.55), 0.065, 8);
  }

  // Shop-bay windows and deep sills link the club to the surrounding street.
  for (const bayX of [-4.55, 4.55]) {
    batch.box('brick', bayX, 2.0, facadeZ - 0.35, 2.5, 3.9, 0.55);
    batch.box('warmGlass', bayX, 2.15, facadeZ - 0.01, 1.85, 2.45, 0.16);
    for (const x of [bayX - 1.03, bayX, bayX + 1.03]) {
      batch.box('clubWood', x, 2.15, facadeZ + 0.12, 0.12, 2.75, 0.24);
    }
    batch.box('clubWood', bayX, 0.78, facadeZ + 0.12, 2.18, 0.18, 0.36);
    batch.box('clubWood', bayX, 3.5, facadeZ + 0.12, 2.18, 0.18, 0.36);
  }

  // Northern alley mouth: a deep brick reveal, repeated overhead ribs and a
  // connected utility run. It creates a real side destination without adding
  // another traversable district or widening the road.
  const alleyX = 4.95;
  batch.box('brick', alleyX - 1.5, 2.6, facadeZ - 1.05, 0.45, 5.2, 2.4);
  batch.box('brick', alleyX + 1.5, 2.6, facadeZ - 1.05, 0.45, 5.2, 2.4);
  batch.box('inkMetal', alleyX, 5.2, facadeZ - 1.05, 3.4, 0.36, 2.4);
  batch.box('darkGlass', alleyX, 2.35, facadeZ - 2.18, 2.6, 4.35, 0.14);
  for (let i = 0; i < 4; i++) {
    const z = facadeZ + 0.1 - i * 0.65;
    batch.box('brightMetal', alleyX, 4.75, z, 3.15, 0.1, 0.1);
    batch.box('brightMetal', alleyX - 1.4, 2.55, z, 0.1, 4.45, 0.1);
    batch.box('brightMetal', alleyX + 1.4, 2.55, z, 0.1, 4.45, 0.1);
  }
  batch.cylinder('brightMetal', alleyX - 1.12, 4.42, facadeZ - 1.2, 0.11, 4.1, 8, 0, 0, Math.PI / 2);
  batch.cylinder('brightMetal', alleyX + 1.12, 4.08, facadeZ - 1.2, 0.08, 3.85, 8, 0, 0, Math.PI / 2);

  // Fire escape and club service platform give the tall side wall a believable
  // maintenance scale. The ladder alternates flights rather than becoming a
  // decorative grid pasted onto the facade.
  const escapeX = -5.25;
  for (const y of [8.5, 14.0, 19.5]) {
    batch.box('brightMetal', escapeX, y, facadeZ + 0.18, 2.55, 0.16, 1.2);
    batch.box('inkMetal', escapeX, y + 0.58, facadeZ + 0.72, 2.55, 1.05, 0.08);
    for (const x of [escapeX - 1.15, escapeX, escapeX + 1.15]) {
      batch.box('inkMetal', x, y + 0.58, facadeZ + 0.72, 0.08, 1.05, 0.08);
    }
  }
  for (let flight = 0; flight < 3; flight++) {
    const y0 = 8.7 + flight * 5.5;
    const side = flight % 2 ? 1 : -1;
    batch.beam('brightMetal', new THREE.Vector3(escapeX - side * 1.0, y0, facadeZ + 0.76), new THREE.Vector3(escapeX + side * 1.0, y0 + 4.8, facadeZ + 0.76), 0.07, 8);
    batch.beam('brightMetal', new THREE.Vector3(escapeX - side * 0.72, y0, facadeZ + 0.76), new THREE.Vector3(escapeX + side * 1.28, y0 + 4.8, facadeZ + 0.76), 0.07, 8);
    for (let rung = 0; rung < 7; rung++) {
      const f = rung / 6;
      const x = THREE.MathUtils.lerp(escapeX - side * 0.86, escapeX + side * 1.14, f);
      batch.box('brightMetal', x, y0 + f * 4.8, facadeZ + 0.76, 0.62, 0.055, 0.09, 0, 0, side * -0.39);
    }
  }

  // Roof club-room extension, water tank and vent run vary the silhouette. The
  // inherited club block reaches 34m, so the extension straddles that datum and
  // exposes a complete upper room rather than only a tank cap.
  batch.box('brick', -1.6, roofY + 1.4, -0.7, 5.0, 6.4, 5.2);
  batch.box('clubWood', -1.6, roofY + 4.78, -0.7, 5.4, 0.34, 5.6);
  batch.cylinder('brightMetal', 2.8, roofY + 6.0, -1.2, 1.15, 2.1, 12);
  batch.cylinder('inkMetal', 2.8, roofY + 4.85, -1.2, 0.12, 0.9, 8);
  batch.cylinder('inkMetal', 2.8, roofY + 7.2, -1.2, 0.12, 0.35, 8);
  batch.box('inkMetal', 1.15, roofY + 5.45, 1.9, 2.0, 1.15, 1.4);
  batch.cylinder('brightMetal', 0.0, 22.0, 6.98, 0.1, 18.5, 8);

  const body = batch.build('hero-club-batch', palette);
  body.position.x = envelope.localDoorX;
  root.add(body);
  return root;
}

function mediaTowerScreenShell(palette: HeroMaterials): THREE.Group {
  // Structural wrap around the screen already rendered by buildings.tsx. The
  // central display remains unobstructed; this module supplies the casing,
  // curved side returns, service deck and transfer brackets that it lacked.
  const envelope = mediaTowerEnvelope();
  const root = new THREE.Group();
  root.name = 'hero-media-tower-shell';
  root.position.set(envelope.building.x, 0, envelope.building.z);
  root.rotation.y = envelope.rotation;
  const batch = new HeroBatch();
  const frontZ = envelope.front + 0.01;
  const screenBottom = 4.74;
  const screenTop = 11.96;

  // Deep ground-floor arcade on all camera-facing sides. The original podium
  // was a single 4.8m-high mass; these projecting mullions, recessed panes,
  // sills and cornices split that grey wall before any signage is considered.
  const frontBayCount = 5;
  const frontBayWidth = (envelope.frontage - 0.8) / frontBayCount;
  batch.box('inkMetal', 0, 1.82, frontZ - 0.78, envelope.frontage - 1.05, 3.34, 0.26);
  for (let bay = 0; bay < frontBayCount; bay++) {
    const x = -envelope.frontage / 2 + 0.4 + (bay + 0.5) * frontBayWidth;
    const material: MaterialSlot = bay === 1 || bay === 4 ? 'warmGlass' : 'darkGlass';
    batch.box(material, x, 1.72, frontZ + 0.38, frontBayWidth - 0.42, 2.72, 0.16);
    batch.box('brightMetal', x, 0.34, frontZ + 0.45, frontBayWidth - 0.34, 0.14, 0.38);
    batch.box('brightMetal', x, 3.1, frontZ + 0.45, frontBayWidth - 0.34, 0.14, 0.38);
  }
  for (let edge = 0; edge <= frontBayCount; edge++) {
    const x = -envelope.frontage / 2 + 0.4 + edge * frontBayWidth;
    batch.box('concrete', x, 1.85, frontZ + 0.42, 0.26, 3.7, 0.62);
  }
  batch.box('brightMetal', 0, 3.72, frontZ + 0.48, envelope.frontage + 0.18, 0.28, 0.62);
  batch.box('inkMetal', 0, 4.02, frontZ + 0.92, envelope.frontage + 0.38, 0.2, 1.5, -0.08, 0, 0);
  for (const x of [-envelope.frontage * 0.34, 0, envelope.frontage * 0.34]) {
    batch.beam(
      'brightMetal',
      new THREE.Vector3(x, 3.66, frontZ + 0.28),
      new THREE.Vector3(x, 3.88, frontZ + 1.58),
      0.055,
      8,
    );
  }

  // The southwest entry camera sees the media tower obliquely, so the west
  // return is as important as the nominal front. Both side elevations receive
  // real window depth and a continuous load-bearing lintel instead of a blind
  // concrete slab. The east return keeps the cinema approach coherent too.
  const sideBayCount = 5;
  const sideBayDepth = (envelope.depth - 1.0) / sideBayCount;
  for (const side of [-1, 1]) {
    const sideX = side * (envelope.frontage / 2 + 0.16);
    for (let bay = 0; bay < sideBayCount; bay++) {
      const z = -envelope.depth / 2 + 0.5 + (bay + 0.5) * sideBayDepth;
      const material: MaterialSlot = (bay + (side > 0 ? 1 : 0)) % 3 === 0 ? 'warmGlass' : 'darkGlass';
      batch.box(material, sideX, 1.7, z, 0.16, 2.65, sideBayDepth - 0.38);
      batch.box('brightMetal', sideX + side * 0.09, 0.34, z, 0.34, 0.14, sideBayDepth - 0.28);
      batch.box('brightMetal', sideX + side * 0.09, 3.06, z, 0.34, 0.14, sideBayDepth - 0.28);
    }
    for (let edge = 0; edge <= sideBayCount; edge++) {
      const z = -envelope.depth / 2 + 0.5 + edge * sideBayDepth;
      batch.box('concrete', sideX + side * 0.12, 1.82, z, 0.48, 3.65, 0.25);
    }
    batch.box('brightMetal', sideX + side * 0.12, 3.7, 0, 0.5, 0.28, envelope.depth - 0.38);
    batch.box('inkMetal', sideX + side * 0.52, 3.98, 0, 1.1, 0.18, envelope.depth - 0.2, 0, 0, side * 0.035);
  }

  // Curved segmented upper/lower cases.  The centre bows 0.55m into the street
  // and each section owns side faces, unlike a single flat sign plane.
  const segments = 9;
  for (let i = 0; i < segments; i++) {
    const f = i / (segments - 1) * 2 - 1;
    const x = f * 5.45;
    const bow = 0.22 + (1 - f * f) * 0.52;
    const z = frontZ + bow;
    const ry = -f * 0.19;
    batch.box('inkMetal', x, screenBottom, z, 1.38, 0.34, 0.72, 0, ry, 0);
    batch.box('inkMetal', x, screenTop, z, 1.38, 0.34, 0.72, 0, ry, 0);
    if (i === 0 || i === segments - 1 || i % 2 === 0) {
      batch.box('brightMetal', x, (screenBottom + screenTop) / 2, z + 0.04, 0.16, screenTop - screenBottom, 0.48, 0, ry, 0);
    }
  }
  for (const side of [-1, 1]) {
    batch.box('inkMetal', side * 5.82, 8.35, frontZ + 0.12, 0.72, 7.75, 1.45, 0, side * 0.16, 0);
    batch.box('darkGlass', side * 5.93, 8.35, frontZ + 0.72, 0.4, 6.72, 0.2, 0, side * 0.16, 0);
  }

  // Screen service deck, rear truss and access ladder.  The braces connect the
  // casing back into the concrete podium so the display no longer floats.
  batch.box('brightMetal', 0, 4.18, frontZ + 0.05, 11.8, 0.18, 1.18);
  batch.box('inkMetal', 0, 4.72, frontZ + 0.55, 11.8, 1.05, 0.08);
  for (let i = -5; i <= 5; i++) {
    const x = i * 1.08;
    batch.box('inkMetal', x, 4.72, frontZ + 0.55, 0.07, 1.05, 0.08);
  }
  for (const x of [-5.25, -3.5, -1.75, 0, 1.75, 3.5, 5.25]) {
    batch.beam('brightMetal', new THREE.Vector3(x, 4.35, frontZ - 0.95), new THREE.Vector3(x, 5.0, frontZ + 0.38), 0.065, 8);
  }
  for (const side of [-1, 1]) {
    batch.beam('brightMetal', new THREE.Vector3(side * 5.55, 5.0, frontZ - 0.92), new THREE.Vector3(side * 5.8, 11.75, frontZ + 0.04), 0.085, 8);
    batch.beam('brightMetal', new THREE.Vector3(side * 4.65, 5.0, frontZ - 0.92), new THREE.Vector3(side * 5.8, 11.75, frontZ + 0.04), 0.065, 8);
  }
  for (let rung = 0; rung < 10; rung++) {
    batch.box('brightMetal', 5.48, 4.9 + rung * 0.7, frontZ - 0.64, 0.72, 0.055, 0.09);
  }
  batch.box('brightMetal', 5.18, 8.1, frontZ - 0.64, 0.08, 6.8, 0.08);
  batch.box('brightMetal', 5.78, 8.1, frontZ - 0.64, 0.08, 6.8, 0.08);

  // Offset vertical fins tie the low screen to the tower's upper volume and
  // create a changing silhouette from the crossroads and cinema approach.
  for (const [x, height, tilt] of [
    [-5.1, 16.5, -0.05],
    [-3.25, 12.8, -0.025],
    [3.8, 15.2, 0.035],
    [5.15, 18.0, 0.06],
  ] as const) {
    batch.box('inkMetal', x, 13.1 + height / 2, frontZ - 0.42, 0.22, height, 0.5, 0, 0, tilt);
  }
  batch.box('arenaAccent', -4.45, 21.8, frontZ - 0.08, 1.0, 0.34, 0.44, 0, 0, -0.08);
  batch.box('cinemaAccent', 4.5, 25.0, frontZ - 0.08, 1.0, 0.34, 0.44, 0, 0, 0.08);

  root.add(batch.build('hero-media-shell-batch', palette));
  return root;
}

function crossingGantry(palette: HeroMaterials): THREE.Group {
  // A compact structural frame just north of the crossing. It frames the first
  // view without increasing the road width or placing props in the driving line.
  const crosswalk = CROSSWALKS
    .filter((item) => item.dir === 'x')
    .sort((a, b) => a.z - b.z)[0];
  if (!crosswalk) throw new Error('Missing north crosswalk in cityplan');
  const root = new THREE.Group();
  root.name = 'hero-crossing-gantry';
  root.position.set(crosswalk.x, 0, crosswalk.z - 0.15);
  const batch = new HeroBatch();
  const half = crosswalk.w / 2 + 0.65;

  for (const x of [-half, half]) {
    batch.box('concrete', x, 0.24, 0, 0.62, 0.48, 0.72);
    batch.cylinder('inkMetal', x, 3.42, 0, 0.14, 6.45, 10);
    batch.box('brightMetal', x, 6.75, 0, 0.42, 0.22, 0.42);
  }
  // Two-chord truss with alternating diagonals.
  for (const y of [6.25, 7.15]) {
    batch.box('inkMetal', 0, y, 0, half * 2, 0.13, 0.13);
  }
  const bays = 6;
  for (let i = 0; i <= bays; i++) {
    const x = -half + (i / bays) * half * 2;
    batch.box('inkMetal', x, 6.7, 0, 0.11, 0.9, 0.11);
    if (i < bays) {
      const next = -half + ((i + 1) / bays) * half * 2;
      batch.beam(
        'brightMetal',
        new THREE.Vector3(x, i % 2 ? 7.08 : 6.32, 0),
        new THREE.Vector3(next, i % 2 ? 6.32 : 7.08, 0),
        0.045,
        6,
      );
    }
  }
  // Signal heads are thick casings attached by proper drops and back plates.
  for (const x of [-2.55, 0, 2.55]) {
    batch.box('brightMetal', x, 5.72, 0, 0.09, 0.95, 0.09);
    batch.box('inkMetal', x, 5.08, 0, 0.72, 0.82, 0.48);
    for (const lightY of [4.83, 5.08, 5.33]) {
      batch.cylinder(lightY === 5.08 ? 'cinemaAccent' : 'arenaAccent', x, lightY, 0.28, 0.1, 0.12, 10, Math.PI / 2, 0, 0);
    }
  }
  // Side-mounted cable tray and junction boxes connect the gantry to the street
  // utilities, avoiding an isolated "game prop" appearance.
  batch.box('brightMetal', -half - 0.28, 3.4, 0, 0.26, 5.2, 0.28);
  batch.box('inkMetal', -half - 0.4, 1.7, 0.12, 0.66, 0.92, 0.38);
  batch.box('inkMetal', -half - 0.4, 3.0, 0.12, 0.52, 0.58, 0.34);
  batch.cylinder('brightMetal', -half - 0.46, 4.55, 0.05, 0.055, 2.8, 8);

  root.add(batch.build('hero-crossing-gantry-batch', palette));
  return root;
}

let cachedHeroStructures: THREE.Group | null = null;

function createHeroStreetStructures(): THREE.Group {
  if (cachedHeroStructures) return cachedHeroStructures;
  const palette = materials();
  const group = new THREE.Group();
  group.name = 'hero-street-structures';
  group.add(
    cinemaStructure(palette),
    arenaStructure(palette),
    clubStructure(palette),
    mediaTowerScreenShell(palette),
    crossingGantry(palette),
  );
  cachedHeroStructures = group;
  return group;
}

/**
 * Mount once in City after Buildings. The component owns no interaction state;
 * shared venue doors, routes and collision data therefore remain authoritative.
 */
export function HeroStreetStructures() {
  const group = useMemo(() => createHeroStreetStructures(), []);
  return <primitive object={group} />;
}

export default HeroStreetStructures;

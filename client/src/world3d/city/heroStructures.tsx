/** Human-scale entrances for the three public venues on Tsukishio Street. */
import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDINGS, VENUES, cityBuildingLocalSize } from '@nexuspark/shared';
import { surfaceMaterial } from './materials';
import { applyPhysicalUv } from './physicalUv';
import { ACCENT } from './palette';

type MaterialSlot =
  | 'concrete' | 'paleConcrete' | 'brick' | 'inkMetal' | 'brightMetal'
  | 'darkGlass' | 'warmGlass' | 'cinemaAccent' | 'arenaAccent' | 'clubWood';
type HeroMaterials = Record<MaterialSlot, THREE.MeshStandardMaterial>;
type VenueKey = (typeof VENUES)[number]['key'];

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDERS = new Map<number, THREE.CylinderGeometry>();
const UP = new THREE.Vector3(0, 1, 0);
const PHYSICAL_UV_SLOTS = new Set<MaterialSlot>([
  'concrete', 'paleConcrete', 'brick', 'inkMetal', 'brightMetal', 'clubWood',
]);

function unitCylinder(segments = 8): THREE.CylinderGeometry {
  const cached = UNIT_CYLINDERS.get(segments);
  if (cached) return cached;
  const geometry = new THREE.CylinderGeometry(1, 1, 1, segments, 1, false);
  UNIT_CYLINDERS.set(segments, geometry);
  return geometry;
}

function venueEnvelope(key: VenueKey) {
  const venue = VENUES.find((candidate) => candidate.key === key);
  const building = BUILDINGS.find((candidate) => candidate.venue === key);
  if (!venue || !building) throw new Error(`Missing cityplan envelope for ${key}`);
  const rotation = building.ry ?? 0;
  const size = cityBuildingLocalSize(building);
  const dx = venue.x - building.x;
  const dz = venue.z - building.z;
  return {
    building,
    rotation,
    frontage: size.frontage,
    front: size.depth / 2,
    localDoorX: dx * Math.cos(rotation) - dz * Math.sin(rotation),
  };
}

function createMaterials(): HeroMaterials {
  const concrete = surfaceMaterial('oldConcrete');
  concrete.color.set('#85837f');
  const paleConcrete = surfaceMaterial('paintedConcrete');
  paleConcrete.color.set('#d8d0c2');
  const brick = surfaceMaterial('brick');
  brick.color.set('#76504b');
  const inkMetal = surfaceMaterial('metal');
  inkMetal.color.set('#202833');
  inkMetal.metalness = 0.48;
  inkMetal.roughness = 0.62;
  const brightMetal = surfaceMaterial('brushedMetal');
  brightMetal.color.set('#8f9ca4');
  brightMetal.metalness = 0.62;
  brightMetal.roughness = 0.46;
  const darkGlass = surfaceMaterial('darkGlass');
  darkGlass.color.set('#193743');
  darkGlass.metalness = 0.34;
  darkGlass.roughness = 0.28;
  darkGlass.emissive.set('#0d303a');
  darkGlass.emissiveIntensity = 0.12;
  darkGlass.transparent = true;
  darkGlass.opacity = 0.64;
  darkGlass.depthWrite = false;
  const warmGlass = surfaceMaterial('glass');
  warmGlass.color.set('#caa66e');
  warmGlass.emissive.set('#6e421c');
  warmGlass.emissiveIntensity = 0.2;
  warmGlass.transparent = true;
  warmGlass.opacity = 0.72;
  warmGlass.depthWrite = false;
  const cinemaAccent = surfaceMaterial('plasticLightbox');
  cinemaAccent.color.set(ACCENT.cinemaSign);
  cinemaAccent.emissive.set('#7c122f');
  cinemaAccent.emissiveIntensity = 0.24;
  const arenaAccent = surfaceMaterial('plasticLightbox');
  arenaAccent.color.set(ACCENT.netcafeSign);
  arenaAccent.emissive.set('#073d62');
  arenaAccent.emissiveIntensity = 0.26;
  const clubWood = surfaceMaterial('wood');
  clubWood.color.set('#6b422c');
  return {
    concrete, paleConcrete, brick, inkMetal, brightMetal,
    darkGlass, warmGlass, cinemaAccent, arenaAccent, clubWood,
  };
}

/** Material-aware batching keeps the authored entrance anatomy inexpensive. */
class HeroBatch {
  private readonly parts = new Map<MaterialSlot, THREE.BufferGeometry[]>();

  private add(
    slot: MaterialSlot,
    source: THREE.BufferGeometry,
    position: THREE.Vector3,
    scale: THREE.Vector3,
    quaternion: THREE.Quaternion,
  ): void {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    if (PHYSICAL_UV_SLOTS.has(slot)) applyPhysicalUv(geometry, scale);
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
    this.add(
      slot, UNIT_BOX, new THREE.Vector3(x, y, z), new THREE.Vector3(w, h, d),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    );
  }

  cylinder(
    slot: MaterialSlot,
    x: number, y: number, z: number,
    radius: number, height: number, segments = 8,
  ): void {
    this.add(
      slot, unitCylinder(segments), new THREE.Vector3(x, y, z),
      new THREE.Vector3(radius, height, radius), new THREE.Quaternion(),
    );
  }

  beam(slot: MaterialSlot, from: THREE.Vector3, to: THREE.Vector3, radius: number): void {
    const direction = to.clone().sub(from);
    const length = direction.length();
    if (length < 0.001) return;
    this.add(
      slot, unitCylinder(8), from.clone().lerp(to, 0.5),
      new THREE.Vector3(radius, length, radius),
      new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()),
    );
  }

  geometry(slot: MaterialSlot, source: THREE.BufferGeometry, position: THREE.Vector3): void {
    this.add(slot, source, position, new THREE.Vector3(1, 1, 1), new THREE.Quaternion());
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

function portalGeometry(
  width: number, height: number, opening: number, top: number, depth: number,
): THREE.ExtrudeGeometry {
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
    depth, bevelEnabled: true, bevelSegments: 1,
    bevelSize: 0.055, bevelThickness: 0.055, curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function neighborhoodVenueEntrance(key: VenueKey, palette: HeroMaterials): THREE.Group {
  const envelope = venueEnvelope(key);
  const root = new THREE.Group();
  root.name = `neighborhood-venue-${key}`;
  root.position.set(envelope.building.x, 0, envelope.building.z);
  root.rotation.y = envelope.rotation;
  const config = key === 'cinema'
    ? { portalW: 5.4, portalH: 4.65, openingW: 3.8, accent: 'cinemaAccent' as const, glass: 'darkGlass' as const }
    : key === 'netcafe'
      ? { portalW: 4.8, portalH: 4.25, openingW: 3.4, accent: 'arenaAccent' as const, glass: 'darkGlass' as const }
      : { portalW: 4.5, portalH: 4.05, openingW: 3.2, accent: 'clubWood' as const, glass: 'warmGlass' as const };
  const batch = new HeroBatch();
  const front = envelope.front + 0.04;
  const portalHalf = config.portalW / 2;
  // Venue doors are not necessarily centred in their host building (the
  // cinema door sits four metres left of centre). Size each return from the
  // real door-to-boundary span so a venue wing can never cover its neighbour.
  const sideBays = ([-1, 1] as const).map((side) => {
    const available = side < 0
      ? envelope.frontage / 2 + envelope.localDoorX - portalHalf
      : envelope.frontage / 2 - envelope.localDoorX - portalHalf;
    const width = Math.min(4.4, Math.max(0.72, available - 0.65));
    return {
      side,
      width,
      x: side * (portalHalf + 0.35 + width / 2),
    };
  });

  batch.geometry(
    'paleConcrete',
    portalGeometry(config.portalW, config.portalH, config.openingW, 0.62, 0.38),
    new THREE.Vector3(0, 0.08, front + 0.04),
  );
  // A shallow but visible vestibule sits behind the glass. Its rear wall,
  // ceiling and side returns make the entrance legible without the UI prompt.
  batch.box('paleConcrete', 0, 2.05, front - 1.2, config.openingW + 0.18, 3.85, 0.18);
  batch.box('paleConcrete', 0, 3.88, front - 0.82, config.openingW + 0.12, 0.12, 0.78);
  batch.box('paleConcrete', -config.openingW / 2, 2.05, front - 0.82, 0.12, 3.7, 0.78);
  batch.box('paleConcrete', config.openingW / 2, 2.05, front - 0.82, 0.12, 3.7, 0.78);
  batch.box(key === 'gameroom' ? 'warmGlass' : 'brightMetal', 0, 2.48, front - 1.08,
    config.openingW * 0.62, 0.12, 0.06);
  for (const side of [-1, 1]) {
    batch.box(key === 'cinema' ? 'cinemaAccent' : key === 'netcafe' ? 'arenaAccent' : 'clubWood',
      side * config.openingW * 0.3, 1.65, front - 1.08, config.openingW * 0.18, 1.18, 0.06);
  }
  batch.box(config.glass, 0, 2.05, front - 0.48, config.openingW - 0.24, 3.42, 0.12);
  batch.box('brightMetal', 0, 0.32, front - 0.3, config.openingW - 0.08, 0.13, 0.46);
  batch.box('brightMetal', 0, 3.78, front - 0.3, config.openingW - 0.08, 0.13, 0.46);
  batch.box('brightMetal', 0, 2.05, front - 0.2, 0.1, 3.5, 0.24);
  for (const { side, width: sideBayW, x } of sideBays) {
    batch.cylinder('brightMetal', side * 0.28, 1.75, front - 0.06, 0.035, 0.54);
    batch.box('brick', x, 2.05, front - 0.34, sideBayW, 3.92, 0.34);
    batch.box(side === -1 && key === 'gameroom' ? 'warmGlass' : 'darkGlass', x, 2, front - 0.1, sideBayW - 0.38, 3.12, 0.12);
    batch.box('brightMetal', x, 0.42, front + 0.02, sideBayW - 0.22, 0.13, 0.34);
    batch.box('brightMetal', x, 3.58, front + 0.02, sideBayW - 0.22, 0.13, 0.34);
    batch.box('inkMetal', x, 2, front + 0.02, 0.1, 3.22, 0.26);
  }

  batch.box(config.accent, 0, 4.1, front + 0.62, config.portalW + 0.7, 0.22, 1.28);
  batch.box('inkMetal', 0, 3.94, front + 0.58, config.portalW + 0.28, 0.08, 1.02);
  for (const x of [-config.portalW * 0.32, 0, config.portalW * 0.32]) {
    batch.box('brightMetal', x, 3.88, front + 0.58, 0.06, 0.08, 0.9);
  }
  for (const x of [-config.portalW * 0.38, config.portalW * 0.38]) {
    batch.beam(
      'brightMetal', new THREE.Vector3(x, 4.18, front + 1.18),
      new THREE.Vector3(x, 5.15, front - 0.08), 0.035,
    );
  }

  batch.box('inkMetal', config.portalW / 2 + 0.34, 1.42, front + 0.13, 0.42, 0.72, 0.12);
  batch.box(config.accent, config.portalW / 2 + 0.34, 1.55, front + 0.21, 0.28, 0.24, 0.06);
  batch.box('brightMetal', -envelope.frontage / 2 + 0.42, 1.05, front - 0.18, 0.52, 0.78, 0.3);
  batch.cylinder('inkMetal', envelope.frontage / 2 - 0.32, 2.35, front - 0.15, 0.055, 4.7);
  batch.box('paleConcrete', 0, 0.1, front + 0.34, config.openingW + 0.4, 0.2, 0.82);
  batch.box('inkMetal', 0, 0.22, front + 0.55, config.openingW - 0.42, 0.04, 0.46);

  const body = batch.build(`neighborhood-venue-${key}-batch`, palette);
  body.position.x = envelope.localDoorX;
  root.add(body);
  return root;
}

let cachedHeroStructures: THREE.Group | null = null;

function createHeroStreetStructures(): THREE.Group {
  if (cachedHeroStructures) return cachedHeroStructures;
  const palette = createMaterials();
  const group = new THREE.Group();
  group.name = 'hero-street-structures';
  group.add(
    neighborhoodVenueEntrance('cinema', palette),
    neighborhoodVenueEntrance('netcafe', palette),
    neighborhoodVenueEntrance('gameroom', palette),
  );
  cachedHeroStructures = group;
  return group;
}

export function HeroStreetStructures() {
  const group = useMemo(() => createHeroStreetStructures(), []);
  return <primitive object={group} />;
}

export default HeroStreetStructures;

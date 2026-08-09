import * as THREE from 'three';

/**
 * One UV unit covers this many metres before the material's kind-specific
 * repeat is applied.  For example the brick albedo repeats 2.8 times per UV
 * unit, so its four-brick canvas row resolves to roughly 29 cm wide bricks.
 */
const METRES_PER_UV = 3.2;

/** Keep very small fittings from collapsing to a single texture texel. */
const MIN_AXIS_UV_SPAN = 0.125;

function axisSpan(extent: number, scale: number): number {
  return Math.max(MIN_AXIS_UV_SPAN, Math.abs(extent * scale) / METRES_PER_UV);
}

/**
 * Regenerate box/profile UVs in physical space without mutating a shared map.
 *
 * Geometry is expected to still be in local space.  Dominant face normals pick
 * the two planar axes; bevel faces therefore inherit the nearest facade plane.
 * This works for BoxGeometry and the chamfered/extruded facade profiles used by
 * buildings.tsx. Cylinders and authored screen/plane UVs deliberately opt out.
 */
export function applyPhysicalUv(
  geometry: THREE.BufferGeometry,
  scale = new THREE.Vector3(1, 1, 1),
): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!position || !normal || position.count !== normal.count) return;

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return;

  const extent = bounds.getSize(new THREE.Vector3());
  const spanX = axisSpan(extent.x, scale.x);
  const spanY = axisSpan(extent.y, scale.y);
  const spanZ = axisSpan(extent.z, scale.z);
  const safeX = Math.max(extent.x, Number.EPSILON);
  const safeY = Math.max(extent.y, Number.EPSILON);
  const safeZ = Math.max(extent.z, Number.EPSILON);
  const uv = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i += 1) {
    const x = (position.getX(i) - bounds.min.x) / safeX;
    const y = (position.getY(i) - bounds.min.y) / safeY;
    const z = (position.getZ(i) - bounds.min.z) / safeZ;
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));

    if (nx >= ny && nx >= nz) {
      uv[i * 2] = z * spanZ;
      uv[i * 2 + 1] = y * spanY;
    } else if (ny >= nz) {
      uv[i * 2] = x * spanX;
      uv[i * 2 + 1] = z * spanZ;
    } else {
      uv[i * 2] = x * spanX;
      uv[i * 2 + 1] = y * spanY;
    }
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

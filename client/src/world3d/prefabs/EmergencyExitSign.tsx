import * as THREE from 'three';

type P3 = [number, number, number];
type Arrow = 'left' | 'right' | 'none';

const exitTextures = new Map<Arrow, THREE.CanvasTexture>();

function exitTexture(arrow: Arrow): THREE.CanvasTexture {
  const cached = exitTextures.get(arrow);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e7f4e9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1c9a5b';
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = '#16794a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 68px sans-serif';
  const glyph = arrow === 'left' ? '←  ' : arrow === 'right' ? '  →' : '';
  ctx.fillText(`${arrow === 'left' ? glyph : ''}非常口  EXIT${arrow === 'right' ? glyph : ''}`, 384, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  exitTextures.set(arrow, texture);
  return texture;
}

/** Shared wall-mounted emergency sign. It is deliberately thin and collisionless:
 * placement must stay on an existing architectural wall or portal header. */
export function EmergencyExitSign({
  position,
  ry = 0,
  arrow = 'none',
  width = 1.8,
}: {
  position: P3;
  ry?: number;
  arrow?: Arrow;
  width?: number;
}) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh position={[0, 0, -0.035]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.14, 0.56, 0.12]} />
        <meshStandardMaterial color="#26342e" roughness={0.58} metalness={0.38} />
      </mesh>
      <mesh position={[0, 0, 0.031]} castShadow={false}>
        <planeGeometry args={[width, 0.44]} />
        <meshBasicMaterial map={exitTexture(arrow)} toneMapped={false} />
      </mesh>
      <pointLight position={[0, -0.08, 0.38]} color="#7bd7a0" intensity={1.15} distance={2.8} decay={2} />
    </group>
  );
}

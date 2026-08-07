import * as THREE from 'three';

export type SurfaceKind =
  | 'oldConcrete' | 'paintedConcrete' | 'brick' | 'metal' | 'brushedMetal'
  | 'darkGlass' | 'glass' | 'wetAsphalt' | 'sidewalk' | 'plasticLightbox'
  | 'wood' | 'acousticFabric' | 'cinemaCarpet' | 'seatFabric';

const DETAIL_SIZE = 96;
const detailCache = new Map<string, THREE.CanvasTexture>();

function detailTexture(kind: SurfaceKind): THREE.CanvasTexture {
  const hit = detailCache.get(kind);
  if (hit) return hit;
  const c = document.createElement('canvas'); c.width = DETAIL_SIZE; c.height = DETAIL_SIZE;
  const ctx = c.getContext('2d')!;
  const seed = kind.split('').reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 17);
  let state = seed >>> 0;
  const rand = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0xffffffff; };
  ctx.fillStyle = '#858585'; ctx.fillRect(0, 0, DETAIL_SIZE, DETAIL_SIZE);
  for (let y = 0; y < DETAIL_SIZE; y += 3) {
    for (let x = 0; x < DETAIL_SIZE; x += 3) {
      const v = 104 + Math.floor(rand() * 76);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 2 + (rand() > 0.86 ? 1 : 0), 2 + (rand() > 0.9 ? 1 : 0));
    }
  }
  if (kind === 'brick') {
    ctx.strokeStyle = 'rgba(25,25,25,0.45)'; ctx.lineWidth = 2;
    for (let y = 0; y <= DETAIL_SIZE; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(DETAIL_SIZE, y); ctx.stroke();
      const offset = (y / 16) % 2 ? 12 : 0;
      for (let x = offset; x <= DETAIL_SIZE; x += 24) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 16); ctx.stroke(); }
    }
  }
  if (kind === 'brushedMetal' || kind === 'metal') {
    ctx.strokeStyle = 'rgba(230,240,245,0.18)'; ctx.lineWidth = 1;
    for (let y = 0; y < DETAIL_SIZE; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(DETAIL_SIZE, y + (rand() - 0.5) * 2); ctx.stroke(); }
  }
  if (kind === 'wood') {
    ctx.strokeStyle = 'rgba(70,35,20,0.3)'; ctx.lineWidth = 2;
    for (let y = 3; y < DETAIL_SIZE; y += 9) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(24, y - 3, 55, y + 4, DETAIL_SIZE, y - 1); ctx.stroke(); }
  }
  if (kind === 'acousticFabric' || kind === 'seatFabric') {
    ctx.strokeStyle = 'rgba(245,245,245,0.14)'; ctx.lineWidth = 1;
    for (let i = -DETAIL_SIZE; i < DETAIL_SIZE * 2; i += 5) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + DETAIL_SIZE, DETAIL_SIZE); ctx.stroke(); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(kind === 'brick' ? 2.8 : 5.5, kind === 'brick' ? 3.2 : 5.5);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  detailCache.set(kind, tex);
  return tex;
}

const CONFIG: Record<SurfaceKind, { color: string; roughness: number; metalness: number; bump: number }> = {
  oldConcrete: { color: '#9e9a92', roughness: 0.92, metalness: 0.02, bump: 0.12 },
  paintedConcrete: { color: '#d6d0c4', roughness: 0.84, metalness: 0.03, bump: 0.08 },
  brick: { color: '#8d5550', roughness: 0.9, metalness: 0.02, bump: 0.16 },
  metal: { color: '#303842', roughness: 0.52, metalness: 0.72, bump: 0.05 },
  brushedMetal: { color: '#68727b', roughness: 0.34, metalness: 0.88, bump: 0.035 },
  darkGlass: { color: '#122734', roughness: 0.18, metalness: 0.56, bump: 0.02 },
  glass: { color: '#96c9d5', roughness: 0.16, metalness: 0.26, bump: 0.012 },
  wetAsphalt: { color: '#292f38', roughness: 0.34, metalness: 0.22, bump: 0.08 },
  sidewalk: { color: '#c9c2b6', roughness: 0.86, metalness: 0.02, bump: 0.11 },
  plasticLightbox: { color: '#e3e6e5', roughness: 0.3, metalness: 0.16, bump: 0.02 },
  wood: { color: '#765138', roughness: 0.78, metalness: 0.02, bump: 0.08 },
  acousticFabric: { color: '#513544', roughness: 0.98, metalness: 0, bump: 0.08 },
  cinemaCarpet: { color: '#3b2430', roughness: 0.99, metalness: 0, bump: 0.12 },
  seatFabric: { color: '#7d2438', roughness: 0.94, metalness: 0.01, bump: 0.1 },
};

export function surfaceMaterial(kind: SurfaceKind, vertexColors = false): THREE.MeshStandardMaterial {
  const c = CONFIG[kind];
  const m = new THREE.MeshStandardMaterial({
    color: vertexColors ? '#ffffff' : c.color,
    roughness: c.roughness,
    metalness: c.metalness,
    roughnessMap: detailTexture(kind),
    bumpMap: detailTexture(kind),
    bumpScale: c.bump,
    vertexColors,
    flatShading: false,
  });
  return m;
}

import * as THREE from 'three';

export type SurfaceKind =
  | 'oldConcrete' | 'paintedConcrete' | 'brick' | 'metal' | 'brushedMetal'
  | 'darkGlass' | 'glass' | 'wetAsphalt' | 'sidewalk' | 'plasticLightbox'
  | 'wood' | 'acousticFabric' | 'cinemaCarpet' | 'seatFabric';

const DETAIL_SIZE = 96;
const ALBEDO_SIZE = 128;
const ROUGHNESS_SIZE = 64;
const detailCache = new Map<string, THREE.CanvasTexture>();
const albedoCache = new Map<SurfaceKind, THREE.CanvasTexture>();
const roughnessCache = new Map<SurfaceKind, THREE.CanvasTexture>();

const ALBEDO_REPEAT: Record<SurfaceKind, [number, number]> = {
  oldConcrete: [2.4, 2.4],
  paintedConcrete: [1.8, 2.2],
  brick: [2.8, 3.2],
  metal: [2.2, 2.2],
  brushedMetal: [3.2, 3.2],
  darkGlass: [1.25, 1.25],
  glass: [1.25, 1.25],
  wetAsphalt: [3.2, 3.2],
  sidewalk: [2.6, 2.6],
  plasticLightbox: [1, 1],
  wood: [2.2, 3.4],
  acousticFabric: [4.2, 4.2],
  cinemaCarpet: [4.6, 4.6],
  seatFabric: [4.4, 4.4],
};

const ROUGHNESS_BASE: Record<SurfaceKind, number> = {
  oldConcrete: 242,
  paintedConcrete: 247,
  brick: 239,
  metal: 225,
  brushedMetal: 218,
  darkGlass: 216,
  glass: 222,
  wetAsphalt: 224,
  sidewalk: 244,
  plasticLightbox: 230,
  wood: 238,
  acousticFabric: 251,
  cinemaCarpet: 253,
  seatFabric: 247,
};

function seededRandom(label: string) {
  let state = label.split('').reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 17) >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function line(
  ctx: CanvasRenderingContext2D,
  strokeStyle: string,
  lineWidth: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/**
 * A low-frequency, colour-space-correct albedo modulation for each physical
 * surface.  These are deliberately near-neutral: callers can still tint a
 * material (and instanced vertex colours remain authoritative), while wood,
 * masonry, textiles and metals no longer react like the same painted plastic.
 */
function albedoTexture(kind: SurfaceKind): THREE.CanvasTexture {
  const hit = albedoCache.get(kind);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = ALBEDO_SIZE;
  canvas.height = ALBEDO_SIZE;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(`albedo:${kind}`);
  const size = ALBEDO_SIZE;

  const fill = (colour: string) => {
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, size, size);
  };
  const flecks = (count: number, colour: string, minRadius = 0.45, maxRadius = 1.35) => {
    ctx.fillStyle = colour;
    for (let i = 0; i < count; i += 1) {
      const radius = minRadius + rand() * (maxRadius - minRadius);
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const mottling = (count: number, colour: string, minRadius: number, maxRadius: number) => {
    ctx.fillStyle = colour;
    for (let i = 0; i < count; i += 1) {
      const radius = minRadius + rand() * (maxRadius - minRadius);
      ctx.beginPath();
      ctx.ellipse(rand() * size, rand() * size, radius, radius * (0.45 + rand() * 0.8), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  switch (kind) {
    case 'oldConcrete': {
      fill('#f2f0eb');
      mottling(24, 'rgba(92,82,70,0.055)', 5, 15);
      mottling(12, 'rgba(255,255,250,0.075)', 4, 11);
      flecks(90, 'rgba(68,64,59,0.11)', 0.35, 1.05);
      line(ctx, 'rgba(74,70,65,0.16)', 1.2, 0, 87, size, 87);
      line(ctx, 'rgba(255,255,252,0.18)', 1, 0, 89, size, 89);
      break;
    }
    case 'paintedConcrete': {
      fill('#f6f3ed');
      for (let x = 4; x < size; x += 15) {
        ctx.fillStyle = x % 30 < 10 ? 'rgba(255,255,255,0.035)' : 'rgba(96,89,78,0.022)';
        ctx.fillRect(x, 0, 7 + rand() * 5, size);
      }
      mottling(10, 'rgba(115,103,88,0.035)', 7, 18);
      line(ctx, 'rgba(80,76,69,0.10)', 1, 0, 64, size, 64);
      break;
    }
    case 'brick': {
      fill('#f3e9e5');
      const rowHeight = 16;
      const brickWidth = 32;
      for (let row = 0; row < size / rowHeight; row += 1) {
        const y = row * rowHeight;
        ctx.fillStyle = row % 3 === 0 ? 'rgba(103,48,41,0.055)' : 'rgba(255,242,233,0.045)';
        ctx.fillRect(0, y + 2, size, rowHeight - 3);
        line(ctx, 'rgba(103,99,94,0.30)', 2, 0, y, size, y);
        line(ctx, 'rgba(255,255,250,0.18)', 1, 0, y + 2, size, y + 2);
        const offset = row % 2 === 0 ? 0 : brickWidth / 2;
        for (let x = offset; x < size; x += brickWidth) {
          line(ctx, 'rgba(101,97,92,0.26)', 1.7, x, y, x, y + rowHeight);
        }
      }
      flecks(45, 'rgba(94,46,40,0.10)', 0.5, 1.3);
      break;
    }
    case 'metal': {
      fill('#eef1f2');
      for (let x = 0; x < size; x += 32) {
        ctx.fillStyle = x % 64 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(45,59,68,0.045)';
        ctx.fillRect(x + 2, 0, 29, size);
        line(ctx, 'rgba(39,47,53,0.22)', 1.4, x, 0, x, size);
        line(ctx, 'rgba(255,255,255,0.16)', 1, x + 2, 0, x + 2, size);
      }
      for (let y = 16; y < size; y += 32) {
        line(ctx, 'rgba(42,50,56,0.12)', 1, 0, y, size, y);
      }
      flecks(22, 'rgba(91,64,46,0.12)', 0.6, 1.45);
      break;
    }
    case 'brushedMetal': {
      fill('#f3f5f5');
      for (let y = 1; y < size; y += 4) {
        const offset = (rand() - 0.5) * 1.4;
        line(ctx, 'rgba(36,50,58,0.075)', 0.65, 0, y, size, y + offset);
      }
      for (let y = 15; y < size; y += 31) {
        line(ctx, 'rgba(255,255,255,0.12)', 1, 0, y, size, y);
      }
      break;
    }
    case 'darkGlass':
    case 'glass': {
      fill(kind === 'darkGlass' ? '#f1f7f8' : '#f5faf9');
      const gradient = ctx.createLinearGradient(0, 0, size, 0);
      gradient.addColorStop(0, 'rgba(150,205,218,0.025)');
      gradient.addColorStop(0.36, 'rgba(255,255,255,0.12)');
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      gradient.addColorStop(0.82, 'rgba(118,179,194,0.06)');
      gradient.addColorStop(1, 'rgba(255,255,255,0.08)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      line(ctx, 'rgba(205,233,239,0.13)', 1, 33, 0, 33, size);
      line(ctx, 'rgba(86,135,147,0.07)', 1, 96, 0, 96, size);
      break;
    }
    case 'wetAsphalt': {
      fill('#f0f2f4');
      mottling(18, 'rgba(37,45,52,0.07)', 5, 16);
      mottling(8, 'rgba(245,250,252,0.08)', 4, 12);
      flecks(105, 'rgba(35,40,44,0.17)', 0.45, 1.2);
      flecks(40, 'rgba(247,250,250,0.12)', 0.35, 0.8);
      ctx.strokeStyle = 'rgba(42,46,49,0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, 101);
      ctx.bezierCurveTo(27, 91, 48, 111, 79, 99);
      ctx.bezierCurveTo(101, 91, 111, 92, 138, 82);
      ctx.stroke();
      break;
    }
    case 'sidewalk': {
      fill('#f3f0e9');
      for (let y = 0; y <= size; y += 32) {
        line(ctx, 'rgba(71,72,70,0.20)', 1.4, 0, y, size, y);
        line(ctx, 'rgba(255,255,255,0.18)', 1, 0, y + 2, size, y + 2);
      }
      for (let x = 0; x <= size; x += 32) {
        line(ctx, 'rgba(73,73,70,0.17)', 1.2, x, 0, x, size);
      }
      mottling(16, 'rgba(90,84,73,0.035)', 3, 9);
      flecks(65, 'rgba(65,64,60,0.10)', 0.35, 0.9);
      break;
    }
    case 'plasticLightbox': {
      fill('#f7f7f2');
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, 'rgba(255,255,255,0.18)');
      gradient.addColorStop(0.46, 'rgba(225,232,231,0.02)');
      gradient.addColorStop(0.62, 'rgba(185,198,198,0.07)');
      gradient.addColorStop(1, 'rgba(255,255,255,0.13)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      break;
    }
    case 'wood': {
      fill('#f2e4d8');
      for (let y = 5; y < size; y += 13) {
        const wave = 1.8 + rand() * 2.5;
        ctx.strokeStyle = 'rgba(80,43,25,0.18)';
        ctx.lineWidth = 1.1 + rand() * 0.8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(27, y - wave, 45, y + wave, 68, y);
        ctx.bezierCurveTo(91, y - wave, 108, y + wave, size, y - 0.5);
        ctx.stroke();
        line(ctx, 'rgba(255,248,235,0.12)', 0.8, 0, y + 2.2, size, y + 1.8);
      }
      for (let i = 0; i < 7; i += 1) {
        const x = rand() * size;
        const y = rand() * size;
        ctx.strokeStyle = 'rgba(73,38,22,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x, y, 5 + rand() * 7, 1.4 + rand() * 1.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'acousticFabric':
    case 'seatFabric': {
      fill(kind === 'seatFabric' ? '#f5f1f1' : '#f3eef1');
      const gap = kind === 'seatFabric' ? 6 : 7;
      for (let i = -size; i < size * 2; i += gap) {
        line(ctx, 'rgba(55,45,51,0.095)', 0.75, i, 0, i + size, size);
        line(ctx, 'rgba(255,255,255,0.11)', 0.65, i + 2, 0, i + size + 2, size);
      }
      for (let i = 0; i < size * 2; i += gap * 2) {
        line(ctx, 'rgba(62,51,57,0.055)', 0.65, i, 0, i - size, size);
      }
      break;
    }
    case 'cinemaCarpet': {
      fill('#f2edef');
      mottling(30, 'rgba(65,39,51,0.07)', 2, 6);
      flecks(115, 'rgba(51,35,43,0.13)', 0.4, 1.1);
      flecks(55, 'rgba(255,246,239,0.11)', 0.35, 0.85);
      break;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...ALBEDO_REPEAT[kind]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  albedoCache.set(kind, tex);
  return tex;
}

/**
 * Roughness is intentionally separate from the darker height texture. Three.js
 * multiplies material roughness by the green channel of roughnessMap, so using
 * the old 0.4-0.7 height values made concrete and cloth behave like plastic.
 * These restrained 0.82-1.0 masks preserve the calibrated CONFIG values.
 */
function roughnessTexture(kind: SurfaceKind): THREE.CanvasTexture {
  const hit = roughnessCache.get(kind);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = ROUGHNESS_SIZE;
  canvas.height = ROUGHNESS_SIZE;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(`roughness:${kind}`);
  const size = ROUGHNESS_SIZE;
  const grey = (value: number, alpha = 1) => `rgba(${value},${value},${value},${alpha})`;
  const baseValue = ROUGHNESS_BASE[kind];

  ctx.fillStyle = grey(baseValue);
  ctx.fillRect(0, 0, size, size);

  if (kind === 'brick') {
    for (let y = 0; y <= size; y += 8) {
      line(ctx, grey(255, 0.72), 1.25, 0, y, size, y);
      const offset = (y / 8) % 2 === 0 ? 0 : 8;
      for (let x = offset; x <= size; x += 16) line(ctx, grey(252, 0.62), 1, x, y, x, y + 8);
    }
  } else if (kind === 'metal' || kind === 'brushedMetal') {
    const gap = kind === 'brushedMetal' ? 3 : 8;
    for (let y = 1; y < size; y += gap) {
      line(ctx, grey(Math.min(248, baseValue + 12), 0.34), 0.8, 0, y, size, y + (rand() - 0.5));
    }
  } else if (kind === 'wood') {
    for (let y = 3; y < size; y += 7) {
      ctx.strokeStyle = grey(218, 0.34);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(15, y - 1.5, 34, y + 1.5, size, y - 0.5);
      ctx.stroke();
    }
  } else if (kind === 'wetAsphalt') {
    ctx.fillStyle = grey(210, 0.26);
    for (let i = 0; i < 10; i += 1) {
      ctx.beginPath();
      ctx.ellipse(rand() * size, rand() * size, 3 + rand() * 6, 2 + rand() * 4, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'oldConcrete' || kind === 'paintedConcrete' || kind === 'sidewalk') {
    ctx.fillStyle = grey(Math.max(210, baseValue - 18), 0.22);
    for (let i = 0; i < 12; i += 1) {
      ctx.beginPath();
      ctx.ellipse(rand() * size, rand() * size, 2 + rand() * 5, 1.5 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'acousticFabric' || kind === 'seatFabric' || kind === 'cinemaCarpet') {
    const low = kind === 'cinemaCarpet' ? 242 : 238;
    for (let i = -size; i < size * 2; i += 5) {
      line(ctx, grey(low, 0.20), 0.7, i, 0, i + size, size);
    }
  } else if (kind === 'darkGlass' || kind === 'glass' || kind === 'plasticLightbox') {
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, grey(Math.max(210, baseValue - 6)));
    gradient.addColorStop(0.45, grey(Math.min(245, baseValue + 9)));
    gradient.addColorStop(1, grey(baseValue));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...ALBEDO_REPEAT[kind]);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 2;
  roughnessCache.set(kind, tex);
  return tex;
}

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
  wetAsphalt: { color: '#34383c', roughness: 0.72, metalness: 0.04, bump: 0.08 },
  sidewalk: { color: '#c9c2b6', roughness: 0.86, metalness: 0.02, bump: 0.11 },
  plasticLightbox: { color: '#e3e6e5', roughness: 0.3, metalness: 0.16, bump: 0.02 },
  wood: { color: '#765138', roughness: 0.78, metalness: 0.02, bump: 0.08 },
  acousticFabric: { color: '#513544', roughness: 0.98, metalness: 0, bump: 0.08 },
  cinemaCarpet: { color: '#3b2430', roughness: 0.99, metalness: 0, bump: 0.12 },
  seatFabric: { color: '#7d2438', roughness: 0.94, metalness: 0.01, bump: 0.1 },
};

/**
 * Build a physically layered material.  Large interior shells can opt out of
 * the micro maps while keeping the same calibrated albedo/roughness/metalness;
 * this avoids making a whole room's walls expensive pixel-for-pixel surfaces
 * on SwiftShader while facade modules keep their bump and roughness detail.
 */
export function surfaceMaterial(kind: SurfaceKind, vertexColors = false, micro = true): THREE.MeshStandardMaterial {
  const c = CONFIG[kind];
  const m = new THREE.MeshStandardMaterial({
    color: vertexColors ? '#ffffff' : c.color,
    roughness: c.roughness,
    metalness: c.metalness,
    vertexColors,
    flatShading: false,
  });
  if (micro) {
    m.map = albedoTexture(kind);
    m.roughnessMap = roughnessTexture(kind);
    m.bumpMap = detailTexture(kind);
    m.bumpScale = c.bump;
  }
  return m;
}

/** Interior fixtures: café counter, cinema seats, shop shelving, lobby
 *  fittings, and other public-space furniture. */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { surfaceMaterial } from '../city/materials';

const mat = (color: string, rough = 0.75, metal = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

export function CafeCounter({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const wood = useMemo(() => mat('#5e4632', 0.7), []);
  const top = useMemo(() => mat('#3a2d20', 0.4), []);
  const steel = useMemo(() => mat('#9aa5ad', 0.25, 0.8), []);
  const steamRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (steamRef.current) {
      const t = clock.elapsedTime;
      steamRef.current.position.y = 1.35 + (t % 1.6) * 0.22;
      (steamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - (t % 1.6) / 1.6);
    }
  });
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow material={wood}><boxGeometry args={[6.2, 1.1, 0.9]} /></mesh>
      <mesh position={[0, 1.12, 0]} castShadow material={top}><boxGeometry args={[6.4, 0.06, 1.0]} /></mesh>
      {/* espresso machine */}
      <group position={[-1.6, 1.15, -0.1]}>
        <mesh position={[0, 0.22, 0]} castShadow material={steel}><boxGeometry args={[0.75, 0.44, 0.5]} /></mesh>
        <mesh position={[0, 0.48, 0]} material={steel}><boxGeometry args={[0.6, 0.08, 0.4]} /></mesh>
        <mesh position={[-0.18, 0.1, 0.26]} material={steel}><cylinderGeometry args={[0.03, 0.03, 0.12, 8]} /></mesh>
        <mesh position={[0.18, 0.1, 0.26]} material={steel}><cylinderGeometry args={[0.03, 0.03, 0.12, 8]} /></mesh>
        <mesh position={[-0.18, 0.02, 0.28]}><cylinderGeometry args={[0.035, 0.03, 0.06, 10]} /><meshStandardMaterial color="#f5f0e8" /></mesh>
        <mesh ref={steamRef} position={[-0.18, 1.35, 0.28]}>
          <sphereGeometry args={[0.03, 6, 5]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </group>
      {/* pastry display */}
      <group position={[1.5, 1.15, 0]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <boxGeometry args={[1.4, 0.5, 0.7]} />
          <meshPhysicalMaterial color="#cfe0e8" roughness={0.05} transparent opacity={0.3} />
        </mesh>
        <mesh position={[0, 0.06, 0]} material={useMemo(() => mat('#e8e4dc', 0.5), [])}>
          <boxGeometry args={[1.35, 0.04, 0.65]} />
        </mesh>
        {[[-0.4, '#c98b4a'], [0, '#8a5a3a'], [0.4, '#e8b84a']].map(([x, c], i) => (
          <mesh key={i} position={[x as number, 0.12, 0.1]} castShadow>
            <cylinderGeometry args={[0.09, 0.11, 0.08, 10]} />
            <meshStandardMaterial color={c as string} roughness={0.7} />
          </mesh>
        ))}
      </group>
      {/* menu board behind */}
      <mesh position={[0, 2.2, -0.55]} rotation={[0.06, 0, 0]}>
        <planeGeometry args={[3.4, 1.1]} />
        <meshStandardMaterial map={useMenuTexture()} roughness={0.85} />
      </mesh>
    </group>
  );
}

let menuTex: THREE.CanvasTexture | null = null;
function useMenuTexture(): THREE.CanvasTexture {
  return useMemo(() => {
    if (menuTex) return menuTex;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 168;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(0, 0, 512, 168);
    ctx.fillStyle = '#f2e2c8';
    ctx.font = '700 30px "Segoe UI", sans-serif';
    ctx.fillText('菜单', 24, 42);
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('浓缩咖啡 …… 5 金币', 24, 84);
    ctx.fillText('团子可乐 …… 4 金币', 24, 116);
    ctx.fillText('披萨 …… 6 金币', 24, 148);
    ctx.fillText('找吧台的 Bea 点单!', 280, 84);
    ctx.fillText('窗边有点歌机 ♪', 280, 116);
    menuTex = new THREE.CanvasTexture(c);
    return menuTex;
  }, []);
}

export function CinemaSeat({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const fabric = useMemo(() => surfaceMaterial('seatFabric'), []);
  const frame = useMemo(() => surfaceMaterial('metal'), []);
  const trim = useMemo(() => mat('#c35a62', 0.8), []);
  const cup = useMemo(() => surfaceMaterial('brushedMetal'), []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.4, 0]} castShadow material={fabric}><boxGeometry args={[0.52, 0.12, 0.45]} /></mesh>
      <mesh position={[0, 0.68, -0.24]} rotation={[-0.12, 0, 0]} castShadow material={fabric}><boxGeometry args={[0.52, 0.65, 0.12]} /></mesh>
      <mesh position={[0, 0.68, -0.305]} material={trim}><boxGeometry args={[0.34, 0.035, 0.025]} /></mesh>
      {[-0.29, 0.29].map((x, i) => (
        <group key={i}>
          <mesh position={[x, 0.5, 0]} material={frame}><boxGeometry args={[0.06, 0.5, 0.45]} /></mesh>
          <mesh position={[x, 0.69, 0.08]} material={cup}><cylinderGeometry args={[0.055, 0.045, 0.045, 10]} /></mesh>
        </group>
      ))}
      {/* The seat origin is the actual floor/deck contact plane. */}
      <mesh position={[0, 0.19, 0]} material={frame}><boxGeometry args={[0.5, 0.38, 0.4]} /></mesh>
      <mesh position={[0, 0.04, 0]} material={frame}><boxGeometry args={[0.34, 0.08, 0.28]} /></mesh>
    </group>
  );
}

/** Carpeted cinema row platform. Its top is exactly `h`, matching layout heightZones. */
export function CinemaRiser({
  position, rotation, w, d, h,
}: {
  position: [number, number, number];
  rotation: number;
  w: number;
  d: number;
  h: number;
}) {
  const carpet = useMemo(() => {
    const material = surfaceMaterial('cinemaCarpet');
    material.color.set('#4a303d');
    material.roughness = 0.96;
    return material;
  }, []);
  const edge = useMemo(() => {
    const m = surfaceMaterial('brushedMetal');
    m.color.set('#ef9a62'); m.emissive.set('#ef7653'); m.emissiveIntensity = 0.42;
    return m;
  }, []);
  if (h <= 0) return null;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, h / 2, 0]} receiveShadow castShadow material={carpet}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <mesh position={[0, h + 0.008, -d / 2 + 0.035]} material={edge}>
        <boxGeometry args={[w, 0.016, 0.07]} />
      </mesh>
    </group>
  );
}

let concessionMenuTex: THREE.CanvasTexture | null = null;

function concessionMenuTexture(): THREE.CanvasTexture {
  if (concessionMenuTex) return concessionMenuTex;
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 240;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#281b1d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#d9ad73';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = '#f7dfbd';
  ctx.font = '700 66px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('売 店  ·  POPCORN  ·  DRINK', canvas.width / 2, 90);
  ctx.fillStyle = '#d9ad73';
  ctx.font = '500 38px sans-serif';
  ctx.fillText('注文  •  受取  •  キャッシュレス', canvas.width / 2, 164);
  concessionMenuTex = new THREE.CanvasTexture(canvas);
  concessionMenuTex.colorSpace = THREE.SRGBColorSpace;
  concessionMenuTex.needsUpdate = true;
  return concessionMenuTex;
}

export function Concession({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const body = useMemo(() => mat('#8a2f3f', 0.6), []);
  const top = useMemo(() => mat('#e8dcc8', 0.4), []);
  const dark = useMemo(() => mat('#2f2928', 0.58), []);
  const steel = useMemo(() => mat('#8f9aa2', 0.32, 0.72), []);
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#cfe5e8', roughness: 0.12, transparent: true, opacity: 0.34,
  }), []);
  const menu = useMemo(() => {
    const material = mat('#f2d39b', 0.44);
    material.emissive.set('#e29e55');
    material.emissiveIntensity = 0.34;
    return material;
  }, []);
  const menuTexture = useMemo(() => concessionMenuTexture(), []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <pointLight position={[0, 2.05, 0.75]} color="#ffd6a2" intensity={3.4} distance={5.6} decay={2} />
      {/* The public counter is intentionally lower than the cafe's adult-height
          bar: it remains usable and readable for the 0.62m dango player. */}
      <mesh position={[0, 0.43, 0]} castShadow material={body}><boxGeometry args={[3.2, 0.86, 0.9]} /></mesh>
      <mesh position={[0, 0.88, 0]} material={top}><boxGeometry args={[3.3, 0.05, 1.0]} /></mesh>
      {/* A lit menu, register and under-counter storage make this a staffed
          service point rather than a loose popcorn prop. */}
      <group position={[0, 1.58, 0.34]}>
        <mesh position={[0, 0, -0.035]} material={dark} castShadow>
          <boxGeometry args={[3.02, 0.72, 0.1]} />
        </mesh>
        {[-0.96, 0, 0.96].map((x, index) => (
          <group key={`menu-${x}`} position={[x, 0, 0.02]}>
            <mesh material={menu}><boxGeometry args={[0.78, 0.53, 0.025]} /></mesh>
            {[0.13, 0, -0.13].map((y, line) => (
              <mesh key={line} position={[0.03, y, 0.02]} material={index === 1 ? body : dark}>
                <boxGeometry args={[0.48 - line * 0.06, 0.025, 0.012]} />
              </mesh>
            ))}
          </group>
        ))}
        <mesh position={[0, 0, 0.07]} castShadow={false}>
          <planeGeometry args={[2.82, 0.62]} />
          <meshBasicMaterial map={menuTexture} toneMapped={false} />
        </mesh>
      </group>
      {/* popcorn machine */}
      <group position={[-1.0, 0.91, 0]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[0.6, 0.7, 0.5]} />
          <primitive object={glass} attach="material" />
        </mesh>
        <mesh position={[0, 0.72, 0]} material={body}><boxGeometry args={[0.64, 0.08, 0.54]} /></mesh>
        {[...Array(7)].map((_, i) => (
          <mesh key={i} position={[-0.2 + (i % 3) * 0.16, 0.12 + Math.floor(i / 3) * 0.1, 0.05]}>
            <sphereGeometry args={[0.05, 6, 5]} />
            <meshStandardMaterial color="#f5eeda" roughness={0.9} />
          </mesh>
        ))}
      </group>
      <mesh position={[0.9, 1.08, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.1, 0.4, 10]} />
        <meshStandardMaterial color="#c94f5f" roughness={0.6} />
      </mesh>
      <group position={[0.48, 0.91, 0.04]}>
        <mesh position={[0, 0.14, 0]} material={dark} castShadow><boxGeometry args={[0.42, 0.28, 0.42]} /></mesh>
        <mesh position={[0, 0.31, -0.08]} rotation={[-0.26, 0, 0]} material={menu}>
          <boxGeometry args={[0.34, 0.18, 0.035]} />
        </mesh>
      </group>
      {[-0.93, 0, 0.93].map((x) => (
        <group key={`service-door-${x}`} position={[x, 0.39, 0.456]}>
          <mesh material={dark} castShadow><boxGeometry args={[0.82, 0.62, 0.025]} /></mesh>
          <mesh position={[0.28, 0.08, 0.024]} material={steel}>
            <boxGeometry args={[0.035, 0.22, 0.025]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Compact cinema admission pedestal. Two of these define the lobby threshold
 * while leaving the central group-entry lane deliberately unobstructed. */
export function CinemaTicketGate({
  position,
  rotation,
  side = 1,
}: {
  position: [number, number, number];
  rotation: number;
  side?: number;
}) {
  const shell = useMemo(() => mat('#66727a', 0.42, 0.46), []);
  const steel = useMemo(() => mat('#9aa7ad', 0.28, 0.82), []);
  const screen = useMemo(() => {
    const material = mat('#54d7a0', 0.3);
    material.emissive.set('#30bf83');
    material.emissiveIntensity = 0.72;
    return material;
  }, []);
  const blue = useMemo(() => {
    const material = mat('#6bb6d8', 0.32);
    material.emissive.set('#3f9fc8');
    material.emissiveIntensity = 0.38;
    return material;
  }, []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <pointLight position={[0, 1.55, -0.45]} color="#92e9c2" intensity={2.4} distance={3.6} decay={2} />
      <mesh position={[0, 0.06, 0]} material={steel} castShadow>
        <cylinderGeometry args={[0.23, 0.26, 0.12, 10]} />
      </mesh>
      <mesh position={[0, 0.57, 0]} material={shell} castShadow receiveShadow>
        <boxGeometry args={[0.52, 1.02, 1.08]} />
      </mesh>
      <mesh position={[0, 1.105, -0.08]} rotation={[-0.18, 0, 0]} material={steel} castShadow>
        <boxGeometry args={[0.56, 0.12, 0.82]} />
      </mesh>
      <mesh position={[0, 1.17, -0.21]} rotation={[-0.18, 0, 0]} material={screen}>
        <boxGeometry args={[0.34, 0.035, 0.35]} />
      </mesh>
      {/* Scan direction is readable from the arriving side without relying on text. */}
      <group position={[0, 0.76, -0.555]}>
        <mesh material={blue}><boxGeometry args={[0.3, 0.22, 0.025]} /></mesh>
        <mesh position={[side * 0.035, 0.02, -0.018]} rotation={[0, 0, -side * Math.PI / 4]} material={shell}>
          <boxGeometry args={[0.12, 0.035, 0.018]} />
        </mesh>
        <mesh position={[side * 0.085, 0.02, -0.018]} rotation={[0, 0, side * Math.PI / 4]} material={shell}>
          <boxGeometry args={[0.12, 0.035, 0.018]} />
        </mesh>
      </group>
      <mesh position={[0, 1.43, 0.13]} material={steel} castShadow>
        <boxGeometry args={[0.045, 0.56, 0.045]} />
      </mesh>
      <mesh position={[0, 1.72, 0.13]} material={blue} castShadow>
        <boxGeometry args={[0.62, 0.28, 0.09]} />
      </mesh>
    </group>
  );
}

export function RopeBarrier({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const brass = useMemo(() => mat('#c9a227', 0.3, 0.8), []);
  const rope = useMemo(() => mat('#8a2f3f', 0.85), []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[-1, 1].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 0.05, 0]} material={brass}><cylinderGeometry args={[0.16, 0.18, 0.06, 12]} /></mesh>
          <mesh position={[0, 0.5, 0]} material={brass}><cylinderGeometry args={[0.025, 0.025, 0.9, 8]} /></mesh>
          <mesh position={[0, 0.97, 0]} material={brass}><sphereGeometry args={[0.05, 10, 8]} /></mesh>
        </group>
      ))}
      <mesh position={[0, 0.82, 0]} rotation={[0, 0, 0]} material={rope}>
        <torusGeometry args={[1.0, 0.035, 8, 20, Math.PI]} />
      </mesh>
    </group>
  );
}

export function ShopShelf({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const frame = useMemo(() => mat('#6a7280', 0.6, 0.3), []);
  const items = useMemo(() => {
    const colors = ['#e63946', '#4895ef', '#ffd166', '#3f7d44', '#9b5de5', '#f4a261'];
    return Array.from({ length: 15 }, (_, i) => ({
      x: -1.2 + (i % 5) * 0.6, shelf: Math.floor(i / 5), c: colors[(i * 7) % 6],
      kind: (i * 3) % 3,
    }));
  }, []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[0.5, 1.05, 1.6].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} castShadow material={frame}><boxGeometry args={[3.0, 0.04, 0.5]} /></mesh>
      ))}
      {[-1.48, 1.48].map((x, i) => (
        <mesh key={i} position={[x, 0.85, 0]} material={frame}><boxGeometry args={[0.05, 1.7, 0.5]} /></mesh>
      ))}
      {items.map((it, i) => (
        <group key={i} position={[it.x, 0.52 + it.shelf * 0.55, 0]}>
          {it.kind === 0 && <mesh castShadow position={[0, 0.12, 0]}><boxGeometry args={[0.22, 0.24, 0.2]} /><meshStandardMaterial color={it.c} roughness={0.6} /></mesh>}
          {it.kind === 1 && <mesh castShadow position={[0, 0.13, 0]}><cylinderGeometry args={[0.09, 0.09, 0.26, 10]} /><meshStandardMaterial color={it.c} roughness={0.5} /></mesh>}
          {it.kind === 2 && <mesh castShadow position={[0, 0.1, 0]}><sphereGeometry args={[0.11, 10, 8]} /><meshStandardMaterial color={it.c} roughness={0.55} /></mesh>}
        </group>
      ))}
    </group>
  );
}

export function ShopCounter({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const body = useMemo(() => mat('#4a5568', 0.65), []);
  const top = useMemo(() => mat('#d8dce2', 0.35), []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow material={body}><boxGeometry args={[2.4, 1.0, 0.8]} /></mesh>
      <mesh position={[0, 1.02, 0]} material={top}><boxGeometry args={[2.5, 0.05, 0.9]} /></mesh>
      {/* till */}
      <mesh position={[0.7, 1.18, -0.1]} castShadow material={useMemo(() => mat('#22262c', 0.5), [])}>
        <boxGeometry args={[0.5, 0.28, 0.4]} />
      </mesh>
      <mesh position={[0.7, 1.35, 0.02]} rotation={[-0.5, 0, 0]}>
        <planeGeometry args={[0.4, 0.2]} />
        <meshStandardMaterial color="#38d9c3" emissive="#38d9c3" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

export function Directory({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 384; c.height = 512;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1a2233';
    ctx.fillRect(0, 0, 384, 512);
    ctx.fillStyle = '#cfe0ff';
    ctx.font = '700 34px "Segoe UI", sans-serif';
    ctx.fillText('团 子 塔', 34, 60);
    ctx.font = '22px "Segoe UI", sans-serif';
    ctx.fillStyle = '#9aa7bd';
    const lines = [
      ['G', '大堂 · 信件房'],
      ['1+', '住户房间'],
      ['', ''],
      ['ℹ', '乘电梯可以拜访'],
      ['', '任何公开的房间。'],
      ['', ''],
      ['♥', '你自己的房间'],
      ['', '永远在列表里。'],
    ];
    lines.forEach(([a, b], i) => {
      ctx.fillStyle = '#38d9c3';
      ctx.fillText(a, 34, 130 + i * 44);
      ctx.fillStyle = '#c8d4e8';
      ctx.fillText(b, 90, 130 + i * 44);
    });
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[1.3, 1.7, 0.08]} />
        <meshStandardMaterial color="#2b323f" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.5, 0.045]}>
        <planeGeometry args={[1.14, 1.52]} />
        <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.35} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function Mailboxes({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const steel = useMemo(() => mat('#8a929c', 0.4, 0.6), []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow material={steel}><boxGeometry args={[2.2, 1.3, 0.24]} /></mesh>
      {Array.from({ length: 15 }).map((_, i) => (
        <group key={i} position={[-0.88 + (i % 5) * 0.44, 0.4 - Math.floor(i / 5) * 0.4, 0.13]}>
          <mesh>
            <planeGeometry args={[0.36, 0.32]} />
            <meshStandardMaterial color="#6a7280" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[0.1, 0, 0.01]}>
            <circleGeometry args={[0.025, 8]} />
            <meshStandardMaterial color="#2b2f36" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Interior window with glass + frame (view of the sky dome outside). */
export function WindowFrame({ position, rotation, w = 1.6, h = 1.4 }: {
  position: [number, number, number]; rotation: number; w?: number; h?: number;
}) {
  const frame = useMemo(() => mat('#4a4038', 0.6), []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow material={frame}><boxGeometry args={[w + 0.12, h + 0.12, 0.08]} /></mesh>
      <mesh>
        <boxGeometry args={[w, h, 0.03]} />
        <meshPhysicalMaterial color="#bcd8f0" roughness={0.05} metalness={0.1} transparent opacity={0.18} />
      </mesh>
      <mesh material={frame}><boxGeometry args={[0.05, h, 0.09]} /></mesh>
      <mesh material={frame}><boxGeometry args={[w, 0.05, 0.09]} /></mesh>
    </group>
  );
}

/** Round café table. */
export function TableRound({ position }: { position: [number, number, number] }) {
  const wood = useMemo(() => mat('#6e5136', 0.65), []);
  const top = useMemo(() => mat('#8b6c4f', 0.55), []);
  return (
    <group position={position}>
      <mesh position={[0, 0.72, 0]} castShadow material={top}><cylinderGeometry args={[0.5, 0.5, 0.05, 16]} /></mesh>
      <mesh position={[0, 0.38, 0]} material={wood}><cylinderGeometry args={[0.05, 0.06, 0.68, 8]} /></mesh>
      <mesh position={[0, 0.03, 0]} material={wood}><cylinderGeometry args={[0.24, 0.28, 0.05, 12]} /></mesh>
    </group>
  );
}

/** Trimmed hedge ring around the plaza edge (visual boundary). */
export function HedgeRing() {
  const hedge = useMemo(() => mat('#2f5f36', 0.95), []);
  const segments = useMemo(() => {
    const arr: { x: number; z: number; ry: number; len: number }[] = [];
    const R = 58;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      arr.push({ x: Math.cos(a) * R, z: Math.sin(a) * R, ry: -a + Math.PI / 2, len: 8.6 });
    }
    return arr;
  }, []);
  return (
    <group>
      {segments.map((s, i) => (
        <mesh key={i} position={[s.x, 0.65, s.z]} rotation={[0, s.ry, 0]} castShadow material={hedge}>
          <boxGeometry args={[s.len, 1.3, 1.1]} />
        </mesh>
      ))}
    </group>
  );
}

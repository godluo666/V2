/** Generic interior renderer: shell (floor/walls/ceiling with door gaps),
 *  per-space lighting tied to switches, plus all layout props/interactables. */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import { LAYOUTS } from '@nexuspark/shared';
import type { SpaceLayout } from '@nexuspark/shared';
import { useWorld, useSettings } from '../../state/stores';
import { renderProp, renderInteractable } from './registry';
import { NetcafeExtras, GameroomExtras } from '../prefabs/venueInteriors';
import { WindowFrame } from '../prefabs/interiors';
import { plankTexture, tileTexture, marbleTexture, carpetTexture, gridGlowTexture } from './textures';

interface Gap { side: 'n' | 's' | 'e' | 'w'; center: number; width: number; }
interface InteriorConfig {
  wallColor: string;
  trimColor: string;
  ceilingColor: string;
  height: number;
  floor: 'planks' | 'tiles' | 'marble' | 'carpet' | 'grid';
  gaps: Gap[];
  lightSwitchId?: string;
  lights: { x: number; z: number; color: string; intensity: number }[];
  windows?: { side: 'n' | 's' | 'e' | 'w'; center: number; w?: number }[];
  neon?: boolean;
}

const CONFIGS: Record<string, InteriorConfig> = {
  cafe: {
    wallColor: '#ead9bd', trimColor: '#8a6845', ceilingColor: '#f6edda', height: 3.6,
    floor: 'planks', gaps: [{ side: 's', center: 0, width: 2.2 }],
    lightSwitchId: 'cafe-lights',
    lights: [
      { x: -5, z: -1.5, color: '#ffd9a0', intensity: 9 },
      { x: 5, z: -1.5, color: '#ffd9a0', intensity: 9 },
      { x: 0, z: 3.8, color: '#ffd9a0', intensity: 8 },
    ],
    windows: [{ side: 's', center: -4.5, w: 2 }, { side: 's', center: 4.5, w: 2 }, { side: 'w', center: 2.5, w: 2 }],
  },
  cinema: {
    // 巨幕厅:放映面保持暗部，后区与通道用暖棕红保证舒适可读
    wallColor: '#49373f', trimColor: '#2b2026', ceilingColor: '#241b21', height: 12,
    floor: 'carpet', gaps: [{ side: 's', center: 0, width: 3.4 }],
    lights: [
      { x: -12, z: -4, color: '#d77868', intensity: 3.8 },
      { x: 12, z: -4, color: '#d77868', intensity: 3.8 },
      { x: -12, z: 4, color: '#d77868', intensity: 3.8 },
      { x: 12, z: 4, color: '#d77868', intensity: 3.8 },
      { x: 0, z: 10, color: '#ffc278', intensity: 6.5 },
      { x: 10.5, z: 9, color: '#ffc278', intensity: 5.2 },
      { x: -10.5, z: 9, color: '#ffcfa0', intensity: 4.8 },
    ],
  },
  arcade: {
    wallColor: '#34394c', trimColor: '#222638', ceilingColor: '#272b3b', height: 3.8,
    floor: 'grid', gaps: [{ side: 'w', center: 0, width: 2.2 }],
    lightSwitchId: 'arcade-neon',
    lights: [
      { x: 0, z: 0, color: '#7a5fff', intensity: 7 },
      { x: -4, z: -3, color: '#ff5fd8', intensity: 5 },
      { x: 4, z: 3, color: '#40e8ff', intensity: 5 },
    ],
    neon: true,
  },
  shop: {
    wallColor: '#e7dfcf', trimColor: '#819888', ceilingColor: '#f5f0e6', height: 3.6,
    floor: 'tiles', gaps: [{ side: 'e', center: 0, width: 2.2 }],
    lightSwitchId: 'shop-lights',
    lights: [
      { x: -4, z: -2.5, color: '#fff2dc', intensity: 9 },
      { x: 4, z: 2.5, color: '#fff2dc', intensity: 9 },
    ],
    windows: [{ side: 'e', center: -3.2, w: 2.2 }, { side: 'e', center: 3.2, w: 2.2 }],
  },
  lobby: {
    wallColor: '#ded5c6', trimColor: '#9b7958', ceilingColor: '#f3ede3', height: 4.2,
    floor: 'marble', gaps: [{ side: 's', center: 0, width: 2.4 }],
    lightSwitchId: 'lobby-lights',
    lights: [
      { x: 0, z: 0, color: '#ffe8c0', intensity: 11 },
      { x: -6, z: 3.5, color: '#ffe8c0', intensity: 6 },
      { x: 6, z: -3.5, color: '#ffe8c0', intensity: 6 },
    ],
    windows: [{ side: 's', center: -4.5, w: 2.4 }, { side: 's', center: 4.5, w: 2.4 }],
  },
  // ── 电竞馆:清亮蓝灰 + 木暖前台，避免传统黑盒网吧的压迫感 ──
  netcafe: {
    wallColor: '#536276', trimColor: '#344155', ceilingColor: '#455266', height: 4.6,
    floor: 'grid', gaps: [{ side: 's', center: 0, width: 2.2 }],
    lightSwitchId: 'nc-lights',
    lights: [
      { x: -5, z: -3.6, color: '#a9c9e8', intensity: 7.5 },
      { x: 5, z: -3.6, color: '#a9c9e8', intensity: 7.5 },
      { x: 0, z: 1.4, color: '#b7d6ec', intensity: 7.2 },
      { x: 7.5, z: 5.8, color: '#ffd18a', intensity: 5.2 },
    ],
    windows: [{ side: 's', center: -6.2, w: 2.6 }, { side: 's', center: 6.2, w: 2.6 }],
    neon: false,
  },
  // ── 雀庄「东风阁」(P5,总纲 §4.4):暖木 + 木板地 + 暖橙灯笼光 ──────────
  gameroom: {
    wallColor: '#80654e', trimColor: '#4b382a', ceilingColor: '#634b39', height: 3.6,
    floor: 'planks', gaps: [{ side: 's', center: 0, width: 2.2 }],
    lightSwitchId: 'gr-lights',
    lights: [
      { x: -4.1, z: -1.8, color: '#ffd3a0', intensity: 7.5 },
      { x: 4.1, z: -1.8, color: '#ffd3a0', intensity: 7.5 },
      { x: 0, z: 4.3, color: '#ffd3a0', intensity: 5.5 },
    ],
    windows: [{ side: 's', center: -5.6, w: 2.2 }, { side: 's', center: 5.6, w: 2.2 }],
  },
};

function floorTex(kind: InteriorConfig['floor']) {
  switch (kind) {
    case 'planks': return plankTexture();
    case 'tiles': return tileTexture();
    case 'marble': return marbleTexture();
    case 'carpet': return carpetTexture();
    case 'grid': return gridGlowTexture();
  }
}

export function Walls({ layout, cfg }: { layout: SpaceLayout; cfg: InteriorConfig }) {
  const { bounds } = layout;
  const t = 0.25;
  const h = cfg.height;
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: cfg.wallColor, roughness: 0.9 }), [cfg.wallColor]);
  const trimMat = useMemo(() => new THREE.MeshStandardMaterial({ color: cfg.trimColor, roughness: 0.8 }), [cfg.trimColor]);

  const { regular, lintels } = useMemo(() => {
    const regular: { x: number; z: number; w: number; d: number }[] = [];
    const lintels: { x: number; z: number; w: number; d: number }[] = [];
    const addWall = (side: Gap['side']) => {
      const gaps = cfg.gaps.filter((g) => g.side === side).sort((a, b) => a.center - b.center);
      const horizontal = side === 'n' || side === 's';
      const lo = horizontal ? bounds.minX : bounds.minZ;
      const hi = horizontal ? bounds.maxX : bounds.maxZ;
      let cursor = lo;
      const pieces: [number, number][] = [];
      for (const g of gaps) {
        const gLo = g.center - g.width / 2;
        const gHi = g.center + g.width / 2;
        if (gLo > cursor) pieces.push([cursor, gLo]);
        cursor = Math.max(cursor, gHi);
      }
      if (cursor < hi) pieces.push([cursor, hi]);
      for (const [a, b] of pieces) {
        const len = b - a;
        const mid = (a + b) / 2;
        if (horizontal) {
          regular.push({ x: mid, z: side === 'n' ? bounds.minZ - t / 2 : bounds.maxZ + t / 2, w: len, d: t });
        } else {
          regular.push({ x: side === 'w' ? bounds.minX - t / 2 : bounds.maxX + t / 2, z: mid, w: t, d: len });
        }
      }
      for (const g of gaps) {
        if (horizontal) {
          lintels.push({ x: g.center, z: side === 'n' ? bounds.minZ - t / 2 : bounds.maxZ + t / 2, w: g.width, d: t });
        } else {
          lintels.push({ x: side === 'w' ? bounds.minX - t / 2 : bounds.maxX + t / 2, z: g.center, w: t, d: g.width });
        }
      }
    };
    (['n', 's', 'e', 'w'] as const).forEach(addWall);
    return { regular, lintels };
  }, [bounds, cfg.gaps]);

  return (
    <group>
      {regular.map((s, i) => (
        <group key={i}>
          <mesh position={[s.x, h / 2, s.z]} material={wallMat} castShadow receiveShadow>
            <boxGeometry args={[s.w, h, s.d]} />
          </mesh>
          <mesh position={[s.x, 0.09, s.z]} material={trimMat}>
            <boxGeometry args={[s.w + 0.02, 0.18, s.d + 0.04]} />
          </mesh>
          <mesh position={[s.x, 0.92, s.z]} material={trimMat}>
            <boxGeometry args={[s.w + 0.015, 0.055, s.d + 0.025]} />
          </mesh>
        </group>
      ))}
      {lintels.map((s, i) => (
        <mesh key={`l${i}`} position={[s.x, h - (h - 2.6) / 2, s.z]} material={wallMat} castShadow>
          <boxGeometry args={[s.w, h - 2.6, s.d]} />
        </mesh>
      ))}
    </group>
  );
}

/** 暖日光窗:窗框提供建筑细节，小范围暖光只负责把窗边座位从墙面中分离。 */
function InteriorWindows({ layout, cfg }: { layout: SpaceLayout; cfg: InteriorConfig }) {
  if (!cfg.windows?.length) return null;
  return (
    <group>
      {cfg.windows.map((win, i) => {
        const n = win.side === 'n';
        const s = win.side === 's';
        const w = win.side === 'w';
        const position: [number, number, number] = n
          ? [win.center, 1.75, layout.bounds.minZ + 0.04]
          : s
            ? [win.center, 1.75, layout.bounds.maxZ - 0.04]
            : w
              ? [layout.bounds.minX + 0.04, 1.75, win.center]
              : [layout.bounds.maxX - 0.04, 1.75, win.center];
        const rotation = n ? 0 : s ? Math.PI : w ? Math.PI / 2 : -Math.PI / 2;
        const inward: [number, number, number] = n
          ? [position[0], 1.5, position[2] + 0.9]
          : s
            ? [position[0], 1.5, position[2] - 0.9]
            : w
              ? [position[0] + 0.9, 1.5, position[2]]
              : [position[0] - 0.9, 1.5, position[2]];
        return (
          <group key={`${win.side}-${win.center}-${i}`}>
            <WindowFrame position={position} rotation={rotation} w={win.w ?? 2.2} h={1.55} />
            <pointLight position={inward} color="#ffe3b2" intensity={4.2} distance={8} decay={2} />
          </group>
        );
      })}
    </group>
  );
}

/** 放映时平滑变暗的顶灯(影院观影氛围;暂停/清屏时缓慢恢复)。 */
function DimmableCeilingLight({ color, intensity, dimTarget, reach }: { color: string; intensity: number; dimTarget: number; reach: number }) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame((_, dt) => {
    const l = ref.current;
    if (!l) return;
    const target = intensity * dimTarget;
    l.intensity += (target - l.intensity) * Math.min(1, dt * 1.6); // ~0.6s 半衰,平滑不跳变
  });
  return <pointLight ref={ref} position={[0, -0.5, 0]} color={color} intensity={intensity} distance={reach} decay={1.7} />;
}

export default function Interior({ spaceKey }: { spaceKey: string }) {
  const layout = LAYOUTS[spaceKey];
  const cfg = CONFIGS[spaceKey];
  const switches = useWorld((s) => s.switches);
  const media = useWorld((s) => s.media);
  const reflections = useSettings((s) => s.reflections);
  const lightsOn = cfg.lightSwitchId ? (switches[cfg.lightSwitchId] ?? true) : true;
  // 影院:开播灯光压到 22%,暂停回到 55%,无片全亮(任务书 §二十二 影厅体验)
  const playingNow = !!media && (!!media.url || media.kind === 'share');
  const dimTarget = spaceKey === 'cinema'
    ? (playingNow ? (media!.playing || media!.kind === 'share' ? 0.28 : 0.55) : 1)
    : 1;
  const tex = useMemo(() => floorTex(cfg.floor), [cfg.floor]);
  const w = layout.bounds.maxX - layout.bounds.minX;
  const d = layout.bounds.maxZ - layout.bounds.minZ;
  const cx = (layout.bounds.maxX + layout.bounds.minX) / 2;
  const cz = (layout.bounds.maxZ + layout.bounds.minZ) / 2;

  return (
    <group>
      {/* floor */}
      {cfg.floor === 'marble' && reflections ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <MeshReflectorMaterial
            map={tex} mirror={0.35} resolution={512} blur={[240, 60]} mixBlur={0.8}
            mixStrength={0.7} roughness={0.5} depthScale={0.3} color="#cfcac0" metalness={0.1}
          />
        </mesh>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial
            map={tex}
            roughness={cfg.floor === 'carpet' ? 0.95 : 0.6}
            emissive={cfg.floor === 'grid' && lightsOn ? '#2a3a8f' : '#000000'}
            emissiveIntensity={cfg.floor === 'grid' && lightsOn ? 0.5 : 0}
            emissiveMap={cfg.floor === 'grid' ? tex : undefined}
          />
        </mesh>
      )}
      {/* ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, cfg.height, cz]}>
        <planeGeometry args={[w + 0.6, d + 0.6]} />
        <meshStandardMaterial color={cfg.ceilingColor} roughness={0.95} />
      </mesh>
      <Walls layout={layout} cfg={cfg} />
      <InteriorWindows layout={layout} cfg={cfg} />

      {/* ceiling light fixtures */}
      {cfg.lights.map((l, i) => (
        <group key={i} position={[l.x, cfg.height - 0.02, l.z]}>
          <mesh position={[0, -0.06, 0]}>
            <cylinderGeometry args={[0.24, 0.3, 0.12, 12]} />
            <meshStandardMaterial
              color="#d8d4cc"
              emissive={l.color}
              emissiveIntensity={(lightsOn ? 1.4 : 0.02) * (dimTarget < 1 ? 0.35 : 1)}
              roughness={0.5}
            />
          </mesh>
          {lightsOn && (
            // 高顶棚(巨幕厅 12m)需要更强更远的灯才能照到地面
            <DimmableCeilingLight
              color={l.color}
              intensity={l.intensity * 1.8 * (cfg.height > 6 ? 2.6 : 1)}
              dimTarget={dimTarget}
              reach={Math.max(13, cfg.height * 2.4)}
            />
          )}
        </group>
      ))}
      {/* soft fill so interiors read clearly at any hour */}
      {lightsOn && <ambientLight intensity={0.48} color={cfg.neon ? '#a8add2' : '#fff2df'} />}
      {!lightsOn && <pointLight position={[cx, 1.6, cz]} color="#3a4a6f" intensity={2.2} distance={16} />}
      {!lightsOn && <ambientLight intensity={0.08} color="#33415f" />}

      {/* neon wall strips (arcade) */}
      {cfg.neon && (
        <group>
          {[[layout.bounds.minX + 0.1, 0, 0, Math.PI / 2] as const, [layout.bounds.maxX - 0.1, 0, 0, -Math.PI / 2] as const].map(([x, , z, ry], i) => (
            <mesh key={i} position={[x, 2.9, z]} rotation={[0, ry, 0]}>
              <boxGeometry args={[d - 0.5, 0.06, 0.06]} />
              <meshStandardMaterial color="#ff5fd8" emissive="#ff5fd8" emissiveIntensity={lightsOn ? 2 : 0.1} />
            </mesh>
          ))}
          <mesh position={[cx, 2.9, layout.bounds.minZ + 0.1]}>
            <boxGeometry args={[w - 0.5, 0.06, 0.06]} />
            <meshStandardMaterial color="#40e8ff" emissive="#40e8ff" emissiveIntensity={lightsOn ? 2 : 0.1} />
          </mesh>
        </group>
      )}

      {/* 场馆专属挂件(P5):网吧墙面灯带 / 雀庄障子窗 + 役种挂轴 */}
      {spaceKey === 'netcafe' && <NetcafeExtras lightsOn={lightsOn} />}
      {spaceKey === 'gameroom' && <GameroomExtras lightsOn={lightsOn} />}

      {layout.props.map((p, i) => renderProp(p, i))}
      {layout.interactables.map((it) => renderInteractable(it, it.id))}
    </group>
  );
}

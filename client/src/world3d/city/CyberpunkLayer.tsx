import { useMemo } from 'react';
import * as THREE from 'three';
import { toonMat } from './toon';
import { ENV, ACCENT } from './palette';

type P3 = [number, number, number];

const ink = toonMat('#0b1018');
const metal = toonMat('#1b2530');
const cyan = toonMat('#40e8ff', { emissive: '#40e8ff', emissiveIntensity: 1.15 });
const pink = toonMat('#ff3f83', { emissive: '#ff3f83', emissiveIntensity: 1.0 });
const yellow = toonMat('#ffd34f', { emissive: '#ffb52e', emissiveIntensity: 0.9 });
const violet = toonMat('#7a5fff', { emissive: '#7a5fff', emissiveIntensity: 0.85 });
const glass = toonMat('#153344', { emissive: '#155b6c', emissiveIntensity: 0.4, transparent: true, opacity: 0.88 });

const signCache = new Map<string, THREE.CanvasTexture>();
function signTexture(text: string, color: string, sub: string): THREE.CanvasTexture {
  const key = `${text}|${color}|${sub}`;
  const hit = signCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 768; c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0b1018'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = color; ctx.globalAlpha = 0.18;
  for (let x = -256; x < 768; x += 56) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 180, 256); ctx.lineTo(x + 202, 256); ctx.lineTo(x + 22, 0); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.strokeRect(12, 12, 744, 232);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 28; ctx.fillStyle = '#fff8ee';
  ctx.font = '900 70px "Segoe UI", "Noto Sans SC", sans-serif'; ctx.fillText(text, 384, 112);
  ctx.shadowBlur = 6; ctx.fillStyle = color;
  ctx.font = '700 22px "Segoe UI", "Noto Sans SC", sans-serif'; ctx.fillText(sub, 384, 188);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  signCache.set(key, tex);
  return tex;
}

function NeonSign({ position, rotation = 0, size, text, color, sub }: {
  position: P3; rotation?: number; size: [number, number]; text: string; color: string; sub: string;
}) {
  const tex = useMemo(() => signTexture(text, color, sub), [text, color, sub]);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh material={ink} castShadow><boxGeometry args={[size[0] + 0.28, size[1] + 0.28, 0.22]} /></mesh>
      <mesh position={[0, 0, 0.13]}>
        <planeGeometry args={size} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
      <mesh position={[0, -size[1] / 2 - 0.12, 0.03]} material={color === ACCENT.netcafeSign ? cyan : color === ACCENT.cinemaSign ? pink : yellow}>
        <boxGeometry args={[size[0] * 0.74, 0.045, 0.05]} />
      </mesh>
    </group>
  );
}

function Cable({ points, color = '#11131a', radius = 0.035 }: { points: P3[]; color?: string; radius?: number }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 5, false);
  }, [points, radius]);
  const mat = useMemo(() => toonMat(color), [color]);
  return <mesh geometry={geo} material={mat} />;
}

/**
 * 赛博街头层：不是 HUD，而是可被相机看到并参与透视的实体构件——高架连廊、
 * 电缆、消防梯、发光广告箱和湿路面反射。它们只占现有街区，不扩张可玩地图。
 */
export default function CyberpunkLayer() {
  return (
    <group name="cyberpunk-street-layer">
      {/* 跨街高架连廊：把十字路口的上半部也填满，形成真正的都市街谷。 */}
      <group position={[-8, 8.4, -6.4]}>
        <mesh material={metal} castShadow><boxGeometry args={[31, 1.05, 1.55]} /></mesh>
        <mesh position={[0, 0.18, 0.82]} material={glass}><boxGeometry args={[29.2, 0.72, 0.06]} /></mesh>
        <mesh position={[0, -0.5, 0.78]} material={cyan}><boxGeometry args={[29, 0.06, 0.08]} /></mesh>
        <mesh position={[0, -0.5, -0.78]} material={pink}><boxGeometry args={[29, 0.06, 0.08]} /></mesh>
        {[-14, -7, 0, 7, 14].map((x) => (
          <mesh key={x} position={[x, -0.82, 0]} material={metal}><boxGeometry args={[0.32, 1.55, 1.9]} /></mesh>
        ))}
      </group>

      {/* 路口可读的悬浮广告箱，楼体之间用不规则角度打破“平面墙”。 */}
      <NeonSign position={[-17.6, 6.9, -7.0]} size={[5.2, 1.55]} text="NIGHT//SHIFT" color="#ff3f83" sub="SHIOHAMA CROSS · 35.68N" />
      <NeonSign position={[13.4, 7.5, -7.15]} rotation={Math.PI} size={[4.8, 1.45]} text="CYBER//PULSE" color="#40e8ff" sub="LIVE FEED / 07" />
      <NeonSign position={[-5.1, 8.2, 14.0]} rotation={Math.PI} size={[5.4, 1.5]} text="ARENA//NOW" color="#ffd34f" sub="WATCH THE CITY LIGHT UP" />

      {/* 建筑侧面的实体消防梯与冷凝机组，给平整的高墙增加可辨识的尺度参照。 */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 25.8, 0, 7.8]}>
          {[3.2, 6.6, 10.0, 13.4].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={metal}>
              <boxGeometry args={[2.8, 0.12, 3.0]} />
            </mesh>
          ))}
          <mesh position={[side * 0.95, 8.3, 0]} material={metal}><boxGeometry args={[0.12, 11.2, 0.12]} /></mesh>
          <mesh position={[side * 0.95, 8.3, 1.15]} material={metal}><boxGeometry args={[0.12, 11.2, 0.12]} /></mesh>
          {[4.9, 8.3, 11.7].map((y) => (
            <mesh key={y} position={[side * 1.1, y, 0]} rotation={[0, 0, side * 0.15]} material={yellow}>
              <boxGeometry args={[0.08, 2.5, 0.08]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 交通与机电电缆：用轻量 TubeGeometry 画出头顶的真实连接关系。 */}
      <Cable points={[[-25, 11.8, -5.8], [-12, 13.2, -5.3], [3, 12.0, -6.0], [23, 13.7, -5.2]]} />
      <Cable points={[[-20, 9.4, 5.5], [-10, 11.1, 1.0], [5, 10.1, -1.8], [20, 11.5, -5.3]]} />
      <Cable points={[[-2, 10.4, -20], [-4, 11.7, -10], [-8, 10.8, 0], [-12, 12.1, 16]]} color="#243343" radius={0.045} />

      {/* 赛博路面湿痕与导光槽：保留原有斑马线，只增加低透明反射块。 */}
      {[
        [-17, 0.018, 1.2, 7.0, 0.14, '#40e8ff'],
        [-2, 0.019, -2.0, 3.5, 0.12, '#ff3f83'],
        [12, 0.018, 1.0, 9.0, 0.11, '#7a5fff'],
      ].map(([x, y, z, w, alpha, color]) => (
        <mesh key={`${x}-${z}`} position={[x as number, y as number, z as number]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w as number, 1.3]} />
          <meshBasicMaterial color={color as string} transparent opacity={alpha as number} depthWrite={false} />
        </mesh>
      ))}

      {/* 路口中央的全息环与信号柱：低矮、不阻塞道路，但提供赛博城市的纵向焦点。 */}
      <group position={[-8, 0, 1]}>
        <mesh position={[0, 2.8, 0]} material={metal}><cylinderGeometry args={[0.16, 0.22, 5.6, 8]} /></mesh>
        {[1.5, 2.5, 3.5].map((y, i) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={[cyan, pink, yellow][i]}>
            <torusGeometry args={[0.7 + i * 0.08, 0.045, 6, 24]} />
          </mesh>
        ))}
        <mesh position={[0, 5.65, 0]} material={violet}><boxGeometry args={[0.9, 0.16, 0.9]} /></mesh>
      </group>
      <pointLight position={[-8, 3.0, 1]} color="#40e8ff" intensity={3.2} distance={9} decay={2} />
      <pointLight position={[12, 5.2, -6]} color="#ff3f83" intensity={3.8} distance={13} decay={2} />
      <pointLight position={[-16, 5.8, -7]} color="#7a5fff" intensity={2.6} distance={10} decay={2} />
    </group>
  );
}

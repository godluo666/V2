/** Cozy, asset-free furniture for the Dango party hall activity room. */
import * as THREE from 'three';
import { toonMat } from '../city/toon';
import { surfaceMaterial } from '../city/materials';

type P3 = [number, number, number];

const cream = surfaceMaterial('paintedConcrete'); cream.color.set('#f5dfc8');
const red = surfaceMaterial('seatFabric'); red.color.set('#cf5d58');
const gold = toonMat('#f4c66b');
const green = toonMat('#6b9a72');
const blue = toonMat('#5f87b8');
const cyan = toonMat('#40e8ff', { emissive: '#40e8ff', emissiveIntensity: 0.55 });
const pink = toonMat('#e69aaa');
const rug = surfaceMaterial('acousticFabric'); rug.color.set('#d97966');
const wood = surfaceMaterial('wood'); wood.color.set('#765138');
const darkWood = surfaceMaterial('wood'); darkWood.color.set('#432f28');
const glowGold = toonMat('#f4c66b', { emissive: '#ef9f4d', emissiveIntensity: 0.55 });
const sage = toonMat('#9fc9bb');
const ink = toonMat('#273340');
const lavender = toonMat('#a58fc8', { emissive: '#8f75c8', emissiveIntensity: 0.25 });
const paper = toonMat('#f4ecd9');

export function ClubRug({ position, ry, w, d }: {
  position: P3; ry: number; w: number; d: number;
}) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh receiveShadow material={rug}><boxGeometry args={[w, 0.025, d]} /></mesh>
      <mesh position={[0, 0.016, 0]} material={cream}><boxGeometry args={[w * 0.72, 0.012, d * 0.72]} /></mesh>
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} material={gold}>
        <ringGeometry args={[Math.min(w, d) * 0.17, Math.min(w, d) * 0.23, 32]} />
      </mesh>
      {[-1, 1].flatMap((side) =>
        Array.from({ length: 12 }, (_, i) => (
          <mesh
            key={`${side}-${i}`}
            position={[-w / 2 + 0.3 + i * ((w - 0.6) / 11), 0.012, side * (d / 2 + 0.08)]}
            rotation={[Math.PI / 2, 0, 0]}
            material={cream}
          >
            <cylinderGeometry args={[0.012, 0.012, 0.16, 5]} />
          </mesh>
        )),
      )}
    </group>
  );
}

export function ClubSofa({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.32, 0]} castShadow material={red}><boxGeometry args={[3.5, 0.48, 0.9]} /></mesh>
      <mesh position={[0, 0.75, -0.38]} castShadow material={pink}><boxGeometry args={[3.5, 0.78, 0.28]} /></mesh>
      {[-1.15, 0, 1.15].map((x) => (
        <mesh key={x} position={[x, 0.51, 0.08]} castShadow material={cream}>
          <boxGeometry args={[1.02, 0.18, 0.7]} />
        </mesh>
      ))}
      {[-1.82, 1.82].map((x) => (
        <mesh key={x} position={[x, 0.55, 0]} material={darkWood}>
          <boxGeometry args={[0.14, 0.55, 0.94]} />
        </mesh>
      ))}
      {[-1.15, 1.15].map((x, i) => (
        <mesh key={`pillow-${x}`} position={[x, 0.83, -0.24]} rotation={[0.1, 0, i ? -0.08 : 0.08]} material={i ? sage : lavender}>
          <boxGeometry args={[0.55, 0.38, 0.12]} />
        </mesh>
      ))}
    </group>
  );
}

export function ClubStage({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow material={wood}>
        <boxGeometry args={[7.2, 0.36, 2]} />
      </mesh>
      <mesh position={[0, 0.38, 0.92]} material={glowGold}><boxGeometry args={[7.2, 0.04, 0.07]} /></mesh>
      <mesh position={[0, 1.75, -0.96]} material={red}><boxGeometry args={[7.2, 2.8, 0.08]} /></mesh>
      {[-2.1, 0, 2.1].map((x) => (
        <mesh key={x} position={[x, 1.75, -0.9]} rotation={[0, 0, 0.08 * Math.sign(x)]} material={pink}>
          <boxGeometry args={[0.12, 2.7, 0.1]} />
        </mesh>
      ))}
      <mesh position={[0, 1.55, -0.84]} material={cream}><circleGeometry args={[0.62, 32]} /></mesh>
      {/* 社团活动室小型舞台：音箱、灯架和可更换海报，不是单一平面红墙。 */}
      {[-3.05, 3.05].map((x) => (
        <group key={x} position={[x, 0.72, 0.35]}>
          <mesh material={ink} castShadow><boxGeometry args={[0.72, 1.15, 0.52]} /></mesh>
          <mesh position={[0, 0.16, 0.28]} material={glowGold}><boxGeometry args={[0.34, 0.06, 0.02]} /></mesh>
          <mesh position={[0, -0.16, 0.28]} material={pink}><circleGeometry args={[0.12, 14]} /></mesh>
        </group>
      ))}
      {[-2.4, -1.2, 0, 1.2, 2.4].map((x, i) => (
        <mesh key={`stage-led-${x}`} position={[x, 0.43, 0.98]} material={i % 2 ? pink : glowGold}>
          <boxGeometry args={[0.34, 0.04, 0.04]} />
        </mesh>
      ))}
      <pointLight position={[0, 2.4, 0.2]} color="#ffd590" intensity={2.4} distance={6} />
    </group>
  );
}

export function FlyingChessTable({ position, ry }: { position: P3; ry: number }) {
  const colors = [red, blue, gold, green];
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.65, 0]} castShadow material={wood}><boxGeometry args={[1.3, 0.1, 1.3]} /></mesh>
      <mesh position={[0, 0.712, 0]} material={cream}><boxGeometry args={[1.18, 0.025, 1.18]} /></mesh>
      {[-0.28, 0, 0.28].flatMap((v) => [
        <mesh key={`h-${v}`} position={[0, 0.732, v]} material={darkWood}><boxGeometry args={[1.05, 0.012, 0.018]} /></mesh>,
        <mesh key={`v-${v}`} position={[v, 0.733, 0]} material={darkWood}><boxGeometry args={[0.018, 0.012, 1.05]} /></mesh>,
      ])}
      {[
        [-0.42, -0.42], [0.42, -0.42], [0.42, 0.42], [-0.42, 0.42],
      ].map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, 0.73, z]} rotation={[-Math.PI / 2, 0, 0]} material={colors[i]}>
            <circleGeometry args={[0.23, 20]} />
          </mesh>
          <mesh position={[x, 0.79, z]} material={colors[i]}><sphereGeometry args={[0.065, 12, 8]} /></mesh>
        </group>
      ))}
      {[-0.48, 0.48].flatMap((x) => [-0.48, 0.48].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.31, z]} material={darkWood}>
          <cylinderGeometry args={[0.04, 0.04, 0.62, 8]} />
        </mesh>
      )))}
    </group>
  );
}

export function ClubTrophyWall({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh material={darkWood}><boxGeometry args={[3.8, 2.4, 0.12]} /></mesh>
      <mesh position={[0, 0.7, 0.08]} material={cream}><boxGeometry args={[3.55, 0.78, 0.05]} /></mesh>
      {[[-1.15, red], [0, blue], [1.15, green]].map(([x, material], i) => (
        <mesh key={i} position={[x as number, 0.74, 0.13]} material={material as THREE.Material}>
          <boxGeometry args={[0.82, 0.55, 0.03]} />
        </mesh>
      ))}
      {[-1.05, 0, 1.05].map((x, i) => (
        <group key={x} position={[x, -0.45, 0.14]}>
          <mesh position={[0, -0.22, 0]} material={gold}><cylinderGeometry args={[0.2, 0.28, 0.08, 16]} /></mesh>
          <mesh material={i === 1 ? red : gold}><sphereGeometry args={[0.22, 16, 12]} /></mesh>
          <mesh position={[0, 0.26, 0]} material={gold}><coneGeometry args={[0.11, 0.25, 8]} /></mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Built-in activity-room architecture.  These are deliberately shallow,
 * thickened modules rather than decals: the timber rails cast onto the wall,
 * the acoustic boards sit proud of the plaster, and every shelf has a back,
 * lip and side cheek.  The result stays readable even with the neon layer
 * disabled and gives the compact room a believable club-house construction.
 */
function ClubWallDetails() {
  const panelMats = [sage, lavender, paper, pink];
  return (
    <group>
      {([-1, 1] as const).flatMap((side) => (
        [-8, -4, 4, 8].map((x, i) => (
          <group key={`wall-panel-${side}-${x}`} position={[x, 0, side * 8.72]}>
            <mesh position={[0, 2.15, 0]} castShadow material={darkWood}>
              <boxGeometry args={[3.15, 2.35, 0.16]} />
            </mesh>
            <mesh position={[0, 2.15, side * 0.105]} material={panelMats[(i + (side > 0 ? 1 : 0)) % panelMats.length]}>
              <boxGeometry args={[2.82, 1.98, 0.055]} />
            </mesh>
            <mesh position={[0, 3.2, side * 0.15]} material={glowGold}>
              <boxGeometry args={[2.5, 0.045, 0.045]} />
            </mesh>
            <mesh position={[0, 1.08, side * 0.15]} material={wood}>
              <boxGeometry args={[2.55, 0.08, 0.34]} />
            </mesh>
            {[-1, 1].map((edge) => (
              <mesh key={edge} position={[edge * 1.45, 2.15, side * 0.14]} material={darkWood}>
                <boxGeometry args={[0.08, 2.12, 0.22]} />
              </mesh>
            ))}
          </group>
        ))
      ))}
      {([-1, 1] as const).flatMap((side) => (
        [-6.4, -2.1, 2.1, 6.4].map((z, i) => (
          <group key={`side-shelf-${side}-${z}`} position={[side * 11.72, 0, z]} rotation={[0, side * Math.PI / 2, 0]}>
            <mesh position={[0, 2.4, 0]} castShadow material={darkWood}>
              <boxGeometry args={[2.35, 2.6, 0.18]} />
            </mesh>
            <mesh position={[0, 2.4, 0.12]} material={wood}>
              <boxGeometry args={[1.98, 2.2, 0.08]} />
            </mesh>
            {[-0.78, 0, 0.78].map((x, j) => (
              <group key={j} position={[x, 2.12 + (j % 2) * 0.42, 0.2]}>
                <mesh material={j % 2 ? gold : cyan}><boxGeometry args={[0.35, 0.24, 0.12]} /></mesh>
                <mesh position={[0, 0.2, 0]} material={j % 2 ? pink : sage}><cylinderGeometry args={[0.08, 0.08, 0.18, 10]} /></mesh>
              </group>
            ))}
            <mesh position={[0, 1.18, 0.2]} material={wood}>
              <boxGeometry args={[2.05, 0.1, 0.42]} />
            </mesh>
            <mesh position={[0, 1.02, 0.2]} material={darkWood}>
              <boxGeometry args={[0.12, 0.32, 0.32]} />
            </mesh>
          </group>
        ))
      ))}
      {/* Exposed lower wainscot, corner posts and a real cable tray. */}
      {([-1, 1] as const).map((side) => (
        <group key={`wainscot-${side}`}>
          <mesh position={[0, 0.52, side * 8.6]} castShadow material={wood}>
            <boxGeometry args={[23.2, 0.95, 0.24]} />
          </mesh>
          <mesh position={[0, 1.02, side * 8.76]} material={darkWood}>
            <boxGeometry args={[23.2, 0.1, 0.16]} />
          </mesh>
          <mesh position={[0, 3.7, side * 8.58]} material={darkWood}>
            <boxGeometry args={[23.2, 0.16, 0.22]} />
          </mesh>
        </group>
      ))}
      {([-10.9, 10.9] as const).map((x) => (
        <mesh key={`corner-post-${x}`} position={[x, 2.15, 0]} castShadow material={darkWood}>
          <boxGeometry args={[0.22, 4.3, 17.2]} />
        </mesh>
      ))}
    </group>
  );
}

export function ClubExtras({ lightsOn }: { lightsOn: boolean }) {
  const strip = lightsOn ? glowGold : darkWood;
  return (
    <group>
      <ClubWallDetails />
      {/* 天花木梁与串灯：把活动室的高度和温馨感做出来。 */}
      {[-8, -4, 0, 4, 8].map((x) => (
        <mesh key={`beam-${x}`} position={[x, 4.08, 0]} material={darkWood}><boxGeometry args={[0.18, 0.22, 17.2]} /></mesh>
      ))}
      {[-7.2, -3.6, 0, 3.6, 7.2].map((x, i) => (
        <group key={`pendant-${x}`} position={[x, 3.74, -1.1 + (i % 2) * 2.4]}>
          <mesh position={[0, 0.2, 0]} material={darkWood}><cylinderGeometry args={[0.018, 0.018, 0.35, 6]} /></mesh>
          <mesh material={lightsOn ? glowGold : darkWood}><coneGeometry args={[0.18, 0.16, 12]} /></mesh>
          {lightsOn && <pointLight color="#ffd590" intensity={1.25} distance={4.5} decay={2} />}
        </group>
      ))}
      <mesh position={[0, 3.85, -8.88]} material={strip}><boxGeometry args={[9.5, 0.08, 0.06]} /></mesh>
      <mesh position={[0, 3.55, -8.82]} material={pink}><boxGeometry args={[4.2, 0.58, 0.05]} /></mesh>
      {/* 北墙社团公告板、磁贴、活动海报与开放收纳格。 */}
      <mesh position={[0, 2.25, -8.76]} material={ink}><boxGeometry args={[7.0, 2.3, 0.12]} /></mesh>
      <mesh position={[0, 2.25, -8.69]} material={paper}><boxGeometry args={[6.55, 1.86, 0.04]} /></mesh>
      {[-2.3, -0.75, 0.8, 2.35].map((x, i) => (
        <group key={`notice-${x}`} position={[x, 2.32 + (i % 2) * 0.18, -8.63]} rotation={[0, 0, (i - 1.5) * 0.025]}>
          <mesh material={i % 2 ? sage : lavender}><boxGeometry args={[1.05, 0.82, 0.025]} /></mesh>
          <mesh position={[0, 0.22, 0.02]} material={i % 2 ? pink : red}><boxGeometry args={[0.72, 0.07, 0.012]} /></mesh>
        </group>
      ))}
      {[-2.9, -1.0, 0.9, 2.8].map((x) => (
        <group key={`cubby-${x}`} position={[x, 1.0, -8.7]}>
          <mesh material={wood}><boxGeometry args={[1.35, 1.35, 0.34]} /></mesh>
          <mesh position={[0, 0.03, 0.19]} material={darkWood}><boxGeometry args={[1.08, 0.94, 0.035]} /></mesh>
          <mesh position={[0, -0.2, 0.22]} material={Math.abs(x) % 2 ? gold : cyan}><boxGeometry args={[0.42, 0.05, 0.02]} /></mesh>
        </group>
      ))}
      {/* 软垫角落与小绿植，避免社团室只剩桌椅的硬朗轮廓。 */}
      {[-9.2, 9.2].map((x, i) => (
        <group key={`corner-${x}`} position={[x, 0, i ? -5.4 : 5.3]}>
          <mesh position={[0, 0.25, 0]} material={i ? lavender : sage}><boxGeometry args={[1.1, 0.5, 1.1]} /></mesh>
          <mesh position={[0, 1.0, 0]} material={green}><sphereGeometry args={[0.38, 10, 8]} /></mesh>
          <mesh position={[0, 0.58, 0]} material={wood}><cylinderGeometry args={[0.2, 0.24, 0.36, 10]} /></mesh>
        </group>
      ))}
      {[-9.5, 9.5].map((x) => (
        <group key={x} position={[x, 2.1, -8.78]}>
          <mesh material={cream}><boxGeometry args={[1.3, 1.5, 0.05]} /></mesh>
          <mesh position={[0, 0, 0.04]} material={x < 0 ? blue : green}><circleGeometry args={[0.38, 24]} /></mesh>
        </group>
      ))}
    </group>
  );
}

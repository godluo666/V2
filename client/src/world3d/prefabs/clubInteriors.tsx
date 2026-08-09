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
const creamFabric = surfaceMaterial('seatFabric'); creamFabric.color.set('#ead8c5');
const blushFabric = surfaceMaterial('seatFabric'); blushFabric.color.set('#d98b91');
const sageFabric = surfaceMaterial('seatFabric'); sageFabric.color.set('#8fb8a5');
const lavenderFabric = surfaceMaterial('seatFabric'); lavenderFabric.color.set('#9783b8');

/**
 * 归一化的程序化倒角实体：软包使用更大的圆角，木作只做细小倒棱。
 * 所有沙发、椅子、桌面和柜门共享这两份 BufferGeometry，既避免直角占位盒，
 * 也避免每件家具各自创建高细分几何。
 */
function roundedSolid(radius: number, bevel: number, segments: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const h = 0.5;
  shape.moveTo(-h + radius, -h);
  shape.lineTo(h - radius, -h);
  shape.quadraticCurveTo(h, -h, h, -h + radius);
  shape.lineTo(h, h - radius);
  shape.quadraticCurveTo(h, h, h - radius, h);
  shape.lineTo(-h + radius, h);
  shape.quadraticCurveTo(-h, h, -h, h - radius);
  shape.lineTo(-h, -h + radius);
  shape.quadraticCurveTo(-h, -h, -h + radius, -h);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.88,
    steps: 1,
    curveSegments: segments,
    bevelEnabled: true,
    bevelSegments: segments,
    bevelSize: bevel,
    bevelThickness: 0.06,
  });
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

const SOFT_SOLID = roundedSolid(0.16, 0.07, 3);
const WOOD_SOLID = roundedSolid(0.07, 0.035, 2);

function SculptedPart({
  position,
  scale,
  material,
  rotation = [0, 0, 0],
  soft = false,
  castShadow = true,
}: {
  position: P3;
  scale: P3;
  material: THREE.Material;
  rotation?: P3;
  soft?: boolean;
  castShadow?: boolean;
}) {
  return (
    <mesh
      geometry={soft ? SOFT_SOLID : WOOD_SOLID}
      dispose={null}
      position={position}
      scale={scale}
      rotation={rotation}
      material={material}
      castShadow={castShadow}
      receiveShadow
    />
  );
}

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
    <group position={position} rotation={[0, ry, 0]} dispose={null}>
      {/* 内缩木底座、软包承托和离地脚共同建立真实家具层次。 */}
      <SculptedPart position={[0, 0.22, 0]} scale={[3.42, 0.34, 0.86]} material={red} soft />
      <SculptedPart position={[0, 0.095, 0.02]} scale={[3.12, 0.16, 0.7]} material={darkWood} />
      {[-1.46, 1.46].flatMap((x) => [-0.28, 0.28].map((z) => (
        <mesh key={`foot-${x}-${z}`} position={[x, 0.055, z]} material={darkWood} castShadow>
          <cylinderGeometry args={[0.055, 0.07, 0.11, 8]} />
        </mesh>
      )))}
      {/* 三块独立坐垫与靠垫带有圆角、前缘缝隙和轻微后仰。 */}
      {[-1.15, 0, 1.15].map((x) => (
        <group key={x}>
          <SculptedPart position={[x, 0.49, 0.09]} scale={[1.03, 0.22, 0.72]} material={creamFabric} soft />
          <SculptedPart
            position={[x, 0.84, -0.34]}
            scale={[1.04, 0.68, 0.22]}
            rotation={[-0.1, 0, 0]}
            material={blushFabric}
            soft
          />
        </group>
      ))}
      {[-1.82, 1.82].map((x) => (
        <group key={x}>
          <SculptedPart position={[x, 0.44, 0]} scale={[0.22, 0.66, 0.94]} material={darkWood} />
          <SculptedPart position={[x, 0.68, 0.04]} scale={[0.3, 0.18, 0.82]} material={red} soft />
        </group>
      ))}
      {[-1.15, 1.15].map((x, i) => (
        <SculptedPart
          key={`pillow-${x}`}
          position={[x, 0.84, -0.19]}
          scale={[0.52, 0.38, 0.14]}
          rotation={[0.1, 0, i ? -0.1 : 0.1]}
          material={i ? sageFabric : lavenderFabric}
          soft
        />
      ))}
      {/* 深色嵌条只压在真实软包接缝中，不依赖平面贴线。 */}
      {[-0.575, 0.575].map((x) => (
        <SculptedPart key={`seat-seam-${x}`} position={[x, 0.5, 0.1]} scale={[0.022, 0.11, 0.66]} material={darkWood} castShadow={false} />
      ))}
    </group>
  );
}

/** 社团室专用木椅：软垫、四腿、横撑和弧形靠背都是真实几何。 */
export function ClubChair({ position, ry, accent = 0 }: { position: P3; ry: number; accent?: number }) {
  const cushion = accent % 2 ? lavenderFabric : sageFabric;
  return (
    <group position={position} rotation={[0, ry, 0]} dispose={null}>
      <SculptedPart position={[0, 0.47, 0]} scale={[0.72, 0.12, 0.72]} material={wood} />
      <SculptedPart position={[0, 0.555, 0.035]} scale={[0.62, 0.11, 0.6]} material={cushion} soft />
      {/* 四条略收分的木腿与前后横撑，人体尺度在近景中清楚可读。 */}
      {[-0.28, 0.28].flatMap((x) => [-0.28, 0.28].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.225, z]} rotation={[z * 0.08, 0, -x * 0.08]} material={darkWood} castShadow>
          <cylinderGeometry args={[0.032, 0.047, 0.45, 8]} />
        </mesh>
      )))}
      <mesh position={[0, 0.24, 0]} rotation={[0, 0, Math.PI / 2]} material={darkWood}>
        <cylinderGeometry args={[0.025, 0.025, 0.56, 8]} />
      </mesh>
      <mesh position={[0, 0.27, 0]} rotation={[Math.PI / 2, 0, 0]} material={darkWood}>
        <cylinderGeometry args={[0.022, 0.022, 0.56, 8]} />
      </mesh>
      {/* 靠背改为双立柱、弧边顶梁与独立软垫，删除原先整块木板轮廓。 */}
      {[-0.31, 0.31].map((x) => (
        <mesh key={x} position={[x, 0.87, -0.3]} rotation={[-0.06, 0, 0]} material={darkWood} castShadow>
          <cylinderGeometry args={[0.034, 0.044, 0.82, 8]} />
        </mesh>
      ))}
      <SculptedPart position={[0, 1.22, -0.25]} scale={[0.72, 0.13, 0.12]} rotation={[-0.06, 0, 0]} material={darkWood} />
      <SculptedPart position={[0, 0.96, -0.255]} scale={[0.56, 0.42, 0.105]} rotation={[-0.08, 0, 0]} material={cushion} soft />
      <SculptedPart position={[0, 0.96, -0.318]} scale={[0.37, 0.21, 0.02]} rotation={[-0.08, 0, 0]} material={accent % 2 ? sageFabric : lavenderFabric} castShadow={false} />
    </group>
  );
}

export function ClubStage({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]} dispose={null}>
      <SculptedPart position={[0, 0.18, 0]} scale={[7.2, 0.36, 2]} material={wood} />
      <mesh position={[0, 0.38, 0.92]} material={glowGold}><boxGeometry args={[7.2, 0.04, 0.07]} /></mesh>
      <mesh position={[0, 1.75, -0.96]} material={red}><boxGeometry args={[7.2, 2.8, 0.08]} /></mesh>
      {[-2.1, 0, 2.1].map((x) => (
        <mesh key={x} position={[x, 1.75, -0.9]} rotation={[0, 0, 0.08 * Math.sign(x)]} material={pink}>
          <boxGeometry args={[0.12, 2.7, 0.1]} />
        </mesh>
      ))}
      <mesh position={[0, 1.55, -0.8]} rotation={[Math.PI / 2, 0, 0]} material={cream} castShadow>
        <cylinderGeometry args={[0.62, 0.62, 0.09, 32]} />
      </mesh>
      {/* 社团活动室小型舞台：音箱、灯架和可更换海报，不是单一平面红墙。 */}
      {[-3.05, 3.05].map((x) => (
        <group key={x} position={[x, 0.72, 0.35]}>
          <SculptedPart position={[0, 0, 0]} scale={[0.72, 1.15, 0.52]} material={ink} />
          <mesh position={[0, 0.21, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={glowGold} castShadow>
            <cylinderGeometry args={[0.13, 0.16, 0.05, 16]} />
          </mesh>
          <mesh position={[0, -0.18, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={pink} castShadow>
            <cylinderGeometry args={[0.16, 0.19, 0.055, 16]} />
          </mesh>
          <SculptedPart position={[0, 0.48, 0.28]} scale={[0.34, 0.05, 0.04]} material={gold} castShadow={false} />
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
    <group position={position} rotation={[0, ry, 0]} dispose={null}>
      <SculptedPart position={[0, 0.66, 0]} scale={[1.34, 0.13, 1.34]} material={wood} />
      <SculptedPart position={[0, 0.735, 0]} scale={[1.18, 0.04, 1.18]} material={cream} />
      {/* 桌裙使桌面与四腿形成完整木作，而不是一块板悬在腿上。 */}
      {[-0.52, 0.52].map((z) => (
        <SculptedPart key={`apron-z-${z}`} position={[0, 0.53, z]} scale={[1.08, 0.22, 0.08]} material={darkWood} />
      ))}
      {[-0.52, 0.52].map((x) => (
        <SculptedPart key={`apron-x-${x}`} position={[x, 0.53, 0]} scale={[0.08, 0.22, 1.08]} material={darkWood} />
      ))}
      {[-0.28, 0, 0.28].flatMap((v) => [
        <mesh key={`h-${v}`} position={[0, 0.762, v]} material={darkWood}><boxGeometry args={[1.05, 0.014, 0.018]} /></mesh>,
        <mesh key={`v-${v}`} position={[v, 0.763, 0]} material={darkWood}><boxGeometry args={[0.018, 0.014, 1.05]} /></mesh>,
      ])}
      {[
        [-0.42, -0.42], [0.42, -0.42], [0.42, 0.42], [-0.42, 0.42],
      ].map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, 0.772, z]} material={colors[i]}>
            <cylinderGeometry args={[0.23, 0.23, 0.018, 20]} />
          </mesh>
          <mesh position={[x, 0.82, z]} material={colors[i]}><sphereGeometry args={[0.065, 12, 8]} /></mesh>
        </group>
      ))}
      {[-0.48, 0.48].flatMap((x) => [-0.48, 0.48].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.31, z]} rotation={[z * 0.06, 0, -x * 0.06]} material={darkWood} castShadow>
          <cylinderGeometry args={[0.035, 0.052, 0.62, 8]} />
        </mesh>
      )))}
      {/* 下层棋盒架与两只带盖收纳盒，盒盖、卡扣均有实体厚度。 */}
      <SculptedPart position={[0, 0.24, 0]} scale={[0.78, 0.06, 0.62]} material={wood} />
      {[-0.22, 0.22].map((x, i) => (
        <group key={`game-box-${x}`} position={[x, 0.31, 0]} rotation={[0, i ? -0.05 : 0.05, 0]}>
          <SculptedPart position={[0, 0, 0]} scale={[0.34, 0.13, 0.44]} material={i ? blue : red} />
          <SculptedPart position={[0, 0.08, 0]} scale={[0.36, 0.035, 0.46]} material={paper} />
          <SculptedPart position={[0, 0.01, 0.23]} scale={[0.1, 0.07, 0.025]} material={gold} castShadow={false} />
        </group>
      ))}
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

/** 带门板、抽屉和金属把手的社团收纳柜；棋盒与零散用品有明确归属。 */
export function ClubStorageCabinet({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]} dispose={null}>
      {/* 倒角柜体、内缩踢脚线和离地短脚先建立木作轮廓。 */}
      <SculptedPart position={[0, 0.76, 0]} scale={[3.6, 1.38, 0.62]} material={wood} />
      <SculptedPart position={[0, 1.49, 0]} scale={[3.76, 0.11, 0.7]} material={darkWood} />
      <SculptedPart position={[0, 0.1, 0.02]} scale={[3.22, 0.18, 0.5]} material={darkWood} />
      {[-1.46, 1.46].flatMap((x) => [-0.2, 0.2].map((z) => (
        <mesh key={`cabinet-foot-${x}-${z}`} position={[x, 0.045, z]} material={darkWood} castShadow>
          <cylinderGeometry args={[0.045, 0.06, 0.09, 8]} />
        </mesh>
      )))}
      {/* 上部四扇内嵌柜门有独立门框、芯板和条形把手。 */}
      {[-1.28, -0.43, 0.43, 1.28].map((x, i) => (
        <group key={x} position={[x, 0.97, 0.326]}>
          <SculptedPart position={[0, 0, 0]} scale={[0.76, 0.72, 0.065]} material={i % 2 ? cream : sage} />
          <SculptedPart position={[0, 0, 0.042]} scale={[0.58, 0.5, 0.035]} material={i % 2 ? sage : paper} />
          <mesh position={[i % 2 ? -0.24 : 0.24, 0, 0.09]} material={gold} castShadow>
            <cylinderGeometry args={[0.024, 0.024, 0.24, 8]} />
          </mesh>
        </group>
      ))}
      {/* 下部双抽屉有抽屉缝、实体前板和悬空拉手。 */}
      {[-0.86, 0.86].map((x) => (
        <group key={`drawer-${x}`} position={[x, 0.37, 0.335]}>
          <SculptedPart position={[0, 0, 0]} scale={[1.56, 0.28, 0.075]} material={cream} />
          <SculptedPart position={[0, 0.02, 0.055]} scale={[1.3, 0.08, 0.035]} material={paper} castShadow={false} />
          <mesh position={[0, 0.02, 0.12]} rotation={[0, 0, Math.PI / 2]} material={gold} castShadow>
            <cylinderGeometry args={[0.024, 0.024, 0.34, 8]} />
          </mesh>
          {[-0.17, 0.17].map((hx) => (
            <mesh key={hx} position={[hx, 0.02, 0.09]} rotation={[Math.PI / 2, 0, 0]} material={gold}>
              <cylinderGeometry args={[0.018, 0.018, 0.07, 7]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* 象棋盒、飞行棋盒和标签夹都拥有实体厚度。 */}
      {[[-1.15, red], [0, blue], [1.12, gold]].map(([x, material], i) => (
        <group key={i} position={[x as number, 1.62, -0.02]} rotation={[0, 0.08 * (i - 1), 0]}>
          <SculptedPart position={[0, 0, 0]} scale={[0.74, 0.18, 0.5]} material={material as THREE.Material} />
          <SculptedPart position={[0, 0.11, 0]} scale={[0.7, 0.045, 0.46]} material={paper} />
          <SculptedPart position={[0, 0.02, 0.255]} scale={[0.16, 0.08, 0.035]} material={darkWood} castShadow={false} />
        </group>
      ))}
    </group>
  );
}

/** 阅读角：厚书架、错落书脊、抽屉桌、台灯和软凳形成可读生活场景。 */
export function ClubReadingNook({ position, ry }: { position: P3; ry: number }) {
  const bookMats = [red, blue, green, lavender, gold, sage];
  return (
    <group position={position} rotation={[0, ry, 0]} dispose={null}>
      <group position={[-1.45, 0, 0]}>
        <mesh position={[0, 1.45, 0]} castShadow material={darkWood}><boxGeometry args={[2.1, 2.9, 0.62]} /></mesh>
        <mesh position={[0, 1.46, 0.34]} material={wood}><boxGeometry args={[1.76, 2.55, 0.08]} /></mesh>
        {[-0.75, 0, 0.75].map((y) => (
          <mesh key={y} position={[0, 1.42 + y, 0.39]} material={darkWood}><boxGeometry args={[1.86, 0.08, 0.46]} /></mesh>
        ))}
        {Array.from({ length: 18 }, (_, i) => {
          const row = Math.floor(i / 6);
          const col = i % 6;
          return (
            <mesh
              key={i}
              position={[-0.72 + col * 0.29, 0.88 + row * 0.74 + (i % 3) * 0.025, 0.47]}
              rotation={[0, 0, (i % 4 - 1.5) * 0.025]}
              material={bookMats[i % bookMats.length]}
            >
              <boxGeometry args={[0.19 + (i % 2) * 0.035, 0.48 + (i % 3) * 0.055, 0.28]} />
            </mesh>
          );
        })}
      </group>
      <group position={[1.0, 0, 0.1]}>
        <SculptedPart position={[0, 0.7, 0]} scale={[2.5, 0.12, 1.05]} material={wood} />
        {[-1.05, 1.05].flatMap((x) => [-0.38, 0.38].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.34, z]} material={darkWood}>
            <cylinderGeometry args={[0.045, 0.065, 0.68, 8]} />
          </mesh>
        )))}
        <SculptedPart position={[0, 0.5, -0.5]} scale={[0.86, 0.3, 0.08]} material={darkWood} />
        <SculptedPart position={[0, 0.5, -0.555]} scale={[0.72, 0.19, 0.045]} material={sage} />
        <mesh position={[0, 0.5, -0.61]} rotation={[0, 0, Math.PI / 2]} material={gold}>
          <cylinderGeometry args={[0.018, 0.018, 0.22, 7]} />
        </mesh>
        <group position={[0.78, 0.78, -0.18]}>
          <mesh position={[0, 0.25, 0]} material={darkWood}><cylinderGeometry args={[0.022, 0.03, 0.5, 8]} /></mesh>
          <mesh position={[0, 0.52, 0]} material={glowGold}><coneGeometry args={[0.2, 0.22, 16]} /></mesh>
          <pointLight position={[0, 0.42, 0.12]} color="#ffd7a0" intensity={1.3} distance={3.6} decay={2} />
        </group>
        <mesh position={[-0.48, 0.79, 0.08]} rotation={[0, -0.16, 0]} material={paper}>
          <boxGeometry args={[0.72, 0.035, 0.46]} />
        </mesh>
      </group>
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
    <group dispose={null}>
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
    <group dispose={null}>
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
      {[-2.9, -1.0, 0.9, 2.8].map((x, i) => (
        <group key={`cubby-${x}`} position={[x, 1.0, -8.7]}>
          {/* 开放柜格使用背板、四边框、层板和抽屉，不再是一块黑色矩形。 */}
          <SculptedPart position={[0, 0, -0.08]} scale={[1.28, 1.28, 0.12]} material={darkWood} />
          {[-0.62, 0.62].map((y) => (
            <SculptedPart key={`cubby-rail-y-${y}`} position={[0, y, 0.06]} scale={[1.35, 0.12, 0.34]} material={wood} />
          ))}
          {[-0.62, 0.62].map((edge) => (
            <SculptedPart key={`cubby-rail-x-${edge}`} position={[edge, 0, 0.06]} scale={[0.12, 1.35, 0.34]} material={wood} />
          ))}
          <SculptedPart position={[0, 0.08, 0.1]} scale={[1.08, 0.08, 0.28]} material={darkWood} />
          <SculptedPart position={[0, -0.38, 0.15]} scale={[1.08, 0.32, 0.16]} material={i % 2 ? sage : cream} />
          <mesh position={[0, -0.38, 0.25]} rotation={[0, 0, Math.PI / 2]} material={gold} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.32, 8]} />
          </mesh>
          <SculptedPart
            position={[x < 0 ? -0.22 : 0.22, 0.34, 0.18]}
            scale={[0.42, 0.28, 0.24]}
            rotation={[0, x * 0.012, 0]}
            material={i % 2 ? lavender : sage}
          />
        </group>
      ))}
      {/* 软垫角落与小绿植，避免社团室只剩桌椅的硬朗轮廓。 */}
      {[-9.2, 9.2].map((x, i) => (
        <group key={`corner-${x}`} position={[x, 0, i ? -5.4 : 5.3]}>
          <SculptedPart position={[0, 0.28, 0]} scale={[1.1, 0.5, 1.1]} material={i ? lavenderFabric : sageFabric} soft />
          <SculptedPart position={[0, 0.06, 0]} scale={[0.82, 0.12, 0.82]} material={darkWood} />
          {[-0.36, 0.36].flatMap((fx) => [-0.36, 0.36].map((fz) => (
            <mesh key={`ottoman-foot-${fx}-${fz}`} position={[fx, 0.035, fz]} material={darkWood}>
              <cylinderGeometry args={[0.025, 0.035, 0.07, 7]} />
            </mesh>
          )))}
          <mesh position={[0, 0.92, 0]} material={green}><sphereGeometry args={[0.34, 12, 9]} /></mesh>
          <mesh position={[-0.18, 1.1, 0.04]} scale={[0.72, 0.88, 0.72]} material={green}><sphereGeometry args={[0.26, 10, 8]} /></mesh>
          <mesh position={[0.2, 1.08, -0.04]} scale={[0.74, 0.9, 0.74]} material={green}><sphereGeometry args={[0.25, 10, 8]} /></mesh>
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

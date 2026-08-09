/**
 * 网吧 NEXUS / 雀庄「东风阁」室内专属件(工单 P5,总纲 §4.4)。
 *
 * - NcStation:电竞桌 + 27" 曲面感显示器。坐该位的玩家开着屏幕共享时,
 *   自己的画面就贴上自己的显示器(WebRTC VideoTexture,复用 voice.screenStreams
 *   / localScreenStream 与 useVoice.screenVersion,同 ScreenBillboard 做法);
 *   无流时显示待机 canvas。桌下蓝青灯带克制(§4.4「低亮度」)。
 * - NcCounter:网吧前台(泡面堆 + 饮料架 + 耳机挂钩)。
 * - NetcafeExtras:墙面蓝青灯带(Interior.tsx 挂载)。
 * - GrTea / GrCounter / GrLantern:茶水台 / 点棒柜台 / 暖橙灯笼。
 * - ShojiWindow / YakuScroll / GameroomExtras:障子窗、役种一览挂轴(canvas 字画)。
 *
 * 全程序化、零外部资产;颜色全部取自 city palette,材质走 city toon 工厂。
 */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useWorld, useVoice, useSession } from '../../state/stores';
import { voice } from '../../voice/voice';
import { ENV, ACCENT } from '../city/palette';
import { toonMat } from '../city/toon';
import { surfaceMaterial, type SurfaceKind } from '../city/materials';

type P3 = [number, number, number];

function surface(kind: SurfaceKind, color: string): THREE.MeshStandardMaterial {
  const m = surfaceMaterial(kind);
  m.color.set(color);
  return m;
}

/* ─── 共享材质(模块级,8 台机位共用) ───────────────────────────────────── */
const deskMat = surface('metal', '#2b2f3a');           // 电竞桌面:深蓝灰(ENV 系)
const deskFrameMat = surface('brushedMetal', ENV.metal); // 桌架/显示器支架
const bezelMat = surface('darkGlass', '#14171d');      // 屏幕边框深色
const ncGlowMat = toonMat(ACCENT.netcafeSign, { emissive: ACCENT.netcafeSign, emissiveIntensity: 0.9 });
const ncGlowDimMat = toonMat(ACCENT.netcafeSign, { emissive: ACCENT.netcafeSign, emissiveIntensity: 0.35 });
const towerMat = surface('metal', '#1f232e');
const woodWarmMat = surface('wood', '#4a3b30');        // 雀庄暖木
const woodDarkMat = surface('wood', '#33291f');
const paperWarmMat = surface('plasticLightbox', '#e8ddc8');
paperWarmMat.emissive.set(ACCENT.windowWarm); paperWarmMat.emissiveIntensity = 0.08;
const lanternMat = toonMat(ACCENT.mahjongLantern, { emissive: ACCENT.mahjongLantern, emissiveIntensity: 1.1 });
const lanternCapMat = toonMat('#2a211a');
const ceramicMat = surface('plasticLightbox', '#d8d2c4');
const ncGlowOffMat = toonMat(ACCENT.netcafeSign, { emissive: ACCENT.netcafeSign, emissiveIntensity: 0.05 });
const canRedMat = toonMat(ACCENT.vendingRed);
const stickBlueMat = toonMat('#3a5a8c');
const teaBucketMat = toonMat('#7a4a3a');
const tasselMat = toonMat('#8a3a2a');
const grSignMat = toonMat(ACCENT.mahjongLantern, { emissive: ACCENT.mahjongLantern, emissiveIntensity: 0.8 });
const cinemaInkMat = surface('acousticFabric', '#17131d');
const cinemaVelvetMat = surface('seatFabric', '#3b172b');
const cinemaRedMat = toonMat('#ff3f6c', { emissive: '#ff3f6c', emissiveIntensity: 0.75 });
const cinemaGoldMat = toonMat('#f5bb62', { emissive: '#f58c55', emissiveIntensity: 0.55 });
const arenaDeckMat = surface('metal', '#151928');
const arenaTierMat = surface('acousticFabric', '#24283b');
const arenaPurpleMat = toonMat('#7a5fff', { emissive: '#7a5fff', emissiveIntensity: 0.8 });
const arenaCyanMat = toonMat('#40e8ff', { emissive: '#40e8ff', emissiveIntensity: 0.85 });
const arenaPinkMat = toonMat('#ff5fd8', { emissive: '#ff5fd8', emissiveIntensity: 0.8 });

/* ─── canvas 贴图缓存 ────────────────────────────────────────────────────── */
const texCache = new Map<string, THREE.CanvasTexture>();

/** 显示器待机画面:NEXUS 蓝青 logo + 中文提示。 */
function ncIdleTexture(): THREE.CanvasTexture {
  const hit = texCache.get('nc-idle');
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 288;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 512, 288);
  grad.addColorStop(0, '#10141f');
  grad.addColorStop(1, '#141c30');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 288);
  // 斜向扫描线,像息屏保护
  ctx.strokeStyle = 'rgba(93,143,201,0.08)';
  ctx.lineWidth = 2;
  for (let i = -288; i < 512; i += 18) {
    ctx.beginPath(); ctx.moveTo(i, 288); ctx.lineTo(i + 288, 0); ctx.stroke();
  }
  ctx.fillStyle = '#5d8fc9';
  ctx.font = '800 58px "Segoe UI", "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEXUS', 256, 140);
  ctx.fillStyle = '#8a94ad';
  ctx.font = '20px "Noto Sans SC", "Segoe UI", sans-serif';
  ctx.fillText('待机中 · 坐下并分享屏幕即可上屏', 256, 186);
  const t = new THREE.CanvasTexture(c);
  texCache.set('nc-idle', t);
  return t;
}

/** 役种一览挂轴字画(§4.4 雀庄墙饰)。 */
function yakuScrollTexture(): THREE.CanvasTexture {
  const hit = texCache.get('yaku-scroll');
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 768;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e8dfc8';
  ctx.fillRect(0, 0, 256, 768);
  // 纸纹淡斑
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % 256, y = (i * 191) % 768;
    ctx.fillStyle = i % 2 ? 'rgba(120,100,70,0.05)' : 'rgba(255,250,238,0.08)';
    ctx.beginPath(); ctx.arc(x, y, 14 + (i % 5) * 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#8a5a2e';
  ctx.lineWidth = 5;
  ctx.strokeRect(14, 14, 228, 740);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7a2e1f';
  ctx.font = '700 34px "Noto Serif SC", "Noto Sans SC", serif';
  ctx.fillText('役 种 一 览', 128, 66);
  ctx.strokeStyle = '#8a5a2e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(40, 84); ctx.lineTo(216, 84); ctx.stroke();
  const rows: Array<[string, string]> = [
    ['立直', '一番'], ['断幺九', '一番'], ['平和', '一番'], ['役牌', '一番'],
    ['门清自摸', '一番'], ['七对子', '二番'], ['对对和', '二番'],
    ['混一色', '三番'], ['清一色', '六番'], ['国士无双', '役满'],
  ];
  ctx.font = '600 26px "Noto Serif SC", "Noto Sans SC", serif';
  rows.forEach(([name, han], i) => {
    const y = 130 + i * 58;
    ctx.fillStyle = '#3a3026';
    ctx.textAlign = 'left';
    ctx.fillText(name, 36, y);
    ctx.fillStyle = han === '役满' ? '#7a2e1f' : '#6a5a44';
    ctx.textAlign = 'right';
    ctx.fillText(han, 220, y);
  });
  // 落款印章
  ctx.fillStyle = '#a03a2a';
  ctx.fillRect(186, 706, 34, 34);
  ctx.fillStyle = '#e8dfc8';
  ctx.font = '700 15px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.fillText('东风', 203, 720);
  ctx.fillText('阁印', 203, 736);
  const t = new THREE.CanvasTexture(c);
  texCache.set('yaku-scroll', t);
  return t;
}

/* ─── 曲面屏公共几何参数 ─────────────────────────────────────────────────── */
const SCREEN_R = 0.85;       // 曲率半径
const SCREEN_ARC = 0.76;     // 弧长角(弦宽 ≈ 2R·sin(a/2) ≈ 0.63m,27" 感)
const SCREEN_H = 0.34;

/** 曲面内侧显示面(BackSide),u 方向做镜像补正。 */
function CurvedSurface({ tex, emissive }: { tex: THREE.Texture; emissive: boolean }) {
  const mat = useMemo(() => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -1;
    tex.colorSpace = THREE.SRGBColorSpace;
    if (emissive) {
      // 视频流:不受灯光影响直接发亮(和 ScreenBillboard 一致的可读性)
      return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.BackSide });
    }
    return new THREE.MeshStandardMaterial({
      map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.6,
      roughness: 0.6, side: THREE.BackSide,
    });
  }, [tex, emissive]);
  useEffect(() => () => { mat.dispose(); }, [mat]);
  return (
    <mesh position={[0, 0, SCREEN_R]} material={mat}>
      <cylinderGeometry args={[SCREEN_R, SCREEN_R, SCREEN_H, 16, 1, true, Math.PI - SCREEN_ARC / 2, SCREEN_ARC]} />
    </mesh>
  );
}

/** 坐位占用者的共享画面纹理;无人/无流时返回 null。 */
function useSeatScreenTexture(seatId: string): THREE.VideoTexture | null {
  const occupantId = useWorld((s) => s.seats[seatId]);
  const selfId = useSession((s) => s.self?.userId);
  const screenVersion = useVoice((s) => s.screenVersion);
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);

  const stream = useMemo(() => {
    if (occupantId === undefined) return null;
    return occupantId === selfId
      ? voice.localScreenStream
      : voice.screenStreams.get(occupantId) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occupantId, selfId, screenVersion]);

  useEffect(() => {
    if (!stream) { setTexture(null); return; }
    const el = document.createElement('video');
    el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;
    void el.play().catch(() => undefined);
    const tex = new THREE.VideoTexture(el);
    setTexture(tex);
    return () => {
      tex.dispose();
      el.srcObject = null;
    };
  }, [stream]);
  return texture;
}

/* ─── 网吧:电竞机位 ─────────────────────────────────────────────────────── */
export function NcStation({ position, ry, seatIdx }: { position: P3; ry: number; seatIdx: number }) {
  const videoTex = useSeatScreenTexture(`nc-s${seatIdx}`);
  const idle = useMemo(() => ncIdleTexture(), []);
  // 泡面/饮料按机位错落摆放(种子 = seatIdx,禁止等距一致)
  const clutter = seatIdx % 3;
  return (
    <group position={position} rotation={[0, ry, 0]}>
      {/* 桌面 + 侧板腿 + 背板 */}
      <mesh position={[0, 0.72, 0]} material={deskMat} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.045, 0.62]} />
      </mesh>
      {[-0.64, 0.64].map((x) => (
        <mesh key={x} position={[x, 0.36, 0]} material={deskFrameMat}>
          <boxGeometry args={[0.05, 0.72, 0.56]} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, -0.27]} material={deskFrameMat}>
        <boxGeometry args={[1.28, 0.5, 0.03]} />
      </mesh>
      {/* 桌下 RGB 灯带(前缘,克制低亮度)+ 桌沿灯线 */}
      <mesh position={[0, 0.693, 0.3]} material={ncGlowDimMat}>
        <boxGeometry args={[1.3, 0.014, 0.014]} />
      </mesh>
      {/* 显示器:支架 + 曲面屏 + 背壳 */}
      <group position={[0, 1.14, -0.14]} rotation={[-0.06, 0, 0]}>
        <CurvedSurface tex={videoTex ?? idle} emissive={!!videoTex} />
        {/* 背壳/边框:略大的同弧曲面 */}
        <mesh position={[0, 0, SCREEN_R + 0.016]} material={bezelMat}>
          <cylinderGeometry args={[SCREEN_R + 0.015, SCREEN_R + 0.015, SCREEN_H + 0.05, 16, 1, true, Math.PI - (SCREEN_ARC + 0.06) / 2, SCREEN_ARC + 0.06]} />
        </mesh>
        {/* 电源呼吸灯点 */}
        <mesh position={[0, -SCREEN_H / 2 - 0.012, 0.012]} material={ncGlowMat}>
          <boxGeometry args={[0.03, 0.008, 0.008]} />
        </mesh>
      </group>
      <mesh position={[0, 0.86, -0.2]} material={deskFrameMat}>
        <cylinderGeometry args={[0.022, 0.03, 0.26, 8]} />
      </mesh>
      <mesh position={[0, 0.746, -0.2]} material={deskFrameMat}>
        <boxGeometry args={[0.22, 0.014, 0.16]} />
      </mesh>
      {/* 键盘(淡背光)+ 鼠标 + 耳机挂钩 */}
      <mesh position={[0, 0.752, 0.14]} material={bezelMat}>
        <boxGeometry args={[0.42, 0.016, 0.14]} />
      </mesh>
      <mesh position={[0, 0.761, 0.14]} material={ncGlowDimMat}>
        <boxGeometry args={[0.4, 0.002, 0.12]} />
      </mesh>
      <mesh position={[0.3, 0.752, 0.16]} material={bezelMat}>
        <boxGeometry args={[0.06, 0.02, 0.09]} />
      </mesh>
      <mesh position={[-0.7, 0.62, 0.1]} material={deskFrameMat}>
        <boxGeometry args={[0.02, 0.02, 0.12]} />
      </mesh>
      {/* 主机(桌下,呼吸灯槽) */}
      <mesh position={[0.5, 0.24, -0.05]} material={towerMat} castShadow>
        <boxGeometry args={[0.17, 0.42, 0.4]} />
      </mesh>
      <mesh position={[0.5, 0.24, 0.152]} material={ncGlowDimMat}>
        <boxGeometry args={[0.012, 0.34, 0.006]} />
      </mesh>
      {/* 生活感杂物:泡面桶 / 饮料罐(按位错落) */}
      {clutter !== 0 && (
        <mesh position={[clutter === 1 ? -0.52 : -0.44, 0.775, clutter === 1 ? 0.18 : -0.1]} material={ceramicMat} castShadow>
          <cylinderGeometry args={[0.045, 0.036, 0.07, 10]} />
        </mesh>
      )}
      {clutter === 2 && (
        <mesh position={[-0.56, 0.766, 0.12]} material={ncGlowDimMat}>
          <cylinderGeometry args={[0.022, 0.022, 0.048, 8]} />
        </mesh>
      )}
    </group>
  );
}

/* ─── 网吧:前台(泡面堆 + 饮料架) ─────────────────────────────────────── */
export function NcCounter({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.5, 0]} material={deskMat} castShadow receiveShadow>
        <boxGeometry args={[2.3, 1.0, 0.7]} />
      </mesh>
      <mesh position={[0, 1.02, 0]} material={bezelMat}>
        <boxGeometry args={[2.4, 0.05, 0.8]} />
      </mesh>
      {/* 台面灯带描边(蓝青,克制) */}
      <mesh position={[0, 0.99, 0.39]} material={ncGlowDimMat}>
        <boxGeometry args={[2.36, 0.012, 0.012]} />
      </mesh>
      {/* 泡面堆(§4.4):三摞错落 */}
      {([[-0.7, 0, 2], [-0.4, 0.12, 3], [-0.62, -0.18, 1]] as const).map(([x, z, n], i) => (
        <group key={i} position={[x, 1.045, z]}>
          {Array.from({ length: n }).map((_, j) => (
            <mesh key={j} position={[0, 0.045 + j * 0.085, 0]} material={ceramicMat} castShadow>
              <cylinderGeometry args={[0.055, 0.044, 0.085, 10]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* 饮料罐排 */}
      {[0.35, 0.5, 0.65, 0.8].map((x, i) => (
        <mesh key={x} position={[x, 1.075, i % 2 ? 0.12 : -0.08]} material={i % 2 ? ncGlowDimMat : canRedMat}>
          <cylinderGeometry args={[0.026, 0.026, 0.09, 8]} />
        </mesh>
      ))}
      {/* 小台牌「前台」 */}
      <mesh position={[0.05, 1.11, 0.2]} rotation={[-0.3, 0, 0]} material={ncGlowMat}>
        <boxGeometry args={[0.24, 0.1, 0.014]} />
      </mesh>
    </group>
  );
}

/** 网吧墙面灯带(Interior.tsx 挂载;§4.4 蓝青灯带,克制)。 */
export function NetcafeExtras({ lightsOn }: { lightsOn: boolean }) {
  const strip = lightsOn ? ncGlowMat : ncGlowOffMat;
  return (
    <group>
      {/* 北墙高位灯带(联赛大屏上方)*/}
      <mesh position={[0, 4.35, -7.4]} material={strip}>
        <boxGeometry args={[19.6, 0.05, 0.05]} />
      </mesh>
      {/* 东西墙腰线灯带 */}
      {[-9.9, 9.9].map((x) => (
        <mesh key={x} position={[x, 3.2, 0]} material={strip}>
          <boxGeometry args={[0.05, 0.05, 14.6]} />
        </mesh>
      ))}
      {/* 踢脚地灯线(南墙除门洞两段) */}
      {[-5.55, 5.55].map((x) => (
        <mesh key={x} position={[x, 0.06, 7.38]} material={strip}>
          <boxGeometry args={[8.7, 0.03, 0.03]} />
        </mesh>
      ))}
    </group>
  );
}

/** 巨幕厅空间骨架：屏幕之外的声学墙、红色走道和顶棚星点，让影院像一座真正的放映厅。 */
export function CinemaExtras({ lightsOn }: { lightsOn: boolean }) {
  const glow = lightsOn ? cinemaRedMat : cinemaInkMat;
  return (
    <group>
      {/* 银幕舞台框与两侧吸音塔 */}
      <mesh position={[0, 0.35, -11.1]} material={cinemaVelvetMat}>
        <boxGeometry args={[25.8, 0.7, 0.35]} />
      </mesh>
      {/* 巨幕四边的灯箱压条：待机时也能明确读出屏幕边界与舞台尺度。 */}
      <mesh position={[0, 10.92, -10.98]} material={cinemaGoldMat}><boxGeometry args={[24.8, 0.12, 0.18]} /></mesh>
      <mesh position={[0, 0.68, -10.98]} material={cinemaRedMat}><boxGeometry args={[24.8, 0.16, 0.18]} /></mesh>
      {[-12.42, 12.42].map((x) => (
        <mesh key={`screen-edge-${x}`} position={[x, 5.8, -10.98]} material={cinemaRedMat}>
          <boxGeometry args={[0.12, 10.2, 0.18]} />
        </mesh>
      ))}
      {[-12.25, 12.25].map((x) => (
        <group key={x} position={[x, 4.8, -11.0]}>
          <mesh material={cinemaInkMat}><boxGeometry args={[0.46, 9.5, 0.5]} /></mesh>
          <mesh position={[x < 0 ? 0.28 : -0.28, 0, 0.12]} material={glow}><boxGeometry args={[0.08, 8.8, 0.08]} /></mesh>
        </group>
      ))}
      {/* 侧墙不规则声学板，打破空白长墙 */}
      {[-1, 1].flatMap((side) => [ -8.3, -5.0, -1.7, 1.8, 5.2, 8.5 ].map((z) => (
        <mesh key={`${side}-${z}`} position={[side * 14.72, 3.45 + ((Math.abs(z) * 3) % 2) * 0.22, z]} rotation={[0, side * Math.PI / 2, 0]} material={cinemaInkMat}>
          <boxGeometry args={[2.45, 3.1, 0.18]} />
        </mesh>
      )))}
      {/* 双主过道红灯带，和每排台阶的暖色边缘形成连续导视 */}
      {[-4.5, 4.5].map((x) => (
        <mesh key={x} position={[x, 0.035, 3.0]} material={glow}>
          <boxGeometry args={[0.08, 0.035, 16.5]} />
        </mesh>
      ))}
      {[-8.7, 8.7].map((x) => (
        <mesh key={x} position={[x, 0.045, 0]} material={cinemaGoldMat}>
          <boxGeometry args={[0.04, 0.04, 18.4]} />
        </mesh>
      ))}
      {/* 顶棚星点与隐藏式侧灯，放映时仍保留一点空间轮廓 */}
      {Array.from({ length: 18 }, (_, i) => {
        const x = -12 + (i % 6) * 4.8;
        const z = -9.5 + Math.floor(i / 6) * 8.6;
        return <mesh key={i} position={[x, 11.45, z]} material={lightsOn ? cinemaGoldMat : cinemaInkMat}>
          <sphereGeometry args={[0.07 + (i % 3) * 0.025, 8, 6]} />
        </mesh>;
      })}
      {lightsOn && <>
        <pointLight position={[-11, 4.2, -8.5]} color="#ff3f6c" intensity={4.5} distance={14} decay={2} />
        <pointLight position={[11, 4.2, -8.5]} color="#5d8fff" intensity={4.0} distance={14} decay={2} />
        <pointLight position={[0, 8.4, 1.5]} color="#f3a06a" intensity={3.5} distance={16} decay={2} />
      </>}
    </group>
  );
}

/** 电竞观战馆：保留 8 个可坐机位，同时用侧向看台、中央赛台和悬浮信息屏做成小型赛事场馆。 */
export function ArenaExtras({ lightsOn }: { lightsOn: boolean }) {
  const cyan = lightsOn ? arenaCyanMat : arenaDeckMat;
  const pink = lightsOn ? arenaPinkMat : arenaDeckMat;
  return (
    <group>
      {/* 侧向阶梯看台：每级略抬高，形成参考图里的碗状包围感 */}
      {[-1, 1].flatMap((side) => Array.from({ length: 4 }, (_, row) => {
        const x = side * (8.35 - row * 0.42);
        const y = 0.22 + row * 0.46;
        return (
          <group key={`${side}-${row}`} position={[x, y, 0.15]}>
            <mesh material={arenaTierMat} castShadow receiveShadow>
              <boxGeometry args={[2.55, 0.38, 12.2]} />
            </mesh>
            <mesh position={[0, 0.22, -6.04]} material={arenaDeckMat} castShadow>
              <boxGeometry args={[2.55, 0.16, 0.16]} />
            </mesh>
            <mesh position={[side * 0.72, 0.22, 0]} material={row % 2 ? cyan : pink}>
              <boxGeometry args={[0.045, 0.045, 11.5]} />
            </mesh>
            {Array.from({ length: 7 }, (_, seat) => (
              <group key={seat} position={[side * 0.25, 0.42, -4.8 + seat * 1.6]}>
                <mesh material={seat % 3 === 0 ? arenaPinkMat : arenaDeckMat} castShadow>
                  <boxGeometry args={[1.35, 0.16, 0.62]} />
                </mesh>
                <mesh position={[0, 0.3, -0.24]} material={arenaTierMat} castShadow>
                  <boxGeometry args={[1.35, 0.52, 0.12]} />
                </mesh>
                <mesh position={[0, 0.15, 0.22]} material={arenaDeckMat}>
                  <boxGeometry args={[0.95, 0.08, 0.08]} />
                </mesh>
                {[-0.5, 0.5].map((arm) => (
                  <mesh key={arm} position={[arm, 0.3, 0]} material={arenaDeckMat}>
                    <boxGeometry args={[0.06, 0.32, 0.52]} />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
        );
      }))}
      {/* 中央赛台与发光环 */}
      <mesh position={[0, 0.26, -4.45]} material={arenaDeckMat} castShadow receiveShadow>
        <boxGeometry args={[9.2, 0.52, 2.7]} />
      </mesh>
      <mesh position={[0, 0.57, -4.45]} material={arenaTierMat} castShadow>
        <boxGeometry args={[8.45, 0.16, 2.12]} />
      </mesh>
      <mesh position={[0, 0.69, -4.45]} material={cyan} castShadow>
        <boxGeometry args={[7.8, 0.06, 1.72]} />
      </mesh>
      <mesh position={[0, 0.75, -4.45]} rotation={[-Math.PI / 2, 0, 0]} material={pink}>
        <torusGeometry args={[2.2, 0.045, 8, 32]} />
      </mesh>
      {[-3.35, 3.35].map((x) => (
        <group key={x} position={[x, 0.75, -4.45]}>
          <mesh position={[0, 0.18, 0]} material={arenaDeckMat} castShadow><boxGeometry args={[0.78, 0.36, 1.08]} /></mesh>
          <mesh position={[0, 0.4, 0]} material={arenaTierMat}><boxGeometry args={[0.58, 0.08, 0.82]} /></mesh>
        </group>
      ))}
      {/* 四角灯架与悬浮比分屏 */}
      {[-4.5, 4.5].flatMap((x) => [-5.15, -3.75].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 2.35, z]} material={arenaDeckMat} castShadow>
          <boxGeometry args={[0.18, 4.1, 0.18]} />
        </mesh>
      )))}
      <mesh position={[0, 4.4, -4.45]} material={arenaDeckMat} castShadow>
        <boxGeometry args={[9.35, 0.22, 2.55]} />
      </mesh>
      <mesh position={[0, 4.25, -4.72]} material={arenaDeckMat} castShadow receiveShadow>
        <boxGeometry args={[8.1, 4.4, 0.34]} />
      </mesh>
      <mesh position={[0, 4.25, -4.5]} material={arenaTierMat}>
        <boxGeometry args={[7.45, 3.78, 0.1]} />
      </mesh>
      <mesh position={[0, 4.25, -4.28]} material={cyan}>
        <boxGeometry args={[7.55, 0.08, 0.08]} />
      </mesh>
      <mesh position={[0, 4.25, -4.92]} material={pink}>
        <boxGeometry args={[7.55, 0.08, 0.08]} />
      </mesh>
      {[-3.8, 3.8].map((x) => (
        <group key={x} position={[x, 4.25, -4.45]}>
          <mesh material={arenaDeckMat}><boxGeometry args={[0.2, 4.2, 0.46]} /></mesh>
          <mesh position={[x < 0 ? 0.14 : -0.14, 0, 0.14]} material={cyan}><boxGeometry args={[0.05, 3.8, 0.05]} /></mesh>
        </group>
      ))}
      <mesh position={[0, 4.4, -5.15]} material={arenaDeckMat} castShadow>
        <boxGeometry args={[9.2, 0.18, 0.18]} />
      </mesh>
      <mesh position={[0, 4.4, -3.75]} material={arenaDeckMat} castShadow>
        <boxGeometry args={[9.2, 0.18, 0.18]} />
      </mesh>
      {[-3, 0, 3].map((x) => (
        <mesh key={x} position={[x, 4.4, -4.45]} material={arenaDeckMat}>
          <boxGeometry args={[0.12, 0.22, 1.55]} />
        </mesh>
      ))}
      {[-1, 1].flatMap((side) => [-6.1, 6.1].map((z) => (
        <group key={`${side}-${z}`}>
          <mesh position={[side * 6.95, 1.35, z]} rotation={[Math.PI / 2, 0, 0]} material={arenaDeckMat}>
            <cylinderGeometry args={[0.045, 0.045, 11.3, 8]} />
          </mesh>
          {[-4.5, -1.5, 1.5, 4.5].map((post) => (
            <mesh key={post} position={[side * 6.95, 0.85, post]} material={arenaDeckMat}>
              <cylinderGeometry args={[0.055, 0.055, 1.0, 8]} />
            </mesh>
          ))}
        </group>
      )))}
      {/* 斜向聚光束只作为轻量图形，不遮挡玩家和交互 */}
      {lightsOn && <>
        <mesh position={[-6.5, 3.4, -4.6]} rotation={[0, 0, -0.38]}>
          <coneGeometry args={[1.2, 6.2, 12, 1, true]} />
          <meshBasicMaterial color="#6d74ff" transparent opacity={0.12} depthWrite={false} />
        </mesh>
        <mesh position={[6.5, 3.4, -4.6]} rotation={[0, 0, 0.38]}>
          <coneGeometry args={[1.2, 6.2, 12, 1, true]} />
          <meshBasicMaterial color="#ff5fd8" transparent opacity={0.12} depthWrite={false} />
        </mesh>
        <pointLight position={[-6.1, 3.2, -4.6]} color="#646dff" intensity={5.5} distance={11} decay={2} />
        <pointLight position={[6.1, 3.2, -4.6]} color="#ff5fd8" intensity={5.5} distance={11} decay={2} />
      </>}
    </group>
  );
}

/* ─── 雀庄:茶水台 ───────────────────────────────────────────────────────── */
export function GrTea({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.44, 0]} material={woodWarmMat} castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.88, 0.52]} />
      </mesh>
      <mesh position={[0, 0.9, 0]} material={woodDarkMat}>
        <boxGeometry args={[2.08, 0.05, 0.6]} />
      </mesh>
      {/* 抽屉缝线 */}
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} position={[x, 0.55, 0.265]} material={woodDarkMat}>
          <boxGeometry args={[0.8, 0.02, 0.01]} />
        </mesh>
      ))}
      {/* 烧水壶 + 茶壶 + 叠起来的茶杯 */}
      <group position={[-0.6, 0.925, 0]}>
        <mesh material={deskFrameMat} castShadow>
          <cylinderGeometry args={[0.09, 0.11, 0.2, 12]} />
        </mesh>
        <mesh position={[0, 0.13, 0]} material={deskFrameMat}>
          <cylinderGeometry args={[0.03, 0.05, 0.05, 8]} />
        </mesh>
        <mesh position={[0.1, -0.02, 0]} rotation={[0, 0, -0.7]} material={deskFrameMat}>
          <cylinderGeometry args={[0.014, 0.02, 0.12, 6]} />
        </mesh>
      </group>
      <mesh position={[0.05, 0.985, 0.05]} material={ceramicMat} castShadow>
        <sphereGeometry args={[0.075, 10, 8]} />
      </mesh>
      <mesh position={[0.2, 0.945, -0.1]} material={ceramicMat}>
        <cylinderGeometry args={[0.05, 0.04, 0.05, 10]} />
      </mesh>
      {[0.42, 0.54, 0.66].map((x, i) => (
        <mesh key={x} position={[x, 0.955 + (i === 1 ? 0.0 : 0.0), i % 2 ? 0.08 : -0.06]} material={ceramicMat}>
          <cylinderGeometry args={[0.032, 0.026, 0.06, 8]} />
        </mesh>
      ))}
      {/* 保温桶(茶水) */}
      <mesh position={[0.86, 1.05, 0]} material={teaBucketMat} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.26, 12]} />
      </mesh>
    </group>
  );
}

/* ─── 雀庄:点棒柜台 ─────────────────────────────────────────────────────── */
export function GrCounter({ position, ry }: { position: P3; ry: number }) {
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.5, 0]} material={woodWarmMat} castShadow receiveShadow>
        <boxGeometry args={[1.9, 1.0, 0.9]} />
      </mesh>
      <mesh position={[0, 1.02, 0]} material={woodDarkMat}>
        <boxGeometry args={[2.0, 0.05, 1.0]} />
      </mesh>
      {/* 玻璃展示格:点棒托盘(白棒红点简化) */}
      <mesh position={[0, 1.075, 0.05]} material={bezelMat}>
        <boxGeometry args={[1.4, 0.05, 0.6]} />
      </mesh>
      {Array.from({ length: 3 }).map((_, row) => (
        <group key={row} position={[0, 1.105, -0.13 + row * 0.18]}>
          {Array.from({ length: 6 }).map((_, i) => (
            <mesh key={i} position={[-0.5 + i * 0.2, 0, 0]} material={ceramicMat}>
              <boxGeometry args={[0.14, 0.012, 0.018]} />
            </mesh>
          ))}
          <mesh position={[0.62, 0, 0]} material={row === 1 ? canRedMat : stickBlueMat}>
            <boxGeometry args={[0.14, 0.012, 0.018]} />
          </mesh>
        </group>
      ))}
      {/* 柜台小灯牌「点棒」 */}
      <mesh position={[-0.75, 1.16, 0.3]} rotation={[-0.25, 0, 0]} material={grSignMat}>
        <boxGeometry args={[0.22, 0.12, 0.016]} />
      </mesh>
      {/* 算盘 */}
      <mesh position={[0.6, 1.055, 0.32]} material={woodDarkMat}>
        <boxGeometry args={[0.26, 0.02, 0.14]} />
      </mesh>
    </group>
  );
}

/* ─── 雀庄:暖橙灯笼(§2.2 mahjongLantern) ─────────────────────────────── */
export function GrLantern({ position }: { position: P3 }) {
  return (
    <group position={position}>
      {/* 吊绳到天花板 */}
      <mesh position={[0, 0.55, 0]} material={lanternCapMat}>
        <cylinderGeometry args={[0.008, 0.008, 0.7, 5]} />
      </mesh>
      <mesh position={[0, 0.22, 0]} material={lanternCapMat}>
        <cylinderGeometry args={[0.09, 0.11, 0.05, 10]} />
      </mesh>
      <mesh material={lanternMat} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.3, 12]} />
      </mesh>
      <mesh position={[0, 0.16, 0]} material={lanternMat}>
        <cylinderGeometry args={[0.1, 0.17, 0.05, 12]} />
      </mesh>
      <mesh position={[0, -0.16, 0]} material={lanternMat}>
        <cylinderGeometry args={[0.17, 0.1, 0.05, 12]} />
      </mesh>
      <mesh position={[0, -0.22, 0]} material={lanternCapMat}>
        <cylinderGeometry args={[0.1, 0.08, 0.05, 10]} />
      </mesh>
      {/* 流苏 */}
      <mesh position={[0, -0.32, 0]} material={tasselMat}>
        <cylinderGeometry args={[0.02, 0.035, 0.14, 6]} />
      </mesh>
      {/* 暖光由灯笼材质本身表达；真实 PointLight 统一由场馆预算分配。 */}
    </group>
  );
}

/* ─── 雀庄:障子窗 ───────────────────────────────────────────────────────── */
export function ShojiWindow({ position, ry, w = 1.8, h = 1.4 }: {
  position: P3; ry: number; w?: number; h?: number;
}) {
  const cols = Math.max(2, Math.round(w / 0.3));
  const rows = Math.max(2, Math.round(h / 0.35));
  return (
    <group position={position} rotation={[0, ry, 0]}>
      {/* 暖纸面(低自发光,像屋内透出的光) */}
      <mesh material={paperWarmMat}>
        <planeGeometry args={[w, h]} />
      </mesh>
      {/* 外框 */}
      {([[0, h / 2], [0, -h / 2]] as const).map(([x, y], i) => (
        <mesh key={`h${i}`} position={[x, y, 0.02]} material={woodDarkMat}>
          <boxGeometry args={[w + 0.08, 0.06, 0.05]} />
        </mesh>
      ))}
      {([[-w / 2, 0], [w / 2, 0]] as const).map(([x, y], i) => (
        <mesh key={`v${i}`} position={[x, y, 0.02]} material={woodDarkMat}>
          <boxGeometry args={[0.06, h + 0.08, 0.05]} />
        </mesh>
      ))}
      {/* 格棂 */}
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <mesh key={`c${i}`} position={[-w / 2 + ((i + 1) * w) / cols, 0, 0.012]} material={woodDarkMat}>
          <boxGeometry args={[0.022, h, 0.02]} />
        </mesh>
      ))}
      {Array.from({ length: rows - 1 }).map((_, i) => (
        <mesh key={`r${i}`} position={[0, -h / 2 + ((i + 1) * h) / rows, 0.012]} material={woodDarkMat}>
          <boxGeometry args={[w, 0.022, 0.02]} />
        </mesh>
      ))}
    </group>
  );
}

/* ─── 雀庄:役种一览挂轴 ─────────────────────────────────────────────────── */
export function YakuScroll({ position, ry }: { position: P3; ry: number }) {
  const tex = useMemo(() => yakuScrollTexture(), []);
  return (
    <group position={position} rotation={[0, ry, 0]}>
      <mesh>
        <planeGeometry args={[0.56, 1.68]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      {/* 上下卷轴杆 + 挂绳 */}
      {[0.87, -0.87].map((y) => (
        <mesh key={y} position={[0, y, 0.01]} rotation={[0, 0, Math.PI / 2]} material={woodDarkMat}>
          <cylinderGeometry args={[0.022, 0.022, 0.68, 8]} />
        </mesh>
      ))}
      <mesh position={[0, 0.97, 0]} material={lanternCapMat}>
        <cylinderGeometry args={[0.005, 0.005, 0.18, 4]} />
      </mesh>
    </group>
  );
}

/** 雀庄墙面成套挂饰(Interior.tsx 挂载):障子窗 ×2 + 役种挂轴。 */
export function GameroomExtras({ lightsOn }: { lightsOn: boolean }) {
  void lightsOn; // 纸窗自发光常亮(屋外街灯感);参数保留同 NetcafeExtras 接口
  return (
    <group>
      <ShojiWindow position={[8.92, 1.75, 1.4]} ry={-Math.PI / 2} w={2.5} h={1.6} />
      <ShojiWindow position={[-8.92, 1.75, -1.8]} ry={Math.PI / 2} w={2.5} h={1.6} />
      <YakuScroll position={[-2.6, 1.7, -6.9]} ry={0} />
      <YakuScroll position={[-4.2, 1.7, -6.9]} ry={0} />
    </group>
  );
}

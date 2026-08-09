/**
 * 「月汐町·晴日生活街」户外总装(工单 P3-5,替代旧 Plaza;总纲 §4)。
 *
 * - 地面:紧凑方形城市底板，围住一条 58m 生活街；
 * - streets(路网)+ buildings(建筑群)+ foreground(前景遮挡)经共享 BuildQueue
 *   分帧构建(每帧 ≤ 8ms,出生点 80m 半径优先,§10),进度先经 console.info 报告
 *   (正式加载界面由 P4 接管);
 * - layout props / interactables 走 spaces/registry(c_* 分支在 registry 中);
 * - BeachBall 保留;雾由 SkySystem 管理(P4 调),本组件不动 fog。
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ContactShadows } from '@react-three/drei';
import { LAYOUTS, SPACE } from '@nexuspark/shared';
import { CITY_BOUNDS } from '@nexuspark/shared/src/cityplan';
import { renderProp, renderInteractable, BeachBall } from '../spaces/registry';
import { ENV } from './palette';
import { surfaceMaterial } from './materials';
import { BuildQueue } from './progressive';
import { Streets, shade } from './streets';
import { Buildings } from './buildings';
import { Foreground } from './foreground';
import CyberpunkLayer from './CyberpunkLayer';
import { HeroStreetStructures } from './heroStructures';

// 共享构建队列(模块级:重进户外不重复构建,streets/buildings/foreground 幂等)
let cityQueue: BuildQueue | null = null;
function getCityQueue(): BuildQueue {
  if (!cityQueue) cityQueue = new BuildQueue();
  return cityQueue;
}

/** 地面底板：只覆盖紧凑街区与近距离住宅天际线。 */
let _groundGeo: THREE.BufferGeometry | null = null;
function groundGeometry(): THREE.BufferGeometry {
  if (_groundGeo) return _groundGeo;
  const w = (CITY_BOUNDS.maxX - CITY_BOUNDS.minX) + 54;
  const d = (CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ) + 44;
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  _groundGeo = geo;
  return _groundGeo;
}

let _groundMaterial: THREE.MeshStandardMaterial | null = null;
function groundMat(): THREE.MeshStandardMaterial {
  if (!_groundMaterial) {
    _groundMaterial = surfaceMaterial('wetAsphalt');
    _groundMaterial.color.set(shade(ENV.roadAsphalt, -0.018));
  }
  return _groundMaterial;
}

export default function City() {
  const layout = LAYOUTS[SPACE.PLAZA];
  const queue = useMemo(() => getCityQueue(), []);
  const spawn = useMemo<[number, number]>(
    () => [layout.spawn[0], layout.spawn[2]],
    [layout]
  );

  // 分帧构建 + 进度报告(§10 加载:布局→贴图→建筑→道具→灯光;正式界面 P4 接)
  useEffect(() => {
    let lastLabel = '';
    const off = queue.onProgress((p) => {
      if (p.label !== lastLabel || p.done === p.total) {
        lastLabel = p.label;
        console.info(`[月汐町] 场景构建 ${p.done}/${p.total} · ${p.label}`);
      }
    });
    void queue.run();
    return off;
  }, [queue]);

  return (
    <group>
      {/* 地面底板 */}
      <mesh geometry={groundGeometry()} material={groundMat()} position={[0, -0.02, 0]} receiveShadow />
      {/* 低强度接触阴影只负责建筑/路缘落地，不替代真实方向光阴影。 */}
      <ContactShadows position={[0, 0.015, 0]} opacity={0.24} scale={72} blur={1.8} far={18} resolution={256} color="#11131a" />

      {/* 路网 / 建筑 / 前景(BuildQueue 分帧) */}
      <Streets queue={queue} />
      <Buildings queue={queue} spawn={spawn} />
      <HeroStreetStructures />
      <Foreground queue={queue} />
      <CyberpunkLayer />

      {/* 布局道具与交互物(c_* 分支见 spaces/registry) */}
      {layout.props.map((p, i) => renderProp(p, i))}
      {layout.interactables.map((it) => renderInteractable(it, it.id))}
      <BeachBall />
    </group>
  );
}

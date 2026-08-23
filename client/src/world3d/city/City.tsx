/**
 * 「月汐町·结缘坂」户外总装。
 *
 * - 84×36m 可玩边界内是一条 5.2m 宽、2.8m 缓坡的轻弯住宅街；
 * - Buildings 是重写后的参数化低层建筑，CozyResidentialStreet 负责弯坡道路和生活层；
 * - 共享 layout props / interactables 负责可碰撞生活道具和真实玩法节点；
 * - 雾与暖下午主光仍由 SkySystem 统一管理。
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { LAYOUTS, SPACE } from '@nexuspark/shared';
import { renderProp, renderInteractable } from '../spaces/registry';
import { surfaceMaterial } from './materials';
import CozyResidentialStreet from './CozyResidentialStreet';
import { BuildQueue } from './progressive';
import { Buildings } from './buildings';
import { HeroStreetStructures } from './heroStructures';

let cityQueue: BuildQueue | null = null;
function getCityQueue(): BuildQueue {
  if (!cityQueue) cityQueue = new BuildQueue();
  return cityQueue;
}

/** 地面底板：只覆盖紧凑街区与近距离住宅天际线。 */
let _groundGeo: THREE.BufferGeometry | null = null;
function groundGeometry(): THREE.BufferGeometry {
  if (_groundGeo) return _groundGeo;
  const geo = new THREE.PlaneGeometry(104, 58);
  geo.rotateX(-Math.PI / 2);
  geo.rotateZ(Math.atan2(2.8, 84));
  _groundGeo = geo;
  return _groundGeo;
}

let _groundMaterial: THREE.MeshStandardMaterial | null = null;
function groundMat(): THREE.MeshStandardMaterial {
  if (!_groundMaterial) {
    _groundMaterial = surfaceMaterial('paintedConcrete');
    _groundMaterial.color.set('#899178');
    _groundMaterial.roughness = 1;
  }
  return _groundMaterial;
}

export default function City() {
  const layout = LAYOUTS[SPACE.PLAZA];
  const queue = useMemo(() => getCityQueue(), []);
  const spawn = useMemo<[number, number]>(() => [layout.spawn[0], layout.spawn[2]], [layout]);

  useEffect(() => {
    const off = queue.onProgress((progress) => {
      if (progress.done === progress.total) console.info('[结缘坂] 精细街景构建完成');
    });
    void queue.run();
    return off;
  }, [queue]);

  return (
    <group>
      {/* 地面底板 */}
      <mesh geometry={groundGeometry()} material={groundMat()} position={[0, 1.38, 0]} receiveShadow />
      {/* 弯坡道路、台阶、树荫与近景生活细节。 */}
      <CozyResidentialStreet />
      {/* 重写后的精细参数化体块：凹入店面、橱窗、阳台、空调、管线和屋顶设备。 */}
      <Buildings queue={queue} spawn={spawn} />
      <HeroStreetStructures />
      {/* 布局道具与交互物(c_* 分支见 spaces/registry) */}
      {layout.props.map((p, i) => renderProp(p, i))}
      {layout.interactables.map((it) => renderInteractable(it, it.id))}
    </group>
  );
}

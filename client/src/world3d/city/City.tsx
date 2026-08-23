/**
 * 「月汐町·木漏日小街」户外总装。
 *
 * - 48×24m 可玩边界内是一条 4.2m 宽、1.6m 缓坡的轻弯住宅街；
 * - CozyResidentialStreet 负责道路、2～3 层街屋、店面和细小自然层；
 * - 共享 layout props / interactables 负责可碰撞生活道具和真实玩法节点；
 * - 雾与暖下午主光仍由 SkySystem 统一管理。
 */
import * as THREE from 'three';
import { ContactShadows } from '@react-three/drei';
import { LAYOUTS, SPACE } from '@nexuspark/shared';
import { renderProp, renderInteractable, BeachBall } from '../spaces/registry';
import { surfaceMaterial } from './materials';
import CozyResidentialStreet from './CozyResidentialStreet';

/** 地面底板：只覆盖紧凑街区与近距离住宅天际线。 */
let _groundGeo: THREE.BufferGeometry | null = null;
function groundGeometry(): THREE.BufferGeometry {
  if (_groundGeo) return _groundGeo;
  const geo = new THREE.PlaneGeometry(56, 32);
  geo.rotateX(-Math.PI / 2);
  geo.rotateZ(Math.atan2(1.6, 48));
  _groundGeo = geo;
  return _groundGeo;
}

let _groundMaterial: THREE.MeshStandardMaterial | null = null;
function groundMat(): THREE.MeshStandardMaterial {
  if (!_groundMaterial) {
    _groundMaterial = surfaceMaterial('paintedConcrete');
    _groundMaterial.color.set('#829074');
    _groundMaterial.roughness = 1;
  }
  return _groundMaterial;
}

export default function City() {
  const layout = LAYOUTS[SPACE.PLAZA];

  return (
    <group>
      {/* 地面底板 */}
      <mesh geometry={groundGeometry()} material={groundMat()} position={[0, 0.78, 0]} receiveShadow />
      {/* 低强度接触阴影只负责建筑/路缘落地，不替代真实方向光阴影。 */}
      <ContactShadows position={[0, 0.8, 0]} opacity={0.18} scale={50} blur={2.1} far={16} resolution={256} color="#59607b" />

      {/* 小尺度缓坡弯街：道路、2～3 层街屋、树荫与生活细节统一装配。 */}
      <CozyResidentialStreet />
      {/* 布局道具与交互物(c_* 分支见 spaces/registry) */}
      {layout.props.map((p, i) => renderProp(p, i))}
      {layout.interactables.map((it) => renderInteractable(it, it.id))}
      <BeachBall />
    </group>
  );
}

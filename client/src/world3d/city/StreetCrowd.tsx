import { useMemo } from 'react';
import * as THREE from 'three';
import { seededRandom } from '@nexuspark/shared';
import { MergeBag, unitCylinder, vertexToonMat } from './streets';
import { addOutline } from './outline';
import { ENV } from './palette';

interface CrowdPoint {
  x: number;
  z: number;
  ry: number;
  scale?: number;
}

// 只落在人行道边缘，不参与碰撞，也不会遮挡三个场馆入口。远处人群让街道
// 在静态截图里就具备商业街生活密度；玩家和可交互 NPC 的模型保持不变。
const CROWD: CrowdPoint[] = [
  { x: -12.75, z: -1.9, ry: Math.PI, scale: 1.04 },
  { x: -13.45, z: -6.8, ry: 0.1, scale: 0.96 },
  { x: -12.7, z: -10.8, ry: Math.PI - 0.2, scale: 1.08 },
  { x: -13.65, z: -15.1, ry: 0.05, scale: 0.92 },
  { x: -3.15, z: -3.4, ry: Math.PI + 0.2, scale: 1.02 },
  { x: -2.65, z: -8.5, ry: -0.1, scale: 0.94 },
  { x: -3.3, z: -12.4, ry: Math.PI, scale: 1.1 },
  { x: -2.55, z: -17.2, ry: 0.15, scale: 0.9 },
  { x: -19.5, z: -5.35, ry: Math.PI / 2, scale: 0.96 },
  { x: 10.8, z: -5.3, ry: -Math.PI / 2, scale: 1.04 },
  { x: 16.2, z: -5.35, ry: Math.PI / 2, scale: 0.91 },
  { x: 24.7, z: -5.25, ry: -Math.PI / 2, scale: 1.07 },
  { x: -17.2, z: 6.4, ry: Math.PI / 2, scale: 0.9 },
  { x: 7.9, z: 6.4, ry: -Math.PI / 2, scale: 0.98 },
];

const CLOTHES = ['#26394c', '#d64b5f', '#d4ad43', '#3d7779', '#6d526f', '#e6ded0'];
const SKIN = ['#e5b08e', '#c98e72', '#f0c2a0'];
const HAIR = ['#171920', '#332329', '#5b3928', '#24343b'];

export default function StreetCrowd() {
  const mesh = useMemo(() => {
    const bag = new MergeBag();
    const rnd = seededRandom(20260731);
    const torso = new THREE.CylinderGeometry(0.22, 0.32, 0.72, 6);
    const head = new THREE.SphereGeometry(0.19, 8, 6);
    const hair = new THREE.SphereGeometry(0.205, 8, 6);
    const leg = new THREE.CylinderGeometry(0.07, 0.085, 0.58, 5);
    const arm = new THREE.CylinderGeometry(0.055, 0.065, 0.52, 5);
    const shoe = new THREE.BoxGeometry(0.15, 0.08, 0.3);
    const bagGeo = new THREE.BoxGeometry(0.28, 0.38, 0.12);
    const phoneGeo = new THREE.BoxGeometry(0.055, 0.11, 0.025);
    const shadow = new THREE.CylinderGeometry(0.32, 0.32, 0.012, 12);

    for (const point of CROWD) {
      const s = point.scale ?? 1;
      const clothes = CLOTHES[Math.floor(rnd() * CLOTHES.length)];
      const skin = SKIN[Math.floor(rnd() * SKIN.length)];
      const hairColor = HAIR[Math.floor(rnd() * HAIR.length)];
      const c = Math.cos(point.ry);
      const sn = Math.sin(point.ry);
      const sideX = c * 0.1;
      const sideZ = -sn * 0.1;
      bag.add(shadow, {
        x: point.x, y: 0.055, z: point.z,
        sx: s, sy: 1, sz: s * 0.72, color: '#171920',
      });
      bag.add(torso, {
        x: point.x, y: 0.94 * s, z: point.z,
        ry: point.ry, sx: s, sy: s, sz: s, color: clothes,
      });
      bag.add(head, {
        x: point.x, y: 1.5 * s, z: point.z,
        sx: s, sy: s, sz: s, color: skin,
      });
      // 头发轮廓、手臂和鞋面把远景人群从“圆柱占位”提升为街头剪影。
      bag.add(hair, {
        x: point.x, y: 1.62 * s, z: point.z - Math.cos(point.ry) * 0.035 * s,
        sx: s, sy: s * 0.66, sz: s, color: hairColor,
      });
      for (const side of [-1, 1]) {
        bag.add(leg, {
          x: point.x + sideX * side * s,
          y: 0.38 * s,
          z: point.z + sideZ * side * s,
          rz: side * 0.035,
          sx: s, sy: s, sz: s, color: ENV.outline,
        });
        bag.add(arm, {
          x: point.x + sideX * side * 2.25 * s,
          y: 0.94 * s,
          z: point.z + sideZ * side * 2.25 * s,
          ry: point.ry,
          rz: side * 0.18,
          sx: s, sy: s, sz: s, color: skin,
        });
        bag.add(shoe, {
          x: point.x + sideX * side * 0.8 * s + Math.sin(point.ry) * 0.025,
          y: 0.075 * s,
          z: point.z + sideZ * side * 0.8 * s + Math.cos(point.ry) * 0.06,
          ry: point.ry,
          sx: s, sy: s, sz: s, color: ENV.outline,
        });
      }
      // 少量行人低头看手机，增加商业街的生活动势。
      if (rnd() > 0.64) {
        bag.add(phoneGeo, {
          x: point.x + Math.sin(point.ry) * 0.24 * s,
          y: 1.03 * s,
          z: point.z + Math.cos(point.ry) * 0.24 * s,
          ry: point.ry,
          rx: 0.35,
          sx: s, sy: s, sz: s, color: '#63d6db',
        });
      }
      if (rnd() > 0.48) {
        bag.add(bagGeo, {
          x: point.x + Math.sin(point.ry) * 0.22 * s,
          y: 0.82 * s,
          z: point.z + Math.cos(point.ry) * 0.22 * s,
          ry: point.ry, sx: s, sy: s, sz: s, color: CLOTHES[Math.floor(rnd() * CLOTHES.length)],
        });
      }
    }

    torso.dispose();
    head.dispose();
    hair.dispose();
    leg.dispose();
    arm.dispose();
    shoe.dispose();
    bagGeo.dispose();
    phoneGeo.dispose();
    shadow.dispose();

    const result = new THREE.Mesh(bag.build() ?? new THREE.BufferGeometry(), vertexToonMat(4));
    result.castShadow = true;
    result.receiveShadow = true;
    result.frustumCulled = false;
    addOutline(result, { thickness: 0.01 });
    return result;
  }, []);

  return <primitive object={mesh} />;
}

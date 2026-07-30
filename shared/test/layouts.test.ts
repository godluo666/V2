/**
 * 月汐町紧凑生活街布局验收:契约完整性、门位可达、短巷可走、天桥高度区。
 * 行走用与客户端/服务器完全相同的 resolveCollisions/clampToBounds 逐步推进,
 * 等价于"没有卡死点"的静态证明(smoke.mjs 再在真实浏览器里跑一遍动态版)。
 */
import { describe, it, expect } from 'vitest';
import {
  CITY_BOUNDS, ROADS, CROSSING, CROSSWALKS, SIDEWALKS, BUILDINGS, OVERPASS,
  STATION, VENUES, ANOMALY_POINTS,
} from '../src/cityplan';
import { LAYOUTS, floorHeightAt } from '../src/layouts';
import type { SpaceLayout } from '../src/layouts';
import { resolveCollisions, clampToBounds } from '../src/math';
import { SPACE } from '../src/constants';

const city = LAYOUTS[SPACE.PLAZA];

/** 沿途经点行军;返回最终位置(每步 0.2m,碰撞解算与运行时一致)。 */
function march(l: SpaceLayout, waypoints: Array<[number, number]>): [number, number] {
  let [x, z] = waypoints[0];
  for (const [tx, tz] of waypoints.slice(1)) {
    for (let i = 0; i < 800; i++) {
      const dx = tx - x, dz = tz - z;
      const d = Math.hypot(dx, dz);
      if (d < 0.22) break;
      x += (dx / d) * 0.2;
      z += (dz / d) * 0.2;
      [x, z] = clampToBounds(x, z, l.bounds);
      [x, z] = resolveCollisions(x, z, 0.34, l.colliders);
    }
  }
  return [x, z];
}
const near = (p: [number, number], tx: number, tz: number, tol = 0.8) =>
  Math.hypot(p[0] - tx, p[1] - tz) < tol;

describe('cityplan 契约', () => {
  it('边界/小路口/四臂与紧凑街区契约一致', () => {
    expect(CITY_BOUNDS).toEqual({ minX: -48, maxX: 48, minZ: -42, maxZ: 42 });
    expect(city.bounds).toEqual(CITY_BOUNDS);
    expect(CROSSING).toEqual({ x: 0, z: 0, w: 16, d: 16 });
    expect(ROADS).toHaveLength(4);
    expect(CROSSWALKS).toHaveLength(4);
    expect(CITY_BOUNDS.maxX - CITY_BOUNDS.minX).toBeLessThanOrEqual(100);
    expect(CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ).toBeLessThanOrEqual(90);
    expect(Math.max(...ROADS.map((r) => Math.max(r.w, r.d)))).toBeLessThanOrEqual(40);
    expect(OVERPASS.deck.y).toBe(4.2);
    expect(OVERPASS.ramps).toHaveLength(4);
    expect(ANOMALY_POINTS.map((a) => a.id).sort()).toEqual(['a-alley-mouth', 'b-alley-end', 'c-overpass']);
  });

  it('七个场馆各有门,门通向正确空间', () => {
    expect(VENUES).toHaveLength(7);
    const targets: Record<string, string> = {
      cinema: SPACE.CINEMA, netcafe: SPACE.NETCAFE, gameroom: SPACE.GAMEROOM,
      cafe: SPACE.CAFE, shop: SPACE.SHOP, arcade: SPACE.ARCADE, tower: SPACE.LOBBY,
    };
    for (const v of VENUES) {
      const door = city.interactables.find((i) => i.id === `d-${v.key}`);
      expect(door, v.key).toBeTruthy();
      expect(door!.kind).toBe('door');
      expect(door!.data?.target).toBe(targets[v.key]);
      expect(door!.pos[0]).toBe(v.x);
      expect(door!.pos[2]).toBe(v.z);
    }
    // 每个带 venue 的建筑都对应一个门位
    for (const bd of BUILDINGS.filter((x) => x.venue)) {
      expect(VENUES.some((v) => v.key === bd.venue), String(bd.venue)).toBe(true);
    }
  });

  it('非剪影建筑不压路面/人行道/路口/斑马线', () => {
    const walkways = [...ROADS, CROSSING, ...CROSSWALKS, ...SIDEWALKS];
    const eps = 0.01;
    for (const bd of BUILDINGS) {
      if (bd.style === 'silhouette') continue;
      for (const w of walkways) {
        const overlap = Math.abs(bd.x - w.x) < (bd.w + w.w) / 2 - eps
          && Math.abs(bd.z - w.z) < (bd.d + w.d) / 2 - eps;
        expect(overlap, `building(${bd.x},${bd.z}) vs walkway(${w.x},${w.z})`).toBe(false);
      }
    }
  });

  it('剪影楼群只在短街外的近景视觉圈,且零碰撞', () => {
    const sils = BUILDINGS.filter((x) => x.style === 'silhouette');
    expect(sils.length).toBeGreaterThanOrEqual(18);
    for (const s of sils) {
      const r = Math.hypot(s.x, s.z);
      expect(r).toBeGreaterThan(58);
      expect(r).toBeLessThan(112);
      // 布局层没有为它生成碰撞体
      expect(city.colliders.some((c) => c.kind === 'box' && c.x === s.x && c.z === s.z && c.w === s.w)).toBe(false);
    }
  });
});

describe('晴日生活街可走性', () => {
  it('出生点与全部门前站位不卡在碰撞体里', () => {
    const spots: Array<[number, number]> = [
      [city.spawn[0], city.spawn[2]],
      [-7.7, 15],   // 咖啡馆门前
      [22, -7.6],   // 影院门前
      [-22, -7.6],  // 电竞馆门前
      [7.7, 15],    // 雀庄门前
      [-39, -7.6],  // 百货门前
      [39, -7.6],   // 街机厅门前
      [7.7, -32],   // 团子塔门前
    ];
    for (const [sx, sz] of spots) {
      const [x, z] = resolveCollisions(sx, sz, 0.34, city.colliders);
      expect(Math.hypot(x - sx, z - sz), `(${sx},${sz})`).toBeLessThan(0.01);
    }
  });

  it('出生点 → 咖啡馆门(smoke 路径)', () => {
    const p = march(city, [[0, 32], [0, 23], [-5.5, 17], [-7.7, 15]]);
    expect(near(p, -7.7, 15)).toBe(true);
  });

  it('出生点 → 影院门(sync-test 路径,穿过路口)', () => {
    const p = march(city, [[0, 32], [0, 15], [3, 2], [12, -6.7], [20, -6.7], [22, -7.6]]);
    expect(near(p, 22, -7.6)).toBe(true);
  });

  it('路口 → 上天桥 → 北街团子塔门(桥下路面被封,必须走坡道)', () => {
    const p = march(city, [
      [0, 8], [6.75, -5], [6.75, -13], [6.75, -22.5], [6.75, -27.5],
      [6.75, -36], [7.7, -32],
    ]);
    expect(near(p, 7.7, -32)).toBe(true);
    // 地面沿路直穿桥下会被围栏拦住(不会瞬移弹上桥)
    const q = march(city, [[0, -16], [0, -34]]);
    expect(q[1]).toBeGreaterThan(-22.6);
    expect(floorHeightAt(city, q[0], q[1])).toBe(0);
  });

  it('东侧短巷:入口 → 转角 → 巷底(事件点 B)', () => {
    const p = march(city, [[8.8, 25.5], [28, 25.5], [33, 26.5], [33, 34.5]]);
    expect(near(p, 33, 34.5, 1.1)).toBe(true);
  });

  it('西侧短巷:入口(事件点 A) → 转角 → 巷底', () => {
    const p = march(city, [[-8.8, 25.5], [-28, 25.5], [-33, 26.5], [-33, 34.5]]);
    expect(near(p, -33, 34.5, 1.1)).toBe(true);
  });

  it('天桥坡道/桥面高度区正确衔接', () => {
    expect(floorHeightAt(city, 6.75, -12.05)).toBeLessThan(0.05);   // 南坡底
    expect(floorHeightAt(city, 6.75, -17.5)).toBeCloseTo(2.1, 2);   // 南坡中点
    expect(floorHeightAt(city, 6.75, -22.95)).toBeGreaterThan(4.1); // 坡顶≈桥面
    expect(floorHeightAt(city, 0, -25)).toBeCloseTo(4.2, 3);        // 桥面
    expect(floorHeightAt(city, -6.75, -32.5)).toBeCloseTo(2.1, 2); // 北坡中点
    expect(floorHeightAt(city, -6.75, -37.95)).toBeLessThan(0.05);  // 北坡底
    expect(floorHeightAt(city, 0, -40)).toBe(0);
  });

  it('封闭地铁口台阶区有碰撞', () => {
    const [x, z] = resolveCollisions(STATION.x, STATION.z, 0.34, city.colliders);
    expect(Math.hypot(x - STATION.x, z - STATION.z)).toBeGreaterThan(1.5);
  });
});

describe('新室内空间(网吧/雀庄)', () => {
  it('网吧:8 个电竞位 + 墙屏(mediaPolicy everyone)+ 返回门', () => {
    const nc = LAYOUTS[SPACE.NETCAFE];
    expect(nc).toBeTruthy();
    expect(nc.mediaPolicy).toBe('everyone');
    expect(nc.interactables.filter((i) => i.kind === 'seat' && i.id.startsWith('nc-s'))).toHaveLength(8);
    expect(nc.props.filter((p) => p.type === 'nc_station')).toHaveLength(8);
    expect(nc.interactables.find((i) => i.id === 'nc-wall')?.kind).toBe('screen');
    const door = nc.interactables.find((i) => i.kind === 'door');
    expect(door?.data?.target).toBe(SPACE.PLAZA);
  });

  it('雀庄:2 张日麻桌(各 4 座)+ 1 张象棋桌 + 返回门', () => {
    const gr = LAYOUTS[SPACE.GAMEROOM];
    expect(gr).toBeTruthy();
    const rj = gr.interactables.filter((i) => i.kind === 'riichi');
    expect(rj.map((i) => i.id).sort()).toEqual(['gr-rj1', 'gr-rj2']);
    for (const id of ['gr-rj1', 'gr-rj2']) {
      expect(gr.interactables.filter((i) => i.kind === 'seat' && i.id.startsWith(`${id}-s`))).toHaveLength(4);
    }
    expect(gr.interactables.find((i) => i.id === 'gr-xq')?.kind).toBe('xiangqi');
    const door = gr.interactables.find((i) => i.kind === 'door');
    expect(door?.data?.target).toBe(SPACE.PLAZA);
  });

  it('街区的网吧/雀庄门 → 室内,室内出门落点在街上且不卡墙', () => {
    for (const key of [SPACE.NETCAFE, SPACE.GAMEROOM] as string[]) {
      const inner = LAYOUTS[key];
      const exit = inner.interactables.find((i) => i.kind === 'door')!;
      const spawn = exit.data?.spawn as [number, number, number, number];
      const [x, z] = resolveCollisions(spawn[0], spawn[2], 0.34, city.colliders);
      expect(Math.hypot(x - spawn[0], z - spawn[2]), key).toBeLessThan(0.01);
    }
  });
});

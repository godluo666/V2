import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CORE_STREET_SOURCES = [
  '../src/world3d/city/City.tsx',
  '../src/world3d/city/CozyResidentialStreet.tsx',
  '../src/world3d/city/buildings.tsx',
  '../src/world3d/city/heroStructures.tsx',
  '../src/world3d/city/materials.ts',
  '../src/world3d/city/props2.tsx',
  '../src/world3d/prefabs/props.tsx',
  '../src/world3d/prefabs/interactive.tsx',
  '../src/world3d/prefabs/clubInteriors.tsx',
  '../src/world3d/spaces/registry.tsx',
  '../src/ui/GamePanelsCn.tsx',
] as const;

describe('结缘坂原创场景资产边界', () => {
  it.each(CORE_STREET_SOURCES)('%s 不依赖外链图片或整景模型拼贴', (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    expect(source).not.toMatch(/https?:\/\//i);
    expect(source).not.toMatch(/\b(?:TextureLoader|useTexture|useGLTF|GLTFLoader)\b/);
    expect(source).not.toMatch(/['"`]\/?[^'"`]+\.(?:png|jpe?g|webp|gif|glb|gltf)(?:\?[^'"`]*)?['"`]/i);
  });

  it('只允许有可见灯具承载的服务巷真实点光源', () => {
    const source = readFileSync(
      new URL('../src/world3d/city/CozyResidentialStreet.tsx', import.meta.url),
      'utf8',
    );
    expect(source.match(/<pointLight\b/g)).toHaveLength(1);
    expect(source).toContain('wall plate, arm, enamel shade and bulb');
  });

  it('运行时注册表不能重新挂回旧地图的大型建筑预制体', () => {
    const source = readFileSync(
      new URL('../src/world3d/spaces/registry.tsx', import.meta.url),
      'utf8',
    );
    const citySource = readFileSync(
      new URL('../src/world3d/city/City.tsx', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/\bbld_(?:cafe|cinema|arcade|shop|tower)\b/);
    expect(source).not.toMatch(/\bBld(?:Cafe|Cinema|Arcade|Shop|Tower)\b/);
    expect(source).not.toMatch(/\bc_(?:vend|fence|pier|signal|banner|phone|locker|hydrant)\b/);
    expect(citySource).not.toMatch(/\bBeachBall\b/);
  });

  it('远景由连续住宅台地、转弯街区和雾中山脊组成，而不是外链整景贴片', () => {
    const source = readFileSync(
      new URL('../src/world3d/city/CozyResidentialStreet.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('visual-only-terraced-neighbourhood');
    expect(source).toContain('visual-only-east-bend-neighbourhood');
    expect(source).toContain('visual-only-west-bend-neighbourhood');
    expect(source).toContain('far-south-horizon-ridge');
    expect(source).toContain('far-north-horizon-ridge');
    expect(source).toContain('far-east-end-horizon');
    expect(source).toContain('far-west-end-horizon');
    expect(source).toContain('One connected pole run follows the unseen pavement');
    expect(source).toContain('const points = [0, 4, 8, 12, 16, 20, 24]');
    expect(source).not.toMatch(/\b(?:TextureLoader|useTexture|useGLTF|GLTFLoader)\b/);
  });

  it('扩大纯视觉地面不会扩大玩家权威活动边界', () => {
    const citySource = readFileSync(
      new URL('../src/world3d/city/City.tsx', import.meta.url),
      'utf8',
    );
    const cityPlan = readFileSync(
      new URL('../../shared/src/cityplan.ts', import.meta.url),
      'utf8',
    );
    expect(citySource).toContain('new THREE.PlaneGeometry(160, 118)');
    expect(citySource).toContain('扩大这里不会扩大玩家活动范围');
    expect(cityPlan).toContain('minX: -42, maxX: 42, minZ: -18, maxZ: 18');
  });
});

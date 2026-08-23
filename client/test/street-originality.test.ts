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
});

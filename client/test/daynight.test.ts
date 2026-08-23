import { describe, expect, it } from 'vitest';
import { createEnvSample, sampleEnv } from '../src/world3d/env/daynight';

describe('月汐町晴日光照', () => {
  it('白天保持高亮太阳、清透天空与足够环境光', () => {
    const env = sampleEnv(0.5, 'clear', createEnvSample());
    expect(env.sunIntensity).toBeGreaterThanOrEqual(2.2);
    expect(env.hemiIntensity).toBeGreaterThanOrEqual(0.9);
    expect(env.starOpacity).toBe(0);
    expect(env.lampsOn).toBe(false);
    expect(env.skyTop.b).toBeGreaterThan(env.skyTop.r);
    expect(env.skyHorizon.r).toBeGreaterThan(0.75);
  });

  it('阴雨与夜晚仍保持基本可读性', () => {
    const rain = sampleEnv(0.5, 'rain', createEnvSample());
    const night = sampleEnv(0.1, 'clear', createEnvSample());
    expect(rain.hemiIntensity).toBeGreaterThanOrEqual(0.36);
    expect(night.hemiIntensity).toBeGreaterThanOrEqual(0.36);
    expect(night.lampsOn).toBe(true);
  });

  it('下午与傍晚保持奶油橙阳光和蓝紫阴影，不滑向通红晚霞', () => {
    const afternoon = sampleEnv(0.66, 'clear', createEnvSample());
    const dusk = sampleEnv(0.78, 'clear', createEnvSample());
    expect(afternoon.sunColor.r).toBeGreaterThan(afternoon.sunColor.b);
    expect(afternoon.hemiGround.b).toBeGreaterThan(afternoon.hemiGround.r * 0.98);
    // Late light may be warm, but the horizon must retain substantial green
    // and blue instead of becoming a saturated red stage backdrop.
    expect(dusk.skyHorizon.g).toBeGreaterThan(dusk.skyHorizon.r * 0.78);
    expect(dusk.skyHorizon.b).toBeGreaterThan(dusk.skyHorizon.r * 0.65);
    expect(dusk.hemiGround.b).toBeGreaterThan(dusk.hemiGround.r);
  });
});

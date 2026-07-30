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
});

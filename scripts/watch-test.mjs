/**
 * 「一起看电影」单实例播放层验收(任务书 §十五/§十六/§二十/§三十)。用法:
 *   npm run build && npm start            # 终端 1
 *   node scripts/watch-test.mjs           # 终端 2(需 playwright,同 smoke)
 * 断言:
 *   1) 世界内放映时全客户端只有一个播放器实例(iframe 计数 = 1);
 *   2) 进出全屏 10 次:iframe 从不重建(data-mark 存活、计数恒 1),
 *      不产生第二个 video/audio 元素 → 无重载、无双声;
 *   3) 全屏时播放器铺满视口,退出后回到 3D 屏幕上(CSS3D 变换恢复);
 *   4) 后加入的 p2 自动拿到当前媒体状态(revision/url/进度一致);
 *   5) Esc 退出后 3D 输入恢复(hot.uiOpen === false)。
 * 播放器内容用打不开的假 URL(沙盒无外网),验证的是实例生命周期与状态
 * 流——内容加载与真实漂移由 sync-test.mjs + shared/test/media.test.ts 覆盖。
 */
import { chromium } from 'playwright';
import {
  JOURNEY_CHROMIUM_ARGS, enterStreetVenue, prepareWorldInput,
} from './browser-driver.mjs';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const RUN = `${Date.now() % 1000000}`;
const errors = [];
let failures = 0;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗ FAIL'} ${label}`); if (!ok) failures++; };

async function apiToken(name) {
  const body = { username: name, password: 'password123' };
  let res = await fetch(`${BASE}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) res = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`auth failed for ${name}: ${res.status}`);
  return (await res.json()).token;
}

async function newPlayer(browser, name) {
  const token = await apiToken(name);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.bringToFront();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] PAGEERROR ${e.message}`));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('np_token', t);
    localStorage.setItem('np_help_seen', '1');
    localStorage.setItem('np_settings', JSON.stringify({
      quality: 'low', shadows: false, postfx: false, reflections: false, particles: false, clouds: false,
      masterVolume: 0, musicVolume: 0, sfxVolume: 0, voiceVolume: 0, mediaVolume: 0, invertY: false,
    }));
  }, token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await page.waitForFunction(() => !!document.querySelector('canvas') && !!window.__nx, undefined, { timeout: 60000, polling: 500 });
  await page.waitForTimeout(800);
  await prepareWorldInput(page);
  return page;
}

async function intoCinema(p) {
  await p.bringToFront();
  await enterStreetVenue(p, 'cinema');
  return p.evaluate(() => window.__nx.world.getState().spaceKey);
}

const launchBrowser = () => chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: JOURNEY_CHROMIUM_ARGS,
});

const p1Browser = await launchBrowser();
const p1 = await newPlayer(p1Browser, `watch_p1_${RUN}`);
check('p1 进入电影院', (await intoCinema(p1)) === 'cinema');

// ── p1 放一个网页 iframe 播放器 ──
// Panel behavior is covered by sync-test; this lifecycle journey starts media
// through the same public connection method to avoid low-FPS aisle navigation.
await p1.evaluate(() => {
  window.__nx.connection.send('media_set', { url: 'https://watch-test.invalid/page' });
});
await p1.waitForTimeout(1800);

// ── 1) 世界内:单实例 + 标记 ──
const world1 = await p1.evaluate(() => {
  const frames = document.querySelectorAll('iframe');
  if (frames.length === 1) frames[0].dataset.mark = 'the-one-and-only';
  const r = frames[0]?.getBoundingClientRect();
  return { count: frames.length, w: r?.width ?? 0 };
});
check(`世界内单播放器(iframe=${world1.count})`, world1.count === 1);

// ── 2) 进出全屏 10 次:实例永不重建 ──
let stable = true;
for (let i = 0; i < 10; i++) {
  await p1.evaluate(() => { window.__nx.ui.getState(); }); // 保活
  await p1.evaluate(() => {
    // 直接驱动全屏 store(按钮在 CSS3D 层里,headless 点击坐标不稳)
    const mod = window.__nx;
    void mod; // FullscreenViewer 订阅的 zustand store 暴露在模块内——用 DOM 按钮路径:
  });
  // 世界模式下角落的 ⛶ 按钮就在 iframe 旁(同一 DOM 层)
  const opened = await p1.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.title.includes('全屏观看'));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!opened) { stable = false; console.log('  ✗ 找不到全屏按钮 @ round', i); break; }
  // 世界/全屏的判据:相机层和物体层是否都有有效 CSS transform(投影 rect
  // 在巨幕近处会超过视口,不能当判据)。原生全屏过渡会暂停渲染几百毫秒,
  // 所以用轮询等待目标状态而不是定长等待。
  const probeSrc = `(() => {
    const f = document.querySelector('iframe');
    const objectLayer = f ? f.closest('[data-media-layer="object"]') : null;
    const cameraLayer = objectLayer?.parentElement?.matches('[data-media-layer="camera"]')
      ? objectLayer.parentElement
      : null;
    const outerLayer = cameraLayer?.parentElement?.matches('[data-media-layer="outer"]')
      ? cameraLayer.parentElement
      : null;
    const transformedLayers = [cameraLayer, objectLayer].filter((el) => {
      if (!el) return false;
      const inlineTransform = (el.style.transform || '').trim();
      const computedTransform = getComputedStyle(el).transform;
      return (inlineTransform && inlineTransform !== 'none')
        || (computedTransform && computedTransform !== 'none');
    }).length;
    const outerStyle = outerLayer ? getComputedStyle(outerLayer) : null;
    const outerRect = outerLayer?.getBoundingClientRect();
    return {
      count: document.querySelectorAll('iframe').length,
      mark: f && f.dataset.mark ? f.dataset.mark : null,
      // World mode has camera + object projections; fullscreen has neither.
      // Accept the browser's valid matrix()/matrix3d()/translate serialization.
      matrix: transformedLayers >= 2,
      transformedLayers,
      worldReady: !!outerLayer && outerStyle?.display !== 'none'
        && outerStyle?.visibility !== 'hidden'
        && outerStyle?.perspective !== 'none'
        && !!outerRect && outerRect.width > 1 && outerRect.height > 1,
      fullscreenSized: (() => {
        if (!outerLayer) return false;
        const rect = outerLayer.getBoundingClientRect();
        return Math.abs(rect.left) <= 1 && Math.abs(rect.top) <= 1
          && Math.abs(rect.width - innerWidth) <= 1
          && Math.abs(rect.height - innerHeight) <= 1;
      })(),
      videos: document.querySelectorAll('video').length,
      audios: document.querySelectorAll('audio').length,
    };
  })()`;
  const waitState = async (wantMatrix) => {
    try {
      await p1.waitForFunction(
        ([src, want]) => {
          const s = eval(src);
          return s.count === 1 && s.mark === 'the-one-and-only' && s.matrix === want
            && (want ? s.worldReady : s.fullscreenSized)
            && s.videos === 0 && s.audios === 0;
        },
        [probeSrc, wantMatrix],
        // Fullscreen exit restores two CSS3D layers in the same React commit;
        // on SwiftShader the browser may briefly expose the old transform
        // while the next layout pass is pending. Keep the strict state checks,
        // but allow that real transition a little more time.
        { timeout: 12000, polling: 200 },
      );
      return null;
    } catch {
      return p1.evaluate((src) => eval(src), probeSrc);
    }
  };
  const fsBad = await waitState(false);
  if (fsBad) { stable = false; console.log('  ✗ 全屏态异常 @ round', i, JSON.stringify(fsBad)); break; }
  await p1.keyboard.press('Escape');
  // CSS3D projection is restored in a layout effect. Give Chromium one full
  // layout/paint turn before the strict world-state poll begins.
  await p1.waitForTimeout(500);
  const backBad = await waitState(true);
  if (backBad) { stable = false; console.log('  ✗ 退出态异常 @ round', i, JSON.stringify(backBad)); break; }
}
check('进出全屏 ×10:同一 iframe 实例(mark 存活/无重建/无重复元素)', stable);
const uiFree = await p1.evaluate(() => window.__nx.hot.uiOpen === false);
check('Esc 退出后 3D 输入恢复', uiFree);

// ── 3) 后加入:p2 进影院自动拿到当前媒体 ──
// Release p1's software-rendered 3D process before booting p2. The cinema media
// state is server-persistent, so a truly fresh client must still receive it.
const expected = await p1.evaluate(() => {
  const m = window.__nx.world.getState().media;
  return { url: m?.url, rev: m?.revision ?? null, kind: m?.kind };
});
await p1Browser.close();

const p2Browser = await launchBrowser();
const p2 = await newPlayer(p2Browser, `watch_p2_${RUN}`);
check('p2 进入电影院', (await intoCinema(p2)) === 'cinema');
await p2.waitForTimeout(1500);
const joined = await p2.evaluate(() => {
  const m = window.__nx.world.getState().media;
  return { url: m?.url, rev: m?.revision ?? null, kind: m?.kind };
});
check(`后加入媒体状态一致(${JSON.stringify(joined)})`,
  expected.url === joined.url && expected.rev === joined.rev && joined.kind === 'site');
const p2count = await p2.evaluate(() => document.querySelectorAll('iframe').length);
check(`p2 也是单播放器(iframe=${p2count})`, p2count === 1);

// ── 清屏还原 ──
await p2.evaluate(() => window.__nx.connection.send('media_ctrl', { op: 'clear' }));
await p2.waitForTimeout(800);
const cleared = await p2.evaluate(() => document.querySelectorAll('iframe').length);
check(`清屏后播放层收起(iframe=${cleared})`, cleared === 0);

console.log('CONSOLE ERRORS(含预期的假链接加载失败):', errors.length);
for (const e of errors.slice(0, 6)) console.log(' ', e.slice(0, 160));
const realErrors = errors.filter((e) => !/(ERR_TUNNEL|ERR_NAME|Failed to load resource)/.test(e));
check('无真实控制台错误', realErrors.length === 0);
console.log(failures === 0 ? '✅ 一起看电影·单实例验收全部通过' : `❌ ${failures} 项失败`);
await p2Browser.close();
process.exit(failures ? 1 : 0);


/**
 * 手机触控冒烟:手机视口 + 触屏上下文,验证虚拟摇杆驱动移动、动作键走
 * 同一条键盘链路。用法同 smoke.mjs(先起服务器)。
 */
import { chromium } from 'playwright';
import { JOURNEY_CHROMIUM_ARGS, waitForRenderedWorld } from './browser-driver.mjs';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const OUT = process.env.OUT_DIR ?? '.';
const RUN = `${Date.now() % 1000000}`;
const errors = [];
let failures = 0;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗ FAIL'} ${label}`); if (!ok) failures++; };

const abortJourney = (reason) => {
  throw new Error(`手机触控冒烟中止: ${reason}`);
};

async function runJourney() {
  let browser = null;
  try {
    browser = await chromium.launch({
      ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
      args: JOURNEY_CHROMIUM_ARGS,
    });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
});
const page = await ctx.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`CONSOLE ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`));
const body = { username: `mob_${RUN}`, password: 'password123' };
let res = await fetch(`${BASE}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
if (!res.ok) {
  res = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
if (!res.ok) {
  await abortJourney(`认证失败：HTTP ${res.status}`);
}
const token = (await res.json()).token;
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => {
  localStorage.setItem('np_token', t);
  // The first-run help panel is a real full-screen modal. Mark the tutorial as
  // acknowledged before readiness validation, just like the desktop evidence
  // player, so the overlay detector does not correctly wait forever for a
  // modal that this journey only closed after the wait had already returned.
  localStorage.setItem('np_help_seen', '1');
  localStorage.setItem('np_settings', JSON.stringify({
    quality: 'low', shadows: false, postfx: false, reflections: false, particles: false, clouds: false,
    masterVolume: 0, musicVolume: 0, sfxVolume: 0, voiceVolume: 0, mediaVolume: 0, invertY: false,
  }));
}, token);
await page.reload({ waitUntil: 'domcontentloaded' });
const mobileWorldReady = await waitForRenderedWorld(page, 'plaza', 60_000);
check('mobile plaza rendered its first WebGL frame', mobileWorldReady);
if (!mobileWorldReady) {
  await abortJourney('plaza 未完成 WebGL 场景挂载；停止后续 __nx 与触控节点访问');
}
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

const touchButtonCount = await page.evaluate(() => document.querySelectorAll('.touch-btn').length);
check('触控层渲染(4 个动作键)', touchButtonCount === 4);
if (touchButtonCount !== 4) {
  await abortJourney(`触控层不完整：期望 4 个动作键，实际 ${touchButtonCount} 个`);
}
let evidenceWorldReady = true;
try {
  evidenceWorldReady = await waitForRenderedWorld(page, 'plaza', 20_000);
  if (!evidenceWorldReady) {
    throw new Error('expected rendered plaza before mobile evidence');
  }
  await page.screenshot({
    path: `${OUT}/street-crossroads-mobile.png`,
    timeout: 90_000,
    animations: 'disabled',
  });
  check('移动端十字街景云端截图', true);
} catch (error) {
  console.log(`  移动端街景截图失败: ${error instanceof Error ? error.message : String(error)}`);
  check('移动端十字街景云端截图', false);
}
if (!evidenceWorldReady) {
  await abortJourney('截图前 plaza 已失去可渲染状态；停止触控输入验证');
}

// 摇杆：用真实 Chromium touch 序列向上推，走 React PointerEvent 委托。
const before = await page.evaluate(() => {
  const confirmed = window.__nx?.hot?.selfSnap;
  return confirmed ? [confirmed.x, confirmed.z] : null;
});
if (!before) {
  await abortJourney('摇杆验证前尚无服务端权威 selfSnap');
}
const joystick = page.locator('div[style*="border-radius: 50%"]', { has: page.locator('div') }).first();
const joystickBox = await joystick.boundingBox();
check('虚拟摇杆节点可用', !!joystickBox);
if (!joystickBox) {
  await abortJourney('未找到虚拟摇杆底座，无法派发 pointerdown/pointermove');
}
// Use Chromium's real touch-input path. A synthetic PointerEvent has no active
// browser pointer, so the product's setPointerCapture(pointerId) may reject it
// and make a client-only test pass without ever exercising the actual joystick.
const cdp = await ctx.newCDPSession(page);
const stickX = joystickBox.x + joystickBox.width / 2;
const stickY = joystickBox.y + joystickBox.height / 2;
const touchPoint = (x, y) => ({ x, y, id: 7, radiusX: 6, radiusY: 6, force: 1 });
await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart', touchPoints: [touchPoint(stickX, stickY)],
});
await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchMove', touchPoints: [touchPoint(stickX, stickY - 52)],
});
// SwiftShader mobile emulation can deliver only a handful of animation
// frames while the city builds; hold the joystick long enough to measure real
// movement rather than a single frame's prediction.
await page.waitForTimeout(3000);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(900);
const after = await page.evaluate(() => {
  const confirmed = window.__nx?.hot?.selfSnap;
  return confirmed ? [confirmed.x, confirmed.z] : null;
});
if (!after) {
  await abortJourney('摇杆验证后服务端权威 selfSnap 不可用');
}
const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
check(`摇杆推动服务端权威移动(位移 ${moved.toFixed(2)}m)`, moved > 1);
check('松开归零', await page.evaluate(() => {
  const touchVec = window.__nx?.hot?.touchVec;
  return !!touchVec && touchVec.x === 0 && touchVec.z === 0;
}));

// 动作键 E：真实触摸 TapBtn，再验证产品派发的 KeyE down/up 链路。
const actionButton = page.locator('.touch-btn', { hasText: /^E$/ }).first();
const actionButtonBox = await actionButton.boundingBox();
if (!actionButtonBox) await abortJourney('未找到 E 动作键');
await page.evaluate(() => {
  const events = [];
  const onDown = (event) => { if (event.code === 'KeyE') events.push('down'); };
  const onUp = (event) => { if (event.code === 'KeyE') events.push('up'); };
  window.__mobileActionProbe = { events, onDown, onUp };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
});
await page.touchscreen.tap(
  actionButtonBox.x + actionButtonBox.width / 2,
  actionButtonBox.y + actionButtonBox.height / 2,
);
await page.waitForTimeout(180);
const actionButtonEvents = await page.evaluate(() => {
  const probe = window.__mobileActionProbe;
  if (!probe) return [];
  window.removeEventListener('keydown', probe.onDown);
  window.removeEventListener('keyup', probe.onUp);
  delete window.__mobileActionProbe;
  return probe.events;
});
const actionKeyChainWorked = actionButtonEvents.includes('down') && actionButtonEvents.includes('up');
check('动作键 E 派发完整 KeyE keydown/keyup 链路', actionKeyChainWorked);
if (!actionKeyChainWorked) {
  await abortJourney(`E 动作键链路不完整：${JSON.stringify(actionButtonEvents)}`);
}

check('无浏览器控制台错误或未捕获页面异常', errors.length === 0);
for (const error of errors.slice(0, 8)) console.log(' ', error.slice(0, 180));
console.log(failures === 0 ? '✅ 手机触控冒烟通过' : `❌ ${failures} 项失败`);
    return failures ? 1 : 0;
  } finally {
    if (browser) await browser.close();
  }
}

try {
  process.exitCode = await runJourney();
} catch (error) {
  console.error(`❌ mobile journey failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
}

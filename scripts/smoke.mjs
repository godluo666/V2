/**
 * 端到端冒烟测试(无头浏览器,软渲染 WebGL)。用法:
 *   npm run build && npm start            # 终端 1
 *   npm i --no-save playwright            # 一次性;不进入项目依赖
 *   node scripts/smoke.mjs                # 终端 2
 * 两名玩家进入世界(月汐町晴日生活街,出生点=站前口袋广场):聊天互通 → 咖啡馆
 * (麻将开局/象棋走子/旁观脱敏)→ 过高架天桥 → 团子塔电梯 → 自己的房间 →
 * 编辑器摆家具 → 电视放网页。任一检查失败则退出码非 0。
 * 可设 PW_CHROMIUM 指向系统 Chromium,BASE_URL 指向其他服务器。
 */
import { chromium } from 'playwright';
import { JOURNEY_CHROMIUM_ARGS, prepareWorldInput, walkTo } from './browser-driver.mjs';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const OUT = process.env.OUT_DIR ?? '.';
// 每次跑用全新账号:老账号会"回到上次所在的空间",而测试假设从街区出生点开始
const RUN = `${Date.now() % 1000000}`;
const errors = [];
let failures = 0;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗ FAIL'} ${label}`); if (!ok) failures++; };

// 云端 SwiftShader 偶尔会在截图合成阶段停顿；截图只是留档证据，
// 不应让已经通过的功能旅程被非功能性超时中断。
async function captureEvidence(page, filename) {
  try {
    await page.screenshot({
      path: `${OUT}/${filename}`,
      timeout: 12000,
      animations: 'disabled',
    });
  } catch (error) {
    console.log(`  · 跳过超时截图 ${filename}: ${error instanceof Error ? error.name : 'Error'}`);
  }
}

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
    // 软渲染跑功能冒烟:锁最低画质,否则 swiftshader 只有 ~1 FPS,走路都走不动
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

const state = (page) => page.evaluate(() => ({
  pos: [Math.round(window.__nx.hot.local.x * 10) / 10, Math.round(window.__nx.hot.local.z * 10) / 10],
  space: window.__nx.world.getState().spaceKey,
  prompt: document.querySelector('.prompt')?.textContent ?? null,
}));

/** 提示词匹配后才按 E(必要时继续贴近)。 */
async function interactWhenPrompt(page, substr, tx, tz) {
  await page.bringToFront();
  for (let i = 0; i < 6; i++) {
    const s = await state(page);
    if (s.prompt && s.prompt.includes(substr)) {
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(1800);
      return true;
    }
    await walkTo(page, tx, tz, 5000, 0.55 + i * 0.1);
  }
  console.log('  没等到提示', substr, JSON.stringify(await state(page)));
  return false;
}

const launchBrowser = () => chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: JOURNEY_CHROMIUM_ARGS,
});

// Keep each SwiftShader canvas in its own Chromium process. GitHub runners can
// otherwise starve the second renderer during multiplayer page initialization.
const p1Browser = await launchBrowser();
const p1 = await newPlayer(p1Browser, `smoke_p1_${RUN}`);
check('WebGL 上下文', await p1.evaluate(() => {
  const c = document.querySelector('canvas');
  return !!(c?.getContext('webgl2') || c?.getContext('webgl'));
}));

const p2Browser = await launchBrowser();
const p2 = await newPlayer(p2Browser, `smoke_p2_${RUN}`);
await p2.waitForTimeout(1200);
await p2.keyboard.press('Enter');
await p2.keyboard.type('团子二号来啦!');
await p2.keyboard.press('Enter');
await p2.waitForTimeout(1400);
check('跨端聊天同步', await p1.evaluate(() =>
  [...document.querySelectorAll('.chat-line')].some((el) => el.textContent?.includes('团子二号来啦'))
));
await captureEvidence(p1, 'smoke-plaza.png');

// ── 两人进咖啡馆(短街南侧,门在 (-8.9, 15);出生点几步即到)──
for (const p of [p1, p2]) {
  await walkTo(p, 0, 23);
  await walkTo(p, -5.5, 17);
  await walkTo(p, -7.5, 15.2, 12000);
  await interactWhenPrompt(p, '咖啡馆', -7.8, 15);
}
check('两人都进入咖啡馆', (await state(p1)).space === 'cafe' && (await state(p2)).space === 'cafe');

// ── 福州麻将:入座开局 ──
await walkTo(p1, 5.8, 3.8, 20000);
await p1.evaluate(() => window.__nx.ui.getState().openPanel({ kind: 'mahjong', tableId: 'cafe-mj' }));
await p1.waitForTimeout(500);
await p1.getByText('入座', { exact: true }).click();
await p1.waitForTimeout(600);
await p1.getByText('开局(空位由🤖陪打)').click();
await p1.waitForTimeout(1500);
const mj = await p1.evaluate(() => {
  const v = window.__nx.world.getState().mj['cafe-mj'];
  return { phase: v?.pub.phase, gold: v?.pub.goldFace, hand: v?.priv?.hand.length ?? 0 };
});
check(`麻将开局(${JSON.stringify(mj)})`, (mj.phase === 'playing' && mj.gold >= 0 && mj.hand >= 13) || mj.phase === 'finished');
await captureEvidence(p1, 'smoke-mahjong.png');
await p1.keyboard.press('Escape');
const spec = await p2.evaluate(() => window.__nx.world.getState().mj['cafe-mj']?.priv ?? null);
check('麻将旁观只见公开信息', spec === null);
await p1.evaluate(() => window.__nx.connection.send('mj_action', { tableId: 'cafe-mj', action: 'leave' }));

// ── 象棋:两人入座 + 红兵进一 ──
await walkTo(p1, -3.6, 3.8, 20000);
await walkTo(p2, -5.8, 3.8, 20000);
for (const p of [p1, p2]) {
  await p.evaluate(() => window.__nx.ui.getState().openPanel({ kind: 'xiangqi', tableId: 'cafe-xq' }));
  await p.waitForTimeout(400);
}
await p1.getByText('入座对弈').click();
await p1.waitForTimeout(500);
await p2.getByText('入座对弈').click();
await p1.waitForTimeout(700);
await p1.evaluate(() => window.__nx.connection.send('xq_move', { tableId: 'cafe-xq', from: 27, to: 36 }));
await p1.waitForTimeout(800);
const xq = await p2.evaluate(() => {
  const g = window.__nx.world.getState().xq['cafe-xq'];
  return { turn: g?.turn, pawn: g?.board[36] };
});
check('象棋走子同步到对手', xq.pawn === 'P' && xq.turn === 1);
await p1.keyboard.press('Escape');
await p2.keyboard.press('Escape');
await p2Browser.close();

// ── 回街区 → 穿路口、上高架天桥(东侧坡道)→ 北街团子塔 → 电梯 → 房间 ──
await walkTo(p1, 0, 5.7, 20000);
await interactWhenPrompt(p1, '返回', 0, 6.4);
check('回到街区', (await state(p1)).space === 'plaza');
await walkTo(p1, 0, 8);
await walkTo(p1, 6.75, -10);
await walkTo(p1, 6.75, -17.5, 15000); // 东南坡道中段
await walkTo(p1, 6.75, -22.5, 15000); // 上坡
await walkTo(p1, 6.75, -27.5, 15000); // 桥面(y≈4.2)
await walkTo(p1, 6.75, -37, 15000);   // 东北坡道下行
await walkTo(p1, 7.7, -32, 12000);
await interactWhenPrompt(p1, '团子塔', 8.3, -32);
check('进入大堂', (await state(p1)).space === 'lobby');
await walkTo(p1, 0, -5.5, 25000);
await interactWhenPrompt(p1, '电梯', 0, -6.4);
await p1.waitForTimeout(700);
await p1.locator('.inv-row', { hasText: '(我)' }).locator('button').click();
await p1.waitForTimeout(2500);
check('回到自己的房间', (await state(p1)).space.startsWith('room:'));
await captureEvidence(p1, 'smoke-room.png');

// ── 房间编辑器摆一件家具 ──
await p1.click('.dock button[title="房间编辑器"]');
await p1.waitForTimeout(500);
await p1.getByText('🧰 家具目录').click();
await p1.waitForTimeout(400);
await p1.getByText('单人沙发').click();
await p1.waitForTimeout(400);
const before = await p1.evaluate(() => window.__nx.world.getState().room?.objects.length ?? -1);
const canvasBox = await p1.locator('canvas').boundingBox();
let after = before;
// 第三人称镜头与房间家具会改变单个屏幕点是否命中地面；在画布中央的安全区
// 依次寻找一个可放置点，成功后立即停止，避免测试依赖固定分辨率/相机角度。
for (const [rx, ry] of [[0.50, 0.58], [0.40, 0.55], [0.60, 0.55], [0.47, 0.44], [0.65, 0.46], [0.35, 0.46]]) {
  if (!canvasBox || after > before) break;
  const x = canvasBox.x + canvasBox.width * rx;
  const y = canvasBox.y + canvasBox.height * ry;
  await p1.mouse.move(x, y);
  await p1.waitForTimeout(250);
  await p1.mouse.click(x, y);
  await p1.waitForTimeout(700);
  after = await p1.evaluate(() => window.__nx.world.getState().room?.objects.length ?? -1);
}
await captureEvidence(p1, 'smoke-editor.png');
check(`编辑器放置家具(${before} → ${after})`, after === before + 1);
await p1.keyboard.press('Escape');
await p1.click('.dock button[title="房间编辑器"]'); // 退出编辑模式

// ── 电视放网页 ──
await walkTo(p1, -0.2, 1.5, 25000);
await interactWhenPrompt(p1, '电视', -0.2, 1.7);
await p1.locator('input[placeholder^="https"]').fill('https://example.com');
await p1.getByText('放映', { exact: true }).click();
await p1.waitForTimeout(2500);
await p1.keyboard.press('Escape');
await p1.waitForTimeout(1500);
const iframes = await p1.evaluate(() => document.querySelectorAll('iframe').length);
check(`电视出现网页 iframe(${iframes})`, iframes >= 1);
await captureEvidence(p1, 'smoke-tv.png');

console.log('CONSOLE ERRORS:', errors.length);
for (const e of errors.slice(0, 10)) console.log(' ', e.slice(0, 200));
console.log(failures === 0 ? '✅ 全部通过' : `❌ ${failures} 项失败`);
await p1Browser.close();
process.exit(failures ? 1 : 0);


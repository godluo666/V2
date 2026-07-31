/**
 * Cloud-only multiplayer journey for the current one-street / three-venue scope.
 * It verifies chat, the Dango party hall, authoritative Xiangqi, the flying-chess
 * seating area, and a cinema seat on the highest physical riser.
 */
import { chromium } from 'playwright';
import {
  JOURNEY_CHROMIUM_ARGS, enterStreetVenue, exitToStreet,
  interactWhenPrompt, prepareWorldInput, sitOnHighestSeat, walkTo,
} from './browser-driver.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const OUT = process.env.OUT_DIR ?? '.';
const RUN = `${Date.now() % 1_000_000}`;
const errors = [];
let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✓' : '✗ FAIL'} ${label}`);
  if (!ok) failures++;
};

async function captureEvidence(page, fileName, label) {
  try {
    await page.screenshot({
      path: `${OUT}/${fileName}`,
      timeout: 30_000,
      animations: 'disabled',
    });
    check(`${label} cloud screenshot captured`, true);
  } catch (error) {
    console.log(`  ${label} screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
    check(`${label} cloud screenshot captured`, false);
  }
}

async function apiToken(name) {
  const body = { username: name, password: 'password123' };
  let response = await fetch(`${BASE}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    response = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  if (!response.ok) throw new Error(`auth failed for ${name}: ${response.status}`);
  return (await response.json()).token;
}

async function newPlayer(browser, name) {
  const token = await apiToken(name);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[${name}] ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`[${name}] PAGEERROR ${error.message}`));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((value) => {
    localStorage.setItem('np_token', value);
    localStorage.setItem('np_help_seen', '1');
    localStorage.setItem('np_settings', JSON.stringify({
      quality: 'low',
      shadows: false,
      postfx: false,
      reflections: false,
      particles: false,
      clouds: false,
      masterVolume: 0,
      musicVolume: 0,
      sfxVolume: 0,
      voiceVolume: 0,
      mediaVolume: 0,
      invertY: false,
    }));
  }, token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!document.querySelector('canvas') && !!window.__nx,
    undefined,
    { timeout: 60_000, polling: 500 },
  );
  await page.waitForTimeout(800);
  await prepareWorldInput(page);
  return page;
}

const launchBrowser = () => chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: JOURNEY_CHROMIUM_ARGS,
});

const state = (page) => page.evaluate(() => ({
  space: window.__nx.world.getState().spaceKey,
  label: window.__nx.world.getState().label,
  prompt: document.querySelector('.prompt')?.textContent ?? '',
  seatId: window.__nx.hot.local.seatId,
  y: window.__nx.hot.local.y,
}));

async function enterPartyHall(page) {
  const entered = await enterStreetVenue(page, 'gameroom');
  if (!entered) console.log('  party-hall interaction failed', JSON.stringify(await state(page)));
}

async function enterCinema(page) {
  const entered = await enterStreetVenue(page, 'cinema');
  if (!entered) console.log('  cinema interaction failed', JSON.stringify(await state(page)));
}

const p1Browser = await launchBrowser();
const p1 = await newPlayer(p1Browser, `smoke_p1_${RUN}`);
check('WebGL context available', await p1.evaluate(() => {
  const canvas = document.querySelector('canvas');
  return !!(canvas?.getContext('webgl2') || canvas?.getContext('webgl'));
}));

const p2Browser = await launchBrowser();
const p2 = await newPlayer(p2Browser, `smoke_p2_${RUN}`);
await p2.keyboard.press('Enter');
await p2.keyboard.type('团子二号来啦！');
await p2.keyboard.press('Enter');
await p2.waitForTimeout(1_200);
check('cross-client chat synchronized', await p1.evaluate(() =>
  [...document.querySelectorAll('.chat-line')].some((element) =>
    element.textContent?.includes('团子二号来啦'),
  ),
));
await captureEvidence(p1, 'street-crossroads-desktop.png', 'compact crossroads desktop');

for (const page of [p1, p2]) await enterPartyHall(page);
check(
  'both players entered the Dango party hall',
  (await state(p1)).space === 'gameroom' && (await state(p2)).space === 'gameroom',
);
check('party hall uses the activity-room label', (await state(p1)).label.includes('社团活动室'));

for (const page of [p1, p2]) {
  await walkTo(page, 4.7, 5.5, 12_000);
  await walkTo(page, 5.7, 2.8, 10_000);
  await page.evaluate(() => window.__nx.connection.send('game_join', { machineId: 'gr-xq' }));
}
await p1.waitForTimeout(500);
await p1.evaluate(() => window.__nx.connection.send('xq_move', {
  tableId: 'gr-xq',
  from: 27,
  to: 36,
}));
await p2.waitForTimeout(700);
const xq = await p2.evaluate(() => {
  const game = window.__nx.world.getState().xq['gr-xq'];
  return { pawn: game?.board[36], turn: game?.turn };
});
check('party-hall Xiangqi move reached the other player', xq.pawn === 'P' && xq.turn === 1);

await p1.evaluate(() => window.__nx.connection.send('game_leave', { machineId: 'gr-xq' }));
await walkTo(p1, 6.5, -2.05, 12_000);
await interactWhenPrompt(p1, '飞行棋', 6.5, -2.05);
check('flying-chess table has a usable surrounding seat', (await state(p1)).seatId?.startsWith('gr-flight-s'));
await p1.keyboard.press('Space');
await p1.waitForTimeout(300);
await captureEvidence(p1, 'party-hall-desktop.png', 'party hall desktop');

for (const page of [p1, p2]) {
  if (!await exitToStreet(page)) {
    console.log('  street-exit interaction failed', JSON.stringify(await state(page)));
  }
}
check('both players returned to the compact street', (await state(p1)).space === 'plaza' && (await state(p2)).space === 'plaza');

for (const page of [p1, p2]) await enterCinema(page);
check('both players entered the cinema', (await state(p1)).space === 'cinema' && (await state(p2)).space === 'cinema');

const highestSeat = await sitOnHighestSeat(p1, 'cinema');
const topSeat = await state(p1);
check(
  `highest-row cinema seat is grounded at y=${highestSeat.y.toFixed(2)} (actual ${topSeat.y.toFixed(2)})`,
  topSeat.seatId === highestSeat.id && Math.abs(topSeat.y - highestSeat.y) < 0.03,
);
await captureEvidence(p1, 'cinema-highest-row-desktop.png', 'cinema highest row');

console.log(`CONSOLE ERRORS: ${errors.length}`);
for (const error of errors.slice(0, 8)) console.log(' ', error.slice(0, 180));
console.log(failures === 0 ? '✓ compact-street multiplayer smoke passed' : `✗ ${failures} checks failed`);
await Promise.all([p1Browser.close(), p2Browser.close()]);
process.exit(failures ? 1 : 0);

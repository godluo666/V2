/**
 * Cloud-only multiplayer journey for the current one-street / three-venue scope.
 * It verifies chat, the Dango party hall, authoritative Xiangqi, the flying-chess
 * seating area, and a cinema seat on the highest physical riser.
 */
import { chromium } from 'playwright';
import {
  JOURNEY_CHROMIUM_ARGS, enterStreetVenue, exitToStreet,
  interactWhenPrompt, prepareWorldInput, sitOnHighestSeat,
  waitForRenderedWorld, walkFromVenueDoorToSpawn, walkTo, walkToVenueDoor,
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

async function captureEvidence(page, fileName, label, expectedSpace) {
  try {
    if (!await waitForRenderedWorld(page, expectedSpace, 60_000)) {
      throw new Error(`expected rendered space ${expectedSpace}`);
    }
    await page.screenshot({
      path: `${OUT}/${fileName}`,
      // SwiftShader can take longer than a normal desktop GPU for the first
      // high-detail interior frame. Keep a finite ceiling without turning a
      // valid scene into a false journey failure at the old 30s cutoff.
      timeout: 90_000,
      animations: 'disabled',
    });
    check(`${label} cloud screenshot captured`, true);
    return true;
  } catch (error) {
    console.log(`  ${label} screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
    check(`${label} cloud screenshot captured`, false);
    return false;
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

async function newPlayer(browser, name, { visualEvidence = false } = {}) {
  const token = await apiToken(name);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[${name}] ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`[${name}] PAGEERROR ${error.message}`));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((value) => {
    localStorage.setItem('np_token', value.token);
    localStorage.setItem('np_help_seen', '1');
    localStorage.setItem('np_settings', JSON.stringify({
      // The evidence player uses the production medium shadow path so the
      // uploaded images actually validate contact shadows and material form.
      // Companion clients remain low-cost; post effects/reflections stay off
      // on both so the cloud run measures geometry rather than Bloom.
      quality: value.visualEvidence ? 'medium' : 'low',
      shadows: value.visualEvidence,
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
  }, { token, visualEvidence });
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (!await waitForRenderedWorld(page, 'plaza', 60_000)) {
    throw new Error(`player ${name} did not render the initial plaza frame`);
  }
  await prepareWorldInput(page);
  return page;
}

const openBrowsers = new Set();
const launchBrowser = async () => {
  const browser = await chromium.launch({
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: JOURNEY_CHROMIUM_ARGS,
  });
  openBrowsers.add(browser);
  return browser;
};
const closeBrowser = async (browser) => {
  if (!browser || !openBrowsers.has(browser)) return;
  await browser.close();
  openBrowsers.delete(browser);
};

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
  return entered;
}

async function enterCinema(page) {
  const entered = await enterStreetVenue(page, 'cinema');
  if (!entered) console.log('  cinema interaction failed', JSON.stringify(await state(page)));
  return entered;
}

async function runJourney() {
  try {
const p1Browser = await launchBrowser();
const p1 = await newPlayer(p1Browser, `smoke_p1_${RUN}`, { visualEvidence: true });
check('WebGL context available', await p1.evaluate(() => {
  const canvas = document.querySelector('canvas');
  return !!(canvas?.getContext('webgl2') || canvas?.getContext('webgl'));
}));
await captureEvidence(p1, 'street-crossroads-desktop.png', 'compact crossroads desktop', 'plaza');
const reachedCinemaFacade = await walkToVenueDoor(p1, 'cinema');
check('cinema facade close-view route reached its shared approach', reachedCinemaFacade);
if (reachedCinemaFacade) {
  await captureEvidence(p1, 'street-cinema-facade-desktop.png', 'cinema facade close view', 'plaza');
} else {
  check('cinema facade close view cloud screenshot captured', false);
}
check('facade close-view route returns to street spawn', await walkFromVenueDoorToSpawn(p1, 'cinema'));

let p2Browser = await launchBrowser();
let p2 = await newPlayer(p2Browser, `smoke_p2_${RUN}`);
await p2.keyboard.press('Enter');
await p2.keyboard.type('团子二号来啦！');
await p2.keyboard.press('Enter');
await p2.waitForTimeout(1_200);
check('cross-client chat synchronized', await p1.evaluate(() =>
  [...document.querySelectorAll('.chat-line')].some((element) =>
    element.textContent?.includes('团子二号来啦'),
  ),
));

const partyEntries = [];
for (const page of [p1, p2]) partyEntries.push(await enterPartyHall(page));
const p1InPartyHall = partyEntries[0] && (await state(p1)).space === 'gameroom';
const bothInPartyHall = partyEntries.every(Boolean)
  && p1InPartyHall
  && (await state(p2)).space === 'gameroom';
check(
  'both players entered the Dango party hall',
  bothInPartyHall,
);
check('party hall uses the activity-room label', (await state(p1)).label.includes('社团活动室'));
if (p1InPartyHall) {
  await captureEvidence(p1, 'party-hall-wide-desktop.png', 'party hall wide view', 'gameroom');
} else {
  check('party hall wide view cloud screenshot captured', false);
}

const partyApproaches = await p1.evaluate(() => {
  const interactables = window.__nx.layouts.gameroom?.interactables ?? [];
  const xqSeat = interactables.find((candidate) => candidate.id === 'gr-xq-s0');
  const flightSeat = interactables.find((candidate) => candidate.id === 'gr-flight-s0');
  if (!xqSeat || !flightSeat) throw new Error('Missing shared party-hall game-table seats');
  return {
    xq: { x: xqSeat.pos[0], z: xqSeat.pos[2] },
    flight: { x: flightSeat.pos[0], z: flightSeat.pos[2] },
  };
});
let xqRoutesReached = true;
for (const page of [p1, p2]) {
  const reached = await walkTo(page, partyApproaches.xq.x, partyApproaches.xq.z, 12_000, 0.75);
  xqRoutesReached = xqRoutesReached && reached;
  if (reached) {
    await page.evaluate(() => window.__nx.connection.send('game_join', { machineId: 'gr-xq' }));
  }
}
check('both players physically reached the shared Xiangqi seating area', xqRoutesReached);
// The cloud runner can deliver the second join over a few WebSocket ticks;
// wait for the authoritative two-player state before asking the table to move.
await p1.waitForFunction(
  () => (window.__nx.world.getState().xq['gr-xq']?.players ?? []).filter(Boolean).length === 2,
  undefined,
  { timeout: 8_000, polling: 100 },
).catch(() => {});
await p1.waitForTimeout(700);
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
const reachedFlyingChess = await walkTo(p1, partyApproaches.flight.x, partyApproaches.flight.z, 12_000, 0.75);
const usedFlyingChessSeat = reachedFlyingChess && await interactWhenPrompt(
  p1, '飞行棋', partyApproaches.flight.x, partyApproaches.flight.z,
);
check(
  'flying-chess table has a physically reached usable surrounding seat',
  reachedFlyingChess && usedFlyingChessSeat && (await state(p1)).seatId?.startsWith('gr-flight-s'),
);
// Exercise the same authoritative stand confirmation used by venue exits. A
// raw one-frame Space press can be missed by low-FPS SwiftShader and leaves the
// close evidence showing the avatar embedded in the occupied chair.
const stoodAfterFlyingChess = await prepareWorldInput(p1);
check(
  'flying-chess player stands through an authoritative non-Sit snapshot',
  stoodAfterFlyingChess && (await state(p1)).seatId == null,
);
await closeBrowser(p2Browser);
if ((await state(p1)).space === 'gameroom') {
  await captureEvidence(p1, 'party-hall-desktop.png', 'party hall desktop', 'gameroom');
} else {
  check('party hall desktop cloud screenshot captured', false);
}

let partyAtStreet = (await state(p1)).space === 'plaza';
if ((await state(p1)).space === 'gameroom') {
  partyAtStreet = await exitToStreet(p1);
  if (!partyAtStreet) console.log('  street-exit interaction failed', JSON.stringify(await state(p1)));
}
const partyReturned = partyAtStreet && await walkFromVenueDoorToSpawn(p1, 'gameroom');
check('party-hall return follows the shared route back to spawn', partyReturned);
p2Browser = await launchBrowser();
p2 = await newPlayer(p2Browser, `sm2r_${RUN}`);
check('both players returned to the compact street', (await state(p1)).space === 'plaza' && (await state(p2)).space === 'plaza');

// End the party-hall segment here. Its real exit remains an asserted red light,
// but a failed exit must not suppress the cinema geometry evidence. Start the
// cinema segment with a fresh authenticated evidence player at the real server
// plaza spawn; it still walks the shared street route and uses the public door.
// Closing the old browser first also keeps the cloud runner at two concurrent
// SwiftShader contexts instead of masking the original failure with GPU load.
await closeBrowser(p1Browser);
const cinemaBrowser = await launchBrowser();
const cinemaPage = await newPlayer(cinemaBrowser, `cinema_${RUN}`, { visualEvidence: true });

const cinemaEntries = [];
for (const page of [cinemaPage, p2]) cinemaEntries.push(await enterCinema(page));
const evidencePlayerInCinema = cinemaEntries[0] && (await state(cinemaPage)).space === 'cinema';
const bothInCinema = cinemaEntries.every(Boolean)
  && evidencePlayerInCinema
  && (await state(p2)).space === 'cinema';
check('both players entered the cinema', bothInCinema);
if (evidencePlayerInCinema) {
  await captureEvidence(cinemaPage, 'cinema-hall-wide-desktop.png', 'cinema hall wide view', 'cinema');
} else {
  check('cinema hall wide view cloud screenshot captured', false);
}

await closeBrowser(p2Browser);
if (evidencePlayerInCinema) {
  const highestSeat = await sitOnHighestSeat(cinemaPage, 'cinema');
  const topSeat = await state(cinemaPage);
  const highestSeatGrounded = Boolean(
    highestSeat?.walked
      && highestSeat.seated
      && topSeat.seatId === highestSeat.id
      && Math.abs(topSeat.y - highestSeat.y) < 0.03,
  );
  const targetHeight = highestSeat ? highestSeat.y.toFixed(2) : 'unavailable';
  check(
    `highest-row cinema seat is reached through a clear route and grounded at y=${targetHeight} (actual ${topSeat.y.toFixed(2)})`,
    highestSeatGrounded,
  );
  if (highestSeatGrounded) {
    await captureEvidence(cinemaPage, 'cinema-highest-row-desktop.png', 'cinema highest row', 'cinema');
    const stoodForArena = await prepareWorldInput(cinemaPage);
    check('cinema player can stand before leaving for the arena', stoodForArena && (await state(cinemaPage)).seatId == null);
  } else {
    check('cinema highest row cloud screenshot captured', false);
    check('cinema player can stand before leaving for the arena', false);
  }
} else {
  check('highest-row cinema seat is grounded', false);
  check('cinema highest row cloud screenshot captured', false);
  check('cinema player can stand before leaving for the arena', false);
}

// Recover the cinema evidence player with the real interior exit and reversed shared
// street route. If that journey is unhealthy, a fresh authenticated player is
// used for arena evidence; it still walks from the server plaza spawn and enters
// through the public door, so arena coverage never depends on cinema success and
// never uses a teleport/test-only bypass.
const cinemaSpaceBeforeReturn = (await state(cinemaPage)).space;
let cinemaAtStreet = cinemaSpaceBeforeReturn === 'plaza';
if (cinemaSpaceBeforeReturn === 'cinema') {
  cinemaAtStreet = await exitToStreet(cinemaPage);
  if (!cinemaAtStreet) console.log('  cinema street-exit interaction failed', JSON.stringify(await state(cinemaPage)));
}
const cinemaReturned = cinemaAtStreet && await walkFromVenueDoorToSpawn(cinemaPage, 'cinema');
check('cinema return follows its real exit and shared street route', cinemaReturned);

let arenaBrowser = null;
let arenaPage = cinemaPage;
if (!cinemaReturned || (await state(cinemaPage)).space !== 'plaza') {
  arenaBrowser = await launchBrowser();
    arenaPage = await newPlayer(arenaBrowser, `arena_${RUN}`, { visualEvidence: true });
}

let arenaEvidenceCaptured = false;
const enteredArena = await enterStreetVenue(arenaPage, 'netcafe');
check('player entered the esports arena through the shared street route', enteredArena);
if (enteredArena && (await state(arenaPage)).space === 'netcafe') {
  const arenaWideCaptured = await captureEvidence(
    arenaPage, 'arena-desktop.png', 'esports arena desktop', 'netcafe',
  );
  const arenaApron = await arenaPage.evaluate(() => {
      const stage = window.__nx.layouts.netcafe?.heightZones?.[0];
      return stage
        ? { x: (stage.minX + stage.maxX) / 2, z: stage.maxZ + 1.5 }
        : { x: 0, z: 3.05 };
  });
  const reachedArenaApron = await walkTo(arenaPage, arenaApron.x, arenaApron.z, 16_000, 0.8);
  check('esports stage close-view route reached the shared arena apron', reachedArenaApron);
  let arenaCloseCaptured = false;
  if (reachedArenaApron) {
    arenaCloseCaptured = await captureEvidence(
      arenaPage, 'arena-stage-close-desktop.png', 'esports stage close view', 'netcafe',
    );
  } else {
    check('esports stage close view cloud screenshot captured', false);
  }
  arenaEvidenceCaptured = arenaWideCaptured && reachedArenaApron && arenaCloseCaptured;
} else {
  console.log('  esports arena evidence skipped', JSON.stringify(await state(arenaPage)));
  check('esports arena desktop cloud screenshot captured', false);
  check('esports stage close view cloud screenshot captured', false);
}
check('esports arena wide and close evidence captured', arenaEvidenceCaptured);
if (arenaBrowser) await closeBrowser(arenaBrowser);
await closeBrowser(cinemaBrowser);

check('no browser console errors or uncaught page exceptions', errors.length === 0);
console.log(`CONSOLE ERRORS: ${errors.length}`);
for (const error of errors.slice(0, 8)) console.log(' ', error.slice(0, 180));
console.log(failures === 0 ? '✓ compact-street multiplayer smoke passed' : `✗ ${failures} checks failed`);
  } finally {
    const cleanup = await Promise.allSettled([...openBrowsers].map((browser) => closeBrowser(browser)));
    for (const result of cleanup) {
      if (result.status !== 'rejected') continue;
      console.error(`Browser cleanup failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      failures++;
    }
  }
  return failures ? 1 : 0;
}

try {
  process.exitCode = await runJourney();
} catch (error) {
  console.error(`Smoke journey failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
}

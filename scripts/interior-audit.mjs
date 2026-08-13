/**
 * Repeatable role-height audit for the three public interiors on Tsukishio Street.
 *
 * Every venue is entered through its real street door. Viewpoints are reached by
 * normal server-authoritative input against the shared layout; only the ordinary
 * orbit-camera values and HUD visibility change for evidence captures.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  JOURNEY_CHROMIUM_ARGS,
  enterStreetVenue,
  exitToStreet,
  prepareWorldInput,
  waitForRenderedWorld,
  walkFromVenueDoorToSpawn,
  walkTo,
} from './browser-driver.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const OUT = process.env.OUT_DIR ?? 'cloud-artifacts/interior-audit';
const ONLY = new Set((process.env.AUDIT_ONLY ?? '').split(',').filter(Boolean));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const RUN = `${Date.now() % 1_000_000}`;
const auditEntries = [];
const completedJourneys = [];

async function writeManifest() {
  await fs.writeFile(
    path.join(OUT, 'audit-manifest.json'),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      captures: auditEntries,
      completedJourneys,
    }, null, 2)}\n`,
    'utf8',
  );
}

async function tokenFor(name) {
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
  if (!response.ok) throw new Error(`interior audit auth failed: ${response.status}`);
  return (await response.json()).token;
}

async function face(page, yaw, pitch = -0.05, distance = 8.2) {
  await page.evaluate(({ nextYaw, nextPitch, nextDistance }) => {
    window.__nx.hot.camera.yaw = nextYaw;
    window.__nx.hot.camera.pitch = nextPitch;
    window.__nx.hot.camera.dist = nextDistance;
    window.__nx.hot.camera.mode = 'third';
  }, { nextYaw: yaw, nextPitch: pitch, nextDistance: distance });
  await page.waitForTimeout(1_400);
}

async function capture(page, venue, file, label) {
  const target = path.join(OUT, file);
  await page.screenshot({ path: target, animations: 'disabled', timeout: 90_000 });
  const state = await page.evaluate(() => ({
    space: window.__nx.world.getState().spaceKey,
    x: Number(window.__nx.hot.local.x.toFixed(2)),
    y: Number(window.__nx.hot.local.y.toFixed(2)),
    z: Number(window.__nx.hot.local.z.toFixed(2)),
    yaw: Number(window.__nx.hot.camera.yaw.toFixed(3)),
    pitch: Number(window.__nx.hot.camera.pitch.toFixed(3)),
    camera: window.__nxCamera ? {
      x: Number(window.__nxCamera.position.x.toFixed(2)),
      y: Number(window.__nxCamera.position.y.toFixed(2)),
      z: Number(window.__nxCamera.position.z.toFixed(2)),
    } : null,
  }));
  auditEntries.push({ venue, file, label, ...state });
  await writeManifest();
  console.log(`captured ${label}: ${target} @ ${JSON.stringify(state)}`);
}

async function reach(page, x, z, label, stopAt = 0.5) {
  if (!await walkTo(page, x, z, 60_000, stopAt)) {
    throw new Error(`could not reach ${label} (${x}, ${z})`);
  }
}

async function createPlayer(browser, venue) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const token = await tokenFor(`ia_${venue.slice(0, 3)}_${RUN}`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((value) => {
    localStorage.setItem('np_token', value);
    localStorage.setItem('np_help_seen', '1');
    localStorage.setItem('np_settings', JSON.stringify({
      quality: 'medium', shadows: true, postfx: false, reflections: false,
      particles: false, clouds: false, masterVolume: 0, musicVolume: 0,
      sfxVolume: 0, voiceVolume: 0, mediaVolume: 0, invertY: false,
    }));
  }, token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (!await waitForRenderedWorld(page, 'plaza', 60_000)) {
    throw new Error(`${venue} audit could not render the street`);
  }
  await prepareWorldInput(page);
  await page.addStyleTag({ content: '.hud { display: none !important; }' });
  return { context, page, errors };
}

async function enter(page, venue) {
  if (!await enterStreetVenue(page, venue)) throw new Error(`could not enter ${venue}`);
  if (!await waitForRenderedWorld(page, venue, 90_000)) throw new Error(`${venue} did not render`);
  await page.evaluate(() => {
    window.__nxScene?.traverse?.((object) => {
      if (object.type === 'Sprite') object.visible = false;
    });
  });
  await page.waitForTimeout(4_000);
}

async function auditCinema(page) {
  await enter(page, 'cinema');
  await face(page, 0, -0.13, 8.5);
  await capture(page, 'cinema', '01-cinema-entry-axis.png', 'cinema entry and main auditorium axis');

  await reach(page, 0, 10.2, 'cinema admission threshold');
  await face(page, Math.PI, -0.04, 4.8);
  await capture(page, 'cinema', '01b-cinema-admission.png', 'cinema admission gates and rear lobby buffer');

  await reach(page, 6.25, 12.75, 'cinema lobby poster approach');
  await face(page, Math.PI, -0.08, 3.1);
  await capture(page, 'cinema', '01c-cinema-lobby-information.png', 'cinema admission and current-program lightbox');

  await reach(page, 6.3, 8.9, 'cinema rear right aisle');
  await face(page, 0, -0.06, 7.2);
  await capture(page, 'cinema', '02-cinema-rear-aisle.png', 'cinema rear aisle and stepped seating');

  await reach(page, 6.3, -8.9, 'cinema screen apron');
  await face(page, 0, -0.28, 6.2);
  await capture(page, 'cinema', '03-cinema-screen-apron.png', 'cinema screen apron and proscenium');
  await face(page, Math.PI, 0.02, 7.5);
  await capture(page, 'cinema', '04-cinema-auditorium-return.png', 'cinema auditorium looking back to entry');

  await reach(page, 13.55, 12.45, 'cinema concession approach');
  await face(page, -Math.PI / 2, -0.06, 3.8);
  await capture(page, 'cinema', '05-cinema-concession.png', 'cinema staffed concession and circulation bay');
}

async function auditArena(page) {
  await enter(page, 'netcafe');
  await face(page, 0, -0.12, 10.5);
  await capture(page, 'netcafe', '10-arena-entry-axis.png', 'arena entry and central evacuation axis');

  await reach(page, -9.75, 5.25, 'arena staff operations approach');
  await face(page, Math.PI / 2, -0.05, 4.4);
  await capture(page, 'netcafe', '10b-arena-staff-service.png', 'arena staff operations and equipment storage');

  // Return through the rear concourse instead of cutting diagonally across
  // the competition deck: this is the actual spectator circulation logic.
  await reach(page, 0, 8.4, 'arena rear main concourse');
  await reach(page, 9.75, 5.25, 'arena spectator service approach');
  await face(page, -Math.PI / 2, -0.05, 4.4);
  await capture(page, 'netcafe', '10c-arena-refreshments.png', 'arena refreshments and recycling service');

  await reach(page, 0, 3.0, 'arena stage apron');
  await face(page, 0, -0.16, 9.2);
  await capture(page, 'netcafe', '11-arena-stage-apron.png', 'arena stage apron and main screen');

  await reach(page, -11.7, 0.3, 'arena west evacuation gate');
  // Keep the camera on the competition-floor side of the portal so the
  // directional face of the wall-mounted exit sign is actually audited.
  await face(page, Math.PI / 2, -0.03, 6.4);
  await capture(page, 'netcafe', '12-arena-side-gate.png', 'arena side stand evacuation gate and handrails');

  await reach(page, 7.2, -11.1, 'arena screen-side maintenance route');
  await face(page, 0, 0.12, 7.2);
  await capture(page, 'netcafe', '13-arena-screen-side.png', 'arena screen-side and host platform');
  await face(page, Math.PI, 0.03, 8.5);
  await capture(page, 'netcafe', '14-arena-return-view.png', 'arena floor looking back to concourse');
}

async function auditGameroom(page) {
  await enter(page, 'gameroom');
  await face(page, -0.08, -0.04, 7.6);
  await capture(page, 'gameroom', '20-club-entry-axis.png', 'club entry with lounge and game zones');

  await reach(page, 6.8, 6.8, 'club entry storage approach');
  await face(page, Math.PI, 0.04, 4.5);
  await capture(page, 'gameroom', '20b-club-entry-storage.png', 'club shoe and coat storage buffer');

  await reach(page, -3.3, 4.3, 'club lounge approach');
  await face(page, 0, -0.02, 5.8);
  await capture(page, 'gameroom', '21-club-lounge.png', 'club lounge and activity-room depth');

  await reach(page, 7.2, 0, 'club tabletop aisle');
  await face(page, Math.PI / 2, -0.02, 6.2);
  await capture(page, 'gameroom', '22-club-tabletop-zone.png', 'club tabletop games and central aisle');

  await reach(page, -7.3, -4.4, 'club stage apron');
  await face(page, -0.62, -0.02, 5.9);
  await capture(page, 'gameroom', '23-club-stage.png', 'club stage and preparation zone');
  // Step back into the room before looking north. A camera behind the stage
  // apron can enter the backdrop and produce a useless full-frame obstruction.
  await reach(page, -3.3, 2.2, 'club return-view center');
  await face(page, Math.PI, -0.02, 6.5);
  await capture(page, 'gameroom', '24-club-return-view.png', 'club room looking back to entry, exit sign and service corners');
}

const audits = [
  ['cinema', auditCinema],
  ['netcafe', auditArena],
  ['gameroom', auditGameroom],
];

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? EDGE,
  args: JOURNEY_CHROMIUM_ARGS,
});
try {
  for (const [venue, audit] of audits) {
    if (ONLY.size > 0 && !ONLY.has(venue)) continue;
    const { context, page, errors } = await createPlayer(browser, venue);
    try {
      await audit(page);
      if (errors.length > 0) throw new Error(`${venue} browser errors:\n${errors.slice(0, 8).join('\n')}`);
      if (!await exitToStreet(page)) throw new Error(`could not leave ${venue} through its real exit`);
      if (!await walkFromVenueDoorToSpawn(page, venue)) {
        throw new Error(`${venue} could not follow its shared street return route`);
      }
      const returnState = await page.evaluate(() => ({
        space: window.__nx.world.getState().spaceKey,
        x: Number(window.__nx.hot.local.x.toFixed(2)),
        y: Number(window.__nx.hot.local.y.toFixed(2)),
        z: Number(window.__nx.hot.local.z.toFixed(2)),
      }));
      completedJourneys.push({
        venue,
        enteredThroughStreetDoor: true,
        exitedThroughInteriorDoor: true,
        returnedViaSharedStreetRoute: true,
        returnState,
      });
      await writeManifest();
      console.log(`completed ${venue} interior journey`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

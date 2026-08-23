/**
 * Repeatable visual audit for the outdoor street.
 *
 * The player authenticates against the real local server and reaches every
 * viewpoint through the shared, collision-checked walking driver. Camera yaw
 * changes are equivalent to an ordinary mouse orbit; no scene coordinates or
 * rendered objects are mutated for the captures.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  JOURNEY_CHROMIUM_ARGS,
  prepareWorldInput,
  waitForRenderedWorld,
  walkTo,
} from './browser-driver.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const OUT = process.env.OUT_DIR ?? 'cloud-artifacts/street-audit';
const requestedGroups = (process.env.AUDIT_ONLY ?? '').split(',').filter(Boolean);
const ONLY = new Set(requestedGroups.length > 0 ? requestedGroups : [
  'spawn', 'termini', 'curve', 'stairs', 'flight', 'service-alley',
]);
const RUN = `${Date.now() % 1_000_000}`;
const AUDIT_TOD = process.env.AUDIT_TOD ? Number(process.env.AUDIT_TOD) : null;
const AUDIT_WEATHER = process.env.AUDIT_WEATHER ?? null;
const auditEntries = [];

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
  if (!response.ok) throw new Error(`audit auth failed: ${response.status}`);
  return (await response.json()).token;
}

async function face(page, yaw, pitch = -0.02, distance = 8.2) {
  await page.evaluate(({ nextYaw, nextPitch, nextDistance }) => {
    window.__nx.hot.camera.yaw = nextYaw;
    window.__nx.hot.camera.pitch = nextPitch;
    window.__nx.hot.camera.dist = nextDistance;
    window.__nx.hot.camera.mode = 'third';
  }, { nextYaw: yaw, nextPitch: pitch, nextDistance: distance });
  await page.waitForTimeout(1_400);
}

async function faceFirst(page, yaw, pitch = -0.42) {
  await page.evaluate(({ nextYaw, nextPitch }) => {
    window.__nx.hot.camera.yaw = nextYaw;
    window.__nx.hot.camera.pitch = nextPitch;
    window.__nx.hot.camera.mode = 'first';
  }, { nextYaw: yaw, nextPitch: pitch });
  await page.waitForTimeout(650);
}

async function capture(page, file, label) {
  if (AUDIT_TOD != null) {
    await page.evaluate((tod) => {
      const current = window.__nx.world.getState().env;
      window.__nx.world.setState({
        env: { ...current, timeOfDay: tod, at: Date.now(), dayLengthSec: 1_000_000_000 },
      });
    }, AUDIT_TOD);
    await page.waitForTimeout(350);
  }
  const target = path.join(OUT, file);
  await page.screenshot({ path: target, animations: 'disabled', timeout: 90_000 });
  const position = await page.evaluate(() => ({
    x: Number(window.__nx.hot.local.x.toFixed(2)),
    z: Number(window.__nx.hot.local.z.toFixed(2)),
    yaw: Number(window.__nx.hot.camera.yaw.toFixed(3)),
    camera: window.__nxCamera ? {
      x: Number(window.__nxCamera.position.x.toFixed(2)),
      y: Number(window.__nxCamera.position.y.toFixed(2)),
      z: Number(window.__nxCamera.position.z.toFixed(2)),
    } : null,
    timeOfDay: (() => {
      const env = window.__nx.world.getState().env;
      return Number(((env.timeOfDay + (Date.now() - env.at) / 1000 / env.dayLengthSec) % 1).toFixed(4));
    })(),
    weather: window.__nx.world.getState().env.weather,
  }));
  auditEntries.push({ file, label, ...position });
  await fs.writeFile(
    path.join(OUT, 'audit-manifest.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE, captures: auditEntries }, null, 2)}\n`,
    'utf8',
  );
  console.log(`captured ${label}: ${target} @ ${JSON.stringify(position)}`);
}

const selected = (name) => ONLY.has(name);
const streetZ = (x) => Math.sin((x + 4) / 18) * 3.2 + x * 0.025;

async function reach(page, x, z, label, stopAt = 0.65) {
  if (!await walkTo(page, x, z, 60_000, stopAt)) {
    throw new Error(`could not reach ${label} (${x}, ${z})`);
  }
}

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: JOURNEY_CHROMIUM_ARGS,
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  const token = await tokenFor(`street_audit_${RUN}`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((value) => {
    localStorage.setItem('np_token', value.token);
    localStorage.setItem('np_help_seen', '1');
    localStorage.setItem('np_settings', JSON.stringify({
      quality: value.quality, shadows: value.shadows,
      postfx: value.postfx, reflections: false,
      particles: value.particles, clouds: value.clouds, masterVolume: 0, musicVolume: 0,
      sfxVolume: 0, voiceVolume: 0, mediaVolume: 0, invertY: false,
    }));
  }, {
    token,
    quality: process.env.AUDIT_QUALITY ?? 'medium',
    shadows: process.env.AUDIT_SHADOWS !== '0',
    postfx: process.env.AUDIT_POSTFX !== '0',
    particles: process.env.AUDIT_PARTICLES === '1',
    clouds: process.env.AUDIT_CLOUDS !== '0',
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (!await waitForRenderedWorld(page, 'plaza', 60_000)) {
    throw new Error('street did not reach a rendered state');
  }
  await prepareWorldInput(page);
  // Task acceptance explicitly asks for the environment to remain credible
  // without navigation, prompts or comic speed lines covering the canvas.
  await page.addStyleTag({ content: '.hud { display: none !important; }' });
  await page.evaluate(() => {
    window.__nxScene?.traverse?.((object) => {
      if (object.type === 'Sprite') object.visible = false;
    });
  });
  if (process.env.AUDIT_TOD) {
    const timeOfDay = Number(process.env.AUDIT_TOD);
    await page.evaluate((tod) => {
      const current = window.__nx.world.getState().env;
      window.__nx.world.setState({
        env: { ...current, timeOfDay: tod, at: Date.now(), dayLengthSec: 1_000_000_000 },
      });
    }, timeOfDay);
    await page.evaluate((tod) => {
      window.setInterval(() => {
        const current = window.__nx.world.getState().env;
        window.__nx.world.setState({
          env: { ...current, timeOfDay: tod, at: Date.now(), dayLengthSec: 1_000_000_000 },
        });
      }, 100);
    }, timeOfDay);
  }
  if (AUDIT_WEATHER) {
    await page.evaluate((weather) => {
      const current = window.__nx.world.getState().env;
      window.__nx.world.setState({ env: { ...current, weather, at: Date.now() } });
    }, AUDIT_WEATHER);
    await page.evaluate((weather) => {
      window.setInterval(() => {
        const current = window.__nx.world.getState().env;
        window.__nx.world.setState({ env: { ...current, weather, at: Date.now() } });
      }, 100);
    }, AUDIT_WEATHER);
  }
  // Let the progressive street/building queues settle before the baseline.
  await page.waitForTimeout(8_000);

  if (selected('spawn')) {
    await face(page, -Math.PI / 2);
    await capture(page, '01-spawn-east.png', 'spawn looking east');
    await face(page, Math.PI / 2);
    await capture(page, '02-spawn-west.png', 'spawn looking west');
  }

  if (selected('termini')) {
    await reach(page, -38, streetZ(-38), 'west street terminus');
    await face(page, Math.PI / 2, -0.015, 6.2);
    await capture(page, '02a-west-terminus.png', 'west street terminus at pedestrian distance');
    await reach(page, 38, streetZ(38), 'east street terminus');
    await face(page, -Math.PI / 2, -0.015, 6.2);
    await capture(page, '02b-east-terminus.png', 'east street terminus at pedestrian distance');
  }

  if (selected('curve')) {
    await reach(page, -18, streetZ(-18), 'west curve');
    await face(page, -Math.PI / 2, -0.02, 8.2);
    await capture(page, '02c-west-curve-east.png', 'west curve looking uphill');
    await reach(page, 16, streetZ(16), 'east curve');
    await face(page, Math.PI / 2, -0.02, 8.2);
    await capture(page, '02d-east-curve-west.png', 'east curve looking downhill');
  }

  if (selected('stairs')) {
    const stairX = -12.4;
    const stairStartZ = streetZ(stairX) - 4.7;
    await reach(page, stairX, streetZ(stairX) - 3.7, 'stone stair mouth');
    await face(page, 0, -0.015, 7.2);
    await capture(page, '03-stair-mouth.png', 'twelve-step lane from the main street');
    await reach(page, stairX, stairStartZ - 9.75, 'stone stair top landing', 0.5);
    await face(page, Math.PI, 0.02, 5.8);
    await capture(page, '04-stair-top.png', 'stone stair top landing looking back');
  }

  if (selected('flight')) {
    const flightX = -2.5;
    const flightZ = streetZ(flightX) + 9.25;
    await reach(page, flightX, flightZ - 2.35, 'outdoor flying-chess courtyard', 0.45);
    await face(page, Math.PI, -0.015, 7.2);
    await capture(page, '05-flight-courtyard.png', 'outdoor physical flying-chess courtyard');
  }

  if (selected('service-alley')) {
    const alleyX = 24;
    await reach(page, alleyX, streetZ(alleyX) + 3.8, 'service alley mouth');
    await face(page, Math.PI, -0.015, 6.8);
    await capture(page, '06-service-alley-mouth.png', 'service alley from the curved street');
    await reach(page, alleyX, streetZ(alleyX) + 11.8, 'service alley interior', 0.5);
    await face(page, Math.PI, 0.03, 6.5);
    await capture(page, '06a-service-alley-interior.png', 'service alley utility depth');
  }

  if (selected('upper-life')) {
    // First-person upward views are part of normal runtime camera control and
    // reveal the residential floors that storefront-centred third-person
    // evidence tends to crop away.
    await reach(page, -2.8, 1.7, 'north residential upper-floor audit', 0.35);
    await faceFirst(page, 0, -0.48);
    await capture(page, '06a-north-upper-life.png', 'north streetwall residential upper floors');
    await reach(page, 14.2, -1.7, 'south residential upper-floor audit', 0.35);
    await faceFirst(page, Math.PI, -0.48);
    await capture(page, '06b-south-upper-life.png', 'south streetwall residential upper floors');
    await page.evaluate(() => { window.__nx.hot.camera.mode = 'third'; });
  }

  if (selected('roof-life')) {
    await reach(page, -20.2, 2.45, 'north shop-house roof audit', 0.35);
    await faceFirst(page, -0.48, -1.08);
    await capture(page, '06c-north-roof-life.png', 'north shop-house roof and rainwater equipment');
    await reach(page, 17.2, -2.45, 'south shop-house roof audit', 0.35);
    await faceFirst(page, Math.PI + 0.48, -1.08);
    await capture(page, '06d-south-roof-life.png', 'south shop-house roof and rainwater equipment');
    await page.evaluate(() => { window.__nx.hot.camera.mode = 'third'; });
  }

  if (selected('recycling')) {
    await reach(page, -23.2, 1.55, 'neighbourhood recycling station', 0.3);
    await face(page, Math.PI, -0.025, 5.8);
    await capture(page, '06e-recycling-station.png', 'covered neighbourhood recycling station');
  }

  if (selected('streetscape')) {
    // Four ordinary cross-street views expose whether props accumulate into
    // implausible clusters even when every individual clearance test passes.
    for (const [file, label, x, z, yaw] of [
      ['06f-west-north-streetscape.png', 'west north-side service frontage', -18.2, -1.55, 0],
      ['06g-west-south-streetscape.png', 'west south-side residential frontage', -18.2, 1.55, Math.PI],
      ['06h-east-north-streetscape.png', 'east north-side service frontage', 14.5, -1.55, 0],
      ['06i-east-south-streetscape.png', 'east south-side community frontage', 16.2, 1.55, Math.PI],
    ]) {
      await reach(page, x, z, label, 0.3);
      await face(page, yaw, -0.025, 6.4);
      await capture(page, file, label);
    }
  }

  for (const [key, x, z, yaw] of [
    ['gameroom', -24, -4.45, 0],
    ['netcafe', -3.5, 4.45, Math.PI],
    ['cinema', 16, -4.45, 0],
  ]) {
    if (!selected(key)) continue;
    await reach(page, x, z, `${key} frontage`, 0.34);
    await face(page, yaw, -0.04, 8.5);
    await capture(page, `07-${key}-frontage.png`, `${key} frontage`);
  }

  const shops = [
      ['general-store', -15.5, -1.55, 0, 'third'],
      ['florist', -10.85, -1.55, 0, 'third'],
      ['cafe', 4, -1.55, 0, 'third'],
      ['stationery', 9, -1.55, 0, 'third'],
      ['fishmonger', -13.5, 1.55, Math.PI, 'third'],
      ['watch-repair', 5.2, 1.55, Math.PI, 'third'],
      ['pharmacy', 23.5, 1.55, Math.PI, 'third'],
      ['alley-restaurant', -8, -19.6, -Math.PI / 2, 'third'],
  ];
  if (selected('shops') || shops.some(([key]) => selected(key))) {
    let number = 10;
    for (const [key, x, z, yaw, mode] of shops) {
      if (!selected('shops') && !selected(key)) {
        number += 1;
        continue;
      }
      if (key === 'alley-restaurant') {
        await reach(page, -8, 0, 'north alley turn', 0.45);
        await reach(page, -8, -15.8, 'north alley restaurant approach', 0.3);
        // A tiny 0.62m dango has a physically low first-person eye. Preserve
        // that runtime scale and audit the frontage from the real third-person
        // diagonal available at the alley bend.
        await face(page, -0.82, -0.025, 5.8);
        await capture(page, `${number}-${key}.png`, `${key} ordinary frontage`);
        number += 1;
        continue;
      }
      await reach(page, x, z, `${key} frontage`, 0.28);
      await face(page, yaw, -0.025, 5.8);
      if (mode === 'first') {
        await page.evaluate(() => { window.__nx.hot.camera.mode = 'first'; });
        await page.waitForTimeout(500);
      }
      await capture(page, `${number}-${key}.png`, `${key} ordinary frontage`);
      number += 1;
    }
  }

  if (browserErrors.length > 0) {
    throw new Error(`browser errors:\n${browserErrors.slice(0, 8).join('\n')}`);
  }
} finally {
  await browser.close();
}

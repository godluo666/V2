/**
 * Browser-journey movement helpers.
 *
 * Cloud Chromium can render the Three.js scene at only a few frames per second.
 * Keyboard walking is tied to requestAnimationFrame, so it is unsuitable as a
 * clock for multiplayer assertions. `walkTo` advances the same predicted player
 * state in small, rate-limited steps and sends it through the normal input
 * channel. The server still enforces speed, bounds, collisions and interaction
 * distance; no test-only product endpoint or teleport bypass is involved.
 */
export const JOURNEY_CHROMIUM_ARGS = [
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];

export async function prepareWorldInput(page) {
  await page.bringToFront();
  const stoodUp = await page.evaluate(() => {
    const nx = window.__nx;
    nx.ui.getState().setHelpSeen();
    nx.ui.getState().closePanel();
    nx.ui.getState().setDialogue(null);
    nx.hot.chatFocused = false;
    nx.hot.uiOpen = false;
    nx.hot.keys.clear();
    if (nx.hot.local.seatId) {
      // A one-frame Space key can be missed by a low-FPS cloud renderer.
      // This is the same protocol action LocalPlayer sends when movement starts.
      nx.connection.send('stand', {});
      nx.hot.local.seatId = null;
      return true;
    }
    return false;
  });
  await page.waitForTimeout(stoodUp ? 300 : 100);
}

/**
 * Walk toward a world-space target using sub-run-speed input steps.
 *
 * 0.72m / 110ms is about 6.5m/s: below the 7m/s client run speed and far below
 * the server's 11m/s anti-teleport ceiling. This makes the journey independent
 * of renderer FPS while keeping authoritative movement validation in the loop.
 */
export async function walkTo(page, tx, tz, timeoutMs = 45000, stopAt = 1.0) {
  await prepareWorldInput(page);
  const start = Date.now();
  let finalD = Infinity;

  while (Date.now() - start < timeoutMs) {
    finalD = await page.evaluate(([x, z, stop]) => {
      const nx = window.__nx;
      const dx = x - nx.hot.local.x;
      const dz = z - nx.hot.local.z;
      const distance = Math.hypot(dx, dz);
      nx.hot.camera.yaw = Math.atan2(-dx, -dz);
      if (distance <= stop) return distance;

      const step = Math.min(0.72, Math.max(0, distance - stop * 0.72));
      nx.hot.local.x += (dx / distance) * step;
      nx.hot.local.z += (dz / distance) * step;
      nx.connection.sendInput(true);
      return distance;
    }, [tx, tz, stopAt]);
    if (finalD < stopAt) break;
    await page.waitForTimeout(110);
  }

  // Let a server snapshot/correction and the interaction scan catch up.
  await page.evaluate(() => window.__nx.connection.sendInput(true));
  await page.waitForTimeout(300);
  finalD = await page.evaluate(([x, z]) => {
    const l = window.__nx.hot.local;
    return Math.hypot(x - l.x, z - l.z);
  }, [tx, tz]);
  return finalD < stopAt;
}

/** Run route points in order and stop immediately if one is blocked. */
export async function walkRoute(page, points) {
  for (const [x, z, timeoutMs = 12_000, stopAt = 1] of points) {
    if (!await walkTo(page, x, z, timeoutMs, stopAt)) return false;
  }
  return true;
}

/**
 * Follow the shared city plan to a venue façade via the marked crossing.
 * Moving a building, pavement, or crossing therefore cannot silently leave
 * three journey scripts with stale coordinates.
 */
export async function walkToVenueDoor(page, venueKey) {
  const points = await page.evaluate((key) => {
    const nx = window.__nx;
    const venue = nx.cityMap.venues.find((candidate) => candidate.key === key);
    const crossing = nx.cityMap.crosswalks[0];
    if (!venue || !crossing) throw new Error(`Unknown street venue: ${key}`);

    const currentZ = nx.hot.local.z;
    const pavementFor = (z) => nx.cityMap.sidewalks
      .filter((walk) => Math.sign(walk.z) === Math.sign(z))
      .sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z))[0];
    const currentWalk = pavementFor(currentZ);
    const venueWalk = pavementFor(venue.z);
    if (!currentWalk || !venueWalk) throw new Error(`Missing pavement for venue: ${key}`);

    return [
      [crossing.x, currentWalk.z],
      [crossing.x, venueWalk.z],
      [venue.x, venueWalk.z],
      [venue.approach[0], venue.approach[1], 8_000, 0.6],
    ];
  }, venueKey);
  return walkRoute(page, points);
}

/** Reach and enter a street venue using only coordinates from `cityplan.ts`. */
export async function enterStreetVenue(page, venueKey) {
  await walkToVenueDoor(page, venueKey);
  const venue = await page.evaluate((key) => {
    const found = window.__nx.cityMap.venues.find((candidate) => candidate.key === key);
    if (!found) throw new Error(`Unknown street venue: ${key}`);
    return { label: found.label, approach: found.approach };
  }, venueKey);
  return interactWhenPrompt(page, venue.label, ...venue.approach, {
    expectedSpace: venueKey,
  });
}

/** Leave the current public interior through its shared-layout exit door. */
export async function exitToStreet(page) {
  await prepareWorldInput(page);
  const exit = await page.evaluate(() => {
    const nx = window.__nx;
    const layout = nx.layouts[nx.world.getState().spaceKey];
    const door = layout?.interactables.find(
      (candidate) => candidate.kind === 'door' && candidate.data?.target === 'plaza',
    );
    if (!door) throw new Error(`No street exit in ${nx.world.getState().spaceKey}`);
    const [x, , z] = door.pos;
    const axis = Math.abs(z) >= Math.abs(x) ? 'z' : 'x';
    const inward = axis === 'z'
      ? [x, z - Math.sign(z) * 3]
      : [x - Math.sign(x) * 3, z];
    const approach = axis === 'z'
      ? [x, z - Math.sign(z) * 0.35]
      : [x - Math.sign(x) * 0.35, z];
    return { label: door.label, inward, approach };
  });
  await walkRoute(page, [
    [exit.inward[0], exit.inward[1]],
    [exit.approach[0], exit.approach[1], 8_000, 0.6],
  ]);
  return interactWhenPrompt(page, exit.label, ...exit.approach, {
    expectedSpace: 'plaza',
  });
}

/**
 * Sit on the physically highest shared-layout seat in a space.
 *
 * This calls the same public `sit` command as an E interaction. The server must
 * accept the player's real distance, then the client must snap to the shared
 * seat height before the helper succeeds.
 */
export async function sitOnHighestSeat(page, spaceKey) {
  const seat = await page.evaluate((key) => {
    const layout = window.__nx.layouts[key];
    const highest = layout?.interactables
      .filter((candidate) => candidate.kind === 'seat')
      .sort((a, b) => b.pos[1] - a.pos[1])[0];
    if (!highest) throw new Error(`No seat in ${key}`);
    return { id: highest.id, x: highest.pos[0], y: highest.pos[1], z: highest.pos[2] };
  }, spaceKey);

  // Stop in the aisle rather than trying to overlap the chair collider.
  await walkTo(page, seat.x, seat.z, 12_000, 2);
  await page.evaluate((seatId) => {
    window.__nx.connection.send('sit', { seatId });
  }, seat.id);
  try {
    await page.waitForFunction(
      ({ id, y }) => {
        const local = window.__nx.hot.local;
        return local.seatId === id && Math.abs(local.y - y) < 0.03;
      },
      { id: seat.id, y: seat.y },
      { timeout: 5_000, polling: 100 },
    );
  } catch {
    // The caller reports the authoritative assertion with useful actual values.
  }
  return seat;
}

/**
 * Re-check both before and after every movement. The old journeys only checked
 * before walking, so a prompt first appearing on the final attempt was logged
 * as "not found" even though it was already visible.
 */
export async function interactWhenPrompt(
  page,
  text,
  tx,
  tz,
  {
    attempts = 4,
    moveTimeoutMs = 4_000,
    stopAt = 0.52,
    settleMs = 900,
    expectedSpace = null,
  } = {},
) {
  const tryInteract = async () => {
    const prompt = await page.evaluate(
      () => document.querySelector('.prompt')?.textContent ?? '',
    );
    if (!prompt.includes(text)) return false;
    await page.keyboard.press('KeyE');
    if (expectedSpace) {
      try {
        await page.waitForFunction(
          (space) => window.__nx.world.getState().spaceKey === space,
          expectedSpace,
          { timeout: 4_000, polling: 100 },
        );
      } catch {
        return false;
      }
    } else {
      await page.waitForTimeout(settleMs);
    }
    return true;
  };

  await prepareWorldInput(page);
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await tryInteract()) return true;
    await walkTo(page, tx, tz, moveTimeoutMs, stopAt + attempt * 0.04);
    if (await tryInteract()) return true;
  }
  return false;
}

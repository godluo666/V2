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

const spaceIs = (page, expectedSpace) => page.evaluate(
  (space) => window.__nx?.world.getState().spaceKey === space,
  expectedSpace,
);

/**
 * Wait until the requested world is mounted and has produced browser frames.
 *
 * A canvas node alone is not evidence: during a space switch it can coexist
 * with the old scene, a full-screen loading layer, or a lost WebGL context.
 * This check remains read-only and observes the same scene/store used by the
 * player; it does not expose a product-side test bypass.
 */
export async function waitForRenderedWorld(page, expectedSpace, timeoutMs = 60_000) {
  try {
    await page.waitForFunction(
      (space) => {
        const nx = window.__nx;
        const canvas = document.querySelector('canvas');
        const scene = window.__nxScene;
        if (!nx || !canvas || !scene || nx.world.getState().spaceKey !== space) return false;
        if (typeof scene.getObjectByName !== 'function' || !scene.getObjectByName(`nx-space-${space}`)) return false;
        if (nx.ui.getState().fade) return false;
        if (canvas.width < 2 || canvas.height < 2 || canvas.clientWidth < 2 || canvas.clientHeight < 2) return false;
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl || gl.isContextLost() || !Array.isArray(scene.children) || scene.children.length === 0) return false;

        // LoadingScreen currently uses inline styles, while the Suspense and
        // connection fallbacks use CSS classes. Inspect computed layout for all
        // positioned descendants so a class-only loading/scrim layer cannot be
        // mistaken for a rendered world. Ancestors of the canvas are excluded:
        // `.canvas-wrap` and `.app-root` legitimately cover the viewport.
        const canvasRect = canvas.getBoundingClientRect();
        return ![...document.body.querySelectorAll('*')].some((element) => {
          if (element === canvas || element.contains(canvas)) return false;
          const style = getComputedStyle(element);
          if (!['absolute', 'fixed', 'sticky'].includes(style.position)) return false;
          const zIndex = Number.parseInt(style.zIndex, 10);
          const className = element.getAttribute('class') ?? '';
          const semanticBlocker = /(?:loading|loader|overlay|scrim|splash|blocking)/i.test(className)
            || element.getAttribute('aria-busy') === 'true';
          if (!semanticBlocker && (!Number.isFinite(zIndex) || zIndex < 20)) return false;
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (Number.parseFloat(style.opacity || '1') <= 0.05) return false;
          const rect = element.getBoundingClientRect();
          const coversCanvas = rect.left <= canvasRect.left + canvasRect.width * 0.075
            && rect.top <= canvasRect.top + canvasRect.height * 0.075
            && rect.right >= canvasRect.right - canvasRect.width * 0.075
            && rect.bottom >= canvasRect.bottom - canvasRect.height * 0.075;
          if (!coversCanvas) return false;

          // A semantic loading/scrim class is sufficient even when its paint is
          // supplied by descendants. For other high-z layers, require either
          // input blocking or a visible background so transparent HUD shells do
          // not hold the journey open.
          const backgroundIsVisible = style.backgroundImage !== 'none'
            || !/^(?:transparent|rgba?\([^)]*,\s*0(?:\.0+)?\))$/i.test(style.backgroundColor);
          return semanticBlocker || style.pointerEvents !== 'none' || backgroundIsVisible;
        });
      },
      expectedSpace,
      { timeout: timeoutMs, polling: 200 },
    );

    // A browser RAF can advance even when Three stopped drawing. Require two
    // increments from the heartbeat that runs inside R3F's render loop.
    const renderFrame = await page.evaluate(() => window.__nxRenderFrame ?? 0);
    await page.waitForFunction(
      (startFrame) => (window.__nxRenderFrame ?? 0) >= startFrame + 2,
      renderFrame,
      { timeout: 10_000, polling: 100 },
    );
    return await spaceIs(page, expectedSpace);
  } catch {
    return false;
  }
}

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
      return true;
    }
    return false;
  });
  if (stoodUp) {
    try {
      await page.waitForFunction(
        () => {
          const nx = window.__nx;
          return nx.hot.local.seatId == null
            && !Object.values(nx.world.getState().seats).includes(nx.hot.selfId);
        },
        undefined,
        { timeout: 4_000, polling: 100 },
      );
    } catch {
      return false;
    }
  }
  await page.waitForTimeout(stoodUp ? 300 : 100);
  return true;
}

/**
 * Walk toward a world-space target using sub-run-speed input steps.
 *
 * Each step starts from the latest server self-snapshot, not from unconfirmed
 * local prediction. A dropped/rejected input is therefore retried instead of
 * accumulating into a client-only position. 0.62m / 130ms is about 4.8m/s:
 * below the 7m/s client run speed and the server's 11m/s ceiling.
 */
export async function walkTo(page, tx, tz, timeoutMs = 45000, stopAt = 1.0) {
  if (!await prepareWorldInput(page)) return false;
  const start = Date.now();
  let finalD = Infinity;

  while (Date.now() - start < timeoutMs) {
    finalD = await page.evaluate(([x, z, stop]) => {
      const nx = window.__nx;
      const confirmed = nx.hot.selfSnap ?? nx.hot.local;
      const dx = x - confirmed.x;
      const dz = z - confirmed.z;
      const distance = Math.hypot(dx, dz);
      nx.hot.camera.yaw = Math.atan2(-dx, -dz);
      if (distance <= stop) return distance;

      const step = Math.min(0.62, Math.max(0, distance - stop * 0.72));
      nx.hot.local.x = confirmed.x + (dx / distance) * step;
      nx.hot.local.y = confirmed.y;
      nx.hot.local.z = confirmed.z + (dz / distance) * step;
      nx.connection.sendInput(true);
      return distance;
    }, [tx, tz, stopAt]);
    if (finalD < stopAt) break;
    await page.waitForTimeout(130);
  }

  // Let a final server snapshot and at least one low-FPS interaction scan catch
  // up. SwiftShader can take several hundred milliseconds between frames after
  // a long route, so checking immediately can miss a perfectly reachable door.
  await page.waitForTimeout(900);
  finalD = await page.evaluate(([x, z]) => {
    const confirmed = window.__nx.hot.selfSnap ?? window.__nx.hot.local;
    return Math.hypot(x - confirmed.x, z - confirmed.z);
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
 * Follow the collision-valid route stored with the shared venue façade.
 * The compact crossroads has multiple pavement orientations, so inferring a route
 * from coordinate signs would recreate layout logic in the test harness.
 */
export async function walkToVenueDoor(page, venueKey) {
  if (!await spaceIs(page, 'plaza')) return false;
  const points = await page.evaluate((key) => {
    const nx = window.__nx;
    const venue = nx.cityMap.venues.find((candidate) => candidate.key === key);
    if (!venue) throw new Error(`Unknown street venue: ${key}`);
    if (!Array.isArray(venue.route) || venue.route.length === 0) {
      throw new Error(`Missing shared route for venue: ${key}`);
    }
    return venue.route.map(([x, z], index) => (
      index === venue.route.length - 1 ? [x, z, 8_000, 0.6] : [x, z]
    ));
  }, venueKey);
  return await walkRoute(page, points) && await spaceIs(page, 'plaza');
}

/** Reverse a venue's shared spawn route after returning through its street door. */
export async function walkFromVenueDoorToSpawn(page, venueKey) {
  // The switch-space fade resolves before the first outdoor frame is rendered.
  // Give the new layout/target list one stable frame before reversing its route.
  await page.waitForTimeout(900);
  if (!await spaceIs(page, 'plaza')) return false;
  const points = await page.evaluate((key) => {
    const venue = window.__nx.cityMap.venues.find((candidate) => candidate.key === key);
    if (!venue?.route?.length) throw new Error(`Missing shared route for venue: ${key}`);
    return [...venue.route].reverse();
  }, venueKey);
  // SwiftShader can spend several seconds compiling the outdoor scene again
  // after an interior exit. Keep using real input and authoritative snapshots,
  // but retry an interrupted leg once after input focus is re-established.
  // This does not teleport or relax collision checks: both attempts still use
  // walkTo and the shared route points.
  for (const [x, z] of points) {
    if (!await spaceIs(page, 'plaza')) return false;
    if (await walkTo(page, x, z, 24_000, 1)) continue;
    if (!await prepareWorldInput(page)) return false;
    await page.waitForTimeout(450);
    if (!await walkTo(page, x, z, 36_000, 1.2)) return false;
  }
  return spaceIs(page, 'plaza');
}

/** Reach and enter a street venue using only coordinates from `cityplan.ts`. */
export async function enterStreetVenue(page, venueKey) {
  if (!await spaceIs(page, 'plaza')) return false;
  if (!await walkToVenueDoor(page, venueKey)) return false;
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
  const sourceSpace = await page.evaluate(() => window.__nx?.world.getState().spaceKey ?? null);
  if (!sourceSpace || sourceSpace === 'plaza') return false;
  if (!await prepareWorldInput(page)) return false;
  const exit = await page.evaluate(() => {
    const nx = window.__nx;
    const currentSpace = nx.world.getState().spaceKey;
    const layout = nx.layouts[currentSpace];
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
    const confirmed = nx.hot.selfSnap ?? nx.hot.local;
    const route = [];
    if (currentSpace === 'cinema' && confirmed.z < 8.8) {
      // Cinema seat rows span three blocks with clear aisles centred at ±6.3m.
      // A player standing from any raked seat is released immediately in front
      // of that row; first move laterally along the row edge, then follow the
      // aisle to the rear concourse. This uses shared geometry coordinates and
      // normal input instead of attempting a collision-invalid diagonal.
      const aisleX = confirmed.x < 0 ? -6.3 : 6.3;
      const rowCentres = [-5.2, -2.65, -0.1, 2.45, 5.0, 7.55];
      const nearestRow = rowCentres.reduce(
        (best, rowZ) => Math.abs(rowZ - confirmed.z) < Math.abs(best - confirmed.z) ? rowZ : best,
        rowCentres[0],
      );
      const clearRowEdgeZ = Math.abs(nearestRow - confirmed.z) < 1.05
        ? nearestRow - 1.05
        : confirmed.z;
      if (Math.abs(clearRowEdgeZ - confirmed.z) > 0.12) {
        route.push([confirmed.x, clearRowEdgeZ, 12_000, 0.66]);
      }
      route.push([aisleX, clearRowEdgeZ, 18_000, 0.72]);
      route.push([aisleX, 11.65, 18_000, 0.8]);
      route.push([0, 11.65, 14_000, 0.8]);
    }
    return { label: door.label, inward, approach, route };
  });
  const reachedExit = await walkRoute(page, [
    ...exit.route,
    [exit.inward[0], exit.inward[1]],
    [exit.approach[0], exit.approach[1], 8_000, 0.6],
  ]);
  if (!reachedExit || !await spaceIs(page, sourceSpace)) return false;
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
  if (!await spaceIs(page, spaceKey)) return null;
  const target = await page.evaluate((key) => {
    const layout = window.__nx.layouts[key];
    if (!layout || window.__nx.world.getState().spaceKey !== key) return null;
    const seats = layout.interactables.filter((candidate) => candidate.kind === 'seat');
    if (seats.length === 0) return null;
    const highestY = Math.max(...seats.map((candidate) => candidate.pos[1]));
    const confirmed = window.__nx.hot.selfSnap ?? window.__nx.hot.local;
    const topSeats = seats
      .filter((candidate) => Math.abs(candidate.pos[1] - highestY) < 0.001)
      .sort((a, b) => Math.hypot(a.pos[0] - confirmed.x, a.pos[2] - confirmed.z)
        - Math.hypot(b.pos[0] - confirmed.x, b.pos[2] - confirmed.z));

    const clearance = 0.5;
    const pointIsClear = (x, z) => {
      if (x <= layout.bounds.minX + clearance || x >= layout.bounds.maxX - clearance
        || z <= layout.bounds.minZ + clearance || z >= layout.bounds.maxZ - clearance) return false;
      return !layout.colliders.some((collider) => {
        if (collider.kind === 'circle') {
          return Math.hypot(x - collider.x, z - collider.z) <= collider.r + clearance;
        }
        return Math.abs(x - collider.x) <= collider.w / 2 + clearance
          && Math.abs(z - collider.z) <= collider.d / 2 + clearance;
      });
    };
    const segmentIsClear = (from, to) => {
      const distance = Math.hypot(to.x - from.x, to.z - from.z);
      const steps = Math.max(1, Math.ceil(distance / 0.25));
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        if (!pointIsClear(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t)) return false;
      }
      return true;
    };
    const start = { x: confirmed.x, z: confirmed.z };
    const offsets = [[0, 2.25], [0, -2.25], [2.25, 0], [-2.25, 0]];
    for (const seat of topSeats) {
      const approaches = offsets
        .map(([dx, dz]) => ({ x: seat.pos[0] + dx, z: seat.pos[2] + dz }))
        .filter(({ x, z }) => pointIsClear(x, z))
        .sort((a, b) => Math.hypot(a.x - start.x, a.z - start.z) - Math.hypot(b.x - start.x, b.z - start.z));
      for (const approach of approaches) {
        if (segmentIsClear(start, approach)) {
          return {
            seat: { id: seat.id, x: seat.pos[0], y: seat.pos[1], z: seat.pos[2] },
            route: [[approach.x, approach.z, 16_000, 0.65]],
          };
        }
        // If the direct diagonal clips a row, try the two axis-aligned doglegs
        // and retain only a route proven clear against shared colliders.
        for (const via of [{ x: start.x, z: approach.z }, { x: approach.x, z: start.z }]) {
          if (pointIsClear(via.x, via.z)
            && segmentIsClear(start, via)
            && segmentIsClear(via, approach)) {
            return {
              seat: { id: seat.id, x: seat.pos[0], y: seat.pos[1], z: seat.pos[2] },
              route: [[via.x, via.z, 16_000, 0.8], [approach.x, approach.z, 16_000, 0.65]],
            };
          }
        }
      }
    }
    return null;
  }, spaceKey);
  if (!target) return null;

  const walked = await walkRoute(page, target.route);
  if (!walked || !await spaceIs(page, spaceKey)) {
    return { ...target.seat, walked: false, seated: false };
  }
  await page.evaluate((seatId) => {
    window.__nx.connection.send('sit', { seatId });
  }, target.seat.id);
  let seated = false;
  try {
    await page.waitForFunction(
      ({ id, y }) => {
        const local = window.__nx.hot.local;
        return local.seatId === id && Math.abs(local.y - y) < 0.03;
      },
      { id: target.seat.id, y: target.seat.y },
      { timeout: 5_000, polling: 100 },
    );
    seated = true;
  } catch {
    // The caller reports the authoritative assertion with useful actual values.
  }
  return { ...target.seat, walked: true, seated };
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
  const isInExpectedSpace = () => expectedSpace
    ? page.evaluate((space) => window.__nx.world.getState().spaceKey === space, expectedSpace)
    : Promise.resolve(false);

  const tryInteract = async () => {
    if (await isInExpectedSpace()) return true;
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
        return isInExpectedSpace();
      }
    } else {
      await page.waitForTimeout(settleMs);
    }
    return true;
  };

  if (!await prepareWorldInput(page)) return false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await isInExpectedSpace()) return true;
    if (await tryInteract()) return true;
    await walkTo(page, tx, tz, moveTimeoutMs, stopAt + attempt * 0.04);
    if (await tryInteract()) return true;
  }
  return false;
}

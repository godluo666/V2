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

// Match the product's shared PLAYER_RADIUS.  The route planner reads the
// current SpaceLayout from the browser, then keeps every segment outside those
// authoritative colliders.  It never mutates the space or player position.
const ROUTE_CLEARANCE = 0.34;
const ROUTE_GRID = 0.55;
const ROUTE_EPSILON = 1e-5;

const routeColliderPenetration = (collider, x, z) => {
  if (collider.kind === 'circle') {
    return Math.max(0, collider.r + ROUTE_CLEARANCE - Math.hypot(x - collider.x, z - collider.z));
  }
  const px = collider.w / 2 + ROUTE_CLEARANCE - Math.abs(x - collider.x);
  const pz = collider.d / 2 + ROUTE_CLEARANCE - Math.abs(z - collider.z);
  return px > 0 && pz > 0 ? Math.min(px, pz) : 0;
};

const routePointIsClear = (layout, x, z) => {
  const { bounds } = layout;
  if (x < bounds.minX + ROUTE_CLEARANCE || x > bounds.maxX - ROUTE_CLEARANCE
    || z < bounds.minZ + ROUTE_CLEARANCE || z > bounds.maxZ - ROUTE_CLEARANCE) return false;
  return !layout.colliders.some(
    (collider) => routeColliderPenetration(collider, x, z) > ROUTE_EPSILON,
  );
};

const routeSegmentIsClear = (layout, from, to) => {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.ceil(distance / 0.18));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    if (!routePointIsClear(
      layout,
      from.x + (to.x - from.x) * t,
      from.z + (to.z - from.z) * t,
    )) return false;
  }
  return true;
};

/**
 * A server-authoritative stand can begin exactly on a seat collider's expanded
 * edge (or a few floating-point millimetres inside it). Permit only a first
 * segment whose penetration into every starting collider never increases and
 * which touches no new collider before reaching clear floor.
 */
const routeSegmentEscapesStart = (layout, from, to) => {
  if (!routePointIsClear(layout, to.x, to.z)) return false;
  const startBlockers = layout.colliders
    .map((collider, index) => ({
      collider,
      index,
      penetration: routeColliderPenetration(collider, from.x, from.z),
    }))
    .filter(({ penetration }) => penetration > ROUTE_EPSILON);
  if (startBlockers.length === 0) return routeSegmentIsClear(layout, from, to);
  const blockerIndexes = new Set(startBlockers.map(({ index }) => index));
  const previous = new Map(startBlockers.map(({ index, penetration }) => [index, penetration]));
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.ceil(distance / 0.12));
  let escaped = false;

  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    for (let index = 0; index < layout.colliders.length; index++) {
      const penetration = routeColliderPenetration(layout.colliders[index], x, z);
      if (!blockerIndexes.has(index)) {
        if (penetration > ROUTE_EPSILON) return false;
        continue;
      }
      if (penetration > (previous.get(index) ?? 0) + ROUTE_EPSILON) return false;
      previous.set(index, penetration);
    }
    escaped = [...previous.values()].every((penetration) => penetration <= ROUTE_EPSILON);
    if (escaped && !routePointIsClear(layout, x, z)) return false;
  }
  return escaped;
};

/**
 * Plan a collision-valid polyline against the shared SpaceLayout.
 *
 * A* only supplies topology.  The returned line is visibility-simplified and
 * every retained segment is re-checked against the same shared colliders, so
 * callers still traverse it through normal, server-authoritative input.
 */
function planSharedLayoutRoute(layout, start, target) {
  const startIsClear = routePointIsClear(layout, start.x, start.z);
  if (!routePointIsClear(layout, target.x, target.z)) return null;
  if ((startIsClear && routeSegmentIsClear(layout, start, target))
    || (!startIsClear && routeSegmentEscapesStart(layout, start, target))) {
    return { points: [[target.x, target.z]], escapeFirst: !startIsClear };
  }

  const minX = layout.bounds.minX + ROUTE_CLEARANCE;
  const minZ = layout.bounds.minZ + ROUTE_CLEARANCE;
  const maxIx = Math.floor((layout.bounds.maxX - ROUTE_CLEARANCE - minX) / ROUTE_GRID);
  const maxIz = Math.floor((layout.bounds.maxZ - ROUTE_CLEARANCE - minZ) / ROUTE_GRID);
  const gridPoint = (ix, iz) => ({ x: minX + ix * ROUTE_GRID, z: minZ + iz * ROUTE_GRID });
  const gridKey = (ix, iz) => `${ix}:${iz}`;
  const nearestGrid = (point) => ({
    ix: Math.max(0, Math.min(maxIx, Math.round((point.x - minX) / ROUTE_GRID))),
    iz: Math.max(0, Math.min(maxIz, Math.round((point.z - minZ) / ROUTE_GRID))),
  });

  const aroundStart = nearestGrid(start);
  const candidates = [];
  for (let radius = 0; radius <= 5; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const ix = aroundStart.ix + dx;
        const iz = aroundStart.iz + dz;
        if (ix < 0 || ix > maxIx || iz < 0 || iz > maxIz) continue;
        const point = gridPoint(ix, iz);
        const reachesCandidate = startIsClear
          ? routeSegmentIsClear(layout, start, point)
          : routeSegmentEscapesStart(layout, start, point);
        if (routePointIsClear(layout, point.x, point.z) && reachesCandidate) {
          candidates.push({ ix, iz, point, distance: Math.hypot(point.x - start.x, point.z - start.z) });
        }
      }
    }
    if (candidates.length > 0) break;
  }
  candidates.sort((left, right) => left.distance - right.distance);
  const first = candidates[0];
  if (!first) return null;

  const firstKey = gridKey(first.ix, first.iz);
  const firstHeuristic = Math.hypot(target.x - first.point.x, target.z - first.point.z);
  const open = [{
    ix: first.ix,
    iz: first.iz,
    key: firstKey,
    g: first.distance,
    f: first.distance + firstHeuristic,
  }];
  const best = new Map([[firstKey, first.distance]]);
  const parent = new Map();
  const closed = new Set();
  let endKey = null;
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];

  for (let visited = 0; open.length > 0 && visited < 12_000; visited++) {
    let bestIndex = 0;
    for (let index = 1; index < open.length; index++) {
      if (open[index].f < open[bestIndex].f) bestIndex = index;
    }
    const current = open.splice(bestIndex, 1)[0];
    if (closed.has(current.key)) continue;
    closed.add(current.key);
    const currentPoint = gridPoint(current.ix, current.iz);
    if (routeSegmentIsClear(layout, currentPoint, target)) {
      endKey = current.key;
      break;
    }

    for (const [dx, dz] of directions) {
      const ix = current.ix + dx;
      const iz = current.iz + dz;
      if (ix < 0 || ix > maxIx || iz < 0 || iz > maxIz) continue;
      const nextPoint = gridPoint(ix, iz);
      if (!routePointIsClear(layout, nextPoint.x, nextPoint.z)
        || !routeSegmentIsClear(layout, currentPoint, nextPoint)) continue;
      const key = gridKey(ix, iz);
      if (closed.has(key)) continue;
      const stepCost = Math.hypot(dx, dz) * ROUTE_GRID;
      const g = current.g + stepCost;
      if (g >= (best.get(key) ?? Infinity)) continue;
      best.set(key, g);
      parent.set(key, current.key);
      const heuristic = Math.hypot(target.x - nextPoint.x, target.z - nextPoint.z);
      open.push({ ix, iz, key, g, f: g + heuristic });
    }
  }
  if (!endKey) return null;

  const gridPath = [];
  let cursor = endKey;
  while (cursor) {
    const [ix, iz] = cursor.split(':').map(Number);
    gridPath.push(gridPoint(ix, iz));
    cursor = parent.get(cursor) ?? null;
  }
  gridPath.reverse();
  const raw = [start, ...gridPath, target];
  const simplified = [];
  let anchor = 0;
  while (anchor < raw.length - 1) {
    let next = raw.length - 1;
    while (next > anchor + 1 && !routeSegmentIsClear(layout, raw[anchor], raw[next])) next--;
    simplified.push(raw[next]);
    anchor = next;
  }
  return {
    points: simplified.map(({ x, z }) => [x, z]),
    escapeFirst: !startIsClear,
  };
}

/**
 * Wait until the requested world is mounted and has produced browser frames.
 *
 * A canvas node alone is not evidence: during a space switch it can coexist
 * with the old scene, a full-screen loading layer, or a lost WebGL context.
 * This check remains read-only and observes the same scene/store used by the
 * player; it does not expose a product-side test bypass.
 */
export async function waitForRenderedWorld(page, expectedSpace, timeoutMs = 60_000) {
  const startedAt = Date.now();
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

    // A browser RAF can advance even when Three stopped drawing, so still
    // require a fresh R3F heartbeat after the requested named root is present.
    // One increment is sufficient: R3F renders the mounted scene after its
    // useFrame subscribers run. Requiring two increments inside a fixed 10s
    // window made a healthy SwiftShader scene fail whenever a single detailed
    // interior frame took longer than five seconds to compile and draw.
    const renderFrame = await page.evaluate(() => window.__nxRenderFrame ?? 0);
    const elapsedMs = Date.now() - startedAt;
    const heartbeatTimeoutMs = Math.max(30_000, timeoutMs - elapsedMs);
    await page.waitForFunction(
      (startFrame) => (window.__nxRenderFrame ?? 0) > startFrame,
      renderFrame,
      { timeout: heartbeatTimeoutMs, polling: 200 },
    );
    // Re-run the cheap critical checks after the slow frame. This prevents a
    // late space switch, fade, context loss, or error fallback from turning a
    // heartbeat belonging to a now-obscured canvas into valid evidence.
    return await page.evaluate((space) => {
      const nx = window.__nx;
      const canvas = document.querySelector('canvas');
      const scene = window.__nxScene;
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      return !!nx
        && nx.world.getState().spaceKey === space
        && !nx.ui.getState().fade
        && !!canvas
        && canvas.width >= 2
        && canvas.height >= 2
        && !!gl
        && !gl.isContextLost()
        && typeof scene?.getObjectByName === 'function'
        && !!scene.getObjectByName(`nx-space-${space}`);
    }, expectedSpace);
  } catch {
    return false;
  }
}

export async function prepareWorldInput(page) {
  await page.bringToFront();
  const standRequest = await page.evaluate(() => {
    const nx = window.__nx;
    nx.ui.getState().setHelpSeen();
    nx.ui.getState().closePanel();
    nx.ui.getState().setDialogue(null);
    nx.hot.chatFocused = false;
    nx.hot.uiOpen = false;
    nx.hot.keys.clear();
    if (nx.hot.local.seatId) {
      const beforeSnap = nx.hot.selfSnap;
      const seatId = nx.hot.local.seatId;
      // A one-frame Space key can be missed by a low-FPS cloud renderer.
      // This is the same protocol action LocalPlayer sends when movement starts.
      nx.connection.send('stand', {});
      return {
        stoodUp: true,
        seatId,
        beforeSnapAt: beforeSnap?.t ?? null,
        beforeSnapX: beforeSnap?.x ?? nx.hot.local.x,
        beforeSnapZ: beforeSnap?.z ?? nx.hot.local.z,
      };
    }
    return {
      stoodUp: false,
      seatId: null,
      beforeSnapAt: null,
      beforeSnapX: null,
      beforeSnapZ: null,
    };
  });
  if (standRequest.stoodUp) {
    try {
      await page.waitForFunction(
        ({ seatId, beforeSnapAt, beforeSnapX, beforeSnapZ }) => {
          const nx = window.__nx;
          const released = nx.hot.local.seatId == null
            && nx.world.getState().seats[seatId] !== nx.hot.selfId;
          const snap = nx.hot.selfSnap;
          const authoritativeStandArrived = snap != null
            && (beforeSnapAt == null || snap.t > beforeSnapAt)
            && Math.hypot(snap.x - beforeSnapX, snap.z - beforeSnapZ) > 0.2;
          return released && authoritativeStandArrived;
        },
        standRequest,
        { timeout: 8_000, polling: 100 },
      );
    } catch {
      return false;
    }
  }
  await page.waitForTimeout(standRequest.stoodUp ? 300 : 100);
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
  for (const [x, z, requestedTimeoutMs, stopAt = 1] of points) {
    // Route length, not renderer frame rate, determines the default budget.
    // A 19m shared street leg previously had the same 12s as a 2m leg and
    // expired halfway through when two SwiftShader browsers shared one runner.
    const timeoutMs = requestedTimeoutMs ?? await page.evaluate(([tx, tz, stop]) => {
      const nx = window.__nx;
      const confirmed = nx.hot.selfSnap ?? nx.hot.local;
      const distance = Math.max(0, Math.hypot(tx - confirmed.x, tz - confirmed.z) - stop);
      return Math.min(90_000, Math.max(12_000, Math.ceil(distance * 4_000) + 6_000));
    }, [x, z, stopAt]);
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
    return {
      label: door.label,
      inward,
      approach,
      start: { x: confirmed.x, z: confirmed.z },
      navigation: { bounds: layout.bounds, colliders: layout.colliders },
    };
  });
  const plannedRoute = planSharedLayoutRoute(
    exit.navigation,
    exit.start,
    { x: exit.inward[0], z: exit.inward[1] },
  );
  if (!plannedRoute) return false;
  const route = plannedRoute.points.map(([x, z], index) => (
    plannedRoute.escapeFirst && index === 0
      ? [x, z, 18_000, 0.03]
      : [x, z]
  ));
  // Keep the collision-planned leg and the short door leg separate.  The old
  // fixed 8s budget on the latter expired exactly at the cutoff after a costly
  // evidence screenshot, even though the player had already left the table and
  // the shared route itself was valid.  Both attempts below still advance only
  // through normal, server-authoritative input; a retry merely re-establishes
  // focus after the detailed interior has stalled Chromium's renderer.
  const reachedInnerApproach = await walkRoute(page, route);
  if (!reachedInnerApproach || !await spaceIs(page, sourceSpace)) return false;

  let reachedDoor = await walkTo(page, exit.approach[0], exit.approach[1], 24_000, 0.6);
  if (!reachedDoor) {
    if (!await prepareWorldInput(page)) return false;
    await page.waitForTimeout(450);
    reachedDoor = await walkTo(page, exit.approach[0], exit.approach[1], 36_000, 0.72);
  }
  if (!reachedDoor || !await spaceIs(page, sourceSpace)) return false;
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

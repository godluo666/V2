/**
 * Browser-journey movement helpers.
 *
 * Chromium throttles requestAnimationFrame on background pages. Multiplayer
 * journeys keep more than one page open, so every movement first foregrounds
 * its page. Driving the game's hot key set directly also prevents a focused
 * chat field or a late first-run help panel from swallowing synthetic keys.
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
  await page.evaluate(() => {
    const nx = window.__nx;
    nx.ui.getState().setHelpSeen();
    nx.ui.getState().closePanel();
    nx.ui.getState().setDialogue(null);
    nx.hot.chatFocused = false;
    nx.hot.uiOpen = false;
    nx.hot.keys.clear();
  });
  await page.waitForTimeout(100);
}

/** Walk toward a world-space target and sidestep if collision progress stalls. */
export async function walkTo(page, tx, tz, timeoutMs = 45000, stopAt = 1.0) {
  await prepareWorldInput(page);
  const start = Date.now();
  let lastD = Infinity;
  let finalD = Infinity;
  let stall = 0;
  let side = 'KeyA';
  let swaps = 0;

  try {
    await page.evaluate(() => {
      window.__nx.hot.keys.add('KeyW');
      window.__nx.hot.keys.add('ShiftLeft');
    });
    while (Date.now() - start < timeoutMs) {
      finalD = await page.evaluate(([x, z]) => {
        const nx = window.__nx;
        nx.hot.keys.add('KeyW');
        nx.hot.keys.add('ShiftLeft');
        const dx = x - nx.hot.local.x;
        const dz = z - nx.hot.local.z;
        nx.hot.camera.yaw = Math.atan2(-dx, -dz);
        return Math.hypot(dx, dz);
      }, [tx, tz]);
      if (finalD < stopAt) break;
      if (lastD - finalD < 0.05) {
        if (++stall > 6) {
          await page.evaluate((key) => window.__nx.hot.keys.add(key), side);
          await page.waitForTimeout(800);
          await page.evaluate((key) => window.__nx.hot.keys.delete(key), side);
          if (++swaps % 2 === 0) side = side === 'KeyA' ? 'KeyD' : 'KeyA';
          stall = 0;
        }
      } else {
        stall = 0;
      }
      lastD = finalD;
      await page.waitForTimeout(110);
    }
  } finally {
    await page.evaluate(() => {
      const keys = window.__nx.hot.keys;
      for (const key of ['KeyW', 'ShiftLeft', 'KeyA', 'KeyD']) keys.delete(key);
    });
  }
  await page.waitForTimeout(300);
  return finalD < stopAt;
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

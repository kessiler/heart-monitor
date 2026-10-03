import { test, expect } from '@playwright/test';

async function selectedRegion(page) {
  return page.locator('#preview').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (pixels[i] === 32 && pixels[i + 1] === 73 && pixels[i + 2] === 200) {
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
    }
    return { x: (left + right) / 2 / canvas.width, y: (top + bottom) / 2 / canvas.height,
      width: (right - left) / canvas.width, height: (bottom - top) / canvas.height };
  });
}

test('pending camera permission keeps a useful message across the watchdog and language switch', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
  });
  await page.goto('/');
  await page.locator('#start-camera').click();
  await expect(page.locator('#status')).toContainText(/permissão/i);
  await page.waitForTimeout(2100); // Beyond the 1.5 s stalled-frame watchdog.
  await expect(page.locator('#status')).toContainText(/permissão/i);
  await page.locator('#locale-toggle').click();
  await expect(page.locator('#status')).toContainText(/permission/i);
  await page.locator('#stop').click();
  await expect(page.locator('#stop')).toBeDisabled();
});

test('a click with a little pointer motion moves the region while preserving its size', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start-demo').click();
  await page.locator('#preview').scrollIntoViewIfNeeded();
  const canvas = await page.locator('#preview').boundingBox();
  const x = canvas.x + canvas.width * .75, y = canvas.y + canvas.height * .5;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 2, y + 2); await page.mouse.up();
  await expect.poll(async () => {
    const region = await selectedRegion(page);
    return region.x > .7 && region.width > .18;
  }).toBe(true);
  const region = await selectedRegion(page);
  expect(region.width).toBeGreaterThan(.18);
  expect(region.width).toBeLessThan(.22);
});

test('starting a region selection clears the previous estimate and cancelling restores the region', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start-demo').click();
  await expect(page.locator('#bpm')).toHaveText(/7[0-4]/, { timeout: 17000 });
  await page.locator('#preview').scrollIntoViewIfNeeded();
  const original = await selectedRegion(page);
  const canvas = await page.locator('#preview').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * .55, canvas.y + canvas.height * .4);
  await page.mouse.down();
  await expect(page.locator('#bpm')).toHaveText('—');
  await page.mouse.move(canvas.x + canvas.width * .8, canvas.y + canvas.height * .7);
  await page.locator('#preview').dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await selectedRegion(page)).x - original.x)).toBeLessThan(.005);
  const restored = await selectedRegion(page);
  expect(restored.width).toBeCloseTo(original.width, 2);
  expect(restored.height).toBeCloseTo(original.height, 2);
});

test('unchanged tracking status does not repeatedly announce the same text', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start-demo').click();
  await expect(page.locator('#bpm')).toHaveText(/7[0-4]/, { timeout: 17000 });
  await page.evaluate(() => {
    window.statusMutations = 0;
    const observer = new MutationObserver(records => { window.statusMutations += records.length; });
    observer.observe(document.getElementById('status'), { childList: true, characterData: true, subtree: true });
  });
  await page.waitForTimeout(1250); // Multiple estimate updates with the same status.
  expect(await page.evaluate(() => window.statusMutations)).toBe(0);
});

test('keyboard can enlarge and shrink the region without moving its center', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start-demo').click();
  await page.locator('#preview').focus();
  const original = await selectedRegion(page);
  await page.keyboard.press('+');
  await expect.poll(async () => (await selectedRegion(page)).width).toBeGreaterThan(original.width * 1.08);
  const expanded = await selectedRegion(page);
  expect(expanded.x).toBeCloseTo(original.x, 2);
  expect(expanded.y).toBeCloseTo(original.y, 2);
  await page.keyboard.press('-');
  await expect.poll(async () => Math.abs((await selectedRegion(page)).width - original.width)).toBeLessThan(.005);
});

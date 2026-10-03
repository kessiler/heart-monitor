import { test, expect } from '@playwright/test';

test('interactive processing steps update the diagram and remain translated after switching language', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.waitForTimeout(3800); // Capture the completed illustrative signal, after its entrance.
  await page.screenshot({ path: '.artifacts/design-desktop.png', fullPage: false });
  await page.locator('#process-extract').click();
  await expect(page.locator('#process-extract')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#process-observe')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#process-detail')).toHaveAttribute('data-step', 'extract');
  const portuguese = await page.locator('#process-detail-description').textContent();
  await page.locator('#locale-toggle').click();
  await expect(page.locator('#process-detail')).toHaveAttribute('data-step', 'extract');
  await expect(page.locator('#process-detail-description')).not.toHaveText(portuguese);
  await page.locator('#process-extract').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#process-analyze')).toBeFocused();
  await expect(page.locator('#process-analyze')).toHaveAttribute('aria-pressed', 'true');
});

test('animation pause is shared by both diagrams and keeps state when language changes', async ({ page }) => {
  await page.goto('/');
  await page.locator('#motion-toggle').click();
  await expect(page.locator('#motion-toggle')).toHaveAttribute('aria-pressed', 'true');
  const surfaces = page.locator('[data-motion-surface]');
  for (const surface of await surfaces.all()) {
    await expect(surface).toHaveAttribute('data-motion-state', 'paused');
  }
  await page.locator('#locale-toggle').click();
  await expect(page.locator('#motion-toggle')).toHaveAttribute('aria-pressed', 'true');
  const visibleLabel = await page.locator('#motion-label').textContent();
  const accessibleLabel = await page.locator('#motion-toggle').getAttribute('aria-label');
  expect(accessibleLabel.toLowerCase()).toContain(visibleLabel.toLowerCase());
  await page.locator('#motion-toggle').click();
  await expect(page.locator('#motion-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('system reduced motion stops illustration animation while processing remains usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#motion-toggle')).toBeDisabled();
  for (const surface of await page.locator('[data-motion-surface]').all()) {
    await expect(surface).toHaveAttribute('data-motion-state', 'reduced');
  }
  await page.locator('#start-demo').click();
  await expect(page.locator('#lab-panel')).toHaveAttribute('data-state', 'warming');
  await expect(page.locator('#bpm')).toHaveText(/7[0-4]/, { timeout: 17000 });
  await expect(page.locator('#lab-panel')).toHaveAttribute('data-state', 'tracking');
  await page.locator('#stop').click();
  await expect(page.locator('#lab-panel')).toHaveAttribute('data-state', 'stopped');
});

test('tablet charts stay tall enough to display axes and the full plot', async ({ page }) => {
  for (const width of [561, 801]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const chart of ['#signal-chart', '#spectrum-chart']) {
      const bounds = await page.locator(chart).boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(200);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

import { test, expect } from '@playwright/test';

test('synthetic source estimates known pulse through real Rust Wasm and stop clears it', async ({ page }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/');
  await expect(page.locator('#start-demo')).toBeEnabled();
  await page.locator('#start-demo').click();
  await expect(page.locator('#source-label')).toContainText(/72/);
  await expect(page.locator('#bpm')).toHaveText(/7[0-4]/, { timeout: 17000 });
  await page.locator('#stop').click();
  await expect(page.locator('#bpm')).toHaveText('—');
  await expect(page.locator('#stop')).toBeDisabled();
  expect(failures).toEqual([]);
});

test('English translation updates page, controls and runtime feedback', async ({ page }) => {
  await page.goto('/');
  await page.locator('#locale-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#start-camera')).toContainText(/camera/i);
  await page.locator('#start-demo').click();
  await expect(page.locator('#source-label')).toContainText(/synthetic/i);
  await page.locator('#stop').click();
  await expect(page.locator('#status')).toContainText(/stopped/i);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('camera denial gives useful feedback without leaving a capture session running', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('Denied', 'NotAllowedError'); } });
  });
  await page.goto('/');
  await page.locator('#start-camera').click();
  await expect(page.locator('#status')).toContainText(/bloquead|blocked/i);
  await expect(page.locator('#stop')).toBeDisabled();
});

test('responsive layout has no horizontal overflow at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#start-demo').click();
  await expect(page.locator('#source-label')).toContainText(/72/);
});

test('a camera session stops its real browser capture tracks', async ({ page }) => {
  await page.addInitScript(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      const stream = await getUserMedia(options);
      window.testStream = stream;
      return stream;
    };
  });
  await page.goto('/');
  await page.locator('#start-camera').click();
  await expect.poll(() => page.evaluate(() => window.testStream?.getVideoTracks()[0]?.readyState)).toBe('live');
  await page.locator('#stop').click();
  await expect.poll(() => page.evaluate(() => window.testStream.getVideoTracks()[0].readyState)).toBe('ended');
  expect(await page.locator('#video').evaluate(video => video.srcObject)).toBeNull();
});

test('stopping during camera permission closes the stream when it arrives', async ({ page }) => {
  await page.addInitScript(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      const stream = await getUserMedia(options);
      window.testStream = stream;
      await new Promise(resolve => { window.releasePermission = resolve; });
      return stream;
    };
  });
  await page.goto('/');
  await page.locator('#start-camera').click();
  await expect.poll(() => page.evaluate(() => typeof window.releasePermission)).toBe('function');
  await page.locator('#stop').click();
  await page.evaluate(() => window.releasePermission());
  await expect.poll(() => page.evaluate(() => window.testStream.getVideoTracks()[0].readyState)).toBe('ended');
  await expect(page.locator('#stop')).toBeDisabled();
});

test('four-frame-per-second optical alias is rejected instead of duplicated as thirty fps', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48;
      const context = canvas.getContext('2d');
      const beginning = performance.now();
      setInterval(() => {
        const green = 120 + 10 * Math.sin(2 * Math.PI * 3 * (performance.now() - beginning) / 1000);
        context.fillStyle = `rgb(100,${Math.round(green)},100)`; context.fillRect(0, 0, 64, 48);
      }, 16);
      return canvas.captureStream(4);
    };
  });
  await page.goto('/');
  await page.locator('#start-camera').click();
  await expect.poll(async () => Number(await page.locator('#progress').getAttribute('value')), { timeout: 16000 }).toBeGreaterThan(.8);
  await expect(page.locator('#bpm')).toHaveText('—');
  await expect(page.locator('#quality')).toHaveText('0%');
});

test('changing the analysis region clears a previous estimate and restarts collection', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start-demo').click();
  await expect(page.locator('#bpm')).toHaveText(/7[0-4]/, { timeout: 17000 });
  await page.locator('#preview').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#bpm')).toHaveText('—');
  expect(Number(await page.locator('#progress').getAttribute('value'))).toBeLessThan(.2);
});

test('a local recorded video plays from a blob URL and stop clears its resources', async ({ page }) => {
  await page.goto('/');
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48;
    const context = canvas.getContext('2d');
    context.fillStyle = '#9fbdcd'; context.fillRect(0, 0, 64, 48);
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const recording = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    const interval = setInterval(() => { context.fillRect(0, 0, 64, 48); }, 66);
    await new Promise(resolve => setTimeout(resolve, 1200));
    recorder.stop(); await recording;
    clearInterval(interval); stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()));
  });
  await page.locator('#video-file').setInputFiles({ name: 'local.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) });
  await expect(page.locator('#source-label')).toContainText(/local/i);
  await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThan(0);
  expect(await page.locator('#video').evaluate(video => video.currentSrc.startsWith('blob:'))).toBe(true);
  await page.locator('#stop').click();
  expect(await page.locator('#video').getAttribute('src')).toBeNull();
  await expect(page.locator('#stop')).toBeDisabled();
});

test('a stalled camera clears its estimate and keeps the explanation when switching language', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48;
      const context = canvas.getContext('2d');
      const beginning = performance.now();
      window.testFrameTimer = setInterval(() => {
        const green = 120 + 8 * Math.sin(2 * Math.PI * 1.2 * (performance.now() - beginning) / 1000);
        context.fillStyle = `rgb(100,${Math.round(green)},100)`; context.fillRect(0, 0, 64, 48);
      }, 33);
      return canvas.captureStream(30);
    };
  });
  await page.goto('/');
  await page.locator('#start-camera').click();
  await expect(page.locator('#bpm')).toHaveText(/7[0-4]/, { timeout: 17000 });
  await page.evaluate(() => clearInterval(window.testFrameTimer));
  await expect(page.locator('#bpm')).toHaveText('—');
  await expect(page.locator('#status')).toContainText(/deixou de fornecer quadros/);
  await page.locator('#locale-toggle').click();
  await expect(page.locator('#status')).toContainText(/stopped providing frames/);
});

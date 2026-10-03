import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceSession } from '../src/session.js';
import { normalizeRoi, pixelRoi, meanGreen } from '../src/sampling.js';

test('a camera permission response arriving after stop closes every track', () => {
  const session = new SourceSession();
  const token = session.begin();
  session.stop();
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] };
  assert.equal(session.attachStream(token, stream), false);
  assert.equal(stopped, 2);
  assert.equal(session.active, false);
});

test('switching sources closes the old camera and invalidates its callbacks', () => {
  const session = new SourceSession();
  const old = session.begin();
  let stopped = 0;
  session.attachStream(old, { getTracks: () => [{ stop: () => stopped++ }] });
  const next = session.begin();
  assert.equal(stopped, 1);
  assert.equal(session.current(old), false);
  assert.equal(session.current(next), true);
});

test('video object URLs are revoked once on stop or source replacement', () => {
  const released = [];
  const session = new SourceSession(url => released.push(url));
  const token = session.begin();
  session.attachUrl(token, 'blob:local-video');
  session.stop();
  session.stop();
  assert.deepEqual(released, ['blob:local-video']);
  assert.equal(session.attachUrl(token, 'blob:late'), false);
  assert.deepEqual(released, ['blob:local-video', 'blob:late']);
});

test('ROI selection normalizes reverse drag and clamps to frame bounds', () => {
  assert.deepEqual(normalizeRoi({ x: 1.2, y: .8 }, { x: -.2, y: .2 }), { x: 0, y: .2, width: 1, height: .6000000000000001 });
  assert.deepEqual(pixelRoi({ x: .9, y: .9, width: .4, height: .4 }, 100, 80), { x: 90, y: 72, width: 10, height: 8 });
});

test('mean green uses the original RGB channels without gain or alpha', () => {
  assert.equal(meanGreen(new Uint8ClampedArray([255, 10, 0, 255, 0, 30, 255, 0])), 20);
  assert.equal(meanGreen(new Uint8ClampedArray()), null);
});

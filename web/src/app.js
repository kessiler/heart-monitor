import './style.css';
import init, { Analyzer, Magnifier } from '../pkg/pulse_wasm.js';
import wasmUrl from '../pkg/pulse_wasm_bg.wasm?url';
import { t, applyLocale, getLocale, setLocale } from './i18n.js';
import { drawSignal, drawSpectrum } from './plots.js';
import { SourceSession } from './session.js';
import { DEFAULT_ROI, DEMO_ROI, normalizeRoi, pixelRoi, meanGreen } from './sampling.js';
import { drawDemo } from './demo.js';
import { initPresentation } from './presentation.js';

const element = id => document.getElementById(id);
const video = element('video');
const preview = element('preview');
const amplified = element('amplified');
const context = preview.getContext('2d', { willReadFrequently: true });
const roiCanvas = document.createElement('canvas');
const roiContext = roiCanvas.getContext('2d', { willReadFrequently: true });
const session = new SourceSession();
let analyzer;
let magnifier;
let source = '';
let roi = { ...DEFAULT_ROI };
let drag = null;
let raf = 0;
let videoFrame = 0;
let lastDecodedFrame = -1;
let lastFrameWall = 0;
let stalled = false;
let playbackStarted = false;
let sourceStart = 0;
let lastSample = -1;
let lastEstimate = -1;
let lastResult = [0, 0, 0, 0];
let statusKey = 'runtime.loading';
let statusValues = {};
let ready = false;
let presentation;

function updatePresentation() {
  presentation?.setExperimentState({ source, active: session.active, status: statusKey });
}

function status(key, values = {}) {
  statusKey = key;
  statusValues = values;
  element('status').removeAttribute('data-i18n');
  const message = t(key, values);
  if (element('status').textContent !== message) element('status').textContent = message;
  element('status').classList.toggle('error', /Denied|Missing|Busy|Unavailable|Error/.test(key));
  updatePresentation();
}
function controls() {
  element('start-camera').disabled = !ready || (source === 'Camera' && session.active && !playbackStarted);
  element('start-demo').disabled = !ready;
  element('video-file').disabled = !ready;
  element('stop').disabled = !session.active;
  element('roi-reset').disabled = !playbackStarted;
  preview.setAttribute('aria-disabled', String(!playbackStarted));
}
function sourceText() {
  element('source-label').removeAttribute('data-i18n');
  element('source-label').textContent = source ? t(`runtime.source${source}`) : t('source.none');
  preview.dataset.source = source;
  element('capture-placeholder').hidden = Boolean(source);
  updatePresentation();
}
function results() {
  const [bpm, quality, duration] = lastResult;
  element('bpm').textContent = bpm > 0 ? String(Math.round(bpm)) : '—';
  element('quality').removeAttribute('data-i18n');
  element('quality').textContent = `${Math.round(quality * 100)}%`;
  element('progress').value = Math.min(1, duration / 12);
  if (session.active && !stalled) {
    if (!playbackStarted) status(source === 'Camera' ? 'runtime.cameraRequest' : 'runtime.videoLoading');
    else if (drag) status('runtime.selecting');
    else if (duration < 8) status('runtime.warming', { seconds: Math.ceil(8 - duration) });
    else status(bpm > 0 ? 'runtime.tracking' : 'runtime.weak');
  }
}
function clearProcessing() {
  analyzer?.reset();
  magnifier?.reset();
  lastSample = -1;
  lastEstimate = -1;
  lastResult = [0, 0, 0, 0];
  results();
  element('signal-chart').dataset.durationSeconds = '12';
  drawSignal(element('signal-chart'), []);
  drawSpectrum(element('spectrum-chart'), [], 0);
  const output = amplified.getContext('2d');
  output.fillStyle = '#edf2fa'; output.fillRect(0, 0, amplified.width, amplified.height);
}
function idleFrame() {
  preview.width = 640; preview.height = 480;
  context.fillStyle = '#edf2fa'; context.fillRect(0, 0, 640, 480);
  context.strokeStyle = '#d5dfef'; context.lineWidth = 1;
  for (let x = 0; x < 640; x += 40) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 480); context.stroke(); }
  for (let y = 0; y < 480; y += 40) { context.beginPath(); context.moveTo(0, y); context.lineTo(640, y); context.stroke(); }
  context.strokeStyle = '#8ca6d5'; context.lineWidth = 3;
  context.beginPath(); context.ellipse(320, 240, 92, 125, 0, 0, Math.PI * 2); context.stroke();
  drawRoi();
}
function stop({ announce = true } = {}) {
  cancelAnimationFrame(raf);
  video.cancelVideoFrameCallback?.(videoFrame);
  session.stop();
  video.pause();
  video.srcObject = null;
  video.removeAttribute('src');
  video.load();
  source = '';
  drag = null;
  playbackStarted = false;
  stalled = false;
  clearProcessing();
  controls(); sourceText(); idleFrame();
  if (announce) status('runtime.stopped');
}
function begin(kind) {
  stop({ announce: false });
  const token = session.begin();
  source = kind;
  roi = { ...(kind === 'Demo' ? DEMO_ROI : DEFAULT_ROI) };
  sourceStart = performance.now() / 1000;
  lastDecodedFrame = -1;
  lastFrameWall = performance.now();
  stalled = false;
  controls(); sourceText();
  status(kind === 'Camera' ? 'runtime.cameraRequest' : kind === 'Video' ? 'runtime.videoLoading' : 'runtime.warming', { seconds: 8 });
  return token;
}
function cameraError(error) {
  return ({ NotAllowedError: 'runtime.cameraDenied', SecurityError: 'runtime.cameraDenied',
    NotFoundError: 'runtime.cameraMissing', NotReadableError: 'runtime.cameraBusy',
    OverconstrainedError: 'runtime.cameraMissing' })[error.name] || 'runtime.cameraUnavailable';
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    status('runtime.cameraUnavailable'); return;
  }
  const token = begin('Camera');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' } });
    if (!session.attachStream(token, stream)) return;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => {
        if (session.current(token)) { stop({ announce: false }); status('runtime.cameraBusy'); }
      }, { once: true });
    }
    video.srcObject = stream;
    await video.play();
    if (session.current(token)) {
      playbackStarted = true; lastFrameWall = performance.now(); controls(); loop(token);
    }
  } catch (error) {
    if (session.current(token)) { stop({ announce: false }); status(cameraError(error)); }
  }
}
function startDemo() {
  const token = begin('Demo');
  preview.width = 640; preview.height = 480;
  playbackStarted = true; controls();
  loop(token);
}
async function startVideo(file) {
  if (!file) return;
  const token = begin('Video');
  const url = URL.createObjectURL(file);
  if (!session.attachUrl(token, url)) return;
  video.src = url;
  try {
    await video.play();
    if (session.current(token)) {
      playbackStarted = true; lastFrameWall = performance.now(); controls(); loop(token);
    }
  } catch {
    if (session.current(token)) { stop({ announce: false }); status('runtime.videoError'); }
  }
}
function drawRoi() {
  const box = pixelRoi(roi, preview.width, preview.height);
  context.save();
  context.strokeStyle = '#2049c8'; context.lineWidth = 2;
  context.setLineDash(drag ? [6, 4] : []);
  context.strokeRect(box.x, box.y, box.width, box.height);
  context.fillStyle = 'rgba(32,73,200,.10)'; context.fillRect(box.x, box.y, box.width, box.height);
  context.restore();
}
function renderFrame(token, seconds) {
  if (!session.current(token)) return;
  lastFrameWall = performance.now();
  stalled = false;
  if (source === 'Demo' || video.readyState >= 2) {
    if (source === 'Demo') drawDemo(context, preview.width, preview.height, seconds);
    else {
      const width = Math.min(640, video.videoWidth);
      const height = Math.round(video.videoHeight * width / video.videoWidth);
      if (width > 0 && height > 0) {
        if (preview.width !== width || preview.height !== height) {
          preview.width = width; preview.height = height; clearProcessing();
        }
        context.drawImage(video, 0, 0, preview.width, preview.height);
      }
    }
    if (!drag && (lastSample < 0 || seconds - lastSample >= 1 / 35 || seconds < lastSample)) {
      const box = pixelRoi(roi, preview.width, preview.height);
      // Read pixels before drawing the selection overlay; visual gain never changes measurement.
      const sampleWidth = Math.min(96, box.width);
      const sampleHeight = Math.max(1, Math.round(box.height * sampleWidth / box.width));
      if (roiCanvas.width !== sampleWidth) roiCanvas.width = sampleWidth;
      if (roiCanvas.height !== sampleHeight) roiCanvas.height = sampleHeight;
      roiContext.drawImage(preview, box.x, box.y, box.width, box.height, 0, 0, roiCanvas.width, roiCanvas.height);
      const pixels = roiContext.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
      const green = meanGreen(pixels.data);
      if (green !== null) analyzer.push(seconds, green);
      const enhanced = magnifier.process(pixels.data, pixels.width, pixels.height, seconds, Number(element('gain').value));
      if (enhanced.length === pixels.data.length) {
        if (amplified.width !== pixels.width) amplified.width = pixels.width;
        if (amplified.height !== pixels.height) amplified.height = pixels.height;
        amplified.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(enhanced), pixels.width, pixels.height), 0, 0);
      }
      lastSample = seconds;
      if (lastEstimate < 0 || seconds - lastEstimate >= .5 || seconds < lastEstimate) {
        lastResult = Array.from(analyzer.estimate());
        lastEstimate = seconds;
        results();
        element('signal-chart').dataset.durationSeconds = String(lastResult[2] || 12);
        drawSignal(element('signal-chart'), analyzer.signal());
        drawSpectrum(element('spectrum-chart'), analyzer.spectrum(), lastResult[0]);
      }
    }
    drawRoi();
  }
}
function loop(token) {
  if (!session.current(token)) return;
  if (source === 'Demo') {
    renderFrame(token, performance.now() / 1000 - sourceStart);
    raf = requestAnimationFrame(() => loop(token));
  } else if (typeof video.requestVideoFrameCallback === 'function') {
    // Timestamp and sample exactly the frames presented by the decoder.
    videoFrame = video.requestVideoFrameCallback((_, metadata) => {
      renderFrame(token, metadata.mediaTime);
      loop(token);
    });
  } else if (typeof video.getVideoPlaybackQuality === 'function') {
    const quality = video.getVideoPlaybackQuality();
    const decoded = quality.totalVideoFrames - quality.droppedVideoFrames;
    if (decoded > 0 && decoded !== lastDecodedFrame) {
      lastDecodedFrame = decoded;
      renderFrame(token, video.currentTime);
    }
    raf = requestAnimationFrame(() => loop(token));
  } else {
    stop({ announce: false });
    status('runtime.videoTimingUnavailable');
  }
}
function pointerPoint(event) {
  const rect = preview.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
}
preview.addEventListener('pointerdown', event => {
  if (!playbackStarted || drag || event.button !== 0 || !event.isPrimary) return;
  preview.setPointerCapture(event.pointerId);
  drag = { pointerId: event.pointerId, start: pointerPoint(event), previous: { ...roi } };
  clearProcessing();
});
preview.addEventListener('pointermove', event => {
  if (drag?.pointerId === event.pointerId) roi = normalizeRoi(drag.start, pointerPoint(event));
});
function finishRoi(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const previous = drag.previous;
  const cancelled = event.type === 'pointercancel' || event.type === 'lostpointercapture';
  const selection = cancelled ? null : normalizeRoi(drag.start, pointerPoint(event));
  if (selection && selection.width >= .03 && selection.height >= .03) roi = selection;
  else if (selection) {
    const center = pointerPoint(event);
    roi = { ...previous, x: Math.min(1 - previous.width, Math.max(0, center.x - previous.width / 2)),
      y: Math.min(1 - previous.height, Math.max(0, center.y - previous.height / 2)) };
  } else roi = previous;
  drag = null;
  clearProcessing();
}
preview.addEventListener('pointerup', finishRoi);
preview.addEventListener('pointercancel', finishRoi);
preview.addEventListener('lostpointercapture', finishRoi);
preview.addEventListener('keydown', event => {
  const resize = ['+', '=', '-', '_'].includes(event.key);
  if (!playbackStarted || drag || event.ctrlKey || event.metaKey || event.altKey ||
    (!resize && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key))) return;
  event.preventDefault();
  if (resize) {
    const centerX = roi.x + roi.width / 2, centerY = roi.y + roi.height / 2;
    const desired = ['+', '='].includes(event.key) ? 1.12 : 1 / 1.12;
    const factor = Math.min(1 / roi.width, 1 / roi.height,
      Math.max(.03 / roi.width, .03 / roi.height, desired));
    roi.width *= factor; roi.height *= factor;
    roi.x = Math.min(1 - roi.width, Math.max(0, centerX - roi.width / 2));
    roi.y = Math.min(1 - roi.height, Math.max(0, centerY - roi.height / 2));
    clearProcessing();
    return;
  }
  const step = event.shiftKey ? .04 : .01;
  const x = roi.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0);
  const y = roi.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0);
  roi.x = Math.min(1 - roi.width, Math.max(0, x));
  roi.y = Math.min(1 - roi.height, Math.max(0, y));
  clearProcessing();
});
video.addEventListener('ended', () => { if (source === 'Video') stop(); });
video.addEventListener('error', () => { if (source === 'Video') { stop({ announce: false }); status('runtime.videoError'); } });
video.addEventListener('seeking', () => { if (source === 'Video') clearProcessing(); });
element('start-camera').addEventListener('click', startCamera);
element('start-demo').addEventListener('click', startDemo);
element('stop').addEventListener('click', () => stop());
element('video-file').addEventListener('change', event => {
  const file = event.target.files[0]; event.target.value = ''; startVideo(file);
});
element('roi-reset').addEventListener('click', () => {
  roi = { ...(source === 'Demo' ? DEMO_ROI : DEFAULT_ROI) }; clearProcessing();
});
element('gain').addEventListener('input', event => { element('gain-value').textContent = `${event.target.value}×`; });
element('locale-toggle').addEventListener('click', () => setLocale(getLocale() === 'pt' ? 'en' : 'pt'));
window.addEventListener('localechange', () => {
  sourceText(); status(statusKey, statusValues); results();
  element('signal-chart').dataset.durationSeconds = String(lastResult[2] || 12);
  drawSignal(element('signal-chart'), analyzer?.signal() || []);
  drawSpectrum(element('spectrum-chart'), analyzer?.spectrum() || [], lastResult[0]);
});
setInterval(() => {
  if (session.active && playbackStarted && source !== 'Demo' && !stalled && performance.now() - lastFrameWall > 1500) {
    clearProcessing();
    stalled = true;
    status('runtime.stalled');
  }
}, 500);
window.addEventListener('pagehide', () => stop());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session.active) stop();
});

presentation = initPresentation();
applyLocale(); controls(); idleFrame();
status('runtime.loading');
try {
  await init({ module_or_path: wasmUrl });
  analyzer = new Analyzer(); magnifier = new Magnifier();
  ready = true; clearProcessing(); controls(); sourceText(); status('runtime.ready');
} catch (error) {
  console.error('Could not initialize local processing:', error);
  status('runtime.buildError');
}

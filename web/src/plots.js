import { getLocale, t } from './i18n.js';

const colors = {
  background: '#f8fbff',
  grid: '#e1e8f2',
  axis: '#69788b',
  signal: '#2049c8',
  fill: 'rgba(32, 73, 200, 0.08)',
  peak: '#cf3151',
};
const sizes = new WeakMap();

function number(value, decimals = 1) {
  const magnitude = Math.abs(value);
  const scientific = magnitude !== 0 && (magnitude < 0.01 || magnitude >= 10000);
  return new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: decimals,
    notation: scientific ? 'scientific' : 'standard',
    useGrouping: false,
  }).format(Object.is(value, -0) ? 0 : value);
}

function prepare(canvas, spectrum = false) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const previous = sizes.get(canvas);
  const bounds = canvas.getBoundingClientRect?.();
  const width = Math.max(1, bounds?.width || canvas.clientWidth || previous?.width || canvas.width || 640);
  const height = Math.max(1, bounds?.height || canvas.clientHeight || previous?.height || canvas.height || 240);
  const screenRatio = globalThis.devicePixelRatio || 1;
  const ratio = Number.isFinite(screenRatio) && screenRatio > 0 ? screenRatio : 1;
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  sizes.set(canvas, { width, height });
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = colors.background;
  context.fillRect(0, 0, width, height);
  const fontFamily = typeof globalThis.getComputedStyle === 'function'
    ? globalThis.getComputedStyle(canvas).fontFamily
    : 'system-ui, sans-serif';
  context.font = `500 ${width < 400 ? 10 : 11}px ${fontFamily}`;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  const left = width < 400 ? 56 : 66;
  const top = spectrum ? 32 : 18;
  const right = Math.max(left + 1, width - 18);
  const bottom = Math.max(top + 1, height - 45);
  return { context, width, height, left, right, top, bottom, plotWidth: right - left, plotHeight: bottom - top };
}

function describe(canvas, description) {
  canvas.setAttribute?.('role', 'img');
  canvas.setAttribute?.('aria-label', description);
}

function line(context, x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function axes(plot, xTicks, yTicks, xLabel, yLabel) {
  const { context, left, right, top, bottom, width, height } = plot;
  context.lineWidth = 1;
  context.setLineDash([]);
  context.fillStyle = colors.axis;
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  for (const tick of xTicks) {
    context.strokeStyle = colors.grid;
    line(context, tick.position, top, tick.position, bottom);
    context.fillText(tick.label, tick.position, bottom + 14);
  }
  context.textAlign = 'right';
  for (const tick of yTicks) {
    context.strokeStyle = colors.grid;
    line(context, left, tick.position, right, tick.position);
    context.fillText(tick.label, left - 9, tick.position);
  }
  context.strokeStyle = '#bfccdf';
  line(context, left, top, left, bottom);
  line(context, left, bottom, right, bottom);
  context.textAlign = 'center';
  context.fillText(xLabel, (left + right) / 2, height - 9);
  context.save();
  context.translate(width < 400 ? 12 : 16, (top + bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(yLabel, 0, 0);
  context.restore();
}

function empty(plot, message) {
  const { context, left, right, top, bottom } = plot;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = colors.axis;
  context.fillText(message, (left + right) / 2, (top + bottom) / 2, right - left - 16);
}

function isSeries(values) {
  return values != null && Number.isSafeInteger(values.length) && values.length >= 0;
}

/** Draw equally spaced relative signal samples over the current analysis window.
 * Give the canvas CSS dimensions; data-duration-seconds overrides the 12 s window.
 */
export function drawSignal(canvas, signal) {
  const plot = prepare(canvas);
  if (!plot) return;
  const suppliedDuration = Number(canvas.dataset?.durationSeconds);
  const duration = Number.isFinite(suppliedDuration) && suppliedDuration > 0 ? suppliedDuration : 12;
  const values = isSeries(signal) ? signal : [];
  let amplitude = 0;
  let finiteCount = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) continue;
    amplitude = Math.max(amplitude, Math.abs(values[i]));
    finiteCount += 1;
  }
  const scale = amplitude || 1;
  const x = (seconds) => plot.left + (seconds / duration) * plot.plotWidth;
  const y = (value) => plot.top + plot.plotHeight / 2 - (value / scale) * plot.plotHeight / 2.24;
  const intervals = plot.width < 400 ? 3 : 4;
  const xTicks = Array.from({ length: intervals + 1 }, (_, i) => {
    const seconds = duration * (i / intervals);
    return { position: x(seconds), label: number(seconds) };
  });
  const yTicks = [-scale, 0, scale].map((value) => ({ position: y(value), label: number(value, 2) }));
  const xLabel = `${t('chart.time')} (${t('chart.seconds')})`;
  const yLabel = t('chart.relativeAmplitude');
  axes(plot, xTicks, yTicks, xLabel, yLabel);
  if (finiteCount < 2) {
    const message = t('chart.noSignal');
    describe(canvas, `${message}. ${xLabel}, ${yLabel}`);
    empty(plot, message);
    return;
  }
  describe(canvas, `${xLabel}, ${yLabel}`);
  const { context } = plot;
  context.strokeStyle = colors.signal;
  context.lineWidth = 1.8;
  context.beginPath();
  let connected = false;
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      connected = false;
      continue;
    }
    const px = plot.left + (i / (values.length - 1)) * plot.plotWidth;
    const py = y(values[i]);
    if (connected) context.lineTo(px, py);
    else context.moveTo(px, py);
    connected = true;
  }
  context.stroke();
}

function frequencyTicks(minimum, maximum, plot) {
  const desiredStep = (maximum - minimum) / (plot.width < 400 ? 3 : 6);
  const magnitude = 10 ** Math.floor(Math.log10(desiredStep));
  const multiplier = desiredStep / magnitude;
  const step = (multiplier <= 1 ? 1 : multiplier <= 2 ? 2 : multiplier <= 5 ? 5 : 10) * magnitude;
  const values = [minimum];
  for (let value = Math.ceil(minimum / step) * step; value < maximum; value += step) {
    if (value - values[values.length - 1] >= step * 0.45 && maximum - value >= step * 0.45) values.push(value);
  }
  values.push(maximum);
  return values.map((value) => ({
    position: plot.left + ((value - minimum) / (maximum - minimum)) * plot.plotWidth,
    label: number(value, 0),
  }));
}

/** Draw frequency-bpm/power pairs with an optional estimated peak. */
export function drawSpectrum(canvas, interleavedSpectrum, bpm) {
  const plot = prepare(canvas, true);
  if (!plot) return;
  const values = isSeries(interleavedSpectrum) ? interleavedSpectrum : [];
  const points = [];
  let maximumPower = 0;
  for (let i = 0; i + 1 < values.length; i += 2) {
    const frequency = values[i];
    const power = values[i + 1];
    if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(power) || power < 0) continue;
    points.push({ frequency, power });
    maximumPower = Math.max(maximumPower, power);
  }
  points.sort((a, b) => a.frequency - b.frequency);
  const minimum = Math.min(42, points[0]?.frequency ?? 42);
  const maximum = Math.max(180, points[points.length - 1]?.frequency ?? 180);
  const x = (frequency) => plot.left + ((frequency - minimum) / (maximum - minimum)) * plot.plotWidth;
  const y = (power) => plot.bottom - (power / (maximumPower || 1)) * plot.plotHeight * 0.94;
  const xLabel = `${t('chart.frequency')} (${t('chart.bpm')})`;
  const yLabel = t('chart.relativePower');
  axes(plot, frequencyTicks(minimum, maximum, plot), [0, 0.5, 1].map((power) => ({
    position: plot.bottom - power * plot.plotHeight * 0.94,
    label: number(power),
  })), xLabel, yLabel);
  if (points.length < 2 || maximumPower === 0) {
    const message = t('chart.noSpectrum');
    describe(canvas, `${message}. ${xLabel}, ${yLabel}`);
    empty(plot, message);
    return;
  }
  const { context } = plot;
  context.beginPath();
  context.moveTo(x(points[0].frequency), plot.bottom);
  for (const point of points) context.lineTo(x(point.frequency), y(point.power));
  context.lineTo(x(points[points.length - 1].frequency), plot.bottom);
  context.closePath();
  context.fillStyle = colors.fill;
  context.fill();
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(x(point.frequency), y(point.power));
    else context.lineTo(x(point.frequency), y(point.power));
  });
  context.strokeStyle = colors.signal;
  context.lineWidth = 1.8;
  context.stroke();
  const hasPeak = Number.isFinite(bpm) && bpm >= points[0].frequency && bpm <= points[points.length - 1].frequency;
  if (!hasPeak) {
    describe(canvas, `${xLabel}, ${yLabel}`);
    return;
  }
  const peak = points.reduce((nearest, point) => Math.abs(point.frequency - bpm) < Math.abs(nearest.frequency - bpm) ? point : nearest);
  context.strokeStyle = colors.peak;
  context.lineWidth = 1;
  context.setLineDash([4, 4]);
  line(context, x(bpm), plot.top, x(bpm), plot.bottom);
  context.setLineDash([]);
  context.fillStyle = colors.peak;
  context.beginPath();
  context.arc(x(bpm), y(peak.power), 3.5, 0, Math.PI * 2);
  context.fill();
  const label = `${t('chart.peak')} ${number(bpm)} ${t('chart.bpm')}`;
  const labelWidth = context.measureText(label).width;
  const labelX = Math.max(plot.left + labelWidth / 2, Math.min(plot.right - labelWidth / 2, x(bpm)));
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, labelX, 14, plot.plotWidth);
  describe(canvas, `${xLabel}, ${yLabel}. ${label}`);
}

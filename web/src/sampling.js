const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const DEFAULT_ROI = { x: .35, y: .18, width: .3, height: .16 };
export const DEMO_ROI = { x: .4, y: .25, width: .2, height: .13 };
export function normalizeRoi(start, end) {
  const x = clamp(Math.min(start.x, end.x), 0, 1);
  const y = clamp(Math.min(start.y, end.y), 0, 1);
  return { x, y, width: clamp(Math.max(start.x, end.x), 0, 1) - x,
    height: clamp(Math.max(start.y, end.y), 0, 1) - y };
}
export function pixelRoi(roi, width, height) {
  const x = clamp(Math.floor(roi.x * width), 0, width - 1);
  const y = clamp(Math.floor(roi.y * height), 0, height - 1);
  return { x, y, width: clamp(Math.round(roi.width * width), 1, width - x),
    height: clamp(Math.round(roi.height * height), 1, height - y) };
}
export function meanGreen(rgba) {
  if (!rgba.length || rgba.length % 4) return null;
  let sum = 0;
  for (let i = 1; i < rgba.length; i += 4) sum += rgba[i];
  return sum / (rgba.length / 4);
}

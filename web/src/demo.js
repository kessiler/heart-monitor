// An explicitly synthetic optical sample, not recorded human data.
// The neutral target has the same 1.2 Hz green-channel input as the original demo.
export function drawDemo(context, width, height, seconds) {
  const pulse = 3 * Math.sin(2 * Math.PI * 1.2 * seconds);
  context.fillStyle = '#edf1f4';
  context.fillRect(0, 0, width, height);
  context.save();
  context.scale(width / 640, height / 480);
  context.strokeStyle = '#d8dfe5';
  context.lineWidth = 1;
  for (let x = 32; x < 640; x += 32) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 480); context.stroke();
  }
  for (let y = 32; y < 480; y += 32) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(640, y); context.stroke();
  }
  context.fillStyle = '#f8fafb';
  context.fillRect(96, 56, 448, 368);
  context.strokeStyle = '#b7c3cd';
  context.strokeRect(96.5, 56.5, 447, 367);

  // The default synthetic ROI lies within the pixel field. Its cells vary with
  // the reference pulse; static grid lines and the neutral surround do not.
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 14; column += 1) {
      const base = 140 + (column * 3 + row * 7) % 19;
      context.fillStyle = `rgb(112,${Math.round(base + pulse)},139)`;
      context.fillRect(174 + column * 21, 92 + row * 21, 20, 20);
    }
  }
  context.strokeStyle = '#8c9ba8';
  context.beginPath();
  context.moveTo(174, 308); context.lineTo(467, 308);
  for (let x = 174; x <= 467; x += 42) {
    context.moveTo(x, 303); context.lineTo(x, 313);
  }
  context.stroke();
  context.fillStyle = '#d8dfe5';
  for (let index = 0; index < 8; index += 1) context.fillRect(174 + index * 39, 352, 20, 24);
  context.restore();
}

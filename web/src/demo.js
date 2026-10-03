// An explicitly synthetic optical sample, not recorded human data.
export function drawDemo(context, width, height, seconds) {
  const pulse = 3 * Math.sin(2 * Math.PI * 1.2 * seconds);
  context.fillStyle = '#edf2fa';
  context.fillRect(0, 0, width, height);
  context.save();
  context.scale(width / 640, height / 480);
  context.fillStyle = '#bacbe7';
  context.beginPath(); context.ellipse(320, 510, 170, 155, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = `rgb(205,${Math.round(153 + pulse)},127)`;
  context.fillRect(288, 326, 64, 80);
  context.beginPath(); context.ellipse(320, 223, 97, 135, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#283755';
  context.beginPath(); context.ellipse(320, 103, 88, 30, 0, Math.PI, 2 * Math.PI); context.fill();
  context.lineWidth = 3; context.strokeStyle = '#614e4e';
  for (const x of [283, 357]) { context.beginPath(); context.moveTo(x - 12, 224); context.lineTo(x + 12, 224); context.stroke(); }
  context.beginPath(); context.moveTo(315, 244); context.lineTo(308, 277); context.lineTo(326, 277); context.stroke();
  context.beginPath(); context.moveTo(294, 306); context.quadraticCurveTo(320, 321, 346, 306); context.stroke();
  context.restore();
}

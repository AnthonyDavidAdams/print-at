'use strict';
// QR as inline SVG (crisp for screen and print), pure-JS, no deps.
const qrcode = require('./vendor/qrcode.js');
function svg(text, { scale = 8, margin = 2, dark = '#1c3a57', light = 'transparent' } = {}) {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(); const size = (n + margin * 2) * scale;
  let rects = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c))
    rects += `<rect x="${(c + margin) * scale}" y="${(r + margin) * scale}" width="${scale}" height="${scale}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><g fill="${dark}">${rects}</g></svg>`;
}
module.exports = { svg };

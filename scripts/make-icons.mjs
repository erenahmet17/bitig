// public/favicon.svg dosyasından PWA simgelerini (PNG) üretir: node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync('public/favicon.svg', 'utf8');
const render = (src, size, out) => {
  const png = new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(out, png);
  console.log('yazıldı', out);
};

render(svg, 192, 'public/pwa-192.png');
render(svg, 512, 'public/pwa-512.png');

// Maskable: köşesiz düz arka plan + simge ortada %75 (Android'in kırpma payı için)
const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#4f5bd5"/>
  <g transform="translate(64 64) scale(0.75)">${inner}</g>
</svg>`;
render(maskable, 512, 'public/pwa-maskable-512.png');
render(maskable, 180, 'public/apple-touch-icon.png');

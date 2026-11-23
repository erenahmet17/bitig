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

// Maskable / iOS: köşeleri sistem yuvarlatır, bu yüzden zemin kenara kadar uzanır.
// Harf zaten ortadaki güvenli alanın (%80 çaplı daire) içinde kalıyor.
const maskable = svg.replace(/ rx="\d+"/, '');
render(maskable, 512, 'public/pwa-maskable-512.png');
render(maskable, 180, 'public/apple-touch-icon.png');

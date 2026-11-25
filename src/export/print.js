import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import Markdown from '../Markdown.jsx';
import { blobToDataURL } from '../utils.js';
import { formatDate } from './collect.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const PRINT_CSS = `
  @page { size: A4; margin: 16mm 15mm 18mm; }
  html, body { background: #fff !important; color: #1c1d21; }
  body { margin: 0; font-family: 'Inter Variable', Inter, system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ex-doc { max-width: 180mm; margin: 0 auto; }
  .ex-cover { border-bottom: 2px solid #4f5bd5; padding-bottom: 10px; margin-bottom: 18px; }
  .ex-crumb { font-size: 11px; color: #80848d; margin-bottom: 4px; }
  .ex-cover h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
  .ex-meta { font-size: 11.5px; color: #80848d; margin-top: 6px; }
  .ex-sec { margin: 26px 0 10px; letter-spacing: -0.01em; break-after: avoid; page-break-after: avoid; }
  h2.ex-sec { font-size: 20px; border-bottom: 1px solid #e4e3de; padding-bottom: 5px; }
  h3.ex-sec { font-size: 17px; }
  h4.ex-sec { font-size: 15px; }
  .ex-page { display: inline-block; margin: 14px 0 6px; padding: 2px 9px; border-radius: 99px; background: #eef0fd; color: #3f4ac0; font-size: 11.5px; font-weight: 600; break-after: avoid; page-break-after: avoid; }
  .ex-qa { margin: 10px 0 16px; }
  .ex-q { display: flex; gap: 8px; font-weight: 600; font-size: 14.5px; line-height: 1.5; break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
  .ex-num { color: #4f5bd5; min-width: 22px; }
  .ex-q-text { white-space: pre-wrap; word-break: break-word; flex: 1; }
  .ex-img { display: block; max-width: 100%; max-height: 110mm; margin-top: 8px; border: 1px solid #e4e3de; border-radius: 6px; }
  .ex-a { margin: 4px 0 0 30px; padding-left: 12px; border-left: 2px solid #e4e3de; }
  .ex-a .md { font-size: 13.5px; line-height: 1.6; }
  .ex-a .md > :first-child { margin-top: 2px; }
  .ex-a .md pre { white-space: pre-wrap; word-break: break-word; overflow: visible; break-inside: avoid; }
  .ex-a .md table { display: table; overflow: visible; break-inside: avoid; }
  .ex-a .md .katex-display { overflow: visible; }
  .ex-blank { margin: 6px 0 0 30px; height: 34mm; border: 1px dashed #d3d2cc; border-radius: 8px; }
  .ex-empty { color: #80848d; font-style: italic; }
`;

async function buildHtml(data, { answers }) {
  let n = 0;
  const parts = [];
  parts.push(
    `<header class="ex-cover">${data.path.length ? `<div class="ex-crumb">${esc(data.path.join(' › '))}</div>` : ''}<h1>${esc(data.title)}</h1>` +
      `<div class="ex-meta">${data.total} soru · ${answers ? 'Sorular ve cevaplar' : 'Sadece sorular'} · ${esc(formatDate())}</div></header>`
  );
  for (const s of data.sections) {
    if (s.depth > 0) {
      const h = 'h' + Math.min(s.depth + 1, 4);
      parts.push(`<${h} class="ex-sec">${esc(s.name)}</${h}>`);
    }
    for (const g of s.groups) {
      if (g.page) parts.push(`<div class="ex-page">Sayfa ${g.page}</div>`);
      for (const q of g.qas) {
        n++;
        const img = q.image ? `<img class="ex-img" src="${await blobToDataURL(q.image)}" alt="">` : '';
        const body = answers
          ? `<div class="ex-a">${q.answer?.trim() ? renderToStaticMarkup(createElement(Markdown, null, q.answer)) : '<p class="ex-empty">Cevap yok</p>'}</div>`
          : '<div class="ex-blank"></div>';
        parts.push(
          `<section class="ex-qa"><div class="ex-q"><span class="ex-num">${n}.</span><div class="ex-q-text">${esc(q.question)}${img}</div></div>${body}</section>`
        );
      }
    }
  }
  return parts.join('\n');
}

// Uygulamanın stillerini (markdown, kod renkleri, KaTeX) yazdırma belgesine taşı
function collectStyles() {
  return [...document.querySelectorAll('style, link[rel="stylesheet"]')]
    .map((el) => (el.tagName === 'STYLE' ? `<style>${el.textContent}</style>` : `<link rel="stylesheet" href="${el.href}">`))
    .join('\n');
}

// Gizli bir çerçevede belgeyi hazırlayıp tarayıcının yazdırma penceresini açar
// (hedef olarak "PDF olarak kaydet" seçilir). Formüller, tablolar ve kodlar ekrandaki gibi çıkar.
export async function exportPdf(data, opts) {
  const html = await buildHtml(data, opts);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(
    `<!doctype html><html lang="tr" data-theme="light"><head><meta charset="utf-8"><title>${esc(data.title)}</title>${collectStyles()}<style>${PRINT_CSS}</style></head>` +
      `<body><main class="ex-doc">${html}</main></body></html>`
  );
  doc.close();

  // Stiller, yazı tipleri ve görseller yüklensin (hiçbiri sonsuza kadar bekletmesin)
  const limit = (p, ms) => Promise.race([Promise.resolve(p).catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
  await limit(new Promise((r) => (doc.readyState === 'complete' ? r() : iframe.contentWindow.addEventListener('load', r, { once: true }))), 3000);
  await limit(
    Promise.all([...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => (l.sheet ? null : new Promise((r) => ((l.onload = r), (l.onerror = r)))))),
    5000
  );
  await limit(Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r)))))), 5000);
  await limit(doc.fonts?.ready, 3000);

  const win = iframe.contentWindow;
  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  win.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => iframe.isConnected && iframe.remove(), 10 * 60 * 1000);
  win.focus();
  win.print();
}

import TurndownService from 'turndown';
import { tables, strikethrough } from 'turndown-plugin-gfm';

// Yapay zekâ sitesinden metin seçilip kopyalanınca panoya düz metin + HTML gelir.
// Düz metinde kod bloğu (```), tablo ve formül işaretleri kaybolur; HTML'de ise durur.
// Bu yüzden HTML'i Markdown'a çeviriyoruz.

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  hr: '---',
  emDelimiter: '*',
});
td.use([tables, strikethrough]);

// Sitelerin arayüz parçaları (kopyala butonları, ikonlar vb.) metne karışmasın
td.remove(['button', 'svg', 'style', 'script', 'noscript', 'img']);

// Formüller (KaTeX): ekrandaki görüntü yerine içindeki LaTeX kaynağını al
td.addRule('katex', {
  filter: (node) => node.nodeName === 'SPAN' && node.classList.contains('katex'),
  replacement: (_content, node) => {
    const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
    if (!tex) return node.textContent;
    return node.closest('.katex-display') ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
  },
});

// MathML (bazı siteler) için yedek
td.addRule('mathml', {
  filter: (node) => node.nodeName.toLowerCase() === 'math' && !node.closest('.katex'),
  replacement: (_content, node) => {
    const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
    if (!tex) return node.textContent;
    return node.getAttribute('display') === 'block' ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
  },
});

// Kod blokları: sitelerin <pre> yapısı farklı (başlık, dil etiketi vb.), sadece kodu al
td.addRule('pre', {
  filter: 'pre',
  replacement: (_content, node) => {
    const code = node.querySelector('code') || node;
    const cls = (code.className || '') + ' ' + (node.className || '');
    const lang = (cls.match(/(?:language|lang)-([\w+#-]+)/) || [])[1] || '';
    const text = code.textContent.replace(/\n$/, '');
    const fence = text.includes('```') ? '~~~~' : '```';
    return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
  },
});

// Düz metin zaten Markdown ise (ör. sitenin "Kopyala" butonu kullanıldıysa) olduğu gibi bırak
function looksLikeMarkdown(text) {
  return /```|~~~|^\s{0,3}#{1,6}\s|\*\*[^*\n]+\*\*|^\s*\|.*\|\s*$|\$\$|\\\[|\\\(|\$[^$\s][^$\n]*\$/m.test(text);
}

export function clipboardToMarkdown(clipboardData) {
  const plain = clipboardData.getData('text/plain');
  const html = clipboardData.getData('text/html');
  if (!html || looksLikeMarkdown(plain)) return null; // tarayıcının normal yapıştırması

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const md = td
    .turndown(doc.body)
    .replace(/ /g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return md || null;
}

// Textarea'ya imlecin olduğu yere metin ekler (geri al / Ctrl+Z çalışmaya devam eder)
export function insertAtCursor(textarea, text) {
  textarea.focus();
  if (!document.execCommand('insertText', false, text)) {
    const { selectionStart: s, selectionEnd: e, value } = textarea;
    textarea.value = value.slice(0, s) + text + value.slice(e);
    textarea.selectionStart = textarea.selectionEnd = s + text.length;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function handleSmartPaste(e) {
  const md = clipboardToMarkdown(e.clipboardData);
  if (md == null) return;
  e.preventDefault();
  insertAtCursor(e.currentTarget, md);
}

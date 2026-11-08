import { htmlToMarkdown } from './paste.js';

// Bir yapay zekâ sohbetinin tamamı yapıştırıldığında mesajları (kim yazdı + içerik) çıkarır.
// 1) HTML'de sitelerin mesaj işaretleri aranır (ChatGPT, Claude, Gemini).
// 2) Bulunamazsa düz metindeki "You said:", "Soru:" gibi etiket satırları aranır.
// 3) O da yoksa kullanıcı blokları elle işaretler.

const SITES = [
  {
    name: 'ChatGPT',
    selector: '[data-message-author-role]',
    role: (el) => (el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant'),
  },
  {
    name: 'Claude',
    selector: '[data-testid="user-message"], .font-user-message, .font-claude-response, .font-claude-message, [data-testid="assistant-message"]',
    role: (el) => (el.matches('[data-testid="user-message"], .font-user-message') ? 'user' : 'assistant'),
  },
  {
    name: 'Gemini',
    selector: 'user-query, model-response, .user-query-container, .model-response-text',
    role: (el) => (el.matches('user-query, .user-query-container') ? 'user' : 'assistant'),
  },
];

// Ekran okuyucu etiketleri, butonlar vb. içerik değil
const NOISE = 'button, svg, .sr-only, .cdk-visually-hidden, .visually-hidden, [class*="screen-reader"], mat-icon, .avatar';

// Kullanıcı mesajı düz metin olarak alınır; satır atlamaları korunur
// (siteler bunları pre-wrap ile gösterir, Markdown dönüşümü yutar)
function plainText(el) {
  el.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  el.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, pre, blockquote').forEach((b) => b.append('\n'));
  return el.textContent
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fromHtml(html) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const site of SITES) {
    const all = [...doc.querySelectorAll(site.selector)];
    // İç içe eşleşmelerde en dıştakini al
    const els = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
    if (!els.length) continue;
    const messages = els
      .map((el) => {
        el.querySelectorAll(NOISE).forEach((n) => n.remove());
        const role = site.role(el);
        return { role, md: role === 'user' ? plainText(el) : htmlToMarkdown(el) };
      })
      .filter((m) => m.md);
    if (messages.length) return { source: site.name, messages };
  }
  return null;
}

// Sadece etiketten oluşan satırlar ("You said:", "ChatGPT said:", "Soru:", "Cevap" ...)
const USER_LINE = /^\s*(?:you said|şunu dedin|sen dedin|siz dedin|kullanıcı|user|human|soru|question|sen|siz|ben|q)\s*[:：]?\s*$/i;
const AI_LINE =
  /^\s*(?:chatgpt said|chatgpt dedi|chatgpt|claude said|claude|gemini said|gemini dedi|gemini|copilot said|copilot|assistant|asistan|yapay zek[âa]|ai|cevap|yanıt|answer|a)\s*[:：]?\s*$/i;
// Kısa etiketler (q, a, ai, ben, sen, siz) yanlış eşleşmesin diye iki nokta şart
const SHORT = /^\s*(?:q|a|ai|ben|sen|siz)\s*$/i;
// Aynı satırda içerikle: "Soru: ...", "Cevap: ..."
const USER_INLINE = /^\s*(?:soru|question|q|kullanıcı|user|you|ben)\s*[:：]\s*(\S.*)$/i;
const AI_INLINE = /^\s*(?:cevap|yanıt|answer|a|chatgpt|claude|gemini|asistan|assistant)\s*[:：]\s*(\S.*)$/i;

function fromText(text) {
  if (!text) return null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const messages = [];
  let cur = null;
  let labels = 0;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    let role = null;
    let rest = '';
    if (!inFence && !SHORT.test(line)) {
      if (USER_LINE.test(line)) role = 'user';
      else if (AI_LINE.test(line)) role = 'assistant';
      else if (USER_INLINE.test(line)) [role, rest] = ['user', line.match(USER_INLINE)[1]];
      else if (AI_INLINE.test(line)) [role, rest] = ['assistant', line.match(AI_INLINE)[1]];
    }
    if (role) {
      labels++;
      cur = { role, lines: rest ? [rest] : [] };
      messages.push(cur);
    } else if (cur) cur.lines.push(line);
    else if (line.trim()) {
      cur = { role: 'assistant', lines: [line] };
      messages.push(cur);
    }
  }
  if (labels < 2) return null;
  const out = messages.map((m) => ({ role: m.role, md: m.lines.join('\n').trim() })).filter((m) => m.md);
  return out.some((m) => m.role === 'user') ? { source: 'etiket', messages: out } : null;
}

export function splitChat({ html, text }) {
  return fromHtml(html) || fromText(text) || null;
}

// Mesajları soru-cevap çiftlerine çevirir: ardışık kullanıcı mesajları tek soru,
// arkasından gelen yapay zekâ mesajları tek cevap olur.
export function toPairs(messages) {
  const pairs = [];
  let cur = null;
  for (const m of messages) {
    if (m.role === 'user') {
      if (!cur || cur.answer) {
        cur = { question: m.md, answer: '' };
        pairs.push(cur);
      } else cur.question += '\n\n' + m.md;
    } else {
      if (!cur) {
        cur = { question: '', answer: m.md };
        pairs.push(cur);
      } else cur.answer = cur.answer ? cur.answer + '\n\n' + m.md : m.md;
    }
  }
  return pairs;
}

// Metni paragraf bloklarına böler (kod blokları ve $$ formülleri bölünmez)
export function splitBlocks(md) {
  const blocks = [];
  let buf = [];
  let fence = false;
  let math = false;
  const flush = () => {
    const t = buf.join('\n').trim();
    if (t) blocks.push(t);
    buf = [];
  };
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    else if (!fence && /^\s*\$\$\s*$/.test(line)) math = !math;
    if (!fence && !math && !line.trim()) flush();
    else buf.push(line);
  }
  flush();
  return blocks;
}

// Elle ayırma için: her blok { md, q } (q: soru bloğu mu)
export function messagesToBlocks(messages) {
  return messages.flatMap((m) => splitBlocks(m.md).map((md) => ({ md, q: m.role === 'user' })));
}

export function blocksToPairs(blocks) {
  const pairs = [];
  let cur = null;
  for (const b of blocks) {
    if (b.q) {
      if (!cur || cur.answer) {
        cur = { question: b.md, answer: '' };
        pairs.push(cur);
      } else cur.question += '\n\n' + b.md;
    } else if (!cur) {
      cur = { question: '', answer: b.md };
      pairs.push(cur);
    } else cur.answer = cur.answer ? cur.answer + '\n\n' + b.md : b.md;
  }
  return pairs;
}

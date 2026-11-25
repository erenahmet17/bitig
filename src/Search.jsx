import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search as SearchIcon, Folder, BookOpen, MessageCircleQuestion, StickyNote, CornerDownLeft, X } from 'lucide-react';
import { db, ROOT } from './db.js';

// Türkçe karakterlerden bağımsız arama: "ogrenme" yazınca "Öğrenme" de bulunur.
// Her karakter tek karaktere dönüştüğü için konumlar orijinal metinle aynı kalır.
const MAP = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export function norm(s) {
  let out = '';
  for (const ch of s) {
    let c = ch.toLocaleLowerCase('tr');
    if (c.length !== 1) c = ch.toLowerCase().length === 1 ? ch.toLowerCase() : ch;
    out += MAP[c] || c;
  }
  return out;
}

// Markdown işaretlerini atıp okunur düz metin çıkar (önizleme için)
function plain(md) {
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*/g, ' '))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|~]+/g, ' ')
    .replace(/\$+/g, '')
    .replace(/\\(?=[a-zA-Z])/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function snippet(text, words, len = 150) {
  const n = norm(text);
  let first = -1;
  for (const w of words) {
    const i = n.indexOf(w);
    if (i !== -1 && (first === -1 || i < first)) first = i;
  }
  if (first === -1) return text.slice(0, len);
  const start = Math.max(0, first - 50);
  const end = Math.min(text.length, start + len);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function Highlight({ text, words }) {
  const n = norm(text);
  const marks = [];
  for (const w of words) {
    if (!w) continue;
    let i = n.indexOf(w);
    while (i !== -1) {
      marks.push([i, i + w.length]);
      i = n.indexOf(w, i + w.length);
    }
  }
  if (!marks.length) return text;
  marks.sort((a, b) => a[0] - b[0]);
  const parts = [];
  let pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    if (s > pos) parts.push(text.slice(pos, s));
    parts.push(<mark key={s}>{text.slice(s, e)}</mark>);
    pos = e;
  }
  parts.push(text.slice(pos));
  return parts;
}

export default function SearchModal({ onClose, onGo }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const data = useLiveQuery(async () => {
    const [sections, qas, pdfs, notes] = await Promise.all([
      db.sections.toArray(),
      db.qas.toArray(),
      db.pdfs.toArray(),
      db.annotations.where('pdfId').notEqual('').filter((a) => a.type === 'note' && !!a.text).toArray(),
    ]);
    return { sections, qas, pdfs, notes };
  }, []);

  // Her kaydın aranabilir hâlini bir kez hazırla
  const index = useMemo(() => {
    if (!data) return null;
    const byId = new Map(data.sections.map((s) => [s.id, s]));
    const pathOf = (id) => {
      const p = [];
      let cur = byId.get(id);
      while (cur) {
        p.unshift(cur.name);
        cur = cur.parentId !== ROOT ? byId.get(cur.parentId) : null;
      }
      return p;
    };
    const pdfSection = new Map(data.pdfs.map((p) => [p.id, p.sectionId]));
    const items = [];
    for (const s of data.sections) {
      items.push({ kind: 'section', id: s.id, sectionId: s.id, title: s.name, nTitle: norm(s.name), body: '', nBody: '', path: pathOf(s.parentId), course: s.parentId === ROOT });
    }
    for (const qa of data.qas) {
      if (!byId.has(qa.sectionId)) continue;
      const title = qa.question || '(Görüntülü soru)';
      const body = plain(qa.answer || '');
      items.push({ kind: 'qa', id: qa.id, sectionId: qa.sectionId, page: qa.page, title, nTitle: norm(title), body, nBody: norm(body), path: pathOf(qa.sectionId) });
    }
    for (const a of data.notes) {
      const sid = pdfSection.get(a.pdfId);
      if (!sid || !byId.has(sid)) continue;
      items.push({ kind: 'note', id: a.id, sectionId: sid, page: a.page, title: a.text, nTitle: norm(a.text), body: '', nBody: '', path: pathOf(sid) });
    }
    return items;
  }, [data]);

  const words = useMemo(() => norm(q).split(/\s+/).filter(Boolean), [q]);

  const results = useMemo(() => {
    if (!index || !words.length) return [];
    const out = [];
    for (const it of index) {
      let score = 0;
      let ok = true;
      for (const w of words) {
        const inTitle = it.nTitle.includes(w);
        const inBody = it.nBody.includes(w);
        if (!inTitle && !inBody) {
          ok = false;
          break;
        }
        score += inTitle ? 3 : 1;
        if (inTitle && it.nTitle.startsWith(w)) score += 1;
      }
      if (ok) out.push({ ...it, score: score + (it.kind === 'section' ? 2 : 0) });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 60);
  }, [index, words]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    listRef.current?.querySelector('.sr-item.on')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (r) => {
    if (!r) return;
    onGo(r);
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === 'Escape') {
      onClose();
    }
    e.stopPropagation();
  };

  const icon = (r) =>
    r.kind === 'section' ? (
      r.course ? <BookOpen size={16} /> : <Folder size={16} />
    ) : r.kind === 'note' ? (
      <StickyNote size={16} />
    ) : (
      <MessageCircleQuestion size={16} />
    );

  return (
    <div className="modal-backdrop search-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-modal" role="dialog" aria-label="Arama" onKeyDown={onKeyDown}>
        <div className="search-input-row">
          <SearchIcon size={18} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Derslerde, sorularda, cevaplarda ve notlarda ara…" />
          {q && (
            <button className="icon-btn sm" title="Temizle" onClick={() => (setQ(''), inputRef.current?.focus())}>
              <X size={15} />
            </button>
          )}
        </div>
        <div className="search-results" ref={listRef}>
          {!words.length ? (
            <div className="search-empty">Aramak istediğin kelimeyi yaz. Türkçe karakter yazmasan da bulur (ör. “ogrenme”).</div>
          ) : results.length === 0 ? (
            <div className="search-empty">“{q}” için sonuç bulunamadı.</div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.kind + r.id}
                className={'sr-item' + (i === active ? ' on' : '')}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
              >
                <span className={'sr-icon ' + r.kind}>{icon(r)}</span>
                <span className="sr-text">
                  <span className="sr-title">
                    <Highlight text={r.kind === 'qa' || r.kind === 'note' ? snippet(r.title, words, 120) : r.title} words={words} />
                  </span>
                  {r.kind === 'qa' && r.body && words.some((w) => r.nBody.includes(w)) && (
                    <span className="sr-body">
                      <Highlight text={snippet(r.body, words)} words={words} />
                    </span>
                  )}
                  <span className="sr-path">
                    {r.kind === 'note' && 'Not · '}
                    {(r.kind === 'section' ? r.path : r.path).join(' › ') || (r.kind === 'section' ? 'Ders' : '')}
                    {r.page ? ` · Sayfa ${r.page}` : ''}
                  </span>
                </span>
                {i === active && <CornerDownLeft size={14} className="sr-enter" />}
              </button>
            ))
          )}
        </div>
        <div className="search-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> gezin
          </span>
          <span>
            <kbd>Enter</kbd> aç
          </span>
          <span>
            <kbd>Esc</kbd> kapat
          </span>
          {results.length > 0 && <span className="sr-count">{results.length} sonuç</span>}
        </div>
      </div>
    </div>
  );
}

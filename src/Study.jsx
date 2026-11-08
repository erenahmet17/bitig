import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, GraduationCap, Shuffle, RotateCcw, CircleCheck, Eye, Trophy, Repeat, FileText } from 'lucide-react';
import { db, setQAStatus } from './db.js';
import Markdown from './Markdown.jsx';

function useObjectURL(blob) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Başlangıç bölümü ve altındakiler, menüdeki sırayla; her biri için başlangıca göre yol
function sectionsInOrder(rootId, tree) {
  const out = [];
  const walk = (id, trail) => {
    out.push({ id, trail });
    for (const c of tree.children.get(id) || []) walk(c.id, [...trail, c.name]);
  };
  walk(rootId, []);
  return out;
}

const FILTERS = [
  { id: 'all', label: 'Tümü', test: () => true },
  { id: 'review', label: 'Tekrar bak', test: (q) => q.status === 'review' },
  { id: 'none', label: 'İşaretsiz', test: (q) => !q.status },
  { id: 'known', label: 'Anladım', test: (q) => q.status === 'known' },
];

export default function StudyMode({ section, tree, onClose }) {
  const order = useMemo(() => sectionsInOrder(section.id, tree), [section.id, tree]);
  const all = useLiveQuery(async () => {
    const ids = order.map((s) => s.id);
    const rows = await db.qas.where('sectionId').anyOf(ids).toArray();
    const pos = new Map(order.map((s, i) => [s.id, i]));
    const trail = new Map(order.map((s) => [s.id, s.trail]));
    rows.sort((a, b) => pos.get(a.sectionId) - pos.get(b.sectionId) || a.order - b.order);
    return rows.map((q) => ({ ...q, trail: trail.get(q.sectionId) }));
  }, [order]);

  const [filter, setFilter] = useState(() => localStorage.getItem('study-filter') || 'all');
  const [mixed, setMixed] = useState(() => localStorage.getItem('study-mixed') !== '0');
  // null: ayar ekranı; dizi: o anki tur
  const [deck, setDeck] = useState(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState([]); // { qa, ok }

  useEffect(() => {
    try {
      localStorage.setItem('study-filter', filter);
      localStorage.setItem('study-mixed', mixed ? '1' : '0');
    } catch {}
  }, [filter, mixed]);

  const counts = useMemo(() => {
    const m = {};
    for (const f of FILTERS) m[f.id] = (all || []).filter(f.test).length;
    return m;
  }, [all]);

  const start = (list) => {
    setDeck(mixed ? shuffle(list) : list);
    setIdx(0);
    setRevealed(false);
    setResults([]);
  };

  const done = deck && idx >= deck.length;
  const current = deck && !done ? deck[idx] : null;

  const answer = async (ok) => {
    if (!current) return;
    setResults((r) => [...r, { qa: current, ok }]);
    setIdx((i) => i + 1);
    setRevealed(false);
    await setQAStatus(current.id, ok ? 'known' : 'review');
  };

  // Klavye: Boşluk/Enter cevabı gösterir; 1/← bilemedim, 2/→ bildim; Esc kapatır
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (document.querySelector('.study .image-viewer')) return;
        onClose();
        return;
      }
      if (!current || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && (e.key === '1' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        answer(false);
      } else if (revealed && (e.key === '2' || e.key === 'ArrowRight')) {
        e.preventDefault();
        answer(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Arka plandaki sayfa kaymasın
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => (document.body.style.overflow = prev);
  }, []);

  return createPortal(
    <div className="study" role="dialog" aria-label="Çalışma modu">
      <div className="study-top">
        <span className="study-title">
          <GraduationCap size={18} /> {section.name}
        </span>
        {deck && !done && (
          <div className="study-progress" aria-label={`${idx + 1} / ${deck.length}`}>
            <div className="study-bar">
              <span style={{ width: `${(idx / deck.length) * 100}%` }} />
            </div>
            <span className="study-count">
              {idx + 1} / {deck.length}
            </span>
          </div>
        )}
        <button className="icon-btn" title="Kapat (Esc)" onClick={onClose}>
          <X size={19} />
        </button>
      </div>

      <div className="study-body">
        {!deck && all && (
          <Setup
            counts={counts}
            filter={filter}
            setFilter={setFilter}
            mixed={mixed}
            setMixed={setMixed}
            onStart={() => start(all.filter(FILTERS.find((f) => f.id === filter).test))}
          />
        )}
        {current && <Card key={current.id + ':' + idx} qa={current} revealed={revealed} onReveal={() => setRevealed(true)} onAnswer={answer} />}
        {done && (
          <Summary
            results={results}
            onRetryWrong={() => start(results.filter((r) => !r.ok).map((r) => r.qa))}
            onRestart={() => setDeck(null)}
            onClose={onClose}
          />
        )}
      </div>
    </div>,
    document.body
  );
}

function Setup({ counts, filter, setFilter, mixed, setMixed, onStart }) {
  const n = counts[filter];
  return (
    <div className="study-setup">
      <div className="study-setup-icon">
        <GraduationCap size={26} />
      </div>
      <h2>Kendini dene</h2>
      <p className="muted">
        Sorular tek tek gelir, cevap gizlidir. Bildiklerin <b className="t-known">Anladım</b>, bilemediklerin <b className="t-review">Tekrar bak</b> olarak
        işaretlenir.
      </p>
      <div className="study-label">Hangi sorular?</div>
      <div className="study-options">
        {FILTERS.map((f) => (
          <button key={f.id} className={'study-opt' + (filter === f.id ? ' on' : '') + ' f-' + f.id} onClick={() => setFilter(f.id)} disabled={!counts[f.id]}>
            {f.id === 'review' && <RotateCcw size={14} />}
            {f.id === 'known' && <CircleCheck size={14} />}
            {f.label}
            <span className="study-opt-n">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <label className="study-check">
        <input type="checkbox" checked={mixed} onChange={(e) => setMixed(e.target.checked)} />
        <Shuffle size={15} /> Karışık sıra
      </label>
      <button className="btn primary lg study-start" disabled={!n} onClick={onStart} autoFocus>
        {n ? `Başla · ${n} soru` : 'Bu seçimde soru yok'}
      </button>
    </div>
  );
}

function Card({ qa, revealed, onReveal, onAnswer }) {
  const imgUrl = useObjectURL(qa.image);
  const [zoomed, setZoomed] = useState(false);
  return (
    <div className="study-card-wrap">
      {(qa.trail?.length > 0 || qa.page) && (
        <div className="study-where">
          {qa.trail?.length > 0 && <span>{qa.trail.join(' › ')}</span>}
          {qa.page && (
            <span className="study-page">
              <FileText size={12} /> s. {qa.page}
            </span>
          )}
        </div>
      )}
      <div className="study-card">
        <div className="study-q">{qa.question}</div>
        {imgUrl && <img className="study-img" src={imgUrl} alt="Soruya eklenen görüntü" onClick={() => setZoomed(true)} />}
        {revealed ? (
          <div className="study-a">
            <Markdown>{qa.answer}</Markdown>
          </div>
        ) : (
          <button className="btn lg study-reveal" onClick={onReveal}>
            <Eye size={17} /> Cevabı göster <kbd>Boşluk</kbd>
          </button>
        )}
      </div>
      {revealed && (
        <div className="study-judge">
          <button className="btn lg judge-no" onClick={() => onAnswer(false)}>
            <RotateCcw size={17} /> Bilemedim <kbd>1</kbd>
          </button>
          <button className="btn lg judge-yes" onClick={() => onAnswer(true)}>
            <CircleCheck size={17} /> Bildim <kbd>2</kbd>
          </button>
        </div>
      )}
      {zoomed && imgUrl && (
        <div className="image-viewer" onClick={() => setZoomed(false)}>
          <img src={imgUrl} alt="" />
        </div>
      )}
    </div>
  );
}

function Summary({ results, onRetryWrong, onRestart, onClose }) {
  const ok = results.filter((r) => r.ok).length;
  const wrong = results.length - ok;
  const pct = results.length ? Math.round((ok / results.length) * 100) : 0;
  return (
    <div className="study-setup study-summary">
      <div className="study-setup-icon">
        <Trophy size={26} />
      </div>
      <h2>Tur bitti</h2>
      <div className="study-score">%{pct}</div>
      <div className="study-tally">
        <span className="t-known">
          <CircleCheck size={16} /> {ok} bildim
        </span>
        <span className="t-review">
          <RotateCcw size={16} /> {wrong} bilemedim
        </span>
      </div>
      {wrong > 0 && (
        <ul className="study-wrong">
          {results
            .filter((r) => !r.ok)
            .map((r, i) => (
              <li key={i}>{r.qa.question || '(Görüntülü soru)'}</li>
            ))}
        </ul>
      )}
      <div className="study-actions">
        {wrong > 0 && (
          <button className="btn primary lg" onClick={onRetryWrong} autoFocus>
            <Repeat size={17} /> Bilemediklerimi tekrar çalış
          </button>
        )}
        <button className="btn lg" onClick={onRestart}>
          Yeni tur
        </button>
        <button className="btn ghost lg" onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, GraduationCap, Shuffle, Clock, ListOrdered, RotateCcw, CircleCheck, Eye, Trophy, Repeat, FileText } from 'lucide-react';
import { db, setQAStatus } from './db.js';
import Markdown from './Markdown.jsx';
import { useObjectURL } from './utils.js';
import { useT } from './i18n.js';

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Akıllı sıra: hiç bakılmamışlar ve en uzun süredir çalışılmamışlar önce gelir.
// Aynı zamandaki (ör. hiç bakılmamış) sorularda "Tekrar bak" > işaretsiz > "Anladım" önceliği uygulanır.
const STATUS_RANK = { review: 0, known: 2 };
function sortSmart(list) {
  return [...list].sort((a, b) => {
    const ta = a.statusAt || 0;
    const tb = b.statusAt || 0;
    if (ta !== tb) return ta - tb;
    const ra = STATUS_RANK[a.status] ?? 1;
    const rb = STATUS_RANK[b.status] ?? 1;
    return ra - rb;
  });
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
  { id: 'all', labelKey: 'qa.status.all', test: () => true },
  { id: 'review', labelKey: 'qa.status.review', test: (q) => q.status === 'review' },
  { id: 'none', labelKey: 'qa.status.none', test: (q) => !q.status },
  { id: 'known', labelKey: 'qa.status.known', test: (q) => q.status === 'known' },
];

const ORDERS = [
  { id: 'smart', icon: Clock, labelKey: 'study.order.smart', hintKey: 'study.order.smartHint' },
  { id: 'shuffle', icon: Shuffle, labelKey: 'study.order.shuffle', hintKey: 'study.order.shuffleHint' },
  { id: 'sequential', icon: ListOrdered, labelKey: 'study.order.sequential', hintKey: 'study.order.sequentialHint' },
];

function readInitialOrder() {
  try {
    const saved = localStorage.getItem('study-order');
    if (saved && ORDERS.some((o) => o.id === saved)) return saved;
    const legacy = localStorage.getItem('study-mixed');
    if (legacy === '0') return 'sequential';
    if (legacy === '1') return 'shuffle';
  } catch {}
  return 'smart';
}

export default function StudyMode({ section, tree, onClose }) {
  const { t } = useT();
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
  const [orderMode, setOrderMode] = useState(readInitialOrder);
  // null: ayar ekranı; dizi: o anki tur
  const [deck, setDeck] = useState(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState([]); // { qa, ok }

  useEffect(() => {
    try {
      localStorage.setItem('study-filter', filter);
      localStorage.setItem('study-order', orderMode);
    } catch {}
  }, [filter, orderMode]);

  const counts = useMemo(() => {
    const m = {};
    for (const f of FILTERS) m[f.id] = (all || []).filter(f.test).length;
    return m;
  }, [all]);

  // Kayıtlı filtrede bu bölüm için hiç soru yoksa otomatik "Tümü"ne düş
  const validFilter = FILTERS.some((f) => f.id === filter) ? filter : 'all';
  const activeFilter = all && !counts[validFilter] && counts.all > 0 ? 'all' : validFilter;

  const start = (list) => {
    const ordered = orderMode === 'shuffle' ? shuffle(list) : orderMode === 'smart' ? sortSmart(list) : [...list];
    setDeck(ordered);
    setIdx(0);
    setRevealed(false);
    setResults([]);
  };

  const done = deck && idx >= deck.length;
  const current = deck && !done ? deck[idx] : null;

  const answer = useCallback(
    async (ok) => {
      if (!current) return;
      setResults((r) => [...r, { qa: current, ok }]);
      setIdx((i) => i + 1);
      setRevealed(false);
      await setQAStatus(current.id, ok ? 'known' : 'review');
    },
    [current]
  );

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
  }, [current, revealed, answer, onClose]);

  // Arka plandaki sayfa kaymasın
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => (document.body.style.overflow = prev);
  }, []);

  return createPortal(
    <div className="study" role="dialog" aria-label={t('study.aria')}>
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
        <button className="icon-btn" title={t('study.closeTip')} onClick={onClose}>
          <X size={19} />
        </button>
      </div>

      <div className="study-body">
        {!deck && all && (
          <Setup
            counts={counts}
            filter={activeFilter}
            setFilter={setFilter}
            orderMode={orderMode}
            setOrderMode={setOrderMode}
            onStart={() => start(all.filter(FILTERS.find((f) => f.id === activeFilter).test))}
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

function Setup({ counts, filter, setFilter, orderMode, setOrderMode, onStart }) {
  const { t } = useT();
  const n = counts[filter];
  const curOrder = ORDERS.find((o) => o.id === orderMode) || ORDERS[0];
  return (
    <div className="study-setup">
      <div className="study-setup-icon">
        <GraduationCap size={26} />
      </div>
      <h2>{t('study.heading')}</h2>
      <p className="muted">
        {t('study.descBefore')}
        <b className="t-known">{t('qa.status.known')}</b>
        {t('study.descMid')}
        <b className="t-review">{t('qa.status.review')}</b>
        {t('study.descAfter')}
      </p>
      <div className="study-label">{t('study.whichQuestions')}</div>
      <div className="study-options">
        {FILTERS.map((f) => (
          <button key={f.id} className={'study-opt' + (filter === f.id ? ' on' : '') + ' f-' + f.id} onClick={() => setFilter(f.id)} disabled={!counts[f.id]}>
            {f.id === 'review' && <RotateCcw size={14} />}
            {f.id === 'known' && <CircleCheck size={14} />}
            {t(f.labelKey)}
            <span className="study-opt-n">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <div className="study-label">{t('study.orderLabel')}</div>
      <div className="study-order-seg">
        {ORDERS.map((o) => (
          <button key={o.id} type="button" className={'study-order-opt' + (orderMode === o.id ? ' on' : '')} onClick={() => setOrderMode(o.id)}>
            <o.icon size={14} /> {t(o.labelKey)}
          </button>
        ))}
      </div>
      <div className="study-order-hint muted small">{t(curOrder.hintKey)}</div>
      <button className="btn primary lg study-start" disabled={!n} onClick={onStart} autoFocus>
        {n ? t('study.startCount', { n }) : t('study.emptyChoice')}
      </button>
    </div>
  );
}

function Card({ qa, revealed, onReveal, onAnswer }) {
  const { t } = useT();
  const imgUrl = useObjectURL(qa.image);
  const [zoomed, setZoomed] = useState(false);
  return (
    <div className="study-card-wrap">
      {(qa.trail?.length > 0 || qa.page) && (
        <div className="study-where">
          {qa.trail?.length > 0 && <span>{qa.trail.join(' › ')}</span>}
          {qa.page && (
            <span className="study-page">
              <FileText size={12} /> {t('common.pageShort')} {qa.page}
            </span>
          )}
        </div>
      )}
      <div className="study-card">
        {qa.question && <div className="study-q">{qa.question}</div>}
        {imgUrl && <img className="study-img" src={imgUrl} alt={t('qa.imageAlt')} onClick={() => setZoomed(true)} />}
        {revealed ? (
          <div className="study-a">
            <Markdown>{qa.answer}</Markdown>
          </div>
        ) : (
          <button className="btn lg study-reveal" onClick={onReveal}>
            <Eye size={17} /> {t('study.reveal')} <kbd>{t('study.spaceKey')}</kbd>
          </button>
        )}
      </div>
      {revealed && (
        <div className="study-judge">
          <button className="btn lg judge-no" onClick={() => onAnswer(false)}>
            <RotateCcw size={17} /> {t('study.didntKnow')} <kbd>1</kbd>
          </button>
          <button className="btn lg judge-yes" onClick={() => onAnswer(true)}>
            <CircleCheck size={17} /> {t('study.knew')} <kbd>2</kbd>
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
  const { t, lang } = useT();
  const ok = results.filter((r) => r.ok).length;
  const wrong = results.length - ok;
  const pct = results.length ? Math.round((ok / results.length) * 100) : 0;
  return (
    <div className="study-setup study-summary">
      <div className="study-setup-icon">
        <Trophy size={26} />
      </div>
      <h2>{t('study.doneTitle')}</h2>
      <div className="study-score">{lang === 'tr' ? `%${pct}` : `${pct}%`}</div>
      <div className="study-tally">
        <span className="t-known">
          <CircleCheck size={16} /> {t('study.knewCount', { n: ok })}
        </span>
        <span className="t-review">
          <RotateCcw size={16} /> {t('study.wrongCount', { n: wrong })}
        </span>
      </div>
      {wrong > 0 && (
        <ul className="study-wrong">
          {results
            .filter((r) => !r.ok)
            .map((r, i) => (
              <li key={i}>{r.qa.question || t('common.imageQuestion')}</li>
            ))}
        </ul>
      )}
      <div className="study-actions">
        {wrong > 0 && (
          <button className="btn primary lg" onClick={onRetryWrong} autoFocus>
            <Repeat size={17} /> {t('study.retryWrong')}
          </button>
        )}
        <button className="btn lg" onClick={onRestart}>
          {t('study.newRound')}
        </button>
        <button className="btn ghost lg" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronRight,
  ChevronDown,
  BookOpen,
  Folder,
  FolderPlus,
  FolderInput,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  ArrowUp,
  ArrowDown,
  Sparkles,
  MessageCircleQuestion,
  ChevronsDownUp,
  ChevronsUpDown,
  X,
  FileUp,
  FileText,
  FileX,
  RefreshCw,
  Image as ImageIcon,
  RotateCcw,
  CircleCheck,
  GraduationCap,
  Download,
  GripVertical,
  MessagesSquare,
  Search,
} from 'lucide-react';
import ChatImport from './ChatImport.jsx';
import StudyMode from './Study.jsx';
import ExportDialog from './export/ExportDialog.jsx';
import AnalyzeDialog from './AnalyzeDialog.jsx';
import {
  db,
  ROOT,
  addSection,
  renameSection,
  addQA,
  updateQA,
  deleteQA,
  setSectionPdf,
  removeSectionPdf,
  restorePdfData,
  setQAStatus,
  reorderQA,
  moveQAToSection,
} from './db.js';
import { confirmDeleteSection } from './Sidebar.jsx';
import InlineInput from './InlineInput.jsx';
import Markdown from './Markdown.jsx';
import { handleSmartPaste, copyQuestionWithImage } from './paste.js';
import { confirmDanger, toast } from './ui.jsx';
import PdfViewer, { AI_TARGETS, buildPrompt } from './pdf/PdfViewer.jsx';
import { evictPdf } from './pdf/pdfjs.js';
import { useObjectURL } from './utils.js';
import { norm } from './Search.jsx';
import { useT } from './i18n.js';

function countAll(id, tree, countsMap) {
  let n = countsMap.get(id) || 0;
  for (const c of tree.children.get(id) || []) n += countAll(c.id, tree, countsMap);
  return n;
}

const readLS = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const writeLS = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

export default function SectionView({ section, path, subsections, tree, qaCounts, knownCounts, reviewCounts, onSelect, onExpand, focus }) {
  const { t } = useT();
  const qas = useLiveQuery(() => db.qas.where('sectionId').equals(section.id).sortBy('order'), [section.id]);
  // undefined: yükleniyor, null: PDF yok
  const pdf = useLiveQuery(async () => (await db.pdfs.where('sectionId').equals(section.id).first()) || null, [section.id]);
  const annotations = useLiveQuery(() => (pdf ? db.annotations.where('pdfId').equals(pdf.id).toArray() : []), [pdf?.id]) || [];
  const [renaming, setRenaming] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [studying, setStudying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef(null);

  const totalQas = useMemo(() => countAll(section.id, tree, qaCounts), [section.id, tree, qaCounts]);
  const totalKnown = useMemo(() => countAll(section.id, tree, knownCounts), [section.id, tree, knownCounts]);
  const totalReview = useMemo(() => countAll(section.id, tree, reviewCounts), [section.id, tree, reviewCounts]);

  const uploadPdf = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast(t('section.onlyPdf'), 'error');
      return;
    }
    const oldPdfId = pdf?.id;
    if (pdf?.data) {
      const ok = await confirmDanger({
        title: t('section.replacePdfTitle'),
        message: t('section.replacePdfMsg'),
        confirmLabel: t('section.replacePdfBtn'),
      });
      if (!ok) return;
    }
    if (pdf && !pdf.data) await restorePdfData(pdf.id, file);
    else {
      await setSectionPdf(section.id, file);
      evictPdf(oldPdfId);
    }
    toast(t('section.pdfAdded'));
  };

  const removePdf = async () => {
    const ok = await confirmDanger({
      title: t('section.removePdfTitle'),
      message: t('section.removePdfMsg'),
      confirmLabel: t('section.removePdfBtn'),
    });
    if (ok) {
      const oldPdfId = pdf?.id;
      await removeSectionPdf(section.id);
      evictPdf(oldPdfId);
      toast(t('section.pdfRemoved'));
    }
  };

  const dropProps = {
    onDragOver: (e) => {
      if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) {
        e.preventDefault();
        setDragOver(true);
      }
    },
    onDragLeave: (e) => e.currentTarget === e.target && setDragOver(false),
    onDrop: (e) => {
      e.preventDefault();
      setDragOver(false);
      uploadPdf(e.dataTransfer.files?.[0]);
    },
  };

  const pdfMode = !!pdf;
  const knownPct = totalQas ? Math.round((totalKnown / totalQas) * 100) : 0;
  const reviewPct = totalQas ? Math.round((totalReview / totalQas) * 100) : 0;

  const head = (
    <div className="page-head">
      {path.length > 1 && (
        <nav className="breadcrumb">
          {path.map((p, i) => (
            <span key={p.id} className="crumb">
              {i > 0 && <ChevronRight size={13} className="sep" />}
              {i < path.length - 1 ? <button onClick={() => onSelect(p.id)}>{p.name}</button> : <span>{p.name}</span>}
            </span>
          ))}
        </nav>
      )}
      <header className="section-head">
        {renaming ? (
          <InlineInput
            initial={section.name}
            onSubmit={async (n) => {
              setRenaming(false);
              await renameSection(section.id, n);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <h1 onDoubleClick={() => setRenaming(true)}>{section.name}</h1>
        )}
        <div className="head-actions">
          {pdfMode ? (
            <>
              <span className="pdf-chip" title={pdf.name}>
                <FileText size={14} /> <span className="pdf-chip-name">{pdf.name}</span>
              </span>
              <button className="icon-btn" title={t('section.replacePdfTip')} onClick={() => fileRef.current?.click()}>
                <RefreshCw size={16} />
              </button>
              <button className="icon-btn danger" title={t('section.removePdfTip')} onClick={removePdf}>
                <FileX size={17} />
              </button>
              <span className="tb-sep" />
            </>
          ) : (
            pdf === null && (
              <button className="btn ghost sm" onClick={() => fileRef.current?.click()}>
                <FileUp size={15} /> {t('section.addPdf')}
              </button>
            )
          )}
          {totalQas > 0 && (
            <button className="btn ghost sm study-btn" title={t('section.studyTip')} onClick={() => setStudying(true)}>
              <GraduationCap size={15} /> {t('section.study')}
            </button>
          )}
          {totalQas > 0 && (
            <button className="btn ghost sm" title={t('section.analyzeTip')} onClick={() => setAnalyzing(true)}>
              <Sparkles size={15} /> {t('section.analyze')}
            </button>
          )}
          {totalQas > 0 && (
            <button className="icon-btn" title={t('section.exportTip')} onClick={() => setExporting(true)}>
              <Download size={17} />
            </button>
          )}
          <button className="icon-btn" title={t('common.rename')} onClick={() => setRenaming(true)}>
            <Pencil size={17} />
          </button>
          <button className="icon-btn danger" title={t('section.deleteTip')} onClick={() => confirmDeleteSection(section)}>
            <Trash2 size={17} />
          </button>
        </div>
      </header>
      {totalQas > 0 && (
        <div className="sec-progress-row">
          <div className="sec-progress-bar" aria-hidden="true">
            {totalKnown > 0 && <span className="sp-known" style={{ width: `${(totalKnown / totalQas) * 100}%` }} />}
            {totalReview > 0 && <span className="sp-review" style={{ width: `${(totalReview / totalQas) * 100}%` }} />}
          </div>
          <div className="sec-progress-text">
            <span className={totalKnown > 0 ? 'sp-t-known' : ''}>{t('section.progressKnown', { known: totalKnown, total: totalQas, pct: knownPct })}</span>
            {totalReview > 0 && (
              <>
                <span className="sp-dot">·</span>
                <span className="sp-t-review">{t('section.progressReview', { n: totalReview })}</span>
              </>
            )}
            {totalQas - totalKnown - totalReview > 0 && reviewPct + knownPct > 0 && (
              <>
                <span className="sp-dot">·</span>
                <span>{t('section.progressUnmarked', { n: totalQas - totalKnown - totalReview })}</span>
              </>
            )}
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          uploadPdf(f);
        }}
      />
      {studying && <StudyMode section={section} tree={tree} onClose={() => setStudying(false)} />}
      {analyzing && <AnalyzeDialog section={section} tree={tree} count={totalQas} onClose={() => setAnalyzing(false)} />}
      {exporting && <ExportDialog section={section} tree={tree} count={totalQas} onClose={() => setExporting(false)} />}
    </div>
  );

  const subsectionCards = (subsections.length > 0 || addingSub) && (
    <section className="block">
      <h2 className="block-title">{t('section.subsections')}</h2>
      <div className="sub-grid">
        {subsections.map((s) => {
          const n = countAll(s.id, tree, qaCounts);
          const kn = countAll(s.id, tree, knownCounts);
          const rev = countAll(s.id, tree, reviewCounts);
          const subs = (tree.children.get(s.id) || []).length;
          return (
            <button key={s.id} className="sub-card" onClick={() => onSelect(s.id)}>
              <span className="sub-icon">
                <Folder size={18} />
              </span>
              <span className="sub-text">
                <span className="sub-name">{s.name}</span>
                <span className="sub-meta">
                  {t('section.subMetaQ', { n })}
                  {subs ? t('section.subMetaSubs', { n: subs }) : ''}
                  {rev > 0 && <span className="sub-meta-review">{t('section.subMetaReview', { n: rev })}</span>}
                </span>
                {n > 0 && (kn > 0 || rev > 0) && (
                  <span className="sub-progress" aria-hidden="true">
                    {kn > 0 && <span className="sp-known" style={{ width: `${(kn / n) * 100}%` }} />}
                    {rev > 0 && <span className="sp-review" style={{ width: `${(rev / n) * 100}%` }} />}
                  </span>
                )}
              </span>
              <ChevronRight size={16} className="sub-arrow" />
            </button>
          );
        })}
        {addingSub && (
          <div className="sub-card editing">
            <span className="sub-icon">
              <Folder size={18} />
            </span>
            <InlineInput
              placeholder={t('sidebar.sectionPlaceholder')}
              onSubmit={async (n) => {
                setAddingSub(false);
                await addSection(section.id, n);
                onExpand(section.id);
              }}
              onCancel={() => setAddingSub(false)}
            />
          </div>
        )}
      </div>
    </section>
  );

  if (pdfMode) {
    return (
      <div className={'section-view pdf-mode' + (dragOver ? ' drag-over' : '')} {...dropProps}>
        {head}
        {subsections.length > 0 && (
          <div className="sub-chips">
            {subsections.map((s) => (
              <button key={s.id} className="sub-chip" onClick={() => onSelect(s.id)}>
                <Folder size={13} /> {s.name}
              </button>
            ))}
          </div>
        )}
        {pdf.data ? (
          <PdfWorkspace pdf={pdf} qas={qas || []} annotations={annotations} sectionId={section.id} tree={tree} focus={focus} />
        ) : (
          <div className="pdf-missing">
            <FileX size={28} />
            <div className="empty-title">{t('section.pdfMissingTitle', { name: pdf.name })}</div>
            <div className="empty-text">{t('section.pdfMissingText')}</div>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>
              <FileUp size={16} /> {t('section.selectPdf')}
            </button>
          </div>
        )}
        {dragOver && <DropOverlay />}
      </div>
    );
  }

  return (
    <div className={'section-view' + (dragOver ? ' drag-over' : '')} {...dropProps}>
      {head}
      {subsectionCards}
      <QAPanel
        sectionId={section.id}
        qas={qas}
        tree={tree}
        focus={focus}
        extraActions={
          !addingSub && (
            <button className="btn ghost sm" onClick={() => setAddingSub(true)}>
              <FolderPlus size={15} /> {t('section.addSubsection')}
            </button>
          )
        }
        emptyExtra={
          pdf === null && (
            <div className="pdf-hint">
              <FileUp size={15} /> {t('section.pdfHint')}
            </div>
          )
        }
      />
      {dragOver && <DropOverlay />}
    </div>
  );
}

function DropOverlay() {
  const { t } = useT();
  return (
    <div className="drop-overlay">
      <FileUp size={32} />
      <span>{t('section.dropPdf')}</span>
    </div>
  );
}

// ---------------- PDF + sorular yan yana ----------------
function PdfWorkspace({ pdf, qas, annotations, sectionId, tree, focus }) {
  const { t } = useT();
  const [page, setPageState] = useState(() => readLS('page:' + pdf.id, 1));
  const [split, setSplit] = useState(() => readLS('split', 0.6));
  const [askDraft, setAskDraft] = useState(null); // { question, key }
  const splitRef = useRef(null);

  // Aramadan bir sayfaya gidilmesi istendiyse
  useEffect(() => {
    if (focus?.page) setPage(focus.page);
  }, [focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPage = useCallback(
    (p) =>
      setPageState((cur) => {
        const next = typeof p === 'function' ? p(cur) : p;
        writeLS('page:' + pdf.id, next);
        return next;
      }),
    [pdf.id]
  );

  const pageBadges = useMemo(() => {
    const m = new Map();
    for (const q of qas) if (q.page) m.set(q.page, (m.get(q.page) || 0) + 1);
    return m;
  }, [qas]);

  const onAsk = async (text, target) => {
    const prompt = buildPrompt(text);
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {}
    const targetObj = AI_TARGETS.find((x) => x.id === target);
    if (targetObj) window.open(targetObj.url(prompt), '_blank', 'noopener');
    toast(targetObj ? t('qa.askCopiedOpen', { label: targetObj.label }) : t('qa.askCopied'));
    const short = text.length > 220 ? text.slice(0, 220) + '…' : text;
    setAskDraft({ question: t('qa.askQuestionTemplate', { text: short }), key: Date.now() });
  };

  // Seçilen alanın görüntüsüyle bu sayfaya yeni soru formu aç
  const onAttachImage = (blob) => {
    setAskDraft({ question: '', image: blob, key: Date.now() });
  };

  const startDrag = (e) => {
    e.preventDefault();
    const rect = splitRef.current.getBoundingClientRect();
    const move = (ev) => {
      const r = Math.min(0.78, Math.max(0.3, (ev.clientX - rect.left) / rect.width));
      setSplit(r);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      setSplit((r) => (writeLS('split', r), r));
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="split" ref={splitRef} style={{ gridTemplateColumns: `${split}fr 8px ${1 - split}fr` }}>
      <PdfViewer pdf={pdf} page={page} setPage={setPage} annotations={annotations} pageBadges={pageBadges} onAsk={onAsk} onAttachImage={onAttachImage} />
      <div className="splitter" onPointerDown={startDrag} title={t('section.splitterTip')} />
      <div className="qa-pane">
        <QAPanel
          sectionId={sectionId}
          qas={qas}
          tree={tree}
          pdfMode
          page={page}
          setPage={setPage}
          pageCount={pdf.pageCount}
          askDraft={askDraft}
          clearAskDraft={() => setAskDraft(null)}
          focus={focus}
        />
      </div>
    </div>
  );
}

// ---------------- Soru listesi (iki modda da kullanılır) ----------------
function QAPanel({ sectionId, qas, tree, pdfMode, page, setPage, pageCount, askDraft, clearAskDraft, extraActions, emptyExtra, focus }) {
  const { t } = useT();
  const [openIds, setOpenIds] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const [movingQa, setMovingQa] = useState(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState('page'); // pdf modunda: 'page' | 'all'
  const listRef = useRef(null);

  useEffect(() => {
    if (askDraft) {
      setFilter('page');
      setAdding(true);
    }
  }, [askDraft]);

  // Aramadan gelindiyse: soruyu aç, ekrana kaydır, kısa süre vurgula
  const handledFocus = useRef(null);
  useEffect(() => {
    if (!focus?.qaId || !qas || handledFocus.current === focus.key) return;
    const qa = qas.find((q) => q.id === focus.qaId);
    if (!qa) return;
    handledFocus.current = focus.key;
    if (pdfMode) setFilter(qa.page ? 'page' : 'all');
    setStatusFilter('all');
    setOpenIds((s) => new Set(s).add(qa.id));
    setTimeout(() => {
      const el = document.querySelector(`[data-qa="${qa.id}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1600);
    }, 120);
  }, [focus, qas, pdfMode]);

  const toggle = (id) =>
    setOpenIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Önce sayfa filtresi (PDF modunda), sonra durum filtresi
  const base = useMemo(() => {
    if (!qas) return null;
    if (!pdfMode || filter === 'all') return qas;
    return qas.filter((q) => q.page === page);
  }, [qas, pdfMode, filter, page]);

  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'review' | 'known' | 'none'
  const statusCounts = useMemo(() => {
    const c = { all: 0, review: 0, known: 0, none: 0 };
    for (const q of base || []) {
      c.all++;
      c[q.status === 'review' || q.status === 'known' ? q.status : 'none']++;
    }
    return c;
  }, [base]);

  const visible = useMemo(() => {
    if (!base) return null;
    if (statusFilter === 'all') return base;
    return base.filter((q) => (statusFilter === 'none' ? !q.status : q.status === statusFilter));
  }, [base, statusFilter]);

  // "Tümü" görünümünde sayfaya göre grupla
  const groups = useMemo(() => {
    if (!visible) return [];
    if (!pdfMode || filter === 'page') return [{ key: 'all', items: visible }];
    const m = new Map();
    for (const q of visible) {
      const k = q.page || 0;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(q);
    }
    return [...m.entries()].sort((a, b) => (a[0] || 1e9) - (b[0] || 1e9)).map(([k, items]) => ({ key: k, page: k, items }));
  }, [visible, pdfMode, filter]);

  // Sürükle-bırak ile sıralama (tek soru varsa bile kenar çubuğuna sürükleyip taşıyabilsin)
  const [dragId, setDragId] = useState(null);
  const [dropAt, setDropAt] = useState(null); // { id, after }
  const canMoveToOtherSection = tree.byId.size > 1;
  const canDrag = !editingId && ((visible?.length || 0) > 1 || canMoveToOtherSection);
  const dndFor = (qa) => ({
    dragging: dragId === qa.id,
    dropPos: dropAt?.id === qa.id ? (dropAt.after ? 'after' : 'before') : null,
    onHandleDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-qa', qa.id);
      const card = e.currentTarget.closest('.qa');
      if (card) e.dataTransfer.setDragImage(card, 24, 22);
      setTimeout(() => setDragId(qa.id), 0);
    },
    onDragEnd: () => {
      setDragId(null);
      setDropAt(null);
    },
    onDragOver: (e) => {
      if (!dragId || dragId === qa.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      if (dropAt?.id !== qa.id || dropAt.after !== after) setDropAt({ id: qa.id, after });
    },
    onDrop: async (e) => {
      e.preventDefault();
      const from = dragId;
      const r = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      setDragId(null);
      setDropAt(null);
      if (!from || from === qa.id) return;
      const src = qas.find((q) => q.id === from);
      // PDF "Tümü" görünümünde başka sayfanın grubuna bırakıldıysa sayfası da değişir
      const newPage = pdfMode && filter === 'all' && (src?.page || null) !== (qa.page || null) ? qa.page || null : undefined;
      await reorderQA(from, qa.id, after, newPage);
      if (newPage !== undefined) toast(newPage ? t('qa.movedToPage', { page: newPage }) : t('qa.pageCleared'));
    },
  });

  const allOpen = visible?.length > 0 && visible.every((q) => openIds.has(q.id));

  const startAdding = () => {
    setAdding(true);
    setTimeout(() => document.getElementById('qa-form-question')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const closeAdding = () => {
    setAdding(false);
    clearAskDraft?.();
  };

  const renderItem = (qa, i, list) =>
    editingId === qa.id ? (
      <QAForm
        key={qa.id}
        initial={qa}
        title={t('form.editTitle')}
        submitLabel={t('common.save')}
        showPage={pdfMode}
        defaultPage={qa.page}
        pageCount={pageCount}
        onSubmit={async (q, a, p, img) => {
          await updateQA(qa.id, q, a, pdfMode ? p : undefined, img);
          setEditingId(null);
          toast(t('common.saved'));
        }}
        onCancel={() => setEditingId(null)}
      />
    ) : (
      <QAItem
        key={qa.id}
        qa={qa}
        index={i + 1}
        isFirst={i === 0}
        isLast={i === list.length - 1}
        open={openIds.has(qa.id)}
        showPage={pdfMode && filter === 'all'}
        onJump={pdfMode && qa.page ? () => setPage(qa.page) : null}
        onToggle={() => toggle(qa.id)}
        onEdit={() => setEditingId(qa.id)}
        onMoveSection={canMoveToOtherSection ? () => setMovingQa(qa) : null}
        onDelete={async () => {
          if (await confirmDanger({ title: t('qa.deleteTitle'), message: t('sidebar.deleteIrreversible') })) {
            await deleteQA(qa.id);
            toast(t('common.deleted'));
          }
        }}
        onMove={(d) => {
          const target = list[i + d];
          if (target) reorderQA(qa.id, target.id, d > 0);
        }}
        onStatus={(s) => setQAStatus(qa.id, qa.status === s ? null : s)}
        dnd={canDrag ? dndFor(qa) : null}
      />
    );

  return (
    <section className="block qa-block" ref={listRef}>
      <div className="qa-toolbar">
        {pdfMode ? (
          <div className="seg big">
            <button className={filter === 'page' ? 'on' : ''} onClick={() => setFilter('page')}>
              {t('common.page')} {page}
              {qas && <span className="seg-count">{qas.filter((q) => q.page === page).length}</span>}
            </button>
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              {t('qa.all')}
              {qas && <span className="seg-count">{qas.length}</span>}
            </button>
          </div>
        ) : (
          <h2 className="block-title">
            {t('qa.questions')} {qas?.length > 0 && <span className="pill">{qas.length}</span>}
          </h2>
        )}
        <div className="toolbar-actions">
          {visible?.length > 1 && (
            <button
              className="btn ghost sm"
              title={allOpen ? t('qa.collapseAll') : t('qa.expandAll')}
              onClick={() => setOpenIds(allOpen ? new Set() : new Set(visible.map((q) => q.id)))}
            >
              {allOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
              {!pdfMode && (allOpen ? t('qa.collapseAll') : t('qa.expandAll'))}
            </button>
          )}
          {extraActions}
          <button className="btn ghost sm" title={t('qa.pasteChatTip')} onClick={() => setImporting(true)}>
            <MessagesSquare size={15} />
            {!pdfMode && t('qa.pasteChat')}
          </button>
          {!adding && (
            <button className="btn primary sm" onClick={startAdding}>
              <Plus size={15} /> {t('qa.add')}
            </button>
          )}
        </div>
      </div>

      {statusCounts.all > 0 && (
        <div className="status-filter">
          {[
            ['all', t('qa.status.all'), null],
            ['review', t('qa.status.review'), <RotateCcw key="r" size={13} />],
            ['known', t('qa.status.known'), <CircleCheck key="k" size={13} />],
            ['none', t('qa.status.none'), null],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              className={'sf-chip ' + id + (statusFilter === id ? ' on' : '')}
              onClick={() => setStatusFilter(id)}
              disabled={id !== 'all' && statusCounts[id] === 0 && statusFilter !== id}
            >
              {icon}
              {label}
              <span className="sf-count">{statusCounts[id]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="qa-list">
        {groups.map((g) => (
          <div key={g.key} className="qa-group">
            {g.page !== undefined && (
              <button className="group-head" onClick={() => g.page && setPage(g.page)} disabled={!g.page}>
                {g.page ? `${t('common.page')} ${g.page}` : t('qa.noPage')}
                <span className="pill">{g.items.length}</span>
              </button>
            )}
            {g.items.map((qa, i) => renderItem(qa, i, g.items))}
          </div>
        ))}
        {visible?.length === 0 && base?.length > 0 && (
          <div className="empty small-empty">
            <div className="empty-text">{t('qa.emptyFilter')}</div>
            <button className="btn sm" onClick={() => setStatusFilter('all')}>
              {t('qa.showAll')}
            </button>
          </div>
        )}
        {base?.length === 0 && !adding && (
          <div className="empty">
            <div className="empty-icon">
              <MessageCircleQuestion size={26} />
            </div>
            <div className="empty-title">
              {pdfMode && filter === 'page' ? t('qa.emptyPageTitle', { page }) : t('qa.emptySectionTitle')}
            </div>
            <div className="empty-text">{pdfMode ? t('qa.emptyPageText') : t('qa.emptySectionText')}</div>
            <button className="btn primary" onClick={startAdding}>
              <Plus size={16} /> {pdfMode && filter === 'page' ? t('qa.addToPage') : t('qa.addFirst')}
            </button>
            {emptyExtra}
          </div>
        )}
      </div>

      {adding && (
        <QAForm
          key={askDraft?.key || 'new'}
          keepOpen
          initial={askDraft ? { question: askDraft.question, image: askDraft.image } : null}
          focusAnswer={!!askDraft && !askDraft.image}
          title={t('form.newTitle')}
          submitLabel={t('form.addBtn')}
          showPage={pdfMode}
          defaultPage={page}
          pageCount={pageCount}
          onSubmit={async (q, a, p, img) => {
            await addQA(sectionId, q, a, pdfMode ? p : null, img);
            clearAskDraft?.();
          }}
          onCancel={closeAdding}
        />
      )}
      {importing && (
        <ChatImport sectionId={sectionId} pdfMode={pdfMode} defaultPage={pdfMode ? page : null} pageCount={pageCount} onClose={() => setImporting(false)} />
      )}
      {movingQa && <MoveQAModal qa={movingQa} currentSectionId={sectionId} tree={tree} onClose={() => setMovingQa(null)} />}
      {!adding && visible?.length > 0 && (
        <button className="add-qa-bottom" onClick={startAdding}>
          <Plus size={16} /> {pdfMode && filter === 'page' ? t('qa.addToPage') : t('qa.addBottom')}
        </button>
      )}
    </section>
  );
}

function QAItem({ qa, index, isFirst, isLast, open, showPage, onJump, onToggle, onEdit, onMoveSection, onDelete, onMove, onStatus, dnd }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const imgUrl = useObjectURL(open ? qa.image : null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(qa.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <article
      className={'qa' + (open ? ' open' : '') + (qa.status ? ' st-' + qa.status : '') + (dnd?.dragging ? ' dragging' : '') + (dnd?.dropPos ? ' drop-' + dnd.dropPos : '')}
      data-qa={qa.id}
      onDragOver={dnd?.onDragOver}
      onDrop={dnd?.onDrop}
    >
      {dnd && (
        <span className="qa-grip" draggable onDragStart={dnd.onHandleDragStart} onDragEnd={dnd.onDragEnd} title={t('qa.dragTip')}>
          <GripVertical size={14} />
        </span>
      )}
      <div className="qa-status" onClick={(e) => e.stopPropagation()}>
        <button
          className={'st-btn review' + (qa.status === 'review' ? ' on' : '')}
          title={qa.status === 'review' ? t('qa.removeReview') : t('qa.markReview')}
          onClick={() => onStatus('review')}
        >
          <RotateCcw size={14} />
        </button>
        <button
          className={'st-btn known' + (qa.status === 'known' ? ' on' : '')}
          title={qa.status === 'known' ? t('qa.removeKnown') : t('qa.markKnown')}
          onClick={() => onStatus('known')}
        >
          <CircleCheck size={15} />
        </button>
      </div>
      <button className="qa-question" onClick={onToggle} aria-expanded={open}>
        <span className="qa-num">{index}</span>
        <span className="qa-q-text">
          {qa.question || (!imgUrl && <span className="muted">{t('common.imageQuestion')}</span>)}
          {imgUrl && <img className="qa-image" src={imgUrl} alt={t('qa.imageAlt')} onClick={(e) => (e.stopPropagation(), setZoomed(true))} />}
        </span>
        {qa.image && !open && <ImageIcon size={16} className="qa-image-badge" aria-label={t('qa.imageBadgeLabel')} />}
        <ChevronDown size={18} className="qa-chev" />
      </button>
      {zoomed && imgUrl && (
        <div className="image-viewer" onClick={() => setZoomed(false)}>
          <img src={imgUrl} alt="" />
        </div>
      )}
      {open && (
        <div className="qa-answer">
          <div className="answer-avatar" aria-hidden="true">
            <Sparkles size={15} />
          </div>
          <div className="answer-body">
            <Markdown>{qa.answer}</Markdown>
            <div className="qa-actions">
              <button className="icon-btn sm" title={copied ? t('common.copied') : t('qa.copyAnswer')} onClick={copy}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              {qa.image && (
                <button
                  className="icon-btn sm"
                  title={qa.question ? t('qa.copyQAndImgTip') : t('qa.copyImgTip')}
                  onClick={async () => {
                    try {
                      await copyQuestionWithImage(qa.question, qa.image);
                      toast(qa.question ? t('qa.qAndImgCopied') : t('qa.imgCopied'));
                    } catch {
                      toast(t('common.copyError'), 'error');
                    }
                  }}
                >
                  <ImageIcon size={15} />
                </button>
              )}
              <button className="icon-btn sm" title={t('qa.edit')} onClick={onEdit}>
                <Pencil size={15} />
              </button>
              {onMoveSection && (
                <button className="icon-btn sm" title={t('qa.moveToSection')} onClick={onMoveSection}>
                  <FolderInput size={15} />
                </button>
              )}
              <button className="icon-btn sm" title={t('common.moveUp')} disabled={isFirst} onClick={() => onMove(-1)}>
                <ArrowUp size={15} />
              </button>
              <button className="icon-btn sm" title={t('common.moveDown')} disabled={isLast} onClick={() => onMove(1)}>
                <ArrowDown size={15} />
              </button>
              <button className="icon-btn sm danger" title={t('common.delete')} onClick={onDelete}>
                <Trash2 size={15} />
              </button>
              {onJump && (
                <button className="btn ghost sm page-jump" onClick={onJump} title={t('qa.jumpToPage')}>
                  <FileText size={14} /> {t('common.page')} {qa.page}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {showPage && !open && qa.page && (
        <span className="qa-page-tag">
          {t('common.pageShort')} {qa.page}
        </span>
      )}
    </article>
  );
}

// ---------------- Soruyu başka bölüme taşıma modalı ----------------
function MoveQAModal({ qa, currentSectionId, tree, onClose }) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const flat = useMemo(() => {
    const out = [];
    const walk = (parentId, depth, trail) => {
      for (const s of tree.children.get(parentId) || []) {
        const nextTrail = [...trail, s.name];
        out.push({ section: s, depth, trail: nextTrail, searchText: norm(nextTrail.join(' ')) });
        walk(s.id, depth + 1, nextTrail);
      }
    };
    walk(ROOT, 0, []);
    return out;
  }, [tree]);

  const words = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query]);
  const filtered = useMemo(() => {
    if (!words.length) return flat;
    return flat.filter((item) => words.every((w) => item.searchText.includes(w)));
  }, [flat, words]);

  const pick = async (target) => {
    if (target.id === currentSectionId) return;
    await moveQAToSection(qa.id, target.id);
    toast(t('sidebar.qaMoved', { target: target.name }));
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="export-modal move-qa-modal" role="dialog" aria-label={t('moveQa.title')}>
        <div className="export-head">
          <span className="modal-icon">
            <FolderInput size={19} />
          </span>
          <div>
            <h2>{t('moveQa.title')}</h2>
            <div className="muted small">{t('moveQa.subtitle')}</div>
          </div>
          <button className="icon-btn sm" onClick={onClose} title={t('common.close')}>
            <X size={17} />
          </button>
        </div>

        {flat.length > 6 && (
          <div className="move-qa-search">
            <Search size={15} />
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('moveQa.searchPlaceholder')} />
            {query && (
              <button className="icon-btn sm" onClick={() => setQuery('')} title={t('search.clear')}>
                <X size={14} />
              </button>
            )}
          </div>
        )}

        <div className="move-qa-list">
          {filtered.length === 0 ? (
            <div className="search-empty">{flat.length <= 1 ? t('moveQa.empty') : t('moveQa.noMatch')}</div>
          ) : (
            filtered.map(({ section: s, depth }) => {
              const isCur = s.id === currentSectionId;
              const Icon = depth === 0 ? BookOpen : Folder;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={'move-qa-item' + (isCur ? ' current' : '')}
                  style={{ paddingLeft: `${12 + (words.length ? 0 : depth * 18)}px` }}
                  disabled={isCur}
                  onClick={() => pick(s)}
                >
                  <Icon size={15} className="move-qa-icon" />
                  <span className="move-qa-name">{s.name}</span>
                  {isCur && <span className="pill">{t('moveQa.current')}</span>}
                </button>
              );
            })
          )}
        </div>

        {qa.page && <div className="export-hint">{t('moveQa.pageNote')}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function QAForm({ initial, title, submitLabel, onSubmit, onCancel, keepOpen, showPage, defaultPage, pageCount, focusAnswer }) {
  const { t } = useT();
  const [question, setQuestion] = useState(initial?.question || '');
  const [answer, setAnswer] = useState(initial?.answer || '');
  const [pageVal, setPageVal] = useState(defaultPage ? String(defaultPage) : '');
  const [image, setImage] = useState(initial?.image || null);
  const imageUrl = useObjectURL(image);
  const [preview, setPreview] = useState(false);
  const answerRef = useRef(null);

  // Soru kutusuna ekran görüntüsü yapıştırılırsa soruya ekle
  const onQuestionPaste = (e) => {
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      setImage(file);
      toast(t('form.imageAdded'));
    }
  };
  const canSave = (question.trim() || image) && answer.trim();

  const [copiedBoth, setCopiedBoth] = useState(false);
  const copyBoth = async () => {
    try {
      await copyQuestionWithImage(question.trim(), image);
      setCopiedBoth(true);
      setTimeout(() => setCopiedBoth(false), 1800);
      answerRef.current?.focus({ preventScroll: true });
    } catch {
      toast(t('common.copyError'), 'error');
    }
  };

  // Yeni soru eklerken sayfa değişirse, sayfa alanı da onu takip etsin
  useEffect(() => {
    if (keepOpen && defaultPage) setPageVal(String(defaultPage));
  }, [defaultPage, keepOpen]);

  useEffect(() => {
    if (focusAnswer) answerRef.current?.focus();
  }, [focusAnswer]);

  const submit = async () => {
    if (!canSave) return;
    const p = parseInt(pageVal, 10);
    // Düzenlerken görüntü değişmediyse undefined gönder (dokunma)
    await onSubmit(question, answer, p >= 1 ? p : null, image === (initial?.image || null) && initial?.id ? undefined : image);
    if (keepOpen) {
      setQuestion('');
      setAnswer('');
      setImage(null);
      setPreview(false);
      toast(t('form.addedNext'));
      document.getElementById('qa-form-question')?.focus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') onCancel();
    e.stopPropagation(); // ← → tuşları PDF sayfasını değiştirmesin
  };

  return (
    <div className="qa-form" onKeyDown={onKeyDown}>
      <div className="form-head">
        <span>{title}</span>
        <span className="form-head-right">
          {showPage && (
            <label className="page-field" title={t('form.pageTip')}>
              {t('common.page')}
              <input
                value={pageVal}
                onChange={(e) => setPageVal(e.target.value.replace(/\D/g, ''))}
                placeholder="–"
                inputMode="numeric"
                max={pageCount || undefined}
              />
            </label>
          )}
          <button className="icon-btn sm" title={t('form.closeEsc')} onClick={onCancel}>
            <X size={16} />
          </button>
        </span>
      </div>
      <label className="field">
        <span className="field-label">{t('form.question')}</span>
        <textarea
          id={keepOpen ? 'qa-form-question' : undefined}
          autoFocus={!focusAnswer}
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onPaste={onQuestionPaste}
          placeholder={image ? t('form.questionPlaceholderImg') : t('form.questionPlaceholder')}
        />
      </label>
      {imageUrl && (
        <div className="form-image">
          <img src={imageUrl} alt={t('qa.imageAlt')} />
          <button title={t('form.removeImage')} onClick={() => setImage(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {(question.trim() || image) && (
        <div className="copy-row">
          <button className={'btn sm' + (image ? ' primary' : '')} onClick={copyBoth}>
            {copiedBoth ? <Check size={15} /> : <Copy size={15} />}
            {copiedBoth ? t('common.copied') : image ? (question.trim() ? t('form.copyQAndImg') : t('form.copyImg')) : t('form.copyQ')}
          </button>
          <span className="hint">{image ? t('form.copyImgHint') : ''}</span>
        </div>
      )}
      <div className="field">
        <span className="field-label row">
          {t('form.answer')}
          <span className="seg">
            <button type="button" className={!preview ? 'on' : ''} onClick={() => setPreview(false)}>
              {t('form.write')}
            </button>
            <button type="button" className={preview ? 'on' : ''} onClick={() => setPreview(true)}>
              {t('form.preview')}
            </button>
          </span>
        </span>
        {preview ? (
          <div className="preview">
            {answer.trim() ? <Markdown>{answer}</Markdown> : <span className="muted">{t('form.nothingToPreview')}</span>}
          </div>
        ) : (
          <textarea
            ref={answerRef}
            rows={10}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onPaste={handleSmartPaste}
            placeholder={t('form.answerPlaceholder')}
          />
        )}
      </div>
      <div className="form-actions">
        <span className="hint">
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> {t('form.shortcutSave')} · <kbd>Esc</kbd> {t('form.shortcutClose')}
        </span>
        <button className="btn" onClick={onCancel}>
          {keepOpen ? t('common.close') : t('common.cancel')}
        </button>
        <button className="btn primary" disabled={!canSave} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

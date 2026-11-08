import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderPlus,
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
} from 'lucide-react';
import {
  db,
  addSection,
  renameSection,
  addQA,
  updateQA,
  deleteQA,
  moveItem,
  setSectionPdf,
  removeSectionPdf,
  restorePdfData,
} from './db.js';
import { confirmDeleteSection } from './Sidebar.jsx';
import InlineInput from './InlineInput.jsx';
import Markdown from './Markdown.jsx';
import { handleSmartPaste } from './paste.js';
import { confirmDanger, toast } from './ui.jsx';
import PdfViewer, { AI_TARGETS, AI_HOME, buildPrompt, copyImage } from './pdf/PdfViewer.jsx';

// Blob'u <img> için geçici adrese çevirir
function useObjectURL(blob) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
}

function countAll(id, tree, qaCounts) {
  let n = qaCounts.get(id) || 0;
  for (const c of tree.children.get(id) || []) n += countAll(c.id, tree, qaCounts);
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

const formatSize = (b) => (b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');

export default function SectionView({ section, path, subsections, tree, qaCounts, onSelect, onExpand }) {
  const qas = useLiveQuery(() => db.qas.where('sectionId').equals(section.id).sortBy('order'), [section.id]);
  // undefined: yükleniyor, null: PDF yok
  const pdf = useLiveQuery(async () => (await db.pdfs.where('sectionId').equals(section.id).first()) || null, [section.id]);
  const annotations = useLiveQuery(() => (pdf ? db.annotations.where('pdfId').equals(pdf.id).toArray() : []), [pdf?.id]) || [];
  const [renaming, setRenaming] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const uploadPdf = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast('Sadece PDF dosyası yüklenebilir', 'error');
      return;
    }
    if (pdf?.data) {
      const ok = await confirmDanger({
        title: 'PDF değiştirilsin mi?',
        message: 'Mevcut PDF ve üzerindeki işaretlemeler silinir. Soru-cevaplar ve sayfa numaraları korunur.',
        confirmLabel: 'Değiştir',
      });
      if (!ok) return;
    }
    if (pdf && !pdf.data) await restorePdfData(pdf.id, file);
    else await setSectionPdf(section.id, file);
    toast('PDF eklendi');
  };

  const removePdf = async () => {
    const ok = await confirmDanger({
      title: 'PDF kaldırılsın mı?',
      message: 'PDF ve üzerindeki tüm işaretlemeler silinir. Soru-cevaplar korunur.',
      confirmLabel: 'Kaldır',
    });
    if (ok) {
      await removeSectionPdf(section.id);
      toast('PDF kaldırıldı');
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

  const head = (
    <div className="page-head">
      <nav className="breadcrumb">
        {path.map((p, i) => (
          <span key={p.id} className="crumb">
            {i > 0 && <ChevronRight size={13} className="sep" />}
            {i < path.length - 1 ? <button onClick={() => onSelect(p.id)}>{p.name}</button> : <span>{p.name}</span>}
          </span>
        ))}
      </nav>
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
              <button className="icon-btn" title="PDF'i değiştir" onClick={() => fileRef.current?.click()}>
                <RefreshCw size={16} />
              </button>
              <button className="icon-btn danger" title="PDF'i kaldır" onClick={removePdf}>
                <FileX size={17} />
              </button>
              <span className="tb-sep" />
            </>
          ) : (
            pdf === null && (
              <button className="btn ghost sm" onClick={() => fileRef.current?.click()}>
                <FileUp size={15} /> PDF ekle
              </button>
            )
          )}
          <button className="icon-btn" title="Yeniden adlandır" onClick={() => setRenaming(true)}>
            <Pencil size={17} />
          </button>
          <button className="icon-btn danger" title="Bu bölümü sil" onClick={() => confirmDeleteSection(section)}>
            <Trash2 size={17} />
          </button>
        </div>
      </header>
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
    </div>
  );

  const subsectionCards = (subsections.length > 0 || addingSub) && (
    <section className="block">
      <h2 className="block-title">Alt bölümler</h2>
      <div className="sub-grid">
        {subsections.map((s) => {
          const n = countAll(s.id, tree, qaCounts);
          const subs = (tree.children.get(s.id) || []).length;
          return (
            <button key={s.id} className="sub-card" onClick={() => onSelect(s.id)}>
              <span className="sub-icon">
                <Folder size={18} />
              </span>
              <span className="sub-text">
                <span className="sub-name">{s.name}</span>
                <span className="sub-meta">
                  {n} soru{subs ? ` · ${subs} alt bölüm` : ''}
                </span>
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
              placeholder="Bölüm adı"
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
          <PdfWorkspace pdf={pdf} qas={qas || []} annotations={annotations} sectionId={section.id} />
        ) : (
          <div className="pdf-missing">
            <FileX size={28} />
            <div className="empty-title">“{pdf.name}” bu cihazda yok</div>
            <div className="empty-text">Yedek PDF'siz yüklenmiş. Aynı dosyayı yeniden seçersen işaretlemelerin geri gelir.</div>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>
              <FileUp size={16} /> PDF'i seç
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
        extraActions={
          !addingSub && (
            <button className="btn ghost sm" onClick={() => setAddingSub(true)}>
              <FolderPlus size={15} /> Alt bölüm
            </button>
          )
        }
        emptyExtra={
          pdf === null && (
            <div className="pdf-hint">
              <FileUp size={15} /> İpucu: Bu bölüme bir PDF sürükleyip bırakırsan, sorularını sayfa sayfa yanında görebilirsin.
            </div>
          )
        }
      />
      {dragOver && <DropOverlay />}
    </div>
  );
}

function DropOverlay() {
  return (
    <div className="drop-overlay">
      <FileUp size={32} />
      <span>PDF'i buraya bırak</span>
    </div>
  );
}

// ---------------- PDF + sorular yan yana ----------------
function PdfWorkspace({ pdf, qas, annotations, sectionId }) {
  const [page, setPageState] = useState(() => readLS('page:' + pdf.id, 1));
  const [split, setSplit] = useState(() => readLS('split', 0.6));
  const [askDraft, setAskDraft] = useState(null); // { question, key }
  const splitRef = useRef(null);

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
    const t = AI_TARGETS.find((x) => x.id === target);
    if (t) window.open(t.url(prompt), '_blank', 'noopener');
    toast(t ? `İstem kopyalandı, ${t.label} açılıyor. Gelen cevabı buraya yapıştır.` : 'İstem kopyalandı. Yapay zekâya yapıştır, cevabı buraya ekle.');
    const short = text.length > 220 ? text.slice(0, 220) + '…' : text;
    setAskDraft({ question: `“${short}” kısmını açıklar mısın?`, key: Date.now() });
  };

  const onAskImage = async (blob, target) => {
    let copied = true;
    try {
      await copyImage(blob);
    } catch {
      copied = false;
    }
    const t = AI_TARGETS.find((x) => x.id === target);
    if (t) window.open(AI_HOME[t.id], '_blank', 'noopener');
    toast(
      copied
        ? `Görüntü kopyalandı. ${t ? t.label + '’da' : 'Yapay zekâda'} Ctrl+V ile yapıştır, cevabı buraya ekle.`
        : 'Görüntü panoya kopyalanamadı, ama soruya eklendi.',
      copied ? 'success' : 'error'
    );
    setAskDraft({ question: 'Bu görseldeki kısmı açıklar mısın?', image: blob, key: Date.now() });
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
      <PdfViewer pdf={pdf} page={page} setPage={setPage} annotations={annotations} pageBadges={pageBadges} onAsk={onAsk} onAskImage={onAskImage} />
      <div className="splitter" onPointerDown={startDrag} title="Sürükleyerek genişliği ayarla" />
      <div className="qa-pane">
        <QAPanel
          sectionId={sectionId}
          qas={qas}
          pdfMode
          page={page}
          setPage={setPage}
          pageCount={pdf.pageCount}
          askDraft={askDraft}
          clearAskDraft={() => setAskDraft(null)}
        />
      </div>
    </div>
  );
}

// ---------------- Soru listesi (iki modda da kullanılır) ----------------
function QAPanel({ sectionId, qas, pdfMode, page, setPage, pageCount, askDraft, clearAskDraft, extraActions, emptyExtra }) {
  const [openIds, setOpenIds] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('page'); // pdf modunda: 'page' | 'all'
  const listRef = useRef(null);

  useEffect(() => {
    if (askDraft) {
      setFilter('page');
      setAdding(true);
    }
  }, [askDraft]);

  const toggle = (id) =>
    setOpenIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const visible = useMemo(() => {
    if (!qas) return null;
    if (!pdfMode || filter === 'all') return qas;
    return qas.filter((q) => q.page === page);
  }, [qas, pdfMode, filter, page]);

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
        title="Soru-cevabı düzenle"
        submitLabel="Kaydet"
        showPage={pdfMode}
        defaultPage={qa.page}
        pageCount={pageCount}
        onSubmit={async (q, a, p, img) => {
          await updateQA(qa.id, q, a, pdfMode ? p : undefined, img);
          setEditingId(null);
          toast('Kaydedildi');
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
        onDelete={async () => {
          if (await confirmDanger({ title: 'Bu soru-cevap silinsin mi?', message: 'Bu işlem geri alınamaz.' })) {
            await deleteQA(qa.id);
            toast('Silindi');
          }
        }}
        onMove={(d) => moveItem('qas', qa.id, d)}
      />
    );

  return (
    <section className="block qa-block" ref={listRef}>
      <div className="qa-toolbar">
        {pdfMode ? (
          <div className="seg big">
            <button className={filter === 'page' ? 'on' : ''} onClick={() => setFilter('page')}>
              Sayfa {page}
              {qas && <span className="seg-count">{qas.filter((q) => q.page === page).length}</span>}
            </button>
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              Tümü
              {qas && <span className="seg-count">{qas.length}</span>}
            </button>
          </div>
        ) : (
          <h2 className="block-title">
            Sorular {qas?.length > 0 && <span className="pill">{qas.length}</span>}
          </h2>
        )}
        <div className="toolbar-actions">
          {visible?.length > 1 && (
            <button
              className="btn ghost sm"
              title={allOpen ? 'Tümünü kapat' : 'Tümünü aç'}
              onClick={() => setOpenIds(allOpen ? new Set() : new Set(visible.map((q) => q.id)))}
            >
              {allOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
              {!pdfMode && (allOpen ? 'Tümünü kapat' : 'Tümünü aç')}
            </button>
          )}
          {extraActions}
          {!adding && (
            <button className="btn primary sm" onClick={startAdding}>
              <Plus size={15} /> Soru ekle
            </button>
          )}
        </div>
      </div>

      <div className="qa-list">
        {groups.map((g) => (
          <div key={g.key} className="qa-group">
            {g.page !== undefined && (
              <button className="group-head" onClick={() => g.page && setPage(g.page)} disabled={!g.page}>
                {g.page ? `Sayfa ${g.page}` : 'Sayfası belirtilmemiş'}
                <span className="pill">{g.items.length}</span>
              </button>
            )}
            {g.items.map((qa, i) => renderItem(qa, i, g.items))}
          </div>
        ))}
        {visible?.length === 0 && !adding && (
          <div className="empty">
            <div className="empty-icon">
              <MessageCircleQuestion size={26} />
            </div>
            <div className="empty-title">{pdfMode && filter === 'page' ? `${page}. sayfada henüz soru yok` : 'Bu bölümde henüz soru yok'}</div>
            <div className="empty-text">
              {pdfMode
                ? 'PDF’te bir metni seçip “Yapay zekâya sor” diyebilir ya da sorduğun bir soruyu buraya yapıştırabilirsin.'
                : 'Yapay zekâya sorduğun bir soruyu ve aldığın cevabı buraya yapıştır.'}
            </div>
            <button className="btn primary" onClick={startAdding}>
              <Plus size={16} /> {pdfMode && filter === 'page' ? 'Bu sayfaya soru ekle' : 'İlk soruyu ekle'}
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
          focusAnswer={!!askDraft}
          title={pdfMode ? 'Yeni soru-cevap' : 'Yeni soru-cevap'}
          submitLabel="Ekle"
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
      {!adding && visible?.length > 0 && (
        <button className="add-qa-bottom" onClick={startAdding}>
          <Plus size={16} /> {pdfMode && filter === 'page' ? 'Bu sayfaya soru ekle' : 'Soru-cevap ekle'}
        </button>
      )}
    </section>
  );
}

function QAItem({ qa, index, isFirst, isLast, open, showPage, onJump, onToggle, onEdit, onDelete, onMove }) {
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
    <article className={'qa' + (open ? ' open' : '')}>
      <button className="qa-question" onClick={onToggle} aria-expanded={open}>
        <span className="qa-num">{index}</span>
        <span className="qa-q-text">
          {qa.question}
          {imgUrl && <img className="qa-image" src={imgUrl} alt="Soruya eklenen görüntü" onClick={(e) => (e.stopPropagation(), setZoomed(true))} />}
        </span>
        {qa.image && !open && <ImageIcon size={16} className="qa-image-badge" aria-label="Görüntülü soru" />}
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
              <button className="icon-btn sm" title={copied ? 'Kopyalandı' : 'Cevabı kopyala'} onClick={copy}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <button className="icon-btn sm" title="Düzenle" onClick={onEdit}>
                <Pencil size={15} />
              </button>
              <button className="icon-btn sm" title="Yukarı taşı" disabled={isFirst} onClick={() => onMove(-1)}>
                <ArrowUp size={15} />
              </button>
              <button className="icon-btn sm" title="Aşağı taşı" disabled={isLast} onClick={() => onMove(1)}>
                <ArrowDown size={15} />
              </button>
              <button className="icon-btn sm danger" title="Sil" onClick={onDelete}>
                <Trash2 size={15} />
              </button>
              {onJump && (
                <button className="btn ghost sm page-jump" onClick={onJump} title="PDF'te bu sayfaya git">
                  <FileText size={14} /> Sayfa {qa.page}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {showPage && !open && qa.page && <span className="qa-page-tag">s. {qa.page}</span>}
    </article>
  );
}

function QAForm({ initial, title, submitLabel, onSubmit, onCancel, keepOpen, showPage, defaultPage, pageCount, focusAnswer }) {
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
      toast('Görüntü soruya eklendi');
    }
  };
  const canSave = question.trim() && answer.trim();

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
      toast('Eklendi — sıradakini yapıştırabilirsin');
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
            <label className="page-field" title="Bu soru PDF'in hangi sayfasına ait?">
              Sayfa
              <input
                value={pageVal}
                onChange={(e) => setPageVal(e.target.value.replace(/\D/g, ''))}
                placeholder="–"
                inputMode="numeric"
                max={pageCount || undefined}
              />
            </label>
          )}
          <button className="icon-btn sm" title="Kapat (Esc)" onClick={onCancel}>
            <X size={16} />
          </button>
        </span>
      </div>
      <label className="field">
        <span className="field-label">Soru</span>
        <textarea
          id={keepOpen ? 'qa-form-question' : undefined}
          autoFocus={!focusAnswer}
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onPaste={onQuestionPaste}
          placeholder="Yapay zekâya sorduğun soruyu yapıştır… (ekran görüntüsü de yapıştırabilirsin)"
        />
      </label>
      {imageUrl && (
        <div className="form-image">
          <img src={imageUrl} alt="Soruya eklenen görüntü" />
          <button title="Görüntüyü kaldır" onClick={() => setImage(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      <div className="field">
        <span className="field-label row">
          Cevap
          <span className="seg">
            <button type="button" className={!preview ? 'on' : ''} onClick={() => setPreview(false)}>
              Yaz
            </button>
            <button type="button" className={preview ? 'on' : ''} onClick={() => setPreview(true)}>
              Önizle
            </button>
          </span>
        </span>
        {preview ? (
          <div className="preview">
            {answer.trim() ? <Markdown>{answer}</Markdown> : <span className="muted">Önizlenecek bir şey yok.</span>}
          </div>
        ) : (
          <textarea
            ref={answerRef}
            rows={10}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onPaste={handleSmartPaste}
            placeholder="Cevabı yapıştır… Başlıklar, tablolar, kodlar ve formüller korunur."
          />
        )}
      </div>
      <div className="form-actions">
        <span className="hint">
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> kaydet · <kbd>Esc</kbd> kapat
        </span>
        <button className="btn" onClick={onCancel}>
          {keepOpen ? 'Kapat' : 'Vazgeç'}
        </button>
        <button className="btn primary" disabled={!canSave} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  MousePointer2,
  Highlighter,
  PenLine,
  StickyNote,
  Eraser,
  PanelLeft,
  Sparkles,
  Copy,
  Trash2,
  X,
} from 'lucide-react';
import { loadPdf, TextLayer } from './pdfjs.js';
import { addAnnotation, updateAnnotation, deleteAnnotation, db } from '../db.js';
import { toast } from '../ui.jsx';

export const COLORS = [
  { id: 'yellow', value: '#ffd43b', label: 'Sarı' },
  { id: 'green', value: '#69db7c', label: 'Yeşil' },
  { id: 'blue', value: '#74c0fc', label: 'Mavi' },
  { id: 'pink', value: '#f783ac', label: 'Pembe' },
  { id: 'red', value: '#e03131', label: 'Kırmızı' },
];
const colorOf = (id) => COLORS.find((c) => c.id === id)?.value || id;

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Seç (metni seçince vurgula / yapay zekâya sor)' },
  { id: 'marker', icon: Highlighter, label: 'Fosforlu kalem' },
  { id: 'pen', icon: PenLine, label: 'Kalem' },
  { id: 'note', icon: StickyNote, label: 'Not ekle (sayfaya tıkla)' },
  { id: 'eraser', icon: Eraser, label: 'Silgi (işaretlemeye tıkla)' },
];

export const AI_TARGETS = [
  { id: 'chatgpt', label: 'ChatGPT', url: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}` },
  { id: 'claude', label: 'Claude', url: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}` },
  { id: 'gemini', label: 'Gemini', url: () => 'https://gemini.google.com/app' },
];

export function buildPrompt(text) {
  return `Ders çalışıyorum. Aşağıdaki metni bir öğrenciye anlatır gibi, gerekirse örneklerle açıkla:\n\n"${text}"`;
}

export default function PdfViewer({ pdf, page, setPage, annotations, pageBadges, onAsk }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1); // genişliğe sığdırmaya göre çarpan
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState('yellow');
  const [showThumbs, setShowThumbs] = useState(() => {
    try {
      return localStorage.getItem('pdf-thumbs') !== '0';
    } catch {
      return true;
    }
  });
  const pageCount = doc?.numPages || 0;

  useEffect(() => {
    let alive = true;
    setDoc(null);
    setError(null);
    if (!pdf.data) return;
    loadPdf(pdf)
      .then((d) => {
        if (!alive) return;
        setDoc(d);
        if (pdf.pageCount !== d.numPages) db.pdfs.update(pdf.id, { pageCount: d.numPages });
      })
      .catch((e) => alive && setError(e.message || String(e)));
    return () => {
      alive = false;
    };
  }, [pdf.id, pdf.size, pdf.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem('pdf-thumbs', showThumbs ? '1' : '0');
    } catch {}
  }, [showThumbs]);

  // Sayfa sınırlarını koru
  useEffect(() => {
    if (pageCount && page > pageCount) setPage(pageCount);
  }, [pageCount, page, setPage]);

  // Klavye: ← → sayfa değiştirir (yazı yazarken değil)
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPage((p) => Math.min(pageCount, p + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPage((p) => Math.max(1, p - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageCount, setPage]);

  const pageAnnotations = useMemo(() => annotations.filter((a) => a.page === page), [annotations, page]);

  if (!pdf.data) return null;

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button className={'icon-btn sm' + (showThumbs ? ' on' : '')} title="Sayfa önizlemeleri" onClick={() => setShowThumbs((s) => !s)}>
          <PanelLeft size={16} />
        </button>
        <span className="tb-sep" />
        <div className="tool-group">
          {TOOLS.map((t) => (
            <button key={t.id} className={'icon-btn sm' + (tool === t.id ? ' on' : '')} title={t.label} onClick={() => setTool(t.id)}>
              <t.icon size={16} />
            </button>
          ))}
        </div>
        <div className="color-group">
          {COLORS.map((c) => (
            <button
              key={c.id}
              className={'swatch' + (color === c.id ? ' on' : '')}
              style={{ '--c': c.value }}
              title={c.label}
              onClick={() => setColor(c.id)}
            />
          ))}
        </div>
        <span className="tb-spacer" />
        <button className="icon-btn sm" title="Uzaklaştır" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}>
          <ZoomOut size={16} />
        </button>
        <button className="zoom-label" title="Genişliğe sığdır" onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-btn sm" title="Yakınlaştır" onClick={() => setZoom((z) => Math.min(4, +(z + 0.15).toFixed(2)))}>
          <ZoomIn size={16} />
        </button>
      </div>

      <div className="pdf-body">
        {showThumbs && doc && <Thumbnails doc={doc} page={page} setPage={setPage} badges={pageBadges} />}
        {error ? (
          <div className="pdf-message">PDF açılamadı: {error}</div>
        ) : !doc ? (
          <div className="pdf-message">PDF yükleniyor…</div>
        ) : (
          <PageView
            key={page}
            doc={doc}
            pdfId={pdf.id}
            pageNum={page}
            zoom={zoom}
            tool={tool}
            color={color}
            annotations={pageAnnotations}
            onAsk={onAsk}
          />
        )}
        {doc && (
          <div className="page-nav">
            <button className="icon-btn sm" title="Önceki sayfa (←)" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={17} />
            </button>
            <PageInput page={page} pageCount={pageCount} setPage={setPage} />
            <button className="icon-btn sm" title="Sonraki sayfa (→)" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
              <ChevronRight size={17} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PageInput({ page, pageCount, setPage }) {
  const [val, setVal] = useState(String(page));
  useEffect(() => setVal(String(page)), [page]);
  const commit = () => {
    const n = parseInt(val, 10);
    if (n >= 1 && n <= pageCount) setPage(n);
    else setVal(String(page));
  };
  return (
    <span className="page-input">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="Sayfa numarası"
      />
      <span className="muted">/ {pageCount || '…'}</span>
    </span>
  );
}

// ---------------- Sayfa önizlemeleri ----------------
function Thumbnails({ doc, page, setPage, badges }) {
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [page]);
  return (
    <div className="thumbs" ref={listRef}>
      {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
        <button key={n} data-page={n} className={'thumb' + (n === page ? ' on' : '')} onClick={() => setPage(n)}>
          <Thumb doc={doc} n={n} />
          <span className="thumb-num">{n}</span>
          {badges.get(n) > 0 && <span className="thumb-badge" title={`${badges.get(n)} soru`}>{badges.get(n)}</span>}
        </button>
      ))}
    </div>
  );
}

function Thumb({ doc, n }) {
  const ref = useRef(null);
  const [ratio, setRatio] = useState(1.414);
  useEffect(() => {
    const canvas = ref.current;
    let task;
    let done = false;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || done) return;
        done = true;
        io.disconnect();
        const p = await doc.getPage(n);
        const base = p.getViewport({ scale: 1 });
        setRatio(base.height / base.width);
        const vp = p.getViewport({ scale: (120 / base.width) * 2 });
        canvas.width = vp.width;
        canvas.height = vp.height;
        task = p.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        task.promise.catch(() => {});
      },
      { rootMargin: '300px' }
    );
    io.observe(canvas);
    return () => {
      io.disconnect();
      task?.cancel();
    };
  }, [doc, n]);
  return <canvas ref={ref} className="thumb-canvas" style={{ aspectRatio: `1 / ${ratio}` }} />;
}

// ---------------- Tek sayfa görünümü ----------------
function PageView({ doc, pdfId, pageNum, zoom, tool, color, annotations, onAsk }) {
  const scrollerRef = useRef(null);
  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const [pageObj, setPageObj] = useState(null);
  const [fitWidth, setFitWidth] = useState(0);
  const [drawing, setDrawing] = useState(null); // çizilmekte olan kalem izi
  const [selection, setSelection] = useState(null); // { text, rects, x, y }
  const [openNote, setOpenNote] = useState(null);

  useEffect(() => {
    let alive = true;
    doc.getPage(pageNum).then((p) => alive && setPageObj(p));
    return () => {
      alive = false;
    };
  }, [doc, pageNum]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const ro = new ResizeObserver(() => setFitWidth(el.clientWidth - 48));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const base = pageObj?.getViewport({ scale: 1 });
  const scale = base && fitWidth > 0 ? (fitWidth / base.width) * zoom : 0;
  const W = base?.width || 1;
  const H = base?.height || 1;

  // Sayfayı çiz + seçilebilir metin katmanı
  useEffect(() => {
    if (!pageObj || !scale) return;
    const dpr = window.devicePixelRatio || 1;
    const vp = pageObj.getViewport({ scale });
    const canvas = canvasRef.current;
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    const task = pageObj.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
    task.promise.catch(() => {});

    const container = textRef.current;
    container.replaceChildren();
    const tl = new TextLayer({ textContentSource: pageObj.streamTextContent(), container, viewport: vp });
    tl.render().catch(() => {});
    return () => {
      task.cancel();
      tl.cancel();
    };
  }, [pageObj, scale]);

  // Ekran koordinatını sayfa koordinatına (0-1) çevirir
  const toNorm = (clientX, clientY) => {
    const r = pageRef.current.getBoundingClientRect();
    return [(clientX - r.left) / r.width, (clientY - r.top) / r.height];
  };

  // ---- Kalem / fosforlu kalem ----
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (tool === 'pen' || tool === 'marker') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      setDrawing({ points: [toNorm(e.clientX, e.clientY)] });
    } else if (tool === 'note') {
      const [x, y] = toNorm(e.clientX, e.clientY);
      addAnnotation(pdfId, pageNum, { type: 'note', color, x, y, text: '' }).then((id) => setOpenNote(id));
    }
  };
  const onPointerMove = (e) => {
    if (!drawing) return;
    const pt = toNorm(e.clientX, e.clientY);
    setDrawing((d) => ({ points: [...d.points, pt] }));
  };
  const onPointerUp = () => {
    if (!drawing) return;
    const pts = drawing.points;
    setDrawing(null);
    if (pts.length < 2) return;
    const isMarker = tool === 'marker';
    addAnnotation(pdfId, pageNum, {
      type: 'ink',
      color,
      width: isMarker ? 14 : 2,
      opacity: isMarker ? 0.4 : 1,
      points: pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]),
    });
  };

  // ---- Metin seçimi ----
  useEffect(() => {
    if (tool !== 'select') {
      setSelection(null);
      return;
    }
    const onUp = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().replace(/\s+/g, ' ').trim();
        if (!sel || sel.isCollapsed || !text || !textRef.current?.contains(sel.anchorNode)) {
          setSelection(null);
          return;
        }
        const pr = pageRef.current.getBoundingClientRect();
        const rects = [...sel.getRangeAt(0).getClientRects()]
          .filter((r) => r.width > 1 && r.height > 1)
          .map((r) => [(r.left - pr.left) / pr.width, (r.top - pr.top) / pr.height, r.width / pr.width, r.height / pr.height]);
        const last = sel.getRangeAt(0).getBoundingClientRect();
        const sr = scrollerRef.current.getBoundingClientRect();
        setSelection({
          text,
          rects,
          x: Math.min(last.left - sr.left + scrollerRef.current.scrollLeft + last.width / 2, scrollerRef.current.scrollWidth - 150),
          y: last.bottom - sr.top + scrollerRef.current.scrollTop + 8,
        });
      }, 0);
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, [tool]);

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const highlightSelection = async () => {
    await addAnnotation(pdfId, pageNum, {
      type: 'highlight',
      color,
      text: selection.text,
      rects: selection.rects.map((r) => r.map((v) => +v.toFixed(4))),
    });
    clearSelection();
  };

  const eraseProps = (a) =>
    tool === 'eraser'
      ? {
          className: 'erasable',
          onPointerDown: (e) => {
            e.stopPropagation();
            deleteAnnotation(a.id);
          },
        }
      : {};

  const drawingMode = tool === 'pen' || tool === 'marker' || tool === 'note';
  const cursor = { select: 'auto', pen: 'crosshair', marker: 'crosshair', note: 'copy', eraser: 'cell' }[tool];

  return (
    <div className="page-scroller" ref={scrollerRef} onScroll={() => selection && setSelection(null)}>
      {!scale && <div className="pdf-message">Sayfa hazırlanıyor…</div>}
      <div
        ref={pageRef}
        className={'pdf-page tool-' + tool}
        style={{ width: W * scale || undefined, height: H * scale || undefined, '--scale-factor': scale, visibility: scale ? 'visible' : 'hidden' }}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        <div ref={textRef} className="textLayer" />
        <svg
          className={'ann-layer' + (drawingMode ? ' capture' : '')}
          viewBox={`0 0 ${W} ${H}`}
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {annotations.map((a) =>
            a.type === 'highlight' ? (
              <g key={a.id} {...eraseProps(a)}>
                {a.rects.map(([x, y, w, h], i) => (
                  <rect key={i} x={x * W} y={y * H} width={w * W} height={h * H} rx={1.5} fill={colorOf(a.color)} className="hl-rect" />
                ))}
              </g>
            ) : a.type === 'ink' ? (
              <polyline
                key={a.id}
                {...eraseProps(a)}
                points={a.points.map(([x, y]) => `${x * W},${y * H}`).join(' ')}
                fill="none"
                stroke={colorOf(a.color)}
                strokeWidth={a.width}
                strokeOpacity={a.opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={a.opacity < 1 ? 'ink marker' : 'ink'}
              />
            ) : null
          )}
          {drawing && (
            <polyline
              points={drawing.points.map(([x, y]) => `${x * W},${y * H}`).join(' ')}
              fill="none"
              stroke={colorOf(color)}
              strokeWidth={tool === 'marker' ? 14 : 2}
              strokeOpacity={tool === 'marker' ? 0.4 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={tool === 'marker' ? 'ink marker' : 'ink'}
            />
          )}
        </svg>
        {annotations
          .filter((a) => a.type === 'note')
          .map((a) => (
            <NotePin key={a.id} note={a} tool={tool} open={openNote === a.id} setOpen={(v) => setOpenNote(v ? a.id : null)} />
          ))}
      </div>

      {selection && (
        <SelectionMenu
          selection={selection}
          color={color}
          onHighlight={highlightSelection}
          onCopy={async () => {
            await navigator.clipboard.writeText(selection.text);
            toast('Metin kopyalandı');
            clearSelection();
          }}
          onAsk={(target) => {
            onAsk(selection.text, target);
            clearSelection();
          }}
        />
      )}

    </div>
  );
}

function SelectionMenu({ selection, color, onHighlight, onCopy, onAsk }) {
  const [aiOpen, setAiOpen] = useState(false);
  return (
    <div className="sel-menu" style={{ left: selection.x, top: selection.y }} onMouseUp={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
      {!aiOpen ? (
        <>
          <button onClick={onHighlight}>
            <span className="dot" style={{ background: colorOf(color) }} /> Vurgula
          </button>
          <button className="ai" onClick={() => setAiOpen(true)}>
            <Sparkles size={14} /> Yapay zekâya sor
          </button>
          <button onClick={onCopy} title="Kopyala">
            <Copy size={14} />
          </button>
        </>
      ) : (
        <>
          <span className="sel-label">Nerede sorulsun?</span>
          {AI_TARGETS.map((t) => (
            <button key={t.id} onClick={() => onAsk(t.id)}>
              {t.label}
            </button>
          ))}
          <button onClick={() => onAsk(null)} title="Sadece istemi panoya kopyala">
            <Copy size={14} /> Kopyala
          </button>
        </>
      )}
    </div>
  );
}

function NotePin({ note, tool, open, setOpen }) {
  const [text, setText] = useState(note.text);
  useEffect(() => setText(note.text), [note.text]);
  const save = () => text !== note.text && updateAnnotation(note.id, { text });

  return (
    <div className="note-pin" style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }} onPointerDown={(e) => e.stopPropagation()}>
      <button
        className="note-icon"
        style={{ '--c': colorOf(note.color) }}
        title={note.text || 'Not'}
        onClick={() => (tool === 'eraser' ? deleteAnnotation(note.id) : setOpen(!open))}
      >
        <StickyNote size={15} />
      </button>
      {open && (
        <div
          className={'note-pop' + (note.x > 0.55 ? ' left' : '') + (note.y > 0.7 ? ' up' : '')}
          style={{ '--c': colorOf(note.color) }}
        >
          <textarea
            autoFocus
            value={text}
            placeholder="Notunu yaz…"
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                save();
                setOpen(false);
              }
            }}
          />
          <div className="note-actions">
            <button title="Notu sil" onClick={() => deleteAnnotation(note.id)}>
              <Trash2 size={14} />
            </button>
            <button
              title="Kapat"
              onClick={() => {
                save();
                setOpen(false);
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  Scan,
  MessageSquarePlus,
  PanelLeft,
  Sparkles,
  Copy,
  Trash2,
  X,
  Undo2,
  Redo2,
} from 'lucide-react';
import { loadPdf, TextLayer } from './pdfjs.js';
import { addAnnotation, restoreAnnotation, updateAnnotation, deleteAnnotation, db } from '../db.js';
import { toast } from '../ui.jsx';
import { t, useT } from '../i18n.js';

export const COLORS = [
  { id: 'yellow', value: '#ffd43b', labelKey: 'pdf.color.yellow' },
  { id: 'green', value: '#69db7c', labelKey: 'pdf.color.green' },
  { id: 'blue', value: '#74c0fc', labelKey: 'pdf.color.blue' },
  { id: 'pink', value: '#f783ac', labelKey: 'pdf.color.pink' },
  { id: 'red', value: '#e03131', labelKey: 'pdf.color.red' },
];
const colorOf = (id) => COLORS.find((c) => c.id === id)?.value || id;

// Silgi için yuvarlak imleç
const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="9" fill="rgba(255,255,255,0.6)" stroke="#555" stroke-width="1.5"/></svg>'
)}") 11 11, auto`;

const TOOLS = [
  { id: 'select', icon: MousePointer2, labelKey: 'pdf.tool.select' },
  { id: 'snip', icon: Scan, labelKey: 'pdf.tool.snip' },
  { id: 'marker', icon: Highlighter, labelKey: 'pdf.tool.marker' },
  { id: 'pen', icon: PenLine, labelKey: 'pdf.tool.pen' },
  { id: 'note', icon: StickyNote, labelKey: 'pdf.tool.note' },
  { id: 'eraser', icon: Eraser, labelKey: 'pdf.tool.eraser' },
];

export const AI_TARGETS = [
  { id: 'chatgpt', label: 'ChatGPT', url: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}` },
  { id: 'claude', label: 'Claude', url: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}` },
  { id: 'gemini', label: 'Gemini', url: () => 'https://gemini.google.com/app' },
];

// Açılır menünün (ortası x'te) kaydırma alanının görünen kısmından taşmaması için
function clampMenuX(x, scroller, half) {
  const min = scroller.scrollLeft + half + 6;
  const max = scroller.scrollLeft + scroller.clientWidth - half - 6;
  return max < min ? (min + max) / 2 : Math.max(min, Math.min(max, x));
}

export async function copyImage(blob) {
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
}

// Sayfanın seçilen bölgesini yüksek çözünürlükte PNG olarak çıkarır. r: [x, y, w, h] (0-1)
async function captureRegion(pageObj, [x, y, w, h]) {
  const base = pageObj.getViewport({ scale: 1 });
  const s = Math.min(4, Math.max(2, 1400 / (w * base.width)));
  const vp = pageObj.getViewport({ scale: s });
  const full = document.createElement('canvas');
  full.width = Math.ceil(vp.width);
  full.height = Math.ceil(vp.height);
  await pageObj.render({ canvasContext: full.getContext('2d'), viewport: vp }).promise;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * full.width));
  out.height = Math.max(1, Math.round(h * full.height));
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(full, -Math.round(x * full.width), -Math.round(y * full.height));
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

export function buildPrompt(text) {
  return t('pdf.askPrompt', { text });
}

const MAX_HISTORY = 60;

export default function PdfViewer({ pdf, page, setPage, annotations, pageBadges, onAsk, onAttachImage }) {
  const { t } = useT();
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

  // Sayfa bazlı Geri Al / İleri Al geçmişi
  const historyRef = useRef(new Map());
  const [, setHistTick] = useState(0);
  useEffect(() => {
    historyRef.current = new Map();
    setHistTick((n) => n + 1);
  }, [pdf.id]);

  const getStack = (p) => {
    let s = historyRef.current.get(p);
    if (!s) {
      s = { past: [], future: [] };
      historyRef.current.set(p, s);
    }
    return s;
  };

  const recordHistory = useCallback((p, entry) => {
    const s = getStack(p);
    s.past.push(entry);
    if (s.past.length > MAX_HISTORY) s.past.shift();
    s.future.length = 0;
    setHistTick((n) => n + 1);
  }, []);

  const undo = useCallback(async () => {
    const s = getStack(page);
    const entry = s.past.pop();
    if (!entry) return;
    s.future.push(entry);
    setHistTick((n) => n + 1);
    if (entry.type === 'add') await deleteAnnotation(entry.ann.id);
    else if (entry.type === 'delete') await Promise.all(entry.anns.map((a) => restoreAnnotation(a)));
    else if (entry.type === 'update') await updateAnnotation(entry.id, entry.before);
  }, [page]);

  const redo = useCallback(async () => {
    const s = getStack(page);
    const entry = s.future.pop();
    if (!entry) return;
    s.past.push(entry);
    setHistTick((n) => n + 1);
    if (entry.type === 'add') await restoreAnnotation(entry.ann);
    else if (entry.type === 'delete') await Promise.all(entry.anns.map((a) => deleteAnnotation(a.id)));
    else if (entry.type === 'update') await updateAnnotation(entry.id, entry.after);
  }, [page]);

  const curStack = historyRef.current.get(page);
  const canUndo = (curStack?.past.length || 0) > 0;
  const canRedo = (curStack?.future.length || 0) > 0;

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

  // Klavye: ← → sayfa değiştirir, Ctrl+Z / Ctrl+Y geri/ileri alır (yazı yazarken değil)
  useEffect(() => {
    const onKey = (e) => {
      const target = e.target;
      if (target.closest?.('input, textarea, [contenteditable="true"]')) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        }
        if (k === 'y' || (k === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo();
          return;
        }
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPage((p) => Math.min(pageCount, p + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPage((p) => Math.max(1, p - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageCount, setPage, undo, redo]);

  const pageAnnotations = useMemo(() => annotations.filter((a) => a.page === page), [annotations, page]);

  if (!pdf.data) return null;

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button className={'icon-btn sm' + (showThumbs ? ' on' : '')} title={t('pdf.thumbsTip')} onClick={() => setShowThumbs((s) => !s)}>
          <PanelLeft size={16} />
        </button>
        <span className="tb-sep" />
        <div className="tool-group">
          {TOOLS.map((tl) => (
            <button key={tl.id} className={'icon-btn sm' + (tool === tl.id ? ' on' : '')} title={t(tl.labelKey)} onClick={() => setTool(tl.id)}>
              <tl.icon size={16} />
            </button>
          ))}
        </div>
        <div className="color-group">
          {COLORS.map((c) => (
            <button
              key={c.id}
              className={'swatch' + (color === c.id ? ' on' : '')}
              style={{ '--c': c.value }}
              title={t(c.labelKey)}
              onClick={() => setColor(c.id)}
            />
          ))}
        </div>
        <span className="tb-sep" />
        <button className="icon-btn sm" title={t('pdf.undoTip')} disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button className="icon-btn sm" title={t('pdf.redoTip')} disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </button>
        <span className="tb-spacer" />
        <button className="icon-btn sm" title={t('pdf.zoomOut')} onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}>
          <ZoomOut size={16} />
        </button>
        <button className="zoom-label" title={t('pdf.fitWidth')} onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-btn sm" title={t('pdf.zoomIn')} onClick={() => setZoom((z) => Math.min(4, +(z + 0.15).toFixed(2)))}>
          <ZoomIn size={16} />
        </button>
      </div>

      <div className="pdf-body">
        {showThumbs && doc && <Thumbnails doc={doc} page={page} setPage={setPage} badges={pageBadges} />}
        {error ? (
          <div className="pdf-message">{t('pdf.openError', { err: error })}</div>
        ) : !doc ? (
          <div className="pdf-message">{t('pdf.loading')}</div>
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
            onRecord={(entry) => recordHistory(page, entry)}
            onAsk={onAsk}
            onAttachImage={onAttachImage}
          />
        )}
        {doc && (
          <div className="page-nav">
            <button className="icon-btn sm" title={t('pdf.prevPage')} disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={17} />
            </button>
            <PageInput page={page} pageCount={pageCount} setPage={setPage} />
            <button className="icon-btn sm" title={t('pdf.nextPage')} disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
              <ChevronRight size={17} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PageInput({ page, pageCount, setPage }) {
  const { t } = useT();
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
        aria-label={t('pdf.pageNumber')}
      />
      <span className="muted">/ {pageCount || '…'}</span>
    </span>
  );
}

// ---------------- Sayfa önizlemeleri ----------------
function Thumbnails({ doc, page, setPage, badges }) {
  const { t } = useT();
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
          {badges.get(n) > 0 && <span className="thumb-badge" title={t('pdf.thumbBadge', { n: badges.get(n) })}>{badges.get(n)}</span>}
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
function PageView({ doc, pdfId, pageNum, zoom, tool, color, annotations, onRecord, onAsk, onAttachImage }) {
  const { t } = useT();
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

  // ---- Silgi: imlecin altındaki (biraz toleranslı) işaretlemeyi bulur ----
  const [erasing, setErasing] = useState(false);
  const [hoverId, setHoverId] = useState(null);
  const erased = useRef(new Set());
  const erasedBatch = useRef([]);
  const hitTest = (clientX, clientY) => {
    const [nx, ny] = toNorm(clientX, clientY);
    const px = nx * W;
    const py = ny * H;
    const tol = 9 / (scale || 1); // ekranda ~9 piksel
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i];
      if (a.type === 'highlight') {
        for (const [x, y, w, h] of a.rects) {
          if (px >= x * W - tol && px <= (x + w) * W + tol && py >= y * H - tol && py <= (y + h) * H + tol) return a.id;
        }
      } else if (a.type === 'ink') {
        const lim = tol + a.width / 2;
        const pts = a.points;
        for (let j = 0; j < pts.length; j++) {
          const ax = pts[j][0] * W;
          const ay = pts[j][1] * H;
          const b = pts[j + 1] || pts[j];
          const bx = b[0] * W;
          const by = b[1] * H;
          const dx = bx - ax;
          const dy = by - ay;
          const len2 = dx * dx + dy * dy;
          const tVal = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
          const qx = ax + tVal * dx - px;
          const qy = ay + tVal * dy - py;
          if (qx * qx + qy * qy <= lim * lim) return a.id;
        }
      }
    }
    return null;
  };
  const eraseAt = (e) => {
    const id = hitTest(e.clientX, e.clientY);
    if (id && !erased.current.has(id)) {
      const ann = annotations.find((a) => a.id === id);
      erased.current.add(id);
      if (ann) erasedBatch.current.push(ann);
      deleteAnnotation(id);
    }
  };

  // ---- Alan seçme (ekran görüntüsü) ----
  const [snipDrag, setSnipDrag] = useState(null); // { x0, y0, x1, y1 } sürüklerken
  const [snip, setSnip] = useState(null); // { rect, blob, x, y } bırakınca
  useEffect(() => {
    if (tool !== 'snip') setSnip(null);
  }, [tool]);
  const finishSnip = async (d) => {
    const x = Math.max(0, Math.min(d.x0, d.x1));
    const y = Math.max(0, Math.min(d.y0, d.y1));
    const w = Math.min(1, Math.max(d.x0, d.x1)) - x;
    const h = Math.min(1, Math.max(d.y0, d.y1)) - y;
    if (w * W * scale < 12 || h * H * scale < 12) return; // çok küçük, yanlışlıkla tıklama
    const rect = [x, y, w, h];
    const pr = pageRef.current.getBoundingClientRect();
    const sr = scrollerRef.current.getBoundingClientRect();
    const menuX = clampMenuX(pr.left - sr.left + scrollerRef.current.scrollLeft + (x + w / 2) * pr.width, scrollerRef.current, 210);
    const menuY = pr.top - sr.top + scrollerRef.current.scrollTop + (y + h) * pr.height + 8;
    setSnip({ rect, blob: null, x: menuX, y: menuY });
    const blob = await captureRegion(pageObj, rect);
    setSnip((s) => (s && s.rect === rect ? { ...s, blob } : s));
  };

  // ---- Kalem / fosforlu kalem ----
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (tool === 'snip') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      const [x, y] = toNorm(e.clientX, e.clientY);
      setSnip(null);
      setSnipDrag({ x0: x, y0: y, x1: x, y1: y });
    } else if (tool === 'eraser') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      setErasing(true);
      erasedBatch.current = [];
      eraseAt(e);
    } else if (tool === 'pen' || tool === 'marker') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      setDrawing({ points: [toNorm(e.clientX, e.clientY)] });
    } else if (tool === 'note') {
      const [x, y] = toNorm(e.clientX, e.clientY);
      addAnnotation(pdfId, pageNum, { type: 'note', color, x, y, text: '' }).then((ann) => {
        onRecord({ type: 'add', ann });
        setOpenNote(ann.id);
      });
    }
  };
  const onPointerMove = (e) => {
    if (tool === 'snip') {
      if (snipDrag) {
        const [x, y] = toNorm(e.clientX, e.clientY);
        setSnipDrag((d) => ({ ...d, x1: x, y1: y }));
      }
      return;
    }
    if (tool === 'eraser') {
      if (erasing) eraseAt(e);
      else setHoverId(hitTest(e.clientX, e.clientY));
      return;
    }
    if (!drawing) return;
    const pt = toNorm(e.clientX, e.clientY);
    setDrawing((d) => ({ points: [...d.points, pt] }));
  };
  const onPointerUp = () => {
    if (snipDrag) {
      const d = snipDrag;
      setSnipDrag(null);
      finishSnip(d);
      return;
    }
    if (erasing) {
      setErasing(false);
      if (erasedBatch.current.length) onRecord({ type: 'delete', anns: [...erasedBatch.current] });
      erasedBatch.current = [];
      erased.current.clear();
      return;
    }
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
    }).then((ann) => onRecord({ type: 'add', ann }));
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
          x: clampMenuX(last.left - sr.left + scrollerRef.current.scrollLeft + last.width / 2, scrollerRef.current, 180),
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
    const ann = await addAnnotation(pdfId, pageNum, {
      type: 'highlight',
      color,
      text: selection.text,
      rects: selection.rects.map((r) => r.map((v) => +v.toFixed(4))),
    });
    onRecord({ type: 'add', ann });
    clearSelection();
  };

  // Silginin üzerine geldiği işaretleme soluklaşır
  const hoverCls = (a) => (tool === 'eraser' && hoverId === a.id ? ' erase-hover' : '');

  const drawingMode = tool !== 'select';
  const cursor = { select: 'auto', snip: 'crosshair', pen: 'crosshair', marker: 'crosshair', note: 'copy', eraser: ERASER_CURSOR }[tool];

  // Ekranda gösterilecek seçim dikdörtgeni (sürüklerken ya da bıraktıktan sonra)
  const snipBox = snipDrag
    ? [Math.min(snipDrag.x0, snipDrag.x1), Math.min(snipDrag.y0, snipDrag.y1), Math.abs(snipDrag.x1 - snipDrag.x0), Math.abs(snipDrag.y1 - snipDrag.y0)]
    : snip?.rect;

  return (
    <div className="page-scroller" ref={scrollerRef} onScroll={() => selection && setSelection(null)}>
      {!scale && <div className="pdf-message">{t('pdf.preparing')}</div>}
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
          onPointerLeave={() => setHoverId(null)}
        >
          {annotations.map((a) =>
            a.type === 'highlight' ? (
              <g key={a.id} className={hoverCls(a)}>
                {a.rects.map(([x, y, w, h], i) => (
                  <rect key={i} x={x * W} y={y * H} width={w * W} height={h * H} rx={1.5} fill={colorOf(a.color)} className="hl-rect" />
                ))}
              </g>
            ) : a.type === 'ink' ? (
              <polyline
                key={a.id}
                points={a.points.map(([x, y]) => `${x * W},${y * H}`).join(' ')}
                fill="none"
                stroke={colorOf(a.color)}
                strokeWidth={a.width}
                strokeOpacity={a.opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={(a.opacity < 1 ? 'ink marker' : 'ink') + hoverCls(a)}
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
        {snipBox && (
          <div
            className="snip-box"
            style={{ left: `${snipBox[0] * 100}%`, top: `${snipBox[1] * 100}%`, width: `${snipBox[2] * 100}%`, height: `${snipBox[3] * 100}%` }}
          />
        )}
        {annotations
          .filter((a) => a.type === 'note')
          .map((a) => (
            <NotePin key={a.id} note={a} tool={tool} open={openNote === a.id} setOpen={(v) => setOpenNote(v ? a.id : null)} onRecord={onRecord} />
          ))}
      </div>

      {snip && (
        <SnipMenu
          snip={snip}
          onCopy={async () => {
            try {
              await copyImage(snip.blob);
              toast(t('pdf.snipCopied'));
            } catch {
              toast(t('pdf.snipCopyError'), 'error');
            }
            setSnip(null);
          }}
          onAttach={() => {
            onAttachImage(snip.blob);
            setSnip(null);
          }}
          onClose={() => setSnip(null)}
        />
      )}

      {selection && (
        <SelectionMenu
          selection={selection}
          color={color}
          onHighlight={highlightSelection}
          onCopy={async () => {
            await navigator.clipboard.writeText(selection.text);
            toast(t('pdf.textCopied'));
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
  const { t } = useT();
  const [aiOpen, setAiOpen] = useState(false);
  return (
    <div className="sel-menu" style={{ left: selection.x, top: selection.y }} onMouseUp={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
      {!aiOpen ? (
        <>
          <button onClick={onHighlight}>
            <span className="dot" style={{ background: colorOf(color) }} /> {t('pdf.highlight')}
          </button>
          <button className="ai" onClick={() => setAiOpen(true)}>
            <Sparkles size={14} /> {t('pdf.askAi')}
          </button>
          <button onClick={onCopy} title={t('common.copy')}>
            <Copy size={14} />
          </button>
        </>
      ) : (
        <>
          <span className="sel-label">{t('pdf.whereToAsk')}</span>
          {AI_TARGETS.map((target) => (
            <button key={target.id} onClick={() => onAsk(target.id)}>
              {target.label}
            </button>
          ))}
          <button onClick={() => onAsk(null)} title={t('pdf.copyPromptOnly')}>
            <Copy size={14} /> {t('common.copy')}
          </button>
        </>
      )}
    </div>
  );
}

function SnipMenu({ snip, onCopy, onAttach, onClose }) {
  const { t } = useT();
  const ready = !!snip.blob;
  return (
    <div className="sel-menu" style={{ left: snip.x, top: snip.y }} onPointerDown={(e) => e.stopPropagation()}>
      <button className="ai" disabled={!ready} onClick={onCopy} title={t('pdf.snipCopyTip')}>
        <Copy size={14} /> {ready ? t('common.copy') : t('pdf.preparingShort')}
      </button>
      <button disabled={!ready} onClick={onAttach} title={t('pdf.attachTip')}>
        <MessageSquarePlus size={14} /> {t('pdf.attachToQuestion')}
      </button>
      <button onClick={onClose} title={t('common.cancel')}>
        <X size={14} />
      </button>
    </div>
  );
}

function NotePin({ note, tool, open, setOpen, onRecord }) {
  const { t } = useT();
  const [text, setText] = useState(note.text);
  useEffect(() => setText(note.text), [note.text]);

  const save = () => {
    if (text !== note.text) {
      onRecord({ type: 'update', id: note.id, before: { text: note.text }, after: { text } });
      updateAnnotation(note.id, { text });
    }
  };

  const remove = () => {
    onRecord({ type: 'delete', anns: [{ ...note, text }] });
    deleteAnnotation(note.id);
  };

  return (
    <div className="note-pin" style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }} onPointerDown={(e) => e.stopPropagation()}>
      <button
        className="note-icon"
        style={{ '--c': colorOf(note.color) }}
        title={note.text || t('pdf.noteTitle')}
        onClick={() => (tool === 'eraser' ? remove() : setOpen(!open))}
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
            placeholder={t('pdf.notePlaceholder')}
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
            <button title={t('pdf.deleteNote')} onClick={remove}>
              <Trash2 size={14} />
            </button>
            <button
              title={t('common.close')}
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

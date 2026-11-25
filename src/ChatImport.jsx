import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessagesSquare, X, Pencil, Eye, Trash2, Scissors, ArrowLeft, Check, FileDown } from 'lucide-react';
import Markdown from './Markdown.jsx';
import { splitChat, toPairs, splitBlocks, messagesToBlocks, blocksToPairs } from './chatSplit.js';
import { htmlToMarkdown } from './paste.js';
import { addQA } from './db.js';
import { toast } from './ui.jsx';

const SOURCE_LABEL = { Antigravity: 'Antigravity', ChatGPT: 'ChatGPT', Claude: 'Claude', Gemini: 'Gemini', etiket: 'Etiketli metin' };

function AutoTextarea({ value, onChange, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 360) + 'px';
  }, [value]);
  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={1} {...rest} />;
}

export default function ChatImport({ sectionId, pdfMode, defaultPage, pageCount, onClose }) {
  const [step, setStep] = useState('paste'); // 'paste' | 'mark' | 'review'
  const [source, setSource] = useState(null);
  const [pairs, setPairs] = useState([]); // { question, answer, include, editing }
  const [blocks, setBlocks] = useState([]); // { md, q }
  const [typed, setTyped] = useState('');
  const [page, setPage] = useState(defaultPage || '');
  const [saving, setSaving] = useState(false);
  const [lastClip, setLastClip] = useState(null); // tanınmayan biçimi örnek olarak kaydetmek için

  const showPairs = (list, src) => {
    setPairs(list.map((p) => ({ ...p, include: true, editing: false })));
    setSource(src);
    setStep('review');
  };

  const handle = (html, text) => {
    setLastClip({ html, text });
    const res = splitChat({ html, text });
    if (res) {
      const list = toPairs(res.messages);
      if (list.length) return showPairs(list, res.source);
    }
    // Otomatik ayrılamadı: blokları elle işaretlet
    const md = html ? htmlToMarkdown(html) : text;
    if (!md.trim()) return;
    setBlocks(splitBlocks(md).map((m) => ({ md: m, q: false })));
    setSource(null);
    setStep('mark');
  };

  const onPaste = (e) => {
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (!html && !text) return;
    e.preventDefault();
    handle(html, text);
  };

  const toManual = () => {
    const msgs = pairs.flatMap((p) => [
      { role: 'user', md: p.question },
      { role: 'assistant', md: p.answer },
    ]);
    setBlocks(messagesToBlocks(msgs.filter((m) => m.md.trim())));
    setStep('mark');
  };

  const included = pairs.filter((p) => p.include);
  const invalid = included.filter((p) => !p.question.trim() || !p.answer.trim()).length;
  const update = (i, ch) => setPairs((ps) => ps.map((p, j) => (j === i ? { ...p, ...ch } : p)));

  const save = async () => {
    setSaving(true);
    try {
      const pg = pdfMode && page ? Number(page) : null;
      for (const p of included) await addQA(sectionId, p.question, p.answer, pg, null);
      toast(`${included.length} soru-cevap eklendi`);
      onClose();
    } catch (e) {
      toast('Kaydedilemedi: ' + e.message, 'error');
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  // Tanınmayan bir biçimi geliştiriciye göndermek için panodaki ham içeriği dosyaya kaydeder
  const saveSample = () => {
    const body = `=== HTML ===
${lastClip?.html || '(yok)'}

=== TEXT ===
${lastClip?.text || '(yok)'}
`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    a.download = 'sohbet-ornegi.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Örnek İndirilenler klasörüne kaydedildi');
  };

  const markedCount = useMemo(() => blocksToPairs(blocks).length, [blocks]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && step === 'paste' && onClose()}>
      <div className="chat-modal" role="dialog" aria-label="Sohbet yapıştır">
        <div className="chat-head">
          {step !== 'paste' && (
            <button className="icon-btn sm" title="Baştan" onClick={() => setStep('paste')}>
              <ArrowLeft size={17} />
            </button>
          )}
          <span className="modal-icon">
            <MessagesSquare size={19} />
          </span>
          <div className="chat-head-text">
            <h2>Sohbet yapıştır</h2>
            <div className="muted small">
              {step === 'paste' && 'Bir sohbetin tamamını yapıştır; soru ve cevapları ayırayım.'}
              {step === 'mark' && 'Senin yazdığın (soru) blokları tıklayarak işaretle.'}
              {step === 'review' && (
                <>
                  {source && <span className="chat-source">{SOURCE_LABEL[source] || source} biçimi tanındı</span>} {pairs.length} soru-cevap bulundu — kontrol et, gerekirse
                  düzelt.
                </>
              )}
            </div>
          </div>
          <button className="icon-btn sm" onClick={onClose} title="Kapat" disabled={saving}>
            <X size={17} />
          </button>
        </div>

        <div className="chat-body">
          {step === 'paste' && (
            <div className="chat-paste">
              <textarea
                className="chat-paste-area"
                autoFocus
                placeholder={'Sohbet sayfasında Ctrl+A ile her şeyi seç (ya da sohbeti fareyle seç), Ctrl+C ile kopyala, burada Ctrl+V yap.\n\nChatGPT, Claude, Gemini ve Antigravity otomatik tanınır. Başka bir yerden geliyorsa “Soru:” / “Cevap:” etiketli metin de olur.'}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onPaste={onPaste}
              />
              {typed.trim() && (
                <div className="chat-paste-actions">
                  <button className="btn primary" onClick={() => handle('', typed)}>
                    <Scissors size={16} /> Ayır
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'mark' && (
            <div className="chat-blocks">
              {!source && pairs.length === 0 && (
                <div className="chat-note">
                  Sohbeti otomatik ayıramadım. Sorduğun soruların olduğu blokları tıkla; aradaki bloklar cevap olur.
                  {lastClip && (
                    <button className="btn ghost sm chat-sample" onClick={saveSample} title="Bu biçimin tanınması için panodaki içeriği dosyaya kaydeder">
                      <FileDown size={14} /> Biçimi tanıması için örneği kaydet
                    </button>
                  )}
                </div>
              )}
              {blocks.map((b, i) => (
                <button
                  key={i}
                  className={'chat-block' + (b.q ? ' q' : '')}
                  onClick={() => setBlocks((bs) => bs.map((x, j) => (j === i ? { ...x, q: !x.q } : x)))}
                >
                  <span className="chat-block-tag">{b.q ? 'Soru' : 'Cevap'}</span>
                  <span className="chat-block-text">{b.md}</span>
                </button>
              ))}
            </div>
          )}

          {step === 'review' && (
            <div className="chat-pairs">
              {pairs.map((p, i) => (
                <div key={i} className={'chat-pair' + (p.include ? '' : ' off') + (p.include && (!p.question.trim() || !p.answer.trim()) ? ' bad' : '')}>
                  <div className="chat-pair-top">
                    <label className="chat-include" title={p.include ? 'Eklenecek' : 'Eklenmeyecek'}>
                      <input type="checkbox" checked={p.include} onChange={(e) => update(i, { include: e.target.checked })} />
                      <span className="qa-num">{i + 1}</span>
                    </label>
                    <AutoTextarea className="chat-q" value={p.question} onChange={(v) => update(i, { question: v })} placeholder="Soru (boş — yaz ya da bu çifti çıkar)" />
                    <button className="icon-btn sm danger" title="Bu çifti sil" onClick={() => setPairs((ps) => ps.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {p.include && (
                    <div className="chat-a">
                      {p.editing ? (
                        <AutoTextarea className="chat-a-edit" value={p.answer} onChange={(v) => update(i, { answer: v })} placeholder="Cevap" />
                      ) : p.answer.trim() ? (
                        <div className="chat-a-view">
                          <Markdown>{p.answer}</Markdown>
                        </div>
                      ) : (
                        <div className="muted small">Cevap yok</div>
                      )}
                      <button className="btn ghost sm chat-a-toggle" onClick={() => update(i, { editing: !p.editing })}>
                        {p.editing ? <Eye size={14} /> : <Pencil size={14} />} {p.editing ? 'Önizle' : 'Cevabı düzenle'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {step === 'mark' && (
          <div className="chat-foot">
            <span className="muted small">{blocks.filter((b) => b.q).length ? `${markedCount} soru-cevap olacak` : 'Henüz soru işaretlenmedi'}</span>
            <button className="btn primary" disabled={!blocks.some((b) => b.q)} onClick={() => showPairs(blocksToPairs(blocks), source)}>
              Devam <Check size={16} />
            </button>
          </div>
        )}
        {step === 'review' && (
          <div className="chat-foot">
            <button className="btn ghost sm" onClick={toManual} title="Soru/cevap sınırlarını bloklar üzerinden elle düzelt">
              <Scissors size={14} /> Elle ayır
            </button>
            {pdfMode && (
              <label className="chat-page">
                Sayfa
                <input type="number" min={1} max={pageCount || undefined} value={page} onChange={(e) => setPage(e.target.value)} placeholder="—" />
              </label>
            )}
            <span className="chat-foot-gap" />
            {invalid > 0 && <span className="chat-warn">{invalid} çiftte soru ya da cevap boş</span>}
            <button className="btn primary" disabled={!included.length || invalid > 0 || saving} onClick={save}>
              {included.length} soru-cevabı ekle
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

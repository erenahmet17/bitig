import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessagesSquare, X, Pencil, Eye, Trash2, Scissors, ArrowLeft, Check, FileDown } from 'lucide-react';
import Markdown from './Markdown.jsx';
import { splitChat, toPairs, splitBlocks, messagesToBlocks, blocksToPairs } from './chatSplit.js';
import { htmlToMarkdown } from './paste.js';
import { addQA } from './db.js';
import { toast } from './ui.jsx';
import { useT } from './i18n.js';

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
  const { t } = useT();
  const [step, setStep] = useState('paste'); // 'paste' | 'mark' | 'review'
  const [source, setSource] = useState(null);
  const [pairs, setPairs] = useState([]); // { question, answer, include, editing }
  const [blocks, setBlocks] = useState([]); // { md, q }
  const [typed, setTyped] = useState('');
  const [page, setPage] = useState(defaultPage || '');
  const [saving, setSaving] = useState(false);
  const [lastClip, setLastClip] = useState(null); // tanınmayan biçimi örnek olarak kaydetmek için

  const sourceLabel = (s) => (s === 'etiket' ? t('chat.sourceLabel.etiket') : s);

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
      toast(t('chat.addedToast', { n: included.length }));
      onClose();
    } catch (e) {
      toast(t('chat.saveError', { msg: e.message }), 'error');
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
${lastClip?.html || '(none)'}

=== TEXT ===
${lastClip?.text || '(none)'}
`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    a.download = 'sohbet-ornegi.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(t('chat.sampleSaved'));
  };

  const markedCount = useMemo(() => blocksToPairs(blocks).length, [blocks]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && step === 'paste' && onClose()}>
      <div className="chat-modal" role="dialog" aria-label={t('chat.title')}>
        <div className="chat-head">
          {step !== 'paste' && (
            <button className="icon-btn sm" title={t('chat.startOver')} onClick={() => setStep('paste')}>
              <ArrowLeft size={17} />
            </button>
          )}
          <span className="modal-icon">
            <MessagesSquare size={19} />
          </span>
          <div className="chat-head-text">
            <h2>{t('chat.title')}</h2>
            <div className="muted small">
              {step === 'paste' && t('chat.step.paste')}
              {step === 'mark' && t('chat.step.mark')}
              {step === 'review' && (
                <>
                  {source && <span className="chat-source">{t('chat.sourceRecognized', { source: sourceLabel(source) })}</span>}{' '}
                  {t('chat.foundPairs', { n: pairs.length })}
                </>
              )}
            </div>
          </div>
          <button className="icon-btn sm" onClick={onClose} title={t('common.close')} disabled={saving}>
            <X size={17} />
          </button>
        </div>

        <div className="chat-body">
          {step === 'paste' && (
            <div className="chat-paste">
              <textarea
                className="chat-paste-area"
                autoFocus
                placeholder={t('chat.pastePlaceholder')}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onPaste={onPaste}
              />
              {typed.trim() && (
                <div className="chat-paste-actions">
                  <button className="btn primary" onClick={() => handle('', typed)}>
                    <Scissors size={16} /> {t('chat.split')}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'mark' && (
            <div className="chat-blocks">
              {!source && pairs.length === 0 && (
                <div className="chat-note">
                  {t('chat.manualNote')}
                  {lastClip && (
                    <button className="btn ghost sm chat-sample" onClick={saveSample} title={t('chat.saveSampleTip')}>
                      <FileDown size={14} /> {t('chat.saveSample')}
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
                  <span className="chat-block-tag">{b.q ? t('chat.tagQ') : t('chat.tagA')}</span>
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
                    <label className="chat-include" title={p.include ? t('chat.includeTip') : t('chat.excludeTip')}>
                      <input type="checkbox" checked={p.include} onChange={(e) => update(i, { include: e.target.checked })} />
                      <span className="qa-num">{i + 1}</span>
                    </label>
                    <AutoTextarea className="chat-q" value={p.question} onChange={(v) => update(i, { question: v })} placeholder={t('chat.emptyQPlaceholder')} />
                    <button className="icon-btn sm danger" title={t('chat.deletePair')} onClick={() => setPairs((ps) => ps.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {p.include && (
                    <div className="chat-a">
                      {p.editing ? (
                        <AutoTextarea className="chat-a-edit" value={p.answer} onChange={(v) => update(i, { answer: v })} placeholder={t('form.answer')} />
                      ) : p.answer.trim() ? (
                        <div className="chat-a-view">
                          <Markdown>{p.answer}</Markdown>
                        </div>
                      ) : (
                        <div className="muted small">{t('common.noAnswer')}</div>
                      )}
                      <button className="btn ghost sm chat-a-toggle" onClick={() => update(i, { editing: !p.editing })}>
                        {p.editing ? <Eye size={14} /> : <Pencil size={14} />} {p.editing ? t('form.preview') : t('chat.editAnswer')}
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
            <span className="muted small">{blocks.filter((b) => b.q).length ? t('chat.willCreate', { n: markedCount }) : t('chat.noneMarked')}</span>
            <button className="btn primary" disabled={!blocks.some((b) => b.q)} onClick={() => showPairs(blocksToPairs(blocks), source)}>
              {t('chat.continue')} <Check size={16} />
            </button>
          </div>
        )}
        {step === 'review' && (
          <div className="chat-foot">
            <button className="btn ghost sm" onClick={toManual} title={t('chat.manualSplitTip')}>
              <Scissors size={14} /> {t('chat.manualSplit')}
            </button>
            {pdfMode && (
              <label className="chat-page">
                {t('common.page')}
                <input type="number" min={1} max={pageCount || undefined} value={page} onChange={(e) => setPage(e.target.value)} placeholder="—" />
              </label>
            )}
            <span className="chat-foot-gap" />
            {invalid > 0 && <span className="chat-warn">{t('chat.invalidWarn', { n: invalid })}</span>}
            <button className="btn primary" disabled={!included.length || invalid > 0 || saving} onClick={save}>
              {t('chat.addCount', { n: included.length })}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

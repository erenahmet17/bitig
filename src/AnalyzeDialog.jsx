import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Copy, Check, ExternalLink } from 'lucide-react';
import { toast } from './ui.jsx';
import { collectExport } from './export/collect.js';
import { GOALS, buildAnalysisText, sizeInfo } from './analyze.js';
import { useT } from './i18n.js';

// Metin uzun olduğu için adres çubuğuyla gönderilemez: panoya kopyalanır, site açılır, kullanıcı yapıştırır
const AI_HOMES = [
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
];

const read = (k, d) => {
  try {
    return localStorage.getItem(k) || d;
  } catch {
    return d;
  }
};

function Segmented({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={'seg-opt' + (value === o.value ? ' on' : '')} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AnalyzeDialog({ section, tree, count, onClose }) {
  const { t, lang } = useT();
  const [goal, setGoal] = useState(() => read('analyze-goal', 'gaps'));
  const [content, setContent] = useState(() => read('analyze-content', 'qa'));
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const hasSubs = (tree.children.get(section.id) || []).length > 0;

  const fmt = (n) =>
    n >= 1000 ? (n / 1000).toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR', { maximumFractionDigits: 1 }) + t('analyze.thousand') : String(n);

  useEffect(() => {
    collectExport(section.id, tree).then(setData);
  }, [section.id, tree]);

  useEffect(() => {
    try {
      localStorage.setItem('analyze-goal', goal);
      localStorage.setItem('analyze-content', content);
    } catch {}
  }, [goal, content]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const text = useMemo(() => (data ? buildAnalysisText(data, { goal, answers: content === 'qa', lang }) : ''), [data, goal, content, lang]);
  const size = useMemo(() => sizeInfo(text), [text]);
  const reviewCount = useMemo(
    () => (data ? data.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.qas.filter((q) => q.status === 'review').length, 0), 0) : 0),
    [data]
  );

  const copy = async (target) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      if (target) {
        window.open(target.url, '_blank', 'noopener');
        toast(t('analyze.copiedOpen', { label: target.label }));
      } else toast(t('analyze.copiedOnly'));
    } catch {
      toast(t('common.copyError'), 'error');
    }
  };

  const g = GOALS.find((x) => x.id === goal) || GOALS[0];

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="export-modal analyze-modal" role="dialog" aria-label={t('analyze.title')}>
        <div className="export-head">
          <span className="modal-icon">
            <Sparkles size={19} />
          </span>
          <div>
            <h2>{t('analyze.title')}</h2>
            <div className="muted small">
              {t('analyze.meta', {
                name: section.name,
                subs: hasSubs ? t('analyze.andSubs') : '',
                count,
                review: reviewCount ? t('analyze.metaReview', { n: reviewCount }) : '',
              })}
            </div>
          </div>
          <button className="icon-btn sm" onClick={onClose} title={t('common.close')}>
            <X size={17} />
          </button>
        </div>

        <div className="export-field">
          <div className="export-label">{t('analyze.whatWant')}</div>
          <Segmented value={goal} onChange={setGoal} options={GOALS.map((x) => ({ value: x.id, label: t(x.labelKey) }))} />
          <div className="export-hint">{t(g.hintKey)}</div>
        </div>

        <div className="export-field">
          <div className="export-label">{t('analyze.content')}</div>
          <Segmented
            value={content}
            onChange={setContent}
            options={[
              { value: 'qa', label: t('analyze.qa') },
              { value: 'q', label: t('analyze.qOnly') },
            ]}
          />
          <div className={'export-hint analyze-size ' + size.level}>
            {data ? (
              <>
                {t('analyze.sizeLine', { chars: fmt(size.chars), tokens: fmt(size.tokens) })}
                {size.level === 'mid' && t('analyze.sizeMid')}
                {size.level === 'high' && t('analyze.sizeHigh')}
                {size.level !== 'ok' && content === 'qa' && t('analyze.sizeTip')}
              </>
            ) : (
              t('analyze.preparing')
            )}
          </div>
        </div>

        <details className="analyze-preview">
          <summary>{t('analyze.previewSummary')}</summary>
          <textarea readOnly value={text} rows={10} />
        </details>

        <div className="analyze-open">
          <span className="export-label">{t('analyze.copyAndOpen')}</span>
          {AI_HOMES.map((target) => (
            <button key={target.id} className="btn sm" disabled={!data || !count} onClick={() => copy(target)}>
              {target.label} <ExternalLink size={13} />
            </button>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
          <button className="btn primary" onClick={() => copy(null)} disabled={!data || !count} autoFocus>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? t('common.copied') : t('common.copy')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

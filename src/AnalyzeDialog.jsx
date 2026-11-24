import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Copy, Check, ExternalLink } from 'lucide-react';
import { toast } from './ui.jsx';
import { collectExport } from './export/collect.js';
import { GOALS, buildAnalysisText, sizeInfo } from './analyze.js';

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

const fmt = (n) => (n >= 1000 ? (n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' bin' : String(n));

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
  const [goal, setGoal] = useState(() => read('analyze-goal', 'gaps'));
  const [content, setContent] = useState(() => read('analyze-content', 'qa'));
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const hasSubs = (tree.children.get(section.id) || []).length > 0;

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

  const text = useMemo(() => (data ? buildAnalysisText(data, { goal, answers: content === 'qa' }) : ''), [data, goal, content]);
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
        toast(`Kopyalandı — ${target.label}'te Ctrl+V ile yapıştır`);
      } else toast('Kopyalandı — yapay zekâya Ctrl+V ile yapıştır');
    } catch {
      toast('Panoya kopyalanamadı', 'error');
    }
  };

  const g = GOALS.find((x) => x.id === goal) || GOALS[0];

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="export-modal analyze-modal" role="dialog" aria-label="Yapay zekâya analiz ettir">
        <div className="export-head">
          <span className="modal-icon">
            <Sparkles size={19} />
          </span>
          <div>
            <h2>Yapay zekâya analiz ettir</h2>
            <div className="muted small">
              “{section.name}”{hasSubs ? ' ve alt bölümleri' : ''} · {count} soru{reviewCount ? ` · ${reviewCount} tekrar bak` : ''}
            </div>
          </div>
          <button className="icon-btn sm" onClick={onClose} title="Kapat">
            <X size={17} />
          </button>
        </div>

        <div className="export-field">
          <div className="export-label">Ne istiyorsun?</div>
          <Segmented value={goal} onChange={setGoal} options={GOALS.map((x) => ({ value: x.id, label: x.label }))} />
          <div className="export-hint">{g.hint}</div>
        </div>

        <div className="export-field">
          <div className="export-label">İçerik</div>
          <Segmented
            value={content}
            onChange={setContent}
            options={[
              { value: 'qa', label: 'Sorular + cevaplar' },
              { value: 'q', label: 'Sadece sorular' },
            ]}
          />
          <div className={'export-hint analyze-size ' + size.level}>
            {data ? (
              <>
                ≈ {fmt(size.chars)} karakter (~{fmt(size.tokens)} token).{' '}
                {size.level === 'mid' && 'Uzun bir metin; bazı ücretsiz sürümler kesebilir.'}
                {size.level === 'high' && 'Çok uzun; yapay zekâ metnin hepsini okuyamayabilir. “Sadece sorular” ya da daha küçük bir bölüm dene.'}
                {size.level !== 'ok' && content === 'qa' && ' “Sadece sorular” çok daha kısa olur.'}
              </>
            ) : (
              'Hazırlanıyor…'
            )}
          </div>
        </div>

        <details className="analyze-preview">
          <summary>Kopyalanacak metni gör</summary>
          <textarea readOnly value={text} rows={10} />
        </details>

        <div className="analyze-open">
          <span className="export-label">Kopyala ve aç:</span>
          {AI_HOMES.map((t) => (
            <button key={t.id} className="btn sm" disabled={!data || !count} onClick={() => copy(t)}>
              {t.label} <ExternalLink size={13} />
            </button>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Kapat
          </button>
          <button className="btn primary" onClick={() => copy(null)} disabled={!data || !count} autoFocus>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, FileType2, X, Loader2 } from 'lucide-react';
import { toast } from '../ui.jsx';
import { collectExport, fileName } from './collect.js';

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
          {o.icon && <o.icon size={15} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function ExportDialog({ section, tree, count, onClose }) {
  const [content, setContent] = useState(() => read('export-content', 'qa'));
  const [format, setFormat] = useState(() => read('export-format', 'pdf'));
  const [busy, setBusy] = useState(false);
  const hasSubs = (tree.children.get(section.id) || []).length > 0;

  useEffect(() => {
    try {
      localStorage.setItem('export-content', content);
      localStorage.setItem('export-format', format);
    } catch {}
  }, [content, format]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const run = async () => {
    setBusy(true);
    try {
      const data = await collectExport(section.id, tree);
      const opts = { answers: content === 'qa' };
      if (format === 'pdf') {
        const { exportPdf } = await import('./print.js');
        onClose();
        await exportPdf(data, opts);
      } else {
        const { exportWord } = await import('./word.js');
        const blob = await exportWord(data, opts);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName(data.title) + (opts.answers ? '' : ' - sorular') + '.docx';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('Word dosyası indirildi');
        onClose();
      }
    } catch (e) {
      console.error(e);
      toast('Dışa aktarılamadı: ' + e.message, 'error');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="export-modal" role="dialog" aria-label="Dışa aktar">
        <div className="export-head">
          <span className="modal-icon">
            <Download size={19} />
          </span>
          <div>
            <h2>Dışa aktar</h2>
            <div className="muted small">
              “{section.name}”{hasSubs ? ' ve alt bölümleri' : ''} · {count} soru
            </div>
          </div>
          <button className="icon-btn sm" onClick={onClose} title="Kapat" disabled={busy}>
            <X size={17} />
          </button>
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
          <div className="export-hint">
            {content === 'qa' ? 'Formüller, tablolar, kodlar ve soru görselleri dahil.' : 'Çalışma kâğıdı gibi: her sorunun altında cevap için boşluk bırakılır.'}
          </div>
        </div>

        <div className="export-field">
          <div className="export-label">Biçim</div>
          <Segmented
            value={format}
            onChange={setFormat}
            options={[
              { value: 'pdf', label: 'PDF', icon: FileText },
              { value: 'docx', label: 'Word (.docx)', icon: FileType2 },
            ]}
          />
          <div className="export-hint">
            {format === 'pdf'
              ? 'Yazdırma penceresi açılır; “Hedef” olarak “PDF olarak kaydet”i seç.'
              : 'Formüller Word’de düzenlenebilir denklem olarak gelir.'}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn primary" onClick={run} disabled={busy || !count} autoFocus>
            {busy ? <Loader2 size={16} className="spin" /> : <Download size={16} />} {busy ? 'Hazırlanıyor…' : 'Dışa aktar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

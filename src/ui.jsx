import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { t } from './i18n.js';

// Tarayıcının çirkin confirm/alert pencereleri yerine uygulama içi diyalog ve bildirimler.
// Kullanım: await ask({ title, message, buttons: [{ label, value, variant }] })

let pushDialog = null;
let pushToast = null;

export function ask(options) {
  return new Promise((resolve) => pushDialog?.({ ...options, resolve }));
}

export function confirmDanger({ title, message, confirmLabel }) {
  return ask({
    title,
    message,
    tone: 'danger',
    buttons: [
      { label: t('common.cancel'), value: false },
      { label: confirmLabel || t('common.delete'), value: true, variant: 'danger' },
    ],
  });
}

export function toast(message, tone = 'success') {
  pushToast?.({ id: Math.random(), message, tone });
}

export function UIHost() {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    pushDialog = setDialog;
    pushToast = (t) => {
      setToasts((list) => [...list, t]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), 2600);
    };
    return () => {
      pushDialog = null;
      pushToast = null;
    };
  }, []);

  return (
    <>
      {dialog && <Dialog {...dialog} onClose={() => setDialog(null)} />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + t.tone}>
            {t.tone === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}

function Dialog({ title, message, buttons, tone, resolve, onClose }) {
  const primaryRef = useRef(null);
  const close = (value) => {
    resolve(value);
    onClose();
  };

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && close(undefined);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Icon = tone === 'danger' ? AlertTriangle : Info;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(undefined)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className={'modal-icon ' + (tone || '')}>
          <Icon size={20} />
        </div>
        <div className="modal-body">
          <h2 id="modal-title">{title}</h2>
          {message && <div className="modal-message">{message}</div>}
        </div>
        <div className="modal-actions">
          {buttons.map((b, i) => (
            <button
              key={i}
              ref={i === buttons.length - 1 ? primaryRef : null}
              className={b.variant === 'danger' ? 'btn danger-solid' : b.variant === 'primary' ? 'btn primary' : 'btn'}
              onClick={() => close(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

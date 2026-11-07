import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addSection, renameSection, addQA, updateQA, deleteQA, moveItem } from './db.js';
import { confirmDeleteSection } from './Sidebar.jsx';
import InlineInput from './InlineInput.jsx';
import Markdown from './Markdown.jsx';
import { handleSmartPaste } from './paste.js';

export default function SectionView({ section, path, subsections, onSelect, onExpand }) {
  const qas = useLiveQuery(() => db.qas.where('sectionId').equals(section.id).sortBy('order'), [section.id]);
  const [openIds, setOpenIds] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [addingSub, setAddingSub] = useState(false);

  const toggle = (id) =>
    setOpenIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const allOpen = qas?.length > 0 && qas.every((q) => openIds.has(q.id));

  return (
    <div className="section-view">
      <div className="breadcrumb">
        {path.map((p, i) => (
          <span key={p.id}>
            {i > 0 && <span className="sep">›</span>}
            {i < path.length - 1 ? <button onClick={() => onSelect(p.id)}>{p.name}</button> : <span>{p.name}</span>}
          </span>
        ))}
      </div>

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
          <button onClick={() => setRenaming(true)}>✎ Adlandır</button>
          <button className="danger" onClick={() => confirmDeleteSection(section)}>🗑 Sil</button>
        </div>
      </header>

      {/* Alt bölümler */}
      <div className="subsections">
        {subsections.map((s) => (
          <button key={s.id} className="chip" onClick={() => onSelect(s.id)}>
            📁 {s.name}
          </button>
        ))}
        {addingSub ? (
          <span className="chip editing">
            <InlineInput
              placeholder="Bölüm adı"
              onSubmit={async (n) => {
                setAddingSub(false);
                await addSection(section.id, n);
                onExpand(section.id);
              }}
              onCancel={() => setAddingSub(false)}
            />
          </span>
        ) : (
          <button className="chip ghost" onClick={() => setAddingSub(true)}>
            + Alt bölüm
          </button>
        )}
      </div>

      {/* Soru-cevaplar */}
      <div className="qa-toolbar">
        <span className="muted">{qas ? `${qas.length} soru` : ''}</span>
        {qas?.length > 0 && (
          <button className="link-btn" onClick={() => setOpenIds(allOpen ? new Set() : new Set(qas.map((q) => q.id)))}>
            {allOpen ? 'Tümünü kapat' : 'Tümünü aç'}
          </button>
        )}
      </div>

      <div className="qa-list">
        {qas?.map((qa, i) =>
          editingId === qa.id ? (
            <QAForm
              key={qa.id}
              initial={qa}
              submitLabel="Kaydet"
              onSubmit={async (q, a) => {
                await updateQA(qa.id, q, a);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <QAItem
              key={qa.id}
              qa={qa}
              index={i + 1}
              open={openIds.has(qa.id)}
              onToggle={() => toggle(qa.id)}
              onEdit={() => setEditingId(qa.id)}
              onDelete={() => window.confirm('Bu soru-cevap silinsin mi?') && deleteQA(qa.id)}
              onMove={(d) => moveItem('qas', qa.id, d)}
            />
          )
        )}
        {qas?.length === 0 && !adding && (
          <div className="empty">Bu bölümde henüz soru yok. Yapay zekâya sorduğun bir soruyu ve cevabını ekle.</div>
        )}
      </div>

      {adding ? (
        <QAForm
          keepOpen
          submitLabel="Ekle"
          onSubmit={(q, a) => addQA(section.id, q, a)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button className="primary add-qa" onClick={() => setAdding(true)}>
          + Soru-cevap ekle
        </button>
      )}
    </div>
  );
}

function QAItem({ qa, index, open, onToggle, onEdit, onDelete, onMove }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(qa.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className={'qa' + (open ? ' open' : '')}>
      <button className="qa-question" onClick={onToggle} aria-expanded={open}>
        <span className="qa-num">{index}</span>
        <span className="qa-q-text">{qa.question}</span>
        <span className="qa-chev">▸</span>
      </button>
      {open && (
        <div className="qa-answer">
          <Markdown>{qa.answer}</Markdown>
          <div className="qa-actions">
            <button onClick={onEdit}>✎ Düzenle</button>
            <button onClick={copy}>{copied ? '✓ Kopyalandı' : '⧉ Cevabı kopyala'}</button>
            <button onClick={() => onMove(-1)} title="Yukarı taşı">↑</button>
            <button onClick={() => onMove(1)} title="Aşağı taşı">↓</button>
            <button className="danger" onClick={onDelete}>🗑 Sil</button>
          </div>
        </div>
      )}
    </div>
  );
}

function QAForm({ initial, submitLabel, onSubmit, onCancel, keepOpen }) {
  const [question, setQuestion] = useState(initial?.question || '');
  const [answer, setAnswer] = useState(initial?.answer || '');
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(false);
  const canSave = question.trim() && answer.trim();

  const submit = async () => {
    if (!canSave) return;
    await onSubmit(question, answer);
    if (keepOpen) {
      // Art arda hızlıca yapıştırabilmek için form açık kalır
      setQuestion('');
      setAnswer('');
      setPreview(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      document.getElementById('qa-form-question')?.focus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="qa-form" onKeyDown={onKeyDown}>
      <label>
        Soru
        <textarea
          id={keepOpen ? 'qa-form-question' : undefined}
          autoFocus
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Yapay zekâya sorduğun soruyu yapıştır…"
        />
      </label>
      <label>
        <span className="label-row">
          Cevap
          <span className="tabs">
            <button type="button" className={!preview ? 'on' : ''} onClick={() => setPreview(false)}>Yaz</button>
            <button type="button" className={preview ? 'on' : ''} onClick={() => setPreview(true)}>Önizle</button>
          </span>
        </span>
        {preview ? (
          <div className="preview">{answer.trim() ? <Markdown>{answer}</Markdown> : <span className="muted">Önizlenecek bir şey yok.</span>}</div>
        ) : (
          <textarea
            rows={10}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onPaste={handleSmartPaste}
            placeholder="Cevabı yapıştır… (Markdown, tablo, kod ve $formül$ desteklenir)"
          />
        )}
      </label>
      <div className="form-actions">
        <span className="muted small">{saved ? '✓ Eklendi, sıradakini yapıştırabilirsin' : 'Ctrl+Enter ile kaydet · Esc ile kapat · Ctrl+Shift+V biçimsiz yapıştırır'}</span>
        <button onClick={onCancel}>{keepOpen ? 'Kapat' : 'Vazgeç'}</button>
        <button className="primary" disabled={!canSave} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

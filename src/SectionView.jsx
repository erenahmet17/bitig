import { useState } from 'react';
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
} from 'lucide-react';
import { db, addSection, renameSection, addQA, updateQA, deleteQA, moveItem } from './db.js';
import { confirmDeleteSection } from './Sidebar.jsx';
import InlineInput from './InlineInput.jsx';
import Markdown from './Markdown.jsx';
import { handleSmartPaste } from './paste.js';
import { confirmDanger, toast } from './ui.jsx';

function countAll(id, tree, qaCounts) {
  let n = qaCounts.get(id) || 0;
  for (const c of tree.children.get(id) || []) n += countAll(c.id, tree, qaCounts);
  return n;
}

export default function SectionView({ section, path, subsections, tree, qaCounts, onSelect, onExpand }) {
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

  const startAdding = () => {
    setAdding(true);
    setTimeout(() => document.getElementById('qa-form-question')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  return (
    <div className="section-view">
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
            <button className="icon-btn" title="Yeniden adlandır" onClick={() => setRenaming(true)}>
              <Pencil size={17} />
            </button>
            <button className="icon-btn danger" title="Bu bölümü sil" onClick={() => confirmDeleteSection(section)}>
              <Trash2 size={17} />
            </button>
          </div>
        </header>
      </div>

      {/* Alt bölümler */}
      {(subsections.length > 0 || addingSub) && (
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
      )}

      {/* Soru-cevaplar */}
      <section className="block">
        <div className="qa-toolbar">
          <h2 className="block-title">
            Sorular {qas?.length > 0 && <span className="pill">{qas.length}</span>}
          </h2>
          <div className="toolbar-actions">
            {qas?.length > 1 && (
              <button className="btn ghost sm" onClick={() => setOpenIds(allOpen ? new Set() : new Set(qas.map((q) => q.id)))}>
                {allOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
                {allOpen ? 'Tümünü kapat' : 'Tümünü aç'}
              </button>
            )}
            {!addingSub && (
              <button className="btn ghost sm" onClick={() => setAddingSub(true)}>
                <FolderPlus size={15} /> Alt bölüm
              </button>
            )}
            {!adding && (
              <button className="btn primary sm" onClick={startAdding}>
                <Plus size={15} /> Soru ekle
              </button>
            )}
          </div>
        </div>

        <div className="qa-list">
          {qas?.map((qa, i) =>
            editingId === qa.id ? (
              <QAForm
                key={qa.id}
                initial={qa}
                title="Soru-cevabı düzenle"
                submitLabel="Kaydet"
                onSubmit={async (q, a) => {
                  await updateQA(qa.id, q, a);
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
                isLast={i === qas.length - 1}
                open={openIds.has(qa.id)}
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
            )
          )}
          {qas?.length === 0 && !adding && (
            <div className="empty">
              <div className="empty-icon">
                <MessageCircleQuestion size={26} />
              </div>
              <div className="empty-title">Bu bölümde henüz soru yok</div>
              <div className="empty-text">Yapay zekâya sorduğun bir soruyu ve aldığın cevabı buraya yapıştır.</div>
              <button className="btn primary" onClick={startAdding}>
                <Plus size={16} /> İlk soruyu ekle
              </button>
            </div>
          )}
        </div>

        {adding && (
          <QAForm
            keepOpen
            title="Yeni soru-cevap"
            submitLabel="Ekle"
            onSubmit={(q, a) => addQA(section.id, q, a)}
            onCancel={() => setAdding(false)}
          />
        )}
        {!adding && qas?.length > 0 && (
          <button className="add-qa-bottom" onClick={startAdding}>
            <Plus size={16} /> Soru-cevap ekle
          </button>
        )}
      </section>
    </div>
  );
}

function QAItem({ qa, index, isFirst, isLast, open, onToggle, onEdit, onDelete, onMove }) {
  const [copied, setCopied] = useState(false);
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
        <span className="qa-q-text">{qa.question}</span>
        <ChevronDown size={18} className="qa-chev" />
      </button>
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
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function QAForm({ initial, title, submitLabel, onSubmit, onCancel, keepOpen }) {
  const [question, setQuestion] = useState(initial?.question || '');
  const [answer, setAnswer] = useState(initial?.answer || '');
  const [preview, setPreview] = useState(false);
  const canSave = question.trim() && answer.trim();

  const submit = async () => {
    if (!canSave) return;
    await onSubmit(question, answer);
    if (keepOpen) {
      // Art arda hızlıca yapıştırabilmek için form açık kalır
      setQuestion('');
      setAnswer('');
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
  };

  return (
    <div className="qa-form" onKeyDown={onKeyDown}>
      <div className="form-head">
        <span>{title}</span>
        <button className="icon-btn sm" title="Kapat (Esc)" onClick={onCancel}>
          <X size={16} />
        </button>
      </div>
      <label className="field">
        <span className="field-label">Soru</span>
        <textarea
          id={keepOpen ? 'qa-form-question' : undefined}
          autoFocus
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Yapay zekâya sorduğun soruyu yapıştır…"
        />
      </label>
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

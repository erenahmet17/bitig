import { useRef, useState } from 'react';
import { ROOT, addSection, renameSection, deleteSection, collectSubtree, moveItem, exportAll, importAll } from './db.js';
import InlineInput from './InlineInput.jsx';
import { useInstallPrompt } from './install.js';

export async function confirmDeleteSection(section) {
  const { ids, qaCount } = await collectSubtree(section.id);
  const sub = ids.length - 1;
  const details = [sub ? `${sub} alt bölüm` : null, qaCount ? `${qaCount} soru-cevap` : null].filter(Boolean).join(' ve ');
  const msg = `“${section.name}” silinsin mi?` + (details ? `\n\nİçindeki ${details} da silinecek.` : '') + '\n\nBu işlem geri alınamaz.';
  if (window.confirm(msg)) await deleteSection(section.id);
}

export default function Sidebar({ tree, selectedId, expanded, onSelect, onToggle, theme, onToggleTheme }) {
  // editing: { type: 'add', parentId } | { type: 'rename', id }
  const [editing, setEditing] = useState(null);
  const { canInstall, install } = useInstallPrompt();
  const roots = tree.children.get(ROOT) || [];

  const handleAdd = async (parentId, name) => {
    setEditing(null);
    const id = await addSection(parentId, name);
    if (parentId !== ROOT) onToggle(parentId, true);
    onSelect(id);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="logo">
          <img src="/favicon.svg" alt="" width="22" height="22" /> Ders Defteri
        </span>
        <span className="head-btns">
          {canInstall && (
            <button className="install-btn" onClick={install} title="Bilgisayara uygulama olarak yükle">
              ⤓ Yükle
            </button>
          )}
          <button className="icon-btn" onClick={onToggleTheme} title={theme === 'dark' ? 'Açık tema' : 'Koyu tema'}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </span>
      </div>

      <nav className="tree">
        {roots.map((s) => (
          <TreeNode
            key={s.id}
            node={s}
            depth={0}
            tree={tree}
            selectedId={selectedId}
            expanded={expanded}
            onSelect={onSelect}
            onToggle={onToggle}
            editing={editing}
            setEditing={setEditing}
            onAdd={handleAdd}
          />
        ))}
        {editing?.type === 'add' && editing.parentId === ROOT ? (
          <div className="tree-row" style={{ '--depth': 0 }}>
            <span className="chev" />
            <InlineInput placeholder="Ders adı" onSubmit={(n) => handleAdd(ROOT, n)} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <button className="add-course" onClick={() => setEditing({ type: 'add', parentId: ROOT })}>
            + Yeni ders
          </button>
        )}
      </nav>

      <Backup />
    </aside>
  );
}

function TreeNode({ node, depth, tree, selectedId, expanded, onSelect, onToggle, editing, setEditing, onAdd }) {
  const kids = tree.children.get(node.id) || [];
  const isOpen = expanded.includes(node.id);
  const isRenaming = editing?.type === 'rename' && editing.id === node.id;
  const isAddingChild = editing?.type === 'add' && editing.parentId === node.id;

  return (
    <div>
      <div
        className={'tree-row' + (selectedId === node.id ? ' active' : '') + (depth === 0 ? ' course' : '')}
        style={{ '--depth': depth }}
      >
        <button
          className={'chev' + (kids.length ? '' : ' empty') + (isOpen ? ' open' : '')}
          onClick={() => onToggle(node.id)}
          tabIndex={kids.length ? 0 : -1}
          aria-label={isOpen ? 'Kapat' : 'Aç'}
        >
          ▸
        </button>
        {isRenaming ? (
          <InlineInput
            initial={node.name}
            onSubmit={async (n) => {
              setEditing(null);
              await renameSection(node.id, n);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <button className="tree-label" onClick={() => onSelect(node.id)} onDoubleClick={() => setEditing({ type: 'rename', id: node.id })} title={node.name}>
              {node.name}
            </button>
            <span className="row-actions">
              <button title="Alt bölüm ekle" onClick={() => setEditing({ type: 'add', parentId: node.id })}>+</button>
              <button title="Yeniden adlandır" onClick={() => setEditing({ type: 'rename', id: node.id })}>✎</button>
              <button title="Yukarı taşı" onClick={() => moveItem('sections', node.id, -1)}>↑</button>
              <button title="Aşağı taşı" onClick={() => moveItem('sections', node.id, 1)}>↓</button>
              <button title="Sil" className="danger" onClick={() => confirmDeleteSection(node)}>🗑</button>
            </span>
          </>
        )}
      </div>

      {(isOpen || isAddingChild) && (
        <div>
          {isOpen &&
            kids.map((k) => (
              <TreeNode
                key={k.id}
                node={k}
                depth={depth + 1}
                tree={tree}
                selectedId={selectedId}
                expanded={expanded}
                onSelect={onSelect}
                onToggle={onToggle}
                editing={editing}
                setEditing={setEditing}
                onAdd={onAdd}
              />
            ))}
          {isAddingChild && (
            <div className="tree-row" style={{ '--depth': depth + 1 }}>
              <span className="chev empty" />
              <InlineInput placeholder="Bölüm adı" onSubmit={(n) => onAdd(node.id, n)} onCancel={() => setEditing(null)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Backup() {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState('');

  const flash = (m) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  };

  const download = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ders-defteri-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash('Yedek indirildi.');
  };

  const upload = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      const replace = window.confirm(
        'Yedek nasıl yüklensin?\n\nTamam → Mevcut tüm notları SİL ve yedeği yükle\nİptal → Mevcut notlarla birleştir'
      );
      await importAll(data, replace ? 'replace' : 'merge');
      flash('Yedek yüklendi.');
    } catch (e) {
      alert('Yedek yüklenemedi: ' + e.message);
    }
  };

  return (
    <div className="backup">
      <button onClick={download}>⬇ Yedeği indir</button>
      <button onClick={() => fileRef.current?.click()}>⬆ Yedek yükle</button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) upload(f);
        }}
      />
      {msg && <div className="backup-msg">{msg}</div>}
    </div>
  );
}

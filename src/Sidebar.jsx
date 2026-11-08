import { useRef, useState } from 'react';
import {
  ChevronRight,
  BookOpen,
  Folder,
  FolderOpen,
  Plus,
  Pencil,
  ArrowUp,
  ArrowDown,
  Trash2,
  Sun,
  Moon,
  Download,
  Upload,
  MonitorDown,
  PanelLeftClose,
  Search,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useUpdateReady, applyUpdate } from './updater.js';
import { db, ROOT, addSection,renameSection, deleteSection, collectSubtree, moveItem, exportAll, importAll } from './db.js';
import InlineInput from './InlineInput.jsx';
import { useInstallPrompt } from './install.js';
import { ask, confirmDanger, toast } from './ui.jsx';

export async function confirmDeleteSection(section) {
  const { ids, qaCount, pdfCount } = await collectSubtree(section.id);
  const sub = ids.length - 1;
  const parts = [sub ? `${sub} alt bölüm` : null, qaCount ? `${qaCount} soru-cevap` : null, pdfCount ? `${pdfCount} PDF` : null].filter(Boolean);
  const details = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' ve ' + parts.at(-1) : parts[0];
  const ok = await confirmDanger({
    title: `“${section.name}” silinsin mi?`,
    message: (details ? `İçindeki ${details} da silinecek. ` : '') + 'Bu işlem geri alınamaz.',
  });
  if (ok) {
    await deleteSection(section.id);
    toast('Silindi');
  }
}

// Bir bölümün altındaki tüm soruların toplamı
function totalCount(id, tree, qaCounts) {
  let n = qaCounts.get(id) || 0;
  for (const c of tree.children.get(id) || []) n += totalCount(c.id, tree, qaCounts);
  return n;
}

export default function Sidebar({ tree, qaCounts, reviewCounts, selectedId, expanded, onSelect, onToggle, theme, onToggleTheme, addingCourse, setAddingCourse, onCollapse, onOpenSearch }) {
  // editing: { type: 'add', parentId } | { type: 'rename', id }
  const [editing, setEditing] = useState(null);
  const { canInstall, install } = useInstallPrompt();
  const updateReady = useUpdateReady();
  const roots = tree.children.get(ROOT) || [];

  const handleAdd = async (parentId, name) => {
    setEditing(null);
    setAddingCourse(false);
    const id = await addSection(parentId, name);
    if (parentId !== ROOT) onToggle(parentId, true);
    onSelect(id);
  };

  const ctx = { tree, qaCounts, reviewCounts, selectedId, expanded, onSelect, onToggle, editing, setEditing, onAdd: handleAdd };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="logo">
          <img src="/favicon.svg" alt="" width="26" height="26" />
          Ders Defteri
        </span>
        <span className="head-btns">
          {canInstall && (
            <button className="install-btn" onClick={install} title="Bilgisayara uygulama olarak yükle">
              <MonitorDown size={14} /> Yükle
            </button>
          )}
          <button className="icon-btn sm collapse-btn" title="Menüyü gizle" onClick={onCollapse}>
            <PanelLeftClose size={17} />
          </button>
        </span>
      </div>

      <button className="search-trigger" onClick={onOpenSearch} title="Ara (Ctrl+K)">
        <Search size={15} />
        <span>Ara…</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="sidebar-label">
        <span>Dersler</span>
        <button className="icon-btn sm" title="Yeni ders" onClick={() => setAddingCourse(true)}>
          <Plus size={16} />
        </button>
      </div>

      <nav className="tree">
        {roots.map((s) => (
          <TreeNode key={s.id} node={s} depth={0} {...ctx} />
        ))}
        {addingCourse ? (
          <div className="tree-row editing" style={{ '--depth': 0 }}>
            <span className="node-icon">
              <BookOpen size={16} />
            </span>
            <InlineInput placeholder="Ders adı" onSubmit={(n) => handleAdd(ROOT, n)} onCancel={() => setAddingCourse(false)} />
          </div>
        ) : (
          roots.length === 0 && (
            <button className="add-course" onClick={() => setAddingCourse(true)}>
              <Plus size={16} /> Yeni ders
            </button>
          )
        )}
      </nav>

      {updateReady && (
        <button className="update-banner" onClick={applyUpdate} title="Yeni sürümü yükle">
          <RefreshCw size={14} /> Yeni sürüm hazır · <b>Yenile</b>
        </button>
      )}
      <div className="sidebar-foot">
        <Backup />
        <button className="icon-btn" onClick={onToggleTheme} title={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </aside>
  );
}

function TreeNode(props) {
  const { node, depth, tree, qaCounts, reviewCounts, selectedId, expanded, onSelect, onToggle, editing, setEditing, onAdd } = props;
  const kids = tree.children.get(node.id) || [];
  const isOpen = expanded.includes(node.id);
  const isRenaming = editing?.type === 'rename' && editing.id === node.id;
  const isAddingChild = editing?.type === 'add' && editing.parentId === node.id;
  const count = totalCount(node.id, tree, qaCounts);
  const review = totalCount(node.id, tree, reviewCounts);
  const isCourse = depth === 0;
  const Icon = isCourse ? BookOpen : isOpen && kids.length ? FolderOpen : Folder;

  return (
    <div>
      <div
        className={'tree-row' + (selectedId === node.id ? ' active' : '') + (isCourse ? ' course' : '')}
        style={{ '--depth': depth }}
        onClick={() => !isRenaming && onSelect(node.id)}
        onDoubleClick={() => setEditing({ type: 'rename', id: node.id })}
      >
        <button
          className={'chev' + (kids.length ? '' : ' empty') + (isOpen ? ' open' : '')}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
          tabIndex={kids.length ? 0 : -1}
          aria-label={isOpen ? 'Kapat' : 'Aç'}
        >
          <ChevronRight size={14} />
        </button>
        <span className="node-icon">
          <Icon size={16} />
        </span>
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
            <button className="tree-label" title={node.name} onClick={(e) => (e.stopPropagation(), onSelect(node.id))}>
              {node.name}
            </button>
            {review > 0 && (
              <span className="review-count" title={`${review} soru tekrar bak işaretli`}>
                <RotateCcw size={10} /> {review}
              </span>
            )}
            {count > 0 && <span className="count">{count}</span>}
            <span className="row-actions" onClick={(e) => e.stopPropagation()}>
              <button title="Alt bölüm ekle" onClick={() => setEditing({ type: 'add', parentId: node.id })}>
                <Plus size={14} />
              </button>
              <button title="Yeniden adlandır" onClick={() => setEditing({ type: 'rename', id: node.id })}>
                <Pencil size={13} />
              </button>
              <button title="Yukarı taşı" onClick={() => moveItem('sections', node.id, -1)}>
                <ArrowUp size={13} />
              </button>
              <button title="Aşağı taşı" onClick={() => moveItem('sections', node.id, 1)}>
                <ArrowDown size={13} />
              </button>
              <button title="Sil" className="danger" onClick={() => confirmDeleteSection(node)}>
                <Trash2 size={13} />
              </button>
            </span>
          </>
        )}
      </div>

      {(isOpen || isAddingChild) && (
        <div className="tree-children" style={{ '--depth': depth }}>
          {isOpen && kids.map((k) => <TreeNode key={k.id} {...props} node={k} depth={depth + 1} />)}
          {isAddingChild && (
            <div className="tree-row editing" style={{ '--depth': depth + 1 }}>
              <span className="chev empty" />
              <span className="node-icon">
                <Folder size={16} />
              </span>
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

  const download = async () => {
    let includePdfs = true;
    const pdfs = await db.pdfs.toArray();
    if (pdfs.length) {
      const total = pdfs.reduce((s, p) => s + (p.size || 0), 0);
      const mb = (total / 1024 / 1024).toFixed(1);
      const choice = await ask({
        title: 'PDF’ler de yedeğe eklensin mi?',
        message: `${pdfs.length} PDF var (toplam ${mb} MB). Eklersen yedek dosyası büyür ama başka bir cihaza geçerken PDF’leri yeniden yüklemen gerekmez.`,
        buttons: [
          { label: 'Vazgeç', value: null },
          { label: 'PDF’siz', value: 'no' },
          { label: 'PDF’lerle birlikte', value: 'yes', variant: 'primary' },
        ],
      });
      if (!choice) return;
      includePdfs = choice === 'yes';
    }
    const data = await exportAll({ includePdfs });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ders-defteri-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Yedek indirildi');
  };

  const upload = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      const mode = await ask({
        title: 'Yedek nasıl yüklensin?',
        message: 'Birleştirirsen mevcut notların korunur, yedekteki notlar eklenir. Değiştirirsen mevcut tüm notlar silinip yerine yedek gelir.',
        buttons: [
          { label: 'Vazgeç', value: null },
          { label: 'Mevcutları sil ve değiştir', value: 'replace', variant: 'danger' },
          { label: 'Birleştir', value: 'merge', variant: 'primary' },
        ],
      });
      if (!mode) return;
      await importAll(data, mode);
      toast('Yedek yüklendi');
    } catch (e) {
      toast('Yedek yüklenemedi: ' + e.message, 'error');
    }
  };

  return (
    <div className="backup">
      <button className="btn ghost sm" onClick={download} title="Tüm notları dosya olarak indir">
        <Download size={15} /> Yedek al
      </button>
      <button className="btn ghost sm" onClick={() => fileRef.current?.click()} title="Yedek dosyasından geri yükle">
        <Upload size={15} /> Geri yükle
      </button>
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
    </div>
  );
}

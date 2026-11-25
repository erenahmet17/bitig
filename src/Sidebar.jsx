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
import {
  db,
  ROOT,
  addSection,
  renameSection,
  deleteSection,
  collectSubtree,
  moveItem,
  moveSection,
  moveQAToSection,
  exportAll,
  importAll,
} from './db.js';
import InlineInput from './InlineInput.jsx';
import { useInstallPrompt } from './install.js';
import { ask, confirmDanger, toast } from './ui.jsx';
import { evictPdf } from './pdf/pdfjs.js';
import { t, useT } from './i18n.js';

export async function confirmDeleteSection(section) {
  const { ids, qaCount, pdfCount } = await collectSubtree(section.id);
  const sub = ids.length - 1;
  const parts = [
    sub ? t('sidebar.subCount', { n: sub }) : null,
    qaCount ? t('sidebar.qaCount', { n: qaCount }) : null,
    pdfCount ? t('sidebar.pdfCount', { n: pdfCount }) : null,
  ].filter(Boolean);
  const details = parts.length > 1 ? parts.slice(0, -1).join(', ') + t('sidebar.and') + parts.at(-1) : parts[0];
  const ok = await confirmDanger({
    title: t('sidebar.deleteTitle', { name: section.name }),
    message: (details ? t('sidebar.deleteDetails', { details }) : '') + t('sidebar.deleteIrreversible'),
  });
  if (ok) {
    const pdfIds = pdfCount ? await db.pdfs.where('sectionId').anyOf(ids).primaryKeys() : [];
    await deleteSection(section.id);
    pdfIds.forEach(evictPdf);
    toast(t('common.deleted'));
  }
}

// Bir bölümün altındaki tüm soruların toplamı
function totalCount(id, tree, qaCounts) {
  let n = qaCounts.get(id) || 0;
  for (const c of tree.children.get(id) || []) n += totalCount(c.id, tree, qaCounts);
  return n;
}

export default function Sidebar({
  tree,
  qaCounts,
  reviewCounts,
  selectedId,
  expanded,
  onSelect,
  onToggle,
  theme,
  onToggleTheme,
  addingCourse,
  setAddingCourse,
  onCollapse,
  onOpenSearch,
}) {
  const { lang, setLang, t } = useT();
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

  // Sürükle-bırak: dragId sürüklenen bölüm, drop { id, zone: 'before' | 'after' | 'inside' }
  const [dragId, setDragId] = useState(null);
  const [drop, setDrop] = useState(null);
  const dnd = { dragId, setDragId, drop, setDrop };

  const ctx = { tree, qaCounts, reviewCounts, selectedId, expanded, onSelect, onToggle, editing, setEditing, onAdd: handleAdd, dnd };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="logo">
          <img src="/favicon.svg" alt="" width="26" height="26" />
          Bitig
        </span>
        <span className="head-btns">
          {canInstall && (
            <button className="install-btn" onClick={install} title={t('sidebar.installTitle')}>
              <MonitorDown size={14} /> {t('sidebar.install')}
            </button>
          )}
          <button className="icon-btn sm collapse-btn" title={t('sidebar.hideMenu')} onClick={onCollapse}>
            <PanelLeftClose size={17} />
          </button>
        </span>
      </div>

      <button className="search-trigger" onClick={onOpenSearch} title={t('sidebar.searchTitle')}>
        <Search size={15} />
        <span>{t('sidebar.search')}</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="sidebar-label">
        <span>{t('sidebar.courses')}</span>
        <button className="icon-btn sm" title={t('sidebar.newCourse')} onClick={() => setAddingCourse(true)}>
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
            <InlineInput placeholder={t('sidebar.coursePlaceholder')} onSubmit={(n) => handleAdd(ROOT, n)} onCancel={() => setAddingCourse(false)} />
          </div>
        ) : (
          roots.length === 0 && (
            <button className="add-course" onClick={() => setAddingCourse(true)}>
              <Plus size={16} /> {t('sidebar.newCourse')}
            </button>
          )
        )}
      </nav>

      {updateReady && (
        <button className="update-banner" onClick={applyUpdate} title={t('sidebar.updateTitle')}>
          <RefreshCw size={14} /> {t('sidebar.updateReady')} · <b>{t('sidebar.refresh')}</b>
        </button>
      )}
      <div className="sidebar-foot">
        <Backup />
        <div className="sidebar-foot-right">
          <button
            className="icon-btn lang-btn"
            onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')}
            title={t('sidebar.langSwitch')}
            aria-label={t('sidebar.langSwitch')}
          >
            {lang.toUpperCase()}
          </button>
          <button className="icon-btn" onClick={onToggleTheme} title={theme === 'dark' ? t('sidebar.lightTheme') : t('sidebar.darkTheme')}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </aside>
  );
}

// target, dragged bölümün kendisi ya da altındaki bir bölüm mü? (kendi içine taşınamaz)
function isInside(targetId, draggedId, tree) {
  let cur = tree.byId.get(targetId);
  while (cur) {
    if (cur.id === draggedId) return true;
    cur = cur.parentId ? tree.byId.get(cur.parentId) : null;
  }
  return false;
}

function TreeNode(props) {
  const { node, depth, tree, qaCounts, reviewCounts, selectedId, expanded, onSelect, onToggle, editing, setEditing, onAdd, dnd } = props;
  const { t } = useT();
  const expandTimer = useRef(null);
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
        className={
          'tree-row' +
          (selectedId === node.id ? ' active' : '') +
          (isCourse ? ' course' : '') +
          (dnd.dragId === node.id ? ' dragging' : '') +
          (dnd.drop?.id === node.id ? ' drop-' + dnd.drop.zone : '')
        }
        style={{ '--depth': depth }}
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('application/x-section', node.id);
          setTimeout(() => dnd.setDragId(node.id), 0);
        }}
        onDragEnd={() => {
          clearTimeout(expandTimer.current);
          dnd.setDragId(null);
          dnd.setDrop(null);
        }}
        onDragOver={(e) => {
          const isQaDrag = !dnd.dragId && e.dataTransfer.types.includes('application/x-qa');
          if (isQaDrag) {
            if (node.id === selectedId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dnd.drop?.id !== node.id || dnd.drop.zone !== 'inside') {
              dnd.setDrop({ id: node.id, zone: 'inside' });
              clearTimeout(expandTimer.current);
              if (kids.length && !isOpen) expandTimer.current = setTimeout(() => onToggle(node.id, true), 650);
            }
            return;
          }
          if (!dnd.dragId || isInside(node.id, dnd.dragId, tree)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const r = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - r.top;
          const zone = y < r.height * 0.28 ? 'before' : y > r.height * 0.72 ? 'after' : 'inside';
          if (dnd.drop?.id !== node.id || dnd.drop.zone !== zone) {
            dnd.setDrop({ id: node.id, zone });
            clearTimeout(expandTimer.current);
            // Kapalı bir bölümün üstünde bekletince açılsın
            if (zone === 'inside' && kids.length && !isOpen) expandTimer.current = setTimeout(() => onToggle(node.id, true), 650);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            clearTimeout(expandTimer.current);
            if (dnd.drop?.id === node.id) dnd.setDrop(null);
          }
        }}
        onDrop={async (e) => {
          e.preventDefault();
          clearTimeout(expandTimer.current);
          const qaId = !dnd.dragId ? e.dataTransfer.getData('application/x-qa') : '';
          if (qaId) {
            dnd.setDrop(null);
            if (node.id === selectedId) return;
            await moveQAToSection(qaId, node.id);
            toast(t('sidebar.qaMoved', { target: node.name }));
            return;
          }
          const from = dnd.dragId;
          const zone = dnd.drop?.id === node.id ? dnd.drop.zone : null;
          dnd.setDragId(null);
          dnd.setDrop(null);
          if (!from || !zone || isInside(node.id, from, tree)) return;
          const moved = tree.byId.get(from);
          const parentId = zone === 'inside' ? node.id : node.parentId;
          await moveSection(from, parentId, zone === 'inside' ? null : node.id, zone === 'after');
          if (zone === 'inside') onToggle(node.id, true);
          if (moved && moved.parentId !== parentId)
            toast(
              parentId === ROOT
                ? t('sidebar.movedToCourse', { name: moved.name })
                : t('sidebar.movedInto', { name: moved.name, target: tree.byId.get(parentId)?.name })
            );
        }}
        onClick={() => !isRenaming && onSelect(node.id)}
        onDoubleClick={() => setEditing({ type: 'rename', id: node.id })}
      >
        <button
          className={'chev' + (kids.length ? '' : ' no-kids') + (isOpen ? ' open' : '')}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
          tabIndex={kids.length ? 0 : -1}
          aria-label={isOpen ? t('sidebar.close') : t('sidebar.open')}
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
              <span className="review-count" title={t('sidebar.reviewTitle', { n: review })}>
                <RotateCcw size={10} /> {review}
              </span>
            )}
            {count > 0 && <span className="count">{count}</span>}
            <span className="row-actions" onClick={(e) => e.stopPropagation()}>
              <button title={t('sidebar.addSub')} onClick={() => setEditing({ type: 'add', parentId: node.id })}>
                <Plus size={14} />
              </button>
              <button title={t('common.rename')} onClick={() => setEditing({ type: 'rename', id: node.id })}>
                <Pencil size={13} />
              </button>
              <button title={t('common.moveUp')} onClick={() => moveItem('sections', node.id, -1)}>
                <ArrowUp size={13} />
              </button>
              <button title={t('common.moveDown')} onClick={() => moveItem('sections', node.id, 1)}>
                <ArrowDown size={13} />
              </button>
              <button title={t('common.delete')} className="danger" onClick={() => confirmDeleteSection(node)}>
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
              <span className="chev no-kids" />
              <span className="node-icon">
                <Folder size={16} />
              </span>
              <InlineInput placeholder={t('sidebar.sectionPlaceholder')} onSubmit={(n) => onAdd(node.id, n)} onCancel={() => setEditing(null)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Backup() {
  const { t } = useT();
  const fileRef = useRef(null);

  const download = async () => {
    let includePdfs = true;
    const pdfs = await db.pdfs.toArray();
    if (pdfs.length) {
      const total = pdfs.reduce((s, p) => s + (p.size || 0), 0);
      const mb = (total / 1024 / 1024).toFixed(1);
      const choice = await ask({
        title: t('backup.includePdfsTitle'),
        message: t('backup.includePdfsMsg', { count: pdfs.length, mb }),
        buttons: [
          { label: t('common.cancel'), value: null },
          { label: t('backup.withoutPdfs'), value: 'no' },
          { label: t('backup.withPdfs'), value: 'yes', variant: 'primary' },
        ],
      });
      if (!choice) return;
      includePdfs = choice === 'yes';
    }
    const data = await exportAll({ includePdfs });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t('backup.filePrefix')}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t('backup.downloaded'));
  };

  const upload = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      const mode = await ask({
        title: t('backup.restoreModeTitle'),
        message: t('backup.restoreModeMsg'),
        buttons: [
          { label: t('common.cancel'), value: null },
          { label: t('backup.replace'), value: 'replace', variant: 'danger' },
          { label: t('backup.merge'), value: 'merge', variant: 'primary' },
        ],
      });
      if (!mode) return;
      await importAll(data, mode);
      toast(t('backup.restored'));
    } catch (e) {
      toast(t('backup.restoreError', { msg: e.message }), 'error');
    }
  };

  return (
    <div className="backup">
      <button className="btn ghost sm" onClick={download} title={t('backup.downloadTitle')}>
        <Download size={15} /> {t('backup.download')}
      </button>
      <button className="btn ghost sm" onClick={() => fileRef.current?.click()} title={t('backup.restoreTitle')}>
        <Upload size={15} /> {t('backup.restore')}
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

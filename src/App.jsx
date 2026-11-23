import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, FolderTree, ClipboardPaste, Menu, Plus, PanelLeftOpen } from 'lucide-react';
import { db, ROOT } from './db.js';
import Sidebar from './Sidebar.jsx';
import SectionView from './SectionView.jsx';
import { UIHost } from './ui.jsx';
import SearchModal from './Search.jsx';

function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}

export default function App() {
  const sections = useLiveQuery(() => db.sections.toArray(), []);
  // Her bölümdeki soru sayısı (sadece indeks okunur, hızlıdır)
  const qaSectionIds = useLiveQuery(() => db.qas.orderBy('sectionId').keys(), []);
  // "Tekrar bak" işaretli soruların bölümleri
  const reviewSectionIds = useLiveQuery(
    async () => (await db.qas.where('status').equals('review').toArray()).map((q) => q.sectionId),
    []
  );
  const [selectedId, setSelectedId] = usePersistentState('selected', null);
  const [expanded, setExpanded] = usePersistentState('expanded', []);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);
  const [collapsed, setCollapsed] = usePersistentState('sidebar-collapsed', false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Aramadan gelinince açılacak soru / gidilecek PDF sayfası
  const [focus, setFocus] = useState(null);

  // Ctrl+K (ya da Cmd+K) ile arama
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);

  // id -> bölüm, parentId -> sıralı çocuklar
  const tree = useMemo(() => {
    const byId = new Map();
    const children = new Map();
    for (const s of sections || []) {
      byId.set(s.id, s);
      if (!children.has(s.parentId)) children.set(s.parentId, []);
      children.get(s.parentId).push(s);
    }
    for (const list of children.values()) list.sort((a, b) => a.order - b.order);
    return { byId, children };
  }, [sections]);

  const qaCounts = useMemo(() => {
    const m = new Map();
    for (const id of qaSectionIds || []) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [qaSectionIds]);

  const reviewCounts = useMemo(() => {
    const m = new Map();
    for (const id of reviewSectionIds || []) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [reviewSectionIds]);

  const selected = selectedId ? tree.byId.get(selectedId) : null;

  const ancestorsOf = (id) => {
    const list = [];
    let cur = tree.byId.get(id);
    while (cur && cur.parentId !== ROOT) {
      list.push(cur.parentId);
      cur = tree.byId.get(cur.parentId);
    }
    return list;
  };

  // Seçili bölüm silindiyse seçimi temizle; varsa menüde görünür olsun diye üst bölümlerini aç
  useEffect(() => {
    if (!sections || !selectedId) return;
    if (!tree.byId.has(selectedId)) {
      setSelectedId(null);
      return;
    }
    const anc = ancestorsOf(selectedId);
    if (anc.some((a) => !expanded.includes(a))) setExpanded((e) => Array.from(new Set([...e, ...anc])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, selectedId]);

  const path = useMemo(() => {
    const p = [];
    let cur = selected;
    while (cur) {
      p.unshift(cur);
      cur = cur.parentId !== ROOT ? tree.byId.get(cur.parentId) : null;
    }
    return p;
  }, [selected, tree]);

  const select = (id) => {
    setFocus(null);
    setSelectedId(id);
    setSidebarOpen(false);
    window.scrollTo?.(0, 0);
  };

  const toggleExpanded = (id, force) =>
    setExpanded((e) => {
      const open = force ?? !e.includes(id);
      return open ? Array.from(new Set([...e, id])) : e.filter((x) => x !== id);
    });

  if (!sections) return null;

  const startAddCourse = () => {
    setCollapsed(false);
    setAddingCourse(true);
    setSidebarOpen(true);
  };

  return (
    <div className={'app' + (sidebarOpen ? ' sidebar-open' : '') + (collapsed ? ' collapsed' : '')}>
      <Sidebar
        tree={tree}
        qaCounts={qaCounts}
        reviewCounts={reviewCounts}
        selectedId={selectedId}
        expanded={expanded}
        onSelect={select}
        onToggle={toggleExpanded}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        addingCourse={addingCourse}
        setAddingCourse={setAddingCourse}
        onCollapse={() => setCollapsed(true)}
        onOpenSearch={() => setSearchOpen(true)}
      />
      {collapsed && (
        <button className="expand-btn icon-btn" title="Menüyü göster" onClick={() => setCollapsed(false)}>
          <PanelLeftOpen size={18} />
        </button>
      )}
      <div className="backdrop" onClick={() => setSidebarOpen(false)} />
      <main className="main">
        <div className="mobile-bar">
          <button className="icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Menüyü aç">
            <Menu size={20} />
          </button>
          <span className="mobile-title">{selected ? selected.name : 'Bitig'}</span>
        </div>
        {selected ? (
          <SectionView
            key={selected.id}
            section={selected}
            path={path}
            subsections={tree.children.get(selected.id) || []}
            tree={tree}
            qaCounts={qaCounts}
            onSelect={select}
            onExpand={(id) => toggleExpanded(id, true)}
            focus={focus?.sectionId === selected.id ? focus : null}
          />
        ) : (
          <Welcome hasCourses={(tree.children.get(ROOT) || []).length > 0} onAddCourse={startAddCourse} />
        )}
      </main>
      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onGo={(r) => {
            select(r.sectionId);
            setFocus({ sectionId: r.sectionId, qaId: r.kind === 'qa' ? r.id : null, page: r.page || null, key: Date.now() });
          }}
        />
      )}
      <UIHost />
    </div>
  );
}

function Welcome({ hasCourses, onAddCourse }) {
  const steps = [
    { icon: BookOpen, title: 'Ders oluştur', text: 'Her ders için ayrı bir defter aç.' },
    { icon: FolderTree, title: 'Bölümlere ayır', text: 'PDF 1, PDF 2… istediğin kadar iç içe bölüm.' },
    { icon: ClipboardPaste, title: 'Soru-cevap yapıştır', text: 'Hangi yapay zekâdan gelirse gelsin, hepsi tek yerde.' },
  ];
  return (
    <div className="welcome">
      <img className="welcome-logo" src="/favicon.svg" alt="" width="64" height="64" />
      <h1>Bitig</h1>
      <p className="welcome-lead">Farklı yapay zekâ sohbetlerinden çıkan soru-cevapları ders ders, tek bir yerde topla.</p>
      <div className="steps">
        {steps.map((s, i) => (
          <div className="step" key={i}>
            <div className="step-icon">
              <s.icon size={20} />
            </div>
            <div>
              <div className="step-title">{s.title}</div>
              <div className="step-text">{s.text}</div>
            </div>
          </div>
        ))}
      </div>
      {hasCourses ? (
        <p className="muted">Başlamak için soldan bir ders ya da bölüm seç.</p>
      ) : (
        <button className="btn primary lg" onClick={onAddCourse}>
          <Plus size={18} /> İlk dersini oluştur
        </button>
      )}
      <p className="muted small welcome-note">Notların bu cihazda saklanır. Ara sıra sol alttan yedek almayı unutma.</p>
    </div>
  );
}

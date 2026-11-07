import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ROOT } from './db.js';
import Sidebar from './Sidebar.jsx';
import SectionView from './SectionView.jsx';

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
  const [selectedId, setSelectedId] = usePersistentState('selected', null);
  const [expanded, setExpanded] = usePersistentState('expanded', []);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const selected = selectedId ? tree.byId.get(selectedId) : null;

  // Seçili bölüm silindiyse seçimi temizle
  useEffect(() => {
    if (sections && selectedId && !tree.byId.has(selectedId)) setSelectedId(null);
  }, [sections, selectedId, tree, setSelectedId]);

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
    setSelectedId(id);
    setSidebarOpen(false);
    // Seçilen bölümün üst bölümlerini aç ki menüde görünsün
    const ancestors = [];
    let cur = tree.byId.get(id);
    while (cur && cur.parentId !== ROOT) {
      ancestors.push(cur.parentId);
      cur = tree.byId.get(cur.parentId);
    }
    if (ancestors.length) setExpanded((e) => Array.from(new Set([...e, ...ancestors])));
  };

  const toggleExpanded = (id, force) =>
    setExpanded((e) => {
      const open = force ?? !e.includes(id);
      return open ? Array.from(new Set([...e, id])) : e.filter((x) => x !== id);
    });

  if (!sections) return null;

  return (
    <div className={'app' + (sidebarOpen ? ' sidebar-open' : '')}>
      <Sidebar
        tree={tree}
        selectedId={selectedId}
        expanded={expanded}
        onSelect={select}
        onToggle={toggleExpanded}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />
      <div className="backdrop" onClick={() => setSidebarOpen(false)} />
      <main className="main">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Menüyü aç">
          ☰
        </button>
        {selected ? (
          <SectionView
            key={selected.id}
            section={selected}
            path={path}
            subsections={tree.children.get(selected.id) || []}
            onSelect={select}
            onExpand={(id) => toggleExpanded(id, true)}
          />
        ) : (
          <Welcome hasCourses={(tree.children.get(ROOT) || []).length > 0} />
        )}
      </main>
    </div>
  );
}

function Welcome({ hasCourses }) {
  return (
    <div className="welcome">
      <h1>Ders Defteri</h1>
      <p>Farklı yapay zekâ sohbetlerinden çıkan soru-cevapları tek bir yerde, ders ders topla.</p>
      <ol>
        <li>Soldaki <b>+ Yeni ders</b> ile bir ders oluştur.</li>
        <li>Dersin içinde bölümler (ör. PDF 1, PDF 2…) ve alt bölümler aç.</li>
        <li>Bir bölüme gir, sorunu ve yapay zekânın cevabını yapıştır.</li>
      </ol>
      <p className="muted">
        {hasCourses
          ? 'Başlamak için soldan bir ders ya da bölüm seç.'
          : 'Notların bu tarayıcıda saklanır. Arada bir “Yedeği indir” ile yedek almayı unutma.'}
      </p>
    </div>
  );
}

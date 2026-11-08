import { db } from '../db.js';

// Dışa aktarılacak içerik: başlangıç bölümü + alt bölümleri, menüdeki sırayla.
// Her bölüm: { id, name, depth, groups: [{ page, qas }] }; içinde de altında da soru olmayan bölümler atlanır.
export async function collectExport(rootId, tree) {
  const root = tree.byId.get(rootId);
  const list = [];
  const walk = (s, depth, trail) => {
    list.push({ id: s.id, name: s.name, depth, trail });
    for (const c of tree.children.get(s.id) || []) walk(c, depth + 1, [...trail, c.name]);
  };
  walk(root, 0, []);

  const ids = list.map((s) => s.id);
  const [qas, pdfs] = await Promise.all([db.qas.where('sectionId').anyOf(ids).toArray(), db.pdfs.where('sectionId').anyOf(ids).toArray()]);
  const withPdf = new Set(pdfs.map((p) => p.sectionId));
  const bySection = new Map();
  for (const q of qas) {
    if (!bySection.has(q.sectionId)) bySection.set(q.sectionId, []);
    bySection.get(q.sectionId).push(q);
  }

  for (const s of list) {
    const items = (bySection.get(s.id) || []).sort((a, b) => a.order - b.order);
    // PDF'li bölümlerde sayfa numarasına göre grupla; sayfasız sorular en başta
    if (withPdf.has(s.id) || items.some((q) => q.page)) {
      const pages = new Map();
      for (const q of items) {
        const k = q.page || 0;
        if (!pages.has(k)) pages.set(k, []);
        pages.get(k).push(q);
      }
      s.groups = [...pages.entries()].sort((a, b) => a[0] - b[0]).map(([page, qas]) => ({ page: page || null, qas }));
    } else {
      s.groups = items.length ? [{ page: null, qas: items }] : [];
    }
    s.count = items.length;
  }

  // Altında hiç soru olmayan bölümleri çıkar (başlangıç bölümü hep kalır)
  const total = new Map();
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    let n = s.count;
    for (let j = i + 1; j < list.length && list[j].depth > s.depth; j++) if (list[j].depth === s.depth + 1) n += total.get(list[j].id);
    total.set(s.id, n);
  }
  const sections = list.filter((s, i) => i === 0 || total.get(s.id) > 0);

  // Başlangıç bölümünün üstündeki yol (kapakta gösterilir)
  const path = [];
  let cur = root.parentId ? tree.byId.get(root.parentId) : null;
  while (cur) {
    path.unshift(cur.name);
    cur = cur.parentId ? tree.byId.get(cur.parentId) : null;
  }

  return { title: root.name, path, sections, total: qas.length };
}

export function fileName(name) {
  return (name || 'ders-defteri').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 80) || 'ders-defteri';
}

export const formatDate = () => new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

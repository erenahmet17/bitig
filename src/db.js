import Dexie from 'dexie';

// Veriler tarayıcının IndexedDB'sinde tutulur.
// sections: dersler (parentId = null) ve onların altındaki bölümler (iç içe).
// qas: bir bölüme ait soru-cevaplar.
export const db = new Dexie('ders-defteri');

db.version(1).stores({
  sections: 'id, parentId, order',
  qas: 'id, sectionId, order',
});

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

async function nextOrder(table, field, value) {
  const items = await db[table].where(field).equals(value).toArray();
  return items.reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1;
}

// Dexie, null değerini indeksleyemez; kök seviye için '' kullanıyoruz.
export const ROOT = '';

export async function addSection(parentId, name) {
  const id = uid();
  await db.sections.add({
    id,
    parentId: parentId ?? ROOT,
    name: name.trim(),
    order: await nextOrder('sections', 'parentId', parentId ?? ROOT),
    createdAt: Date.now(),
  });
  return id;
}

export function renameSection(id, name) {
  return db.sections.update(id, { name: name.trim() });
}

// Bir bölümün kendisini ve altındaki her şeyi (alt bölümler + soru-cevaplar) döndürür.
export async function collectSubtree(id) {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) {
    const children = await db.sections.where('parentId').equals(ids[i]).primaryKeys();
    ids.push(...children);
  }
  const qaCount = await db.qas.where('sectionId').anyOf(ids).count();
  return { ids, qaCount };
}

export async function deleteSection(id) {
  await db.transaction('rw', db.sections, db.qas, async () => {
    const { ids } = await collectSubtree(id);
    await db.qas.where('sectionId').anyOf(ids).delete();
    await db.sections.bulkDelete(ids);
  });
}

export async function moveItem(table, id, direction) {
  const item = await db[table].get(id);
  const field = table === 'sections' ? 'parentId' : 'sectionId';
  const siblings = await db[table].where(field).equals(item[field]).sortBy('order');
  const i = siblings.findIndex((s) => s.id === id);
  const j = i + direction;
  if (j < 0 || j >= siblings.length) return;
  const other = siblings[j];
  await db.transaction('rw', db[table], async () => {
    await db[table].update(item.id, { order: other.order });
    await db[table].update(other.id, { order: item.order });
  });
}

export async function addQA(sectionId, question, answer) {
  const now = Date.now();
  await db.qas.add({
    id: uid(),
    sectionId,
    question: question.trim(),
    answer: answer.trim(),
    order: await nextOrder('qas', 'sectionId', sectionId),
    createdAt: now,
    updatedAt: now,
  });
}

export function updateQA(id, question, answer) {
  return db.qas.update(id, { question: question.trim(), answer: answer.trim(), updatedAt: Date.now() });
}

export function deleteQA(id) {
  return db.qas.delete(id);
}

// ---- Yedekleme ----
export async function exportAll() {
  return {
    app: 'ders-defteri',
    version: 1,
    exportedAt: new Date().toISOString(),
    sections: await db.sections.toArray(),
    qas: await db.qas.toArray(),
  };
}

export async function importAll(data, mode) {
  if (!data || data.app !== 'ders-defteri' || !Array.isArray(data.sections) || !Array.isArray(data.qas)) {
    throw new Error('Bu dosya bir Ders Defteri yedeği değil.');
  }
  await db.transaction('rw', db.sections, db.qas, async () => {
    if (mode === 'replace') {
      await db.sections.clear();
      await db.qas.clear();
    }
    // bulkPut: aynı id varsa üzerine yazar, yoksa ekler (birleştirme modu)
    await db.sections.bulkPut(data.sections);
    await db.qas.bulkPut(data.qas);
  });
}

import Dexie from 'dexie';

// Veriler tarayıcının IndexedDB'sinde tutulur.
// sections:    dersler (parentId = '') ve onların altındaki bölümler (iç içe)
// qas:         bir bölüme ait soru-cevaplar (page: bağlı olduğu PDF sayfası, yoksa null)
// pdfs:        bir bölüme yüklenmiş PDF (her bölüme en fazla bir tane)
// annotations: PDF sayfalarındaki vurgu, kalem çizimi ve notlar
export const db = new Dexie('ders-defteri');

db.version(1).stores({
  sections: 'id, parentId, order',
  qas: 'id, sectionId, order',
});

db.version(2).stores({
  sections: 'id, parentId, order',
  qas: 'id, sectionId, order',
  pdfs: 'id, sectionId',
  annotations: 'id, pdfId, [pdfId+page]',
});

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

async function nextOrder(table, field, value) {
  const items = await db[table].where(field).equals(value).toArray();
  return items.reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1;
}

// Dexie, null değerini indeksleyemez; kök seviye için '' kullanıyoruz.
export const ROOT = '';

// ---------------- Bölümler ----------------
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

// Bir bölümün kendisini ve altındaki her şeyi döndürür.
export async function collectSubtree(id) {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) {
    const children = await db.sections.where('parentId').equals(ids[i]).primaryKeys();
    ids.push(...children);
  }
  const qaCount = await db.qas.where('sectionId').anyOf(ids).count();
  const pdfCount = await db.pdfs.where('sectionId').anyOf(ids).count();
  return { ids, qaCount, pdfCount };
}

export async function deleteSection(id) {
  await db.transaction('rw', db.sections, db.qas, db.pdfs, db.annotations, async () => {
    const { ids } = await collectSubtree(id);
    const pdfIds = await db.pdfs.where('sectionId').anyOf(ids).primaryKeys();
    await db.annotations.where('pdfId').anyOf(pdfIds).delete();
    await db.pdfs.bulkDelete(pdfIds);
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

// ---------------- Soru-cevaplar ----------------
// image: soruya eklenmiş ekran görüntüsü (Blob) ya da null
export async function addQA(sectionId, question, answer, page = null, image = null) {
  const now = Date.now();
  await db.qas.add({
    id: uid(),
    sectionId,
    question: question.trim(),
    answer: answer.trim(),
    page: page || null,
    image: image || null,
    order: await nextOrder('qas', 'sectionId', sectionId),
    createdAt: now,
    updatedAt: now,
  });
}

export function updateQA(id, question, answer, page, image) {
  const changes = { question: question.trim(), answer: answer.trim(), updatedAt: Date.now() };
  if (page !== undefined) changes.page = page || null;
  if (image !== undefined) changes.image = image || null;
  return db.qas.update(id, changes);
}

export function deleteQA(id) {
  return db.qas.delete(id);
}

// ---------------- PDF ----------------
export async function setSectionPdf(sectionId, file) {
  const existing = await db.pdfs.where('sectionId').equals(sectionId).first();
  const record = {
    id: uid(),
    sectionId,
    name: file.name,
    size: file.size,
    data: new Blob([await file.arrayBuffer()], { type: 'application/pdf' }),
    pageCount: null,
    createdAt: Date.now(),
  };
  await db.transaction('rw', db.pdfs, db.annotations, async () => {
    if (existing) {
      await db.annotations.where('pdfId').equals(existing.id).delete();
      await db.pdfs.delete(existing.id);
    }
    await db.pdfs.add(record);
  });
  return record.id;
}

// Yedekten PDF'siz yüklenmiş bir kaydın dosyasını geri koyar (notlar korunur)
export async function restorePdfData(pdfId, file) {
  await db.pdfs.update(pdfId, {
    data: new Blob([await file.arrayBuffer()], { type: 'application/pdf' }),
    size: file.size,
    name: file.name,
  });
}

export async function removeSectionPdf(sectionId) {
  await db.transaction('rw', db.pdfs, db.annotations, async () => {
    const ids = await db.pdfs.where('sectionId').equals(sectionId).primaryKeys();
    await db.annotations.where('pdfId').anyOf(ids).delete();
    await db.pdfs.bulkDelete(ids);
  });
}

// ---------------- İşaretlemeler ----------------
// Koordinatlar sayfa boyutuna göre 0-1 arasında saklanır (yakınlaştırmadan bağımsız).
export async function addAnnotation(pdfId, page, ann) {
  const id = uid();
  await db.annotations.add({ id, pdfId, page, createdAt: Date.now(), ...ann });
  return id;
}

export function updateAnnotation(id, changes) {
  return db.annotations.update(id, changes);
}

export function deleteAnnotation(id) {
  return db.annotations.delete(id);
}

// ---------------- Yedekleme ----------------
const blobToDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export async function exportAll({ includePdfs = true } = {}) {
  const pdfs = [];
  for (const p of await db.pdfs.toArray()) {
    pdfs.push({ ...p, data: includePdfs && p.data ? await blobToDataURL(p.data) : null });
  }
  const qas = [];
  for (const q of await db.qas.toArray()) {
    qas.push(q.image ? { ...q, image: await blobToDataURL(q.image) } : q);
  }
  return {
    app: 'ders-defteri',
    version: 2,
    exportedAt: new Date().toISOString(),
    sections: await db.sections.toArray(),
    qas,
    pdfs,
    annotations: await db.annotations.toArray(),
  };
}

export async function importAll(data, mode) {
  if (!data || data.app !== 'ders-defteri' || !Array.isArray(data.sections) || !Array.isArray(data.qas)) {
    throw new Error('Bu dosya bir Ders Defteri yedeği değil.');
  }
  // PDF verisini transaction dışında çözüyoruz (fetch, IndexedDB transaction'ını kapatır)
  const pdfs = [];
  for (const p of data.pdfs || []) {
    pdfs.push({ ...p, data: p.data ? await (await fetch(p.data)).blob() : null });
  }
  const qas = [];
  for (const q of data.qas) {
    qas.push(typeof q.image === 'string' ? { ...q, image: await (await fetch(q.image)).blob() } : q);
  }
  await db.transaction('rw', db.sections, db.qas, db.pdfs, db.annotations, async () => {
    if (mode === 'replace') {
      await Promise.all([db.sections.clear(), db.qas.clear(), db.pdfs.clear(), db.annotations.clear()]);
    }
    // bulkPut: aynı id varsa üzerine yazar, yoksa ekler (birleştirme modu)
    await db.sections.bulkPut(data.sections);
    await db.qas.bulkPut(qas);
    if (mode !== 'replace') {
      // Birleştirirken, cihazdaki PDF dosyasını yedekteki boş kayıtla ezme
      for (const p of pdfs) {
        if (!p.data) {
          const cur = await db.pdfs.get(p.id);
          if (cur?.data) p.data = cur.data;
        }
      }
    }
    await db.pdfs.bulkPut(pdfs);
    await db.annotations.bulkPut(data.annotations || []);
  });
}
